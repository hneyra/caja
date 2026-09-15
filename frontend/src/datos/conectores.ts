import { formatearFecha, formatearImporte } from '@kamayuk/formato';
import { coordenada, type Coordenada } from '@kamayuk/ui';

import type { ClaveDeHoja } from '../pantallas/arbol.ts';
import type {
  AvanceDeRecaudacion,
  CajaEnLista,
  DistribucionDeRecaudacion,
  PagoDelBuzon,
  Paginado,
  ReciboEnLista,
} from './lecturas.ts';
import { RUTAS, pedirPagina, pedirUno } from './lecturas.ts';

/**
 * **Que pantalla de la ventanilla pide que, y que de lo que llega dibuja cada campo** (#84).
 *
 * Es la forma de `rentas` (`rentas`#97): un conector por hoja, con UNA lectura y un reparto puro de
 * lo que contesta a las coordenadas de su definicion.
 *
 * <h2>Por que son estas cinco lecturas y no las nueve que el arbol declara</h2>
 *
 * Una lectura se conecta si la pantalla puede pedirla **con lo que ya tiene**. Tres no pueden, y
 * cada una lo dice en su hueco en vez de inventarse lo que le falta:
 *
 *   · **El arqueo del turno** (`GET /turnos/{turnoId}/cierre`): ninguna lectura publica el
 *     `turnoId` de la ventanilla. Sin el, pedirlo seria adivinar un numero.
 *   · **La conciliacion** (`GET /conciliacion?fecha=`): exige la fecha, y la pantalla no deja
 *     elegirla. Ponerle «hoy» del reloj del navegador seria decidir por quien concilia que dia mira.
 *   · **El recibo elegido** (`GET /recibos/{nro}/duplicado`): no hay con que elegirlo.
 *
 * <h2>Lo que NO se hace, y es la regla que gobierna este archivo</h2>
 *
 * **No se calcula nada que la operacion no publica.** Los totales del avance y de la distribucion
 * los calcula el backend y viajan hechos; aqui solo se formatean. Una suma de las filas en el cliente
 * daria el mismo numero casi siempre, y el dia que no, nadie sabria cual de los dos creer.
 *
 * <h2>Las horas son de Lima, y no del navegador</h2>
 *
 * `emitidoEn` y `creadoEn` llegan como instantes en UTC. Cortar los diez primeros caracteres
 * fecharia un cobro de las nueve de la noche en el dia siguiente —el mismo caso que
 * `CierreDeCajaJdbcTest` planta en el backend—, y formatear con la zona del navegador haria que el
 * mismo recibo dijera horas distintas en dos puestos. Se formatean en `America/Lima`, que es la hora
 * de las municipalidades a las que sirve el producto.
 */

/** Lo que una pantalla saca de una respuesta. */
export interface Reparto {
  /** Los campos de solo lectura que SI salen de lo que llego. */
  readonly valores: ReadonlyMap<Coordenada, string>;
  /** Las filas de la tabla de cada bloque, por indice de bloque. */
  readonly filas: ReadonlyMap<number, readonly (readonly string[])[]>;
  /** El conteo de la barra de una tabla, cuando lo que llego es una pagina de un total mayor. */
  readonly conteos: ReadonlyMap<number, string>;
  /** Los campos que esta lectura NO trae, con la palabra que va en su hueco. */
  readonly sinDato: ReadonlyMap<Coordenada, string>;
}

export interface Conector {
  /** La clave de consulta de TanStack. Lleva la hoja dentro: dos pantallas no comparten cache. */
  readonly clave: readonly string[];
  /** La ruta que pide, tal cual esta en `RUTAS`. La guarda la compara con las lecturas de su hoja. */
  readonly ruta: string;
  readonly pedir: (senal: AbortSignal) => Promise<unknown>;
  readonly repartir: (respuesta: never) => Reparto;
  /**
   * Lo que se dice arriba de la pantalla cuando la lectura contesto: el porque de los huecos que
   * quedan. Vacio cuando no queda ninguno, y entonces no se dibuja la alerta.
   */
  readonly explicacion: string;
  /** La palabra de las tablas que esta lectura no llena. */
  readonly enElCampo: string;
}

/** Las palabras de los huecos que una lectura que SI contesto deja. Todas pasan por el locale. */
export const SIN_ELEGIR = 'sin elegir';
export const SIN_TURNO = 'sin turno';
export const SIN_FECHA = 'sin fecha';
export const SIN_PEDIR_AQUI = 'sin pedir';

const EXPLICACION_DEL_RECIBO =
  'Esta pantalla lee la lista de recibos. El recibo elegido se pide al elegirlo, y elegir uno todavía no está disponible.';

const EXPLICACION_DEL_CIERRE =
  'Esta pantalla lee los pagos sin entregar. El arqueo necesita el turno, y ninguna lectura publica todavía cuál es; la conciliación necesita la fecha, y elegirla todavía no está disponible.';

/** Todas las frases que este archivo pone en pantalla, para el catalogo del locale. */
export const FRASES_DE_LOS_CONECTORES: readonly string[] = [
  SIN_ELEGIR,
  SIN_TURNO,
  SIN_FECHA,
  SIN_PEDIR_AQUI,
  EXPLICACION_DEL_RECIBO,
  EXPLICACION_DEL_CIERRE,
];

/** La marca de un nulo en una celda. No es una palabra, asi que no pasa por el locale. */
const NULO = '—';

/** La zona de las municipalidades del producto. Ver el javadoc de arriba. */
const ZONA_HORARIA = 'America/Lima';

const HORA_DE_LIMA = new Intl.DateTimeFormat('es-PE', {
  timeZone: ZONA_HORARIA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Un instante en UTC, dicho con la fecha y la hora de Lima: `15/03/2026 21:04`. */
export function instanteEnLima(instante: string): string {
  const partes = HORA_DE_LIMA.formatToParts(new Date(instante));
  const de = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === tipo)?.value ?? '';
  return `${de('day')}/${de('month')}/${de('year')} ${de('hour')}:${de('minute')}`;
}

/** El conteo de una pagina: nada si llego entera, `20 / 356` si no. */
function conteoDe(bloque: number, pagina: Paginado<unknown>): ReadonlyMap<number, string> {
  return pagina.hayMas
    ? new Map([[bloque, `${String(pagina.contenido.length)} / ${String(pagina.totalElementos)}`]])
    : new Map();
}

/** Todos los campos de un bloque con la misma palabra. */
function bloqueSinDato(bloque: number, campos: number, palabra: string): [Coordenada, string][] {
  return Array.from({ length: campos }, (_, i) => [coordenada(bloque, i), palabra]);
}

/** `caja-tributaria` y `caja-tasas`: las mismas ventanillas, en la tabla del primer bloque. */
function cajasDe(hoja: ClaveDeHoja): Conector {
  return {
    clave: [hoja, 'cajas'],
    ruta: RUTAS.cajas,
    pedir: (senal) => pedirPagina<CajaEnLista>(RUTAS.cajas, senal),
    repartir: (pagina: Paginado<CajaEnLista>): Reparto => ({
      valores: new Map(),
      filas: new Map([
        [
          0,
          pagina.contenido.map((c) => [
            c.codigo,
            c.nombre,
            c.areaNombre ?? c.areaCodigo ?? NULO,
            // En mayusculas, como los estados que el backend publica: es un dato, no una frase.
            c.activa ? 'ACTIVA' : 'INACTIVA',
          ]),
        ],
      ]),
      conteos: conteoDe(0, pagina),
      sinDato: new Map(),
    }),
    explicacion: '',
    enElCampo: '',
  };
}

/** `duplicado-recibo`: la lista; el recibo elegido espera a que se pueda elegir. */
const DUPLICADO_RECIBO: Conector = {
  clave: ['duplicado-recibo', 'recibos'],
  ruta: RUTAS.recibos,
  pedir: (senal) => pedirPagina<ReciboEnLista>(RUTAS.recibos, senal),
  repartir: (pagina: Paginado<ReciboEnLista>): Reparto => ({
    valores: new Map(),
    filas: new Map([
      [
        0,
        pagina.contenido.map((r) => [
          r.numero,
          instanteEnLima(r.emitidoEn),
          r.documentoDelPagador ?? NULO,
          r.pagador ?? NULO,
          formatearImporte(r.importe.importe),
          r.medioDePago,
          String(r.duplicados),
          r.estado,
        ]),
      ],
    ]),
    conteos: conteoDe(0, pagina),
    sinDato: new Map(bloqueSinDato(1, 8, SIN_ELEGIR)),
  }),
  explicacion: EXPLICACION_DEL_RECIBO,
  enElCampo: SIN_ELEGIR,
};

/** `cierre-caja`: los pagos en transito, que son lo que impide cerrar. */
const CIERRE_CAJA: Conector = {
  clave: ['cierre-caja', 'pagos-sin-entregar'],
  ruta: RUTAS.pagosSinEntregar,
  pedir: (senal) => pedirUno<readonly PagoDelBuzon[]>(RUTAS.pagosSinEntregar, senal),
  repartir: (pagos: readonly PagoDelBuzon[]): Reparto => ({
    valores: new Map(),
    filas: new Map([
      [
        1,
        pagos.map((p) => [
          p.pagoId,
          p.destino,
          String(p.reciboId),
          String(p.intentos),
          p.ultimoError ?? NULO,
          instanteEnLima(p.creadoEn),
          p.estado,
        ]),
      ],
    ]),
    conteos: new Map(),
    sinDato: new Map([...bloqueSinDato(0, 10, SIN_TURNO), ...bloqueSinDato(2, 2, SIN_FECHA)]),
  }),
  explicacion: EXPLICACION_DEL_CIERRE,
  enElCampo: SIN_PEDIR_AQUI,
};

/** `avance-recaudacion`: el periodo, sus tres totales y una fila por concepto. */
const AVANCE_RECAUDACION: Conector = {
  clave: ['avance-recaudacion', 'avance'],
  ruta: RUTAS.avanceDeRecaudacion,
  pedir: (senal) => pedirUno<AvanceDeRecaudacion>(RUTAS.avanceDeRecaudacion, senal),
  repartir: (avance: AvanceDeRecaudacion): Reparto => ({
    valores: new Map([
      [coordenada(0, 0), formatearFecha(avance.desde)],
      [coordenada(0, 1), formatearFecha(avance.hasta)],
      [coordenada(0, 2), formatearFecha(avance.aLaFecha)],
      [coordenada(0, 3), formatearImporte(avance.cobrado.importe)],
      [coordenada(0, 4), formatearImporte(avance.anulado.importe)],
      [coordenada(0, 5), formatearImporte(avance.neto.importe)],
    ]),
    filas: new Map([
      [
        0,
        avance.filas.map((f) => [
          f.tributo,
          formatearImporte(f.cobrado.importe),
          formatearImporte(f.anulado.importe),
          formatearImporte(f.neto.importe),
        ]),
      ],
    ]),
    conteos: new Map(),
    sinDato: new Map(),
  }),
  explicacion: '',
  enElCampo: '',
};

/** `recaudacion-area`: el periodo, el neto, lo que no tiene partida y una fila por grupo. */
const RECAUDACION_AREA: Conector = {
  clave: ['recaudacion-area', 'por-area'],
  ruta: RUTAS.recaudacionPorArea,
  pedir: (senal) => pedirUno<DistribucionDeRecaudacion>(RUTAS.recaudacionPorArea, senal),
  repartir: (distribucion: DistribucionDeRecaudacion): Reparto => ({
    valores: new Map([
      [coordenada(0, 0), formatearFecha(distribucion.desde)],
      [coordenada(0, 1), formatearFecha(distribucion.hasta)],
      [coordenada(0, 2), formatearFecha(distribucion.aLaFecha)],
      [coordenada(0, 3), formatearImporte(distribucion.neto.importe)],
      [coordenada(0, 4), formatearImporte(distribucion.netoSinPartida.importe)],
    ]),
    filas: new Map([
      [
        0,
        distribucion.filas.map((f) => [
          // Nulos en lo tributario, y el backend lo decide a proposito: no se sustituyen por la
          // partida de la caja ni por un «varios». Se marca el hueco.
          f.areaNombre ?? f.area ?? NULO,
          f.partida ?? NULO,
          f.tributo,
          formatearImporte(f.cobrado.importe),
          formatearImporte(f.anulado.importe),
          formatearImporte(f.neto.importe),
        ]),
      ],
    ]),
    conteos: new Map(),
    sinDato: new Map(),
  }),
  explicacion: '',
  enElCampo: '',
};

/** Las hojas que piden de verdad. `anulacion-recibo` solo escribe, y lo dice `porQueNoHayDato.ts`. */
export const CONECTORES: Readonly<Partial<Record<ClaveDeHoja, Conector>>> = {
  'caja-tributaria': cajasDe('caja-tributaria'),
  'caja-tasas': cajasDe('caja-tasas'),
  'duplicado-recibo': DUPLICADO_RECIBO,
  'cierre-caja': CIERRE_CAJA,
  'avance-recaudacion': AVANCE_RECAUDACION,
  'recaudacion-area': RECAUDACION_AREA,
};
