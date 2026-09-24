/* Decide si `avisar` (el job de `publicar-imagenes.yml` que le pide a `infrastructure` que
   despliegue) puede correr para el `head_sha` de este push a `main`.

   ## El problema que resuelve, y por que no es `needs:` a secas

   `avisar` vive en `publicar-imagenes.yml`, que es SU PROPIO workflow, disparado por el MISMO
   evento de `push` que dispara `backend.yml`, `frontend.yml`, `infraestructura.yml` y
   `despliegue.yml` — pero como archivos de workflow DISTINTOS, no como jobs de este mismo
   archivo. GitHub Actions no tiene un `needs:` que cruce workflows: eso solo funciona entre
   jobs de un mismo archivo. Juntarlo todo en un solo pipeline (fusionar los cinco `on: push`
   en uno con `needs:` de verdad) se descarto por dos motivos medidos:

     1. Cada workflow tiene HOY su propio `concurrency:` y su propio `paths:` (ver mas abajo),
        y fusionarlos exigiria reescribir esos cinco archivos —no solo anadir uno— para una
        sola ganancia (gatear `avisar`), perdiendo ademas la lectura independiente de cada
        verificacion en la pestaña de Checks del PR.
     2. `backend.yml`, `frontend.yml` e `infraestructura.yml` ya EXISTEN con su propia razon de
        ser escrita en su cabecera; convertirlos en jobs de `publicar-imagenes.yml` les cambia
        el nombre que aparece en Checks, que es contrato con quien lee un PR hoy.

   La alternativa que queda es `workflow_run`, pero `workflow_run` tampoco da un «todos a la
   vez» nativo: cada uno dispara su PROPIO evento cuando termina, uno por uno. Lo que hace este
   guion es la parte que `workflow_run` no ofrece: en cada evento de finalizacion (Backend,
   Frontend, Infraestructura o Despliegue, el que sea) se vuelve a preguntar por TODOS, y solo
   se avisa cuando la ultima pieza pendiente tambien esta en `success`. Ver el comentario de
   cabecera de `publicar-imagenes.yml` para como se engancha esto al job `avisar`.

   ## Que workflows se exigen, y por que NO estan en una lista escrita a mano

   La exigencia es «Backend, Frontend e Infraestructura, y Despliegue si aplica a este push».
   Escribir esa lista a mano en este archivo seria una TERCERA copia de un dato que ya vive en
   dos sitios (el `on: push:` de cada `.yml`, escrito ademas DOS VECES dentro de cada uno,
   para `push` y para `pull_request` — la razon esta en la cabecera de `infraestructura.yml`
   y de `despliegue.yml`: GitHub Actions no admite anclas de YAML). Una tercera copia es una
   tercera oportunidad de que alguien edite un `paths:` y esta lista se quede vieja **en
   verde** —el mismo modo de fallo silencioso que motiva la lista doble dentro de cada
   workflow—.

   Asi que esto LEE los `.yml` de `.github/workflows/` en vez de repetirlos:

     - Un archivo con `on: push:` es candidato. Sin `on: push:` —como `registro.yml`, que solo
       declara `on: pull_request:`— NUNCA corre para un push a `main`, y por construccion no
       puede bloquear `avisar`: no hace falta excluirlo a mano, la ausencia de `push:` ya lo
       excluye. Ese es el caso de Registro que el issue #115 pide decidir: **no aplica**, y la
       razon no es una opinion sino que el propio archivo no tiene disparador de push.
     - Si el candidato tiene `push:` pero sin restriccion de rama (ni `branches:` ni
       `branches-ignore:`), aplica a CUALQUIER rama, `main` incluida.
     - Si declara `branches:`, aplica solo si `main` esta en la lista. Si declara
       `branches-ignore:`, aplica solo si `main` NO esta en la lista. Las dos formas —en linea
       `[a, b]` y en bloque `- a` / `- b`— se interpretan igual.
     - Si el candidato no declara `paths:` bajo `push:` —el caso de `backend.yml`— aplica
       SIEMPRE (para la rama que le toque): Backend no tiene filtro de rutas y corre en cada
       push a `main`.
     - Si declara `paths:`, aplica solo si alguno de los archivos que cambio este push casa con
       alguno de esos patrones — la misma regla que usa GitHub para decidir si dispara el
       workflow. Esto es lo que hace que Despliegue, Frontend e Infraestructura NO bloqueen para
       siempre un push que no los toca: si sus `paths:` no casan, GitHub jamas crea una
       ejecucion para ellos en este `head_sha`, y esperarla seria esperar algo que no va a
       llegar.
     - Este mismo archivo (`publicar-imagenes.yml`) se excluye por nombre: preguntarse a si
       mismo no tiene sentido.

   ## El soporte de `branches:`/`branches-ignore:`/`paths:` es minimo A PROPOSITO, y FALLA
   ## CERRADO cuando no alcanza

   Solo entiende listas de nombres o rutas LITERALES —en linea o en bloque— y, para `paths:`
   ademas, el sufijo `/**` (prefijo + cualquier cosa debajo). Es exactamente lo que los
   `.github/workflows/` de este repositorio usan hoy: ni `*` suelto, ni `?`, ni negacion con
   `!`, ni `branches-ignore` combinado con `branches`.

   **Y no se limita a confiar en que sea asi.** La primera version de este analizador, ante una
   forma que no sabia leer —`branches:` en bloque, o `branches-ignore:`—, devolvia una lista de
   ramas VACIA en silencio: el workflow quedaba fuera de lo exigido sin que nada lo dijera, que
   es la direccion PELIGROSA de fallar —`avisar` corriendo sin haber esperado a alguien que
   debia terminar—. Se corrigio dos veces: SE IMPLEMENTARON el bloque y `branches-ignore` de
   verdad (`analizarDisparadoresPush`, mas abajo), y ademas cualquier patron —de rama o de
   ruta— con un caracter de comodin que este analizador no evalua (`*`, `?`, `+`, `[`, `]`, `!`,
   fuera del unico `/**` que si se entiende) hace que la funcion LANCE, nombrando el archivo y
   el patron. Un `throw` sin capturar aqui detiene `principal()` con codigo de salida distinto
   de cero: **la duda entera bloquea el aviso, no solo el workflow ambiguo** — el mismo criterio
   de «ante la duda, no se avisa» que usan los otros dos desenlaces de `decidirAccion`.

   ## Por que Backend puede tardar y aun asi no hay carrera

   `avisar` corre DESPUES de `publicar` (construir las tres imagenes) y `comprobar`
   (preguntarle al registro por las tres etiquetas), asi que para cuando este guion se ejecuta
   ya pasaron varios minutos desde el push — tiempo de sobra para que GitHub haya CREADO (no
   necesariamente terminado) las ejecuciones de los demas workflows aplicables. Aun asi este
   guion no asume que ya estan: si un workflow aplicable todavia no aparece en la API de
   ejecuciones, se trata igual que «pendiente» — nunca como «no aplica» ni como «exito» — y se
   reintenta. Ver `decidirAccion`.

   ## Los tres desenlaces, y por que `esperar` no es un bucle sin fondo

   `decidirAccion` distingue tres casos, y el orden importa:

     1. Falta alguno por terminar (no existe todavia su ejecucion, o existe pero sigue en
        `queued`/`in_progress`) -> **esperar**.
     2. Todos terminaron pero alguno NO fue `success` (`failure`, `cancelled`, `timed_out`,
        `action_required`, `neutral`, `stale`, `skipped`) -> **no-avisar**, y se sale con codigo
        distinto de cero nombrando cual y con que resultado.
     3. Todos terminaron en `success` -> **avisar**.

   `esperarYDecidir` es quien reintenta, y trata IGUAL a «pendiente» dos cosas distintas: un
   `decidirAccion` que dice `esperar`, y un fallo AL CONSULTAR la API (`gh api` sin red, un 5xx
   transitorio de GitHub, lo que sea) — una falla de la consulta no es una senal de que algo
   este mal, es simplemente no saber todavia, y por eso no interrumpe el reintento: se registra
   y se vuelve a intentar como cualquier «esperar». El reintento esta acotado por
   `timeout-minutes` del propio job de GitHub Actions (que mata el proceso si se pasa) y ADEMAS
   por un limite propio mas corto (`KAMAYUK_INTENTOS_MAX`), para que el guion termine con un
   mensaje legible en vez de con el `SIGTERM` mudo del runner. Agotar el limite —por
   pendientes, por fallos de consulta, o por una mezcla de los dos— se trata como
   **no-avisar**, nombrando el ultimo motivo conocido (que si el agotamiento fue por fallos de
   consulta, nombra el ultimo error): la falta de una senal de exito no es una señal de exito.
   Es la misma doctrina que `verificarAislamiento` en el backend: una comprobacion que se salta
   a si misma —o que da por buena una ausencia— deja el build en verde sin haber verificado
   nada. */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------
// Coincidencia de rutas, con el mismo alcance que los `paths:` de este repositorio.

/**
 * Si `archivo` casa con `patron`. Solo dos formas: literal, o `prefijo/**` para «ese
 * directorio y cualquier cosa debajo». Es lo unico que los `paths:` de `.github/workflows/`
 * usan hoy (ver la cabecera).
 */
export function coincidePatron(archivo, patron) {
  if (patron.endsWith('/**')) {
    const prefijo = patron.slice(0, -2); // "frontend/**" -> "frontend/"
    return archivo.startsWith(prefijo);
  }
  return archivo === patron;
}

/** Si alguno de `archivos` casa con alguno de `patrones`. */
export function algunoAplica(archivos, patrones) {
  return archivos.some((archivo) => patrones.some((patron) => coincidePatron(archivo, patron)));
}

/**
 * Si `patron` trae un caracter que este analizador NO evalua como comodin —fuera del unico
 * `/**` que si soporta—. Se usa tanto para `branches:`/`branches-ignore:` (donde ningun
 * comodin esta soportado) como para `paths:` (donde el sufijo `/**` es la unica excepcion).
 */
function tieneComodinNoSoportado(patron, permitirSufijoDobleAsterisco) {
  const cuerpo =
    permitirSufijoDobleAsterisco && patron.endsWith('/**') ? patron.slice(0, -3) : patron;
  return /[*?+[\]!]/.test(cuerpo);
}

function exigirPatronesSoportados(patrones, { archivo, etiqueta, permitirSufijoDobleAsterisco }) {
  for (const patron of patrones) {
    if (tieneComodinNoSoportado(patron, permitirSufijoDobleAsterisco)) {
      throw new Error(
        `«${archivo}» declara ${etiqueta} «${patron}», con un comodin que este analizador no ` +
          'evalua. Fallando cerrado: sin poder decidir con certeza si esto aplica a este push, ' +
          'no se avisa a infrastructure. Arreglo: quitar el comodin, o extender ' +
          '`analizarDisparadoresPush` en decidir-avisar.mjs para entenderlo de verdad.',
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Leer de los propios `.yml` que dispara cada workflow, en vez de copiarlo a mano.

/**
 * Analiza el bloque `on:` de un workflow y devuelve si tiene disparador de `push`, si ese
 * `push:` aplica a la rama `main` y sus `paths:` (o `null` si no declara `paths:`, o sea que no
 * tiene filtro de rutas).
 *
 * Deliberadamente especifico del formato de ESTE repositorio (indentado a dos espacios, listas
 * en linea `[a, b]` o en bloque `- a` / `- b`) y no un analizador de YAML general — la misma
 * decision que `despliegue/verificar-el-compose.mjs` toma al reves (usar la herramienta de
 * verdad) porque alli la interpolacion de Compose no se puede reproducir sin ella; aqui no hay
 * interpolacion que perder, y una segunda implementacion completa de YAML pesa mas que lo que
 * ahorra. Lo que SI hace, para no fallar en la direccion peligrosa, es lanzar en vez de adivinar
 * ante una forma que no entiende (ver la cabecera, «FALLA CERRADO»).
 *
 * `archivo` es solo para el mensaje de un eventual error; por omision es `'<workflow>'`, para
 * que las pruebas puedan llamar esta funcion con YAML sintetico sin tener que inventar un
 * nombre de archivo.
 */
export function analizarDisparadoresPush(contenidoYaml, archivo = '<workflow>') {
  const lineas = contenidoYaml.split('\n');
  const inicioOn = lineas.findIndex((l) => /^on:\s*$/.test(l));
  if (inicioOn === -1) {
    // Todos los workflows de este repositorio declaran `on:` en bloque. Si alguno dejara de
    // hacerlo (`on: push` en una sola linea, por ejemplo) esto lo dice en vez de fingir que no
    // hay `push:`.
    throw new Error(`«${archivo}» no tiene un bloque "on:" en formato de bloque`);
  }

  let indicePush = -1;
  for (let i = inicioOn + 1; i < lineas.length; i += 1) {
    const l = lineas[i];
    if (/^\S/.test(l)) break; // salimos de "on:": una linea sin indentar
    if (/^  push:\s*$/.test(l)) {
      indicePush = i;
      break;
    }
  }
  if (indicePush === -1) {
    return { tienePush: false, aplicaAMain: false, patrones: null };
  }

  let filtroDeRamas = null; // { tipo: 'incluye' | 'excluye', patrones: string[] }
  let patrones = null;
  for (let j = indicePush + 1; j < lineas.length; j += 1) {
    const l = lineas[j];
    if (/^  \S/.test(l)) break; // otra clave de nivel 2 (p.ej. "pull_request:"): termino "push:"

    const mClaveDeRamas = l.match(/^ {4}(branches|branches-ignore):\s*(.*)$/);
    if (mClaveDeRamas) {
      const [, clave, resto] = mClaveDeRamas;
      if (filtroDeRamas !== null) {
        // GitHub no admite `branches:` y `branches-ignore:` a la vez en el mismo evento; si
        // este archivo lo hiciera, no hay una interpretacion segura.
        throw new Error(`«${archivo}» declara "branches:" y "branches-ignore:" a la vez bajo "push:"`);
      }
      const tipo = clave === 'branches' ? 'incluye' : 'excluye';
      const listaPatrones = leerListaEnLineaOBloque(lineas, j, resto, 4);
      exigirPatronesSoportados(listaPatrones.valores, {
        archivo,
        etiqueta: `"${clave}:"`,
        permitirSufijoDobleAsterisco: false,
      });
      filtroDeRamas = { tipo, patrones: listaPatrones.valores };
      j = listaPatrones.ultimaLineaConsumida;
      continue;
    }

    const mClaveDeRutas = l.match(/^ {4}paths:\s*(.*)$/);
    if (mClaveDeRutas) {
      const listaPatrones = leerListaEnLineaOBloque(lineas, j, mClaveDeRutas[1], 4);
      exigirPatronesSoportados(listaPatrones.valores, {
        archivo,
        etiqueta: '"paths:"',
        permitirSufijoDobleAsterisco: true,
      });
      patrones = listaPatrones.valores;
      j = listaPatrones.ultimaLineaConsumida;
      continue;
    }
  }

  const aplicaAMain =
    filtroDeRamas === null
      ? true // sin "branches:" ni "branches-ignore:": push: aplica a cualquier rama
      : filtroDeRamas.tipo === 'incluye'
        ? filtroDeRamas.patrones.includes('main')
        : !filtroDeRamas.patrones.includes('main');

  return { tienePush: true, aplicaAMain, patrones };
}

/**
 * Lee una lista de YAML que puede venir EN LINEA (`clave: [a, b]`, con `resto` = `"[a, b]"`) o
 * EN BLOQUE (`clave:` sola, seguida de `      - a` / `      - b` con dos espacios mas de
 * indentacion que `clave:`). Devuelve los valores y el indice de la ULTIMA linea que consumio
 * (para que quien recorre `lineas` pueda saltarsela).
 */
function leerListaEnLineaOBloque(lineas, indiceDeLaClave, resto, indentacionDeLaClave) {
  const restoLimpio = resto.trim();
  if (restoLimpio.startsWith('[')) {
    const m = restoLimpio.match(/^\[(.*)\]\s*$/);
    if (!m) {
      throw new Error(`no se pudo leer la lista en linea «${resto}» (linea ${indiceDeLaClave + 1})`);
    }
    return { valores: partirListaEnLinea(m[1]), ultimaLineaConsumida: indiceDeLaClave };
  }
  if (restoLimpio !== '') {
    // Un escalar suelto (`clave: main`, sin corchetes) no es una forma que este repositorio
    // use, y adivinar si es una lista de uno o un valor mal escrito seria una suposicion. Se
    // trata igual que un comodin no soportado: falla cerrado nombrando la linea.
    throw new Error(
      `no se reconoce la forma «${resto.trim()}» en la linea ${indiceDeLaClave + 1}: ni lista ` +
        'en linea ("[a, b]") ni bloque vacio seguido de "- a"',
    );
  }
  // Bloque: las lineas siguientes, con dos espacios mas de indentacion, empiezan por "- ".
  const indentacionDelItem = ' '.repeat(indentacionDeLaClave + 2);
  const valores = [];
  let k = indiceDeLaClave + 1;
  for (; k < lineas.length; k += 1) {
    const mItem = lineas[k].match(new RegExp(`^${indentacionDelItem}-\\s*(.+?)\\s*$`));
    if (!mItem) break;
    valores.push(quitarComillas(mItem[1]));
  }
  return { valores, ultimaLineaConsumida: k - 1 };
}

function partirListaEnLinea(contenido) {
  if (contenido.trim() === '') return [];
  return contenido.split(',').map((s) => quitarComillas(s.trim()));
}

function quitarComillas(s) {
  return s.replace(/^["']/, '').replace(/["']$/, '');
}

/**
 * El nombre declarado (`name:`) de un workflow — el mismo texto que aparece como `.name` en la
 * API de ejecuciones de Actions y en la pestaña de Checks.
 */
export function nombreDelWorkflow(contenidoYaml) {
  const linea = contenidoYaml.split('\n').find((l) => /^name:\s*/.test(l));
  if (!linea) throw new Error('el workflow no declara "name:"');
  return linea.replace(/^name:\s*/, '').trim();
}

/**
 * Los workflows que EXIGE este push a `main`: los que tienen `push:` hacia `main` y, si
 * declaran `paths:`, alguno de esos patrones casa con `archivosCambiados`.
 *
 * `directorioDeWorkflows` es donde leer los `.yml`; `esteArchivo` es el nombre del propio
 * `publicar-imagenes.yml`, que se excluye siempre.
 */
export function workflowsRequeridos(directorioDeWorkflows, esteArchivo, archivosCambiados) {
  const archivos = readdirSync(directorioDeWorkflows)
    .filter((f) => (f.endsWith('.yml') || f.endsWith('.yaml')) && f !== esteArchivo)
    .sort();

  const requeridos = [];
  for (const archivo of archivos) {
    const contenido = readFileSync(`${directorioDeWorkflows}/${archivo}`, 'utf8');
    const disparador = analizarDisparadoresPush(contenido, archivo);
    if (!disparador.tienePush) continue; // p.ej. registro.yml: solo pull_request
    if (!disparador.aplicaAMain) continue;
    const aplicaPorRutas = disparador.patrones === null || algunoAplica(archivosCambiados, disparador.patrones);
    if (!aplicaPorRutas) continue;
    requeridos.push({ archivo, nombre: nombreDelWorkflow(contenido) });
  }
  return requeridos;
}

// ---------------------------------------------------------------------------
// La decision, dado el estado ya consultado de cada workflow requerido.

/**
 * `estados`: `[{ nombre, ejecucion }]`, con `ejecucion` = `null` (todavia no aparece en la API)
 * o `{ status, conclusion }` (tal como los da la API de ejecuciones de Actions).
 *
 * Devuelve `{ accion: 'avisar' | 'esperar' | 'no-avisar', motivo }`.
 */
export function decidirAccion(estados) {
  if (estados.length === 0) {
    return { accion: 'avisar', motivo: 'Ningun workflow hermano aplica a este push.' };
  }

  const pendientes = estados.filter((e) => !e.ejecucion || e.ejecucion.status !== 'completed');
  if (pendientes.length > 0) {
    return {
      accion: 'esperar',
      motivo: `Todavia no terminan: ${pendientes.map((e) => e.nombre).join(', ')}.`,
    };
  }

  const fallidos = estados.filter((e) => e.ejecucion.conclusion !== 'success');
  if (fallidos.length > 0) {
    return {
      accion: 'no-avisar',
      motivo: `Terminaron sin exito: ${fallidos
        .map((e) => `${e.nombre} (${e.ejecucion.conclusion})`)
        .join(', ')}.`,
    };
  }

  return {
    accion: 'avisar',
    motivo: `Todos terminaron en success: ${estados.map((e) => e.nombre).join(', ')}.`,
  };
}

// ---------------------------------------------------------------------------
// El reintento: junta `decidirAccion` con una consulta que puede fallar, y decide cuando
// rendirse. Separado de `principal()` para que se pruebe con una `obtenerEjecuciones` y una
// `dormir` de mentira (`node --test`, sin red, sin esperar de verdad).

/**
 * `listaFinal`: los workflows exigidos, tal como los da `workflowsRequeridos`.
 * `obtenerEjecuciones`: funcion (sin argumentos, puede ser async) que devuelve las ejecuciones
 *   crudas de la API para este `head_sha` — o LANZA si la consulta fallo.
 * `intentosMax`, `dormir` (funcion sin argumentos que espera entre intentos).
 * `ultimaEjecucionDe`, `decidir`: inyectables solo para pruebas; por omision son
 *   `ultimaEjecucion` y `decidirAccion` de este mismo archivo.
 *
 * Devuelve `{ accion: 'avisar' | 'no-avisar', motivo }` — nunca `'esperar'`: eso se resuelve
 * aqui dentro, reintentando.
 */
export async function esperarYDecidir({
  listaFinal,
  obtenerEjecuciones,
  intentosMax,
  dormir,
  ultimaEjecucionDe = ultimaEjecucion,
  decidir = decidirAccion,
  log = () => {},
}) {
  let ultimoMotivo = '(sin intentos todavia)';
  for (let intento = 1; intento <= intentosMax; intento += 1) {
    let decision;
    try {
      const runs = await obtenerEjecuciones();
      const estados = listaFinal.map((w) => ({ nombre: w.nombre, ejecucion: ultimaEjecucionDe(runs, w.nombre) }));
      decision = decidir(estados);
    } catch (error) {
      // Una consulta que falla no es una senal de que algo este mal: es simplemente no saber
      // todavia. Se trata como "esperar" y se reintenta, en vez de tumbar todo el guion por un
      // 5xx transitorio de la API o de la red del runner.
      decision = {
        accion: 'esperar',
        motivo: `No se pudo consultar la API de ejecuciones: ${error.message}`,
      };
    }

    ultimoMotivo = decision.motivo;
    log(`Intento ${intento}/${intentosMax}: ${decision.accion} — ${decision.motivo}`);

    if (decision.accion !== 'esperar') {
      return decision;
    }
    if (intento < intentosMax) await dormir();
  }

  return {
    accion: 'no-avisar',
    motivo:
      `Agotados los ${intentosMax} intentos sin que todos los workflows requeridos terminen. ` +
      `Ultimo estado conocido: ${ultimoMotivo}`,
  };
}

// ---------------------------------------------------------------------------
// La parte con efectos (git, gh api, espera). Separada para que lo de arriba se pruebe sin red
// ni Docker ni un repositorio real (node --test, `decidir-avisar.test.mjs`).

function archivosCambiadosPor(before, sha) {
  if (!before || /^0+$/.test(before)) {
    // Rama nueva o el `before` que GitHub manda cuando no hay commit anterior que comparar
    // (p.ej. el primer push de una rama). No hay diff posible: se trata como si TODO hubiera
    // cambiado, que es el lado seguro — sobra exigir un workflow de mas, nunca falta uno.
    return null;
  }
  try {
    const salida = execFileSync('git', ['diff', '--name-only', `${before}`, `${sha}`], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    return salida.split('\n').filter((l) => l.trim().length > 0);
  } catch (error) {
    console.error(`No se pudo calcular el diff entre ${before} y ${sha}: ${error.message}`);
    return null; // mismo criterio: del lado seguro, se asume que todo aplica.
  }
}

function ejecucionesParaElSha(repo, sha) {
  // `-X GET` no es decorativo: `gh api` cambia el metodo a POST en cuanto ve un `-f`, salvo que
  // se le diga lo contrario — y estos tres `-f` son parametros de consulta, no un cuerpo.
  //
  // Sin `--paginate`: la respuesta por omision trae hasta 30 ejecuciones, y este repositorio
  // tiene cinco workflows con `push:` a `main` en total — un push nunca puede generar mas
  // ejecuciones que workflows existen. Paginar aqui solo cambiaria como se parte la respuesta
  // entre paginas, no cuantos resultados hay, asi que se omite por simplicidad: un JSON, un
  // `JSON.parse`.
  //
  // Si `execFileSync` o `JSON.parse` lanzan —sin red, `gh` sin autenticar, un 5xx transitorio,
  // una respuesta cortada— esta funcion NO lo atrapa: quien la llama (`esperarYDecidir`, via
  // `obtenerEjecuciones`) es quien decide que una consulta fallida es «todavia no se sabe» y
  // reintenta.
  const salida = execFileSync(
    'gh',
    ['api', `repos/${repo}/actions/runs`, '-X', 'GET', '-f', `head_sha=${sha}`, '-f', 'branch=main', '-f', 'event=push'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return JSON.parse(salida).workflow_runs ?? [];
}

/**
 * La ejecucion mas reciente de `nombre` entre `runs`.
 *
 * NO es «por si hubo un re-run»: un «Re-run all jobs» (o «Re-run failed jobs») de GitHub
 * reutiliza el MISMO `run_id` y el MISMO `run_number` — solo sube `run_attempt` — asi que un
 * re-run no aparece aqui como una entrada distinta, y ordenar por `run_number` no lo resuelve.
 * Lo que SI produce dos entradas con el mismo `name` para el mismo `head_sha` es volver a
 * empujar ese mismo commit —forzar una rama de vuelta a un sha por el que ya paso un push—:
 * cada `push` es un evento nuevo y GitHub crea una ejecucion nueva, con `run_number` mayor,
 * para el mismo `head_sha`. Ordenar por `run_number` se queda con esa, la mas reciente.
 */
function ultimaEjecucion(runs, nombre) {
  const delWorkflow = runs.filter((r) => r.name === nombre);
  if (delWorkflow.length === 0) return null;
  delWorkflow.sort((a, b) => (b.run_number ?? 0) - (a.run_number ?? 0));
  return { status: delWorkflow[0].status, conclusion: delWorkflow[0].conclusion };
}

async function dormir(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function principal() {
  const sha = requerido('GITHUB_SHA_A_VERIFICAR');
  const before = process.env.GITHUB_EVENT_BEFORE ?? '';
  const repo = requerido('GITHUB_REPOSITORIO'); // "hneyra/caja"
  const directorioDeWorkflows = process.env.KAMAYUK_DIR_WORKFLOWS ?? '.github/workflows';
  const esteArchivo = process.env.KAMAYUK_ESTE_WORKFLOW ?? 'publicar-imagenes.yml';

  const archivosCambiados = archivosCambiadosPor(before, sha);
  // Sin diff posible (rama nueva, o el `git diff` fallo): del lado seguro, se piden TODOS los
  // candidatos con push: a main, tengan o no paths: — nunca se descarta uno por no poder
  // comprobar si aplica.
  const listaFinal =
    archivosCambiados === null
      ? workflowsSinFiltrarPorRutas(directorioDeWorkflows, esteArchivo)
      : workflowsRequeridos(directorioDeWorkflows, esteArchivo, archivosCambiados);

  console.log(`Workflows exigidos para ${sha}: ${listaFinal.map((w) => w.nombre).join(', ') || '(ninguno)'}`);

  const intentosMax = Number(process.env.KAMAYUK_INTENTOS_MAX ?? 40); // ~20 min a 30s
  const esperaMs = Number(process.env.KAMAYUK_ESPERA_MS ?? 30_000);

  const decision = await esperarYDecidir({
    listaFinal,
    obtenerEjecuciones: () => ejecucionesParaElSha(repo, sha),
    intentosMax,
    dormir: () => dormir(esperaMs),
    log: (mensaje) => console.log(mensaje),
  });

  if (decision.accion === 'avisar') {
    console.log(decision.motivo);
    process.exit(0);
  }
  console.error(`No se avisa a infrastructure: ${decision.motivo}`);
  process.exit(1);
}

function workflowsSinFiltrarPorRutas(directorioDeWorkflows, esteArchivo) {
  const archivos = readdirSync(directorioDeWorkflows)
    .filter((f) => (f.endsWith('.yml') || f.endsWith('.yaml')) && f !== esteArchivo)
    .sort();
  const requeridos = [];
  for (const archivo of archivos) {
    const contenido = readFileSync(`${directorioDeWorkflows}/${archivo}`, 'utf8');
    const disparador = analizarDisparadoresPush(contenido, archivo);
    if (!disparador.tienePush) continue;
    if (!disparador.aplicaAMain) continue;
    requeridos.push({ archivo, nombre: nombreDelWorkflow(contenido) });
  }
  return requeridos;
}

function requerido(nombre) {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre}`);
  return valor;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().catch((error) => {
    // Cualquier lanzamiento no atrapado hasta aqui —incluido el «falla cerrado» de un patron de
    // rama o de ruta que este analizador no evalua— cae aqui: se nombra y se sale en rojo, en
    // vez de dejar que Node imprima una traza de promesa no atrapada y un codigo de salida que
    // depende de la version.
    console.error(`No se avisa a infrastructure: ${error.message}`);
    process.exit(1);
  });
}
