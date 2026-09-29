// @vitest-environment node
//
// Lee el disco y parsea fuentes: no hay DOM que necesitar.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { RAIZ } from './raiz.ts';

/**
 * **El filtro `paths:` de la CI cubre lo que las guardas leen de fuera de `frontend/`** (#136).
 *
 * <h2>De que defecto viene</h2>
 *
 * `frontend.yml` solo corre cuando cambia algo de su lista, y la lista se escribia a mano. Tres
 * guardas leian archivos del backend que no estaban en ella —`Observacion.java`
 * (`el-arbol-cuadra-con-el-backend`), `ImporteActualizado.java` (`camino-a-la-api`) y, del lado del
 * descriptor, `PublicadorDelBuzon.java`—, y un cambio en cualquiera de los tres **no hacia correr la
 * guarda que lo mira**: la guarda no se rompe, deja de correr, en verde. Es el mismo modo de fallo
 * silencioso que el propio flujo describe en su cabecera.
 *
 * <h2>Lo que se mide</h2>
 *
 * Todo archivo de codigo de `frontend/` se parsea con TypeScript y se recogen sus **literales de
 * cadena** que nombran algo de las otras carpetas del repositorio —`backend/`, `despliegue/`,
 * `docs/`, `infrastructure/`, `infra/` y `.github/`, escritas `'backend/…'` o `'../backend/…'`, o en
 * tramos seguidos de un `join(…)`—. Solo literales: un comentario que nombra un `.java` no lo lee, y
 * la prosa de este repositorio nombra muchos. Cada ruta tiene que estar cubierta en `push` **y** en
 * `pull_request`: un archivo, por un patron que lo case; un directorio —`NUCLEO`, `WEB`—, por uno
 * que case todo lo de dentro (`…/web/**`). Si existe, el disco dice si es un directorio.
 *
 * El analizador de patrones sabe `*` y `**` y nada mas, y con cualquier otro comodin de GitHub
 * (`?`, `+`, `[`, `!`) **lanza** nombrando el patron: una duda sobre que cubre el filtro no puede
 * salir en verde.
 *
 * <h2>Las dos excepciones, y su motivo</h2>
 *
 * `imagen-y-despliegue` comprueba que el descriptor **nombre** `infrastructure`: es una palabra que
 * se busca en un texto, no una carpeta que se lea.
 *
 * Y `ninguna-opcion-del-menu-se-queda-muda` barre `backend/` entero buscando un `@*Mapping` de perfil
 * o de contrasena. Cubrirlo exigiria `backend/**` en el filtro, que es una instalacion de npm por
 * cada cambio del backend: justo lo que el filtro existe para evitar. Se acepta porque hoy todos los
 * `@*Mapping` viven en los dos `infraestructura/web` que la lista ya nombra —medido en #136—, y
 * porque ese barrido es una red para el dia que aparezca un controlador en otro sitio: si llega a
 * morder, sale roja en el siguiente PR que toque `frontend/`. Una excepcion que ya no se use sale
 * roja tambien.
 *
 * Su gemela, sobre `infraestructura.yml` y lo que leen las pruebas del descriptor, es
 * `infrastructure/verificaciones/la-ci-mira-lo-que-el-descriptor-lee.test.ts`: cada flujo se vigila
 * desde la suite que ese flujo corre, o un cambio en las pruebas de uno no despertaria la guarda del
 * otro. Estan escritas igual; no se comparten porque los dos paquetes no se importan entre si.
 */

const REPOSITORIO = join(RAIZ, '..');
const FLUJO = '.github/workflows/frontend.yml';
/** Este archivo: sus excepciones y sus muestras son literales con rutas, y no son lecturas. */
const ESTE = 'verificaciones/la-ci-mira-lo-que-las-guardas-leen.test.ts';
/** Lo que no es codigo del arbol: dependencias, lo construido y lo que deja el arnes. */
const FUERA = new Set(['node_modules', 'dist', 'playwright-report', 'test-results', '.vite']);

/** Las lecturas que se aceptan sin cubrir, cada una con su archivo y su motivo. Ver el docblock. */
const EXCEPCIONES: readonly { readonly archivo: string; readonly ruta: string; readonly motivo: string }[] = [
  {
    archivo: 'verificaciones/imagen-y-despliegue.test.ts',
    ruta: 'infrastructure',
    motivo: 'es la palabra que el descriptor tiene que nombrar (`toContain`), no una carpeta que se lea',
  },
  {
    archivo: 'verificaciones/ninguna-opcion-del-menu-se-queda-muda.test.ts',
    ruta: 'backend',
    motivo: 'barre todo el backend: cubrirlo seria `backend/**` y una instalacion de npm por cada cambio del backend',
  },
];

/** El codigo de `frontend/`, con su ruta relativa y con `/`. */
function fuentes(desde = RAIZ): readonly string[] {
  return readdirSync(desde).flatMap((entrada) => {
    if (FUERA.has(entrada)) return [];
    const ruta = join(desde, entrada);
    if (statSync(ruta).isDirectory()) return fuentes(ruta);
    return /\.(?:[cm]?js|tsx?)$/.test(entrada) ? [relative(RAIZ, ruta).split(sep).join('/')] : [];
  });
}

/** Una lectura de fuera de `frontend/`: la ruta desde la raiz del repositorio, y si es un directorio. */
interface Lectura {
  readonly archivo: string;
  readonly ruta: string;
  readonly directorio: boolean;
}

const DE_FUERA = /^(?:\.\.\/)*(?:backend|despliegue|docs|infrastructure|infra|\.github)(?:\/|$)/;

/** El texto de un literal, si lo es: una cadena, una plantilla sin huecos, o lo de antes del primer hueco. */
function textoDe(nodo: ts.Node): string | undefined {
  if (ts.isStringLiteral(nodo) || ts.isNoSubstitutionTemplateLiteral(nodo)) return nodo.text;
  if (ts.isTemplateExpression(nodo)) return nodo.head.text;
  return undefined;
}

/**
 * Las rutas de fuera de `frontend/` que nombra un archivo, **en literales**. En un
 * `join(RAIZ, 'backend', 'x')` los tramos seguidos se juntan con `/`: separados, `'backend'`
 * pareceria el backend entero.
 */
export function lecturasDeFuera(archivo: string, fuente: string): readonly Lectura[] {
  const arbol = ts.createSourceFile(archivo, fuente, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
  const textos: string[] = [];
  const juntados = new Set<ts.Node>();
  const visitar = (nodo: ts.Node): void => {
    if (ts.isCallExpression(nodo)) {
      const llamada = nodo.expression;
      const nombre = ts.isIdentifier(llamada) ? llamada.text : ts.isPropertyAccessExpression(llamada) ? llamada.name.text : '';
      if (nombre === 'join' || nombre === 'resolve') {
        let tramo: ts.Node[] = [];
        const cerrar = () => {
          if (tramo.length > 1) {
            textos.push(tramo.map((n) => textoDe(n) ?? '').join('/'));
            for (const n of tramo) juntados.add(n);
          }
          tramo = [];
        };
        for (const argumento of nodo.arguments) {
          if (ts.isStringLiteral(argumento) || ts.isNoSubstitutionTemplateLiteral(argumento)) tramo.push(argumento);
          else cerrar();
        }
        cerrar();
      }
    }
    const texto = juntados.has(nodo) ? undefined : textoDe(nodo);
    if (texto !== undefined) textos.push(texto);
    ts.forEachChild(nodo, visitar);
  };
  visitar(arbol);
  return textos
    .filter((texto) => DE_FUERA.test(texto))
    .map((texto) => {
      const ruta = texto.replace(/^(?:\.\.\/)+/, '').replace(/\/+$/, '');
      // Lo que existe se mira en el disco —`frontend/Dockerfile` no lleva extension y es un archivo—;
      // lo que no, por su forma: sin extension, un directorio.
      const enDisco = join(REPOSITORIO, ruta);
      const directorio = existsSync(enDisco)
        ? statSync(enDisco).isDirectory()
        : !/\.\w+$/.test(ruta.slice(ruta.lastIndexOf('/') + 1));
      return { archivo, ruta, directorio };
    });
}

/**
 * Los patrones de `paths:` de un evento del `on:` —en linea (`paths: ["a", "b"]`) o en bloque—, o
 * `null` si el evento no filtra por rutas y corre con cualquier cambio. Lanza con lo que no sabe leer.
 */
export function patronesDelEvento(flujo: string, evento: string): readonly string[] | null {
  const lineas = flujo.split('\n');
  const inicioDelOn = lineas.findIndex((l) => /^on:\s*$/.test(l));
  if (inicioDelOn < 0) throw new Error('El flujo no tiene un bloque `on:` que este analizador sepa leer.');
  const delOn: string[] = [];
  for (const linea of lineas.slice(inicioDelOn + 1)) {
    if (/^\S/.test(linea)) break;
    delOn.push(linea);
  }
  const inicio = delOn.findIndex((l) => new RegExp(`^\\s+${evento}:\\s*$`).test(l));
  if (inicio < 0) throw new Error(`El \`on:\` del flujo no declara «${evento}».`);
  const sangria = /^(\s*)/.exec(delOn[inicio] ?? '')?.[1]?.length ?? 0;
  const delEvento: string[] = [];
  for (const linea of delOn.slice(inicio + 1)) {
    if (linea.trim() !== '' && (/^(\s*)/.exec(linea)?.[1]?.length ?? 0) <= sangria) break;
    delEvento.push(linea);
  }
  if (delEvento.some((l) => /^\s+paths-ignore:/.test(l))) {
    throw new Error(`«${evento}» usa \`paths-ignore\`, y este analizador no lo sabe leer.`);
  }
  const i = delEvento.findIndex((l) => /^\s+paths:/.test(l));
  if (i < 0) return null;
  const enLinea = /^\s+paths:\s*\[(.*)\]\s*$/.exec(delEvento[i] ?? '');
  const patrones = enLinea
    ? [...(enLinea[1] ?? '').matchAll(/"([^"]*)"|'([^']*)'/g)].map((m) => m[1] ?? m[2] ?? '')
    : (() => {
        const sangriaDePaths = /^(\s*)/.exec(delEvento[i] ?? '')?.[1]?.length ?? 0;
        const salida: string[] = [];
        for (const linea of delEvento.slice(i + 1)) {
          if (linea.trim() === '') continue;
          if ((/^(\s*)/.exec(linea)?.[1]?.length ?? 0) <= sangriaDePaths) break;
          const item = /^\s*-\s*(?:"([^"]*)"|'([^']*)'|(\S+))\s*$/.exec(linea);
          if (item === null) throw new Error(`«${evento}»: no se entiende esta linea de \`paths:\`: ${linea.trim()}`);
          salida.push(item[1] ?? item[2] ?? item[3] ?? '');
        }
        return salida;
      })();
  if (patrones.length === 0) throw new Error(`«${evento}» declara \`paths:\` y no se leyo ningun patron.`);
  for (const patron of patrones) {
    if (/[?+[\]!]/.test(patron)) {
      throw new Error(`«${evento}»: el patron «${patron}» usa un comodin que este analizador no evalua.`);
    }
  }
  return patrones;
}

/** Un patron de filtro de GitHub, con `*` y `**`, como expresion regular. */
function comoExpresion(patron: string): RegExp {
  const cuerpo = patron
    .split('**')
    .map((trozo) => trozo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '[^/]*'))
    .join('.*');
  return new RegExp(`^${cuerpo}$`);
}

/** Si el filtro cubre la lectura: el archivo, o todo lo que haya dentro del directorio. */
export function cubre(patrones: readonly string[] | null, lectura: Pick<Lectura, 'ruta' | 'directorio'>): boolean {
  if (patrones === null) return true;
  const casa = (ruta: string) => patrones.some((p) => comoExpresion(p).test(ruta));
  return lectura.directorio
    ? casa(`${lectura.ruta}/Cualquiera.java`) && casa(`${lectura.ruta}/un/nivel/Cualquiera.java`)
    : casa(lectura.ruta);
}

const flujo = existsSync(join(REPOSITORIO, FLUJO)) ? readFileSync(join(REPOSITORIO, FLUJO), 'utf8') : '';
const lecturas = fuentes()
  .filter((archivo) => archivo !== ESTE)
  .flatMap((archivo) => lecturasDeFuera(archivo, readFileSync(join(RAIZ, archivo), 'utf8')));
const esExcepcion = (l: Lectura) => EXCEPCIONES.some((e) => e.archivo === l.archivo && e.ruta === l.ruta);

describe('lo que las guardas del frontend leen de fuera de `frontend/` despierta a su CI', () => {
  it('EL CENTINELA: se leyeron las lecturas de fuera de las guardas, y los dos filtros', () => {
    // Sin esto, un barrido que no encontrara nada —otra forma de escribir las rutas, otra carpeta—
    // felicitaria a un filtro que no ha comparado con nada.
    const archivos = new Set(lecturas.map((l) => l.archivo));
    for (const guarda of [
      'verificaciones/camino-a-la-api.test.ts',
      'verificaciones/el-arbol-cuadra-con-el-backend.test.ts',
      'verificaciones/ninguna-opcion-del-menu-se-queda-muda.test.ts',
    ]) {
      expect(archivos, `no se encontro ninguna lectura de fuera en «${guarda}»`).toContain(guarda);
    }
    const rutas = lecturas.map((l) => l.ruta);
    expect(rutas).toContain('backend/kamayuk-caja-dominio-compartido/src/main/java/kamayuk/caja/dominio/Observacion.java');
    // Las dos formas de escribirla: un literal entero, y los tramos de un `join(…)`.
    expect(rutas).toContain('despliegue/compose.yaml');
    expect(rutas).toContain('.github/workflows/publicar-imagenes.yml');
    expect(lecturas.find((l) => l.ruta === 'backend/kamayuk-caja-nucleo/src/main/java/kamayuk/caja/nucleo/infraestructura/web')?.directorio).toBe(true);
    expect(patronesDelEvento(flujo, 'push')?.length ?? 0).toBeGreaterThan(3);
    expect(patronesDelEvento(flujo, 'pull_request')?.length ?? 0).toBeGreaterThan(3);
  });

  it.each(['push', 'pull_request'])('«%s» cubre cada archivo y cada directorio de fuera que una guarda lee', (evento) => {
    const patrones = patronesDelEvento(flujo, evento);
    const sinCubrir = lecturas
      .filter((l) => !esExcepcion(l) && !cubre(patrones, l))
      .map((l) => `  ${l.ruta}${l.directorio ? '/**' : ''}   (lo lee ${l.archivo})`);

    expect(
      [...new Set(sinCubrir)],
      `El filtro \`paths:\` de «${evento}» en ${FLUJO} no cubre lo que estas guardas leen:\n` +
        `${[...new Set(sinCubrir)].join('\n')}\n\n` +
        '  Un cambio ahi no haria correr la guarda que lo mira: no se rompe, deja de correr, en\n' +
        '  verde. Anada la ruta a `paths:` de `push` Y de `pull_request` (#136).',
    ).toEqual([]);
  });

  it('las excepciones siguen haciendo falta: una que ya no se usa se borra', () => {
    const sobran = EXCEPCIONES.filter((e) => !lecturas.some((l) => l.archivo === e.archivo && l.ruta === e.ruta));
    expect(sobran.map((e) => `${e.archivo}: ${e.ruta}`)).toEqual([]);
  });
});

describe('el analizador de la guarda', () => {
  it('ve lo que lee y no lo que la prosa nombra', () => {
    const fuente = [
      '// lee `backend/x/Comentado.java`',
      "const A = readFileSync(join(RAIZ, '../backend/a/Uno.java'));",
      "const B = join(REPOSITORIO, 'backend', 'b', 'Dos.java');",
      "const DIR = 'backend/c/web';",
      'const C = `${DIR}/Tres.java`;',
    ].join('\n');
    expect(lecturasDeFuera('muestra.ts', fuente)).toEqual([
      { archivo: 'muestra.ts', ruta: 'backend/a/Uno.java', directorio: false },
      { archivo: 'muestra.ts', ruta: 'backend/b/Dos.java', directorio: false },
      { archivo: 'muestra.ts', ruta: 'backend/c/web', directorio: true },
    ]);
  });

  it('lee `paths:` en linea y en bloque, y lanza con un comodin que no evalua', () => {
    const enLinea = 'on:\n  push:\n    branches: [main]\n    paths: ["frontend/**", "backend/a/Uno.java"]\n  pull_request:\n    paths: ["frontend/**"]\n';
    const enBloque = 'on:\n  push:\n    paths:\n      - "frontend/**"\n      - backend/b/**\n  pull_request:\n\npermissions: {}\n';
    expect(patronesDelEvento(enLinea, 'push')).toEqual(['frontend/**', 'backend/a/Uno.java']);
    expect(patronesDelEvento(enBloque, 'push')).toEqual(['frontend/**', 'backend/b/**']);
    expect(patronesDelEvento(enBloque, 'pull_request'), 'sin `paths:` corre con todo').toBeNull();
    expect(() => patronesDelEvento('on:\n  push:\n    paths: ["!backend/**"]\n', 'push')).toThrow(/no evalua/);
  });

  it('un directorio solo lo cubre un patron que case lo de dentro, a cualquier profundidad', () => {
    expect(cubre(['backend/c/web/**'], { ruta: 'backend/c/web', directorio: true })).toBe(true);
    expect(cubre(['backend/c/web/*.java'], { ruta: 'backend/c/web', directorio: true })).toBe(false);
    expect(cubre(['backend/c/web/Api.java'], { ruta: 'backend/c/web/Otro.java', directorio: false })).toBe(false);
    expect(cubre(['backend/**'], { ruta: 'backend/c/web/Otro.java', directorio: false })).toBe(true);
  });
});
