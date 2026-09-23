import {
  ACCESOS_MEDIDOS,
  MODULOS_MEDIDOS,
  PERMISOS_MEDIDOS,
} from '../src/datos/seguridadMedida.ts';
import { MUNICIPALIDAD_MEDIDA, SESION_MEDIDA } from '../src/datos/sesionMedida.ts';
import {
  AVANCE_MEDIDO,
  CAJAS_MEDIDAS,
  CIERRE_MEDIDO,
  CONCILIACION_MEDIDA,
  DISTRIBUCION_MEDIDA,
  DUPLICADO_MEDIDO,
  PAGOS_MEDIDOS,
  RECIBOS_MEDIDOS,
  TURNO_MEDIDO,
  TURNO_SIN_ABRIR_MEDIDO,
} from '../src/datos/tesoreriaMedida.ts';

/**
 * **La medicion de las capturas, sin la red** (#89).
 *
 * <h2>Para que existe</h2>
 *
 * Las tres capturas de `src/datos/*Medida.ts` estan **derivadas** del contrato, no medidas: su
 * `ORIGEN_DE_LA_CAPTURA` lo dice. Medirlas exige una cuenta con la que pedir un token a un backend
 * de verdad, y esa cuenta —`medicion-de-interfaces`— solo existe en `stg` (identidad#50,
 * infrastructure#207). El dia que exista, medir tiene que ser **una orden**:
 * `desarrollo/medir-las-capturas.mjs`, que es la cascara con la red y el disco. Aqui vive todo lo
 * demas, y se prueba en `verificaciones/el-guion-de-medicion.test.ts` sin red.
 *
 * <h2>Lo que compara, y lo que NO</h2>
 *
 * Compara la **forma**: los campos de cada objeto, los que sobran y los que faltan, y la clase de
 * cada valor —nulo, entero, un instante UTC con o sin fraccion, una fecha, un decimal con cuantos
 * decimales—. **No compara los valores**: los de la captura estan elegidos para ejercer casos, y
 * los de `stg` son los que haya. Tampoco juzga el orden de las listas: las respuestas crudas se
 * guardan tal cual, y el orden se lee ahi.
 *
 * <h2>Por que la cascara esta aparte, y es `.mjs`</h2>
 *
 * Porque es la que llama a `fetch`, y la prohibicion `fetch-fuera-del-cliente` vale para todo
 * `.ts` que no este en `src/api/`: este archivo no llama a `fetch` —recibe `pedir` como
 * efecto— y por eso pasa por ESLint y por `tsc` como cualquier otro. La cascara es un guion de Node
 * fuera del paquete, como `puerto-del-arnes.mjs`: no se importa desde `src/` ni viaja a `dist/`.
 *
 * <h2>Solo lee</h2>
 *
 * Hace **un** `POST`, el del token al emisor, y todo lo demas son `GET` a `/caja/api/v1`. La
 * cuenta de medicion solo tiene `LECTURA` (identidad#50), pero que el guion no escriba no se deja a
 * los permisos de la cuenta: lo prueba el test con un servidor falso que anota cada metodo.
 */

/** El prefijo de la API de la caja. El mismo que `src/api/cliente.ts`: lo compara la prueba. */
export const PREFIJO_DE_LA_API = '/caja/api/v1';

/**
 * El cliente con el que se pide el token: **publico y con `grant_type=password`**.
 *
 * `kamayuk-backoffice` es PKCE y no sirve sin navegador. Lo dice el runbook
 * `infrastructure/docs/B0-operacion/runbooks/medir-una-interfaz-con-login-real.md` §«Conseguir un
 * token», y el cliente esta declarado en `infrastructure/despliegue/identidad/realm-kamayuk.json`
 * (`publicClient: true`, `directAccessGrantsEnabled: true`): no lleva clave de cliente.
 */
export const CLIENTE_DE_MEDICION = 'kamayuk-verificacion';

/** La cuenta que da de alta la implantacion de `identidad` (identidad#50) y siembra `stg` (#207). */
export const CUENTA_DE_MEDICION = 'medicion-de-interfaces';

/** La variable de entorno de la clave. **Nunca un argumento**: se veria en `ps` y en el historial. */
export const VARIABLE_DE_LA_CLAVE = 'KAMAYUK_CLAVE_DE_MEDICION';

/** Lo que sustituye a un secreto en todo lo que se escribe o se registra. */
export const REDACTADO = '«redactado»';

// ── LA FORMA ────────────────────────────────────────────────────────────────────────────────────

const INSTANTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/;
const FECHA_Y_HORA_SIN_ZONA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const DECIMAL = /^-?\d+\.(\d+)$/;
const ENTERO = /^-?\d+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * La clase de un valor, dicha en una palabra que se pueda comparar.
 *
 * Las cadenas se clasifican por su **formato**, que es donde se esconden las diferencias que
 * `camino-a-la-api.test.ts` no ve: un `Instant` con fraccion de segundo —`…:04.123456Z`— no es la
 * misma forma que `…:04Z`, y un importe `'1842.6'` no es la misma que `'1842.60'`.
 */
export function formaDe(valor: unknown): string {
  if (valor === null) return 'nulo';
  if (Array.isArray(valor)) return 'lista';
  switch (typeof valor) {
    case 'boolean':
      return 'booleano';
    case 'number':
      return Number.isInteger(valor) ? 'numero:entero' : 'numero:con-decimales';
    case 'string':
      return formaDeUnTexto(valor);
    case 'object':
      return 'objeto';
    default:
      return typeof valor;
  }
}

function formaDeUnTexto(texto: string): string {
  const instante = INSTANTE.exec(texto);
  if (instante) {
    const [, fraccion, zona] = instante;
    const donde = zona === 'Z' ? 'instante-utc' : 'instante-con-desfase';
    return fraccion === undefined ? `texto:${donde}` : `texto:${donde}-fraccion-${String(fraccion.length)}`;
  }
  if (FECHA_Y_HORA_SIN_ZONA.test(texto)) return 'texto:fecha-y-hora-sin-zona';
  if (FECHA.test(texto)) return 'texto:fecha';
  const decimal = DECIMAL.exec(texto);
  if (decimal) return `texto:decimal-${String(decimal[1]?.length ?? 0)}`;
  if (ENTERO.test(texto)) return 'texto:entero';
  if (UUID.test(texto)) return 'texto:uuid';
  if (texto === '') return 'texto:vacio';
  return 'texto';
}

/** Una diferencia de forma entre lo medido y lo capturado, con la ruta JSON donde esta. */
export interface Diferencia {
  readonly ruta: string;
  /** `sobra`: lo medido trae un campo que la captura no tiene. `falta`: al reves. */
  readonly clase: 'sobra' | 'falta' | 'forma';
  readonly detalle: string;
}

/** Lo que las capturas ejercen: la forma de cada ruta y los campos de cada objeto. */
interface LoCapturado {
  readonly formas: Map<string, Set<string>>;
  readonly campos: Map<string, Set<string>>;
}

function recorrer(valor: unknown, ruta: string, visitar: (ruta: string, valor: unknown) => void): void {
  visitar(ruta, valor);
  if (Array.isArray(valor)) {
    for (const elemento of valor) recorrer(elemento, `${ruta}[]`, visitar);
  } else if (valor !== null && typeof valor === 'object') {
    for (const [campo, hijo] of Object.entries(valor)) recorrer(hijo, `${ruta}.${campo}`, visitar);
  }
}

function loQueEjercen(capturas: readonly unknown[]): LoCapturado {
  const formas = new Map<string, Set<string>>();
  const campos = new Map<string, Set<string>>();
  const anadir = (mapa: Map<string, Set<string>>, clave: string, valores: Iterable<string>) => {
    const conjunto = mapa.get(clave) ?? new Set<string>();
    for (const v of valores) conjunto.add(v);
    mapa.set(clave, conjunto);
  };
  for (const captura of capturas) {
    recorrer(captura, '$', (ruta, valor) => {
      anadir(formas, ruta, [formaDe(valor)]);
      if (formaDe(valor) === 'objeto') anadir(campos, ruta, Object.keys(valor as object));
    });
  }
  return { formas, campos };
}

const ordenadas = (conjunto: Iterable<string>) => [...conjunto].sort().join(' | ');

/**
 * Compara la forma de una respuesta medida con la de sus capturas.
 *
 * Varias capturas pueden describir la misma lectura —`TURNO_MEDIDO` y `TURNO_SIN_ABRIR_MEDIDO` son
 * las dos de `/turnos/del-dia`—, y lo que ejercen se une: un nulo es legitimo si **alguna** captura
 * lo ejerce.
 *
 * Tres clases de diferencia, y ninguna se calla:
 *
 *   · **sobra** — un objeto medido trae un campo que ninguna captura tiene en esa ruta;
 *   · **falta** — un objeto medido NO trae un campo que la captura si: es lo que pasaria si el
 *     backend omitiera los nulos, y la interfaz leeria `undefined` donde espera `null`;
 *   · **forma** — el valor medido tiene una clase que ninguna captura ejerce en esa ruta.
 *
 * Lo que la captura ejerce y lo medido no trae —un nulo que hoy no llego, una lista vacia— **no es
 * una diferencia**: los datos de `stg` son los que haya. Y bajo un valor que la captura solo ejerce
 * como nulo no se sigue bajando: la diferencia ya esta dicha una vez, en su ruta.
 */
export function compararFormas(medida: unknown, capturas: readonly unknown[]): readonly Diferencia[] {
  const capturado = loQueEjercen(capturas);
  const vistas = new Set<string>();
  const diferencias: Diferencia[] = [];
  const anotar = (d: Diferencia) => {
    const clave = `${d.clase} ${d.ruta} ${d.detalle}`;
    if (vistas.has(clave)) return;
    vistas.add(clave);
    diferencias.push(d);
  };

  const visitar = (ruta: string, valor: unknown): void => {
    const formas = capturado.formas.get(ruta);
    // Una ruta que ninguna captura tiene ya se dijo arriba, como campo que sobra o como forma.
    if (formas === undefined) return;
    const forma = formaDe(valor);
    if (!formas.has(forma)) {
      anotar({
        ruta,
        clase: 'forma',
        detalle: `llega «${forma}» y la captura solo ejerce «${ordenadas(formas)}»`,
      });
    }
    if (Array.isArray(valor)) {
      for (const elemento of valor) visitar(`${ruta}[]`, elemento);
      return;
    }
    if (forma !== 'objeto') return;
    const campos = capturado.campos.get(ruta);
    if (campos === undefined) return;
    const suyos = Object.keys(valor as object);
    for (const campo of suyos) {
      if (!campos.has(campo)) {
        anotar({ ruta: `${ruta}.${campo}`, clase: 'sobra', detalle: 'lo medido lo trae y la captura no' });
      }
    }
    for (const campo of campos) {
      if (!suyos.includes(campo)) {
        anotar({ ruta: `${ruta}.${campo}`, clase: 'falta', detalle: 'la captura lo tiene y lo medido no lo trae' });
      }
    }
    for (const [campo, hijo] of Object.entries(valor as object)) visitar(`${ruta}.${campo}`, hijo);
  };

  visitar('$', medida);
  return diferencias;
}

/** Una diferencia en una linea. */
export function describir(d: Diferencia): string {
  return `${d.clase.padEnd(5)} ${d.ruta}: ${d.detalle}`;
}

// ── LOS SECRETOS ────────────────────────────────────────────────────────────────────────────────

/** Cualquier JWT, se sepa o no de quien es: la ultima red por si un secreto llega por otro sitio. */
const UN_JWT = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;

/**
 * Quita de un texto cada secreto conocido —tal cual y codificado para URL— y cualquier JWT.
 *
 * **Todo** lo que el guion escribe en disco o en la consola pasa por aqui: no hay un camino que lo
 * salte. Un secreto vacio no se busca, porque «sustituir la cadena vacia» es redactarlo todo.
 */
export function redactar(texto: string, secretos: readonly string[]): string {
  let limpio = texto;
  for (const secreto of secretos) {
    if (secreto === '') continue;
    for (const variante of new Set([secreto, encodeURIComponent(secreto)])) {
      limpio = limpio.split(variante).join(REDACTADO);
    }
  }
  return limpio.replace(UN_JWT, REDACTADO);
}

// ── LAS LECTURAS ────────────────────────────────────────────────────────────────────────────────

/** Lo que una lectura necesita de las anteriores, o de la orden: el recibo, el turno, el dia. */
export interface Contexto {
  recibo?: string;
  turno?: number;
  fecha?: string;
}

/** Lo que dice por que una lectura no se pidio. */
export interface Omision {
  readonly omitida: string;
}

/** Una lectura de la ventanilla, con su ruta, sus capturas y lo que deja a las siguientes. */
export interface Lectura {
  /** La clave de `RUTAS` en `src/datos/lecturas.ts`: la prueba exige que sean las mismas. */
  readonly clave: string;
  /** La ruta tal como la escribe `RUTAS`, con las variables entre llaves. */
  readonly plantilla: string;
  /** La ruta que se pide, o por que no se pide. */
  readonly ruta: (contexto: Contexto) => string | Omision;
  /** Las capturas con las que se compara. */
  readonly capturas: readonly unknown[];
  /** Lo que la respuesta deja a las lecturas que vienen detras. */
  readonly encadenar?: (cuerpo: unknown, contexto: Contexto) => void;
}

/** El envoltorio de `RespuestaPaginada` alrededor de una captura que es solo el contenido. */
function comoPagina(contenido: readonly unknown[]) {
  return { contenido, pagina: 0, tamano: 200, totalElementos: contenido.length, totalPaginas: 1, hayMas: false };
}

const fija = (plantilla: string) => () => plantilla;

/** `rutaDelDuplicado` de `lecturas.ts`, sin importarlo: la prueba compara las dos. */
export function rutaDelDuplicado(numero: string): string {
  return `/recibos/${encodeURIComponent(numero)}/duplicado`;
}

/** `rutaDelCierre` de `lecturas.ts`. */
export function rutaDelCierre(turnoId: number): string {
  return `/turnos/${String(turnoId)}/cierre`;
}

/** `rutaDeLaConciliacion` de `lecturas.ts`. */
export function rutaDeLaConciliacion(fecha: string): string {
  return `/conciliacion?fecha=${encodeURIComponent(fecha)}`;
}

const esObjeto = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * **Las catorce lecturas, en el orden en que se piden.**
 *
 * Son las `RUTAS` de `src/datos/lecturas.ts` —cinco de sesion y nueve de Tesoreria— con **la misma
 * consulta** que les pone la interfaz (`tamano=200` en accesos y cajas). No se importan de alli
 * porque `lecturas.ts` arrastra el cliente del navegador; lo que se hace es compararlas en la
 * prueba, clave a clave y cadena a cadena.
 *
 * Las tres con variable la encadenan de una lectura anterior **salvo que la orden la diga**:
 *
 *   · el recibo del duplicado, del primero de `/recibos`;
 *   · el turno del arqueo, del turno ABIERTO de `/turnos/del-dia` —como `conectores.ts`—. La cuenta
 *     de medicion no cobra, asi que lo normal en `stg` es `SIN_ABRIR` y hay que pasar `--turno`;
 *   · el dia de la conciliacion, de la `fecha` de `/turnos/del-dia`, que es el hoy del backend.
 */
export const LECTURAS: readonly Lectura[] = [
  { clave: 'sesion', plantilla: '/seguridad/sesion', ruta: fija('/seguridad/sesion'), capturas: [SESION_MEDIDA] },
  {
    clave: 'municipalidadDeLaSesion',
    plantilla: '/seguridad/sesion/municipalidad',
    ruta: fija('/seguridad/sesion/municipalidad'),
    capturas: [MUNICIPALIDAD_MEDIDA],
  },
  {
    clave: 'modulos',
    plantilla: '/seguridad/modulos',
    ruta: fija('/seguridad/modulos'),
    capturas: [comoPagina(MODULOS_MEDIDOS)],
  },
  {
    clave: 'accesos',
    plantilla: '/seguridad/accesos?tamano=200',
    ruta: fija('/seguridad/accesos?tamano=200'),
    capturas: [comoPagina(ACCESOS_MEDIDOS)],
  },
  {
    clave: 'permisosDeLaSesion',
    plantilla: '/seguridad/sesion/permisos',
    ruta: fija('/seguridad/sesion/permisos'),
    capturas: [PERMISOS_MEDIDOS],
  },
  { clave: 'cajas', plantilla: '/cajas?tamano=200', ruta: fija('/cajas?tamano=200'), capturas: [CAJAS_MEDIDAS] },
  {
    clave: 'recibos',
    plantilla: '/recibos',
    ruta: fija('/recibos'),
    capturas: [RECIBOS_MEDIDOS],
    encadenar: (cuerpo, contexto) => {
      if (contexto.recibo !== undefined || !esObjeto(cuerpo) || !Array.isArray(cuerpo.contenido)) return;
      const primero: unknown = cuerpo.contenido[0];
      if (esObjeto(primero) && typeof primero.numero === 'string') contexto.recibo = primero.numero;
    },
  },
  {
    clave: 'duplicadoDeUnRecibo',
    plantilla: '/recibos/{nro}/duplicado',
    ruta: ({ recibo }) =>
      recibo === undefined
        ? { omitida: '`/recibos` no trajo ninguno y la orden no dijo `--recibo <numero>`' }
        : rutaDelDuplicado(recibo),
    capturas: [DUPLICADO_MEDIDO],
  },
  {
    clave: 'turnoDelDia',
    plantilla: '/turnos/del-dia',
    ruta: fija('/turnos/del-dia'),
    capturas: [TURNO_MEDIDO, TURNO_SIN_ABRIR_MEDIDO],
    encadenar: (cuerpo, contexto) => {
      if (!esObjeto(cuerpo)) return;
      if (contexto.fecha === undefined && typeof cuerpo.fecha === 'string') contexto.fecha = cuerpo.fecha;
      if (contexto.turno !== undefined || cuerpo.situacion !== 'ABIERTO' || !Array.isArray(cuerpo.turnos)) return;
      const abierto: unknown = cuerpo.turnos.find((t: unknown) => esObjeto(t) && t.estadoDelTurno === 'ABIERTO');
      if (esObjeto(abierto) && typeof abierto.turnoId === 'number') contexto.turno = abierto.turnoId;
    },
  },
  {
    clave: 'cierreDelTurno',
    plantilla: '/turnos/{turnoId}/cierre',
    ruta: ({ turno }) =>
      turno === undefined
        ? {
            omitida:
              'la cuenta no tiene un turno ABIERTO hoy —lo normal en la de medicion, que no cobra— y la orden no dijo `--turno <id>`',
          }
        : rutaDelCierre(turno),
    capturas: [CIERRE_MEDIDO],
  },
  {
    clave: 'pagosSinEntregar',
    plantilla: '/pagos/sin-entregar',
    ruta: fija('/pagos/sin-entregar'),
    capturas: [PAGOS_MEDIDOS],
  },
  {
    clave: 'avanceDeRecaudacion',
    plantilla: '/recaudacion/avance',
    ruta: fija('/recaudacion/avance'),
    capturas: [AVANCE_MEDIDO],
  },
  {
    clave: 'recaudacionPorArea',
    plantilla: '/recaudacion/por-area',
    ruta: fija('/recaudacion/por-area'),
    capturas: [DISTRIBUCION_MEDIDA],
  },
  {
    clave: 'conciliacion',
    plantilla: '/conciliacion',
    ruta: ({ fecha }) =>
      fecha === undefined
        ? { omitida: '`/turnos/del-dia` no dijo el dia y la orden no dijo `--fecha AAAA-MM-DD`' }
        : rutaDeLaConciliacion(fecha),
    capturas: [CONCILIACION_MEDIDA],
  },
];

// ── LA MEDICION ─────────────────────────────────────────────────────────────────────────────────

/** Lo que dice la orden. */
export interface Opciones {
  /** El origen del ingreso: `https://<dominio>` o `http://localhost:8080`. Sin `/caja/api/v1`. */
  readonly base: string;
  /** El emisor: `https://<dominio>/keycloak/realms/kamayuk` o `http://localhost:8180/realms/kamayuk`. */
  readonly emisor: string;
  readonly cliente: string;
  readonly cuenta: string;
  /** La clave, de `KAMAYUK_CLAVE_DE_MEDICION`. No sale de este proceso salvo en el `POST` del token. */
  readonly clave: string;
  readonly recibo?: string;
  readonly turno?: number;
  readonly fecha?: string;
  /** La orden con la que se invoco, para dejarla escrita junto a lo medido. */
  readonly invocacion: string;
}

/** Los efectos: la red, el disco, la consola y el reloj. La prueba los sustituye todos. */
export interface Efectos {
  readonly pedir: (url: string, init: RequestInit) => Promise<Response>;
  readonly guardar: (nombre: string, contenido: string) => Promise<void>;
  readonly registrar: (linea: string) => void;
  readonly ahora: () => Date;
}

/** Lo que dio una lectura. */
export interface Resultado {
  readonly clave: string;
  readonly estado: number | null;
  /** Por que no se pidio: le falta una variable que ninguna lectura anterior dio. No es un fallo. */
  readonly omitida?: string;
  /** Por que lo que llego no se puede comparar: no contesto, o no es JSON. Es un fallo. */
  readonly problema?: string;
  readonly diferencias: readonly Diferencia[];
}

/** Un fallo que para la medicion entera: sin token no hay nada que medir. */
export class MedicionImposible extends Error {}

/** Lo que la orden tiene que traer, o por que no sirve. Vacia si sirve. */
export function problemasDeLasOpciones(o: Pick<Opciones, 'base' | 'emisor' | 'clave'>): readonly string[] {
  const problemas: string[] = [];
  for (const [nombre, valor] of [
    ['--base', o.base],
    ['--emisor', o.emisor],
  ] as const) {
    if (valor === '') {
      problemas.push(`falta ${nombre}`);
      continue;
    }
    let url: URL;
    try {
      url = new URL(valor);
    } catch {
      problemas.push(`${nombre} no es una URL: «${valor}»`);
      continue;
    }
    // La clave viaja al emisor en el cuerpo del `POST`, y el token a la base en cada `GET`: por
    // HTTP en claro solo se admite la maquina propia, que es la plataforma de compose.
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
      problemas.push(`${nombre} tiene que ser https (o http a localhost): «${valor}»`);
    }
  }
  if (o.clave === '') problemas.push(`falta la clave en ${VARIABLE_DE_LA_CLAVE}`);
  return problemas;
}

const sinBarraFinal = (url: string) => url.replace(/\/+$/, '');

/**
 * **Mide**: pide el token, pide las catorce lecturas, guarda cada respuesta cruda y compara su forma.
 *
 * Cada lectura deja dos archivos: `NN-<clave>.cuerpo`, **el cuerpo tal cual llego**, y
 * `NN-<clave>.json`, con la orden exacta —en `curl`, con `$TOKEN` y no su valor—, el estado HTTP,
 * la fecha de la medicion y la del servidor, y las diferencias. Todo pasa por `redactar`.
 */
export async function medir(o: Opciones, e: Efectos): Promise<readonly Resultado[]> {
  const secretos = [o.clave];
  const decir = (linea: string) => e.registrar(redactar(linea, secretos));
  const guardar = (nombre: string, contenido: string) => e.guardar(nombre, redactar(contenido, secretos));
  const comoJson = (valor: unknown) => `${JSON.stringify(valor, null, 2)}\n`;

  await guardar('orden.txt', `${o.invocacion}\n`);

  // ── El token: el UNICO `POST` ──
  const emisor = sinBarraFinal(o.emisor);
  const urlDelToken = `${emisor}/protocol/openid-connect/token`;
  decir(`Token: POST ${urlDelToken} (cliente ${o.cliente}, cuenta ${o.cuenta})`);
  const cuerpoDelToken = new URLSearchParams({
    grant_type: 'password',
    client_id: o.cliente,
    username: o.cuenta,
    password: o.clave,
  });
  const fechaDelToken = e.ahora().toISOString();
  let respuestaDelToken: Response;
  try {
    respuestaDelToken = await e.pedir(urlDelToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: cuerpoDelToken.toString(),
    });
  } catch (causa) {
    throw new MedicionImposible(redactar(`El emisor no contesto en ${urlDelToken}: ${String(causa)}`, secretos));
  }
  const textoDelToken = await respuestaDelToken.text();
  let token = '';
  try {
    const leido: unknown = JSON.parse(textoDelToken);
    if (esObjeto(leido) && typeof leido.access_token === 'string') token = leido.access_token;
  } catch {
    // Se dice abajo, con el estado.
  }
  if (token !== '') secretos.push(token);
  await guardar(
    '00-token.json',
    comoJson({
      orden: `curl -sS -d grant_type=password -d client_id=${o.cliente} -d username=${o.cuenta} --data-urlencode "password@<archivo con la clave>" '${urlDelToken}'`,
      estado: respuestaDelToken.status,
      fecha: fechaDelToken,
      // El cuerpo NO se guarda: lleva el token y el de refresco.
    }),
  );
  if (!respuestaDelToken.ok || token === '') {
    const pista = /invalid_grant/.test(textoDelToken)
      ? '\n  `invalid_grant` casi nunca es la clave: es `UPDATE_PASSWORD` pendiente, o una clave rotada sin volver a correr el Job del realm (runbook «medir-una-interfaz-con-login-real», §Si algo falla).'
      : '';
    throw new MedicionImposible(
      redactar(`El emisor contesto ${String(respuestaDelToken.status)} sin token: ${textoDelToken.slice(0, 300)}${pista}`, secretos),
    );
  }
  decir('Token: obtenido');

  // ── Las lecturas: solo `GET` ──
  const api = `${sinBarraFinal(o.base)}${PREFIJO_DE_LA_API}`;
  const contexto: Contexto = {
    ...(o.recibo === undefined ? {} : { recibo: o.recibo }),
    ...(o.turno === undefined ? {} : { turno: o.turno }),
    ...(o.fecha === undefined ? {} : { fecha: o.fecha }),
  };
  const resultados: Resultado[] = [];

  for (const [indice, lectura] of LECTURAS.entries()) {
    const nombre = `${String(indice + 1).padStart(2, '0')}-${lectura.clave}`;
    const ruta = lectura.ruta(contexto);
    if (typeof ruta !== 'string') {
      decir(`OMITIDA ${lectura.clave}: ${ruta.omitida}`);
      await guardar(`${nombre}.json`, comoJson({ omitida: ruta.omitida }));
      resultados.push({ clave: lectura.clave, estado: null, omitida: ruta.omitida, diferencias: [] });
      continue;
    }
    const url = `${api}${ruta}`;
    const fecha = e.ahora().toISOString();
    let respuesta: Response;
    try {
      respuesta = await e.pedir(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
    } catch (causa) {
      const problema = `GET ${url} no contesto: ${String(causa)}`;
      decir(`FALLO   ${lectura.clave}: ${problema}`);
      resultados.push({ clave: lectura.clave, estado: null, problema, diferencias: [] });
      continue;
    }
    const cuerpo = await respuesta.text();
    await guardar(`${nombre}.cuerpo`, cuerpo);

    let diferencias: readonly Diferencia[] = [];
    let problema: string | undefined;
    if (respuesta.status === 200) {
      try {
        const leido: unknown = JSON.parse(cuerpo);
        diferencias = compararFormas(leido, lectura.capturas);
        lectura.encadenar?.(leido, contexto);
      } catch {
        problema = 'el cuerpo no es JSON';
      }
    }
    await guardar(
      `${nombre}.json`,
      comoJson({
        orden: `curl -sS -H "Authorization: Bearer $TOKEN" -H 'Accept: application/json' '${url}'`,
        estado: respuesta.status,
        fecha,
        fechaDelServidor: respuesta.headers.get('date'),
        tipoDeContenido: respuesta.headers.get('content-type'),
        ...(problema === undefined ? {} : { problema }),
        diferencias: diferencias.map(describir),
      }),
    );

    if (respuesta.status !== 200) {
      decir(`FALLO   ${lectura.clave}: GET ${url} → ${String(respuesta.status)} ${cuerpo.slice(0, 300)}`);
    } else if (problema !== undefined) {
      decir(`FALLO   ${lectura.clave}: GET ${url} → 200, pero ${problema}`);
    } else if (diferencias.length === 0) {
      decir(`IGUAL   ${lectura.clave}: GET ${url} → 200, la forma coincide con la captura`);
    } else {
      decir(`DISTINTA ${lectura.clave}: GET ${url} → 200, ${String(diferencias.length)} diferencia(s):`);
      for (const d of diferencias) decir(`    ${describir(d)}`);
    }
    resultados.push({
      clave: lectura.clave,
      estado: respuesta.status,
      diferencias,
      ...(problema === undefined ? {} : { problema }),
    });
  }
  return resultados;
}

/** `0` si todo llego en 200 y con la forma de la captura; `1` si no. Las omitidas no cuentan. */
export function codigoDeSalida(resultados: readonly Resultado[]): 0 | 1 {
  const mal = resultados.some(
    (r) => r.problema !== undefined || (r.estado !== null && r.estado !== 200) || r.diferencias.length > 0,
  );
  return mal ? 1 : 0;
}
