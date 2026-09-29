package kamayuk.caja.nucleo.aplicacion;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import kamayuk.caja.documentos.Campo;
import kamayuk.caja.documentos.ModeloDeDocumento;
import kamayuk.caja.documentos.Tabla;
import kamayuk.caja.dominio.ZonaHoraria;
import kamayuk.caja.nucleo.dominio.LineaDeRecibo;
import kamayuk.caja.nucleo.dominio.MovimientoDeRecibo;
import kamayuk.caja.nucleo.dominio.Recibo;
import org.jspecify.annotations.Nullable;

/**
 * Dibuja un recibo a partir de lo que quedo congelado en {@code recibo} y {@code recibo_detalle}
 * (#34, RF-082).
 *
 * <h2>No se recalcula nada</h2>
 *
 * <p>Ni una cifra de este documento sale del libro: todas salen del desglose que la cobranza guardo
 * parte por parte (V29). Volver a consultar {@code cuentacorriente} daria un papel distinto cada
 * vez —dentro de dos anios habra mas asientos—, y el duplicado dejaria de ser un duplicado.
 *
 * <p>{@link ModeloDeDocumento#aLaFecha} es {@link Recibo#actualizadoA}, la fecha a la que estaban
 * actualizados los importes que se cobraron, <b>nunca</b> el dia en que se pide la reimpresion
 * (regla 9, RNF-075). Es lo que deja que un duplicado de marzo explique por que su interes no es el
 * de hoy.
 *
 * <h2>Lo congelado y lo que no</h2>
 *
 * <p>Con {@code contribuyente} nulo, el modelo es <b>exactamente lo que el recibo guarda</b>: sin
 * nombre ni codigo de contribuyente, porque {@code recibo} no los guarda —apunta al padron por
 * identificador—. Esa forma es la que {@link DuplicadoDeRecibo} resume con SHA-256, y por eso el
 * resumen cubre todas las cifras y todo el desglose, que es lo que tiene que salir identico.
 *
 * <p>El nombre del contribuyente se anade solo para imprimir, y viene del padron de hoy. Es la
 * unica parte del papel que no esta congelada, y conviene que se sepa: si alguien corrige una falta
 * de ortografia en el nombre, el duplicado de un recibo de marzo saldra con el nombre corregido.
 * Congelarlo exigiria una columna nueva en {@code recibo}, que es una tabla que ya no se toca.
 *
 * <h2>La hora de emision, en Lima (#141)</h2>
 *
 * <p>Hasta #141 la cabecera escribia {@code recibo.emitidoEn().toString()}, que es UTC: un cobro de
 * las 22:30 del 27 salia «Emitido: 2026-09-28T03:30:00Z» encima de un «Importes actualizados al
 * 2026-09-27» —dos dias en el mismo papel—. Ahora la escribe {@link ZonaHoraria#textoConSuDesfase}:
 * «2026-09-27T22:30:00-05:00», el ISO de {@code LocalDate.toString()} que ya usan las otras fechas
 * del papel, con la hora de Lima y su desfase a la vista. <b>Al segundo</b>: los microsegundos que
 * {@code timestamptz} devuelve de un reloj de verdad no los lee nadie en una ventanilla, y el ISO
 * los escribiria. Pero la forma de antes no se borra: los recibos que ya salieron con ella se
 * siguen dibujando con ella, y el porque esta en {@link Forma}.
 *
 * <p>Es una funcion pura sobre lo que se le pasa: sin base de datos, sin reloj y sin Spring. Asi se
 * puede comprobar que dos llamadas con meses de diferencia dan los mismos bytes sin levantar nada.
 * La zona no es un reloj: es la constante del producto, y el instante sigue entrando con el recibo.
 */
final class ModeloDelRecibo {

    /**
     * Las formas en que este modelo ha escrito la hora de emision (#141).
     *
     * <p><b>Por que la forma de antes sigue aqui.</b> Un recibo cuyo primer duplicado salio en UTC
     * ya tiene ese papel en la calle, y el resumen que guardo es el de esos bytes. Dibujarlo ahora
     * en Lima entregaria un segundo papel distinto con el mismo numero —exactamente lo que {@link
     * DuplicadoDeRecibo.LaReimpresionNoCoincide} existe para impedir—, asi que ese recibo se sigue
     * dibujando en {@link #HORA_EN_UTC}, y todo recibo que todavia no tenga duplicado sale en
     * {@link #VIGENTE}. Lo que el papel antiguo dice no es falso: «…Z» es el mismo instante con su
     * zona escrita; lo que tenia de malo era obligar a restar cinco horas a quien lo lee.
     *
     * <p>Cual de las dos le toca a cada recibo no se guarda en ningun sitio: lo dice su resumen, y
     * {@link DuplicadoDeRecibo} explica por que basta.
     *
     * <p>El orden de las constantes es el orden en que {@link DuplicadoDeRecibo} las prueba: la
     * vigente primero, porque es la de todo recibo nuevo.
     */
    enum Forma {

        /** Desde #141: la hora de Lima con su desfase, al segundo. */
        HORA_DE_LIMA,

        /**
         * Hasta #141: {@code Instant.toString()}, en UTC y con las fracciones que traiga.
         *
         * <p>Se conserva <b>byte a byte</b> —{@code AnularYDuplicarTest} guarda como literal el
         * resumen que el codigo de antes producia, y se pone rojo si esta forma deja de
         * reproducirlo— y solo se dibuja para un recibo cuyo primer duplicado ya salio asi.
         */
        HORA_EN_UTC;

        /** La que dibuja todo recibo sin duplicado previo. */
        static final Forma VIGENTE = HORA_DE_LIMA;

        String emitido(Instant emitidoEn) {
            return switch (this) {
                case HORA_DE_LIMA ->
                        ZonaHoraria.textoConSuDesfase(emitidoEn.truncatedTo(ChronoUnit.SECONDS));
                case HORA_EN_UTC -> emitidoEn.toString();
            };
        }
    }

    /** El titulo del documento; el numero impreso va detras. */
    private static final String TITULO = "RECIBO DE CAJA N.° ";

    /** Lo que se le dice a quien tenga en la mano el duplicado de un recibo sin efecto. */
    private static final String AVISO_DE_ANULACION =
            "RECIBO ANULADO — no acredita pago. La deuda que cancelo volvio a estar pendiente";

    private ModeloDelRecibo() {}

    /**
     * El modelo del recibo.
     *
     * @param recibo lo congelado; de aqui salen todas las cifras
     *     <p><b>El pagador sale del propio recibo</b> desde P5D. Antes se pasaba aparte, resuelto
     *     del padron de hoy; ahora esta congelado dentro, y por eso el duplicado de 2037 imprime el
     *     nombre con el que se cobro y no el de entonces —que es lo que {@code
     *     recibo_movimiento.resumen} existe para garantizar (#34)—.
     * @param anulacion la anulacion del recibo, si la hubo; con ella el papel lo dice
     * @param forma como se escribe la hora de emision: {@link Forma#VIGENTE} salvo para un recibo
     *     que ya se duplico con otra (#141)
     */
    static ModeloDeDocumento de(
            Recibo recibo, @Nullable MovimientoDeRecibo anulacion, Forma forma) {
        Objects.requireNonNull(forma, "Hay que decir como se escribe la hora de emision (#141)");

        List<Campo> cabecera = new ArrayList<>();
        cabecera.add(Campo.de("Numero", recibo.numero().impreso()));
        cabecera.add(Campo.de("Emitido", forma.emitido(recibo.emitidoEn())));
        cabecera.add(Campo.de("Cajero", recibo.cajero()));
        cabecera.add(Campo.de("Forma de pago", recibo.formaDePago().name()));
        cabecera.add(Campo.de("Tipo de pago", recibo.tipoDePago().name()));
        if (recibo.campaniaBeneficio() != null) {
            // Solo constancia: su efecto sobre el importe sigue bloqueado por D-02b (#33).
            cabecera.add(Campo.de("Beneficio declarado", recibo.campaniaBeneficio()));
        }
        // Siempre, y con su motivo cuando no hay: una celda vacia en un recibo se lee como un
        // defecto de impresion, y un guion con su motivo se lee como lo que es (RNF-080).
        cabecera.add(Campo.de("Pagador", recibo.pagador().nombreImpreso()));
        if (recibo.pagador().documento() != null) {
            cabecera.add(Campo.de("Documento", recibo.pagador().documento()));
        }

        List<List<String>> filas = new ArrayList<>(recibo.lineas().size());
        for (LineaDeRecibo linea : recibo.lineas()) {
            filas.add(
                    List.of(
                            linea.tributo(),
                            linea.concepto(),
                            linea.ejercicio() == null
                                    ? ""
                                    : String.valueOf(linea.ejercicio().valor()),
                            linea.cantidad() == null ? "" : String.valueOf(linea.cantidad()),
                            linea.insoluto().valor().toPlainString(),
                            linea.reajuste().valor().toPlainString(),
                            linea.interes().valor().toPlainString(),
                            linea.gasto().valor().toPlainString(),
                            linea.monto().valor().toPlainString()));
        }

        Tabla desglose =
                Tabla.de(
                        "Detalle cobrado",
                        List.of(
                                "Tributo",
                                "Concepto",
                                "Ejercicio",
                                "Cantidad",
                                "Insoluto",
                                "Reajuste",
                                "Interes",
                                "Gasto",
                                "Total"),
                        filas);

        List<String> pie = new ArrayList<>();
        pie.add("Total: S/ " + recibo.total().valor().toPlainString());
        // La fecha va tambien en el pie, junto al total, y no solo en aLaFecha: quien
        // recorta el papel por la mitad se queda con la cifra, y una cifra sin fecha
        // dentro de dos anios no se puede discutir (regla 9).
        pie.add("Importes actualizados al " + recibo.actualizadoA());
        if (anulacion != null) {
            pie.add(AVISO_DE_ANULACION);
            pie.add("Anulado el " + anulacion.fecha() + " — " + anulacion.motivoDeLaAnulacion());
        }

        return ModeloDeDocumento.de(
                        TITULO + recibo.numero().impreso(),
                        recibo.actualizadoA(),
                        List.copyOf(cabecera),
                        List.of(desglose))
                .con(List.copyOf(pie));
    }
}
