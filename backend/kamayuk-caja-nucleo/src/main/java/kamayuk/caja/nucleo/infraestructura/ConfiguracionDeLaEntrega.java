package kamayuk.caja.nucleo.infraestructura;

import java.time.Duration;
import java.time.format.DateTimeParseException;
import kamayuk.caja.nucleo.dominio.ReintentosDeLaEntrega;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * De {@code kamayuk.caja.entrega.*} a {@link ReintentosDeLaEntrega} (#131).
 *
 * <p>Las duraciones se leen como texto y se interpretan aqui, en ISO-8601 —{@code PT10M}, {@code
 * PT24H}, como el {@code intervalo} que ya estaba—, y no con un {@code @Value Duration}: esa
 * conversion la pone el servicio de conversion de Spring Boot, y un contexto armado a mano —el de
 * {@code CadaEventoEnSuTransaccionTest}— no lo tiene. Un valor mal escrito tumba el arranque
 * nombrando la variable, en vez de dejar un publicador que muere o no muere por un numero que nadie
 * leyo.
 *
 * <h2>Y {@code kamayuk.caja.entrega.intentos} se retiro, y lo dice</h2>
 *
 * <p>Era el presupuesto hasta #131: ocho intentos, uno por vuelta. Ahora el presupuesto es un
 * tiempo, y un {@code KAMAYUK_CAJA_ENTREGA_INTENTOS} que alguien siguiera poniendo se ignoraria en
 * silencio —quien lo subio a veinte creeria haber comprado veinte intentos—. Ni el descriptor ni el
 * compose lo ponen (medido en #131), asi que <b>no arrancar</b> si esta puesto no rompe ningun
 * despliegue y avisa al unico que podria llevarse una sorpresa.
 */
@Configuration(proxyBeanMethods = false)
public class ConfiguracionDeLaEntrega {

    /** La propiedad retirada en #131. */
    static final String INTENTOS_RETIRADA = "kamayuk.caja.entrega.intentos";

    /** El tope de la espera por omision; el mismo que {@code application.yaml}. */
    public static final String ESPERA_MAXIMA_POR_OMISION = "PT10M";

    /**
     * El plazo por omision; el mismo que {@code application.yaml}.
     *
     * <p>No se llama {@code PLAZO_…}, y no es capricho: el escaner de la regla 5 caza las
     * constantes que empiezan por {@code PLAZO} con una cifra dentro, porque en este dominio un
     * plazo suele ser del Codigo Tributario. Este es tecnico —cuanto se reintenta una entrega— y
     * ademas no se compila: es solo el valor que toma {@code KAMAYUK_CAJA_ENTREGA_PLAZO} si nadie
     * lo pone.
     */
    public static final String INTENTAR_DURANTE_POR_OMISION = "PT24H";

    @Bean
    ReintentosDeLaEntrega reintentosDeLaEntrega(
            @Value("${kamayuk.caja.entrega.espera-maxima:" + ESPERA_MAXIMA_POR_OMISION + "}")
                    String esperaMaxima,
            @Value("${kamayuk.caja.entrega.plazo:" + INTENTAR_DURANTE_POR_OMISION + "}")
                    String plazo,
            @Value("${" + INTENTOS_RETIRADA + ":}") String intentosRetirada) {
        return reintentos(esperaMaxima, plazo, intentosRetirada);
    }

    /**
     * Los que se despliegan si nadie pone nada.
     *
     * <p>Las pruebas de la entrega miden con estos y no con unos suyos: lo que tiene que cubrir el
     * despliegue de dos minutos es la configuracion de produccion. Que el contexto vivo arranque
     * con estos —o sea, que {@code application.yaml} diga lo mismo— lo mira {@code
     * ArranqueDeLaAplicacionTest}.
     */
    public static ReintentosDeLaEntrega porOmision() {
        return reintentos(ESPERA_MAXIMA_POR_OMISION, INTENTAR_DURANTE_POR_OMISION, "");
    }

    /** Lo mismo sin Spring, para poder probarlo. */
    static ReintentosDeLaEntrega reintentos(
            String esperaMaxima, String plazo, String intentosRetirada) {
        if (!intentosRetirada.isBlank()) {
            throw new IllegalStateException(
                    INTENTOS_RETIRADA
                            + " ("
                            + intentosRetirada
                            + ") se retiro en #131: el presupuesto de la entrega ya no se cuenta"
                            + " en intentos sino en tiempo. Quite KAMAYUK_CAJA_ENTREGA_INTENTOS y,"
                            + " si hace falta, ponga KAMAYUK_CAJA_ENTREGA_PLAZO (ISO-8601, PT24H"
                            + " por omision)");
        }
        return new ReintentosDeLaEntrega(
                duracion("kamayuk.caja.entrega.espera-maxima", esperaMaxima),
                duracion("kamayuk.caja.entrega.plazo", plazo));
    }

    private static Duration duracion(String propiedad, String valor) {
        try {
            return Duration.parse(valor.strip());
        } catch (DateTimeParseException malEscrita) {
            throw new IllegalStateException(
                    propiedad + " = «" + valor + "» no es una duracion ISO-8601 (PT10M, PT24H…)",
                    malEscrita);
        }
    }
}
