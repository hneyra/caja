package kamayuk.caja.caja.aplicacion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import kamayuk.caja.auditoria.RegistroDeAuditoria;
import kamayuk.caja.caja.dobles.CajasEnMemoria;
import kamayuk.caja.caja.dobles.RecibosEnMemoria;
import kamayuk.caja.caja.dobles.TasasEnMemoria;
import kamayuk.caja.caja.dobles.TurnosEnMemoria;
import kamayuk.caja.caja.dominio.Caja;
import kamayuk.caja.caja.dominio.FormaDePago;
import kamayuk.caja.caja.dominio.LineaDeTasaPedida;
import kamayuk.caja.caja.dominio.Pagador;
import kamayuk.caja.caja.dominio.Recibo;
import kamayuk.caja.caja.dominio.Tasa;
import kamayuk.caja.caja.dominio.TipoDePago;
import kamayuk.caja.dominio.Dinero;
import kamayuk.caja.dominio.Observacion;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * #33 — Las decisiones de la caja de TASAS, con dobles: sin base de datos y sin reloj del sistema.
 *
 * <h2>Que quedo de esta clase con P5D</h2>
 *
 * <p>Nacio probando las dos cajas del monolito: la tributaria —{@code CobrarDeuda}, que asentaba
 * abonos en el libro de cuenta corriente— y la de tasas. El libro se fue con la separacion
 * (ADR-0026), y con el se fue la mitad de esta clase: lo que cobra ordenes ahora es {@link
 * CobrarOrdenes} y se prueba aparte. Lo que <b>no</b> se fue —y por eso esta clase sigue existiendo
 * en vez de borrarse entera— es que la caja de tasas cobra conceptos <b>de la propia caja</b>: un
 * derecho del TUPA no viene de ningun sistema de origen, no produce evento y no avisa a nadie.
 *
 * <p>Lo que <b>no</b> se prueba aqui, y por eso existe {@code CajaJdbcTest}: la atomicidad, el
 * {@code REVOKE UPDATE} sobre el recibo y el aislamiento entre municipalidades. Ninguna de las tres
 * se puede demostrar contra un doble; contra un doble solo se demuestra que el codigo hace lo que
 * el doble deja hacer.
 */
@DisplayName("#33 — Caja de tasas")
class CobrarTasasEnVentanillaTest {

    private static final LocalDate PAGO = LocalDate.of(2026, 3, 15);
    private static final Clock RELOJ =
            Clock.fixed(PAGO.atStartOfDay(ZoneOffset.UTC).toInstant(), ZoneOffset.UTC);

    private static final Caja CAJA = new Caja(1L, "C-01", "Caja de tasas", "001", null, true);
    private static final Caja CAJA_DE_BAJA = new Caja(2L, "C-02", "Caja vieja", "002", null, false);

    /**
     * Quien paga en ventanilla, tal como la caja lo conoce desde P5D: tres campos anulables y
     * ningun padron detras. Hasta la separacion esto era un {@code contribuyenteId} con clave
     * foranea a una tabla de {@code rentas} que esta base ya no tiene.
     */
    private static final Pagador PAGADOR = new Pagador("12345678", "SANTOS RIVERA, ELENA", 7L);

    private final CajasEnMemoria cajas = new CajasEnMemoria().con(CAJA).con(CAJA_DE_BAJA);
    private final TurnosEnMemoria turnos = new TurnosEnMemoria();
    private final RecibosEnMemoria recibos = new RecibosEnMemoria();
    private final TasasEnMemoria tasas = new TasasEnMemoria();

    private final AbrirCaja abrirCaja =
            new AbrirCaja(cajas, turnos, (RegistroDeAuditoria registro) -> {}, RELOJ);
    private final CobrarTasa cobrarTasa =
            new CobrarTasa(abrirCaja, tasas, recibos, (RegistroDeAuditoria registro) -> {}, RELOJ);

    @Nested
    @DisplayName("La apertura del turno")
    class DelTurno {

        @Test
        @DisplayName("dos cobranzas del mismo cajero y dia abren UN turno, no dos")
        void abrirDosVecesNoDuplica() {
            tasas.con(tasa("T-001", Dinero.de("12.50"), LocalDate.of(2026, 1, 1), null));

            cobrarTasa.cobrar(cobroDe("T-001", 1, null), porQue());
            cobrarTasa.cobrar(cobroDe("T-001", 2, null), porQue());

            assertThat(turnos.cuantos()).isEqualTo(1);
            assertThat(recibos.emitidos()).hasSize(2);
        }

        @Test
        @DisplayName("contra un turno cerrado no se cobra: su arqueo ya se firmo")
        void unTurnoCerradoNoCobra() {
            turnos.conTurnoCerrado(1L, "cajero.prueba", PAGO);
            tasas.con(tasa("T-001", Dinero.de("12.50"), LocalDate.of(2026, 1, 1), null));

            assertThatThrownBy(() -> cobrarTasa.cobrar(cobroDe("T-001", 1, null), porQue()))
                    .isInstanceOf(AbrirCaja.TurnoCerrado.class)
                    .hasMessageContaining("ya se cerro");
            assertThat(recibos.emitidos()).isEmpty();
        }

        @Test
        @DisplayName("una caja dada de baja no cobra")
        void unaCajaDeBajaNoCobra() {
            tasas.con(tasa("T-001", Dinero.de("12.50"), LocalDate.of(2026, 1, 1), null));

            assertThatThrownBy(
                            () ->
                                    cobrarTasa.cobrar(
                                            new CobrarTasa.CobroDeTasas(
                                                    "C-02",
                                                    "cajero.prueba",
                                                    PAGADOR,
                                                    List.of(new LineaDeTasaPedida("T-001", 1)),
                                                    FormaDePago.EFECTIVO,
                                                    PAGO,
                                                    null),
                                            porQue()))
                    .isInstanceOf(AbrirCaja.CajaDeBaja.class);
            assertThat(recibos.emitidos()).isEmpty();
        }
    }

    @Nested
    @DisplayName("El cobro de conceptos del TUPA")
    class DelCobro {

        @Test
        @DisplayName("el precio sale de la tabla, y cobrar tres cuesta tres veces la tarifa")
        void elPrecioSaleDeLaTabla() {
            tasas.con(tasa("T-001", Dinero.de("12.50"), LocalDate.of(2026, 1, 1), null));

            Recibo emitido = cobrarTasa.cobrar(cobroDe("T-001", 3, null), porQue());

            assertThat(emitido.total()).isEqualTo(Dinero.de("37.50"));
            assertThat(emitido.lineas())
                    .singleElement()
                    .satisfies(
                            linea -> {
                                assertThat(linea.cantidad()).isEqualTo(3);
                                assertThat(linea.precioUnitario()).isEqualTo(Dinero.de("12.50"));
                                assertThat(linea.reajuste()).isEqualTo(Dinero.CERO);
                                assertThat(linea.detalle())
                                        .as(
                                                "el detalle es lo que el SISTEMA DE ORIGEN quiso"
                                                        + " imprimir, y una tasa no tiene ninguno: la"
                                                        + " emitio esta misma caja")
                                        .isNull();
                            });
            assertThat(emitido.tipoDePago()).isEqualTo(TipoDePago.TASA);
        }

        @Test
        @DisplayName("cobra la tarifa vigente a la fecha, no la ultima registrada")
        void cobraLaTarifaVigenteALaFecha() {
            LocalDate julio = LocalDate.of(2026, 7, 1);
            tasas.con(
                            tasa(
                                    "T-001",
                                    Dinero.de("12.50"),
                                    LocalDate.of(2026, 1, 1),
                                    julio.minusDays(1)))
                    .con(tasa("T-001", Dinero.de("20.00"), julio, null));

            Recibo enMarzo = cobrarTasa.cobrar(cobroDe("T-001", 1, null), porQue());

            assertThat(enMarzo.total())
                    .as("una cobranza de marzo no paga la tarifa que rige desde julio")
                    .isEqualTo(Dinero.de("12.50"));
        }

        @Test
        @DisplayName("un concepto sin tarifa vigente no se cobra")
        void sinTarifaVigenteNoSeCobra() {
            tasas.con(tasa("T-001", Dinero.de("12.50"), LocalDate.of(2026, 7, 1), null));

            assertThatThrownBy(() -> cobrarTasa.cobrar(cobroDe("T-001", 1, null), porQue()))
                    .isInstanceOf(CobrarTasa.TasaSinTarifaVigente.class);
            assertThat(recibos.emitidos()).isEmpty();
        }

        @Test
        @DisplayName("el recibo dice a que fecha estaba vigente la tarifa que cobro (RNF-075)")
        void elReciboLlevaLaFechaDeLaTarifa() {
            LocalDate ayer = PAGO.minusDays(1);
            tasas.con(tasa("T-001", Dinero.de("12.50"), LocalDate.of(2026, 1, 1), null));

            Recibo emitido =
                    cobrarTasa.cobrar(
                            new CobrarTasa.CobroDeTasas(
                                    "C-01",
                                    "cajero.prueba",
                                    PAGADOR,
                                    List.of(new LineaDeTasaPedida("T-001", 1)),
                                    FormaDePago.EFECTIVO,
                                    ayer,
                                    null),
                            porQue());

            assertThat(emitido.actualizadoA())
                    .as(
                            "la fecha del recibo es aquella a la que se resolvio la tarifa, no la"
                                    + " de hoy: es lo que deja al duplicado explicar su cifra el dia"
                                    + " que la ordenanza la suba")
                    .isEqualTo(ayer);
        }

        @Test
        @DisplayName("reenviar el mismo intento devuelve el recibo de la primera vez")
        void elReenvioDevuelveElMismoRecibo() {
            tasas.con(tasa("T-001", Dinero.de("12.50"), LocalDate.of(2026, 1, 1), null));

            Recibo primero = cobrarTasa.cobrar(cobroDe("T-001", 1, "clave-1"), porQue());
            Recibo repetido = cobrarTasa.cobrar(cobroDe("T-001", 1, "clave-1"), porQue());

            assertThat(repetido.id()).isEqualTo(primero.id());
            assertThat(repetido.numero()).isEqualTo(primero.numero());
            assertThat(recibos.emitidos()).hasSize(1);
        }

        @Test
        @DisplayName("el pagador puede ser anonimo: nadie exige documento para pagar una tasa")
        void elPagadorPuedeSerAnonimo() {
            tasas.con(tasa("T-001", Dinero.de("12.50"), LocalDate.of(2026, 1, 1), null));

            Recibo emitido =
                    cobrarTasa.cobrar(
                            new CobrarTasa.CobroDeTasas(
                                    "C-01",
                                    "cajero.prueba",
                                    Pagador.ANONIMO,
                                    List.of(new LineaDeTasaPedida("T-001", 1)),
                                    FormaDePago.EFECTIVO,
                                    PAGO,
                                    null),
                            porQue());

            assertThat(emitido.pagador().esAnonimo()).isTrue();
            assertThat(emitido.pagador().nombreImpreso())
                    .as("y el papel dice por que no hay nombre, en vez de dejar la celda vacia")
                    .contains("no se identifico");
        }

        @Test
        @DisplayName("sin observacion no se cobra (regla 10)")
        void sinObservacionNoSeCobra() {
            tasas.con(tasa("T-001", Dinero.de("12.50"), LocalDate.of(2026, 1, 1), null));

            assertThatThrownBy(() -> cobrarTasa.cobrar(cobroDe("T-001", 1, null), null))
                    .isInstanceOf(NullPointerException.class)
                    .hasMessageContaining("regla 10");
        }
    }

    @Nested
    @DisplayName("Los bordes de la peticion")
    class DeLaPeticion {

        @Test
        @DisplayName("un cobro sin ningun concepto se rechaza: no documentaria nada")
        void sinConceptosNoSeCobra() {
            assertThatThrownBy(
                            () ->
                                    new CobrarTasa.CobroDeTasas(
                                            "C-01",
                                            "cajero.prueba",
                                            PAGADOR,
                                            List.of(),
                                            FormaDePago.EFECTIVO,
                                            PAGO,
                                            null))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("al menos un concepto");
        }

        @Test
        @DisplayName("el pagador es anonimo, no nulo: nulo seria «no se pregunto»")
        void elPagadorNoEsNulo() {
            assertThatThrownBy(
                            () ->
                                    new CobrarTasa.CobroDeTasas(
                                            "C-01",
                                            "cajero.prueba",
                                            null,
                                            List.of(new LineaDeTasaPedida("T-001", 1)),
                                            FormaDePago.EFECTIVO,
                                            PAGO,
                                            null))
                    .isInstanceOf(NullPointerException.class)
                    .hasMessageContaining("anonimo, no nulo");
        }

        @Test
        @DisplayName("cobrar cero veces un concepto se rechaza al construir la linea")
        void laCantidadEsAlMenosUna() {
            assertThatThrownBy(() -> new LineaDeTasaPedida("T-001", 0))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    // ------------------------------------------------------------------

    private static CobrarTasa.CobroDeTasas cobroDe(String codigo, int cantidad, String clave) {
        return new CobrarTasa.CobroDeTasas(
                "C-01",
                "cajero.prueba",
                PAGADOR,
                List.of(new LineaDeTasaPedida(codigo, cantidad)),
                FormaDePago.EFECTIVO,
                PAGO,
                clave);
    }

    private static Observacion porQue() {
        return Observacion.de("Cobro de tasas en ventanilla, prueba de #33");
    }

    private static Tasa tasa(String codigo, Dinero importe, LocalDate desde, LocalDate hasta) {
        return new Tasa(
                codigo.hashCode() & 0xffffL,
                codigo,
                "Concepto del TUPA de la prueba",
                9L,
                "1.3.1.1.1.1",
                importe,
                desde,
                hasta,
                "TUPA 2026, ordenanza de la prueba");
    }
}
