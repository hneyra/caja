import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * La raiz de `frontend/`, para las guardas que leen archivos del arbol.
 *
 * En `rentas` vive en `artboards.ts`, junto a la lista de artboards vendorizados. `caja` no tiene
 * artboard (#74): la raiz se queda sola en su archivo, y ninguna guarda tiene que importar una lista
 * de disenos que no existe para saber donde esta.
 */
export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
