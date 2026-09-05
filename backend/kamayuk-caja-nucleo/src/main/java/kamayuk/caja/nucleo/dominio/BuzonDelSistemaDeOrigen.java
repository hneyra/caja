package kamayuk.caja.nucleo.dominio;

/**
 * El puerto por el que se entrega un evento al sistema que emitio la orden (ADR-0026 §3).
 *
 * <p><b>Nadie lo llama dentro de la transaccion del cobro.</b> Lo llama el publicador, despues del
 * {@code COMMIT}, leyendo del buzon. Si se llamara al cobrar, la ventanilla dependeria del sistema
 * de origen para entregar un papel — que es justamente lo que esta separacion venia a evitar.
 */
public interface BuzonDelSistemaDeOrigen {

    /**
     * Entrega el evento.
     *
     * <p>Tiene que ser <b>idempotente del lado del receptor</b>: la caja reintenta con el mismo
     * {@code pagoId}, y el receptor deduplica por el. Esta interfaz no lo puede garantizar —lo
     * garantiza el otro lado— y por eso lo dice aqui: quien escriba un receptor que no deduplique
     * produce un asiento por reintento, que es el criterio 3 del encargo incumplido.
     *
     * @throws NoContesta si no se pudo entregar. Es lo unico que hace que se reintente
     * @throws Rechazado si el receptor dijo que no. NO se reintenta: reintentar un rechazo es
     *     gastar los intentos hasta matar el evento por un motivo que no va a cambiar
     */
    void entregar(EventoDePago evento);

    /** No se pudo entregar. Se reintenta. */
    final class NoContesta extends RuntimeException {

        @java.io.Serial private static final long serialVersionUID = 1L;

        public NoContesta(String mensaje, Throwable causa) {
            super(mensaje, causa);
        }

        public NoContesta(String mensaje) {
            super(mensaje);
        }
    }

    /**
     * El receptor lo rechazo.
     *
     * <p>Se distingue de {@link NoContesta} a proposito, y las dos se arreglan de maneras
     * distintas: una levantando un despliegue y la otra mirando por que el receptor no acepta este
     * pago. Confundirlas hace que un rechazo consuma los reintentos y acabe MUERTO por un motivo
     * que no es el suyo.
     */
    final class Rechazado extends RuntimeException {

        @java.io.Serial private static final long serialVersionUID = 1L;

        public Rechazado(String mensaje) {
            super(mensaje);
        }
    }
}
