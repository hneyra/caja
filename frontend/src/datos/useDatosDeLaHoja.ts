import type { DatosDeLaPantalla } from '@kamayuk/ui';

import type { ClaveDeHoja } from '../pantallas/arbol.ts';
import { hojaDe } from '../pantallas/arbol.ts';
import { porQueNoHayDato } from '../porQueNoHayDato.ts';

/**
 * **Lo que se sabe de los datos de una hoja de la ventanilla** (#74).
 *
 * Hoy, que no se sabe nada y por que: ninguna hoja pide todavia. Es un gancho y no una funcion
 * suelta a proposito, y con la firma de `rentas`: los conectores de lectura (#74, fila C2) entran
 * aqui con su `useQuery`, y `aplicacion.tsx` no tiene que cambiar para recibirlos.
 *
 * Lo que NO hace, y es la mitad que importa: **no pide nada**. Una hoja sin conector no toca la red,
 * y `e2e/la-frontera.spec.ts` lo mide en un navegador.
 */
export function useDatosDeLaHoja(clave: ClaveDeHoja): DatosDeLaPantalla {
  return { ausencia: porQueNoHayDato(hojaDe(clave)) };
}
