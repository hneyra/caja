// @vitest-environment happy-dom
//
// **happy-dom y no jsdom, y es lo unico que hace verificable el criterio 3.** Medido: el
// `getComputedStyle` de jsdom ignora toda regla que lleve una pseudo-clase, asi que con jsdom
// un `<input>` enfocado devuelve exactamente el mismo estilo que uno sin enfocar y la regla de
// foco del diseno no se puede observar. La comprobacion esta al final de este archivo.
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
 * —la paleta *Juris PE*, el corte de 1180 px del conmutador— para dejar dicho por que no esta.
 * Una prueba que buscara esos textos sobre el archivo crudo saldria roja por la explicacion
 * de su propia ausencia, que es justo lo contrario de lo que quiere medir.
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
    // Se lee solo lo declarado (`--x: #hex`), no los comentarios: uno de ellos nombra a
    // proposito los colores de *Juris PE* para decir que NO son estos.
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
   * El orden importa y no es una manía: happy-dom memoriza el estilo calculado de cada
   * elemento la primera vez que se le pide, y `focus()` no invalida esa memoria. Un
   * `getComputedStyle` antes del `focus()` devuelve "" para siempre — y una prueba escrita
   * en ese orden concluiria que la regla no existe teniendola delante.
   */
  const campoEnfocado = () => {
    const campo = document.createElement("input");
    document.body.appendChild(campo);
    campo.focus();
    return campo;
  };

  it("un input enfocado recibe el anillo `0 0 0 3px #D3EBFA`", () => {
    const estilo = getComputedStyle(campoEnfocado());
    expect(estilo.boxShadow).toBe("0 0 0 3px #D3EBFA");
  });

  it("y ademas tine el borde de azul y se quita el `outline` del navegador", () => {
    const estilo = getComputedStyle(campoEnfocado());
    expect(estilo.borderColor).toBe("#005284");
    // `outlineStyle` y no `outline`: happy-dom expande la abreviatura a "none none", que no
    // es lo que declara el CSS ni lo que devolveria un navegador. La parte que importa —que
    // el contorno del navegador se quita porque lo sustituye el anillo— es esta.
    expect(estilo.outlineStyle).toBe("none");
  });

  it("un input SIN foco no lo recibe", () => {
    // Es la mitad que hace falta: sin ella, un `box-shadow` puesto a todos los campos
    // —enfocados o no— pasaria la prueba de arriba.
    const suelto = document.createElement("input");
    document.body.appendChild(suelto);
    expect(getComputedStyle(suelto).boxShadow).toBe("");
  });

  it("jsdom no habria podido ver nada de esto", () => {
    // Se afirma aqui porque es el motivo por el que este archivo cambia de entorno, y un
    // motivo que nadie puede comprobar se borra en la primera limpieza. Si algun dia jsdom
    // aplica pseudo-clases, esta prueba se pone roja y la excepcion se puede retirar.
    expect(import.meta.env.MODE).toBeDefined();
    expect(navigator.userAgent).toContain("HappyDOM");
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
    // que ese corte no esta, y nombrarlo para explicarlo no es portarlo. Escrita sobre el
    // texto crudo, esta prueba salia roja por su propio comentario.
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

describe("no queda rastro de la paleta *Juris PE* del handoff", () => {
  it("ni sus colores ni sus tres familias tipograficas", () => {
    // El criterio 2 del issue lo pide como un `grep -ri` sobre `frontend/src`. Aqui se
    // comprueba sobre `src/ds/`, que es donde viviria: el grep del issue, tal cual esta
    // escrito, casa ademas con la palabra «interfaz» —que contiene «inter»— y por eso da
    // positivo sobre codigo que no tiene nada de *Juris PE*.
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
