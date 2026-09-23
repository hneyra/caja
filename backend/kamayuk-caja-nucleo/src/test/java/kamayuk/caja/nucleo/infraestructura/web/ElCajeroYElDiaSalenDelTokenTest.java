package kamayuk.caja.nucleo.infraestructura.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import kamayuk.caja.auditoria.Origen;
import kamayuk.caja.auditoria.OrigenContext;
import kamayuk.caja.auditoria.RegistroDeAuditoria;
import kamayuk.caja.autorizacion.ComprobadorDeAcceso;
import kamayuk.caja.autorizacion.Privilegio;
import kamayuk.caja.dominio.Dinero;
import kamayuk.caja.dominio.Observacion;
import kamayuk.caja.dominio.ZonaHoraria;
import kamayuk.caja.nucleo.aplicacion.AbrirCaja;
import kamayuk.caja.nucleo.aplicacion.ArqueoDeTurno;
import kamayuk.caja.nucleo.aplicacion.CerrarTurno;
import kamayuk.caja.nucleo.aplicacion.CobrarOrdenes;
import kamayuk.caja.nucleo.aplicacion.CobrarTasa;
import kamayuk.caja.nucleo.dobles.BuzonEnMemoria;
import kamayuk.caja.nucleo.dobles.CajasEnMemoria;
import kamayuk.caja.nucleo.dobles.CierresEnMemoria;
import kamayuk.caja.nucleo.dobles.OrdenesEnMemoria;
import kamayuk.caja.nucleo.dobles.RecibosEnMemoria;
import kamayuk.caja.nucleo.dobles.TasasEnMemoria;
import kamayuk.caja.nucleo.dobles.TurnosEnMemoria;
import kamayuk.caja.nucleo.dominio.Caja;
import kamayuk.caja.nucleo.dominio.EstadoDeOrden;
import kamayuk.caja.nucleo.dominio.OrdenDeCobro;
import kamayuk.caja.nucleo.dominio.Pagador;
import kamayuk.caja.nucleo.dominio.Recibo;
import kamayuk.caja.nucleo.dominio.SistemaDeOrigen;
import kamayuk.caja.nucleo.dominio.Tasa;
import kamayuk.caja.nucleo.infraestructura.ComponedorDeEventosJson;
import kamayuk.caja.web.ConfiguracionDeJson;
import kamayuk.caja.web.ManejadorDeErrores;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.JacksonJsonHttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import tools.jackson.databind.json.JsonMapper;

/**
 * #114 — Quien cobra, quien cierra y en que dia lo dice el token, no el cuerpo (ADR-0028).
 *
 * <p>Hasta #114 {@code CajaController} y {@code CierreController} tomaban el {@code cajero} del
 * cuerpo de la peticion y aceptaban cualquier fecha: quien tuviera {@code caja_tributaria}/REGISTRO
 * cobraba en el turno de otro cajero —y el recibo salia a nombre de ese otro, que es el texto con
 * el que la anulacion decide si el recibo es «ajeno»—, cerraba el turno ajeno con su propio
 * declarado, o abria un turno de hace un mes. {@code TurnoController.delDia} ya leia el token:
 * lecturas y escrituras no decian lo mismo.
 *
 * <p>Ahora el cajero sale siempre de {@link OrigenContext}. El campo {@code cajero} sigue en el
 * contrato por compatibilidad, y solo se admite igual al del token: si trae otro nombre, 403 que lo
 * dice —ignorarlo en silencio dejaria al cliente creyendo que cobro por otro—. La fecha de trabajo,
 * si viene, tiene que ser hoy en Lima; si no, 422.
 */
@DisplayName("#114 — El cajero y el dia de trabajo salen del token, no del cuerpo")
class ElCajeroYElDiaSalenDelTokenTest {

    /** Las 15:00 del 23 en Lima; el reloj de produccion lleva la zona del producto (#112). */
    private static final Clock RELOJ =
            Clock.fixed(Instant.parse("2026-09-23T20:00:00Z"), ZonaHoraria.DEL_PRODUCTO);

    private static final LocalDate HOY = LocalDate.of(2026, 9, 23);

    /**
     * Las ordenes son exigibles desde antes de ayer: asi la fecha de ayer no se rechaza por la
     * orden, y el 422 que se mide es el del dia de trabajo y no otro.
     */
    private static final LocalDate EXIGIBLE_DESDE = LocalDate.of(2026, 9, 1);

    /** Quien firma el token. */
    private static final String YO = "jperez";

    /** El otro cajero, con su turno abierto en la misma ventanilla. */
    private static final String OTRO = "mgarcia";

    private static final long CAJA = 1L;
    private static final long TURNO_MIO = 10L;
    private static final long TURNO_DEL_OTRO = 20L;

    private static final SistemaDeOrigen RENTAS = SistemaDeOrigen.de("rentas");
    private static final Pagador PAGADOR = new Pagador("12345678", "TITULAR, PRUEBA", 7L);

    private final CajasEnMemoria cajas =
            new CajasEnMemoria().con(new Caja(CAJA, "C-01", "Caja tributaria", "001", null, true));
    private final TurnosEnMemoria turnos =
            new TurnosEnMemoria()
                    .conTurnoAbierto(TURNO_MIO, CAJA, YO, HOY)
                    .conTurnoAbierto(TURNO_DEL_OTRO, CAJA, OTRO, HOY);
    private final RecibosEnMemoria recibos = new RecibosEnMemoria();
    private final OrdenesEnMemoria ordenes = new OrdenesEnMemoria();
    private final BuzonEnMemoria buzon = new BuzonEnMemoria();
    private final TasasEnMemoria tasas = new TasasEnMemoria();
    private final CierresEnMemoria cierres = new CierresEnMemoria();

    private final ComprobadorDeAcceso loAutorizaTodo =
            new ComprobadorDeAcceso() {

                @Override
                public boolean autoriza(
                        String usuario, String acceso, Privilegio privilegio, LocalDate fecha) {
                    return true;
                }

                @Override
                public boolean conoceAlUsuario(String usuario) {
                    return true;
                }
            };

    private final AbrirCaja abrirCaja =
            new AbrirCaja(cajas, turnos, (RegistroDeAuditoria registro) -> {}, RELOJ);

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
                                    RELOJ),
                            new CierreController(
                                    new CerrarTurno(
                                            cajas,
                                            turnos,
                                            cierres,
                                            new ArqueoDeTurno(cierres, new BuzonEnMemoria()),
                                            (RegistroDeAuditoria registro) -> {},
                                            RELOJ),
                                    loAutorizaTodo,
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

    @BeforeEach
    void fijarElToken() {
        OrigenContext.fijar(new Origen(YO, "PC-CAJA-01", "10.1.1.1"));
    }

    @AfterEach
    void limpiarElToken() {
        OrigenContext.limpiar();
    }

    @Nested
    @DisplayName("POST /cobros")
    class Cobro {

        @Test
        @DisplayName("con el cajero de otro, 403 que lo dice, y no se escribe nada")
        void conElCajeroDeOtroSeRechaza() throws Exception {
            long orden = sembrarOrden("PREDIAL-114-1");

            MvcResult resultado = post("/caja/api/v1/cobros", cobranza(orden, OTRO, null));

            assertThat(resultado.getResponse().getStatus())
                    .as(resultado.getResponse().getContentAsString())
                    .isEqualTo(403);
            assertThat(resultado.getResponse().getContentAsString())
                    .as("dice que el cajero es el del token, y nombra a los dos")
                    .contains(OTRO)
                    .contains(YO);
            assertThat(recibos.emitidos()).as("ni un recibo en el turno ajeno").isEmpty();
            assertThat(buzon.encolados()).as("ni un pago publicado").isEmpty();
            assertThat(ordenes.porId(orden).orElseThrow().estado())
                    .as("y la orden sigue por cobrar")
                    .isEqualTo(EstadoDeOrden.PENDIENTE);
        }

        @Test
        @DisplayName("sin cajero, cobra en SU turno y el recibo sale a su nombre")
        void sinCajeroCobraEnSuTurno() throws Exception {
            long orden = sembrarOrden("PREDIAL-114-2");

            MvcResult resultado = post("/caja/api/v1/cobros", cobranza(orden, null, null));

            assertThat(resultado.getResponse().getStatus())
                    .as(resultado.getResponse().getContentAsString())
                    .isEqualTo(201);
            Recibo recibo = recibos.emitidos().getFirst();
            assertThat(recibo.cajero()).isEqualTo(YO);
            assertThat(recibo.turnoId()).isEqualTo(TURNO_MIO);
            assertThat(turnos.cuantos()).as("y no abrio otro turno").isEqualTo(2);
        }

        @Test
        @DisplayName("con su propio cajero escrito, cobra igual: el contrato no se rompe")
        void conSuPropioCajeroCobra() throws Exception {
            long orden = sembrarOrden("PREDIAL-114-3");

            MvcResult resultado = post("/caja/api/v1/cobros", cobranza(orden, YO, null));

            assertThat(resultado.getResponse().getStatus()).isEqualTo(201);
            assertThat(recibos.emitidos().getFirst().turnoId()).isEqualTo(TURNO_MIO);
        }

        @Test
        @DisplayName("con la fecha de ayer, 422 que lo dice, y no se abre un turno de ayer")
        void conLaFechaDeAyerSeRechaza() throws Exception {
            long orden = sembrarOrden("PREDIAL-114-4");

            MvcResult resultado = post("/caja/api/v1/cobros", cobranza(orden, YO, "2026-09-22"));

            assertThat(resultado.getResponse().getStatus())
                    .as(resultado.getResponse().getContentAsString())
                    .isEqualTo(422);
            assertThat(resultado.getResponse().getContentAsString())
                    .contains("fechaDePago")
                    .contains("2026-09-23");
            assertThat(recibos.emitidos()).isEmpty();
            assertThat(turnos.cuantos()).isEqualTo(2);
        }

        @Test
        @DisplayName("con la fecha de manana, 422 tambien")
        void conLaFechaDeMananaSeRechaza() throws Exception {
            long orden = sembrarOrden("PREDIAL-114-5");

            MvcResult resultado = post("/caja/api/v1/cobros", cobranza(orden, YO, "2026-09-24"));

            assertThat(resultado.getResponse().getStatus()).isEqualTo(422);
            assertThat(recibos.emitidos()).isEmpty();
        }
    }

    @Nested
    @DisplayName("POST /cobros/tasas")
    class CobroDeTasas {

        @BeforeEach
        void sembrarLaTasa() {
            tasas.con(
                    new Tasa(
                            3L,
                            "T-001",
                            "Constancia de no adeudo",
                            9L,
                            "1.3.1.1.1.1",
                            Dinero.de("12.50"),
                            LocalDate.of(2026, 1, 1),
                            null,
                            "TUPA 2026 de la prueba"));
        }

        @Test
        @DisplayName("con el cajero de otro, 403 y ningun recibo")
        void conElCajeroDeOtroSeRechaza() throws Exception {
            MvcResult resultado = post("/caja/api/v1/cobros/tasas", cobroDeTasa(OTRO, null));

            assertThat(resultado.getResponse().getStatus())
                    .as(resultado.getResponse().getContentAsString())
                    .isEqualTo(403);
            assertThat(recibos.emitidos()).isEmpty();
        }

        @Test
        @DisplayName("sin cajero, cobra en su turno")
        void sinCajeroCobraEnSuTurno() throws Exception {
            MvcResult resultado = post("/caja/api/v1/cobros/tasas", cobroDeTasa(null, null));

            assertThat(resultado.getResponse().getStatus())
                    .as(resultado.getResponse().getContentAsString())
                    .isEqualTo(201);
            assertThat(recibos.emitidos().getFirst().cajero()).isEqualTo(YO);
            assertThat(recibos.emitidos().getFirst().turnoId()).isEqualTo(TURNO_MIO);
        }

        @Test
        @DisplayName("con la fecha de ayer, 422")
        void conLaFechaDeAyerSeRechaza() throws Exception {
            MvcResult resultado = post("/caja/api/v1/cobros/tasas", cobroDeTasa(YO, "2026-09-22"));

            assertThat(resultado.getResponse().getStatus()).isEqualTo(422);
            assertThat(resultado.getResponse().getContentAsString()).contains("fechaDeCobro");
            assertThat(recibos.emitidos()).isEmpty();
        }
    }

    @Nested
    @DisplayName("POST /turnos/cierre")
    class Cierre {

        @Test
        @DisplayName("cerrar el turno de otro, 403, y su turno sigue abierto")
        void cerrarElTurnoDeOtroSeRechaza() throws Exception {
            MvcResult resultado = post("/caja/api/v1/turnos/cierre", cierre(OTRO, null, null));

            assertThat(resultado.getResponse().getStatus())
                    .as(resultado.getResponse().getContentAsString())
                    .isEqualTo(403);
            assertThat(cierres.registrados()).as("ni un acta de cierre").isEmpty();
            assertThat(turnos.abierto(CAJA, OTRO, HOY)).isPresent();
        }

        @Test
        @DisplayName("sin cajero, cierra SU turno")
        void sinCajeroCierraSuTurno() throws Exception {
            MvcResult resultado = post("/caja/api/v1/turnos/cierre", cierre(null, null, null));

            assertThat(resultado.getResponse().getStatus())
                    .as(resultado.getResponse().getContentAsString())
                    .isEqualTo(201);
            assertThat(cierres.registrados())
                    .singleElement()
                    .satisfies(acta -> assertThat(acta.turnoId()).isEqualTo(TURNO_MIO));
            assertThat(turnos.abierto(CAJA, OTRO, HOY))
                    .as("y el del otro sigue abierto")
                    .isPresent();
        }

        @Test
        @DisplayName("reversar el cierre de otro, 403, aunque tenga ELIMINACION")
        void reversarElCierreDeOtroSeRechaza() throws Exception {
            OrigenContext.fijar(new Origen(OTRO, "PC-CAJA-02", "10.1.1.2"));
            assertThat(
                            post("/caja/api/v1/turnos/cierre", cierre(OTRO, null, null))
                                    .getResponse()
                                    .getStatus())
                    .as("la premisa: el otro cerro su propio turno")
                    .isEqualTo(201);
            OrigenContext.fijar(new Origen(YO, "PC-CAJA-01", "10.1.1.1"));

            MvcResult resultado =
                    post("/caja/api/v1/turnos/cierre", cierre(OTRO, null, "quedaba gente"));

            assertThat(resultado.getResponse().getStatus())
                    .as(resultado.getResponse().getContentAsString())
                    .isEqualTo(403);
            assertThat(cierres.registrados())
                    .as("ni una reversion: el acta del otro sigue firmada")
                    .hasSize(1);
        }

        @Test
        @DisplayName("con la fecha de ayer, 422, y no se cierra nada")
        void conLaFechaDeAyerSeRechaza() throws Exception {
            turnos.conTurnoAbierto(30L, CAJA, YO, HOY.minusDays(1));

            MvcResult resultado =
                    post("/caja/api/v1/turnos/cierre", cierre(YO, "2026-09-22", null));

            assertThat(resultado.getResponse().getStatus())
                    .as(resultado.getResponse().getContentAsString())
                    .isEqualTo(422);
            assertThat(resultado.getResponse().getContentAsString())
                    .contains("fecha")
                    .contains("2026-09-23");
            assertThat(cierres.registrados()).isEmpty();
        }
    }

    // ------------------------------------------------------------------

    private long sembrarOrden(String referencia) {
        return ordenes.con(
                        OrdenDeCobro.nueva(
                                RENTAS,
                                referencia,
                                "IMPUESTO PREDIAL 2026",
                                null,
                                Dinero.de("100.00"),
                                EXIGIBLE_DESDE,
                                EXIGIBLE_DESDE,
                                PAGADOR,
                                Instant.parse("2026-09-01T13:00:00Z"),
                                Observacion.de("Orden emitida por el sistema de origen")))
                .idGuardado();
    }

    private MvcResult post(String ruta, String cuerpo) throws Exception {
        return mvc.perform(
                        MockMvcRequestBuilders.post(ruta)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(cuerpo))
                .andReturn();
    }

    private static String cobranza(long orden, String cajero, String fecha) {
        return "{\"caja\":\"C-01\","
                + campo("cajero", cajero)
                + campo("fechaDePago", fecha)
                + "\"formaDePago\":\"EFECTIVO\",\"ordenes\":["
                + orden
                + "],\"observacion\":\"Cobro de la prueba de #114\"}";
    }

    private static String cobroDeTasa(String cajero, String fecha) {
        return "{\"caja\":\"C-01\","
                + campo("cajero", cajero)
                + campo("fechaDeCobro", fecha)
                + "\"formaDePago\":\"EFECTIVO\","
                + "\"conceptos\":[{\"conceptoTupa\":\"T-001\",\"cantidad\":1}],"
                + "\"observacion\":\"Tasa de la prueba de #114\"}";
    }

    private static String cierre(String cajero, String fecha, String motivoDeReversion) {
        return "{\"caja\":\"C-01\","
                + campo("cajero", cajero)
                + campo("fecha", fecha)
                + campo("motivoDeReversion", motivoDeReversion)
                + "\"declarado\":{},"
                + "\"observacion\":\"Cierre de la prueba de #114\"}";
    }

    private static String campo(String nombre, String valor) {
        return valor == null ? "" : "\"" + nombre + "\":\"" + valor + "\",";
    }
}
