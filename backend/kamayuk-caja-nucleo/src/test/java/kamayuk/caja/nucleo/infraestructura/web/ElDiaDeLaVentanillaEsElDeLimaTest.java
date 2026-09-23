package kamayuk.caja.nucleo.infraestructura.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import kamayuk.caja.auditoria.Origen;
import kamayuk.caja.auditoria.OrigenContext;
import kamayuk.caja.auditoria.RegistroDeAuditoria;
import kamayuk.caja.dominio.Dinero;
import kamayuk.caja.dominio.Observacion;
import kamayuk.caja.dominio.ZonaHoraria;
import kamayuk.caja.nucleo.TasaCobrada;
import kamayuk.caja.nucleo.aplicacion.AbrirCaja;
import kamayuk.caja.nucleo.aplicacion.AnularRecibo;
import kamayuk.caja.nucleo.aplicacion.CobrarOrdenes;
import kamayuk.caja.nucleo.aplicacion.CobrarTasa;
import kamayuk.caja.nucleo.aplicacion.CobrosDeTasasTesoreria;
import kamayuk.caja.nucleo.dobles.BuzonEnMemoria;
import kamayuk.caja.nucleo.dobles.CajasEnMemoria;
import kamayuk.caja.nucleo.dobles.MovimientosEnMemoria;
import kamayuk.caja.nucleo.dobles.OrdenesEnMemoria;
import kamayuk.caja.nucleo.dobles.RecaudacionEnMemoria;
import kamayuk.caja.nucleo.dobles.RecibosEnMemoria;
import kamayuk.caja.nucleo.dobles.TasasEnMemoria;
import kamayuk.caja.nucleo.dobles.TurnosEnMemoria;
import kamayuk.caja.nucleo.dominio.Caja;
import kamayuk.caja.nucleo.dominio.FormaDePago;
import kamayuk.caja.nucleo.dominio.LineaDeTasaPedida;
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
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.JacksonJsonHttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import tools.jackson.databind.json.JsonMapper;

/**
 * #112 — El dia de la ventanilla es el de la municipalidad, tambien despues de las 19:00.
 *
 * <p>Hasta #112 el {@code @Bean Clock} era {@code Clock.systemDefaultZone()}, y el contenedor corre
 * en UTC: a las 19:00 de Lima ya es medianoche en Greenwich, y todo {@code LocalDate.now(reloj)}
 * pasaba al dia siguiente. Que el bean lleve {@link ZonaHoraria#DEL_PRODUCTO} lo prueba {@code
 * ElDiaDelRelojEsElDelProductoTest} en {@code kamayuk-caja-aplicacion}; esto prueba, con ese mismo
 * reloj fijado, <b>lo que el cajero ve</b>: a las 19:30 del 23 el cobro sin fecha va al turno del
 * 23, un recibo de la tarde se anula esa misma noche, y la constancia de una tasa cobrada a esa
 * hora dice 23.
 *
 * <p>Los instantes se escriben en UTC a proposito —la zona del producto se nombra en {@link
 * ZonaHoraria} y en ningun otro sitio—, y cada prueba comprueba primero la premisa de que en UTC ya
 * es el 24: una muestra a mediodia saldria verde con el defecto dentro.
 *
 * <p><b>Como se vio el rojo.</b> Con {@link #ZONA_DEL_RELOJ} en {@code ZoneOffset.UTC} —la zona que
 * {@code Clock.systemDefaultZone()} le daba al reloj en el contenedor— las tres pruebas caen: el
 * cobro abre un turno del 24, la anulacion sale con {@code FueraDelDiaDePago} y la constancia dice
 * 24. La tercera cae tambien con la zona buena mientras {@code CobrosDeTasasTesoreria} trunque con
 * {@code ZoneOffset.UTC}, porque no lee el reloj.
 */
@DisplayName("#112 — El dia de la ventanilla es el de Lima, tambien despues de las 19:00")
class ElDiaDeLaVentanillaEsElDeLimaTest {

    /** La zona del reloj de produccion. La ata al bean {@code ElDiaDelRelojEsElDelProductoTest}. */
    private static final ZoneId ZONA_DEL_RELOJ = ZonaHoraria.DEL_PRODUCTO;

    /** Las 19:30 del miercoles 23 en Lima; en UTC ya son las 00:30 del jueves 24. */
    private static final Clock LAS_SIETE_Y_MEDIA =
            Clock.fixed(Instant.parse("2026-09-24T00:30:00Z"), ZONA_DEL_RELOJ);

    /** Las 15:00 del mismo miercoles, cuando las dos zonas todavia coinciden en el dia. */
    private static final Clock LAS_TRES_DE_LA_TARDE =
            Clock.fixed(Instant.parse("2026-09-23T20:00:00Z"), ZONA_DEL_RELOJ);

    private static final LocalDate EL_23 = LocalDate.of(2026, 9, 23);

    private static final String COBROS = "/caja/api/v1/cobros";
    private static final String CAJERO = "cajero.noche";
    private static final long TURNO_DEL_23 = 23L;
    private static final SistemaDeOrigen RENTAS = SistemaDeOrigen.de("rentas");
    private static final Pagador PAGADOR = new Pagador("12345678", "TITULAR, PRUEBA", 7L);

    private final CajasEnMemoria cajas =
            new CajasEnMemoria().con(new Caja(1L, "C-01", "Caja tributaria", "001", null, true));
    private final TurnosEnMemoria turnos =
            new TurnosEnMemoria().conTurnoAbierto(TURNO_DEL_23, 1L, CAJERO, EL_23);
    private final RecibosEnMemoria recibos = new RecibosEnMemoria();
    private final OrdenesEnMemoria ordenes = new OrdenesEnMemoria();
    private final MovimientosEnMemoria movimientos = new MovimientosEnMemoria();
    private final BuzonEnMemoria buzon = new BuzonEnMemoria();
    private final TasasEnMemoria tasas = new TasasEnMemoria();

    private static final CobrarOrdenes.ComponedorDeEventos EVENTOS =
            new ComponedorDeEventosJson(new JsonMapper());

    /** El cajero sale del token desde #114. */
    @BeforeEach
    void fijarElToken() {
        OrigenContext.fijar(new Origen(CAJERO, null, null));
    }

    @AfterEach
    void limpiarElToken() {
        OrigenContext.limpiar();
    }

    @Test
    @DisplayName("a las 19:30 el cobro sin fecha va al turno abierto del 23, no abre uno del 24")
    void elCobroNocturnoVaAlTurnoDelDia() throws Exception {
        assertThat(LocalDate.ofInstant(LAS_SIETE_Y_MEDIA.instant(), ZoneOffset.UTC))
                .as("la premisa: en UTC este instante ya es el 24")
                .isEqualTo(EL_23.plusDays(1));
        long orden = sembrarOrden("NOCHE-1");

        MvcResult resultado =
                ventanilla(LAS_SIETE_Y_MEDIA)
                        .perform(
                                MockMvcRequestBuilders.post(COBROS)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(
                                                """
                                                {"caja":"C-01","cajero":"%s",
                                                 "formaDePago":"EFECTIVO","ordenes":[%d],
                                                 "observacion":"Cobro nocturno, prueba de #112"}
                                                """
                                                        .formatted(CAJERO, orden)))
                        .andReturn();

        assertThat(resultado.getResponse().getStatus())
                .as(resultado.getResponse().getContentAsString())
                .isEqualTo(201);
        assertThat(recibos.emitidos())
                .singleElement()
                .extracting(Recibo::turnoId)
                .as("sin fechaDePago, el dia es el del reloj: el 23 de Lima y su turno abierto")
                .isEqualTo(TURNO_DEL_23);
        assertThat(turnos.cuantos())
                .as("y no se abrio un turno del 24, que el cajero no ve ni va a cerrar esta noche")
                .isEqualTo(1);
        assertThat(resultado.getResponse().getContentAsString())
                .as("la cifra del recibo dice su fecha, y es el 23 (regla 9)")
                .contains("\"actualizadoA\":\"2026-09-23\"");
    }

    @Test
    @DisplayName("un recibo de las 15:00 del 23 se anula a las 19:30 del 23: es el mismo dia")
    void laAnulacionDeLaMismaNocheSeAdmite() {
        Recibo deLaTarde =
                cobrarOrdenes(LAS_TRES_DE_LA_TARDE)
                        .cobrar(
                                new CobrarOrdenes.Cobranza(
                                        "C-01",
                                        CAJERO,
                                        List.of(sembrarOrden("TARDE-1")),
                                        FormaDePago.EFECTIVO,
                                        EL_23,
                                        null),
                                Observacion.de("Cobro de la tarde, prueba de #112"))
                        .recibo();
        assertThat(deLaTarde.turnoId()).isEqualTo(TURNO_DEL_23);

        AnularRecibo.Anulado anulado =
                new AnularRecibo(
                                recibos,
                                movimientos,
                                turnos,
                                ordenes,
                                buzon,
                                EVENTOS,
                                (RegistroDeAuditoria registro) -> {},
                                LAS_SIETE_Y_MEDIA)
                        .anular(
                                new AnularRecibo.Anulacion(
                                        deLaTarde.numero(),
                                        "ERROR EN EL IMPORTE",
                                        "RESPONSABLE DE TESORERIA",
                                        "MEMO-2026-112"),
                                Observacion.de("Se cobro de mas, prueba de #112"));

        assertThat(anulado.anulacion().fecha())
                .as(
                        "a las 19:30 sigue siendo el dia del pago: con el reloj en UTC esto era"
                                + " FueraDelDiaDePago y el cajero tenia que pedir una devolucion")
                .isEqualTo(EL_23);
    }

    @Test
    @DisplayName("la constancia de una tasa cobrada a las 19:30 del 23 dice 23")
    void laConstanciaDeLaTasaDiceElDiaDeLima() {
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
        Recibo recibo =
                new CobrarTasa(
                                abrirCaja(LAS_SIETE_Y_MEDIA),
                                tasas,
                                recibos,
                                (RegistroDeAuditoria registro) -> {},
                                LAS_SIETE_Y_MEDIA)
                        .cobrar(
                                new CobrarTasa.CobroDeTasas(
                                        "C-01",
                                        CAJERO,
                                        PAGADOR,
                                        List.of(new LineaDeTasaPedida("T-001", 1)),
                                        FormaDePago.EFECTIVO,
                                        EL_23,
                                        null),
                                Observacion.de("Cobro de tasa nocturno, prueba de #112"));

        TasaCobrada constancia =
                new CobrosDeTasasTesoreria(recibos, movimientos, new RecaudacionEnMemoria())
                        .acreditar(recibo.numero().impreso(), "T-001")
                        .orElseThrow();

        assertThat(constancia.fecha())
                .as(
                        "el instante del recibo es el de las 19:30 de Lima: truncado en UTC, la"
                                + " constancia que pide otro contexto decia 24")
                .isEqualTo(EL_23);
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
                                EL_23,
                                EL_23,
                                PAGADOR,
                                Instant.parse("2026-09-23T13:00:00Z"),
                                Observacion.de("Orden emitida por el sistema de origen")))
                .idGuardado();
    }

    private AbrirCaja abrirCaja(Clock reloj) {
        return new AbrirCaja(cajas, turnos, (RegistroDeAuditoria registro) -> {}, reloj);
    }

    private CobrarOrdenes cobrarOrdenes(Clock reloj) {
        return new CobrarOrdenes(
                abrirCaja(reloj),
                ordenes,
                recibos,
                buzon,
                EVENTOS,
                (RegistroDeAuditoria registro) -> {},
                reloj);
    }

    private MockMvc ventanilla(Clock reloj) {
        return MockMvcBuilders.standaloneSetup(
                        new CajaController(
                                cobrarOrdenes(reloj),
                                new CobrarTasa(
                                        abrirCaja(reloj),
                                        tasas,
                                        recibos,
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
}
