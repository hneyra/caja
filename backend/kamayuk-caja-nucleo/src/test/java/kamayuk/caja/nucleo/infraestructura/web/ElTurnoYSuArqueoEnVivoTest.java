package kamayuk.caja.nucleo.infraestructura.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneOffset;
import kamayuk.caja.auditoria.Origen;
import kamayuk.caja.auditoria.OrigenContext;
import kamayuk.caja.autorizacion.Privilegio;
import kamayuk.caja.autorizacion.RequiereAcceso;
import kamayuk.caja.dominio.Dinero;
import kamayuk.caja.nucleo.aplicacion.ArqueoDeTurno;
import kamayuk.caja.nucleo.aplicacion.ConsultaDelTurno;
import kamayuk.caja.nucleo.dobles.BuzonEnMemoria;
import kamayuk.caja.nucleo.dobles.CierresEnMemoria;
import kamayuk.caja.nucleo.dobles.TurnosEnMemoria;
import kamayuk.caja.nucleo.dominio.FormaDePago;
import kamayuk.caja.nucleo.dominio.NumeroDeRecibo;
import kamayuk.caja.nucleo.dominio.ReciboDelTurno;
import kamayuk.caja.nucleo.dominio.TipoDePago;
import kamayuk.caja.web.ConfiguracionDeJson;
import kamayuk.caja.web.ManejadorDeErrores;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import tools.jackson.databind.json.JsonMapper;

/**
 * #97 — Capa web: de donde sale el turno de la ventanilla, y que dice un arqueo sin declarar.
 *
 * <p>Aqui se prueba el <b>transporte y las decisiones del borde</b>: que situacion sale en cada
 * caso, que el cajero se lee del contexto de origen y no de la peticion, y que el arqueo en vivo no
 * publica una cifra declarada. El aislamiento por municipalidad y el {@code JOIN} con {@code caja}
 * no se pueden medir con dobles: eso lo hace {@code TurnoDelDiaFronteraTest} contra PostgreSQL.
 */
@DisplayName("#97 — El turno de la ventanilla y su arqueo en vivo")
class ElTurnoYSuArqueoEnVivoTest {

    private static final LocalDate HOY = LocalDate.of(2026, 3, 15);
    private static final Clock RELOJ =
            Clock.fixed(HOY.atStartOfDay(ZoneOffset.UTC).toInstant(), ZoneOffset.UTC);

    private static final String CAJERO = "jperez";
    private static final String OTRO_CAJERO = "mlopez";
    private static final long CAJA_PRINCIPAL = 1L;
    private static final long CAJA_DEL_MERCADO = 2L;
    private static final long TURNO = 10L;

    private final TurnosEnMemoria turnos =
            new TurnosEnMemoria()
                    .conVentanilla(CAJA_PRINCIPAL, "C-01", "CAJA TRIBUTARIA")
                    .conVentanilla(CAJA_DEL_MERCADO, "C-07", "MERCADO CENTRAL");

    /** Un turno que cobro 300,00 en efectivo: lo que el arqueo en vivo tiene que saber sumar. */
    private final CierresEnMemoria cierres =
            new CierresEnMemoria()
                    .conRecibosDelTurno(
                            TURNO,
                            new ReciboDelTurno(
                                    new NumeroDeRecibo("001", 1),
                                    TipoDePago.TASA,
                                    FormaDePago.EFECTIVO,
                                    Dinero.de("300.00"),
                                    Dinero.CERO));

    private final MockMvc mvc =
            MockMvcBuilders.standaloneSetup(
                            new TurnoController(new ConsultaDelTurno(turnos), RELOJ),
                            new EstadoDelCierreController(
                                    new ArqueoDeTurno(cierres, new BuzonEnMemoria()), RELOJ))
                    .setControllerAdvice(new ManejadorDeErrores())
                    .setMessageConverters(
                            new org.springframework.http.converter.json
                                    .JacksonJsonHttpMessageConverter(
                                    JsonMapper.builder()
                                            .addModule(
                                                    new ConfiguracionDeJson()
                                                            .moduloDeObjetosDeValor())
                                            .build()))
                    .build();

    @AfterEach
    void limpiarOrigen() {
        OrigenContext.limpiar();
    }

    // ── AC 1: de la lectura sale el turno abierto de quien pregunta ───────

    @Test
    @DisplayName("AC 1 — el turno abierto sale con su id, su caja, su cajero y su fecha")
    void elTurnoAbiertoSaleEntero() throws Exception {
        turnos.conTurnoAbierto(TURNO, CAJA_PRINCIPAL, CAJERO, HOY);

        String cuerpo = delDia(CAJERO).getResponse().getContentAsString();

        assertThat(cuerpo).contains("\"situacion\":\"ABIERTO\"");
        assertThat(cuerpo)
                .as("los cuatro que la interfaz tendria que inventar si no salieran de aqui")
                .contains("\"turnoId\":10")
                .contains("\"caja\":\"C-01\"")
                .contains("\"cajaNombre\":\"CAJA TRIBUTARIA\"")
                .contains("\"cajero\":\"jperez\"")
                .contains("\"fecha\":\"2026-03-15\"");
        assertThat(cuerpo)
                .as("y el estado de cada turno, derivado de sus movimientos (V32)")
                .contains("\"estadoDelTurno\":\"ABIERTO\"");
    }

    @Test
    @DisplayName("AC 2 — sin turno abierto la respuesta es 200 y lo dice: no es un 404")
    void sinTurnoEsUnDatoYNoUnError() throws Exception {
        MvcResult resultado = delDia(CAJERO);

        assertThat(resultado.getResponse().getStatus())
                .as(
                        "un cajero que todavia no ha cobrado no es un error: la apertura la hace su"
                                + " primera cobranza, asi que a las ocho de la manana TODOS estan asi")
                .isEqualTo(200);
        String cuerpo = resultado.getResponse().getContentAsString();
        assertThat(cuerpo).contains("\"situacion\":\"SIN_ABRIR\"").contains("\"turnos\":[]");
    }

    @Test
    @DisplayName("AC 2 — «ya cerro» no se dice igual que «no abrio»: se arreglan distinto")
    void elCerradoNoSeConfundeConElQueNoAbrio() throws Exception {
        turnos.conTurnoCerrado(CAJA_PRINCIPAL, CAJERO, HOY);

        String cuerpo = delDia(CAJERO).getResponse().getContentAsString();

        assertThat(cuerpo)
                .as(
                        "quien cerro no tiene que abrir otro —cierre_uq no lo permite—: tiene que"
                                + " reversar su cierre, y un «no hay turno» lo mandaria a lo otro")
                .contains("\"situacion\":\"CERRADO\"")
                .contains("\"estadoDelTurno\":\"CERRADO\"");
    }

    @Test
    @DisplayName("con turno abierto en dos ventanillas, no se elige una: se dice que son varias")
    void conDosAbiertosNoSeEligeNinguno() throws Exception {
        turnos.conTurnoAbierto(TURNO, CAJA_PRINCIPAL, CAJERO, HOY)
                .conTurnoAbierto(11L, CAJA_DEL_MERCADO, CAJERO, HOY);

        String cuerpo = delDia(CAJERO).getResponse().getContentAsString();

        assertThat(cuerpo)
                .as(
                        "cierre_uq es por (caja, cajero, FECHA): dos ventanillas el mismo dia es"
                                + " legal, y arquear «la primera» seria arquear una por otra")
                .contains("\"situacion\":\"VARIOS_ABIERTOS\"");
        assertThat(cuerpo)
                .as("y los dos viajan, por codigo de caja, para que se pueda elegir con nombre")
                .contains("\"caja\":\"C-01\"")
                .contains("\"caja\":\"C-07\"");
        assertThat(cuerpo.indexOf("C-01")).isLessThan(cuerpo.indexOf("C-07"));
    }

    // ── El cajero sale del token, jamas de la peticion ────────────────────

    @Test
    @DisplayName("el cajero es el del contexto de origen: otro usuario recibe SUS turnos")
    void elCajeroSaleDelContextoDeOrigen() throws Exception {
        turnos.conTurnoAbierto(TURNO, CAJA_PRINCIPAL, CAJERO, HOY);

        String delOtro = delDia(OTRO_CAJERO).getResponse().getContentAsString();

        assertThat(delOtro)
                .as(
                        "si el cajero viniera de la peticion, cualquiera veria el arqueo de otro"
                                + " escribiendo su nombre (regla 2, ADR-0028)")
                .contains("\"cajero\":\"mlopez\"")
                .contains("\"situacion\":\"SIN_ABRIR\"")
                .doesNotContain("jperez");
    }

    @Test
    @DisplayName("la lectura no declara NINGUN parametro: ni cajero, ni caja, ni fecha")
    void noDeclaraNingunParametro() throws Exception {
        // Desde #539 un parametro declarado que ningun argumento reclama se contesta con 422
        // nombrandolo. Con cero argumentos, los tres se rechazan en vez de ignorarse — y anadir
        // uno obliga a pasar por esta prueba y por el javadoc que dice por que no lo hay.
        assertThat(TurnoController.class.getMethod("delDia").getParameterCount()).isZero();
    }

    @Test
    @DisplayName("pide LECTURA sobre cierre_caja: el mismo acceso que su arqueo")
    void pideLecturaSobreCierreDeCaja() throws Exception {
        RequiereAcceso requisito =
                TurnoController.class.getMethod("delDia").getAnnotation(RequiereAcceso.class);

        assertThat(requisito).isNotNull();
        assertThat(requisito.acceso())
                .as(
                        "otro acceso partiria la pantalla en dos permisos: el que ve su turno y el"
                                + " que lo arquea. La regla de ArchUnit ve la anotacion, no cual")
                .isEqualTo("cierre_caja");
        assertThat(requisito.privilegio())
                .as("preguntar por el propio turno no abre nada ni cobra nada")
                .isEqualTo(Privilegio.LECTURA);
    }

    // ── AC 4: el arqueo en vivo no declara nada, y lo dice ────────────────

    @Test
    @DisplayName("AC 4 — el arqueo en vivo manda declarado, diferencia y cuadra NULOS")
    void elArqueoEnVivoNoInventaUnDeclarado() throws Exception {
        OrigenContext.fijar(new Origen(CAJERO, null, null));

        MvcResult resultado =
                mvc.perform(MockMvcRequestBuilders.get("/caja/api/v1/turnos/10/cierre"))
                        .andReturn();

        assertThat(resultado.getResponse().getStatus()).isEqualTo(200);
        String cuerpo = resultado.getResponse().getContentAsString();
        assertThat(cuerpo)
                .as("lo que SI se sabe sale con su cifra y su fecha (regla 9)")
                .contains("\"neto\":{\"importe\":\"300.00\",\"actualizadoA\":\"2026-03-15\"}");
        assertThat(cuerpo)
                .as(
                        "un GET no lleva el recuento del cajon: hasta #97 esto decia declarado"
                                + " 0,00, diferencia -300,00 y cuadra false, y la pantalla lo pintaba"
                                + " como tres cifras reales")
                .contains("\"declarado\":null")
                .contains("\"diferencia\":null")
                .contains("\"cuadra\":null");
        assertThat(cuerpo)
                .as("y tampoco en el desglose por forma de pago, que son dos columnas mas")
                .doesNotContain("\"declarado\":{")
                .doesNotContain("\"diferencia\":{");
    }

    // ------------------------------------------------------------------

    private MvcResult delDia(String cajero) throws Exception {
        OrigenContext.limpiar();
        OrigenContext.fijar(new Origen(cajero, null, null));
        return mvc.perform(MockMvcRequestBuilders.get("/caja/api/v1/turnos/del-dia")).andReturn();
    }
}
