package kamayuk.caja.nucleo.infraestructura.web;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import kamayuk.caja.autorizacion.Privilegio;
import kamayuk.caja.autorizacion.RequiereAcceso;
import kamayuk.caja.nucleo.aplicacion.ArqueoDeTurno;
import kamayuk.caja.nucleo.aplicacion.ConsultaDelTurno;
import kamayuk.caja.nucleo.dominio.EventoDePago;
import kamayuk.caja.nucleo.dominio.TurnoDeCaja;
import kamayuk.caja.web.Api;
import kamayuk.caja.web.CodigoDeError;
import kamayuk.caja.web.ImporteActualizado;
import kamayuk.caja.web.ProblemaDeNegocio;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code GET /caja/api/v1/turnos/&#123;id&#125;/cierre}: si el turno puede cerrar, y si no, por que
 * no (ADR-0026 §4).
 *
 * <h2>Se pregunta ANTES de cerrar, y por eso es un GET</h2>
 *
 * <p>El cierre es bloqueante: un turno con un pago sin entregar no cierra. Descubrirlo al pulsar
 * «Cerrar» dejaria al cajero con el cajon contado y un error; con esta lectura, la pantalla lo dice
 * antes y nombra los pagos <b>uno a uno</b>, que es lo que ADR-0026 §4 pide.
 *
 * <p><b>No devuelve un booleano a secas.</b> Quien no puede cerrar tiene derecho a saber cuales
 * son, con su hora de cobro y su ultimo error, porque cada uno se resuelve de una manera: esperar a
 * que el publicador lo consiga, o explicarlo por escrito.
 *
 * <h2>De donde sale el {@code turnoId}, desde #97</h2>
 *
 * <p>De {@code GET /turnos/del-dia} ({@link TurnoController}), que publica el turno abierto de
 * quien pregunta. Hasta entonces esta ruta existia y <b>ninguna lectura daba su argumento</b>, de
 * modo que la pantalla de cierre no podia pedirla: los diez campos de su primer bloque decian «sin
 * turno».
 *
 * <h2>El arqueo que sale de aqui es EL DE EN VIVO</h2>
 *
 * <p>Un {@code GET} no puede llevar el recuento del cajon, asi que {@link ArqueoDeTurno#del} se
 * llama con el mapa de lo declarado <b>vacio</b> —lo dice su propio javadoc—. Por eso se publica
 * con {@link ArqueoResource#enVivo}: {@code declarado}, {@code diferencia} y {@code cuadra} salen
 * <b>nulos</b>. Hasta #97 salian con {@link ArqueoResource#de} y esta lectura contestaba siempre
 * «declarado 0,00, diferencia -neto, cuadra false», que no es el estado del turno sino el mapa
 * vacio disfrazado de recuento.
 *
 * <h2>Solo contesta sobre un turno que existe y esta abierto, desde #148</h2>
 *
 * <p>Hasta #148 esta lectura no preguntaba si el turno existia: arqueaba lo que hubiera con ese
 * {@code turnoId} —nada— y, como nada no tiene pagos sin entregar, contestaba <b>200 con el arqueo
 * en cero y {@code puedeCerrar: true}</b>. Medido contra PostgreSQL con tres numeros: uno que no
 * era de ningun turno, el turno de otra municipalidad y un turno con su acta ya firmada. Las tres
 * respuestas decian «puede cerrar». Ahora:
 *
 * <ul>
 *   <li><b>un turno que no existe es 404</b>, con {@link CodigoDeError#NO_ENCONTRADO} y el mismo
 *       cuerpo {@code application/problem+json} que el recibo que no esta. El de otra municipalidad
 *       es <b>el mismo 404</b>, palabra por palabra salvo el numero: RLS lo esconde y aqui no
 *       existe. Distinguirlos seria un detector de turnos ajenos, y la municipalidad no se pregunta
 *       (regla 2);
 *   <li><b>un turno ya cerrado es 409</b>, con {@link CodigoDeError#CONFLICTO}: lo mismo que
 *       contesta {@code POST /turnos/cierre} al intentar cerrarlo otra vez ({@code
 *       CerrarTurno.TurnoYaCerrado}). La pregunta y el acto dicen lo mismo del mismo estado.
 * </ul>
 *
 * <p><b>Por que 409 y no {@code puedeCerrar: false}.</b> Se considero y se descarto por tres
 * motivos, y los tres son de lo que el recurso ya promete:
 *
 * <ol>
 *   <li>{@code loQueImpideCerrar} son los pagos sin entregar, «vacio si {@code puedeCerrar}». Un
 *       {@code false} con la lista vacia seria una contradiccion —no puede, y nada lo impide—, y
 *       quitarsela exigiria un campo nuevo que la pantalla y sus guardas tendrian que aprender para
 *       un caso al que la pantalla no llega;
 *   <li>el arqueo de un turno cerrado <b>no es este</b>: es el del acta, congelado con lo que el
 *       cajero conto. Publicar a su lado un arqueo en vivo con lo declarado nulo seria dar dos
 *       arqueos del mismo dinero, y uno de ellos sin el recuento que se firmo;
 *   <li>la pantalla no pregunta por un turno cerrado: {@code GET /turnos/del-dia} le dice {@code
 *       CERRADO} como dato (200) y solo pide el arqueo del turno {@code ABIERTO}. A esta ruta solo
 *       se llega con un cerrado por la API a mano, o si el cierre se firma entre las dos lecturas.
 *       En la carrera la hoja dice que no pudo pedir sus datos ({@code alFallar} no distingue el
 *       409), y al volver a pedirlos {@code del-dia} ya contesta {@code CERRADO}.
 * </ol>
 *
 * <p>Un turno cerrado y <b>reversado</b> vuelve a estar abierto —su estado sale del ultimo
 * movimiento de {@code cierre_turno}, V32— y contesta 200 como cualquier otro. Y lo que se lee aqui
 * es una foto: lo que decide si un cierre se firma lo vuelve a leer {@code CerrarTurno} con el
 * candado del turno (#110).
 */
@RestController
@RequestMapping(Api.RAIZ + "/turnos")
public class EstadoDelCierreController {

    private final ArqueoDeTurno arqueo;
    private final ConsultaDelTurno turnos;
    private final Clock reloj;

    public EstadoDelCierreController(ArqueoDeTurno arqueo, ConsultaDelTurno turnos, Clock reloj) {
        this.arqueo = arqueo;
        this.turnos = turnos;
        this.reloj = reloj;
    }

    /**
     * Si el turno puede cerrar, con su arqueo en vivo, o los pagos que lo impiden.
     *
     * @throws ProblemaDeNegocio 404 si el turno no existe en esta municipalidad —tambien si es de
     *     otra, que RLS esconde—; 409 si ya esta cerrado. Ver el javadoc de la clase
     */
    @GetMapping("/{turnoId}/cierre")
    @RequiereAcceso(acceso = "cierre_caja", privilegio = Privilegio.LECTURA)
    @Transactional(readOnly = true)
    public EstadoDelCierreResource del(@PathVariable long turnoId) {
        exigirQueEsteAbierto(turnoId);
        LocalDate hoy = LocalDate.now(reloj);
        var declarado =
                Map.<kamayuk.caja.nucleo.dominio.FormaDePago, kamayuk.caja.dominio.Dinero>of();
        var elArqueo = arqueo.del(turnoId, declarado, hoy);
        try {
            ArqueoDeTurno.Cuadre cuadre = arqueo.cuadrar(turnoId, hoy);
            return new EstadoDelCierreResource(
                    turnoId,
                    true,
                    ArqueoResource.enVivo(elArqueo),
                    new ImporteActualizado(cuadre.conEvento(), cuadre.aLaFecha()),
                    new ImporteActualizado(cuadre.sinEvento(), cuadre.aLaFecha()),
                    List.of());
        } catch (ArqueoDeTurno.HayPagosSinEntregar noPuede) {
            List<PagoController.PagoResource> pendientes =
                    new ArrayList<>(noPuede.sinResolver().size());
            for (EventoDePago evento : noPuede.sinResolver()) {
                pendientes.add(PagoController.PagoResource.de(evento));
            }
            return new EstadoDelCierreResource(
                    turnoId,
                    false,
                    ArqueoResource.enVivo(elArqueo),
                    null,
                    null,
                    List.copyOf(pendientes));
        }
    }

    /**
     * El turno existe en esta municipalidad y esta abierto; si no, el problema que lo dice (#148).
     *
     * <p>Antes de arquear, y no despues: el arqueo de un numero que no es de nadie sale en cero y
     * sin pagos pendientes, y es exactamente lo que hacia pasar un turno inexistente por uno que
     * puede cerrar.
     */
    private void exigirQueEsteAbierto(long turnoId) {
        TurnoDeCaja turno =
                turnos.porId(turnoId)
                        .orElseThrow(
                                () ->
                                        new ProblemaDeNegocio(
                                                CodigoDeError.NO_ENCONTRADO,
                                                "No hay ningun turno "
                                                        + turnoId
                                                        + " en esta municipalidad"));
        if (!turno.estaAbierto()) {
            throw new ProblemaDeNegocio(
                    CodigoDeError.CONFLICTO,
                    "El turno "
                            + turnoId
                            + " ya esta cerrado: su arqueo es el del acta que se firmo al"
                            + " cerrarlo, no uno en vivo, y no queda nada que comprobar antes de"
                            + " cerrarlo. Un cierre no se modifica ni se borra: si hay que"
                            + " rehacerlo, se reversa -y eso reabre el turno- y se vuelve a"
                            + " preguntar (regla 4)");
        }
    }

    /**
     * @param puedeCerrar si el turno se puede cerrar ahora mismo
     * @param loQueImpideCerrar los pagos sin entregar, uno a uno. Vacio si {@code puedeCerrar}
     */
    public record EstadoDelCierreResource(
            long turnoId,
            boolean puedeCerrar,
            ArqueoResource arqueo,
            @org.jspecify.annotations.Nullable ImporteActualizado cobradoConEvento,
            @org.jspecify.annotations.Nullable ImporteActualizado cobradoSinEvento,
            List<PagoController.PagoResource> loQueImpideCerrar) {}
}
