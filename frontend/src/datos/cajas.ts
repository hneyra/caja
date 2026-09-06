/**
 * Las cuatro cajas que la ventanilla ofrece, y cuales de ellas estan cerradas.
 *
 * Origen: `TesoreriaV6.dc.html` — `PROGRAMAS` (lineas 967-972) y `CAJAS_CERRADAS` (973). El nombre
 * `PROGRAMAS` es de la plantilla de Fiscalizacion sobre la que se dibujo V6; aqui la constante se
 * llama por lo que contiene.
 *
 * <h2>Por que las cerradas se ofrecen igual</h2>
 *
 * El artboard lo deja escrito en su comentario de la linea 964: sin caja abierta no se puede
 * cobrar, porque el recibo no tendria turno al que imputarse ni arqueo donde cuadrar. Las cerradas
 * aparecen en la lista y **bloquean la emision** con su motivo a la vista, que es mas honesto que
 * esconderlas: una caja que no esta en la lista es indistinguible de una caja que no existe.
 *
 * <h2>Una sola lista, dos formas</h2>
 *
 * El artboard mantiene dos constantes —el diccionario y el array de cerradas— y las cruza con un
 * `indexOf`. Aqui la cerrazon es un campo de la caja y `CAJAS_CERRADAS` se **deriva**: con las dos
 * escritas a mano, renombrar una caja en una y no en la otra la abriria sin que nada lo dijera.
 */

/** Una caja de la ventanilla. */
export interface Caja {
  /** Como se lee en la lista: `'C-3 — abierta · turno mañana'`. Es la clave del artboard. */
  readonly nombre: string;
  /**
   * Cuantos caracteres tiene que tener el documento del contribuyente para dar el codigo por listo.
   *
   * **No es un importe**: es una longitud. El artboard la compara contra `docNumero.length`
   * (linea 1433) y con menos de eso deshabilita la emision diciendo «Falta el documento del
   * contribuyente». Las cuatro cajas declaran 8, que es el largo del DNI peruano.
   */
  readonly largoDeDocumento: number;
  /** Si esta cerrada. Se puede elegir, pero no se puede emitir en ella. */
  readonly cerrada: boolean;
}

/**
 * Las cuatro cajas, en el orden del artboard.
 *
 * El orden importa: el artboard toma `Object.keys(PROGRAMAS)[0]` como caja por omision (linea
 * 1369), asi que la primera de la lista es la caja del cajero que esta atendiendo.
 */
export const CAJAS: readonly Caja[] = [
  { nombre: "C-3 — abierta · turno mañana", largoDeDocumento: 8, cerrada: false },
  { nombre: "C-1 — cerrada ayer", largoDeDocumento: 8, cerrada: true },
  { nombre: "C-2 — cerrada ayer", largoDeDocumento: 8, cerrada: true },
  { nombre: "C-4 — abierta · turno tarde", largoDeDocumento: 8, cerrada: false },
];

/** Las dos cerradas, por su nombre. Se deriva de `CAJAS`: no hay una segunda lista que mantener. */
export const CAJAS_CERRADAS: readonly string[] = CAJAS.filter((caja) => caja.cerrada).map(
  (caja) => caja.nombre,
);
