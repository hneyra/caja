import { leer } from '../api/cliente.ts';

/**
 * **Lo que la ventanilla lee de su backend, con la forma en que lo publica** (#74).
 *
 * Son las cinco lecturas de seguridad y de sesion que `caja` publica desde #80 (ADR-0042), con los
 * nombres de campo de sus `Resource` y los mismos que `rentas` usa para las suyas: `permisos.ts` y
 * `useCatalogoPermitido.ts` se copiaron de alli, y una forma distinta obligaria a reescribirlos por
 * una diferencia que no significa nada.
 *
 * **Todo cuelga de `/caja/api/v1`** —lo pone `cliente.ts`— y nada de aqui nombra otra API. Lo que
 * las pantallas leen de sus hojas llega con los conectores (#74, fila C2).
 */

/** Una pagina, tal como la publica `RespuestaPaginada`. */
export interface Paginado<T> {
  readonly contenido: readonly T[];
  readonly pagina: number;
  readonly tamano: number;
  readonly totalElementos: number;
  readonly totalPaginas: number;
  readonly hayMas: boolean;
}

/** `ModuloResource`. */
export interface ModuloDelSistema {
  readonly id: number;
  readonly codigo: string;
  readonly nombre: string;
  readonly orden: number;
  readonly activo: boolean;
}

/** `AccesoResource`. */
export interface AccesoDelSistema {
  readonly id: number;
  readonly moduloId: number;
  readonly tipo: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly activo: boolean;
}

/** Lo que contesta `/seguridad/sesion/permisos`: `codigo → privilegios`, y `{}` si no hay ninguno. */
export type PermisosDeLaSesion = Readonly<Record<string, readonly string[]>>;

/**
 * `IdentidadResource`: la cuenta del token, **tal como la conoce la copia de esta caja**.
 *
 * Tres campos y no los cuatro de `rentas`: aqui no hay ejercicio de trabajo que cambiar.
 */
export interface SesionDeLaVentanilla {
  readonly usuarioId: number;
  readonly cuenta: string;
  readonly nombre: string;
}

/** `MunicipalidadResource`: la del token. Es lo que la barra dice debajo del nombre de la cuenta. */
export interface MunicipalidadDeLaSesion {
  readonly id: number;
  readonly ubigeo: string;
  readonly nombre: string;
  readonly tipo: string;
}

/** Las rutas de seguridad y de sesion, relativas a `/caja/api/v1`. */
export const RUTAS = {
  sesion: '/seguridad/sesion',
  municipalidadDeLaSesion: '/seguridad/sesion/municipalidad',
  modulos: '/seguridad/modulos',
  // `tamano` a 200 por lo que `rentas` midio con sus 134: con el tamano por omision —20— llegan los
  // veinte primeros por codigo y el arbol pierde hojas sin decirlo. Aqui son siete, pero el dia que
  // sean mas no tiene que acordarse nadie. El backend admite hasta 500.
  accesos: '/seguridad/accesos?tamano=200',
  permisosDeLaSesion: '/seguridad/sesion/permisos',
} as const;

/** El contenido de una pagina. Para los catalogos, que caben enteros en una. */
export async function pedirLista<T>(ruta: string, senal?: AbortSignal): Promise<readonly T[]> {
  const pagina = await leer<Paginado<T>>(ruta, senal);
  return pagina.contenido;
}

/** Una pagina entera, cuando importa cuantas hay. */
export function pedirPagina<T>(ruta: string, senal?: AbortSignal): Promise<Paginado<T>> {
  return leer<Paginado<T>>(ruta, senal);
}

/** Un recurso suelto. */
export function pedirUno<T>(ruta: string, senal?: AbortSignal): Promise<T> {
  return leer<T>(ruta, senal);
}
