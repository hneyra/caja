/**
 * La paleta de comandos, sólo con el teclado.
 *
 *   node verificaciones/paleta.mjs
 *
 * Existe porque esto ya se rompió una vez. La paleta se abre con Ctrl-K, se
 * teclea para filtrar… y sin flechas ni Intro no hay forma de elegir nada: el
 * atajo lleva a un callejón. Quien navega con teclado —y quien no tiene ratón a
 * mano en una ventanilla— se queda fuera del acceso rápido.
 *
 * Es el arnés que `sgtm/frontend/verificaciones/paleta.mjs` estrenó, adaptado a
 * `caja-web`. Lo que comprueba, en orden:
 *
 *   1. Ctrl-K abre, y hay una lista que un lector de pantalla sabe leer.
 *   2. ↓ y ↑ mueven el foco, y ↑ desde la primera va a la última.
 *   3. Al filtrar, el foco vuelve al primero. **Este caso hay que medirlo con
 *      VARIOS resultados**: con uno solo, acotar el índice al último ya salva
 *      la situación y la comprobación pasaría con la guarda quitada.
 *   4. Intro abre la entrada enfocada —no la primera de la lista anterior— y
 *      cierra la paleta.
 *   5. Ctrl-K otra vez la cierra, y Esc también.
 *
 * POR QUÉ ESTO NO ES UNA PRUEBA DE VITEST
 * `verificaciones/paleta.test.tsx` mide lo mismo sobre un emulador de DOM, y
 * hace falta: es lo que corre en cada `yarn verificar`. Lo que un emulador no
 * puede decir es que un **navegador de verdad** entregue esas teclas al campo
 * enfocado: `fireEvent.keyDown(campo, …)` las entrega por construcción. Aquí
 * las teclas se pulsan sin decir sobre qué, que es lo que hace una persona.
 *
 * Necesita la aplicación servida. `CAJA_BASE` dice dónde (por omisión, el
 * puerto de `yarn dev`).
 */
import { chromium } from "playwright-core";

const BASE = process.env.CAJA_BASE ?? "http://localhost:5181";

const navegador = await chromium.launch();
const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
const pagina = await contexto.newPage();

/** Ni una petición fallida ni un error de consola: aquí no se habla con nadie. */
const consola = [];
pagina.on("pageerror", (e) => consola.push(String(e)));
pagina.on("requestfailed", (r) => consola.push(`requestfailed: ${r.url()}`));

await pagina.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await pagina.waitForSelector("[data-ir]");

const fallos = [];
const filas = () => pagina.locator("[role=option]");
const enfocada = () => pagina.locator("[role=option][aria-selected=true]").first().innerText();
/** El rótulo de una fila, sin su pastilla de tipo ni su nota. */
const rotulo = (t) => t.split("\n").slice(1, -1).join(" ").trim() || t.replace(/\n/g, " ");
const abierta = () => pagina.locator("[data-paleta-dialogo]").count();

// ── 1. Ctrl-K abre, y lo que abre es una lista anunciable ──────────────────
await pagina.keyboard.press("Control+k");
await pagina.waitForTimeout(300);
if (!(await pagina.locator("[role=listbox]").count())) {
  fallos.push("Ctrl-K no abre la paleta");
}
if (!(await pagina.locator("[role=combobox][aria-activedescendant]").count())) {
  fallos.push("el campo no es un combobox que diga qué fila está enfocada");
}
const cuantasAlAbrir = await filas().count();
if (cuantasAlAbrir < 3) {
  fallos.push(`al abrir deberían verse varias entradas, se ven ${cuantasAlAbrir}`);
}

// ── 2. Las flechas mueven, y ↑ desde la primera va a la última ─────────────
const uno = await enfocada().catch(() => "");
await pagina.keyboard.press("ArrowDown");
await pagina.waitForTimeout(120);
const dos = await enfocada();
await pagina.keyboard.press("ArrowDown");
await pagina.waitForTimeout(120);
const tres = await enfocada();
await pagina.keyboard.press("ArrowUp");
await pagina.waitForTimeout(120);
const vuelta = await enfocada();
if (uno === dos || dos === tres) fallos.push("las flechas no mueven el foco");
if (vuelta !== dos) fallos.push("↑ no vuelve a la entrada anterior");

await pagina.keyboard.press("Escape");
await pagina.waitForTimeout(200);
if (await abierta()) fallos.push("Esc no cierra la paleta");

await pagina.keyboard.press("Control+k");
await pagina.waitForTimeout(250);
await pagina.keyboard.press("ArrowUp");
await pagina.waitForTimeout(120);
const ultima = await enfocada();
const laDeAbajo = await filas().last().innerText();
if (ultima !== laDeAbajo) {
  fallos.push(`↑ desde la primera no lleva a la última: llevó a ${rotulo(ultima)}`);
}

// ── 3. Filtrar a VARIOS devuelve el foco al primero ────────────────────────
// Es el único caso que distingue tener la guarda de no tenerla: con un solo
// resultado, acotar el índice al último ya la salva.
await pagina.keyboard.press("ArrowDown");
await pagina.keyboard.press("ArrowDown");
await pagina.waitForTimeout(120);
await pagina.keyboard.type("a");
await pagina.waitForTimeout(400);
const cuantos = await filas().count();
const primera = await filas().first().innerText();
const trasFiltrar = await enfocada();
if (cuantos < 3) {
  fallos.push(`el filtro «a» debería dejar varias entradas, dejó ${cuantos}`);
} else if (trasFiltrar !== primera) {
  fallos.push(`al filtrar, el foco se queda en una fila que nadie eligió: ${rotulo(trasFiltrar)}`);
}

// ── 4. Intro abre la ENFOCADA, con el filtro puesto ────────────────────────
// «caja» deja dos: «Arqueo de mi caja» (nodo 0) y «Cajas cerradas sin arquear»
// (nodo 2). Abrir siempre la primera dejaría el nodo 0, así que el nodo es lo
// que separa una implementación de la otra.
await pagina.keyboard.press("Backspace");
await pagina.waitForTimeout(150);
await pagina.keyboard.type("caja");
await pagina.waitForTimeout(400);
await pagina.keyboard.press("ArrowDown");
await pagina.waitForTimeout(120);
const elegida = rotulo(await enfocada());
await pagina.keyboard.press("Enter");
await pagina.waitForTimeout(500);

const destino = await pagina.evaluate(() => {
  const raiz = document.querySelector("[data-ir]");
  return { ir: raiz.getAttribute("data-ir"), nodo: raiz.getAttribute("data-ir-nodo") };
});
if (destino.ir !== "territorio" || destino.nodo !== "2") {
  fallos.push(
    `Intro no abrió «${elegida}»: fue a ${destino.ir} con nodo ${destino.nodo}` +
      " (se esperaba territorio con nodo 2)",
  );
}
if (new URL(pagina.url()).hash !== "#cajas") {
  fallos.push(`elegir no navegó: el hash quedó en ${new URL(pagina.url()).hash}`);
}
if (await abierta()) fallos.push("la paleta no se cierra al elegir");

// ── 5. Ctrl-K la vuelve a cerrar ───────────────────────────────────────────
await pagina.keyboard.press("Control+k");
await pagina.waitForTimeout(250);
if (!(await abierta())) fallos.push("Ctrl-K no la reabre");
await pagina.keyboard.press("Control+k");
await pagina.waitForTimeout(250);
if (await abierta()) fallos.push("Ctrl-K no la cierra");

await navegador.close();

if (consola.length) {
  console.log("la página se quejó mientras se medía:\n");
  for (const c of consola) console.log("  - " + c);
  process.exit(1);
}

if (!fallos.length) {
  console.log("la paleta se opera sólo con el teclado: abre, mueve, filtra, elige y cierra");
  process.exit(0);
}
console.log("la paleta no se puede operar con el teclado:\n");
for (const f of fallos) console.log("  - " + f);
process.exit(1);
