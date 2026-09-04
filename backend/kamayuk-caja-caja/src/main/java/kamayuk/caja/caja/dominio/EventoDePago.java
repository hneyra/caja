package kamayuk.caja.caja.dominio;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Una fila del buzon de salida (ADR-0026 §3).
 *
 * <h2>Por que un buzon y no una llamada</h2>
 *
 * <p>Se escribe <b>en la misma transaccion que el recibo</b>. Si la fila esta, el recibo esta; si
 * el recibo esta, la fila esta. Un proceso aparte la entrega. Lo que eso compra es que la
 * ventanilla cobre con el sistema de origen apagado —que es lo que hace falta el ultimo dia de
 * vencimiento—; lo que cuesta es que la conciliacion diaria deje de ser buena practica y pase a ser
 * obligacion operativa.
 *
 * <p>La alternativa —llamar al origen dentro de la transaccion del cobro— es la que ADR-0026
 * descarta: hace que la ventanilla dependa del origen para entregar un papel, que es justamente lo
 * que esta separacion venia a evitar.
 *
 * @param eventoId el {@code pagoId}. <b>Lo genera la caja al cobrar, no el transporte</b>: un
 *     reintento de entrega manda el MISMO uuid, y por eso el receptor puede deduplicar. Si lo
 *     generara quien entrega, dos entregas del mismo cobro serian dos pagos y habria dos asientos —
 *     que es exactamente el criterio 3 del encargo, visto desde el lado que lo hace posible
 * @param cuerpo el evento entero, congelado. No se recompone al entregar
 */
public record EventoDePago(
        @Nullable Long id,
        UUID eventoId,
        TipoDeEventoDePago tipo,
        SistemaDeOrigen sistemaDestino,
        long reciboId,
        long turnoId,
        String cuerpo,
        EstadoDelEvento estado,
        int intentos,
        @Nullable String ultimoError,
        Instant creadoEn,
        @Nullable Instant entregadoEn,
        @Nullable String explicacion) {

    public EventoDePago {
        Objects.requireNonNull(eventoId, "Un evento del buzon lleva su pagoId");
        Objects.requireNonNull(tipo, "Un evento dice que le paso al dinero");
        Objects.requireNonNull(sistemaDestino, "Un evento dice a quien va");
        Objects.requireNonNull(cuerpo, "Un evento lleva su cuerpo congelado");
        Objects.requireNonNull(estado, "Un evento dice en que esta su entrega");
        Objects.requireNonNull(creadoEn, "Un evento dice cuando se cobro: es la hora del transito");
        if (intentos < 0) {
            throw new IllegalArgumentException("Los intentos se cuentan desde cero: " + intentos);
        }
        // pago_evento_entregado_ck, en Java. «Entregado» sin hora no se puede conciliar contra
        // nada, y el cierre bloqueante no tendria con que decidir.
        if ((estado == EstadoDelEvento.ENTREGADO) != (entregadoEn != null)) {
            throw new IllegalArgumentException(
                    "Un evento ENTREGADO lleva la hora en que se entrego, y uno que no lo esta no"
                            + " puede llevarla: estado="
                            + estado);
        }
        // pago_evento_explicacion_ck, en Java. Un turno no cierra con un pago sin imputar «porque
        // si»: quien lo explica lo firma.
        if (estado == EstadoDelEvento.EXPLICADO
                && (explicacion == null || explicacion.strip().length() < 5)) {
            throw new IllegalArgumentException(
                    "Un evento EXPLICADO dice por que, y con mas de cuatro letras: es lo unico que"
                            + " separa «alguien se hizo cargo» de «alguien lo apago para poder"
                            + " cerrar la caja»");
        }
    }

    /** Un evento recien nacido: pendiente, sin intentos y sin hora de entrega. */
    public static EventoDePago nuevo(
            UUID eventoId,
            TipoDeEventoDePago tipo,
            SistemaDeOrigen sistemaDestino,
            long reciboId,
            long turnoId,
            String cuerpo,
            Instant creadoEn) {
        return new EventoDePago(
                null,
                eventoId,
                tipo,
                sistemaDestino,
                reciboId,
                turnoId,
                cuerpo,
                EstadoDelEvento.PENDIENTE,
                0,
                null,
                creadoEn,
                null,
                null);
    }

    public long idGuardado() {
        return Objects.requireNonNull(id, "Un evento leido del buzon trae su identificador");
    }

    /** Si este evento deja cerrar su turno. */
    public boolean permiteCerrarElTurno() {
        return estado.permiteCerrarElTurno();
    }
}
