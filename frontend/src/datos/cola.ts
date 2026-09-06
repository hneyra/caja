/**
 * La cola de trabajo que cuelga del pie del arbol de modulos.
 *
 * Origen: `TesoreriaV6.dc.html`, lineas 1823-1830 — y **no** las 1792-1798.
 *
 * <h2>El artboard declara `cola` dos veces, y solo una es la buena</h2>
 *
 * En las 1792-1798 hay otra lista —«Sin conciliar» 208, «En verificacion» 34, «Con licencia de
 * obra» 12— que es la de la plantilla de Catastro sobre la que se dibujo V6: habla de expedientes
 * y licencias de obra, no de caja. Las dos son claves del **mismo** objeto literal que
 * `renderVals()` devuelve, asi que en JavaScript **gana la ultima**: lo que el prototipo pinta es
 * la de 1823. Se copia esa, y queda escrito aqui para que nadie la «corrija» hacia arriba.
 *
 * <h2>Las cifras son texto, y el `nodo` no</h2>
 *
 * `cuantos` es texto porque el artboard escribe `String(c[1])` y porque en esta interfaz una cifra
 * que se muestra no se opera (regla 1 de CLAUDE.md). `nodo` si es un numero: **no es una cantidad,
 * es una posicion** —el indice del nodo de `NODOS` que la seccion «Cajas y arqueo» abre—, y
 * `verificaciones/arbol.test.tsx` comprueba uno a uno que cada indice caiga en el nodo que su
 * rotulo promete. Un indice que baila no rompe nada: abre otro panel.
 */

/** El tono del punto de color de una entrada. Son los dos que el artboard usa; no hay un tercero. */
export type TonoDeCola = "bad" | "warn";

/** Una entrada de la cola de trabajo: que hay pendiente, cuanto, y donde se ve. */
export interface EntradaDeCola {
  readonly label: string;
  /** La cifra de la derecha. Texto, como en el artboard. */
  readonly cuantos: string;
  readonly tono: TonoDeCola;
  /** El indice dentro de `NODOS` que se abre al pulsarla. */
  readonly nodo: number;
}

/**
 * Las tres entradas, en el orden del artboard.
 *
 * Son las mismas tres cifras que la bandeja del panel (lineas 1831-1838) y las mismas que las
 * `cifras` de arriba dicen en prosa: «C-1 y C-2, de ayer», 11 operaciones sin conciliar y 3
 * anulaciones del dia. Que coincidan no es casualidad y por eso se puede comprobar.
 */
export const COLA: readonly EntradaDeCola[] = [
  { label: "Cajas sin arquear", cuantos: "2", tono: "bad", nodo: 2 },
  { label: "Sin conciliar", cuantos: "11", tono: "warn", nodo: 5 },
  { label: "Anulaciones del día", cuantos: "3", tono: "warn", nodo: 4 },
];
