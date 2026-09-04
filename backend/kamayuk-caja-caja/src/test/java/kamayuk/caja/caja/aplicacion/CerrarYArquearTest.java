package kamayuk.caja.caja.aplicacion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import kamayuk.caja.caja.dobles.BuzonEnMemoria;
import kamayuk.caja.caja.dobles.CajasEnMemoria;
import kamayuk.caja.caja.dobles.CierresEnMemoria;
import kamayuk.caja.caja.dobles.TurnosEnMemoria;
import kamayuk.caja.caja.dominio.Caja;
import kamayuk.caja.caja.dominio.CierreDeTurno;
import kamayuk.caja.caja.dominio.EstadoDelEvento;
import kamayuk.caja.caja.dominio.EventoDePago;
import kamayuk.caja.caja.dominio.FormaDePago;
import kamayuk.caja.caja.dominio.NumeroDeRecibo;
import kamayuk.caja.caja.dominio.ReciboDelTurno;
import kamayuk.caja.caja.dominio.SistemaDeOrigen;
import kamayuk.caja.caja.dominio.TipoDeEventoDePago;
import kamayuk.caja.caja.dominio.TipoDeMovimientoDeTurno;
import kamayuk.caja.caja.dominio.TipoDePago;
import kamayuk.caja.dominio.Dinero;
import kamayuk.caja.dominio.Observacion;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * #36 — Las decisiones de cerrar y de reversar, sin base de datos.
 *
 * <h2>Contra que cuadra el cierre desde P5D</h2>
 *
 * <p>Ya no contra el libro de cuenta corriente, que vive en otra base (ADR-0026): contra el
 * <b>buzon de salida</b>. El turno no cierra hasta que cada uno de sus pagos esta entregado o
 * explicado uno por uno, y lo que se pierde y se gana con el cambio esta escrito en {@link
 * ArqueoDeTurno}. Lo que aqui se prueba es que la comprobacion muerde: que un pago pendiente y uno
 * muerto impiden cerrar, que uno entregado o explicado no, y que las dos mitades de lo recaudado
 * —lo que produce evento y lo que no— se separan bien.
 *
 * <p>Lo demas sigue igual: que un cierre no se pueda repetir, que reversar deje el anterior intacto
 * y reabra el turno, y que un descuadre de caja se guarde en vez de impedir el cierre. La
 * concurrencia, el {@code REVOKE UPDATE} y la no contencion los prueba {@code CierreDeCajaJdbcTest}
 * contra PostgreSQL, porque contra un doble no se pueden demostrar.
 */
@DisplayName("#36 — Cierre y arqueo de caja")
class CerrarYArquearTest {

    private static final LocalDate HOY = LocalDate.of(2026, 3, 15);
    private static final Instant MOMENTO = Instant.parse("2026-03-15T18:00:00Z");
    private static final Clock RELOJ = Clock.fixed(MOMENTO, ZoneOffset.UTC);
    private static final long CAJA = 1L;
    private static final long TURNO = 10L;
    private static final String CAJERO = "jperez";
    private static final SistemaDeOrigen RENTAS = SistemaDeOrigen.de("rentas");

    @Nested
    @DisplayName("El cierre congela su arqueo")
    class DelCierre {

        @Test
        @DisplayName("cierra con lo cobrado, lo anulado y el neto, y deja el turno cerrado")
        void cierraConSuArqueo() {
            CierresEnMemoria cierres =
                    new CierresEnMemoria()
                            .conRecibosDelTurno(
                                    TURNO, tasa(1, "80.00", "0.00"), normal(2, "200.00", "0.00"));
            BuzonEnMemoria buzon = new BuzonEnMemoria();
            buzon.encolar(evento(2L, EstadoDelEvento.ENTREGADO));

            CerrarTurno.Cerrado cerrado =
                    cerrarTurno(cierres, buzon)
                            .cerrar(
                                    new CerrarTurno.Cierre(
                                            "C-01",
                                            CAJERO,
                                            HOY,
                                            Map.of(FormaDePago.EFECTIVO, Dinero.de("280.00"))),
                                    porQue());

            assertThat(cerrado.cierre().tipo()).isEqualTo(TipoDeMovimientoDeTurno.CIERRE);
            assertThat(cerrado.cierre().secuencia()).isEqualTo(1);
            assertThat(cerrado.cierre().arqueoCongelado().neto()).isEqualTo(Dinero.de("280.00"));
            assertThat(cerrado.cierre().arqueoCongelado().diferencia()).isEqualTo(Dinero.CERO);
            assertThat(cerrado.cuadre().sinEvento())
                    .as("la tasa la emitio la propia caja: no hay a quien avisarle")
                    .isEqualTo(Dinero.de("80.00"));
            assertThat(cerrado.cuadre().conEvento())
                    .as("y lo que se cobro contra una orden si tiene destinatario")
                    .isEqualTo(Dinero.de("200.00"));
            assertThat(cerrado.cuadre().total()).isEqualTo(Dinero.de("280.00"));
        }

        @Test
        @DisplayName("un descuadre de caja NO impide cerrar: es justo lo que hay que dejar escrito")
        void elDescuadreDeCajaSeGuarda() {
            CierresEnMemoria cierres =
                    new CierresEnMemoria().conRecibosDelTurno(TURNO, tasa(1, "500.00", "0.00"));

            CerrarTurno.Cerrado cerrado =
                    cerrarTurno(cierres, new BuzonEnMemoria())
                            .cerrar(
                                    new CerrarTurno.Cierre(
                                            "C-01",
                                            CAJERO,
                                            HOY,
                                            Map.of(FormaDePago.EFECTIVO, Dinero.de("490.00"))),
                                    porQue());

            assertThat(cerrado.cierre().arqueoCongelado().diferencia())
                    .isEqualTo(Dinero.de("-10.00"));
            assertThat(cerrado.cierre().arqueoCongelado().cuadra()).isFalse();
        }

        @Test
        @DisplayName("cerrar dos veces es 409: dos arqueos vigentes sobre el mismo dinero")
        void noSeCierraDosVeces() {
            CierresEnMemoria cierres =
                    new CierresEnMemoria().conRecibosDelTurno(TURNO, tasa(1, "80.00", "0.00"));
            CerrarTurno cerrarTurno = cerrarTurno(cierres, new BuzonEnMemoria());
            cerrarTurno.cerrar(cierre(), porQue());

            assertThatThrownBy(() -> cerrarTurno.cerrar(cierre(), porQue()))
                    .isInstanceOf(CerrarTurno.TurnoYaCerrado.class)
                    .hasMessageContaining("se reversa el que hay");
        }

        @Test
        @DisplayName("sin turno abierto ese dia no hay nada que arquear")
        void sinTurnoNoHayArqueo() {
            CerrarTurno cerrarTurno =
                    new CerrarTurno(
                            new CajasEnMemoria().con(caja()),
                            new TurnosEnMemoria(),
                            new CierresEnMemoria(),
                            new ArqueoDeTurno(new CierresEnMemoria(), new BuzonEnMemoria()),
                            registro -> {},
                            RELOJ);

            assertThatThrownBy(() -> cerrarTurno.cerrar(cierre(), porQue()))
                    .isInstanceOf(CerrarTurno.TurnoSinAbrir.class);
        }
    }

    @Nested
    @DisplayName("Un cierre no se modifica: se reversa con otro")
    class DeLaReversion {

        @Test
        @DisplayName("la reversion deja el cierre anterior intacto y trazable, y reabre el turno")
        void reversarDejaElAnteriorIntacto() {
            CierresEnMemoria cierres =
                    new CierresEnMemoria().conRecibosDelTurno(TURNO, tasa(1, "300.00", "0.00"));
            CerrarTurno cerrarTurno = cerrarTurno(cierres, new BuzonEnMemoria());
            CerrarTurno.Cerrado primero = cerrarTurno.cerrar(cierre(), porQue());

            CerrarTurno.Reversado reversado =
                    cerrarTurno.reversar(
                            "C-01", CAJERO, HOY, "faltaba registrar una cobranza", porQue());

            assertThat(reversado.reversion().tipo()).isEqualTo(TipoDeMovimientoDeTurno.REVERSION);
            assertThat(reversado.reversion().revierteAId())
                    .isEqualTo(primero.cierre().idGuardado());
            assertThat(reversado.reversado().arqueoCongelado().neto())
                    .as("el arqueo del cierre reversado sigue diciendo lo que decia")
                    .isEqualTo(Dinero.de("300.00"));

            List<CierreDeTurno> historia = cierres.deTurno(TURNO);
            assertThat(historia).hasSize(2);
            assertThat(CierreDeTurno.vigenteEn(historia))
                    .as("sin cierre vigente: el turno vuelve a estar abierto")
                    .isNull();
        }

        @Test
        @DisplayName("y despues de reversar se puede volver a cerrar, con la secuencia siguiente")
        void seCierraOtraVezDespuesDeReversar() {
            CierresEnMemoria cierres =
                    new CierresEnMemoria().conRecibosDelTurno(TURNO, tasa(1, "300.00", "0.00"));
            CerrarTurno cerrarTurno = cerrarTurno(cierres, new BuzonEnMemoria());
            cerrarTurno.cerrar(cierre(), porQue());
            cerrarTurno.reversar("C-01", CAJERO, HOY, "hay que seguir cobrando", porQue());

            // Entretanto la ventanilla cobro otro recibo.
            cierres.conRecibosDelTurno(TURNO, tasa(1, "300.00", "0.00"), tasa(2, "50.00", "0.00"));
            CerrarTurno.Cerrado segundo = cerrarTurno.cerrar(cierre(), porQue());

            assertThat(segundo.cierre().secuencia()).isEqualTo(3);
            assertThat(segundo.cierre().arqueoCongelado().neto())
                    .as("el cierre nuevo incluye lo cobrado despues de reabrir")
                    .isEqualTo(Dinero.de("350.00"));
        }

        @Test
        @DisplayName("un turno sin cierre vigente no tiene nada que reversar")
        void nadaQueReversar() {
            CerrarTurno cerrarTurno = cerrarTurno(new CierresEnMemoria(), new BuzonEnMemoria());

            assertThatThrownBy(
                            () ->
                                    cerrarTurno.reversar(
                                            "C-01", CAJERO, HOY, "por si acaso", porQue()))
                    .isInstanceOf(CerrarTurno.TurnoSinCerrar.class);
        }
    }

    @Nested
    @DisplayName("El turno no cierra con un pago que el origen no sabe que existe")
    class DelCuadre {

        @Test
        @DisplayName("una anulacion del dia se resta de los dos lados, y el turno sigue cuadrando")
        void laAnulacionSeRestaEnLosDosLados() {
            CierresEnMemoria cierres =
                    new CierresEnMemoria().conRecibosDelTurno(TURNO, normal(1, "120.00", "120.00"));
            BuzonEnMemoria buzon = new BuzonEnMemoria();
            buzon.encolar(evento(1L, EstadoDelEvento.ENTREGADO));
            buzon.encolar(eventoDe(1L, TipoDeEventoDePago.PAGO_ANULADO, EstadoDelEvento.ENTREGADO));

            CerrarTurno.Cerrado cerrado =
                    cerrarTurno(cierres, buzon)
                            .cerrar(
                                    new CerrarTurno.Cierre("C-01", CAJERO, HOY, Map.of()),
                                    porQue());

            assertThat(cerrado.cierre().arqueoCongelado().neto()).isEqualTo(Dinero.CERO);
            assertThat(cerrado.cuadre().conEvento()).isEqualTo(Dinero.CERO);
            assertThat(cerrado.cierre().arqueoCongelado().recibosAnulados()).isEqualTo(1);
        }

        @Test
        @DisplayName("un pago PENDIENTE impide cerrar, y el mensaje dice cual es")
        void unPagoPendienteImpideCerrar() {
            CierresEnMemoria cierres =
                    new CierresEnMemoria().conRecibosDelTurno(TURNO, normal(1, "300.00", "0.00"));
            BuzonEnMemoria buzon = new BuzonEnMemoria();
            EventoDePago enTransito = buzon.encolar(evento(1L, EstadoDelEvento.PENDIENTE));
            CerrarTurno cerrarTurno = cerrarTurno(cierres, buzon);

            assertThatThrownBy(() -> cerrarTurno.cerrar(cierre(), porQue()))
                    .isInstanceOf(ArqueoDeTurno.HayPagosSinEntregar.class)
                    .as(
                            "un «no se puede» a secas manda a buscar a ciegas: el mensaje nombra"
                                    + " los eventos uno a uno (ADR-0026 §4)")
                    .hasMessageContaining(enTransito.eventoId().toString())
                    .hasMessageContaining("PENDIENTE")
                    .hasMessageContaining("rentas");
            assertThat(cierres.registrados()).as("no queda ni un acta").isEmpty();
        }

        @Test
        @DisplayName("un pago MUERTO tambien impide cerrar: es dinero cobrado sin registrar")
        void unPagoMuertoImpideCerrar() {
            CierresEnMemoria cierres =
                    new CierresEnMemoria().conRecibosDelTurno(TURNO, normal(1, "300.00", "0.00"));
            BuzonEnMemoria buzon = new BuzonEnMemoria();
            buzon.encolar(evento(1L, EstadoDelEvento.MUERTO));

            assertThatThrownBy(() -> cerrarTurno(cierres, buzon).cerrar(cierre(), porQue()))
                    .isInstanceOf(ArqueoDeTurno.HayPagosSinEntregar.class)
                    .hasMessageContaining("MUERTO");
            assertThat(cierres.registrados()).isEmpty();
        }

        @Test
        @DisplayName("uno EXPLICADO deja cerrar: alguien se hizo cargo por escrito")
        void unPagoExplicadoDejaCerrar() {
            CierresEnMemoria cierres =
                    new CierresEnMemoria().conRecibosDelTurno(TURNO, normal(1, "300.00", "0.00"));
            BuzonEnMemoria buzon = new BuzonEnMemoria();
            buzon.encolar(explicado(1L));

            CerrarTurno.Cerrado cerrado =
                    cerrarTurno(cierres, buzon)
                            .cerrar(
                                    new CerrarTurno.Cierre(
                                            "C-01",
                                            CAJERO,
                                            HOY,
                                            Map.of(FormaDePago.EFECTIVO, Dinero.de("300.00"))),
                                    porQue());

            assertThat(cerrado.cierre().arqueoCongelado().neto()).isEqualTo(Dinero.de("300.00"));
            assertThat(cerrado.cuadre().conEvento())
                    .as(
                            "explicado no es «no ocurrio»: el dinero se cobro y sigue contando en"
                                    + " la mitad que tiene destinatario")
                    .isEqualTo(Dinero.de("300.00"));
        }
    }

    @Nested
    @DisplayName("Cobrar despues de cerrar")
    class DeLaCobranzaTrasElCierre {

        @Test
        @DisplayName("con el turno cerrado, la caja rechaza cobrar")
        void conTurnoCerradoNoSeCobra() {
            TurnosEnMemoria turnos = new TurnosEnMemoria().conTurnoCerrado(CAJA, CAJERO, HOY);
            AbrirCaja abrirCaja =
                    new AbrirCaja(new CajasEnMemoria().con(caja()), turnos, registro -> {}, RELOJ);

            assertThatThrownBy(() -> abrirCaja.enLaCaja("C-01", CAJERO, HOY, porQue()))
                    .isInstanceOf(AbrirCaja.TurnoCerrado.class)
                    .as("y el mensaje dice como se reabre, que es reversando el cierre")
                    .hasMessageContaining("reversar");
        }
    }

    // ------------------------------------------------------------------

    private static CerrarTurno cerrarTurno(CierresEnMemoria cierres, BuzonEnMemoria buzon) {
        return new CerrarTurno(
                new CajasEnMemoria().con(caja()),
                new TurnosEnMemoria().conTurnoAbierto(TURNO, CAJA, CAJERO, HOY),
                cierres,
                new ArqueoDeTurno(cierres, buzon),
                registro -> {},
                RELOJ);
    }

    private static CerrarTurno.Cierre cierre() {
        return new CerrarTurno.Cierre("C-01", CAJERO, HOY, Map.of());
    }

    private static Caja caja() {
        return new Caja(CAJA, "C-01", "Caja tributaria", "001", null, true);
    }

    private static ReciboDelTurno normal(long numero, String total, String anulado) {
        return recibo(numero, TipoDePago.NORMAL, total, anulado);
    }

    private static ReciboDelTurno tasa(long numero, String total, String anulado) {
        return recibo(numero, TipoDePago.TASA, total, anulado);
    }

    private static ReciboDelTurno recibo(
            long numero, TipoDePago tipo, String total, String anulado) {
        return new ReciboDelTurno(
                new NumeroDeRecibo("001", numero),
                tipo,
                FormaDePago.EFECTIVO,
                Dinero.de(total),
                Dinero.de(anulado));
    }

    private static EventoDePago evento(long reciboId, EstadoDelEvento estado) {
        return eventoDe(reciboId, TipoDeEventoDePago.PAGO_REGISTRADO, estado);
    }

    private static EventoDePago eventoDe(
            long reciboId, TipoDeEventoDePago tipo, EstadoDelEvento estado) {
        return new EventoDePago(
                null,
                UUID.randomUUID(),
                tipo,
                RENTAS,
                reciboId,
                TURNO,
                "{}",
                estado,
                estado == EstadoDelEvento.PENDIENTE ? 0 : 1,
                estado == EstadoDelEvento.MUERTO ? "el origen no contesta" : null,
                MOMENTO,
                estado == EstadoDelEvento.ENTREGADO ? MOMENTO : null,
                null);
    }

    private static EventoDePago explicado(long reciboId) {
        return new EventoDePago(
                null,
                UUID.randomUUID(),
                TipoDeEventoDePago.PAGO_REGISTRADO,
                RENTAS,
                reciboId,
                TURNO,
                "{}",
                EstadoDelEvento.EXPLICADO,
                5,
                "el origen no contesta",
                MOMENTO,
                null,
                "Se registro a mano en rentas con el memorando 014-2026-TES");
    }

    private static Observacion porQue() {
        return Observacion.de("cierre del turno de la prueba");
    }
}
