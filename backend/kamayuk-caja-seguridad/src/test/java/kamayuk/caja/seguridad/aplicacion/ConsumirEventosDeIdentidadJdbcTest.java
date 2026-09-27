package kamayuk.caja.seguridad.aplicacion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import java.io.IOException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.StringJoiner;
import java.util.UUID;
import kamayuk.caja.compartido.TenantContext;
import kamayuk.caja.dominio.MunicipalidadId;
import kamayuk.caja.dominio.ZonaHoraria;
import kamayuk.caja.esquema.BaseDeDatosDePrueba;
import kamayuk.caja.plataforma.tenant.TenantTransactionManager;
import kamayuk.caja.seguridad.AlertaDeEventosSinAplicar;
import kamayuk.caja.seguridad.EventoDeIdentidadRecibido;
import kamayuk.caja.seguridad.FilaSinSujeto;
import kamayuk.caja.seguridad.FuenteDeEventosDeIdentidad;
import kamayuk.caja.seguridad.dominio.PlazoDeAdopcion;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.QueryTimeoutException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import tools.jackson.databind.json.JsonMapper;

/**
 * Una vuelta del consumidor, con el aplicador de VERDAD contra PostgreSQL y un buzon de mentira que
 * mira lo que la copia tiene <b>en el momento del acuse</b>, desde otra conexion.
 *
 * <p>Eso ultimo es lo que separa «acusa despues del commit» de «acusa cuando le parece»: un acuse
 * mandado con la transaccion todavia abierta se ve igual desde dentro del consumidor, y solo lo
 * delata quien mira la base por fuera en ese instante. Es el instrumento del R1/R2 de la etapa 2 de
 * {@code identidad}, del lado del receptor.
 *
 * <p><b>Las dos piezas del consumidor van envueltas en un {@link TransactionInterceptor} de
 * verdad</b>, tambien la que hoy no declara ninguna transaccion. Es la leccion R2 de aquella etapa:
 * si el consumidor no esta proxificado, un {@code @Transactional} que alguien le ponga mañana es un
 * comentario, y la propiedad que esta clase mide no la podria medir nadie.
 */
@DisplayName("Etapa 4 — una vuelta del consumidor del buzon de identidad")
class ConsumirEventosDeIdentidadJdbcTest {

    private static final Instant AHORA = Instant.parse("2026-09-09T15:00:00Z");
    private static final String HUELLA = "e".repeat(64);

    private static BaseDeDatosDePrueba base;
    private static TenantTransactionManager gestor;
    private static JdbcClient jdbc;
    private static long municipalidad;

    private BuzonDeMentira buzon;
    private AlertaQueAnota alerta;
    private ConsumirEventosDeIdentidad consumidor;

    @BeforeAll
    static void provisionar() throws SQLException, IOException {
        base = BaseDeDatosDePrueba.provisionar();
        municipalidad = crearMunicipalidad("209903", "Municipalidad C");
        try (Connection admin = base.conexionAdmin();
                Statement s = admin.createStatement()) {
            s.execute(
                    "INSERT INTO modulo_sistema (municipalidad_id, codigo, nombre) VALUES ("
                            + municipalidad
                            + ", 'TESORERIA', 'Tesoreria')");
            s.execute(
                    "INSERT INTO acceso (municipalidad_id, modulo_id, tipo, codigo, nombre)"
                            + " SELECT "
                            + municipalidad
                            + ", id, 'OPCION_MENU', 'permisos', 'Permisos' FROM modulo_sistema"
                            + " WHERE municipalidad_id = "
                            + municipalidad);
        }
        DriverManagerDataSource pool = new DriverManagerDataSource();
        pool.setUrl(base.url());
        pool.setUsername(BaseDeDatosDePrueba.APP);
        pool.setPassword(base.clave(BaseDeDatosDePrueba.APP));
        gestor = new TenantTransactionManager(pool);
        jdbc = JdbcClient.create(pool);
    }

    @AfterAll
    static void liberar() {
        if (base != null) {
            base.close();
        }
    }

    @BeforeEach
    void armar() {
        buzon = new BuzonDeMentira();
        alerta = new AlertaQueAnota();
        consumidor = consumidorCon(aplicadorDeVerdad(alerta));
        TenantContext.fijar(new MunicipalidadId(municipalidad));
    }

    @AfterEach
    void limpiarContexto() {
        TenantContext.limpiar();
    }

    @Test
    @DisplayName(
            "una pagina con de todo: se aplica lo aplicable, se aparta lo imposible, se espera lo pendiente, y se acusa DESPUES del commit")
    void unaPaginaConDeTodo() throws SQLException {
        EventoDeIdentidadRecibido grupo =
                evento(
                        1,
                        "GRUPO_DADO_DE_ALTA",
                        "{\"grupoId\":1,\"nombre\":\"Cajeros\",\"descripcion\":null,"
                                + "\"habilitado\":true,\"vigenciaDesde\":null,\"vigenciaHasta\":null}");
        EventoDeIdentidadRecibido usuario =
                evento(
                        2,
                        "USUARIO_DADO_DE_ALTA",
                        "{\"usuarioId\":1,\"cuenta\":\"jperez\",\"nombre\":\"Juan Perez\","
                                + "\"correo\":null,\"habilitado\":true,\"vigenciaDesde\":null,"
                                + "\"vigenciaHasta\":null}");
        EventoDeIdentidadRecibido afiliacion =
                evento(
                        3,
                        "MIEMBRO_AFILIADO",
                        "{\"grupoId\":1,\"grupoNombre\":\"Cajeros\",\"usuarioId\":1,"
                                + "\"usuarioCuenta\":\"jperez\",\"activo\":true,"
                                + "\"usuarioAlta\":\"admin\",\"usuarioBaja\":null}");
        EventoDeIdentidadRecibido permisoDeCaja = evento(4, "PERMISO_FIJADO", permiso("caja"));
        EventoDeIdentidadRecibido permisoDeRentas = evento(5, "PERMISO_FIJADO", permiso("rentas"));
        EventoDeIdentidadRecibido octavoTipo = evento(6, "SISTEMA_DADO_DE_ALTA", "{}");
        EventoDeIdentidadRecibido huerfana =
                evento(
                        7,
                        "MIEMBRO_AFILIADO",
                        "{\"grupoId\":9,\"grupoNombre\":\"Grupo que no llego\",\"usuarioId\":1,"
                                + "\"usuarioCuenta\":\"jperez\",\"activo\":true,"
                                + "\"usuarioAlta\":\"admin\",\"usuarioBaja\":null}");
        buzon.sirve(
                grupo, usuario, afiliacion, permisoDeCaja, permisoDeRentas, octavoTipo, huerfana);
        // Las pruebas de esta clase comparten la municipalidad y no se limpian entre si, asi que
        // lo que se afirma es lo que ESTA vuelta anade, y no un total.
        long aplicadosAntes = contar("identidad_evento_aplicado");
        long muertosAntes = contar("identidad_evento_muerto");

        ConsumirEventosDeIdentidad.Vuelta vuelta = consumidor.consumir();

        assertThat(vuelta.leidos()).isEqualTo(7);
        assertThat(vuelta.aplicados()).isEqualTo(4);
        assertThat(vuelta.ajenos()).isEqualTo(1);
        assertThat(vuelta.apartados()).isEqualTo(1);
        assertThat(vuelta.pendientes()).isEqualTo(1);
        assertThat(vuelta.sinProgreso()).isFalse();

        assertThat(buzon.acusados)
                .as("se acusan los seis resueltos y NO la huerfana, que se queda en el buzon")
                .containsExactly(
                        grupo.eventoId(),
                        usuario.eventoId(),
                        afiliacion.eventoId(),
                        permisoDeCaja.eventoId(),
                        permisoDeRentas.eventoId(),
                        octavoTipo.eventoId());
        assertThat(buzon.aplicadosVisiblesAlAcusar - aplicadosAntes)
                .as(
                        "[el acuse va DESPUES del commit (AC-7 #1): en el instante del acuse, otra"
                                + " conexion ya ve en la copia los cinco resueltos —los cuatro"
                                + " aplicados y el ajeno, que se registra para no volver a leerlo—;"
                                + " si el acuse llegara antes, `identidad` dejaria de servir eventos"
                                + " que esta copia todavia no habia confirmado, y un fallo en ese"
                                + " hueco los perderia para siempre]")
                .isEqualTo(5L);
        assertThat(buzon.muertosVisiblesAlAcusar - muertosAntes)
                .as("y el apartado ya esta en la cola de muertos cuando se acusa")
                .isEqualTo(1L);

        assertThat(alerta.avisos).hasSize(1);
        assertThat(alerta.avisos.getFirst())
                .contains("SISTEMA_DADO_DE_ALTA")
                .contains("apartados=1");
        assertThat(contar("identidad_evento_muerto") - muertosAntes).isEqualTo(1);
        assertThat(contar("permiso")).as("el de rentas no rige aqui").isEqualTo(1);
    }

    @Test
    @DisplayName(
            "la MISMA pagina otra vez no escribe nada: todo esta ya aplicado, y se vuelve a acusar")
    void laMismaPaginaOtraVez() throws SQLException {
        EventoDeIdentidadRecibido usuario =
                evento(
                        10,
                        "USUARIO_DADO_DE_ALTA",
                        "{\"usuarioId\":2,\"cuenta\":\"mlopez\",\"nombre\":\"Maria Lopez\","
                                + "\"correo\":null,\"habilitado\":true,\"vigenciaDesde\":null,"
                                + "\"vigenciaHasta\":null}");
        buzon.sirve(usuario);
        consumidor.consumir();
        long usuariosAntes = contar("usuario");

        buzon.sirve(usuario);
        ConsumirEventosDeIdentidad.Vuelta segunda = consumidor.consumir();

        assertThat(segunda.yaEstaban()).isEqualTo(1);
        assertThat(segunda.aplicados()).isZero();
        assertThat(contar("usuario")).isEqualTo(usuariosAntes);
        assertThat(buzon.acusados).hasSize(2);
    }

    @Test
    @DisplayName("un fallo TRANSITORIO al aplicar no aparta nada, no acusa nada y sube (AC-7 #3)")
    void unFalloTransitorioSube() throws SQLException {
        buzon.sirve(
                evento(
                        20,
                        "USUARIO_DADO_DE_ALTA",
                        "{\"usuarioId\":3,\"cuenta\":\"rcastro\",\"nombre\":\"Rosa Castro\","
                                + "\"correo\":null,\"habilitado\":true,\"vigenciaDesde\":null,"
                                + "\"vigenciaHasta\":null}"));
        ConsumirEventosDeIdentidad conLaBaseCaida =
                consumidorCon(
                        envolver(
                                new AplicarUnEventoDeIdentidad(
                                        jdbc,
                                        JsonMapper.builder().build(),
                                        Clock.fixed(AHORA, ZoneOffset.UTC),
                                        alerta) {
                                    @Override
                                    public Aplicacion aplicar(EventoDeIdentidadRecibido evento) {
                                        throw new QueryTimeoutException(
                                                "la base no contesto a tiempo");
                                    }
                                }));
        long muertosAntes = contar("identidad_evento_muerto");

        assertThatThrownBy(conLaBaseCaida::consumir)
                .as(
                        "un fallo de la base es transitorio: se arregla solo y la corrida tiene que"
                                + " acabar en rojo, no tragarselo")
                .isInstanceOf(DataAccessException.class);

        assertThat(contar("identidad_evento_muerto"))
                .as(
                        "[mandar a muertos un fallo transitorio es matar un permiso que alguien"
                                + " concedio por un tiempo fuera de la base: el evento tiene que"
                                + " seguir pendiente en el buzon]")
                .isEqualTo(muertosAntes);
        assertThat(buzon.acusados).as("y sin acuse: el buzon lo vuelve a servir").isEmpty();
        assertThat(alerta.avisos).isEmpty();
    }

    @Test
    @DisplayName(
            "un acuse RECHAZADO se registra, no se reintenta, y la vuelta se declara sin progreso")
    void unAcuseRechazado() throws SQLException {
        buzon.sirve(
                evento(
                        30,
                        "GRUPO_DADO_DE_ALTA",
                        "{\"grupoId\":2,\"nombre\":\"Supervisores\",\"descripcion\":null,"
                                + "\"habilitado\":true,\"vigenciaDesde\":null,\"vigenciaHasta\":null}"));
        buzon.rechazaElAcuse = true;

        ConsumirEventosDeIdentidad.Vuelta vuelta = consumidor.consumir();

        assertThat(vuelta.acuseRechazado()).isTrue();
        assertThat(vuelta.sinProgreso()).isTrue();
        assertThat(vuelta.aplicados()).as("lo aplicado SIGUE aplicado").isEqualTo(1);
        assertThat(contar("grupo")).isGreaterThanOrEqualTo(1);
    }

    @Test
    @DisplayName("y con el buzon vacio no se acusa nada y no hay progreso")
    void conElBuzonVacio() {
        ConsumirEventosDeIdentidad.Vuelta vuelta = consumidor.consumir();

        assertThat(vuelta.leidos()).isZero();
        assertThat(vuelta.sinProgreso()).isTrue();
        assertThat(buzon.acusados).isEmpty();
    }

    // ------------------------------------------------------------------
    //  #125 — las filas sin sujeto que todavia conceden
    // ------------------------------------------------------------------

    @Test
    @DisplayName(
            "#125: se avisa de las filas sin sujeto que todavia conceden —cuenta y grupo— y de"
                    + " ninguna otra; las vencidas se cuentan")
    void avisaDeLasFilasSinSujetoQueTodaviaConceden() throws SQLException {
        long otra = crearMunicipalidad("209904", "Municipalidad D");
        // AHORA es 2026-09-09T15:00Z: en Lima, el 9.
        LocalDate ultimoDia = PlazoDeAdopcion.corte(LocalDate.of(2026, 9, 9));
        LocalDate vencida = ultimoDia.minusDays(1);
        try (Connection admin = base.conexionAdmin();
                PreparedStatement s =
                        admin.prepareStatement(
                                "INSERT INTO usuario (municipalidad_id, identidad_sujeto_id, cuenta,"
                                        + " nombre, habilitado, sin_sujeto_desde)"
                                        + " VALUES (?, ?, ?, 'x', ?, ?)")) {
            insertarUsuario(s, otra, null, "en.plazo", true, ultimoDia);
            insertarUsuario(s, otra, null, "vencida", true, vencida);
            insertarUsuario(s, otra, null, "sin.fecha", true, null);
            insertarUsuario(s, otra, null, "deshabilitada", false, ultimoDia);
            insertarUsuario(s, otra, 9L, "con.sujeto", true, vencida);
        }
        try (Connection admin = base.conexionAdmin();
                PreparedStatement s =
                        admin.prepareStatement(
                                "INSERT INTO grupo (municipalidad_id, identidad_sujeto_id, nombre,"
                                        + " sin_sujeto_desde) VALUES (?, ?, ?, ?)")) {
            s.setLong(1, otra);
            s.setNull(2, java.sql.Types.BIGINT);
            s.setString(3, "Cajeros viejo");
            s.setObject(4, enLima(ultimoDia));
            s.executeUpdate();
            s.setLong(2, 9L);
            s.setString(3, "Cajeros");
            s.executeUpdate();
        }
        TenantContext.fijar(new MunicipalidadId(otra));

        int avisadas = consumidor.avisarDeLasFilasSinSujeto();

        assertThat(avisadas).isEqualTo(2);
        assertThat(alerta.avisos)
                .as(
                        "[UNA llamada, con las dos que todavia conceden —en el orden tabla, clave— y"
                                + " la cuenta de las que ya no: «vencida» y «sin.fecha». Ni la"
                                + " deshabilitada, que no concede de todos modos, ni las que llevan"
                                + " sujeto, que el plazo no les afecta]")
                .containsExactly(
                        "SIN SUJETO: grupo «Cajeros viejo» hasta "
                                + PlazoDeAdopcion.concedeHasta(ultimoDia)
                                + ", usuario «en.plazo» hasta "
                                + PlazoDeAdopcion.concedeHasta(ultimoDia)
                                + "; ya no conceden 2; hoy 2026-09-09");
    }

    @Test
    @DisplayName(
            "#125 ronda 2: el WARN de las que ya no conceden solo nombra las que cruzaron el plazo"
                    + " HOY, y al dia siguiente ya no las repite")
    void elWarnDeLasVencidasSoloElDiaQueCruzan() throws SQLException {
        long otra = crearMunicipalidad("209905", "Municipalidad E");
        LocalDate hoy = LocalDate.of(2026, 9, 9);
        LocalDate ultimoDia = PlazoDeAdopcion.corte(hoy);
        try (Connection admin = base.conexionAdmin();
                PreparedStatement s =
                        admin.prepareStatement(
                                "INSERT INTO usuario (municipalidad_id, identidad_sujeto_id, cuenta,"
                                        + " nombre, habilitado, sin_sujeto_desde)"
                                        + " VALUES (?, ?, ?, 'x', ?, ?)")) {
            // Ayer concedia por ultima vez: hoy es el dia en que cruza.
            insertarUsuario(s, otra, null, "cruza.hoy", true, ultimoDia.minusDays(1));
            insertarUsuario(s, otra, null, "vencida.hace.dias", true, ultimoDia.minusDays(5));
            insertarUsuario(s, otra, null, "sin.fecha.e", true, null);
        }
        TenantContext.fijar(new MunicipalidadId(otra));
        ListAppender<ILoggingEvent> registro = new ListAppender<>();
        registro.start();
        ch.qos.logback.classic.Logger logger =
                (ch.qos.logback.classic.Logger)
                        LoggerFactory.getLogger(ConsumirEventosDeIdentidad.class);
        logger.addAppender(registro);
        try {
            consumidor.avisarDeLasFilasSinSujeto();
        } finally {
            logger.detachAppender(registro);
        }

        List<String> avisos =
                registro.list.stream()
                        .filter(linea -> linea.getLevel() == Level.WARN)
                        .map(ILoggingEvent::getFormattedMessage)
                        .toList();
        assertThat(avisos)
                .as(
                        "[una linea, con la que cruzo hoy y ninguna otra: repetir cada cinco minutos"
                                + " y para siempre las que ya no conceden es el canal que grita en"
                                + " lo corriente (#437)]")
                .singleElement()
                .asString()
                .contains("«cruza.hoy»")
                .doesNotContain("vencida.hace.dias")
                .doesNotContain("sin.fecha.e");
        assertThat(alerta.avisos)
                .as("y ninguna concede, asi que el responsable no recibe nada")
                .noneMatch(aviso -> aviso.startsWith("SIN SUJETO"));

        AplicarUnEventoDeIdentidad aplicador = aplicadorDeVerdad(alerta);
        assertThat(aplicador.filasSinSujeto(hoy.plusDays(1)).queDejaronDeConcederHoy())
                .as("al dia siguiente, «cruza.hoy» ya no es de hoy: no se vuelve a nombrar")
                .isEmpty();
        assertThat(aplicador.filasSinSujeto(hoy).queDejaronDeConcederHoy())
                .extracting(FilaSinSujeto::clave)
                .containsExactly("cruza.hoy");
    }

    @Test
    @DisplayName("#125 CONTRASTE: una copia sin filas sin sujeto no avisa")
    void unaCopiaSinFilasSinSujetoNoAvisa() {
        TenantContext.fijar(new MunicipalidadId(municipalidad));

        assertThat(consumidor.avisarDeLasFilasSinSujeto()).isZero();
        assertThat(alerta.avisos).noneMatch(aviso -> aviso.startsWith("SIN SUJETO"));
    }

    private static void insertarUsuario(
            PreparedStatement s,
            long municipalidad,
            @Nullable Long sujeto,
            String cuenta,
            boolean habilitado,
            @Nullable LocalDate desde)
            throws SQLException {
        s.setLong(1, municipalidad);
        if (sujeto == null) {
            s.setNull(2, java.sql.Types.BIGINT);
        } else {
            s.setLong(2, sujeto);
        }
        s.setString(3, cuenta);
        s.setBoolean(4, habilitado);
        if (desde == null) {
            s.setNull(5, java.sql.Types.TIMESTAMP_WITH_TIMEZONE);
        } else {
            s.setObject(5, enLima(desde));
        }
        s.executeUpdate();
    }

    /** El comienzo del dia en Lima, que es con lo que el guardia corta el plazo. */
    private static java.time.OffsetDateTime enLima(LocalDate dia) {
        return ZonaHoraria.comienzoDelDia(dia).atOffset(ZoneOffset.UTC);
    }

    // ------------------------------------------------------------------

    private static AplicarUnEventoDeIdentidad aplicadorDeVerdad(AlertaDeEventosSinAplicar alerta) {
        return envolver(
                new AplicarUnEventoDeIdentidad(
                        jdbc,
                        JsonMapper.builder().build(),
                        Clock.fixed(AHORA, ZoneOffset.UTC),
                        alerta));
    }

    private ConsumirEventosDeIdentidad consumidorCon(AplicarUnEventoDeIdentidad aplicador) {
        return envolver(
                new ConsumirEventosDeIdentidad(
                        buzon, aplicador, alerta, Clock.fixed(AHORA, ZoneOffset.UTC)));
    }

    @SuppressWarnings("unchecked")
    private static <T> T envolver(T objetivo) {
        ProxyFactory fabrica = new ProxyFactory(objetivo);
        fabrica.setProxyTargetClass(true);
        fabrica.addAdvice(
                new TransactionInterceptor(gestor, new AnnotationTransactionAttributeSource()));
        return (T) fabrica.getProxy();
    }

    private static EventoDeIdentidadRecibido evento(long secuencia, String tipo, String cuerpo) {
        return new EventoDeIdentidadRecibido(
                UUID.randomUUID(),
                secuencia,
                tipo,
                sujetoIdDelCuerpo(tipo, cuerpo),
                cuerpo,
                HUELLA,
                AHORA);
    }

    /** El sobre trae el MISMO id que el cuerpo (ronda 2 de #111): se deriva de el. */
    private static long sujetoIdDelCuerpo(String tipo, String cuerpo) {
        String campo =
                switch (tipo) {
                    case "USUARIO_DADO_DE_ALTA", "USUARIO_MODIFICADO" -> "usuarioId";
                    case "GRUPO_DADO_DE_ALTA",
                            "GRUPO_MODIFICADO",
                            "MIEMBRO_AFILIADO",
                            "MIEMBRO_DESAFILIADO" ->
                            "grupoId";
                    case "PERMISO_FIJADO" -> "sujetoId";
                    default -> null;
                };
        if (campo == null) {
            return 1L;
        }
        java.util.regex.Matcher coincidencia =
                java.util.regex.Pattern.compile("\"" + campo + "\":(-?\\d+)").matcher(cuerpo);
        return coincidencia.find() ? Long.parseLong(coincidencia.group(1)) : 1L;
    }

    private static String permiso(String sistema) {
        return "{\"sujeto\":\"GRUPO\",\"sujetoId\":1,\"sujetoNombre\":\"Cajeros\",\"sistema\":\""
                + sistema
                + "\",\"codigo\":\"permisos\",\"privilegios\":{\"ejecucion\":false,"
                + "\"lectura\":true,\"registro\":false,\"modificacion\":false,"
                + "\"eliminacion\":false,\"impresion\":false,\"especial\":false},"
                + "\"usuarioRegistro\":\"admin\"}";
    }

    private static long crearMunicipalidad(String ubigeo, String nombre) throws SQLException {
        try (Connection admin = base.conexionAdmin();
                Statement sentencia = admin.createStatement()) {
            sentencia.execute(
                    "INSERT INTO municipalidad (ubigeo, nombre, tipo) VALUES ('"
                            + ubigeo
                            + "', '"
                            + nombre
                            + "', 'DISTRITAL') ON CONFLICT (ubigeo) DO NOTHING");
            try (ResultSet fila =
                    sentencia.executeQuery(
                            "SELECT id FROM municipalidad WHERE ubigeo = '" + ubigeo + "'")) {
                fila.next();
                return fila.getLong(1);
            }
        }
    }

    /** Desde OTRA conexion, como superusuario: lo que esta confirmado y solo eso. */
    private static long contar(String tabla) throws SQLException {
        try (Connection admin = base.conexionAdmin();
                PreparedStatement sentencia =
                        admin.prepareStatement(
                                "SELECT count(*) FROM " + tabla + " WHERE municipalidad_id = ?")) {
            sentencia.setLong(1, municipalidad);
            try (ResultSet fila = sentencia.executeQuery()) {
                fila.next();
                return fila.getLong(1);
            }
        }
    }

    /**
     * El buzon de mentira: sirve lo que se le da, y al acusar MIRA la copia desde otra conexion.
     *
     * <p>Lo que cuenta es lo que ya hizo commit. Si el consumidor acusara con una transaccion
     * abierta, estos contadores saldrian por debajo de lo que el consumidor cree haber aplicado.
     */
    private static final class BuzonDeMentira implements FuenteDeEventosDeIdentidad {
        private final List<EventoDeIdentidadRecibido> pendientes = new ArrayList<>();
        private final List<UUID> acusados = new ArrayList<>();
        private long aplicadosVisiblesAlAcusar = -1;
        private long muertosVisiblesAlAcusar = -1;
        private boolean rechazaElAcuse;

        void sirve(EventoDeIdentidadRecibido... eventos) {
            pendientes.addAll(List.of(eventos));
        }

        @Override
        public Lote pendientes(int limite) {
            List<EventoDeIdentidadRecibido> pagina = List.copyOf(pendientes);
            pendientes.clear();
            return new Lote(pagina, pagina.size());
        }

        @Override
        public Acuse acusar(List<UUID> eventoIds) {
            try {
                aplicadosVisiblesAlAcusar = contar("identidad_evento_aplicado");
                muertosVisiblesAlAcusar = contar("identidad_evento_muerto");
            } catch (SQLException noSePudoMirar) {
                throw new IllegalStateException(
                        "el buzon de mentira no pudo mirar la copia", noSePudoMirar);
            }
            if (rechazaElAcuse) {
                throw new AcuseRechazado(422, "{\"codigo\":\"VALIDACION\"}");
            }
            acusados.addAll(eventoIds);
            return new Acuse(eventoIds.size(), eventoIds.size(), 0);
        }
    }

    private static final class AlertaQueAnota implements AlertaDeEventosSinAplicar {
        private final List<String> avisos = new ArrayList<>();

        @Override
        public void hayUnEventoSinAplicar(
                EventoDeIdentidadRecibido evento, String motivo, long apartados) {
            avisos.add(evento.tipoPublicado() + ": " + motivo + " apartados=" + apartados);
        }

        @Override
        public void hayUnChoqueDeRenombrado(EventoDeIdentidadRecibido evento, String motivo) {
            avisos.add(evento.tipoPublicado() + " (choque): " + motivo);
        }

        @Override
        public void hayEventosPospuestos(
                List<EventoDeIdentidadRecibido> pospuestos,
                java.time.Instant ahora,
                java.time.Duration umbral) {
            avisos.add("POSPUESTOS: " + pospuestos.size());
        }

        @Override
        public void hayFilasSinSujeto(
                List<FilaSinSujeto> queConceden, long queYaNoConceden, LocalDate hoy) {
            StringJoiner filas = new StringJoiner(", ");
            for (FilaSinSujeto fila : queConceden) {
                filas.add(fila.tabla() + " «" + fila.clave() + "» hasta " + fila.concedeHasta());
            }
            avisos.add(
                    "SIN SUJETO: "
                            + filas
                            + "; ya no conceden "
                            + queYaNoConceden
                            + "; hoy "
                            + hoy);
        }
    }
}
