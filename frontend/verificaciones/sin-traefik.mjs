/**
 * Las DOS entradas del nginx de la interfaz, medidas contra nginx de verdad.
 *
 *   yarn sin-traefik
 *
 * <h2>Que mide, y por que hacen falta las dos</h2>
 *
 * El `index.html` que `vite build` emite pide sus recursos con el prefijo dentro
 * (`/caja/assets/index-<huella>.js`), porque `vite.config.ts` declara `base: "/caja/"` desde #37.
 * Lo que le llega a este nginx depende de quien haya delante:
 *
 *   - **con ingreso delante** —el `stripPrefix` del `IngressRoute` en el cluster (#17)— llega
 *     `/assets/index-<huella>.js`, sin prefijo;
 *   - **sin nadie delante** —el puerto que publica `despliegue/compose.yaml`— llega
 *     `/caja/assets/index-<huella>.js`, tal cual.
 *
 * Hasta #42 solo se servia la primera, y la segunda **no daba un error**: caia en el `try_files`
 * y contestaba 200 con el `index.html`. Medido contra este mismo nginx con el `nginx.conf` de
 * `origin/main`: `/caja/assets/index-<huella>.js` → **200 `text/html` de 1 383 B**, y
 * `curl -sf http://…/` en verde. Un 200 que miente, y la pantalla en blanco.
 *
 * De modo que aqui se piden **las dos** URL y se comparan entre si. Un arnes que midiera solo la
 * limpia dejaria pasar el defecto entero, y uno que midiera solo la prefijada no veria una
 * regresion del cluster.
 *
 * <h2>Por que nada se afirma con un `200`</h2>
 *
 * Con `try_files`, **cualquier** ruta contesta 200 con el `index.html` dentro — es lo que hace
 * falta para recargar en `/caja/recibos` y a la vez lo que impide leer un 200 como prueba de que
 * algo existe. Cada peticion afirma **el tipo y el cuerpo**. Es la leccion de #16 y de #37, y es
 * el criterio 2 de #42 con esas palabras.
 *
 * <h2>Que NO es, y por que no es `prefijo.mjs`</h2>
 *
 * `prefijo.mjs` mide `vite preview` —el `dist/` y el servidor de Vite— y exige ademas que la
 * aplicacion **no** aparezca en la raiz del dominio. Este mide el nginx que se despliega, donde
 * servir en la raiz es justo lo que el cluster necesita. Son dos sujetos distintos y ninguno
 * sustituye al otro; apuntar uno al servidor del otro daria rojos que mienten sobre el
 * instrumento (#35).
 *
 * <h2>Como se levanta, y por que no se omite</h2>
 *
 * Por omision arranca `nginx:<version>` —la etiqueta se LEE de `frontend/Dockerfile`, no se
 * escribe aqui— con el `dist/` y el `nginx.conf` de este arbol montados, y lo para al terminar.
 * Sin un Docker que conteste **no se salta: falla**, con la doctrina de `verificarAislamiento`
 * escrita en el mensaje. La salida documentada es apuntarlo a un nginx que ya exista:
 *
 *   CAJA_NGINX=http://127.0.0.1:8092 yarn sin-traefik
 *
 * Y falla con codigo **2** cuando no ha podido medir —sin `dist/`, sin recursos que pedir, sin
 * Docker, o con un `base` que dejaria las dos entradas siendo la misma URL—, que es distinto de
 * fallar porque algo este mal.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(RAIZ, "dist");

const fallos = [];
const dicho = [];
let sondas = 0;

/** No se pudo medir. No es «esta bien»: es que la comprobacion no llego a hacerse. */
function noSeMidio(porque, remedio) {
  console.log(`NO SE MIDIO: ${porque}`);
  if (remedio) console.log(`\n  ${remedio}`);
  console.log(
    "\nUna comprobacion que se salta a si misma deja el flujo en verde sin haber verificado nada.",
  );
  process.exit(2);
}

// ═══════════════════════════════════════════════════════════════════════════
// El sujeto: el prefijo, y los recursos que el `index.html` pide
// ═══════════════════════════════════════════════════════════════════════════
if (!existsSync(join(DIST, "index.html"))) {
  noSeMidio("no hay `dist/`: este arnes mide el artefacto servido", "yarn build");
}

// El prefijo sale de `vite.config.ts`, que es de donde sale el del `index.html`. Escrito aqui a
// mano seria un segundo sitio con la misma verdad, y el que envejece sin ponerse rojo.
const BASE = /^\s*base:\s*"([^"]*)"/m.exec(readFileSync(join(RAIZ, "vite.config.ts"), "utf8"))?.[1];
const PREFIJO = (BASE ?? "/").replace(/\/+$/, "");
if (PREFIJO === "") {
  noSeMidio(
    "`vite.config.ts` no da ningun prefijo, asi que las dos entradas serian la MISMA URL y esto " +
      "mediria dos veces lo mismo, en verde",
    "El prefijo lo decide `base` (#37).",
  );
}

const indice = readFileSync(join(DIST, "index.html"), "utf8");
/** Lo que el navegador va a pedir, tal como el `index.html` lo escribe. */
const recursos = [...indice.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map((m) => m[1]);
const conPrefijo = recursos.filter((r) => r.startsWith(PREFIJO + "/"));
if (conPrefijo.length < 3) {
  noSeMidio(
    `el \`index.html\` solo pide ${conPrefijo.length} recursos bajo \`${PREFIJO}\`: sin ellos no ` +
      "hay ninguna URL con prefijo que pedir",
    "Lo comprueba `yarn prefijo`, que mira el artefacto.",
  );
}

/** El tipo que cada extension tiene que traer. Un 200 con otro tipo es el defecto de #42. */
const TIPOS = { ".js": "javascript", ".css": "text/css", ".png": "image/png" };
const tipoDe = (ruta) => TIPOS[ruta.slice(ruta.lastIndexOf("."))];

// ═══════════════════════════════════════════════════════════════════════════
// El servidor: el de fuera, o uno que se levanta aqui
// ═══════════════════════════════════════════════════════════════════════════
/** La etiqueta de la imagen base, LEIDA del `Dockerfile` que la usa. */
function etiquetaDeNginx() {
  const df = readFileSync(join(RAIZ, "Dockerfile"), "utf8");
  const t = /^FROM\s+(nginx:\S+)\s+AS\s+interfaz\s*$/m.exec(df)?.[1];
  if (!t) noSeMidio("`frontend/Dockerfile` no declara una etapa `interfaz` sobre una imagen nginx");
  return t;
}

const docker = (args, opciones = {}) =>
  spawnSync("docker", args, { encoding: "utf8", ...opciones });

let origen = process.env.CAJA_NGINX?.replace(/\/+$/, "");
let contenedor = null;
if (!origen) {
  if (docker(["version", "--format", "{{.Server.Version}}"]).status !== 0) {
    noSeMidio(
      "no hay un Docker que responda, y este arnes mide el nginx que se despliega",
      "CAJA_NGINX=http://127.0.0.1:8092 yarn sin-traefik   (apuntandolo a un nginx que ya exista)",
    );
  }
  const puerto = 8100 + (process.pid % 500);
  const r = docker([
    "run", "-d", "--rm", "-p", `127.0.0.1:${puerto}:8080`,
    "-v", `${DIST}:/usr/share/nginx/html:ro`,
    "-v", `${join(RAIZ, "nginx.conf")}:/etc/nginx/conf.d/default.conf:ro`,
    etiquetaDeNginx(),
  ]);
  if (r.status !== 0) noSeMidio(`Docker no pudo levantar el nginx: ${r.stderr.trim()}`);
  contenedor = r.stdout.trim();
  origen = `http://127.0.0.1:${puerto}`;
  let vivo = false;
  for (let i = 0; i < 60 && !vivo; i++) {
    vivo = await fetch(origen + "/").then(() => true).catch(() => new Promise((s) => setTimeout(() => s(false), 500)));
  }
  if (!vivo) {
    const log = docker(["logs", contenedor]).stderr ?? "";
    docker(["stop", contenedor]);
    noSeMidio(`el nginx levantado no contesta en ${origen}, asi que NO SE MIDIO NI UNA RUTA:\n${log}`);
  }
}
const parar = () => contenedor && docker(["stop", contenedor], { stdio: "ignore" });

async function pedir(ruta) {
  sondas++;
  const r = await fetch(origen + ruta, { redirect: "follow" });
  return {
    estado: r.status,
    tipo: r.headers.get("content-type") ?? "",
    cache: r.headers.get("cache-control") ?? "",
    cuerpo: Buffer.from(await r.arrayBuffer()),
  };
}

try {
  // ═════════════════════════════════════════════════════════════════════════
  // Las dos entradas, recurso a recurso
  // ═════════════════════════════════════════════════════════════════════════
  for (const conElPrefijo of conPrefijo) {
    const sinElPrefijo = conElPrefijo.slice(PREFIJO.length);
    const esperado = tipoDe(conElPrefijo);
    if (!esperado) continue;
    const [prefijada, limpia] = [await pedir(conElPrefijo), await pedir(sinElPrefijo)];

    // (1) CON ingreso delante. Es lo que hace el cluster, y lo que no se puede regresionar.
    if (limpia.estado !== 200 || !limpia.tipo.includes(esperado)) {
      fallos.push(
        `con el ingreso delante (${sinElPrefijo}): ${limpia.estado} \`${limpia.tipo}\` en vez de ` +
          `\`${esperado}\` — ${limpia.cuerpo.length} B. Esto es lo que sirve el CLUSTER.`,
      );
      continue;
    }
    // (2) SIN nadie delante. Es lo que hace `despliegue/compose.yaml`, y es #42.
    if (prefijada.estado !== 200 || !prefijada.tipo.includes(esperado)) {
      fallos.push(
        `sin nadie que quite el prefijo (${conElPrefijo}): ${prefijada.estado} ` +
          `\`${prefijada.tipo}\` en vez de \`${esperado}\` — ${prefijada.cuerpo.length} B.` +
          // El diagnostico solo cuando el estado es el que enganaba. Un 404 aqui tambien deja
          // la pantalla en blanco, pero por otra causa y con otro remedio: llamarlo «200 que
          // miente» mandaria a mirar al sitio equivocado, que es peor que no decir nada (#35).
          (prefijada.estado === 200 && prefijada.tipo.includes("text/html")
            ? "\n      Es el `index.html` colandose por el `try_files`: el 200 miente y el " +
              "navegador rechaza el recurso por su tipo. La pantalla sale en blanco (#42)."
            : ""),
      );
      continue;
    }
    // (3) Y lo que ata las dos a un solo camino de servicio: el MISMO cuerpo y la MISMA cabecera
    // de cache. Sin esto, dos bloques `location` copiados pasarian lo de arriba y se separarian
    // el dia que alguien tocara uno solo.
    if (!prefijada.cuerpo.equals(limpia.cuerpo)) {
      fallos.push(
        `las dos entradas de ${sinElPrefijo} entregan cuerpos distintos ` +
          `(${prefijada.cuerpo.length} B con prefijo, ${limpia.cuerpo.length} B sin el): ` +
          "no hay un solo camino de servicio, hay dos, y dos caminos se separan",
      );
      continue;
    }
    if (prefijada.cache !== limpia.cache) {
      fallos.push(
        `las dos entradas de ${sinElPrefijo} traen distinto \`Cache-Control\`: ` +
          `«${prefijada.cache}» con prefijo y «${limpia.cache}» sin el`,
      );
      continue;
    }
    dicho.push(
      `${conElPrefijo} y ${sinElPrefijo} → 200 ${prefijada.tipo.split(";")[0]} ` +
        `${prefijada.cuerpo.length} B, mismo cuerpo` +
        (prefijada.cache ? ` y mismo \`Cache-Control\`` : ""),
    );
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Y la pantalla: la raiz de la aplicacion por las dos entradas, y una recarga profunda
  // ═════════════════════════════════════════════════════════════════════════
  const raizPrefijada = await pedir(`${PREFIJO}/`);
  const raizLimpia = await pedir("/");
  for (const [que, r] of [
    ["sin nadie que quite el prefijo", raizPrefijada],
    ["con el ingreso delante", raizLimpia],
  ]) {
    if (r.estado !== 200 || !r.tipo.includes("text/html")) {
      fallos.push(`la pantalla ${que}: ${r.estado} \`${r.tipo}\`, y deberia ser 200 text/html`);
    }
  }
  if (raizPrefijada.cuerpo.length && !raizPrefijada.cuerpo.equals(raizLimpia.cuerpo)) {
    fallos.push("las dos entradas entregan `index.html` distintos");
  }
  const recarga = await pedir(`${PREFIJO}/recibos`);
  if (!recarga.cuerpo.equals(raizPrefijada.cuerpo)) {
    fallos.push(
      `recargar en \`${PREFIJO}/recibos\` no devuelve la aplicacion sino ${recarga.estado} ` +
        `\`${recarga.tipo}\` de ${recarga.cuerpo.length} B`,
    );
  } else {
    dicho.push(`${PREFIJO}/ , / y ${PREFIJO}/recibos → 200 text/html, el mismo cuerpo`);
  }
} finally {
  parar();
}

// El contraste que impide informar en verde sobre el conjunto vacio: si nada se pidio, nada de lo
// de arriba significa algo. Es la leccion de `mirar.mjs` y de `cero-red.mjs`.
if (sondas === 0) {
  noSeMidio("no se pidio NI UNA ruta: un recorrido vacio no es un recorrido en el que todo fuera bien");
}

console.log(
  `las dos entradas del nginx de la interfaz, sobre ${origen}\n` +
    `  prefijo \`${PREFIJO}\` (de \`vite.config.ts\`) · ${sondas} peticiones\n`,
);
for (const d of dicho) console.log("  · " + d);
if (!fallos.length) {
  console.log(
    "\ncon ingreso delante y sin el, las dos entradas sirven lo mismo: la del cluster y la del compose",
  );
  process.exit(0);
}
console.log(`\n${fallos.length} problemas:\n`);
for (const f of fallos) console.log("  - " + f);
process.exit(1);
