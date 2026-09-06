/**
 * La cabecera de las tablas de consulta se queda quieta al desplazar.
 *
 *   node verificaciones/pegajosa.mjs
 *
 * Existe porque **ningún emulador de DOM puede decir esto**. `cajas.test.tsx` y
 * `tarifario.test.tsx` afirman que el `<th>` calcula `position: sticky` y `top: 0px`, y hace
 * falta: es lo que corre en cada `yarn verificar`. Pero `position: sticky` no es una propiedad
 * que se cumpla sola — necesita un antepasado que desplace, y lo que hace es cambiar **dónde se
 * pinta** el elemento mientras ese antepasado se mueve. Ni jsdom ni happy-dom hacen disposición,
 * así que allí la declaración puede estar entera y la cabecera irse con la tabla sin que nada lo
 * diga.
 *
 * Y el modo de fallo que esto vigila es justo el que no se ve leyendo: quitarle el contenedor
 * `overflow:auto` a la tabla deja los dos `<th>` con su `position: sticky` intacto y la cabecera
 * desaparece al desplazar la página entera.
 *
 * Lo que comprueba, en las dos pantallas:
 *
 *   1. El contenedor **desplaza de verdad**: su `scrollTop` cambia. Sin esto, «la cabecera no se
 *      movió» sería cierto por no haber movido nada — un `200` que no prueba nada.
 *   2. La cabecera se queda: la `y` del `<th>` es la misma antes y después.
 *   3. Y el cuerpo sí se mueve: la `y` de la primera celda sube tanto como se desplazó. Es la
 *      mitad que separa «pegajosa» de «nada se movió».
 *
 * La ventana va deliberadamente **baja** (420 px): con la ventana alta, las tablas de seis y
 * siete filas caben enteras, el contenedor no tiene nada que desplazar y las tres comprobaciones
 * pasarían sin haber medido nada.
 *
 * Necesita la aplicación servida. `CAJA_BASE` dice dónde (por omisión, el puerto de `yarn dev`).
 */
import { chromium } from "playwright-core";

const BASE = process.env.CAJA_BASE ?? "http://localhost:5181";
/** Cuánto se desplaza. Menos que el alto del cuerpo de la tabla, para que haya sitio. */
const DESPLAZAMIENTO = 60;

const navegador = await chromium.launch();
const contexto = await navegador.newContext({ viewport: { width: 1440, height: 420 } });
const pagina = await contexto.newPage();

const consola = [];
pagina.on("pageerror", (e) => consola.push(String(e)));
pagina.on("requestfailed", (r) => consola.push(`requestfailed: ${r.url()}`));

const fallos = [];

/**
 * Mide una pantalla: la abre por su hash, desplaza su tabla y compara las tres posiciones.
 *
 * @param {string} hash el hash de la pantalla (`#cajas`, `#tarifario`)
 * @param {string} nombre el `data-desplazable` de su contenedor
 */
async function medir(hash, nombre) {
  // Un `about:blank` de por medio: ir de `#cajas` a `#tarifario` con `goto` NO recarga —misma
  // página, otro hash— y el estado de React sobrevive. Es la trampa que #8 midió.
  await pagina.goto("about:blank");
  await pagina.goto(`${BASE}/${hash}`, { waitUntil: "domcontentloaded" });
  await pagina.waitForSelector(`[data-desplazable="${nombre}"] th`);

  const contenedor = pagina.locator(`[data-desplazable="${nombre}"]`);
  const th = contenedor.locator("th").first();
  const td = contenedor.locator("tbody tr").first().locator("td").first();

  const alto = await contenedor.evaluate((e) => [e.scrollHeight, e.clientHeight]);
  if (alto[0] <= alto[1]) {
    fallos.push(
      `${hash}: la tabla cabe entera (scrollHeight ${alto[0]} <= clientHeight ${alto[1]}), ` +
        "así que desplazar no mide nada",
    );
    return;
  }

  const cabeceraAntes = (await th.boundingBox()).y;
  const celdaAntes = (await td.boundingBox()).y;

  await contenedor.evaluate((e, px) => e.scrollBy(0, px), DESPLAZAMIENTO);
  await pagina.waitForTimeout(150);

  const desplazado = await contenedor.evaluate((e) => e.scrollTop);
  if (desplazado === 0) {
    fallos.push(`${hash}: el contenedor no se desplazó (scrollTop 0): no se ha medido nada`);
    return;
  }

  const cabeceraDespues = (await th.boundingBox()).y;
  const celdaDespues = (await td.boundingBox()).y;

  if (Math.abs(cabeceraDespues - cabeceraAntes) > 1) {
    fallos.push(
      `${hash}: la cabecera se fue con la tabla — de y=${cabeceraAntes} a y=${cabeceraDespues} ` +
        `tras desplazar ${desplazado} px`,
    );
  }
  if (celdaAntes - celdaDespues < desplazado - 1) {
    fallos.push(
      `${hash}: el cuerpo no se movió lo que se desplazó — la primera celda subió ` +
        `${celdaAntes - celdaDespues} px de ${desplazado}`,
    );
  }
  console.log(
    `${hash}: desplazado ${desplazado} px · cabecera y=${cabeceraAntes}→${cabeceraDespues} · ` +
      `primera celda y=${celdaAntes}→${celdaDespues}`,
  );
}

await medir("#cajas", "arqueo");
await medir("#tarifario", "tarifario");

await navegador.close();

if (consola.length) {
  console.log("la página se quejó mientras se medía:\n");
  for (const c of consola) console.log("  - " + c);
  process.exit(1);
}

if (!fallos.length) {
  console.log("la cabecera de las dos tablas se queda quieta al desplazar");
  process.exit(0);
}
console.log("la cabecera no se queda:\n");
for (const f of fallos) console.log("  - " + f);
process.exit(1);
