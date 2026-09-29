package kamayuk.caja.nucleo.infraestructura.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Optional;
import kamayuk.caja.auditoria.Origen;
import kamayuk.caja.auditoria.OrigenContext;
import kamayuk.caja.auditoria.RegistroDeAuditoria;
import kamayuk.caja.compartido.Pagina;
import kamayuk.caja.compartido.Paginacion;
import kamayuk.caja.dominio.Dinero;
import kamayuk.caja.dominio.Observacion;
import kamayuk.caja.dominio.ZonaHoraria;
import kamayuk.caja.nucleo.aplicacion.AbrirCaja;
import kamayuk.caja.nucleo.aplicacion.CobrarOrdenes;
import kamayuk.caja.nucleo.aplicacion.CobrarTasa;
import kamayuk.caja.nucleo.dobles.BuzonEnMemoria;
import kamayuk.caja.nucleo.dobles.CajasEnMemoria;
import kamayuk.caja.nucleo.dobles.OrdenesEnMemoria;
import kamayuk.caja.nucleo.dobles.RecibosEnMemoria;
import kamayuk.caja.nucleo.dobles.TasasEnMemoria;
import kamayuk.caja.nucleo.dobles.TurnosEnMemoria;
import kamayuk.caja.nucleo.dominio.Caja;
import kamayuk.caja.nucleo.dominio.ClaveDeIdempotencia;
import kamayuk.caja.nucleo.dominio.CriterioDeRecibos;
import kamayuk.caja.nucleo.dominio.EstadoDeOrden;
import kamayuk.caja.nucleo.dominio.NumeroDeRecibo;
import kamayuk.caja.nucleo.dominio.OrdenDeCobro;
import kamayuk.caja.nucleo.dominio.Pagador;
import kamayuk.caja.nucleo.dominio.Recibo;
import kamayuk.caja.nucleo.dominio.ReciboEnConsulta;
import kamayuk.caja.nucleo.dominio.ReciboRepository;
import kamayuk.caja.nucleo.dominio.SistemaDeOrigen;
import kamayuk.caja.nucleo.dominio.Tasa;
import kamayuk.caja.nucleo.infraestructura.ComponedorDeEventosJson;
import kamayuk.caja.web.ConfiguracionDeJson;
import kamayuk.caja.web.ManejadorDeErrores;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
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
 * #143 — Lo que el borde HTTP contesta a una {@code Idempotency-Key} repetida.
 *
 * <p>Tres cosas que el caso de uso no puede decidir solo: <b>201 al que emite y 200 al
 * reintento</b>; <b>422 a la clave reusada</b> con otra peticion, nunca el recibo de otra cosa; y
 * que el reintento se reconozca <b>antes de mirar la fecha</b>, para que el de un cobro de ayer que
 * cruza la medianoche con {@code fechaDePago} de ayer reciba su recibo en vez del 422 de {@code
 * SOLO_HOY}. Y la cuarta, la carrera que ninguna lectura ve: 409 cuando otra peticion con la misma
 * clave confirmo mientras esta emitia.
 */
@DisplayName("#143 — /cobros y /cobros/tasas con una Idempotency-Key repetida")
class LaClaveSeAtaALaPeticionFronteraTest {

    private static final String COBROS = "/caja/api/v1/cobros";
    private static final String TASAS = COBROS + "/tasas";

    /** Las 15:00 del 28 en Lima; el reloj avanza a las 00:30 del 29 cuando la prueba lo pide. */
    private static final Instant HOY_A_LAS_TRES = Instant.parse("2026-09-28T20:00:00Z");

    private static final Instant MANIANA_A_LAS_DOCE_Y_MEDIA = Instant.parse("2026-09-29T05:30:00Z");

    private static final SistemaDeOrigen RENTAS = SistemaDeOrigen.de("rentas");
    private static final Pagador PAGADOR = new Pagador("12345678", "TITULAR, PRUEBA", 7L);

    private final RelojQueAvanza reloj = new RelojQueAvanza(HOY_A_LAS_TRES);

    private final CajasEnMemoria cajas =
            new CajasEnMemoria().con(new Caja(1L, "C-01", "Caja tributaria", "001", null, true));
    private final TurnosEnMemoria turnos = new TurnosEnMemoria();
    private final RecibosEnMemoria recibos = new RecibosEnMemoria();
    private final OrdenesEnMemoria ordenes = new OrdenesEnMemoria();
    private final BuzonEnMemoria buzon = new BuzonEnMemoria();
    private final TasasEnMemoria tasas = new TasasEnMemoria().con(tasa());

    private final MockMvc mvc = ventanilla(recibos);

    @BeforeEach
    void fijarElToken() {
        OrigenContext.fijar(new Origen("cajero.prueba", null, null));
    }

    @AfterEach
    void limpiarElToken() {
        OrigenContext.limpiar();
    }

    @Test
    @DisplayName("cobrar: 201 al que emite y 200 al reintento, con el mismo recibo y pagoId")
    void elReintentoDeUnCobroEs200() throws Exception {
        long orden = sembrarOrden("PREDIAL-143-1");

        MvcResult primero = post(COBROS, "k-1", cobranza(orden, null));
        MvcResult reintento = post(COBROS, "k-1", cobranza(orden, null));

        assertThat(primero.getResponse().getStatus()).isEqualTo(201);
        assertThat(reintento.getResponse().getStatus())
                .as("[un 201 al reintento afirmaria que se creo algo que ya existia]")
                .isEqualTo(200);
        assertThat(reintento.getResponse().getContentAsString())
                .contains("\"emitido\":false")
                .contains("\"numero\":\"001-0000001\"")
                .contains(pagoIdDe(primero));
        assertThat(recibos.emitidos()).hasSize(1);
    }

    @Test
    @DisplayName("tasas: 201 al que emite y 200 al reintento, con el mismo recibo")
    void elReintentoDeUnaTasaEs200() throws Exception {
        MvcResult primero = post(TASAS, "k-2", cobroDeTasas(1, null));
        MvcResult reintento = post(TASAS, "k-2", cobroDeTasas(1, null));

        assertThat(primero.getResponse().getStatus()).isEqualTo(201);
        assertThat(reintento.getResponse().getStatus()).isEqualTo(200);
        assertThat(reintento.getResponse().getContentAsString())
                .isEqualTo(primero.getResponse().getContentAsString());
        assertThat(recibos.emitidos()).hasSize(1);
    }

    @Test
    @DisplayName("la clave de una tasa, mandada a /cobros con una orden: 422, y la orden intacta")
    void laClaveDeUnaTasaEnCobrosEs422() throws Exception {
        assertThat(post(TASAS, "k-3", cobroDeTasas(1, null)).getResponse().getStatus())
                .isEqualTo(201);
        long orden = sembrarOrden("PREDIAL-143-3");

        MvcResult resultado = post(COBROS, "k-3", cobranza(orden, null));

        assertThat(resultado.getResponse().getStatus())
                .as(
                        "[antes de #143: 201 con el recibo de la tasa, y la orden sin cobrar] "
                                + resultado.getResponse().getContentAsString())
                .isEqualTo(422);
        assertThat(resultado.getResponse().getContentAsString())
                .contains("\"codigo\":\"VALIDACION\"")
                .contains("ya se uso con otra peticion");
        assertThat(ordenes.porId(orden).orElseThrow().estado()).isEqualTo(EstadoDeOrden.PENDIENTE);
        assertThat(recibos.emitidos()).hasSize(1);
        assertThat(buzon.encolados()).isEmpty();
    }

    @Test
    @DisplayName("la misma clave con otra cantidad en /cobros/tasas: 422")
    void otraCantidadEs422() throws Exception {
        post(TASAS, "k-4", cobroDeTasas(1, null));

        assertThat(post(TASAS, "k-4", cobroDeTasas(2, null)).getResponse().getStatus())
                .isEqualTo(422);
        assertThat(recibos.emitidos()).hasSize(1);
    }

    @Test
    @DisplayName("despues de medianoche con la fecha de ayer en el cuerpo: su recibo, no SOLO_HOY")
    void despuesDeMedianocheConLaFechaDeAyer() throws Exception {
        long orden = sembrarOrden("PREDIAL-143-5");
        MvcResult primero = post(COBROS, "k-5", cobranza(orden, "2026-09-28"));
        reloj.avanzarA(MANIANA_A_LAS_DOCE_Y_MEDIA);

        MvcResult reintento = post(COBROS, "k-5", cobranza(orden, "2026-09-28"));

        assertThat(reintento.getResponse().getStatus())
                .as(
                        "[el reintento de un cobro de ayer no es un cobro de ayer: sin mirar la"
                                + " clave antes que la fecha, 422 SOLO_HOY] "
                                + reintento.getResponse().getContentAsString())
                .isEqualTo(200);
        assertThat(reintento.getResponse().getContentAsString()).contains(pagoIdDe(primero));
        assertThat(turnos.cuantos()).as("[y ni un turno del 29]").isEqualTo(1);
    }

    @Test
    @DisplayName(
            "despues de medianoche, sin fecha, en tasas: su recibo y ni un turno del dia nuevo")
    void despuesDeMedianocheSinFecha() throws Exception {
        MvcResult primero = post(TASAS, "k-6", cobroDeTasas(1, null));
        reloj.avanzarA(MANIANA_A_LAS_DOCE_Y_MEDIA);

        MvcResult reintento = post(TASAS, "k-6", cobroDeTasas(1, null));

        assertThat(reintento.getResponse().getStatus()).isEqualTo(200);
        assertThat(reintento.getResponse().getContentAsString())
                .isEqualTo(primero.getResponse().getContentAsString());
        assertThat(turnos.cuantos()).isEqualTo(1);
    }

    @Test
    @DisplayName("con el turno ya cerrado: su recibo, no un 409 de turno cerrado")
    void conElTurnoCerrado() throws Exception {
        long orden = sembrarOrden("PREDIAL-143-7");
        post(COBROS, "k-7", cobranza(orden, null));
        turnos.cerrar(recibos.emitidos().getFirst().turnoId());

        MvcResult reintento = post(COBROS, "k-7", cobranza(orden, null));

        assertThat(reintento.getResponse().getStatus())
                .as(reintento.getResponse().getContentAsString())
                .isEqualTo(200);
    }

    @Test
    @DisplayName("una clave que no cabe en la columna: 422 antes de cobrar, no un 500 despues")
    void unaClaveQueNoCabeEs422() throws Exception {
        long orden = sembrarOrden("PREDIAL-143-8");

        MvcResult resultado = post(COBROS, "k".repeat(65), cobranza(orden, null));

        assertThat(resultado.getResponse().getStatus()).isEqualTo(422);
        assertThat(resultado.getResponse().getContentAsString()).contains("hasta 64");
        assertThat(recibos.emitidos()).isEmpty();
        assertThat(turnos.cuantos()).isZero();
    }

    @Test
    @DisplayName("otra peticion con la misma clave confirmo mientras esta emitia: 409, no un 500")
    void laCarreraQueNingunaLecturaVeEs409() throws Exception {
        // Lo que pasa cuando dos peticiones con la misma clave no comparten candado —otra caja,
        // otro cajero, otro dia—: las dos miran, ninguna ve a la otra, y la segunda choca con
        // recibo_idempotencia_uq. Aqui la ceguera la pone un repositorio que no encuentra nada
        // por la clave; el choque, el doble, que imita al indice.
        MockMvc ciega = ventanilla(new ReciboRepositoryCiego(recibos));
        long una = sembrarOrden("PREDIAL-143-9");
        long otra = sembrarOrden("PREDIAL-143-10");
        assertThat(post(ciega, COBROS, "k-9", cobranza(una, null)).getResponse().getStatus())
                .isEqualTo(201);

        MvcResult segunda = post(ciega, COBROS, "k-9", cobranza(otra, null));

        assertThat(segunda.getResponse().getStatus())
                .as(segunda.getResponse().getContentAsString())
                .isEqualTo(409);
        assertThat(segunda.getResponse().getContentAsString())
                .contains("\"codigo\":\"CONFLICTO\"")
                .contains("Reintente con la misma clave");
    }

    // ------------------------------------------------------------------

    private MockMvc ventanilla(ReciboRepository repositorio) {
        AbrirCaja abrirCaja =
                new AbrirCaja(cajas, turnos, (RegistroDeAuditoria registro) -> {}, reloj);
        return MockMvcBuilders.standaloneSetup(
                        new CajaController(
                                new CobrarOrdenes(
                                        abrirCaja,
                                        ordenes,
                                        repositorio,
                                        buzon,
                                        new ComponedorDeEventosJson(new JsonMapper()),
                                        (RegistroDeAuditoria registro) -> {},
                                        reloj),
                                new CobrarTasa(
                                        abrirCaja,
                                        tasas,
                                        repositorio,
                                        (RegistroDeAuditoria registro) -> {},
                                        reloj),
                                reloj))
                .setControllerAdvice(new ManejadorDeErrores())
                .setMessageConverters(
                        new JacksonJsonHttpMessageConverter(
                                JsonMapper.builder()
                                        .addModule(
                                                new ConfiguracionDeJson().moduloDeObjetosDeValor())
                                        .build()))
                .build();
    }

    private MvcResult post(String ruta, String clave, String cuerpo) throws Exception {
        return post(mvc, ruta, clave, cuerpo);
    }

    private static MvcResult post(MockMvc contra, String ruta, String clave, String cuerpo)
            throws Exception {
        return contra.perform(
                        MockMvcRequestBuilders.post(ruta)
                                .header("Idempotency-Key", clave)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(cuerpo))
                .andReturn();
    }

    private String pagoIdDe(MvcResult resultado) throws Exception {
        String cuerpo = resultado.getResponse().getContentAsString();
        int desde = cuerpo.indexOf("\"pagoId\":\"");
        assertThat(desde).as("la respuesta del cobro trae su pagoId: " + cuerpo).isNotNegative();
        return cuerpo.substring(desde, cuerpo.indexOf('"', desde + "\"pagoId\":\"".length()) + 1);
    }

    private long sembrarOrden(String referencia) {
        return ordenes.con(
                        OrdenDeCobro.nueva(
                                RENTAS,
                                referencia,
                                "IMPUESTO PREDIAL 2026",
                                null,
                                Dinero.de("100.00"),
                                LocalDate.of(2026, 9, 1),
                                LocalDate.of(2026, 9, 1),
                                PAGADOR,
                                Instant.parse("2026-09-01T10:00:00Z"),
                                Observacion.de("Orden emitida por el sistema de origen")))
                .idGuardado();
    }

    private static String cobranza(long orden, @Nullable String fecha) {
        return """
                {"caja":"C-01","formaDePago":"EFECTIVO",%s"ordenes":[%d],
                 "observacion":"Cobranza en ventanilla"}
                """
                .formatted(fecha == null ? "" : "\"fechaDePago\":\"" + fecha + "\",", orden);
    }

    private static String cobroDeTasas(int cantidad, @Nullable String fecha) {
        return """
                {"caja":"C-01","pagadorDocumento":"12345678","pagadorNombre":"TITULAR, PRUEBA",
                 "formaDePago":"EFECTIVO",%s
                 "conceptos":[{"conceptoTupa":"T-001","cantidad":%d}],
                 "observacion":"Derecho de tramite"}
                """
                .formatted(fecha == null ? "" : "\"fechaDeCobro\":\"" + fecha + "\",", cantidad);
    }

    private static Tasa tasa() {
        return new Tasa(
                3L,
                "T-001",
                "Constancia de no adeudo",
                9L,
                "1.3.1.1.1.1",
                Dinero.de("12.50"),
                LocalDate.of(2026, 1, 1),
                null,
                "TUPA 2026 de la prueba");
    }

    /** Un reloj de Lima que la prueba adelanta, para cruzar la medianoche entre dos peticiones. */
    private static final class RelojQueAvanza extends Clock {

        private Instant ahora;

        RelojQueAvanza(Instant ahora) {
            this.ahora = ahora;
        }

        void avanzarA(Instant despues) {
            this.ahora = despues;
        }

        @Override
        public ZoneId getZone() {
            return ZonaHoraria.DEL_PRODUCTO;
        }

        @Override
        public Clock withZone(ZoneId zona) {
            throw new UnsupportedOperationException(
                    "El reloj de la caja va en la zona del producto");
        }

        @Override
        public Instant instant() {
            return ahora;
        }
    }

    /**
     * Un repositorio que no encuentra nada por la clave: las dos peticiones de la carrera, que
     * miraron antes de que la otra confirmara. Lo demas, el doble de siempre.
     */
    private record ReciboRepositoryCiego(RecibosEnMemoria real) implements ReciboRepository {

        @Override
        public NumeroDeRecibo siguienteNumero(Caja caja) {
            return real.siguienteNumero(caja);
        }

        @Override
        public Recibo emitir(Recibo recibo, @Nullable ClaveDeIdempotencia clave) {
            return real.emitir(recibo, clave);
        }

        @Override
        public Optional<EmitidoConClave> porClaveDeIdempotencia(String clave) {
            return Optional.empty();
        }

        @Override
        public Optional<Recibo> porNumero(NumeroDeRecibo numero) {
            return real.porNumero(numero);
        }

        @Override
        public Pagina<ReciboEnConsulta> buscar(CriterioDeRecibos criterio, Paginacion paginacion) {
            return real.buscar(criterio, paginacion);
        }
    }
}
