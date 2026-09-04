package kamayuk.caja.caja.dominio;

/**
 * En que esta una orden de cobro. Los tres valores de {@code orden_estado_ck} (V2).
 *
 * <p>No hay «VENCIDA»: que una orden sea exigible desde una fecha no la cambia de estado, y
 * derivarlo aqui obligaria a un proceso que recorriera la tabla cada dia para escribir una palabra
 * que ya se puede leer comparando {@code fechaExigibilidad} con la fecha de la pregunta. Es la
 * misma decision que #397 tomo con el estado de la infraccion administrativa: se deriva, no se
 * guarda, porque dos verdades sobre la misma fila acaban divergiendo.
 */
public enum EstadoDeOrden {
    /** Se puede cobrar. Es el unico estado desde el que {@code CobrarOrdenes} acepta una orden. */
    PENDIENTE,
    /** Se cobro, y la fila nombra el recibo que lo prueba ({@code orden_recibo_ck}). */
    PAGADA,
    /**
     * El sistema de origen la retiro antes de cobrarse.
     *
     * <p>No es lo mismo que anular el recibo: eso deja la orden otra vez {@link #PENDIENTE}, porque
     * el dinero volvio y la deuda sigue. Aqui es el origen el que dice que ya no hay que cobrar.
     */
    ANULADA
}
