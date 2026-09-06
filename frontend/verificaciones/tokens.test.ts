// Corre en el `jsdom` de siempre, que es el entorno de toda la suite.
//
// **Una version anterior de este archivo cambiaba a happy-dom afirmando que «el
// `getComputedStyle` de jsdom ignora toda regla con pseudo-clase». Eso era FALSO**, y la
// revision del PR #20 lo midio: jsdom aplica `:focus` y devuelve el `box-shadow`. Lo que
// habia enganado esta explicado en `campoEnfocado()`, y es la razon de que ese helper exista.
//
// Lo unico que jsdom NO hace es sustituir `var(--x)` en una propiedad calculada: devuelve el
// texto `var(--anillo-campo)` en vez del color. Eso lo cubre `resolverVar()` en cuatro lineas
// y no justifica una dependencia mas.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { INSIGNIAS } from "../src/ds/tokens";
// Lo importa Vite con `css: true`, o sea resolviendo la cadena real de `@import`: lo que esta
// prueba mide es el mismo CSS que se despliega, no una copia escrita aqui al lado.
import "../src/ds/global.css";

const DS = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "ds");
const leer = (ruta: string) => readFileSync(join(DS, ruta), "utf8");

/**
 * El CSS sin sus comentarios.
 *
 * Hace falta porque los comentarios de estos archivos nombran a proposito lo que NO se porto
 * —la paleta del handoff, el corte de 1180 px del conmutador— para dejar dicho por que no
 * esta. Una prueba que buscara esos textos sobre el archivo crudo saldria roja por la
 * explicacion de su propia ausencia, que es justo lo contrario de lo que quiere medir.
 */
const quitarComentarios = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * Los tokens de `TesoreriaV6.dc.html`, transcritos a mano desde el artboard.
 *
 * Esta lista NO se genera del CSS: generandola, el CSS se compararia consigo mismo y la prueba
 * seguiria verde con todos los valores cambiados. Es una segunda transcripcion independiente
 * del diseno, y esa es toda su utilidad.
 */
const COLORES: [string, string][] = [
  // Constantes de las lineas 914-924.
  ["--azul", "#005284"],
  ["--azul-osc", "#00365A"],
  ["--azul-suave", "#E4F4FD"],
  ["--acento", "#52BDEF"],
  ["--linea", "#D6DEE4"],
  ["--linea-2", "#E3E9EE"],
  ["--borde-campo", "#C3CFD9"],
  ["--tinta", "#16232C"],
  ["--tinta-2", "#3A4A55"],
  ["--tinta-3", "#5A6B78"],
  ["--sup", "#F7FBFE"],
  // Del bloque <style>, lineas 19, 25, 26, 28 y 29.
  ["--fondo", "#F2F6F9"],
  ["--tenue", "#93A3AF"],
  ["--pulgar", "#C3CFD9"],
  ["--pulgar-hover", "#A7B7C4"],
  ["--anillo-campo", "#D3EBFA"],
  // Insignias, lineas 935-940.
  ["--ins-ok-fondo", "#DCEFE3"],
  ["--ins-ok-tinta", "#1F5B39"],
  ["--ins-warn-fondo", "#FFF4D9"],
  ["--ins-warn-tinta", "#7A5200"],
  ["--ins-bad-fondo", "#FBE4E0"],
  ["--ins-bad-tinta", "#8F2A17"],
  ["--ins-info-fondo", "#E4F4FD"],
  ["--ins-info-tinta", "#004670"],
];

/** Tipografia (linea 19) y las formas censadas sobre el artboard. */
const OTROS: [string, string][] = [
  ["--familia", "'Source Sans 3', system-ui, sans-serif"],
  ["--texto-base", "15px"],
  ["--peso-normal", "400"],
  ["--peso-medio", "600"],
  ["--peso-fuerte", "700"],

  ["--radio-4", "4px"],
  ["--radio-5", "5px"],
  ["--radio-6", "6px"],
  ["--radio-7", "7px"],
  ["--radio-8", "8px"],
  ["--radio-10", "10px"],
  ["--radio-pastilla", "999px"],
  ["--radio-circulo", "50%"],

  ["--sombra-lanzador", "0 18px 48px rgba(0,54,90,.2)"],
  ["--sombra-menu", "0 16px 42px rgba(0,54,90,.22)"],
  ["--sombra-cajon", "0 22px 56px rgba(0,54,90,.26)"],
  ["--sombra-modal", "0 22px 56px rgba(0,54,90,.28)"],
  ["--sombra-aviso", "0 10px 30px rgba(0,54,90,.28)"],
];

/** El valor con el que la pagina se dibuja de verdad, no el texto del archivo. */
const tokenDeLaRaiz = (nombre: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();

/**
 * Sustituye `var(--x)` por el valor del token, que es lo unico que jsdom no hace solo.
 *
 * Medido: con `box-shadow: 0 0 0 3px var(--anillo-campo)`, el estilo calculado de un campo
 * enfocado es la cadena `"0 0 0 3px var(--anillo-campo)"`. La regla SI aplica —sin foco es
 * ""—; lo que falta es la sustitucion. Se hace aqui para poder comparar contra el valor
 * literal del artboard sin sacar el token de `global.css`, que es donde debe estar.
 */
const resolverVar = (valor: string) =>
  valor.replace(/var\((--[\w-]+)\)/g, (_, nombre: string) => tokenDeLaRaiz(nombre));

describe("los tokens valen lo que dice el artboard, caracter a caracter", () => {
  it.each([...COLORES, ...OTROS])("%s", (nombre, esperado) => {
    expect(tokenDeLaRaiz(nombre)).toBe(esperado);
  });
});

describe("no hay ningun color fuera de la lista", () => {
  it("cada hexadecimal de `tokens/` esta declarado en el artboard", () => {
    // Sin esto, la prueba de arriba deja pasar un color NUEVO: solo mira los que ya conoce.
    const texto = ["tokens/colores.css", "tokens/tipografia.css", "tokens/formas.css"]
      .map(leer)
      .join("\n");
    const declarados = [...texto.matchAll(/^\s*--[\w-]+:\s*([^;]+);/gm)]
      .flatMap(([, valor]) => [...(valor ?? "").matchAll(/#[0-9A-Fa-f]{3,8}/g)])
      .map(([hex]) => hex);
    const permitidos = COLORES.map(([, hex]) => hex);
    expect([...new Set(declarados)].sort()).toEqual([...new Set(permitidos)].sort());
  });
});

describe("las dos coincidencias de valor son deliberadas", () => {
  // El artboard escribe `background:' + AZUL_SUAVE` en la insignia `info`, y el mismo
  // #C3CFD9 en el borde del campo y en el pulgar de la barra. Afirmarlo aqui convierte
  // separarlos algun dia en una decision con una prueba roja delante, no en un descuido.
  it("la insignia `info` se rellena con --azul-suave", () => {
    expect(tokenDeLaRaiz("--ins-info-fondo")).toBe(tokenDeLaRaiz("--azul-suave"));
  });

  it("el pulgar de la barra vale lo que el borde de un campo", () => {
    expect(tokenDeLaRaiz("--pulgar")).toBe(tokenDeLaRaiz("--borde-campo"));
  });

  it("el anillo del campo NO es --azul-suave", () => {
    // La trampa del material: #D3EBFA y #E4F4FD se parecen y son dos valores distintos.
    expect(tokenDeLaRaiz("--anillo-campo")).toBe("#D3EBFA");
    expect(tokenDeLaRaiz("--anillo-campo")).not.toBe(tokenDeLaRaiz("--azul-suave"));
  });
});

describe("la regla de foco de los campos se ve", () => {
  /**
   * Un campo recien creado, enfocado ANTES de leerle el estilo.
   *
   * El orden importa, y es la trampa que hizo falsa la primera version de este archivo:
   * **el entorno memoriza el estilo calculado de cada elemento** la primera vez que se le
   * pide, y `focus()` no invalida esa memoria. Medido dentro de un solo documento jsdom: a un
   * campo leido antes de enfocarlo le sigue saliendo "" despues de enfocarlo, y despues de
   * volver a enfocarlo; otro campo del mismo documento, enfocado sin lectura previa, si
   * devuelve el anillo.
   *
   * Una prueba escrita en el orden natural —leer, enfocar, releer— concluye que la regla no
   * existe teniendola delante. Fue exactamente lo que paso, y de ahi salio la afirmacion
   * falsa de que jsdom no aplicaba pseudo-clases.
   */
  const campoEnfocado = () => {
    const campo = document.createElement("input");
    document.body.appendChild(campo);
    campo.focus();
    return campo;
  };

  it("un input enfocado recibe el anillo `0 0 0 3px #D3EBFA`", () => {
    const estilo = getComputedStyle(campoEnfocado());
    expect(resolverVar(estilo.boxShadow)).toBe("0 0 0 3px #D3EBFA");
  });

  it("y ademas tine el borde de azul y se quita el `outline` del navegador", () => {
    const estilo = getComputedStyle(campoEnfocado());
    expect(resolverVar(estilo.borderColor)).toBe("#005284");
    expect(estilo.outline).toBe("none");
  });

  it("un input SIN foco no lo recibe", () => {
    // Es la mitad que hace falta: sin ella, un `box-shadow` puesto a todos los campos
    // —enfocados o no— pasaria la prueba de arriba.
    const suelto = document.createElement("input");
    document.body.appendChild(suelto);
    expect(getComputedStyle(suelto).boxShadow).toBe("");
  });

  /**
   * Las dos mitades de lo que jsdom hace, medidas y no supuestas.
   *
   * La version anterior de este archivo tenia aqui una prueba que miraba `navigator.userAgent`
   * y comprobaba que dijera «HappyDOM». Eso **no podia fallar por el motivo que decia
   * comprobar**: era un comentario disfrazado de verificacion, y sostenia ademas una
   * afirmacion falsa sobre jsdom.
   *
   * Esta si mide, y es la que justifica que `resolverVar` exista: jsdom **si** aplica la
   * pseudo-clase, y **no** sustituye `var()`. El dia que sustituya, la segunda mitad se pone
   * roja sola y el ayudante se puede borrar.
   */
  it("jsdom aplica `:focus` y no sustituye `var()`, que es por lo que existe `resolverVar`", () => {
    const hoja = document.createElement("style");
    hoja.textContent = ".anillo-literal:focus { box-shadow: 0 0 0 3px #D3EBFA }";
    document.head.appendChild(hoja);

    const conLiteral = document.createElement("input");
    conLiteral.className = "anillo-literal";
    document.body.appendChild(conLiteral);
    conLiteral.focus();

    // 1. La pseudo-clase SE aplica. Esto es lo que la primera version negaba por escrito.
    expect(getComputedStyle(conLiteral).boxShadow).toBe("0 0 0 3px #D3EBFA");

    // 2. Y el token llega sin resolver, que es la unica diferencia real que se midio.
    expect(getComputedStyle(campoEnfocado()).boxShadow).toBe("0 0 0 3px var(--anillo-campo)");
  });
});

describe("las tres animaciones y su anulacion", () => {
  const global = leer("global.css");
  const sinComentarios = quitarComentarios(global);

  it.each([
    ["fadeIn", "@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }"],
    [
      "pop",
      "@keyframes pop { from { opacity: 0; transform: translateY(-6px) scale(.985) } to { opacity: 1; transform: none } }",
    ],
    [
      "subir",
      "@keyframes subir { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }",
    ],
  ])("`%s` esta definida igual que en el artboard", (_nombre, regla) => {
    expect(global).toContain(regla);
  });

  it("quien pide menos movimiento no recibe ninguno", () => {
    expect(global).toContain(
      "@media (prefers-reduced-motion: reduce) { * { animation-duration: .01ms !important } }",
    );
  });

  it("el conmutador de panel A/B/C y su corte de 1180px no se portaron", () => {
    // El artboard lo llama «un control del prototipo». Que no este es parte del encargo,
    // asi que se afirma en vez de confiar en que nadie lo copie mas adelante.
    //
    // Se miran las REGLAS y no el archivo entero: la cabecera de `global.css` explica por
    // que ese corte no esta, y nombrarlo para explicarlo no es portarlo.
    expect(sinComentarios).not.toContain("1180px");
    expect(sinComentarios).not.toContain("data-marco-hide");
  });
});

describe("las cuatro insignias", () => {
  it("son exactamente ok, warn, bad e info", () => {
    expect(Object.keys(INSIGNIAS).sort()).toEqual(["bad", "info", "ok", "warn"]);
  });

  it.each([
    ["ok", "#DCEFE3", "#1F5B39"],
    ["warn", "#FFF4D9", "#7A5200"],
    ["bad", "#FBE4E0", "#8F2A17"],
    ["info", "#E4F4FD", "#004670"],
  ] as const)("`%s` es %s sobre %s", (tono, fondo, tinta) => {
    expect(INSIGNIAS[tono]).toEqual({ fondo, tinta });
  });

  it.each(["ok", "warn", "bad", "info"] as const)(
    "`%s` vale en TypeScript lo mismo que en CSS",
    (tono) => {
      // Los ocho colores viven en dos sitios porque el tono se elige en tiempo de ejecucion.
      // Esto es lo que impide que los dos sitios deriven en silencio.
      expect(INSIGNIAS[tono].fondo).toBe(tokenDeLaRaiz(`--ins-${tono}-fondo`));
      expect(INSIGNIAS[tono].tinta).toBe(tokenDeLaRaiz(`--ins-${tono}-tinta`));
    },
  );
});

describe("no queda rastro de la paleta del handoff de diseno", () => {
  it("ni sus colores ni sus tres familias tipograficas", () => {
    // El criterio 2 del issue lo pide como un `grep -ri` sobre `frontend/src`. Tal como esta
    // escrito casa ademas con la palabra «interfaz» —que contiene «inter»—, asi que aqui se
    // comprueba sobre `src/ds/`, que es donde esa paleta viviria si se hubiera colado.
    const texto = quitarComentarios(
      ["global.css", "tokens/colores.css", "tokens/tipografia.css", "tokens/formas.css"]
        .map(leer)
        .join("\n"),
    );
    for (const rastro of ["f6f4ef", "1F3A5F", "Source Serif", "JetBrains", "Inter"]) {
      expect(texto.toLowerCase()).not.toContain(rastro.toLowerCase());
    }
  });
});
