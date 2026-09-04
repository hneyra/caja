package kamayuk.caja.verificaciones;

import java.util.Set;

/**
 * Las tablas de {@code caja} que el escaner del codigo fuente vigila.
 *
 * <p>Es una lista corta a proposito: agregar una entrada tiene que doler y <b>quitar</b> una tiene
 * que verse en el diff. Cada una es una tabla cuyo contenido acredita que algo paso.
 */
final class TablasDelSgtm {

    private TablasDelSgtm() {}

    /**
     * RNF-051 y regla 4: no se borra el rastro de un acto administrativo.
     *
     * <p>En este sistema son <b>siete</b>, y cada una acredita algo distinto:
     *
     * <ul>
     *   <li>{@code recibo} y {@code recibo_detalle}: el papel que el contribuyente se lleva.
     *   <li>{@code recibo_movimiento}: su anulacion y sus duplicados. Borrarlo dejaria un recibo
     *       anulado pareciendo vigente.
     *   <li>{@code cierre_turno} y {@code cierre_turno_detalle}: el arqueo firmado del cajero, con
     *       lo que declaro haber contado en el cajon (#36).
     *   <li>{@code orden_de_cobro}: lo que se cobro y contra que. Borrarla dejaria un recibo
     *       cobrando algo que ya no se puede decir que era.
     *   <li>{@code pago_evento}: <b>la constancia de que un cobro se le comunico al sistema que lo
     *       emitio</b>, o de que no se pudo. Es el criterio 4 del encargo de P5D hecho lista: una
     *       anulacion produce un asiento de reversion en el otro sistema y aqui deja su fila; si
     *       esa fila se pudiera borrar, un pago perdido dejaria de existir y el turno cerraria.
     * </ul>
     */
    static final Set<String> PROTEGIDAS =
            Set.of(
                    "recibo",
                    "recibo_detalle",
                    "recibo_movimiento",
                    "cierre_turno",
                    "cierre_turno_detalle",
                    "orden_de_cobro",
                    "pago_evento");

    /**
     * Tablas que ademas <b>no se actualizan</b>: se corrigen agregando, no editando.
     *
     * <ul>
     *   <li>{@code recibo} y {@code recibo_detalle}, con #33: el contribuyente se lleva el papel, y
     *       corregirlo en la base deja al papel y al sistema diciendo cosas distintas —y quien
     *       tenga el papel gana la discusion—. `V29` les revoca el {@code UPDATE}.
     *   <li>{@code recibo_movimiento} (V30), {@code cierre_turno} y {@code cierre_turno_detalle}
     *       (V32): una anulacion y un cierre son actos. Un cierre equivocado se reversa con otro
     *       registro que lo deja sin efecto y reabre el turno.
     *   <li>{@code auditoria} (ADR-0008).
     *   <li><b>{@code cierre_caja}</b>, y aqui hay historia. En el monolito era la unica tabla del
     *       esquema cuya inmutabilidad NO podia apoyarse en el privilegio: {@code REVOKE UPDATE}
     *       dejaba la caja sin poder cobrar, porque {@code SELECT ... FOR UPDATE} exige ese
     *       privilegio y ahi se serializaba la ventanilla (V32 §1.bis). <b>Desde `V2` de este
     *       repositorio ya no</b>: la serializacion se movio a {@code orden_de_cobro} y el REVOKE
     *       se pudo hacer. Se queda en esta lista igualmente, porque las dos guardas son
     *       independientes y las dos dan {@code 42501} — el sintoma no distingue cual actuo (#435),
     *       y el escaner es el que dice el motivo antes de ejecutar.
     * </ul>
     *
     * <p><b>{@code orden_de_cobro} y {@code pago_evento} NO estan aqui, y es deliberado.</b> Las
     * dos cambian de estado: una orden pasa a {@code PAGADA} y vuelve a {@code PENDIENTE} si el
     * recibo se anula; un evento pasa a {@code ENTREGADO} o a {@code MUERTO}. Meterlas romperia el
     * cobro entero. Lo que si esta prohibido —borrarlas— lo dice {@link #PROTEGIDAS}.
     */
    static final Set<String> INMUTABLES =
            Set.of(
                    "recibo",
                    "recibo_detalle",
                    "recibo_movimiento",
                    "cierre_caja",
                    "cierre_turno",
                    "cierre_turno_detalle",
                    "auditoria");
}
