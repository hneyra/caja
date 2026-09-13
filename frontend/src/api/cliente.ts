import { crearCliente } from '@kamayuk/api';

import { token } from './identidad.ts';

/**
 * El camino a la API de la ventanilla: **el cliente de `@kamayuk/api`, con el prefijo de `caja`** (#74).
 *
 * `rentas` escribio el suyo a mano —`fetch`, el `problem+json`, `ErrorDeLaApi`— antes de que la
 * libreria existiera. `caja` no lo copia: lo que queda aqui son dos decisiones de este sistema.
 *
 * <h2>1. El prefijo, y que sea UNO</h2>
 *
 * Todo cuelga de `/caja/api/v1` (ADR-0030 §2: la ruta dice quien responde), y ADR-0042 lo hace mas
 * estricto: **la ventanilla no habla con ninguna otra API**. Por eso el cliente se construye una
 * vez, con un prefijo fijo, y no admite rutas absolutas. Que `PREFIJO`, el `server.proxy` de
 * `vite.config.ts` y `Api.RAIZ` del backend digan lo mismo lo comprueba
 * `verificaciones/camino-a-la-api.test.ts`; que ninguna otra API aparezca en el codigo servido, la
 * frontera de `verificaciones/` y el `Dockerfile`.
 *
 * <h2>2. Solo se lee</h2>
 *
 * ADR-0040 acepto conectar la ventanilla **para leer**. `leer()` no acepta `metodo` ni `cuerpo`, y
 * `solicitar` no sale de este archivo: escribir exige cambiar este archivo, a la vista de quien
 * revise. El cliente de la libreria sabe escribir; lo que decide que aqui no se escriba es esto.
 */

/**
 * La raiz de la API de este sistema.
 *
 * **Exportada**, y no privada: `verificaciones/camino-a-la-api.test.ts` la compara con la de
 * `vite.config.ts` y con la del backend.
 */
export const PREFIJO = '/caja/api/v1';

const CLIENTE = crearCliente({ prefijo: PREFIJO, token });

/**
 * Pide `ruta` a la API de la ventanilla y devuelve su cuerpo ya interpretado.
 *
 * @param ruta relativa a `PREFIJO`, empezando por `/`
 * @param senal la de TanStack Query, para que una consulta abandonada no llegue tarde
 */
export function leer<T>(ruta: string, senal?: AbortSignal): Promise<T> {
  return CLIENTE.solicitar<T>(ruta, senal === undefined ? {} : { senal });
}

export { ErrorDeLaApi } from '@kamayuk/api';
