package kamayuk.caja.nucleo.infraestructura.web;

import java.time.Clock;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import kamayuk.caja.autorizacion.Privilegio;
import kamayuk.caja.autorizacion.RequiereAcceso;
import kamayuk.caja.dominio.Ejercicio;
import kamayuk.caja.nucleo.aplicacion.ConsultaDeRecaudacion;
import kamayuk.caja.nucleo.dominio.CriterioDeRecaudacion;
import kamayuk.caja.web.Api;
import kamayuk.caja.web.CodigoDeError;
import kamayuk.caja.web.ProblemaDeNegocio;
import org.jspecify.annotations.Nullable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * El avance de recaudacion y su distribucion por area, por HTTP (RF-088, RF-089).
 *
 * <h2>Dos lecturas que no hacen esperar a la ventanilla</h2>
 *
 * <p>Las dos son {@code GET} y ninguna bloquea nada. El avance de un turno se consulta
 * <b>mientras</b> el cajero cobra —es lo que la pantalla de cierre llama «Cuadrar»—, y una lectura
 * que tomara el turno con {@code FOR UPDATE}, que es lo que hace la cobranza, pondria la cola a
 * esperar por un informe. Ver {@link ConsultaDeRecaudacion}.
 *
 * <h2>Sin paginar, y a proposito</h2>
 *
 * <p>El contrato declara {@code pagina} y {@code tamano} porque el generador se los pone a toda
 * pantalla con tabla. Aqui no se usan: las dos respuestas son <b>agregados</b> —una fila por
 * tributo, una por (area, partida, tributo)—, no un padron. Paginar un agregado dejaria al cliente
 * con una pagina de sumas y sin el total, que es la cifra que el reporte existe para dar; y el
 * total de una pagina no es el total del periodo.
 *
 * <h2>El rango</h2>
 *
 * <p>{@code desde} y {@code hasta} en ISO. Si no vienen, se derivan del {@code ejercicio}: el ano
 * entero. Si tampoco viene, el ejercicio del reloj. Ninguna de las tres opciones inventa una cifra:
 * lo que cambia es que periodo se suma, y la respuesta lo dice siempre.
 */
@RestController
@RequestMapping(Api.RAIZ + "/recaudacion")
public class RecaudacionController {

    /** Las dos opciones del catalogo (NEG-03) que este controlador sirve. */
    static final String ACCESO_AVANCE = "avance_recaudacion";

    static final String ACCESO_POR_AREA = "recaudacion_area";

    private final ConsultaDeRecaudacion recaudacion;
    private final Clock reloj;

    public RecaudacionController(ConsultaDeRecaudacion recaudacion, Clock reloj) {
        this.recaudacion = recaudacion;
        this.reloj = reloj;
    }

    /**
     * El avance de recaudacion del periodo, por tributo (RF-088).
     *
     * <p>Con {@code caja} y {@code cajero} responde en cambio el <b>avance en vivo del turno</b>:
     * lo que ese cajero lleva cobrado y anulado ese dia, que es el mismo arqueo que el cierre
     * congelara. Los dos parametros no salen de la pantalla —el prototipo dibuja ejercicio, rango y
     * tributo— sino del backend, como {@code ejercicio} en la bitacora: sin ellos, la pantalla de
     * cierre no podria cuadrar antes de firmar.
     *
     * <p>El dia del turno es el <b>ultimo del rango</b>: con el rango de un dia —que es como la
     * pantalla de cierre lo pide— ese dia, y con un rango largo el mas reciente. Se elige asi y no
     * «hoy» para que se pueda cuadrar el turno de ayer que se quedo sin sistema, igual que {@code
     * POST /caja/cierre} admite su fecha.
     *
     * <p>Si el cajero no ha abierto turno ese dia, 404: no hay nada que arquear, y devolver un
     * arqueo en ceros haria pensar que abrio y no cobro.
     *
     * <h2>El avance del dia lo pide `rentas` por aqui, y por que no hay una ruta aparte (#45)</h2>
     *
     * <p>Hasta #45 este modulo publicaba ademas un puerto {@code AvanceDeCaja} —con su {@code
     * RecaudadoEnCaja} y su adaptador— para contestar «cuanto lleva cobrado la caja hoy» en cuatro
     * escalares. <b>No lo llamaba nadie</b>: se escribio cuando {@code tesoreria} vivia en este
     * proceso, {@code tesoreria} se fue a {@code rentas} en P5D y el puerto se quedo. Mientras
     * tanto su consumidor pedia {@code ?dia=&aLaFecha=} contra esta ruta, que admite {@code desde}
     * y {@code hasta}: {@code 422 «Parametros desconocidos»}, y el panel de recaudacion de {@code
     * rentas} en <b>500</b> con esta caja levantada, autorizada y sana.
     *
     * <p>De las tres salidas que #45 planteaba se toma la <b>tercera</b> —el consumidor lee este
     * {@code Avance}, y el puerto y su {@code record} se retiran por muertos—, con estos motivos:
     *
     * <ul>
     *   <li><b>«El dia» ya es esta pregunta.</b> Este endpoint suma un rango de <b>turnos</b>, y el
     *       dia es ese rango con los dos extremos iguales — que es literalmente lo que aquel
     *       adaptador hacia: {@code CriterioDeRecaudacion.delDia(dia)}. Anadir un {@code dia}
     *       propio seria una segunda forma de decir lo mismo, y dos formas de acotar el mismo
     *       periodo acaban discrepando en el caso raro.
     *   <li><b>Ensanchar la respuesta con un bloque escalar la partiria en dos verdades.</b> Aqui
     *       todo importe viaja como {@code ImporteActualizado} (regla 9, RNF-075); publicar ademas
     *       {@code cobrado} suelto obligaria a mantener las dos de acuerdo y dejaria al cliente
     *       eligiendo cual lee.
     *   <li><b>Un puerto con implementacion y sin llamadores acaba inyectandose por error</b>, y
     *       nada lo veia: lo vigila desde #45 {@code PuertosSinLlamadorTest}.
     * </ul>
     *
     * <p><b>Lo que NO se pierde al retirarlo</b> es la propiedad que aquel puerto escribia en su
     * javadoc: el dia es el <b>del turno</b> y no el del reloj. La conserva {@link
     * CriterioDeRecaudacion} —y la sostiene el {@code JOIN cierre_caja} de {@code
     * RecaudacionRepositoryJdbc}, con su {@code t.fecha} de tipo {@code date}—, de modo que un
     * cobro de las nueve de la noche cuenta en su dia aunque su instante en UTC sea ya el
     * siguiente. Lo mide {@code CierreDeCajaJdbcTest}, que planta ese caso a proposito y ademas
     * contrasta la cifra del dia con el arqueo de ese turno.
     *
     * <p>El {@code aLaFecha} sigue sin ser un parametro de la peticion, y tampoco eso cambia: es la
     * fecha a la que esta caja leyo, la pone su reloj y viaja con la cifra (regla 9). Un consumidor
     * que pudiera dictarla estaria pidiendo que la respuesta se fechara con un dia que no es el de
     * la lectura.
     */
    @GetMapping("/avance")
    @RequiereAcceso(acceso = ACCESO_AVANCE, privilegio = Privilegio.LECTURA)
    public RecaudacionResource.Avance avance(
            @RequestParam(required = false) @Nullable String ejercicio,
            @RequestParam(required = false) @Nullable String desde,
            @RequestParam(required = false) @Nullable String hasta,
            @RequestParam(required = false) @Nullable String tributo,
            @RequestParam(required = false) @Nullable String caja,
            @RequestParam(required = false) @Nullable String cajero) {

        LocalDate hoy = LocalDate.now(reloj);
        String laCaja = vacioAnulo(caja);
        String elCajero = vacioAnulo(cajero);
        CriterioDeRecaudacion criterio =
                criterio(ejercicio, desde, hasta, tributo, null, hoy).enLaCajaDe(laCaja, elCajero);

        // Una sola forma de respuesta, con el turno dentro cuando se pide. Devolver dos
        // tipos distintos segun los parametros obligaria al cliente a mirar que llego
        // antes de saber que dibujar, y ese es el camino a dos renderizadores.
        RecaudacionResource.AvanceDelTurno delTurno = null;
        if (laCaja != null && elCajero != null) {
            LocalDate dia = criterio.hasta();
            delTurno =
                    recaudacion
                            .delTurno(laCaja, elCajero, dia, hoy)
                            .map(avance -> RecaudacionResource.AvanceDelTurno.de(laCaja, avance))
                            .orElseThrow(
                                    () ->
                                            new ProblemaDeNegocio(
                                                    CodigoDeError.NO_ENCONTRADO,
                                                    "El cajero '"
                                                            + elCajero
                                                            + "' no abrio turno en la caja '"
                                                            + laCaja
                                                            + "' el "
                                                            + dia));
        }
        return RecaudacionResource.Avance.de(recaudacion.avance(criterio, hoy), delTurno);
    }

    /** La recaudacion por area generadora, partida presupuestal y tributo (RF-089). */
    @GetMapping("/por-area")
    @RequiereAcceso(acceso = ACCESO_POR_AREA, privilegio = Privilegio.LECTURA)
    public RecaudacionResource.Distribucion porArea(
            @RequestParam(required = false) @Nullable String area,
            @RequestParam(required = false) @Nullable String desde,
            @RequestParam(required = false) @Nullable String hasta,
            @RequestParam(required = false) @Nullable String ejercicio) {

        LocalDate hoy = LocalDate.now(reloj);
        return RecaudacionResource.Distribucion.de(
                recaudacion.porPartida(
                        criterio(ejercicio, desde, hasta, null, codigoDeArea(area), hoy), hoy));
    }

    // ------------------------------------------------------------------

    private CriterioDeRecaudacion criterio(
            @Nullable String ejercicio,
            @Nullable String desde,
            @Nullable String hasta,
            @Nullable String tributo,
            @Nullable String area,
            LocalDate hoy) {

        Ejercicio delAno = ejercicioDe(ejercicio, hoy);
        LocalDate inicio = fechaDe(desde, "desde", LocalDate.of(delAno.valor(), 1, 1));
        LocalDate fin = fechaDe(hasta, "hasta", LocalDate.of(delAno.valor(), 12, 31));
        try {
            return new CriterioDeRecaudacion(inicio, fin, vacioAnulo(tributo), area, null, null);
        } catch (IllegalArgumentException invalido) {
            throw new ProblemaDeNegocio(CodigoDeError.VALIDACION, mensajeDe(invalido));
        }
    }

    /**
     * El area, tal como la dibuja la pantalla: {@code «113300 — SUBGERENCIA DE …»}.
     *
     * <p>Se queda con el codigo, que es lo que {@code area.codigo} guarda. Mandar la etiqueta
     * entera es lo que hara el desplegable del prototipo mientras no se conecte al catalogo de
     * areas, y rechazarla obligaria a la interfaz a partir la cadena por su cuenta —que es
     * exactamente donde acaban dos formas distintas de hacerlo—.
     */
    private static @Nullable String codigoDeArea(@Nullable String area) {
        String limpio = vacioAnulo(area);
        if (limpio == null) {
            return null;
        }
        int separador = limpio.indexOf('—');
        return separador < 0 ? limpio : limpio.substring(0, separador).strip();
    }

    private Ejercicio ejercicioDe(@Nullable String texto, LocalDate hoy) {
        if (texto == null || texto.isBlank()) {
            return Ejercicio.de(hoy);
        }
        try {
            return new Ejercicio(Integer.parseInt(texto.strip()));
        } catch (IllegalArgumentException invalido) {
            throw new ProblemaDeNegocio(
                    CodigoDeError.VALIDACION,
                    "El campo 'ejercicio' no es un ano valido: '" + texto + "'");
        }
    }

    private static LocalDate fechaDe(@Nullable String texto, String campo, LocalDate porOmision) {
        if (texto == null || texto.isBlank()) {
            return porOmision;
        }
        try {
            return LocalDate.parse(texto.strip());
        } catch (DateTimeParseException invalida) {
            throw new ProblemaDeNegocio(
                    CodigoDeError.VALIDACION,
                    "El campo '" + campo + "' no es una fecha ISO valida: '" + texto + "'");
        }
    }

    private static @Nullable String vacioAnulo(@Nullable String texto) {
        return (texto == null || texto.isBlank()) ? null : texto.strip();
    }

    private static String mensajeDe(RuntimeException excepcion) {
        String mensaje = excepcion.getMessage();
        return mensaje == null ? "El valor recibido no es valido" : mensaje;
    }
}
