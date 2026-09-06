/**
 * Mirar la envoltura: las cuatro secciones en un navegador de verdad, en los anchos del diseño,
 * con el teclado y en papel.
 *
 *   node verificaciones/mirar.mjs
 *
 * <h2>Por qué existe</h2>
 *
 * Es el arnés que `sgtm/frontend/verificaciones/mirar.mjs` estrenó —recorrer, capturar, y no
 * dejar pasar un error de consola ni una pantalla en blanco— y hace además lo que **ningún
 * emulador de DOM puede afirmar**, que es lo que este issue añade: *disposición*. jsdom y
 * happy-dom calculan una cascada; no colocan nada. Así que allí:
 *
 *   - «la lista mide 320 px» es una declaración leída, no un ancho medido;
 *   - «el árbol empuja el contenido» no se puede ni plantear, porque nada tiene posición;
 *   - «el anillo de foco se ve» se afirma sobre el elemento que la prueba enfoca a mano, no
 *     sobre el que recibe el `Tab`;
 *   - y la impresión **no existe**: no hay forma de emular el medio `print`, así que las reglas
 *     de `@media print` pueden estar enteras y no aplicar a nada.
 *
 * <h2>Qué lo dejaría inútil</h2>
 *
 * Tres cosas, y las tres están tapadas a propósito:
 *
 *   1. **Recorrer sin mirar.** Una captura no falla nunca. Por eso cada parada exige además que
 *      `[data-seccion]` traiga texto: una pantalla que no dibuja nada no da error de consola, se
 *      queda en blanco. Y se mira `[data-seccion]` y no `<main>`, porque `<main>` incluye la
 *      barra de pestañas y el título — con la pantalla entera rota, `<main>` seguiría trayendo
 *      texto de sobra.
 *   2. **Medir sin haber movido nada.** Cada medida de ancho comprueba primero que el corte que
 *      dice medir está donde dice: a 1440 la lista mide 376 y a 1000 mide 320, y las dos se
 *      afirman. Con una sola, un ancho clavado pasaría.
 *   3. **Dar por bueno un recorrido de teclado que no llega a nada.** El recorrido no compara
 *      contra una lista de nombres copiada aquí —que se queda vieja sin ruido—: marca el
 *      elemento enfocado y después pregunta al DOM si **cada** módulo del árbol y **cada**
 *      pestaña abierta quedaron marcados.
 *
 * <h2>Una corrección del enunciado, medida</h2>
 *
 * El issue decía que a 1080 px el árbol «se convierte en superposición». **V6 no tiene ninguna
 * consulta de 1080 px** —sus cuatro son 1240, 900, 760 y `prefers-reduced-motion`, líneas
 * 33-42— y su plantilla dice lo contrario en la línea 104: la hamburguesa muestra u oculta el
 * árbol, «que **empuja el contenido en lugar de taparlo**». La superposición con
 * `translateX(-101%)` es del handoff de la etapa anterior y no se porta. De ahí que la parte 3
 * de este arnés exija justo lo contrario: que ocultarlo ensanche el contenido en **exactamente**
 * los 252 px que mide el panel, a cualquier ancho, y que el `<aside>` no salga nunca del flujo.
 *
 * <h2>Lo que este recorrido encontró la primera vez que se ejecutó</h2>
 *
 * Que el anillo `#52BDEF` **no llegaba a ningún campo**. La línea 25 del artboard le da a
 * `input:focus` un `outline: none`, y (0,1,1) le gana a `:focus-visible` a secas (0,1,0), así
 * que el anillo se apagaba también con el foco del teclado. Y su repuesto era medio repuesto:
 * de las dos señales que el artboard le da al campo enfocado, el **borde** `#005284` es inerte
 * porque los estilos van en línea —medido: el filtro del árbol sale con `rgb(22, 35, 44)` y el
 * `<select>` de orden con `rgb(214, 222, 228)`—, de modo que quedaba sólo el `#D3EBFA`, 1,2:1
 * sobre blanco. `global.css` gana por eso una tercera regla, con su motivo escrito allí, y este
 * recorrido exige el anillo en **todas** las paradas más el anillo de campo en los campos: quien
 * borre cualquiera de las dos ve rojo.
 *
 * Necesita la aplicación servida. `CAJA_BASE` dice dónde (por omisión, el puerto de `yarn dev`).
 * Las capturas van a `CAJA_CAPTURAS` (por omisión `.capturas/`).
 */
import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";

const BASE = process.env.CAJA_BASE ?? "http://localhost:5181";
const SALIDA = process.env.CAJA_CAPTURAS ?? ".capturas";

/** Las cuatro secciones propias, por el slug con el que se escriben en la URL. */
const SECCIONES = ["panel", "recibos", "cajas", "tarifario"];

/** Lo que mide el árbol de módulos, y por tanto lo que tiene que ensanchar al ocultarse. */
const ANCHO_DEL_ARBOL = 252;

/**
 * El ancho imprimible de un A4 vertical, en píxeles CSS.
 *
 * 210 mm a 96 dpi son 793,7 px; con los 12 mm de margen de cada lado que declara `@page` quedan
 * 186 mm, o sea 703 px. Es el ancho contra el que se comprueba que nada sobresale: lo que
 * sobresale del área imprimible **se recorta y no avisa**.
 */
const ANCHO_A4 = 703;

/** El acento del artboard (`--acento`, línea 24), en la forma en que Chromium lo devuelve. */
const ANILLO = "rgb(82, 189, 239)";
/** El anillo de los campos (`--anillo-campo`, línea 25) y su borde. */
const ANILLO_DE_CAMPO = "rgb(211, 235, 250)";

const fallos = [];
const dicho = [];
/** Apunta un fallo con su medida dentro: un fallo sin cifra no se puede leer. */
const fallar = (texto) => fallos.push(texto);
const contar = (texto) => dicho.push(texto);

await mkdir(SALIDA, { recursive: true });
const navegador = await chromium.launch();

/** Abre una pantalla de cero. El `about:blank` de por medio importa: ir de un hash a otro con
 *  `goto` **no** recarga —misma página, otro hash— y el estado de React sobrevive (#8). */
async function abrir(pagina, seccion) {
  await pagina.goto("about:blank");
  await pagina.goto(`${BASE}/#${seccion}`, { waitUntil: "domcontentloaded" });
  await pagina.waitForSelector("[data-seccion]");
  await pagina.waitForTimeout(250);
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Las cuatro secciones: captura, consola limpia y contenido de verdad
// ═══════════════════════════════════════════════════════════════════════════
{
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
  const pagina = await contexto.newPage();

  for (const seccion of SECCIONES) {
    const quejas = [];
    const oyeConsola = (m) => m.type() === "error" && quejas.push(m.text());
    const oyePagina = (e) => quejas.push("PAGEERROR: " + e.message);
    const oyePeticion = (r) => quejas.push(`requestfailed: ${r.url()} (${r.failure()?.errorText})`);
    pagina.on("console", oyeConsola);
    pagina.on("pageerror", oyePagina);
    pagina.on("requestfailed", oyePeticion);

    await abrir(pagina, seccion);
    await pagina.screenshot({ path: `${SALIDA}/${seccion}.png`, fullPage: true });

    pagina.off("console", oyeConsola);
    pagina.off("pageerror", oyePagina);
    pagina.off("requestfailed", oyePeticion);

    // Una pantalla en blanco no da error de consola: se queda en blanco. Y se mira
    // `[data-seccion]` —lo que dibuja la pantalla— y no `<main>`, que trae ademas la barra de
    // pestanas y el titulo y por tanto nunca esta vacio.
    const cuerpo = await pagina
      .locator("[data-seccion]")
      .innerText()
      .catch(() => "");
    if (cuerpo.trim().length < 80) {
      fallar(`#${seccion}: el area de contenido esta practicamente vacia (${cuerpo.trim().length} caracteres)`);
    }
    if (quejas.length) fallar(`#${seccion}: la pagina se quejo\n      ${quejas.join("\n      ")}`);
    contar(`#${seccion}: ${cuerpo.trim().length} caracteres de contenido, 0 quejas`);
  }
  await contexto.close();
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Los tres cortes del artboard (líneas 33-38), medidos y no leídos
// ═══════════════════════════════════════════════════════════════════════════
/** Abre `#recibos` a un ancho y devuelve lo que mide la lista y como se reparte el split. */
async function medirLaLista(ancho) {
  const contexto = await navegador.newContext({ viewport: { width: ancho, height: 900 } });
  const pagina = await contexto.newPage();
  await abrir(pagina, "recibos");
  const caja = await pagina.locator("[data-lista]").boundingBox();
  const reparto = await pagina
    .locator("[data-split]")
    .evaluate((e) => getComputedStyle(e).flexDirection);
  const tope = await pagina.locator("[data-lista]").evaluate((e) => getComputedStyle(e).maxHeight);
  const contenido = await pagina.locator("main").boundingBox();
  const ocultos = await pagina
    .locator("[data-sm-hide]")
    .evaluateAll((es) => es.map((e) => getComputedStyle(e).display));
  await contexto.close();
  return { ancho: caja.width, alto: caja.height, reparto, tope, contenido: contenido.width, ocultos };
}

{
  // El criterio 1 pide las dos, y hacen falta las dos: con una sola, un ancho clavado pasaria.
  const anchoDeLaLista = { 1440: 376, 1000: 320 };
  for (const [px, esperado] of Object.entries(anchoDeLaLista)) {
    const m = await medirLaLista(Number(px));
    if (Math.abs(m.ancho - esperado) > 1) {
      fallar(`a ${px} px la lista mide ${m.ancho} px y no ${esperado}`);
    }
    if (m.reparto !== "row") fallar(`a ${px} px el split deberia seguir en fila, esta en ${m.reparto}`);
    contar(`a ${px} px: lista ${m.ancho} px, split en ${m.reparto}`);
  }

  // A 880 se apilan: la lista pasa a ocupar el ancho del contenido y se acota a 300 px de alto.
  const apilada = await medirLaLista(880);
  if (apilada.reparto !== "column") {
    fallar(`a 880 px el split deberia apilarse en columna, esta en ${apilada.reparto}`);
  }
  if (Math.abs(apilada.ancho - apilada.contenido) > 1) {
    fallar(
      `a 880 px la lista deberia ocupar el ancho entero del contenido (${apilada.contenido} px), ` +
        `mide ${apilada.ancho}`,
    );
  }
  if (apilada.tope !== "300px") fallar(`a 880 px la lista deberia acotarse a 300px, dice ${apilada.tope}`);
  if (Math.abs(apilada.alto - 300) > 1) {
    fallar(`a 880 px la lista deberia medir 300 px de alto, mide ${apilada.alto}`);
  }
  contar(
    `a 880 px: split en ${apilada.reparto}, lista ${apilada.ancho}x${apilada.alto} px ` +
      `(max-height ${apilada.tope}) sobre un contenido de ${apilada.contenido} px`,
  );

  // A 740 no se ve ninguno de los marcados `data-sm-hide`. Y la mitad que hace falta al lado:
  // a 880 SI se ven — sin ella, un `display:none` puesto a todos pasaria igual.
  const estrecha = await medirLaLista(740);
  const visibles = estrecha.ocultos.filter((d) => d !== "none").length;
  if (estrecha.ocultos.length < 3) {
    fallar(`a 740 px solo hay ${estrecha.ocultos.length} elementos marcados \`data-sm-hide\`: se esperaban al menos 3`);
  }
  if (visibles) fallar(`a 740 px se ven ${visibles} de ${estrecha.ocultos.length} elementos \`data-sm-hide\``);
  const visiblesAntes = apilada.ocultos.filter((d) => d !== "none").length;
  if (visiblesAntes !== apilada.ocultos.length) {
    fallar(`a 880 px deberian verse los ${apilada.ocultos.length} \`data-sm-hide\`, se ven ${visiblesAntes}`);
  }
  contar(
    `\`data-sm-hide\`: ${apilada.ocultos.length} visibles a 880 px, ` +
      `${visibles} de ${estrecha.ocultos.length} a 740 px`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. El árbol EMPUJA, a cualquier ancho, y nunca se superpone
// ═══════════════════════════════════════════════════════════════════════════
for (const ancho of [1400, 1000]) {
  const contexto = await navegador.newContext({ viewport: { width: ancho, height: 900 } });
  const pagina = await contexto.newPage();
  await abrir(pagina, "panel");

  const arbol = pagina.locator("aside[data-cromo='arbol']");
  const posicion = await arbol.evaluate((e) => getComputedStyle(e).position);
  const cajaArbol = await arbol.boundingBox();
  const conArbol = (await pagina.locator("main").boundingBox()).width;

  const hamburguesa = pagina.getByRole("button", { name: "Mostrar u ocultar los módulos" });
  await hamburguesa.click();
  await pagina.waitForTimeout(200);
  const sinArbol = (await pagina.locator("main").boundingBox()).width;
  await hamburguesa.click();
  await pagina.waitForTimeout(200);
  const devuelto = (await pagina.locator("main").boundingBox()).width;

  // «Se superpone» y «empuja» se distinguen por esto y por nada mas: si tapara, el contenido
  // medirIa lo mismo con el arbol dentro y fuera.
  if (Math.abs(sinArbol - conArbol - ANCHO_DEL_ARBOL) > 1) {
    fallar(
      `a ${ancho} px ocultar el arbol ensancha el contenido en ${sinArbol - conArbol} px y no en ` +
        `${ANCHO_DEL_ARBOL}: o no empuja, o el panel no mide lo que dice`,
    );
  }
  if (Math.abs(devuelto - conArbol) > 1) {
    fallar(`a ${ancho} px volver a mostrarlo deja el contenido en ${devuelto} px y no en ${conArbol}`);
  }
  if (posicion !== "static") {
    fallar(`a ${ancho} px el arbol esta \`position: ${posicion}\`: fuera del flujo no empuja, tapa`);
  }
  if (Math.abs(cajaArbol.width - ANCHO_DEL_ARBOL) > 1) {
    fallar(`a ${ancho} px el arbol mide ${cajaArbol.width} px y no ${ANCHO_DEL_ARBOL}`);
  }
  if (cajaArbol.x !== 0) fallar(`a ${ancho} px el arbol no empieza en x=0 sino en x=${cajaArbol.x}`);
  contar(
    `a ${ancho} px: arbol ${cajaArbol.width} px en x=${cajaArbol.x} \`position: ${posicion}\`, ` +
      `contenido ${conArbol} → ${sinArbol} → ${devuelto}`,
  );
  await contexto.close();
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Quien pide menos movimiento no recibe ninguno
// ═══════════════════════════════════════════════════════════════════════════
{
  const contexto = await navegador.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  const pagina = await contexto.newPage();
  await abrir(pagina, "panel");
  // Con las TRES animaciones del artboard a la vez: `fadeIn` lo trae el cuerpo del Panel, `subir`
  // el toast —que dura 3 400 ms, asi que sigue ahi— y `pop` el lanzador. Sin provocarlas, esto
  // mediria un documento sin una sola animacion declarada y saldria verde por vacio; de ahi la
  // guarda de abajo, que exige haber encontrado alguna.
  await pagina.getByRole("combobox", { name: "Ejercicio de trabajo" }).selectOption({ index: 1 });
  await pagina.waitForTimeout(150);
  await pagina.getByRole("button", { name: "Ver todos los módulos" }).click();
  await pagina.waitForTimeout(200);

  const duraciones = await pagina.evaluate(() =>
    [...document.querySelectorAll("*")]
      .map((e) => [e.tagName.toLowerCase(), getComputedStyle(e).animationName, getComputedStyle(e).animationDuration])
      .filter(([, nombre]) => nombre && nombre !== "none"),
  );
  if (!duraciones.length) {
    fallar("con `reduced-motion` no hay ni una animacion declarada en la pagina: no se ha medido nada");
  }
  const largas = duraciones.filter(([, , d]) => Number.parseFloat(d) > 0.001);
  if (largas.length) {
    fallar(
      `con \`reduced-motion: reduce\` ${largas.length} animaciones duran mas de 1 ms: ` +
        largas.map(([t, n, d]) => `${t}/${n} ${d}`).join(", "),
    );
  }
  contar(
    `con \`reduced-motion: reduce\`: ${duraciones.length} animaciones declaradas, ` +
      `todas a ${[...new Set(duraciones.map(([, , d]) => d))].join("/")}`,
  );
  await contexto.close();
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. El recorrido con Tab, y el indicador de foco de cada parada
// ═══════════════════════════════════════════════════════════════════════════
{
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
  const pagina = await contexto.newPage();
  // Se llega por el hash y **no pulsando**, y eso decide la medida entera: arrancar en
  // `#recibos` deja dos pestanas abiertas —con una sola, «cada pestana queda alcanzada» la
  // cumpliria cualquier implementacion que alcanzara la primera— y ademas deja el foco en el
  // documento. La primera version de este arnes abria la segunda pestana pulsandola, y pulsar
  // deja el foco en lo pulsado: el recorrido empezaba por la mitad y declaraba «inalcanzables»
  // los once controles que quedaban por encima, los once alcanzables. Un `blur()` no lo
  // arregla — Chromium se queda con el punto de partida de la navegacion secuencial donde
  // estaba, medido: los mismos once.
  await abrir(pagina, "recibos");

  const paradas = [];
  for (let i = 0; i < 120; i++) {
    await pagina.keyboard.press("Tab");
    const parada = await pagina.evaluate((n) => {
      const e = document.activeElement;
      if (e === null || e === document.body || e === document.documentElement) return null;
      e.setAttribute("data-visitado", String(n));
      const s = getComputedStyle(e);
      return {
        etiqueta: e.tagName.toLowerCase(),
        nombre: (e.getAttribute("aria-label") ?? e.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 44),
        outline: `${s.outlineWidth} ${s.outlineStyle} ${s.outlineColor}`,
        offset: s.outlineOffset,
        sombra: s.boxShadow,
      };
    }, i);
    if (parada === null) break;
    paradas.push(parada);
  }

  if (paradas.length < 20) {
    fallar(`el recorrido con Tab solo alcanza ${paradas.length} controles: no se ha medido nada`);
  }
  if (paradas.length >= 120) {
    fallar("el recorrido con Tab no vuelve nunca al documento: hay una trampa de foco");
  }

  // El anillo del acento, en TODOS. Ver la nota de la cabecera: hasta este issue no llegaba a
  // ningun campo, y lo que quedaba en su sitio era un `#D3EBFA` sobre blanco.
  const esCampo = (p) => ["input", "select", "textarea"].includes(p.etiqueta);
  for (const p of paradas) {
    const quien = `${p.etiqueta} «${p.nombre}»`;
    if (p.outline !== `2px solid ${ANILLO}` || p.offset !== "2px") {
      fallar(`${quien} enfocado no ensena el anillo ${ANILLO}: outline «${p.outline}», offset ${p.offset}`);
    }
    // Y el campo conserva ademas el suyo, que es lo que el artboard le da con el raton: sin
    // esta mitad, borrar la linea 25 entera dejaria el recorrido en verde.
    if (esCampo(p) && !p.sombra.includes(ANILLO_DE_CAMPO)) {
      fallar(`${quien} enfocado pierde el anillo de campo ${ANILLO_DE_CAMPO}: ${p.sombra || "(ninguno)"}`);
    }
  }

  // Nada de listas copiadas: se le pregunta al DOM quien tenia que quedar marcado.
  const inalcanzables = await pagina.evaluate(() => {
    const falta = [];
    const mira = (selector, comoSeLlama) => {
      for (const e of document.querySelectorAll(selector)) {
        if (!e.hasAttribute("data-visitado")) falta.push(`${comoSeLlama}: ${(e.getAttribute("aria-label") ?? e.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40)}`);
      }
    };
    mira("[data-cromo='barra'] button, [data-cromo='barra'] select", "barra global");
    mira("[data-cromo='arbol'] input, [data-cromo='arbol'] button", "arbol");
    mira("[data-cromo='pestanas'] button", "pestanas");
    return falta;
  });
  if (inalcanzables.length) {
    fallar(`${inalcanzables.length} controles quedan fuera del recorrido con Tab:\n      ${inalcanzables.join("\n      ")}`);
  }

  const campos = paradas.filter(esCampo).length;
  contar(
    `Tab recorre ${paradas.length} controles y vuelve al documento; ${paradas.length - campos} con el ` +
      `anillo ${ANILLO} y ${campos} campos con el suyo; ${inalcanzables.length} inalcanzables`,
  );
  await contexto.close();
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. La impresión: A4 vertical, y sólo el contenido
// ═══════════════════════════════════════════════════════════════════════════
{
  // El ancho de la ventana es el del area imprimible de un A4: es lo que decide que consultas
  // de medios se cumplen y, sobre todo, que sobresale. Medir a 1440 y despues pedir un PDF de
  // A4 seria medir una disposicion que el papel no tiene.
  const contexto = await navegador.newContext({ viewport: { width: ANCHO_A4, height: 1000 } });
  const pagina = await contexto.newPage();

  for (const seccion of SECCIONES) {
    await abrir(pagina, seccion);
    // En `#recibos` se elige un recibo **y se abre la seccion que trae la tabla de cuotas**. Lo
    // primero, porque la barra inferior de acciones —una de las cuatro piezas de cromo— solo
    // existe con una ficha delante. Lo segundo, porque esa tabla es la mas ancha de la
    // aplicacion (`min-width: 780px`, mas que los 703 de un A4) y es justo lo que un recibo
    // impreso tiene que traer: sin abrirla, «nada sobresale» seria cierto por no estar dibujada
    // — medido, quitar la regla que la ajusta no ponia nada rojo.
    if (seccion === "recibos") {
      await pagina.locator("[data-lista] button[aria-current]").first().click();
      await pagina.waitForSelector("[data-paso]");
      let conTabla = false;
      for (const pestana of await pagina.locator("[data-paso]").all()) {
        await pestana.click();
        await pagina.waitForTimeout(150);
        if (await pagina.locator("[data-seccion] table").count()) {
          conTabla = true;
          break;
        }
      }
      if (!conTabla) fallar("#recibos: ninguna seccion de la ficha dibuja la tabla de cuotas");
    }
    await pagina.emulateMedia({ media: "print" });
    await pagina.waitForTimeout(250);

    const v = await pagina.evaluate((anchoA4) => {
      const dibujado = (s) => {
        const e = document.querySelector(s);
        return e === null ? null : getComputedStyle(e).display;
      };
      const desbordan = [...document.querySelectorAll("#raiz *")]
        .map((e) => ({ e, r: e.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && r.right > anchoA4 + 1)
        .map(({ e, r }) => `${e.tagName.toLowerCase()} hasta x=${Math.round(r.right)}`);
      return {
        cromo: Object.fromEntries(
          ["barra", "arbol", "pestanas", "acciones"].map((k) => [k, dibujado(`[data-cromo="${k}"]`)]),
        ),
        texto: (document.querySelector("[data-seccion]")?.innerText ?? "").trim().length,
        desbordan: [...new Set(desbordan)].slice(0, 6),
        cuantosDesbordan: desbordan.length,
        conSombra: [...document.querySelectorAll("#raiz *")].filter(
          (e) => getComputedStyle(e).boxShadow !== "none",
        ).length,
      };
    }, ANCHO_A4);

    // Que piezas TIENEN que estar. Sin esta lista, `null` valdria por «esa pieza no esta en esta
    // pantalla» y una pieza que **pierde su marca** saldria en verde: es exactamente lo que paso
    // al quitarle el `data-cromo` a la barra de pestanas — `mirar.mjs` no dijo nada y solo lo
    // vio la suite. Las tres primeras se dibujan siempre; la barra de acciones, solo con una
    // ficha delante, que es lo que este recorrido monta en `#recibos`.
    const obligatorias =
      seccion === "recibos" ? ["barra", "arbol", "pestanas", "acciones"] : ["barra", "arbol", "pestanas"];
    for (const [pieza, display] of Object.entries(v.cromo)) {
      if (display === null) {
        if (obligatorias.includes(pieza)) {
          fallar(
            `#${seccion}: no hay ningun \`[data-cromo="${pieza}"]\` en la pagina — o la pieza no se ` +
              "dibuja, o ha perdido su marca y por tanto se imprimiria",
          );
        }
        continue;
      }
      if (display !== "none") {
        fallar(`#${seccion}: en impresion el cromo «${pieza}» sigue dibujandose (display: ${display})`);
      }
    }
    // La mitad que hace falta al lado de la anterior: retirarlo TODO tambien deja el cromo
    // fuera, y dejaria una hoja en blanco.
    if (v.texto < 80) {
      fallar(`#${seccion}: en impresion no queda contenido (${v.texto} caracteres)`);
    }
    if (v.cuantosDesbordan) {
      fallar(
        `#${seccion}: ${v.cuantosDesbordan} elementos sobresalen del ancho imprimible de ` +
          `${ANCHO_A4} px y se recortarian: ${v.desbordan.join(", ")}`,
      );
    }
    if (v.conSombra) fallar(`#${seccion}: en impresion quedan ${v.conSombra} elementos con sombra`);

    // `preferCSSPageSize` para que mande el `@page` de `global.css` y NO un argumento de aqui:
    // asi lo que se mide es la hoja de estilos. Sin `@page`, Chromium cae a Letter —612x792 pt—,
    // que es un tamaño distinto y **sale igual de bien** a la vista: el unico sitio donde la
    // diferencia se ve es la caja de la pagina del PDF, y por eso se lee de ahi.
    const pdf = await pagina.pdf({ preferCSSPageSize: true });
    await writeFile(`${SALIDA}/${seccion}.pdf`, pdf);
    // El PDF tiene que traer algo: uno de cero paginas seria «cabe en A4» por vacio.
    const hojas = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    if (hojas < 1) fallar(`#${seccion}: el PDF de impresion no trae ni una hoja`);
    const caja = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/.exec(pdf.toString("latin1"));
    if (caja === null) {
      fallar(`#${seccion}: el PDF no declara ninguna \`/MediaBox\`: no se puede decir de que tamaño es`);
    } else {
      const [ancho, alto] = [Number(caja[1]), Number(caja[2])];
      // A4 vertical: 210x297 mm son 595,28x841,89 pt. Un punto de tolerancia.
      if (Math.abs(ancho - 595.28) > 1.5 || Math.abs(alto - 841.89) > 1.5) {
        fallar(
          `#${seccion}: la hoja no es un A4 vertical sino ${ancho}x${alto} pt ` +
            "(A4 vertical son 595,28x841,89)",
        );
      }
      contar(`#${seccion}: hoja de ${ancho}x${alto} pt`);
    }

    const cromoFuera = Object.entries(v.cromo)
      .filter(([, d]) => d === "none")
      .map(([k]) => k);
    contar(
      `#${seccion} en papel: fuera [${cromoFuera.join(", ")}], ${v.texto} caracteres de contenido, ` +
        `0 desbordes sobre ${ANCHO_A4} px, ${hojas} hoja(s) A4`,
    );
    await pagina.emulateMedia({ media: null });
  }
  await contexto.close();
}

await navegador.close();

console.log(`las cuatro secciones, miradas · capturas y PDF en ${SALIDA}/\n`);
for (const d of dicho) console.log("  · " + d);

if (!fallos.length) {
  console.log("\nla envoltura aguanta: los cortes, el arbol que empuja, el teclado y el papel");
  process.exit(0);
}
console.log(`\n${fallos.length} problemas:\n`);
for (const f of fallos) console.log("  - " + f);
process.exit(1);
