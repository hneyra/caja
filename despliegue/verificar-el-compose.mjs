/* Comprueba que `despliegue/compose.yaml` declara lo que dice declarar.

   ## Por que existe

   Hasta #39 **nada del CI de este repositorio leia este archivo**. Sus dos unicas
   apariciones en `.github/workflows/` eran comentarios, y la guarda que si lo lee vive
   en el repositorio `infrastructure` —`infra/verificaciones/compose-de-los-sistemas.ts`—
   y hoy no corre en un espacio de trabajo sin `normativa` clonado (ver
   `docs/00-gobierno/huecos-en-infrastructure.md` §0).

   O sea: el archivo que declara como se levanta este sistema entero estaba sin
   verificacion automatica viva. Lo que no se revisa no se distingue de lo que nadie
   tenia que revisar, que es el mismo modo de fallo silencioso que #17 encontro en un
   `paths:` mal puesto y que #711 encontro en la fila que nadie escribia.

   ## Por que usa `docker compose config` y no un analizador de YAML propio

   Escribir aqui un analizador seria una SEGUNDA implementacion de YAML —la primera es
   la de Compose, que es la que manda— y las dos envejecerian por separado. Ademas hay
   una mitad que ningun analizador da: la INTERPOLACION. `${KAMAYUK_CLAVE_APP:?...}` no
   es texto, es un contrato con el `.env` de la plataforma, y solo la herramienta de
   verdad dice si se cumple.

   `config` NO necesita demonio: resuelve el archivo y lo imprime. Medido en una maquina
   sin `docker`, `podman`, `nerdctl`, `buildah`, `docker-compose` ni `podman-compose`,
   bajando el binario oficial `docker/compose v5.5.1` y cotejando su sha256.

   ## Lo que `config` NO puede ver, y por eso esto cuenta y nombra

   **Medido**: borrando el servicio `caja-interfaz` del archivo, `config --services`
   sale con **exit 0** y lista los tres que quedan. Una verificacion que solo comprobara
   «resuelve sin error» pasaria en verde con la interfaz fuera del compose. Por eso aqui
   se compara el conjunto de servicios contra una lista escrita, y el fallo NOMBRA el
   que falta o el que sobra.

   Y por lo mismo se compara el GRAFO DE DEPENDENCIAS entero y no solo «`caja-interfaz`
   no tiene `depends_on`»: esa sola afirmacion la cumpliria tambien un archivo al que le
   hubieran borrado TODOS los `depends_on`, y ese archivo arranca el backend contra una
   base sin migrar.

   ## No se omite sin Compose: falla

   Si no encuentra un binario, esto sale ROJO. Es la doctrina de `verificarAislamiento`
   —«una prueba bloqueante que se salta a si misma deja el build en verde sin haber
   verificado nada»—. La salida documentada es instalar Compose o apuntar
   `KAMAYUK_COMPOSE` a un binario que ya exista.

   ## Uso

     node despliegue/verificar-el-compose.mjs
     KAMAYUK_COMPOSE=/ruta/a/docker-compose node despliegue/verificar-el-compose.mjs
*/

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const COMPOSE = fileURLToPath(new URL('./compose.yaml', import.meta.url));

/** El nombre del proyecto. Es el prefijo de todo contenedor y de toda red que cree. */
const PROYECTO = 'kamayuk-caja';

/** Los cuatro procesos de este sistema, con la imagen y el objetivo con que se
    construye cada uno. `caja-implantacion` y `caja` comparten imagen a proposito:
    ADR-0003, un artefacto y dos perfiles. */
const SERVICIOS = {
  'caja-migraciones': { imagen: 'kamayuk-caja-migrador:compose', objetivo: 'migrador' },
  'caja-implantacion': { imagen: 'kamayuk-caja:compose', objetivo: 'aplicacion' },
  caja: { imagen: 'kamayuk-caja:compose', objetivo: 'aplicacion' },
  'caja-interfaz': { imagen: 'kamayuk-caja-interfaz:compose', objetivo: 'interfaz' },
};

/** El grafo ENTERO, y no solo el hueco de la interfaz. El orden de arranque es una
    afirmacion sobre la base de datos: el backend no puede atender antes de que el
    migrador haya terminado, y la implantacion no puede escribir en tablas que aun no
    existen. `caja-interfaz` no depende de nadie porque no habla con nadie. */
const DEPENDENCIAS = {
  'caja-migraciones': {},
  'caja-implantacion': { 'caja-migraciones': 'service_completed_successfully' },
  caja: { 'caja-implantacion': 'service_completed_successfully' },
  'caja-interfaz': {},
};

/** Las variables que este compose exige SIN valor por omision (`${X:?...}`), o sea el
    contrato con el `.env` de la plataforma. Se comprueba el conjunto exacto, y eso caza
    las dos direcciones: una variable nueva que nadie documento, y —peor— una que pierda
    su `:?` y pase a `:-`, porque entonces una clave que falta se convierte en la cadena
    vacia y el proceso arranca conectandose sin contrasena. */
const OBLIGATORIAS = [
  'KAMAYUK_ADMINISTRADOR',
  'KAMAYUK_CANAL_DE_OPERACION',
  'KAMAYUK_CLAVE_APP',
  'KAMAYUK_CLAVE_OWNER',
  'KAMAYUK_MUNICIPALIDAD',
  'KAMAYUK_RESPONSABLE_DE_OPERACION',
  'KAMAYUK_UBIGEO',
];

/** La red de la plataforma, que este compose USA y no crea. Sin `external: true`
    Compose crearia una segunda con el mismo nombre y los servicios no verian a `base`;
    el sintoma seria «Connection refused», que se lee como que el motor no esta
    levantado. */
const RED = { nombre: 'kamayuk-plataforma', externa: true };

const fallos = [];
const carpeta = mkdtempSync(join(tmpdir(), 'kamayuk-39-'));
const ENV_VACIO = join(carpeta, 'vacio.env');
writeFileSync(ENV_VACIO, '');

const compose = buscarCompose();
console.log(`Compose: ${compose.join(' ')} (${version(compose)})`);
console.log(`Archivo: ${COMPOSE}`);
console.log('');

laFormaDelArchivo(resolver(elContratoConElEntorno()));

console.log('');
if (fallos.length > 0) {
  console.error(`FALLO: ${fallos.length} afirmacion(es) de despliegue/compose.yaml no se cumplen.`);
  console.error('');
  for (const fallo of fallos) {
    console.error(`  · ${fallo}`);
  }
  console.error('');
  console.error('  Este archivo declara como se levanta el sistema entero, y hasta #39 no lo');
  console.error('  leia nadie en CI. Si el cambio es deliberado, la lista de arriba de este');
  console.error('  script se cambia CON el archivo, en el mismo PR.');
  process.exit(1);
}
console.log('despliegue/compose.yaml dice lo que dice que dice.');

// ---------------------------------------------------------------------------

/** El contrato con el `.env`, medido UNA PASADA POR VARIABLE.

    Se quita una sola y se comprueba que el archivo deja de resolver **nombrandola**. Que
    no falte ninguna por el otro lado lo dice la pasada siguiente: con las siete puestas
    tiene que resolver entero, asi que una octava obligatoria que apareciera saldria roja
    alli, con su nombre dentro.

    ## Por que una por una y no todas de golpe. Lo dijo CI, no un razonamiento

    La primera version las quitaba las siete a la vez y leia del mensaje de error cuales
    faltaban. **Verde en la maquina donde se escribio y ROJA en el runner**: aqui corre
    `docker/compose v5.5.1`, que enumera las once interpolaciones fallidas, y
    `ubuntu-latest` traia **2.38.2**, que aborta en la primera — asi que informaba de UNA
    (`KAMAYUK_CLAVE_OWNER`) y las otras seis salian como «ya no la exige» sobre un archivo
    correcto. Con una variable fuera cada vez, las dos versiones se comportan igual:
    hay exactamente un error que informar.

    Y por lo mismo no se busca el texto de Compose. Lo que se exige en la salida es el
    **nombre de la variable**, que esta ahi porque lo escribe el propio `compose.yaml` en
    su mensaje de `:?` — depender de la redaccion de la herramienta es justo lo que acaba
    de fallar.

    Devuelve el entorno con las siete puestas a un valor de relleno. Los valores no
    importan —nada se levanta— pero tienen que existir, porque `${X:?...}` es un error de
    resolucion y no un valor vacio. */
function elContratoConElEntorno() {
  // Ninguna `KAMAYUK_*` de la maquina de quien ejecuta puede decidir el resultado: si
  // alguien tuviera exportada la variable que se esta quitando, la pasada no la veria
  // faltar y la comprobacion pasaria por casualidad.
  const limpio = { ...process.env };
  for (const nombre of Object.keys(limpio)) {
    if (nombre.startsWith('KAMAYUK_')) delete limpio[nombre];
  }

  const conTodas = { ...limpio };
  for (const nombre of OBLIGATORIAS) conTodas[nombre] = 'valor-de-relleno';

  for (const nombre of OBLIGATORIAS) {
    const entorno = { ...conTodas };
    delete entorno[nombre];
    const corrida = ejecutar(['config', '--quiet'], entorno);
    anotar(
      corrida.codigo !== 0 && corrida.salida.includes(nombre),
      `sin «${nombre}» el archivo NO resuelve`,
      corrida.codigo === 0
        ? 'resuelve igual, o sea que dejo de ser obligatoria: una clave con `:-` en vez de' +
          ' `:?` deja al proceso conectandose con la cadena vacia'
        : `fallo sin nombrarla: ${corrida.salida.trim().split('\n')[0]}`,
    );
  }

  return conTodas;
}

/** Y con las siete puestas tiene que resolver entero. Es la otra mitad del contrato: si
    alguien anadiera una octava obligatoria sin apuntarla arriba, esto sale rojo. */
function resolver(entorno) {
  const resuelto = ejecutar(['config', '--format', 'json'], entorno);
  if (resuelto.codigo !== 0) {
    console.error('');
    console.error('FALLO: despliegue/compose.yaml no resuelve.');
    console.error('');
    console.error(resuelto.salida.trim());
    process.exit(1);
  }
  anotar(true, `resuelve con esas ${OBLIGATORIAS.length} y ninguna mas`);
  return JSON.parse(resuelto.salida);
}

/** Lo que `config` no puede ver por si solo: que este todo, que no sobre nada, y que el
    grafo de arranque sea el que es. */
function laFormaDelArchivo(config) {
  anotar(config.name === PROYECTO, `el proyecto se llama «${PROYECTO}»`, `se llama «${config.name}»`);

  const declarados = Object.keys(config.services ?? {}).sort();
  const esperados = Object.keys(SERVICIOS).sort();
  for (const nombre of esperados.filter((n) => !declarados.includes(n))) {
    fallos.push(`FALTA el servicio «${nombre}»: el compose declara ${declarados.length} de ${esperados.length}.`);
  }
  for (const nombre of declarados.filter((n) => !esperados.includes(n))) {
    fallos.push(`SOBRA el servicio «${nombre}»: no esta en la lista de este script.`);
  }
  anotar(
    declarados.length === esperados.length && declarados.every((n, i) => n === esperados[i]),
    `declara los ${esperados.length} servicios: ${esperados.join(', ')}`,
  );

  for (const [nombre, esperado] of Object.entries(SERVICIOS)) {
    const servicio = config.services?.[nombre];
    if (!servicio) continue; // ya esta anotado arriba como que falta

    anotar(
      servicio.image === esperado.imagen,
      `«${nombre}» se etiqueta ${esperado.imagen}`,
      `se etiqueta ${servicio.image}`,
    );
    elObjetivoExiste(nombre, servicio, esperado.objetivo);
    lasDependencias(nombre, servicio);
  }

  const red = config.networks?.default;
  anotar(
    red?.name === RED.nombre && red?.external === RED.externa,
    `la red por omision es «${RED.nombre}» y es externa`,
    `es «${red?.name}» con external=${red?.external}`,
  );
}

/** Que el `target` del `build` sea una etapa que EXISTE en su Dockerfile.

    Es la unica afirmacion de este archivo que se cumple en otro, y por eso es la que se
    pudre en silencio: renombrar una etapa no rompe nada hasta que alguien construye, y
    en CI nadie construye desde este compose. */
function elObjetivoExiste(nombre, servicio, objetivo) {
  if (!servicio.build) {
    fallos.push(
      '«' + nombre + '» ya no declara `build`, asi que no construye la imagen de este repositorio.',
    );
    return;
  }
  anotar(
    servicio.build.target === objetivo,
    `«${nombre}» construye el objetivo «${objetivo}»`,
    `construye «${servicio.build.target}»`,
  );

  const dockerfile = resolve(servicio.build.context, servicio.build.dockerfile ?? 'Dockerfile');
  let texto;
  try {
    texto = readFileSync(dockerfile, 'utf8');
  } catch {
    fallos.push(`«${nombre}» apunta a un Dockerfile que no existe: ${dockerfile}`);
    return;
  }
  const etapas = [...texto.matchAll(/^FROM\s+\S+\s+AS\s+(\S+)/gim)].map((c) => c[1]);
  anotar(
    etapas.includes(servicio.build.target),
    `«${servicio.build.target}» es una etapa de ${dockerfile.replace(`${resolve(COMPOSE, '../..')}/`, '')}`,
    `ese archivo solo trae ${etapas.join(', ')}`,
  );
}

/** El grafo de arranque, servicio a servicio y condicion a condicion. */
function lasDependencias(nombre, servicio) {
  const esperadas = DEPENDENCIAS[nombre];
  const declaradas = Object.fromEntries(
    Object.entries(servicio.depends_on ?? {}).map(([quien, como]) => [quien, como.condition]),
  );

  for (const [quien, condicion] of Object.entries(esperadas)) {
    anotar(
      declaradas[quien] === condicion,
      `«${nombre}» espera a «${quien}» con ${condicion}`,
      declaradas[quien] ? `lo espera con ${declaradas[quien]}` : 'no lo espera',
    );
  }
  for (const quien of Object.keys(declaradas).filter((q) => !(q in esperadas))) {
    fallos.push(
      '«' +
        nombre +
        '» declara un `depends_on` de «' +
        quien +
        '» que este script no espera.' +
        (nombre === 'caja-interfaz'
          ? ' Esta interfaz no habla con el backend: sus datos salen de `frontend/src/datos/`,' +
            ' su `nginx.conf` no reenvia y ESLint le prohibe `fetch`. Una dependencia que no' +
            ' existe hace que el compose mienta sobre el grafo, y obliga a `up -d caja-interfaz`' +
            ' a levantar la base, el migrador y la implantacion para dibujar una pantalla que no' +
            ' los usa. El dia que lea algo de verdad, esa linea entra CON su motivo y esta lista' +
            ' cambia en el mismo PR.'
          : ''),
    );
  }
  if (Object.keys(esperadas).length === 0 && Object.keys(declaradas).length === 0) {
    anotar(true, `«${nombre}» no depende de nadie`);
  }
}

// --- lo mecanico -----------------------------------------------------------

function anotar(cierto, afirmacion, comoSalio) {
  if (cierto) {
    console.log(`  OK  ${afirmacion}`);
    return;
  }
  console.log(`  MAL ${afirmacion}`);
  fallos.push(`${afirmacion}${comoSalio ? `, pero ${comoSalio}` : ''}.`);
}

function ejecutar(argumentos, entorno) {
  const todos = [
    ...compose.slice(1),
    '-f',
    COMPOSE,
    // El `.env` de quien ejecuta no puede decidir el resultado: sin esto, una maquina
    // con las claves en `despliegue/.env` mediria otra cosa que la maquina de al lado.
    '--env-file',
    ENV_VACIO,
    ...argumentos,
  ];
  try {
    const salida = execFileSync(compose[0], todos, {
      encoding: 'utf8',
      env: entorno,
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
    return { codigo: 0, salida };
  } catch (fallo) {
    return { codigo: fallo.status ?? -1, salida: `${fallo.stdout ?? ''}${fallo.stderr ?? ''}` };
  }
}

function version(candidato) {
  return execFileSync(candidato[0], [...candidato.slice(1), 'version', '--short'], {
    encoding: 'utf8',
  }).trim();
}

function buscarCompose() {
  const declarado = process.env.KAMAYUK_COMPOSE;
  const candidatos = declarado
    ? [declarado.trim().split(/\s+/)]
    : [
        ['docker', 'compose'],
        ['docker-compose'],
      ];
  for (const candidato of candidatos) {
    try {
      execFileSync(candidato[0], [...candidato.slice(1), 'version'], { stdio: 'ignore' });
      return candidato;
    } catch {
      // el siguiente
    }
  }
  console.error('');
  console.error('FALLO: no hay ningun Docker Compose con el que leer despliegue/compose.yaml.');
  console.error('');
  console.error(`  Se probo: ${candidatos.map((c) => c.join(' ')).join(', ')}`);
  console.error('');
  console.error('  Esto NO se omite. Una comprobacion que se salta a si misma deja el build en');
  console.error('  verde sin haber verificado nada, que es la leccion de `verificarAislamiento`.');
  console.error('');
  console.error('  `docker compose config` NO necesita demonio: resuelve el archivo y lo imprime.');
  console.error('  En una maquina sin Docker basta el binario suelto:');
  console.error('');
  console.error('    curl -fsSL -o /tmp/docker-compose \\');
  console.error('      https://github.com/docker/compose/releases/download/v5.5.1/docker-compose-linux-x86_64');
  console.error('    chmod +x /tmp/docker-compose');
  console.error('    KAMAYUK_COMPOSE=/tmp/docker-compose node despliegue/verificar-el-compose.mjs');
  console.error('');
  process.exit(1);
}
