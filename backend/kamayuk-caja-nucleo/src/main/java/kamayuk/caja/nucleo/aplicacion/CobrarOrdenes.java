package kamayuk.caja.nucleo.aplicacion;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import kamayuk.caja.auditoria.Auditoria;
import kamayuk.caja.auditoria.Operacion;
import kamayuk.caja.auditoria.RegistroDeAuditoria;
import kamayuk.caja.dominio.Dinero;
import kamayuk.caja.dominio.Observacion;
import kamayuk.caja.nucleo.dominio.BuzonDeSalida;
import kamayuk.caja.nucleo.dominio.EstadoDeOrden;
import kamayuk.caja.nucleo.dominio.EventoDePago;
import kamayuk.caja.nucleo.dominio.FormaDePago;
import kamayuk.caja.nucleo.dominio.LineaDeRecibo;
import kamayuk.caja.nucleo.dominio.NumeroDeRecibo;
import kamayuk.caja.nucleo.dominio.OrdenDeCobro;
import kamayuk.caja.nucleo.dominio.OrdenDeCobroRepository;
import kamayuk.caja.nucleo.dominio.Pagador;
import kamayuk.caja.nucleo.dominio.Recibo;
import kamayuk.caja.nucleo.dominio.ReciboRepository;
import kamayuk.caja.nucleo.dominio.SistemaDeOrigen;
import kamayuk.caja.nucleo.dominio.TipoDeEventoDePago;
import kamayuk.caja.nucleo.dominio.TipoDePago;
import kamayuk.caja.nucleo.dominio.TurnoDeCaja;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * El acto de ventanilla: cobra una o varias ordenes y emite su recibo (ADR-0026 §3, COMMIT 1).
 *
 * <h2>Lo que este caso de uso YA NO hace, y es el corazon de P5D</h2>
 *
 * <p>Su antecesor —{@code CobrarDeuda} del monolito— hacia tres cosas ajenas entre si en una
 * transaccion: abria el turno y emitia el recibo (caja), <b>asentaba los abonos en el libro</b> y
 * <b>formalizaba el convenio</b> (rentas). Eso es el {@code COMMIT} que ADR-0026 §3 convierte en
 * dos.
 *
 * <p>Aqui queda el primero: <b>turno, correlativo, recibo, ordenes marcadas y el evento en el
 * buzon</b>, todo en una transaccion de esta base. Lo demas lo hace el sistema de origen al recibir
 * el {@code PagoRegistrado}, y <b>la imputacion es suya</b>: el orden del Codigo Tributario
 * —interes antes que insoluto, deuda mas antigua primero— no se escribe aqui, porque escrito dos
 * veces la que decide de verdad acaba siendo la que nadie recuerda que existe (ADR-0026 §2).
 *
 * <h2>Lo que se compra y lo que se paga</h2>
 *
 * <p>Se compra que <b>la ventanilla cobre aunque el sistema de origen este caido</b>, que es
 * exactamente lo que hace falta el ultimo dia de vencimiento. Se paga que entre los dos {@code
 * COMMIT} el saldo del administrado esta desactualizado: eso <b>se ve</b> —el evento esta {@code
 * PENDIENTE} con su hora— y la conciliacion diaria deja de ser buena practica.
 *
 * <h2>Cobrar dos veces sigue siendo imposible, con otras barreras</h2>
 *
 * <p>En el monolito eran tres y la tercera era que {@code RegistroDeAbonos} <b>reilea el libro</b>.
 * Aqui el libro no esta, asi que la tercera la sustituye la orden:
 *
 * <ol>
 *   <li>{@code recibo_idempotencia_uq}: el mismo intento reenviado devuelve el recibo de la primera
 *       vez, no emite otro;
 *   <li><b>las ordenes, bloqueadas con {@code FOR UPDATE}</b>: dos cobranzas de la misma orden se
 *       ordenan en el motor, y la segunda encuentra la fila ya {@code PAGADA};
 *   <li>{@code orden_recibo_ck}, en la base: una orden {@code PAGADA} nombra su recibo, asi que
 *       «cobrada» no es una palabra en una columna sino un hecho con papel.
 * </ol>
 *
 * <p><b>El turno ya NO se bloquea</b>, y por eso `V2` pudo hacer el {@code REVOKE UPDATE ON
 * cierre_caja} que `V32` del monolito intento y no pudo. Ver la cabecera de esa migracion.
 */
@Service
public class CobrarOrdenes {

    private final AbrirCaja abrirCaja;
    private final OrdenDeCobroRepository ordenes;
    private final ReciboRepository recibos;
    private final BuzonDeSalida buzon;
    private final ComponedorDeEventos eventos;
    private final Auditoria auditoria;
    private final Clock reloj;

    public CobrarOrdenes(
            AbrirCaja abrirCaja,
            OrdenDeCobroRepository ordenes,
            ReciboRepository recibos,
            BuzonDeSalida buzon,
            ComponedorDeEventos eventos,
            Auditoria auditoria,
            Clock reloj) {
        this.abrirCaja = abrirCaja;
        this.ordenes = ordenes;
        this.recibos = recibos;
        this.buzon = buzon;
        this.eventos = eventos;
        this.auditoria = auditoria;
        this.reloj = reloj;
    }

    /**
     * Cobra y emite.
     *
     * <p>La {@link Observacion} va en la firma y no dentro de {@link Cobranza}: la regla 10 exige
     * que se vea en el punto donde se escribe, y ArchUnit la comprueba mirando los parametros del
     * metodo transaccional. Escondida dentro de un objeto de peticion, la comprobacion no la
     * encuentra y la regla dejaria de proteger nada.
     *
     * @throws OrdenNoCobrable si alguna de las ordenes ya se cobro, se anulo, o todavia no es
     *     exigible
     * @throws OrdenesDeVariosSistemas si se marcan ordenes de sistemas distintos en un solo recibo
     */
    @Transactional
    public Cobrado cobrar(Cobranza peticion, Observacion observacion) {
        Objects.requireNonNull(peticion, "No se cobra sin peticion");
        Objects.requireNonNull(observacion, "Sin observacion no se guarda (regla 10, RNF-052)");

        // 1. La ventanilla. Ya NO se bloquea el turno: se abre si no estaba (V2 §5).
        AbrirCaja.Abierta abierta =
                abrirCaja.enLaCaja(
                        peticion.codigoDeCaja(),
                        peticion.cajero(),
                        peticion.fechaDePago(),
                        observacion);

        // 2. El reenvio del mismo intento: se devuelve lo que ya se emitio, sin cobrar otra vez.
        String clave = peticion.claveDeIdempotencia();
        if (clave != null) {
            Optional<Recibo> yaEmitido = recibos.porClaveDeIdempotencia(clave);
            if (yaEmitido.isPresent()) {
                Recibo emitido = yaEmitido.get();
                // Y con el, EL MISMO pagoId: devolver uno nuevo dejaria al cliente creyendo
                // que hubo dos pagos, que es justo lo que la idempotencia existe para evitar.
                return new Cobrado(
                        emitido,
                        buzon.delRecibo(
                                        Objects.requireNonNull(emitido.id()),
                                        TipoDeEventoDePago.PAGO_REGISTRADO)
                                .map(EventoDePago::eventoId)
                                .orElse(null),
                        false);
            }
        }

        // 3. Las ordenes, BLOQUEADAS. Aqui se serializa la ventanilla desde P5D.
        List<OrdenDeCobro> marcadas = ordenes.bloquear(peticion.ordenes());
        SistemaDeOrigen destino = unSoloSistema(marcadas);
        for (OrdenDeCobro orden : marcadas) {
            if (!orden.cobrableA(peticion.fechaDePago())) {
                throw new OrdenNoCobrable(orden, peticion.fechaDePago());
            }
        }

        // 4. El numero, antes de emitir. No deja huecos si algo falla despues, porque
        //    `recibo_correlativo` es una fila —no una secuencia— y su incremento se
        //    revierte con la transaccion.
        NumeroDeRecibo numero = recibos.siguienteNumero(abierta.caja());

        TurnoDeCaja turno = abierta.turno();
        Recibo recibo =
                new Recibo(
                        null,
                        numero,
                        Objects.requireNonNull(abierta.caja().id()),
                        turno.idGuardado(),
                        peticion.cajero(),
                        pagadorDe(marcadas),
                        reloj.instant(),
                        peticion.formaDePago(),
                        TipoDePago.NORMAL,
                        null,
                        peticion.fechaDePago(),
                        observacion,
                        lineasDe(marcadas));

        Recibo emitido = recibos.emitir(recibo, clave);
        long reciboId = Objects.requireNonNull(emitido.id(), "Un recibo emitido trae su id");
        ordenes.marcarPagadas(peticion.ordenes(), reciboId);

        // 5. El buzon, EN LA MISMA TRANSACCION. Si la fila esta, el recibo esta.
        UUID pagoId = UUID.randomUUID();
        EventoDePago evento =
                buzon.encolar(
                        EventoDePago.nuevo(
                                pagoId,
                                TipoDeEventoDePago.PAGO_REGISTRADO,
                                destino,
                                reciboId,
                                turno.idGuardado(),
                                eventos.pagoRegistrado(pagoId, emitido, marcadas),
                                reloj.instant()));

        auditar(emitido, evento, observacion);
        return new Cobrado(emitido, evento.eventoId(), true);
    }

    // ------------------------------------------------------------------

    /**
     * Un recibo cobra ordenes de UN solo sistema.
     *
     * <p>No es una limitacion tecnica: un recibo se anula entero, y anular uno que mezclara ordenes
     * de dos sistemas obligaria a mandar dos eventos de anulacion que podrian entregarse uno si y
     * otro no — o sea, dejar la mitad del dinero devuelto y la otra mitad no, sin que ninguna cifra
     * de la caja lo dijera. En ventanilla se cobra dos veces, que es lo que ya se hace hoy cuando
     * alguien paga su predial y su licencia.
     */
    private static SistemaDeOrigen unSoloSistema(List<OrdenDeCobro> marcadas) {
        SistemaDeOrigen primero = marcadas.get(0).sistemaOrigen();
        for (OrdenDeCobro orden : marcadas) {
            if (!orden.sistemaOrigen().equals(primero)) {
                throw new OrdenesDeVariosSistemas(primero, orden.sistemaOrigen());
            }
        }
        return primero;
    }

    /**
     * El pagador del recibo: el de las ordenes.
     *
     * <p>Si las ordenes marcadas traen pagadores distintos se toma el de la primera y <b>no se
     * inventa una mezcla</b>: es legitimo pagar la deuda de otro, y el papel dice a nombre de quien
     * salio la primera orden. Lo que no se hace es dejar el nombre en blanco, que se leeria como un
     * defecto de impresion (RNF-080).
     */
    private static Pagador pagadorDe(List<OrdenDeCobro> marcadas) {
        return marcadas.get(0).pagador();
    }

    private static List<LineaDeRecibo> lineasDe(List<OrdenDeCobro> marcadas) {
        List<LineaDeRecibo> lineas = new ArrayList<>(marcadas.size());
        for (OrdenDeCobro orden : marcadas) {
            lineas.add(orden.comoLineaDeRecibo());
        }
        return lineas;
    }

    private void auditar(Recibo recibo, EventoDePago evento, Observacion porQue) {
        auditoria.registrar(
                RegistroDeAuditoria.enLaFechaDe(
                                recibo.actualizadoA(),
                                "recibo",
                                String.valueOf(recibo.id()),
                                Operacion.ALTA,
                                porQue)
                        .con(null, descripcion(recibo, evento)));
    }

    /** Sin datos personales: esto acaba en la columna JSON de la auditoria. */
    private static String descripcion(Recibo recibo, EventoDePago evento) {
        return "{\"numero\":\""
                + recibo.numero().impreso()
                + "\",\"formaDePago\":\""
                + recibo.formaDePago()
                + "\",\"lineas\":"
                + recibo.lineas().size()
                + ",\"total\":\""
                + recibo.total().valor().toPlainString()
                + "\",\"pagoId\":\""
                + evento.eventoId()
                + "\",\"destino\":\""
                + evento.sistemaDestino()
                + "\",\"actualizadoA\":\""
                + recibo.actualizadoA()
                + "\"}";
    }

    // ------------------------------------------------------------------

    /**
     * Lo que el cajero marco.
     *
     * @param codigoDeCaja la ventanilla
     * @param cajero quien cobra
     * @param ordenes las ordenes marcadas en la grilla
     * @param formaDePago con que se paga
     * @param fechaDePago la fecha del cobro; entra como argumento (regla 6)
     * @param claveDeIdempotencia la cabecera {@code idempotency-key}, si vino
     */
    public record Cobranza(
            String codigoDeCaja,
            String cajero,
            List<Long> ordenes,
            FormaDePago formaDePago,
            LocalDate fechaDePago,
            @Nullable String claveDeIdempotencia) {

        public Cobranza {
            Objects.requireNonNull(codigoDeCaja, "La cobranza es de una caja");
            Objects.requireNonNull(cajero, "La cobranza la hace un cajero con nombre");
            Objects.requireNonNull(ordenes, "La lista es vacia, no nula");
            Objects.requireNonNull(formaDePago, "Hay que decir con que se paga");
            Objects.requireNonNull(fechaDePago, "La fecha de pago entra como argumento (regla 6)");
            ordenes = List.copyOf(ordenes);
            if (ordenes.isEmpty()) {
                throw new IllegalArgumentException(
                        "Hay que marcar al menos una orden: un recibo sin lineas no documenta"
                                + " nada");
            }
            // La grilla marca con casillas, asi que una orden repetida solo puede venir de un
            // cliente mal escrito -o de uno que lo intenta-. Cobrarla dos veces en el mismo
            // recibo la cobraria dos veces de verdad: son dos lineas del mismo importe.
            if (new LinkedHashSet<>(ordenes).size() != ordenes.size()) {
                throw new IllegalArgumentException(
                        "La misma orden viene marcada dos veces en el mismo recibo");
            }
        }
    }

    /**
     * Lo que sale de cobrar.
     *
     * @param recibo el papel
     * @param pagoId el identificador del evento con el que el sistema de origen deduplicara; nulo
     *     solo cuando se devolvio un recibo ya emitido por idempotencia
     * @param emitido si se emitio de verdad, o se devolvio el de un intento anterior
     */
    public record Cobrado(Recibo recibo, @Nullable UUID pagoId, boolean emitido) {}

    /** La orden marcada no se puede cobrar, y se dice cual de las tres cosas pasa. */
    public static final class OrdenNoCobrable extends RuntimeException {

        @java.io.Serial private static final long serialVersionUID = 1L;

        OrdenNoCobrable(OrdenDeCobro orden, LocalDate fechaDePago) {
            super(motivo(orden, fechaDePago));
        }

        private static String motivo(OrdenDeCobro orden, LocalDate fechaDePago) {
            String cabecera =
                    "La orden "
                            + orden.sistemaOrigen()
                            + "/"
                            + orden.referenciaExterna()
                            + " no se puede cobrar: ";
            if (orden.estado() == EstadoDeOrden.PAGADA) {
                return cabecera
                        + "ya se cobro con el recibo "
                        + orden.reciboId()
                        + ". Si ese recibo se anulo, la orden vuelve a PENDIENTE sola";
            }
            if (orden.estado() == EstadoDeOrden.ANULADA) {
                return cabecera
                        + "el sistema que la emitio la retiro. Eso no se arregla en ventanilla";
            }
            return cabecera
                    + "es exigible desde el "
                    + orden.fechaExigibilidad()
                    + " y se esta cobrando al "
                    + fechaDePago;
        }
    }

    /** Se marcaron ordenes de dos sistemas distintos en un solo recibo. */
    public static final class OrdenesDeVariosSistemas extends RuntimeException {

        @java.io.Serial private static final long serialVersionUID = 1L;

        OrdenesDeVariosSistemas(SistemaDeOrigen uno, SistemaDeOrigen otro) {
            super(
                    "Un recibo cobra ordenes de un solo sistema, y aqui hay de «"
                            + uno
                            + "» y de «"
                            + otro
                            + "». No es una limitacion tecnica: un recibo se anula ENTERO, y"
                            + " anular uno mezclado obligaria a mandar dos anulaciones que podrian"
                            + " entregarse una si y otra no — la mitad del dinero devuelto y la"
                            + " otra mitad no, sin que ninguna cifra de la caja lo dijera");
        }
    }

    /**
     * Compone el cuerpo de los eventos.
     *
     * <p>Es una interfaz y no una clase con Jackson dentro porque {@code aplicacion} no depende de
     * la serializacion: el cuerpo es una cadena congelada para este caso de uso, y quien sepa
     * escribirla vive en {@code infraestructura}.
     */
    public interface ComponedorDeEventos {

        String pagoRegistrado(UUID pagoId, Recibo recibo, List<OrdenDeCobro> ordenes);

        String pagoAnulado(
                UUID pagoId,
                UUID pagoOriginal,
                Recibo recibo,
                String motivo,
                LocalDate fecha,
                Dinero total);
    }
}
