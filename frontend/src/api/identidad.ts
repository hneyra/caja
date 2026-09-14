import {
  crearIdentidad,
  type FallaDeLaPuerta,
  type Identidad,
  type PaginaDeLaCuenta,
  type Vuelta,
} from '@kamayuk/sesion';

import { configuracion } from './configuracion.ts';

/**
 * La puerta de identidad de la ventanilla: **la de `@kamayuk/sesion`, con las senias de `caja`** (#74).
 *
 * <h2>Aqui no hay un flujo PKCE, y es la diferencia con `rentas`</h2>
 *
 * `rentas/frontend/src/api/identidad.ts` son 537 lineas: el canje, el tope de idas, la sonda del
 * emisor (#112) y la consola de la cuenta (#115), escritos alli antes de que la libreria existiera.
 * `caja` es el primer sistema que **no** los copia: desde `kamayuk-lib`#42 los trae
 * `crearIdentidad`, y lo que queda aqui son las cuatro decisiones que son de este sistema.
 *
 *   · **`prefijoDeClaves: 'kamayuk.caja'`.** Las cuatro interfaces se sirven del mismo origen y
 *     comparten el almacenamiento de la pestana: sin prefijo propio, abrir la ventanilla en una pestana pisaria el
 *     verificador PKCE de `rentas` en la de al lado.
 *   · **`retorno`: la raiz DE LA APLICACION**, `origin + /caja/`, no la del sitio. Es la leccion de
 *     `rentas`#71, que ADR-0040 manda traer pagada: con la raiz del sitio el emisor devuelve al
 *     usuario a la interfaz de otro sistema. Y `vitest.config.ts` comparte la `base` para que la
 *     prueba que lo fija no afirme el valor equivocado siendo coherente.
 *   · **`destinoPorOmision: '#/'`**, el armazon sin ninguna hoja abierta. No se elige una hoja: la
 *     que se eligiera podria ser justo la que esta cuenta no puede abrir, y el armazon diria «este
 *     destino no se ofrece» nada mas entrar.
 *   · **Las senias salen de `configuracion()`**, y se leen al usar la puerta y no al importar este
 *     modulo: ver la cabecera de `configuracion.ts`.
 *
 * <h2>Por que las funciones sueltas, y no el objeto</h2>
 *
 * `arranque.ts`, `aplicacion.tsx` y `cliente.ts` las importan por nombre, igual que en `rentas`. Es
 * lo que deja que este archivo sea la unica costura con la libreria: el dia que la puerta cambie de
 * forma, cambia aqui.
 *
 * <h2>Y el token sigue en memoria</h2>
 *
 * Lo guarda la instancia de `crearIdentidad`, en una variable y no en el almacenamiento del
 * navegador: en una PC de ventanilla que tres turnos comparten, un token persistido sobrevive al
 * cierre del navegador. Lo vigila la prohibicion `token-en-almacenamiento`.
 */

export type { FallaDeLaPuerta, PaginaDeLaCuenta, Vuelta };

/** Las senias con que se construyo la puerta vigente, para saber si hay que construir otra. */
let construidaCon: string | null = null;
let vigente: Identidad | null = null;

/**
 * La puerta, construida con las senias de AHORA.
 *
 * Se construye la primera vez que se usa y se reutiliza mientras las senias no cambien. En la
 * aplicacion no cambian nunca —`configuracion.js` corre antes que el paquete—; en las pruebas si, y
 * una puerta congelada con las de la prueba anterior mandaria al emisor equivocado siendo verde.
 */
function puerta(): Identidad {
  const senias = {
    realm: configuracion('oidcRealm'),
    cliente: configuracion('oidcCliente'),
    alcance: configuracion('oidcAlcance'),
    retorno: `${window.location.origin}${import.meta.env.BASE_URL}`,
    destinoPorOmision: '#/',
    prefijoDeClaves: 'kamayuk.caja',
  };
  const huella = JSON.stringify(senias);
  if (vigente === null || construidaCon !== huella) {
    vigente = crearIdentidad(senias);
    construidaCon = huella;
  }
  return vigente;
}

/** El token vigente, o `null` si no hay. Es lo que `cliente.ts` pone en `Authorization`. */
export const token = (): string | null => puerta().token();

/** Fija el token a mano. Solo lo usan las pruebas y el arnes: la aplicacion lo obtiene del canje. */
export const fijarToken = (nuevo: string | null, identidad: string | null = null): void => {
  puerta().fijarToken(nuevo, identidad);
};

/** Si este navegador puede calcular S256. Sin `crypto.subtle` no hay puerta a la que ir. */
export const hayPuerta = (): boolean => puerta().hayPuerta();

/** Si quedan idas antes del tope que corta el bucle. */
export const puedeIrALaPuerta = (): boolean => puerta().puedeIrALaPuerta();

/** Si se acaba de cerrar sesion: entonces no se vuelve a la puerta sola. */
export const vieneDeSalir = (): boolean => puerta().vieneDeSalir();

/** Olvida la parada de «acaba de salir». */
export const olvidarLaParada = (): void => {
  puerta().olvidarLaParada();
};

/**
 * Manda al emisor, **o dice por que no se pudo** (`rentas`#112, en la libreria desde `kamayuk-lib`#42).
 *
 * `null` es que la navegacion salio y la pagina se va; una `FallaDeLaPuerta` es que el emisor no
 * contesto y nadie salio de aqui, y entonces hay que montar para explicarlo.
 */
export const entrar = (): Promise<FallaDeLaPuerta | null> => puerta().entrar();

/** Si la URL trae el `code` de vuelta del emisor, lo canjea y limpia la barra. */
export const canjearSiVuelve = (): Promise<Vuelta> => puerta().canjearSiVuelve();

/** Cierra la sesion aqui y en el emisor. */
export const salir = (): void => {
  puerta().salir();
};

/** A donde lleva «Mi perfil» o «Cambiar la contrasena»: la consola de cuenta del emisor. */
export const urlDeLaCuenta = (pagina: PaginaDeLaCuenta): string => puerta().urlDeLaCuenta(pagina);

/** Abre esa consola en otra pestana. La contrasena la guarda el emisor, no este sistema (ADR-0039). */
export const abrirLaCuenta = (pagina: PaginaDeLaCuenta): void => {
  puerta().abrirLaCuenta(pagina);
};
