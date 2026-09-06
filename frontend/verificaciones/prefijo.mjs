/**
 * La interfaz es alcanzable bajo `/caja`: el artefacto y el servidor, no el código.
 *
 *   node verificaciones/prefijo.mjs
 *
 * <h2>Por qué existe, y por qué no es ninguno de los otros cuatro</h2>
 *
 * `rutas-absolutas.test.ts` mira el **código fuente** y `escudo-servido.test.ts` mira el
 * **servidor de desarrollo**. Ninguno de los dos ve lo que este arnés mide, que son las otras dos
 * capas: lo que `vite build` **deja escrito en `dist/`**, y lo que un servidor **contesta** a las
 * URL que el navegador va a pedir. Son distintas de verdad y se midió que lo son: con `base:
 * "/caja/"` declarado y el `src="/escudo-catacaos.png"` de #6 todavía en el JSX, el código
 * compilaba, el `index.html` decía `/caja/escudo-catacaos.png` y **el paquete seguía diciendo
 * `"/escudo-catacaos.png"`** — `grep -c` daba 1 y 0.
 *
 * <h2>Los 200 que mienten, y por eso aquí no se afirma ningún 200 a secas</h2>
 *
 * Éste es el issue donde un `200` engaña dos veces, y las dos están medidas contra el nginx real
 * de `nginx:1.31.4-alpine` (#17):
 *
 *   - servida bajo `/caja` **sin quitar el prefijo**, `…/caja/assets/index-<huella>.js` contesta
 *     `200 text/html` de 1 383 B — el `index.html` por el `try_files`, donde el navegador
 *     esperaba un módulo;
 *   - y con `try_files` **cualquier** ruta inventada contesta `200` con el `index.html`, que es
 *     lo que hace falta para recargar en `/caja/recibos` y a la vez lo que impide leer un `200`
 *     como prueba de que algo existe.
 *
 * De modo que cada petición de aquí afirma **el tipo y el cuerpo**, nunca el código a secas.
 *
 * Necesita la aplicación construida (`dist/`) y servida bajo `/caja`. `CAJA_BASE` dice dónde
 * (por omisión, el puerto de `yarn dev`; en CI, el de `vite preview`).
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = (process.env.CAJA_BASE ?? "http://localhost:5181/caja").replace(/\/+$/, "");
const ORIGEN = new URL(BASE).origin;
const PREFIJO = new URL(BASE).pathname.replace(/\/+$/, "");
const DIST = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");

const fallos = [];
const dicho = [];
const fallar = (t) => fallos.push(t);
const contar = (t) => dicho.push(t);

/** Una petición, con lo que hace falta para no creerse un `200`: el tipo y el cuerpo. */
async function pedir(url) {
  const r = await fetch(url, { redirect: "follow" });
  return {
    estado: r.status,
    tipo: r.headers.get("content-type") ?? "",
    cuerpo: Buffer.from(await r.arrayBuffer()),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. El artefacto: qué quedó escrito en `dist/`
// ═══════════════════════════════════════════════════════════════════════════
const indice = readFileSync(join(DIST, "index.html"), "utf8");
const paquetes = readdirSync(join(DIST, "assets")).filter((n) => n.endsWith(".js"));
if (paquetes.length === 0) fallar("`dist/assets/` no tiene ni un `.js`: no hay artefacto que medir");
const codigo = paquetes.map((n) => readFileSync(join(DIST, "assets", n), "utf8")).join("\n");

/** Las rutas absolutas que el `index.html` pide a su propio servidor. */
const delIndice = [...indice.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map((m) => m[1]);
if (delIndice.length < 3) {
  fallar(`el \`index.html\` solo pide ${delIndice.length} recursos propios: no se ha medido nada`);
}
const indiceFuera = delIndice.filter((r) => !r.startsWith(PREFIJO + "/"));
if (indiceFuera.length) {
  fallar(`el \`index.html\` pide ${indiceFuera.length} recursos fuera de \`${PREFIJO}\`: ${indiceFuera.join(", ")}`);
}
contar(`\`index.html\`: ${delIndice.length} recursos propios, todos bajo \`${PREFIJO}\` — ${delIndice.join(", ")}`);

// Criterio 3, literal: el paquete no contiene ninguna ruta absoluta a la raiz del dominio. Se
// mira la forma exacta que Vite NO reescribe —un literal de cadena— y con la comilla dentro,
// que es lo que distingue `"/escudo-catacaos.png"` de `"/caja/escudo-catacaos.png"`.
const EXTENSIONES = "png|jpe?g|gif|svg|webp|avif|ico|woff2?|css|js|mjs|json";
const enElPaquete = [
  ...new Set(
    [...codigo.matchAll(new RegExp(`(["'\`])(/[A-Za-z0-9._~/-]+\\.(?:${EXTENSIONES}))\\1`, "g"))].map(
      (m) => m[2],
    ),
  ),
].filter((r) => !r.startsWith(PREFIJO + "/"));
if (enElPaquete.length) {
  fallar(
    `el paquete pide ${enElPaquete.length} recursos a la RAIZ del dominio: ${enElPaquete.join(", ")}.\n` +
      "      Vite no reescribe el `base` dentro de un literal de JavaScript; se cuelga de " +
      "`import.meta.env.BASE_URL`.",
  );
}
contar(`paquete (${paquetes.join(", ")}): 0 rutas absolutas fuera de \`${PREFIJO}\``);

// ═══════════════════════════════════════════════════════════════════════════
// 2. El servidor: lo que contesta a lo que el navegador va a pedir
// ═══════════════════════════════════════════════════════════════════════════
// Antes de nada, contra QUE se está midiendo. Este arnés compara el `dist/` del disco con lo que
// el servidor entrega, así que apuntarlo a `yarn dev` no mide nada: el servidor de desarrollo no
// conoce esos nombres con huella y contesta su `index.html` a todos ellos. Medido — daba dos
// rojos, «200 pero `text/html` en vez de `javascript`», acusando al servidor de un defecto que no
// tiene. Un rojo que miente sobre el instrumento es peor que no tenerlo (#35).
{
  const r = await pedir(`${ORIGEN}${PREFIJO}/`).catch(() => null);
  if (r === null) {
    fallar(`nadie contesta en ${ORIGEN}${PREFIJO}/: levanta \`yarn build && yarn preview\` primero`);
  } else if (r.cuerpo.includes("@vite/client")) {
    fallar(
      `${ORIGEN}${PREFIJO}/ es el servidor de DESARROLLO (su \`index.html\` carga ` +
        "`@vite/client`), y este arnés mide el artefacto construido. Sírvelo con " +
        "`yarn build && yarn preview` y apunta `CAJA_BASE` a ese puerto con su prefijo.",
    );
  }
}
if (fallos.length) {
  console.log(`${fallos.length} problemas:\n`);
  for (const f of fallos) console.log("  - " + f);
  process.exit(1);
}

/** El `index.html` servido, contra el que se comparan las recargas. */
let servido = null;

for (const [que, ruta, esperado] of [
  ["la raíz de la aplicación", `${PREFIJO}/`, "text/html"],
  ["una recarga en una ruta profunda", `${PREFIJO}/recibos`, "text/html"],
  ...delIndice
    .filter((r) => r.endsWith(".js"))
    .map((r) => ["el paquete", r, "javascript"]),
  ...delIndice.filter((r) => r.endsWith(".css")).map((r) => ["la hoja", r, "text/css"]),
  ...delIndice.filter((r) => r.endsWith(".png")).map((r) => ["el escudo", r, "image/png"]),
]) {
  let r;
  try {
    r = await pedir(ORIGEN + ruta);
  } catch (e) {
    fallar(`${que} (${ruta}): la petición ni salió — ${String(e).split("\n")[0]}`);
    continue;
  }
  if (r.estado !== 200) {
    fallar(`${que} (${ruta}): ${r.estado}, y debería ser 200`);
    continue;
  }
  // El 200 no vale por sí solo, y aquí menos que en ningún sitio: con `try_files`, pedir un
  // módulo que no está devuelve 200 con el `index.html` dentro. Lo que separa los dos casos es
  // el tipo.
  if (!r.tipo.includes(esperado)) {
    fallar(
      `${que} (${ruta}): 200 pero \`${r.tipo}\` en vez de \`${esperado}\` — ${r.cuerpo.length} B.\n` +
        (r.tipo.includes("text/html")
          ? "      Es el `index.html` colándose por el `try_files`: el 200 miente."
          : ""),
    );
    continue;
  }
  if (ruta === `${PREFIJO}/`) servido = r.cuerpo;
  if (ruta === `${PREFIJO}/recibos`) {
    // Recargar en una ruta profunda tiene que entregar la MISMA aplicación, no una página
    // cualquiera que también sea HTML.
    if (servido === null || !servido.equals(r.cuerpo)) {
      fallar(
        `${que} (${ruta}): devuelve HTML, pero no el mismo cuerpo que \`${PREFIJO}/\` ` +
          `(${r.cuerpo.length} B contra ${servido?.length ?? 0}): recargar ahí no abre la aplicación`,
      );
      continue;
    }
  }
  contar(`${ruta} → ${r.estado} ${r.tipo.split(";")[0]} ${r.cuerpo.length} B (${que})`);
}

// Y la mitad que hace falta al lado: en la RAIZ del dominio el escudo NO está. Sin ella, un
// servidor que sirviera lo mismo en los dos sitios pasaría todo lo de arriba y el despliegue
// detrás de Traefik seguiría roto, porque allí `/escudo-catacaos.png` ni siquiera llega aquí.
{
  const r = await pedir(`${ORIGEN}/escudo-catacaos.png`).catch(() => null);
  if (r !== null && r.tipo.includes("image/png")) {
    fallar(
      `\`/escudo-catacaos.png\` en la raíz del dominio contesta ${r.estado} image/png: la ` +
        "aplicación se está sirviendo también fuera de su prefijo, así que nada de lo de arriba " +
        "demuestra que sea alcanzable bajo él",
    );
  } else {
    contar(`/escudo-catacaos.png (raíz del dominio) → ${r === null ? "sin respuesta" : `${r.estado} ${r.tipo || "sin tipo"}`}`);
  }
}

console.log(`la interfaz bajo \`${PREFIJO}\`, medida en el artefacto y en el servidor\n`);
for (const d of dicho) console.log("  · " + d);

if (!fallos.length) {
  console.log("\nel `dist/` no pide nada a la raíz del dominio, y `/caja/` sirve la aplicación con su tipo");
  process.exit(0);
}
console.log(`\n${fallos.length} problemas:\n`);
for (const f of fallos) console.log("  - " + f);
process.exit(1);
