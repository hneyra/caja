package kamayuk.caja.seguridad.aplicacion;

import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import java.io.IOException;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import kamayuk.caja.compartido.TenantContext;
import kamayuk.caja.dominio.MunicipalidadId;
import kamayuk.caja.esquema.BaseDeDatosDePrueba;
import kamayuk.caja.plataforma.RecorridoPorMunicipalidades;
import kamayuk.caja.plataforma.tenant.TenantTransactionManager;
import kamayuk.caja.seguridad.AlertaDeEventosSinAplicar;
import kamayuk.caja.seguridad.EventoDeIdentidadRecibido;
import kamayuk.caja.seguridad.FilaSinSujeto;
import kamayuk.caja.seguridad.HuerfanaYaAdoptada;
import kamayuk.caja.seguridad.infraestructura.AlertaDeHuerfanasYaAdoptadasEnElRegistro;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import tools.jackson.databind.json.JsonMapper;

/**
 * Las filas que un sujeto nuevo ya adopto sobre la de otro (#137), contra PostgreSQL de verdad y
 * como {@code kamayuk_app} bajo la politica.
 *
 * <p>La historia de antes de V5 no se puede producir con el aplicador de hoy —ya no funde un alta
 * en una fila ajena—, asi que se escribe como la dejo el de la etapa 4: con el superusuario y con
 * fechas del pasado, la fila huerfana, lo que le dieron a su primer dueno y el alta del segundo en
 * {@code identidad_evento_aplicado}. Lo que SI corre por el aplicador de hoy es lo que pasa
 * despues: el primer evento del sujeto nuevo que la adopta, lo que cualquier sujeto legitimo recibe
 * —para que el contraste sea el flujo real y no una fila escrita a mano— y los actos de {@code
 * identidad} con los que se resuelve. El aplicador usa el reloj del sistema, asi que sus acuses y
 * sus filas quedan fechados «ahora», como en produccion.
 *
 * <p>Cada prueba en su municipalidad: el criterio mira el primer evento aplicado en ELLA, y una
 * prueba que sembrara el pasado en la de otra le cambiaria la respuesta.
 */
@DisplayName("#137 — las huerfanas que un sujeto nuevo ya adopto")
class HuerfanasYaAdoptadasJdbcTest {

    private static final String ACCESO_DE_CAJA = "caja_tributaria";

    private static BaseDeDatosDePrueba base;
    private static TenantTransactionManager gestor;
    private static JdbcClient jdbc;
    private static AplicarUnEventoDeIdentidad aplicador;
    private static HuerfanasYaAdoptadas huerfanas;

    @BeforeAll
    static void provisionar() throws SQLException, IOException {
        base = BaseDeDatosDePrueba.provisionar();
        DriverManagerDataSource pool = new DriverManagerDataSource();
        pool.setUrl(base.url());
        pool.setUsername(BaseDeDatosDePrueba.APP);
        pool.setPassword(base.clave(BaseDeDatosDePrueba.APP));
        gestor = new TenantTransactionManager(pool);
        jdbc = JdbcClient.create(pool);
        aplicador =
                envolver(
                        new AplicarUnEventoDeIdentidad(
                                jdbc,
                                JsonMapper.builder().build(),
                                Clock.systemUTC(),
                                new AlertaQueNoSeLlama()));
        huerfanas = envolver(new HuerfanasYaAdoptadas(jdbc));
    }

    @AfterAll
    static void liberar() {
        if (base != null) {
            base.close();
        }
    }

    @AfterEach
    void limpiarContexto() {
        TenantContext.limpiar();
    }

    @Test
    @DisplayName(
            "la fila de «jperez» que el alta del 200 heredo antes de V5 se lista cuando su evento la"
                    + " adopta, con lo que le dio al 100; la de un sujeto legitimo, no")
    void laHuerfanaAdoptadaSeListaYLaLegitimaNo() throws SQLException {
        long muni = crearMunicipalidad("213701");
        sembrarLaHerenciaDeJperez(muni);
        TenantContext.fijar(new MunicipalidadId(muni));

        assertThat(huerfanas.candidatas())
                .as("[sin sujeto todavia, la ve #125 y no esta clase: nada que listar aqui]")
                .isEmpty();

        // El primer evento del 200 despues de V5: su alta esta APLICADA, no apartada, asi que el
        // aplicador de hoy adopta la fila por la clave (exigirQueSuAltaNoSeHayaApartado).
        assertThat(aplicador.aplicar(evento("USUARIO_MODIFICADO", 200, usuario(200, "jperez"))))
                .isEqualTo(AplicarUnEventoDeIdentidad.Aplicacion.APLICADO);
        assertThat(
                        texto(
                                "SELECT identidad_sujeto_id FROM usuario WHERE municipalidad_id = "
                                        + muni
                                        + " AND cuenta = 'jperez'"))
                .as("la ventana que #137 describe sigue abierta: la adopta hoy")
                .isEqualTo("200");

        // Y un sujeto legitimo por el camino de verdad: alta, afiliacion y permiso, en ese orden.
        aplicador.aplicar(evento("USUARIO_DADO_DE_ALTA", 7, usuario(7, "mlopez")));
        aplicador.aplicar(evento("MIEMBRO_AFILIADO", 3, afiliacion(3, "Ventanilla", 7, "mlopez")));
        aplicador.aplicar(evento("PERMISO_FIJADO", 7, permisoDeUsuario(7, "mlopez", true)));

        List<HuerfanaYaAdoptada> candidatas = huerfanas.candidatas();

        assertThat(candidatas)
                .as(
                        "[una sola: «jperez», con lo que le dieron al 100; ni «mlopez» —todo lo suyo"
                                + " es posterior a su alta— ni «Ventanilla» —su permiso tambien—]")
                .extracting(HuerfanaYaAdoptada::tabla, HuerfanaYaAdoptada::clave)
                .containsExactly(org.assertj.core.groups.Tuple.tuple("usuario", "jperez"));
        HuerfanaYaAdoptada jperez = candidatas.get(0);
        assertThat(jperez.sujeto()).isEqualTo(200);
        assertThat(jperez.heredado())
                .extracting(HuerfanaYaAdoptada.Herencia::que, HuerfanaYaAdoptada.Herencia::de)
                .containsExactlyInAnyOrder(
                        org.assertj.core.groups.Tuple.tuple("miembro", "Ventanilla"),
                        org.assertj.core.groups.Tuple.tuple("permiso", ACCESO_DE_CAJA));
    }

    @Test
    @DisplayName(
            "una implantacion de cero —la corriente de verdad de `identidad`— no deja ninguna"
                    + " candidata")
    void unaImplantacionDeCeroNoDejaNinguna() throws SQLException {
        long muni = crearMunicipalidad("213708");
        TenantContext.fijar(new MunicipalidadId(muni));
        CorrienteDeIdentidad corriente =
                CorrienteDeIdentidad.deUnaImplantacion(
                        "213708", "admin", List.of(ACCESO_DE_CAJA), Instant.now());
        for (EventoDeIdentidadRecibido evento : corriente.pendientes(corriente.total()).eventos()) {
            aplicador.aplicar(evento);
        }
        assertThat(texto("SELECT count(*) FROM usuario WHERE municipalidad_id = " + muni))
                .as("el administrador y las cuatro cuentas de servicio")
                .isEqualTo("5");

        assertThat(huerfanas.candidatas())
                .as("[lo corriente: cada fila nace de su alta y todo lo suyo es posterior]")
                .isEmpty();
    }

    @Test
    @DisplayName(
            "un grupo que otra alta adopto por el nombre hereda miembros y permisos, y se lista")
    void unGrupoAdoptadoSeLista() throws SQLException {
        long muni = crearMunicipalidad("213702");
        // La primera corrida: el alta de «rcastro», hace 30 dias.
        aplicado(muni, "USUARIO_DADO_DE_ALTA", 9, 30);
        ejecutar(
                "INSERT INTO usuario (municipalidad_id, identidad_sujeto_id, cuenta, nombre,"
                        + " fecha_registro) VALUES ("
                        + muni
                        + ", 9, 'rcastro', 'Rosa Castro', now() - interval '30 days')");
        // «Cajeros» ya existia y concedia hace 20 dias; el alta del grupo 30 —otro— entro hace 5,
        // y #111 le dejo adoptarla por el nombre (la ventana 2 de #137).
        ejecutar(
                "INSERT INTO grupo (municipalidad_id, identidad_sujeto_id, nombre) VALUES ("
                        + muni
                        + ", 30, 'Cajeros')");
        aplicado(muni, "GRUPO_DADO_DE_ALTA", 30, 5);
        afiliarEnElPasado(muni, "Cajeros", "rcastro", 20);
        permisoDeGrupoEnElPasado(muni, "Cajeros", 20);
        TenantContext.fijar(new MunicipalidadId(muni));

        List<HuerfanaYaAdoptada> candidatas = huerfanas.candidatas();

        assertThat(candidatas)
                .as(
                        "[«Cajeros» si; «rcastro» no: su afiliacion es de hace 20 dias y su alta de"
                                + " hace 30]")
                .extracting(HuerfanaYaAdoptada::tabla, HuerfanaYaAdoptada::clave)
                .containsExactly(org.assertj.core.groups.Tuple.tuple("grupo", "Cajeros"));
        assertThat(candidatas.get(0).heredado())
                .extracting(HuerfanaYaAdoptada.Herencia::que, HuerfanaYaAdoptada.Herencia::de)
                .containsExactlyInAnyOrder(
                        org.assertj.core.groups.Tuple.tuple("miembro", "rcastro"),
                        org.assertj.core.groups.Tuple.tuple("permiso", ACCESO_DE_CAJA));
    }

    @Test
    @DisplayName(
            "lo que la implantacion sembraba antes de la etapa 5 no cuenta, aunque el alta del"
                    + " administrador entrara un dia despues")
    void loSembradoAntesDeLaPrimeraCorridaNoCuenta() throws SQLException {
        long muni = crearMunicipalidad("213703");
        // La siembra de la etapa 4: administrador, su grupo, la afiliacion y el permiso, hace 40
        // dias. `identidad` no contesto ese dia; la primera corrida entro al dia siguiente, con el
        // alta del MISMO administrador y la de su grupo (kamayuk.implantacion.administrador).
        ejecutar(
                "INSERT INTO usuario (municipalidad_id, cuenta, nombre, fecha_registro) VALUES ("
                        + muni
                        + ", 'admin', 'Administrador', now() - interval '40 days')");
        ejecutar(
                "INSERT INTO grupo (municipalidad_id, nombre) VALUES ("
                        + muni
                        + ", 'Administracion del sistema')");
        afiliarEnElPasado(muni, "Administracion del sistema", "admin", 40);
        permisoDeGrupoEnElPasado(muni, "Administracion del sistema", 40);
        aplicado(muni, "USUARIO_DADO_DE_ALTA", 1, 39);
        aplicado(muni, "GRUPO_DADO_DE_ALTA", 2, 39);
        TenantContext.fijar(new MunicipalidadId(muni));
        aplicador.aplicar(evento("USUARIO_MODIFICADO", 1, usuario(1, "admin")));
        aplicador.aplicar(
                evento(
                        "GRUPO_MODIFICADO",
                        2,
                        "{\"grupoId\":2,\"nombre\":\"Administracion del sistema\","
                                + "\"descripcion\":null,\"habilitado\":true,"
                                + "\"vigenciaDesde\":null,\"vigenciaHasta\":null}"));
        assertThat(
                        texto(
                                "SELECT count(*) FROM usuario u, grupo g WHERE u.municipalidad_id = "
                                        + muni
                                        + " AND g.municipalidad_id = "
                                        + muni
                                        + " AND u.identidad_sujeto_id = 1 AND g.identidad_sujeto_id"
                                        + " = 2"))
                .as("adoptados los dos, como los adopta hoy la implantacion de `identidad`")
                .isEqualTo("1");

        assertThat(huerfanas.candidatas())
                .as(
                        "[lo sembrado es anterior a la primera corrida: ningun sujeto de"
                                + " `identidad` pudo dejarlo; sin esta exclusion el administrador de"
                                + " toda instalacion anterior a la etapa 5 gritaria cada cinco"
                                + " minutos para siempre]")
                .isEmpty();
    }

    @Test
    @DisplayName(
            "desafiliar al 200 y negarle el permiso heredado en `identidad` la saca de la lista en"
                    + " la corrida siguiente")
    void retirarLoHeredadoLaSacaDeLaLista() throws SQLException {
        long muni = crearMunicipalidad("213704");
        sembrarLaHerenciaDeJperez(muni);
        TenantContext.fijar(new MunicipalidadId(muni));
        aplicador.aplicar(evento("USUARIO_MODIFICADO", 200, usuario(200, "jperez")));
        assertThat(huerfanas.candidatas()).hasSize(1);

        // Los dos actos de `identidad` que el aviso propone, tal como los publica: desafiliar (una
        // baja, no un borrado) y fijar la excepcion sin privilegios.
        aplicador.aplicar(
                evento(
                        "MIEMBRO_DESAFILIADO",
                        3,
                        afiliacion(3, "Ventanilla", 200, "jperez")
                                .replace("\"activo\":true", "\"activo\":false")));
        assertThat(huerfanas.candidatas())
                .as("[queda el permiso: la fila sigue concediendo lo del 100]")
                .singleElement()
                .extracting(fila -> fila.heredado().size())
                .isEqualTo(1);
        aplicador.aplicar(evento("PERMISO_FIJADO", 200, permisoDeUsuario(200, "jperez", false)));

        assertThat(huerfanas.candidatas())
                .as("[una afiliacion inactiva y una excepcion que no concede nada no son herencia]")
                .isEmpty();
    }

    @Test
    @DisplayName("y inhabilitar al 200 tambien: una fila inhabilitada no concede nada")
    void inhabilitarLaSacaDeLaLista() throws SQLException {
        long muni = crearMunicipalidad("213705");
        sembrarLaHerenciaDeJperez(muni);
        TenantContext.fijar(new MunicipalidadId(muni));
        aplicador.aplicar(evento("USUARIO_MODIFICADO", 200, usuario(200, "jperez")));
        assertThat(huerfanas.candidatas()).hasSize(1);

        aplicador.aplicar(
                evento(
                        "USUARIO_MODIFICADO",
                        200,
                        usuario(200, "jperez")
                                .replace("\"habilitado\":true", "\"habilitado\":false")));

        assertThat(huerfanas.candidatas()).isEmpty();
    }

    @Test
    @DisplayName(
            "la corrida avisa UNA vez, por el registro y al responsable, con el contexto de la"
                    + " municipalidad del buzon, y lo deja como estaba; sin candidatas no avisa")
    void laCorridaAvisaAlResponsable() throws SQLException {
        long conHerencia = crearMunicipalidad("213706");
        sembrarLaHerenciaDeJperez(conHerencia);
        TenantContext.fijar(new MunicipalidadId(conHerencia));
        aplicador.aplicar(evento("USUARIO_MODIFICADO", 200, usuario(200, "jperez")));
        TenantContext.limpiar();
        long sinHerencia = crearMunicipalidad("213707");
        aplicado(sinHerencia, "USUARIO_DADO_DE_ALTA", 200, 10);

        ListAppender<ILoggingEvent> registro = new ListAppender<>();
        registro.start();
        ch.qos.logback.classic.Logger logger =
                (ch.qos.logback.classic.Logger)
                        LoggerFactory.getLogger(AlertaDeHuerfanasYaAdoptadasEnElRegistro.class);
        logger.addAppender(registro);
        try {
            AvisarDeLasHuerfanasYaAdoptadas conCandidatas = runner("213706");
            conCandidatas.run(new DefaultApplicationArguments());
            assertThat(TenantContext.actualSiHay())
                    .as("un proceso de vida corta limpia lo que fijo")
                    .isEmpty();
            assertThat(registro.list)
                    .as("[una linea de ERROR por corrida, no una por fila ni por herencia]")
                    .singleElement()
                    .satisfies(
                            linea -> {
                                assertThat(linea.getLevel()).isEqualTo(Level.ERROR);
                                assertThat(linea.getFormattedMessage())
                                        .contains("usuario «jperez»")
                                        .contains("sujeto 200 de `identidad`")
                                        .contains("miembro «Ventanilla»")
                                        .contains("permiso «" + ACCESO_DE_CAJA + "»")
                                        .contains("#137")
                                        .contains(
                                                "Responsable: Jefa de Tesoreria"
                                                        + " <tesoreria@municipalidad.gob.pe>");
                            });

            registro.list.clear();
            MunicipalidadId deQuienLlama = new MunicipalidadId(sinHerencia);
            TenantContext.fijar(deQuienLlama);
            assertThat(runner("213707").avisar())
                    .as(
                            "[la fila de la 213706 no se ve con el contexto de la 213707, aunque"
                                    + " aqui tambien haya un alta del sujeto 200]")
                    .isZero();
            assertThat(registro.list).as("sin candidatas, ni una linea").isEmpty();
            assertThat(TenantContext.actualSiHay())
                    .as("quien ya tenia contexto lo recupera: la implantacion llama en medio")
                    .contains(deQuienLlama);
        } finally {
            logger.detachAppender(registro);
        }
    }

    // ------------------------------------------------------------------

    /**
     * Lo que dejo el aplicador de la etapa 4 ({@code 5eacae1}) en la ventana 1 de #137, con las
     * fechas del pasado: el alta del 100 creo «jperez» hace 30 dias —la primera corrida—; al dia
     * siguiente lo afiliaron a «Ventanilla» y le dieron una excepcion sobre {@value
     * #ACCESO_DE_CAJA}; lo renombraron a «jperez.baja» (una fila nueva: el defecto de #111), y hace
     * 10 dias el alta del 200, un «jperez» nuevo, se fundio en la fila vieja por {@code ON CONFLICT
     * (municipalidad_id, cuenta) DO UPDATE}. V5 llego despues: la fila no tiene sujeto.
     */
    private static void sembrarLaHerenciaDeJperez(long muni) throws SQLException {
        aplicado(muni, "USUARIO_DADO_DE_ALTA", 100, 30);
        aplicado(muni, "GRUPO_DADO_DE_ALTA", 3, 30);
        ejecutar(
                "INSERT INTO grupo (municipalidad_id, identidad_sujeto_id, nombre) VALUES ("
                        + muni
                        + ", 3, 'Ventanilla')");
        permisoDeGrupoEnElPasado(muni, "Ventanilla", 29);
        ejecutar(
                "INSERT INTO usuario (municipalidad_id, cuenta, nombre, fecha_registro) VALUES ("
                        + muni
                        + ", 'jperez', 'Juan Perez', now() - interval '30 days')");
        afiliarEnElPasado(muni, "Ventanilla", "jperez", 29);
        ejecutar(
                "INSERT INTO permiso (municipalidad_id, acceso_id, usuario_id, lectura, registro,"
                        + " usuario_registro, fecha_registro) SELECT "
                        + muni
                        + ", a.id, u.id, true, true, 'admin', now() - interval '29 days'"
                        + " FROM acceso a, usuario u WHERE a.municipalidad_id = "
                        + muni
                        + " AND a.codigo = '"
                        + ACCESO_DE_CAJA
                        + "' AND u.municipalidad_id = "
                        + muni
                        + " AND u.cuenta = 'jperez'");
        ejecutar(
                "INSERT INTO usuario (municipalidad_id, identidad_sujeto_id, cuenta, nombre,"
                        + " habilitado, fecha_registro) VALUES ("
                        + muni
                        + ", 100, 'jperez.baja', 'Juan Perez', false, now() - interval '20 days')");
        aplicado(muni, "USUARIO_DADO_DE_ALTA", 200, 10);
    }

    private static AvisarDeLasHuerfanasYaAdoptadas runner(String ubigeo) {
        return new AvisarDeLasHuerfanasYaAdoptadas(
                huerfanas,
                new AlertaDeHuerfanasYaAdoptadasEnElRegistro(
                        "Jefa de Tesoreria", "tesoreria@municipalidad.gob.pe"),
                new RecorridoPorMunicipalidades(jdbc, gestor),
                "kamayuk-caja-servicio-" + ubigeo);
    }

    /** Un acuse de hace {@code dias} dias, como lo dejo una corrida de entonces. */
    private static void aplicado(long muni, String tipo, long sujeto, int dias)
            throws SQLException {
        ejecutar(
                "INSERT INTO identidad_evento_aplicado (municipalidad_id, evento_id, secuencia,"
                        + " tipo, sujeto_id, huella, aplicado_en) VALUES ("
                        + muni
                        + ", gen_random_uuid(), 1, '"
                        + tipo
                        + "', "
                        + sujeto
                        + ", 'de-una-corrida-de-entonces', now() - interval '"
                        + dias
                        + " days')");
    }

    private static void afiliarEnElPasado(long muni, String grupo, String cuenta, int dias)
            throws SQLException {
        ejecutar(
                "INSERT INTO miembro (municipalidad_id, grupo_id, usuario_id, usuario_alta,"
                        + " fecha_alta) SELECT "
                        + muni
                        + ", g.id, u.id, 'admin', now() - interval '"
                        + dias
                        + " days' FROM grupo g, usuario u WHERE g.municipalidad_id = "
                        + muni
                        + " AND g.nombre = '"
                        + grupo
                        + "' AND u.municipalidad_id = "
                        + muni
                        + " AND u.cuenta = '"
                        + cuenta
                        + "'");
    }

    private static void permisoDeGrupoEnElPasado(long muni, String grupo, int dias)
            throws SQLException {
        ejecutar(
                "INSERT INTO permiso (municipalidad_id, acceso_id, grupo_id, lectura,"
                        + " usuario_registro, fecha_registro) SELECT "
                        + muni
                        + ", a.id, g.id, true, 'admin', now() - interval '"
                        + dias
                        + " days' FROM acceso a, grupo g WHERE a.municipalidad_id = "
                        + muni
                        + " AND a.codigo = '"
                        + ACCESO_DE_CAJA
                        + "' AND g.municipalidad_id = "
                        + muni
                        + " AND g.nombre = '"
                        + grupo
                        + "'");
    }

    private static EventoDeIdentidadRecibido evento(String tipo, long sujeto, String cuerpo) {
        return new EventoDeIdentidadRecibido(
                UUID.randomUUID(), 1, tipo, sujeto, cuerpo, "f".repeat(64), Instant.now());
    }

    private static String usuario(long usuarioId, String cuenta) {
        return "{\"usuarioId\":"
                + usuarioId
                + ",\"cuenta\":\""
                + cuenta
                + "\",\"nombre\":\"Nombre de "
                + cuenta
                + "\",\"correo\":null,\"habilitado\":true,"
                + "\"vigenciaDesde\":null,\"vigenciaHasta\":null}";
    }

    private static String afiliacion(long grupoId, String grupo, long usuarioId, String cuenta) {
        return "{\"grupoId\":"
                + grupoId
                + ",\"grupoNombre\":\""
                + grupo
                + "\",\"usuarioId\":"
                + usuarioId
                + ",\"usuarioCuenta\":\""
                + cuenta
                + "\",\"activo\":true,\"usuarioAlta\":\"admin\",\"usuarioBaja\":null}";
    }

    private static String permisoDeUsuario(long usuarioId, String cuenta, boolean concede) {
        return "{\"sujeto\":\"USUARIO\",\"sujetoId\":"
                + usuarioId
                + ",\"sujetoNombre\":\""
                + cuenta
                + "\",\"sistema\":\"caja\",\"codigo\":\""
                + ACCESO_DE_CAJA
                + "\",\"privilegios\":{\"ejecucion\":false,\"lectura\":"
                + concede
                + ",\"registro\":"
                + concede
                + ",\"modificacion\":false,\"eliminacion\":false,\"impresion\":false,"
                + "\"especial\":false},\"usuarioRegistro\":\"admin\"}";
    }

    private static long crearMunicipalidad(String ubigeo) throws SQLException {
        try (Connection admin = base.conexionAdmin();
                Statement sentencia = admin.createStatement()) {
            sentencia.execute(
                    "INSERT INTO municipalidad (ubigeo, nombre, tipo) VALUES ('"
                            + ubigeo
                            + "', 'Municipalidad "
                            + ubigeo
                            + "', 'DISTRITAL')");
            long id;
            try (ResultSet fila =
                    sentencia.executeQuery(
                            "SELECT id FROM municipalidad WHERE ubigeo = '" + ubigeo + "'")) {
                fila.next();
                id = fila.getLong(1);
            }
            sentencia.execute(
                    "INSERT INTO modulo_sistema (municipalidad_id, codigo, nombre) VALUES ("
                            + id
                            + ", 'TESORERIA', 'Tesoreria')");
            sentencia.execute(
                    "INSERT INTO acceso (municipalidad_id, modulo_id, tipo, codigo, nombre)"
                            + " SELECT "
                            + id
                            + ", id, 'OPCION_MENU', '"
                            + ACCESO_DE_CAJA
                            + "', 'Caja tributaria' FROM modulo_sistema WHERE municipalidad_id = "
                            + id);
            return id;
        }
    }

    /** Escribe como superusuario, que omite la politica: es lo que no hace el aplicador de hoy. */
    private static void ejecutar(String sql) throws SQLException {
        try (Connection admin = base.conexionAdmin();
                Statement sentencia = admin.createStatement()) {
            sentencia.execute(sql);
        }
    }

    /** Lee como superusuario, que omite la politica: la consulta acota la municipalidad a mano. */
    private static String texto(String consulta) throws SQLException {
        try (Connection admin = base.conexionAdmin();
                Statement sentencia = admin.createStatement();
                ResultSet fila = sentencia.executeQuery(consulta)) {
            fila.next();
            return fila.getString(1);
        }
    }

    @SuppressWarnings("unchecked")
    private static <T> T envolver(T objetivo) {
        ProxyFactory fabrica = new ProxyFactory(objetivo);
        fabrica.setProxyTargetClass(true);
        fabrica.addAdvice(
                new TransactionInterceptor(gestor, new AnnotationTransactionAttributeSource()));
        return (T) fabrica.getProxy();
    }

    /** En estas pruebas nada se aparta, nada se pospone y ningun renombrado choca. */
    private static final class AlertaQueNoSeLlama implements AlertaDeEventosSinAplicar {
        @Override
        public void hayUnEventoSinAplicar(
                EventoDeIdentidadRecibido evento, String motivo, long apartados) {
            throw new AssertionError("no deberia apartarse nada: " + motivo);
        }

        @Override
        public void hayUnChoqueDeRenombrado(EventoDeIdentidadRecibido evento, String motivo) {
            throw new AssertionError("no deberia chocar nada: " + motivo);
        }

        @Override
        public void hayEventosPospuestos(
                List<EventoDeIdentidadRecibido> pospuestos, Instant ahora, Duration umbral) {
            throw new AssertionError("no deberia posponerse nada: " + pospuestos);
        }

        @Override
        public void hayFilasSinSujeto(
                List<FilaSinSujeto> queConceden, long queYaNoConceden, LocalDate hoy) {
            throw new AssertionError("el aplicador no avisa de filas sin sujeto: " + queConceden);
        }
    }
}
