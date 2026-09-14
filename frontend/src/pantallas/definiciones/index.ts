import type { ClaveDeHoja } from '../arbol.ts';
import type { Pantalla } from '../tipos.ts';
import { TESORERIA } from './tesoreria.ts';

/**
 * **Todas las pantallas de la ventanilla, por su clave** (#74).
 *
 * Un modulo, asi que un archivo. Se deja el indice de todos modos, igual que en `rentas`: el
 * `satisfies Record<ClaveDeHoja, Pantalla>` es lo que hace que una hoja sin pantalla no compile, y
 * vive aqui para que un segundo modulo sea un `...` mas y no una reorganizacion.
 */
export const PANTALLAS = {
  ...TESORERIA,
} satisfies Record<ClaveDeHoja, Pantalla>;

/** La pantalla de una hoja. Con `ClaveDeHoja` no hay caso «no existe» que tratar. */
export const pantallaDe = (clave: ClaveDeHoja): Pantalla => PANTALLAS[clave];
