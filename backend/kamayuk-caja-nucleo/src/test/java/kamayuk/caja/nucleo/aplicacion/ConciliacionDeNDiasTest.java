package kamayuk.caja.nucleo.aplicacion;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import kamayuk.caja.auditoria.Auditoria;
import kamayuk.caja.auditoria.AuditoriaJdbc;
import kamayuk.caja.auditoria.Origen;
import kamayuk.caja.auditoria.OrigenContext;
import kamayuk.caja.compartido.TenantContext;
import kamayuk.caja.dominio.Dinero;
import kamayuk.caja.dominio.MunicipalidadId;
import kamayuk.caja.dominio.Observacion;
import kamayuk.caja.esquema.BaseDeDatosDePrueba;
import kamayuk.caja.esquema.ContextoDeTenant;
import kamayuk.caja.nucleo.dominio.BuzonDeSalida;
import kamayuk.caja.nucleo.dominio.FormaDePago;
import kamayuk.caja.nucleo.dominio.OrdenDeCobroRepository;
import kamayuk.caja.nucleo.dominio.Pagador;
import kamayuk.caja.nucleo.dominio.SistemaDeOrigen;
import kamayuk.caja.nucleo.infraestructura.AbonosAplicadosHttp;
import kamayuk.caja.nucleo.infraestructura.BuzonDeSalidaJdbc;
import kamayuk.caja.nucleo.infraestructura.BuzonHttpDelSistemaDeOrigen;
import kamayuk.caja.nucleo.infraestructura.CajaRepositoryJdbc;
import kamayuk.caja.nucleo.infraestructura.ClienteHttpDelSistemaDeOrigen;
import kamayuk.caja.nucleo.infraestructura.ComponedorDeEventosJson;
import kamayuk.caja.nucleo.infraestructura.OrdenDeCobroRepositoryJdbc;
import kamayuk.caja.nucleo.infraestructura.ReciboRepositoryJdbc;
import kamayuk.caja.nucleo.infraestructura.TurnoDeCajaRepositoryJdbc;
import kamayuk.caja.plataforma.tenant.TenantTransactionManager;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * P5D AC 1 — la conciliacion entre el cierre de caja y lo aplicado en el sistema de origen
 * (ADR-0026 §3).
 *
 * <h2>LO QUE ESTA PRUEBA NO ES, Y HAY QUE LEERLO ANTES DEL RESTO</h2>
 *
 * <p>El criterio 1 del encargo pide <b>treinta dias consecutivos de conciliacion a cero, con el
 * camino viejo todavia encendido</b>. Eso es <b>tiempo de calendario</b> y no cabe en ninguna
 * corrida de pruebas: treinta dias de operacion real son treinta dias de ventanilla real, con sus
 * cortes de red, sus despliegues y sus cajeros. <b>Esta prueba NO lo cumple y no pretende
 * sustituirlo.</b>
 *
 * <p>Lo que si hace es construir la conciliacion y medir lo que se puede medir hoy: <b>ocho dias de
 * caja simulados, con cobros, anulaciones y un origen que contesta</b>, comprobando que la
 * conciliacion da cero los ocho y que <b>deja de darlo</b> en cuanto falta un pago. Los treinta
 * dias quedan declarados como hueco en el entregable, con su motivo.
 *
 * <p>Y hay una segunda distancia que tambien hay que decir: esto corre contra <b>datos de
 * demostracion</b>, no contra la operacion de una municipalidad. Un dia de caja de verdad tiene
 * cobros que la prueba no imagina.
 *
 * <h2>Por que un servidor de verdad y no un doble</h2>
 *
 * <p>El sistema de origen se levanta como un {@code ServerSocket} que habla HTTP. Un doble del
 * puerto probaria que el codigo maneja lo que el doble devuelve; un servidor prueba que la peticion
 * <b>sale</b>, con la ruta y la fecha que se creen, y que la respuesta se lee como se cree. Es el
 * mismo mecanismo de {@code SinNormativaFronteraTest} (P5B).
 */
@DisplayName("P5D AC 1 — la conciliacion del dia, medida sobre ocho dias simulados")
class ConciliacionDeNDiasTest {

    /** Cuantos dias de caja se simulan. <b>No son treinta, y por que no lo son esta arriba.</b> */
    private static final int DIAS_SIMULADOS = 8;

    private static final LocalDate PRIMER_DIA = LocalDate.of(2026, 3, 2);

    private static final Observacion PORQUE = Observacion.de("cobranza de la conciliacion");

    private static final SistemaDeOrigen RENTAS = SistemaDeOrigen.de("rentas");

    private static BaseDeDatosDePrueba base;
    private static long municipalidad;
    private static TenantTransactionManager gestor;
    private static TransactionTemplate transaccion;
    private static OrigenDeMentira origen;

    private static OrdenDeCobroRepository ordenes;
    private static BuzonDeSalida buzon;
    private static RegistrarOrdenDeCobro registrar;
    private static EntregarEventos entregar;
    private static ConciliacionDelDia conciliacion;

    @BeforeAll
    static void provisionar() throws SQLException, IOException {
        base = BaseDeDatosDePrueba.provisionar();
        municipalidad = crearMunicipalidad("250201", "Municipalidad de la conciliacion");

        DriverManagerDataSource pool = new DriverManagerDataSource();
        pool.setUrl(base.url());
        pool.setUsername(BaseDeDatosDePrueba.APP);
        pool.setPassword(base.clave(BaseDeDatosDePrueba.APP));

        JdbcClient jdbc = JdbcClient.create(pool);
        gestor = new TenantTransactionManager(pool);
        transaccion = new TransactionTemplate(gestor);

        ordenes = new OrdenDeCobroRepositoryJdbc(jdbc);
        buzon = new BuzonDeSalidaJdbc(jdbc);
        Auditoria auditoria = new AuditoriaJdbc(jdbc, relojDe(PRIMER_DIA));
        ComponedorDeEventosJson eventos =
                new ComponedorDeEventosJson(new tools.jackson.databind.json.JsonMapper());

        origen = new OrigenDeMentira();
        ClienteHttpDelSistemaDeOrigen cliente =
                new ClienteHttpDelSistemaDeOrigen(
                        new tools.jackson.databind.json.JsonMapper(),
                        Map.of("rentas", "http://127.0.0.1:" + origen.puerto()),
                        "");

        registrar = envolver(new RegistrarOrdenDeCobro(ordenes, auditoria, relojDe(PRIMER_DIA)));
        entregar =
                envolver(
                        new EntregarEventos(
                                buzon,
                                new BuzonHttpDelSistemaDeOrigen(cliente),
                                muertos -> {},
                                8,
                                relojDe(PRIMER_DIA)));
        conciliacion = envolver(new ConciliacionDelDia(buzon, new AbonosAplicadosHttp(cliente)));
        sembrarVentanilla();
        cobrarDeCadaDia(jdbc, auditoria, eventos);
    }

    /**
     * Los ocho dias, cobrados de verdad.
     *
     * <p>Cada dia tiene su reloj: el turno de caja se abre por (caja, cajero, fecha), asi que
     * cobrar ocho dias con el mismo reloj los pondria todos en el mismo turno y la conciliacion
     * mediria uno solo repetido ocho veces.
     */
    private static void cobrarDeCadaDia(
            JdbcClient jdbc, Auditoria auditoria, ComponedorDeEventosJson eventos) {
        TenantContext.fijar(new MunicipalidadId(municipalidad));
        OrigenContext.fijar(new Origen("cajero.prueba", null, null));
        for (int i = 0; i < DIAS_SIMULADOS; i++) {
            LocalDate dia = PRIMER_DIA.plusDays(i);
            Clock reloj = relojDe(dia);
            CobrarOrdenes delDia =
                    envolver(
                            new CobrarOrdenes(
                                    envolver(
                                            new AbrirCaja(
                                                    new CajaRepositoryJdbc(jdbc),
                                                    new TurnoDeCajaRepositoryJdbc(jdbc),
                                                    auditoria,
                                                    reloj)),
                                    ordenes,
                                    new ReciboRepositoryJdbc(jdbc),
                                    buzon,
                                    eventos,
                                    auditoria,
                                    reloj));
            long ordenId = darDeAlta("DIA-" + i, "100.00", dia);
            delDia.cobrar(
                    new CobrarOrdenes.Cobranza(
                            "C-01",
                            "jperez",
                            List.of(ordenId),
                            FormaDePago.EFECTIVO,
                            dia,
                            "idem-dia-" + i),
                    PORQUE);
            origen.aplicar(dia, Dinero.de("100.00"));
        }
        // Y se entrega todo lo encolado: el origen esta levantado, asi que los ocho llegan.
        enTransaccion(() -> entregar.entregarPendientes());
    }

    @AfterAll
    static void cerrar() {
        if (origen != null) {
            origen.close();
        }
        if (base != null) {
            base.close();
        }
    }

    @BeforeEach
    void fijarContexto() {
        TenantContext.fijar(new MunicipalidadId(municipalidad));
        OrigenContext.fijar(new Origen("cajero.prueba", null, null));
    }

    // ------------------------------------------------------------------

    @Nested
    @DisplayName("a) Los ocho dias, con el origen contestando")
    class LosOchoDias {

        @Test
        @DisplayName("los ocho cuadran, y cada uno dice su fecha")
        void losOchoCuadran() {
            List<String> losQueNoCuadran = new ArrayList<>();
            for (int i = 0; i < DIAS_SIMULADOS; i++) {
                LocalDate dia = PRIMER_DIA.plusDays(i);
                ConciliacionDelDia.Conciliacion del = conciliacion.de(dia);
                assertThat(del.dia())
                        .as("toda cifra indica su fecha (regla 9, RNF-075)")
                        .isEqualTo(dia);
                if (!del.cuadra()) {
                    losQueNoCuadran.add(dia + " -> " + del.lineas());
                }
            }
            assertThat(losQueNoCuadran)
                    .as(
                            "ocho dias simulados de conciliacion a cero. NO son los treinta que"
                                    + " ADR-0026 exige antes de apagar el camino viejo: eso es tiempo"
                                    + " de calendario y queda declarado como hueco")
                    .isEmpty();
        }

        @Test
        @DisplayName(
                "la linea trae las dos mitades: lo que la caja cobro y lo que el origen aplico")
        void laLineaTraeLasDosMitades() {
            ConciliacionDelDia.Conciliacion del = conciliacion.de(PRIMER_DIA);
            assertThat(del.lineas()).hasSize(1);
            ConciliacionDelDia.Linea linea = del.lineas().get(0);

            assertThat(linea.sistema()).isEqualTo(RENTAS);
            assertThat(linea.recuento().cobrado()).isEqualTo(Dinero.de("100.00"));
            assertThat(linea.recuento().pendientes()).isZero();
            assertThat(linea.aplicado()).isNotNull();
            assertThat(linea.aplicado().importeAplicado()).isEqualTo(Dinero.de("100.00"));
            assertThat(linea.diferencia()).isEqualTo(Dinero.CERO);
            assertThat(linea.porQueNoSeSabe()).isNull();
        }

        @Test
        @DisplayName("un dia sin ningun cobro cuadra, y tiene razon en cuadrar")
        void unDiaSinCobrosCuadra() {
            ConciliacionDelDia.Conciliacion del = conciliacion.de(PRIMER_DIA.minusDays(1));
            assertThat(del.lineas()).isEmpty();
            assertThat(del.cuadra()).isTrue();
        }
    }

    @Nested
    @DisplayName("b) Y deja de cuadrar en cuanto falta algo")
    class DejaDeCuadrar {

        @Test
        @DisplayName("si el origen aplico de menos, la diferencia lo dice con su cifra")
        void siElOrigenAplicoDeMenos() {
            LocalDate dia = PRIMER_DIA.plusDays(2);
            origen.aplicar(dia, Dinero.de("40.00"));
            try {
                ConciliacionDelDia.Conciliacion del = conciliacion.de(dia);
                assertThat(del.cuadra()).isFalse();
                assertThat(del.lineas().get(0).diferencia())
                        .as("la caja cobro 100,00 y el origen dice 40,00")
                        .isEqualTo(Dinero.de("60.00"));
            } finally {
                origen.aplicar(dia, Dinero.de("100.00"));
            }
        }

        @Test
        @DisplayName("si el origen dice que rechazo alguno, NO cuadra aunque la cifra coincida")
        void siElOrigenRechazoAlguno() {
            LocalDate dia = PRIMER_DIA.plusDays(3);
            origen.rechazar(dia, 1);
            try {
                ConciliacionDelDia.Conciliacion del = conciliacion.de(dia);
                assertThat(del.lineas().get(0).diferencia())
                        .as(
                                "la cifra coincide: lo que no cuadra es que hay uno esperando a alguien")
                        .isEqualTo(Dinero.CERO);
                assertThat(del.cuadra())
                        .as(
                                "un dia con la diferencia en cero y un pago rechazado NO cuadra:"
                                        + " cuadra por casualidad, porque todavia no se ha aplicado")
                        .isFalse();
            } finally {
                origen.rechazar(dia, 0);
            }
        }

        @Test
        @DisplayName("un pago todavia en transito impide que el dia cuadre")
        void unPagoEnTransitoImpideQueCuadre() {
            LocalDate dia = PRIMER_DIA.plusDays(4);
            // Se devuelve el evento de ese dia a PENDIENTE, que es como esta entre los dos COMMIT.
            enTransaccion(() -> devolverAPendiente(dia));
            try {
                ConciliacionDelDia.Conciliacion del = conciliacion.de(dia);
                assertThat(del.lineas().get(0).recuento().pendientes()).isEqualTo(1);
                assertThat(del.cuadra()).isFalse();
            } finally {
                enTransaccion(() -> entregar.entregarPendientes());
            }
        }
    }

    // ------------------------------------------------------------------

    private static void devolverAPendiente(LocalDate dia) {
        for (BuzonDeSalida.RecuentoDelDia recuento : buzon.recuentoDe(dia)) {
            if (recuento.registrados() == 0) {
                continue;
            }
            try (Connection admin = base.conexionAdmin()) {
                admin.setAutoCommit(false);
                ContextoDeTenant.fijar(admin, municipalidad);
                try (PreparedStatement sentencia =
                        admin.prepareStatement(
                                "UPDATE pago_evento SET estado = 'PENDIENTE',"
                                        + " entregado_en = NULL FROM cierre_caja t"
                                        + " WHERE t.id = pago_evento.turno_id AND t.fecha = ?")) {
                    sentencia.setObject(1, dia);
                    sentencia.executeUpdate();
                }
                admin.commit();
            } catch (SQLException noSePudo) {
                throw new IllegalStateException(
                        "No se pudo devolver el evento a PENDIENTE", noSePudo);
            }
        }
    }

    private static long darDeAlta(String referencia, String importe, LocalDate dia) {
        return registrar
                .registrar(
                        new RegistrarOrdenDeCobro.Peticion(
                                RENTAS,
                                referencia,
                                "Deuda de prueba " + referencia,
                                null,
                                Dinero.de(importe),
                                PRIMER_DIA.minusMonths(1),
                                dia,
                                new Pagador("70123456", "FULANO DE TAL", 7L)),
                        Observacion.de("alta de la orden de la prueba"))
                .orden()
                .idGuardado();
    }

    private static Clock relojDe(LocalDate dia) {
        return Clock.fixed(dia.atTime(14, 0).toInstant(ZoneOffset.UTC), ZoneOffset.UTC);
    }

    private static <T> T enTransaccion(java.util.function.Supplier<T> que) {
        return java.util.Objects.requireNonNull(transaccion.execute(estado -> que.get()));
    }

    private static void enTransaccion(Runnable que) {
        transaccion.execute(
                estado -> {
                    que.run();
                    return null;
                });
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

    @SuppressWarnings("unchecked")
    private static <T> T envolver(T objetivo) {
        ProxyFactory fabrica = new ProxyFactory(objetivo);
        fabrica.setProxyTargetClass(true);
        fabrica.addAdvice(
                new TransactionInterceptor(gestor, new AnnotationTransactionAttributeSource()));
        return (T) fabrica.getProxy();
    }

    /**
     * El sistema de origen, levantado de verdad.
     *
     * <p>Escrito a mano sobre {@code ServerSocket} y no con {@code com.sun.net.httpserver}, porque
     * Checkstyle prohibe importar de {@code com.sun}. Contesta dos cosas: {@code POST /pagos} con
     * 202 —el buzon de entrada— y {@code GET /pagos/conciliacion} con lo que se le haya dicho que
     * aplico.
     */
    private static final class OrigenDeMentira implements AutoCloseable {

        private final ServerSocket socket;
        private final Thread hilo;
        private final AtomicBoolean vivo = new AtomicBoolean(true);
        private final Map<String, Dinero> aplicado = new ConcurrentHashMap<>();
        private final Map<String, Integer> rechazados = new ConcurrentHashMap<>();

        OrigenDeMentira() throws IOException {
            this.socket = new ServerSocket(0);
            this.hilo = new Thread(this::atender, "origen-de-mentira");
            this.hilo.setDaemon(true);
            this.hilo.start();
        }

        int puerto() {
            return socket.getLocalPort();
        }

        void aplicar(LocalDate dia, Dinero importe) {
            aplicado.put(dia.toString(), importe);
        }

        void rechazar(LocalDate dia, int cuantos) {
            rechazados.put(dia.toString(), cuantos);
        }

        private void atender() {
            while (vivo.get()) {
                try (Socket cliente = socket.accept()) {
                    String peticion = leerPeticion(cliente);
                    String cuerpo = respuestaPara(peticion);
                    escribir(cliente, cuerpo);
                } catch (IOException seCerro) {
                    return;
                }
            }
        }

        private String respuestaPara(String peticion) {
            if (peticion.startsWith("POST")) {
                return "";
            }
            String fecha = "";
            int desde = peticion.indexOf("fecha=");
            if (desde >= 0) {
                int hasta = peticion.indexOf(' ', desde);
                fecha =
                        peticion.substring(
                                desde + "fecha=".length(), hasta < 0 ? peticion.length() : hasta);
            }
            Dinero importe = aplicado.getOrDefault(fecha, Dinero.CERO);
            int rechazadosDelDia = rechazados.getOrDefault(fecha, 0);
            int aplicadosDelDia = importe.esCero() ? 0 : 1;
            return "{\"recibidos\":"
                    + (aplicadosDelDia + rechazadosDelDia)
                    + ",\"aplicados\":"
                    + aplicadosDelDia
                    + ",\"rechazados\":"
                    + rechazadosDelDia
                    + ",\"importeAplicado\":\""
                    + importe.valor().toPlainString()
                    + "\"}";
        }

        private static String leerPeticion(Socket cliente) throws IOException {
            // Se consume hasta la linea en blanco: si no, el cliente recibe un RST al cerrar.
            StringBuilder texto = new StringBuilder();
            int anterior = -1;
            int actual;
            int enBlanco = 0;
            while ((actual = cliente.getInputStream().read()) != -1) {
                texto.append((char) actual);
                if (anterior == '\n' && actual == '\r') {
                    enBlanco++;
                }
                if (actual == '\n' && enBlanco > 0) {
                    break;
                }
                anterior = actual;
            }
            return texto.toString();
        }

        private static void escribir(Socket cliente, String cuerpo) throws IOException {
            byte[] bytes = cuerpo.getBytes(StandardCharsets.UTF_8);
            OutputStream salida = cliente.getOutputStream();
            salida.write(
                    ("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: "
                                    + bytes.length
                                    + "\r\nConnection: close\r\n\r\n")
                            .getBytes(StandardCharsets.UTF_8));
            salida.write(bytes);
            salida.flush();
        }

        @Override
        public void close() {
            vivo.set(false);
            try {
                socket.close();
            } catch (IOException yaEstaba) {
                // Ya estaba cerrado: no hay nada que hacer y no es un fallo de la prueba.
            }
        }
    }
}
