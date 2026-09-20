import { formatearFecha, formatearImporte } from '@kamayuk/formato';
import {
  coordenada,
  type Ausencia,
  type Coordenada,
  type DatoConNombre,
  type DatosDeUnaTabla,
  type EnLaRuta,
  type EstadoDeUnaLectura,
} from '@kamayuk/ui';
import { peldanoDe } from '@kamayuk/sesion';

import { ErrorDeLaApi } from '../api/cliente.ts';
import type { ClaveDeHoja } from '../pantallas/arbol.ts';
import {
  ESTADO_DEL_RECIBO,
  LECTURA_DE_LA_CONCILIACION,
  NUMERO_DE_LA_FILA,
  NUMERO_DEL_RECIBO,
  TABLA_DE_LINEAS,
  TABLA_DE_RECIBOS,
} from '../pantallas/definiciones/tesoreria.ts';
import type {
  AvanceDeRecaudacion,
  CajaEnLista,
  ConciliacionDelDia,
  DistribucionDeRecaudacion,
  DuplicadoDeUnRecibo,
  EstadoDelCierre,
  ImporteActualizado,
  PagoDelBuzon,
  Paginado,
  ReciboEnLista,
  TurnoDelDia,
} from './lecturas.ts';
import { RUTAS, pedirPagina, pedirUno, rutaDeLaConciliacion, rutaDelCierre, rutaDelDuplicado } from './lecturas.ts';

/**
 * **Que pantalla de la ventanilla pide que, y que de lo que llega dibuja cada campo** (#84).
 *
 * Es la forma de `rentas` (`rentas`#97): un conector por hoja, con UNA lectura y un reparto puro de
 * lo que contesta a las coordenadas de su definicion.
 *
 * <h2>Que se conecta y que no, y por que</h2>
 *
 * Una lectura se conecta si la pantalla puede pedirla **con lo que ya tiene**, o si puede **ofrecer
 * elegir lo que le falta**. De los tres huecos que #84 declaro **no queda ninguno**, y cada uno se
 * cerro por un camino distinto:
 *
 *   · **El recibo elegido, en #99**: `GET /recibos/{nro}/duplicado` se pide porque la lista deja
 *     elegir una fila y **lo elegido vive en la ruta**. Ver `LecturaDeLoElegido`, mas abajo.
 *   · **El arqueo del turno, en #97**: lo era porque ninguna lectura publicaba el `turnoId`, y
 *     pedirlo habria sido adivinar un numero; ahora lo publica `GET /turnos/del-dia`, y
 *     `cierre-caja` **encadena** —pide su turno, y si tiene uno abierto pide el arqueo de ESE—.
 *   · **La conciliacion, en #98**: `GET /conciliacion?fecha=` exige un dia, y **la hoja lo ofrece
 *     elegir** con un selector cuyo valor vive en la ruta (`eleccion.enLaRuta`, `kamayuk-lib`#94).
 *     Sigue sin ponerse «hoy» del reloj del navegador: seria decidir por quien concilia que dia
 *     mira, y ademas la regla 6 lo prohibe — lo escribe el javadoc de `ConciliacionController`.
 *
 * <h2>Dos maneras distintas de pedir una segunda lectura, y no se confunden</h2>
 *
 * `deLoElegido` es la de lo que **elige una persona**: sale de la **ruta**, porque tiene que
 * sobrevivir a una recarga y viajar en un enlace. La usan `duplicado-recibo` —con el numero en el
 * sujeto— y, desde #98, `cierre-caja` —con el dia en `?fecha=`—; que una sea un recibo y la otra
 * un dia no cambia el mecanismo, y por eso no hay un tercero.
 *
 * Lo que `cierre-caja` **no** puede pedir asi es su arqueo: el `turnoId` no lo elige nadie, **sale
 * de la respuesta anterior**, asi que esa cadena vive dentro de un solo `pedir` y por eso
 * `Conector.rutas` es una lista. La misma hoja usa las dos, y no se estorban: son dos preguntas
 * distintas —de quien es el turno, y que dia se concilia— y solo la segunda la contesta quien mira.
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
  /**
   * **Lo que la respuesta dice y las piezas leen por su nombre** (#100).
   *
   * Lo miran `impedida` y las plantillas de un `Texto`, que es como la accion de anular sabe sobre
   * que recibo actuaria y si ese recibo ya esta anulado. Va aparte de `valores` a proposito: un
   * valor es lo que se PINTA en un campo, y esto es lo que se LEE para decidir —el estado del
   * recibo se pinta ademas en su campo, y el numero viaja sin pintarse dos veces—.
   *
   * Los nombres viven en `definiciones/tesoreria.ts`, con la definicion que los nombra.
   */
  readonly nombrados?: ReadonlyMap<string, DatoConNombre>;
  /**
   * Lo que se dice arriba de la pantalla **para esta respuesta**, cuando el porque de los huecos
   * depende de lo que llego. Ausente cuando no depende, y entonces manda `Conector.ausencia`.
   *
   * Lo pide `cierre-caja` (#97): «no abrio turno hoy», «ya cerro» y «tiene dos ventanillas
   * abiertas» dejan los mismos diez campos vacios por tres motivos distintos, y cada uno se
   * resuelve en otro sitio. Una sola frase fija mandaria a los tres al mismo.
   */
  readonly ausencia?: Ausencia;
}

export interface Conector {
  /** La clave de consulta de TanStack. Lleva la hoja dentro: dos pantallas no comparten cache. */
  readonly clave: readonly string[];
  /**
   * Las rutas que pide su PRIMERA lectura, tal cual estan en `RUTAS`. La guarda las compara con
   * las lecturas de su hoja, una a una.
   *
   * Son varias solo en `cierre-caja`, que encadena tres dentro del mismo `pedir`. La de
   * `deLoElegido`, cuando la hay, se declara aparte: esa no se pide hasta que alguien elige.
   */
  readonly rutas: readonly string[];
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

/**
 * Lo que la segunda lectura anade al reparto de la primera, y **como lo dice**.
 *
 * <h2>Dos maneras de decirlo, y cada hoja usa la suya**</h2>
 *
 * · **`ausencia`** — habla por la pantalla entera: en `duplicado-recibo` lo unico que queda por
 *   decir despues de que llegue la lista **es** lo que le pase al recibo elegido, asi que manda.
 * · **`lecturas`** (#98) — habla **por una pieza**: el estado de la lectura que un bloque declara
 *   (`bloque.lectura.clave`), que el interprete dibuja en el sitio de ese bloque.
 *
 * `cierre-caja` necesita la segunda y no la primera, y no es un capricho: su frase de arriba ya la
 * decide el turno —«no abrio turno hoy», «ya cerro», «tiene dos ventanillas»—, y una conciliacion
 * que la pisara borraria de la pantalla el motivo por el que faltan otros diez campos. Con
 * `lecturas`, cada cosa dice lo suyo donde se mira.
 *
 * Las dos son opcionales y **no se excluyen**; sin ninguna, manda la ausencia de la primera lectura.
 */
export interface Aporte {
  readonly reparto: Reparto;
  /** Ausente cuando esta lectura no habla por la pantalla entera: entonces manda la de la primera. */
  readonly ausencia?: Ausencia;
  /** El estado de las lecturas que una pieza declara, por su `clave` (#98). */
  readonly lecturas?: ReadonlyMap<string, EstadoDeUnaLectura>;
}

/** Las palabras de los huecos que una lectura que SI contesto deja. Todas pasan por el locale. */
export const SIN_ELEGIR = 'sin elegir';
export const SIN_TURNO = 'sin turno';
export const TURNO_CERRADO = 'turno cerrado';
export const VARIAS_CAJAS = 'varias cajas';
export const SIN_DECLARAR = 'sin declarar';
export const SIN_PEDIR_AQUI = 'sin pedir';

/** Lo que dicen «Puede cerrarse» y «Cuadra». Son palabras, no datos del backend: se traducen. */
const SI = 'sí';
const NO = 'no';

/** Lo que dice la situacion de una linea de la conciliacion. Tambien palabras, y `tono.ts` las lee. */
const CUADRA = 'CUADRA';
const NO_CUADRA = 'NO CUADRA';

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

/**
 * Las cuatro situaciones de `cierre-caja` (#97), y no una frase fija.
 *
 * «No abrió turno hoy», «ya cerró» y «tiene dos ventanillas abiertas» dejan los **mismos** diez
 * campos vacíos, y cada una se resuelve en otro sitio: cobrar, reversar el cierre, o elegir cuál
 * ventanilla. Una sola frase mandaría a las tres al mismo, y a dos de ellas al equivocado.
 */
const CIERRE_CON_TURNO: Ausencia = {
  enElCampo: SIN_PEDIR_AQUI,
  explicacion:
    'Esta pantalla lee su turno abierto, su arqueo, los pagos que impiden cerrarlo y la conciliación del día que se elija. Lo que usted cuente en el cajón no se registra desde aquí, así que el arqueo no dice lo declarado ni si cuadra: dice lo cobrado.',
  tono: 'info',
};

const CIERRE_SIN_TURNO: Ausencia = {
  enElCampo: SIN_TURNO,
  explicacion:
    'Usted no tiene turno abierto hoy, así que no hay arqueo que mostrar: la ventanilla se abre con su primer cobro del día.',
  tono: 'info',
};

const CIERRE_YA_CERRADO: Ausencia = {
  enElCampo: TURNO_CERRADO,
  explicacion:
    'Su turno de hoy ya está cerrado y su arqueo, firmado. Un cajero tiene un solo turno al día por ventanilla, así que volver a cobrar hoy exige reversar ese cierre, y reversar no se hace desde aquí.',
  tono: 'info',
};

const CIERRE_CON_VARIOS: Ausencia = {
  enElCampo: VARIAS_CAJAS,
  explicacion:
    'Tiene turno abierto en más de una ventanilla, y esta pantalla no elige por usted cuál arquear: arquear una por otra no daría error, daría una cifra.',
  tono: 'info',
};

/** Todas las frases que este archivo pone en pantalla, para el catalogo del locale. */
export const FRASES_DE_LOS_CONECTORES: readonly string[] = [
  SIN_TURNO,
  TURNO_CERRADO,
  VARIAS_CAJAS,
  SIN_DECLARAR,
  SIN_PEDIR_AQUI,
  SI,
  NO,
  CUADRA,
  NO_CUADRA,
  ...[
    ELIJA_UN_RECIBO,
    PIDIENDO_EL_RECIBO,
    RECIBO_QUE_NO_ESTA,
    RECIBO_QUE_NO_LLEGO,
    CIERRE_CON_TURNO,
    CIERRE_SIN_TURNO,
    CIERRE_YA_CERRADO,
    CIERRE_CON_VARIOS,
  ].flatMap((a) => [a.enElCampo, a.explicacion]),
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
    rutas: [RUTAS.cajas],
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
      // Lo que el backend deriva del movimiento de anulacion. Lo lee el ultimo impedimento de la
      // accion: un recibo ya anulado no se anula dos veces, y decirlo antes de abrir el acto
      // ahorra rellenarlo para recibir un 409.
      nombrados: new Map([[ESTADO_DEL_RECIBO, duplicado.estado]]),
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
  rutas: [RUTAS.recibos],
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
    // Sobre que recibo se esta mirando el detalle, para la accion de anular (#100). Sale de la
    // RUTA y no de la lista: es lo que sobrevive a una recarga, y lo que el acto recibe en `con`.
    nombrados: elegido === undefined || elegido === null ? new Map() : new Map([[NUMERO_DEL_RECIBO, elegido]]),
  }),
  ausencia: ELIJA_UN_RECIBO,
  deLoElegido: EL_RECIBO_ELEGIDO,
};

/**
 * **La conciliacion del dia que se elija** (#98): `GET /conciliacion?fecha=`.
 *
 * Es una `LecturaDeLoElegido` como la del recibo —lo que se pide sale de la ruta—, y se diferencia
 * en **donde lo cuenta**: no habla por la pantalla entera, porque la frase de arriba de esta hoja
 * ya la decide el turno (#97). Lo suyo viaja en `lecturas`, y lo dibuja el bloque que declara
 * `lectura: { clave: 'conciliacion' }` con sus cuatro estados en su sitio.
 *
 * Los cuatro pasos de `PasoDeLoElegido` son exactamente los cuatro estados de una lectura, asi que
 * la conversion es directa y no inventa ninguno:
 *
 *   · `sin-elegir` -> `en-espera`, que es «todavia no hay nada que pedir» y **no** «esta pidiendo»;
 *   · `fallo` -> el peldano de `@kamayuk/sesion`, que distingue el **422** de una fecha mal escrita
 *     —llega por la barra de direcciones— de una averia. Con `tono: atencion` cuando no lo es:
 *     escribir mal un dia no manda a avisar a soporte. **Sin `reintentar`**, porque insistir sobre
 *     un 422 sale igual las veces que se pulse.
 */
const LA_CONCILIACION_DEL_DIA: LecturaDeLoElegido = {
  enLaRuta: 'fecha',
  clave: (fecha) => ['cierre-caja', 'conciliacion', fecha],
  ruta: RUTAS.conciliacion,
  pedir: (fecha, senal) => pedirUno<ConciliacionDelDia>(rutaDeLaConciliacion(fecha), senal),
  repartir: (paso) => {
    if (paso.paso === 'sin-elegir') return { reparto: NADA, lecturas: estadoDeLaConciliacion({ estado: 'en-espera' }) };
    if (paso.paso === 'pidiendo') return { reparto: NADA, lecturas: estadoDeLaConciliacion({ estado: 'pidiendo' }) };
    if (paso.paso === 'fallo') {
      const peldano = peldanoDe(paso.error);
      return {
        reparto: NADA,
        lecturas: estadoDeLaConciliacion({
          estado: 'fallo',
          peldano,
          tono: peldano.esAveria ? 'mal' : 'atencion',
        }),
      };
    }
    return {
      reparto: conLaConciliacion(paso.respuesta as ConciliacionDelDia),
      lecturas: estadoDeLaConciliacion({ estado: 'con-datos' }),
    };
  },
};

/** El estado de la lectura que el bloque «El cuadre del dia» declara. */
const estadoDeLaConciliacion = (estado: EstadoDeUnaLectura): ReadonlyMap<string, EstadoDeUnaLectura> =>
  new Map([[LECTURA_DE_LA_CONCILIACION, estado]]);

/**
 * El bloque del cuadre, con lo que contesto la conciliacion.
 *
 * **Dos cosas que no se calculan aqui, y las dos por el mismo motivo**: el cuadre del dia y el de
 * cada linea los decide el backend —`Linea.cuadra()` mira tres condiciones y no una— y viajan
 * hechos. Comparar en el cliente daria lo mismo casi siempre, y el dia que no, nadie sabria cual de
 * los dos creer.
 *
 * **Y una que se dice en vez de rellenarse**: cuando el origen no contesto, `diferencia` llega
 * **nula**, y en su celda va `porQueNoSeSabe` —lo que el `Resource` publica— y no un cero. Un cero
 * ahi es indistinguible de un dia sin cobros, y la conciliacion diria que cuadra.
 */
function conLaConciliacion(conciliacion: ConciliacionDelDia): Reparto {
  return {
    ...NADA,
    // En mayusculas, como los estados que el backend publica: es un dato, y `tono.ts` pinta
    // «NO CUADRA» en rojo por lo que dice.
    valores: new Map([[coordenada(3, 0), conciliacion.cuadra ? CUADRA : NO_CUADRA]]),
    filas: new Map([
      [
        3,
        conciliacion.lineas.map((l) => [
          l.sistema,
          String(l.registrados),
          String(l.anulados),
          String(l.enTransito),
          formatearImporte(l.neto.importe),
          l.diferencia === null ? (l.porQueNoSeSabe ?? NULO) : formatearImporte(l.diferencia),
          l.cuadra ? CUADRA : NO_CUADRA,
        ]),
      ],
    ]),
  };
}

/** Lo que `cierre-caja` junta de sus lecturas. `cierre` es nulo si no hay UN turno abierto. */
export interface DatosDelCierre {
  readonly turno: TurnoDelDia;
  readonly cierre: EstadoDelCierre | null;
  readonly pagos: readonly PagoDelBuzon[];
}

/** Que se dice arriba, y con ella la palabra de los diez campos del arqueo, segun la situacion. */
function ausenciaDelCierre(situacion: string): Ausencia {
  if (situacion === 'ABIERTO') return CIERRE_CON_TURNO;
  if (situacion === 'CERRADO') return CIERRE_YA_CERRADO;
  if (situacion === 'VARIOS_ABIERTOS') return CIERRE_CON_VARIOS;
  return CIERRE_SIN_TURNO;
}

/** Una celda con su cifra, o la palabra si el backend la mando nula: nunca un cero inventado. */
function importeO(importe: ImporteActualizado | null, palabra: string): string {
  return importe === null ? palabra : formatearImporte(importe.importe);
}

/** Las filas del bloque 1: los pagos en transito, que son lo que impide cerrar. */
function filasDeLosPagos(pagos: readonly PagoDelBuzon[]): readonly (readonly string[])[] {
  return pagos.map((p) => [
    p.pagoId,
    p.destino,
    String(p.reciboId),
    String(p.intentos),
    p.ultimoError ?? NULO,
    instanteEnLima(p.creadoEn),
    p.estado,
  ]);
}

/**
 * `cierre-caja`: su turno, el arqueo de ese turno y los pagos que impiden cerrarlo (#97).
 *
 * El turno y los pagos se piden a la vez —no dependen uno del otro—; el arqueo va despues, porque
 * **necesita el `turnoId` que la primera acaba de dar**. Si no hay exactamente un turno abierto no
 * se pide: los diez campos dicen por que en su hueco, y la frase de arriba donde se arregla.
 */
const CIERRE_CAJA: Conector = {
  clave: ['cierre-caja', 'turno-y-arqueo'],
  rutas: [RUTAS.turnoDelDia, RUTAS.cierreDelTurno, RUTAS.pagosSinEntregar],
  pedir: async (senal): Promise<DatosDelCierre> => {
    const [turno, pagos] = await Promise.all([
      pedirUno<TurnoDelDia>(RUTAS.turnoDelDia, senal),
      pedirUno<readonly PagoDelBuzon[]>(RUTAS.pagosSinEntregar, senal),
    ]);
    const abierto = turno.turnos.find((t) => t.estadoDelTurno === 'ABIERTO');
    const cierre =
      turno.situacion === 'ABIERTO' && abierto !== undefined
        ? await pedirUno<EstadoDelCierre>(rutaDelCierre(abierto.turnoId), senal)
        : null;
    return { turno, cierre, pagos };
  },
  repartir: (datos: DatosDelCierre): Reparto => {
    const pagos = filasDeLosPagos(datos.pagos);
    const ausencia = ausenciaDelCierre(datos.turno.situacion);
    if (datos.cierre === null) {
      return {
        ...NADA,
        filas: new Map([[1, pagos]]),
        sinDato: new Map(bloqueSinDato(0, 10, ausencia.enElCampo)),
        ausencia,
      };
    }

    const arqueo = datos.cierre.arqueo;
    const valores: [Coordenada, string][] = [
      [coordenada(0, 0), formatearFecha(arqueo.fecha)],
      [coordenada(0, 1), datos.cierre.puedeCerrar ? SI : NO],
      [coordenada(0, 2), String(arqueo.recibosEmitidos)],
      [coordenada(0, 3), String(arqueo.recibosAnulados)],
      [coordenada(0, 4), formatearImporte(arqueo.cobrado.importe)],
      [coordenada(0, 5), formatearImporte(arqueo.anulado.importe)],
      [coordenada(0, 6), formatearImporte(arqueo.neto.importe)],
    ];
    const sinDato: [Coordenada, string][] = [];

    // Los tres que el arqueo EN VIVO no puede saber: nadie ha contado el cajon todavia. El
    // backend los manda nulos desde #97 —antes mandaba 0,00 y `cuadra: false`—, y aqui cada
    // uno cae en `valores` o en `sinDato`, nunca en los dos.
    for (const [columna, cifra] of [
      [7, arqueo.declarado],
      [8, arqueo.diferencia],
    ] as const) {
      const k = coordenada(0, columna);
      if (cifra === null) sinDato.push([k, SIN_DECLARAR]);
      else valores.push([k, formatearImporte(cifra.importe)]);
    }
    const cuadra = coordenada(0, 9);
    if (arqueo.cuadra === null) sinDato.push([cuadra, SIN_DECLARAR]);
    else valores.push([cuadra, arqueo.cuadra ? SI : NO]);

    return {
      valores: new Map(valores),
      filas: new Map([
        [
          0,
          arqueo.lineas.map((l) => [
            l.formaDePago,
            formatearImporte(l.cobrado.importe),
            formatearImporte(l.anulado.importe),
            formatearImporte(l.neto.importe),
            importeO(l.declarado, SIN_DECLARAR),
            importeO(l.diferencia, SIN_DECLARAR),
          ]),
        ],
        [1, pagos],
      ]),
      tablas: new Map(),
      conteos: new Map(),
      sinDato: new Map(sinDato),
      ausencia,
    };
  },
  ausencia: CIERRE_CON_TURNO,
  deLoElegido: LA_CONCILIACION_DEL_DIA,
};

/** `avance-recaudacion`: el periodo, sus tres totales y una fila por concepto. */
const AVANCE_RECAUDACION: Conector = {
  clave: ['avance-recaudacion', 'avance'],
  rutas: [RUTAS.avanceDeRecaudacion],
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
  rutas: [RUTAS.recaudacionPorArea],
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
