/**
 * Lo que el ARTEFACTO declara, y lo que no inventa (#44).
 *
 *   node verificaciones/maqueta.mjs
 *
 * <h2>Por qué existe, y por qué no es la suite</h2>
 *
 * `maqueta.test.tsx` mide el código fuente y el DOM que React dibuja en cada `yarn verificar`, y
 * hace falta. Lo que **no** puede mirar es el `dist/`: `yarn verificar` no construye, y lo que se
 * despliega en un municipio no es `src/` sino el paquete que `vite build` emite y que la imagen
 * de nginx sirve. Es la misma razón por la que existe `prefijo.mjs` desde #37, y allí quedó
 * medido que las dos capas se separan de verdad — con `base` declarado y un literal todavía
 * escrito en el JSX, `dist/index.html` decía una cosa y el paquete otra—.
 *
 * Aquí se afirman las dos mitades de este issue que sólo se ven en el artefacto:
 *
 *   1. **La banda de AC-2 está** en lo que la imagen sirve. Sin esto, quitarla del componente
 *      dejaría la suite roja pero nadie diría qué llegó a producción.
 *   2. **La identidad inventada NO está.** Es la forma en que `rentas` cerró su I-1 (su #24),
 *      donde el `dist` llevaba «Cárdenas» tres veces y pasó a cero, y es la única medida que
 *      cubre las tres apariciones a la vez: la barra, el menú y el campo «Cajero» de los dos
 *      formularios, que además se imprime en el recibo.
 *   3. **Ningún toast del artefacto afirma una escritura** sin decir que no la hubo.
 *
 * <h2>Lo que este arnés NO puede decir, y quién lo dice</h2>
 *
 * Que la banda **se vea** —en las cuatro secciones y en el papel— es disposición y medio
 * `print`, y eso es `mirar.mjs` contra un Chromium de verdad. Aquí se mira texto: que la cadena
 * viaje en el paquete. Las dos hacen falta y ninguna cubre a la otra — una banda con
 * `display:none` pasaría ésta y caería allí; una banda que nunca llegó al `dist/` cae aquí.
 *
 * No necesita navegador ni servidor: sólo `yarn build` hecho antes.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const DIST = join(AQUI, "..", "dist");

const fallos = [];
const dicho = [];
const fallar = (t) => fallos.push(t);
const contar = (t) => dicho.push(t);

// ═══════════════════════════════════════════════════════════════════════════
// El artefacto: todo el texto que `vite build` emitió
// ═══════════════════════════════════════════════════════════════════════════
let paquetes = [];
try {
  paquetes = readdirSync(join(DIST, "assets")).filter((n) => n.endsWith(".js"));
} catch {
  console.log("no hay `dist/assets/`: construye primero con `yarn build`");
  process.exit(1);
}
if (paquetes.length === 0) {
  console.log("`dist/assets/` no tiene ni un `.js`: no hay artefacto que medir");
  process.exit(1);
}
const codigo = paquetes.map((n) => readFileSync(join(DIST, "assets", n), "utf8")).join("\n");
const indice = readFileSync(join(DIST, "index.html"), "utf8");
const todo = indice + "\n" + codigo;

/**
 * La guarda de que este arnés no está ciego, y va la PRIMERA.
 *
 * Todo lo de abajo son búsquedas de texto sobre `todo`. Un `dist/` de otra aplicación, un
 * paquete vacío o una ruta que se quede vieja darían **cero apariciones de todo**, y entonces
 * «no está el nombre inventado» saldría verde sin significar nada — que es el modo de fallo que
 * `cero-red.mjs` se puso a sí mismo en #15 y `prefijo.mjs` en #37. Se ancla a una cadena que
 * tiene que estar sí o sí y que no es ninguna de las que se miden.
 */
{
  const ancla = "Panel de Tesorería";
  if (!todo.includes(ancla)) {
    console.log(
      `el \`dist/\` no contiene «${ancla}»: o no es el paquete de esta aplicación, o no se ` +
        "construyó. Este arnés estaría CIEGO y sus ceros no significarían nada.",
    );
    process.exit(1);
  }
  contar(`\`dist/\`: ${paquetes.join(", ")} + index.html, ${todo.length} caracteres leídos`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. AC-2 · la banda viaja en el paquete
// ═══════════════════════════════════════════════════════════════════════════
for (const [que, cadena] of [
  ["el rótulo de la banda", "Maqueta sin conexión"],
  ["el cuerpo de la banda", "Los datos son de diseño"],
  ["que aquí no se registra nada", "nada de lo que se haga aquí se registra"],
  ["la marca por la que la impresión la conserva", "data-banda-de-maqueta"],
]) {
  if (todo.includes(cadena)) contar(`${que}: «${cadena}» está en el artefacto`);
  else fallar(`${que} NO está en el \`dist/\`: se esperaba «${cadena}»`);
}

// La regla de impresión viaja en la hoja, no en el paquete: es CSS.
{
  const hojas = readdirSync(join(DIST, "assets")).filter((n) => n.endsWith(".css"));
  const css = hojas.map((n) => readFileSync(join(DIST, "assets", n), "utf8")).join("\n");
  if (!/@media print\{[^}]*\}*[\s\S]*?\[data-banda-de-maqueta\]/.test(css)) {
    fallar(
      "la hoja del `dist/` no fija `[data-banda-de-maqueta]` dentro de `@media print`: la banda " +
        "se iría del papel, que es donde más falta hace",
    );
  } else {
    contar(`la hoja (${hojas.join(", ")}) conserva la banda en \`@media print\``);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. AC-4 · la identidad inventada no viaja
// ═══════════════════════════════════════════════════════════════════════════
// Se busca el APELLIDO y no la ficha entera: hasta #44 el mismo nombre salía escrito de tres
// formas distintas —«J. Cárdenas Vega» en la barra y en el menú, «Cárdenas Vega, José» en el
// campo «Cajero» de los dos formularios—, y buscar una sola de las tres dejaría las otras dos
// dentro del paquete. Es la medida con la que `rentas` cerró su I-1.
{
  const apariciones = (todo.match(/Cárdenas/g) ?? []).length;
  if (apariciones > 0) {
    fallar(
      `el paquete nombra a «Cárdenas» ${apariciones} veces: es la persona que el artboard dibuja ` +
        "en la ventanilla, y esta interfaz no autentica a nadie — una identidad afirmada sin " +
        "respaldo. O sale del token, o dice que no hay sesión (#44, AC-4)",
    );
  } else {
    contar("«Cárdenas»: 0 apariciones en el artefacto (I-1 de `rentas`, aplicado aquí)");
  }
  // Y la mitad que hace falta al lado: lo que SÍ tiene que decir la ficha de sesión. Sin ella,
  // un paquete al que le hubieran borrado la barra entera pasaría la línea de arriba.
  for (const cadena of ["Sin sesión", "Nadie se ha identificado"]) {
    if (todo.includes(cadena)) contar(`la ficha de sesión dice «${cadena}»`);
    else fallar(`la ficha de sesión no dice «${cadena}»: ¿de dónde sale entonces el nombre?`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. AC-3 · ningún toast del artefacto afirma una escritura
// ═══════════════════════════════════════════════════════════════════════════
// Las frases de hoy, literales. No es la regla de `maqueta.test.tsx` —aquí no hay DOM
// que recorrer, sólo texto minificado— sino su complemento: que ninguna de las tres se haya
// quedado en lo que se despliega.
for (const frase of [
  "La cuota ya está descontada de la cuenta corriente",
  "Cambios guardados",
  "emitido.",
  // La quinta, la que nadie vio leyendo: la encontró medir la cobertura del recorrido de
  // `maqueta.test.tsx`, que no llegaba hasta ella. Un borrador no se guarda en ninguna parte.
  "Guardado en el borrador",
]) {
  if (todo.includes(frase)) {
    fallar(`el artefacto todavía dice «${frase}»: es una escritura que nunca ocurre (#44, AC-3)`);
  } else {
    contar(`«${frase}»: fuera del artefacto`);
  }
}
// Y su mitad: el motivo SÍ está, tantas veces como acciones lo llevan. Sin esto, un paquete que
// hubiera perdido los cinco toast pasaría las tres líneas de arriba.
{
  const motivo = "esta interfaz no está conectada a ningún sistema";
  if (!todo.includes(motivo)) {
    fallar(
      `el artefacto no dice «${motivo}» ni una vez: las cinco acciones que escribirían de ` +
        "verdad han dejado de decir que no escriben nada",
    );
  } else {
    contar(`el motivo «${motivo}» viaja en el artefacto`);
  }
}

console.log("lo que el artefacto declara, y lo que no inventa\n");
for (const d of dicho) console.log("  · " + d);

if (!fallos.length) {
  console.log(
    "\nel `dist/` se declara maqueta, no nombra a nadie y no afirma ninguna escritura que no ocurre",
  );
  process.exit(0);
}
console.log(`\n${fallos.length} problemas:\n`);
for (const f of fallos) console.log("  - " + f);
process.exit(1);
