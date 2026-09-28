package kamayuk.caja.nucleo.infraestructura.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import kamayuk.caja.auditoria.RegistroDeAuditoria;
import kamayuk.caja.dominio.Dinero;
import kamayuk.caja.nucleo.aplicacion.RegistrarOrdenDeCobro;
import kamayuk.caja.nucleo.dobles.OrdenesEnMemoria;
import kamayuk.caja.web.ConfiguracionDeJson;
import kamayuk.caja.web.ManejadorDeErrores;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.JacksonJsonHttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import tools.jackson.databind.json.JsonMapper;

/**
 * #142 — El importe de una orden con mas de dos decimales se rechaza en la puerta, y no lo redondea
 * la columna.
 *
 * <p>Se prueba el transporte con las ordenes en memoria, que <b>no</b> redondean: lo que se mide es
 * que la peticion no llega al caso de uso. Lo que el motor habria hecho con ella —{@code '10.005'}
 * guardado como {@code 10.01}, {@code '0.004'} como {@code 0.00} y muerto en {@code
 * orden_importe_ck}— esta medido en el javadoc de {@link ImporteRecibido} y en la fila de #142.
 */
@DisplayName("#142 — El importe de una orden no lo redondea nadie por su cuenta")
class ElImporteDeLaOrdenNoSeRedondeaTest {

    private static final Clock RELOJ =
            Clock.fixed(Instant.parse("2026-03-15T15:00:00Z"), ZoneOffset.UTC);

    private final OrdenesEnMemoria ordenes = new OrdenesEnMemoria();
    private final List<RegistroDeAuditoria> auditados = new ArrayList<>();

    private final MockMvc mvc =
            MockMvcBuilders.standaloneSetup(
                            new OrdenDeCobroController(
                                    new RegistrarOrdenDeCobro(ordenes, auditados::add, RELOJ)))
                    .setControllerAdvice(new ManejadorDeErrores())
                    .setMessageConverters(
                            new JacksonJsonHttpMessageConverter(
                                    JsonMapper.builder()
                                            .addModule(
                                                    new ConfiguracionDeJson()
                                                            .moduloDeObjetosDeValor())
                                            .build()))
                    .build();

    @Test
    @DisplayName("tres decimales: 422 que lo dice, y ni orden ni auditoria")
    void tresDecimalesSeRechazan() throws Exception {
        MvcResult resultado = alta("10.005");

        assertThat(resultado.getResponse().getStatus()).isEqualTo(422);
        assertThat(resultado.getResponse().getContentAsString())
                .contains("\"codigo\":\"VALIDACION\"")
                .as("dice que sobran decimales y repite lo que llego, sin redondearlo")
                .contains("El campo 'importe' trae mas de dos decimales: '10.005'")
                .doesNotContain("10.01");
        assertThat(ordenes.todas()).as("la orden no llega al caso de uso").isEmpty();
        assertThat(auditados).isEmpty();
    }

    @Test
    @DisplayName("el que la columna dejaria en cero: 422 aqui, no 500 en orden_importe_ck")
    void loQueSeRedondeariaACeroTambien() throws Exception {
        // `esPositivo` lo deja pasar —0.004 es positivo—, y la columna lo guardaria como 0.00,
        // que `orden_importe_ck` rechaza como un 500 con incidencia. Medido en PostgreSQL 16.
        MvcResult resultado = alta("0.004");

        assertThat(resultado.getResponse().getStatus()).isEqualTo(422);
        assertThat(resultado.getResponse().getContentAsString())
                .contains("trae mas de dos decimales: '0.004'");
        assertThat(ordenes.todas()).isEmpty();
    }

    @Test
    @DisplayName("con dos decimales entra, y con el valor que llego")
    void dosDecimalesEntran() throws Exception {
        // El contraste: sin el, rechazar TODO importe con decimales pasaria las dos de arriba.
        MvcResult resultado = alta("10.05");

        assertThat(resultado.getResponse().getStatus()).isEqualTo(201);
        assertThat(ordenes.todas())
                .singleElement()
                .extracting(o -> o.importe())
                .isEqualTo(Dinero.de("10.05"));
    }

    @Test
    @DisplayName("los ceros de la derecha no cuentan: «10.500» cabe entero en la columna")
    void losCerosDeLaDerechaNoCuentan() throws Exception {
        MvcResult resultado = alta("10.500");

        assertThat(resultado.getResponse().getStatus())
                .as("su escala es 3 y su valor tiene UN decimal: guardarlo no redondea nada")
                .isEqualTo(201);
        assertThat(ordenes.todas())
                .singleElement()
                .extracting(o -> o.importe())
                .isEqualTo(Dinero.de("10.50"));
    }

    @Test
    @DisplayName("el limite es el de la columna: el dominio `dinero` de V1 guarda dos decimales")
    void elLimiteEsElDeLaColumna() throws IOException {
        // Sin esto, el 2 de `ImporteRecibido` seria una cifra suelta: la ata a lo que la base
        // declara. Si un dia el dominio cambia de escala, esta prueba lo dice aqui.
        String baseline;
        try (InputStream v1 =
                getClass().getClassLoader().getResourceAsStream("db/migration/V1__baseline.sql")) {
            assertThat(v1).as("V1 esta en el classpath de las pruebas de este modulo").isNotNull();
            baseline = new String(v1.readAllBytes(), StandardCharsets.UTF_8);
        }
        assertThat(baseline)
                .contains(
                        "CREATE DOMAIN dinero AS numeric(15,"
                                + ImporteRecibido.DECIMALES_QUE_SE_GUARDAN
                                + ");");
    }

    // ------------------------------------------------------------------

    private MvcResult alta(String importe) throws Exception {
        return mvc.perform(
                        MockMvcRequestBuilders.post("/caja/api/v1/ordenes-de-cobro")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {"sistemaOrigen":"rentas",
                                         "referenciaExterna":"PREDIAL-2026-142",
                                         "concepto":"PREDIAL 2026",
                                         "importe":"%s",
                                         "fechaExigibilidad":"2026-02-28",
                                         "actualizadoA":"2026-03-15",
                                         "observacion":"orden emitida desde rentas"}
                                        """
                                                .formatted(importe)))
                .andReturn();
    }
}
