package kamayuk.caja.nucleo.aplicacion;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicReference;
import javax.sql.DataSource;
import kamayuk.caja.auditoria.AuditoriaJdbc;
import kamayuk.caja.auditoria.Origen;
import kamayuk.caja.auditoria.OrigenContext;
import kamayuk.caja.compartido.TenantContext;
import kamayuk.caja.dominio.Dinero;
import kamayuk.caja.dominio.MunicipalidadId;
import kamayuk.caja.dominio.Observacion;
import kamayuk.caja.esquema.BaseDeDatosDePrueba;
import kamayuk.caja.esquema.ContextoDeTenant;
import kamayuk.caja.nucleo.dominio.BuzonDelSistemaDeOrigen;
import kamayuk.caja.nucleo.dominio.EventoDePago;
import kamayuk.caja.nucleo.dominio.FormaDePago;
import kamayuk.caja.nucleo.dominio.Pagador;
import kamayuk.caja.nucleo.dominio.SistemaDeOrigen;
import kamayuk.caja.nucleo.infraestructura.BuzonDeSalidaJdbc;
import kamayuk.caja.nucleo.infraestructura.CajaRepositoryJdbc;
import kamayuk.caja.nucleo.infraestructura.ComponedorDeEventosJson;
import kamayuk.caja.nucleo.infraestructura.OrdenDeCobroRepositoryJdbc;
import kamayuk.caja.nucleo.infraestructura.PublicadorDelBuzon;
import kamayuk.caja.nucleo.infraestructura.ReciboRepositoryJdbc;
import kamayuk.caja.nucleo.infraestructura.TurnoDeCajaRepositoryJdbc;
import kamayuk.caja.plataforma.RecorridoPorMunicipalidades;
import kamayuk.caja.plataforma.tenant.TenantTransactionManager;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.aop.support.AopUtils;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.MapPropertySource;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import tools.jackson.databind.json.JsonMapper;

/**
 * #109 — <b>cada evento del buzon se entrega en su propia transaccion, de verdad</b>, y lo mide un
 * contexto de Spring con sus proxies, no una clase construida a mano.
 *
 * <h2>El defecto que esto mide</h2>
 *
 * <p>Hasta #109 {@code EntregarEventos.entregarPendientes} llamaba a su propio {@code entregarUno},
 * anotado {@code @Transactional(REQUIRES_NEW)}. En modo proxy —el proyecto no usa AspectJ— una
 * llamada desde dentro de la clase no pasa por el interceptor, asi que el {@code REQUIRES_NEW} no
 * se aplicaba nunca: la vuelta entera de una municipalidad corria en <b>una</b> transaccion, la de
 * {@link RecorridoPorMunicipalidades}, con el {@code FOR UPDATE} de los cincuenta tomado durante
 * todos los {@code POST}. Una {@code RuntimeException} que no fuera {@code NoContesta} ni {@code
 * Rechazado} en el evento 2 deshacia la rama: el 1, ya entregado, volvia a PENDIENTE, y el 2 no
 * gastaba intento, asi que no moria nunca y, primero en el {@code ORDER BY id}, atascaba el buzon.
 *
 * <h2>Por que con un contexto de Spring</h2>
 *
 * <p>Las pruebas de antes construian {@code new EntregarEventos(...)} —o lo envolvian a mano— y lo
 * llamaban dentro de su propia transaccion: la autoinvocacion no se ve asi. Aqui las piezas las
 * cablea un {@link AnnotationConfigApplicationContext} con {@link EnableTransactionManagement}, y
 * la vuelta la da {@link PublicadorDelBuzon#publicar()} —el metodo que planifica el perfil {@code
 * publicador}— sobre el recorrido de produccion, contra PostgreSQL y como {@code kamayuk_app}.
 *
 * <h2>Y lo que se mira desde fuera, mientras el evento 2 esta «en la red»</h2>
 *
 * <p>El destino de mentira, al recibir el evento 2, abre <b>otra conexion</b> y pregunta dos cosas:
 * si el evento 1 ya se ve ENTREGADO —o sea, si su transaccion ya hizo {@code COMMIT}— y si {@code
 * pago_evento} se puede bloquear en exclusiva sin esperar —o sea, si nadie retiene un candado sobre
 * el buzon mientras dura la llamada—. Las dos respuestas se anotan y se comprueban despues.
 */
@DisplayName("#109 — cada evento del buzon se entrega en su propia transaccion")
class CadaEventoEnSuTransaccionTest {

    private static final Clock RELOJ =
            Clock.fixed(Instant.parse("2026-03-16T14:00:00Z"), ZoneOffset.UTC);

    private static final LocalDate HOY = LocalDate.of(2026, 3, 16);

    private static final SistemaDeOrigen RENTAS = SistemaDeOrigen.de("rentas");

    /** Dos, para que la segunda vuelta que falla mate el evento. */
    private static final int INTENTOS = 2;

    private static BaseDeDatosDePrueba base;
    private static long municipalidad;
    private static AnnotationConfigApplicationContext contexto;
    private static DestinoDeMentira destino;
    private static AlertaEnMemoria alerta;
    private static PublicadorDelBuzon publicador;

    @BeforeAll
    static void levantar() throws SQLException, IOException {
        base = BaseDeDatosDePrueba.provisionar();
        municipalidad = crearMunicipalidad("250301", "Municipalidad del publicador");
        sembrarVentanilla();

        DriverManagerDataSource pool = new DriverManagerDataSource();
        pool.setUrl(base.url());
        pool.setUsername(BaseDeDatosDePrueba.APP);
        pool.setPassword(base.clave(BaseDeDatosDePrueba.APP));

        destino = new DestinoDeMentira();
        alerta = new AlertaEnMemoria();

        contexto = new AnnotationConfigApplicationContext();
        contexto.getEnvironment()
                .getPropertySources()
                .addFirst(
                        new MapPropertySource(
                                "prueba", Map.of("kamayuk.caja.entrega.intentos", INTENTOS)));
        contexto.registerBean(DataSource.class, () -> pool);
        contexto.registerBean(
                PlatformTransactionManager.class, () -> new TenantTransactionManager(pool));
        contexto.registerBean(JdbcClient.class, () -> JdbcClient.create(pool));
        contexto.registerBean(Clock.class, () -> RELOJ);
        contexto.registerBean(JsonMapper.class, () -> new JsonMapper());
        contexto.registerBean(BuzonDelSistemaDeOrigen.class, () -> destino);
        contexto.registerBean(AlertaDeCobrosSinImputar.class, () -> alerta);
        contexto.register(
                ConTransacciones.class,
                AuditoriaJdbc.class,
                ComponedorDeEventosJson.class,
                BuzonDeSalidaJdbc.class,
                CajaRepositoryJdbc.class,
                TurnoDeCajaRepositoryJdbc.class,
                OrdenDeCobroRepositoryJdbc.class,
                ReciboRepositoryJdbc.class,
                RegistrarOrdenDeCobro.class,
                AbrirCaja.class,
                CobrarOrdenes.class,
                RecorridoPorMunicipalidades.class);
        registrarLaEntrega(contexto);
        contexto.refresh();

        // El publicador se construye con las piezas del contexto y no se registra: su clase lleva
        // @EnableScheduling, y registrado planificaria vueltas solas en medio de la prueba.
        publicador =
                new PublicadorDelBuzon(
                        contexto.getBean(EntregarEventos.class),
                        contexto.getBean(RecorridoPorMunicipalidades.class));
    }

    /** Lo que entrega, tal como lo cablearia el perfil {@code publicador}. */
    private static void registrarLaEntrega(AnnotationConfigApplicationContext contexto) {
        contexto.register(AnotarLaEntrega.class, EntregarEventos.class);
    }

    @AfterAll
    static void cerrar() {
        if (contexto != null) {
            contexto.close();
        }
        if (base != null) {
            base.close();
        }
    }

    @AfterEach
    void limpiarContexto() {
        TenantContext.limpiar();
        OrigenContext.limpiar();
    }

    @Test
    @DisplayName("el contexto envuelve la entrega en un proxy transaccional de verdad")
    void laEntregaVaEnvuelta() {
        // Si esto fallara, lo de abajo mediria una clase desnuda y no la anotacion.
        assertThat(AopUtils.isAopProxy(contexto.getBean(AnotarLaEntrega.class))).isTrue();
    }

    @Test
    @DisplayName(
            "si el evento 2 de 3 revienta de forma inesperada, el 1 y el 3 quedan ENTREGADOS y el 2"
                    + " suma un intento")
    void elDosRevientaYLosOtrosQuedan() {
        List<UUID> pagos = cobrarTres("A");
        destino.queFallan.add(pagos.get(1));
        destino.espiado.set(pagos);

        publicador.publicar();

        assertThat(estadoDe(pagos.get(0)))
                .as(
                        "el 1 ya se entrego: si la vuelta fuera UNA transaccion, el fallo del 2 lo"
                                + " devolveria a PENDIENTE y se entregaria otra vez")
                .isEqualTo(new Fila("ENTREGADO", 1));
        assertThat(estadoDe(pagos.get(1)))
                .as(
                        "el 2 revento con algo que no es NoContesta ni Rechazado, y aun asi gasta"
                                + " su intento: sin eso no llega nunca a MUERTO y atasca el buzon")
                .isEqualTo(new Fila("PENDIENTE", 1));
        assertThat(errorDe(pagos.get(1))).contains("IllegalArgumentException");
        assertThat(estadoDe(pagos.get(2)))
                .as("y el 3 se entrega en la misma vuelta: el fallo del 2 no corta el lote")
                .isEqualTo(new Fila("ENTREGADO", 1));

        assertThat(destino.visto.get())
                .as(
                        "mientras el 2 estaba en la red, otra conexion ya veia el 1 ENTREGADO: su"
                                + " COMMIT fue antes, no al final de la vuelta")
                .isEqualTo("ENTREGADO");
        assertThat(destino.candado.get())
                .as(
                        "y nadie retenia un candado sobre pago_evento durante la llamada: ni el"
                                + " FOR UPDATE de las filas ni el de la tabla")
                .isEqualTo("libre");
    }

    @Test
    @DisplayName("agotados los intentos por un fallo inesperado, el evento MUERE y avisa")
    void elFalloInesperadoTambienMata() {
        List<UUID> pagos = cobrarTres("B");
        destino.queFallan.add(pagos.get(0));

        publicador.publicar();
        publicador.publicar();

        assertThat(estadoDe(pagos.get(0))).isEqualTo(new Fila("MUERTO", INTENTOS));
        assertThat(alerta.avisados())
                .as("es dinero cobrado sin registrar: se avisa como a cualquier otro muerto")
                .contains(pagos.get(0));
        assertThat(estadoDe(pagos.get(1))).isEqualTo(new Fila("ENTREGADO", 1));
    }

    @Test
    @DisplayName(
            "dos publicadores que leyeron el mismo evento y fallan los dos cuentan UN intento, no"
                    + " dos")
    void dosPublicadoresCuentanUnSoloIntento() {
        UUID pago = cobrarTres("C").get(0);
        AnotarLaEntrega anotar = contexto.getBean(AnotarLaEntrega.class);

        TenantContext.fijar(new MunicipalidadId(municipalidad));
        EventoDePago leidoPorLosDos =
                anotar.pendientes(500).stream()
                        .filter(evento -> evento.eventoId().equals(pago))
                        .findFirst()
                        .orElseThrow();
        anotar.fallido(leidoPorLosDos, "el primero no pudo", false);
        anotar.fallido(leidoPorLosDos, "el segundo tampoco", false);

        assertThat(estadoDe(pago))
                .as(
                        "sin el FOR UPDATE SKIP LOCKED, lo que impide contar dos veces una misma"
                                + " caida es que la marca solo cuenta si intentos sigue valiendo"
                                + " lo que valia al leerlo")
                .isEqualTo(new Fila("PENDIENTE", 1));
    }

    // ------------------------------------------------------------------

    /** Cobra tres ordenes, una por recibo, y devuelve sus {@code pagoId} en orden de cobro. */
    private static List<UUID> cobrarTres(String serie) {
        TenantContext.fijar(new MunicipalidadId(municipalidad));
        OrigenContext.fijar(new Origen("cajero.prueba", null, null));
        try {
            RegistrarOrdenDeCobro registrar = contexto.getBean(RegistrarOrdenDeCobro.class);
            CobrarOrdenes cobrar = contexto.getBean(CobrarOrdenes.class);
            List<UUID> pagos = new ArrayList<>();
            for (int i = 1; i <= 3; i++) {
                String referencia = "T109-" + serie + i;
                long ordenId =
                        registrar
                                .registrar(
                                        new RegistrarOrdenDeCobro.Peticion(
                                                RENTAS,
                                                referencia,
                                                "Deuda de prueba " + referencia,
                                                null,
                                                Dinero.de("10.00"),
                                                LocalDate.of(2026, 1, 1),
                                                HOY,
                                                new Pagador("70123456", "FULANO DE TAL", 7L)),
                                        Observacion.de("alta de la orden de la prueba"))
                                .orden()
                                .idGuardado();
                CobrarOrdenes.Cobrado cobrado =
                        cobrar.cobrar(
                                new CobrarOrdenes.Cobranza(
                                        "C-01",
                                        "jperez",
                                        List.of(ordenId),
                                        FormaDePago.EFECTIVO,
                                        HOY,
                                        "idem-" + referencia),
                                Observacion.de("cobranza de la prueba del publicador"));
                pagos.add(java.util.Objects.requireNonNull(cobrado.pagoId()));
            }
            return pagos;
        } finally {
            // El recorrido se niega a correr con contexto puesto, y con razon.
            TenantContext.limpiar();
        }
    }

    private record Fila(String estado, int intentos) {}

    private static Fila estadoDe(UUID pago) {
        try (Connection app = base.conexion(BaseDeDatosDePrueba.APP)) {
            ContextoDeTenant.fijar(app, municipalidad);
            try (PreparedStatement sentencia =
                    app.prepareStatement(
                            "SELECT estado, intentos FROM pago_evento WHERE evento_id = ?")) {
                sentencia.setObject(1, pago);
                try (ResultSet fila = sentencia.executeQuery()) {
                    if (!fila.next()) {
                        throw new IllegalStateException("El pago " + pago + " no esta en el buzon");
                    }
                    Fila leida = new Fila(fila.getString("estado"), fila.getInt("intentos"));
                    app.rollback();
                    return leida;
                }
            }
        } catch (SQLException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String errorDe(UUID pago) {
        try (Connection app = base.conexion(BaseDeDatosDePrueba.APP)) {
            ContextoDeTenant.fijar(app, municipalidad);
            try (PreparedStatement sentencia =
                    app.prepareStatement(
                            "SELECT ultimo_error FROM pago_evento WHERE evento_id = ?")) {
                sentencia.setObject(1, pago);
                try (ResultSet fila = sentencia.executeQuery()) {
                    fila.next();
                    String error = fila.getString(1);
                    app.rollback();
                    return error == null ? "" : error;
                }
            }
        } catch (SQLException e) {
            throw new IllegalStateException(e);
        }
    }

    /**
     * ¿Se puede bloquear {@code pago_evento} en exclusiva, sin esperar?
     *
     * <p>{@code ACCESS EXCLUSIVE} choca con todo: con el {@code ROW SHARE} de un {@code FOR UPDATE}
     * y con el {@code ACCESS SHARE} de un {@code SELECT} cuya transaccion siga abierta. Con {@code
     * NOWAIT} no espera: o lo consigue, o dice quien lo impide.
     */
    private static String candadoDelBuzon() {
        try (Connection owner = base.conexion(BaseDeDatosDePrueba.OWNER)) {
            try (PreparedStatement sentencia =
                    owner.prepareStatement(
                            "LOCK TABLE pago_evento IN ACCESS EXCLUSIVE MODE NOWAIT")) {
                sentencia.execute();
                return "libre";
            } catch (SQLException tomado) {
                return "tomado: " + tomado.getMessage();
            } finally {
                owner.rollback();
            }
        } catch (SQLException e) {
            throw new IllegalStateException(e);
        }
    }

    private static void sembrarVentanilla() throws SQLException {
        try (Connection app = base.conexion(BaseDeDatosDePrueba.APP)) {
            ContextoDeTenant.fijar(app, municipalidad);
            long areaId =
                    insertar(
                            app,
                            "INSERT INTO area (municipalidad_id, codigo, nombre)"
                                    + " VALUES (?, 'REN', 'Rentas') RETURNING id",
                            municipalidad);
            insertar(
                    app,
                    "INSERT INTO caja (municipalidad_id, codigo, nombre, serie, area_id, activa)"
                            + " VALUES (?, 'C-01', 'Ventanilla 1', '001', ?, true) RETURNING id",
                    municipalidad,
                    areaId);
            app.commit();
        }
    }

    private static long crearMunicipalidad(String ubigeo, String nombre) throws SQLException {
        try (Connection owner = base.conexion(BaseDeDatosDePrueba.OWNER)) {
            long id =
                    insertar(
                            owner,
                            "INSERT INTO municipalidad (ubigeo, nombre, tipo)"
                                    + " VALUES (?, ?, 'DISTRITAL') RETURNING id",
                            ubigeo,
                            nombre);
            owner.commit();
            return id;
        }
    }

    private static long insertar(Connection conexion, String sql, Object... valores)
            throws SQLException {
        try (PreparedStatement sentencia = conexion.prepareStatement(sql)) {
            for (int i = 0; i < valores.length; i++) {
                sentencia.setObject(i + 1, valores[i]);
            }
            try (ResultSet resultado = sentencia.executeQuery()) {
                if (!resultado.next()) {
                    throw new IllegalStateException("La sentencia no devolvio ninguna fila");
                }
                return resultado.getLong(1);
            }
        }
    }

    /** Lo que Spring Boot pone: proxies por clase, porque los casos de uso no tienen interfaz. */
    @Configuration(proxyBeanMethods = false)
    @EnableTransactionManagement(proxyTargetClass = true)
    static class ConTransacciones {}

    /**
     * El sistema de origen, de mentira: entrega todo salvo lo que se le dice que falle, y lo que
     * falla lo hace con una {@link IllegalArgumentException} —lo que lanza {@code URI.create} con
     * una direccion mal escrita—, que no es ni {@code NoContesta} ni {@code Rechazado}.
     */
    private static final class DestinoDeMentira implements BuzonDelSistemaDeOrigen {

        private final Set<UUID> queFallan = ConcurrentHashMap.newKeySet();

        /** Los tres pagos de la prueba que espia: al llegar el 2, mira el 1 y el candado. */
        private final AtomicReference<List<UUID>> espiado = new AtomicReference<>(List.of());

        private final AtomicReference<String> visto = new AtomicReference<>("sin mirar");
        private final AtomicReference<String> candado = new AtomicReference<>("sin mirar");

        @Override
        public void entregar(EventoDePago evento) {
            List<UUID> pagos = espiado.get();
            if (pagos.size() == 3 && evento.eventoId().equals(pagos.get(1))) {
                visto.set(estadoDe(pagos.get(0)).estado());
                candado.set(candadoDelBuzon());
            }
            if (queFallan.contains(evento.eventoId())) {
                throw new IllegalArgumentException(
                        "Illegal character in authority at index 7: http://ren tas:8080");
            }
        }
    }

    /** La alerta, para poder comprobar que se dispara. */
    private static final class AlertaEnMemoria implements AlertaDeCobrosSinImputar {

        private final List<UUID> avisados =
                java.util.Collections.synchronizedList(new ArrayList<>());

        @Override
        public void hayCobrosSinImputar(List<EventoDePago> muertos) {
            muertos.forEach(muerto -> avisados.add(muerto.eventoId()));
        }

        List<UUID> avisados() {
            return List.copyOf(avisados);
        }
    }
}
