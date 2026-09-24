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
     - Si el candidato no declara `paths:` bajo `push:` —el caso de `backend.yml`— aplica
       SIEMPRE: Backend no tiene filtro y corre en cada push a `main`.
     - Si declara `paths:`, aplica solo si alguno de los archivos que cambio este push casa con
       alguno de esos patrones — la misma regla que usa GitHub para decidir si dispara el
       workflow. Esto es lo que hace que Despliegue, Frontend e Infraestructura NO bloqueen para
       siempre un push que no los toca: si sus `paths:` no casan, GitHub jamas crea una
       ejecucion para ellos en este `head_sha`, y esperarla seria esperar algo que no va a
       llegar.
     - Este mismo archivo (`publicar-imagenes.yml`) se excluye por nombre: preguntarse a si
       mismo no tiene sentido.

   El soporte de `paths:` aqui es DELIBERADAMENTE minimo: solo entiende una lista de rutas
   literales y el sufijo `/**` (prefijo + cualquier cosa debajo). Es exactamente lo que los
   `paths:` de este repositorio usan hoy — ni `*` suelto, ni `?`, ni negacion con `!` — y
   `analizarDisparadoresPush` lo verifica releyendo el `.yml` real, asi que un patron que este
   guion no supiera interpretar se notaria en la propia ejecucion (la lista de aplicables
   saldria vacia o distinta de lo esperado) y no en silencio.

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
        `queued`/`in_progress`) -> **esperar**. `main()` reintenta con una espera acotada.
     2. Todos terminaron pero alguno NO fue `success` (`failure`, `cancelled`, `timed_out`,
        `action_required`, `neutral`, `stale`) -> **no-avisar**, y se sale con codigo distinto
        de cero nombrando cual y con que resultado.
     3. Todos terminaron en `success` -> **avisar**.

   El reintento de `main()` esta acotado por `timeout-minutos` del propio job de GitHub Actions
   (que mata el proceso si se pasa) y ADEMAS por un limite propio mas corto, para que el guion
   termine con un mensaje legible en vez de con el `SIGTERM` mudo del runner. Agotar el limite
   sin que todos terminen se trata como **no-avisar**: la falta de una senal de exito no es una
   señal de exito. Es la misma doctrina que `verificarAislamiento` en el backend: una
   comprobacion que se salta a si misma —o que da por buena una ausencia— deja el build en
   verde sin haber verificado nada. */

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

// ---------------------------------------------------------------------------
// Leer de los propios `.yml` que dispara cada workflow, en vez de copiarlo a mano.

/**
 * Analiza el bloque `on:` de un workflow y devuelve si tiene disparador de `push`, sus
 * `branches:` y sus `paths:` (o `null` si no declara `paths:`, o sea que no tiene filtro).
 *
 * Deliberadamente especifico del formato de ESTE repositorio (indentado a dos espacios, listas
 * en linea `[a, b]` o en bloque `- a` / `- b`) y no un analizador de YAML general — la misma
 * decision que `despliegue/verificar-el-compose.mjs` toma al reves (usar la herramienta de
 * verdad) porque alli la interpolacion de Compose no se puede reproducir sin ella; aqui no hay
 * interpolacion que perder, y una segunda implementacion completa de YAML pesa mas que lo que
 * ahorra.
 */
export function analizarDisparadoresPush(contenidoYaml) {
  const lineas = contenidoYaml.split('\n');
  const inicioOn = lineas.findIndex((l) => /^on:\s*$/.test(l));
  if (inicioOn === -1) {
    // Todos los workflows de este repositorio declaran `on:` en bloque. Si alguno dejara de
    // hacerlo (`on: push` en una sola linea, por ejemplo) esto lo dice en vez de fingir que no
    // hay `push:`.
    throw new Error('no se encontro un bloque "on:" en formato de bloque');
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
    return { tienePush: false, ramas: [], patrones: null };
  }

  let ramas = [];
  let patrones = null;
  for (let j = indicePush + 1; j < lineas.length; j += 1) {
    const l = lineas[j];
    if (/^  \S/.test(l)) break; // otra clave de nivel 2 (p.ej. "pull_request:"): termino "push:"
    const mRamas = l.match(/^ {4}branches:\s*\[(.*)\]\s*$/);
    if (mRamas) {
      ramas = partirListaEnLinea(mRamas[1]);
      continue;
    }
    if (/^ {4}paths:\s*\[(.*)\]\s*$/.test(l)) {
      patrones = partirListaEnLinea(l.match(/^ {4}paths:\s*\[(.*)\]\s*$/)[1]);
      continue;
    }
    if (/^ {4}paths:\s*$/.test(l)) {
      patrones = [];
      for (let k = j + 1; k < lineas.length; k += 1) {
        const lk = lineas[k];
        const mItem = lk.match(/^ {6}-\s*(.+?)\s*$/);
        if (!mItem) break;
        patrones.push(quitarComillas(mItem[1]));
      }
    }
  }
  return { tienePush: true, ramas, patrones };
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
    const disparador = analizarDisparadoresPush(contenido);
    if (!disparador.tienePush) continue; // p.ej. registro.yml: solo pull_request
    if (!disparador.ramas.includes('main')) continue;
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
  const salida = execFileSync(
    'gh',
    ['api', `repos/${repo}/actions/runs`, '-X', 'GET', '-f', `head_sha=${sha}`, '-f', 'branch=main', '-f', 'event=push'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return JSON.parse(salida).workflow_runs ?? [];
}

/** La ejecucion mas reciente de `nombre` entre `runs` (por si hubo un re-run). */
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

  const limiteDeIntentos = Number(process.env.KAMAYUK_INTENTOS_MAX ?? 40); // ~20 min a 30s
  const esperaMs = Number(process.env.KAMAYUK_ESPERA_MS ?? 30_000);

  for (let intento = 1; intento <= limiteDeIntentos; intento += 1) {
    const runs = ejecucionesParaElSha(repo, sha);
    const estados = listaFinal.map((w) => ({ nombre: w.nombre, ejecucion: ultimaEjecucion(runs, w.nombre) }));
    const decision = decidirAccion(estados);
    console.log(`Intento ${intento}/${limiteDeIntentos}: ${decision.accion} — ${decision.motivo}`);

    if (decision.accion === 'avisar') {
      process.exit(0);
    }
    if (decision.accion === 'no-avisar') {
      console.error(`No se avisa a infrastructure: ${decision.motivo}`);
      process.exit(1);
    }
    if (intento < limiteDeIntentos) await dormir(esperaMs);
  }

  console.error(
    `Agotados los ${limiteDeIntentos} intentos sin que todos los workflows requeridos terminen: ` +
      'no se avisa. La ausencia de una senal de exito no es una senal de exito.',
  );
  process.exit(1);
}

function workflowsSinFiltrarPorRutas(directorioDeWorkflows, esteArchivo) {
  const archivos = readdirSync(directorioDeWorkflows)
    .filter((f) => (f.endsWith('.yml') || f.endsWith('.yaml')) && f !== esteArchivo)
    .sort();
  const requeridos = [];
  for (const archivo of archivos) {
    const contenido = readFileSync(`${directorioDeWorkflows}/${archivo}`, 'utf8');
    const disparador = analizarDisparadoresPush(contenido);
    if (!disparador.tienePush) continue;
    if (!disparador.ramas.includes('main')) continue;
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
  principal();
}
