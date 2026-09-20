package kamayuk.caja.nucleo.infraestructura.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import java.io.IOException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import kamayuk.caja.auditoria.Origen;
import kamayuk.caja.auditoria.OrigenContext;
import kamayuk.caja.compartido.TenantContext;
import kamayuk.caja.dominio.MunicipalidadId;
import kamayuk.caja.esquema.BaseDeDatosDePrueba;
import kamayuk.caja.esquema.ContextoDeTenant;
import kamayuk.caja.nucleo.aplicacion.ConsultaDelTurno;
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
 * #97 — «Cual es mi turno», de HTTP a PostgreSQL y sin un doble por el camino.
 *
 * <h2>Por que va hasta la base</h2>
 *
 * <p>Las dos cosas que esta lectura tiene que demostrar no se pueden demostrar con un doble:
 *
 * <ul>
 *   <li>el <b>aislamiento</b>. La consulta no lleva —ni debe llevar (regla 2)— ningun {@code WHERE
 *       municipalidad_id}: lo unico que separa a dos municipalidades es la politica RLS con el
 *       valor que el {@code SET LOCAL} de la transaccion fijo. Y aqui el riesgo tiene nombre: el
 *       <b>cajero es una cadena</b>, no una clave, asi que dos municipalidades con un {@code
 *       jperez} cada una son exactamente el caso en que un fallo de aislamiento no se ve —el nombre
 *       que vuelve es el que se pidio—;
 *   <li>el <b>rotulo de la ventanilla</b>, que sale de un {@code JOIN} con {@code caja}, que
 *       tambien tiene RLS. Comprobarlo en memoria seria comprobar el doble.
 * </ul>
 *
 * <p>La conexion es la de {@code kamayuk_app}: un superusuario omite RLS incluso con {@code FORCE
 * ROW LEVEL SECURITY}, y con {@code kamayuk_owner} tampoco basta (#537, #545). Lo fija {@link
 * #seConectaComoKamayukApp}.
 *
 * <p>El proxy transaccional obedece a la anotacion, como el contenedor: envolver el caso de uso en
 * un {@code TransactionTemplate} incondicional dejaria esta clase pasando con el
 * {@code @Transactional} quitado, que es justo el modo de fallo que existe para impedir (#430,
 * #569).
 */
@DisplayName("#97 — El turno de la ventanilla, de HTTP a PostgreSQL")
class TurnoDelDiaFronteraTest {

    /** El dia del reloj de esta caja: el que la lectura contesta sin que nadie se lo pida. */
    private static final LocalDate HOY = LocalDate.of(2026, 3, 15);

    private static final LocalDate AYER = HOY.minusDays(1);

    private static final Clock RELOJ =
            Clock.fixed(HOY.atStartOfDay(ZoneOffset.UTC).toInstant(), ZoneOffset.UTC);

    /** El mismo nombre de cajero en las dos municipalidades. Ver el javadoc de la clase. */
    private static final String CAJERO = "jperez";

    private static final String LA_QUE_CERRO = "mlopez";
    private static final String LA_DE_DOS_VENTANILLAS = "rquispe";
    private static final String SIN_TURNO = "acondori";

    private static BaseDeDatosDePrueba base;
    private static long municipalidadA;
    private static long municipalidadB;
    private static long turnoAbiertoDeA;
    private static long turnoAbiertoDeB;
    private static JdbcClient jdbc;
    private static MockMvc mvc;

    @BeforeAll
    static void provisionar() throws SQLException, IOException {
        base = BaseDeDatosDePrueba.provisionar();
        municipalidadA = crearMunicipalidad("241301", "Municipalidad que cobra en ventanilla");
        municipalidadB = crearMunicipalidad("241302", "Municipalidad vecina");

        // ── La municipalidad A ────────────────────────────────────────────
        long principalA = sembrarCaja(municipalidadA, "C-01", "CAJA TRIBUTARIA", "001");
        long mercadoA = sembrarCaja(municipalidadA, "C-07", "MERCADO CENTRAL", "007");

        turnoAbiertoDeA = sembrarTurno(municipalidadA, principalA, CAJERO, HOY);
        // El MISMO cajero, ayer: lo que separa «mi turno» de «mis turnos» es la fecha, y
        // sin el WHERE por dia esta fila saldria hoy con su arqueo de ayer.
        sembrarTurno(municipalidadA, principalA, CAJERO, AYER);

        long cerrado = sembrarTurno(municipalidadA, principalA, LA_QUE_CERRO, HOY);
        cerrarTurno(municipalidadA, cerrado);

        sembrarTurno(municipalidadA, mercadoA, LA_DE_DOS_VENTANILLAS, HOY);
        sembrarTurno(municipalidadA, principalA, LA_DE_DOS_VENTANILLAS, HOY);

        // ── La municipalidad B ────────────────────────────────────────────
        // El MISMO codigo de caja y el MISMO nombre de cajero: si el aislamiento
        // fallara, la respuesta seguiria pareciendo correcta.
        long principalB =
                sembrarCaja(municipalidadB, "C-01", "VENTANILLA UNICA DE LA VECINA", "001");
        turnoAbiertoDeB = sembrarTurno(municipalidadB, principalB, CAJERO, HOY);

        DriverManagerDataSource pool = new DriverManagerDataSource();
        pool.setUrl(base.url());
        pool.setUsername(BaseDeDatosDePrueba.APP);
        pool.setPassword(base.clave(BaseDeDatosDePrueba.APP));

        jdbc = JdbcClient.create(pool);
        TenantTransactionManager gestor = new TenantTransactionManager(pool);
        ConsultaDelTurno consulta =
                envolver(new ConsultaDelTurno(new TurnoDeCajaRepositoryJdbc(jdbc)), gestor);

        mvc =
                MockMvcBuilders.standaloneSetup(new TurnoController(consulta, RELOJ))
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
    }

    @AfterEach
    void limpiar() {
        TenantContext.limpiar();
        OrigenContext.limpiar();
    }

    // ------------------------------------------------------------------

    @Test
    @DisplayName("AC 1 — el turno abierto de quien pregunta, con los cuatro datos que hacian falta")
    void elTurnoAbiertoDeQuienPregunta() throws Exception {
        MvcResult resultado = delDia(CAJERO);

        assertThat(resultado.getResponse().getStatus())
                .as(
                        "sin el @Transactional del caso de uso la politica RLS no devuelve vacio:"
                                + " falla con «invalid input syntax for type bigint: \"\"» y esto"
                                + " seria 500 (#486)")
                .isEqualTo(200);
        String cuerpo = resultado.getResponse().getContentAsString();

        assertThat(cuerpo).contains("\"situacion\":\"ABIERTO\"");
        assertThat(cuerpo)
                .as(
                        "los cuatro: el turnoId con el que se pide el arqueo, su caja, su cajero, su dia")
                .contains("\"turnoId\":" + turnoAbiertoDeA)
                .contains("\"caja\":\"C-01\"")
                .contains("\"cajaNombre\":\"CAJA TRIBUTARIA\"")
                .contains("\"cajero\":\"jperez\"")
                .contains("\"fecha\":\"2026-03-15\"");
    }

    @Test
    @DisplayName("AC 1 — solo los de HOY: el turno de ayer del mismo cajero no vuelve")
    void soloLosDelDiaDeHoy() throws Exception {
        String cuerpo = delDia(CAJERO).getResponse().getContentAsString();

        assertThat(turnosDe(cuerpo))
                .as(
                        "este cajero tiene dos filas en cierre_caja —hoy y ayer— y solo una es su"
                                + " turno: sin el filtro por dia, la pantalla de cierre podria"
                                + " arquear el de ayer creyendo que es el de hoy")
                .hasSize(1);
        assertThat(cuerpo).doesNotContain("\"fecha\":\"2026-03-14\"");
    }

    @Test
    @DisplayName("AC 2 — sin ningun turno: 200 y SIN_ABRIR, no un 404")
    void sinNingunTurnoEsUnDato() throws Exception {
        MvcResult resultado = delDia(SIN_TURNO);

        assertThat(resultado.getResponse().getStatus())
                .as(
                        "el cajero que todavia no ha cobrado nada hoy es el estado normal de las"
                                + " ocho de la manana, no un error que la pantalla tenga que tratar")
                .isEqualTo(200);
        assertThat(resultado.getResponse().getContentAsString())
                .contains("\"situacion\":\"SIN_ABRIR\"")
                .contains("\"turnos\":[]");
    }

    @Test
    @DisplayName("AC 2 — «ya cerro» es otra respuesta: se lee de cierre_turno, no de una columna")
    void elQueYaCerroLoDice() throws Exception {
        String cuerpo = delDia(LA_QUE_CERRO).getResponse().getContentAsString();

        assertThat(cuerpo)
                .as(
                        "V32 retiro cierre_caja.estado precisamente para que no mintiera: el estado"
                                + " sale del ultimo movimiento del turno, y esta fila tiene uno")
                .contains("\"situacion\":\"CERRADO\"")
                .contains("\"estadoDelTurno\":\"CERRADO\"");
        assertThat(turnosDe(cuerpo)).hasSize(1);
    }

    @Test
    @DisplayName("con dos ventanillas abiertas no se elige: salen las dos, por codigo de caja")
    void conDosVentanillasSalenLasDos() throws Exception {
        String cuerpo = delDia(LA_DE_DOS_VENTANILLAS).getResponse().getContentAsString();

        assertThat(cuerpo).contains("\"situacion\":\"VARIOS_ABIERTOS\"");
        assertThat(cuerpo).contains("\"caja\":\"C-01\"").contains("\"caja\":\"C-07\"");
        assertThat(cuerpo.indexOf("C-01"))
                .as(
                        "se sembraron en el orden contrario: sin el ORDER BY del repositorio el"
                                + " motor las devuelve en el orden del heap y bailan entre lecturas")
                .isLessThan(cuerpo.indexOf("C-07"));
    }

    @Test
    @DisplayName("AC 2 (aislamiento) — la vecina recibe SU turno de SU jperez, no el de la A")
    void elTurnoNoSeConfundeConElDeOtraMunicipalidad() throws Exception {
        TenantContext.limpiar();
        TenantContext.fijar(new MunicipalidadId(municipalidadB));

        String cuerpo = delDia(CAJERO).getResponse().getContentAsString();

        assertThat(turnosDe(cuerpo)).hasSize(1);
        assertThat(cuerpo)
                .as(
                        "con el pool conectado como superusuario saldrian los dos, y el nombre no"
                                + " lo diria: «jperez» es el cajero de las dos municipalidades")
                .contains("\"turnoId\":" + turnoAbiertoDeB)
                .doesNotContain("\"turnoId\":" + turnoAbiertoDeA);
        assertThat(cuerpo)
                .as("y el C-01 que recibe es el SUYO: el JOIN con caja tambien tiene RLS")
                .contains("\"cajaNombre\":\"VENTANILLA UNICA DE LA VECINA\"")
                .doesNotContain("CAJA TRIBUTARIA");
    }

    @Test
    @DisplayName("el centinela: la prueba se conecta como kamayuk_app y no como otra cosa")
    void seConectaComoKamayukApp() {
        assertThat(jdbc.sql("SELECT current_user").query(String.class).single())
                .as(
                        "con superusuario RLS se omite —incluso con FORCE ROW LEVEL SECURITY— y"
                                + " todo lo de este archivo pasaria sin verificar nada. Con"
                                + " kamayuk_owner NO basta: FORCE lo sujeta a la politica igual (#537,"
                                + " #545)")
                .isEqualTo(BaseDeDatosDePrueba.APP);
    }

    @Test
    @DisplayName("preguntar por el turno NO lo abre: cierre_caja no gana una fila")
    void preguntarNoAbreTurno() throws Exception {
        long antes = cuantosTurnosHay(municipalidadA);

        delDia(SIN_TURNO);
        delDia(SIN_TURNO);

        assertThat(cuantosTurnosHay(municipalidadA))
                .as(
                        "la apertura es un acto con su observacion y su asiento de auditoria"
                                + " (regla 10), y la hace la primera cobranza. Una lectura que abriera"
                                + " turnos llenaria la tabla de cajeros que solo miraron la pantalla")
                .isEqualTo(antes);
    }

    // ------------------------------------------------------------------

    private static MvcResult delDia(String cajero) throws Exception {
        OrigenContext.limpiar();
        OrigenContext.fijar(new Origen(cajero, null, null));
        return mvc.perform(get("/caja/api/v1/turnos/del-dia")).andReturn();
    }

    /** Los identificadores de turno del cuerpo, en el orden en que salieron. */
    private static List<String> turnosDe(String cuerpo) {
        Matcher casa = Pattern.compile("\"turnoId\":(\\d+)").matcher(cuerpo);
        List<String> ids = new ArrayList<>();
        while (casa.find()) {
            ids.add(casa.group(1));
        }
        return ids;
    }

    /**
     * Cuantas filas tiene {@code cierre_caja} en esa municipalidad.
     *
     * <p>Se cuenta con la conexion de {@code kamayuk_app} y su contexto de tenant, y no con la del
     * dueño: {@code FORCE ROW LEVEL SECURITY} sujeta tambien al dueño a la politica, y esta sin
     * {@code SET LOCAL} falla con «unrecognized configuration parameter» — medido.
     */
    private static long cuantosTurnosHay(long municipalidadId) throws SQLException {
        try (Connection app = base.conexion(BaseDeDatosDePrueba.APP)) {
            ContextoDeTenant.fijar(app, municipalidadId);
            try (PreparedStatement sentencia =
                            app.prepareStatement("SELECT count(*) FROM cierre_caja");
                    ResultSet resultado = sentencia.executeQuery()) {
                resultado.next();
                return resultado.getLong(1);
            }
        }
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
                try (ResultSet resultado = sentencia.executeQuery()) {
                    resultado.next();
                    long id = resultado.getLong(1);
                    app.commit();
                    return id;
                }
            }
        }
    }

    private static long sembrarTurno(
            long municipalidadId, long cajaId, String cajero, LocalDate fecha) throws SQLException {
        try (Connection app = base.conexion(BaseDeDatosDePrueba.APP)) {
            ContextoDeTenant.fijar(app, municipalidadId);
            try (PreparedStatement sentencia =
                    app.prepareStatement(
                            "INSERT INTO cierre_caja (municipalidad_id, caja_id, cajero, fecha,"
                                    + " fecha_apertura, usuario_apertura, observacion)"
                                    + " VALUES (?, ?, ?, ?, now(), ?, 'apertura de la prueba')"
                                    + " RETURNING id")) {
                sentencia.setLong(1, municipalidadId);
                sentencia.setLong(2, cajaId);
                sentencia.setString(3, cajero);
                sentencia.setObject(4, fecha);
                sentencia.setString(5, cajero);
                try (ResultSet resultado = sentencia.executeQuery()) {
                    resultado.next();
                    long id = resultado.getLong(1);
                    app.commit();
                    return id;
                }
            }
        }
    }

    /** Un acta de cierre sobre ese turno: lo que hace que su estado se derive CERRADO (V32). */
    private static void cerrarTurno(long municipalidadId, long turnoId) throws SQLException {
        try (Connection app = base.conexion(BaseDeDatosDePrueba.APP)) {
            ContextoDeTenant.fijar(app, municipalidadId);
            try (PreparedStatement sentencia =
                    app.prepareStatement(
                            "INSERT INTO cierre_turno (municipalidad_id, turno_id, tipo, secuencia,"
                                    + " fecha, fecha_registro, total_cobrado, total_anulado, neto,"
                                    + " total_declarado, diferencia, recibos_emitidos,"
                                    + " recibos_anulados, usuario_registro, observacion) VALUES (?, ?,"
                                    + " 'CIERRE', 1, ?, now(), 0, 0, 0, 0, 0, 0, 0, 'prueba', 'cierre"
                                    + " de la prueba')")) {
                sentencia.setLong(1, municipalidadId);
                sentencia.setLong(2, turnoId);
                sentencia.setObject(3, HOY);
                sentencia.executeUpdate();
            }
            app.commit();
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
