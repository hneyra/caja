/**
 * `caja-web` no habla con nadie: cero peticiones fuera de sus propios recursos.
 *
 *   node verificaciones/cero-red.mjs
 *
 * <h2>Por qué existe, y por qué es la INVERSA del arnés de `sgtm`</h2>
 *
 * `sgtm/frontend/verificaciones/sin-red.mjs` corta la red y comprueba que ninguna pantalla se
 * atreva a enseñar una cifra: allí la regla es «sin backend, `—` y el motivo, nunca la cifra de
 * la maqueta». **Aquí la cifra de la maqueta es el encargo** —los datos salen de `src/datos/`,
 * copiados del artboard—, así que copiar aquel arnés mediría exactamente lo contrario de lo que
 * hay que garantizar: pondría rojo cada `S/ 2,511.94` que esta interfaz está obligada a dibujar.
 *
 * Lo que se garantiza aquí es lo otro: que **no hay conexión**. Ni `fetch`, ni `XMLHttpRequest`,
 * ni WebSocket, ni un `sendBeacon` de telemetría, ni una imagen colgada de un tercero. Es lo que
 * hace cierto que la ventanilla dibuje su pantalla en un municipio sin salida a internet, y es
 * lo que `eslint.config.mjs` ya prohíbe **en el código**: esto lo comprueba en el navegador, que
 * es donde una petición aparece de verdad — una dependencia que llame a su propio servidor de
 * telemetría no escribe ningún `fetch` en `src/`.
 *
 * <h2>La tipografía: permitida, y nombrada</h2>
 *
 * `index.html` carga **Source Sans 3 desde Google Fonts**, con las mismas tres etiquetas y la
 * misma URL que el artboard (líneas 12-14). Es una petición a un tercero y aquí se declara como
 * tal, no se deja pasar por descuido: los únicos anfitriones ajenos admitidos son
 * `fonts.googleapis.com` (la hoja) y `fonts.gstatic.com` (los ficheros de la fuente). Cualquier
 * otro pone esto en rojo. Se acepta porque la pila de respaldo de `--familia` termina en
 * `system-ui, sans-serif`: sin red, la pantalla sale con la fuente del sistema en vez de quedarse
 * en blanco — y por eso una petición fallida a esos dos anfitriones se informa pero **no** falla.
 * Autohospedarla es otra decisión y otro issue.
 *
 * <h2>Qué lo dejaría inútil, y la sonda que lo impide</h2>
 *
 * «Cero peticiones» es la afirmación más fácil de conseguir sin haber medido nada: basta con que
 * el recorrido no toque la aplicación, con que el interceptor esté mal enganchado, o con que la
 * página ni siquiera haya cargado. Un `200` no prueba nada por sí solo, y un cero tampoco.
 * Contra eso hay tres guardas, y las tres tienen que pasar:
 *
 *   1. **La página cargó**: se exige haber visto el documento, el JS, el CSS y el escudo.
 *   2. **La aplicación se usó**: el recorrido abre las cuatro secciones y además la paleta, el
 *      lanzador, el menú de sesión, una ficha de recibo y un cobro nuevo — que son los caminos
 *      por los que una petición aparecería.
 *   3. **La sonda.** Al final, la propia página lanza un `fetch('/caja/api/v1/__sonda…')` y este
 *      arnés exige verlo **y clasificarlo como petición de conexión**. Verlo a secas no basta, y
 *      eso se midió: quitándole la regla que reconoce un `fetch`, la sonda seguía apareciendo
 *      —como recurso propio, que es lo que es por su origen— y el arnés daba verde con un
 *      `fetch` vivo dentro de una pantalla. Lo que hay que afirmar es que la regla que decide
 *      funciona. Es la única forma de que un cero signifique algo.
 *
 * Necesita la aplicación servida. `CAJA_BASE` dice dónde (por omisión, el puerto de `yarn dev`).
 */
import { chromium } from "playwright-core";

const BASE = process.env.CAJA_BASE ?? "http://localhost:5181";
const ORIGEN = new URL(BASE).origin;

/** Los dos únicos anfitriones ajenos admitidos, y por qué. Ver la nota de la cabecera. */
const TIPOGRAFIA = {
  "fonts.googleapis.com": "la hoja de estilos de Source Sans 3 (index.html, del artboard)",
  "fonts.gstatic.com": "los ficheros de la tipografía que esa hoja pide",
};

/** Lo que una aplicación sin backend jamás emite, venga a donde venga. */
const HABLAR = ["fetch", "xhr", "eventsource", "websocket"];

/** La URL de la sonda. No existe en ninguna parte: lo que importa es que se VEA salir. */
const SONDA = "/caja/api/v1/__sonda-del-arnes";

const navegador = await chromium.launch();
const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
const pagina = await contexto.newPage();

/** Los cuatro cajones. `sondando` desvia los de la fase de sonda a un juego aparte. */
let sondando = false;
const cajones = {
  propias: [],
  tipografia: [],
  /** Lo que esta interfaz no debe hacer nunca: hablar. */
  conectadas: [],
  /** Un tercero que nadie declaro. */
  ajenas: [],
};
const deLaSonda = { propias: [], tipografia: [], conectadas: [], ajenas: [] };
const fallidas = [];
/** Si estamos sobre `yarn dev`: lo dice el cliente de HMR, que `vite preview` no sirve. */
let esDesarrollo = false;

/** En que cajon cae una peticion. Es la unica regla, y esta escrita una sola vez. */
function clasificar(url, tipo) {
  // Hablar es hablar aunque sea con el propio servidor: una peticion `fetch` al origen es
  // exactamente el backend que esta interfaz no tiene.
  if (HABLAR.includes(tipo)) return "conectadas";
  if (new URL(url).origin === ORIGEN) return "propias";
  if (Object.hasOwn(TIPOGRAFIA, new URL(url).host)) return "tipografia";
  return "ajenas";
}

const apuntar = (url, tipo) => {
  if (url.startsWith("data:") || url.startsWith("blob:")) return;
  if (url.includes("/@vite/client")) esDesarrollo = true;
  (sondando ? deLaSonda : cajones)[clasificar(url, tipo)].push(`${tipo.padEnd(10)} ${url}`);
};

pagina.on("request", (p) => apuntar(p.url(), p.resourceType()));
pagina.on("websocket", (ws) => apuntar(ws.url(), "websocket"));
pagina.on("requestfailed", (r) => fallidas.push(`${r.resourceType().padEnd(10)} ${r.url()}`));

const propias = cajones.propias;
const deTipografia = cajones.tipografia;
const conectadas = cajones.conectadas;
const ajenas = cajones.ajenas;

// ── El recorrido: las cuatro secciones y todo lo que se abre encima ────────
// Cada paso se apunta, y un paso que no encuentra su elemento **falla**: el recorrido es la
// segunda guarda de este arnes, y un `if (existe) …` que se salta en silencio la anula — el cero
// saldria igual de limpio sin haber tocado la aplicacion.
const hecho = [];
const noHecho = [];
async function paso(que, hazlo) {
  try {
    await hazlo();
    hecho.push(que);
  } catch (e) {
    noHecho.push(`${que}: ${String(e).split("\n")[0]}`);
  }
}

async function abrir(seccion) {
  await pagina.goto("about:blank");
  await pagina.goto(`${BASE}/#${seccion}`, { waitUntil: "domcontentloaded" });
  await pagina.waitForSelector("[data-seccion]");
  await pagina.waitForTimeout(400);
}

for (const seccion of ["panel", "recibos", "cajas", "tarifario"]) {
  await paso(`#${seccion}`, () => abrir(seccion));
}

// La paleta, el lanzador y el menu de sesion: las tres capas flotantes.
await paso("la paleta con una consulta", async () => {
  await pagina.keyboard.press("Control+k");
  await pagina.waitForSelector("[data-paleta-dialogo]");
  await pagina.keyboard.type("recibo");
  await pagina.waitForTimeout(300);
  await pagina.keyboard.press("Escape");
});
await paso("el lanzador de modulos", async () => {
  await pagina.getByRole("button", { name: "Ver todos los módulos" }).click();
  await pagina.waitForSelector("[data-lanzador]");
  await pagina.keyboard.press("Escape");
});
await paso("el menu de sesion", async () => {
  await pagina.getByRole("button", { name: /^Sesión de/ }).click();
  await pagina.waitForSelector("[role=menu]");
  await pagina.keyboard.press("Escape");
});

// Una ficha de recibo, sus cinco secciones y un campo escrito.
await paso("una ficha de recibo con sus cinco secciones", async () => {
  await abrir("recibos");
  await pagina.locator("[data-lista] button[aria-current]").first().click();
  await pagina.waitForSelector("[data-paso]");
  const pestanas = await pagina.locator("[data-paso]").all();
  if (pestanas.length < 5) throw new Error(`solo ${pestanas.length} secciones en la ficha`);
  for (const pestana of pestanas) {
    await pestana.click();
    await pagina.waitForTimeout(120);
  }
});
await paso("escribir en un campo", async () => {
  await pagina.locator("[data-seccion] textarea").first().fill("una observacion del arnes");
  await pagina.waitForTimeout(150);
});

// Y un cobro nuevo, que es el camino que de verdad emitiria algo contra un backend.
await paso("un cobro nuevo con su documento", async () => {
  await pagina.getByRole("button", { name: "Cobrar" }).first().click();
  await pagina.waitForSelector("[data-barra-de-caja]");
  await pagina.getByRole("textbox", { name: "Documento del contribuyente" }).fill("12345678");
  await pagina.waitForTimeout(300);
});

const recorrido = { propias: propias.length, tipografia: deTipografia.length };

// ── La sonda: este arnes tiene que poder VER una peticion ──────────────────
sondando = true;
await pagina.evaluate(
  (u) => fetch(u).catch(() => {}),
  SONDA,
);
await pagina.waitForTimeout(600);
sondando = false;

await navegador.close();

// ── El veredicto ──────────────────────────────────────────────────────────
const fallos = [];

// La sonda no basta con verla: hay que verla **clasificada como lo que es**. La primera version
// solo comprobaba que apareciera en algun cajon, y con eso un arnes al que se le quita la regla
// de `HABLAR` seguia en verde —medido: la sonda caia en `propias` por ser del mismo origen y el
// cero salia limpio con un `fetch` vivo dentro de una pantalla—. Lo que hay que afirmar es que
// la regla que decide funciona, y eso es esto.
const todasLasDeLaSonda = Object.values(deLaSonda).flat();
if (!deLaSonda.conectadas.some((l) => l.includes(SONDA))) {
  const donde = Object.entries(deLaSonda)
    .filter(([, xs]) => xs.some((l) => l.includes(SONDA)))
    .map(([k]) => k);
  fallos.push(
    `la sonda no se conto como peticion de conexion: este arnes esta CIEGO y su cero no ` +
      `significa nada.\n      Se esperaba ${SONDA} en el cajon «conectadas»; ` +
      (donde.length ? `aparecio en «${donde.join(", ")}».` : "no aparecio en ninguno."),
  );
}
if (todasLasDeLaSonda.length > 1) {
  fallos.push(
    `la fase de sonda registro ${todasLasDeLaSonda.length} peticiones y deberia registrar 1:\n      ` +
      todasLasDeLaSonda.join("\n      "),
  );
}

// La pagina cargo de verdad: sin esto, «cero peticiones» lo cumple un servidor apagado.
// `stylesheet` solo se exige sobre un artefacto construido: el servidor de desarrollo sirve el
// CSS **como modulo de JavaScript** y por el origen propio no llega ni una hoja —medido: sobre
// `yarn dev` los tipos propios son `document, image, script` y sobre `vite preview` son esos tres
// mas `stylesheet`—. Exigirla en los dos sitios pondria rojo el modo desarrollo por como sirve
// Vite, que no es lo que este arnes mide.
const tipos = new Set(propias.map((l) => l.split(/\s+/)[0]));
const imprescindibles = esDesarrollo
  ? ["document", "script", "image"]
  : ["document", "script", "stylesheet", "image"];
for (const imprescindible of imprescindibles) {
  if (!tipos.has(imprescindible)) {
    fallos.push(`no se vio ni una peticion de tipo \`${imprescindible}\`: la pagina no cargo entera`);
  }
}
if (recorrido.propias < 4) {
  fallos.push(`solo ${recorrido.propias} peticiones propias en todo el recorrido: no se ha medido nada`);
}
if (noHecho.length) {
  fallos.push(
    `${noHecho.length} pasos del recorrido no se pudieron hacer, asi que ese camino no se midio:\n      ` +
      noHecho.join("\n      "),
  );
}

if (conectadas.length) {
  // El HMR de Vite es del servidor de desarrollo, no de la aplicacion: sobre el `dist/` servido
  // no existe. Se nombra y se deja pasar SOLO si estamos en `yarn dev`, y se dice.
  const delHmr = conectadas.filter((l) => l.startsWith("websocket") && l.includes(ORIGEN.replace(/^https?:\/\//, "")));
  const resto = conectadas.filter((l) => !delHmr.includes(l));
  if (resto.length || !esDesarrollo) {
    fallos.push(
      `${conectadas.length} peticiones de conexion (fetch / XHR / EventSource / WebSocket):\n      ` +
        conectadas.join("\n      "),
    );
  }
}
if (ajenas.length) {
  fallos.push(
    `${ajenas.length} peticiones a terceros que nadie declaro:\n      ` + ajenas.join("\n      "),
  );
}

console.log(
  `${propias.length} peticiones propias · ${deTipografia.length} a la tipografia declarada · ` +
    `${conectadas.length} de conexion · ${ajenas.length} a terceros sin declarar`,
);
console.log(`  recursos propios: ${[...tipos].sort().join(", ")}`);
console.log(`  recorrido (${hecho.length} pasos): ${hecho.join(" · ")}`);
for (const [anfitrion, porque] of Object.entries(TIPOGRAFIA)) {
  const cuantas = deTipografia.filter((l) => l.includes(anfitrion)).length;
  console.log(`  tercero declarado: ${anfitrion} — ${cuantas} peticiones · ${porque}`);
}
if (esDesarrollo) console.log("  (sobre `yarn dev`: el WebSocket del HMR es del servidor, no de la aplicacion)");
if (fallidas.length) {
  console.log(`  ${fallidas.length} peticiones fallidas (sin salida a internet la tipografia falla y la pantalla sigue):`);
  for (const f of fallidas) console.log("    · " + f);
}
console.log(`  la sonda se conto como conexion: ${deLaSonda.conectadas.length ? "si — " + deLaSonda.conectadas[0] : "NO"}`);

if (!fallos.length) {
  console.log("\nla aplicacion no habla con nadie: ni fetch, ni XHR, ni WebSocket, ni un tercero sin declarar");
  process.exit(0);
}
console.log(`\n${fallos.length} problemas:\n`);
for (const f of fallos) console.log("  - " + f);
process.exit(1);
