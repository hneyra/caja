// @vitest-environment happy-dom
//
// El marco de pestanas, medido.
//
// POR QUE happy-dom Y NO EL jsdom DEL RESTO DE LA SUITE
// Por lo mismo que `barra.test.tsx` y `arbol.test.tsx`: la pestana activa se distingue de las
// demas **por color** —fondo blanco, filete `var(--azul)`, tinta `var(--tinta)` y su icono en
// `var(--azul)`— y jsdom devuelve el texto del token en vez del color, asi que «la pestana
// activa se ve activa» seria incomprobable. Lo unico afirmable alli seria que pone
// `var(--azul)`, que es justo lo que la prueba NO quiere dar por bueno.
//
// El hash vive en el otro archivo (`hash.test.ts`) y en jsdom, y tambien con motivo: happy-dom
// dispara `hashchange` **tres veces** por una sola navegacion —medido: tres oyentes de un solo
// cambio— mientras jsdom lo dispara una. Una prueba de navegacion externa sobre un entorno que
// multiplica el evento no mide lo que dice medir.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App";
import { HOJAS, SECCIONES } from "../src/datos";
import { CERRAR_LA_PESTANA, textoDeAjena } from "../src/marco/PestanaAjena";
import { EXPLICACION_DEL_HUECO, TITULO_DEL_HUECO } from "../src/marco/SinPestanas";
import { ROTULO_DEL_DIALOGO, tituloDelDialogo } from "../src/marco/DialogoDeCambios";
import type { PropsDePantalla } from "../src/marco/pantalla";
import {
  MENSAJE_DE_COBRO_NUEVO,
  mensajeDeGuardado,
  pestanasDe,
  SUBTITULOS,
  subtituloDe,
  TITULO_DEL_PANEL,
  TITULO_SIN_PESTANAS,
  tituloDe,
} from "../src/marco/rotulos";
import "../src/ds/global.css";

afterEach(cleanup);

/**
 * El hash es global del documento y `App` lo escribe al montarse: sin limpiarlo, una prueba que
 * deje «Cajas y arqueo» abierta hace que la siguiente arranque alli. Es lo que permite que
 * `--sequence.shuffle` no cambie el resultado.
 */
beforeEach(() => window.history.replaceState(null, "", window.location.pathname));

/**
 * Una pantalla que **edita un campo**, que es lo unico que ensucia una pestana.
 *
 * No es un interruptor de prueba: llama a `fijarCampo(k, v)` igual que lo hara la pantalla de
 * Recibos —es el `onTipo` de la linea 1926 del artboard, `this.set('caja', e.target.value)`— y
 * lee con `valorDeCampo`, que es el `val(k, d)` de la 1358. Lo que el marco expone es esa
 * pareja; esta pantalla solo demuestra que esta enchufada.
 */
function PantallaQueEdita({ seccion, fijarCampo, valorDeCampo }: PropsDePantalla) {
  return (
    <div data-seccion={seccion}>
      <label>
        Caja
        <input
          value={valorDeCampo("caja", "")}
          onChange={(evento) => fijarCampo("caja", evento.target.value)}
        />
      </label>
    </div>
  );
}

const arbol = () => screen.getByRole("complementary", { name: "Módulos y submódulos" });
const barra = () => document.querySelector("[data-pestanas]") as HTMLElement;
const pestanas = () => [...barra().querySelectorAll("[data-pestana]")] as HTMLElement[];
const pestana = (clave: string) => barra().querySelector(`[data-pestana="${clave}"]`) as HTMLElement;
const claves = () => pestanas().map((p) => p.getAttribute("data-pestana"));
const activa = () =>
  pestanas()
    .find((p) => p.getAttribute("aria-current") === "true")
    ?.getAttribute("data-pestana") ?? null;

/** El aspa de una pestana, por su nombre accesible: es lo que el criterio 1 exige. */
const aspa = (rotulo: string) => screen.getByRole("button", { name: `Cerrar ${rotulo}` });

/** Abre un submodulo desde el arbol, desplegando antes su modulo si hace falta. */
function abrir(modulo: string, clave: string) {
  const boton = arbol().querySelector(`[data-modulo="${modulo}"]`) as HTMLElement;
  if (boton.getAttribute("aria-expanded") === "false") fireEvent.click(boton);
  fireEvent.click(arbol().querySelector(`[data-submodulo="${clave}"]`) as HTMLElement);
}

/** Las cuatro secciones propias abiertas, en el orden de `SECCIONES`. */
function abrirLasCuatro() {
  for (const seccion of SECCIONES) abrir("Tesorería", seccion.clave);
}

describe("criterio 1 · las cuatro secciones propias dan cuatro pestanas", () => {
  it("son cuatro, en el orden en que se abrieron", () => {
    render(<App />);
    abrirLasCuatro();
    expect(claves()).toEqual(SECCIONES.map((x) => x.clave));
    expect(pestanas()).toHaveLength(4);
  });

  it("cada una lleva su aspa con `aria-label` «Cerrar <rótulo>»", () => {
    render(<App />);
    abrirLasCuatro();
    for (const seccion of SECCIONES) {
      const boton = aspa(seccion.label);
      // El `title` dice lo mismo que el `aria-label`: el artboard los escribe iguales (394).
      expect(boton.getAttribute("title")).toBe(`Cerrar ${seccion.label}`);
    }
  });

  it("y cada una lleva el icono de su seccion, no el de su modulo", () => {
    render(<App />);
    abrirLasCuatro();
    const trazos = [...pestana("territorio").querySelectorAll("path")].map((p) =>
      p.getAttribute("d"),
    );
    expect(trazos).toEqual([
      "M4.5 4.5h6v6h-6z",
      "M13.5 4.5h6v6h-6z",
      "M4.5 13.5h6v6h-6z",
      "M13.5 13.5h6v6h-6z",
    ]);
  });

  it("la barra existe aunque no haya ninguna pestana: es una franja, no una lista que aparece", () => {
    render(<App />);
    fireEvent.click(aspa("Panel"));
    expect(pestanas()).toHaveLength(0);
    expect(barra()).not.toBeNull();
  });
});

describe("criterio 2 · abrir dos veces el mismo submodulo deja una sola pestana", () => {
  it("desde el arbol", () => {
    render(<App />);
    abrir("Tesorería", "predios");
    abrir("Tesorería", "predios");
    expect(claves()).toEqual(["panel", "predios"]);
  });

  it("y pulsando su propia pestana, que solo la activa", () => {
    render(<App />);
    abrir("Tesorería", "predios");
    fireEvent.click(pestana("panel"));
    fireEvent.click(pestana("predios"));
    fireEvent.click(pestana("predios"));
    expect(claves()).toEqual(["panel", "predios"]);
    expect(activa()).toBe("predios");
  });
});

describe("criterio 3 · cerrar activa la vecina de la izquierda", () => {
  /** Deja `[panel, predios, territorio]` abiertas y activa la que se pida. */
  function tresAbiertas(cual: string) {
    render(<App />);
    abrir("Tesorería", "predios");
    abrir("Tesorería", "territorio");
    fireEvent.click(pestana(cual));
    expect(claves()).toEqual(["panel", "predios", "territorio"]);
    expect(activa()).toBe(cual);
  }

  it("con «Recibos» activa, cerrarla deja activo «Panel»", () => {
    tresAbiertas("predios");
    fireEvent.click(aspa("Recibos"));
    expect(claves()).toEqual(["panel", "territorio"]);
    expect(activa()).toBe("panel");
  });

  it("con «Panel» activa, cerrarla deja activo «Recibos»: si no hay izquierda, la derecha", () => {
    tresAbiertas("panel");
    fireEvent.click(aspa("Panel"));
    expect(claves()).toEqual(["predios", "territorio"]);
    expect(activa()).toBe("predios");
  });

  it("cerrar una que no es la activa no mueve la activa", () => {
    tresAbiertas("territorio");
    fireEvent.click(aspa("Panel"));
    expect(claves()).toEqual(["predios", "territorio"]);
    expect(activa()).toBe("territorio");
  });
});

describe("criterio 4 · cerrar la ultima deja el hueco", () => {
  it("ensena «No hay ningún submódulo abierto» con su explicacion", () => {
    render(<App />);
    fireEvent.click(aspa("Panel"));
    expect(screen.getByText(TITULO_DEL_HUECO)).toBeDefined();
    expect(screen.getByText(EXPLICACION_DEL_HUECO)).toBeDefined();
    expect(TITULO_DEL_HUECO).toBe("No hay ningún submódulo abierto");
  });

  it("y con el hueco puesto no hay ni titulo ni boton de cobrar", () => {
    render(<App />);
    fireEvent.click(aspa("Panel"));
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cobrar" })).toBeNull();
  });

  it("y no se reabre solo: el hueco es un estado, no un error", () => {
    render(<App />);
    fireEvent.click(aspa("Panel"));
    expect(pestanas()).toHaveLength(0);
    expect(screen.getByText(TITULO_DEL_HUECO)).toBeDefined();
  });
});

describe("criterio 7 · una pestana sucia no se cierra a la primera", () => {
  /** Ensucia la pestana activa editando el campo de la pantalla enchufada. */
  function ensuciar() {
    fireEvent.change(screen.getByLabelText("Caja"), { target: { value: "C-3" } });
  }

  it("el ` *` sale en la pestana **y** en el arbol", () => {
    render(<App Pantalla={PantallaQueEdita} />);
    ensuciar();
    expect(pestana("panel").textContent).toBe("Panel *");
    expect(
      (arbol().querySelector('[data-submodulo="panel"]') as HTMLElement).textContent,
    ).toBe("Panel *");
  });

  it("y el aspa lo dice tambien, que es lo que oye quien no ve la pantalla", () => {
    render(<App Pantalla={PantallaQueEdita} />);
    ensuciar();
    expect(screen.getByRole("button", { name: "Cerrar Panel — tiene cambios sin guardar" })).toBeDefined();
  });

  it("cerrarla NO la cierra: abre el dialogo, con `role` y `aria-modal`", () => {
    render(<App Pantalla={PantallaQueEdita} />);
    ensuciar();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar Panel — tiene cambios sin guardar" }));
    const dialogo = screen.getByRole("dialog", { name: ROTULO_DEL_DIALOGO });
    expect(dialogo.getAttribute("aria-modal")).toBe("true");
    expect(within(dialogo).getByText(tituloDelDialogo("Panel"))).toBeDefined();
    expect(claves()).toEqual(["panel"]);
  });

  it("«Seguir editando» la deja abierta y sucia", () => {
    render(<App Pantalla={PantallaQueEdita} />);
    ensuciar();
    fireEvent.click(screen.getByRole("button", { name: /^Cerrar Panel/ }));
    fireEvent.click(screen.getByRole("button", { name: "Seguir editando" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(claves()).toEqual(["panel"]);
    expect(pestana("panel").textContent).toBe("Panel *");
  });

  it("«Descartar y cerrar» la cierra, y sin toast", () => {
    render(<App Pantalla={PantallaQueEdita} />);
    ensuciar();
    fireEvent.click(screen.getByRole("button", { name: /^Cerrar Panel/ }));
    fireEvent.click(screen.getByRole("button", { name: "Descartar y cerrar" }));
    expect(claves()).toEqual([]);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("«Guardar y cerrar» la cierra y saca el toast «Cambios guardados en Panel.»", () => {
    render(<App Pantalla={PantallaQueEdita} />);
    ensuciar();
    fireEvent.click(screen.getByRole("button", { name: /^Cerrar Panel/ }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar y cerrar" }));
    expect(claves()).toEqual([]);
    expect(screen.getByRole("status").textContent).toBe(mensajeDeGuardado("Panel"));
  });

  it("la salida primaria es «Guardar y cerrar», y la que pierde va aparte y en rojo", () => {
    render(<App Pantalla={PantallaQueEdita} />);
    ensuciar();
    fireEvent.click(screen.getByRole("button", { name: /^Cerrar Panel/ }));
    const dialogo = screen.getByRole("dialog");
    const botones = [...dialogo.querySelectorAll("button")].map((b) => b.textContent);
    expect(botones).toEqual(["Descartar y cerrar", "Seguir editando", "Guardar y cerrar"]);
    const guardar = screen.getByRole("button", { name: "Guardar y cerrar" });
    const descartar = screen.getByRole("button", { name: "Descartar y cerrar" });
    expect(getComputedStyle(guardar).backgroundColor).toBe("#005284");
    expect(getComputedStyle(descartar).color).toBe("#8F2A17");
  });

  it("solo se ensucia la activa, y cerrarla limpia su marca", () => {
    render(<App Pantalla={PantallaQueEdita} />);
    abrir("Tesorería", "predios");
    ensuciar();
    expect(pestana("predios").textContent).toBe("Recibos *");
    expect(pestana("panel").textContent).toBe("Panel");
    fireEvent.click(screen.getByRole("button", { name: /^Cerrar Recibos/ }));
    fireEvent.click(screen.getByRole("button", { name: "Descartar y cerrar" }));
    abrir("Tesorería", "predios");
    expect(pestana("predios").textContent).toBe("Recibos");
  });

  it("lo escrito se lee de vuelta con `valorDeCampo`", () => {
    render(<App Pantalla={PantallaQueEdita} />);
    ensuciar();
    expect((screen.getByLabelText("Caja") as HTMLInputElement).value).toBe("C-3");
  });

  it("una pestana limpia se cierra a la primera, sin preguntar", () => {
    render(<App Pantalla={PantallaQueEdita} />);
    fireEvent.click(aspa("Panel"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(claves()).toEqual([]);
  });
});

describe("criterio 8 · un submodulo de otro modulo abre su tarjeta", () => {
  it("«Papeletas» nombra a Tránsito, con su nota y su texto", () => {
    render(<App />);
    abrir("Tránsito", "tra-pap");
    expect(claves()).toEqual(["panel", "tra-pap"]);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Papeletas");
    expect(screen.getByText("Tránsito · Papeletas y vehículos")).toBeDefined();
    expect(screen.getByText(textoDeAjena("Papeletas", "Tránsito"))).toBeDefined();
  });

  it("lleva el icono de su modulo, no el de ninguna seccion", () => {
    render(<App />);
    abrir("Tránsito", "tra-pap");
    const trazos = [...pestana("tra-pap").querySelectorAll("path")].map((p) => p.getAttribute("d"));
    expect(trazos[0]).toBe("M5 15.8v-3.2l1.9-4.4h10.2l1.9 4.4v3.2");
  });

  it("su boton «Cerrar la pestaña» la cierra", () => {
    render(<App />);
    abrir("Tránsito", "tra-pap");
    fireEvent.click(screen.getByRole("button", { name: CERRAR_LA_PESTANA }));
    expect(claves()).toEqual(["panel"]);
    expect(activa()).toBe("panel");
  });

  it("en una ajena no se ofrece «Cobrar»: no hay nada que crear aqui", () => {
    render(<App />);
    abrir("Tránsito", "tra-pap");
    expect(screen.queryByRole("button", { name: "Cobrar" })).toBeNull();
    fireEvent.click(pestana("panel"));
    expect(screen.getByRole("button", { name: "Cobrar" })).toBeDefined();
  });
});

describe("la pestana activa se ve activa", () => {
  it("fondo blanco, filete azul, tinta fuerte y su icono en `--azul`", () => {
    render(<App />);
    abrir("Tesorería", "predios");
    const marco = pestana("predios").parentElement as HTMLElement;
    const marcoApagado = pestana("panel").parentElement as HTMLElement;
    expect(getComputedStyle(marco).backgroundColor).toBe("#fff");
    expect(getComputedStyle(marco).borderTopColor).toBe("#005284");
    expect(getComputedStyle(marcoApagado).backgroundColor).toBe("transparent");
    expect(getComputedStyle(marcoApagado).borderTopColor).toBe("transparent");
    expect(getComputedStyle(pestana("predios")).color).toBe("#16232C");
    expect(getComputedStyle(pestana("panel")).color).toBe("#5A6B78");
    expect(getComputedStyle(pestana("predios")).fontWeight).toBe("700");
    expect(getComputedStyle(pestana("panel")).fontWeight).toBe("400");
    const icono = pestana("predios").firstElementChild as HTMLElement;
    expect(getComputedStyle(icono).color).toBe("#005284");
  });

  it("y el aspa de la activa va mas oscura que la de las apagadas", () => {
    render(<App />);
    abrir("Tesorería", "predios");
    expect(getComputedStyle(aspa("Recibos")).color).toBe("#5A6B78");
    expect(getComputedStyle(aspa("Panel")).color).toBe("#93A3AF");
  });
});

describe("la fila del titulo", () => {
  it("las cuatro secciones propias, con su titulo y su subtitulo", () => {
    render(<App />);
    for (const seccion of SECCIONES) {
      abrir("Tesorería", seccion.clave);
      const titulo = seccion.clave === "panel" ? TITULO_DEL_PANEL : seccion.label;
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(titulo);
      expect(screen.getByText(SUBTITULOS[seccion.clave])).toBeDefined();
    }
  });

  it("«Cobrar» lleva a Recibos y avisa con el texto del artboard", () => {
    render(<App />);
    abrir("Tesorería", "territorio");
    fireEvent.click(screen.getByRole("button", { name: "Cobrar" }));
    expect(activa()).toBe("predios");
    expect(screen.getByRole("status").textContent).toBe(MENSAJE_DE_COBRO_NUEVO);
  });

  it("el subtitulo se retira bajo 760 px, como los tres de la barra", () => {
    render(<App />);
    const subtitulo = screen.getByText(SUBTITULOS.panel);
    expect(subtitulo.getAttribute("data-sm-hide")).toBe("1");
  });
});

describe("navegar cierra lo que el artboard cierra", () => {
  /**
   * `ir` apaga el lanzador y la paleta (linea 1345), y eso vale para las tres puertas de
   * entrada. La paleta no tiene dialogo todavia —es del issue siguiente—, pero su estado si es
   * observable: `data-paleta` en la raiz.
   */
  const paleta = (contenedor: HTMLElement) =>
    (contenedor.firstElementChild as HTMLElement).getAttribute("data-paleta");

  it("pulsar una pestana la cierra", () => {
    const { container } = render(<App />);
    abrir("Tesorería", "predios");
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    expect(paleta(container)).toBe("abierta");
    fireEvent.click(pestana("panel"));
    expect(paleta(container)).toBe("cerrada");
  });

  it("y pulsar «Cobrar» tambien", () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    expect(paleta(container)).toBe("abierta");
    fireEvent.click(screen.getByRole("button", { name: "Cobrar" }));
    expect(paleta(container)).toBe("cerrada");
  });
});

describe("los rotulos, como funciones puras", () => {
  it("el titulo de cada seccion y el de una ajena", () => {
    expect(tituloDe(null)).toBe(TITULO_SIN_PESTANAS);
    expect(tituloDe("panel")).toBe("Panel de Tesorería");
    expect(tituloDe("predios")).toBe("Recibos");
    expect(tituloDe("territorio")).toBe("Cajas y arqueo");
    expect(tituloDe("valores")).toBe("Tarifario y cierre");
    expect(tituloDe("tra-pap")).toBe("Papeletas");
  });

  it("el subtitulo de una ajena es su modulo, que es lo que contesta a «por que esta aqui»", () => {
    expect(subtituloDe("tra-pap")).toBe("Tránsito");
    expect(subtituloDe("cat-pred")).toBe("Catastro");
    expect(subtituloDe("panel")).toBe("Caja C-3 · turno mañana");
  });

  it("las cuarenta y ocho hojas tienen rotulo de pestana, y ninguna se queda sin icono", () => {
    const todas = pestanasDe(Object.keys(HOJAS), null, {});
    expect(todas).toHaveLength(48);
    expect(todas.filter((p) => p.icono.length === 0)).toEqual([]);
    expect(todas.filter((p) => p.rotulo === "")).toEqual([]);
  });

  it("el ` *` va en el rotulo visible y NO en el nombre accesible del aspa", () => {
    const [limpia, sucia] = pestanasDe(["panel", "predios"], "panel", { predios: true });
    expect(limpia?.label).toBe("Panel");
    expect(limpia?.cerrarAria).toBe("Cerrar Panel");
    expect(sucia?.label).toBe("Recibos *");
    expect(sucia?.rotulo).toBe("Recibos");
    expect(sucia?.cerrarAria).toBe("Cerrar Recibos — tiene cambios sin guardar");
  });
});
