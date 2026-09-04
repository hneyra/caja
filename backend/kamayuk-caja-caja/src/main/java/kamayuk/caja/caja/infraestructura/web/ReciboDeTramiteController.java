package kamayuk.caja.caja.infraestructura.web;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.List;
import kamayuk.caja.autorizacion.Privilegio;
import kamayuk.caja.autorizacion.RequiereAcceso;
import kamayuk.caja.caja.CobrosDeTasas;
import kamayuk.caja.caja.RecaudacionDeTasa;
import kamayuk.caja.caja.ReciboDeTramite;
import kamayuk.caja.caja.RecibosDeTramite;
import kamayuk.caja.caja.TasaCobrada;
import kamayuk.caja.web.Api;
import kamayuk.caja.web.CodigoDeError;
import kamayuk.caja.web.ProblemaDeNegocio;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Lo que OTROS SISTEMAS le preguntan a la caja (P5D, ADR-0030).
 *
 * <h2>Las tres lecturas que `rentas` necesita, y por que existen</h2>
 *
 * <p>`rentas` no puede emitir una licencia de funcionamiento sin comprobar que el derecho de
 * tramite se pago (RF-110), ni cerrar su panel de recaudacion sin lo cobrado del dia. Hasta P5D eso
 * era una llamada a un puerto en el mismo proceso —{@code RecibosDeTramite}, {@code AvanceDeCaja},
 * {@code CobrosDeTasas}—; con la separacion, los puertos se quedan alli y lo que cambia es quien
 * los implementa: un cliente HTTP contra estas rutas.
 *
 * <p><b>Son de LECTURA y ninguna esta en el camino del cobro.</b> Si esta clase dejara de
 * contestar, `rentas` no podria emitir una licencia — y la ventanilla seguiria cobrando igual, que
 * es la asimetria que ADR-0026 compra.
 *
 * <h2>Un 404 significa «ese recibo no existe», y nada mas</h2>
 *
 * <p>Es la unica respuesta que el cliente puede traducir a {@code Optional.empty()}. Cualquier otra
 * cosa —un 500, un tiempo de espera— tiene que salir como «no se pudo preguntar» del otro lado: un
 * {@code Optional.empty()} por un despliegue caido haria que `rentas` emitiera una licencia sin
 * haber cobrado el derecho, que es el criterio de #48 con la licencia que salia con «valor de obra
 * 0,00».
 */
@RestController
@RequestMapping(Api.RAIZ)
public class ReciboDeTramiteController {

    /**
     * El acceso con el que otro sistema pregunta.
     *
     * <p>Es {@code duplicado_recibo} con {@code LECTURA} —la opcion desde la que se consulta un
     * recibo— y no un permiso propio: lo que se pide es exactamente lo mismo que ve quien busca un
     * recibo en ventanilla, y darle una opcion propia crearia un permiso que nadie administra.
     */
    private static final String ACCESO = "duplicado_recibo";

    private final RecibosDeTramite recibos;
    private final CobrosDeTasas tasas;
    private final kamayuk.caja.caja.aplicacion.ConsultaDelEstadoDelRecibo estados;

    public ReciboDeTramiteController(
            RecibosDeTramite recibos,
            CobrosDeTasas tasas,
            kamayuk.caja.caja.aplicacion.ConsultaDelEstadoDelRecibo estados) {
        this.recibos = recibos;
        this.tasas = tasas;
        this.estados = estados;
    }

    /**
     * Si un recibo esta anulado, preguntado por su IDENTIFICADOR interno.
     *
     * <p><b>Existe por un hueco concreto de P5D, y conviene decir cual.</b> `rentas` no deja anular
     * un convenio de fraccionamiento cuyo recibo de cuota inicial siga vivo —dinero cobrado por un
     * acto que ya no existiria, y ningun arqueo lo detectaria—. Esa comprobacion la hacia leyendo
     * {@code recibo_movimiento} directamente; con la separacion no puede, y <b>no le sirve</b>
     * preguntar por el numero impreso: {@code convenio_movimiento} guarda el {@code recibo_id}
     * interno, no el numero del papel.
     *
     * <p>Asi que la caja publica esta lectura por identificador. Es la unica ruta de este
     * controlador que expone un id interno de esta base, y se hace a proposito: el alternativo era
     * que `rentas` guardara ademas el numero impreso, y eso es cambiarle una columna a una tabla
     * viva por comodidad de la frontera.
     *
     * <p><b>Un identificador que no existe es 404</b>, y el cliente NO puede leerlo como «no esta
     * anulado»: que el recibo no exista y que exista y este vigente se arreglan de maneras
     * distintas.
     */
    @GetMapping("/recibos/por-id/{reciboId}")
    @RequiereAcceso(acceso = ACCESO, privilegio = Privilegio.LECTURA)
    @Transactional(readOnly = true)
    public EstadoDelReciboResource porId(@PathVariable long reciboId) {
        return new EstadoDelReciboResource(reciboId, estados.estaAnulado(reciboId));
    }

    /**
     * Lo minimo que otro sistema necesita saber de un recibo por su identificador.
     *
     * <p>Dos campos y ninguna cifra: quien pregunta esto no quiere el recibo, quiere saber si sigue
     * en pie. Publicar aqui el importe o el pagador daria a la frontera mas superficie de la que la
     * pregunta necesita.
     */
    public record EstadoDelReciboResource(long reciboId, boolean anulado) {}

    /** Un recibo por su numero impreso: lo que acredita que algo se pago antes de emitirse. */
    @GetMapping("/recibos/{numero}")
    @RequiereAcceso(acceso = ACCESO, privilegio = Privilegio.LECTURA)
    @Transactional(readOnly = true)
    public ReciboDeTramiteResource porNumero(@PathVariable String numero) {
        return recibos.porNumeroImpreso(numero)
                .map(ReciboDeTramiteResource::de)
                .orElseThrow(
                        () ->
                                new ProblemaDeNegocio(
                                        CodigoDeError.NO_ENCONTRADO,
                                        "No hay ningun recibo "
                                                + numero
                                                + " en esta"
                                                + " municipalidad"));
    }

    /** Si un recibo cobro un concepto del TUPA, y por cuanto (RF-110). */
    @GetMapping("/tasas/{codigo}/cobros/{numero}")
    @RequiereAcceso(acceso = ACCESO, privilegio = Privilegio.LECTURA)
    @Transactional(readOnly = true)
    public TasaCobradaResource acreditar(@PathVariable String codigo, @PathVariable String numero) {
        return tasas.acreditar(numero, codigo)
                .map(TasaCobradaResource::de)
                .orElseThrow(
                        () ->
                                new ProblemaDeNegocio(
                                        CodigoDeError.NO_ENCONTRADO,
                                        "El recibo " + numero + " no cobra el concepto " + codigo));
    }

    /** Lo recaudado por un concepto del TUPA en un rango. */
    @GetMapping("/tasas/{codigo}/recaudacion")
    @RequiereAcceso(acceso = ACCESO, privilegio = Privilegio.LECTURA)
    @Transactional(readOnly = true)
    public RecaudacionDeTasaResource recaudado(
            @PathVariable String codigo, @RequestParam String desde, @RequestParam String hasta) {
        return RecaudacionDeTasaResource.de(
                tasas.recaudado(codigo, fechaDe(desde, "desde"), fechaDe(hasta, "hasta")));
    }

    private static LocalDate fechaDe(String texto, String campo) {
        try {
            return LocalDate.parse(texto.strip());
        } catch (DateTimeParseException malEscrita) {
            throw new ProblemaDeNegocio(
                    CodigoDeError.VALIDACION,
                    "El parametro '" + campo + "' no es una fecha ISO: " + texto);
        }
    }

    /**
     * El recibo, con sus importes como CADENA.
     *
     * <p>RNF-055 al otro lado de una frontera HTTP: un importe que viaja como numero de coma
     * flotante puede volver con otro valor, y esto es lo que acredita un pago.
     */
    public record ReciboDeTramiteResource(
            long reciboId,
            String numero,
            String fechaDePago,
            long contribuyenteId,
            boolean esDeTasas,
            boolean anulado,
            List<String> conceptos,
            String total,
            String actualizadoA) {

        static ReciboDeTramiteResource de(ReciboDeTramite recibo) {
            return new ReciboDeTramiteResource(
                    recibo.reciboId(),
                    recibo.numero(),
                    recibo.fechaDePago().toString(),
                    recibo.contribuyenteId(),
                    recibo.esDeTasas(),
                    recibo.anulado(),
                    recibo.conceptos(),
                    recibo.total().valor().toPlainString(),
                    recibo.actualizadoA().toString());
        }
    }

    /** Un concepto del TUPA cobrado en un recibo. */
    public record TasaCobradaResource(
            String numeroDeRecibo,
            String codigoDeTasa,
            int cantidad,
            String importe,
            String fecha) {

        static TasaCobradaResource de(TasaCobrada cobrada) {
            return new TasaCobradaResource(
                    cobrada.numeroDeRecibo(),
                    cobrada.codigoDeTasa(),
                    cobrada.cantidad(),
                    cobrada.importe().valor().toPlainString(),
                    cobrada.fecha().toString());
        }
    }

    /** Lo recaudado por un concepto en un rango, con sus dos fechas (regla 9). */
    public record RecaudacionDeTasaResource(
            String codigoDeTasa, String cobrado, String anulado, String desde, String hasta) {

        static RecaudacionDeTasaResource de(RecaudacionDeTasa recaudacion) {
            return new RecaudacionDeTasaResource(
                    recaudacion.codigoDeTasa(),
                    recaudacion.cobrado().valor().toPlainString(),
                    recaudacion.anulado().valor().toPlainString(),
                    recaudacion.desde().toString(),
                    recaudacion.hasta().toString());
        }
    }
}
