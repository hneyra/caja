package kamayuk.caja.nucleo.aplicacion;

import java.time.Clock;
import java.time.LocalDate;
import java.util.Objects;
import java.util.UUID;
import kamayuk.caja.auditoria.Auditoria;
import kamayuk.caja.auditoria.Operacion;
import kamayuk.caja.auditoria.RegistroDeAuditoria;
import kamayuk.caja.dominio.Observacion;
import kamayuk.caja.nucleo.dominio.BuzonDeSalida;
import kamayuk.caja.nucleo.dominio.EventoDePago;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Alguien vuelve a poner en camino un pago que habia muerto, porque la causa se arreglo (#131).
 *
 * <h2>Por que hace falta</h2>
 *
 * <p>Hasta #131 MUERTO era para siempre: la unica salida era {@link ExplicarPagoSinEntregar}, que
 * da el pago por resuelto <b>sin</b> entregarlo. Asi que un pago muerto por una causa que despues
 * se arreglo —la ruta mal configurada, una caida mas larga que el plazo, un rechazo que el receptor
 * corrigio en su lado— solo podia registrarse a mano en el sistema de origen, con otro
 * identificador, y la conciliacion ya no casaba.
 *
 * <h2>Lo que hace, y lo que no</h2>
 *
 * <ul>
 *   <li><b>El {@code pagoId} no cambia.</b> Es el que la caja genero al cobrar, y el receptor
 *       deduplica por el (ADR-0026 §3): si el pago ya habia llegado, el reintento recibe un 409 —
 *       «ya lo tengo»— y se da por entregado. Un identificador nuevo seria un segundo pago.
 *   <li><b>Solo desde MUERTO.</b> Un PENDIENTE ya esta en camino; un EXPLICADO lo resolvio alguien
 *       por escrito, quiza registrandolo a mano en el origen, y entregarlo seria el segundo asiento
 *       del mismo dinero. La guarda esta en el {@code UPDATE} ({@link BuzonDeSalida#reencolar}).
 *   <li><b>El plazo empieza de nuevo</b>: quien lo pone en camino afirma que la causa se arreglo, y
 *       si no es asi el pago vuelve a morir —y a avisar— cuando se agote otra vez.
 *   <li><b>Cuesta una observacion</b> (regla 10), y queda en la auditoria quien lo hizo y por que,
 *       como {@link ExplicarPagoSinEntregar}, que es su hermano: los dos los exige el mismo acceso
 *       ({@code cierre_caja}, {@code MODIFICACION}) y los dos sacan un pago de MUERTO.
 * </ul>
 */
@Service
public class ReintentarPagoMuerto {

    private final BuzonDeSalida buzon;
    private final Auditoria auditoria;
    private final Clock reloj;

    public ReintentarPagoMuerto(BuzonDeSalida buzon, Auditoria auditoria, Clock reloj) {
        this.buzon = buzon;
        this.auditoria = auditoria;
        this.reloj = reloj;
    }

    /**
     * @param pagoId el evento, por su identificador publico
     * @param observacion por que se vuelve a intentar: que se arreglo (regla 10, RNF-052)
     * @return el evento, ya PENDIENTE
     * @throws ExplicarPagoSinEntregar.PagoInexistente si no hay ningun evento con ese identificador
     * @throws IllegalStateException si el evento no esta MUERTO
     */
    @Transactional
    public EventoDePago reintentar(UUID pagoId, Observacion observacion) {
        Objects.requireNonNull(pagoId, "Se vuelve a poner en camino un pago concreto");
        Objects.requireNonNull(observacion, "Sin observacion no se guarda (regla 10, RNF-052)");

        EventoDePago evento =
                buzon.porEventoId(pagoId)
                        .orElseThrow(() -> new ExplicarPagoSinEntregar.PagoInexistente(pagoId));
        buzon.reencolar(evento.idGuardado());

        auditoria.registrar(
                RegistroDeAuditoria.enLaFechaDe(
                                LocalDate.now(reloj),
                                "pago_evento",
                                String.valueOf(evento.idGuardado()),
                                Operacion.MODIFICACION,
                                observacion)
                        .con(estado(evento, evento.estado().name()), estado(evento, "PENDIENTE")));

        return buzon.porEventoId(pagoId)
                .orElseThrow(() -> new ExplicarPagoSinEntregar.PagoInexistente(pagoId));
    }

    /**
     * Sin datos personales y sin {@code ultimo_error}: esto acaba en la columna JSON de la
     * auditoria, y el error lo escribio el otro sistema.
     */
    private static String estado(EventoDePago evento, String estado) {
        return "{\"pagoId\":\""
                + evento.eventoId()
                + "\",\"destino\":\""
                + evento.sistemaDestino()
                + "\",\"reciboId\":"
                + evento.reciboId()
                + ",\"intentos\":"
                + evento.intentos()
                + ",\"estado\":\""
                + estado
                + "\"}";
    }
}
