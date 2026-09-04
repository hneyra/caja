package kamayuk.caja.caja.dominio;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Objects;
import kamayuk.caja.dominio.Dinero;
import kamayuk.caja.dominio.Observacion;
import org.jspecify.annotations.Nullable;

/**
 * Lo unico que la caja sabe cobrar (ADR-0026 §1).
 *
 * <h2>Lo que este tipo NO tiene, y por que</h2>
 *
 * <p>No tiene tributo, ni ejercicio, ni cuota, ni insoluto, ni interes, ni fase, ni predio, ni
 * vehiculo. <b>La caja no sabe que es un tributo.</b> Si esta clase ganara un campo {@code
 * ejercicio}, la caja dejaria de servir para cobrar un puesto de mercado —que es la razon entera de
 * la separacion— y el Codigo Tributario tendria dos sitios donde vivir.
 *
 * <p>Lo que si tiene es lo que hace falta para cobrar y para que el que la mando reconozca su pago:
 * de donde viene, como la llama alli, que dice el papel, cuanto, desde cuando se puede cobrar y a
 * que fecha esta esa cifra.
 *
 * <h2>La fecha no es una sola</h2>
 *
 * <p>{@link #fechaExigibilidad} es desde cuando se puede cobrar y {@link #actualizadoA} es a que
 * fecha esta el importe (regla 9, RNF-075). Una deuda exigible desde marzo puede venir actualizada
 * a hoy con su interes ya dentro; <b>la caja no recalcula nada</b>, imprime la cifra que le dieron
 * con la fecha que le dieron. Si recalculara, el sistema tendria dos verdades sobre lo que se debe
 * — que es exactamente lo que ARQ-01 §3.8 lleva prohibiendo desde el monolito.
 *
 * @param id el de esta base; nulo antes de guardarse
 * @param sistemaOrigen quien la mando
 * @param referenciaExterna como la reconoce quien la mando; <b>opaca</b> para la caja
 * @param concepto lo que se imprime en la linea del recibo
 * @param detalle lo que el origen quiera anadir; puede no haber
 * @param importe cuanto, a la fecha de {@link #actualizadoA}
 * @param fechaExigibilidad desde cuando se puede cobrar
 * @param actualizadoA a que fecha esta el importe (regla 9)
 * @param pagador quien paga, como la caja lo conoce
 * @param estado en que esta
 * @param reciboId el recibo que la cobro; solo si {@link EstadoDeOrden#PAGADA}
 * @param creadaEn cuando entro
 * @param observacion por que se dio de alta (regla 10, RNF-052)
 */
public record OrdenDeCobro(
        @Nullable Long id,
        SistemaDeOrigen sistemaOrigen,
        String referenciaExterna,
        String concepto,
        @Nullable String detalle,
        Dinero importe,
        LocalDate fechaExigibilidad,
        LocalDate actualizadoA,
        Pagador pagador,
        EstadoDeOrden estado,
        @Nullable Long reciboId,
        Instant creadaEn,
        Observacion observacion) {

    /** El largo de {@code orden_de_cobro.referencia_externa}. */
    private static final int LARGO_REFERENCIA = 120;

    /** El largo de {@code orden_de_cobro.concepto}. */
    private static final int LARGO_CONCEPTO = 120;

    public OrdenDeCobro {
        Objects.requireNonNull(sistemaOrigen, "Una orden dice de que sistema viene");
        Objects.requireNonNull(referenciaExterna, "Una orden dice como la llama quien la mando");
        Objects.requireNonNull(concepto, "Una orden dice que se imprime en el recibo");
        Objects.requireNonNull(importe, "Una orden dice cuanto se cobra");
        Objects.requireNonNull(fechaExigibilidad, "Una orden dice desde cuando se puede cobrar");
        Objects.requireNonNull(
                actualizadoA, "Toda cifra indica a que fecha esta (regla 9, RNF-075)");
        Objects.requireNonNull(pagador, "El pagador es anonimo, no nulo");
        Objects.requireNonNull(estado, "Una orden dice en que esta");
        Objects.requireNonNull(creadaEn, "Una orden dice cuando entro");
        Objects.requireNonNull(observacion, "Sin observacion no se guarda (regla 10, RNF-052)");

        referenciaExterna = referenciaExterna.strip();
        concepto = concepto.strip();
        if (referenciaExterna.isEmpty()) {
            throw new IllegalArgumentException(
                    "La referencia externa es la mitad de la clave con la que el alta es"
                            + " idempotente: vacia, dos altas del mismo cobro serian la misma"
                            + " orden y el sistema de origen no podria mandar dos");
        }
        if (referenciaExterna.length() > LARGO_REFERENCIA || concepto.length() > LARGO_CONCEPTO) {
            throw new IllegalArgumentException(
                    "La referencia externa o el concepto no caben en su columna");
        }
        if (concepto.isEmpty()) {
            throw new IllegalArgumentException(
                    "El concepto es lo unico que el administrado lee en su recibo: un recibo con la"
                            + " linea en blanco no documenta nada");
        }
        if (!importe.esPositivo()) {
            throw new IllegalArgumentException(
                    "Una orden de cobro por "
                            + importe.valor().toPlainString()
                            + " no cobra nada. Una deuda que quedo en cero no se manda a la caja:"
                            + " se cancela donde se lleva");
        }
        if (detalle != null && detalle.isBlank()) {
            detalle = null;
        }
        // orden_recibo_ck, en Java: «cobrada» no es una palabra en una columna, es un hecho con
        // papel. Sin esto, una orden podria decir PAGADA sin que exista el recibo que lo pruebe.
        if ((estado == EstadoDeOrden.PAGADA) != (reciboId != null)) {
            throw new IllegalArgumentException(
                    "Una orden PAGADA nombra el recibo que la cobro, y una que no lo esta no puede"
                            + " nombrar ninguno: estado="
                            + estado
                            + ", reciboId="
                            + reciboId);
        }
    }

    /** Un alta: nace pendiente y sin recibo. */
    public static OrdenDeCobro nueva(
            SistemaDeOrigen sistemaOrigen,
            String referenciaExterna,
            String concepto,
            @Nullable String detalle,
            Dinero importe,
            LocalDate fechaExigibilidad,
            LocalDate actualizadoA,
            Pagador pagador,
            Instant creadaEn,
            Observacion observacion) {
        return new OrdenDeCobro(
                null,
                sistemaOrigen,
                referenciaExterna,
                concepto,
                detalle,
                importe,
                fechaExigibilidad,
                actualizadoA,
                pagador,
                EstadoDeOrden.PENDIENTE,
                null,
                creadaEn,
                observacion);
    }

    /** El identificador de una orden ya guardada. */
    public long idGuardado() {
        return Objects.requireNonNull(id, "Una orden leida del repositorio trae su identificador");
    }

    /**
     * Si esta orden se puede cobrar a esa fecha.
     *
     * <p>Se deriva y no se guarda, por lo que {@link EstadoDeOrden} explica. La fecha entra como
     * argumento (regla 6): cobrar hoy una orden de manana y cobrarla manana tienen que dar
     * respuestas distintas sin que ninguna dependa del reloj de la maquina.
     */
    public boolean cobrableA(LocalDate fecha) {
        return estado == EstadoDeOrden.PENDIENTE && !fecha.isBefore(fechaExigibilidad);
    }

    /** La linea que esta orden pone en el recibo. */
    public LineaDeRecibo comoLineaDeRecibo() {
        return new LineaDeRecibo(
                sistemaOrigen.nombre().toUpperCase(java.util.Locale.ROOT),
                concepto,
                null,
                null,
                null,
                null,
                null,
                referenciaExterna,
                detalle,
                null,
                null,
                importe,
                Dinero.CERO,
                Dinero.CERO,
                Dinero.CERO);
    }
}
