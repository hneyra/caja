package kamayuk.caja.nucleo.infraestructura.web;

import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * El cuerpo de {@code POST /api/v1/tesoreria/caja/tasas} (RF-081). <b>Lista blanca</b>: lo que no
 * esta aqui no entra.
 *
 * <p>Tampoco hay importes: el precio de cada concepto sale de la tabla {@code tasa}, vigente a la
 * fecha del cobro (regla 5). Lo que el cajero elige es <b>que</b> y <b>cuantas veces</b>.
 *
 * @param caja el codigo de la ventanilla
 * @param cajero quien cobra
 * @param pagadorDocumento el documento de quien paga; puede faltar. Desde P5D la caja NO lo cruza
 *     contra ningun padron —el de contribuyentes es de `rentas`— y por eso tampoco lo exige: quien
 *     paga un derecho de tramite al contado no siempre da documento, y exigirselo para poder
 *     cobrarle seria inventar un requisito que ninguna norma pide
 * @param pagadorNombre su nombre, para el papel; puede faltar
 * @param pagadorIdExterno el identificador que le da el sistema de origen, si alguno se lo da
 * @param formaDePago EFECTIVO, CHEQUE, DEPOSITO, TARJETA o TRANSFERENCIA
 * @param fechaDeCobro la fecha a la que se resuelve la tarifa vigente, en ISO; si falta, hoy
 * @param conceptos los del TUPA, con su cantidad
 * @param observacion por que se cobra (regla 10)
 */
public record PeticionDeCobroDeTasas(
        @Nullable String caja,
        @Nullable String cajero,
        @Nullable String pagadorDocumento,
        @Nullable String pagadorNombre,
        @Nullable Long pagadorIdExterno,
        @Nullable String formaDePago,
        @Nullable String fechaDeCobro,
        @Nullable List<PeticionDeConcepto> conceptos,
        @Nullable String observacion) {

    /**
     * Un concepto del TUPA marcado.
     *
     * @param conceptoTupa el codigo del concepto
     * @param cantidad cuantas veces se cobra; si falta, 1
     */
    public record PeticionDeConcepto(@Nullable String conceptoTupa, @Nullable Integer cantidad) {}
}
