import { formatearFecha, formatearImporte } from '@kamayuk/formato';
import { coordenada, type Ausencia, type Coordenada, type DatosDeUnaTabla, type EnLaRuta } from '@kamayuk/ui';

import { ErrorDeLaApi } from '../api/cliente.ts';
import type { ClaveDeHoja } from '../pantallas/arbol.ts';
import { NUMERO_DE_LA_FILA, TABLA_DE_LINEAS, TABLA_DE_RECIBOS } from '../pantallas/definiciones/tesoreria.ts';
import type {
  AvanceDeRecaudacion,
  CajaEnLista,
  DistribucionDeRecaudacion,
  DuplicadoDeUnRecibo,
  PagoDelBuzon,
  Paginado,
  ReciboEnLista,
} from './lecturas.ts';
import { RUTAS, pedirPagina, pedirUno, rutaDelDuplicado } from './lecturas.ts';

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
 *
 * **El tercero se cerro en #99**: `GET /recibos/{nro}/duplicado` ya se pide, porque la lista deja
 * elegir una fila y **lo elegido vive en la ruta**. Ver `LecturaDeLoElegido`, mas abajo.
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
  /**
   * Las filas de las tablas que declaran `clave` (`kamayuk-lib`#65), por esa clave.
   *
   * Es lo que hace falta cuando una fila lleva **mas que sus celdas**: el dato con que su boton
   * pide —el numero del recibo—, o la marca de estar elegida. Una tabla sin `clave` sigue tomando
   * sus filas de `filas`, por indice de bloque, y ninguna de las dos formas ve a la otra.
   */
  readonly tablas: ReadonlyMap<string, DatosDeUnaTabla>;
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
  /**
   * Lo que llego, repartido a las coordenadas de la definicion.
   *
   * `elegido` es lo que la hoja lleva en su ruta (#99), y **solo lo mira quien tiene algo que
   * elegir**: sirve para realzar la fila sobre la que se esta mirando el detalle. Los cinco
   * conectores que no eligen nada ni lo declaran.
   */
  readonly repartir: (respuesta: never, elegido?: string | null) => Reparto;
  /**
   * Lo que se dice arriba de la pantalla cuando la lectura contesto, y la palabra de los huecos
   * que deja. Con `explicacion: ''` no se dibuja la alerta: no queda ninguno.
   */
  readonly ausencia: Ausencia;
  /**
   * **La segunda lectura de la hoja: la que se pide con lo que se eligio** (#99).
   *
   * Ausente en seis de las siete. Cuando esta, manda sobre la ausencia de la pantalla: quien elige
   * una fila deja de leer «elija una» y pasa a leer lo que le pase a ESA lectura.
   */
  readonly deLoElegido?: LecturaDeLoElegido;
}

/**
 * **La lectura que no se puede pedir hasta que alguien elige, y que se pide con lo elegido** (#99).
 *
 * <h2>Por que lo elegido vive en la ruta y no en un estado</h2>
 *
 * Porque una ventanilla se recarga, y porque el recibo que hay que revisar se pasa por un enlace.
 * Con la eleccion en el estado del componente, las dos cosas devuelven la pantalla en blanco. En la
 * ruta —`#/duplicado-recibo/001-000123`, lo que `Destino.enLaRuta` declara— las dos la devuelven
 * igual. Quien la escribe es la accion de la fila; quien la lee es el gancho.
 */
export interface LecturaDeLoElegido {
  /** Donde vive lo elegido dentro de la ruta de la hoja. `'sujeto'` es el tramo del camino. */
  readonly enLaRuta: EnLaRuta;
  /** La clave de TanStack. **Lleva lo elegido dentro**: dos recibos no comparten cache. */
  readonly clave: (elegido: string) => readonly string[];
  /** La ruta con su variable entre llaves, como la declara la hoja. La guarda la compara con ella. */
  readonly ruta: string;
  readonly pedir: (elegido: string, senal: AbortSignal) => Promise<unknown>;
  /** Lo que esta lectura aporta a la pantalla, segun en cual de sus cuatro pasos este. */
  readonly repartir: (paso: PasoDeLoElegido) => Aporte;
}

/**
 * En que punto esta la segunda lectura.
 *
 * Son cuatro y no tres: **«nadie ha elegido todavia» no es «esta pidiendo»**. Confundirlos haria
 * que una pantalla recien abierta dijera que esta esperando una respuesta que nadie pidio.
 */
export type PasoDeLoElegido =
  | { readonly paso: 'sin-elegir' }
  | { readonly paso: 'pidiendo' }
  | { readonly paso: 'fallo'; readonly error: unknown }
  | { readonly paso: 'dato'; readonly respuesta: never };

/** Lo que la segunda lectura anade al reparto de la primera, y lo que se dice arriba mientras tanto. */
export interface Aporte {
  readonly reparto: Reparto;
  readonly ausencia: Ausencia;
}

/** Las palabras de los huecos que una lectura que SI contesto deja. Todas pasan por el locale. */
export const SIN_ELEGIR = 'sin elegir';
export const SIN_TURNO = 'sin turno';
export const SIN_FECHA = 'sin fecha';
export const SIN_PEDIR_AQUI = 'sin pedir';

/** Un reparto que no aporta nada: el de una lectura que todavia no tiene nada que repartir. */
const NADA: Reparto = {
  valores: new Map(),
  filas: new Map(),
  tablas: new Map(),
  conteos: new Map(),
  sinDato: new Map(),
};

/** Lo que dice una hoja que contesto entera y no deja ningun hueco. */
const SIN_HUECOS: Ausencia = { enElCampo: '', explicacion: '', tono: 'info' };

const ELIJA_UN_RECIBO: Ausencia = {
  enElCampo: SIN_ELEGIR,
  explicacion:
    'Esta pantalla lee la lista de recibos. Elija uno para ver lo que dice el papel que se entregó en ventanilla.',
  tono: 'info',
};

const PIDIENDO_EL_RECIBO: Ausencia = {
  enElCampo: 'pidiendo…',
  explicacion: 'Pidiendo el recibo elegido.',
  tono: 'info',
};

const RECIBO_QUE_NO_ESTA: Ausencia = {
  enElCampo: 'no está',
  explicacion:
    'Ese número de recibo no existe en esta municipalidad. La lista de arriba es la que contestó el sistema y sigue siendo válida.',
  tono: 'atencion',
};

const RECIBO_QUE_NO_LLEGO: Ausencia = {
  enElCampo: 'fallo',
  explicacion:
    'No se pudo pedir el recibo elegido. La lista de arriba es la que contestó el sistema y sigue siendo válida.',
  tono: 'atencion',
};

const EXPLICACION_DEL_CIERRE =
  'Esta pantalla lee los pagos sin entregar. El arqueo necesita el turno, y ninguna lectura publica todavía cuál es; la conciliación necesita la fecha, y elegirla todavía no está disponible.';

/** Todas las frases que este archivo pone en pantalla, para el catalogo del locale. */
export const FRASES_DE_LOS_CONECTORES: readonly string[] = [
  SIN_TURNO,
  SIN_FECHA,
  SIN_PEDIR_AQUI,
  EXPLICACION_DEL_CIERRE,
  ...[ELIJA_UN_RECIBO, PIDIENDO_EL_RECIBO, RECIBO_QUE_NO_ESTA, RECIBO_QUE_NO_LLEGO].flatMap((a) => [
    a.enElCampo,
    a.explicacion,
  ]),
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

/** El mismo conteo, para una tabla con `clave`: su barra lo saca de sus datos y no del bloque. */
function conteoDeLaTabla(pagina: Paginado<unknown>): { readonly conteo?: string } {
  return pagina.hayMas
    ? { conteo: `${String(pagina.contenido.length)} / ${String(pagina.totalElementos)}` }
    : {};
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
      tablas: new Map(),
      sinDato: new Map(),
    }),
    ausencia: SIN_HUECOS,
  };
}

/** Los ocho campos del bloque «El recibo elegido», todos con la misma palabra y sin sus lineas. */
const bloqueDelRecibo = (palabra: string): Reparto => ({
  ...NADA,
  sinDato: new Map(bloqueSinDato(1, 8, palabra)),
});

/**
 * Por que no llego el recibo elegido.
 *
 * **El 404 se dice aparte del resto**, y no es cosmetico: un numero que no existe se arregla
 * eligiendo otro, y un fallo de red se arregla volviendo a intentarlo. La frase dice ademas que la
 * lista sigue siendo buena, porque lo es: esta lectura falló, la de arriba no.
 */
function alNoLlegarElRecibo(error: unknown): Ausencia {
  const estado = error instanceof ErrorDeLaApi ? error.estado : null;
  return estado === 404 ? RECIBO_QUE_NO_ESTA : RECIBO_QUE_NO_LLEGO;
}

/** El bloque «El recibo elegido» con lo que contesto `GET /recibos/{nro}/duplicado`. */
function conElDuplicado(duplicado: DuplicadoDeUnRecibo): Aporte {
  const recibo = duplicado.recibo;
  return {
    reparto: {
      valores: new Map([
        [coordenada(1, 0), recibo.numero],
        // Derivado del movimiento de anulacion por el backend, no de ninguna columna.
        [coordenada(1, 1), duplicado.estado],
        [coordenada(1, 2), recibo.cajero],
        [coordenada(1, 3), recibo.formaDePago],
        [coordenada(1, 4), instanteEnLima(recibo.emitidoEn)],
        [coordenada(1, 5), String(duplicado.duplicados)],
        // El total viaja hecho y con su fecha (regla 9). No se suman las lineas aqui.
        [coordenada(1, 6), formatearImporte(recibo.total.importe)],
        [coordenada(1, 7), formatearFecha(recibo.total.actualizadoA)],
      ]),
      filas: new Map(),
      tablas: new Map([
        [
          TABLA_DE_LINEAS,
          {
            filas: recibo.lineas.map((linea) => ({
              celdas: [
                `${linea.tributo} · ${linea.concepto}`,
                // Nulos deliberados del backend cuando la linea no es una tasa: se marcan.
                linea.cantidad === null ? NULO : String(linea.cantidad),
                linea.precioUnitario === null ? NULO : formatearImporte(linea.precioUnitario.importe),
                formatearImporte(linea.monto.importe),
              ],
            })),
          },
        ],
      ]),
      conteos: new Map(),
      sinDato: new Map(),
    },
    ausencia: SIN_HUECOS,
  };
}

/**
 * **El recibo elegido** (#99): `GET /recibos/{nro}/duplicado`, sin `?formato=`.
 *
 * Es la lectura pura —`LECTURA` sobre `duplicado_recibo`, el mismo acceso que la hoja—, y por eso
 * la ventanilla puede pedirla sin dejar de ser de solo lectura (ADR-0040). La que lleva `?formato=`
 * exige `IMPRESION`, **registra la reimpresion** y no esta ni en el arbol ni aqui.
 */
const EL_RECIBO_ELEGIDO: LecturaDeLoElegido = {
  enLaRuta: 'sujeto',
  clave: (numero) => ['duplicado-recibo', 'duplicado', numero],
  ruta: RUTAS.duplicadoDeUnRecibo,
  pedir: (numero, senal) => pedirUno<DuplicadoDeUnRecibo>(rutaDelDuplicado(numero), senal),
  repartir: (paso) => {
    if (paso.paso === 'dato') return conElDuplicado(paso.respuesta as DuplicadoDeUnRecibo);
    const ausencia =
      paso.paso === 'sin-elegir'
        ? ELIJA_UN_RECIBO
        : paso.paso === 'pidiendo'
          ? PIDIENDO_EL_RECIBO
          : alNoLlegarElRecibo(paso.error);
    return { reparto: bloqueDelRecibo(ausencia.enElCampo), ausencia };
  },
};

/**
 * `duplicado-recibo`: la lista, con una fila elegible; el recibo elegido lo trae `EL_RECIBO_ELEGIDO`.
 */
const DUPLICADO_RECIBO: Conector = {
  clave: ['duplicado-recibo', 'recibos'],
  ruta: RUTAS.recibos,
  pedir: (senal) => pedirPagina<ReciboEnLista>(RUTAS.recibos, senal),
  repartir: (pagina: Paginado<ReciboEnLista>, elegido?: string | null): Reparto => ({
    valores: new Map(),
    filas: new Map(),
    tablas: new Map([
      [
        TABLA_DE_RECIBOS,
        {
          filas: pagina.contenido.map((r) => ({
            clave: r.numero,
            celdas: [
              r.numero,
              instanteEnLima(r.emitidoEn),
              r.documentoDelPagador ?? NULO,
              r.pagador ?? NULO,
              formatearImporte(r.importe.importe),
              r.medioDePago,
              String(r.duplicados),
              r.estado,
            ],
            // Lo que el boton de la fila lee para pedir el duplicado de ESTE recibo. Va en los
            // datos y no en la celda: una celda es lo que se lee, y el numero tiene que viajar
            // aunque la columna cambie de sitio.
            datos: new Map([[NUMERO_DE_LA_FILA, r.numero]]),
            // La fila sobre la que se esta mirando el detalle, realzada y con `aria-current`.
            ...(r.numero === elegido ? { realzada: true } : {}),
          })),
          ...conteoDeLaTabla(pagina),
        },
      ],
    ]),
    conteos: new Map(),
    sinDato: new Map(),
  }),
  ausencia: ELIJA_UN_RECIBO,
  deLoElegido: EL_RECIBO_ELEGIDO,
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
    tablas: new Map(),
    sinDato: new Map([...bloqueSinDato(0, 10, SIN_TURNO), ...bloqueSinDato(2, 2, SIN_FECHA)]),
  }),
  ausencia: { enElCampo: SIN_PEDIR_AQUI, explicacion: EXPLICACION_DEL_CIERRE, tono: 'info' },
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
    tablas: new Map(),
    sinDato: new Map(),
  }),
  ausencia: SIN_HUECOS,
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
    tablas: new Map(),
    sinDato: new Map(),
  }),
  ausencia: SIN_HUECOS,
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
