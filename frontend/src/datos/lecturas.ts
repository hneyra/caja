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

/**
 * `ReciboResource.LineaResource`: una linea del desglose congelado del recibo.
 *
 * **`cantidad` y `precioUnitario` llegan nulos cuando la linea no es una tasa**, y el backend lo
 * dice en su javadoc. Se marcan, no se sustituyen por un cero: en una linea de tributo no hay
 * ninguna cantidad que cobrar, y un `0` ahi seria una cifra que nadie calculo.
 *
 * Los cinco importes van cada uno con su fecha (regla 9). La ventanilla ensena `monto` —«el total
 * de la linea: la suma de las cuatro partes»— y no vuelve a sumarlas aqui.
 */
export interface LineaDelRecibo {
  readonly tributo: string;
  readonly concepto: string;
  readonly ejercicio: number | null;
  readonly predioId: number | null;
  readonly vehiculoId: number | null;
  readonly cantidad: number | null;
  readonly precioUnitario: ImporteActualizado | null;
  readonly insoluto: ImporteActualizado;
  readonly reajuste: ImporteActualizado;
  readonly interes: ImporteActualizado;
  readonly gasto: ImporteActualizado;
  readonly monto: ImporteActualizado;
}

/** `ReciboResource`: el recibo emitido, con su desglose. `emitidoEn` es un instante en UTC. */
export interface ReciboEmitido {
  readonly numero: string;
  readonly serie: string;
  readonly correlativo: number;
  readonly cajero: string;
  readonly formaDePago: string;
  readonly tipoDePago: string;
  readonly beneficioDeclarado: string | null;
  readonly emitidoEn: string;
  readonly total: ImporteActualizado;
  readonly lineas: readonly LineaDelRecibo[];
}

/** `DuplicadoResource.AnulacionBreve`: el acta, si la hubo. */
export interface AnulacionDelRecibo {
  readonly fecha: string;
  readonly motivo: string;
  readonly usuario: string | null;
}

/**
 * `DuplicadoResource`: la vista previa de un recibo antes de reimprimirlo.
 *
 * **Es la lectura pura**, `GET /recibos/{nro}/duplicado` **sin `?formato=`**: exige `LECTURA` sobre
 * `duplicado_recibo` —el mismo acceso que la hoja— y no escribe nada. La otra, la que lleva
 * `?formato=`, exige `IMPRESION` y **registra la reimpresion**: no esta en el arbol y no se pide.
 *
 * `estado` se deriva del movimiento de anulacion y no de ninguna columna: lo dice `DuplicadoResource`.
 */
export interface DuplicadoDeUnRecibo {
  readonly estado: string;
  readonly duplicados: number;
  readonly anulacion: AnulacionDelRecibo | null;
  readonly recibo: ReciboEmitido;
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

/** `TurnoDelDiaResource.TurnoResource`: un turno del cajero en una ventanilla. */
export interface TurnoDeLaVentanilla {
  readonly turnoId: number;
  readonly caja: string;
  readonly cajaNombre: string;
  readonly cajero: string;
  readonly fecha: string;
  readonly estadoDelTurno: string;
}

/**
 * `TurnoDelDiaResource`: cuál es la ventanilla de quien mira, hoy (#97).
 *
 * `situacion` es `SIN_ABRIR`, `ABIERTO`, `CERRADO` o `VARIOS_ABIERTOS`, y **no es un booleano a
 * propósito**: «no abrió» y «ya cerró» se arreglan en sitios distintos. Es de aquí de donde sale el
 * `turnoId` con el que se pide el arqueo, que hasta #97 ninguna lectura publicaba.
 */
export interface TurnoDelDia {
  readonly cajero: string;
  readonly fecha: string;
  readonly situacion: string;
  readonly turnos: readonly TurnoDeLaVentanilla[];
}

/** `ArqueoResource.LineaResource`. `declarado` y `diferencia` son nulos en el arqueo en vivo. */
export interface LineaDelArqueo {
  readonly formaDePago: string;
  readonly cobrado: ImporteActualizado;
  readonly anulado: ImporteActualizado;
  readonly neto: ImporteActualizado;
  readonly declarado: ImporteActualizado | null;
  readonly diferencia: ImporteActualizado | null;
}

/**
 * `ArqueoResource`.
 *
 * `declarado`, `diferencia` y `cuadra` llegan **nulos** mientras nadie haya contado el cajón, que
 * es siempre por esta ruta: un `GET` no lleva el recuento. No son cero (#97).
 */
export interface ArqueoDelTurno {
  readonly turnoId: number;
  readonly fecha: string;
  readonly recibosEmitidos: number;
  readonly recibosAnulados: number;
  readonly cobrado: ImporteActualizado;
  readonly anulado: ImporteActualizado;
  readonly neto: ImporteActualizado;
  readonly declarado: ImporteActualizado | null;
  readonly diferencia: ImporteActualizado | null;
  readonly cuadra: boolean | null;
  readonly lineas: readonly LineaDelArqueo[];
}

/** `EstadoDelCierreController.EstadoDelCierreResource`: si el turno puede cerrar, y su arqueo. */
export interface EstadoDelCierre {
  readonly turnoId: number;
  readonly puedeCerrar: boolean;
  readonly arqueo: ArqueoDelTurno;
  readonly cobradoConEvento: ImporteActualizado | null;
  readonly cobradoSinEvento: ImporteActualizado | null;
  readonly loQueImpideCerrar: readonly PagoDelBuzon[];
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
  // Con la variable entre llaves, igual que la escribe su `@GetMapping` y que la declara el arbol:
  // asi la guarda puede compararla sin conocer ningun numero. La compone `rutaDelDuplicado`.
  duplicadoDeUnRecibo: '/recibos/{nro}/duplicado',
  turnoDelDia: '/turnos/del-dia',
  // Lo mismo, con el turno entre llaves. La ruta de verdad la compone `rutaDelCierre`, con el
  // `turnoId` que `turnoDelDia` acaba de dar: dejar la plantilla escrita aqui es lo que hace que
  // `camino-a-la-api.test.ts` pueda buscarla en los `.java` sin conocer ningun numero.
  cierreDelTurno: '/turnos/{turnoId}/cierre',
  pagosSinEntregar: '/pagos/sin-entregar',
  avanceDeRecaudacion: '/recaudacion/avance',
  recaudacionPorArea: '/recaudacion/por-area',
} as const;

/**
 * La ruta del duplicado de un recibo, **sin `?formato=`** (#99).
 *
 * Ese parametro cambia de operacion: exige `IMPRESION` y registra la reimpresion (ADR-0040). Aqui
 * no se anade nunca, y por eso esta funcion no admite ninguno.
 *
 * El numero se codifica: un `001-000123` no lo necesita, pero la serie la pone cada instalacion y
 * un numero con una barra dentro partiria la ruta en dos.
 */
export function rutaDelDuplicado(numero: string): string {
  return RUTAS.duplicadoDeUnRecibo.replace('{nro}', encodeURIComponent(numero));
}

/** `GET /turnos/{turnoId}/cierre` con su turno puesto. El identificador sale de `turnoDelDia`. */
export function rutaDelCierre(turnoId: number): string {
  return RUTAS.cierreDelTurno.replace('{turnoId}', String(turnoId));
}

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
