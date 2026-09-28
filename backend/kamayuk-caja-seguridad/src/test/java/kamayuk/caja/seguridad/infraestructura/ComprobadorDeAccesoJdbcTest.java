package kamayuk.caja.seguridad.infraestructura;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.LocalDate;
import kamayuk.caja.autorizacion.ComprobadorDeAcceso;
import kamayuk.caja.autorizacion.Privilegio;
import kamayuk.caja.compartido.TenantContext;
import kamayuk.caja.dominio.MunicipalidadId;
import kamayuk.caja.dominio.ZonaHoraria;
import kamayuk.caja.esquema.BaseDeDatosDePrueba;
import kamayuk.caja.plataforma.tenant.TenantTransactionManager;
import kamayuk.caja.seguridad.dominio.PlazoDeAdopcion;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * El comprobador de acceso de este sistema, contra PostgreSQL real y como {@code kamayuk_app}.
 *
 * <h2>Por que este sistema tiene el suyo (D-N5, que contesta D-19)</h2>
 *
 * <p>«Usuarios, grupos y permisos se definen en Keycloak; cada sistema guarda una copia local en
 * tabla y su guardia la consulta». Las cinco tablas estan replicadas en los cuatro baselines
 * (ADR-0032) precisamente para esto. La alternativa —preguntarle a {@code rentas} por HTTP en cada
 * {@code preHandle}— pone un viaje de red en el camino de toda peticion y deja este sistema sin
 * poder autorizar nada cuando el otro esta caido.
 *
 * <h2>Lo que se mide, y por que hace falta el motor</h2>
 *
 * <p>La precedencia vive en una expresion SQL —{@code COALESCE(la excepcion del usuario, la union
 * de sus grupos)}— y el aislamiento lo pone la politica RLS, no un {@code WHERE}. Un doble del
 * repositorio devolveria lo que se le pidiera; lo que hay que comprobar es lo que hace PostgreSQL.
 *
 * <p>Se conecta como {@code kamayuk_app} y no como {@code kamayuk_owner}: con {@code FORCE ROW
 * LEVEL SECURITY} el dueno tambien queda sujeto a la politica, asi que la rotura de aislamiento que
 * uno teclea por costumbre pasaria en verde y no demostraria nada (#537, #545, #601). Y el {@code
 * SET LOCAL} lo emite {@link TenantTransactionManager}, el de produccion, no la prueba.
 */
@DisplayName("C-7 — el comprobador de acceso de caja, contra su propia copia")
class ComprobadorDeAccesoJdbcTest {

    private static final LocalDate HOY = LocalDate.of(2026, 3, 16);
    private static final String ACCESO = "acceso_de_prueba";

    private static BaseDeDatosDePrueba base;
    private static TransactionTemplate transaccion;
    private static ComprobadorDeAcceso comprobador;

    private static long municipalidadA;
    private static long municipalidadB;

    @BeforeAll
    static void provisionar() throws SQLException, IOException {
        base = BaseDeDatosDePrueba.provisionar();
        municipalidadA = crearMunicipalidad("209901", "Municipalidad A");
        municipalidadB = crearMunicipalidad("209902", "Municipalidad B");

        DriverManagerDataSource pool = new DriverManagerDataSource();
        pool.setUrl(base.url());
        pool.setUsername(BaseDeDatosDePrueba.APP);
        pool.setPassword(base.clave(BaseDeDatosDePrueba.APP));

        transaccion = new TransactionTemplate(new TenantTransactionManager(pool));
        comprobador = new ComprobadorDeAccesoJdbc(JdbcClient.create(pool));

        // El MISMO escenario en las dos, con la MISMA cuenta: es lo que hace que una fuga de
        // aislamiento se vea. `usuario_cuenta_uq` es (municipalidad_id, cuenta), asi que dos
        // municipalidades pueden tener a «jperez» y son dos personas distintas.
        sembrar(municipalidadA, false);
        sembrar(municipalidadB, true);
        sembrarSinSujeto(municipalidadA);
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
    @DisplayName("el permiso del grupo autoriza")
    void elPermisoDelGrupoAutoriza() {
        assertThat(autorizaEn(municipalidadA, "jperez", Privilegio.LECTURA)).isTrue();
    }

    @Test
    @DisplayName("y el privilegio que el grupo no otorga, no")
    void loQueElGrupoNoOtorga() {
        assertThat(autorizaEn(municipalidadA, "jperez", Privilegio.ELIMINACION)).isFalse();
    }

    @Test
    @DisplayName("la excepcion del usuario SUSTITUYE al grupo, tambien para negar")
    void laExcepcionSustituye() {
        // «jperez» de B tiene el mismo grupo que el de A —con LECTURA— y ademas una excepcion que
        // la niega. Con una union pura esto saldria `true`, y quitarle un permiso a alguien
        // exigiria sacarlo del grupo y repetirle los demas a mano.
        assertThat(autorizaEn(municipalidadB, "jperez", Privilegio.LECTURA)).isFalse();
    }

    @Test
    @DisplayName("el aislamiento lo pone RLS: la misma cuenta contesta distinto en cada una")
    void elAislamientoLoPoneRls() {
        assertThat(autorizaEn(municipalidadA, "jperez", Privilegio.LECTURA)).isTrue();
        assertThat(autorizaEn(municipalidadB, "jperez", Privilegio.LECTURA))
                .as(
                        "lo unico que cambia entre las dos llamadas es el contexto de tenant: si"
                                + " esto fuera igual, la copia local de un sistema estaria contestando"
                                + " con los permisos de otra municipalidad")
                .isFalse();
    }

    @Test
    @DisplayName("y un usuario que no existe no autoriza nada")
    void unUsuarioQueNoExiste() {
        assertThat(autorizaEn(municipalidadA, "nadie", Privilegio.LECTURA)).isFalse();
    }

    // ------------------------------------------------------------------
    //  #125 — la fila sin sujeto de `identidad` concede solo durante su plazo
    // ------------------------------------------------------------------

    @Test
    @DisplayName(
            "#125: una cuenta sin sujeto concede mientras corre su plazo, el ultimo dia incluido")
    void unaCuentaSinSujetoConcedeDuranteSuPlazo() {
        assertThat(autorizaEn(municipalidadA, "sin.adoptar", Privilegio.LECTURA))
                .as(
                        "[fechada hace exactamente %d dias: hoy concede por ultima vez, como una"
                                + " vigencia]",
                        PlazoDeAdopcion.DIAS)
                .isTrue();
    }

    @Test
    @DisplayName(
            "#125: una cuenta sin sujeto con el plazo vencido NO concede, aunque este habilitada"
                    + " y su grupo conceda")
    void unaCuentaHuerfanaNoConcede() {
        assertThat(autorizaEn(municipalidadA, "huerfana", Privilegio.LECTURA))
                .as(
                        "[la huerfana de #111: la clave vieja de un renombrado, habilitada, en el"
                                + " mismo grupo que jperez. Ningun evento la va a tocar, y hasta"
                                + " #125 concedia para siempre]")
                .isFalse();
    }

    @Test
    @DisplayName("#125: una cuenta sin sujeto y sin fecha —escrita despues de V6— no concede nunca")
    void unaCuentaSinSujetoNiFechaNoConcede() {
        assertThat(autorizaEn(municipalidadA, "sin.fecha", Privilegio.LECTURA)).isFalse();
    }

    @Test
    @DisplayName("#125: una cuenta CON sujeto concede aunque su fecha de V6 sea vieja")
    void unaCuentaConSujetoNoSeVeAfectada() {
        assertThat(autorizaEn(municipalidadA, "adoptada", Privilegio.LECTURA))
                .as("[adoptada: el plazo solo corre mientras falta el sujeto]")
                .isTrue();
    }

    @Test
    @DisplayName(
            "#125: un grupo sin sujeto con el plazo vencido no le concede nada a sus miembros, y"
                    + " uno que aun esta en plazo si")
    void unGrupoHuerfanoNoConcede() {
        assertThat(autorizaEn(municipalidadA, "de.grupo.huerfano", Privilegio.LECTURA))
                .as(
                        "[«Cajeros» renombrado a «Cajeros-baja» antes de #111: la fila vieja se"
                                + " quedo habilitada con sus miembros y sus permisos]")
                .isFalse();
        assertThat(autorizaEn(municipalidadA, "de.grupo.sin.adoptar", Privilegio.LECTURA)).isTrue();
    }

    private boolean autorizaEn(long municipalidad, String cuenta, Privilegio privilegio) {
        TenantContext.fijar(new MunicipalidadId(municipalidad));
        Boolean resultado =
                transaccion.execute(
                        estado -> comprobador.autoriza(cuenta, ACCESO, privilegio, HOY));
        return Boolean.TRUE.equals(resultado);
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

    /** Se siembra como superusuario a proposito: lo que esta bajo prueba es la LECTURA. */
    private static void sembrar(long municipalidad, boolean conExcepcionQueNiega)
            throws SQLException {
        try (Connection admin = base.conexionAdmin();
                Statement s = admin.createStatement()) {
            s.execute(
                    "INSERT INTO modulo_sistema (municipalidad_id, codigo, nombre) VALUES ("
                            + municipalidad
                            + ", 'PRUEBA', 'Modulo de prueba')");
            s.execute(
                    "INSERT INTO acceso (municipalidad_id, modulo_id, tipo, codigo, nombre)"
                            + " SELECT "
                            + municipalidad
                            + ", id, 'OPCION_MENU', '"
                            + ACCESO
                            + "', 'Acceso de prueba' FROM modulo_sistema WHERE municipalidad_id = "
                            + municipalidad
                            + " AND codigo = 'PRUEBA'");
            s.execute(
                    "INSERT INTO grupo (municipalidad_id, identidad_sujeto_id, nombre) VALUES ("
                            + municipalidad
                            + ", 1, 'Grupo de prueba')");
            s.execute(
                    "INSERT INTO usuario (municipalidad_id, identidad_sujeto_id, cuenta, nombre)"
                            + " VALUES ("
                            + municipalidad
                            + ", 1, 'jperez', 'Juan Perez')");
            s.execute(
                    "INSERT INTO miembro (municipalidad_id, grupo_id, usuario_id, usuario_alta)"
                            + " SELECT "
                            + municipalidad
                            + ", g.id, u.id, 'prueba' FROM grupo g, usuario u"
                            + " WHERE g.municipalidad_id = "
                            + municipalidad
                            + " AND u.municipalidad_id = "
                            + municipalidad
                            + " AND g.nombre = 'Grupo de prueba' AND u.cuenta = 'jperez'");
            s.execute(
                    "INSERT INTO permiso (municipalidad_id, acceso_id, grupo_id, lectura,"
                            + " usuario_registro) SELECT "
                            + municipalidad
                            + ", a.id, g.id, true, 'prueba' FROM acceso a, grupo g"
                            + " WHERE a.municipalidad_id = "
                            + municipalidad
                            + " AND g.municipalidad_id = "
                            + municipalidad
                            + " AND a.codigo = '"
                            + ACCESO
                            + "' AND g.nombre = 'Grupo de prueba'");
            if (conExcepcionQueNiega) {
                s.execute(
                        "INSERT INTO permiso (municipalidad_id, acceso_id, usuario_id, lectura,"
                                + " usuario_registro) SELECT "
                                + municipalidad
                                + ", a.id, u.id, false, 'prueba' FROM acceso a, usuario u"
                                + " WHERE a.municipalidad_id = "
                                + municipalidad
                                + " AND u.municipalidad_id = "
                                + municipalidad
                                + " AND a.codigo = '"
                                + ACCESO
                                + "' AND u.cuenta = 'jperez'");
            }
        }
    }

    /**
     * #125: las filas sin sujeto de {@code identidad}, con el {@code sin_sujeto_desde} que les
     * habria puesto V6. Todas habilitadas y todas afiliadas a un grupo que concede LECTURA: lo
     * unico que las distingue es el sujeto y la fecha.
     */
    private static void sembrarSinSujeto(long m) throws SQLException {
        // El ultimo instante del dia que ya no concede, y el primero del que todavia si, en LIMA:
        // un corte a la medianoche UTC —las 19:00 del dia anterior en Lima— los confundiria.
        String ultimoDia = "'" + ZonaHoraria.comienzoDelDia(PlazoDeAdopcion.corte(HOY)) + "'";
        String vencida =
                "'" + ZonaHoraria.comienzoDelDia(PlazoDeAdopcion.corte(HOY)).minusSeconds(1) + "'";
        String haceMucho = "'" + ZonaHoraria.comienzoDelDia(HOY.minusDays(40)) + "'";
        try (Connection admin = base.conexionAdmin();
                Statement s = admin.createStatement()) {
            s.execute(
                    "INSERT INTO usuario (municipalidad_id, identidad_sujeto_id, cuenta, nombre,"
                            + " sin_sujeto_desde) VALUES"
                            + " ("
                            + m
                            + ", NULL, 'huerfana', 'Clave vieja de un renombrado', "
                            + vencida
                            + "), ("
                            + m
                            + ", NULL, 'sin.adoptar', 'Espera su primer evento', "
                            + ultimoDia
                            + "), ("
                            + m
                            + ", NULL, 'sin.fecha', 'Escrita despues de V6', NULL), ("
                            + m
                            + ", 2, 'adoptada', 'Ya adoptada', "
                            + haceMucho
                            + "), ("
                            + m
                            + ", 3, 'de.grupo.huerfano', 'Solo en el grupo huerfano', NULL), ("
                            + m
                            + ", 4, 'de.grupo.sin.adoptar', 'Solo en el grupo en plazo', NULL)");
            s.execute(
                    "INSERT INTO grupo (municipalidad_id, identidad_sujeto_id, nombre,"
                            + " sin_sujeto_desde) VALUES ("
                            + m
                            + ", NULL, 'Cajeros', "
                            + vencida
                            + "), ("
                            + m
                            + ", NULL, 'Sin adoptar', "
                            + ultimoDia
                            + ")");
            afiliar(s, m, "Grupo de prueba", "huerfana");
            afiliar(s, m, "Grupo de prueba", "sin.adoptar");
            afiliar(s, m, "Grupo de prueba", "sin.fecha");
            afiliar(s, m, "Grupo de prueba", "adoptada");
            afiliar(s, m, "Cajeros", "de.grupo.huerfano");
            afiliar(s, m, "Sin adoptar", "de.grupo.sin.adoptar");
            for (String grupo : new String[] {"Cajeros", "Sin adoptar"}) {
                s.execute(
                        "INSERT INTO permiso (municipalidad_id, acceso_id, grupo_id, lectura,"
                                + " usuario_registro) SELECT "
                                + m
                                + ", a.id, g.id, true, 'prueba' FROM acceso a, grupo g"
                                + " WHERE a.municipalidad_id = "
                                + m
                                + " AND g.municipalidad_id = "
                                + m
                                + " AND a.codigo = '"
                                + ACCESO
                                + "' AND g.nombre = '"
                                + grupo
                                + "'");
            }
        }
    }

    private static void afiliar(Statement s, long m, String grupo, String cuenta)
            throws SQLException {
        s.execute(
                "INSERT INTO miembro (municipalidad_id, grupo_id, usuario_id, usuario_alta)"
                        + " SELECT "
                        + m
                        + ", g.id, u.id, 'prueba' FROM grupo g, usuario u"
                        + " WHERE g.municipalidad_id = "
                        + m
                        + " AND u.municipalidad_id = "
                        + m
                        + " AND g.nombre = '"
                        + grupo
                        + "' AND u.cuenta = '"
                        + cuenta
                        + "'");
    }
}
