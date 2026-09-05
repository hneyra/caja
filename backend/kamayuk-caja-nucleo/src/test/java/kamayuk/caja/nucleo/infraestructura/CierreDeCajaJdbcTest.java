package kamayuk.caja.nucleo.infraestructura;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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
import java.util.Map;
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
import kamayuk.caja.compartido.TenantContext;
import kamayuk.caja.dominio.Dinero;
import kamayuk.caja.dominio.MunicipalidadId;
import kamayuk.caja.dominio.Observacion;
import kamayuk.caja.esquema.BaseDeDatosDePrueba;
import kamayuk.caja.esquema.ContextoDeTenant;
import kamayuk.caja.nucleo.aplicacion.AbrirCaja;
import kamayuk.caja.nucleo.aplicacion.AnularRecibo;
import kamayuk.caja.nucleo.aplicacion.ArqueoDeTurno;
import kamayuk.caja.nucleo.aplicacion.CerrarTurno;
import kamayuk.caja.nucleo.aplicacion.CobrarOrdenes;
import kamayuk.caja.nucleo.aplicacion.CobrarTasa;
import kamayuk.caja.nucleo.aplicacion.ConsultaDeRecaudacion;
import kamayuk.caja.nucleo.dominio.CierreDeTurno;
import kamayuk.caja.nucleo.dominio.CierreDeTurnoRepository;
import kamayuk.caja.nucleo.dominio.CriterioDeRecaudacion;
import kamayuk.caja.nucleo.dominio.EstadoDeTurno;
import kamayuk.caja.nucleo.dominio.EventoDePago;
import kamayuk.caja.nucleo.dominio.FormaDePago;
import kamayuk.caja.nucleo.dominio.LineaDeArqueo;
import kamayuk.caja.nucleo.dominio.LineaDeTasaPedida;
import kamayuk.caja.nucleo.dominio.OrdenDeCobro;
import kamayuk.caja.nucleo.dominio.Pagador;
import kamayuk.caja.nucleo.dominio.RecaudacionDePartida;
import kamayuk.caja.nucleo.dominio.RecaudacionDeTributo;
import kamayuk.caja.nucleo.dominio.Recibo;
import kamayuk.caja.nucleo.dominio.SistemaDeOrigen;
import kamayuk.caja.nucleo.dominio.TipoDeMovimientoDeTurno;
import kamayuk.caja.nucleo.dominio.TurnoDeCaja;
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
import tools.jackson.databind.json.JsonMapper;

/**
 * #36 — El cierre de caja contra PostgreSQL de verdad, conectado como {@code kamayuk_app}.
 *
 * <h2>Contra que cuadra el cierre desde P5D</h2>
 *
 * <p>Ya no contra el libro de cuenta corriente —vive en otra base (ADR-0026)— sino contra el
 * <b>buzon de salida</b>: el turno no cierra mientras quede un pago sin entregar. Aqui eso deja de
 * ser una decision de un caso de uso y pasa a medirse con las filas de {@code pago_evento} de
 * verdad, entregandolas con el mismo {@code UPDATE} que hace el publicador.
 *
 * <p>Y cambio la barrera de la inmutabilidad: `V2` le retira a {@code kamayuk_app} el {@code
 * UPDATE} sobre {@code cierre_caja}, que es justo lo que V32 del monolito intento y no pudo —
 * porque entonces el turno era el punto de serializacion de la ventanilla y {@code SELECT ... FOR
 * UPDATE} exige ese privilegio. Desde P5D lo serializa la orden de cobro, asi que el turno puede
 * ser inmutable de verdad. Esta clase lo comprueba <b>en las dos tablas</b>.
 */
@DisplayName("#36 — El cierre de caja contra PostgreSQL")
class CierreDeCajaJdbcTest {

    private static final LocalDate HOY = LocalDate.of(2026, 3, 15);
    private static final Clock RELOJ =
            Clock.fixed(Instant.parse("2026-03-15T18:00:00Z"), ZoneId.of("America/Lima"));

    private static final SistemaDeOrigen RENTAS = SistemaDeOrigen.de("rentas");
    private static final Pagador PAGADOR = new Pagador("12345678", "TITULAR, PRUEBA", 7L);

    /** {@code insufficient_privilege}: el SQLSTATE de un {@code REVOKE} que muerde. */
    private static final String PRIVILEGIO_INSUFICIENTE = "42501";

    /** {@code unique_violation}: el SQLSTATE de un indice unico que muerde. */
    private static final String VIOLACION_DE_UNICIDAD = "23505";

    private static BaseDeDatosDePrueba base;
    private static long municipalidad;
    private static long otraMunicipalidad;
    private static long areaTributaria;
    private static long areaComercializacion;
    private static JdbcClient jdbc;
    private static TransactionTemplate transaccion;
    private static TenantTransactionManager gestor;
    private static DriverManagerDataSource pool;

    private static CierreDeTurnoRepositoryJdbc cierres;
    private static TurnoDeCajaRepositoryJdbc turnos;
    private static CajaRepositoryJdbc cajas;
    private static OrdenDeCobroRepositoryJdbc ordenes;
    private static BuzonDeSalidaJdbc buzon;
    private static CobrarOrdenes cobrarOrdenes;
    private static CobrarTasa cobrarTasa;
    private static AnularRecibo anularRecibo;
    private static CerrarTurno cerrarTurno;
    private static ConsultaDeRecaudacion consulta;

    private static final AtomicInteger CONTADOR = new AtomicInteger();

    @BeforeAll
    static void provisionar() throws SQLException, IOException {
        base = BaseDeDatosDePrueba.provisionar();
        municipalidad = crearMunicipalidad("240601", "Municipalidad del cierre");
        otraMunicipalidad = crearMunicipalidad("240602", "Municipalidad vecina de #36");

        pool = new DriverManagerDataSource();
        pool.setUrl(base.url());
        pool.setUsername(BaseDeDatosDePrueba.APP);
        pool.setPassword(base.clave(BaseDeDatosDePrueba.APP));

        jdbc = JdbcClient.create(pool);
        gestor = new TenantTransactionManager(pool);
        transaccion = new TransactionTemplate(gestor);

        cierres = new CierreDeTurnoRepositoryJdbc(jdbc);
        turnos = new TurnoDeCajaRepositoryJdbc(jdbc);
        cajas = new CajaRepositoryJdbc(jdbc);
        ordenes = new OrdenDeCobroRepositoryJdbc(jdbc);
        buzon = new BuzonDeSalidaJdbc(jdbc);
        ReciboRepositoryJdbc recibos = new ReciboRepositoryJdbc(jdbc);
        TasaRepositoryJdbc tasas = new TasaRepositoryJdbc(jdbc);
        MovimientoDeReciboRepositoryJdbc movimientosDeRecibo =
                new MovimientoDeReciboRepositoryJdbc(jdbc);
        RecaudacionRepositoryJdbc recaudacion = new RecaudacionRepositoryJdbc(jdbc);
        ComponedorDeEventosJson eventos = new ComponedorDeEventosJson(new JsonMapper());

        Auditoria auditoria = new AuditoriaJdbc(jdbc, RELOJ);
        AbrirCaja abrirCaja = envolver(new AbrirCaja(cajas, turnos, auditoria, RELOJ));

        cobrarOrdenes =
                envolver(
                        new CobrarOrdenes(
                                abrirCaja, ordenes, recibos, buzon, eventos, auditoria, RELOJ));
        cobrarTasa = envolver(new CobrarTasa(abrirCaja, tasas, recibos, auditoria, RELOJ));
        anularRecibo =
                envolver(
                        new AnularRecibo(
                                recibos,
                                movimientosDeRecibo,
                                turnos,
                                ordenes,
                                buzon,
                                eventos,
                                auditoria,
                                RELOJ));

        ArqueoDeTurno arqueos = new ArqueoDeTurno(cierres, buzon);
        cerrarTurno = envolver(new CerrarTurno(cajas, turnos, cierres, arqueos, auditoria, RELOJ));
        consulta = envolver(new ConsultaDeRecaudacion(recaudacion, arqueos));

        areaTributaria = crearArea(municipalidad, "A-36", "Unidad de Rentas");
        areaComercializacion = crearArea(municipalidad, "A-37", "Comercializacion");
        crearCaja(municipalidad, "C-36", "R36", areaTributaria);
        crearCaja(municipalidad, "C-37", "R37", areaTributaria);
        crearArea(otraMunicipalidad, "A-36", "Unidad de Rentas");
        crearCaja(otraMunicipalidad, "C-36", "R36", null);
        crearTasa("T-360", Dinero.de("50.00"), areaTributaria, "1.3.1.1.1.1");
        crearTasa("T-361", Dinero.de("33.33"), areaComercializacion, "1.3.9.9.9.9");
        crearTasa("T-362", Dinero.de("33.34"), areaComercializacion, "1.3.9.9.9.9");
    }

    /**
     * Envuelve el caso de uso en un proxy transaccional <b>de verdad</b>, igual que {@code
     * CajaJdbcTest}: lo que se verifica es la anotacion del codigo de produccion, no una
     * transaccion que abra la prueba.
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

    @AfterEach
    void limpiarContexto() {
        TenantContext.limpiar();
        OrigenContext.limpiar();
    }

    // ------------------------------------------------------------------

    @Nested
    @DisplayName("AC 1 — El dia completo")
    class DelDiaCompleto {

        @Test
        @DisplayName("abrir, cobrar de las dos clases, anular uno, entregar, cerrar: cuadra")
        void elDiaCompletoCuadraCentimoACentimo() {
            String cajero = cajero("dia-completo");

            // 1. Una orden de `rentas`, cobrada en ventanilla: 300,00 que SI producen evento.
            Recibo deOrden =
                    cobrarLaOrden("D36-1", Dinero.de("300.00"), cajero, FormaDePago.EFECTIVO);

            // 2. Una tasa del TUPA: 50,00 que NO avisan a nadie, porque las emitio esta caja.
            Recibo deTasa = cobrarLaTasa(cajero, "T-360", 1, FormaDePago.TARJETA);

            // 3. Otra cobranza de orden que despues se anula: entra y sale el mismo dia, y
            //    deja DOS eventos —el cobro y su anulacion—, los dos por entregar.
            Recibo aAnular =
                    cobrarLaOrden("D36-2", Dinero.de("120.00"), cajero, FormaDePago.EFECTIVO);
            anularRecibo.anular(
                    new AnularRecibo.Anulacion(
                            aAnular.numero(), "el contribuyente pago de mas", null, null),
                    porQue());

            long turnoId = turnoDe("C-36", cajero);
            entregarLoPendiente(turnoId);

            CerrarTurno.Cerrado cerrado =
                    cerrarTurno.cerrar(
                            new CerrarTurno.Cierre(
                                    "C-36",
                                    cajero,
                                    HOY,
                                    Map.of(
                                            FormaDePago.EFECTIVO, Dinero.de("300.00"),
                                            FormaDePago.TARJETA, Dinero.de("50.00"))),
                            porQue());

            assertThat(cerrado.cierre().arqueoCongelado().recibosEmitidos()).isEqualTo(3);
            assertThat(cerrado.cierre().arqueoCongelado().recibosAnulados()).isEqualTo(1);
            assertThat(cerrado.cierre().arqueoCongelado().totalCobrado())
                    .as("los tres recibos, el anulado incluido")
                    .isEqualTo(Dinero.de("470.00"));
            assertThat(cerrado.cierre().arqueoCongelado().totalAnulado())
                    .as("y la anulacion, restada: no cuenta como cobro")
                    .isEqualTo(Dinero.de("120.00"));
            assertThat(cerrado.cierre().arqueoCongelado().neto()).isEqualTo(Dinero.de("350.00"));
            assertThat(cerrado.cierre().arqueoCongelado().diferencia())
                    .as("lo declarado coincide con el neto, al centimo")
                    .isEqualTo(Dinero.CERO);

            assertThat(cerrado.cuadre().conEvento())
                    .as("solo lo que tiene destinatario y sigue vivo: 300, porque los 120 salieron")
                    .isEqualTo(Dinero.de("300.00"));
            assertThat(cerrado.cuadre().sinEvento())
                    .as("la tasa no avisa a nadie: cuadra contra el papel")
                    .isEqualTo(Dinero.de("50.00"));
            assertThat(cerrado.cuadre().total())
                    .as("y las dos mitades suman exactamente el neto del arqueo")
                    .isEqualTo(cerrado.cierre().arqueoCongelado().neto());

            // Y el acta esta en la base, con su desglose por medio de pago.
            assertThat(
                            enTransaccion(
                                    () ->
                                            jdbc.sql(
                                                            "SELECT neto FROM cierre_turno"
                                                                    + " WHERE id = :id")
                                                    .param("id", cerrado.cierre().idGuardado())
                                                    .query(java.math.BigDecimal.class)
                                                    .single()))
                    .isEqualByComparingTo(cerrado.cierre().arqueoCongelado().neto().valor());
            assertThat(sumaDelDetalle(cerrado.cierre().idGuardado()))
                    .as("la suma de las lineas del arqueo es su neto: sin centimos huerfanos")
                    .isEqualTo(cerrado.cierre().arqueoCongelado().neto());
            assertThat(deOrden.numero()).isNotEqualTo(deTasa.numero());
        }

        @Test
        @DisplayName("cobrar con el turno cerrado falla, y el mensaje dice como se reabre")
        void noSeCobraConElTurnoCerrado() {
            String cajero = cajero("tras-cerrar");
            cobrarLaOrden("D36-5", Dinero.de("90.00"), cajero, FormaDePago.EFECTIVO);
            entregarLoPendiente(turnoDe("C-36", cajero));
            cerrarTurno.cerrar(
                    new CerrarTurno.Cierre(
                            "C-36", cajero, HOY, Map.of(FormaDePago.EFECTIVO, Dinero.de("90.00"))),
                    porQue());

            assertThatThrownBy(
                            () ->
                                    cobrarLaOrden(
                                            "D36-6",
                                            Dinero.de("40.00"),
                                            cajero,
                                            FormaDePago.EFECTIVO))
                    .isInstanceOf(AbrirCaja.TurnoCerrado.class)
                    .hasMessageContaining("reversar ese cierre");
        }

        @Test
        @DisplayName("reversar reabre el turno, se sigue cobrando, y el cierre nuevo lo incluye")
        void reversarReabreYSeSigueCobrando() {
            String cajero = cajero("reabrir");
            cobrarLaOrden("D36-7", Dinero.de("200.00"), cajero, FormaDePago.EFECTIVO);
            long turnoId = turnoDe("C-36", cajero);
            entregarLoPendiente(turnoId);
            CerrarTurno.Cerrado primero =
                    cerrarTurno.cerrar(
                            new CerrarTurno.Cierre(
                                    "C-36",
                                    cajero,
                                    HOY,
                                    Map.of(FormaDePago.EFECTIVO, Dinero.de("200.00"))),
                            porQue());

            cerrarTurno.reversar(
                    "C-36", cajero, HOY, "quedaba un contribuyente en la cola", porQue());

            assertThat(estadoDelTurno(primero.cierre().turnoId()))
                    .as("reversar reabre: es la unica forma de seguir cobrando ese dia")
                    .isEqualTo(EstadoDeTurno.ABIERTO);

            cobrarLaOrden("D36-8", Dinero.de("75.00"), cajero, FormaDePago.EFECTIVO);
            entregarLoPendiente(turnoId);

            CerrarTurno.Cerrado nuevo =
                    cerrarTurno.cerrar(
                            new CerrarTurno.Cierre(
                                    "C-36",
                                    cajero,
                                    HOY,
                                    Map.of(FormaDePago.EFECTIVO, Dinero.de("275.00"))),
                            porQue());

            assertThat(nuevo.cierre().secuencia()).isEqualTo(3);
            assertThat(nuevo.cierre().arqueoCongelado().neto()).isEqualTo(Dinero.de("275.00"));
            assertThat(primeroSigueDiciendo(primero.cierre().idGuardado()))
                    .as("y el arqueo del primer cierre sigue diciendo lo que decia")
                    .isEqualTo(Dinero.de("200.00"));
        }
    }

    @Nested
    @DisplayName("AC 1.bis — El turno no cierra con un pago que el origen no conoce")
    class DelCierreBloqueante {

        @Test
        @DisplayName("un pago PENDIENTE impide cerrar, y el acta no llega a escribirse")
        void unPagoPendienteImpideCerrar() {
            String cajero = cajero("sin-entregar");
            cobrarLaOrden("D36-B1", Dinero.de("140.00"), cajero, FormaDePago.EFECTIVO);
            long turnoId = turnoDe("C-36", cajero);

            assertThatThrownBy(
                            () ->
                                    cerrarTurno.cerrar(
                                            new CerrarTurno.Cierre("C-36", cajero, HOY, Map.of()),
                                            porQue()))
                    .as(
                            "un turno cerrado con un pago en transito deja el acta firmada, el"
                                    + " cajon cuadrado y la deuda del administrado viva")
                    .isInstanceOf(ArqueoDeTurno.HayPagosSinEntregar.class)
                    .hasMessageContaining("todavia no sabe que existen");
            assertThat(enTransaccion(() -> cierres.deTurno(turnoId)))
                    .as("y la transaccion se lo lleva: no queda ni un acta")
                    .isEmpty();
        }

        @Test
        @DisplayName("un pago MUERTO tampoco deja cerrar; explicado por escrito, si")
        void elPagoMuertoSeExplicaYEntoncesCierra() {
            String cajero = cajero("muerto");
            Recibo recibo =
                    cobrarLaOrden("D36-B2", Dinero.de("90.00"), cajero, FormaDePago.EFECTIVO);
            long turnoId = turnoDe("C-36", cajero);
            long eventoId =
                    enTransaccion(() -> buzon.loQueImpideCerrar(turnoId)).get(0).idGuardado();

            enTransaccion(
                    () -> {
                        buzon.marcarFallido(eventoId, "el origen no contesta", true);
                        return null;
                    });

            assertThatThrownBy(
                            () ->
                                    cerrarTurno.cerrar(
                                            new CerrarTurno.Cierre("C-36", cajero, HOY, Map.of()),
                                            porQue()))
                    .as("un evento muerto es dinero cobrado sin registrar")
                    .isInstanceOf(ArqueoDeTurno.HayPagosSinEntregar.class)
                    .hasMessageContaining("MUERTO");

            enTransaccion(
                    () -> {
                        buzon.explicar(
                                eventoId, "Se registro a mano en rentas, memorando 014-2026-TES");
                        return null;
                    });

            CerrarTurno.Cerrado cerrado =
                    cerrarTurno.cerrar(
                            new CerrarTurno.Cierre(
                                    "C-36",
                                    cajero,
                                    HOY,
                                    Map.of(FormaDePago.EFECTIVO, Dinero.de("90.00"))),
                            porQue());

            assertThat(cerrado.cuadre().conEvento())
                    .as(
                            "explicado no es «no ocurrio»: el dinero se cobro y sigue contando"
                                    + " en la mitad que tiene destinatario")
                    .isEqualTo(recibo.total());
        }

        @Test
        @DisplayName("la base no deja explicar un evento sin decir quien ni por que")
        void laBaseExigeLaExplicacion() {
            String cajero = cajero("explicacion-vacia");
            cobrarLaOrden("D36-B3", Dinero.de("15.00"), cajero, FormaDePago.EFECTIVO);
            long eventoId =
                    enTransaccion(() -> buzon.loQueImpideCerrar(turnoDe("C-36", cajero)))
                            .get(0)
                            .idGuardado();

            assertThat(
                            sqlStateAlIntentar(
                                    () ->
                                            jdbc.sql(
                                                            "UPDATE pago_evento SET estado ="
                                                                    + " 'EXPLICADO', explicacion = ' '"
                                                                    + " WHERE id = :id")
                                                    .param("id", eventoId)
                                                    .update()))
                    .as(
                            "es lo unico que separa «alguien se hizo cargo» de «alguien lo apago"
                                    + " para poder cerrar la caja»")
                    .isEqualTo("23514");
        }
    }

    @Nested
    @DisplayName("AC 2 — Un cierre no se modifica ni se borra")
    class DeLaInmutabilidad {

        @Test
        @DisplayName("kamayuk_app no puede actualizar el acta, su desglose ni el turno")
        void sinUpdate() {
            String cajero = cajero("inmutable");
            cobrarLaTasa(cajero, "T-360", 1, FormaDePago.EFECTIVO);
            CerrarTurno.Cerrado cerrado =
                    cerrarTurno.cerrar(
                            new CerrarTurno.Cierre("C-36", cajero, HOY, Map.of()), porQue());
            long cierreId = cerrado.cierre().idGuardado();

            assertThat(
                            sqlStateAlIntentar(
                                    () ->
                                            jdbc.sql(
                                                            "UPDATE cierre_turno"
                                                                    + " SET total_declarado = 0"
                                                                    + " WHERE id = :id")
                                                    .param("id", cierreId)
                                                    .update()))
                    .as("corregir el arqueo firmado haria desaparecer el descuadre del acta")
                    .isEqualTo(PRIVILEGIO_INSUFICIENTE);
            assertThat(
                            sqlStateAlIntentar(
                                    () ->
                                            jdbc.sql(
                                                            "UPDATE cierre_turno_detalle"
                                                                    + " SET declarado = 0"
                                                                    + " WHERE cierre_id = :id")
                                                    .param("id", cierreId)
                                                    .update()))
                    .isEqualTo(PRIVILEGIO_INSUFICIENTE);
        }

        @Test
        @DisplayName("y desde P5D el TURNO tampoco: `V2` le hizo el REVOKE que V32 no pudo")
        void elTurnoTambienEsInmutableDesdeP5D() {
            // Este es el reverso del hallazgo de #36. V32 quiso revocarle a `kamayuk_app` el
            // UPDATE sobre `cierre_caja` y no pudo: `SELECT ... FOR UPDATE` exige ese
            // privilegio, y esa fila era donde se serializaba la ventanilla. Revocarlo no
            // habria hecho el turno inmutable: habria dejado la caja sin poder cobrar.
            //
            // Desde P5D la ventanilla la serializa `orden_de_cobro`, asi que el turno ya no
            // se bloquea y el REVOKE cabe. Lo que se comprueba es que las TRES tablas del
            // cierre son inmutables, y que la que si se bloquea conserva su privilegio.
            assertThat(privilegioDeUpdateSobre("cierre_caja"))
                    .as("el turno ya no se bloquea, asi que puede ser inmutable de verdad")
                    .isFalse();
            assertThat(privilegioDeUpdateSobre("cierre_turno")).isFalse();
            assertThat(privilegioDeUpdateSobre("cierre_turno_detalle")).isFalse();
            assertThat(privilegioDeUpdateSobre("orden_de_cobro"))
                    .as(
                            "y la orden SI lo conserva, porque es la que se bloquea: sin el, la"
                                    + " ventanilla no podria cobrar (el hallazgo de V32, mudado)")
                    .isTrue();

            assertThat(
                            sqlStateAlIntentar(
                                    () ->
                                            jdbc.sql(
                                                            "SELECT id FROM cierre_caja"
                                                                    + " WHERE id = :t FOR UPDATE")
                                                    .param("t", 1L)
                                                    .query(Long.class)
                                                    .list()))
                    .as("bloquear una fila exige UPDATE, aunque la sentencia sea un SELECT")
                    .isEqualTo(PRIVILEGIO_INSUFICIENTE);
        }

        @Test
        @DisplayName("un cierre no se reversa dos veces: lo impide el indice unico parcial")
        void unaSolaReversionPorCierre() {
            String cajero = cajero("doble-reversion");
            cobrarLaTasa(cajero, "T-360", 1, FormaDePago.EFECTIVO);
            CerrarTurno.Cerrado cerrado =
                    cerrarTurno.cerrar(
                            new CerrarTurno.Cierre("C-36", cajero, HOY, Map.of()), porQue());

            cerrarTurno.reversar("C-36", cajero, HOY, "primera reversion", porQue());

            // La segunda no pasa por el caso de uso -no hay cierre vigente-, asi que se
            // intenta por SQL directo: lo que se prueba es que la BASE lo impide, no que
            // la aplicacion se acuerde de mirar.
            assertThat(
                            sqlStateAlIntentar(
                                    () ->
                                            jdbc.sql(
                                                            "INSERT INTO cierre_turno"
                                                                    + " (municipalidad_id, turno_id,"
                                                                    + "  tipo, secuencia, fecha,"
                                                                    + "  fecha_registro, revierte_a_id,"
                                                                    + "  motivo, usuario_registro,"
                                                                    + "  observacion)"
                                                                    + " VALUES (:muni, :turno,"
                                                                    + "  'REVERSION', 9, :fecha, now(),"
                                                                    + "  :cierre, 'otra vez',"
                                                                    + "  'prueba', 'segunda"
                                                                    + " reversion')")
                                                    .param("muni", municipalidad)
                                                    .param("turno", cerrado.cierre().turnoId())
                                                    .param("fecha", HOY)
                                                    .param("cierre", cerrado.cierre().idGuardado())
                                                    .update()))
                    .as("dos reversiones dejarian el historial contando una reapertura de mas")
                    .isEqualTo(VIOLACION_DE_UNICIDAD);
        }

        @Test
        @DisplayName("la base comprueba la aritmetica del arqueo: neto y diferencia")
        void laBaseCompruebaLaAritmetica() {
            String cajero = cajero("aritmetica");
            cobrarLaTasa(cajero, "T-360", 1, FormaDePago.EFECTIVO);
            CerrarTurno.Cerrado cerrado =
                    cerrarTurno.cerrar(
                            new CerrarTurno.Cierre("C-36", cajero, HOY, Map.of()), porQue());

            assertThat(
                            sqlStateAlIntentar(
                                    () ->
                                            jdbc.sql(
                                                            "INSERT INTO cierre_turno"
                                                                    + " (municipalidad_id, turno_id,"
                                                                    + "  tipo, secuencia, fecha,"
                                                                    + "  fecha_registro, total_cobrado,"
                                                                    + "  total_anulado, neto,"
                                                                    + "  total_declarado, diferencia,"
                                                                    + "  recibos_emitidos,"
                                                                    + "  recibos_anulados,"
                                                                    + "  usuario_registro, observacion)"
                                                                    + " VALUES (:muni, :turno,"
                                                                    + "  'CIERRE', 8, :fecha, now(),"
                                                                    + "  100.00, 10.00, 95.00, 95.00,"
                                                                    + "  0.00, 1, 0, 'prueba', 'un"
                                                                    + " arqueo que no cuadra consigo"
                                                                    + " mismo')")
                                                    .param("muni", municipalidad)
                                                    .param("turno", cerrado.cierre().turnoId())
                                                    .param("fecha", HOY)
                                                    .update()))
                    .as("100 - 10 no son 95, y eso no depende de que la aplicacion lo mire")
                    .isEqualTo("23514");
        }
    }

    @Nested
    @DisplayName("AC 3 — Dos cierres a la vez")
    class DeLaConcurrencia {

        @Test
        @DisplayName("ocho peticiones simultaneas de cierre producen un acta, no ocho")
        void unSoloCierre() throws Exception {
            String cajero = cajero("concurrencia");
            cobrarLaTasa(cajero, "T-360", 10, FormaDePago.EFECTIVO);
            long turnoId = turnoDe("C-36", cajero);

            int cuantos = 8;
            ExecutorService hilos = Executors.newFixedThreadPool(cuantos);
            CountDownLatch salida = new CountDownLatch(1);
            try {
                List<Future<Boolean>> intentos = new ArrayList<>();
                for (int i = 0; i < cuantos; i++) {
                    intentos.add(
                            hilos.submit(
                                    () -> {
                                        salida.await();
                                        TenantContext.fijar(new MunicipalidadId(municipalidad));
                                        OrigenContext.fijar(
                                                new Origen("cajero.prueba", null, null));
                                        try {
                                            cerrarTurno.cerrar(
                                                    new CerrarTurno.Cierre(
                                                            "C-36", cajero, HOY, Map.of()),
                                                    porQue());
                                            return true;
                                        } catch (CerrarTurno.TurnoYaCerrado
                                                | CierreDeTurnoRepository.TurnoYaTieneEseMovimiento
                                                        rechazado) {
                                            // Los dos son «este turno ya se cerro», y se atrapan
                                            // por su tipo y no como RuntimeException a proposito:
                                            // lo que se prueba no es que los perdedores fallen,
                                            // sino que fallen POR ESO. Con un catch ancho, un
                                            // fallo de conexion contaria como cierre rechazado y
                                            // la prueba seguiria verde.
                                            return false;
                                        } finally {
                                            TenantContext.limpiar();
                                            OrigenContext.limpiar();
                                        }
                                    }));
                }
                salida.countDown();
                long exitosos = 0;
                for (Future<Boolean> intento : intentos) {
                    if (Boolean.TRUE.equals(intento.get(30, TimeUnit.SECONDS))) {
                        exitosos++;
                    }
                }
                assertThat(exitosos).as("uno cierra; los otros siete chocan").isEqualTo(1);
            } finally {
                hilos.shutdownNow();
            }

            assertThat(enTransaccion(() -> cierres.deTurno(turnoId)))
                    .as("y en la base queda un acta, no ocho")
                    .singleElement()
                    .extracting(CierreDeTurno::tipo)
                    .isEqualTo(TipoDeMovimientoDeTurno.CIERRE);
        }
    }

    @Nested
    @DisplayName("AC 4 — El avance en vivo no contiende con la cobranza")
    class DeLaNoContencion {

        @Test
        @DisplayName("con la orden bloqueada por una cobranza en curso, el avance responde igual")
        void elAvanceNoEsperaAlCandado() throws Exception {
            String cajero = cajero("no-contencion");
            cobrarLaOrden("D36-13", Dinero.de("250.00"), cajero, FormaDePago.EFECTIVO);
            // Otra orden, pendiente: es la que un cajero estaria cobrando ahora mismo.
            long enCurso = sembrarOrden("D36-13B", Dinero.de("10.00"));

            CountDownLatch bloqueado = new CountDownLatch(1);
            CountDownLatch suelta = new CountDownLatch(1);
            ExecutorService hilos = Executors.newFixedThreadPool(2);
            try {
                // Un hilo se queda con la ORDEN bloqueada con FOR UPDATE, que es exactamente
                // lo que hace una cobranza en curso desde P5D —antes era el turno—, y no la
                // suelta hasta que se le diga.
                Future<?> cobranza =
                        hilos.submit(
                                () -> {
                                    TenantContext.fijar(new MunicipalidadId(municipalidad));
                                    transaccion.execute(
                                            estado -> {
                                                TenantContext.fijar(
                                                        new MunicipalidadId(municipalidad));
                                                ordenes.bloquear(List.of(enCurso));
                                                bloqueado.countDown();
                                                try {
                                                    suelta.await(30, TimeUnit.SECONDS);
                                                } catch (InterruptedException interrumpido) {
                                                    Thread.currentThread().interrupt();
                                                }
                                                return null;
                                            });
                                    TenantContext.limpiar();
                                    return null;
                                });

                assertThat(bloqueado.await(30, TimeUnit.SECONDS))
                        .as("el candado tiene que estar puesto antes de medir nada")
                        .isTrue();

                Future<Dinero> avance =
                        hilos.submit(
                                () -> {
                                    TenantContext.fijar(new MunicipalidadId(municipalidad));
                                    try {
                                        return consulta.delTurno("C-36", cajero, HOY, HOY)
                                                .orElseThrow()
                                                .arqueo()
                                                .neto();
                                    } finally {
                                        TenantContext.limpiar();
                                    }
                                });

                // Cinco segundos son de sobra para una lectura agregada, y muy poco para
                // esperar a que el otro hilo suelte el candado -que no lo va a soltar-.
                assertThat(avance.get(5, TimeUnit.SECONDS))
                        .as("el avance lee sin FOR UPDATE: la cobranza en curso no lo detiene")
                        .isEqualTo(Dinero.de("250.00"));

                suelta.countDown();
                cobranza.get(30, TimeUnit.SECONDS);
            } finally {
                suelta.countDown();
                hilos.shutdownNow();
            }
        }
    }

    @Nested
    @DisplayName("AC 5 — La distribucion suma el total, sin centimos huerfanos")
    class DeLaDistribucion {

        @Test
        @DisplayName("por tributo y por partida suman lo mismo, y ese mismo es el neto del periodo")
        void lasPartesSumanElTotal() {
            String cajero = cajero("distribucion");
            cobrarLaOrden("D36-14", Dinero.de("100.00"), cajero, FormaDePago.EFECTIVO);
            // 33,33 y 33,34: si en algun sitio hubiera un reparto proporcional, aqui
            // saldria un centimo huerfano.
            cobrarLaTasa(cajero, "T-361", 1, FormaDePago.EFECTIVO);
            cobrarLaTasa(cajero, "T-362", 1, FormaDePago.EFECTIVO);

            CriterioDeRecaudacion delDia =
                    CriterioDeRecaudacion.delDia(HOY).enLaCajaDe("C-36", cajero);

            ConsultaDeRecaudacion.Avance avance = consulta.avance(delDia, HOY);
            ConsultaDeRecaudacion.Distribucion distribucion = consulta.porPartida(delDia, HOY);

            assertThat(avance.neto())
                    .as("100,00 + 33,33 + 33,34 = 166,67, al centimo")
                    .isEqualTo(Dinero.de("166.67"));
            assertThat(distribucion.neto())
                    .as("la distribucion reparte filas: suma exactamente lo mismo")
                    .isEqualTo(avance.neto());

            Dinero sumaDeLasFilas = Dinero.CERO;
            for (RecaudacionDeTributo fila : avance.filas()) {
                sumaDeLasFilas = sumaDeLasFilas.mas(fila.neto());
            }
            assertThat(sumaDeLasFilas).isEqualTo(avance.neto());
        }

        @Test
        @DisplayName("las tasas traen su area y su partida; lo que viene de una orden, ninguna")
        void loDeUnaOrdenNoTienePartida() {
            String cajero = cajero("partidas");
            cobrarLaOrden("D36-16", Dinero.de("400.00"), cajero, FormaDePago.EFECTIVO);
            cobrarLaTasa(cajero, "T-360", 2, FormaDePago.EFECTIVO);

            ConsultaDeRecaudacion.Distribucion distribucion =
                    consulta.porPartida(
                            CriterioDeRecaudacion.delDia(HOY).enLaCajaDe("C-36", cajero), HOY);

            assertThat(distribucion.filas())
                    .filteredOn(RecaudacionDePartida::tienePartida)
                    .singleElement()
                    .satisfies(
                            fila -> {
                                assertThat(fila.areaCodigo()).isEqualTo("A-36");
                                assertThat(fila.partidaPresupuestal()).isEqualTo("1.3.1.1.1.1");
                                assertThat(fila.neto()).isEqualTo(Dinero.de("100.00"));
                            });
            assertThat(distribucion.filas())
                    .filteredOn(fila -> !fila.tienePartida())
                    .as(
                            "una orden de cobro no trae area ni partida: la caja no sabe a que"
                                    + " partida presupuestal va lo que el sistema de origen le mando")
                    .allSatisfy(
                            fila -> {
                                assertThat(fila.areaCodigo()).isNull();
                                assertThat(fila.partidaPresupuestal()).isNull();
                            });
            assertThat(distribucion.netoSinPartida())
                    .as("y el reporte lo dice en vez de esconderlo")
                    .isEqualTo(Dinero.de("400.00"));
        }

        @Test
        @DisplayName("filtrar por area deja fuera lo de las ordenes, porque no consta en ninguna")
        void elFiltroPorArea() {
            String cajero = cajero("filtro-area");
            cobrarLaOrden("D36-18", Dinero.de("70.00"), cajero, FormaDePago.EFECTIVO);
            cobrarLaTasa(cajero, "T-361", 3, FormaDePago.EFECTIVO);

            ConsultaDeRecaudacion.Distribucion soloComercializacion =
                    consulta.porPartida(
                            new CriterioDeRecaudacion(HOY, HOY, null, "A-37", "C-36", cajero), HOY);

            assertThat(soloComercializacion.filas()).hasSize(1);
            assertThat(soloComercializacion.neto()).isEqualTo(Dinero.de("99.99"));
            assertThat(soloComercializacion.netoSinPartida()).isEqualTo(Dinero.CERO);
        }

        @Test
        @DisplayName("una anulacion se resta del avance en vez de desaparecer de el")
        void laAnulacionSeRestaDelAvance() {
            String cajero = cajero("avance-anulado");
            Recibo recibo =
                    cobrarLaOrden("D36-20", Dinero.de("220.00"), cajero, FormaDePago.EFECTIVO);
            anularRecibo.anular(
                    new AnularRecibo.Anulacion(recibo.numero(), "cobro duplicado", null, null),
                    porQue());

            ConsultaDeRecaudacion.Avance avance =
                    consulta.avance(
                            CriterioDeRecaudacion.delDia(HOY).enLaCajaDe("C-36", cajero), HOY);

            assertThat(avance.totalCobrado()).isEqualTo(Dinero.de("220.00"));
            assertThat(avance.totalAnulado()).isEqualTo(Dinero.de("220.00"));
            assertThat(avance.neto())
                    .as("entro y salio: el avance lo cuenta y lo resta, no lo esconde")
                    .isEqualTo(Dinero.CERO);
        }
    }

    @Nested
    @DisplayName("AC 6 — Ningun cajero ve la caja de otra municipalidad")
    class DelAislamiento {

        @Test
        @DisplayName("con el contexto de B, el turno, el cierre y sus pagos de A no existen")
        void desdeBNoSeVeNadaDeA() {
            String cajero = cajero("aislamiento");
            cobrarLaOrden("D36-21", Dinero.de("640.00"), cajero, FormaDePago.EFECTIVO);
            long turnoId = turnoDe("C-36", cajero);
            entregarLoPendiente(turnoId);
            CerrarTurno.Cerrado cerrado =
                    cerrarTurno.cerrar(
                            new CerrarTurno.Cierre("C-36", cajero, HOY, Map.of()), porQue());
            long delCierre = cerrado.cierre().turnoId();

            TenantContext.fijar(new MunicipalidadId(otraMunicipalidad));
            try {
                List<CierreDeTurno> desdeB = desdeLaVecina(() -> cierres.deTurno(delCierre));
                assertThat(desdeB).as("RLS: el cierre de A no existe para B").isEmpty();
                assertThat(desdeLaVecina(() -> turnos.porId(delCierre)))
                        .as("ni su turno, aunque la caja se llame igual en las dos")
                        .isEmpty();
                assertThat(
                                desdeLaVecina(
                                        () ->
                                                new RecaudacionRepositoryJdbc(jdbc)
                                                        .porTributo(
                                                                CriterioDeRecaudacion.delDia(HOY))))
                        .as("ni un sol de la recaudacion de A")
                        .isEmpty();
                assertThat(desdeLaVecina(() -> buzon.loQueImpideCerrar(delCierre)))
                        .as("ni sus pagos: el buzon lleva RLS igual que el resto (V2)")
                        .isEmpty();
            } finally {
                TenantContext.fijar(new MunicipalidadId(municipalidad));
            }
        }
    }

    // ------------------------------------------------------------------
    // Utilidades
    // ------------------------------------------------------------------

    /** Un cajero distinto por prueba: {@code cierre_uq} hace unico el turno por (caja, cajero). */
    private static String cajero(String sufijo) {
        return "c" + CONTADOR.incrementAndGet() + "-" + sufijo;
    }

    /** Da de alta una orden PENDIENTE y devuelve su identificador. */
    private static long sembrarOrden(String sufijo, Dinero importe) {
        String referencia = sufijo + "-" + CONTADOR.incrementAndGet();
        return enTransaccion(
                        () ->
                                ordenes.registrar(
                                        OrdenDeCobro.nueva(
                                                RENTAS,
                                                referencia,
                                                "IMPUESTO PREDIAL 2026",
                                                null,
                                                importe,
                                                LocalDate.of(2026, 1, 2),
                                                LocalDate.of(2026, 1, 2),
                                                PAGADOR,
                                                Instant.parse("2026-01-02T10:00:00Z"),
                                                Observacion.de(
                                                        "Orden emitida por el sistema de origen"))))
                .orden()
                .idGuardado();
    }

    private static Recibo cobrarLaOrden(
            String sufijo, Dinero importe, String cajero, FormaDePago forma) {
        long orden = sembrarOrden(sufijo, importe);
        return cobrarOrdenes
                .cobrar(
                        new CobrarOrdenes.Cobranza(
                                "C-36", cajero, List.of(orden), forma, HOY, null),
                        porQue())
                .recibo();
    }

    private static Recibo cobrarLaTasa(
            String cajero, String codigo, int cantidad, FormaDePago forma) {
        return cobrarTasa.cobrar(
                new CobrarTasa.CobroDeTasas(
                        "C-36",
                        cajero,
                        PAGADOR,
                        List.of(new LineaDeTasaPedida(codigo, cantidad)),
                        forma,
                        HOY,
                        null),
                porQue());
    }

    /**
     * Marca entregados todos los pagos del turno, como haria el publicador.
     *
     * <p>Sin esto no se puede cerrar, y eso es lo que ADR-0026 §4 pide: no es un rodeo de la
     * prueba, es el paso operativo que la separacion introduce. La prueba de que la comprobacion
     * muerde esta en {@link DelCierreBloqueante}, que a proposito NO llama a este metodo.
     */
    private static void entregarLoPendiente(long turnoId) {
        enTransaccion(
                () -> {
                    for (EventoDePago evento : buzon.loQueImpideCerrar(turnoId)) {
                        buzon.marcarEntregado(evento.idGuardado(), RELOJ.instant());
                    }
                    return null;
                });
    }

    private static EstadoDeTurno estadoDelTurno(long turnoId) {
        return enTransaccion(() -> turnos.porId(turnoId).orElseThrow().estado());
    }

    private static long turnoDe(String codigoDeCaja, String cajero) {
        return enTransaccion(
                () ->
                        turnos.abierto(cajaDe(codigoDeCaja), cajero, HOY)
                                .map(TurnoDeCaja::idGuardado)
                                .orElseThrow());
    }

    private static long cajaDe(String codigo) {
        Long id = enTransaccion(() -> cajas.porCodigo(codigo).orElseThrow().id());
        return java.util.Objects.requireNonNull(id);
    }

    /** Ejecuta la lectura con el contexto de la municipalidad vecina. */
    private static <T> T desdeLaVecina(java.util.function.Supplier<T> accion) {
        return transaccion.execute(
                estado -> {
                    TenantContext.fijar(new MunicipalidadId(otraMunicipalidad));
                    return accion.get();
                });
    }

    /** La suma de las lineas del arqueo guardado: tiene que ser su neto, al centimo. */
    private static Dinero sumaDelDetalle(long cierreId) {
        return enTransaccion(
                () -> {
                    Dinero total = Dinero.CERO;
                    List<LineaDeArqueo> lineas =
                            jdbc.sql(
                                            "SELECT forma_pago, cobrado, anulado, declarado"
                                                    + " FROM cierre_turno_detalle"
                                                    + " WHERE cierre_id = :id ORDER BY id")
                                    .param("id", cierreId)
                                    .query(
                                            (fila, numero) ->
                                                    new LineaDeArqueo(
                                                            FormaDePago.valueOf(
                                                                    fila.getString("forma_pago")
                                                                            .strip()),
                                                            new Dinero(
                                                                    fila.getBigDecimal("cobrado")),
                                                            new Dinero(
                                                                    fila.getBigDecimal("anulado")),
                                                            new Dinero(
                                                                    fila.getBigDecimal(
                                                                            "declarado"))))
                                    .list();
                    for (LineaDeArqueo linea : lineas) {
                        total = total.mas(linea.neto());
                    }
                    return total;
                });
    }

    private static Dinero primeroSigueDiciendo(long cierreId) {
        return enTransaccion(
                () ->
                        new Dinero(
                                java.util.Objects.requireNonNull(
                                        jdbc.sql("SELECT neto FROM cierre_turno WHERE id = :id")
                                                .param("id", cierreId)
                                                .query(java.math.BigDecimal.class)
                                                .single())));
    }

    private static Observacion porQue() {
        return Observacion.de("Operacion de caja, prueba de #36");
    }

    /** Si {@code kamayuk_app} tiene UPDATE sobre esa tabla, preguntado a la propia base. */
    private static boolean privilegioDeUpdateSobre(String tabla) {
        Boolean tiene =
                enTransaccion(
                        () ->
                                jdbc.sql("SELECT has_table_privilege(:tabla, 'UPDATE')")
                                        .param("tabla", tabla)
                                        .query(Boolean.class)
                                        .single());
        return Boolean.TRUE.equals(tiene);
    }

    /**
     * El SQLSTATE con el que la base rechaza la sentencia, o {@code null} si la deja pasar.
     *
     * <p>Se compara el codigo y no el texto del mensaje a proposito: PostgreSQL lo traduce al
     * idioma del servidor.
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

    private static void crearTasa(String codigo, Dinero importe, long area, String partida) {
        insertarComoOwner(
                municipalidad,
                "INSERT INTO tasa (municipalidad_id, codigo, descripcion, area_id,"
                        + " partida_presupuestal, importe, vigencia_desde, documento_fuente)"
                        + " VALUES (?, ?, 'Concepto del TUPA', ?, ?, ?, ?,"
                        + "         'TUPA 2026 de la prueba') RETURNING id",
                municipalidad,
                codigo,
                area,
                partida,
                importe.valor(),
                LocalDate.of(2026, 1, 1));
    }

    private static long crearArea(long muni, String codigo, String nombre) {
        return insertarComoOwner(
                muni,
                "INSERT INTO area (municipalidad_id, codigo, nombre) VALUES (?, ?, ?) RETURNING id",
                muni,
                codigo,
                nombre);
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
     * Inserta una fila de siembra como {@code kamayuk_owner}, con el contexto de tenant fijado.
     *
     * <p>Fijarlo no es opcional aunque quien escriba sea el dueno de la tabla: {@code FORCE ROW
     * LEVEL SECURITY} alcanza tambien al dueno (DAT-01 §0).
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
