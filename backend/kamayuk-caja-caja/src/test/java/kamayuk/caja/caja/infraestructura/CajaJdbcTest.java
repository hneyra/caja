package kamayuk.caja.caja.infraestructura;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import kamayuk.caja.auditoria.Auditoria;
import kamayuk.caja.auditoria.AuditoriaJdbc;
import kamayuk.caja.auditoria.Origen;
import kamayuk.caja.auditoria.OrigenContext;
import kamayuk.caja.caja.aplicacion.AbrirCaja;
import kamayuk.caja.caja.aplicacion.CobrarOrdenes;
import kamayuk.caja.caja.aplicacion.CobrarTasa;
import kamayuk.caja.caja.dominio.BuzonDeSalida;
import kamayuk.caja.caja.dominio.Caja;
import kamayuk.caja.caja.dominio.EstadoDeOrden;
import kamayuk.caja.caja.dominio.EventoDePago;
import kamayuk.caja.caja.dominio.FormaDePago;
import kamayuk.caja.caja.dominio.LineaDeTasaPedida;
import kamayuk.caja.caja.dominio.OrdenDeCobro;
import kamayuk.caja.caja.dominio.OrdenDeCobroRepository;
import kamayuk.caja.caja.dominio.Pagador;
import kamayuk.caja.caja.dominio.Recibo;
import kamayuk.caja.caja.dominio.SistemaDeOrigen;
import kamayuk.caja.caja.dominio.TipoDeEventoDePago;
import kamayuk.caja.caja.dominio.TipoDePago;
import kamayuk.caja.compartido.TenantContext;
import kamayuk.caja.dominio.Dinero;
import kamayuk.caja.dominio.MunicipalidadId;
import kamayuk.caja.dominio.Observacion;
import kamayuk.caja.esquema.BaseDeDatosDePrueba;
import kamayuk.caja.esquema.ContextoDeTenant;
import kamayuk.caja.plataforma.tenant.TenantTransactionManager;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
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
 * #33 — La caja contra PostgreSQL de verdad, conectada como {@code sgtm_app}.
 *
 * <p>Lo que esta clase defiende y ninguna prueba con dobles puede:
 *
 * <ul>
 *   <li><b>Atomicidad</b> (AC 1). Se provoca el fallo con el recibo insertado, sus lineas escritas
 *       y <b>el evento ya en el buzon</b>, que es el peor momento posible, y se cuenta: cero
 *       recibos, cero lineas, cero eventos, la orden todavia {@code PENDIENTE} y el correlativo sin
 *       avanzar. Contra un doble esto solo probaria que el doble no guarda. Y es lo que sostiene la
 *       frase entera de ADR-0026 §3: «si la fila esta, el recibo esta; si el recibo esta, la fila
 *       esta».
 *   <li><b>El doble cobro</b> (AC 3), seriado y con <b>hilos de verdad</b>. Desde P5D no lo impide
 *       la relectura del libro —ese libro esta en otra base— sino el {@code FOR UPDATE} sobre la
 *       orden. Un doble pasa esta prueba haga lo que haga el codigo real.
 *   <li><b>Que {@code sgtm_app} no pueda actualizar un recibo</b> (AC 5). No es una convencion: es
 *       un {@code REVOKE} de V29, y se comprueba intentandolo por SQL directo.
 *   <li><b>El aislamiento</b> (AC 6). Con el contexto de B, la caja, los recibos y las ordenes de A
 *       no existen.
 *   <li><b>La numeracion sin huecos</b> bajo concurrencia, que es lo que el {@code UPSERT} del
 *       correlativo compra frente a un {@code SELECT} + {@code UPDATE}.
 *   <li><b>La idempotencia del alta de la orden</b> ({@code orden_referencia_uq}), que {@code
 *       OrdenesEnMemoria} declara que no puede demostrar.
 * </ul>
 */
@DisplayName("#33 — La caja contra PostgreSQL")
class CajaJdbcTest {

    private static final LocalDate PAGO = LocalDate.of(2026, 3, 15);

    private static final SistemaDeOrigen RENTAS = SistemaDeOrigen.de("rentas");
    private static final SistemaDeOrigen MERCADOS = SistemaDeOrigen.de("mercados");

    /** Quien paga, congelado en la orden: esta base ya no tiene padron contra el que cruzarlo. */
    private static final Pagador PAGADOR = new Pagador("12345678", "TITULAR, PRUEBA", 7L);

    private static final Clock RELOJ =
            Clock.fixed(Instant.parse("2026-03-15T14:30:00Z"), ZoneId.of("America/Lima"));

    private static BaseDeDatosDePrueba base;
    private static long municipalidad;
    private static long otraMunicipalidad;
    private static long areaId;
    private static long cajaId;
    private static JdbcClient jdbc;
    private static TransactionTemplate transaccion;
    private static TenantTransactionManager gestor;

    private static CajaRepositoryJdbc cajas;
    private static ReciboRepositoryJdbc recibos;
    private static TasaRepositoryJdbc tasas;
    private static OrdenDeCobroRepositoryJdbc ordenes;
    private static BuzonDeSalidaJdbc buzon;
    private static CobrarOrdenes cobrarOrdenes;
    private static CobrarTasa cobrarTasa;

    /**
     * Estatico a proposito: JUnit crea una instancia por metodo de prueba, asi que un contador de
     * instancia volveria a empezar en cada uno y dos ordenes distintas acabarian con la misma
     * referencia externa —que es la mitad de la clave de {@code orden_referencia_uq}—.
     */
    private static final AtomicInteger CONTADOR = new AtomicInteger();

    @BeforeAll
    static void provisionar() throws SQLException, IOException {
        base = BaseDeDatosDePrueba.provisionar();
        municipalidad = crearMunicipalidad("240101", "Municipalidad de la caja");
        otraMunicipalidad = crearMunicipalidad("240102", "Municipalidad vecina");

        DriverManagerDataSource pool = new DriverManagerDataSource();
        pool.setUrl(base.url());
        pool.setUsername(BaseDeDatosDePrueba.APP);
        pool.setPassword(base.clave(BaseDeDatosDePrueba.APP));

        jdbc = JdbcClient.create(pool);
        gestor = new TenantTransactionManager(pool);
        transaccion = new TransactionTemplate(gestor);

        cajas = new CajaRepositoryJdbc(jdbc);
        recibos = new ReciboRepositoryJdbc(jdbc);
        tasas = new TasaRepositoryJdbc(jdbc);
        ordenes = new OrdenDeCobroRepositoryJdbc(jdbc);
        buzon = new BuzonDeSalidaJdbc(jdbc);

        Auditoria auditoria = new AuditoriaJdbc(jdbc, RELOJ);
        AbrirCaja abrirCaja =
                envolver(
                        new AbrirCaja(
                                cajas, new TurnoDeCajaRepositoryJdbc(jdbc), auditoria, RELOJ));
        cobrarOrdenes =
                envolver(
                        new CobrarOrdenes(
                                abrirCaja,
                                ordenes,
                                recibos,
                                buzon,
                                new ComponedorDeEventosJson(new ObjectMapper()),
                                auditoria,
                                RELOJ));
        cobrarTasa = envolver(new CobrarTasa(abrirCaja, tasas, recibos, auditoria, RELOJ));

        areaId = crearArea(municipalidad, "A-01");
        cajaId = crearCaja(municipalidad, "C-01", "001", areaId);
        crearArea(otraMunicipalidad, "A-01");
        crearCaja(otraMunicipalidad, "C-01", "001", null);
    }

    /**
     * Envuelve el caso de uso en un proxy transaccional <b>de verdad</b>.
     *
     * <p>Lo que se quiere verificar es la anotacion {@code @Transactional} del codigo de
     * produccion. Si la prueba abriera la transaccion ella misma con un {@code
     * TransactionTemplate}, quitarle la anotacion al caso de uso no pondria nada en rojo y la
     * prueba de atomicidad estaria midiendo la transaccion de la prueba.
     */
    @SuppressWarnings({"unchecked", "deprecation"})
    private static <T> T envolver(T objetivo) {
        ProxyFactory fabrica = new ProxyFactory(objetivo);
        fabrica.setProxyTargetClass(true);
        fabrica.addAdvice(
                new TransactionInterceptor(gestor, new AnnotationTransactionAttributeSource()));
        return (T) fabrica.getProxy();
    }

    @AfterAll
    static void cerrar() {
        if (base != null) {
            base.close();
        }
    }

    @BeforeEach
    void fijarContexto() {
        TenantContext.fijar(new MunicipalidadId(municipalidad));
        OrigenContext.fijar(new Origen("cajero.prueba", null, null));
    }

    @AfterEach
    void limpiarContexto() {
        TenantContext.limpiar();
        OrigenContext.limpiar();
    }

    // ------------------------------------------------------------------

    @Nested
    @DisplayName("AC 1 — La cobranza es atomica")
    class DeLaAtomicidad {

        @Test
        @DisplayName("si algo falla tras encolar el evento, no queda ni el recibo ni el evento")
        void unFalloAMitadNoDejaNada() {
            Orden orden = ordenPendiente("ATOM-1", Dinero.de("300.00"));
            long ultimoAntes = correlativoDe("001");

            // El recibo, su detalle y EL EVENTO DEL BUZON ya estan escritos cuando esto
            // revienta: es el peor momento posible. Si la transaccion no cubriera las tres
            // cosas, quedaria el evento sin recibo -el origen imputando un pago que no
            // existe- o el recibo sin evento -dinero cobrado que nadie va a imputar-.
            CobrarOrdenes conFalloAlFinal =
                    envolver(
                            new CobrarOrdenes(
                                    envolver(
                                            new AbrirCaja(
                                                    cajas,
                                                    new TurnoDeCajaRepositoryJdbc(jdbc),
                                                    new AuditoriaJdbc(jdbc, RELOJ),
                                                    RELOJ)),
                                    ordenes,
                                    recibos,
                                    new BuzonQueRevientaAlEncolar(buzon),
                                    new ComponedorDeEventosJson(new ObjectMapper()),
                                    new AuditoriaJdbc(jdbc, RELOJ),
                                    RELOJ));

            assertThatThrownBy(
                            () -> conFalloAlFinal.cobrar(cobranza(orden, "C-01", null), porQue()))
                    .isInstanceOf(FalloSimulado.class);

            assertThat(contarRecibos(orden))
                    .as("cero recibos: la transaccion se llevo el que ya estaba insertado")
                    .isZero();
            assertThat(contarLineas(orden)).as("cero lineas de detalle").isZero();
            assertThat(contarEventos(orden))
                    .as("cero eventos: el buzon se fue con el recibo")
                    .isZero();
            assertThat(estadoDe(orden))
                    .as("y la orden sigue cobrable: nadie pago")
                    .isEqualTo(EstadoDeOrden.PENDIENTE);
            assertThat(correlativoDe("001"))
                    .as("el correlativo tampoco avanza: es una fila, no una secuencia")
                    .isEqualTo(ultimoAntes);
        }

        @Test
        @DisplayName("cuando todo sale bien, el recibo, su detalle y el evento estan los tres")
        void loQueSeCobraQuedaEntero() {
            Orden orden = ordenPendiente("ATOM-2", Dinero.de("250.00"));

            CobrarOrdenes.Cobrado cobrado =
                    cobrarOrdenes.cobrar(cobranza(orden, "C-01", null), porQue());

            assertThat(cobrado.recibo().total()).isEqualTo(Dinero.de("250.00"));
            assertThat(cobrado.emitido()).isTrue();
            assertThat(contarRecibos(orden)).isEqualTo(1);
            assertThat(contarLineas(orden)).isEqualTo(1);
            assertThat(contarEventos(orden))
                    .as("y el evento esta en el buzon: el origen se va a enterar")
                    .isEqualTo(1);
            assertThat(estadoDe(orden))
                    .as("la orden queda cobrada y nombra su recibo (orden_recibo_ck)")
                    .isEqualTo(EstadoDeOrden.PAGADA);
        }

        @Test
        @DisplayName("el evento nace PENDIENTE con el mismo pagoId que la respuesta devuelve")
        void elEventoNacePendienteConSuPagoId() {
            Orden orden = ordenPendiente("ATOM-3", Dinero.de("77.00"));

            CobrarOrdenes.Cobrado cobrado =
                    cobrarOrdenes.cobrar(cobranza(orden, "C-01", null), porQue());

            EventoDePago encolado =
                    enTransaccion(
                            () ->
                                    buzon.delRecibo(
                                                    java.util.Objects.requireNonNull(
                                                            cobrado.recibo().id()),
                                                    TipoDeEventoDePago.PAGO_REGISTRADO)
                                            .orElseThrow());
            assertThat(encolado.eventoId())
                    .as(
                            "el pagoId lo genera la caja al cobrar, no el transporte: si lo"
                                    + " generara quien entrega, dos entregas serian dos pagos")
                    .isEqualTo(cobrado.pagoId());
            assertThat(encolado.permiteCerrarElTurno())
                    .as("recien encolado no deja cerrar el turno: nadie lo ha entregado")
                    .isFalse();
            assertThat(encolado.sistemaDestino()).isEqualTo(RENTAS);
            assertThat(encolado.cuerpo())
                    .as("y el cuerpo va congelado, con la referencia que el origen reconoce")
                    .contains(orden.referencia());
        }
    }

    @Nested
    @DisplayName("AC 2 y 4 — El importe sale de la orden, y con su fecha")
    class DelImporte {

        @Test
        @DisplayName("el recibo cobra lo que la orden dice, y dice a que fecha se cobro")
        void elReciboLlevaSuFecha() {
            Orden orden = ordenPendiente("FECHA-1", Dinero.de("120.00"));

            Recibo emitido = cobrarOrdenes.cobrar(cobranza(orden, "C-01", null), porQue()).recibo();

            assertThat(emitido.total()).isEqualTo(Dinero.de("120.00"));
            assertThat(emitido.actualizadoA()).isEqualTo(PAGO);
            assertThat(
                            enTransaccion(
                                            () ->
                                                    jdbc.sql(
                                                                    "SELECT actualizado_a FROM"
                                                                            + " recibo WHERE id = :id")
                                                            .param("id", emitido.id())
                                                            .query(java.sql.Date.class)
                                                            .single())
                                    .toLocalDate())
                    .as("y la fecha esta en la base, no solo en la respuesta (RNF-075)")
                    .isEqualTo(PAGO);
        }

        @Test
        @DisplayName("el desglose del recibo es el de la orden, congelado y con su referencia")
        void elDesgloseEstaCongelado() {
            Orden orden = ordenPendiente("FECHA-2", Dinero.de("90.00"));
            Recibo emitido = cobrarOrdenes.cobrar(cobranza(orden, "C-01", null), porQue()).recibo();

            assertThat(
                            enTransaccion(
                                    () ->
                                            jdbc.sql(
                                                            "SELECT insoluto FROM recibo_detalle"
                                                                    + " WHERE recibo_id = :id")
                                                    .param("id", emitido.id())
                                                    .query(java.math.BigDecimal.class)
                                                    .single()))
                    .as("el importe de una orden va integro en insoluto: la caja no lo reparte")
                    .isEqualByComparingTo("90.00");
            assertThat(
                            enTransaccion(
                                    () ->
                                            jdbc.sql(
                                                            "SELECT tributo FROM recibo_detalle"
                                                                    + " WHERE recibo_id = :id")
                                                    .param("id", emitido.id())
                                                    .query(String.class)
                                                    .single()))
                    .as("la columna `tributo` lleva el SISTEMA de origen desde P5D, no un tributo")
                    .isEqualTo("RENTAS");
        }

        @Test
        @DisplayName("el pagador queda copiado en el recibo, no releido de ningun padron")
        void elPagadorQuedaCopiado() {
            Orden orden = ordenPendiente("PAGADOR-1", Dinero.de("45.00"));
            Recibo emitido = cobrarOrdenes.cobrar(cobranza(orden, "C-01", null), porQue()).recibo();

            Recibo leido = enTransaccion(() -> recibos.porNumero(emitido.numero()).orElseThrow());

            assertThat(leido.pagador().documento()).isEqualTo("12345678");
            assertThat(leido.pagador().nombre())
                    .as(
                            "releerlo del padron daria un duplicado distinto del original con el"
                                    + " mismo numero, y ademas ese padron ya no esta en esta base")
                    .isEqualTo("TITULAR, PRUEBA");
            assertThat(leido.pagador().idExterno()).isEqualTo(7L);
        }
    }

    @Nested
    @DisplayName("AC 3 — Cobrar dos veces la misma orden es imposible")
    class DelDobleCobro {

        @Test
        @DisplayName("seriadas: la segunda encuentra la orden ya PAGADA")
        void laSegundaEncuentraLaOrdenPagada() {
            Orden orden = ordenPendiente("DOBLE-1", Dinero.de("100.00"));

            cobrarOrdenes.cobrar(cobranza(orden, "C-01", null), porQue());

            assertThatThrownBy(() -> cobrarOrdenes.cobrar(cobranza(orden, "C-01", null), porQue()))
                    .isInstanceOf(CobrarOrdenes.OrdenNoCobrable.class)
                    .hasMessageContaining("ya se cobro con el recibo");
            assertThat(contarRecibos(orden)).isEqualTo(1);
        }

        @Test
        @DisplayName("con hilos y DIEZ ventanillas distintas: solo una cobra")
        void diezVentanillasSimultaneasProducenUnCobro() throws Exception {
            Orden orden = ordenPendiente("DOBLE-2", Dinero.de("500.00"));

            // Diez CAJAS distintas, con su propia serie y su propio cajero. Es deliberado, y
            // sigue siendolo despues de P5D:
            //
            //  - con una sola caja y un solo cajero, el turno los serializa;
            //  - con una sola caja y diez cajeros, los serializa el contador de la serie, que
            //    la cobranza bloquea al reservar el numero.
            //
            // Con diez cajas y diez series, lo unico que queda entre las diez cobranzas y el
            // doble cobro es el `FOR UPDATE` sobre la fila de la orden, que es LA barrera que
            // P5D puso en el sitio donde antes estaba la relectura del libro.
            int hilos = 10;
            for (int i = 0; i < hilos; i++) {
                crearCajaDeLaSerie("C-CONC" + i, "S" + i);
            }
            CountDownLatch salida = new CountDownLatch(1);
            List<Callable<Boolean>> tareas = new ArrayList<>();
            for (int i = 0; i < hilos; i++) {
                String cajero = "cajero." + i;
                String caja = "C-CONC" + i;
                tareas.add(
                        () -> {
                            // El contexto de tenant y el origen son ThreadLocal: cada hilo
                            // empieza sin ellos, igual que empezaria una peticion.
                            TenantContext.fijar(new MunicipalidadId(municipalidad));
                            OrigenContext.fijar(new Origen(cajero, null, null));
                            salida.await(10, TimeUnit.SECONDS);
                            try {
                                cobrarOrdenes.cobrar(cobranza(orden, caja, cajero, null), porQue());
                                return true;
                            } catch (CobrarOrdenes.OrdenNoCobrable yaPagada) {
                                return false;
                            }
                        });
            }

            ExecutorService ejecutor = Executors.newFixedThreadPool(hilos);
            int cobradas = 0;
            try {
                List<Future<Boolean>> futuros = new ArrayList<>();
                for (Callable<Boolean> tarea : tareas) {
                    futuros.add(ejecutor.submit(tarea));
                }
                salida.countDown();
                for (Future<Boolean> futuro : futuros) {
                    if (Boolean.TRUE.equals(futuro.get(60, TimeUnit.SECONDS))) {
                        cobradas++;
                    }
                }
            } finally {
                ejecutor.shutdownNow();
            }

            assertThat(cobradas)
                    .as("solo una cobra: el FOR UPDATE de la orden serializa a las diez")
                    .isEqualTo(1);
            assertThat(contarRecibos(orden)).isEqualTo(1);
            assertThat(contarEventos(orden))
                    .as("y un solo evento: dos serian dos pagos para el sistema de origen")
                    .isEqualTo(1);
        }

        @Test
        @DisplayName("reenviar el mismo intento devuelve el recibo Y el pagoId de la primera vez")
        void elReenvioNoEmiteOtro() {
            Orden orden = ordenPendiente("DOBLE-3", Dinero.de("70.00"));
            String clave = "idem-" + orden.referencia();

            CobrarOrdenes.Cobrado primero =
                    cobrarOrdenes.cobrar(cobranza(orden, "C-01", clave), porQue());
            CobrarOrdenes.Cobrado repetido =
                    cobrarOrdenes.cobrar(cobranza(orden, "C-01", clave), porQue());

            assertThat(repetido.recibo().id()).isEqualTo(primero.recibo().id());
            assertThat(repetido.recibo().numero()).isEqualTo(primero.recibo().numero());
            assertThat(repetido.emitido())
                    .as("y lo dice: el cliente sabe que su reintento se reconocio")
                    .isFalse();
            assertThat(repetido.pagoId())
                    .as("con el MISMO pagoId: otro dejaria al cliente creyendo que hubo dos pagos")
                    .isEqualTo(primero.pagoId());
            assertThat(contarRecibos(orden)).isEqualTo(1);
            assertThat(contarEventos(orden)).isEqualTo(1);
        }

        @Test
        @DisplayName("la base rechaza dos recibos con la misma clave, aunque se inserten a mano")
        void laBaseRechazaLaClaveRepetida() {
            Orden orden = ordenPendiente("DOBLE-4", Dinero.de("40.00"));
            String clave = "idem-directo-" + orden.referencia();
            cobrarOrdenes.cobrar(cobranza(orden, "C-01", clave), porQue());

            assertThatThrownBy(
                            () ->
                                    transaccion.execute(
                                            estado -> {
                                                TenantContext.fijar(
                                                        new MunicipalidadId(municipalidad));
                                                return jdbc.sql(
                                                                "INSERT INTO recibo"
                                                                        + " (municipalidad_id, serie,"
                                                                        + "  numero, caja_id, cajero,"
                                                                        + "  contribuyente_id,"
                                                                        + "  forma_pago, total,"
                                                                        + "  actualizado_a,"
                                                                        + "  clave_idempotencia,"
                                                                        + "  usuario_registro,"
                                                                        + "  observacion)"
                                                                        + " VALUES (:muni, '001',"
                                                                        + "  999999, :caja, 'x', 7,"
                                                                        + "  'EFECTIVO', 1, :fecha,"
                                                                        + "  :clave, 'x', 'x')")
                                                        .param("muni", municipalidad)
                                                        .param("caja", cajaId)
                                                        .param("fecha", PAGO)
                                                        .param("clave", clave)
                                                        .update();
                                            }))
                    .as("recibo_idempotencia_uq es la garantia final, no la lectura previa")
                    .hasStackTraceContaining("recibo_idempotencia_uq");
        }

        @Test
        @DisplayName("dos ordenes de sistemas distintos no caben en un recibo")
        void dosSistemasNoCabenEnUnRecibo() {
            Orden deRentas = ordenPendiente("MIX-1", Dinero.de("100.00"));
            Orden deMercados = ordenPendiente(MERCADOS, "MIX-2", Dinero.de("30.00"));

            assertThatThrownBy(
                            () ->
                                    cobrarOrdenes.cobrar(
                                            new CobrarOrdenes.Cobranza(
                                                    "C-01",
                                                    "cajero.prueba",
                                                    List.of(deRentas.id(), deMercados.id()),
                                                    FormaDePago.EFECTIVO,
                                                    PAGO,
                                                    null),
                                            porQue()))
                    .isInstanceOf(CobrarOrdenes.OrdenesDeVariosSistemas.class);
            assertThat(contarRecibos(deRentas)).isZero();
            assertThat(estadoDe(deMercados)).isEqualTo(EstadoDeOrden.PENDIENTE);
        }
    }

    @Nested
    @DisplayName("El alta de la orden es idempotente, y lo garantiza el motor")
    class DelAltaDeOrdenes {

        @Test
        @DisplayName("dos altas de la misma referencia dan UNA orden, y la segunda lo dice")
        void dosAltasDanUnaOrden() {
            String referencia = "ALTA-" + CONTADOR.incrementAndGet();

            OrdenDeCobroRepository.Alta primera =
                    enTransaccion(
                            () -> ordenes.registrar(nueva(RENTAS, referencia, Dinero.de("50.00"))));
            OrdenDeCobroRepository.Alta segunda =
                    enTransaccion(
                            () -> ordenes.registrar(nueva(RENTAS, referencia, Dinero.de("99.00"))));

            assertThat(primera.nueva()).isTrue();
            assertThat(segunda.nueva())
                    .as("reintentar el alta no es un error, pero tampoco es un alta")
                    .isFalse();
            assertThat(segunda.orden().id()).isEqualTo(primera.orden().id());
            assertThat(segunda.orden().importe())
                    .as("y devuelve LA QUE YA ESTABA: el segundo importe no pisa al primero")
                    .isEqualTo(Dinero.de("50.00"));
        }

        @Test
        @DisplayName("diez altas simultaneas de la misma referencia dan UNA orden")
        void diezAltasSimultaneasDanUnaOrden() throws Exception {
            String referencia = "ALTA-CONC-" + CONTADOR.incrementAndGet();
            int hilos = 10;
            CountDownLatch salida = new CountDownLatch(1);
            List<Callable<Long>> tareas = new ArrayList<>();
            for (int i = 0; i < hilos; i++) {
                tareas.add(
                        () -> {
                            TenantContext.fijar(new MunicipalidadId(municipalidad));
                            salida.await(10, TimeUnit.SECONDS);
                            return enTransaccion(
                                            () ->
                                                    ordenes.registrar(
                                                            nueva(
                                                                    RENTAS,
                                                                    referencia,
                                                                    Dinero.de("50.00"))))
                                    .orden()
                                    .idGuardado();
                        });
            }

            ExecutorService ejecutor = Executors.newFixedThreadPool(hilos);
            List<Long> identificadores = new ArrayList<>();
            try {
                List<Future<Long>> futuros = new ArrayList<>();
                for (Callable<Long> tarea : tareas) {
                    futuros.add(ejecutor.submit(tarea));
                }
                salida.countDown();
                for (Future<Long> futuro : futuros) {
                    identificadores.add(futuro.get(60, TimeUnit.SECONDS));
                }
            } finally {
                ejecutor.shutdownNow();
            }

            assertThat(identificadores)
                    .as(
                            "un solo identificador: con dos, el sistema de origen habria mandado"
                                    + " un cobro y el administrado tendria que pagarlo dos veces")
                    .containsOnly(identificadores.get(0));
            assertThat(
                            enTransaccion(
                                    () ->
                                            jdbc.sql(
                                                            "SELECT count(*) FROM orden_de_cobro"
                                                                    + " WHERE referencia_externa = :r")
                                                    .param("r", referencia)
                                                    .query(Long.class)
                                                    .single()))
                    .isEqualTo(1L);
        }
    }

    @Nested
    @DisplayName("AC 5 — El recibo no se edita ni se borra")
    class DeLaInmutabilidad {

        @Test
        @DisplayName("sgtm_app no tiene privilegio para actualizar un recibo (V29)")
        void noSePuedeActualizarUnRecibo() {
            Orden orden = ordenPendiente("INMUT-1", Dinero.de("30.00"));
            Recibo emitido = cobrarOrdenes.cobrar(cobranza(orden, "C-01", null), porQue()).recibo();

            assertThat(
                            sqlStateAlIntentar(
                                    () ->
                                            // El total y no `estado`: V30 retiro esa columna
                                            // porque decia EMITIDO para siempre. La regla es la
                                            // misma y ahora se mide sobre una columna que existe.
                                            jdbc.sql(
                                                            "UPDATE recibo SET total = 1"
                                                                    + " WHERE id = :id")
                                                    .param("id", emitido.id())
                                                    .update()))
                    .as("anular es agregar un movimiento (#34), no reescribir el papel")
                    .isEqualTo(PRIVILEGIO_INSUFICIENTE);
        }

        @Test
        @DisplayName("sgtm_app tampoco puede actualizar el detalle congelado")
        void noSePuedeActualizarElDetalle() {
            Orden orden = ordenPendiente("INMUT-2", Dinero.de("30.00"));
            Recibo emitido = cobrarOrdenes.cobrar(cobranza(orden, "C-01", null), porQue()).recibo();

            assertThat(
                            sqlStateAlIntentar(
                                    () ->
                                            jdbc.sql(
                                                            "UPDATE recibo_detalle SET monto = 1"
                                                                    + " WHERE recibo_id = :id")
                                                    .param("id", emitido.id())
                                                    .update()))
                    .isEqualTo(PRIVILEGIO_INSUFICIENTE);
        }

        @Test
        @DisplayName("ni borrarlo: RNF-051 no le dio nunca el privilegio")
        void noSePuedeBorrarUnRecibo() {
            Orden orden = ordenPendiente("INMUT-3", Dinero.de("30.00"));
            Recibo emitido = cobrarOrdenes.cobrar(cobranza(orden, "C-01", null), porQue()).recibo();

            assertThat(
                            sqlStateAlIntentar(
                                    () ->
                                            jdbc.sql("DELETE FROM recibo WHERE id = :id")
                                                    .param("id", emitido.id())
                                                    .update()))
                    .isEqualTo(PRIVILEGIO_INSUFICIENTE);
        }
    }

    @Nested
    @DisplayName("AC 6 — La caja de una municipalidad no ve la de otra")
    class DelAislamiento {

        @Test
        @DisplayName("desde B, el recibo de A no existe")
        void desdeBElReciboDeANoExiste() {
            Orden orden = ordenPendiente("RLS-1", Dinero.de("60.00"));
            Recibo emitido = cobrarOrdenes.cobrar(cobranza(orden, "C-01", null), porQue()).recibo();

            TenantContext.fijar(new MunicipalidadId(otraMunicipalidad));
            java.util.Optional<Recibo> desdeB =
                    transaccion.execute(
                            estado -> {
                                TenantContext.fijar(new MunicipalidadId(otraMunicipalidad));
                                return recibos.porNumero(emitido.numero());
                            });

            assertThat(desdeB)
                    .as("la misma serie y el mismo numero existen en A; desde B, no hay fila")
                    .isEmpty();
        }

        @Test
        @DisplayName(
                "desde B, la orden de A no se puede cobrar: ese identificador no apunta a nada")
        void desdeBNoSeCobraLaOrdenDeA() {
            Orden orden = ordenPendiente("RLS-2", Dinero.de("60.00"));

            TenantContext.fijar(new MunicipalidadId(otraMunicipalidad));
            assertThatThrownBy(() -> cobrarOrdenes.cobrar(cobranza(orden, "C-01", null), porQue()))
                    .as("RLS no deja ver ni la fila de la orden de A")
                    .isInstanceOf(OrdenDeCobroRepository.OrdenInexistente.class);
        }

        @Test
        @DisplayName("y la misma referencia externa puede existir en las dos, sin chocar")
        void laMismaReferenciaCabeEnLasDos() {
            String referencia = "COMPARTIDA-" + CONTADOR.incrementAndGet();
            long enA =
                    enTransaccion(
                                    () ->
                                            ordenes.registrar(
                                                    nueva(RENTAS, referencia, Dinero.de("10.00"))))
                            .orden()
                            .idGuardado();

            TenantContext.fijar(new MunicipalidadId(otraMunicipalidad));
            long enB =
                    transaccion.execute(
                            estado -> {
                                TenantContext.fijar(new MunicipalidadId(otraMunicipalidad));
                                return ordenes.registrar(
                                                nueva(RENTAS, referencia, Dinero.de("20.00")))
                                        .orden()
                                        .idGuardado();
                            });

            assertThat(enB)
                    .as(
                            "orden_referencia_uq lleva municipalidad_id delante: dos municipios"
                                    + " numeran sus cobros sin ponerse de acuerdo")
                    .isNotEqualTo(enA);
        }
    }

    @Nested
    @DisplayName("La numeracion")
    class DeLaNumeracion {

        @Test
        @DisplayName("veinte reservas concurrentes de la misma serie dan veinte numeros seguidos")
        void veinteReservasNoDejanHuecos() throws Exception {
            long antes = correlativoDe("NUM");
            Caja deLaSerie = crearCajaDeLaSerie("C-NUM", "NUM");

            int hilos = 20;
            CountDownLatch salida = new CountDownLatch(1);
            List<Callable<Long>> tareas = new ArrayList<>();
            for (int i = 0; i < hilos; i++) {
                tareas.add(
                        () -> {
                            TenantContext.fijar(new MunicipalidadId(municipalidad));
                            salida.await(10, TimeUnit.SECONDS);
                            return enTransaccion(() -> recibos.siguienteNumero(deLaSerie)).numero();
                        });
            }

            ExecutorService ejecutor = Executors.newFixedThreadPool(hilos);
            List<Long> numeros = new ArrayList<>();
            try {
                List<Future<Long>> futuros = new ArrayList<>();
                for (Callable<Long> tarea : tareas) {
                    futuros.add(ejecutor.submit(tarea));
                }
                salida.countDown();
                for (Future<Long> futuro : futuros) {
                    numeros.add(futuro.get(60, TimeUnit.SECONDS));
                }
            } finally {
                ejecutor.shutdownNow();
            }

            assertThat(numeros).doesNotHaveDuplicates().hasSize(hilos);
            assertThat(numeros.stream().sorted().toList())
                    .as("sin huecos: el UPSERT bloquea la fila, no la lee y la escribe aparte")
                    .isEqualTo(
                            java.util.stream.LongStream.rangeClosed(antes + 1, antes + hilos)
                                    .boxed()
                                    .toList());
        }

        @Test
        @DisplayName("dos cajas distintas no comparten correlativo: cada una tiene su serie")
        void dosCajasNoSePisan() {
            Orden una = ordenPendiente("SERIE-1", Dinero.de("40.00"));
            Orden otra = ordenPendiente("SERIE-2", Dinero.de("40.00"));
            crearCajaDeLaSerie("C-OTRA", "OTRA");

            Recibo enUna = cobrarOrdenes.cobrar(cobranza(una, "C-01", null), porQue()).recibo();
            Recibo enOtra = cobrarOrdenes.cobrar(cobranza(otra, "C-OTRA", null), porQue()).recibo();

            assertThat(enUna.numero().serie()).isEqualTo("001");
            assertThat(enOtra.numero().serie()).isEqualTo("OTRA");
            assertThat(enOtra.numero().numero())
                    .as("la caja nueva empieza en 1 aunque la otra lleve varios")
                    .isEqualTo(1L);
        }
    }

    @Nested
    @DisplayName("La caja de tasas")
    class DeLasTasas {

        @Test
        @DisplayName("cobra la tarifa registrada y no deja ningun evento en el buzon")
        void cobraLaTarifaRegistrada() {
            crearTasa("T-100", Dinero.de("12.50"), LocalDate.of(2026, 1, 1));

            Recibo emitido =
                    cobrarTasa.cobrar(
                            new CobrarTasa.CobroDeTasas(
                                    "C-01",
                                    "cajero.prueba",
                                    PAGADOR,
                                    List.of(new LineaDeTasaPedida("T-100", 4)),
                                    FormaDePago.EFECTIVO,
                                    PAGO,
                                    null),
                            porQue());

            assertThat(emitido.total()).isEqualTo(Dinero.de("50.00"));
            assertThat(emitido.tipoDePago()).isEqualTo(TipoDePago.TASA);
            assertThat(
                            enTransaccion(
                                    () ->
                                            buzon.delRecibo(
                                                    java.util.Objects.requireNonNull(emitido.id()),
                                                    TipoDeEventoDePago.PAGO_REGISTRADO)))
                    .as(
                            "un derecho del TUPA lo emitio esta misma caja: no hay sistema de"
                                    + " origen al que avisarle, y un evento sin destinatario obligaria"
                                    + " al receptor a tratar «no lo conozco» como normal")
                    .isEmpty();
        }

        @Test
        @DisplayName("la base rechaza una linea de tasa cuyo monto no es cantidad x precio")
        void laBaseCompruebaLaMultiplicacion() {
            crearTasa("T-200", Dinero.de("10.00"), LocalDate.of(2026, 1, 1));
            Recibo emitido =
                    cobrarTasa.cobrar(
                            new CobrarTasa.CobroDeTasas(
                                    "C-01",
                                    "cajero.prueba",
                                    PAGADOR,
                                    List.of(new LineaDeTasaPedida("T-200", 2)),
                                    FormaDePago.EFECTIVO,
                                    PAGO,
                                    null),
                            porQue());

            long tasaId =
                    enTransaccion(
                            () ->
                                    jdbc.sql(
                                                    "SELECT tasa_id FROM recibo_detalle"
                                                            + " WHERE recibo_id = :id")
                                            .param("id", emitido.id())
                                            .query(Long.class)
                                            .single());

            assertThatThrownBy(
                            () ->
                                    enTransaccion(
                                            () ->
                                                    jdbc.sql(
                                                                    "INSERT INTO recibo_detalle"
                                                                            + " (municipalidad_id,"
                                                                            + "  recibo_id, tributo,"
                                                                            + "  concepto, tasa_id,"
                                                                            + "  cantidad,"
                                                                            + "  precio_unitario,"
                                                                            + "  monto, insoluto)"
                                                                            + " VALUES (:muni, :rec,"
                                                                            + "  'T-200', 'TASA',"
                                                                            + "  :tasa, 2, 10.00,"
                                                                            + "  15.00, 15.00)")
                                                            .param("muni", municipalidad)
                                                            .param("rec", emitido.id())
                                                            .param("tasa", tasaId)
                                                            .update()))
                    .as("2 x 10.00 no son 15.00, y eso no depende de que la aplicacion lo mire")
                    .hasStackTraceContaining("recibo_detalle_tasa_ck");
        }
    }

    // ------------------------------------------------------------------
    // Utilidades
    // ------------------------------------------------------------------

    /** Una orden sembrada: su identificador y la referencia con la que se la reconoce. */
    private record Orden(long id, String referencia) {}

    /**
     * Un {@link BuzonDeSalida} que encola de verdad y despues revienta.
     *
     * <p>Encolar de verdad es lo que hace util la prueba: si el doble no insertara, «cero eventos»
     * seria cierto haga lo que haga la transaccion, y la comprobacion no podria fallar.
     */
    private record BuzonQueRevientaAlEncolar(BuzonDeSalida real) implements BuzonDeSalida {

        @Override
        public EventoDePago encolar(EventoDePago evento) {
            EventoDePago encolado = real.encolar(evento);
            throw new FalloSimulado(encolado.eventoId().toString());
        }

        @Override
        public List<EventoDePago> pendientes(int cuantos) {
            return real.pendientes(cuantos);
        }

        @Override
        public void marcarEntregado(long id, Instant cuando) {
            real.marcarEntregado(id, cuando);
        }

        @Override
        public void marcarFallido(long id, String error, boolean seAgotaron) {
            real.marcarFallido(id, error, seAgotaron);
        }

        @Override
        public void explicar(long id, String explicacion) {
            real.explicar(id, explicacion);
        }

        @Override
        public java.util.Optional<EventoDePago> porId(long id) {
            return real.porId(id);
        }

        @Override
        public java.util.Optional<EventoDePago> porEventoId(java.util.UUID eventoId) {
            return real.porEventoId(eventoId);
        }

        @Override
        public java.util.Optional<EventoDePago> delRecibo(long reciboId, TipoDeEventoDePago tipo) {
            return real.delRecibo(reciboId, tipo);
        }

        @Override
        public List<EventoDePago> loQueImpideCerrar(long turnoId) {
            return real.loQueImpideCerrar(turnoId);
        }

        @Override
        public List<EventoDePago> muertos() {
            return real.muertos();
        }

        @Override
        public List<RecuentoDelDia> recuentoDe(LocalDate dia) {
            return real.recuentoDe(dia);
        }
    }

    /** El fallo que la prueba provoca a mitad de la cobranza. */
    private static final class FalloSimulado extends RuntimeException {

        @java.io.Serial private static final long serialVersionUID = 1L;

        FalloSimulado(String evento) {
            super("Fallo provocado despues de encolar el evento " + evento);
        }
    }

    private CobrarOrdenes.Cobranza cobranza(
            Orden orden, String codigoDeCaja, @Nullable String clave) {
        return cobranza(orden, codigoDeCaja, "cajero.prueba", clave);
    }

    private CobrarOrdenes.Cobranza cobranza(
            Orden orden, String codigoDeCaja, String cajero, @Nullable String clave) {
        return new CobrarOrdenes.Cobranza(
                codigoDeCaja, cajero, List.of(orden.id()), FormaDePago.EFECTIVO, PAGO, clave);
    }

    private static Observacion porQue() {
        return Observacion.de("Cobranza en ventanilla, prueba de #33");
    }

    /** {@code insufficient_privilege}: el SQLSTATE de un {@code REVOKE} que muerde. */
    private static final String PRIVILEGIO_INSUFICIENTE = "42501";

    /**
     * El SQLSTATE con el que la base rechaza la sentencia, o {@code null} si la deja pasar.
     *
     * <p>Se compara el codigo y no el texto del mensaje a proposito: PostgreSQL lo traduce al
     * idioma del servidor, y una prueba que buscara «permission denied» se pondria verde por el
     * motivo equivocado en un motor en castellano -o roja sin que nada este mal-.
     */
    @SuppressWarnings("checkstyle:IllegalCatch")
    private static @Nullable String sqlStateAlIntentar(Runnable sentencia) {
        try {
            enTransaccion(
                    () -> {
                        sentencia.run();
                        return null;
                    });
            return null;
        } catch (RuntimeException rechazo) {
            for (Throwable causa = rechazo; causa != null; causa = causa.getCause()) {
                if (causa instanceof SQLException sql) {
                    return sql.getSQLState();
                }
            }
            throw rechazo;
        }
    }

    private static <T> T enTransaccion(java.util.function.Supplier<T> accion) {
        TenantContext.fijar(new MunicipalidadId(municipalidad));
        return transaccion.execute(
                estado -> {
                    TenantContext.fijar(new MunicipalidadId(municipalidad));
                    return accion.get();
                });
    }

    /** Una orden PENDIENTE de `rentas`, exigible desde antes del dia de pago. */
    private Orden ordenPendiente(String sufijo, Dinero importe) {
        return ordenPendiente(RENTAS, sufijo, importe);
    }

    private Orden ordenPendiente(SistemaDeOrigen sistema, String sufijo, Dinero importe) {
        String referencia = sufijo + "-" + CONTADOR.incrementAndGet();
        OrdenDeCobro guardada =
                enTransaccion(() -> ordenes.registrar(nueva(sistema, referencia, importe))).orden();
        return new Orden(guardada.idGuardado(), referencia);
    }

    private static OrdenDeCobro nueva(SistemaDeOrigen sistema, String referencia, Dinero importe) {
        return OrdenDeCobro.nueva(
                sistema,
                referencia,
                "IMPUESTO PREDIAL 2026",
                null,
                importe,
                LocalDate.of(2026, 1, 2),
                LocalDate.of(2026, 1, 2),
                PAGADOR,
                Instant.parse("2026-01-02T10:00:00Z"),
                Observacion.de("Orden emitida por el sistema de origen, prueba de #33"));
    }

    private EstadoDeOrden estadoDe(Orden orden) {
        return enTransaccion(() -> ordenes.porId(orden.id()).orElseThrow()).estado();
    }

    /**
     * Cuantos recibos cobraron esa orden.
     *
     * <p>Se cuenta por {@code recibo_detalle.referencia_externa} y no por {@code
     * orden_de_cobro.recibo_id}: en la prueba de atomicidad el fallo ocurre despues de escribir el
     * detalle, y contar por la orden daria cero incluso sin transaccion — o sea, una comprobacion
     * que no puede fallar.
     */
    private long contarRecibos(Orden orden) {
        return enTransaccion(
                () ->
                        jdbc.sql(
                                        "SELECT count(DISTINCT recibo_id) FROM recibo_detalle"
                                                + " WHERE referencia_externa = :r")
                                .param("r", orden.referencia())
                                .query(Long.class)
                                .single());
    }

    private long contarLineas(Orden orden) {
        return enTransaccion(
                () ->
                        jdbc.sql(
                                        "SELECT count(*) FROM recibo_detalle"
                                                + " WHERE referencia_externa = :r")
                                .param("r", orden.referencia())
                                .query(Long.class)
                                .single());
    }

    private long contarEventos(Orden orden) {
        return enTransaccion(
                () ->
                        jdbc.sql(
                                        "SELECT count(*) FROM pago_evento e"
                                                + " JOIN recibo_detalle d ON d.recibo_id ="
                                                + " e.recibo_id"
                                                + " WHERE d.referencia_externa = :r")
                                .param("r", orden.referencia())
                                .query(Long.class)
                                .single());
    }

    private long correlativoDe(String serie) {
        return enTransaccion(
                () ->
                        jdbc.sql(
                                        "SELECT coalesce(max(ultimo), 0) FROM recibo_correlativo"
                                                + " WHERE serie = :serie")
                                .param("serie", serie)
                                .query(Long.class)
                                .single());
    }

    private Caja crearCajaDeLaSerie(String codigo, String serie) {
        return enTransaccion(
                () ->
                        cajas.porCodigo(codigo)
                                .orElseGet(
                                        () -> {
                                            crearCaja(municipalidad, codigo, serie, areaId);
                                            return cajas.porCodigo(codigo).orElseThrow();
                                        }));
    }

    private void crearTasa(String codigo, Dinero importe, LocalDate desde) {
        insertarComoOwner(
                municipalidad,
                "INSERT INTO tasa (municipalidad_id, codigo, descripcion, area_id,"
                        + " partida_presupuestal, importe, vigencia_desde, documento_fuente)"
                        + " VALUES (?, ?, 'Concepto del TUPA', ?, '1.3.1.1.1.1', ?, ?,"
                        + "         'TUPA 2026 de la prueba') RETURNING id",
                municipalidad,
                codigo,
                areaId,
                importe.valor(),
                desde);
    }

    private static long crearArea(long muni, String codigo) {
        return insertarComoOwner(
                muni,
                "INSERT INTO area (municipalidad_id, codigo, nombre)"
                        + " VALUES (?, ?, 'Unidad de Rentas') RETURNING id",
                muni,
                codigo);
    }

    private static long crearCaja(long muni, String codigo, String serie, @Nullable Long area) {
        return insertarComoOwner(
                muni,
                "INSERT INTO caja (municipalidad_id, codigo, nombre, area_id, serie)"
                        + " VALUES (?, ?, 'Caja de la prueba', ?, ?) RETURNING id",
                muni,
                codigo,
                area,
                serie);
    }

    /**
     * Inserta una fila de siembra como {@code sgtm_owner}, con el contexto de tenant fijado.
     *
     * <p>Fijarlo no es opcional aunque quien escriba sea el dueno de la tabla: {@code FORCE ROW
     * LEVEL SECURITY} alcanza tambien al dueno, y sin contexto la insercion falla con «unrecognized
     * configuration parameter» —que es exactamente lo que debe pasar (DAT-01 §0)—.
     */
    private static long insertarComoOwner(long muni, String sql, Object... parametros) {
        try (Connection owner = base.conexion(BaseDeDatosDePrueba.OWNER)) {
            ContextoDeTenant.fijar(owner, muni);
            try (PreparedStatement sentencia = owner.prepareStatement(sql)) {
                for (int i = 0; i < parametros.length; i++) {
                    sentencia.setObject(i + 1, parametros[i]);
                }
                try (ResultSet resultado = sentencia.executeQuery()) {
                    resultado.next();
                    long id = resultado.getLong(1);
                    owner.commit();
                    return id;
                }
            }
        } catch (SQLException fallo) {
            throw new IllegalStateException("No se pudo sembrar: " + sql, fallo);
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
}
