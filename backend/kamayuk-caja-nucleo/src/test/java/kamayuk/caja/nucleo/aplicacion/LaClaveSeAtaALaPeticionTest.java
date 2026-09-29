package kamayuk.caja.nucleo.aplicacion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import kamayuk.caja.auditoria.RegistroDeAuditoria;
import kamayuk.caja.dominio.Dinero;
import kamayuk.caja.dominio.Observacion;
import kamayuk.caja.dominio.ZonaHoraria;
import kamayuk.caja.nucleo.dobles.BuzonEnMemoria;
import kamayuk.caja.nucleo.dobles.CajasEnMemoria;
import kamayuk.caja.nucleo.dobles.OrdenesEnMemoria;
import kamayuk.caja.nucleo.dobles.RecibosEnMemoria;
import kamayuk.caja.nucleo.dobles.TasasEnMemoria;
import kamayuk.caja.nucleo.dobles.TurnosEnMemoria;
import kamayuk.caja.nucleo.dominio.Caja;
import kamayuk.caja.nucleo.dominio.ClaveDeIdempotencia;
import kamayuk.caja.nucleo.dominio.EstadoDeOrden;
import kamayuk.caja.nucleo.dominio.FormaDePago;
import kamayuk.caja.nucleo.dominio.LineaDeTasaPedida;
import kamayuk.caja.nucleo.dominio.OrdenDeCobro;
import kamayuk.caja.nucleo.dominio.Pagador;
import kamayuk.caja.nucleo.dominio.Recibo;
import kamayuk.caja.nucleo.dominio.SistemaDeOrigen;
import kamayuk.caja.nucleo.dominio.Tasa;
import kamayuk.caja.nucleo.infraestructura.ComponedorDeEventosJson;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

/**
 * #143 — La {@code Idempotency-Key} de un cobro se ata a la peticion que la trajo, y se mira antes
 * de abrir el turno.
 *
 * <p>Las dos mitades del issue, con dobles: <b>la misma clave con otra peticion</b> —otra ruta,
 * otras ordenes, otra cantidad— se rechaza en vez de devolver el recibo de otra cosa; y <b>el mismo
 * intento</b> recibe su recibo aunque llegue despues de medianoche o con su turno ya cerrado, sin
 * abrir ni auditar un turno vacio. Lo que un doble no puede probar —que dos reintentos simultaneos
 * los ordena la segunda mirada, con el candado del turno puesto, y que la huella llega a la base—
 * esta en {@code CajaJdbcTest}.
 */
@DisplayName("#143 — La clave de un cobro se ata a su peticion")
class LaClaveSeAtaALaPeticionTest {

    private static final LocalDate HOY = LocalDate.of(2026, 9, 28);
    private static final LocalDate MANIANA = HOY.plusDays(1);
    private static final Clock RELOJ =
            Clock.fixed(Instant.parse("2026-09-28T20:00:00Z"), ZonaHoraria.DEL_PRODUCTO);

    private static final String CAJERO = "cajero.prueba";
    private static final SistemaDeOrigen RENTAS = SistemaDeOrigen.de("rentas");
    private static final Pagador PAGADOR = new Pagador("12345678", "TITULAR, PRUEBA", 7L);

    private final CajasEnMemoria cajas =
            new CajasEnMemoria()
                    .con(new Caja(1L, "C-01", "Caja tributaria", "001", null, true))
                    .con(new Caja(2L, "C-02", "Otra ventanilla", "002", null, true));
    private final TurnosEnMemoria turnos = new TurnosEnMemoria();
    private final RecibosEnMemoria recibos = new RecibosEnMemoria();
    private final OrdenesEnMemoria ordenes = new OrdenesEnMemoria();
    private final BuzonEnMemoria buzon = new BuzonEnMemoria();
    private final TasasEnMemoria tasas = new TasasEnMemoria().con(tasa());

    /** Lo que se audito: una apertura de turno que no ocurrio se veria aqui. */
    private final List<RegistroDeAuditoria> auditados = new ArrayList<>();

    private final AbrirCaja abrirCaja = new AbrirCaja(cajas, turnos, auditados::add, RELOJ);
    private final CobrarOrdenes cobrarOrdenes =
            new CobrarOrdenes(
                    abrirCaja,
                    ordenes,
                    recibos,
                    buzon,
                    new ComponedorDeEventosJson(new JsonMapper()),
                    auditados::add,
                    RELOJ);
    private final CobrarTasa cobrarTasa =
            new CobrarTasa(abrirCaja, tasas, recibos, auditados::add, RELOJ);

    @Nested
    @DisplayName("La misma clave con otra peticion no devuelve el recibo de otra cosa")
    class DeLaClaveReusada {

        @Test
        @DisplayName(
                "la clave de un cobro de tasas, mandada a cobrar ordenes: rechazo, orden intacta")
        void deTasasAOrdenes() {
            Recibo deLaTasa = cobrarTasa.cobrar(tasaCon("k-1", 1), porQue()).recibo();
            long orden = orden("PREDIAL-1");

            assertThatThrownBy(() -> cobrarOrdenes.cobrar(ordenesCon("k-1", orden), porQue()))
                    .as("[el escenario del issue: devolvia el recibo de la tasa con un 201]")
                    .isInstanceOf(ClaveDeIdempotencia.UsadaConOtraPeticion.class)
                    .hasMessageContaining("'k-1' ya se uso con otra peticion");
            assertThat(estadoDe(orden))
                    .as("[y la orden sigue cobrable: nadie la pago]")
                    .isEqualTo(EstadoDeOrden.PENDIENTE);
            assertThat(recibos.emitidos()).containsExactly(deLaTasa);
            assertThat(buzon.encolados()).isEmpty();
        }

        @Test
        @DisplayName("la misma ruta con otras ordenes: rechazo, y la segunda orden sigue pendiente")
        void otrasOrdenes() {
            long una = orden("PREDIAL-1");
            long otra = orden("PREDIAL-2");
            cobrarOrdenes.cobrar(ordenesCon("k-2", una), porQue());

            assertThatThrownBy(() -> cobrarOrdenes.cobrar(ordenesCon("k-2", otra), porQue()))
                    .isInstanceOf(ClaveDeIdempotencia.UsadaConOtraPeticion.class);
            assertThat(estadoDe(otra)).isEqualTo(EstadoDeOrden.PENDIENTE);
            assertThat(recibos.emitidos()).hasSize(1);
        }

        @Test
        @DisplayName("la misma ruta con otra cantidad del mismo concepto: rechazo")
        void otraCantidad() {
            cobrarTasa.cobrar(tasaCon("k-3", 1), porQue());

            assertThatThrownBy(() -> cobrarTasa.cobrar(tasaCon("k-3", 2), porQue()))
                    .as(
                            "[otro importe: devolverle el recibo de una unidad cobraria una y diria dos]")
                    .isInstanceOf(ClaveDeIdempotencia.UsadaConOtraPeticion.class);
            assertThat(recibos.emitidos()).hasSize(1);
        }

        @Test
        @DisplayName("la clave de un cobro de ordenes, mandada a cobrar tasas: rechazo")
        void deOrdenesATasas() {
            cobrarOrdenes.cobrar(ordenesCon("k-4", orden("PREDIAL-1")), porQue());

            assertThatThrownBy(() -> cobrarTasa.cobrar(tasaCon("k-4", 1), porQue()))
                    .isInstanceOf(ClaveDeIdempotencia.UsadaConOtraPeticion.class);
            assertThat(recibos.emitidos()).hasSize(1);
        }
    }

    @Nested
    @DisplayName("El mismo intento recibe su recibo sin abrir ningun turno")
    class DelMismoIntento {

        @Test
        @DisplayName("despues de medianoche: el mismo recibo, y ni un turno del dia nuevo")
        void despuesDeMedianoche() {
            long orden = orden("PREDIAL-1");
            CobrarOrdenes.Cobrado primero =
                    cobrarOrdenes.cobrar(ordenesCon("k-5", HOY, orden), porQue());
            int auditadosAntes = auditados.size();

            CobrarOrdenes.Cobrado reintento =
                    cobrarOrdenes.cobrar(ordenesCon("k-5", MANIANA, orden), porQue());

            assertThat(reintento.recibo()).isEqualTo(primero.recibo());
            assertThat(reintento.emitido()).isFalse();
            assertThat(reintento.pagoId()).isEqualTo(primero.pagoId());
            assertThat(turnos.cuantos())
                    .as(
                            "[un reintento no es un cobro: antes de #143 abria el turno del dia"
                                    + " nuevo, vacio, y lo dejaba abierto]")
                    .isEqualTo(1);
            assertThat(auditados)
                    .as("[ni lo audita: una apertura que no ocurrio en la bitacora]")
                    .hasSize(auditadosAntes);
        }

        @Test
        @DisplayName("con su turno ya cerrado: el mismo recibo, no «turno cerrado»")
        void conElTurnoCerrado() {
            long orden = orden("PREDIAL-1");
            CobrarOrdenes.Cobrado primero =
                    cobrarOrdenes.cobrar(ordenesCon("k-6", HOY, orden), porQue());
            turnos.cerrar(primero.recibo().turnoId());

            CobrarOrdenes.Cobrado reintento =
                    cobrarOrdenes.cobrar(ordenesCon("k-6", HOY, orden), porQue());

            assertThat(reintento.recibo())
                    .as(
                            "[antes de #143: TurnoCerrado, un 409 al reintento de un cobro que SI se hizo]")
                    .isEqualTo(primero.recibo());
            assertThat(reintento.emitido()).isFalse();
        }

        @Test
        @DisplayName("lo mismo en la caja de tasas: despues de medianoche y con el turno cerrado")
        void enLaCajaDeTasas() {
            CobrarTasa.Cobrada primero = cobrarTasa.cobrar(tasaCon("k-7", HOY, 1), porQue());
            turnos.cerrar(primero.recibo().turnoId());

            CobrarTasa.Cobrada conElTurnoCerrado =
                    cobrarTasa.cobrar(tasaCon("k-7", HOY, 1), porQue());
            CobrarTasa.Cobrada despuesDeMedianoche =
                    cobrarTasa.cobrar(tasaCon("k-7", MANIANA, 1), porQue());

            assertThat(conElTurnoCerrado)
                    .isEqualTo(new CobrarTasa.Cobrada(primero.recibo(), false));
            assertThat(despuesDeMedianoche).isEqualTo(conElTurnoCerrado);
            assertThat(primero.emitido()).isTrue();
            assertThat(turnos.cuantos()).isEqualTo(1);
        }

        @Test
        @DisplayName("las mismas ordenes marcadas en otro orden son el mismo intento")
        void enOtroOrden() {
            long una = orden("PREDIAL-1");
            long otra = orden("PREDIAL-2");
            CobrarOrdenes.Cobrado primero =
                    cobrarOrdenes.cobrar(ordenesCon("k-8", HOY, una, otra), porQue());

            assertThat(cobrarOrdenes.cobrar(ordenesCon("k-8", HOY, otra, una), porQue()).recibo())
                    .isEqualTo(primero.recibo());
        }

        @Test
        @DisplayName("yaCobrada adelanta la respuesta sin abrir nada, y dice que no hay nada")
        void yaCobrada() {
            long orden = orden("PREDIAL-1");
            CobrarOrdenes.Cobranza cobranza = ordenesCon("k-9", orden);

            assertThat(cobrarOrdenes.yaCobrada(Objects.requireNonNull(cobranza.clave()))).isEmpty();
            assertThat(turnos.cuantos()).as("[mirar no abre]").isZero();
            CobrarOrdenes.Cobrado cobrado = cobrarOrdenes.cobrar(cobranza, porQue());
            assertThat(cobrarOrdenes.yaCobrada(Objects.requireNonNull(cobranza.clave())))
                    .contains(new CobrarOrdenes.Cobrado(cobrado.recibo(), cobrado.pagoId(), false));
        }
    }

    @Nested
    @DisplayName("Un recibo de antes de V8, sin huella")
    class DeLasFilasViejas {

        @Test
        @DisplayName("se reconoce como antes en su propia ruta")
        void enSuRuta() {
            Recibo viejo = cobrarTasa.cobrar(tasaCon(null, 1), porQue()).recibo();
            recibos.conClaveSinHuella("vieja", viejo);

            assertThat(cobrarTasa.cobrar(tasaCon("vieja", 3), porQue()))
                    .as("[no se sabe que peticion la trajo: se acepta el reintento, como antes]")
                    .isEqualTo(new CobrarTasa.Cobrada(viejo, false));
        }

        @Test
        @DisplayName("pero un recibo de tasa no es nunca la respuesta a cobrar ordenes")
        void noEnLaOtraRuta() {
            Recibo viejo = cobrarTasa.cobrar(tasaCon(null, 1), porQue()).recibo();
            recibos.conClaveSinHuella("vieja", viejo);
            long orden = orden("PREDIAL-1");

            assertThatThrownBy(() -> cobrarOrdenes.cobrar(ordenesCon("vieja", orden), porQue()))
                    .as("[sin huella se sabe al menos esto, y es el escenario del issue]")
                    .isInstanceOf(ClaveDeIdempotencia.UsadaConOtraPeticion.class);
            assertThat(estadoDe(orden)).isEqualTo(EstadoDeOrden.PENDIENTE);
        }
    }

    @Nested
    @DisplayName("Que es «la misma peticion»")
    class DeLaHuella {

        @Test
        @DisplayName(
                "cambia con la caja, el cajero, la forma de pago y las ordenes; no con su orden")
        void deUnaCobranza() {
            String base = huellaDeOrdenes("C-01", CAJERO, FormaDePago.EFECTIVO, 1L, 2L);

            assertThat(huellaDeOrdenes("C-01", CAJERO, FormaDePago.EFECTIVO, 2L, 1L))
                    .isEqualTo(base);
            assertThat(
                            List.of(
                                    huellaDeOrdenes("C-02", CAJERO, FormaDePago.EFECTIVO, 1L, 2L),
                                    huellaDeOrdenes("C-01", "otro", FormaDePago.EFECTIVO, 1L, 2L),
                                    huellaDeOrdenes("C-01", CAJERO, FormaDePago.TARJETA, 1L, 2L),
                                    huellaDeOrdenes("C-01", CAJERO, FormaDePago.EFECTIVO, 1L),
                                    huellaDeOrdenes("C-01", CAJERO, FormaDePago.EFECTIVO, 1L, 3L)))
                    .doesNotContain(base)
                    .doesNotHaveDuplicates();
        }

        @Test
        @DisplayName("un cobro de tasas cambia tambien con el pagador y la cantidad")
        void deUnCobroDeTasas() {
            String base = huellaDeTasas(PAGADOR, 1);

            assertThat(huellaDeTasas(PAGADOR, 1)).isEqualTo(base);
            assertThat(
                            List.of(
                                    huellaDeTasas(PAGADOR, 2),
                                    huellaDeTasas(Pagador.ANONIMO, 1),
                                    huellaDeTasas(new Pagador("12345678", null, 7L), 1)))
                    .doesNotContain(base)
                    .doesNotHaveDuplicates();
        }

        @Test
        @DisplayName("sin cabecera no hay clave, y una que no cabe se rechaza al construir")
        void sinCabecera() {
            assertThat(ordenesCon(null, 1L).clave()).isNull();
            assertThatThrownBy(() -> ordenesCon("k".repeat(65), 1L))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("hasta 64");
        }

        private String huellaDeOrdenes(
                String caja, String cajero, FormaDePago forma, Long... marcadas) {
            return Objects.requireNonNull(
                            CobrarOrdenes.claveDe("k", caja, cajero, List.of(marcadas), forma))
                    .huella();
        }

        private String huellaDeTasas(Pagador pagador, int cantidad) {
            return Objects.requireNonNull(
                            CobrarTasa.claveDe(
                                    "k",
                                    "C-01",
                                    CAJERO,
                                    pagador,
                                    List.of(new LineaDeTasaPedida("T-001", cantidad)),
                                    FormaDePago.EFECTIVO))
                    .huella();
        }
    }

    // ------------------------------------------------------------------

    private long orden(String referencia) {
        return ordenes.con(
                        OrdenDeCobro.nueva(
                                RENTAS,
                                referencia,
                                "IMPUESTO PREDIAL 2026",
                                null,
                                Dinero.de("100.00"),
                                LocalDate.of(2026, 1, 2),
                                LocalDate.of(2026, 1, 2),
                                PAGADOR,
                                Instant.parse("2026-01-02T10:00:00Z"),
                                Observacion.de("Orden emitida por el sistema de origen")))
                .idGuardado();
    }

    private EstadoDeOrden estadoDe(long orden) {
        return ordenes.porId(orden).orElseThrow().estado();
    }

    private static CobrarOrdenes.Cobranza ordenesCon(@Nullable String clave, Long... marcadas) {
        return ordenesCon(clave, HOY, marcadas);
    }

    private static CobrarOrdenes.Cobranza ordenesCon(
            @Nullable String clave, LocalDate dia, Long... marcadas) {
        return new CobrarOrdenes.Cobranza(
                "C-01", CAJERO, List.of(marcadas), FormaDePago.EFECTIVO, dia, clave);
    }

    private static CobrarTasa.CobroDeTasas tasaCon(@Nullable String clave, int cantidad) {
        return tasaCon(clave, HOY, cantidad);
    }

    private static CobrarTasa.CobroDeTasas tasaCon(
            @Nullable String clave, LocalDate dia, int cantidad) {
        return new CobrarTasa.CobroDeTasas(
                "C-01",
                CAJERO,
                PAGADOR,
                List.of(new LineaDeTasaPedida("T-001", cantidad)),
                FormaDePago.EFECTIVO,
                dia,
                clave);
    }

    private static Observacion porQue() {
        return Observacion.de("Cobro en ventanilla, prueba de #143");
    }

    private static Tasa tasa() {
        return new Tasa(
                3L,
                "T-001",
                "Constancia de no adeudo",
                9L,
                "1.3.1.1.1.1",
                Dinero.de("12.50"),
                LocalDate.of(2026, 1, 1),
                null,
                "TUPA 2026 de la prueba");
    }
}
