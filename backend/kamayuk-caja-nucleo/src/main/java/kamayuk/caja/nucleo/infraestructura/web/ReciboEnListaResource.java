package kamayuk.caja.nucleo.infraestructura.web;

import kamayuk.caja.nucleo.aplicacion.ConsultaDeRecibos;
import kamayuk.caja.nucleo.dominio.ReciboEnConsulta;
import kamayuk.caja.web.ImporteActualizado;
import org.jspecify.annotations.Nullable;

/**
 * Una fila del listado de recibos, tal como sale por HTTP (#548, RF-082).
 *
 * <p>Es la grilla «Recibos localizados» de {@code duplicado_recibo}: numero, fecha y hora, a quien
 * se le cobro, el importe <b>con su fecha</b>, el medio de pago, cuantos duplicados se han sacado y
 * si el recibo sigue en pie.
 *
 * <p><b>El importe viaja como {@link ImporteActualizado}</b>, nunca como cifra suelta (regla 9,
 * RNF-075). La fecha es la que el recibo congelo al emitirse, no la de hoy: un recibo de marzo se
 * lee en agosto con la fecha de marzo, que es lo que permite explicar su interes.
 *
 * <p><b>Lo que esta fila NO trae, y por que.</b> La columna «Concepto» del prototipo —«Impuesto
 * predial cuotas 1 y 2»— sale del <b>desglose</b> del recibo, y una pagina de veinte filas no puede
 * costar veinte lecturas de {@code recibo_detalle}; quien quiere el detalle abre el recibo por su
 * numero, que ya tiene ruta. Y no trae la caja ni el cajero: son filtros de la busqueda, no
 * columnas de esta grilla, y publicarlos seria inventarle una columna a la pantalla (RNF-080).
 *
 * @param numero el numero impreso, {@code 001-0000123}
 * @param emitidoEn el instante de emision en ISO; de ahi salen la fecha y la hora de la grilla
 * @param documentoDelPagador el documento de quien pago, CONGELADO en el recibo (P5D); nulo si
 *     resolvio no se identifico al pagador — que en caja de tasas es legitimo
 * @param pagador su nombre, tambien congelado; nulo por lo mismo
 * @param importe lo cobrado, con la fecha a la que estaba actualizado
 * @param medioDePago con que se pago
 * @param duplicados cuantas veces se ha reimpreso ya
 * @param estado {@code EMITIDO} o {@code ANULADO}, derivado del movimiento de anulacion (V30)
 */
public record ReciboEnListaResource(
        String numero,
        String emitidoEn,
        @Nullable String documentoDelPagador,
        @Nullable String pagador,
        ImporteActualizado importe,
        String medioDePago,
        long duplicados,
        String estado) {

    public static ReciboEnListaResource de(ConsultaDeRecibos.FilaDeRecibo fila) {
        ReciboEnConsulta recibo = fila.recibo();
        return new ReciboEnListaResource(
                recibo.numero().impreso(),
                recibo.emitidoEn().toString(),
                recibo.pagador().documento(),
                recibo.pagador().nombre(),
                new ImporteActualizado(recibo.total(), recibo.actualizadoA()),
                recibo.formaDePago().name(),
                recibo.duplicados(),
                recibo.estado().name());
    }
}
