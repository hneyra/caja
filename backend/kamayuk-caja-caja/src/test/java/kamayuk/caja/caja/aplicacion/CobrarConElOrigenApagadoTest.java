package kamayuk.caja.caja.aplicacion;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.net.ServerSocket;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import kamayuk.caja.auditoria.Auditoria;
import kamayuk.caja.auditoria.AuditoriaJdbc;
import kamayuk.caja.auditoria.Origen;
import kamayuk.caja.auditoria.OrigenContext;
import kamayuk.caja.caja.dominio.BuzonDeSalida;
import kamayuk.caja.caja.dominio.EstadoDeOrden;
import kamayuk.caja.caja.dominio.EstadoDelEvento;
import kamayuk.caja.caja.dominio.EventoDePago;
import kamayuk.caja.caja.dominio.FormaDePago;
import kamayuk.caja.caja.dominio.OrdenDeCobro;
import kamayuk.caja.caja.dominio.OrdenDeCobroRepository;
import kamayuk.caja.caja.dominio.Pagador;
import kamayuk.caja.caja.dominio.Recibo;
import kamayuk.caja.caja.dominio.SistemaDeOrigen;
import kamayuk.caja.caja.dominio.TipoDeEventoDePago;
import kamayuk.caja.caja.infraestructura.AbonosAplicadosHttp;
import kamayuk.caja.caja.infraestructura.BuzonDeSalidaJdbc;
import kamayuk.caja.caja.infraestructura.BuzonHttpDelSistemaDeOrigen;
import kamayuk.caja.caja.infraestructura.CajaRepositoryJdbc;
import kamayuk.caja.caja.infraestructura.ClienteHttpDelSistemaDeOrigen;
import kamayuk.caja.caja.infraestructura.ComponedorDeEventosJson;
import kamayuk.caja.caja.infraestructura.OrdenDeCobroRepositoryJdbc;
import kamayuk.caja.caja.infraestructura.ReciboRepositoryJdbc;
import kamayuk.caja.caja.infraestructura.TurnoDeCajaRepositoryJdbc;
import kamayuk.caja.compartido.TenantContext;
import kamayuk.caja.dominio.Dinero;
import kamayuk.caja.dominio.MunicipalidadId;
import kamayuk.caja.dominio.Observacion;
import kamayuk.caja.esquema.BaseDeDatosDePrueba;
import kamayuk.caja.esquema.ContextoDeTenant;
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
 * P5D AC 2 — <b>con el sistema de origen apagado, la ventanilla sigue cobrando</b> (ADR-0026 §3).
 *
 * <h2>Que se mide, y por que asi</h2>
 *
 * <p>Es lo que se compro con el buzon, y si no pasa la separacion no sirve: el ultimo dia de
 * vencimiento la cola de ventanilla no se puede parar porque otro sistema este caido.
 *
 * <p>El apagado NO se simula con un doble que lance: se apunta el cliente HTTP a <b>un puerto que
 * nadie escucha</b>, abriendo un {@code ServerSocket(0)} y cerrandolo. Es el mismo mecanismo con
 * que P5B midio «rentas calcula con normativa apagado», y el motivo es el mismo: un doble que lanza
 * prueba que el codigo maneja una excepcion; un puerto muerto prueba que la excepcion <b>ocurre</b>
 * por donde se cree.
 *
 * <p>Y se cobra contra PostgreSQL de verdad, como {@code sgtm_app}: el recibo, la orden marcada y
 * el evento tienen que caer en la MISMA transaccion, y eso no se puede demostrar contra un doble.
 */
@DisplayName("P5D AC 2 — la ventanilla cobra con el sistema de origen apagado")
class CobrarConElOrigenApagadoTest {

    private static final Clock RELOJ =
            Clock.fixed(Instant.parse("2026-03-16T14:00:00Z"), ZoneOffset.UTC);

    private static final LocalDate HOY = LocalDate.of(2026, 3, 16);

    private static final Observacion PORQUE = Observacion.de("cobranza de la prueba de extraccion");

    private static final SistemaDeOrigen RENTAS = SistemaDeOrigen.de("rentas");

    private static BaseDeDatosDePrueba base;
    private static long municipalidad;
    private static TenantTransactionManager gestor;
    private static TransactionTemplate transaccion;
    private static JdbcClient jdbc;

    private static OrdenDeCobroRepository ordenes;
    private static BuzonDeSalida buzon;
    private static RegistrarOrdenDeCobro registrar;
    private static CobrarOrdenes cobrar;
    private static EntregarEventos entregar;
    private static ConciliacionDelDia conciliacion;
    private static AlertaEnMemoria alerta;

    @BeforeAll
    static void provisionar() throws SQLException, IOException {
        base = BaseDeDatosDePrueba.provisionar();
        municipalidad = crearMunicipalidad("250101", "Municipalidad de la ventanilla");

        DriverManagerDataSource pool = new DriverManagerDataSource();
        pool.setUrl(base.url());
        pool.setUsername(BaseDeDatosDePrueba.APP);
        pool.setPassword(base.clave(BaseDeDatosDePrueba.APP));

        jdbc = JdbcClient.create(pool);
        gestor = new TenantTransactionManager(pool);
        transaccion = new TransactionTemplate(gestor);

        ordenes = new OrdenDeCobroRepositoryJdbc(jdbc);
        buzon = new BuzonDeSalidaJdbc(jdbc);
        Auditoria auditoria = new AuditoriaJdbc(jdbc, RELOJ);
        ComponedorDeEventosJson eventos =
                new ComponedorDeEventosJson(new com.fasterxml.jackson.databind.ObjectMapper());

        registrar = envolver(new RegistrarOrdenDeCobro(ordenes, auditoria, RELOJ));
        AbrirCaja abrirCaja =
                envolver(
                        new AbrirCaja(
                                new CajaRepositoryJdbc(jdbc),
                                new TurnoDeCajaRepositoryJdbc(jdbc),
                                auditoria,
                                RELOJ));
        cobrar =
                envolver(
                        new CobrarOrdenes(
                                abrirCaja,
                                ordenes,
                                new ReciboRepositoryJdbc(jdbc),
                                buzon,
                                eventos,
                                auditoria,
                                RELOJ));

        // El sistema de origen APAGADO: un puerto que nadie escucha.
        ClienteHttpDelSistemaDeOrigen cliente =
                new ClienteHttpDelSistemaDeOrigen(
                        new com.fasterxml.jackson.databind.ObjectMapper(),
                        Map.of("rentas", "http://127.0.0.1:" + unPuertoQueNadieEscucha()),
                        "");
        alerta = new AlertaEnMemoria();
        entregar =
                envolver(
                        new EntregarEventos(
                                buzon, new BuzonHttpDelSistemaDeOrigen(cliente), alerta, 2, RELOJ));
        conciliacion = envolver(new ConciliacionDelDia(buzon, new AbonosAplicadosHttp(cliente)));

        sembrarVentanilla();
    }

    /**
     * Un puerto que nadie escucha.
     *
     * <p>Se abre uno del sistema, se lee su numero y se cierra. Es la forma mas fiel de «el sistema
     * de origen no esta»: inventar un numero corre el riesgo de acertar con algo que si escucha en
     * la maquina de quien corra la prueba, y entonces la prueba mediria otra cosa.
     */
    private static int unPuertoQueNadieEscucha() throws IOException {
        try (ServerSocket socket = new ServerSocket(0)) {
            return socket.getLocalPort();
        }
    }

    @AfterAll
    static void cerrarBase() {
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
    @DisplayName("a) La ventanilla no pregunta nada a nadie")
    class LaVentanilla {

        @Test
        @DisplayName("cobra y emite recibo con el sistema de origen caido")
        void cobraConElOrigenCaido() {
            long ordenId = darDeAlta("AC2-001", "180.00");

            CobrarOrdenes.Cobrado cobrado =
                    cobrar.cobrar(
                            new CobrarOrdenes.Cobranza(
                                    "C-01",
                                    "jperez",
                                    List.of(ordenId),
                                    FormaDePago.EFECTIVO,
                                    HOY,
                                    "idem-ac2-001"),
                            PORQUE);

            assertThat(cobrado.emitido()).isTrue();
            assertThat(cobrado.recibo().total()).isEqualTo(Dinero.de("180.00"));
            assertThat(cobrado.pagoId())
                    .as("el recibo sale con su pagoId: el cliente sabe que hay un pago en camino")
                    .isNotNull();
            // Y la orden quedo pagada, en la misma transaccion.
            assertThat(estadoDe(ordenId)).isEqualTo(EstadoDeOrden.PAGADA);
        }

        @Test
        @DisplayName("el pago queda EN TRANSITO, con su hora, y se ve")
        void elPagoQuedaEnTransitoConSuHora() {
            long ordenId = darDeAlta("AC2-002", "50.00");
            CobrarOrdenes.Cobrado cobrado = cobrarUna(ordenId, "idem-ac2-002");

            EventoDePago evento = enElBuzon(cobrado);
            assertThat(evento.estado())
                    .as(
                            "es el «pago en transito» de ADR-0026 §4: entre los dos COMMIT el saldo"
                                    + " esta desactualizado y tiene que VERSE asi")
                    .isEqualTo(EstadoDelEvento.PENDIENTE);
            assertThat(evento.creadoEn())
                    .as("con su hora: es lo que dice cuanto lleva ese dinero sin registrar")
                    .isEqualTo(RELOJ.instant());
            assertThat(evento.entregadoEn()).isNull();
        }

        @Test
        @DisplayName("el cuerpo del evento lleva la referencia externa y NO lleva imputacion")
        void elCuerpoLlevaLaReferenciaYNoLaImputacion() {
            long ordenId = darDeAlta("AC2-003", "75.50");
            CobrarOrdenes.Cobrado cobrado = cobrarUna(ordenId, "idem-ac2-003");

            String cuerpo = enElBuzon(cobrado).cuerpo();

            // Se compara CAMPO A CAMPO y no por subcadena, y hay un motivo medido: `cuerpo` es
            // `jsonb`, y PostgreSQL NO devuelve el texto que se guardo — lo reserializa, con un
            // espacio detras de cada dos puntos y las claves reordenadas. Una asercion sobre
            // `"referenciaExterna":"AC2-003"` falla sobre un cuerpo que la lleva. Es el mismo
            // hallazgo que #653 midio en `auditoria.datos_nuevos`, y el que hizo que el lector
            // del buzon de `rentas` tuviera que tolerar el espacio.
            assertThat(campoDelCuerpo(cuerpo, "referenciaExterna")).isEqualTo("AC2-003");
            assertThat(campoDelCuerpo(cuerpo, "importe"))
                    .as("los importes viajan como CADENA (RNF-055), no como coma flotante")
                    .isEqualTo("75.50");
            assertThat(cuerpo)
                    .as(
                            "la imputacion es de `rentas` (ADR-0026 §2): si este cuerpo llevara un"
                                    + " «insoluto», la regla del art. 31 estaria escrita en dos sitios")
                    .doesNotContain("insoluto")
                    .doesNotContain("interes");
        }
    }

    @Nested
    @DisplayName("b) El publicador, contra el origen apagado")
    class ElPublicador {

        @Test
        @DisplayName("reintenta mientras quedan intentos, y no pierde el pago")
        void reintentaSinPerderElPago() {
            long ordenId = darDeAlta("AC2-004", "120.00");
            CobrarOrdenes.Cobrado cobrado = cobrarUna(ordenId, "idem-ac2-004");

            EntregarEventos.Vuelta primera = enTransaccion(() -> entregar.entregarPendientes());
            assertThat(primera.entregados()).isZero();
            assertThat(primera.muertos())
                    .as("con dos intentos configurados, la primera vuelta solo cuenta uno")
                    .isZero();

            EventoDePago tras = enElBuzon(cobrado);
            assertThat(tras.estado()).isEqualTo(EstadoDelEvento.PENDIENTE);
            assertThat(tras.intentos()).isEqualTo(1);
            assertThat(tras.ultimoError())
                    .as("y dice por que, para que el responsable no tenga que adivinar")
                    .contains("rentas");
        }

        @Test
        @DisplayName("agotados los intentos MUERE, y avisa a una persona con nombre")
        void agotadosLosIntentosMuereYAvisa() {
            long ordenId = darDeAlta("AC2-005", "300.00");
            CobrarOrdenes.Cobrado cobrado = cobrarUna(ordenId, "idem-ac2-005");

            enTransaccion(() -> entregar.entregarPendientes());
            enTransaccion(() -> entregar.entregarPendientes());

            EventoDePago tras = enElBuzon(cobrado);
            assertThat(tras.estado()).isEqualTo(EstadoDelEvento.MUERTO);
            assertThat(alerta.avisos())
                    .as(
                            "un pago que no se pudo imputar es dinero cobrado sin registrar: NO se"
                                    + " queda en un registro (ADR-0026 §4)")
                    .isNotEmpty();
        }
    }

    @Nested
    @DisplayName("c) La conciliacion no miente cuando el origen no contesta")
    class LaConciliacion {

        @Test
        @DisplayName("con el origen apagado, la linea NO trae ceros: trae su motivo")
        void conElOrigenApagadoLaLineaNoTraeCeros() {
            long ordenId = darDeAlta("AC2-006", "200.00");
            cobrarUna(ordenId, "idem-ac2-006");

            ConciliacionDelDia.Conciliacion del = conciliacion.de(HOY);
            assertThat(del.lineas()).isNotEmpty();
            ConciliacionDelDia.Linea linea = del.lineas().get(0);

            assertThat(linea.aplicado())
                    .as(
                            "un cero se leeria como «no aplicaron nada», que es indistinguible de un"
                                    + " dia sin cobros — y la conciliacion diria que cuadra")
                    .isNull();
            assertThat(linea.porQueNoSeSabe()).isNotNull().contains("rentas");
            assertThat(linea.diferencia()).isNull();
            assertThat(linea.cuadra()).isFalse();
            assertThat(del.cuadra())
                    .as("y el dia entero no cuadra: es exactamente lo que ADR-0026 dice que cuesta")
                    .isFalse();
        }
    }

    // ------------------------------------------------------------------

    private static long darDeAlta(String referencia, String importe) {
        return registrar
                .registrar(
                        new RegistrarOrdenDeCobro.Peticion(
                                RENTAS,
                                referencia,
                                "Deuda de prueba " + referencia,
                                null,
                                Dinero.de(importe),
                                LocalDate.of(2026, 1, 1),
                                HOY,
                                new Pagador("70123456", "FULANO DE TAL", 7L)),
                        Observacion.de("alta de la orden de la prueba"))
                .orden()
                .idGuardado();
    }

    private static CobrarOrdenes.Cobrado cobrarUna(long ordenId, String clave) {
        return cobrar.cobrar(
                new CobrarOrdenes.Cobranza(
                        "C-01", "jperez", List.of(ordenId), FormaDePago.EFECTIVO, HOY, clave),
                PORQUE);
    }

    /**
     * El primer valor de ese campo en el cuerpo del evento, sea cual sea el espaciado.
     *
     * <p>Ver arriba: `jsonb` reserializa, asi que comparar la cadena entera mide el formato de
     * PostgreSQL y no lo que la caja escribio.
     */
    private static String campoDelCuerpo(String cuerpo, String campo) {
        java.util.regex.Matcher busqueda =
                java.util.regex.Pattern.compile("\"" + campo + "\"\\s*:\\s*\"([^\"]*)\"")
                        .matcher(cuerpo);
        if (!busqueda.find()) {
            throw new IllegalStateException(
                    "El cuerpo del evento no trae el campo '" + campo + "': " + cuerpo);
        }
        return busqueda.group(1);
    }

    private static EventoDePago enElBuzon(CobrarOrdenes.Cobrado cobrado) {
        Recibo recibo = cobrado.recibo();
        return enTransaccion(
                () ->
                        buzon.delRecibo(
                                        java.util.Objects.requireNonNull(recibo.id()),
                                        TipoDeEventoDePago.PAGO_REGISTRADO)
                                .orElseThrow(
                                        () ->
                                                new IllegalStateException(
                                                        "El cobro no dejo evento en el buzon")));
    }

    private static EstadoDeOrden estadoDe(long ordenId) {
        return enTransaccion(
                () ->
                        ordenes.porId(ordenId)
                                .map(OrdenDeCobro::estado)
                                .orElseThrow(() -> new IllegalStateException("La orden no esta")));
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

    /** La alerta, para poder comprobar que se dispara. */
    private static final class AlertaEnMemoria implements AlertaDeCobrosSinImputar {

        private final java.util.List<java.util.List<EventoDePago>> avisos =
                new java.util.ArrayList<>();

        @Override
        public void hayCobrosSinImputar(java.util.List<EventoDePago> muertos) {
            avisos.add(java.util.List.copyOf(muertos));
        }

        java.util.List<java.util.List<EventoDePago>> avisos() {
            return avisos;
        }
    }
}
