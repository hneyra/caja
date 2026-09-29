package kamayuk.caja.nucleo.dominio;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * #131 — la regla de los reintentos, sin publicador ni buzon: una funcion pura con el instante como
 * argumento (regla 6). El recorrido vuelta a vuelta lo mide {@code UnaCaidaNoMataElPagoTest}.
 */
@DisplayName("#131 — cuando se vuelve a intentar un pago, y cuando se deja")
class ReintentosDeLaEntregaTest {

    private static final Instant PRIMER_FALLO = Instant.parse("2026-09-29T14:00:00Z");

    private final ReintentosDeLaEntrega reintentos =
            new ReintentosDeLaEntrega(Duration.ofMinutes(10), Duration.ofHours(24));

    @Test
    @DisplayName("se espera lo que el pago lleva fallando, con el tope")
    void laEsperaCreceConLaRachaYTieneTope() {
        assertThat(reintentos.esperaTras(Duration.ZERO)).isEqualTo(Duration.ZERO);
        assertThat(reintentos.esperaTras(Duration.ofSeconds(40))).isEqualTo(Duration.ofSeconds(40));
        assertThat(reintentos.esperaTras(Duration.ofMinutes(9))).isEqualTo(Duration.ofMinutes(9));
        assertThat(reintentos.esperaTras(Duration.ofHours(5)))
                .as("[sin tope, cinco horas de caida serian cinco horas mas de espera]")
                .isEqualTo(Duration.ofMinutes(10));
        assertThat(reintentos.esperaTras(Duration.ofSeconds(-30)))
                .as("[un reloj que se atraso no deja una espera negativa]")
                .isEqualTo(Duration.ZERO);
    }

    @Test
    @DisplayName("el primer fallo abre la racha y deja el pago para la vuelta siguiente")
    void elPrimerFallo() {
        assertThat(reintentos.siguienteIntento(null, PRIMER_FALLO)).contains(PRIMER_FALLO);
    }

    @Test
    @DisplayName("un segundo antes del plazo se reintenta; con el plazo cumplido, muere")
    void elPlazoSeMideDesdeElPrimerFallo() {
        Instant casi = PRIMER_FALLO.plus(Duration.ofHours(24)).minusSeconds(1);
        assertThat(reintentos.siguienteIntento(PRIMER_FALLO, casi))
                .contains(casi.plus(Duration.ofMinutes(10)));

        assertThat(
                        reintentos.siguienteIntento(
                                PRIMER_FALLO, PRIMER_FALLO.plus(Duration.ofHours(24))))
                .as("[el plazo se cuenta en tiempo, no en intentos]")
                .isEmpty();
    }

    @Test
    @DisplayName("ni tope nulo ni plazo mas corto que el tope")
    void seValida() {
        assertThatThrownBy(() -> new ReintentosDeLaEntrega(Duration.ZERO, Duration.ofHours(1)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(
                        () ->
                                new ReintentosDeLaEntrega(
                                        Duration.ofMinutes(10), Duration.ofMinutes(5)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("no puede ser menor");
    }
}
