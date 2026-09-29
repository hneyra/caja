package kamayuk.caja.nucleo.infraestructura.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import java.io.IOException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import kamayuk.caja.auditoria.Origen;
import kamayuk.caja.auditoria.OrigenContext;
import kamayuk.caja.compartido.TenantContext;
import kamayuk.caja.dominio.MunicipalidadId;
import kamayuk.caja.esquema.BaseDeDatosDePrueba;
import kamayuk.caja.esquema.ContextoDeTenant;
import kamayuk.caja.nucleo.aplicacion.ArqueoDeTurno;
import kamayuk.caja.nucleo.aplicacion.ConsultaDelTurno;
import kamayuk.caja.nucleo.infraestructura.BuzonDeSalidaJdbc;
import kamayuk.caja.nucleo.infraestructura.CierreDeTurnoRepositoryJdbc;
import kamayuk.caja.nucleo.infraestructura.TurnoDeCajaRepositoryJdbc;
import kamayuk.caja.plataforma.tenant.TenantTransactionManager;
import kamayuk.caja.web.ConfiguracionDeJson;
import kamayuk.caja.web.ManejadorDeErrores;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.http.converter.json.JacksonJsonHttpMessageConverter;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import tools.jackson.databind.json.JsonMapper;

/**
 * #148 — «¿Puede cerrar este turno?», de HTTP a PostgreSQL y sin un doble por el camino.
 *
 * <h2>Lo que se midio antes de arreglarlo</h2>
 *
 * <p>{@code GET /turnos/&#123;turnoId&#125;/cierre} no comprobaba que el turno existiera: arqueaba
 * lo que hubiera con ese {@code turnoId} —nada— y, como nada no tiene pagos sin entregar,
 * contestaba <b>200 con arqueo cero y {@code puedeCerrar: true}</b>. Con un numero inventado, con
 * el turno de otra municipalidad —que RLS esconde, asi que tambien «no existe»— y con un turno
 * <b>ya cerrado</b>, que es lo que el issue sospechaba leyendo el metodo y esta clase midio.
 *
 * <h2>Por que va hasta la base</h2>
 *
 * <p>Dos de las cuatro respuestas <b>solo existen en PostgreSQL</b>: el turno de la vecina «no
 * existe» porque la politica RLS lo esconde con el {@code SET LOCAL} de la transaccion, y un turno
 * esta cerrado porque su ultimo movimiento en {@code cierre_turno} lo cierra (V32), no por una
 * columna. Con dobles, las dos serian una asercion sobre el doble.
 *
 * <p>La conexion es la de {@code kamayuk_app} (lo fija {@link #seConectaComoKamayukApp}), y el
 * controlador va envuelto en el proxy que obedece a su {@code @Transactional(readOnly = true)},
 * como en el contenedor: es esa anotacion la que abre la transaccion en la que el arqueo lee.
 */
@DisplayName("#148 — El estado del cierre de un turno, de HTTP a PostgreSQL")
class EstadoDelCierreFronteraTest {

    private static final LocalDate HOY = LocalDate.of(2026, 3, 15);

    private static final Clock RELOJ =
            Clock.fixed(HOY.atStartOfDay(ZoneOffset.UTC).toInstant(), ZoneOffset.UTC);

    /**
     * El mismo nombre de cajero en las dos municipalidades, como en {@code
     * TurnoDelDiaFronteraTest}.
     */
    private static final String CAJERO = "jperez";

    private static final String LA_QUE_CERRO = "mlopez";
    private static final String LA_QUE_REABRIO = "rquispe";

    /**
     * Un {@code turnoId} que no es de nadie. La identidad de {@code cierre_caja} es una sola para
     * todo el cluster y esta base es nueva: aqui no se llega a tantos.
     */
    private static final long TURNO_QUE_NO_EXISTE = 999_999L;

    private static BaseDeDatosDePrueba base;
    private static long municipalidadA;
    private static long turnoAbiertoDeA;
    private static long turnoCerradoDeA;
    private static long turnoReabiertoDeA;
    private static long turnoAbiertoDeB;
    private static JdbcClient jdbc;
    private static ConsultaDelTurno consulta;
    private static MockMvc mvc;

    @BeforeAll
    static void provisionar() throws SQLException, IOException {
        base = BaseDeDatosDePrueba.provisionar();
        municipalidadA = crearMunicipalidad("241311", "Municipalidad que cierra su caja");
        long municipalidadB = crearMunicipalidad("241312", "Municipalidad vecina");

        long principalA = sembrarCaja(municipalidadA, "C-01", "CAJA TRIBUTARIA", "001");
        turnoAbiertoDeA = sembrarTurno(municipalidadA, principalA, CAJERO);

        turnoCerradoDeA = sembrarTurno(municipalidadA, principalA, LA_QUE_CERRO);
        registrarCierre(municipalidadA, turnoCerradoDeA);

        // Cerrado y reversado: el estado sale del ULTIMO movimiento (V32), asi que vuelve a
        // estar abierto aunque tenga un acta. Un «tiene un cierre, luego esta cerrado» lo
        // contestaria con 409 y dejaria sin arqueo al cajero al que se le reabrio la caja.
        turnoReabiertoDeA = sembrarTurno(municipalidadA, principalA, LA_QUE_REABRIO);
        long acta = registrarCierre(municipalidadA, turnoReabiertoDeA);
        registrarReversion(municipalidadA, turnoReabiertoDeA, acta);

        long principalB =
                sembrarCaja(municipalidadB, "C-01", "VENTANILLA UNICA DE LA VECINA", "001");
        turnoAbiertoDeB = sembrarTurno(municipalidadB, principalB, CAJERO);

        DriverManagerDataSource pool = new DriverManagerDataSource();
        pool.setUrl(base.url());
        pool.setUsername(BaseDeDatosDePrueba.APP);
        pool.setPassword(base.clave(BaseDeDatosDePrueba.APP));

        jdbc = JdbcClient.create(pool);
        TenantTransactionManager gestor = new TenantTransactionManager(pool);
        consulta = envolver(new ConsultaDelTurno(new TurnoDeCajaRepositoryJdbc(jdbc)), gestor);
        EstadoDelCierreController controlador =
                envolver(
                        new EstadoDelCierreController(
                                new ArqueoDeTurno(
                                        new CierreDeTurnoRepositoryJdbc(jdbc),
                                        new BuzonDeSalidaJdbc(jdbc)),
                                consulta,
                                RELOJ),
                        gestor);

        mvc =
                MockMvcBuilders.standaloneSetup(controlador)
                        .setControllerAdvice(new ManejadorDeErrores())
                        .setMessageConverters(
                                new JacksonJsonHttpMessageConverter(
                                        JsonMapper.builder()
                                                .addModule(
                                                        new ConfiguracionDeJson()
                                                                .moduloDeObjetosDeValor())
                                                .build()))
                        .build();
    }

    @AfterAll
    static void cerrar() {
        if (base != null) {
            base.close();
        }
    }

    @BeforeEach
    void contexto() {
        TenantContext.fijar(new MunicipalidadId(municipalidadA));
        OrigenContext.fijar(new Origen(CAJERO, null, null));
    }

    @AfterEach
    void limpiar() {
        TenantContext.limpiar();
        OrigenContext.limpiar();
    }

    // ------------------------------------------------------------------

    @Test
    @DisplayName("el turno abierto de esta municipalidad: 200, su arqueo y si puede cerrar")
    void elTurnoAbiertoContesta() throws Exception {
        MvcResult resultado = cierre(turnoAbiertoDeA);

        assertThat(resultado.getResponse().getStatus())
                .as(
                        "sin la transaccion del controlador no hay SET LOCAL, y la politica RLS no"
                                + " devuelve vacio: revienta, y esto seria 500 (#486)")
                .isEqualTo(200);
        assertThat(resultado.getResponse().getContentAsString())
                .contains("\"turnoId\":" + turnoAbiertoDeA)
                .contains("\"puedeCerrar\":true");
    }

    @Test
    @DisplayName("AC 1 — un turno que no existe: 404 con el cuerpo de las demas lecturas")
    void unTurnoQueNoExisteEs404() throws Exception {
        MvcResult resultado = cierre(TURNO_QUE_NO_EXISTE);

        assertThat(resultado.getResponse().getStatus())
                .as(
                        "hasta #148 esto contestaba 200 con el arqueo en cero y «puede cerrar»: un"
                                + " turno que no existe no tiene pagos sin entregar, y nadie"
                                + " preguntaba si existia")
                .isEqualTo(404);
        String cuerpo = resultado.getResponse().getContentAsString();
        assertThat(cuerpo)
                .as("el mismo problema que el recibo que no esta: el codigo al que reacciona la UI")
                .contains("\"codigo\":\"NO_ENCONTRADO\"")
                .contains("\"type\":\"https://kamayuk.gob.pe/errores/no_encontrado\"")
                .contains("\"status\":404");
        assertThat(cuerpo).doesNotContain("puedeCerrar").doesNotContain("arqueo");
    }

    @Test
    @DisplayName("AC 1 (aislamiento) — el turno de la vecina es 404, igual que uno inventado")
    void elTurnoDeOtraMunicipalidadNoExisteAqui() throws Exception {
        MvcResult delDeLaVecina = cierre(turnoAbiertoDeB);
        MvcResult delInventado = cierre(TURNO_QUE_NO_EXISTE);

        assertThat(delDeLaVecina.getResponse().getStatus())
                .as(
                        "RLS esconde el turno de B, asi que para A no existe: hasta #148 salia 200"
                                + " con «puede cerrar» sobre un turno que no es suyo")
                .isEqualTo(404);
        assertThat(sinElNumero(delDeLaVecina, turnoAbiertoDeB))
                .as(
                        "y dice EXACTAMENTE lo mismo que uno inventado, salvo el numero que se"
                                + " pidio: un 404 distinto seria un detector de turnos ajenos")
                .isEqualTo(sinElNumero(delInventado, TURNO_QUE_NO_EXISTE));
    }

    @Test
    @DisplayName("AC 2 — un turno ya cerrado: 409, lo mismo que contesta cerrarlo otra vez")
    void unTurnoCerradoEs409() throws Exception {
        MvcResult resultado = cierre(turnoCerradoDeA);

        assertThat(resultado.getResponse().getStatus())
                .as(
                        "medido en #148: sin la comprobacion, un turno con su acta firmada"
                                + " contestaba 200 y «puedeCerrar»: true, que es justo lo contrario")
                .isEqualTo(409);
        String cuerpo = resultado.getResponse().getContentAsString();
        assertThat(cuerpo)
                .contains("\"codigo\":\"CONFLICTO\"")
                .contains("ya esta cerrado")
                .doesNotContain("\"puedeCerrar\"");
    }

    @Test
    @DisplayName("AC 2 — cerrado y reversado vuelve a estar abierto: 200, no 409")
    void unTurnoReabiertoContesta() throws Exception {
        MvcResult resultado = cierre(turnoReabiertoDeA);

        assertThat(resultado.getResponse().getStatus())
                .as(
                        "el estado sale del ULTIMO movimiento de cierre_turno (V32): con un"
                                + " «tiene algun cierre» el cajero al que se le reabrio la caja no"
                                + " podria volver a preguntar")
                .isEqualTo(200);
        assertThat(resultado.getResponse().getContentAsString()).contains("\"puedeCerrar\":true");
    }

    @Test
    @DisplayName("ConsultaDelTurno.porId lee con su propia transaccion, sin la del controlador")
    void laConsultaDelTurnoSeSostieneSola() {
        assertThat(consulta.porId(turnoCerradoDeA))
                .as(
                        "un caso de uso de lectura no puede depender de que quien lo llame ya"
                                + " haya abierto la transaccion: sin su @Transactional no hay SET"
                                + " LOCAL, y la politica RLS revienta en vez de devolver vacio (#486)")
                .hasValueSatisfying(turno -> assertThat(turno.estaAbierto()).isFalse());
        assertThat(consulta.porId(turnoAbiertoDeB))
                .as("y el de la vecina no existe para A: lo esconde RLS, no un WHERE")
                .isEmpty();
    }

    @Test
    @DisplayName("el centinela: la prueba se conecta como kamayuk_app y no como otra cosa")
    void seConectaComoKamayukApp() {
        assertThat(jdbc.sql("SELECT current_user").query(String.class).single())
                .as(
                        "con superusuario RLS se omite —incluso con FORCE ROW LEVEL SECURITY— y"
                                + " el turno de la vecina se veria: el 404 de aislamiento no"
                                + " mediria nada")
                .isEqualTo(BaseDeDatosDePrueba.APP);
    }

    // ------------------------------------------------------------------

    private static MvcResult cierre(long turnoId) throws Exception {
        return mvc.perform(get("/caja/api/v1/turnos/" + turnoId + "/cierre")).andReturn();
    }

    /**
     * El cuerpo con el numero pedido cambiado por {@code N}, como palabra entera: el turno de la
     * vecina puede llamarse {@code 4}, y un {@code replace} a secas convertiria el {@code 404} del
     * estado en {@code N0N} —medido—.
     */
    private static String sinElNumero(MvcResult resultado, long turnoId) throws Exception {
        return resultado
                .getResponse()
                .getContentAsString()
                .replaceAll("\\b" + turnoId + "\\b", "N");
    }

    private static long crearMunicipalidad(String ubigeo, String nombre) throws SQLException {
        try (Connection owner = base.conexion(BaseDeDatosDePrueba.OWNER);
                PreparedStatement sentencia =
                        owner.prepareStatement(
                                "INSERT INTO municipalidad (ubigeo, nombre, tipo)"
                                        + " VALUES (?, ?, 'DISTRITAL') RETURNING id")) {
            sentencia.setString(1, ubigeo);
            sentencia.setString(2, nombre);
            try (ResultSet resultado = sentencia.executeQuery()) {
                resultado.next();
                long id = resultado.getLong(1);
                owner.commit();
                return id;
            }
        }
    }

    private static long sembrarCaja(
            long municipalidadId, String codigo, String nombre, String serie) throws SQLException {
        try (Connection app = base.conexion(BaseDeDatosDePrueba.APP)) {
            ContextoDeTenant.fijar(app, municipalidadId);
            try (PreparedStatement sentencia =
                    app.prepareStatement(
                            "INSERT INTO caja (municipalidad_id, codigo, nombre, serie, activa)"
                                    + " VALUES (?, ?, ?, ?, true) RETURNING id")) {
                sentencia.setLong(1, municipalidadId);
                sentencia.setString(2, codigo);
                sentencia.setString(3, nombre);
                sentencia.setString(4, serie);
                return devolverId(app, sentencia);
            }
        }
    }

    private static long sembrarTurno(long municipalidadId, long cajaId, String cajero)
            throws SQLException {
        try (Connection app = base.conexion(BaseDeDatosDePrueba.APP)) {
            ContextoDeTenant.fijar(app, municipalidadId);
            try (PreparedStatement sentencia =
                    app.prepareStatement(
                            "INSERT INTO cierre_caja (municipalidad_id, caja_id, cajero, fecha,"
                                    + " fecha_apertura, usuario_apertura, observacion)"
                                    + " VALUES (?, ?, ?, ?, ?, ?, 'apertura de la prueba')"
                                    + " RETURNING id")) {
                sentencia.setLong(1, municipalidadId);
                sentencia.setLong(2, cajaId);
                sentencia.setString(3, cajero);
                sentencia.setObject(4, HOY);
                sentencia.setObject(
                        5,
                        OffsetDateTime.ofInstant(
                                Instant.parse("2026-03-15T13:00:00Z"), ZoneOffset.UTC));
                sentencia.setString(6, cajero);
                return devolverId(app, sentencia);
            }
        }
    }

    /** Un acta de cierre sobre ese turno: lo que hace que su estado se derive CERRADO (V32). */
    private static long registrarCierre(long municipalidadId, long turnoId) throws SQLException {
        try (Connection app = base.conexion(BaseDeDatosDePrueba.APP)) {
            ContextoDeTenant.fijar(app, municipalidadId);
            try (PreparedStatement sentencia =
                    app.prepareStatement(
                            "INSERT INTO cierre_turno (municipalidad_id, turno_id, tipo, secuencia,"
                                    + " fecha, fecha_registro, total_cobrado, total_anulado, neto,"
                                    + " total_declarado, diferencia, recibos_emitidos,"
                                    + " recibos_anulados, usuario_registro, observacion) VALUES (?, ?,"
                                    + " 'CIERRE', 1, ?, now(), 0, 0, 0, 0, 0, 0, 0, 'prueba', 'cierre"
                                    + " de la prueba') RETURNING id")) {
                sentencia.setLong(1, municipalidadId);
                sentencia.setLong(2, turnoId);
                sentencia.setObject(3, HOY);
                return devolverId(app, sentencia);
            }
        }
    }

    /** La reversion del acta: el ultimo movimiento deja de cerrar, y el turno vuelve a abrirse. */
    private static void registrarReversion(long municipalidadId, long turnoId, long acta)
            throws SQLException {
        try (Connection app = base.conexion(BaseDeDatosDePrueba.APP)) {
            ContextoDeTenant.fijar(app, municipalidadId);
            try (PreparedStatement sentencia =
                    app.prepareStatement(
                            "INSERT INTO cierre_turno (municipalidad_id, turno_id, tipo, secuencia,"
                                    + " fecha, fecha_registro, revierte_a_id, motivo,"
                                    + " usuario_registro, observacion) VALUES (?, ?, 'REVERSION', 2,"
                                    + " ?, now(), ?, 'quedaba gente', 'prueba', 'reversion de la"
                                    + " prueba') RETURNING id")) {
                sentencia.setLong(1, municipalidadId);
                sentencia.setLong(2, turnoId);
                sentencia.setObject(3, HOY);
                sentencia.setLong(4, acta);
                devolverId(app, sentencia);
            }
        }
    }

    private static long devolverId(Connection app, PreparedStatement sentencia)
            throws SQLException {
        try (ResultSet resultado = sentencia.executeQuery()) {
            resultado.next();
            long id = resultado.getLong(1);
            app.commit();
            return id;
        }
    }

    /** El proxy que obedece a la anotacion, como el contenedor. Ver el javadoc de la clase. */
    @SuppressWarnings("unchecked")
    private static <T> T envolver(T objetivo, TenantTransactionManager gestor) {
        ProxyFactory fabrica = new ProxyFactory(objetivo);
        fabrica.setProxyTargetClass(true);
        fabrica.addAdvice(
                new TransactionInterceptor(gestor, new AnnotationTransactionAttributeSource()));
        return (T) fabrica.getProxy();
    }
}
