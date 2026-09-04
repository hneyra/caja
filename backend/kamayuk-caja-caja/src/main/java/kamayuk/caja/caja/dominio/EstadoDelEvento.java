package kamayuk.caja.caja.dominio;

/**
 * En que esta un evento del buzon de salida. Los cuatro valores de {@code pago_evento_estado_ck}.
 *
 * <p>Los cuatro son estados de <b>la entrega</b>, no del dinero: el dinero esta cobrado desde que
 * el recibo existe. Lo que estos dicen es si el sistema de origen ya se entero.
 */
public enum EstadoDelEvento {
    /**
     * Todavia no se entrego. <b>Es el «pago en transito» de ADR-0026 §4</b>, y su hora es {@code
     * creado_en}: quien mire la deuda en ese rato tiene que ver que hay un pago en camino, no un
     * saldo como si no hubiera pagado.
     */
    PENDIENTE,
    /** El sistema de origen lo recibio y lo acuso. Trae su hora. */
    ENTREGADO,
    /**
     * Se agotaron los intentos.
     *
     * <p><b>Esto es dinero cobrado sin registrar</b>, y por eso no se queda en un registro: dispara
     * alerta a una persona con nombre (ADR-0026 §4). Un turno con uno de estos NO CIERRA.
     */
    MUERTO,
    /**
     * Alguien se hizo cargo por escrito.
     *
     * <p>Es la unica salida de {@link #MUERTO} que no es entregarlo, y existe porque el cierre de
     * turno es bloqueante: sin ella, un evento que de verdad no se puede entregar dejaria la caja
     * sin poder cerrar para siempre. Lleva quien y por que ({@code pago_evento_explicacion_ck}), de
     * modo que «explicado» no pueda significar «lo apague».
     */
    EXPLICADO;

    /** Si este estado deja cerrar el turno (ADR-0026 §4: «aplicados o explicados uno por uno»). */
    public boolean permiteCerrarElTurno() {
        return this == ENTREGADO || this == EXPLICADO;
    }
}
