package kamayuk.caja.nucleo.dominio;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.time.LocalDate;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** #104 — Un turno lleva la hora a la que se abrio, y sin ella no existe. */
@DisplayName("#104 — El turno y su hora de apertura")
class TurnoDeCajaTest {

    private static final LocalDate HOY = LocalDate.of(2026, 3, 15);
    private static final Instant APERTURA = Instant.parse("2026-03-15T13:05:00Z");

    @Test
    @DisplayName("lleva el instante con que se construyo, sin recortarlo")
    void llevaSuHoraDeApertura() {
        TurnoDeCaja turno = new TurnoDeCaja(1L, 1L, "jperez", HOY, APERTURA, EstadoDeTurno.ABIERTO);

        assertThat(turno.abiertoEn()).isEqualTo(APERTURA);
    }

    @Test
    @DisplayName("sin hora de apertura no hay turno: la columna es NOT NULL y no se inventa")
    void sinHoraDeAperturaNoHayTurno() {
        assertThatThrownBy(
                        () -> new TurnoDeCaja(1L, 1L, "jperez", HOY, null, EstadoDeTurno.ABIERTO))
                .isInstanceOf(NullPointerException.class)
                .hasMessageContaining("hora");
    }
}
