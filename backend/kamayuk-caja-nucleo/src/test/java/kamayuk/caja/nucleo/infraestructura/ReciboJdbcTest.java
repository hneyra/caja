package kamayuk.caja.nucleo.infraestructura;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.Charset;
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
import kamayuk.caja.compartido.Pagina;
import kamayuk.caja.compartido.Paginacion;
import kamayuk.caja.compartido.TenantContext;
import kamayuk.caja.documentos.FormatoDeDocumento;
import kamayuk.caja.documentos.GeneradorDeDocumentos;
import kamayuk.caja.documentos.RegimenDeLaInstalacion;
import kamayuk.caja.documentos.RenderizadorPdf;
import kamayuk.caja.documentos.RenderizadorRtf;
import kamayuk.caja.documentos.RenderizadorXls;
import kamayuk.caja.dominio.Dinero;
import kamayuk.caja.dominio.MunicipalidadId;
import kamayuk.caja.dominio.Observacion;
import kamayuk.caja.esquema.BaseDeDatosDePrueba;
import kamayuk.caja.esquema.ContextoDeTenant;
import kamayuk.caja.nucleo.aplicacion.AbrirCaja;
import kamayuk.caja.nucleo.aplicacion.AnularRecibo;
import kamayuk.caja.nucleo.aplicacion.CobrarOrdenes;
import kamayuk.caja.nucleo.aplicacion.ConsultaDeRecibos;
import kamayuk.caja.nucleo.aplicacion.DuplicadoDeRecibo;
import kamayuk.caja.nucleo.dominio.CriterioDeRecibos;
import kamayuk.caja.nucleo.dominio.EstadoDeOrden;
import kamayuk.caja.nucleo.dominio.EstadoDeRecibo;
import kamayuk.caja.nucleo.dominio.EventoDePago;
import kamayuk.caja.nucleo.dominio.FormaDePago;
import kamayuk.caja.nucleo.dominio.MovimientoDeRecibo;
import kamayuk.caja.nucleo.dominio.MovimientoDeReciboRepository;
import kamayuk.caja.nucleo.dominio.OrdenDeCobro;
import kamayuk.caja.nucleo.dominio.Pagador;
import kamayuk.caja.nucleo.dominio.Recibo;
import kamayuk.caja.nucleo.dominio.SistemaDeOrigen;
import kamayuk.caja.nucleo.dominio.TipoDeEventoDePago;
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
 * #34 — Duplicado y anulacion contra PostgreSQL de verdad, conectado como {@code sgtm_app}.
 *
 * <h2>Que cambio con P5D</h2>
 *
 * <p>Anular ya no reversa asientos: el libro de cuenta corriente vive en otra base (ADR-0026). Lo
 * que hace ahora son dos cosas, y las dos se miden aqui contra la base: devuelve las ordenes a
 * {@code PENDIENTE} y deja un {@code PAGO_ANULADO} en el buzon de salida. La propiedad que se
 * defiende es la misma de siempre —<b>reversar AGREGA, nunca borra ni edita</b>— sobre otra tabla.
 *
 * <p>Lo que no cambio: el mismo dia, una sola vez, el {@code REVOKE} sobre {@code
 * recibo_movimiento}, los {@code CHECK} de la base, el aislamiento y el sha256 del duplicado.
 */
@DisplayName("#34 — Duplicado y anulacion contra PostgreSQL")
class ReciboJdbcTest {

    private static final LocalDate PAGO = LocalDate.of(2026, 3, 16);
    private static final Clock RELOJ = relojDe(PAGO);

    private static final SistemaDeOrigen RENTAS = SistemaDeOrigen.de("rentas");
    private static final Pagador PAGADOR = new Pagador("12345678", "TITULAR, PRUEBA", 7L);

    private static Clock relojDe(LocalDate dia) {
        return Clock.fixed(dia.atStartOfDay(ZoneOffset.UTC).toInstant(), ZoneOffset.UTC);
    }

    private static BaseDeDatosDePrueba base;
    private static long municipalidad;
    private static long otraMunicipalidad;
    private static long areaId;
    private static JdbcClient jdbc;
    private static TransactionTemplate transaccion;
    private static TenantTransactionManager gestor;

    private static ReciboRepositoryJdbc recibos;
    private static MovimientoDeReciboRepositoryJdbc movimientos;
    private static TurnoDeCajaRepositoryJdbc turnos;
    private static OrdenDeCobroRepositoryJdbc ordenes;
    private static BuzonDeSalidaJdbc buzon;
    private static ComponedorDeEventosJson eventos;
    private static CobrarOrdenes cobrarOrdenes;
    private static GeneradorDeDocumentos generador;
    private static ConsultaDeRecibos listado;
    private static ConsultaDeRecibos listadoSinTransaccion;

    private static final AtomicInteger CONTADOR = new AtomicInteger();

    @BeforeAll
    static void provisionar() throws SQLException, IOException {
        base = BaseDeDatosDePrueba.provisionar();
        municipalidad = crearMunicipalidad("240301", "Municipalidad de los recibos");
        otraMunicipalidad = crearMunicipalidad("240302", "Municipalidad vecina de #34");

        DriverManagerDataSource pool = new DriverManagerDataSource();
        pool.setUrl(base.url());
        pool.setUsername(BaseDeDatosDePrueba.APP);
        pool.setPassword(base.clave(BaseDeDatosDePrueba.APP));

        jdbc = JdbcClient.create(pool);
        gestor = new TenantTransactionManager(pool);
        transaccion = new TransactionTemplate(gestor);

        CajaRepositoryJdbc cajas = new CajaRepositoryJdbc(jdbc);
        recibos = new ReciboRepositoryJdbc(jdbc);
        movimientos = new MovimientoDeReciboRepositoryJdbc(jdbc);
        turnos = new TurnoDeCajaRepositoryJdbc(jdbc);
        ordenes = new OrdenDeCobroRepositoryJdbc(jdbc);
        buzon = new BuzonDeSalidaJdbc(jdbc);
        eventos = new ComponedorDeEventosJson(new JsonMapper());

        Auditoria auditoria = new AuditoriaJdbc(jdbc, RELOJ);
        AbrirCaja abrirCaja = envolver(new AbrirCaja(cajas, turnos, auditoria, RELOJ));
        cobrarOrdenes =
                envolver(
                        new CobrarOrdenes(
                                abrirCaja, ordenes, recibos, buzon, eventos, auditoria, RELOJ));

        generador =
                new GeneradorDeDocumentos(
                        List.of(
                                new RenderizadorPdf(),
                                new RenderizadorXls(),
                                new RenderizadorRtf()),
                        RegimenDeLaInstalacion.REAL);

        // El listado de #548. Se envuelve con `AnnotationTransactionAttributeSource`, o sea
        // OBEDECIENDO a la anotacion como hace el contenedor: un TransactionTemplate
        // incondicional dejaria la prueba pasando con el @Transactional quitado, que es el
        // modo de fallo que existe para impedir (#486).
        listadoSinTransaccion = new ConsultaDeRecibos(recibos);
        listado = envolver(listadoSinTransaccion);

        areaId = crearArea(municipalidad, "A-34");
        crearCaja(municipalidad, "C-34", "R34", areaId);
        // La segunda ventanilla existe para poder medir el filtro por caja: con una sola,
        // filtrar por ella devuelve lo mismo que no filtrar y la prueba no diria nada.
        crearCaja(municipalidad, "C-548", "R548", areaId);
        crearArea(otraMunicipalidad, "A-34");
        crearCaja(otraMunicipalidad, "C-34", "R34", null);
    }

    @SuppressWarnings({"unchecked", "deprecation"})
    private static <T> T envolver(T objetivo) {
        ProxyFactory fabrica = new ProxyFactory(objetivo);
        fabrica.setProxyTargetClass(true);
        fabrica.addAdvice(
                new TransactionInterceptor(gestor, new AnnotationTransactionAttributeSource()));
        return (T) fabrica.getProxy();
    }

    private static AnularRecibo anularEl(LocalDate dia) {
        return envolver(
                new AnularRecibo(
                        recibos,
                        movimientos,
                        turnos,
                        ordenes,
                        buzon,
                        eventos,
                        new AuditoriaJdbc(jdbc, relojDe(dia)),
                        relojDe(dia)));
    }

    private static DuplicadoDeRecibo duplicadosEl(LocalDate dia) {
        return envolver(
                new DuplicadoDeRecibo(
                        recibos,
                        movimientos,
                        generador,
                        new AuditoriaJdbc(jdbc, relojDe(dia)),
                        relojDe(dia)));
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
    @DisplayName("AC central — Cobrar, anular, y que la orden vuelva a ser cobrable")
    class DelCicloCompleto {

        @Test
        @DisplayName("tras anular, la orden vuelve a PENDIENTE y se puede volver a cobrar")
        void laOrdenVuelveAEstarPendiente() {
            long orden = sembrarOrden("CICLO-1", Dinero.de("300.00"));
            Recibo cobrado = cobrar(orden);
            assertThat(estadoDe(orden)).isEqualTo(EstadoDeOrden.PAGADA);

            anular(cobrado, PAGO);

            assertThat(estadoDe(orden))
                    .as(
                            "PENDIENTE y no ANULADA: el dinero volvio y la deuda sigue, asi que"
                                    + " tiene que poder cobrarse otra vez")
                    .isEqualTo(EstadoDeOrden.PENDIENTE);
            Recibo otraVez = cobrar(orden);
            assertThat(otraVez.numero())
                    .as("y se cobra de verdad, con otro numero de recibo")
                    .isNotEqualTo(cobrado.numero());
        }

        @Test
        @DisplayName("el buzon conserva los dos eventos: el cobro y su anulacion")
        void elBuzonConservaLosDos() {
            long orden = sembrarOrden("CICLO-2", Dinero.de("150.00"));
            Recibo cobrado = cobrar(orden);
            long reciboId = java.util.Objects.requireNonNull(cobrado.id());

            EventoDePago delCobro =
                    enTransaccion(
                                    () ->
                                            buzon.delRecibo(
                                                    reciboId, TipoDeEventoDePago.PAGO_REGISTRADO))
                            .orElseThrow();

            AnularRecibo.Anulado anulado = anular(cobrado, PAGO);

            assertThat(eventosDe(reciboId))
                    .as("anular AGREGA: nunca se borra ni se edita el evento del cobro")
                    .isEqualTo(2);
            EventoDePago deLaAnulacion =
                    enTransaccion(() -> buzon.delRecibo(reciboId, TipoDeEventoDePago.PAGO_ANULADO))
                            .orElseThrow();
            assertThat(deLaAnulacion.eventoId()).isEqualTo(anulado.pagoAnuladoId());
            assertThat(campoDelCuerpo(deLaAnulacion, "pagoOriginalId"))
                    .as(
                            "y nombra el pago que deshace por identificador: el numero del papel"
                                    + " es texto y obligaria al receptor a analizarlo")
                    .isEqualTo(delCobro.eventoId().toString());
            assertThat(
                            campoDelCuerpo(
                                    enTransaccion(() -> buzon.porEventoId(delCobro.eventoId()))
                                            .orElseThrow(),
                                    "pagoId"))
                    .as("el evento del cobro sigue diciendo lo que decia")
                    .isEqualTo(delCobro.eventoId().toString());
        }

        @Test
        @DisplayName("el recibo sigue intacto, con su numero y su desglose")
        void elReciboSigueIntacto() {
            long orden = sembrarOrden("CICLO-3", Dinero.de("88.00"));
            Recibo cobrado = cobrar(orden);

            anular(cobrado, PAGO);

            Recibo leido = enTransaccion(() -> recibos.porNumero(cobrado.numero())).orElseThrow();
            assertThat(leido.numero()).isEqualTo(cobrado.numero());
            assertThat(leido.total()).isEqualTo(Dinero.de("88.00"));
            assertThat(leido.actualizadoA()).isEqualTo(PAGO);
            assertThat(leido.lineas()).hasSize(1);
            assertThat(leido.pagador().nombre())
                    .as("y su pagador, congelado: no se relee de ningun padron (P5D)")
                    .isEqualTo("TITULAR, PRUEBA");
        }

        @Test
        @DisplayName("el estado ANULADO se deriva del movimiento: el recibo no lo guarda")
        void elEstadoSeDeriva() {
            long orden = sembrarOrden("CICLO-4", Dinero.de("55.00"));
            Recibo cobrado = cobrar(orden);
            long reciboId = java.util.Objects.requireNonNull(cobrado.id());

            assertThat(enTransaccion(() -> movimientos.anulacionDe(reciboId))).isEmpty();
            anular(cobrado, PAGO);

            MovimientoDeRecibo anulacion =
                    enTransaccion(() -> movimientos.anulacionDe(reciboId)).orElseThrow();
            assertThat(anulacion.motivoDeLaAnulacion()).isEqualTo("ERROR EN EL IMPORTE");
            assertThat(anulacion.usuarioRegistro()).isEqualTo("cajero.prueba");
            assertThat(anulacion.importeReversado()).isEqualTo(Dinero.de("55.00"));
            assertThat(columnasDeRecibo())
                    .as("V30 retiro las columnas de V3: decian EMITIDO para siempre")
                    .doesNotContain(
                            "estado", "fecha_anulacion", "usuario_anulacion", "motivo_anulacion");
            assertThat(columnasDeRecibo())
                    .as("y `V2` puso las dos que sustituyen al cruce contra el padron (P5D)")
                    .contains("pagador_documento", "pagador_nombre");
        }
    }

    @Nested
    @DisplayName("Solo el mismo dia, y solo una vez")
    class DeLosLimites {

        @Test
        @DisplayName("un recibo de ayer no se anula")
        void elReciboDeAyerNoSeAnula() {
            long orden = sembrarOrden("AYER-1", Dinero.de("70.00"));
            Recibo cobrado = cobrar(orden);

            assertThatThrownBy(() -> anular(cobrado, PAGO.plusDays(1)))
                    .isInstanceOf(AnularRecibo.FueraDelDiaDePago.class)
                    .hasMessageContaining("mismo dia del pago");
            assertThat(estadoDe(orden))
                    .as("y nada se deshizo: el pago sigue en pie")
                    .isEqualTo(EstadoDeOrden.PAGADA);
            assertThat(eventosDe(java.util.Objects.requireNonNull(cobrado.id())))
                    .as("y no se le mando al sistema de origen ninguna anulacion")
                    .isEqualTo(1);
        }

        @Test
        @DisplayName("con DIEZ hilos anulando el mismo recibo, solo uno lo consigue")
        @SuppressWarnings("checkstyle:IllegalCatch")
        void diezAnulacionesSimultaneasProducenUna() throws Exception {
            long orden = sembrarOrden("CONC-1", Dinero.de("500.00"));
            Recibo cobrado = cobrar(orden);

            int hilos = 10;
            CountDownLatch salida = new CountDownLatch(1);
            List<Callable<Boolean>> tareas = new ArrayList<>();
            for (int i = 0; i < hilos; i++) {
                String quien = "cajero." + i;
                tareas.add(
                        () -> {
                            TenantContext.fijar(new MunicipalidadId(municipalidad));
                            OrigenContext.fijar(new Origen(quien, null, null));
                            salida.await(10, TimeUnit.SECONDS);
                            try {
                                anular(cobrado, PAGO);
                                return true;
                            } catch (RuntimeException rechazada) {
                                // Se captura lo ancho a proposito: lo que se mide es
                                // cuantas ganan, y las nueve que pierden pueden hacerlo
                                // por el indice unico o por el aborto de su transaccion.
                                // Distinguirlas aqui probaria menos, no mas.
                                return false;
                            }
                        });
            }

            ExecutorService ejecutor = Executors.newFixedThreadPool(hilos);
            int anuladas = 0;
            try {
                List<Future<Boolean>> futuros = new ArrayList<>();
                for (Callable<Boolean> tarea : tareas) {
                    futuros.add(ejecutor.submit(tarea));
                }
                salida.countDown();
                for (Future<Boolean> futuro : futuros) {
                    if (Boolean.TRUE.equals(futuro.get(60, TimeUnit.SECONDS))) {
                        anuladas++;
                    }
                }
            } finally {
                ejecutor.shutdownNow();
            }

            long reciboId = java.util.Objects.requireNonNull(cobrado.id());
            assertThat(anuladas).as("recibo_movimiento_anulacion_uq: una sola gana").isEqualTo(1);
            assertThat(anulacionesDe(reciboId)).isEqualTo(1);
            assertThat(eventosDeTipo(reciboId, TipoDeEventoDePago.PAGO_ANULADO))
                    .as(
                            "y UNA sola anulacion en el buzon: diez dejarian al sistema de origen"
                                    + " reversando diez veces el mismo pago")
                    .isEqualTo(1);
        }

        @Test
        @DisplayName("anular dos veces seguidas: la segunda dice que ya estaba anulado")
        void laSegundaAnulacionSeRechaza() {
            long orden = sembrarOrden("DOBLE-A", Dinero.de("60.00"));
            Recibo cobrado = cobrar(orden);
            anular(cobrado, PAGO);

            assertThatThrownBy(() -> anular(cobrado, PAGO))
                    .isInstanceOf(MovimientoDeReciboRepository.ReciboYaAnulado.class);
            assertThat(anulacionesDe(java.util.Objects.requireNonNull(cobrado.id()))).isEqualTo(1);
        }
    }

    @Nested
    @DisplayName("Lo que la base impide por si sola")
    class DeLaBase {

        @Test
        @DisplayName("un motivo en blanco muere en el CHECK, aunque se inserte a mano")
        void elMotivoEnBlancoMuereEnElCheck() {
            Recibo cobrado = cobrar(sembrarOrden("CHK-1", Dinero.de("10.00")));

            assertThatThrownBy(() -> insertarMovimiento(cobrado, "ANULACION", "   ", CIEN))
                    .as("espacios no son un motivo: btrim lo dice")
                    .hasStackTraceContaining("recibo_movimiento_anulacion_ck");
        }

        @Test
        @DisplayName("una anulacion sin importe tampoco pasa: el arqueo no sabria que restar")
        void laAnulacionSinImporteNoPasa() {
            Recibo cobrado = cobrar(sembrarOrden("CHK-2", Dinero.de("10.00")));

            assertThatThrownBy(
                            () ->
                                    insertarMovimiento(
                                            cobrado, "ANULACION", "ERROR EN EL IMPORTE", null))
                    .hasStackTraceContaining("recibo_movimiento_anulacion_ck");
        }

        @Test
        @DisplayName("un duplicado sin resumen tampoco: la reimpresion no se podria comprobar")
        void elDuplicadoSinResumenNoPasa() {
            Recibo cobrado = cobrar(sembrarOrden("CHK-3", Dinero.de("10.00")));

            assertThatThrownBy(() -> insertarMovimiento(cobrado, "DUPLICADO", null, null))
                    .hasStackTraceContaining("recibo_movimiento_duplicado_ck");
        }

        @Test
        @DisplayName("sgtm_app no puede actualizar un movimiento (V30)")
        void noSePuedeActualizarUnMovimiento() {
            Recibo cobrado = cobrar(sembrarOrden("PRIV-1", Dinero.de("10.00")));
            MovimientoDeRecibo anulacion = anular(cobrado, PAGO).anulacion();

            assertThat(
                            sqlStateAlIntentar(
                                    () ->
                                            jdbc.sql(
                                                            "UPDATE recibo_movimiento"
                                                                    + " SET motivo = 'otro'"
                                                                    + " WHERE id = :id")
                                                    .param("id", anulacion.id())
                                                    .update()))
                    .as(
                            "una anulacion por error se corrige con otro acto, no reescribiendo el"
                                    + " acta")
                    .isEqualTo(PRIVILEGIO_INSUFICIENTE);
        }

        @Test
        @DisplayName("ni borrarlo: un recibo que estuvo anulado tiene que decirlo siempre")
        void noSePuedeBorrarUnMovimiento() {
            Recibo cobrado = cobrar(sembrarOrden("PRIV-2", Dinero.de("10.00")));
            MovimientoDeRecibo anulacion = anular(cobrado, PAGO).anulacion();

            assertThat(
                            sqlStateAlIntentar(
                                    () ->
                                            jdbc.sql(
                                                            "DELETE FROM recibo_movimiento"
                                                                    + " WHERE id = :id")
                                                    .param("id", anulacion.id())
                                                    .update()))
                    .isEqualTo(PRIVILEGIO_INSUFICIENTE);
        }

        @Test
        @DisplayName("desde B, la anulacion de A no existe")
        void desdeBLaAnulacionDeANoExiste() {
            Recibo cobrado = cobrar(sembrarOrden("RLS-34", Dinero.de("40.00")));
            anular(cobrado, PAGO);
            long reciboId = java.util.Objects.requireNonNull(cobrado.id());

            // El contexto se fija ANTES de abrir la transaccion: el SET LOCAL lo emite el
            // gestor al abrirla, asi que fijarlo solo dentro del callback llegaria tarde y
            // la consulta correria con el tenant anterior -que es como esta prueba paso en
            // verde la primera vez, sin verificar nada-.
            TenantContext.fijar(new MunicipalidadId(otraMunicipalidad));
            java.util.Optional<MovimientoDeRecibo> desdeB =
                    transaccion.execute(
                            estado -> {
                                TenantContext.fijar(new MunicipalidadId(otraMunicipalidad));
                                return movimientos.anulacionDe(reciboId);
                            });

            assertThat(desdeB)
                    .as("la politica RLS de recibo_movimiento no deja ver la fila de A")
                    .isEmpty();
        }

        @Test
        @DisplayName("desde B, el evento del pago de A tampoco: el buzon lleva RLS (V2)")
        void desdeBElEventoDeANoExiste() {
            Recibo cobrado = cobrar(sembrarOrden("RLS-BUZON", Dinero.de("40.00")));
            long reciboId = java.util.Objects.requireNonNull(cobrado.id());

            TenantContext.fijar(new MunicipalidadId(otraMunicipalidad));
            java.util.Optional<EventoDePago> desdeB =
                    transaccion.execute(
                            estado -> {
                                TenantContext.fijar(new MunicipalidadId(otraMunicipalidad));
                                return buzon.delRecibo(
                                        reciboId, TipoDeEventoDePago.PAGO_REGISTRADO);
                            });

            assertThat(desdeB)
                    .as("un pago de A visible desde B seria la caja de A publicando por B")
                    .isEmpty();
        }
    }

    @Nested
    @DisplayName("El duplicado, contra la base")
    class DelDuplicado {

        @Test
        @DisplayName("meses despues y con la ventanilla movida, el papel sale igual")
        void mesesDespuesSaleIgual() {
            Recibo cobrado = cobrar(sembrarOrden("DUP-1", Dinero.de("210.00")));

            byte[] enMarzo = duplicado(cobrado, PAGO).contenido();

            // Seis meses despues, y con la ventanilla movida de verdad: otra orden, otro
            // recibo, otro importe. El papel no puede enterarse, porque no se recalcula.
            cobrar(sembrarOrden("DUP-1B", Dinero.de("777.77")));
            byte[] enSetiembre = duplicado(cobrado, PAGO.plusMonths(6)).contenido();

            assertThat(texto(enSetiembre)).contains("210.00").doesNotContain("777.77");
            // Las dos lineas de fecha del papel, enteras y no como subcadena suelta: el
            // instante de emision tambien contiene «2026-03-16», asi que buscar solo eso
            // deja pasar un aLaFecha resuelto con el reloj de la reimpresion —que es
            // exactamente lo que una rotura de prueba destapo aqui—.
            assertThat(texto(enSetiembre))
                    .as("la fecha del papel es la del cobro, no la de la reimpresion (regla 9)")
                    .contains("Datos al " + PAGO)
                    .contains("Importes actualizados al " + PAGO);
            assertThat(sinLaMarca(enSetiembre))
                    .as("todo lo demas, byte a byte igual")
                    .isEqualTo(sinLaMarca(enMarzo));
        }

        @Test
        @DisplayName("cada reimpresion se numera y queda registrada con quien la genero")
        void cadaReimpresionQuedaRegistrada() {
            Recibo cobrado = cobrar(sembrarOrden("DUP-2", Dinero.de("35.00")));
            long reciboId = java.util.Objects.requireNonNull(cobrado.id());

            assertThat(duplicado(cobrado, PAGO).cual()).isEqualTo(1);
            assertThat(duplicado(cobrado, PAGO).cual()).isEqualTo(2);

            List<MovimientoDeRecibo> registrados =
                    enTransaccion(() -> movimientos.deRecibo(reciboId));
            assertThat(registrados).hasSize(2);
            assertThat(registrados.get(0).usuarioRegistro()).isEqualTo("cajero.prueba");
            assertThat(enTransaccion(() -> movimientos.duplicadosDe(reciboId))).isEqualTo(2);
        }

        @Test
        @DisplayName("el duplicado de un recibo anulado lo dice en el papel")
        void elDuplicadoDeUnAnuladoLoDice() {
            Recibo cobrado = cobrar(sembrarOrden("DUP-3", Dinero.de("25.00")));
            anular(cobrado, PAGO);

            assertThat(texto(duplicado(cobrado, PAGO).contenido()))
                    .contains("RECIBO ANULADO")
                    .contains("ERROR EN EL IMPORTE");
        }

        @Test
        @DisplayName("la vista previa devuelve el estado sin emitir nada")
        void laVistaPreviaNoEmite() {
            Recibo cobrado = cobrar(sembrarOrden("DUP-4", Dinero.de("15.00")));
            long reciboId = java.util.Objects.requireNonNull(cobrado.id());
            anular(cobrado, PAGO);

            DuplicadoDeRecibo.Consultado visto =
                    duplicadosEl(PAGO).consultar(cobrado.numero()).orElseThrow();

            assertThat(visto.estaAnulado()).isTrue();
            assertThat(visto.duplicados()).isZero();
            assertThat(enTransaccion(() -> movimientos.duplicadosDe(reciboId))).isZero();
        }
    }

    @Nested
    @DisplayName("#548 — El listado de recibos: encontrar el recibo sin tener el papel")
    class DelListado {

        /**
         * Cuantos recibos empatados se siembran: doce, los mismos que #543 midio sobre los modulos.
         *
         * <p>El numero <b>no</b> es lo que hace visible la falta de desempate —medido en el motor,
         * con cinco filas empatadas ya devuelve «2,1» pidiendo dos y «1..5» pidiendo cinco—. Lo que
         * la hace visible es <b>por que columna</b> se ordena; eso esta en {@link
         * #ORDEN_SIN_INDICE}.
         */
        private static final int DOCE = 12;

        /**
         * Columna admitida por la que <b>si</b> hay que ordenar de verdad, y con empates.
         *
         * <p>Los doce recibos cobran 100,00 exactos, no hay indice sobre {@code total} y la
         * consulta no lo acota: el motor tiene que ordenar, y ahi es donde se ve la falta de
         * desempate.
         */
        private static final String ORDEN_SIN_INDICE = "total";

        /**
         * EL DEFECTO QUE ESTAS SIETE PRUEBAS ENCONTRARON, y como se veia.
         *
         * <p>{@code ReciboRepositoryJdbc.buscar} seleccionaba {@code r.contribuyente_id} y NO
         * {@code r.pagador_documento} ni {@code r.pagador_nombre}, que es lo que su mapeador lee
         * desde P5D. Toda pagina con al menos una fila reventaba con «Der Spaltenname
         * pagador_documento wurde in diesem ResultSet nicht gefunden».
         *
         * <p><b>Y una pagina VACIA no lo destapa</b>: el mapeador no llega a correr, asi que {@code
         * unaBusquedaSinResultadosDaPaginaVacia} pasaba en verde con el listado entero roto. Es la
         * forma exacta en que un defecto de este tipo se esconde — la prueba mas barata de escribir
         * es justo la que no puede verlo.
         *
         * <p>Se arreglo anadiendo las dos columnas al {@code SELECT}. Quitarlas otra vez pone estas
         * siete en rojo y deja la de la pagina vacia en verde.
         */
        @Test
        @DisplayName("una busqueda sin resultados da una pagina vacia, no un error")
        void unaBusquedaSinResultadosDaPaginaVacia() {
            // El caso literal del AC: se busca por un cajero que no cobro nada. Ni 404 ni
            // excepcion: una busqueda sin resultados es una respuesta, no un fallo.
            Pagina<ConsultaDeRecibos.FilaDeRecibo> pagina =
                    listar(new CriterioDeRecibos(null, null, "no.existe.548", null, null, null));

            assertThat(pagina.totalElementos()).isZero();
            assertThat(pagina.contenido()).isEmpty();
        }

        @Test
        @DisplayName("la fila trae el pagador CONGELADO en el recibo, no resuelto de un padron")
        void laFilaTraeElPagadorCongelado() {
            long orden = sembrarOrden("LST-PAGADOR", Dinero.de("120.00"));
            Recibo suyo = cobrarEn(orden, "C-34", "cajero.pagador");

            ConsultaDeRecibos.FilaDeRecibo fila = unicaFilaDe("cajero.pagador");

            assertThat(fila.recibo().numero()).isEqualTo(suyo.numero());
            assertThat(fila.recibo().pagador().nombre())
                    .as(
                            "hasta P5D esto lo ponia el padron de `rentas`; releerlo hacia que la"
                                    + " grilla y el papel pudieran decir cosas distintas")
                    .isEqualTo("TITULAR, PRUEBA");
            assertThat(fila.recibo().pagador().documento()).isEqualTo("12345678");
        }

        @Test
        @DisplayName("filtra por caja y por cajero, que es como se reconstruye un turno")
        void filtraPorCajaYPorCajero() {
            Recibo enLaOtraCaja =
                    cobrarEn(
                            sembrarOrden("LST-TURNO-A", Dinero.de("300.00")),
                            "C-548",
                            "cajera.548");
            cobrarEn(sembrarOrden("LST-TURNO-B", Dinero.de("300.00")), "C-34", "cajero.turno");

            Pagina<ConsultaDeRecibos.FilaDeRecibo> porCaja =
                    listar(new CriterioDeRecibos(null, "C-548", null, null, null, null));
            Pagina<ConsultaDeRecibos.FilaDeRecibo> porCajero =
                    listar(new CriterioDeRecibos(null, null, "cajera.548", null, null, null));

            assertThat(numerosDe(porCaja)).containsExactly(enLaOtraCaja.numero().impreso());
            assertThat(numerosDe(porCajero)).containsExactly(enLaOtraCaja.numero().impreso());
        }

        @Test
        @DisplayName("el rango incluye el dia ENTERO del «hasta», no hasta su medianoche")
        void elRangoIncluyeElDiaEnteroDelHasta() {
            // `recibo.fecha` es timestamptz y el filtro es de dias. Con `fecha <= :hasta`
            // —la fecha leida como medianoche— este recibo de las 14:37 se quedaria fuera
            // de su propio dia, y quien lo busca por «hoy» no lo encontraria nunca.
            Recibo deLaTarde =
                    cobrarA(
                            sembrarOrden("LST-HORA", Dinero.de("77.00")),
                            PAGO.atTime(14, 37).toInstant(ZoneOffset.UTC),
                            "cajero.tarde");

            assertThat(
                            numerosDe(
                                    listar(
                                            new CriterioDeRecibos(
                                                    null, null, "cajero.tarde", PAGO, PAGO, null))))
                    .as("emitido a las 14:37 de ese mismo dia: entra")
                    .containsExactly(deLaTarde.numero().impreso());
            assertThat(
                            listar(
                                            new CriterioDeRecibos(
                                                    null,
                                                    null,
                                                    "cajero.tarde",
                                                    null,
                                                    PAGO.minusDays(1),
                                                    null))
                                    .totalElementos())
                    .as("y con el rango cerrado la vispera, no")
                    .isZero();
            assertThat(
                            listar(
                                            new CriterioDeRecibos(
                                                    null,
                                                    null,
                                                    "cajero.tarde",
                                                    PAGO.plusDays(1),
                                                    null,
                                                    null))
                                    .totalElementos())
                    .isZero();
        }

        @Test
        @DisplayName("el estado se DERIVA del movimiento de anulacion, y filtra por el")
        void elEstadoSeDerivaYFiltra() {
            Recibo anulado =
                    cobrarEn(
                            sembrarOrden("LST-EST-A", Dinero.de("200.00")),
                            "C-34",
                            "cajero.estado");
            anular(anulado, PAGO);
            Recibo vivo =
                    cobrarEn(
                            sembrarOrden("LST-EST-B", Dinero.de("200.00")),
                            "C-548",
                            "cajero.estado");

            Pagina<ConsultaDeRecibos.FilaDeRecibo> todos =
                    listar(new CriterioDeRecibos(null, null, "cajero.estado", null, null, null));
            assertThat(todos.totalElementos()).isEqualTo(2);
            assertThat(estadoDe(todos, anulado)).isEqualTo(EstadoDeRecibo.ANULADO);
            assertThat(estadoDe(todos, vivo)).isEqualTo(EstadoDeRecibo.EMITIDO);

            assertThat(
                            numerosDe(
                                    listar(
                                            new CriterioDeRecibos(
                                                    null,
                                                    null,
                                                    "cajero.estado",
                                                    null,
                                                    null,
                                                    EstadoDeRecibo.ANULADO))))
                    .containsExactly(anulado.numero().impreso());
            assertThat(
                            numerosDe(
                                    listar(
                                            new CriterioDeRecibos(
                                                    null,
                                                    null,
                                                    "cajero.estado",
                                                    null,
                                                    null,
                                                    EstadoDeRecibo.EMITIDO))))
                    .as("el filtro y la columna salen de la MISMA expresion: no pueden discrepar")
                    .containsExactly(vivo.numero().impreso());
        }

        @Test
        @DisplayName("el importe viaja con la fecha que el recibo congelo, y cuenta duplicados")
        void elImporteVieneConSuFechaYSeCuentanLosDuplicados() {
            Recibo cobrado =
                    cobrarEn(
                            sembrarOrden("LST-CIFRA", Dinero.de("123.00")), "C-34", "cajero.cifra");

            ConsultaDeRecibos.FilaDeRecibo antes = unicaFilaDe("cajero.cifra");
            assertThat(antes.recibo().total()).isEqualTo(Dinero.de("123.00"));
            assertThat(antes.recibo().actualizadoA())
                    .as("la fecha del cobro, no la de la consulta (regla 9, RNF-075)")
                    .isEqualTo(PAGO);
            assertThat(antes.recibo().duplicados()).isZero();

            duplicado(cobrado, PAGO);
            duplicado(cobrado, PAGO);

            assertThat(unicaFilaDe("cajero.cifra").recibo().duplicados())
                    .as("la columna «Duplicados» se deriva de recibo_movimiento, como el estado")
                    .isEqualTo(2);
        }

        @Test
        @DisplayName("el orden no depende del tamano de pagina, y recorrerlas no repite ni omite")
        void elOrdenNoDependeDelTamanoDePagina() {
            // Los doce se emiten con el MISMO reloj y por el MISMO cajero, asi que empatan
            // en las dos columnas. Sin el desempate por `id` (#543), el ORDER BY no es un
            // orden total: dos paginas consecutivas pueden repetir un recibo y omitir otro
            // —o sea, el que se busca no aparece nunca—.
            //
            // Se ordena por `total`, y por que se ordena por ahi lo decidieron DOS
            // mutaciones que pasaron en VERDE antes de esta:
            //
            //  - Por `fecha` no muerde: `recibo_fecha_ix` (V3) cubre (municipalidad_id,
            //    fecha), asi que el planificador resuelve ese orden con un Index Scan y
            //    sale determinista por accidente —solo mientras el plan siga siendo ese—.
            //  - Por `cajero` tampoco: es la columna del propio filtro, y con
            //    `cajero = 'cajero.orden'` el motor sabe que la clave de orden es
            //    constante y SUPRIME el Sort entero.
            //
            // `total` no tiene indice y no esta acotado, asi que hay seq scan mas sort de
            // verdad. Medido en el motor con doce filas empatadas: «ORDER BY total LIMIT
            // 3» devuelve 2,3,1 —top-N heapsort— donde «LIMIT 12» devuelve 1..12.
            for (int i = 0; i < DOCE; i++) {
                cobrarEn(
                        sembrarOrden("LST-ORDEN-" + i, Dinero.de("100.00")),
                        i % 2 == 0 ? "C-34" : "C-548",
                        "cajero.orden");
            }

            List<String> deTres = recorrer("cajero.orden", ORDEN_SIN_INDICE, 3);
            List<String> deCinco = recorrer("cajero.orden", ORDEN_SIN_INDICE, 5);
            List<String> deDoce = recorrer("cajero.orden", ORDEN_SIN_INDICE, DOCE);

            assertThat(deDoce).hasSize(DOCE).doesNotHaveDuplicates();
            assertThat(deTres).isEqualTo(deDoce);
            assertThat(deCinco).isEqualTo(deDoce);
        }

        @Test
        @DisplayName("desde B, los recibos de A no existen")
        void desdeBLosRecibosDeANoExisten() {
            cobrarEn(sembrarOrden("LST-RLS", Dinero.de("64.00")), "C-34", "cajero.rls");

            assertThat(
                            listar(
                                            new CriterioDeRecibos(
                                                    null, null, "cajero.rls", null, null, null))
                                    .totalElementos())
                    .isEqualTo(1);

            // El contexto se fija ANTES de abrir la transaccion: el SET LOCAL lo emite el
            // gestor al abrirla.
            TenantContext.fijar(new MunicipalidadId(otraMunicipalidad));
            long desdeB =
                    transaccion.execute(
                            estado -> {
                                TenantContext.fijar(new MunicipalidadId(otraMunicipalidad));
                                return recibos.buscar(
                                                new CriterioDeRecibos(
                                                        null, null, "cajero.rls", null, null, null),
                                                new Paginacion(
                                                        0,
                                                        20,
                                                        "fecha",
                                                        Paginacion.Direccion.ASCENDENTE))
                                        .totalElementos();
                            });

            assertThat(desdeB)
                    .as("con el superusuario del cluster —que omite RLS— esto seria 1 (#537)")
                    .isZero();
        }

        @Test
        @DisplayName("sin transaccion la consulta no devuelve vacio: revienta (#486)")
        void sinTransaccionLaConsultaRevienta() {
            TenantContext.fijar(new MunicipalidadId(municipalidad));

            assertThatThrownBy(
                            () ->
                                    listadoSinTransaccion.listar(
                                            CriterioDeRecibos.todos(),
                                            new Paginacion(
                                                    0,
                                                    20,
                                                    "fecha",
                                                    Paginacion.Direccion.ASCENDENTE)))
                    .as(
                            "sin @Transactional no hay SET LOCAL, y la politica RLS no contesta"
                                    + " una lista vacia: falla, con el 500 que la marcha blanca de"
                                    + " #400 encontro en catorce rutas")
                    .hasStackTraceContaining("app.municipalidad_id");
        }

        // --------------------------------------------------------------

        private Pagina<ConsultaDeRecibos.FilaDeRecibo> listar(CriterioDeRecibos criterio) {
            TenantContext.fijar(new MunicipalidadId(municipalidad));
            return listado.listar(
                    criterio, new Paginacion(0, 20, "fecha", Paginacion.Direccion.ASCENDENTE));
        }

        private List<String> numerosDe(Pagina<ConsultaDeRecibos.FilaDeRecibo> pagina) {
            return pagina.contenido().stream()
                    .map(fila -> fila.recibo().numero().impreso())
                    .toList();
        }

        private EstadoDeRecibo estadoDe(
                Pagina<ConsultaDeRecibos.FilaDeRecibo> pagina, Recibo recibo) {
            return pagina.contenido().stream()
                    .filter(fila -> fila.recibo().numero().equals(recibo.numero()))
                    .findFirst()
                    .orElseThrow()
                    .recibo()
                    .estado();
        }

        private ConsultaDeRecibos.FilaDeRecibo unicaFilaDe(String cajero) {
            Pagina<ConsultaDeRecibos.FilaDeRecibo> pagina =
                    listar(new CriterioDeRecibos(null, null, cajero, null, null, null));
            assertThat(pagina.contenido()).hasSize(1);
            return pagina.contenido().get(0);
        }

        /** Los numeros de todas las paginas de ese tamano, en el orden en que salen. */
        private List<String> recorrer(String cajero, String ordenarPor, int tamano) {
            List<String> numeros = new ArrayList<>();
            CriterioDeRecibos criterio =
                    new CriterioDeRecibos(null, null, cajero, null, null, null);
            for (int pagina = 0; ; pagina++) {
                TenantContext.fijar(new MunicipalidadId(municipalidad));
                Pagina<ConsultaDeRecibos.FilaDeRecibo> leida =
                        listado.listar(
                                criterio,
                                new Paginacion(
                                        pagina,
                                        tamano,
                                        ordenarPor,
                                        Paginacion.Direccion.ASCENDENTE));
                numeros.addAll(numerosDe(leida));
                if (!leida.hayMas()) {
                    return numeros;
                }
            }
        }
    }

    // ------------------------------------------------------------------
    // Utilidades
    // ------------------------------------------------------------------

    private static final BigDecimal CIEN = new BigDecimal("100.00");

    /** {@code insufficient_privilege}: el SQLSTATE de un {@code REVOKE} que muerde. */
    private static final String PRIVILEGIO_INSUFICIENTE = "42501";

    /** Da de alta una orden PENDIENTE de `rentas` y devuelve su identificador. */
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

    private static Recibo cobrar(long orden) {
        return cobrarCon(cobrarOrdenes, orden, "C-34", "cajero.prueba");
    }

    /** La misma cobranza, en otra ventanilla y con otro cajero (#548). */
    private static Recibo cobrarEn(long orden, String caja, String cajero) {
        return cobrarCon(cobrarOrdenes, orden, caja, cajero);
    }

    /** Y la misma, emitida a otra hora del dia: el reloj decide `recibo.fecha`. */
    private static Recibo cobrarA(long orden, Instant instante, String cajero) {
        Clock reloj = Clock.fixed(instante, ZoneOffset.UTC);
        AbrirCaja abrir =
                envolver(
                        new AbrirCaja(
                                new CajaRepositoryJdbc(jdbc),
                                turnos,
                                new AuditoriaJdbc(jdbc, reloj),
                                reloj));
        CobrarOrdenes cobranza =
                envolver(
                        new CobrarOrdenes(
                                abrir,
                                ordenes,
                                recibos,
                                buzon,
                                eventos,
                                new AuditoriaJdbc(jdbc, reloj),
                                reloj));
        return cobrarCon(cobranza, orden, "C-34", cajero);
    }

    private static Recibo cobrarCon(
            CobrarOrdenes cobranza, long orden, String caja, String cajero) {
        return cobranza.cobrar(
                        new CobrarOrdenes.Cobranza(
                                caja, cajero, List.of(orden), FormaDePago.EFECTIVO, PAGO, null),
                        Observacion.de("Cobranza en ventanilla, prueba de #34"))
                .recibo();
    }

    private static AnularRecibo.Anulado anular(Recibo recibo, LocalDate dia) {
        return anularEl(dia)
                .anular(
                        new AnularRecibo.Anulacion(
                                recibo.numero(),
                                "ERROR EN EL IMPORTE",
                                "RESPONSABLE DE TESORERIA",
                                "MEMO-2026-034"),
                        Observacion.de("Se cobro de mas por error del cajero"));
    }

    private static DuplicadoDeRecibo.Duplicado duplicado(Recibo recibo, LocalDate dia) {
        return duplicadosEl(dia)
                .imprimir(
                        recibo.numero(),
                        FormatoDeDocumento.PDF,
                        Observacion.de("Duplicado pedido por el contribuyente"));
    }

    /** El PDF como texto, en la codificacion que declara su fuente ({@code /WinAnsiEncoding}). */
    private static String texto(byte[] documento) {
        return new String(documento, Charset.forName("windows-1252"));
    }

    /**
     * El documento sin la marca de duplicado, para poder comparar dos reimpresiones.
     *
     * <p>La marca cambia entre la primera y la segunda —{@code N.° 1} y {@code N.° 2}— y tiene que
     * cambiar. Lo que no puede cambiar es nada mas.
     */
    private static String sinLaMarca(byte[] documento) {
        return texto(documento)
                .replaceAll("DUPLICADO N[^\\n)]*", "DUPLICADO")
                .replaceAll("/Length [0-9]+", "/Length")
                .replaceAll("(?s)xref.*", "");
    }

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

    private static void insertarMovimiento(
            Recibo recibo, String tipo, @Nullable String motivo, @Nullable BigDecimal importe) {
        enTransaccion(
                () ->
                        jdbc.sql(
                                        "INSERT INTO recibo_movimiento (municipalidad_id,"
                                                + " recibo_id, tipo, fecha, caja_id, turno_id,"
                                                + " motivo, importe, usuario_registro, observacion)"
                                                + " VALUES (:muni, :recibo, :tipo, :fecha, :caja,"
                                                + "  :turno, :motivo, :importe, 'prueba',"
                                                + "  'insercion directa de la prueba')")
                                .param("muni", municipalidad)
                                .param("recibo", recibo.id())
                                .param("tipo", tipo)
                                .param("fecha", PAGO)
                                .param("caja", recibo.cajaId())
                                .param("turno", recibo.turnoId())
                                .param("motivo", motivo)
                                .param("importe", importe)
                                .update());
    }

    private static <T> T enTransaccion(java.util.function.Supplier<T> accion) {
        TenantContext.fijar(new MunicipalidadId(municipalidad));
        return transaccion.execute(
                estado -> {
                    TenantContext.fijar(new MunicipalidadId(municipalidad));
                    return accion.get();
                });
    }

    /**
     * Un campo del cuerpo del evento, leido como JSON.
     *
     * <p>No se compara la CADENA, y no es purismo: {@code pago_evento.cuerpo} es {@code jsonb}, y
     * PostgreSQL lo devuelve <b>reformateado</b> —con un espacio tras cada dos puntos y las claves
     * en otro orden—. Una asercion sobre subcadenas del JSON que se escribio comprobaria el formato
     * de jsonb, no lo que el evento dice.
     */
    private static String campoDelCuerpo(EventoDePago evento, String campo) {
        try {
            return new JsonMapper().readTree(evento.cuerpo()).path(campo).asString();
        } catch (tools.jackson.core.JacksonException noEsJson) {
            throw new IllegalStateException(
                    "El cuerpo del evento " + evento.eventoId() + " no es JSON", noEsJson);
        }
    }

    private static EstadoDeOrden estadoDe(long orden) {
        return enTransaccion(() -> ordenes.porId(orden).orElseThrow()).estado();
    }

    private static long anulacionesDe(long reciboId) {
        return enTransaccion(
                () ->
                        jdbc.sql(
                                        "SELECT count(*) FROM recibo_movimiento"
                                                + " WHERE recibo_id = :r AND tipo = 'ANULACION'")
                                .param("r", reciboId)
                                .query(Long.class)
                                .single());
    }

    private static long eventosDe(long reciboId) {
        return enTransaccion(
                () ->
                        jdbc.sql("SELECT count(*) FROM pago_evento WHERE recibo_id = :r")
                                .param("r", reciboId)
                                .query(Long.class)
                                .single());
    }

    private static long eventosDeTipo(long reciboId, TipoDeEventoDePago tipo) {
        return enTransaccion(
                () ->
                        jdbc.sql(
                                        "SELECT count(*) FROM pago_evento"
                                                + " WHERE recibo_id = :r AND tipo = :tipo")
                                .param("r", reciboId)
                                .param("tipo", tipo.name())
                                .query(Long.class)
                                .single());
    }

    private static List<String> columnasDeRecibo() {
        return enTransaccion(
                () ->
                        jdbc.sql(
                                        "SELECT column_name FROM information_schema.columns"
                                                + " WHERE table_name = 'recibo'")
                                .query(String.class)
                                .list());
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
