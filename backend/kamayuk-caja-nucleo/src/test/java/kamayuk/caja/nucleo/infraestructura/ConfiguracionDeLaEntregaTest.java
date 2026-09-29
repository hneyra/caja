package kamayuk.caja.nucleo.infraestructura;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import kamayuk.caja.nucleo.dominio.ReintentosDeLaEntrega;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** #131 — de {@code kamayuk.caja.entrega.*} a los reintentos, y la propiedad que se retiro. */
@DisplayName("#131 — la configuracion de la entrega")
class ConfiguracionDeLaEntregaTest {

    @Test
    @DisplayName("por omision: diez minutos de tope y un dia de plazo")
    void porOmision() {
        assertThat(ConfiguracionDeLaEntrega.porOmision())
                .isEqualTo(new ReintentosDeLaEntrega(Duration.ofMinutes(10), Duration.ofHours(24)));
    }

    @Test
    @DisplayName("se lee ISO-8601, con blancos alrededor")
    void seLeeIso() {
        assertThat(ConfiguracionDeLaEntrega.reintentos(" PT30S ", "PT2H", ""))
                .isEqualTo(new ReintentosDeLaEntrega(Duration.ofSeconds(30), Duration.ofHours(2)));
    }

    @Test
    @DisplayName("una duracion mal escrita no arranca, y dice cual")
    void malEscritaNoArranca() {
        assertThatThrownBy(() -> ConfiguracionDeLaEntrega.reintentos("PT10M", "24h", ""))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("kamayuk.caja.entrega.plazo")
                .hasMessageContaining("24h");
    }

    /**
     * Quien subio {@code KAMAYUK_CAJA_ENTREGA_INTENTOS} a veinte creeria haber comprado veinte
     * intentos; ignorarlo en silencio le dejaria el plazo por omision sin decirselo.
     */
    @Test
    @DisplayName("KAMAYUK_CAJA_ENTREGA_INTENTOS se retiro: puesto, no arranca y dice que poner")
    void losIntentosSeRetiraron() {
        assertThatThrownBy(() -> ConfiguracionDeLaEntrega.reintentos("PT10M", "PT24H", "20"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("kamayuk.caja.entrega.intentos")
                .hasMessageContaining("KAMAYUK_CAJA_ENTREGA_PLAZO");
    }
}
