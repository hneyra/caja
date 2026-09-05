package kamayuk.caja.nucleo.infraestructura.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneOffset;
import kamayuk.caja.auditoria.RegistroDeAuditoria;
import kamayuk.caja.dominio.Dinero;
import kamayuk.caja.dominio.Observacion;
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
import kamayuk.caja.nucleo.dominio.OrdenDeCobro;
import kamayuk.caja.nucleo.dominio.Pagador;
import kamayuk.caja.nucleo.dominio.SistemaDeOrigen;
import kamayuk.caja.nucleo.dominio.Tasa;
import kamayuk.caja.nucleo.dominio.TipoDeEventoDePago;
import kamayuk.caja.nucleo.infraestructura.ComponedorDeEventosJson;
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
 * #33 — Capa web: se prueba el transporte, no la persistencia —eso lo verifica {@code CajaJdbcTest}
 * contra PostgreSQL real—.
 *
 * <p>Con P5D el cuerpo cambio de forma: donde llevaba obligaciones con su tributo y su ejercicio,
 * ahora lleva <b>identificadores de orden</b>, y donde llevaba un codigo del padron de {@code
 * rentas} —que este borde resolvia antes de cobrar— ya no lleva nada: quien paga viene dentro de la
 * orden, congelado. Se prueban las dos cosas, porque la lista blanca de {@link PeticionDeCobranza}
 * es la frontera por la que un tributo volveria a entrar.
 */
@DisplayName("Capa web — /caja/api/v1/cobros")
class CajaControllerTest {

    private static final LocalDate HOY = LocalDate.of(2026, 3, 15);
    private static final Clock RELOJ =
            Clock.fixed(HOY.atStartOfDay(ZoneOffset.UTC).toInstant(), ZoneOffset.UTC);

    private static final String COBROS = "/caja/api/v1/cobros";
    private static final String TASAS = COBROS + "/tasas";

    private static final SistemaDeOrigen RENTAS = SistemaDeOrigen.de("rentas");
    private static final SistemaDeOrigen MERCADOS = SistemaDeOrigen.de("mercados");
    private static final Pagador PAGADOR = new Pagador("12345678", "TITULAR, PRUEBA", 7L);

    private final CajasEnMemoria cajas =
            new CajasEnMemoria().con(new Caja(1L, "C-01", "Caja tributaria", "001", null, true));
    private final RecibosEnMemoria recibos = new RecibosEnMemoria();
    private final OrdenesEnMemoria ordenes = new OrdenesEnMemoria();
    private final BuzonEnMemoria buzon = new BuzonEnMemoria();
    private final TasasEnMemoria tasas = new TasasEnMemoria();

    private final AbrirCaja abrirCaja =
            new AbrirCaja(
                    cajas, new TurnosEnMemoria(), (RegistroDeAuditoria registro) -> {}, RELOJ);

    private final MockMvc mvc =
            MockMvcBuilders.standaloneSetup(
                            new CajaController(
                                    new CobrarOrdenes(
                                            abrirCaja,
                                            ordenes,
                                            recibos,
                                            buzon,
                                            new ComponedorDeEventosJson(new JsonMapper()),
                                            (RegistroDeAuditoria registro) -> {},
                                            RELOJ),
                                    new CobrarTasa(
                                            abrirCaja,
                                            tasas,
                                            recibos,
                                            (RegistroDeAuditoria registro) -> {},
                                            RELOJ),
                                    RELOJ))
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
    @DisplayName("cobra y devuelve 201 con el recibo, su fecha y el pago en transito")
    void cobraYDevuelve201() throws Exception {
        long orden = sembrarOrden(RENTAS, "PREDIAL-2025-55", Dinero.de("108.40"));

        MvcResult resultado = cobranza(cuerpoDeCobranza(orden, "Cobranza en ventanilla"));

        assertThat(resultado.getResponse().getStatus()).isEqualTo(201);
        String cuerpo = resultado.getResponse().getContentAsString();
        assertThat(cuerpo).contains("\"numero\":\"001-0000001\"");
        assertThat(cuerpo)
                .as("toda cifra sale con su fecha (RNF-075, regla 9)")
                .contains("\"actualizadoA\":\"2026-03-15\"");
        assertThat(cuerpo)
                .as(
                        "entre el papel y el asiento hay una ventana, y el cliente tiene derecho a"
                                + " saber que existe sin ir a buscarla (ADR-0026 §3)")
                .contains("\"estadoDelPago\":\"EN_TRANSITO\"")
                .contains(
                        "\"pagoId\":\""
                                + buzon.deTipo(TipoDeEventoDePago.PAGO_REGISTRADO).get(0).eventoId()
                                + "\"");
    }

    @Test
    @DisplayName("sin observacion, 422: no se cobra")
    void sinObservacionRechaza() throws Exception {
        long orden = sembrarOrden(RENTAS, "PREDIAL-2025-55", Dinero.de("100.00"));

        MvcResult resultado = cobranza(cuerpoDeCobranza(orden, ""));

        assertThat(resultado.getResponse().getStatus()).isEqualTo(422);
        assertThat(recibos.emitidos()).isEmpty();
    }

    @Test
    @DisplayName("cobrar la misma orden dos veces, 409: el estado no admite la operacion")
    void elDobleCobroDevuelve409() throws Exception {
        long orden = sembrarOrden(RENTAS, "PREDIAL-2025-55", Dinero.de("100.00"));

        assertThat(cobranza(cuerpoDeCobranza(orden, "Primera")).getResponse().getStatus())
                .isEqualTo(201);
        MvcResult segunda = cobranza(cuerpoDeCobranza(orden, "Segunda"));

        assertThat(segunda.getResponse().getStatus()).isEqualTo(409);
        assertThat(segunda.getResponse().getContentAsString())
                .as("y dice cual de las tres cosas pasa, que se arreglan distinto")
                .contains("ya se cobro con el recibo");
        assertThat(recibos.emitidos()).hasSize(1);
    }

    @Test
    @DisplayName("un importe en el cuerpo se ignora: no hay campo donde ponerlo")
    void unImporteEnElCuerpoNoEntra() throws Exception {
        long orden = sembrarOrden(RENTAS, "PREDIAL-2025-55", Dinero.de("100.00"));

        String conImporte =
                """
                {"caja":"C-01","cajero":"cajero.prueba","formaDePago":"EFECTIVO",
                 "fechaDePago":"2026-03-15","total":"1.00","ordenes":[%d],
                 "observacion":"Intento de poner el importe desde el cliente"}
                """
                        .formatted(orden);

        MvcResult resultado = cobranza(conImporte);

        assertThat(resultado.getResponse().getStatus()).isEqualTo(201);
        assertThat(recibos.emitidos())
                .singleElement()
                .satisfies(
                        recibo ->
                                assertThat(recibo.total())
                                        .as("se cobra lo que la orden dice, no lo que el cliente")
                                        .isEqualTo(Dinero.de("100.00")));
    }

    @Test
    @DisplayName("un tributo en el cuerpo tampoco entra: la caja no sabe que es un tributo")
    void unTributoEnElCuerpoNoEntra() throws Exception {
        long orden = sembrarOrden(RENTAS, "PREDIAL-2025-55", Dinero.de("100.00"));

        String conTributo =
                """
                {"caja":"C-01","cajero":"cajero.prueba","formaDePago":"EFECTIVO",
                 "fechaDePago":"2026-03-15","ordenes":[%d],
                 "obligaciones":[{"tributo":"PREDIAL","ejercicio":2025,"predioId":55}],
                 "observacion":"Cuerpo del cliente anterior a la separacion"}
                """
                        .formatted(orden);

        assertThat(cobranza(conTributo).getResponse().getStatus()).isEqualTo(201);
        assertThat(recibos.emitidos())
                .singleElement()
                .satisfies(
                        recibo ->
                                assertThat(recibo.lineas())
                                        .singleElement()
                                        .satisfies(
                                                linea -> {
                                                    assertThat(linea.tributo())
                                                            .as(
                                                                    "la linea nombra el SISTEMA de"
                                                                            + " origen, no un tributo")
                                                            .isEqualTo("RENTAS");
                                                    assertThat(linea.ejercicio()).isNull();
                                                    assertThat(linea.predioId()).isNull();
                                                }));
    }

    @Test
    @DisplayName("sin ordenes marcadas, 422 nombrando el campo")
    void sinOrdenesRechaza() throws Exception {
        String sinOrdenes =
                """
                {"caja":"C-01","cajero":"cajero.prueba","formaDePago":"EFECTIVO",
                 "fechaDePago":"2026-03-15","ordenes":[],
                 "observacion":"Cobranza sin nada marcado"}
                """;

        MvcResult resultado = cobranza(sinOrdenes);

        assertThat(resultado.getResponse().getStatus()).isEqualTo(422);
        assertThat(resultado.getResponse().getContentAsString()).contains("'ordenes'");
        assertThat(recibos.emitidos()).isEmpty();
    }

    @Test
    @DisplayName("una orden que no esta en esta base, 404 y no «no se puede cobrar»")
    void unaOrdenInexistenteDevuelve404() throws Exception {
        MvcResult resultado = cobranza(cuerpoDeCobranza(9999L, "Cobranza en ventanilla"));

        assertThat(resultado.getResponse().getStatus()).isEqualTo(404);
        assertThat(recibos.emitidos()).isEmpty();
    }

    @Test
    @DisplayName("dos sistemas de origen en un solo recibo, 422: se anula entero o no se anula")
    void ordenesDeDosSistemasSeRechazan() throws Exception {
        long deRentas = sembrarOrden(RENTAS, "PREDIAL-2025-55", Dinero.de("100.00"));
        long deMercados = sembrarOrden(MERCADOS, "PUESTO-114-03", Dinero.de("30.00"));

        String cuerpo =
                """
                {"caja":"C-01","cajero":"cajero.prueba","formaDePago":"EFECTIVO",
                 "fechaDePago":"2026-03-15","ordenes":[%d,%d],
                 "observacion":"Todo lo que debe, de una vez"}
                """
                        .formatted(deRentas, deMercados);

        MvcResult resultado = cobranza(cuerpo);

        assertThat(resultado.getResponse().getStatus()).isEqualTo(422);
        assertThat(resultado.getResponse().getContentAsString())
                .contains("un recibo se anula ENTERO");
        assertThat(recibos.emitidos()).isEmpty();
    }

    @Test
    @DisplayName("la cabecera idempotency-key evita el segundo recibo del doble clic")
    void laCabeceraDeIdempotenciaEvitaElSegundoRecibo() throws Exception {
        long orden = sembrarOrden(RENTAS, "PREDIAL-2025-55", Dinero.de("100.00"));

        for (int intento = 0; intento < 2; intento++) {
            MvcResult resultado =
                    mvc.perform(
                                    MockMvcRequestBuilders.post(COBROS)
                                            .header("Idempotency-Key", "una-clave")
                                            .contentType(MediaType.APPLICATION_JSON)
                                            .content(
                                                    cuerpoDeCobranza(
                                                            orden, "Cobranza en ventanilla")))
                            .andReturn();
            assertThat(resultado.getResponse().getStatus()).isEqualTo(201);
        }

        assertThat(recibos.emitidos()).hasSize(1);
        assertThat(buzon.deTipo(TipoDeEventoDePago.PAGO_REGISTRADO))
                .as("y un solo evento: dos serian dos pagos para el sistema de origen")
                .hasSize(1);
    }

    @Test
    @DisplayName("una caja que no existe, 404")
    void unaCajaInexistenteDevuelve404() throws Exception {
        long orden = sembrarOrden(RENTAS, "PREDIAL-2025-55", Dinero.de("100.00"));

        String cuerpo =
                """
                {"caja":"NO-EXISTE","cajero":"cajero.prueba","formaDePago":"EFECTIVO",
                 "fechaDePago":"2026-03-15","ordenes":[%d],
                 "observacion":"Cobranza en ventanilla"}
                """
                        .formatted(orden);

        assertThat(cobranza(cuerpo).getResponse().getStatus()).isEqualTo(404);
    }

    @Test
    @DisplayName("caja de tasas: 201 con el importe que sale de la tabla")
    void cobraTasasYDevuelve201() throws Exception {
        tasas.con(unaTasa());

        String cuerpo =
                """
                {"caja":"C-01","cajero":"cajero.prueba","pagadorDocumento":"12345678",
                 "pagadorNombre":"TITULAR, PRUEBA","formaDePago":"EFECTIVO",
                 "fechaDeCobro":"2026-03-15",
                 "conceptos":[{"conceptoTupa":"T-001","cantidad":2}],
                 "observacion":"Derecho de tramite"}
                """;

        MvcResult resultado = tasas(cuerpo);

        assertThat(resultado.getResponse().getStatus()).isEqualTo(201);
        assertThat(recibos.emitidos())
                .singleElement()
                .satisfies(recibo -> assertThat(recibo.total()).isEqualTo(Dinero.de("25.00")));
        assertThat(buzon.encolados())
                .as("un derecho del TUPA lo emitio la propia caja: no hay a quien avisarle")
                .isEmpty();
    }

    @Test
    @DisplayName("el pagador de la peticion es el que queda congelado en el recibo")
    void elPagadorDeLaPeticionQuedaEnElRecibo() throws Exception {
        tasas.con(unaTasa());

        String cuerpo =
                """
                {"caja":"C-01","cajero":"cajero.prueba","pagadorDocumento":"70123456",
                 "pagadorNombre":"OTRA, PERSONA","pagadorIdExterno":8,
                 "formaDePago":"EFECTIVO","fechaDeCobro":"2026-03-15",
                 "conceptos":[{"conceptoTupa":"T-001","cantidad":1}],
                 "observacion":"Derecho de tramite"}
                """;

        assertThat(tasas(cuerpo).getResponse().getStatus()).isEqualTo(201);
        assertThat(recibos.emitidos())
                .as("no basta con que se acepte: el papel sale a nombre de quien se pidio")
                .singleElement()
                .satisfies(
                        recibo -> {
                            assertThat(recibo.pagador().documento()).isEqualTo("70123456");
                            assertThat(recibo.pagador().nombre()).isEqualTo("OTRA, PERSONA");
                            assertThat(recibo.pagador().idExterno()).isEqualTo(8L);
                        });
    }

    @Test
    @DisplayName("sin pagador se cobra igual: nadie exige documento para pagar una tasa")
    void sinPagadorSeCobraIgual() throws Exception {
        tasas.con(unaTasa());

        String cuerpo =
                """
                {"caja":"C-01","cajero":"cajero.prueba","formaDePago":"EFECTIVO",
                 "fechaDeCobro":"2026-03-15",
                 "conceptos":[{"conceptoTupa":"T-001","cantidad":1}],
                 "observacion":"Derecho de tramite"}
                """;

        assertThat(tasas(cuerpo).getResponse().getStatus()).isEqualTo(201);
        assertThat(recibos.emitidos())
                .singleElement()
                .satisfies(recibo -> assertThat(recibo.pagador().esAnonimo()).isTrue());
    }

    @Test
    @DisplayName("un concepto del TUPA sin tarifa vigente, 404")
    void unConceptoSinTarifaDevuelve404() throws Exception {
        String cuerpo =
                """
                {"caja":"C-01","cajero":"cajero.prueba","formaDePago":"EFECTIVO",
                 "fechaDeCobro":"2026-03-15",
                 "conceptos":[{"conceptoTupa":"T-999","cantidad":1}],
                 "observacion":"Derecho de tramite"}
                """;

        assertThat(tasas(cuerpo).getResponse().getStatus()).isEqualTo(404);
        assertThat(recibos.emitidos()).isEmpty();
    }

    // ------------------------------------------------------------------

    private long sembrarOrden(SistemaDeOrigen sistema, String referencia, Dinero importe) {
        return ordenes.con(
                        OrdenDeCobro.nueva(
                                sistema,
                                referencia,
                                "IMPUESTO PREDIAL 2025",
                                null,
                                importe,
                                HOY,
                                HOY,
                                PAGADOR,
                                HOY.atStartOfDay(ZoneOffset.UTC).toInstant(),
                                Observacion.de("Orden emitida por el sistema de origen")))
                .idGuardado();
    }

    private MvcResult cobranza(String cuerpo) throws Exception {
        return mvc.perform(
                        MockMvcRequestBuilders.post(COBROS)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(cuerpo))
                .andReturn();
    }

    private MvcResult tasas(String cuerpo) throws Exception {
        return mvc.perform(
                        MockMvcRequestBuilders.post(TASAS)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(cuerpo))
                .andReturn();
    }

    /** La tasa del TUPA con la que cobran las pruebas de la ventanilla de tasas. */
    private static Tasa unaTasa() {
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

    private static String cuerpoDeCobranza(long orden, String observacion) {
        return """
                {"caja":"C-01","cajero":"cajero.prueba","formaDePago":"EFECTIVO",
                 "fechaDePago":"2026-03-15","ordenes":[%d],
                 "observacion":"%s"}
                """
                .formatted(orden, observacion);
    }
}
