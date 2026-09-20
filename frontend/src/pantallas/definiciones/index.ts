import type { ClaveDeHoja } from '../arbol.ts';
import type { Acto, Bloque, Pantalla } from '../tipos.ts';
import { TESORERIA } from './tesoreria.ts';

/**
 * **Todas las pantallas de la ventanilla, por su clave** (#74).
 *
 * Un modulo, asi que un archivo. Se deja el indice de todos modos, igual que en `rentas`: el
 * `satisfies Record<ClaveDeHoja, Pantalla>` es lo que hace que una hoja sin pantalla no compile, y
 * vive aqui para que un segundo modulo sea un `...` mas y no una reorganizacion.
 *
 * <h2>Y desde #100, una pantalla puede llevar dos clases de pieza</h2>
 *
 * Bloques —lo de siempre— y **actos**, que es lo que la anulacion necesita (ADR-0044). Quien
 * recorre las definiciones casi siempre quiere una de las dos y no la union, asi que el reparto lo
 * hacen `bloquesDe()` y `actosDe()`, aqui y en un solo sitio: un `pantalla.bloques` recorrido a
 * mano se queda en verde el dia que entre una pieza que no sepa dibujar.
 */
export const PANTALLAS = {
  ...TESORERIA,
} satisfies Record<ClaveDeHoja, Pantalla>;

/** La pantalla de una hoja. Con `ClaveDeHoja` no hay caso «no existe» que tratar. */
export const pantallaDe = (clave: ClaveDeHoja): Pantalla => PANTALLAS[clave];

/**
 * Los bloques de una pantalla: sus piezas **menos los actos**.
 *
 * Un acto no es un bloque en ningun sentido util: sus campos no se llenan con un reparto, no se
 * dibuja con la pantalla —solo existe abierto— y su titulo no es un encabezado de la pagina. Quien
 * recorra bloques para contar campos, para abrir la pantalla o para juntar sus cadenas tiene que
 * verlos fuera.
 */
export const bloquesDe = (pantalla: Pantalla): readonly Bloque[] =>
  pantalla.bloques.filter((pieza): pieza is Bloque => pieza.tipo !== 'acto');

/** Los actos de una pantalla: lo que escribe. Hoy, uno en `duplicado-recibo` y ninguno en las otras. */
export const actosDe = (pantalla: Pantalla): readonly Acto[] =>
  pantalla.bloques.filter((pieza): pieza is Acto => pieza.tipo === 'acto');
