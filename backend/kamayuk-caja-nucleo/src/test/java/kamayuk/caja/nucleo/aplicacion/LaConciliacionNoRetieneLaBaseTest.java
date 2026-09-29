package kamayuk.caja.nucleo.aplicacion;

import static org.assertj.core.api.Assertions.assertThat;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import java.io.IOException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;
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
import kamayuk.caja.nucleo.dominio.AbonosAplicadosEnElOrigen;
import kamayuk.caja.nucleo.dominio.BuzonDelSistemaDeOrigen;
import kamayuk.caja.nucleo.dominio.FormaDePago;
import kamayuk.caja.nucleo.dominio.Pagador;
import kamayuk.caja.nucleo.dominio.SistemaDeOrigen;
import kamayuk.caja.nucleo.infraestructura.BuzonDeSalidaJdbc;
import kamayuk.caja.nucleo.infraestructura.CajaRepositoryJdbc;
import kamayuk.caja.nucleo.infraestructura.ComponedorDeEventosJson;
import kamayuk.caja.nucleo.infraestructura.OrdenDeCobroRepositoryJdbc;
import kamayuk.caja.nucleo.infraestructura.ReciboRepositoryJdbc;
import kamayuk.caja.nucleo.infraestructura.TurnoDeCajaRepositoryJdbc;
import kamayuk.caja.nucleo.infraestructura.web.ConciliacionController;
import kamayuk.caja.plataforma.tenant.TenantTransactionManager;
import org.assertj.core.api.SoftAssertions;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.aop.support.AopUtils;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.NestedExceptionUtils;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import tools.jackson.databind.json.JsonMapper;

/**
 * #133 — <b>la conciliacion no retiene una conexion de la base mientras espera al sistema de
 * origen</b>, y lo mide un contexto de Spring con sus proxies y un pool de Hikari de verdad.
 *
 * <h2>El defecto que esto mide</h2>
 *
 * <p>Hasta #133 {@code ConciliacionDelDia.de} era {@code @Transactional(readOnly = true)} entero.
 * {@code TenantTransactionManager} toma la conexion al abrir la transaccion —para el {@code SET
 * LOCAL}—, y la transaccion seguia abierta durante cada {@code origen.delDia}: hasta 5 s de
 * conexion y 30 s de lectura por sistema, mas el token. Con {@code rentas} aceptando conexiones y
 * sin contestar, diez personas que abren la hoja de cierre agotan las diez conexiones del pool, y
 * el {@code POST /cobros} siguiente espera la suya y contesta 500. La ventanilla deja de cobrar por
 * una lectura que ADR-0026 saco a proposito del camino del cobro.
 *
 * <h2>Como se mide</h2>
 *
 * <p>Con un pool de <b>una</b> conexion —con una basta: el defecto es retenerla, y con diez solo
 * haria falta repetirlo diez veces— y la peticion entrando por {@link ConciliacionController}, el
 * bean del contexto: asi tambien se veria una transaccion que alguien le pusiera al controlador,
 * que derrotaria el arreglo igual que la del caso de uso. El sistema de origen de mentira, cuando
 * le preguntan, mira tres cosas antes de «no contestar»:
 *
 * <ol>
 *   <li>si hay una transaccion activa en el hilo que le pregunta;
 *   <li>si ese hilo tiene una conexion atada ({@link TransactionSynchronizationManager});
 *   <li>y lo que de verdad importa: si un cajero, <b>en otro hilo y en ese mismo momento</b>, puede
 *       cobrar una orden con el mismo pool.
 * </ol>
 */
@DisplayName("#133 — la conciliacion no retiene la base mientras espera al sistema de origen")
class LaConciliacionNoRetieneLaBaseTest {

    private static final Clock RELOJ =
            Clock.fixed(Instant.parse("2026-03-17T14:00:00Z"), ZoneOffset.UTC);

    private static final LocalDate HOY = LocalDate.of(2026, 3, 17);

    private static final SistemaDeOrigen RENTAS = SistemaDeOrigen.de("rentas");

    /**
     * Lo que el cajero espera una conexion antes de rendirse. En produccion son los 30 s por
     * omision de Hikari; aqui medio segundo —Hikari no admite menos de 250 ms— basta para ver la
     * diferencia sin alargar la prueba.
     */
    private static final long ESPERA_DEL_POOL_MS = 500;

    private static BaseDeDatosDePrueba base;
    private static long municipalidad;
    private static HikariDataSource pool;
    private static AnnotationConfigApplicationContext contexto;
    private static OrigenQueNoContesta origen;

    @BeforeAll
    static void levantar() throws SQLException, IOException {
        base = BaseDeDatosDePrueba.provisionar();
        municipalidad = crearMunicipalidad("250401", "Municipalidad de la conciliacion");
        sembrarVentanilla();

        HikariConfig configuracion = new HikariConfig();
        configuracion.setJdbcUrl(base.url());
        configuracion.setUsername(BaseDeDatosDePrueba.APP);
        configuracion.setPassword(base.clave(BaseDeDatosDePrueba.APP));
        configuracion.setMaximumPoolSize(1);
        configuracion.setMinimumIdle(1);
        configuracion.setConnectionTimeout(ESPERA_DEL_POOL_MS);
        configuracion.setPoolName("prueba-133");
        pool = new HikariDataSource(configuracion);

        origen = new OrigenQueNoContesta();

        contexto = new AnnotationConfigApplicationContext();
        contexto.registerBean(DataSource.class, () -> pool);
        contexto.registerBean(
                PlatformTransactionManager.class, () -> new TenantTransactionManager(pool));
        contexto.registerBean(JdbcClient.class, () -> JdbcClient.create(pool));
        contexto.registerBean(Clock.class, () -> RELOJ);
        contexto.registerBean(JsonMapper.class, () -> new JsonMapper());
        contexto.registerBean(AbonosAplicadosEnElOrigen.class, () -> origen);
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
                LeerElRecuento.class,
                ConciliacionDelDia.class,
                ConciliacionController.class);
        contexto.refresh();
    }

    @AfterAll
    static void cerrar() {
        if (contexto != null) {
            contexto.close();
        }
        if (pool != null) {
            pool.close();
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
    @DisplayName("el contexto envuelve la lectura del recuento en un proxy transaccional de verdad")
    void laLecturaVaEnvuelta() {
        // Si esto fallara, lo de abajo mediria una clase desnuda y no la anotacion.
        assertThat(AopUtils.isAopProxy(contexto.getBean(LeerElRecuento.class))).isTrue();
    }

    @Test
    @DisplayName(
            "mientras el origen no contesta no hay transaccion ni conexion tomada, y la ventanilla"
                    + " cobra con un pool de UNA conexion")
    void mientrasElOrigenNoContestaLaVentanillaCobra() {
        // Lo que haria el filtro de la peticion: la municipalidad del token, en el hilo.
        fijarLaPeticion();
        // Un cobro del dia, para que haya una linea y el origen reciba la pregunta; y otra orden
        // que el cajero cobrara mientras el origen «no contesta».
        cobrar(darDeAlta("T133-1"), "idem-T133-1");
        long laDelCajero = darDeAlta("T133-2");
        origen.mientrasTanto.set(() -> cobrarEnOtroHilo(laDelCajero, "idem-T133-2"));

        ConciliacionController.ConciliacionResource respuesta =
                contexto.getBean(ConciliacionController.class).del(HOY.toString());

        assertThat(origen.llamadas.get())
                .as("si nadie le pregunto al origen, esta prueba no mide nada")
                .isEqualTo(1);
        SoftAssertions.assertSoftly(
                blando -> {
                    blando.assertThat(origen.transaccion.get())
                            .as(
                                    "mientras el origen no contesta no hay transaccion abierta: el"
                                            + " recuento se leyo en la suya y ya termino")
                            .isEqualTo("ninguna");
                    blando.assertThat(origen.conexion.get())
                            .as("ni una conexion del pool atada al hilo que espera")
                            .isEqualTo("ninguna");
                    blando.assertThat(origen.ventanilla.get())
                            .as(
                                    "y la ventanilla cobra en ese mismo momento, con la unica"
                                            + " conexion del pool: ADR-0026, cobrar con el origen"
                                            + " sin contestar")
                            .isEqualTo("cobrado");
                });
        assertThat(respuesta.lineas())
                .singleElement()
                .satisfies(
                        linea -> {
                            assertThat(linea.registrados())
                                    .as(
                                            "el recuento se leyo con la municipalidad de la"
                                                    + " peticion: sin su SET LOCAL la politica RLS"
                                                    + " habria reventado")
                                    .isEqualTo(1);
                            assertThat(linea.importeAplicadoEnElOrigen()).isNull();
                            assertThat(linea.porQueNoSeSabe()).contains("no contesta");
                        });
    }

    // ------------------------------------------------------------------

    private static void fijarLaPeticion() {
        TenantContext.fijar(new MunicipalidadId(municipalidad));
        OrigenContext.fijar(new Origen("cajero.prueba", null, null));
    }

    private static long darDeAlta(String referencia) {
        return contexto.getBean(RegistrarOrdenDeCobro.class)
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
    }

    private static void cobrar(long ordenId, String idempotencia) {
        contexto.getBean(CobrarOrdenes.class)
                .cobrar(
                        new CobrarOrdenes.Cobranza(
                                "C-01",
                                "jperez",
                                List.of(ordenId),
                                FormaDePago.EFECTIVO,
                                HOY,
                                idempotencia),
                        Observacion.de("cobranza de la prueba de la conciliacion"));
    }

    /**
     * Un cajero en otro hilo, como otra peticion del servidor: su propio contexto, y la conexion
     * que le de el pool.
     *
     * <p>Otro hilo y no este, porque en este una transaccion abierta se <b>uniria</b> a la que
     * hubiera, con su conexion, y el cobro pasaria aunque el defecto estuviera ahi.
     */
    private static String cobrarEnOtroHilo(long ordenId, String idempotencia) {
        try (ExecutorService ventanilla = Executors.newSingleThreadExecutor()) {
            Future<?> cobro =
                    ventanilla.submit(
                            () -> {
                                fijarLaPeticion();
                                try {
                                    cobrar(ordenId, idempotencia);
                                } finally {
                                    TenantContext.limpiar();
                                    OrigenContext.limpiar();
                                }
                            });
            cobro.get(30, TimeUnit.SECONDS);
            return "cobrado";
        } catch (ExecutionException fallo) {
            Throwable causa = fallo.getCause();
            return "no pudo cobrar: "
                    + causa.getClass().getSimpleName()
                    + " — "
                    + NestedExceptionUtils.getMostSpecificCause(causa).getMessage();
        } catch (TimeoutException sinTerminar) {
            return "el cobro no termino en 30 s";
        } catch (InterruptedException interrumpido) {
            Thread.currentThread().interrupt();
            return "interrumpido";
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
     * El sistema de origen que acepta la pregunta y no contesta.
     *
     * <p>No duerme treinta segundos: lanza el mismo {@link BuzonDelSistemaDeOrigen.NoContesta} que
     * el cliente HTTP al agotar la espera, pero <b>antes</b> mira lo que el hilo que pregunta tiene
     * tomado y deja que un cajero intente cobrar. Es el momento en que, con el defecto, la conexion
     * esta retenida.
     */
    private static final class OrigenQueNoContesta implements AbonosAplicadosEnElOrigen {

        private final AtomicInteger llamadas = new AtomicInteger();
        private final AtomicReference<String> transaccion = new AtomicReference<>("sin mirar");
        private final AtomicReference<String> conexion = new AtomicReference<>("sin mirar");
        private final AtomicReference<String> ventanilla = new AtomicReference<>("sin mirar");
        private final AtomicReference<Supplier<String>> mientrasTanto =
                new AtomicReference<>(() -> "nadie intento cobrar");

        @Override
        public Aplicado delDia(SistemaDeOrigen sistema, LocalDate dia) {
            llamadas.incrementAndGet();
            transaccion.set(
                    TransactionSynchronizationManager.isActualTransactionActive()
                            ? "abierta: "
                                    + TransactionSynchronizationManager.getCurrentTransactionName()
                            : "ninguna");
            conexion.set(
                    TransactionSynchronizationManager.getResourceMap().isEmpty()
                            ? "ninguna"
                            : "atada: "
                                    + TransactionSynchronizationManager.getResourceMap().keySet());
            ventanilla.set(mientrasTanto.get().get());
            throw new BuzonDelSistemaDeOrigen.NoContesta(
                    "«"
                            + sistema
                            + "» acepto la conexion y no contesta: se agoto la espera de lectura"
                            + " al preguntar que aplico el "
                            + dia);
        }
    }
}
