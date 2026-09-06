// @vitest-environment happy-dom
//
// **La envoltura de las cuatro pantallas**: los cortes responsive, lo que no se imprime y los
// nombres accesibles. Lo que un emulador de DOM puede afirmar de todo eso, y ni un paso mas.
//
// POR QUE happy-dom Y NO EL jsdom DEL RESTO DE LA SUITE
// Por lo mismo que `barra.test.tsx` desde #6, medido alli: **jsdom no evalua `@media (max-width:
// …)`** —a 700 px sigue devolviendo `block` para un `[data-sm-hide]`—, asi que un archivo de
// cortes responsive escrito en jsdom saldria verde sin haber comprobado un solo corte. happy-dom
// si los evalua, y ademas resuelve `var()`, que es la otra mitad de la excepcion.
//
// Y EL ORDEN DE CADA MEDIDA IMPORTA
// El entorno memoriza el estilo calculado de cada elemento la primera vez que se le pide, y
// `setViewport` **no** invalida esa memoria (#6). Por eso cada caso fija el ancho **antes** de
// dibujar y dibuja de cero.
//
// LO QUE ESTO NO PRUEBA, Y DONDE SE PRUEBA
// Nada de esto es *disposicion*: happy-dom no coloca nada, asi que aqui «la lista mide 320 px»
// es una declaracion leida y no un ancho medido, «el arbol empuja» no se puede ni plantear, y el
// medio `print` **no se puede emular** —las reglas de `@media print` podrian estar enteras y no
// aplicarse a nada—. Eso lo mide `verificaciones/mirar.mjs` contra Chromium, que es donde el A4
// tiene tamaño y el `Tab` mueve el foco de verdad. Lo de aqui es lo que corre en cada
// `yarn verificar`.
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App";
import "../src/ds/global.css";

declare global {
  interface Window {
    readonly happyDOM: { setViewport(opciones: { width: number; height?: number }): void };
  }
}

/** Fija el ancho de la ventana. Siempre ANTES de dibujar: ver la nota de la cabecera. */
const ancho = (px: number) => window.happyDOM.setViewport({ width: px, height: 900 });

beforeEach(() => {
  // El hash es global del documento y tres archivos mas montan `App`: sin esto, el orden de los
  // archivos decidiria en que seccion arranca cada caso.
  window.location.hash = "";
  ancho(1440);
});
afterEach(() => {
  window.location.hash = "";
});

/** Dibuja la aplicacion en `#recibos`, que es la seccion que tiene lista y ficha. */
function enRecibos() {
  window.location.hash = "#recibos";
  return render(<App />);
}

// ══════════════════════════════════════════════════════════════════════════
describe("los cortes del artboard (lineas 33-38), a cada lado de su frontera", () => {
  /** Dibuja `#recibos` a un ancho y devuelve el calculado de la lista y del split. */
  function medir(px: number) {
    ancho(px);
    enRecibos();
    const lista = document.querySelector("[data-lista]") as HTMLElement;
    const split = document.querySelector("[data-split]") as HTMLElement;
    return { lista: getComputedStyle(lista), split: getComputedStyle(split) };
  }

  it("a 1440 px la lista mide 376 px y la ficha va al lado", () => {
    const { lista, split } = medir(1440);
    expect(lista.flexBasis).toBe("376px");
    expect(lista.width).toBe("376px");
    expect(split.flexDirection).not.toBe("column");
  });

  it("a 1000 px la lista mide 320 px", () => {
    const { lista } = medir(1000);
    expect(lista.flexBasis).toBe("320px");
    expect(lista.width).toBe("320px");
  });

  // Las dos que fijan DONDE esta el corte. Sin ellas, un `320px` clavado en el estilo en linea
  // pasaria el caso de arriba, y un `376px` clavado pasaria el de abajo.
  it("a 1240 px justos ya mide 320: el corte es `max-width`, o sea inclusivo", () => {
    expect(medir(1240).lista.flexBasis).toBe("320px");
  });

  it("y a 1241 px todavia mide 376", () => {
    expect(medir(1241).lista.flexBasis).toBe("376px");
  });

  it("a 880 px se apilan: la lista ocupa el ancho entero y se acota a 300 px", () => {
    const { lista, split } = medir(880);
    expect(split.flexDirection).toBe("column");
    expect(lista.width).toBe("100%");
    expect(lista.flexBasis).toBe("auto");
    expect(lista.maxHeight).toBe("300px");
  });

  it("a 900 px justos tambien: el corte es inclusivo", () => {
    expect(medir(900).split.flexDirection).toBe("column");
  });

  it("y a 901 px siguen lado a lado y sin tope de alto", () => {
    const { lista, split } = medir(901);
    expect(split.flexDirection).not.toBe("column");
    expect(lista.maxHeight).not.toBe("300px");
  });

  it("al apilarse, el filete que separaba las dos columnas pasa de la derecha a abajo", () => {
    // Es la mitad de la linea 35 que el ancho no dice: sin ella, la lista apilada seguiria con
    // un borde a la derecha que ya no separa nada.
    const { lista } = medir(880);
    expect(lista.borderRightWidth).toBe("0px");
    expect(lista.borderBottomColor).toBe("#D6DEE4");
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe("bajo 760 px se retira lo que el artboard retira", () => {
  function marcados(px: number) {
    ancho(px);
    enRecibos();
    return [...document.querySelectorAll("[data-sm-hide]")].map(
      (e) => getComputedStyle(e as HTMLElement).display,
    );
  }

  it("a 740 px no se ve ninguno, y hay varios que ver", () => {
    const vistos = marcados(740);
    // El recuento es la guarda: con cero elementos marcados, «ninguno se ve» seria cierto por
    // vacio. `#recibos` trae cuatro — los tres de la barra global y el subtitulo del titulo.
    expect(vistos.length).toBeGreaterThanOrEqual(4);
    expect(vistos.filter((d) => d !== "none")).toHaveLength(0);
  });

  it("y a 900 px se ven todos: es la mitad que separa el corte de un `display:none` fijo", () => {
    expect(marcados(900).filter((d) => d === "none")).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe("el cromo lleva su marca y la regla de impresion la alcanza", () => {
  /**
   * Los selectores que `@media print` esconde, sacados del CSSOM y no de una copia escrita aqui.
   *
   * Se lee la hoja de verdad —Vite la resuelve con `css: true`, o sea la misma cadena de
   * `@import` que se despliega— y se buscan las reglas cuyo `display` es `none`. Preguntar
   * despues `element.matches(selector)` es mas fuerte que comparar cadenas: se pone rojo si se
   * borra el bloque, si se borra la regla **y** si un elemento pierde su marca.
   */
  function selectoresQueEsconden(): string[] {
    const fuera: string[] = [];
    for (const hoja of [...document.styleSheets]) {
      for (const regla of [...hoja.cssRules]) {
        const condicion = (regla as CSSMediaRule).conditionText;
        if (condicion === undefined || !condicion.includes("print")) continue;
        for (const dentro of [...(regla as CSSMediaRule).cssRules]) {
          const estilo = (dentro as CSSStyleRule).style;
          if (estilo?.getPropertyValue("display") === "none") {
            fuera.push((dentro as CSSStyleRule).selectorText);
          }
        }
      }
    }
    return fuera;
  }

  /** Los mismos, como un solo selector. `:not(*)` cuando no hay ninguno: sin ese respaldo,
   *  borrar el bloque entero hace reventar a `matches()` con «The provided selector is empty» en
   *  vez de decir cual es la pieza que se imprimiria — medido al borrarlo. */
  const unSoloSelector = () => selectoresQueEsconden().join(", ") || ":not(*)";

  /** Dibuja `#recibos` con un recibo elegido: es donde estan las cuatro piezas a la vez. */
  function conFicha() {
    window.location.hash = "#recibos";
    render(<App />);
    // `fireEvent` y no `.click()` a secas: un `click` sobre el nodo dispara el manejador pero
    // React no redibuja fuera de `act()`, asi que la ficha no llega a existir y la pieza de
    // cromo «acciones» no aparece. Salio rojo asi escrito, con su aviso de React delante.
    fireEvent.click(document.querySelector("[data-lista] button[aria-current]") as HTMLElement);
  }

  it("hay un `@media print` que esconde algo", () => {
    // Sin esto, el `every` de abajo sobre una lista vacia seria verde por vacio.
    expect(selectoresQueEsconden().length).toBeGreaterThan(0);
  });

  it("las cuatro piezas del marco quedan fuera del papel", () => {
    conFicha();
    const selectores = unSoloSelector();
    for (const pieza of ["barra", "arbol", "pestanas", "acciones"]) {
      const elemento = document.querySelector(`[data-cromo="${pieza}"]`);
      expect(elemento, `no hay ninguna pieza de cromo «${pieza}» dibujada`).not.toBeNull();
      expect(
        (elemento as HTMLElement).matches(selectores),
        `la pieza «${pieza}» no casa con ninguna regla de \`@media print\``,
      ).toBe(true);
    }
  });

  it("y el contenido NO: esconderlo todo tambien escondería el cromo", () => {
    conFicha();
    const selectores = unSoloSelector();
    const contenido = document.querySelector("[data-seccion]") as HTMLElement;
    expect(contenido.matches(selectores)).toBe(false);
    // Y la fila del titulo tampoco: es lo que dice QUE se esta imprimiendo.
    expect((screen.getByRole("heading", { level: 1 }) as HTMLElement).matches(selectores)).toBe(false);
  });

  it("`data-cromo` nombra exactamente las cuatro piezas, sin repetirse", () => {
    conFicha();
    const marcas = [...document.querySelectorAll("[data-cromo]")].map((e) =>
      (e as HTMLElement).dataset.cromo,
    );
    expect([...marcas].sort()).toEqual(["acciones", "arbol", "barra", "pestanas"]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe("el anillo de foco llega a todo, incluidos los campos", () => {
  /** La regla `:focus-visible` de `global.css`, sacada del CSSOM. */
  function reglaDelAnillo(): CSSStyleRule {
    for (const hoja of [...document.styleSheets]) {
      for (const regla of [...hoja.cssRules]) {
        if ((regla as CSSStyleRule).selectorText === ":focus-visible") return regla as CSSStyleRule;
      }
    }
    throw new Error("no hay ninguna regla `:focus-visible` en `global.css`");
  }

  it("es el acento, y va `!important`", () => {
    // El `!important` es lo que hace que llegue: sin el, el `outline: none` de `input:focus`
    // —(0,1,1) contra (0,1,0)— y los tres `outline:none` **en linea** del artboard (lineas 80,
    // 212 y 549) lo apagan. Medido en Chromium con `mirar.mjs`, que es quien lo ve dibujado.
    const regla = reglaDelAnillo();
    expect(regla.style.getPropertyValue("outline-color")).toBe("var(--acento)");
    expect(regla.style.getPropertyPriority("outline-color")).toBe("important");
  });

  it("y hay campos con `outline:none` en linea, que es contra lo que hace falta", () => {
    enRecibos();
    const enLinea = [...document.querySelectorAll("input, select, textarea")].filter((e) =>
      (e as HTMLElement).style.outline === "none" || (e as HTMLElement).style.outlineStyle === "none",
    );
    expect(enLinea.length).toBeGreaterThan(0);
  });

  it("SONDA: happy-dom todavia no sabe expandir `outline: … var(--token)`", () => {
    // Guarda el `var()` en las tres propiedades largas y tira el `2px solid`, igual que hace con
    // `border` (#7, #8, #12 y #14). Por eso el grosor y el estilo del anillo se miden en
    // Chromium y no aqui. El dia que lo arregle, esta prueba sale roja y sobra.
    const regla = reglaDelAnillo();
    expect(regla.style.getPropertyValue("outline-width")).toBe("var(--acento)");
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe("nada de lo que se dibuja se queda sin nombre", () => {
  /** Dibuja la aplicacion **con todo abierto**: las capas flotantes y la ficha de un recibo. */
  function conTodoAbierto() {
    window.location.hash = "#recibos";
    render(<App />);
    fireEvent.click(document.querySelector("[data-lista] button[aria-current]") as HTMLElement);
    // La sesion ANTES que el lanzador, y no al reves: `abrirSesion` apaga el lanzador (linea
    // 1685) y `abrirLanzador` solo apaga la paleta (1759) — la asimetria del artboard que #9
    // porto y fijo. En el otro orden se queda uno solo abierto y este escaner mira menos.
    fireEvent.click(screen.getByRole("button", { name: /^Sesión de/ }));
    fireEvent.click(screen.getByRole("button", { name: "Ver todos los módulos" }));
  }

  /**
   * El nombre accesible, por las fuentes que de verdad valen.
   *
   * **El `placeholder` no cuenta**, y es la decision que hace util a esta prueba: es un nombre de
   * ultimo recurso y **se va en cuanto se escribe**, asi que quien vuelva a preguntar por el
   * campo con algo tecleado dentro se encuentra un cuadro sin nombre.
   *
   * Y una fuente vacia no es una fuente: un `title=""` —que es lo que React deja cuando el
   * atributo se compone y sale en blanco— hacia que el `??` se quedara con la cadena vacia y
   * declarara mudo un boton que dice «Continuar». Salio rojo asi escrito, con ese boton dentro.
   */
  const nombreDe = (e: Element) => {
    const deOtro = e.getAttribute("aria-labelledby");
    const candidatos = [
      e.getAttribute("aria-label"),
      deOtro === null ? null : document.getElementById(deOtro)?.textContent,
      e.getAttribute("title"),
      (e as HTMLElement).textContent,
      // Un control envuelto en su `<label>` toma el texto de la etiqueta, que es como estan
      // escritos los nueve campos de la ficha (`CampoDeFicha`).
      e.closest("label")?.textContent,
    ];
    return (candidatos.find((x) => (x ?? "").trim() !== "") ?? "").trim();
  };

  it("toda imagen lleva `alt`, y hay alguna imagen", () => {
    conTodoAbierto();
    const imagenes = [...document.querySelectorAll("img")];
    expect(imagenes.length).toBeGreaterThan(0);
    expect(imagenes.filter((i) => (i.getAttribute("alt") ?? "").trim() === "")).toEqual([]);
  });

  it("todo boton tiene nombre, tambien los que solo llevan icono", () => {
    conTodoAbierto();
    const botones = [...document.querySelectorAll("button")];
    expect(botones.length).toBeGreaterThan(20);
    const mudos = botones.filter((b) => nombreDe(b) === "").map((b) => b.outerHTML.slice(0, 110));
    expect(mudos).toEqual([]);
  });

  it("todo campo tiene nombre, y no se lo presta el `placeholder`", () => {
    conTodoAbierto();
    const campos = [...document.querySelectorAll("input, select, textarea")];
    expect(campos.length).toBeGreaterThan(0);
    const mudos = campos
      .filter((c) => nombreDe(c) === "")
      .map((c) => `${c.tagName.toLowerCase()} placeholder=«${c.getAttribute("placeholder") ?? ""}»`);
    expect(mudos).toEqual([]);
  });

  it("lo que se despliega tiene su rol y su nombre: dialogo y menu", () => {
    conTodoAbierto();
    const dialogos = [...document.querySelectorAll("[role=dialog]")];
    expect(dialogos.length).toBeGreaterThan(0);
    expect(dialogos.filter((d) => nombreDe(d) === "")).toEqual([]);
    const menu = document.querySelector("[role=menu]");
    expect(menu).not.toBeNull();
    expect((menu as HTMLElement).querySelectorAll("[role=menuitem]").length).toBeGreaterThan(0);
  });

  it("el dialogo que SI atrapa el foco se declara modal, y el que no, no", () => {
    // No todo `role="dialog"` es modal, y ponerselo a los tres seria peor que no ponerlo: le
    // dice al lector de pantalla que el resto de la pagina es inerte. El artboard lo escribe en
    // uno solo, el de cambios sin guardar (linea 866); el lanzador (51) no lo lleva.
    conTodoAbierto();
    const lanzador = document.querySelector("[data-lanzador]");
    expect(lanzador?.getAttribute("role")).toBe("dialog");
    expect(lanzador?.getAttribute("aria-modal")).toBeNull();
  });

  it("el aviso del sistema se anuncia solo: `role=status`", () => {
    window.location.hash = "";
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /aviso del sistema/ }));
    expect(document.querySelectorAll("[role=status]").length).toBeGreaterThan(0);
  });

  it("y el estado de cada control lo dice su `aria-*`", () => {
    conTodoAbierto();
    for (const atributo of ["aria-current", "aria-expanded", "aria-pressed", "aria-disabled"]) {
      expect(
        document.querySelectorAll(`[${atributo}]`).length,
        `nadie declara \`${atributo}\``,
      ).toBeGreaterThan(0);
    }
  });

  it("la paleta se anuncia como lista: `listbox`, `option` y `aria-selected`", () => {
    window.location.hash = "";
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    const lista = document.querySelector("[role=listbox]");
    expect(lista).not.toBeNull();
    const opciones = [...(lista as HTMLElement).querySelectorAll("[role=option]")];
    expect(opciones.length).toBeGreaterThan(0);
    expect(opciones.filter((o) => o.getAttribute("aria-selected") === null)).toEqual([]);
    expect(opciones.filter((o) => o.getAttribute("aria-selected") === "true")).toHaveLength(1);
  });
});
