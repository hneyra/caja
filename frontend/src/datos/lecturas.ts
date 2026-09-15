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
 * las pantallas leen de sus hojas lo piden los conectores (`conectores.ts`, #84).
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

/** `ImporteActualizado`: la cifra en texto decimal y el dia al que corresponde (regla 9). */
export interface ImporteActualizado {
  readonly importe: string;
  readonly actualizadoA: string;
}

/** `CajaEnListaResource`. `areaCodigo` y `areaNombre` salen nulos en una caja sin area. */
export interface CajaEnLista {
  readonly codigo: string;
  readonly nombre: string;
  readonly areaCodigo: string | null;
  readonly areaNombre: string | null;
  readonly activa: boolean;
}

/** `ReciboEnListaResource`. `emitidoEn` es un instante en UTC: ver `conectores.ts`. */
export interface ReciboEnLista {
  readonly numero: string;
  readonly emitidoEn: string;
  readonly documentoDelPagador: string | null;
  readonly pagador: string | null;
  readonly importe: ImporteActualizado;
  readonly medioDePago: string;
  readonly duplicados: number;
  readonly estado: string;
}

/** `PagoController.PagoResource`: un pago del buzon de salida. */
export interface PagoDelBuzon {
  readonly pagoId: string;
  readonly tipo: string;
  readonly destino: string;
  readonly reciboId: number;
  readonly turnoId: number;
  readonly estado: string;
  readonly intentos: number;
  readonly ultimoError: string | null;
  readonly creadoEn: string;
  readonly entregadoEn: string | null;
  readonly explicacion: string | null;
}

/** `RecaudacionResource.FilaDeTributo`. */
export interface FilaDeTributo {
  readonly tributo: string;
  readonly cobrado: ImporteActualizado;
  readonly anulado: ImporteActualizado;
  readonly neto: ImporteActualizado;
}

/**
 * `RecaudacionResource.Avance`. `turno` solo llega pidiendo por caja y cajero, y la ventanilla no lo
 * pide: se declara para que la forma sea la entera, no para leerlo.
 */
export interface AvanceDeRecaudacion {
  readonly desde: string;
  readonly hasta: string;
  readonly aLaFecha: string;
  readonly filas: readonly FilaDeTributo[];
  readonly cobrado: ImporteActualizado;
  readonly anulado: ImporteActualizado;
  readonly neto: ImporteActualizado;
  readonly turno: unknown;
}

/** `RecaudacionResource.FilaDePartida`. Area y partida salen nulas en lo tributario, a proposito. */
export interface FilaDePartida {
  readonly area: string | null;
  readonly areaNombre: string | null;
  readonly partida: string | null;
  readonly tributo: string;
  readonly cobrado: ImporteActualizado;
  readonly anulado: ImporteActualizado;
  readonly neto: ImporteActualizado;
}

/** `RecaudacionResource.Distribucion`. */
export interface DistribucionDeRecaudacion {
  readonly desde: string;
  readonly hasta: string;
  readonly aLaFecha: string;
  readonly filas: readonly FilaDePartida[];
  readonly neto: ImporteActualizado;
  readonly netoSinPartida: ImporteActualizado;
}

/**
 * Las rutas que la ventanilla lee, relativas a `/caja/api/v1`.
 *
 * Las cinco primeras componen la sesion (#80). Las cinco de despues son lo que las pantallas leen
 * (#84), y cada una es un `GET` que su hoja declara en `arbol.ts`: lo exige
 * `src/datos/conectores.test.ts`, y `verificaciones/camino-a-la-api.test.ts` las busca en los controladores.
 */
export const RUTAS = {
  sesion: '/seguridad/sesion',
  municipalidadDeLaSesion: '/seguridad/sesion/municipalidad',
  modulos: '/seguridad/modulos',
  // `tamano` a 200 por lo que `rentas` midio con sus 134: con el tamano por omision —20— llegan los
  // veinte primeros por codigo y el arbol pierde hojas sin decirlo. Aqui son siete, pero el dia que
  // sean mas no tiene que acordarse nadie. El backend admite hasta 500.
  accesos: '/seguridad/accesos?tamano=200',
  permisosDeLaSesion: '/seguridad/sesion/permisos',
  // `tamano` a 200 por lo mismo que los accesos: las cajas de una municipalidad caben en una pagina,
  // y con el tamano por omision la tabla perderia las que pasan de veinte sin decirlo.
  cajas: '/cajas?tamano=200',
  recibos: '/recibos',
  pagosSinEntregar: '/pagos/sin-entregar',
  avanceDeRecaudacion: '/recaudacion/avance',
  recaudacionPorArea: '/recaudacion/por-area',
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
