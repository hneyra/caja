package kamayuk.caja.caja.aplicacion;

import java.time.Clock;
import java.time.LocalDate;
import java.util.Objects;
import java.util.UUID;
import kamayuk.caja.auditoria.Auditoria;
import kamayuk.caja.auditoria.Operacion;
import kamayuk.caja.auditoria.RegistroDeAuditoria;
import kamayuk.caja.caja.dominio.BuzonDeSalida;
import kamayuk.caja.caja.dominio.EventoDePago;
import kamayuk.caja.dominio.Observacion;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Alguien se hace cargo, por escrito, de un pago que no se pudo entregar (ADR-0026 §4).
 *
 * <h2>Por que existe, y por que no es un boton de «ignorar»</h2>
 *
 * <p>El cierre de turno es bloqueante: un turno con un pago MUERTO no cierra. Sin esta salida, un
 * evento que de verdad no se puede entregar —el sistema de origen rechazo el pago, la orden se
 * borro alli, la referencia externa era de otra municipalidad— dejaria esa caja sin poder cerrar
 * <b>para siempre</b>, y la presion para «arreglarlo» acabaria siendo relajar el cierre. Eso es
 * peor: relajar el cierre lo relaja tambien para los pagos que si se podian entregar.
 *
 * <p>Asi que la salida existe y <b>cuesta lo que tiene que costar</b>: solo se explica un evento
 * MUERTO —uno que sigue en camino se entregaria solo, y explicarlo lo sacaria de la cola—, la
 * explicacion es obligatoria y va a la fila, y el acto se audita con su observacion (regla 10).
 * Queda escrito quien decidio que ese dinero no se iba a registrar en el sistema de origen.
 */
@Service
public class ExplicarPagoSinEntregar {

    private final BuzonDeSalida buzon;
    private final Auditoria auditoria;
    private final Clock reloj;

    public ExplicarPagoSinEntregar(BuzonDeSalida buzon, Auditoria auditoria, Clock reloj) {
        this.buzon = buzon;
        this.auditoria = auditoria;
        this.reloj = reloj;
    }

    /**
     * @param pagoId el evento, por su identificador publico
     * @param explicacion que paso y que se hizo; queda en la fila
     * @param observacion por que se registra (regla 10, RNF-052)
     * @throws PagoInexistente si no hay ningun evento con ese identificador
     */
    @Transactional
    public EventoDePago explicar(UUID pagoId, String explicacion, Observacion observacion) {
        Objects.requireNonNull(pagoId, "Se explica un pago concreto");
        Objects.requireNonNull(explicacion, "Explicar exige la explicacion");
        Objects.requireNonNull(observacion, "Sin observacion no se guarda (regla 10, RNF-052)");
        String texto = explicacion.strip();
        if (texto.length() < 5) {
            throw new IllegalArgumentException(
                    "La explicacion de un pago sin entregar tiene que decir algo: es lo unico que"
                            + " separa «alguien se hizo cargo» de «alguien lo apago para poder"
                            + " cerrar la caja»");
        }

        EventoDePago evento =
                buzon.porEventoId(pagoId).orElseThrow(() -> new PagoInexistente(pagoId));
        buzon.explicar(evento.idGuardado(), texto);

        auditoria.registrar(
                RegistroDeAuditoria.enLaFechaDe(
                                LocalDate.now(reloj),
                                "pago_evento",
                                String.valueOf(evento.idGuardado()),
                                Operacion.MODIFICACION,
                                observacion)
                        .con(null, descripcion(evento, texto)));

        return buzon.porEventoId(pagoId).orElseThrow(() -> new PagoInexistente(pagoId));
    }

    /** Sin datos personales: esto acaba en la columna JSON de la auditoria. */
    private static String descripcion(EventoDePago evento, String explicacion) {
        return "{\"pagoId\":\""
                + evento.eventoId()
                + "\",\"destino\":\""
                + evento.sistemaDestino()
                + "\",\"reciboId\":"
                + evento.reciboId()
                + ",\"intentos\":"
                + evento.intentos()
                + ",\"explicacion\":\""
                + explicacion.replace('"', '\'')
                + "\"}";
    }

    /** No hay ningun evento con ese identificador en esta municipalidad. */
    public static final class PagoInexistente extends RuntimeException {

        @java.io.Serial private static final long serialVersionUID = 1L;

        PagoInexistente(UUID pagoId) {
            super("No hay ningun pago con el identificador " + pagoId + " en esta municipalidad");
        }
    }
}
