package kamayuk.caja.nucleo.aplicacion;

import java.time.Clock;
import java.time.LocalDate;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import kamayuk.caja.auditoria.Auditoria;
import kamayuk.caja.auditoria.Operacion;
import kamayuk.caja.auditoria.RegistroDeAuditoria;
import kamayuk.caja.dominio.Dinero;
import kamayuk.caja.dominio.Observacion;
import kamayuk.caja.nucleo.dominio.BuzonDeSalida;
import kamayuk.caja.nucleo.dominio.EventoDePago;
import kamayuk.caja.nucleo.dominio.MovimientoDeRecibo;
import kamayuk.caja.nucleo.dominio.MovimientoDeReciboRepository;
import kamayuk.caja.nucleo.dominio.NumeroDeRecibo;
import kamayuk.caja.nucleo.dominio.OrdenDeCobroRepository;
import kamayuk.caja.nucleo.dominio.Recibo;
import kamayuk.caja.nucleo.dominio.ReciboRepository;
import kamayuk.caja.nucleo.dominio.TipoDeEventoDePago;
import kamayuk.caja.nucleo.dominio.TipoDePago;
import kamayuk.caja.nucleo.dominio.TurnoDeCaja;
import kamayuk.caja.nucleo.dominio.TurnoDeCajaRepository;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Anula un recibo el mismo dia del pago y devuelve la deuda al libro (#34, RF-083).
 *
 * <h2>El recibo no se toca</h2>
 *
 * <p>V29 le retiro a {@code sgtm_app} el privilegio de {@code UPDATE} sobre {@code recibo}, y V30
 * retiro las columnas de anulacion que V3 le habia puesto —decian {@code EMITIDO} para siempre—.
 * Anular es <b>agregar</b> una fila a {@code recibo_movimiento}, igual que un pase a coactiva se
 * agrega a {@code valor_movimiento} (V28). El numero del recibo, su desglose y su total siguen
 * exactamente donde estaban: el contribuyente tiene ese papel en la mano.
 *
 * <h2>El mismo dia, y solo el mismo dia</h2>
 *
 * <p>Un recibo de ayer ya cuadro en el arqueo de ayer y ese dinero ya se deposito. Anularlo hoy
 * dejaria un cierre firmado diciendo una cifra y la caja otra. Lo que corresponde entonces es una
 * <b>devolucion</b>, que es otro acto y otro issue: mueve dinero en lugar de deshacer el
 * movimiento.
 *
 * <p>La fecha del pago no se recalcula ni se lee del reloj de la peticion: es la del <b>turno</b>
 * contra el que se cobro. Es la misma que #36 usara para el arqueo, asi que las dos mitades del dia
 * no pueden discrepar.
 *
 * <h2>La deuda vuelve por el libro, no por una cifra escrita</h2>
 *
 * <p>{@link RegistroDeAbonos#reversarAbonos} asienta el opuesto de cada asiento que la cobranza
 * escribio, y {@code deudaActualizadaA(hoy)} vuelve a mostrar la deuda pendiente porque el neteo de
 * cargos contra abonos vuelve a dar lo que daba. Aqui no se calcula ni se escribe ninguna deuda:
 * este contexto asienta abonos y nunca determina (ARQ-01 §3.8), y deshacerlos es lo mismo al reves.
 *
 * <p>Y se comprueba: lo que la reversion devolvio tiene que ser, centimo a centimo, el total que el
 * recibo congelo. Si no lo fuera, alguien habria tocado el libro por otro camino con el mismo
 * documento de origen, y anular dejaria una deuda distinta de la que se cobro.
 *
 * <h2>Anular dos veces es imposible</h2>
 *
 * <p>{@code recibo_movimiento_anulacion_uq}, un indice unico parcial. La lectura previa de {@link
 * MovimientoDeReciboRepository#anulacionDe} esta para dar un mensaje util y para no reversar en
 * balde; la garantia es el indice, porque dos peticiones simultaneas pasan las dos por cualquier
 * comprobacion escrita en Java —y dos reversiones dejarian al contribuyente debiendo el doble de lo
 * que pago—.
 */
@Service
public class AnularRecibo {

    private final ReciboRepository recibos;
    private final MovimientoDeReciboRepository movimientos;
    private final TurnoDeCajaRepository turnos;
    private final OrdenDeCobroRepository ordenes;
    private final BuzonDeSalida buzon;
    private final CobrarOrdenes.ComponedorDeEventos eventos;
    private final Auditoria auditoria;
    private final Clock reloj;

    public AnularRecibo(
            ReciboRepository recibos,
            MovimientoDeReciboRepository movimientos,
            TurnoDeCajaRepository turnos,
            OrdenDeCobroRepository ordenes,
            BuzonDeSalida buzon,
            CobrarOrdenes.ComponedorDeEventos eventos,
            Auditoria auditoria,
            Clock reloj) {
        this.recibos = recibos;
        this.movimientos = movimientos;
        this.turnos = turnos;
        this.ordenes = ordenes;
        this.buzon = buzon;
        this.eventos = eventos;
        this.auditoria = auditoria;
        this.reloj = reloj;
    }

    /**
     * Anula el recibo y devuelve su acta.
     *
     * <p>La {@link Observacion} va en la firma y no dentro de {@link Anulacion}: la regla 10 exige
     * que se vea en el punto donde se escribe, y ArchUnit la comprueba mirando los parametros del
     * metodo transaccional. El {@code motivo} es <b>otra cosa</b> y va aparte: la observacion
     * explica la operacion a quien lea la bitacora, y el motivo es el sustento del acto
     * administrativo, que queda en el propio recibo y se imprime en su duplicado.
     *
     * @throws ReciboInexistente si no hay ningun recibo con ese numero en esta municipalidad
     * @throws FueraDelDiaDePago si el recibo no es del dia de hoy
     * @throws TurnoYaCerrado si el turno contra el que se cobro ya se cerro
     * @throws MovimientoDeReciboRepository.ReciboYaAnulado si ya estaba anulado
     */
    @Transactional
    public Anulado anular(Anulacion peticion, Observacion observacion) {
        Objects.requireNonNull(peticion, "No se anula sin peticion");
        Objects.requireNonNull(observacion, "Sin observacion no se guarda (regla 10, RNF-052)");

        Recibo recibo =
                recibos.porNumero(peticion.numero())
                        .orElseThrow(() -> new ReciboInexistente(peticion.numero()));
        long reciboId =
                Objects.requireNonNull(recibo.id(), "Un recibo leido trae su identificador");

        TurnoDeCaja turno =
                turnos.porId(recibo.turnoId())
                        .orElseThrow(
                                () ->
                                        new IllegalStateException(
                                                "El recibo "
                                                        + peticion.numero().impreso()
                                                        + " apunta a un turno que no existe; con"
                                                        + " recibo_turno_fk eso solo puede pasar"
                                                        + " sin contexto de tenant"));

        LocalDate hoy = LocalDate.now(reloj);
        if (!turno.fecha().equals(hoy)) {
            throw new FueraDelDiaDePago(peticion.numero(), turno.fecha(), hoy);
        }
        if (!turno.estaAbierto()) {
            throw new TurnoYaCerrado(peticion.numero(), turno.fecha());
        }
        movimientos
                .anulacionDe(reciboId)
                .ifPresent(
                        anterior -> {
                            throw new MovimientoDeReciboRepository.ReciboYaAnulado(
                                    "El recibo "
                                            + peticion.numero().impreso()
                                            + " ya se anulo el "
                                            + anterior.fecha()
                                            + ": la deuda que cobro ya volvio al libro",
                                    new IllegalStateException("anulacion " + anterior.id()));
                        });

        Dinero deLaCaja = recibo.total();

        // Las ordenes vuelven a PENDIENTE. NO se marcan ANULADAS: el dinero volvio y la
        // deuda sigue, asi que tienen que poder cobrarse otra vez. Marcarlas anuladas las
        // dejaria sin cobrar para siempre sin que nadie lo hubiera decidido.
        ordenes.devolverAPendiente(reciboId);

        MovimientoDeRecibo anulacion =
                movimientos.registrar(
                        MovimientoDeRecibo.anulacion(
                                recibo,
                                hoy,
                                peticion.motivo(),
                                peticion.autorizadoPor(),
                                peticion.documentoAutorizacion(),
                                deLaCaja,
                                observacion));

        // El evento de anulacion, EN LA MISMA TRANSACCION que el acta. El sistema de origen
        // lo recibe y REVERSA —nunca borra—: su libro es inmutable (ADR-0006) y `recibo` esta
        // en las tablas protegidas. Que este evento exista es la mitad del criterio 4 del
        // encargo; que el receptor reverse en vez de borrar es la otra, y la sostiene el
        // escaner de fuentes del repositorio de destino.
        @Nullable EventoDePago anulado = publicarLaAnulacion(recibo, anulacion, hoy, deLaCaja);

        auditoria.registrar(
                RegistroDeAuditoria.enLaFechaDe(
                                hoy,
                                "recibo_movimiento",
                                String.valueOf(anulacion.id()),
                                Operacion.ANULACION,
                                observacion)
                        .con(null, descripcion(recibo, anulacion, anulado)));

        return new Anulado(recibo, anulacion, anulado == null ? null : anulado.eventoId());
    }

    /**
     * Publica la anulacion al sistema que emitio las ordenes.
     *
     * <p>Un recibo de caja de TASAS no produce evento y devuelve {@code null}: el concepto era de
     * la propia caja, no hubo orden y no hay a quien avisarle. Mandarlo igualmente obligaria al
     * receptor a decidir que «no encuentro ese pago» es normal, y entonces no podria distinguir un
     * recibo de tasas de un pago que se perdio.
     *
     * <p>El {@code pagoOriginal} viaja dentro: el receptor reversa <b>los asientos de ese pago</b>,
     * y sin el identificador tendria que buscarlos por el numero del papel — que es texto y no una
     * clave.
     */
    private @Nullable EventoDePago publicarLaAnulacion(
            Recibo recibo, MovimientoDeRecibo anulacion, LocalDate hoy, Dinero total) {
        if (recibo.tipoDePago() == TipoDePago.TASA) {
            return null;
        }
        long reciboId = Objects.requireNonNull(recibo.id());
        Optional<EventoDePago> original =
                buzon.delRecibo(reciboId, TipoDeEventoDePago.PAGO_REGISTRADO);
        if (original.isEmpty()) {
            // Un recibo que no es de tasas y no tiene evento de cobro es un recibo que nunca
            // se publico. Anularlo mandando una reversion de un pago que el origen no conoce
            // le pediria deshacer algo que no hizo.
            throw new IllegalStateException(
                    "El recibo "
                            + recibo.numero().impreso()
                            + " no tiene evento de cobro en el buzon, y no es de tasas: no hay"
                            + " pago que reversar, y mandar una anulacion de un pago que el"
                            + " sistema de origen no conoce le pediria deshacer algo que no hizo");
        }
        EventoDePago pagoOriginal = original.get();
        UUID pagoId = UUID.randomUUID();
        return buzon.encolar(
                EventoDePago.nuevo(
                        pagoId,
                        TipoDeEventoDePago.PAGO_ANULADO,
                        pagoOriginal.sistemaDestino(),
                        reciboId,
                        recibo.turnoId(),
                        eventos.pagoAnulado(
                                pagoId,
                                pagoOriginal.eventoId(),
                                recibo,
                                anulacion.motivoDeLaAnulacion(),
                                hoy,
                                total),
                        reloj.instant()));
    }

    // ------------------------------------------------------------------

    /**
     * Como {@code CobrarDeuda} marca los asientos de una cobranza, y como se marcan los de su
     * reversion.
     *
     * <p>Los dos textos los compone {@link NumeroDeRecibo} desde #36: el cierre de caja tiene que
     * componer los mismos para cuadrar contra el libro, y dos definiciones del mismo texto en dos
     * capas es como el arqueo acabaria sin encontrar los asientos que busca.
     */
    static String documentoDeLaCobranza(NumeroDeRecibo numero) {
        return numero.documentoDeLaCobranza();
    }

    /** Ver {@link #documentoDeLaCobranza}. */
    static String documentoDeLaAnulacion(NumeroDeRecibo numero) {
        return numero.documentoDeLaAnulacion();
    }

    /** Sin datos personales: esto acaba en la columna JSON de la auditoria. */
    private static String descripcion(
            Recibo recibo, MovimientoDeRecibo anulacion, @Nullable EventoDePago anulado) {
        return "{\"numero\":\""
                + recibo.numero().impreso()
                + "\",\"motivo\":\""
                + anulacion.motivoDeLaAnulacion()
                + "\",\"importe\":"
                + anulacion.importeReversado().valor().toPlainString()
                + ",\"pagoAnuladoId\":"
                + (anulado == null ? "null" : "\"" + anulado.eventoId() + "\"")
                + ",\"fecha\":\""
                + anulacion.fecha()
                + "\"}";
    }

    /**
     * Lo que se pide anular.
     *
     * @param numero el recibo, por su numero impreso
     * @param motivo el sustento del acto; obligatorio (RNF-052)
     * @param autorizadoPor quien lo autorizo, si consta
     * @param documentoAutorizacion el memorando o la resolucion, si consta
     */
    public record Anulacion(
            NumeroDeRecibo numero,
            String motivo,
            @Nullable String autorizadoPor,
            @Nullable String documentoAutorizacion) {

        public Anulacion {
            Objects.requireNonNull(numero, "Se anula un recibo concreto, por su numero");
            Objects.requireNonNull(motivo, "Anular exige su motivo (RNF-052)");
            motivo = motivo.strip();
            if (motivo.isEmpty()) {
                throw new IllegalArgumentException(
                        "El motivo de la anulacion no puede estar vacio: es el sustento de dejar"
                                + " sin efecto un documento que el contribuyente tiene en la mano");
            }
        }
    }

    /**
     * El recibo anulado y su acta.
     *
     * @param recibo el recibo, intacto: su numero y su desglose siguen donde estaban
     * @param anulacion la fila que se agrego
     * @param pagoAnuladoId el identificador del evento con el que el sistema de origen reversara;
     *     nulo en caja de tasas, donde no hay a quien avisarle
     */
    public record Anulado(
            Recibo recibo, MovimientoDeRecibo anulacion, @Nullable UUID pagoAnuladoId) {}

    /** No hay ningun recibo con ese numero en esta municipalidad. */
    public static final class ReciboInexistente extends RuntimeException {

        @java.io.Serial private static final long serialVersionUID = 1L;

        ReciboInexistente(NumeroDeRecibo numero) {
            super("No hay ningun recibo " + numero.impreso() + " en esta municipalidad");
        }
    }

    /** El recibo no es de hoy: lo que corresponde es una devolucion, no una anulacion. */
    public static final class FueraDelDiaDePago extends RuntimeException {

        @java.io.Serial private static final long serialVersionUID = 1L;

        FueraDelDiaDePago(NumeroDeRecibo numero, LocalDate delPago, LocalDate hoy) {
            super(
                    "El recibo "
                            + numero.impreso()
                            + " se cobro el "
                            + delPago
                            + " y hoy es "
                            + hoy
                            + ": un recibo solo se anula el mismo dia del pago (RF-083). Ese dinero"
                            + " ya cuadro en el arqueo de su dia y ya se deposito; deshacerlo ahora"
                            + " dejaria un cierre firmado diciendo una cifra y la caja otra. Lo que"
                            + " corresponde es una devolucion");
        }
    }

    /** El turno contra el que se cobro ya se cerro: su arqueo esta firmado. */
    public static final class TurnoYaCerrado extends RuntimeException {

        @java.io.Serial private static final long serialVersionUID = 1L;

        TurnoYaCerrado(NumeroDeRecibo numero, LocalDate fecha) {
            super(
                    "El turno del "
                            + fecha
                            + " contra el que se cobro el recibo "
                            + numero.impreso()
                            + " ya se cerro: su arqueo esta firmado y anularlo ahora lo dejaria"
                            + " descuadrado");
        }
    }
}
