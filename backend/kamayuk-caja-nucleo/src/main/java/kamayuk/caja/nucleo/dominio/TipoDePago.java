package kamayuk.caja.nucleo.dominio;

/**
 * Que clase de cobranza es: los cinco valores de {@code recibo_tipo_pago_check} (V3).
 *
 * <p>#33 escribio <b>dos</b> —{@link #NORMAL} en caja tributaria y {@link #TASA} en caja de tasas—
 * y #35 agrega el tercero, {@link #PRECONVENIO}: el cobro de la cuota inicial que formaliza un
 * convenio de fraccionamiento (RF-084).
 *
 * <p>Los otros dos siguen sin escribirse, y no por falta de tiempo: los dos son <b>pagos
 * parciales</b>, y decidir que parte de la deuda extingue un pago parcial es una <b>regla de
 * imputacion</b>. Esa regla es normativa —TUO del Codigo Tributario art. 31— y no esta transcrita
 * ni firmada; inventar un orden aqui produciria, en toda la cartera, una imputacion que ninguna
 * norma respalda.
 *
 * <ul>
 *   <li>{@link #A_CUENTA} es un pago parcial de deuda ordinaria. #33 lo declino y #35 no lo reabre.
 *   <li>{@link #CUOTA_CONVENIO} es un pago parcial de la deuda ya acogida a un convenio. #35 lo
 *       deja fuera <b>por decision, no por omision</b>: sin la regla de imputacion, cobrar una
 *       cuota no sabria que parte de la deuda en fase de convenio extingue. Y la decision se cierra
 *       sola: mientras la caja no admita este tipo, ninguna cuota se puede cobrar, y por tanto el
 *       quiebre nunca tiene que repartir un pago parcial —devuelve lo pendiente entero, que es
 *       exactamente lo acogido—.
 * </ul>
 *
 * <p>Aceptarlos y cobrarlos como si fueran {@link #NORMAL} seria peor que rechazarlos: el recibo
 * diria una cosa y el libro otra.
 */
public enum TipoDePago {
    NORMAL,
    A_CUENTA,
    PRECONVENIO,
    CUOTA_CONVENIO,
    TASA;

    /**
     * Si un recibo de esta clase produce un evento de pago que hay que entregar al sistema que
     * emitio la orden (ADR-0026 §3, #34). Es <b>la</b> definicion de «recibo que produce evento»
     * (#118): antes de unificarse aqui, la misma pregunta se contestaba tres veces por separado —
     * {@link kamayuk.caja.nucleo.aplicacion.AnularRecibo} con un {@code == TASA} escrito a mano,
     * {@link kamayuk.caja.nucleo.aplicacion.CobrarOrdenes} por construccion, sin comprobar nada
     * porque solo emite {@link #NORMAL}, y {@link
     * kamayuk.caja.nucleo.aplicacion.ArqueoDeTurno#cuadrar} leyendo lo que era {@code
     * abonaEnElLibro()} —un metodo distinto, del cierre contra el libro (#36), retirado en la ronda
     * 1 de #118 por quedarse sin llamador— como si dijera lo mismo.
     *
     * <p><b>Solo {@link #NORMAL} produce evento, y es exactamente lo que el codigo de hoy
     * encola.</b> {@link kamayuk.caja.nucleo.aplicacion.CobrarOrdenes} siempre emite {@link
     * #NORMAL} y siempre encola (ADR-0026 §3, COMMIT 1). {@link
     * kamayuk.caja.nucleo.aplicacion.CobrarTasa} emite {@link #TASA} y nunca toca el buzon: un
     * derecho de tramite no viene de ninguna orden y no hay sistema de origen a quien avisar (#33).
     *
     * <p>{@link #A_CUENTA}, {@link #PRECONVENIO} y {@link #CUOTA_CONVENIO} tampoco producen evento,
     * y no por una regla nueva sino porque <b>nadie los escribe desde que el buzon existe</b>. El
     * comentario de {@code recibo.tipo_pago} en {@code V2__ordenes_de_cobro_y_outbox.sql} lo dice
     * con esas letras: «A_CUENTA, PRECONVENIO y CUOTA_CONVENIO ya no los puede escribir NADIE: son
     * conceptos de {@code rentas}, y la cuota inicial de un convenio se cobra "como cualquier otra
     * orden"» —y <a
     * href="https://github.com/hneyra/rentas/blob/main/docs/30-arquitectura/adr/ADR-0026-el-camino-del-dinero.md">ADR-0026
     * §5</a> de {@code rentas} lo confirma: «la ventanilla no cambia: Caja cobra la cuota del
     * convenio como cualquier otra orden», es decir como {@link #NORMAL}. Las filas con esos tres
     * valores que existen hoy son <b>heredadas de antes del buzon</b> (de `sgtm`, previas a P5D):
     * ninguna tiene un evento en {@code pago_evento} porque esa tabla no existia cuando se
     * escribieron, y tratarlas como si produjeran uno inventaria un evento que nunca se encolo.
     *
     * <p><b>Una version anterior de este metodo decia lo contrario de {@link #PRECONVENIO}</b> —que
     * si producia evento, porque «la cuota inicial formaliza el convenio y el sistema de origen
     * necesita enterarse»—, apoyada solo en el nombre del valor y no en el codigo ni en el ADR de
     * `rentas`. Es <b>falsa</b>, medido contra ADR-0026 §5 y el comentario de V2 de arriba, y se
     * dice aqui en vez de borrarse: es la razon exacta de por que este metodo no distingue {@link
     * #PRECONVENIO} de {@link #A_CUENTA} o {@link #CUOTA_CONVENIO} —los tres son el mismo legado, y
     * ninguno tiene destinatario—.
     */
    public boolean produceEvento() {
        return this == NORMAL;
    }
}
