package kamayuk.caja.nucleo.dominio;

import java.time.Duration;
import java.time.Instant;
import java.util.Objects;
import java.util.Optional;
import org.jspecify.annotations.Nullable;

/**
 * Cuando se vuelve a intentar un pago que no llego, y cuando se deja de intentar (#131).
 *
 * <h2>El defecto que esto cierra</h2>
 *
 * <p>Hasta #131 el presupuesto se contaba en <b>vueltas</b>: ocho intentos, uno por vuelta del
 * publicador, una vuelta cada diez segundos y todo lo pendiente intentado en cada una. Con el
 * sistema de origen caido, un pago cobrado moria a los ~80 s — menos que «el despliegue de dos
 * minutos» que {@code application.yaml} decia cubrir— y morir era para siempre.
 *
 * <h2>La regla: se espera lo que el pago lleva fallando, con un tope</h2>
 *
 * <p>Tras un fallo que no lo mata, el siguiente intento no es antes de {@code ahora +
 * min(esperaMaxima, ahora − fallandoDesde)}. Es un retroceso exponencial <b>sin contador</b>: con
 * una vuelta cada diez segundos, los intentos caen a los 0, 10, 20, 40, 80, 160, 320 y 640 s de
 * caida, y desde ahi uno cada {@code esperaMaxima}. Lo justifican dos propiedades:
 *
 * <ul>
 *   <li><b>Nunca se espera mas de lo que el origen lleva caido.</b> Si vuelve a los T segundos, el
 *       pago sale a mas tardar a los 2T —mas lo que tarde la vuelta siguiente—, y nunca mas de
 *       {@code esperaMaxima} despues. El despliegue de dos minutos: el origen vuelve a los 120 s y
 *       el pago sale a los 160 s, al sexto intento.
 *   <li><b>No hay que contar la racha</b>: sale del instante del primer fallo, que ya esta en la
 *       fila ({@code pago_evento.fallando_desde}). Los {@code intentos} siguen contandose —son lo
 *       que dice cuantas veces se llamo al origen—, pero ya no deciden nada.
 * </ul>
 *
 * <p>La espera minima no se escribe aqui: la pone la vuelta del publicador ({@code
 * kamayuk.caja.entrega.intervalo}). Tras el primer fallo el evento queda para la vuelta siguiente,
 * como hasta ahora.
 *
 * <h2>Y se deja de intentar pasado un plazo, medido en TIEMPO</h2>
 *
 * <p>El pago muere en el primer fallo que llega cuando ya lleva {@code plazo} desde {@code
 * fallandoDesde}: entre {@code plazo} y {@code plazo + esperaMaxima + una vuelta} despues de su
 * primer fallo. Un tiempo, y no un numero de intentos, porque lo que un MUERTO le dice a una
 * persona es «este dinero lleva un dia sin llegar», y eso es un tiempo. Si el publicador estuvo
 * parado entre dos fallos, ese rato cuenta, y a proposito: el dinero tampoco llego mientras tanto.
 *
 * <p>Un rechazo del receptor ({@link BuzonDelSistemaDeOrigen.Rechazado}) no pasa por aqui: el
 * cuerpo del pago esta congelado, asi que reintentar no cambia la respuesta, y muere en el acto.
 *
 * <h2>Los valores por omision, y por que</h2>
 *
 * <ul>
 *   <li><b>{@code esperaMaxima} = 10 min.</b> Pasados diez minutos de caida, esperar mas ahorra
 *       poco —seis {@code POST} por hora y pago, que el receptor deduplica por {@code pagoId}— y
 *       cuesta que el pago salga hasta diez minutos despues de que el origen vuelva.
 *   <li><b>{@code plazo} = 24 h.</b> Un MUERTO avisa a una persona con nombre y le pide un acto con
 *       observacion <b>por pago</b>: volver a ponerlo en camino o explicarlo. Con un plazo corto,
 *       una hora de caida del origen el ultimo dia de vencimiento serian cientos de actos a mano
 *       por pagos que habrian salido solos. Y esperar no esconde nada: un PENDIENTE impide cerrar
 *       el turno igual que un MUERTO, y la conciliacion del dia lo cuenta. Un dia cubre una noche
 *       entera de mantenimiento del origen y avisa antes del cierre del dia siguiente.
 * </ul>
 *
 * <p>Es una funcion pura (regla 6): el instante entra como argumento. El reloj lo lee quien la
 * llama, que es lo que deja probarla con un reloj fijo.
 *
 * @param esperaMaxima el tope de la espera entre dos intentos del mismo pago
 * @param plazo cuanto se sigue intentando desde el primer fallo de la racha
 */
public record ReintentosDeLaEntrega(Duration esperaMaxima, Duration plazo) {

    public ReintentosDeLaEntrega {
        Objects.requireNonNull(esperaMaxima, "La espera entre intentos lleva tope");
        Objects.requireNonNull(plazo, "Se dice cuanto se sigue intentando");
        if (esperaMaxima.isNegative() || esperaMaxima.isZero()) {
            throw new IllegalArgumentException(
                    "La espera maxima entre dos intentos tiene que ser positiva: " + esperaMaxima);
        }
        if (plazo.compareTo(esperaMaxima) < 0) {
            // Con un plazo mas corto que el tope, el tope no se alcanza nunca y lo que se lee en
            // la configuracion no es lo que pasa.
            throw new IllegalArgumentException(
                    "El plazo ("
                            + plazo
                            + ") no puede ser menor que la espera maxima entre dos intentos ("
                            + esperaMaxima
                            + ")");
        }
    }

    /**
     * Que se hace con un evento que acaba de fallar sin que el receptor lo rechace.
     *
     * @param fallandoDesde el primer fallo de la racha; nulo si este es el primero
     * @param ahora cuando fallo
     * @return cuando se puede volver a intentar, o vacio si con este fallo se agoto el plazo
     */
    public Optional<Instant> siguienteIntento(@Nullable Instant fallandoDesde, Instant ahora) {
        Objects.requireNonNull(ahora, "Un fallo ocurre en un instante");
        Duration fallando = Duration.between(fallandoDesde == null ? ahora : fallandoDesde, ahora);
        if (fallando.compareTo(plazo) >= 0) {
            return Optional.empty();
        }
        return Optional.of(ahora.plus(esperaTras(fallando)));
    }

    /**
     * La espera tras un fallo: lo que el pago lleva fallando, con tope.
     *
     * <p>Un {@code fallando} negativo —el reloj de otra replica, o uno que se atraso— cuenta como
     * cero: se reintenta en la vuelta siguiente, que es lo que se haria sin saber nada.
     */
    public Duration esperaTras(Duration fallando) {
        Objects.requireNonNull(fallando, "Se espera en funcion de lo que lleva fallando");
        if (fallando.isNegative()) {
            return Duration.ZERO;
        }
        return fallando.compareTo(esperaMaxima) < 0 ? fallando : esperaMaxima;
    }
}
