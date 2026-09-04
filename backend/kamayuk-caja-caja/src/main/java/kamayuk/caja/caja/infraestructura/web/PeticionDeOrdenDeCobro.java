package kamayuk.caja.caja.infraestructura.web;

import org.jspecify.annotations.Nullable;

/**
 * El cuerpo de {@code POST /caja/api/v1/ordenes-de-cobro} (ADR-0026 §1). <b>Lista blanca</b>: lo
 * que no esta aqui no entra.
 *
 * <p>Es la <b>unica</b> puerta por la que entra a la caja algo que cobrar, y por eso su forma es la
 * definicion practica de «caja no sabe que es un tributo»: si algun dia este record ganara un campo
 * {@code ejercicio} o {@code tributo}, la separacion se habria deshecho por aqui.
 *
 * @param sistemaOrigen quien la manda: {@code rentas}, y manana {@code mercados}. Texto y no un
 *     enumerado, para que anadir un sistema no sea un despliegue de la caja
 * @param referenciaExterna como la reconoce quien la mando; <b>opaca</b> para la caja. Con {@code
 *     sistemaOrigen} forma la clave con la que este alta es idempotente
 * @param concepto lo que se imprime en la linea del recibo. Lo unico que el administrado lee
 * @param detalle lo que el origen quiera anadir debajo. Es la puerta por la que D-20 puede
 *     resolverse hacia «el recibo lleva el desglose» sin que la caja aprenda tributacion
 * @param importe cuanto, como cadena (RNF-055: los importes no viajan como numero de coma flotante)
 * @param fechaExigibilidad desde cuando se puede cobrar, en ISO
 * @param actualizadoA a que fecha esta el importe, en ISO (regla 9, RNF-075). No es la de
 *     exigibilidad: una deuda exigible desde marzo puede venir actualizada a hoy con su interes ya
 *     dentro
 * @param pagadorDocumento el documento de quien paga; puede no haber
 * @param pagadorNombre su nombre, para el papel; puede no haber
 * @param pagadorIdExterno el identificador que le da el sistema de origen; puede no haber
 * @param observacion por que se da de alta (regla 10)
 */
public record PeticionDeOrdenDeCobro(
        @Nullable String sistemaOrigen,
        @Nullable String referenciaExterna,
        @Nullable String concepto,
        @Nullable String detalle,
        @Nullable String importe,
        @Nullable String fechaExigibilidad,
        @Nullable String actualizadoA,
        @Nullable String pagadorDocumento,
        @Nullable String pagadorNombre,
        @Nullable Long pagadorIdExterno,
        @Nullable String observacion) {}
