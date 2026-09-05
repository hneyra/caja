package kamayuk.caja.nucleo.infraestructura.web;

import kamayuk.caja.nucleo.aplicacion.CobrarOrdenes;
import org.jspecify.annotations.Nullable;

/**
 * Lo que la ventanilla devuelve al cobrar (ADR-0026 §3).
 *
 * <p>Es el recibo <b>y el estado del pago</b>, y las dos mitades importan. Hasta P5D bastaba el
 * recibo: el abono estaba asentado antes de que la respuesta saliera. Con la separacion, entre el
 * papel y el asiento hay una ventana, y el cliente tiene derecho a saber que existe: por eso el
 * {@code pagoId} y el {@code estadoDelPago} viajan en la respuesta del cobro y no hay que ir a
 * buscarlos.
 *
 * <p>{@code estadoDelPago} vale siempre {@code EN_TRANSITO} recien cobrado, y eso es correcto y no
 * un valor por omision: el evento se acaba de encolar y todavia no se entrego. Quien quiera saber
 * si ya llego pregunta por la conciliacion del dia.
 *
 * @param recibo el papel
 * @param pagoId el identificador con el que el sistema de origen deduplicara; nulo solo cuando se
 *     devolvio un recibo ya emitido por idempotencia y su evento no se encuentra —lo que solo puede
 *     pasar con un recibo de tasas, que no produce evento—
 * @param estadoDelPago {@code EN_TRANSITO} o {@code SIN_EVENTO} (caja de tasas)
 * @param emitido si se emitio de verdad, o se devolvio el de un intento anterior. Es lo que le dice
 *     al cliente que su reintento se reconocio, en vez de dejarle creer que cobro dos veces
 */
public record CobroResource(
        ReciboResource recibo, @Nullable String pagoId, String estadoDelPago, boolean emitido) {

    /** El estado del pago recien cobrado: hay evento en camino. */
    private static final String EN_TRANSITO = "EN_TRANSITO";

    /** No hay evento porque no hay a quien avisarle: es una tasa de la propia caja. */
    private static final String SIN_EVENTO = "SIN_EVENTO";

    public static CobroResource de(CobrarOrdenes.Cobrado cobrado) {
        return new CobroResource(
                ReciboResource.de(cobrado.recibo()),
                cobrado.pagoId() == null ? null : cobrado.pagoId().toString(),
                cobrado.pagoId() == null ? SIN_EVENTO : EN_TRANSITO,
                cobrado.emitido());
    }
}
