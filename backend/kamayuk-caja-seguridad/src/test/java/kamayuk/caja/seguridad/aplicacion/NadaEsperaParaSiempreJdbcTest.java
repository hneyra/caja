package kamayuk.caja.seguridad.aplicacion;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import kamayuk.caja.autorizacion.Privilegio;
import kamayuk.caja.compartido.TenantContext;
import kamayuk.caja.esquema.BaseDeDatosDePrueba;
import kamayuk.caja.plataforma.RecorridoPorMunicipalidades;
import kamayuk.caja.plataforma.tenant.TenantTransactionManager;
import kamayuk.caja.seguridad.AlertaDeEventosSinAplicar;
import kamayuk.caja.seguridad.EventoDeIdentidadRecibido;
import kamayuk.caja.seguridad.FilaSinSujeto;
import kamayuk.caja.seguridad.FuenteDeEventosDeIdentidad;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import tools.jackson.databind.json.JsonMapper;

/**
 * <a href="https://github.com/hneyra/caja/issues/139">#139</a>: lo que no va a llegar nunca no
 * puede quedarse en cabeza del buzon de {@code identidad}, porque con {@value
 * ConsumirEventosDeIdentidad#POR_VUELTA} ahi la corrida no lee nada mas —tampoco la inhabilitacion
 * de un cajero—.
 *
 * <p>Con el runner, el consumidor y el aplicador de VERDAD contra PostgreSQL, y un buzon de mentira
 * que se porta como el de {@code identidad} en lo que aqui importa: sirve primero lo mas viejo sin
 * acusar ({@code ORDER BY e.id LIMIT :limite} en su {@code BuzonDeIdentidadJdbc}), respeta el
 * limite de la pagina y vuelve a servir lo que no se acusa. Un doble que sirviera todo de una vez
 * —como el de {@code ConsumirEventosDeIdentidadJdbcTest}— no podria tapar nada, y esta clase no
 * mediria el defecto.
 *
 * <p>Cada prueba en su propia municipalidad: la tabla de apartados es por municipalidad, y lo que
 * una prueba aparta no puede decidir lo que la siguiente aplica.
 */
@DisplayName("#139 — nada espera para siempre en cabeza del buzon de identidad")
class NadaEsperaParaSiempreJdbcTest {

    private static final Instant AHORA = Instant.parse("2026-09-29T15:00:00Z");
    private static final String HUELLA = "f".repeat(64);
    private static final String CODIGO_DE_CAJA = "caja_tributaria";

    private static BaseDeDatosDePrueba base;
    private static TenantTransactionManager gestor;
    private static JdbcClient jdbc;

    @BeforeAll
    static void provisionar() throws SQLException, IOException {
        base = BaseDeDatosDePrueba.provisionar();
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

    @AfterEach
    void limpiarContexto() {
        TenantContext.limpiar();
    }

    @Nested
    @DisplayName("lo que depende de un alta apartada se aparta con ella, sin esperar")
    class LosDependientesDeUnAltaApartada {

        @Test
        @DisplayName(
                "200 afiliaciones y permisos de una cuenta cuya alta se aparto por un cuerpo roto no"
                        + " impiden aplicar el evento 201, que inhabilita a un cajero")
        void losDoscientosNoTapanElBuzon() throws SQLException {
            Arnes arnes = new Arnes("213901");
            EventoDeIdentidadRecibido altaRota =
                    usuario(3, 3, "jperez", true, "\"31/12/2026\"", AHORA);
            arnes.buzon.sirve(
                    grupo(1, 1, "Cajeros", AHORA),
                    usuario(2, 2, "cajero.y", true, "null", AHORA),
                    altaRota);
            arnes.unaPasada();
            assertThat(arnes.contar("SELECT count(*) FROM identidad_evento_muerto"))
                    .as(
                            "la corrida anterior aparto el alta de «jperez» por su fecha, sin"
                                    + " choque de clave: es el camino que #130 no cubria")
                    .isEqualTo(1);

            // 200 eventos que nombran a «jperez» —alta, baja y permiso, como los publica
            // `identidad` cuando alguien lo afilia, lo desafilia y le fija un permiso— y, detras,
            // el que inhabilita a otro cajero. Todos recien emitidos: el plazo no los alcanza.
            long secuencia = 3;
            for (int i = 0; i < ConsumirEventosDeIdentidad.POR_VUELTA; i++) {
                ++secuencia;
                arnes.buzon.sirve(
                        switch (i % 3) {
                            case 0 -> miembro(secuencia, 1, "Cajeros", 3, "jperez", true, AHORA);
                            case 1 -> miembro(secuencia, 1, "Cajeros", 3, "jperez", false, AHORA);
                            default ->
                                    permiso(
                                            secuencia,
                                            "USUARIO",
                                            3,
                                            "jperez",
                                            CODIGO_DE_CAJA,
                                            AHORA);
                        });
            }
            arnes.buzon.sirve(usuario(++secuencia, 2, "cajero.y", false, "null", AHORA));
            arnes.alerta.apartados.clear();

            arnes.unaPasada();

            assertThat(arnes.habilitado("cajero.y"))
                    .as(
                            "[#139: el evento 201 inhabilita a «cajero.y» y tiene que aplicarse. Sin"
                                    + " el arreglo, los 200 de «jperez» se posponian —su alta no"
                                    + " esta, y no va a estar: se aparto y se acuso—, la pagina entera"
                                    + " quedaba pospuesta, la vuelta no progresaba y la corrida se"
                                    + " paraba ahi, en esta y en todas las siguientes]")
                    .isFalse();
            assertThat(arnes.buzon.pendientes())
                    .as("el buzon queda vacio: los 200 se acusaron al apartarse")
                    .isZero();
            assertThat(arnes.contar("SELECT count(*) FROM identidad_evento_muerto"))
                    .isEqualTo(1 + ConsumirEventosDeIdentidad.POR_VUELTA);
            assertThat(arnes.alerta.apartados)
                    .as("cada apartado se avisa al responsable, como cualquier otro")
                    .hasSize(ConsumirEventosDeIdentidad.POR_VUELTA);
            assertThat(
                            arnes.contar(
                                    "SELECT count(*) FROM identidad_evento_muerto WHERE motivo LIKE"
                                            + " '%su USUARIO_DADO_DE_ALTA se aparto aqui (evento "
                                            + altaRota.eventoId()
                                            + ", secuencia 3%'"))
                    .as(
                            "[y el motivo que queda escrito nombra el alta apartada de la que"
                                    + " dependian, con su evento y su secuencia: es lo que hay que ir a"
                                    + " mirar para resolverlo]")
                    .isEqualTo(ConsumirEventosDeIdentidad.POR_VUELTA);
            assertThat(arnes.contar("SELECT count(*) FROM miembro"))
                    .as("falla cerrado: ni una afiliacion de quien no tiene fila")
                    .isZero();
            assertThat(arnes.contar("SELECT count(*) FROM permiso")).isZero();
            assertThat(arnes.alerta.pospuestos)
                    .as("y nada quedo pospuesto: no se espera lo que no va a llegar")
                    .isEmpty();
        }

        @Test
        @DisplayName(
                "tambien del lado del grupo: la afiliacion a un grupo y el permiso de un grupo cuya"
                        + " alta se aparto se apartan en el primer intento")
        void delLadoDelGrupo() throws SQLException {
            Arnes arnes = new Arnes("213902");
            arnes.buzon.sirve(
                    usuario(1, 1, "mlopez", true, "null", AHORA),
                    grupoConCuerpo(
                            2,
                            5,
                            "{\"grupoId\":5,\"nombre\":\"Supervisores\",\"habilitado\":true,"
                                    + "\"vigenciaDesde\":null,\"vigenciaHasta\":\"nunca\"}",
                            AHORA),
                    miembro(3, 5, "Supervisores", 1, "mlopez", true, AHORA),
                    permiso(4, "GRUPO", 5, "Supervisores", CODIGO_DE_CAJA, AHORA));

            arnes.unaPasada();

            assertThat(arnes.alerta.apartados)
                    .as("el alta rota y sus dos dependientes, en ese orden y en la misma corrida")
                    .extracting(Apartado::tipo)
                    .containsExactly("GRUPO_DADO_DE_ALTA", "MIEMBRO_AFILIADO", "PERMISO_FIJADO");
            assertThat(arnes.alerta.apartados.get(1).motivo())
                    .contains("el grupo 5 («Supervisores»)")
                    .contains("su GRUPO_DADO_DE_ALTA se aparto aqui");
            assertThat(arnes.buzon.pendientes()).isZero();
            assertThat(arnes.alerta.pospuestos).isEmpty();
        }

        @Test
        @DisplayName(
                "CONTRASTE: la afiliacion de una cuenta de la que no se aparto nada sigue esperando"
                        + " —su alta puede no haber llegado—, y no se acusa")
        void sinAltaApartadaSigueEsperando() throws SQLException {
            Arnes arnes = new Arnes("213903");
            arnes.buzon.sirve(
                    grupo(1, 1, "Cajeros", AHORA),
                    usuario(2, 2, "rota", true, "\"ayer\"", AHORA),
                    // Nombra la cuenta 9, que no tiene ni alta aplicada ni alta apartada. El
                    // apartado de la 2 esta en la misma tabla: casar por otro sujeto lo delataria.
                    miembro(3, 1, "Cajeros", 9, "rcastro", true, AHORA));

            arnes.unaPasada();

            assertThat(arnes.alerta.apartados)
                    .extracting(Apartado::tipo)
                    .as("solo el alta rota")
                    .containsExactly("USUARIO_DADO_DE_ALTA");
            assertThat(arnes.buzon.pendientes())
                    .as(
                            "[la afiliacion de la cuenta 9 se queda en el buzon: esto no es «todo lo"
                                    + " que no esta se aparta», es «lo que depende de un alta que ya"
                                    + " se aparto»]")
                    .isEqualTo(1);
        }

        @Test
        @DisplayName(
                "CONTRASTE: si despues de apartarse su alta un *_MODIFICADO le dio fila, lo que la"
                        + " nombra se aplica")
        void conFilaYaNoDependeDelAlta() throws SQLException {
            Arnes arnes = new Arnes("213904");
            arnes.buzon.sirve(
                    grupo(1, 1, "Cajeros", AHORA),
                    usuario(2, 2, "aquispe", true, "\"2026-02-30\"", AHORA),
                    usuarioModificado(3, 2, "aquispe", true, AHORA),
                    miembro(4, 1, "Cajeros", 2, "aquispe", true, AHORA));

            arnes.unaPasada();

            assertThat(arnes.alerta.apartados)
                    .extracting(Apartado::tipo)
                    .containsExactly("USUARIO_DADO_DE_ALTA");
            assertThat(arnes.contar("SELECT count(*) FROM miembro"))
                    .as(
                            "[la modificacion le dio fila con su sujeto, asi que la afiliacion casa"
                                    + " por id y nunca llega a mirar los apartados: no se castiga a un"
                                    + " sujeto que ya se arreglo]")
                    .isEqualTo(1);
        }
    }

    /**
     * El plazo va escrito con cifras y no con la constante: lo que se declara es «una hora», y una
     * prueba que calculara sus instantes desde {@code MINUTOS_QUE_SE_ESPERA} seguiria en verde con
     * cualquier valor que alguien le pusiera.
     */
    @Nested
    @DisplayName("y lo que lleva una hora esperando se aparta, sea por lo que sea")
    class ElPlazo {

        private static final Duration UNA_HORA = Duration.ofMinutes(60);

        @Test
        @DisplayName(
                "200 afiliaciones a un grupo que nunca se publico, emitidas hace justo una hora, se"
                        + " apartan con su aviso y el evento 201 se aplica")
        void losQueCumplenElPlazoNoTapanElBuzon() throws SQLException {
            Arnes arnes = new Arnes("213905");
            cabezaQueNoVaALlegar(arnes, AHORA.minus(UNA_HORA));
            arnes.unaPasada();

            assertThat(arnes.habilitado("cajero.z"))
                    .as(
                            "[#139, el caso sin alta apartada —un grupo cuya alta nunca se publico,"
                                    + " un sobre que no cuadro con su cuerpo, un acceso que esta caja"
                                    + " no tiene—: ningun arreglo del aplicador lo reconoce, y solo el"
                                    + " plazo impide que 200 asi tapen el buzon para siempre]")
                    .isFalse();
            assertThat(arnes.buzon.pendientes()).isZero();
            assertThat(arnes.alerta.apartados)
                    .hasSize(ConsumirEventosDeIdentidad.POR_VUELTA)
                    .allSatisfy(
                            apartado ->
                                    assertThat(apartado.motivo())
                                            .contains("Llevaba 60 min sin poder aplicarse")
                                            .contains("el plazo es de 60")
                                            .contains("«Grupo que nunca llego»"));
            assertThat(arnes.alerta.pospuestos)
                    .as("lo apartado ya no es un pospuesto, y no se avisa dos veces")
                    .isEmpty();
        }

        @Test
        @DisplayName(
                "CONTRASTE: un segundo antes de la hora siguen esperando —y tapando, que es el precio"
                        + " declarado del plazo—, con el aviso de los quince minutos")
        void unSegundoAntesSiguenEsperando() throws SQLException {
            Arnes arnes = new Arnes("213906");
            cabezaQueNoVaALlegar(arnes, AHORA.minus(UNA_HORA).plusSeconds(1));
            arnes.unaPasada();

            assertThat(arnes.alerta.apartados)
                    .as(
                            "[dentro del plazo un pospuesto es un pospuesto: apartarlo antes perderia"
                                    + " lo que todavia puede llegar]")
                    .isEmpty();
            assertThat(arnes.buzon.pendientes())
                    .isEqualTo(ConsumirEventosDeIdentidad.POR_VUELTA + 1L);
            assertThat(arnes.habilitado("cajero.z"))
                    .as("la baja espera detras, como mucho hasta que venza el plazo")
                    .isTrue();
            assertThat(arnes.alerta.pospuestos)
                    .as("y el responsable ya lo sabe, una vez: pasan de quince minutos")
                    .hasSize(1);
            assertThat(arnes.alerta.pospuestos.getFirst())
                    .hasSize(ConsumirEventosDeIdentidad.POR_VUELTA);
        }

        /**
         * Da de alta a «cajero.z» y deja en el buzon 200 afiliaciones al grupo 77, que nunca se
         * publico, emitidas en {@code emitidas}; detras, la baja de «cajero.z», recien emitida.
         */
        private void cabezaQueNoVaALlegar(Arnes arnes, Instant emitidas) throws SQLException {
            arnes.buzon.sirve(usuario(1, 1, "cajero.z", true, "null", AHORA));
            arnes.unaPasada();
            assertThat(arnes.habilitado("cajero.z")).isTrue();
            long secuencia = 1;
            for (int i = 0; i < ConsumirEventosDeIdentidad.POR_VUELTA; i++) {
                arnes.buzon.sirve(
                        miembro(
                                ++secuencia,
                                77,
                                "Grupo que nunca llego",
                                1,
                                "cajero.z",
                                true,
                                emitidas));
            }
            arnes.buzon.sirve(usuario(++secuencia, 1, "cajero.z", false, "null", AHORA));
            arnes.alerta.apartados.clear();
            arnes.alerta.pospuestos.clear();
        }
    }

    // ------------------------------------------------------------------
    //  El arnes: una municipalidad, su buzon, su alerta y su runner.
    // ------------------------------------------------------------------

    private static final class Arnes {
        private final long municipalidad;
        private final BuzonComoElDeIdentidad buzon = new BuzonComoElDeIdentidad();
        private final AlertaQueAnota alerta = new AlertaQueAnota();
        private final CorrerElConsumidorDeIdentidad runner;

        Arnes(String ubigeo) throws SQLException {
            this.municipalidad = crearMunicipalidad(ubigeo);
            AplicarUnEventoDeIdentidad aplicador =
                    envolver(
                            new AplicarUnEventoDeIdentidad(
                                    jdbc,
                                    JsonMapper.builder().build(),
                                    Clock.fixed(AHORA, ZoneOffset.UTC),
                                    alerta));
            this.runner =
                    new CorrerElConsumidorDeIdentidad(
                            new ConsumirEventosDeIdentidad(
                                    buzon, aplicador, alerta, Clock.fixed(AHORA, ZoneOffset.UTC)),
                            registroCon(ubigeo, municipalidad),
                            "kamayuk-caja-servicio-" + ubigeo);
        }

        /** Una corrida entera, como la del {@code CronJob}. */
        void unaPasada() {
            runner.unaPasada();
        }

        long contar(String consulta) throws SQLException {
            String filtrada =
                    consulta
                            + (consulta.contains(" WHERE ") ? " AND" : " WHERE")
                            + " municipalidad_id = ?";
            try (Connection admin = base.conexionAdmin();
                    PreparedStatement sentencia = admin.prepareStatement(filtrada)) {
                sentencia.setLong(1, municipalidad);
                try (ResultSet fila = sentencia.executeQuery()) {
                    fila.next();
                    return fila.getLong(1);
                }
            }
        }

        boolean habilitado(String cuenta) throws SQLException {
            try (Connection admin = base.conexionAdmin();
                    PreparedStatement sentencia =
                            admin.prepareStatement(
                                    "SELECT habilitado FROM usuario WHERE municipalidad_id = ?"
                                            + " AND cuenta = ?")) {
                sentencia.setLong(1, municipalidad);
                sentencia.setString(2, cuenta);
                try (ResultSet fila = sentencia.executeQuery()) {
                    assertThat(fila.next()).as("la cuenta «" + cuenta + "» tiene fila").isTrue();
                    return fila.getBoolean(1);
                }
            }
        }
    }

    /**
     * Como el buzon de {@code identidad}: lo mas viejo sin acusar primero, como mucho {@code
     * limite}, y lo que no se acusa vuelve en la pagina siguiente. {@code quedan} con la pagina
     * dentro, que es lo que publica el emisor.
     */
    private static final class BuzonComoElDeIdentidad implements FuenteDeEventosDeIdentidad {
        private final List<EventoDeIdentidadRecibido> corriente = new ArrayList<>();
        private final Set<UUID> acusados = new HashSet<>();

        void sirve(EventoDeIdentidadRecibido... eventos) {
            corriente.addAll(List.of(eventos));
        }

        long pendientes() {
            return corriente.stream().filter(e -> !acusados.contains(e.eventoId())).count();
        }

        @Override
        public Lote pendientes(int limite) {
            List<EventoDeIdentidadRecibido> sinAcusar =
                    corriente.stream().filter(e -> !acusados.contains(e.eventoId())).toList();
            return new Lote(
                    sinAcusar.subList(0, Math.min(limite, sinAcusar.size())), sinAcusar.size());
        }

        @Override
        public Acuse acusar(List<UUID> eventoIds) {
            int escritos = 0;
            for (UUID id : eventoIds) {
                if (acusados.add(id)) {
                    escritos++;
                }
            }
            return new Acuse(eventoIds.size(), escritos, pendientes());
        }
    }

    private record Apartado(String tipo, String motivo) {}

    private static final class AlertaQueAnota implements AlertaDeEventosSinAplicar {
        private final List<Apartado> apartados = new ArrayList<>();
        private final List<List<EventoDeIdentidadRecibido>> pospuestos = new ArrayList<>();

        @Override
        public void hayUnEventoSinAplicar(
                EventoDeIdentidadRecibido evento, String motivo, long cuantos) {
            apartados.add(new Apartado(evento.tipoPublicado(), motivo));
        }

        @Override
        public void hayUnChoqueDeRenombrado(EventoDeIdentidadRecibido evento, String motivo) {
            throw new AssertionError("ningun renombrado de esta clase choca: " + motivo);
        }

        @Override
        public void hayEventosPospuestos(
                List<EventoDeIdentidadRecibido> lista, Instant ahora, Duration umbral) {
            pospuestos.add(List.copyOf(lista));
        }

        @Override
        public void hayFilasSinSujeto(
                List<FilaSinSujeto> queConceden, long queYaNoConceden, LocalDate hoy) {
            throw new AssertionError("toda fila de esta clase nace con su sujeto: " + queConceden);
        }
    }

    // ------------------------------------------------------------------
    //  Los eventos, con los cuerpos de `HechoDeIdentidad` (ver CorrienteDeIdentidad).
    // ------------------------------------------------------------------

    /**
     * @param vigenciaDesde el valor JSON tal cual: {@code null}, o una cadena entre comillas —que
     *     puede no ser una fecha, y entonces el alta se aparta por su cuerpo—
     */
    private static EventoDeIdentidadRecibido usuario(
            long secuencia,
            long usuarioId,
            String cuenta,
            boolean habilitado,
            String vigenciaDesde,
            Instant creadoEn) {
        return evento(
                secuencia,
                "USUARIO_DADO_DE_ALTA",
                usuarioId,
                cuerpoDeUsuario(usuarioId, cuenta, habilitado, vigenciaDesde),
                creadoEn);
    }

    /** La modificacion de un usuario: la fila entera, como el alta. */
    private static EventoDeIdentidadRecibido usuarioModificado(
            long secuencia, long usuarioId, String cuenta, boolean habilitado, Instant creadoEn) {
        return evento(
                secuencia,
                "USUARIO_MODIFICADO",
                usuarioId,
                cuerpoDeUsuario(usuarioId, cuenta, habilitado, "null"),
                creadoEn);
    }

    private static String cuerpoDeUsuario(
            long usuarioId, String cuenta, boolean habilitado, String vigenciaDesde) {
        return "{\"usuarioId\":"
                + usuarioId
                + ",\"cuenta\":\""
                + cuenta
                + "\",\"nombre\":\"Nombre de "
                + cuenta
                + "\",\"correo\":null,\"habilitado\":"
                + habilitado
                + ",\"vigenciaDesde\":"
                + vigenciaDesde
                + ",\"vigenciaHasta\":null}";
    }

    private static EventoDeIdentidadRecibido grupo(
            long secuencia, long grupoId, String nombre, Instant creadoEn) {
        return grupoConCuerpo(
                secuencia,
                grupoId,
                "{\"grupoId\":"
                        + grupoId
                        + ",\"nombre\":\""
                        + nombre
                        + "\",\"descripcion\":null,\"habilitado\":true,\"vigenciaDesde\":null,"
                        + "\"vigenciaHasta\":null}",
                creadoEn);
    }

    private static EventoDeIdentidadRecibido grupoConCuerpo(
            long secuencia, long grupoId, String cuerpo, Instant creadoEn) {
        return evento(secuencia, "GRUPO_DADO_DE_ALTA", grupoId, cuerpo, creadoEn);
    }

    private static EventoDeIdentidadRecibido miembro(
            long secuencia,
            long grupoId,
            String grupoNombre,
            long usuarioId,
            String cuenta,
            boolean activo,
            Instant creadoEn) {
        String cuerpo =
                "{\"grupoId\":"
                        + grupoId
                        + ",\"grupoNombre\":\""
                        + grupoNombre
                        + "\",\"usuarioId\":"
                        + usuarioId
                        + ",\"usuarioCuenta\":\""
                        + cuenta
                        + "\",\"activo\":"
                        + activo
                        + ",\"usuarioAlta\":\"admin\",\"usuarioBaja\":"
                        + (activo ? "null" : "\"admin\"")
                        + "}";
        // El sujeto de una afiliacion es el GRUPO, como en el emisor.
        return evento(
                secuencia,
                activo ? "MIEMBRO_AFILIADO" : "MIEMBRO_DESAFILIADO",
                grupoId,
                cuerpo,
                creadoEn);
    }

    private static EventoDeIdentidadRecibido permiso(
            long secuencia,
            String sujeto,
            long sujetoId,
            String sujetoNombre,
            String codigo,
            Instant creadoEn) {
        StringBuilder privilegios = new StringBuilder("{");
        for (Privilegio privilegio : Privilegio.values()) {
            if (privilegios.length() > 1) {
                privilegios.append(',');
            }
            privilegios.append('"').append(privilegio.columna()).append("\":true");
        }
        privilegios.append('}');
        String cuerpo =
                "{\"sujeto\":\""
                        + sujeto
                        + "\",\"sujetoId\":"
                        + sujetoId
                        + ",\"sujetoNombre\":\""
                        + sujetoNombre
                        + "\",\"sistema\":\"caja\",\"codigo\":\""
                        + codigo
                        + "\",\"privilegios\":"
                        + privilegios
                        + ",\"usuarioRegistro\":\"admin\"}";
        return evento(secuencia, "PERMISO_FIJADO", sujetoId, cuerpo, creadoEn);
    }

    private static EventoDeIdentidadRecibido evento(
            long secuencia, String tipo, long sujetoId, String cuerpo, Instant creadoEn) {
        return new EventoDeIdentidadRecibido(
                UUID.randomUUID(), secuencia, tipo, sujetoId, cuerpo, HUELLA, creadoEn);
    }

    // ------------------------------------------------------------------

    @SuppressWarnings("unchecked")
    private static <T> T envolver(T objetivo) {
        ProxyFactory fabrica = new ProxyFactory(objetivo);
        fabrica.setProxyTargetClass(true);
        fabrica.addAdvice(
                new TransactionInterceptor(gestor, new AnnotationTransactionAttributeSource()));
        return (T) fabrica.getProxy();
    }

    /** La municipalidad, con el acceso de caja que los permisos nombran. */
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
                            + CODIGO_DE_CAJA
                            + "', 'Caja tributaria' FROM modulo_sistema WHERE municipalidad_id = "
                            + id);
            return id;
        }
    }

    private static RecorridoPorMunicipalidades registroCon(String ubigeo, long id) {
        DriverManagerDataSource sinBase = new DriverManagerDataSource();
        return new RecorridoPorMunicipalidades(
                JdbcClient.create(sinBase), new DataSourceTransactionManager(sinBase)) {
            @Override
            public List<Municipalidad> activas() {
                return List.of(new Municipalidad(id, ubigeo, "Municipalidad " + ubigeo));
            }
        };
    }
}
