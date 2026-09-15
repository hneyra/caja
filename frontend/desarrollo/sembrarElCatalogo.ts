/**
 * **Las pantallas de la ventanilla sin levantar la plataforma entera** (`rentas`#114; aqui desde #74).
 *
 * <h2>El hueco que esto cierra</h2>
 *
 * El arbol llega de la red: `useCatalogoPermitido` pide `GET /seguridad/{modulos,accesos}` y
 * `/seguridad/sesion/permisos`, y la barra pide la cuenta. Sin backend no hay ni un destino que
 * abrir, y lo que se lee es «No se pudo saber que puede abrir esta cuenta…». El mensaje es correcto;
 * lo que costaba era mirar la interfaz: PostgreSQL, Keycloak, Traefik y el backend para comprobar el
 * color de una cabecera.
 *
 * <h2>Se siembra EL CATALOGO Y LA CUENTA, y nada mas</h2>
 *
 * Las respuestas de seguridad y de sesion, o sea que pantallas existen y quien las mira. Ni un dato
 * de pantalla: contestarles algo inventado seria ensenar cifras falsas en una ventanilla.
 *
 * <h2>Y lo que se siembra dice de donde sale</h2>
 *
 * `seguridadMedida.ts` lleva su `ORIGEN_DE_LA_CAPTURA`, y este aviso lo repite en la consola: una
 * interfaz que se ve entera sin nada levantado es justo lo que alguien puede confundir con «el
 * backend contesto».
 *
 * <h2>Por que vive FUERA de `src/`, que es donde vive el codigo de la interfaz</h2>
 *
 * Porque `verificaciones/camino-a-la-api.test.ts` prohibe que un archivo de produccion de `src/`
 * importe las capturas, y esa prohibicion es de las que sostienen algo: un `arbol ??
 * ARBOL_MEDIDO` en cualquier gancho devolveria la navegacion constante que I-3 vino a quitar, y
 * esta vez con una constante que ademas **parece un dato medido**. Meter esto en `src/` obligaba
 * a tallarle una excepcion a esa guarda; dejandolo aqui la guarda no se toca y sigue diciendo lo
 * mismo para todo `src/`. Es donde ya vive `e2e/instalacion.ts`, que importa estas mismas
 * capturas por el mismo motivo y con el mismo riesgo.
 *
 * **Lo unico que lo alcanza es un `import()` dinamico detras de dos condiciones constantes al
 * construir** (`src/arranque.ts`). Ahi esta escrito por que, y que es lo que se mide.
 */

import { CONSULTAS } from '../src/aplicacion.tsx';
import type { Paginado } from '../src/datos/lecturas.ts';
import {
  ACCESOS_MEDIDOS,
  MODULOS_MEDIDOS,
  ORIGEN_DE_LA_CAPTURA,
  PERMISOS_MEDIDOS,
} from '../src/datos/seguridadMedida.ts';
import { MUNICIPALIDAD_MEDIDA, SESION_MEDIDA } from '../src/datos/sesionMedida.ts';
import { LLAVES } from '../src/datos/useCatalogoPermitido.ts';

/**
 * El envoltorio de paginacion, como lo manda el backend.
 *
 * Las dos listas van PAGINADAS y no peladas: `pedirPagina` devuelve el envoltorio entero y
 * `pedirLista` desenvuelve `contenido`. Con un arreglo suelto la composicion revienta con
 * «Cannot read properties of undefined (reading 'length')», un rojo que habla de `length` y no
 * de la forma de la respuesta.
 */
function comoPagina<T>(contenido: readonly T[]): Paginado<T> {
  return {
    contenido,
    pagina: 0,
    // El mismo que pide `RUTAS.accesos`.
    tamano: 200,
    totalElementos: contenido.length,
    totalPaginas: 1,
    hayMas: false,
  };
}

/**
 * Pone las tres respuestas de seguridad en la cache, ya contestadas.
 *
 * <h2>Por que hace falta `staleTime` y no basta con `setQueryData`</h2>
 *
 * Porque una consulta sembrada **sigue teniendo su `queryFn`**, y con el `staleTime` por omision
 * —cero— el dato nace rancio: React Query lo ensena y sale a refrescarlo al montar. Sin backend
 * ese refresco falla, y una consulta que falla pasa a `status: 'error'` **aunque conserve el
 * dato**; `useCatalogoPermitido` mira `isError` antes que nada, asi que la pantalla acabaria
 * ensenando el mismo «No se pudo saber que modulos puede abrir esta cuenta» que esto viene a
 * quitar — despues de haber dibujado el arbol un instante.
 *
 * Con el dato fresco para siempre, la `queryFn` no llega a correr: no hay ninguna peticion de
 * seguridad, que es justo lo que «sin backend» significa.
 *
 * Se acota a la rama `seguridad`: la cuenta y la municipalidad tambien viven ahi (`LLAVES.sesion`,
 * `LLAVES.municipalidad`), y nada mas se siembra: desde #84 seis pantallas piden sus datos, y sin
 * backend tienen que fallar de verdad. Una cifra sembrada se leeria como contestada.
 */
export function sembrarElCatalogo(): void {
  CONSULTAS.setQueryDefaults(LLAVES.rama, { staleTime: Infinity, gcTime: Infinity });
  CONSULTAS.setQueryData(LLAVES.modulos, MODULOS_MEDIDOS);
  CONSULTAS.setQueryData(LLAVES.accesos, comoPagina(ACCESOS_MEDIDOS));
  CONSULTAS.setQueryData(LLAVES.permisos, PERMISOS_MEDIDOS);
  CONSULTAS.setQueryData(LLAVES.sesion, SESION_MEDIDA);
  CONSULTAS.setQueryData(LLAVES.municipalidad, MUNICIPALIDAD_MEDIDA);

  // Y se dice, porque una interfaz que se ve entera sin que nada este levantado es exactamente lo
  // que alguien puede confundir con «el backend contesto». Va por `warn` y no por `log`: la
  // consola de desarrollo tiene ruido, y esto tiene que leerse.
  console.warn(
    'caja-web: EL CATALOGO ESTA SEMBRADO, no pedido (VITE_KAMAYUK_SIN_PLATAFORMA=true).\n' +
      'El modulo, los accesos, la matriz de permisos y la cuenta salen de la captura de\n' +
      '`seguridadMedida.ts` y `sesionMedida.ts`, y no se fue a Keycloak.\n' +
      `Origen: ${ORIGEN_DE_LA_CAPTURA}\n` +
      'Para trabajar contra la plataforma levantada: `yarn dev:con-plataforma`.',
  );
}
