package kamayuk.caja.seguridad.aplicacion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.catchThrowable;

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
import java.util.UUID;
import kamayuk.caja.autorizacion.Privilegio;
import kamayuk.caja.compartido.TenantContext;
import kamayuk.caja.dominio.MunicipalidadId;
import kamayuk.caja.esquema.BaseDeDatosDePrueba;
import kamayuk.caja.plataforma.tenant.TenantTransactionManager;
import kamayuk.caja.seguridad.EventoDeIdentidadRecibido;
import kamayuk.caja.seguridad.infraestructura.ComprobadorDeAccesoJdbc;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

/**
 * El aplicador de UN evento del buzon de {@code identidad}, contra PostgreSQL de verdad y como
 * {@code kamayuk_app} bajo la politica (ADR-0039 etapa 4).
 *
 * <p>Contra un doble no se puede demostrar ninguna de las tres cosas que importan: que el acuse
 * local y la fila entran en la MISMA transaccion, que una segunda entrega del mismo evento no
 * escribe nada, y que dos municipalidades no comparten una transaccion. El aplicador se envuelve en
 * un {@link TransactionInterceptor} de verdad, para que lo que se mida sea su anotacion y no un
 * {@code TransactionTemplate} de la prueba — la leccion R2 de la etapa 2 de {@code identidad}: un
 * {@code @Transactional} sobre un objeto que nadie proxifica es un comentario.
 */
@DisplayName("Etapa 4 — aplicar un evento de identidad a la copia local")
class AplicarUnEventoDeIdentidadJdbcTest {

    private static final Instant AHORA = Instant.parse("2026-09-09T15:00:00Z");
    private static final String ACCESO_DE_CAJA = "caja_tributaria";
    private static final String HUELLA = "f".repeat(64);

    private static BaseDeDatosDePrueba base;
    private static TenantTransactionManager gestor;
    private static AplicarUnEventoDeIdentidad aplicador;
    private static long municipalidadA;
    private static long municipalidadB;

    @BeforeAll
    static void provisionar() throws SQLException, IOException {
        base = BaseDeDatosDePrueba.provisionar();
        municipalidadA = crearMunicipalidad("209901", "Municipalidad A");
        municipalidadB = crearMunicipalidad("209902", "Municipalidad B");
        sembrarElCatalogo(municipalidadA);
        sembrarElCatalogo(municipalidadB);

        DriverManagerDataSource pool = new DriverManagerDataSource();
        pool.setUrl(base.url());
        pool.setUsername(BaseDeDatosDePrueba.APP);
        pool.setPassword(base.clave(BaseDeDatosDePrueba.APP));
        gestor = new TenantTransactionManager(pool);
        aplicador =
                envolver(
                        new AplicarUnEventoDeIdentidad(
                                JdbcClient.create(pool),
                                JsonMapper.builder().build(),
                                Clock.fixed(AHORA, ZoneOffset.UTC)),
                        gestor);
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

    @Nested
    @DisplayName("un usuario")
    class UnUsuario {

        @Test
        @DisplayName(
                "se da de alta con lo que el evento trae, y una segunda entrega no escribe nada")
        void seDaDeAltaYNoSeRepite() throws SQLException {
            EventoDeIdentidadRecibido alta =
                    evento(
                            1,
                            "USUARIO_DADO_DE_ALTA",
                            "{\"usuarioId\":7,\"cuenta\":\"mlopez\",\"nombre\":\"Maria"
                                    + " Lopez\",\"correo\":\"mlopez@muni.gob.pe\","
                                    + "\"habilitado\":true,\"vigenciaDesde\":\"2026-01-01\","
                                    + "\"vigenciaHasta\":null}");
            TenantContext.fijar(new MunicipalidadId(municipalidadA));

            assertThat(aplicador.aplicar(alta))
                    .isEqualTo(AplicarUnEventoDeIdentidad.Aplicacion.APLICADO);
            assertThat(aplicador.aplicar(alta))
                    .as("la entrega es al menos una vez: la segunda se descarta por el acuse local")
                    .isEqualTo(AplicarUnEventoDeIdentidad.Aplicacion.YA_APLICADO);

            assertThat(contar(municipalidadA, "usuario", "cuenta = 'mlopez'")).isEqualTo(1);
            assertThat(
                            leerTexto(
                                    municipalidadA,
                                    "SELECT correo FROM usuario WHERE municipalidad_id = {muni} AND cuenta = 'mlopez'"))
                    .isEqualTo("mlopez@muni.gob.pe");
            assertThat(
                            contar(
                                    municipalidadA,
                                    "identidad_evento_aplicado",
                                    "evento_id = '" + alta.eventoId() + "'"))
                    .as("el acuse local queda en la misma transaccion que la fila")
                    .isEqualTo(1);
        }

        @Test
        @DisplayName(
                "y una modificacion —la baja incluida— se aplica como lo que es, no como un borrado")
        void unaModificacionEsUnaModificacion() throws SQLException {
            TenantContext.fijar(new MunicipalidadId(municipalidadA));
            aplicador.aplicar(
                    evento(
                            2,
                            "USUARIO_DADO_DE_ALTA",
                            "{\"usuarioId\":8,\"cuenta\":\"jquispe\",\"nombre\":\"Jose"
                                    + " Quispe\",\"correo\":null,\"habilitado\":true,"
                                    + "\"vigenciaDesde\":null,\"vigenciaHasta\":null}"));
            aplicador.aplicar(
                    evento(
                            3,
                            "USUARIO_MODIFICADO",
                            "{\"usuarioId\":8,\"cuenta\":\"jquispe\",\"nombre\":\"Jose"
                                    + " Quispe Huaman\",\"correo\":null,\"habilitado\":false,"
                                    + "\"vigenciaDesde\":null,\"vigenciaHasta\":\"2026-08-31\"}"));

            assertThat(contar(municipalidadA, "usuario", "cuenta = 'jquispe'"))
                    .as("una baja no borra: la fila sigue, inhabilitada (regla 4)")
                    .isEqualTo(1);
            assertThat(
                            leerTexto(
                                    municipalidadA,
                                    "SELECT nombre || '|' || habilitado || '|' || vigencia_hasta"
                                            + " FROM usuario WHERE municipalidad_id = {muni} AND"
                                            + " cuenta = 'jquispe'"))
                    .isEqualTo("Jose Quispe Huaman|false|2026-08-31");
        }
    }

    @Nested
    @DisplayName("una afiliacion")
    class UnaAfiliacion {

        @Test
        @DisplayName("entra cuando su grupo y su usuario ya estan, y la desafiliacion es una baja")
        void entraYSeDaDeBaja() throws SQLException {
            TenantContext.fijar(new MunicipalidadId(municipalidadA));
            aplicador.aplicar(
                    evento(
                            10,
                            "GRUPO_DADO_DE_ALTA",
                            "{\"grupoId\":3,\"nombre\":\"Cajeros\",\"descripcion\":\"La"
                                    + " ventanilla\",\"habilitado\":true,\"vigenciaDesde\":null,"
                                    + "\"vigenciaHasta\":null}"));
            aplicador.aplicar(
                    evento(
                            11,
                            "USUARIO_DADO_DE_ALTA",
                            "{\"usuarioId\":9,\"cuenta\":\"rcastro\",\"nombre\":\"Rosa"
                                    + " Castro\",\"correo\":null,\"habilitado\":true,"
                                    + "\"vigenciaDesde\":null,\"vigenciaHasta\":null}"));
            aplicador.aplicar(
                    evento(
                            12,
                            "MIEMBRO_AFILIADO",
                            "{\"grupoId\":3,\"grupoNombre\":\"Cajeros\",\"usuarioId\":9,"
                                    + "\"usuarioCuenta\":\"rcastro\",\"activo\":true,"
                                    + "\"usuarioAlta\":\"admin\",\"usuarioBaja\":null}"));

            assertThat(
                            leerTexto(
                                    municipalidadA,
                                    "SELECT m.activo || '|' || m.usuario_alta FROM miembro m JOIN"
                                            + " grupo g ON g.id = m.grupo_id JOIN usuario u ON u.id ="
                                            + " m.usuario_id WHERE m.municipalidad_id = {muni} AND"
                                            + " g.nombre = 'Cajeros' AND u.cuenta = 'rcastro'"))
                    .isEqualTo("true|admin");

            aplicador.aplicar(
                    evento(
                            13,
                            "MIEMBRO_DESAFILIADO",
                            "{\"grupoId\":3,\"grupoNombre\":\"Cajeros\",\"usuarioId\":9,"
                                    + "\"usuarioCuenta\":\"rcastro\",\"activo\":false,"
                                    + "\"usuarioAlta\":null,\"usuarioBaja\":\"admin\"}"));

            assertThat(
                            leerTexto(
                                    municipalidadA,
                                    "SELECT m.activo || '|' || m.usuario_baja || '|' ||"
                                            + " (m.fecha_baja IS NOT NULL) FROM miembro m JOIN grupo"
                                            + " g ON g.id = m.grupo_id JOIN usuario u ON u.id ="
                                            + " m.usuario_id WHERE m.municipalidad_id = {muni} AND"
                                            + " g.nombre = 'Cajeros' AND u.cuenta = 'rcastro'"))
                    .as("la baja se aplica como baja: la fila sigue, inactiva y fechada")
                    .isEqualTo("false|admin|true");
        }

        @Test
        @DisplayName("y la que llega ANTES que su grupo no se aplica, no se acusa y no se pierde")
        void laQueLlegaAntesQueSuGrupoEspera() throws SQLException {
            TenantContext.fijar(new MunicipalidadId(municipalidadA));
            EventoDeIdentidadRecibido afiliacion =
                    evento(
                            20,
                            "MIEMBRO_AFILIADO",
                            "{\"grupoId\":99,\"grupoNombre\":\"Grupo que todavia no"
                                    + " llego\",\"usuarioId\":9,\"usuarioCuenta\":\"nadie\","
                                    + "\"activo\":true,\"usuarioAlta\":\"admin\","
                                    + "\"usuarioBaja\":null}");

            Throwable todaviaNo = catchThrowable(() -> aplicador.aplicar(afiliacion));

            assertThat(todaviaNo)
                    .as(
                            "un INSERT ... SELECT que no encuentra a quien nombra escribe cero filas"
                                    + " SIN protestar: descartarlo en silencio dejaria la copia"
                                    + " desatrasada sin que nada lo diga")
                    .isInstanceOf(AplicarUnEventoDeIdentidad.TodaviaNo.class)
                    .hasMessageContaining("Grupo que todavia no llego")
                    .hasMessageContaining("nadie");
            assertThat(
                            contar(
                                    municipalidadA,
                                    "identidad_evento_aplicado",
                                    "evento_id = '" + afiliacion.eventoId() + "'"))
                    .as(
                            "la transaccion se deshizo ENTERA: sin acuse local, para que el buzon"
                                    + " lo vuelva a servir")
                    .isZero();
        }
    }

    @Nested
    @DisplayName("un permiso")
    class UnPermiso {

        @Test
        @DisplayName("de esta caja se fija con sus siete privilegios sobre el grupo que nombra")
        void deEstaCajaSeFija() throws SQLException {
            TenantContext.fijar(new MunicipalidadId(municipalidadA));
            aplicador.aplicar(
                    evento(
                            30,
                            "GRUPO_DADO_DE_ALTA",
                            "{\"grupoId\":4,\"nombre\":\"Supervisores\",\"descripcion\":null,"
                                    + "\"habilitado\":true,\"vigenciaDesde\":null,"
                                    + "\"vigenciaHasta\":null}"));
            aplicador.aplicar(evento(31, "PERMISO_FIJADO", permiso("caja", "Supervisores", true)));

            assertThat(
                            leerTexto(
                                    municipalidadA,
                                    "SELECT p.lectura || '|' || p.registro || '|' || p.eliminacion"
                                            + " || '|' || p.especial || '|' || p.usuario_registro"
                                            + " FROM permiso p JOIN acceso a ON a.id = p.acceso_id"
                                            + " JOIN grupo g ON g.id = p.grupo_id WHERE p.municipalidad_id"
                                            + " = {muni} AND a.codigo = '"
                                            + ACCESO_DE_CAJA
                                            + "' AND g.nombre = 'Supervisores'"))
                    .isEqualTo("true|true|false|false|admin");

            // Fijarlo otra vez con otra matriz lo ACTUALIZA: es la matriz que quedo en identidad.
            aplicador.aplicar(evento(32, "PERMISO_FIJADO", permiso("caja", "Supervisores", false)));
            assertThat(
                            leerTexto(
                                    municipalidadA,
                                    "SELECT p.lectura || '|' || p.registro FROM permiso p JOIN"
                                            + " acceso a ON a.id = p.acceso_id JOIN grupo g ON g.id ="
                                            + " p.grupo_id WHERE p.municipalidad_id = {muni} AND a.codigo = '"
                                            + ACCESO_DE_CAJA
                                            + "' AND g.nombre = 'Supervisores'"))
                    .isEqualTo("false|false");
        }

        @Test
        @DisplayName("de OTRO sistema con el mismo codigo se ignora, se acusa y no toca la copia")
        void deOtroSistemaSeIgnora() throws SQLException {
            TenantContext.fijar(new MunicipalidadId(municipalidadA));
            aplicador.aplicar(
                    evento(
                            40,
                            "GRUPO_DADO_DE_ALTA",
                            "{\"grupoId\":5,\"nombre\":\"Fiscalizadores\",\"descripcion\":null,"
                                    + "\"habilitado\":true,\"vigenciaDesde\":null,"
                                    + "\"vigenciaHasta\":null}"));
            EventoDeIdentidadRecibido ajeno =
                    evento(41, "PERMISO_FIJADO", permiso("rentas", "Fiscalizadores", true));

            assertThat(aplicador.aplicar(ajeno))
                    .isEqualTo(AplicarUnEventoDeIdentidad.Aplicacion.IGNORADO_AJENO);

            assertThat(
                            Long.parseLong(
                                    leerTexto(
                                            municipalidadA,
                                            "SELECT count(*) FROM permiso p JOIN grupo g ON g.id ="
                                                    + " p.grupo_id WHERE p.municipalidad_id = {muni}"
                                                    + " AND g.nombre = 'Fiscalizadores'")))
                    .as(
                            "«"
                                    + ACCESO_DE_CAJA
                                    + "» existe en esta caja con ese mismo codigo: aplicarlo «por"
                                    + " el codigo» seria conceder aqui lo que se concedio en"
                                    + " `rentas` (AC-7 #4)")
                    .isZero();
            assertThat(
                            contar(
                                    municipalidadA,
                                    "identidad_evento_aplicado",
                                    "evento_id = '" + ajeno.eventoId() + "'"))
                    .as("se acusa, para que el buzon no lo vuelva a servir")
                    .isEqualTo(1);
        }
    }

    /**
     * #111: {@code identidad} renombra cuentas y grupos ({@code UPDATE … SET cuenta}, {@code UPDATE
     * … SET nombre}) y publica el {@code *_MODIFICADO} con la clave NUEVA. Casar solo por la clave
     * natural insertaba una fila nueva y dejaba la vieja habilitada, con sus miembros y sus
     * permisos. El identificador de {@code identidad} —el {@code usuarioId}/{@code grupoId} del
     * cuerpo, que no cambia con el renombrado— es lo que casa ahora.
     */
    @Nested
    @DisplayName("#111 — un renombrado en identidad")
    class UnRenombrado {

        @Test
        @DisplayName(
                "renombrar y luego inhabilitar un GRUPO deja una sola fila, inhabilitada, y el comprobador niega")
        void unGrupoRenombradoEInhabilitado() throws SQLException {
            TenantContext.fijar(new MunicipalidadId(municipalidadA));
            aplicador.aplicar(evento(100, "GRUPO_DADO_DE_ALTA", grupo(20, "Recaudadores", true)));
            aplicador.aplicar(evento(101, "USUARIO_DADO_DE_ALTA", usuario(30, "lvargas", true)));
            aplicador.aplicar(
                    evento(102, "MIEMBRO_AFILIADO", afiliacion(20, "Recaudadores", 30, "lvargas")));
            aplicador.aplicar(evento(103, "PERMISO_FIJADO", permisoDeGrupo(20, "Recaudadores")));
            assertThat(autoriza("lvargas"))
                    .as("antes del renombrado el grupo concede: si no, la prueba no mide nada")
                    .isTrue();

            aplicador.aplicar(
                    evento(104, "GRUPO_MODIFICADO", grupo(20, "Recaudadores-baja", true)));
            aplicador.aplicar(
                    evento(105, "GRUPO_MODIFICADO", grupo(20, "Recaudadores-baja", false)));

            assertThat(contar(municipalidadA, "grupo", "nombre LIKE 'Recaudadores%'"))
                    .as(
                            "[el renombrado se aplica a la MISMA fila: una segunda fila deja la"
                                    + " vieja habilitada con sus miembros y sus permisos]")
                    .isEqualTo(1);
            assertThat(
                            leerTexto(
                                    municipalidadA,
                                    "SELECT nombre || '|' || habilitado || '|' ||"
                                            + " identidad_sujeto_id FROM grupo WHERE"
                                            + " municipalidad_id = {muni} AND nombre LIKE"
                                            + " 'Recaudadores%'"))
                    .isEqualTo("Recaudadores-baja|false|20");
            assertThat(autoriza("lvargas"))
                    .as(
                            "[«Recaudadores» sigue concediendo `caja_tributaria` aunque identidad lo"
                                    + " renombro y lo inhabilito]")
                    .isFalse();
        }

        @Test
        @DisplayName(
                "renombrar y luego inhabilitar una CUENTA deja una sola fila, inhabilitada, y el comprobador niega a las dos cuentas")
        void unaCuentaRenombradaEInhabilitada() throws SQLException {
            TenantContext.fijar(new MunicipalidadId(municipalidadA));
            aplicador.aplicar(evento(110, "GRUPO_DADO_DE_ALTA", grupo(21, "Tesoreros", true)));
            aplicador.aplicar(evento(111, "USUARIO_DADO_DE_ALTA", usuario(31, "ctorres", true)));
            aplicador.aplicar(
                    evento(112, "MIEMBRO_AFILIADO", afiliacion(21, "Tesoreros", 31, "ctorres")));
            aplicador.aplicar(evento(113, "PERMISO_FIJADO", permisoDeGrupo(21, "Tesoreros")));
            assertThat(autoriza("ctorres")).isTrue();

            aplicador.aplicar(
                    evento(114, "USUARIO_MODIFICADO", usuario(31, "ctorres-anterior", true)));
            aplicador.aplicar(
                    evento(115, "USUARIO_MODIFICADO", usuario(31, "ctorres-anterior", false)));

            assertThat(contar(municipalidadA, "usuario", "cuenta LIKE 'ctorres%'"))
                    .as("[una fila nueva por la cuenta nueva, y la vieja intacta]")
                    .isEqualTo(1);
            assertThat(
                            leerTexto(
                                    municipalidadA,
                                    "SELECT cuenta || '|' || habilitado || '|' ||"
                                            + " identidad_sujeto_id FROM usuario WHERE"
                                            + " municipalidad_id = {muni} AND cuenta LIKE"
                                            + " 'ctorres%'"))
                    .isEqualTo("ctorres-anterior|false|31");
            assertThat(autoriza("ctorres"))
                    .as(
                            "[la cuenta vieja sigue habilitada con los permisos de antes: quien la"
                                    + " reciba despues los hereda, porque el guardia casa por"
                                    + " u.cuenta]")
                    .isFalse();
            assertThat(autoriza("ctorres-anterior")).isFalse();
        }

        @Test
        @DisplayName(
                "una afiliacion casa por el id: nombrando el grupo por su nombre viejo o por el nuevo")
        void unaAfiliacionCasaPorElId() throws SQLException {
            TenantContext.fijar(new MunicipalidadId(municipalidadA));
            aplicador.aplicar(evento(120, "GRUPO_DADO_DE_ALTA", grupo(22, "Cobradores", true)));
            aplicador.aplicar(evento(121, "USUARIO_DADO_DE_ALTA", usuario(32, "aramos", true)));
            aplicador.aplicar(evento(122, "USUARIO_DADO_DE_ALTA", usuario(33, "bsilva", true)));
            aplicador.aplicar(
                    evento(123, "GRUPO_MODIFICADO", grupo(22, "Cobradores de campo", true)));

            // Emitida ANTES del renombrado (el nombre viejo) y aplicada despues —la que se quedo
            // esperando en el buzon—, y emitida DESPUES (el nombre nuevo).
            aplicador.aplicar(
                    evento(124, "MIEMBRO_AFILIADO", afiliacion(22, "Cobradores", 32, "aramos")));
            aplicador.aplicar(
                    evento(
                            125,
                            "MIEMBRO_AFILIADO",
                            afiliacion(22, "Cobradores de campo", 33, "bsilva")));

            assertThat(
                            contar(
                                    municipalidadA,
                                    "miembro",
                                    "grupo_id = (SELECT id FROM grupo WHERE municipalidad_id = "
                                            + municipalidadA
                                            + " AND identidad_sujeto_id = 22) AND activo"))
                    .isEqualTo(2);
        }

        @Test
        @DisplayName(
                "un renombrado que se sirve dos veces se descarta la segunda, y sigue habiendo una fila")
        void unRenombradoRepetidoEsIdempotente() throws SQLException {
            TenantContext.fijar(new MunicipalidadId(municipalidadA));
            aplicador.aplicar(evento(130, "GRUPO_DADO_DE_ALTA", grupo(23, "Arqueadores", true)));
            EventoDeIdentidadRecibido renombrado =
                    evento(131, "GRUPO_MODIFICADO", grupo(23, "Arqueadores-2", true));

            assertThat(aplicador.aplicar(renombrado))
                    .isEqualTo(AplicarUnEventoDeIdentidad.Aplicacion.APLICADO);
            assertThat(aplicador.aplicar(renombrado))
                    .isEqualTo(AplicarUnEventoDeIdentidad.Aplicacion.YA_APLICADO);
            assertThat(contar(municipalidadA, "grupo", "nombre LIKE 'Arqueadores%'")).isEqualTo(1);
        }

        @Test
        @DisplayName(
                "una fila de antes de V5, sin id de identidad, se adopta en su primer evento y desde ahi se renombra")
        void unaFilaSinIdSeAdopta() throws SQLException {
            // Como la dejo la implantacion de antes de la etapa 5, o el aplicador de antes de V5.
            ejecutarComoAdmin(
                    "INSERT INTO grupo (municipalidad_id, nombre, habilitado) VALUES ("
                            + municipalidadA
                            + ", 'Heredados', true)");
            ejecutarComoAdmin(
                    "INSERT INTO usuario (municipalidad_id, cuenta, nombre) VALUES ("
                            + municipalidadA
                            + ", 'heredada', 'Cuenta heredada')");
            TenantContext.fijar(new MunicipalidadId(municipalidadA));

            aplicador.aplicar(evento(140, "GRUPO_MODIFICADO", grupo(24, "Heredados", false)));
            aplicador.aplicar(evento(141, "USUARIO_MODIFICADO", usuario(34, "heredada", false)));

            assertThat(
                            leerTexto(
                                    municipalidadA,
                                    "SELECT count(*) || '|' || bool_or(habilitado) || '|' ||"
                                            + " max(identidad_sujeto_id) FROM grupo WHERE"
                                            + " municipalidad_id = {muni} AND nombre ="
                                            + " 'Heredados'"))
                    .as("adoptada: la misma fila, con el id estampado y el estado del evento")
                    .isEqualTo("1|false|24");
            assertThat(
                            leerTexto(
                                    municipalidadA,
                                    "SELECT count(*) || '|' || bool_or(habilitado) || '|' ||"
                                            + " max(identidad_sujeto_id) FROM usuario WHERE"
                                            + " municipalidad_id = {muni} AND cuenta ="
                                            + " 'heredada'"))
                    .isEqualTo("1|false|34");

            aplicador.aplicar(evento(142, "GRUPO_MODIFICADO", grupo(24, "Heredados-2", false)));
            assertThat(contar(municipalidadA, "grupo", "nombre LIKE 'Heredados%'"))
                    .as("y una vez adoptada, el renombrado va a la misma fila")
                    .isEqualTo(1);
        }

        @Test
        @DisplayName(
                "renombrar sobre una fila huerfana sin id que ya tiene ese nombre no se aplica nunca, y lo dice")
        void renombrarSobreUnaHuerfanaNoSeAplica() throws SQLException {
            ejecutarComoAdmin(
                    "INSERT INTO grupo (municipalidad_id, nombre, habilitado) VALUES ("
                            + municipalidadA
                            + ", 'Beta', true)");
            TenantContext.fijar(new MunicipalidadId(municipalidadA));
            aplicador.aplicar(evento(150, "GRUPO_DADO_DE_ALTA", grupo(25, "Alfa", true)));
            EventoDeIdentidadRecibido renombrado =
                    evento(151, "GRUPO_MODIFICADO", grupo(25, "Beta", false));

            assertThatThrownBy(() -> aplicador.aplicar(renombrado))
                    .isInstanceOf(AplicarUnEventoDeIdentidad.NoSePuedeAplicar.class)
                    .hasMessageContaining("«Beta»")
                    .hasMessageContaining("25");
            assertThat(
                            contar(
                                    municipalidadA,
                                    "identidad_evento_aplicado",
                                    "evento_id = '" + renombrado.eventoId() + "'"))
                    .isZero();
            assertThat(contar(municipalidadA, "grupo", "nombre = 'Alfa' AND habilitado"))
                    .as("nada se escribio a medias")
                    .isEqualTo(1);
        }

        @Test
        @DisplayName(
                "un alta cuyo nombre ya es de OTRO sujeto de identidad en esta copia no se aplica nunca")
        void unNombreDeOtroSujetoNoSeAplica() {
            TenantContext.fijar(new MunicipalidadId(municipalidadA));
            aplicador.aplicar(evento(160, "GRUPO_DADO_DE_ALTA", grupo(26, "Gamma", true)));

            assertThatThrownBy(
                            () ->
                                    aplicador.aplicar(
                                            evento(
                                                    161,
                                                    "GRUPO_DADO_DE_ALTA",
                                                    grupo(27, "Gamma", true))))
                    .isInstanceOf(AplicarUnEventoDeIdentidad.NoSePuedeAplicar.class)
                    .hasMessageContaining("«Gamma»")
                    .hasMessageContaining("26")
                    .hasMessageContaining("27");
        }

        @Test
        @DisplayName("un cuerpo sin el id de identidad no se aplica nunca")
        void unCuerpoSinId() {
            TenantContext.fijar(new MunicipalidadId(municipalidadA));
            assertThatThrownBy(
                            () ->
                                    aplicador.aplicar(
                                            evento(
                                                    170,
                                                    "GRUPO_DADO_DE_ALTA",
                                                    "{\"nombre\":\"Sin id\",\"habilitado\":true}")))
                    .isInstanceOf(AplicarUnEventoDeIdentidad.NoSePuedeAplicar.class)
                    .hasMessageContaining("grupoId");
        }

        private boolean autoriza(String cuenta) {
            ComprobadorDeAccesoJdbc comprobador =
                    new ComprobadorDeAccesoJdbc(JdbcClient.create(gestor.getDataSource()));
            return Boolean.TRUE.equals(
                    new TransactionTemplate(gestor)
                            .execute(
                                    estado ->
                                            comprobador.autoriza(
                                                    cuenta,
                                                    ACCESO_DE_CAJA,
                                                    Privilegio.LECTURA,
                                                    LocalDate.of(2026, 9, 9))));
        }
    }

    @Nested
    @DisplayName("lo que no se podra aplicar nunca")
    class LoQueNoSePodraAplicarNunca {

        @Test
        @DisplayName(
                "un tipo que esta copia no conoce se rechaza nombrandolo, y no deja acuse local")
        void unTipoDesconocido() throws SQLException {
            TenantContext.fijar(new MunicipalidadId(municipalidadA));
            EventoDeIdentidadRecibido octavo = evento(50, "SISTEMA_DADO_DE_ALTA", "{}");

            assertThatThrownBy(() -> aplicador.aplicar(octavo))
                    .isInstanceOf(AplicarUnEventoDeIdentidad.NoSePuedeAplicar.class)
                    .hasMessageContaining("SISTEMA_DADO_DE_ALTA");
            assertThat(
                            contar(
                                    municipalidadA,
                                    "identidad_evento_aplicado",
                                    "evento_id = '" + octavo.eventoId() + "'"))
                    .isZero();
        }

        @Test
        @DisplayName("un cuerpo que no es JSON, igual; y apartarlo guarda el cuerpo ENTERO")
        void unCuerpoIlegibleSeAparta() throws SQLException {
            TenantContext.fijar(new MunicipalidadId(municipalidadA));
            EventoDeIdentidadRecibido roto = evento(51, "USUARIO_DADO_DE_ALTA", "esto no es json");

            Throwable nunca = catchThrowable(() -> aplicador.aplicar(roto));
            assertThat(nunca).isInstanceOf(AplicarUnEventoDeIdentidad.NoSePuedeAplicar.class);

            long antes = aplicador.apartados();
            aplicador.apartar(roto, nunca.getMessage());
            aplicador.apartar(roto, nunca.getMessage());

            assertThat(aplicador.apartados()).isEqualTo(antes + 1);
            assertThat(
                            leerTexto(
                                    municipalidadA,
                                    "SELECT cuerpo || '|' || tipo || '|' || secuencia FROM"
                                            + " identidad_evento_muerto WHERE municipalidad_id ="
                                            + " {muni} AND evento_id = '"
                                            + roto.eventoId()
                                            + "'"))
                    .as("lo que se aparta se guarda entero, para poder aplicarlo a mano")
                    .isEqualTo("esto no es json|USUARIO_DADO_DE_ALTA|51");
        }

        @Test
        @DisplayName("y un cuerpo sin la clave con la que se casa, tambien")
        void unCuerpoSinSuClave() {
            TenantContext.fijar(new MunicipalidadId(municipalidadA));
            assertThatThrownBy(
                            () ->
                                    aplicador.aplicar(
                                            evento(
                                                    52,
                                                    "USUARIO_DADO_DE_ALTA",
                                                    "{\"usuarioId\":1,\"nombre\":\"Sin cuenta\"}")))
                    .isInstanceOf(AplicarUnEventoDeIdentidad.NoSePuedeAplicar.class)
                    .hasMessageContaining("cuenta");
        }
    }

    @Nested
    @DisplayName("dos municipalidades")
    class DosMunicipalidades {

        @Test
        @DisplayName("no comparten transaccion: cada evento abre la suya con SU contexto (AC-7 #2)")
        void noCompartenTransaccion() throws SQLException {
            EventoDeIdentidadRecibido deA =
                    evento(
                            60,
                            "USUARIO_DADO_DE_ALTA",
                            "{\"usuarioId\":1,\"cuenta\":\"compartida\",\"nombre\":\"La de"
                                    + " A\",\"correo\":null,\"habilitado\":true,"
                                    + "\"vigenciaDesde\":null,\"vigenciaHasta\":null}");
            EventoDeIdentidadRecibido deB =
                    evento(
                            60,
                            "USUARIO_DADO_DE_ALTA",
                            "{\"usuarioId\":1,\"cuenta\":\"compartida\",\"nombre\":\"La de"
                                    + " B\",\"correo\":null,\"habilitado\":true,"
                                    + "\"vigenciaDesde\":null,\"vigenciaHasta\":null}");

            // Una transaccion ABIERTA por fuera, con el contexto de A, y dentro de ella el
            // aplicador atendiendo a las dos municipalidades. Es lo que pasaria si el consumidor
            // envolviera la vuelta en una transaccion y cambiara de municipalidad a mitad: con
            // `REQUIRES_NEW` cada evento abre la suya y el SET LOCAL es el de su contexto; con
            // `REQUIRED` el segundo se uniria a la de A y la fila de B caeria en A.
            TenantContext.fijar(new MunicipalidadId(municipalidadA));
            new TransactionTemplate(gestor)
                    .executeWithoutResult(
                            estado -> {
                                aplicador.aplicar(deA);
                                TenantContext.fijar(new MunicipalidadId(municipalidadB));
                                aplicador.aplicar(deB);
                            });

            assertThat(
                            leerTexto(
                                    municipalidadA,
                                    "SELECT nombre FROM usuario WHERE municipalidad_id = {muni} AND"
                                            + " cuenta = 'compartida'"))
                    .isEqualTo("La de A");
            assertThat(
                            leerTexto(
                                    municipalidadB,
                                    "SELECT nombre FROM usuario WHERE municipalidad_id = {muni} AND"
                                            + " cuenta = 'compartida'"))
                    .as(
                            "la fila de B tiene que estar en B: si estuviera en A, dos"
                                    + " municipalidades habrian compartido una transaccion y la"
                                    + " copia de una llevaria la cuenta de la otra")
                    .isEqualTo("La de B");
            assertThat(contar(municipalidadA, "usuario", "cuenta = 'compartida'")).isEqualTo(1);
        }
    }

    // ------------------------------------------------------------------

    private static EventoDeIdentidadRecibido evento(long secuencia, String tipo, String cuerpo) {
        return new EventoDeIdentidadRecibido(
                UUID.randomUUID(), secuencia, tipo, 1L, cuerpo, HUELLA, AHORA);
    }

    private static String permiso(String sistema, String grupo, boolean lecturaYRegistro) {
        return "{\"sujeto\":\"GRUPO\",\"sujetoId\":4,\"sujetoNombre\":\""
                + grupo
                + "\",\"sistema\":\""
                + sistema
                + "\",\"codigo\":\""
                + ACCESO_DE_CAJA
                + "\",\"privilegios\":{\"ejecucion\":false,\"lectura\":"
                + lecturaYRegistro
                + ",\"registro\":"
                + lecturaYRegistro
                + ",\"modificacion\":false,\"eliminacion\":false,\"impresion\":false,"
                + "\"especial\":false},\"usuarioRegistro\":\"admin\"}";
    }

    private static String grupo(long grupoId, String nombre, boolean habilitado) {
        return "{\"grupoId\":"
                + grupoId
                + ",\"nombre\":\""
                + nombre
                + "\",\"descripcion\":null,\"habilitado\":"
                + habilitado
                + ",\"vigenciaDesde\":null,\"vigenciaHasta\":null}";
    }

    private static String usuario(long usuarioId, String cuenta, boolean habilitado) {
        return "{\"usuarioId\":"
                + usuarioId
                + ",\"cuenta\":\""
                + cuenta
                + "\",\"nombre\":\"Nombre de "
                + cuenta
                + "\",\"correo\":null,\"habilitado\":"
                + habilitado
                + ",\"vigenciaDesde\":null,\"vigenciaHasta\":null}";
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

    private static String permisoDeGrupo(long grupoId, String grupo) {
        return permiso("caja", grupo, true).replace("\"sujetoId\":4", "\"sujetoId\":" + grupoId);
    }

    private static void ejecutarComoAdmin(String sql) throws SQLException {
        try (Connection admin = base.conexionAdmin();
                Statement sentencia = admin.createStatement()) {
            sentencia.execute(sql);
        }
    }

    @SuppressWarnings("unchecked")
    private static <T> T envolver(T objetivo, TenantTransactionManager gestor) {
        ProxyFactory fabrica = new ProxyFactory(objetivo);
        fabrica.setProxyTargetClass(true);
        fabrica.addAdvice(
                new TransactionInterceptor(gestor, new AnnotationTransactionAttributeSource()));
        return (T) fabrica.getProxy();
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

    /** El catalogo lo siembra la implantacion, no el buzon: aqui se pone a mano. */
    private static void sembrarElCatalogo(long municipalidad) throws SQLException {
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
                            + ", id, 'OPCION_MENU', '"
                            + ACCESO_DE_CAJA
                            + "', 'Caja tributaria' FROM modulo_sistema WHERE municipalidad_id = "
                            + municipalidad);
        }
    }

    /**
     * Lee como superusuario —que omite la politica— y acota a mano: es la que puede ver las dos.
     */
    private static long contar(long municipalidad, String de, String condicion)
            throws SQLException {
        try (Connection admin = base.conexionAdmin();
                PreparedStatement sentencia =
                        admin.prepareStatement(
                                "SELECT count(*) FROM "
                                        + de
                                        + " WHERE municipalidad_id = "
                                        + municipalidad
                                        + " AND ("
                                        + condicion
                                        + ")");
                ResultSet fila = sentencia.executeQuery()) {
            fila.next();
            return fila.getLong(1);
        }
    }

    private static String leerTexto(long municipalidad, String consulta) throws SQLException {
        String sql = consulta.replace("{muni}", String.valueOf(municipalidad));
        try (Connection admin = base.conexionAdmin();
                PreparedStatement sentencia = admin.prepareStatement(sql);
                ResultSet fila = sentencia.executeQuery()) {
            assertThat(fila.next()).as("una fila para: " + sql).isTrue();
            return fila.getString(1);
        }
    }
}
