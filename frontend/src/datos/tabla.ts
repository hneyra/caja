/**
 * Lo que las tablas del artboard tienen en comun: sus columnas y sus filas.
 *
 * Tres constantes distintas dibujan tablas —`PASOS[1].tabla` (las cuotas seleccionadas),
 * `DETERMINACIONES` (el arqueo de cada nodo) y `VAL` (el tarifario)— y las tres escriben la
 * cabecera igual: un par `[titulo, 0|1]` donde el `1` alinea la columna a la derecha, con
 * `font-variant-numeric: tabular-nums`, porque lleva una cifra.
 *
 * Aqui ese `0|1` se escribe como `numerica: boolean`. Es la misma informacion; lo que cambia es
 * que el 0 y el 1 del artboard no se pueden leer sin ir a mirar la constante de estilo que los usa.
 *
 * Origen: `TesoreriaV6.dc.html`, lineas 978-1168.
 */

/** Una columna de cabecera: su rotulo y si su contenido es una cifra. */
export interface Columna {
  readonly titulo: string;
  /**
   * `true` donde el artboard escribe `1`: la celda va a la derecha y con cifras tabulares.
   *
   * No dice que el dato sea un numero **en el codigo** —toda celda es texto, regla 1 de
   * CLAUDE.md— sino como se alinea al pintarlo.
   */
  readonly numerica: boolean;
}

/**
 * Una fila: tantas celdas como columnas, y todas texto.
 *
 * Las celdas se copian del artboard **enteras y sin redondear**: `'1,842.60'` se queda como
 * `'1,842.60'`. Ni el separador de millares ni los dos decimales se recomponen aqui; el dia que
 * haya backend, la cifra llegara ya compuesta desde el (`ImporteActualizado`).
 */
export type Fila = readonly string[];
