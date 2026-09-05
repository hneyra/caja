package kamayuk.caja.nucleo.aplicacion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import kamayuk.caja.auditoria.RegistroDeAuditoria;
import kamayuk.caja.documentos.FormatoDeDocumento;
import kamayuk.caja.documentos.GeneradorDeDocumentos;
import kamayuk.caja.documentos.ModeloDeDocumento;
import kamayuk.caja.documentos.RegimenDeLaInstalacion;
import kamayuk.caja.documentos.RenderizadorPdf;
import kamayuk.caja.documentos.RenderizadorRtf;
import kamayuk.caja.documentos.RenderizadorXls;
import kamayuk.caja.dominio.Dinero;
import kamayuk.caja.dominio.Observacion;
import kamayuk.caja.nucleo.dobles.BuzonEnMemoria;
import kamayuk.caja.nucleo.dobles.CajasEnMemoria;
import kamayuk.caja.nucleo.dobles.MovimientosEnMemoria;
import kamayuk.caja.nucleo.dobles.OrdenesEnMemoria;
import kamayuk.caja.nucleo.dobles.RecibosEnMemoria;
import kamayuk.caja.nucleo.dobles.TasasEnMemoria;
import kamayuk.caja.nucleo.dobles.TurnosEnMemoria;
import kamayuk.caja.nucleo.dominio.Caja;
import kamayuk.caja.nucleo.dominio.EstadoDeOrden;
import kamayuk.caja.nucleo.dominio.EventoDePago;
import kamayuk.caja.nucleo.dominio.FormaDePago;
import kamayuk.caja.nucleo.dominio.LineaDeTasaPedida;
import kamayuk.caja.nucleo.dominio.MovimientoDeRecibo;
import kamayuk.caja.nucleo.dominio.MovimientoDeReciboRepository;
import kamayuk.caja.nucleo.dominio.NumeroDeRecibo;
import kamayuk.caja.nucleo.dominio.OrdenDeCobro;
import kamayuk.caja.nucleo.dominio.Pagador;
import kamayuk.caja.nucleo.dominio.Recibo;
import kamayuk.caja.nucleo.dominio.SistemaDeOrigen;
import kamayuk.caja.nucleo.dominio.Tasa;
import kamayuk.caja.nucleo.dominio.TipoDeEventoDePago;
import kamayuk.caja.nucleo.dominio.TipoDeMovimientoDeRecibo;
import kamayuk.caja.nucleo.dominio.TipoDePago;
import kamayuk.caja.nucleo.infraestructura.ComponedorDeEventosJson;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

/**
 * #34 — Las decisiones de anular y de duplicar, sin base de datos.
 *
 * <h2>Que cambio con P5D</h2>
 *
 * <p>Anular <b>ya no reversa asientos</b>: el libro de cuenta corriente vive en otra base
 * (ADR-0026). Lo que hace ahora son dos cosas que se comprueban aqui por separado: devuelve las
 * ordenes cobradas a {@code PENDIENTE} —no a {@code ANULADA}, porque el dinero volvio y la deuda
 * sigue— y deja en el buzon un {@code PAGO_ANULADO} que <b>nombra el pago que deshace</b>. Ese
 * nombre es lo unico con lo que el sistema de origen puede encontrar los asientos que escribio:
 * mandarle el numero del papel le pediria analizar texto.
 *
 * <p>Todo lo demas sigue igual y sigue probandose: el mismo dia, el turno abierto, no anular dos
 * veces, el duplicado y su sha256. La concurrencia, el indice unico y los privilegios los prueba
 * {@code ReciboJdbcTest} contra PostgreSQL, porque contra un doble no se pueden demostrar.
 *
 * <p>El generador de documentos <b>si es el de verdad</b>, y el componedor de eventos tambien: los
 * tres renderizadores y el JSON del evento, sin base y sin reloj. Es lo que deja comprobar byte a
 * byte que la reimpresion de dentro de seis meses sale igual —que es el requisito— y leer del
 * cuerpo del evento el {@code pagoOriginalId}, que ningun campo de {@link EventoDePago} publica.
 */
@DisplayName("#34 — Duplicado y anulacion de recibo")
class AnularYDuplicarTest {

    private static final LocalDate HOY = LocalDate.of(2026, 3, 15);
    private static final LocalDate MANIANA = HOY.plusDays(1);

    private static final Caja CAJA = new Caja(1L, "C-01", "Caja tributaria", "001", null, true);
    private static final SistemaDeOrigen RENTAS = SistemaDeOrigen.de("rentas");

    /** Quien paga, tal como la caja lo conoce desde P5D: sin padron detras. */
    private static final Pagador PAGADOR = new Pagador("12345678", "SANTOS RIVERA, ELENA", 7L);

    private static Clock relojDe(LocalDate dia) {
        return Clock.fixed(dia.atStartOfDay(ZoneOffset.UTC).toInstant(), ZoneOffset.UTC);
    }

    private final CajasEnMemoria cajas = new CajasEnMemoria().con(CAJA);
    private final TurnosEnMemoria turnos = new TurnosEnMemoria();
    private final RecibosEnMemoria recibos = new RecibosEnMemoria();
    private final MovimientosEnMemoria movimientos = new MovimientosEnMemoria();
    private final OrdenesEnMemoria ordenes = new OrdenesEnMemoria();
    private final BuzonEnMemoria buzon = new BuzonEnMemoria();
    private final TasasEnMemoria tasas = new TasasEnMemoria();

    /** El componedor de verdad: el cuerpo del evento se lee, no se supone. */
    private static final CobrarOrdenes.ComponedorDeEventos EVENTOS =
            new ComponedorDeEventosJson(new JsonMapper());

    private static final GeneradorDeDocumentos GENERADOR = generador(RegimenDeLaInstalacion.REAL);

    private static GeneradorDeDocumentos generador(RegimenDeLaInstalacion regimen) {
        return new GeneradorDeDocumentos(
                List.of(new RenderizadorPdf(), new RenderizadorXls(), new RenderizadorRtf()),
                regimen);
    }

    /** Para que dos ordenes de la misma prueba no choquen con {@code orden_referencia_uq}. */
    private int siguienteReferencia = 1;

    // ------------------------------------------------------------------

    @Nested
    @DisplayName("AC 1 — Anular deshace el cobro y avisa al sistema de origen")
    class DeLaAnulacion {

        @Test
        @DisplayName("la orden vuelve a PENDIENTE y el recibo conserva su numero")
        void laOrdenVuelveYElReciboSigue() {
            Cobro cobrado = cobrar(Dinero.de("300.00"));

            AnularRecibo.Anulado anulado = anular(cobrado.recibo(), HOY);

            assertThat(ordenes.porId(cobrado.ordenId()).orElseThrow().estado())
                    .as(
                            "vuelve a PENDIENTE y no a ANULADA: el dinero volvio y la deuda sigue,"
                                    + " asi que tiene que poder cobrarse otra vez")
                    .isEqualTo(EstadoDeOrden.PENDIENTE);
            assertThat(ordenes.porId(cobrado.ordenId()).orElseThrow().reciboId())
                    .as("y deja de nombrar el recibo que la cobraba (orden_recibo_ck)")
                    .isNull();
            assertThat(anulado.recibo().numero())
                    .as("el recibo no desaparece ni cambia de numero: el papel sigue por ahi")
                    .isEqualTo(cobrado.recibo().numero());
            assertThat(anulado.recibo().total()).isEqualTo(Dinero.de("300.00"));
            assertThat(anulado.anulacion().importeReversado())
                    .as("y el acta congela lo que deja de estar cobrado")
                    .isEqualTo(Dinero.de("300.00"));
        }

        @Test
        @DisplayName("el evento de anulacion nombra el pago que deshace, no el numero del papel")
        void laAnulacionNombraElPagoQueDeshace() {
            Cobro cobrado = cobrar(Dinero.de("120.00"));
            UUID pagoOriginal = cobrado.pagoId();

            AnularRecibo.Anulado anulado = anular(cobrado.recibo(), HOY);

            assertThat(buzon.deTipo(TipoDeEventoDePago.PAGO_ANULADO))
                    .as("una anulacion, un evento")
                    .singleElement()
                    .satisfies(
                            evento -> {
                                assertThat(evento.eventoId()).isEqualTo(anulado.pagoAnuladoId());
                                assertThat(evento.reciboId()).isEqualTo(cobrado.recibo().id());
                                assertThat(evento.sistemaDestino()).isEqualTo(RENTAS);
                                assertThat(evento.cuerpo())
                                        .as(
                                                "el pago que se deshace viaja por identificador: el"
                                                        + " numero del papel es texto y obligaria al"
                                                        + " receptor a analizarlo")
                                        .contains("\"pagoOriginalId\":\"" + pagoOriginal + "\"")
                                        .contains("\"total\":\"120.00\"");
                            });
        }

        @Test
        @DisplayName("el movimiento lleva la caja y el turno DEL RECIBO, para el arqueo de #36")
        void elMovimientoLlevaElTurnoDelRecibo() {
            Cobro cobrado = cobrar(Dinero.de("80.00"));

            MovimientoDeRecibo anulacion = anular(cobrado.recibo(), HOY).anulacion();

            assertThat(anulacion.cajaId()).isEqualTo(cobrado.recibo().cajaId());
            assertThat(anulacion.turnoId())
                    .as("el dinero sale del cajon en el que entro")
                    .isEqualTo(cobrado.recibo().turnoId());
            assertThat(anulacion.tipo()).isEqualTo(TipoDeMovimientoDeRecibo.ANULACION);
        }

        @Test
        @DisplayName("un recibo de ayer no se anula: lo que corresponde es una devolucion")
        void elReciboDeAyerNoSeAnula() {
            Cobro cobrado = cobrar(Dinero.de("50.00"));

            assertThatThrownBy(() -> anular(cobrado.recibo(), MANIANA))
                    .isInstanceOf(AnularRecibo.FueraDelDiaDePago.class)
                    .hasMessageContaining("mismo dia del pago")
                    .hasMessageContaining("devolucion");
            assertThat(ordenes.porId(cobrado.ordenId()).orElseThrow().estado())
                    .as("y nada se deshizo: la orden sigue cobrada")
                    .isEqualTo(EstadoDeOrden.PAGADA);
            assertThat(movimientos.registrados()).isEmpty();
            assertThat(buzon.deTipo(TipoDeEventoDePago.PAGO_ANULADO)).isEmpty();
        }

        @Test
        @DisplayName("anular dos veces no manda dos anulaciones")
        void anularDosVecesNoAnulaDosVeces() {
            Cobro cobrado = cobrar(Dinero.de("200.00"));
            anular(cobrado.recibo(), HOY);

            assertThatThrownBy(() -> anular(cobrado.recibo(), HOY))
                    .isInstanceOf(MovimientoDeReciboRepository.ReciboYaAnulado.class);
            assertThat(buzon.deTipo(TipoDeEventoDePago.PAGO_ANULADO))
                    .as(
                            "un solo evento: dos dejarian al sistema de origen reversando dos veces"
                                    + " el mismo pago, y al contribuyente debiendo el doble")
                    .hasSize(1);
        }

        @Test
        @DisplayName("un recibo de tasas se anula sin avisar a nadie")
        void elReciboDeTasasNoAvisaANadie() {
            Recibo cobrado = cobrarTasa();

            AnularRecibo.Anulado anulado = anular(cobrado, HOY);

            assertThat(anulado.pagoAnuladoId())
                    .as(
                            "un derecho del TUPA lo emitio esta misma caja: no hay sistema de"
                                    + " origen al que pedirle que deshaga nada")
                    .isNull();
            assertThat(buzon.encolados()).isEmpty();
            assertThat(anulado.anulacion().importeReversado())
                    .as("pero del cajon sale igual, y el arqueo lo tiene que restar")
                    .isEqualTo(cobrado.total());
        }

        @Test
        @DisplayName("un recibo que no es de tasas y no tiene evento de cobro NO se anula")
        void sinEventoDeCobroNoSeAnula() {
            // Lo que en produccion seria un recibo escrito por fuera del caso de uso. Anularlo
            // mandaria al sistema de origen una reversion de un pago que no conoce.
            Recibo huerfano = emitirSinEvento();

            assertThatThrownBy(() -> anular(huerfano, HOY))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("no tiene evento de cobro")
                    .hasMessageContaining("deshacer algo que no hizo");
        }

        @Test
        @DisplayName("sin motivo no se anula")
        void sinMotivoNoSeAnula() {
            Cobro cobrado = cobrar(Dinero.de("40.00"));

            assertThatThrownBy(
                            () ->
                                    new AnularRecibo.Anulacion(
                                            cobrado.recibo().numero(), "   ", null, null))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("sustento");
        }

        @Test
        @DisplayName("el turno ya cerrado no admite anulaciones: su arqueo esta firmado")
        void elTurnoCerradoNoAdmiteAnulaciones() {
            Cobro cobrado = cobrar(Dinero.de("60.00"));
            turnos.cerrar(cobrado.recibo().turnoId());

            assertThatThrownBy(() -> anular(cobrado.recibo(), HOY))
                    .isInstanceOf(AnularRecibo.TurnoYaCerrado.class)
                    .hasMessageContaining("arqueo");
        }
    }

    @Nested
    @DisplayName("AC 2 — El duplicado sale de lo congelado")
    class DelDuplicado {

        @Test
        @DisplayName("seis meses despues, y con la ventanilla movida, sale byte a byte igual")
        void seisMesesDespuesSaleIgual() {
            Recibo cobrado = cobrar(Dinero.de("250.00")).recibo();

            byte[] enMarzo = duplicadoDe(cobrado, HOY).contenido();

            // El mundo sigue: la misma ventanilla cobra otra orden, por otro importe, y han
            // pasado seis meses. Nada de eso puede cambiar el papel, porque el papel no se
            // recalcula: sale del desglose que la cobranza congelo.
            cobrar(Dinero.de("999.99"));
            byte[] enSetiembre = duplicadoDe(cobrado, HOY.plusMonths(6)).contenido();

            // Las dos lineas de fecha enteras, no una subcadena suelta: el instante de
            // emision tambien contiene «2026-03-15», asi que buscar solo eso dejaria pasar
            // un aLaFecha resuelto con el reloj del dia de la reimpresion.
            assertThat(texto(enSetiembre, FormatoDeDocumento.PDF))
                    .as("y la fecha del papel sigue siendo la del cobro, no la de hoy (regla 9)")
                    .contains("Datos al " + HOY)
                    .contains("Importes actualizados al " + HOY)
                    .doesNotContain("999.99");
            // Se comparan quitando la marca de duplicado, que si cambia: el primero es el
            // N.° 1 y el segundo el N.° 2. Todo lo demas -cada cifra y todo el desglose-
            // tiene que ser identico.
            assertThat(sinLaMarca(enSetiembre))
                    .as("dibujar lo congelado seis meses despues da los mismos bytes")
                    .isEqualTo(sinLaMarca(enMarzo));
        }

        @Test
        @DisplayName("va marcado como duplicado, y numerado")
        void vaMarcadoYNumerado() {
            Recibo cobrado = cobrar(Dinero.de("70.00")).recibo();

            DuplicadoDeRecibo.Duplicado primero = duplicadoDe(cobrado, HOY);
            DuplicadoDeRecibo.Duplicado segundo = duplicadoDe(cobrado, HOY);

            assertThat(primero.cual()).isEqualTo(1);
            assertThat(segundo.cual()).isEqualTo(2);
            assertThat(texto(primero.contenido(), FormatoDeDocumento.PDF))
                    .as("uno sin marcar circula como si fuera el original")
                    .contains("DUPLICADO N");
            assertThat(movimientos.registrados())
                    .as("y cada reimpresion deja su rastro con quien la genero")
                    .hasSize(2);
        }

        @Test
        @DisplayName("si el recibo esta anulado, el duplicado lo dice")
        void elDuplicadoDiceQueEstaAnulado() {
            Recibo cobrado = cobrar(Dinero.de("90.00")).recibo();
            anular(cobrado, HOY);

            String papel = texto(duplicadoDe(cobrado, HOY).contenido(), FormatoDeDocumento.PDF);

            assertThat(papel)
                    .as("quien tenga el papel tiene que poder saber que ya no acredita pago")
                    .contains("RECIBO ANULADO")
                    .contains("ERROR EN EL IMPORTE");
        }

        @Test
        @DisplayName("la vista previa no emite nada: mirar no es reimprimir")
        void laVistaPreviaNoEmite() {
            Recibo cobrado = cobrar(Dinero.de("30.00")).recibo();

            DuplicadoDeRecibo.Consultado visto =
                    duplicados(HOY).consultar(cobrado.numero()).orElseThrow();

            assertThat(visto.estaAnulado()).isFalse();
            assertThat(visto.duplicados()).isZero();
            assertThat(movimientos.registrados())
                    .as("numerar un duplicado por abrir la pantalla llenaria la bitacora")
                    .isEmpty();
        }

        @Test
        @DisplayName("si lo congelado ya no se dibuja igual, el segundo duplicado falla")
        void siYaNoSeDibujaIgualFalla() {
            Recibo cobrado = cobrar(Dinero.de("45.00")).recibo();

            // Lo que en produccion seria un cambio del renderizador o del modelo: un primer
            // duplicado que se dibujo distinto de como se dibuja ahora.
            movimientos.conDuplicadoDeResumen(
                    cobrado.id(), HOY, cobrado.cajaId(), cobrado.turnoId(), "f".repeat(64));

            assertThatThrownBy(() -> duplicadoDe(cobrado, HOY))
                    .isInstanceOf(DuplicadoDeRecibo.LaReimpresionNoCoincide.class)
                    .hasMessageContaining("papel distinto al original");
        }

        @Test
        @DisplayName("bajo demostracion, el duplicado sale marcado como tal")
        void bajoDemostracionVaMarcado() {
            Recibo cobrado = cobrar(Dinero.de("20.00")).recibo();

            DuplicadoDeRecibo deMarchaBlanca =
                    new DuplicadoDeRecibo(
                            recibos,
                            movimientos,
                            generador(RegimenDeLaInstalacion.DEMOSTRACION),
                            (RegistroDeAuditoria registro) -> {},
                            relojDe(HOY));

            String papel =
                    texto(
                            deMarchaBlanca
                                    .imprimir(
                                            cobrado.numero(),
                                            FormatoDeDocumento.PDF,
                                            Observacion.de("Duplicado pedido en ventanilla"))
                                    .contenido(),
                            FormatoDeDocumento.PDF);

            assertThat(papel)
                    .as("un recibo de la marcha blanca sin marca es un papel que alguien cobra")
                    .contains(ModeloDeDocumento.MARCA_DE_DEMOSTRACION);
        }
    }

    // ------------------------------------------------------------------
    // Utilidades
    // ------------------------------------------------------------------

    /** Lo que un cobro deja detras, y que las pruebas necesitan mirar por separado. */
    private record Cobro(Recibo recibo, long ordenId, UUID pagoId) {}

    private Cobro cobrar(Dinero monto) {
        OrdenDeCobro orden =
                ordenes.con(
                        OrdenDeCobro.nueva(
                                RENTAS,
                                "REF-" + siguienteReferencia++,
                                "IMPUESTO PREDIAL 2026",
                                null,
                                monto,
                                HOY,
                                HOY,
                                PAGADOR,
                                MOMENTO,
                                Observacion.de("Orden emitida por rentas, prueba de #34")));
        CobrarOrdenes.Cobrado cobrado =
                new CobrarOrdenes(
                                abrirCaja(),
                                ordenes,
                                recibos,
                                buzon,
                                EVENTOS,
                                (RegistroDeAuditoria registro) -> {},
                                relojDe(HOY))
                        .cobrar(
                                new CobrarOrdenes.Cobranza(
                                        "C-01",
                                        "cajero.prueba",
                                        List.of(orden.idGuardado()),
                                        FormaDePago.EFECTIVO,
                                        HOY,
                                        null),
                                Observacion.de("Cobranza en ventanilla, prueba de #34"));
        return new Cobro(
                cobrado.recibo(),
                orden.idGuardado(),
                java.util.Objects.requireNonNull(cobrado.pagoId()));
    }

    private Recibo cobrarTasa() {
        tasas.con(
                new Tasa(
                        9L,
                        "T-100",
                        "Derecho de tramite",
                        3L,
                        "1.3.1.1.1.1",
                        Dinero.de("12.50"),
                        LocalDate.of(2026, 1, 1),
                        null,
                        "TUPA 2026 de la prueba"));
        return new CobrarTasa(
                        abrirCaja(),
                        tasas,
                        recibos,
                        (RegistroDeAuditoria registro) -> {},
                        relojDe(HOY))
                .cobrar(
                        new CobrarTasa.CobroDeTasas(
                                "C-01",
                                "cajero.prueba",
                                PAGADOR,
                                List.of(new LineaDeTasaPedida("T-100", 2)),
                                FormaDePago.EFECTIVO,
                                HOY,
                                null),
                        Observacion.de("Cobro de tasas, prueba de #34"));
    }

    /**
     * Un recibo NORMAL emitido por fuera del caso de uso, sin su evento en el buzon.
     *
     * <p>Es el unico modo de llegar al estado que {@link AnularRecibo} rechaza, y llegar a el
     * importa: es la diferencia entre «este recibo no avisa a nadie porque es de tasas» y «este
     * recibo deberia haber avisado y no hay a quien».
     */
    private Recibo emitirSinEvento() {
        Caja caja = cajas.porCodigo("C-01").orElseThrow();
        NumeroDeRecibo numero = recibos.siguienteNumero(caja);
        turnos.conTurnoAbierto(99L, 1L, "cajero.prueba", HOY);
        return recibos.emitir(
                new Recibo(
                        null,
                        numero,
                        1L,
                        99L,
                        "cajero.prueba",
                        PAGADOR,
                        MOMENTO,
                        FormaDePago.EFECTIVO,
                        TipoDePago.NORMAL,
                        null,
                        HOY,
                        Observacion.de("Recibo sin evento, escrito a mano por la prueba"),
                        List.of(
                                new kamayuk.caja.nucleo.dominio.LineaDeRecibo(
                                        "RENTAS",
                                        "IMPUESTO PREDIAL 2026",
                                        null,
                                        null,
                                        null,
                                        null,
                                        null,
                                        "REF-HUERFANA",
                                        null,
                                        null,
                                        null,
                                        Dinero.de("10.00"),
                                        Dinero.CERO,
                                        Dinero.CERO,
                                        Dinero.CERO))),
                null);
    }

    private AbrirCaja abrirCaja() {
        return new AbrirCaja(cajas, turnos, (RegistroDeAuditoria registro) -> {}, relojDe(HOY));
    }

    private AnularRecibo.Anulado anular(Recibo recibo, LocalDate dia) {
        AnularRecibo anular =
                new AnularRecibo(
                        recibos,
                        movimientos,
                        turnos,
                        ordenes,
                        buzon,
                        EVENTOS,
                        (RegistroDeAuditoria registro) -> {},
                        relojDe(dia));
        return anular.anular(
                new AnularRecibo.Anulacion(
                        recibo.numero(),
                        "ERROR EN EL IMPORTE",
                        "RESPONSABLE DE TESORERIA",
                        "MEMO-2026-001"),
                Observacion.de("Se cobro de mas por error del cajero"));
    }

    private DuplicadoDeRecibo duplicados(LocalDate dia) {
        return new DuplicadoDeRecibo(
                recibos,
                movimientos,
                GENERADOR,
                (RegistroDeAuditoria registro) -> {},
                relojDe(dia));
    }

    private DuplicadoDeRecibo.Duplicado duplicadoDe(Recibo recibo, LocalDate dia) {
        return duplicados(dia)
                .imprimir(
                        recibo.numero(),
                        FormatoDeDocumento.PDF,
                        Observacion.de("Duplicado pedido en ventanilla"));
    }

    /**
     * El documento sin la marca de duplicado, para poder comparar dos reimpresiones.
     *
     * <p>La marca cambia entre la primera y la segunda —{@code N.° 1} y {@code N.° 2}— y tiene que
     * cambiar. Lo que no puede cambiar es nada mas, y eso es lo que se compara.
     */
    private static String sinLaMarca(byte[] documento) {
        return texto(documento, FormatoDeDocumento.PDF)
                .replaceAll("DUPLICADO N[^\\n)]*", "DUPLICADO")
                .replaceAll("/Length [0-9]+", "/Length")
                .replaceAll("(?s)xref.*", "");
    }

    /**
     * Los bytes como texto.
     *
     * <p>El PDF se lee en {@code windows-1252} y no en UTF-8 porque es lo que declara su fuente
     * ({@code /WinAnsiEncoding}): leerlo de otro modo convierte la raya del titulo en basura y una
     * prueba que busque la marca se pondria roja sin que nada este mal.
     */
    private static String texto(byte[] documento, FormatoDeDocumento formato) {
        return new String(
                documento,
                formato == FormatoDeDocumento.PDF
                        ? java.nio.charset.Charset.forName("windows-1252")
                        : StandardCharsets.UTF_8);
    }

    /** El instante fijo del reloj. */
    static final Instant MOMENTO = HOY.atStartOfDay(ZoneOffset.UTC).toInstant();
}
