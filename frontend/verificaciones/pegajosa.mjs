/**
 * La cabecera de las tablas de consulta se queda quieta —y pegada al borde— al desplazar.
 *
 *   node verificaciones/pegajosa.mjs
 *
 * <h2>Por qué existe</h2>
 *
 * Porque **ningún emulador de DOM puede decir esto**. `cajas.test.tsx` y `tarifario.test.tsx`
 * afirman que el `<th>` calcula `position: sticky` y `top: 0px`, y hace falta: es lo que corre en
 * cada `yarn verificar`. Pero `position: sticky` no es una propiedad que se cumpla sola —necesita
 * un antepasado que desplace, y lo que hace es cambiar **dónde se pinta** el elemento mientras ese
 * antepasado se mueve—. Ni jsdom ni happy-dom hacen disposición, así que allí la declaración puede
 * estar entera y la cabecera irse con la tabla sin que nada lo diga.
 *
 * Y el modo de fallo que esto vigila es justo el que no se ve leyendo: quitarle el contenedor
 * `overflow:auto` a la tabla deja los dos `<th>` con su `position: sticky` intacto y la cabecera
 * desaparece al desplazar la página entera.
 *
 * Lo que comprueba, en las dos pantallas:
 *
 *   1. El contenedor **desplaza de verdad**, y lo que se le pidió: `scrollTop` se lee antes y
 *      después y se afirma la **diferencia**. Sin esto, «la cabecera no se movió» sería cierto por
 *      no haber movido nada — un `200` que no prueba nada.
 *   2. La cabecera **se queda**: su distancia al borde superior del contenedor es la misma antes y
 *      después.
 *   3. Y **pegada al borde**: esa distancia es 0. Una cabecera `sticky` con `top: 40px` cumple el
 *      punto 2 —se queda quieta, a 40 px— y flota sobre las filas tapándolas. Sin este punto, el
 *      arnés no distingue las dos cosas.
 *   4. Y el cuerpo **sí** se mueve: la primera celda sube, respecto del mismo borde, tanto como se
 *      desplazó. Es la mitad que separa «pegajosa» de «nada se movió».
 *
 * La ventana va deliberadamente **baja** (420 px): con la ventana alta, las tablas de seis y siete
 * filas caben enteras, el contenedor no tiene nada que desplazar y las comprobaciones pasarían sin
 * haber medido nada.
 *
 * <h2>Qué lo dejaría inútil, y las tres guardas que lo impiden</h2>
 *
 * Este arnés **falló al azar** durante #16 y el rojo se leyó como ruido, que es lo peor que le
 * puede pasar a una verificación: el día que la cabecera deje de pegarse de verdad, nadie lo mira.
 * La causa se reprodujo a voluntad (#35) retrasando 200 ms la tipografía de Google, y las tres
 * cosas que el issue contaba por separado resultaron ser **una sola**: la webfont llega entre las
 * dos medidas, la página se recompone, y con ella
 *
 *   - la posición **de viewport** de la cabecera se mueve 3 px sin que la cabecera se haya movido
 *     respecto de su tabla —el arnés viejo comparaba `boundingBox().y`, o sea el marco equivocado—;
 *   - el anclaje de desplazamiento de Chromium empuja el contenedor a `scrollTop = 2`, y el arnés
 *     viejo leía ese **absoluto** como si fuera el delta: «desplazado 62 px»;
 *   - y las alturas de fila cambian, así que la celda sube 57 de esos «62».
 *
 * Contra eso, tres guardas, y las tres tienen que pasar:
 *
 *   1. **Se mide en el marco del contenedor**, no en el del viewport: la distancia de la cabecera
 *      y de la celda al borde superior del contenedor, y las dos en la **misma** evaluación, que
 *      es un solo instante de disposición. Da igual dónde esté la página.
 *   2. **Se espera a que la tipografía esté puesta y la disposición quieta** antes de medir: al
 *      evento `load` —que es lo que trae la hoja de Google—, a `document.fonts.ready` y después a
 *      que la huella se repita en tres marcos seguidos.
 *   3. **Y si aun así la disposición cambia entre las dos medidas, se dice y se repite.** El
 *      invariante es `distancia + scrollTop`, la posición de la celda **dentro** del contenido, que
 *      no depende del desplazamiento: si cambia, lo que se movió fue la maqueta y no la cabecera.
 *      Acusar ahí a `position: sticky` sería un rojo que miente.
 *
 * <h2>La autocomprobación</h2>
 *
 * Una medida «inmune a que la página se mueva» es la más fácil de afirmar sin haberla probado:
 * basta con que la página no se mueva nunca. Por eso cada pantalla se mide **tres veces** —una
 * limpia y dos con los estorbos del fallo de #16 puestos a propósito, con sus números— y se exige:
 *
 *   - que los estorbos **hayan surtido efecto**: que el contenedor arranque de verdad en 2 px, que
 *     cambie de sitio en coordenadas de viewport, y que el relleno de la cabecera crezca los 3 px.
 *     Un estorbo que no estorba no demuestra nada — y se mide sobre el contenedor y no sobre la
 *     cabecera a propósito: con una cabecera que no se pega, la cabecera se va con el
 *     desplazamiento y este guarda acusaría al estorbo de algo que hizo la pantalla;
 *   - que la maqueta moviéndose bajo la medida **se detecte**: si el arnés llega al final de esa
 *     pasada sin haber descartado un intento, la guarda 3 está ciega y se dice así, con esa
 *     palabra. Es lo que le pasó a `cero-red.mjs` en #15, y lo que hace que un verde signifique
 *     algo;
 *   - y que las tres pasadas den **el mismo veredicto y las mismas cifras**.
 *
 * Necesita la aplicación servida **bajo `/caja`**, que es el `base` que `vite.config.ts`
 * declara. `CAJA_BASE` dice dónde, prefijo incluido (por omisión, el puerto de `yarn dev`).
 */
import { chromium } from "playwright-core";

/*
 * Donde esta servida la aplicacion, **con su prefijo**.
 *
 * `vite.config.ts` declara `base: "/caja/"`, asi que ni `yarn dev` ni `vite preview` sirven nada
 * en la raiz: los dos contestan `302` a `/caja/` y todo cuelga de ahi. Por omision se apunta al
 * `yarn dev` de este repositorio; en CI, `CAJA_BASE` trae el puerto de `vite preview` con el
 * mismo prefijo. La barra final se quita para que las rutas de abajo no salgan con dos.
 */
const BASE = (process.env.CAJA_BASE ?? "http://localhost:5181/caja").replace(/\/+$/, "");
/** Cuánto se desplaza. Menos que el alto del cuerpo de la tabla, para que haya sitio. */
const DESPLAZAMIENTO = 60;
/** En píxeles. La disposición trae fracciones (`243.84375`), así que nada se compara por igualdad. */
const TOLERANCIA = 1;
/** Cuántas veces se reintenta una medida que la maqueta movió por debajo. */
const INTENTOS = 3;

/**
 * Las tres pasadas, y son la autocomprobación: cada una reproduce uno de los tres síntomas del
 * fallo de #16, con sus números, y las tres tienen que dar el mismo veredicto que la limpia.
 *
 *   - `pre`: el contenedor pre-desplazado 2 px antes de medir, como lo dejó el anclaje de Chromium.
 *   - `empuje`: la página empujada 3 px hacia abajo **entre** las dos medidas.
 *   - `maqueta`: la maqueta creciendo 3 px por encima de la primera fila **entre** las dos medidas,
 *     que es lo que hace una webfont al llegar. Ésta no se puede «medir igual»: se tiene que
 *     **detectar**, y por eso exige además que el intento se descarte.
 */
const ESTORBOS = [
  { nombre: "sin estorbos", pre: 0, empuje: 0, maqueta: 0 },
  { nombre: "contenedor a 2 px y página empujada 3 px", pre: 2, empuje: 3, maqueta: 0 },
  { nombre: "la maqueta creciendo 3 px entre las dos medidas", pre: 0, empuje: 0, maqueta: 3 },
];

const PANTALLAS = [
  { hash: "#cajas", nombre: "arqueo" },
  { hash: "#tarifario", nombre: "tarifario" },
];

const navegador = await chromium.launch();
const contexto = await navegador.newContext({ viewport: { width: 1440, height: 420 } });
const pagina = await contexto.newPage();

const consola = [];
pagina.on("pageerror", (e) => consola.push(String(e)));
pagina.on("requestfailed", (r) => consola.push(`requestfailed: ${r.url()}`));

const fallos = [];

const casi = (a, b) => Math.abs(a - b) <= TOLERANCIA;
const px = (n) => n.toFixed(1);

/**
 * Espera a que la tipografía esté puesta y la disposición deje de moverse.
 *
 * `document.fonts.ready` no basta por sí solo: si la hoja de Google todavía no ha llegado, no hay
 * ninguna `@font-face` pendiente y la promesa resuelve en el acto. De ahí los marcos: se espera a
 * que la huella —posiciones y alturas— se repita.
 *
 * @param {string} nombre el `data-desplazable` del contenedor
 * @returns {Promise<{marcos: number, quieta: boolean, movio: number, fuentes: object}>}
 */
async function asentar(nombre) {
  return await pagina.evaluate(async (n) => {
    const contenedor = document.querySelector(`[data-desplazable="${n}"]`);
    const huella = () => {
      const th = contenedor.querySelector("th");
      const td = contenedor.querySelector("tbody tr td");
      return [
        contenedor.getBoundingClientRect().top,
        th.getBoundingClientRect().top,
        th.getBoundingClientRect().height,
        td.getBoundingClientRect().top,
        contenedor.scrollHeight,
      ];
    };
    const marco = () => new Promise((r) => requestAnimationFrame(() => r()));

    const partida = huella();
    await document.fonts.ready;

    let previa = huella();
    let marcos = 0;
    let iguales = 0;
    while (marcos < 180 && iguales < 3) {
      await marco();
      marcos += 1;
      const ahora = huella();
      iguales = ahora.every((v, i) => v === previa[i]) ? iguales + 1 : 0;
      previa = ahora;
    }
    return {
      marcos,
      quieta: iguales >= 3,
      // Cuánto se movió la maqueta mientras se esperaba. Es informativo: dice si la espera
      // sirvió de algo en esta corrida, que es lo que un `document.fonts.ready` decorativo no
      // podría enseñar.
      movio: Math.abs(previa[0] - partida[0]) + Math.abs(previa[3] - partida[3]),
      fuentes: {
        estado: document.fonts.status,
        sourceSans3: document.fonts.check('600 11px "Source Sans 3"'),
      },
    };
  }, nombre);
}

/**
 * Una medida: todo en **una sola** evaluación, o sea un único instante de disposición.
 *
 * Tres llamadas separadas a `boundingBox()` son tres momentos distintos, y entre dos de ellos cabe
 * la llegada de una webfont. Eso es lo que pasó en #16.
 *
 * @param {string} nombre el `data-desplazable` del contenedor
 */
async function medida(nombre) {
  return await pagina.evaluate((n) => {
    const contenedor = document.querySelector(`[data-desplazable="${n}"]`);
    const tabla = contenedor.querySelector("table");
    const th = contenedor.querySelector("th");
    const td = contenedor.querySelector("tbody tr td");
    const marco = contenedor.getBoundingClientRect();
    // El borde superior del área que desplaza: la caja de relleno, o sea descontando el borde.
    const cero = marco.top + contenedor.clientTop;
    const relativa = (e) => e.getBoundingClientRect().top - cero;
    return {
      tabla: tabla.dataset.tabla ?? "(sin `data-tabla`)",
      pegajosa: tabla.hasAttribute("data-sticky"),
      scrollTop: contenedor.scrollTop,
      altoDesplazable: contenedor.scrollHeight,
      altoVisible: contenedor.clientHeight,
      // Dónde está el propio contenedor en el viewport. Es lo que se mueve cuando se mueve la
      // página, y **sólo** eso: por dentro no se desplaza, así que sirve para comprobar que el
      // estorbo del empuje surtió efecto sin que la respuesta dependa de si la cabecera se pega.
      contenedorEnElViewport: marco.top,
      cabecera: { relativa: relativa(th), viewport: th.getBoundingClientRect().top },
      celda: { relativa: relativa(td), viewport: td.getBoundingClientRect().top },
      // La posición de la celda **dentro** del contenido, que no depende del desplazamiento. Si
      // cambia entre dos medidas, lo que se movió fue la maqueta.
      celdaEnElContenido: relativa(td) + contenedor.scrollTop,
    };
  }, nombre);
}

/** Desplaza el contenedor y espera a que se pare. Devuelve el `scrollTop` de antes y el de después. */
async function desplazar(nombre, cuanto) {
  return await pagina.evaluate(async ([n, cuanto]) => {
    const contenedor = document.querySelector(`[data-desplazable="${n}"]`);
    const antes = contenedor.scrollTop;
    contenedor.scrollBy(0, cuanto);
    let previo = null;
    let marcos = 0;
    while (marcos < 60 && contenedor.scrollTop !== previo) {
      previo = contenedor.scrollTop;
      await new Promise((r) => requestAnimationFrame(() => r()));
      marcos += 1;
    }
    return { antes, despues: contenedor.scrollTop };
  }, [nombre, cuanto]);
}

/** Pre-desplaza el contenedor, como lo dejó el anclaje de Chromium en el fallo de #16. */
async function preDesplazar(nombre, cuanto) {
  return await pagina.evaluate(([n, cuanto]) => {
    const contenedor = document.querySelector(`[data-desplazable="${n}"]`);
    contenedor.scrollTop = cuanto;
    return contenedor.scrollTop;
  }, [nombre, cuanto]);
}

/**
 * Empuja la página hacia abajo metiéndole un relleno delante de la aplicación.
 *
 * Es la simulación fiel de lo que hizo la webfont: crecer por encima del contenedor y llevárselo
 * todo unos píxeles. La cabecera cambia de sitio en coordenadas de viewport **sin** haberse movido
 * respecto de su tabla, que es justo lo que este arnés ya no debe confundir.
 */
async function empujar(cuanto) {
  await pagina.evaluate((cuanto) => {
    const relleno = document.createElement("div");
    relleno.setAttribute("data-estorbo-del-arnes", "1");
    relleno.style.height = `${cuanto}px`;
    document.body.insertAdjacentElement("afterbegin", relleno);
  }, cuanto);
}

/**
 * Mueve la maqueta **dentro** del contenedor: la cabecera crece y con ella baja la primera fila.
 *
 * Es lo que una webfont hace al llegar —cambiar las métricas de lo que ya estaba pintado—, y es el
 * único de los tres estorbos que ninguna medida puede absorber: si esto se «mide igual», lo que se
 * ha medido es una tabla que no es la de antes. La guarda 3 tiene que verlo y descartar el intento.
 */
async function moverLaMaqueta(nombre, cuanto) {
  return await pagina.evaluate(([n, cuanto]) => {
    const th = document.querySelector(`[data-desplazable="${n}"] th`);
    // El relleno de partida se LEE, no se copia de `TablaDeDatos`: un literal aquí sería una
    // segunda fuente de verdad que se queda vieja sin ruido. Y lleva `!important` porque el
    // estilo de la cabecera va en línea —que es la doctrina de esta interfaz— y un estilo en
    // línea le gana a una hoja: sin él, la regla se escribiría y no movería nada.
    const partida = parseFloat(getComputedStyle(th).paddingTop);
    const hoja = document.createElement("style");
    hoja.setAttribute("data-estorbo-del-arnes", "1");
    hoja.textContent =
      `[data-desplazable="${n}"] thead th { padding-top: ${partida + cuanto}px !important }`;
    document.head.append(hoja);
    return { partida, ahora: parseFloat(getComputedStyle(th).paddingTop) };
  }, [nombre, cuanto]);
}

/**
 * Mide una pantalla con un juego de estorbos puesto.
 *
 * @returns {Promise<object|null>} el resumen para comparar las dos pasadas, o `null` si falló
 */
async function medir(hash, nombre, estorbo) {
  // Un `about:blank` de por medio: ir de `#cajas` a `#tarifario` con `goto` NO recarga —misma
  // página, otro hash— y el estado de React sobrevive. Es la trampa que #8 midió.
  await pagina.goto("about:blank");
  await pagina.goto(`${BASE}/${hash}`, { waitUntil: "domcontentloaded" });
  await pagina.waitForSelector(`[data-desplazable="${nombre}"] th`);
  // `load` espera a la hoja de estilos de la tipografía; sin ella no hay ni `@font-face` que
  // esperar y `document.fonts.ready` resolvería sobre una página que aún va a moverse.
  await pagina.waitForLoadState("load");

  const donde = `${hash} · «${nombre}» · ${estorbo.nombre}`;
  const asiento = await asentar(nombre);
  if (!asiento.quieta) {
    fallos.push(`${donde}: la disposición no se quedó quieta en 180 marcos; no se ha medido nada`);
    return null;
  }

  let descartes = 0;
  for (let intento = 1; intento <= INTENTOS; intento += 1) {
    // Cada intento arranca donde el estorbo diga y no donde lo dejó el anterior: un reintento que
    // hereda el desplazamiento del intento fallido acaba topando con el final de la tabla, y
    // entonces el rojo sería del arnés y no de la pantalla.
    const puesto = await preDesplazar(nombre, estorbo.pre);
    if (!casi(puesto, estorbo.pre)) {
      fallos.push(
        `${donde}: no se pudo poner el contenedor a ${estorbo.pre} px antes de medir (quedó en ` +
          `${puesto}), así que esta pasada no demuestra que la medida sea un delta`,
      );
      return null;
    }

    const antes = await medida(nombre);
    if (antes.altoDesplazable <= antes.altoVisible) {
      fallos.push(
        `${donde}: la tabla «${antes.tabla}» cabe entera (scrollHeight ${antes.altoDesplazable} <= ` +
          `clientHeight ${antes.altoVisible}), así que desplazar no mide nada`,
      );
      return null;
    }

    // El estorbo de la maqueta se pone UNA vez, en el primer intento: es la llegada de una
    // webfont, que pasa una vez y se queda.
    let maqueta = null;
    if (estorbo.maqueta > 0 && intento === 1) maqueta = await moverLaMaqueta(nombre, estorbo.maqueta);

    const movimiento = await desplazar(nombre, DESPLAZAMIENTO);
    if (estorbo.empuje > 0) await empujar(estorbo.empuje);
    const despues = await medida(nombre);

    if (maqueta !== null && !casi(maqueta.ahora - maqueta.partida, estorbo.maqueta)) {
      fallos.push(
        `${donde}: la maqueta NO se movió los ${estorbo.maqueta} px del estorbo (el relleno de la ` +
          `cabecera pasó de ${px(maqueta.partida)} a ${px(maqueta.ahora)} px), así que esta pasada ` +
          "no demuestra que el arnés sepa ver una disposición que cambia bajo la medida",
      );
      return null;
    }

    // Guarda 3: si la maqueta se movió entre las dos medidas, esto no ha medido `sticky`. Se
    // reintenta, y si no se estabiliza se dice lo que pasó de verdad en vez de acusar a la
    // cabecera.
    if (!casi(antes.celdaEnElContenido, despues.celdaEnElContenido)) {
      if (intento < INTENTOS) {
        descartes += 1;
        console.log(
          `${donde}: la maqueta se movió entre las dos medidas ` +
            `(la celda pasó de ${px(antes.celdaEnElContenido)} a ${px(despues.celdaEnElContenido)} ` +
            `px dentro del contenido); intento ${intento} descartado`,
        );
        continue;
      }
      fallos.push(
        `${donde}: la disposición cambió entre las dos medidas en los ${INTENTOS} intentos —la ` +
          `celda pasó de ${px(antes.celdaEnElContenido)} a ${px(despues.celdaEnElContenido)} px ` +
          "dentro del contenido—, así que no se ha medido `position: sticky` sino la maqueta " +
          `moviéndose (¿la tipografía llegando tarde?)`,
      );
      return null;
    }

    const delta = despues.scrollTop - antes.scrollTop;
    const subida = antes.celda.relativa - despues.celda.relativa;
    const nombreDeTabla = despues.tabla;

    // La autocomprobación de la pasada de la maqueta: si la disposición cambió bajo la medida y
    // el arnés llegó hasta aquí sin descartar ni un intento, la guarda 3 está CIEGA y su verde no
    // significa nada — que es lo que le pasó a `cero-red.mjs` en #15.
    if (estorbo.maqueta > 0 && descartes === 0) {
      fallos.push(
        `${donde}: la maqueta creció ${estorbo.maqueta} px entre las dos medidas y el arnés no se ` +
          "enteró: la guarda que distingue «la cabecera no se pega» de «la maqueta se movió bajo " +
          "la medida» está CIEGA, y con ella este verde no significa nada",
      );
      return null;
    }

    // La autocomprobación de la pasada con estorbos: si la página no se movió de verdad, esta
    // pasada no prueba la inmunidad que dice probar.
    if (estorbo.empuje > 0) {
      // Se mide sobre el CONTENEDOR y no sobre la cabecera: con una cabecera que no se pega, la
      // cabecera se va con el desplazamiento y este guarda acusaría al estorbo de no haber
      // estorbado — un rojo que miente, medido con la rotura de `data-sticky` puesta.
      const movida = despues.contenedorEnElViewport - antes.contenedorEnElViewport;
      if (!casi(movida, estorbo.empuje)) {
        fallos.push(
          `${donde}: la página NO se movió los ${estorbo.empuje} px del estorbo (el contenedor ` +
            `pasó de y=${px(antes.contenedorEnElViewport)} a ` +
            `y=${px(despues.contenedorEnElViewport)} en el viewport), así que esta pasada no ` +
            "demuestra que la medida sea inmune a que la página se mueva",
        );
        return null;
      }
    }

    // 1. Se desplazó, y lo que se pidió. Se afirma la DIFERENCIA, no el absoluto.
    if (!casi(delta, DESPLAZAMIENTO)) {
      fallos.push(
        `${donde}: el contenedor no se desplazó lo que se le pidió — scrollTop ` +
          `${movimiento.antes}→${movimiento.despues} (delta ${delta}) de ${DESPLAZAMIENTO}: ` +
          "no se ha medido nada",
      );
      return null;
    }
    // 2. La cabecera se queda, medida contra el borde de su contenedor.
    if (!casi(antes.cabecera.relativa, despues.cabecera.relativa)) {
      fallos.push(
        `${donde}: la cabecera de la tabla «${nombreDeTabla}» se fue con la tabla — de ` +
          `${px(antes.cabecera.relativa)} a ${px(despues.cabecera.relativa)} px del borde ` +
          `superior de su contenedor tras desplazar ${delta} px` +
          (despues.pegajosa ? "" : " (la tabla no lleva `data-sticky`)"),
      );
    }
    // 3. Y pegada al borde: `top: 0`. Quedarse quieta a 40 px es quedarse flotando sobre las filas.
    else if (!casi(despues.cabecera.relativa, 0)) {
      fallos.push(
        `${donde}: la cabecera de la tabla «${nombreDeTabla}» se queda quieta pero NO pegada al ` +
          `borde: a ${px(despues.cabecera.relativa)} px del borde superior de su contenedor tras ` +
          `desplazar ${delta} px. Es \`position: sticky\` con \`top\` distinto de 0, y así tapa ` +
          "la primera fila en vez de encabezarla",
      );
    }
    // 4. Y el cuerpo sí se mueve.
    if (!casi(subida, delta)) {
      fallos.push(
        `${donde}: el cuerpo no se movió lo que se desplazó — la primera celda de «${nombreDeTabla}» ` +
          `subió ${px(subida)} px de ${delta}`,
      );
    }

    console.log(
      `${donde}: scrollTop ${movimiento.antes}→${movimiento.despues} (delta ${delta}) · cabecera a ` +
        `${px(antes.cabecera.relativa)}→${px(despues.cabecera.relativa)} px del borde · celda sube ` +
        `${px(subida)} px · tipografía ${asiento.fuentes.sourceSans3 ? "puesta" : "SIN PONER"} ` +
        `(${asiento.fuentes.estado}), quieta tras ${asiento.marcos} marcos y ${px(asiento.movio)} px` +
        (estorbo.empuje > 0
          ? ` · la página se movió ${px(despues.contenedorEnElViewport - antes.contenedorEnElViewport)} px en ` +
            "el viewport y la medida no"
          : "") +
        (estorbo.maqueta > 0 ? ` · ${descartes} intento(s) descartados por la maqueta` : ""),
    );
    return { tabla: nombreDeTabla, delta, cabecera: despues.cabecera.relativa, subida };
  }
  return null;
}

for (const pantalla of PANTALLAS) {
  const pasadas = [];
  for (const estorbo of ESTORBOS) {
    pasadas.push({ estorbo, medida: await medir(pantalla.hash, pantalla.nombre, estorbo) });
  }
  // Las tres pasadas tienen que dar lo mismo. Es lo que convierte «la medida no depende de dónde
  // esté la página» en una afirmación medida y no en una intención.
  if (pasadas.every((p) => p.medida !== null)) {
    const limpia = pasadas[0].medida;
    const discrepan = pasadas
      .slice(1)
      .filter(
        (p) =>
          !casi(limpia.delta, p.medida.delta) ||
          !casi(limpia.cabecera, p.medida.cabecera) ||
          !casi(limpia.subida, p.medida.subida),
      );
    if (discrepan.length) {
      fallos.push(
        `${pantalla.hash}: las pasadas NO coinciden, o sea que la medida depende de lo que le pase ` +
          `alrededor — sin estorbos delta ${limpia.delta}, cabecera ${px(limpia.cabecera)}, subida ` +
          `${px(limpia.subida)}; ` +
          discrepan
            .map(
              (p) =>
                `con «${p.estorbo.nombre}» delta ${p.medida.delta}, cabecera ` +
                `${px(p.medida.cabecera)}, subida ${px(p.medida.subida)}`,
            )
            .join("; "),
      );
    } else {
      console.log(
        `${pantalla.hash}: las ${pasadas.length} pasadas coinciden — delta ${limpia.delta}, cabecera a ` +
          `${px(limpia.cabecera)} px del borde, celda +${px(limpia.subida)} px`,
      );
    }
  }
}

await navegador.close();

if (consola.length) {
  console.log("la página se quejó mientras se medía:\n");
  for (const c of consola) console.log("  - " + c);
  process.exit(1);
}

if (!fallos.length) {
  console.log(
    "\nla cabecera de las dos tablas se queda pegada al borde de su contenedor al desplazar, y la " +
      "medida no cambia con la página movida",
  );
  process.exit(0);
}
console.log(`\n${fallos.length} problemas:\n`);
for (const f of fallos) console.log("  - " + f);
process.exit(1);
