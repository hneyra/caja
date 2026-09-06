/**
 * Lo que un destino lleva **ademas de la seccion**: el estado con el que la pantalla se abre.
 *
 * Es el segundo argumento del `ir(dest, extra)` del artboard (linea 1343), y no es un adorno:
 * cuatro de las diez acciones de la paleta abren **la misma seccion** —«Cajas y arqueo»— y solo
 * se distinguen por su `nodo`; dos abren «Tarifario y cierre» y solo se distinguen por `valTab`.
 * Sin estos campos, «Arqueo de mi caja» y «Anulaciones del día» serian el mismo comando con dos
 * rotulos, que es la mitad del trabajo que `PORTAR.md` (regla 5) prohibe dejar a medias.
 *
 * Desde #14 lo leen **las cuatro pantallas**: `nodo` es el panel de arqueo con el que se abre
 * `#cajas`, `valTab` la pestana del tarifario, `chip` el filtro de la lista de recibos y
 * `recibo` cual esta seleccionado. Hasta entonces el destino solo se guardaba y se exponia en
 * los `data-` de la raiz, que era lo unico que lo hacia observable; esos `data-` siguen ahi
 * porque miden una propiedad de `irA` —que navegar desde el arbol no lleva ningun extra— que
 * ninguna pantalla puede afirmar por si sola.
 *
 * <h2>Se reemplaza entero, no se mezcla — y eso es una desviacion del artboard</h2>
 *
 * El artboard hace `Object.assign({ dest, … }, extra || {})`, de modo que un `ir('panel')` sin
 * extra **conserva el `nodo` de la navegacion anterior**. Aqui el destino se reemplaza entero,
 * que es lo que ya hacia `App` desde el issue del arbol —`arbol.test.tsx` afirma que abrir
 * «Cajas y arqueo» desde el arbol deja `data-ir-nodo` vacio— y lo que evita que una pantalla se
 * abra en un panel que nadie pidio.
 */
export interface Destino {
  /** El panel de «Cajas y arqueo» que se abre. Es una posicion en `NODOS`, no una cantidad. */
  readonly nodo?: number;
  /** La pestana de «Tarifario y cierre» que se abre. Es una posicion en `TARIFARIO`. */
  readonly valTab?: number;
  /** El filtro con el que se abre la lista de recibos: `'Anulado'` es el unico que hay hoy. */
  readonly chip?: string;
  /**
   * El recibo seleccionado, por su numero — o {@link COBRO_NUEVO} para empezar un cobro.
   *
   * Es el `predio` del artboard, con el nombre de lo que de verdad guarda. El centinela
   * `'nuevo'` es el suyo (`esNuevo()`, linea 1360).
   */
  readonly recibo?: string;
}

/** El valor de `recibo` que significa «un cobro que todavia no existe» (artboard, linea 1360). */
export const COBRO_NUEVO = "nuevo";

/** Un destino sin nada: lo que deja una navegacion que no pide ningun estado de pantalla. */
export const SIN_EXTRAS: Destino = {};
