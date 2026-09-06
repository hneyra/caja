// @vitest-environment happy-dom
//
// `#tarifario` — «Tarifario y cierre», medida.
//
// POR QUE happy-dom Y NO EL jsdom DEL RESTO DE LA SUITE
// El criterio 6 nombra un color que sale de un token: la pestana activa lleva `border-bottom:
// 2px solid #005284`. En jsdom lo unico afirmable seria que la pantalla escribe `var(--azul)`,
// que es justo lo que la prueba NO quiere dar por bueno.
//
// LO QUE NO SE PUDO AFIRMAR AQUI, Y DONDE SE MIDIO
// El **grosor** y el **estilo** del filete: los `2px` y el `solid`. La primera version de este
// archivo los afirmaba dando por hecho que, al declarar la pestana `border: 0` y un solo
// `border-bottom`, happy-dom no tendria tres propiedades largas que fundir. **Es falso, y salio
// rojo**: «expected '' to be '2px'». Sondeado despues, lo que happy-dom guarda de
// `border: 0; border-bottom: 2px solid var(--azul)` es
// `border-width: 0px 0px var(--azul); border-bottom-style: var(--azul)` — o sea que el `var()`
// se cuela en el sitio del grosor y del estilo y los dos salen cadena vacia. Lo que si llega
// entero es `borderBottomColor`, que es el `#005284` que el criterio nombra. Los `2px` se
// midieron en un Chromium de verdad, y estan en el PR.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App";
import { SECCIONES, TARIFARIO } from "../src/datos";
import { CANDADO, SOLO_LECTURA } from "../src/pantallas/Tarifario";
import "../src/ds/global.css";

afterEach(cleanup);

/** El hash es global del documento y `App` lo escribe al montarse. Ver `marco.test.tsx`. */
beforeEach(() => window.history.replaceState(null, "", window.location.pathname));

const pantalla = () => document.querySelector("[data-seccion='valores']") as HTMLElement;
const pestanas = () =>
  [...pantalla().querySelectorAll("[data-pestana-de-tarifario]")] as HTMLElement[];
const rotulos = () => pestanas().map((p) => p.getAttribute("data-pestana-de-tarifario"));
const activas = () =>
  pestanas()
    .filter((p) => p.getAttribute("aria-current") === "true")
    .map((p) => p.getAttribute("data-pestana-de-tarifario"));
const pestana = (label: string) =>
  pantalla().querySelector(`[data-pestana-de-tarifario="${label}"]`) as HTMLElement;
const pildora = () => pantalla().querySelector("[data-solo-lectura]") as HTMLElement;
const notaDeCabecera = () =>
  pantalla().querySelector("[data-nota-de-cabecera]")?.textContent ?? "";
const notaDePie = () => pantalla().querySelector("[data-nota-de-pie]")?.textContent ?? "";
const tabla = () => pantalla().querySelector("[data-tabla='tarifario']") as HTMLElement;
const cabeceras = () => [...tabla().querySelectorAll("thead th")] as HTMLElement[];
const filas = () => [...tabla().querySelectorAll("tbody tr")] as HTMLElement[];
const celdasDe = (i: number) =>
  [...(filas()[i]?.querySelectorAll("td") ?? [])] as HTMLElement[];
const textosDe = (i: number) => celdasDe(i).map((c) => c.textContent);

/** Abre una seccion desde el arbol, que es una de las cuatro puertas del marco. */
const abrirSeccion = (clave: string) =>
  fireEvent.click(document.querySelector(`[data-submodulo="${clave}"]`) as HTMLElement);

/** Deja `#tarifario` a la vista sin pedir ninguna pestana. */
const abrirTarifario = () => {
  render(<App />);
  abrirSeccion("valores");
};

/** Abre la paleta y elige la accion que se llama `label`: la puerta con `valTab`, de #9. */
const elegirEnLaPaleta = (label: string) => {
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  const lista = screen.getByRole("listbox", { name: "Resultados" });
  const fila = within(lista)
    .getAllByRole("option")
    .find((o) => o.textContent?.includes(label));
  fireEvent.click(fila as HTMLElement);
};

describe("criterio 6 · tres pestanas, y la activa se ve activa", () => {
  /** Transcritas a mano, y no en un bucle sobre `TARIFARIO`: ver `cajas.test.tsx`. */
  it("son tres, con sus rotulos y en el orden del artboard", () => {
    abrirTarifario();
    expect(rotulos()).toEqual([
      "Tarifario del TUPA",
      "Medios de pago y conciliación",
      "Cierre y depósito",
    ]);
  });

  it("al entrar esta activa la primera, y es exactamente una", () => {
    abrirTarifario();
    expect(activas()).toEqual(["Tarifario del TUPA"]);
  });

  /**
   * El filete azul de 2 px y el peso 700 — **y la de al lado sin ninguno de los dos**. Las dos
   * mitades: pintarlas las tres pasaria la primera.
   */
  it("la activa lleva el filete en `#005284` y peso 700; las otras no", () => {
    abrirTarifario();
    const activa = getComputedStyle(pestana("Tarifario del TUPA"));
    expect(activa.borderBottomColor).toBe("#005284");
    expect(activa.fontWeight).toBe("700");
    expect(activa.color).toBe("#16232C");

    const apagada = getComputedStyle(pestana("Cierre y depósito"));
    expect(apagada.borderBottomColor).toBe("transparent");
    expect(apagada.fontWeight).toBe("400");
    expect(apagada.color).toBe("#5A6B78");
  });

  /**
   * SONDA DEL ENTORNO. Los `2px` y el `solid` **no se pueden medir aqui**, por lo que dice la
   * cabecera del archivo. Se afirma que no se pueden, para que el dia que happy-dom lo arregle
   * esta prueba salga roja y la excepcion sobre.
   */
  it("y su grosor no se puede medir en happy-dom, que es por lo que se midio en Chromium", () => {
    abrirTarifario();
    const activa = getComputedStyle(pestana("Tarifario del TUPA"));
    expect(activa.borderBottomWidth).toBe("");
    expect(activa.borderBottomStyle).toBe("");
  });

  it("pulsar otra la activa, y suelta la anterior", () => {
    abrirTarifario();
    fireEvent.click(pestana("Cierre y depósito"));
    expect(activas()).toEqual(["Cierre y depósito"]);
    expect(getComputedStyle(pestana("Cierre y depósito")).borderBottomColor).toBe("#005284");
    expect(getComputedStyle(pestana("Tarifario del TUPA")).borderBottomColor).toBe("transparent");
  });

  it("y cambia la tabla, no solo el filete", () => {
    abrirTarifario();
    expect(cabeceras().map((c) => c.textContent)).toEqual([
      "Código",
      "Concepto",
      "Unidad",
      "Tasa S/",
      "Clasificador",
    ]);
    fireEvent.click(pestana("Cierre y depósito"));
    expect(cabeceras().map((c) => c.textContent)).toEqual([
      "Paso",
      "Acto",
      "Responsable",
      "Plazo",
      "Si no se hace",
    ]);
  });
});

describe("criterio 7 · la pildora «Solo lectura» esta en las tres", () => {
  it.each(TARIFARIO.map((t) => [t.label] as const))("en «%s»", (label) => {
    abrirTarifario();
    fireEvent.click(pestana(label));
    expect(pildora()).not.toBeNull();
    expect(pildora().textContent).toContain(SOLO_LECTURA);
  });

  it("y es una pastilla con su candado de dos trazos", () => {
    abrirTarifario();
    expect(getComputedStyle(pildora()).borderRadius).toBe("999px");
    expect(getComputedStyle(pildora()).backgroundColor).toBe("#F7FBFE");
    const trazos = [...pildora().querySelectorAll("path")].map((p) => p.getAttribute("d"));
    expect(trazos).toEqual([...CANDADO]);
    expect(CANDADO).toEqual(["M7 11V8a5 5 0 0 1 10 0v3", "M5.5 11h13v9.5h-13z"]);
  });

  /**
   * Y **no hay con que escribir**: es lo que la pildora promete. Sin esta mitad, «Solo lectura»
   * seria una etiqueta que dice una cosa mientras la pantalla hace otra.
   */
  it("y lo que promete es cierto: ni un campo, ni un `<select>`, ni nada que exportar", () => {
    abrirTarifario();
    expect(pantalla().querySelectorAll("input, textarea, select")).toHaveLength(0);
    expect(pantalla().querySelectorAll("[contenteditable]")).toHaveLength(0);
    // Sus unicos botones son las tres pestanas.
    expect(pantalla().querySelectorAll("button")).toHaveLength(3);
  });
});

describe("criterio 8 · la tabla del Tarifario del TUPA", () => {
  it("tiene 6 filas y 5 columnas", () => {
    abrirTarifario();
    expect(filas()).toHaveLength(6);
    expect(cabeceras()).toHaveLength(5);
  });

  /** Transcrita a mano, entera, como la nombra el criterio. */
  it("su primera fila es `T-001 · Constancia de no adeudo · Por documento · 12.00 · 1.3.1.1.1.1`", () => {
    abrirTarifario();
    expect(textosDe(0)).toEqual([
      "T-001",
      "Constancia de no adeudo",
      "Por documento",
      "12.00",
      "1.3.1.1.1.1",
    ]);
  });

  /**
   * `Tasa S/` es la **cuarta** de cinco: no es la ultima. Una implementacion que alineara «la
   * ultima columna» en vez de «la numerica» dejaria el clasificador a la derecha y la tasa a la
   * izquierda, y pasaria cualquier comprobacion que solo mirara «hay una columna a la derecha».
   */
  it("`Tasa S/` va a la derecha con `tabular-nums`, y `Clasificador` —que es la ultima— no", () => {
    abrirTarifario();
    expect(cabeceras().map((c) => getComputedStyle(c).textAlign)).toEqual([
      "left",
      "left",
      "left",
      "right",
      "left",
    ]);
    const tasa = getComputedStyle(celdasDe(0)[3] as HTMLElement);
    expect(tasa.textAlign).toBe("right");
    expect(tasa.fontVariantNumeric).toBe("tabular-nums");

    const clasificador = getComputedStyle(celdasDe(0)[4] as HTMLElement);
    expect(clasificador.textAlign).not.toBe("right");
    expect(clasificador.fontVariantNumeric).not.toBe("tabular-nums");
  });

  it("las otras dos tienen 5 filas cada una", () => {
    abrirTarifario();
    fireEvent.click(pestana("Medios de pago y conciliación"));
    expect(filas()).toHaveLength(5);
    fireEvent.click(pestana("Cierre y depósito"));
    expect(filas()).toHaveLength(5);
  });

  it("y la cabecera de las tres es pegajosa", () => {
    abrirTarifario();
    for (const t of TARIFARIO) {
      fireEvent.click(pestana(t.label));
      expect(tabla().getAttribute("data-sticky")).toBe("1");
      for (const th of cabeceras()) {
        expect(getComputedStyle(th).position).toBe("sticky");
        expect(getComputedStyle(th).top).toBe("0px");
      }
    }
  });
});

describe("criterio 9 · cada pestana trae su nota de cabecera y su nota de pie", () => {
  it.each([
    [
      "Tarifario del TUPA",
      "Las tasas que se cobran en ventanilla, aparte de los tributos. Cada una tiene su código presupuestal: no se cobran contra la cuenta corriente.",
      "El derecho de emisión es la única tasa que se cobra junto al tributo, en la misma cuponera.",
    ],
    [
      "Medios de pago y conciliación",
      "Qué entra al arqueo de la caja y qué se conciliaba contra el banco. El efectivo es lo único que se cuenta al cerrar.",
      "La comisión de las tarjetas la paga la municipalidad: el contribuyente paga el importe íntegro de su deuda.",
    ],
    [
      "Cierre y depósito",
      "Qué hay que hacer al final del día y en qué orden. Un turno sin arquear bloquea el cierre y con él el depósito.",
      "El orden no es una formalidad: cada paso necesita que el anterior esté hecho. Por eso dos cajas sin arquear paran todo lo demás.",
    ],
  ])("«%s» ensena las suyas", (label, nota, pie) => {
    abrirTarifario();
    fireEvent.click(pestana(label));
    expect(notaDeCabecera()).toBe(nota);
    expect(notaDePie()).toBe(pie);
  });

  /**
   * Y son **seis textos distintos**: tres notas y tres pies, ninguno repetido. Sin esto, dibujar
   * la nota en los dos sitios —o el pie de la primera en las tres— pasaria las tres pruebas de
   * arriba si la primera pestana fuera la unica que se mira.
   */
  it("y los seis son distintos entre si", () => {
    const todos = TARIFARIO.flatMap((t) => [t.nota, t.pie]);
    expect(new Set(todos).size).toBe(6);
  });

  it("la nota va arriba y el pie debajo de la tabla, que es donde el artboard los pone", () => {
    abrirTarifario();
    const nota = pantalla().querySelector("[data-nota-de-cabecera]") as HTMLElement;
    const pie = pantalla().querySelector("[data-nota-de-pie]") as HTMLElement;
    // `compareDocumentPosition` con DOCUMENT_POSITION_FOLLOWING (4): el pie va detras de la
    // tabla y la nota delante. Es la unica forma de afirmar el orden sin hacer disposicion.
    expect(nota.compareDocumentPosition(tabla()) & 4).toBe(4);
    expect(tabla().compareDocumentPosition(pie) & 4).toBe(4);
  });
});

describe("la deuda de #9: el `valTab` llega en el destino y esta pantalla lo recoge", () => {
  /** Se afirma el **rotulo de la pestana activa**, no su indice: las dos van a `#tarifario`. */
  it.each([
    ["Tarifario del TUPA", "Tarifario del TUPA"],
    ["Cierre y depósito", "Cierre y depósito"],
  ])("«%s» de la paleta deja activa «%s»", (accion, label) => {
    render(<App />);
    elegirEnLaPaleta(accion);
    expect(activas()).toEqual([label]);
    expect(notaDePie()).toBe(TARIFARIO.find((t) => t.label === label)?.pie);
  });

  /** Estando ya en `#tarifario`, donde la pantalla no se vuelve a montar. */
  it("y estando ya en `#tarifario`, la paleta cambia la pestana activa", () => {
    render(<App />);
    elegirEnLaPaleta("Cierre y depósito");
    expect(activas()).toEqual(["Cierre y depósito"]);

    elegirEnLaPaleta("Tarifario del TUPA");
    expect(activas()).toEqual(["Tarifario del TUPA"]);
  });

  it("pero una navegacion sin `valTab` NO deshace la elegida a mano", () => {
    abrirTarifario();
    fireEvent.click(pestana("Medios de pago y conciliación"));
    abrirSeccion("valores");
    expect(activas()).toEqual(["Medios de pago y conciliación"]);
  });

  it("y desde el arbol, sin `valTab`, se entra por la primera", () => {
    abrirTarifario();
    expect(activas()).toEqual(["Tarifario del TUPA"]);
  });
});

describe("`#tarifario` es lo que dibuja solo `valores`", () => {
  it.each(SECCIONES.filter((s) => s.clave !== "valores").map((s) => [s.clave] as const))(
    "`%s` no dibuja nada de esta pantalla",
    (clave) => {
      render(<App />);
      abrirSeccion(clave);
      expect(document.querySelector("[data-seccion='valores']")).toBeNull();
    },
  );

  it("y `valores` la dibuja: es la cuarta y ultima de las secciones propias", () => {
    abrirTarifario();
    expect(pantalla()).not.toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Tarifario y cierre");
  });
});
