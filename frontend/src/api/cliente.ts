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
 * <h2>2. Se lee siempre, y se escribe EN UN SITIO</h2>
 *
 * ADR-0040 acepto conectar la ventanilla **para leer**, y hasta #100 aqui solo habia `leer()`.
 * ADR-0044 amplia aquello con **una** escritura —la anulacion de un cobro—, asi que este archivo
 * publica ahora dos caminos y no uno:
 *
 *   · `leer()` no acepta `metodo` ni `cuerpo`. Sigue siendo imposible escribir por ahi, y lo
 *     comprueba la barrera de tipo `leerNoEscribe` de `verificaciones/tipos/`.
 *   · `escribir()` **exige el cuerpo** y manda `POST`. No admite el verbo como argumento: los otros
 *     cuatro que `@kamayuk/api` sabe hacer no los usa este backend —un recibo no se corrige, se
 *     anula (regla 4)—, y un parametro que nadie pasa es una puerta abierta sin nadie detras.
 *
 * `solicitar` sigue sin salir de este archivo. Y **quien puede llamar a `escribir()` es uno solo**:
 * `datos/laAnulacion.ts`. No es una convencion: lo barre `verificaciones/solo-lee.test.ts` sobre
 * `src/` entero, y cualquier otro archivo que lo nombre sale en rojo con su ruta.
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

/**
 * Manda `cuerpo` a `ruta` con `POST` y devuelve lo que el backend conteste (#100, ADR-0044).
 *
 * **La unica escritura de esta interfaz pasa por aqui**, y el unico que la llama es
 * `datos/laAnulacion.ts`. El verbo no es un argumento a proposito —ver el javadoc de arriba—, y
 * tampoco viaja ninguna clave de idempotencia: la anulacion de un cobro **no es idempotente en
 * este backend** y no finge serlo. Un reintento sobre un recibo ya anulado contesta 409
 * (`MovimientoDeReciboRepository.ReciboYaAnulado`), que es una respuesta cierta y legible; una
 * clave de idempotencia que el backend no lee daria la ilusion contraria.
 *
 * @param ruta relativa a `PREFIJO`, empezando por `/`
 * @param cuerpo lo que viaja como JSON. Obligatorio: una escritura sin cuerpo no existe aqui
 * @param senal la de quien pueda abandonar la espera
 */
export function escribir<T>(ruta: string, cuerpo: unknown, senal?: AbortSignal): Promise<T> {
  return CLIENTE.solicitar<T>(ruta, {
    metodo: 'POST',
    cuerpo,
    ...(senal === undefined ? {} : { senal }),
  });
}

export { ErrorDeLaApi } from '@kamayuk/api';
