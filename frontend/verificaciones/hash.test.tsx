// El enrutado por hash, medido.
//
// POR QUE jsdom Y NO EL happy-dom DE `marco.test.tsx`
// Porque aqui no se mira un solo color y si se mira el historial. Y porque **happy-dom dispara
// `hashchange` tres veces por una sola navegacion** —medido con un oyente que cuenta: tres
// disparos donde jsdom da uno—, de modo que una prueba de navegacion externa escrita alli
// pasaria o caeria por el numero de veces que el entorno repite el evento, que no es lo que
// dice comprobar.
//
// LO QUE ESTE ARCHIVO NO PUEDE HACER, DICHO SIN ADORNOS
// **No recarga la pagina de verdad.** `location.reload()` no esta implementado en jsdom, y
// tampoco lo estaria una navegacion a otra URL. Lo mas cercano que si se puede medir es lo que
// una recarga produce en una aplicacion de una sola pagina: un **montaje nuevo** que lee
// `location.hash` al arrancar, y eso es lo que se hace aqui. La recarga de verdad —`F5` con
// `#cajas` puesto, servido por Vite— esta medida en Chromium con Playwright, fuera de la suite,
// y su salida esta en el registro de `CLAUDE.md`.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { HOJAS, SECCIONES } from "../src/datos";
import { destinoDelHash, destinoDeSlug, marcarHash, slugDeDestino } from "../src/marco/hash";

afterEach(cleanup);
beforeEach(() => window.history.replaceState(null, "", window.location.pathname));

const arbol = () => screen.getByRole("complementary", { name: "Módulos y submódulos" });
const titulo = () => screen.getByRole("heading", { level: 1 }).textContent;

/** Abre un submodulo desde el arbol, desplegando antes su modulo si hace falta. */
function abrir(modulo: string, clave: string) {
  const boton = arbol().querySelector(`[data-modulo="${modulo}"]`) as HTMLElement;
  if (boton.getAttribute("aria-expanded") === "false") fireEvent.click(boton);
  fireEvent.click(arbol().querySelector(`[data-submodulo="${clave}"]`) as HTMLElement);
}

describe("el slug de la URL y la clave interna no son lo mismo", () => {
  it("las cuatro secciones propias traducen en los dos sentidos", () => {
    for (const seccion of SECCIONES) {
      expect(slugDeDestino(seccion.clave)).toBe(seccion.slug);
      expect(destinoDeSlug(seccion.slug)).toBe(seccion.clave);
    }
    // Y son distintos en tres de las cuatro: `predios` se escribe `recibos`, `territorio`
    // `cajas` y `valores` `tarifario`. Es lo que hace que la traduccion tenga que existir.
    expect(SECCIONES.filter((x) => x.clave !== x.slug)).toHaveLength(3);
  });

  it("un submodulo ajeno es su propia clave, y por eso tambien es enlazable", () => {
    expect(slugDeDestino("tra-pap")).toBe("tra-pap");
    expect(destinoDeSlug("tra-pap")).toBe("tra-pap");
  });

  it("las cuarenta y ocho hojas tienen slug, y ninguna choca con otra", () => {
    const slugs = Object.keys(HOJAS).map((clave) => slugDeDestino(clave));
    expect(slugs.filter((x) => x === null)).toEqual([]);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("lo que no nombra nada da `null`, y no una seccion por descarte", () => {
    for (const hash of ["#zzz", "", "#", "#recibo", "#Recibos", "#panel/1"]) {
      expect(destinoDelHash(hash)).toBeNull();
    }
    expect(slugDeDestino("inventado")).toBeNull();
  });

  it("y los cinco que si nombran algo", () => {
    expect(destinoDelHash("#panel")).toBe("panel");
    expect(destinoDelHash("#recibos")).toBe("predios");
    expect(destinoDelHash("#cajas")).toBe("territorio");
    expect(destinoDelHash("#tarifario")).toBe("valores");
    expect(destinoDelHash("#tra-pap")).toBe("tra-pap");
  });
});

describe("criterio 5 · el hash dice que seccion esta a la vista, y el historial no crece", () => {
  it("«Recibos» activa deja `#recibos` en la URL", () => {
    render(<App />);
    abrir("Tesorería", "predios");
    expect(window.location.hash).toBe("#recibos");
  });

  it("las cuatro secciones, una a una", () => {
    render(<App />);
    for (const seccion of SECCIONES) {
      abrir("Tesorería", seccion.clave);
      expect(window.location.hash).toBe(`#${seccion.slug}`);
    }
  });

  it("`history.length` es el mismo antes y despues de recorrerlas", () => {
    render(<App />);
    const antes = window.history.length;
    for (const seccion of SECCIONES) abrir("Tesorería", seccion.clave);
    abrir("Tránsito", "tra-pap");
    for (const seccion of SECCIONES) abrir("Tesorería", seccion.clave);
    expect(window.location.hash).toBe("#tarifario");
    expect(window.history.length).toBe(antes);
  });

  it("y no crece porque se usa `replaceState`: `pushState` no se llama ni una vez", () => {
    // Es la afirmacion fuerte. `history.length` puede quedarse quieto por accidente —un entorno
    // que no lo lleve—, pero que nadie llame a `pushState` es una propiedad del codigo.
    const empujar = vi.spyOn(window.history, "pushState");
    const sustituir = vi.spyOn(window.history, "replaceState");
    render(<App />);
    for (const seccion of SECCIONES) abrir("Tesorería", seccion.clave);
    expect(empujar).not.toHaveBeenCalled();
    expect(sustituir.mock.calls.map((llamada) => llamada[2])).toContain("#cajas");
    empujar.mockRestore();
    sustituir.mockRestore();
  });

  it("y no se escribe dos veces lo mismo: volver a la pestana activa no toca el historial", () => {
    render(<App />);
    abrir("Tesorería", "predios");
    const sustituir = vi.spyOn(window.history, "replaceState");
    abrir("Tesorería", "predios");
    expect(sustituir).not.toHaveBeenCalled();
    sustituir.mockRestore();
  });

  it("si el historial esta prohibido, la pantalla sigue navegando", () => {
    // El `try`/`catch` del artboard, comprobado: `replaceState` lanza y la seccion cambia igual.
    const sustituir = vi.spyOn(window.history, "replaceState").mockImplementation(() => {
      throw new Error("SecurityError: sin permiso de historial");
    });
    render(<App />);
    abrir("Tesorería", "territorio");
    expect(titulo()).toBe("Cajas y arqueo");
    sustituir.mockRestore();
  });
});

describe("criterio 6 · arrancar con `#cajas` abre Cajas y arqueo", () => {
  it("abre esa, y no el Panel", () => {
    window.history.replaceState(null, "", "#cajas");
    render(<App />);
    expect(titulo()).toBe("Cajas y arqueo");
    expect(
      (document.querySelector('[data-pestana="territorio"]') as HTMLElement).getAttribute(
        "aria-current",
      ),
    ).toBe("true");
  });

  it("y la deja **abierta como pestana**, que es donde este port se separa del artboard", () => {
    // El artboard hace `setState({ dest: inicial })` sin tocar `abiertas`: medido, con `#cajas`
    // queda `abiertas: ['panel']` y `dest: 'territorio'`, o sea una seccion activa que ninguna
    // pestana representa. Aqui la activa siempre esta abierta.
    window.history.replaceState(null, "", "#cajas");
    render(<App />);
    const claves = [...document.querySelectorAll("[data-pestana]")].map((p) =>
      p.getAttribute("data-pestana"),
    );
    expect(claves).toEqual(["panel", "territorio"]);
  });

  it("las cuatro secciones y un submodulo ajeno, cada uno desde su hash", () => {
    for (const [hash, esperado] of [
      ["#panel", "Panel de Tesorería"],
      ["#recibos", "Recibos"],
      ["#cajas", "Cajas y arqueo"],
      ["#tarifario", "Tarifario y cierre"],
      ["#tra-pap", "Papeletas"],
    ] as const) {
      window.history.replaceState(null, "", hash);
      render(<App />);
      expect(titulo()).toBe(esperado);
      cleanup();
    }
  });

  it("un hash que no nombra nada deja el Panel, y lo escribe", () => {
    window.history.replaceState(null, "", "#zzz");
    render(<App />);
    expect(titulo()).toBe("Panel de Tesorería");
    expect(window.location.hash).toBe("#panel");
  });

  it("sin hash tambien: al arrancar se marca la seccion que hay", () => {
    render(<App />);
    expect(window.location.hash).toBe("#panel");
  });
});

describe("un `hashchange` de fuera cambia la seccion", () => {
  it("el que llega del navegador abre esa seccion", async () => {
    render(<App />);
    expect(titulo()).toBe("Panel de Tesorería");
    await act(async () => {
      window.location.hash = "#tarifario";
      // jsdom despacha `hashchange` en el siguiente turno del bucle de eventos, no en la
      // asignacion: sin esta espera la prueba mediria el DOM de antes del evento.
      await new Promise((seguir) => setTimeout(seguir, 0));
    });
    expect(titulo()).toBe("Tarifario y cierre");
  });

  it("y uno que no nombra nada no mueve nada", async () => {
    render(<App />);
    abrir("Tesorería", "territorio");
    await act(async () => {
      window.location.hash = "#zzz";
      await new Promise((seguir) => setTimeout(seguir, 0));
    });
    expect(titulo()).toBe("Cajas y arqueo");
  });
});

describe("`marcarHash` por si solo", () => {
  it("escribe el slug del destino y no el destino", () => {
    marcarHash("territorio");
    expect(window.location.hash).toBe("#cajas");
  });

  it("un destino que no existe no escribe nada", () => {
    window.history.replaceState(null, "", "#panel");
    marcarHash("inventado");
    expect(window.location.hash).toBe("#panel");
  });
});
