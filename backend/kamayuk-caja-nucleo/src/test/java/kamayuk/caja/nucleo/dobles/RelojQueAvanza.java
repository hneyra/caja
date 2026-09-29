package kamayuk.caja.nucleo.dobles;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Objects;

/**
 * Un reloj que solo se mueve cuando la prueba lo mueve (#131).
 *
 * <p>El plazo de la entrega es un tiempo, asi que medirlo con un {@code Clock.fixed} no sirve: con
 * el reloj parado ningun pago llegaria nunca a su plazo, y una prueba de «muere al agotarlo»
 * pasaria por no llegar nunca. Con un reloj de verdad habria que esperar un dia. Este avanza lo que
 * se le pide y nada mas, de modo que una caida de veinticuatro horas se recorre en milisegundos y
 * el instante de cada intento se puede escribir en la prueba.
 */
public final class RelojQueAvanza extends Clock {

    private final ZoneId zona;
    private volatile Instant ahora;

    public RelojQueAvanza(Instant inicio, ZoneId zona) {
        this.ahora = Objects.requireNonNull(inicio, "Un reloj empieza en algun instante");
        this.zona = Objects.requireNonNull(zona, "Un reloj lleva zona");
    }

    /** Mueve el reloj hacia delante. */
    public void avanzar(Duration cuanto) {
        if (cuanto.isNegative()) {
            throw new IllegalArgumentException("Este reloj no va hacia atras: " + cuanto);
        }
        ahora = ahora.plus(cuanto);
    }

    @Override
    public ZoneId getZone() {
        return zona;
    }

    /** Otro reloj, parado en el mismo instante: no se mueve con este. */
    @Override
    public Clock withZone(ZoneId otra) {
        return new RelojQueAvanza(ahora, otra);
    }

    @Override
    public Instant instant() {
        return ahora;
    }
}
