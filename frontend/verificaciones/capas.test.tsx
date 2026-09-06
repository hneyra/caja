// @vitest-environment happy-dom
//
// El lanzador de modulos y el menu de sesion, medidos.
//
// POR QUE happy-dom Y NO EL jsdom DEL RESTO DE LA SUITE
// Las dos cosas que este archivo afirma son colores que salen de un token: el modulo actual va
// en `var(--azul-suave)` con su icono en `var(--azul)`, y «Cerrar sesión» en
// `var(--ins-bad-tinta)`. jsdom devuelve el texto del token en vez del color, asi que
// «Cerrar sesión va en #8F2A17» —que es el criterio 7 literal— seria incomprobable alli.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App";
import { MI_MODULO, MODULOS, OPCIONES_DE_SESION, SECCIONES, SESION } from "../src/datos";
import {
  abririaElModulo,
  NOTA_DEL_LANZADOR,
  PIE_DEL_LANZADOR,
  TITULO_DEL_LANZADOR,
  YA_ESTA_EN,
} from "../src/barra/LanzadorDeModulos";
import { abriria, avisoDeSucias, CERRARIA_LA_SESION } from "../src/barra/MenuDeSesion";
import type { PropsDePantalla } from "../src/marco/MarcadorDeSeccion";
import "../src/ds/global.css";

afterEach(cleanup);
beforeEach(() => window.history.replaceState(null, "", window.location.pathname));

const botonDelLanzador = () => screen.getByRole("button", { name: "Ver todos los módulos" });
const lanzador = () => screen.queryByRole("dialog", { name: "Módulos del sistema" });
const modulos = () =>
  [...(lanzador() as HTMLElement).querySelectorAll("[data-modulo-del-lanzador]")] as HTMLElement[];
const modulo = (nombre: string) =>
  (lanzador() as HTMLElement).querySelector(
    `[data-modulo-del-lanzador="${nombre}"]`,
  ) as HTMLElement;

const fichaDeSesion = () => screen.getByRole("button", { name: `Sesión de ${SESION.nombre}` });
const menu = () => screen.queryByRole("menu", { name: "Sesión" });
const opciones = () => within(menu() as HTMLElement).getAllByRole("menuitem");
const opcion = (label: string) =>
  (menu() as HTMLElement).querySelector(`[data-opcion-de-sesion="${label}"]`) as HTMLElement;
const pieDeSucias = () => document.querySelector("[data-sucias-en-sesion]");

const toast = () => screen.queryByRole("status")?.textContent ?? null;

/** Una pantalla que edita un campo: la unica forma de ensuciar una pestana. Ver `marco.test.tsx`. */
function PantallaQueEdita({ seccion, fijarCampo, valorDeCampo }: PropsDePantalla) {
  return (
    <label>
      Caja
      <input
        data-campo={seccion}
        value={valorDeCampo(`caja-${seccion}`, "")}
        onChange={(evento) => fijarCampo(`caja-${seccion}`, evento.target.value)}
      />
    </label>
  );
}

const arbol = () => screen.getByRole("complementary", { name: "Módulos y submódulos" });

/** Abre un submodulo propio desde el arbol. */
const abrirSeccion = (clave: string) =>
  fireEvent.click(arbol().querySelector(`[data-submodulo="${clave}"]`) as HTMLElement);

/** Ensucia la seccion activa escribiendo en su campo. */
const ensuciar = (clave: string, texto: string) =>
  fireEvent.change(screen.getByRole("textbox", { name: "Caja" }), {
    target: { value: `${texto}-${clave}` },
  });

describe("criterio 6 · el lanzador ensena los doce modulos", () => {
  it("los nueve puntos lo abren y lo cierran", () => {
    render(<App />);
    expect(lanzador()).toBeNull();
    fireEvent.click(botonDelLanzador());
    expect(lanzador()).not.toBeNull();
    fireEvent.click(botonDelLanzador());
    expect(lanzador()).toBeNull();
  });

  it("son doce, en el orden del artboard", () => {
    render(<App />);
    fireEvent.click(botonDelLanzador());
    expect(modulos()).toHaveLength(12);
    expect(modulos().map((m) => m.getAttribute("data-modulo-del-lanzador"))).toEqual(
      MODULOS.map((m) => m.nombre),
    );
  });

  it("el que lleva `aria-current=\"true\"` es Tesorería, y es exactamente uno", () => {
    render(<App />);
    fireEvent.click(botonDelLanzador());
    const marcados = modulos().filter((m) => m.getAttribute("aria-current") === "true");
    expect(marcados).toHaveLength(1);
    expect(marcados[0]?.getAttribute("data-modulo-del-lanzador")).toBe("Tesorería");
    // Y no es una cadena escrita aqui: es el mismo `MI_MODULO` que usa el arbol.
    expect(MI_MODULO).toBe("Tesorería");
  });

  /**
   * El criterio 6 pide un `grep -rn "Tránsito" frontend/src/shell` que no encuentre ninguna
   * marca de modulo actual. **Aqui no hay `src/shell`** —este repositorio reparte el marco en
   * `src/barra/`, `src/marco/`, `src/arbol/` y `src/paleta/`—, asi que se mira donde vive lo de
   * este issue. En `src/datos/navegacion.ts` la cadena SI aparece, y tiene que aparecer: es uno
   * de los doce modulos.
   *
   * Y se comprueba **mas de lo que el grep pide**, por dos motivos medidos:
   *
   * 1. Los comentarios se quitan antes de mirar. Este archivo del port **habla** del defecto de
   *    la linea 1713 —que es como se evita repetirlo—, asi que un grep literal sobre el fuente
   *    lo caza a el. La primera version de esta prueba salio roja por eso.
   * 2. No se busca «Tránsito» sino **cualquiera de los doce nombres**. Escribir `'Tesorería'` a
   *    mano en el lanzador seria el mismo defecto con el modulo correcto: funcionaria hoy y
   *    seria la segunda fuente de verdad que produjo el original.
   */
  it("ninguna capa flotante escribe el nombre de un modulo: el defecto de la 1713 no viajo", () => {
    const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
    const sinComentarios = (texto: string) =>
      texto.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
    const sospechosos: string[] = [];
    for (const carpeta of ["barra", "paleta"]) {
      for (const archivo of readdirSync(join(raiz, carpeta))) {
        const codigo = sinComentarios(readFileSync(join(raiz, carpeta, archivo), "utf8"));
        for (const m of MODULOS) {
          if (codigo.includes(m.nombre)) sospechosos.push(`${carpeta}/${archivo}: ${m.nombre}`);
        }
      }
    }
    expect(sospechosos).toEqual([]);
  });

  it("el actual se ve actual: fondo, icono y peso", () => {
    render(<App />);
    fireEvent.click(botonDelLanzador());
    const suyo = getComputedStyle(modulo("Tesorería"));
    expect(suyo.backgroundColor).toBe("#E4F4FD");
    expect(suyo.fontWeight).toBe("700");
    const icono = getComputedStyle(modulo("Tesorería").firstElementChild as HTMLElement);
    expect(icono.backgroundColor).toBe("#005284");
    expect(icono.color).toBe("#fff");

    const ajeno = getComputedStyle(modulo("Catastro"));
    expect(ajeno.backgroundColor).toBe("transparent");
    expect(ajeno.fontWeight).toBe("400");
    const iconoAjeno = getComputedStyle(modulo("Catastro").firstElementChild as HTMLElement);
    expect(iconoAjeno.backgroundColor).toBe("#E4F4FD");
    expect(iconoAjeno.color).toBe("#004670");
  });

  it("cada modulo trae los trazos de su icono, letra a letra", () => {
    render(<App />);
    fireEvent.click(botonDelLanzador());
    for (const m of MODULOS) {
      const trazos = [...modulo(m.nombre).querySelectorAll("path")].map((p) =>
        p.getAttribute("d"),
      );
      expect(trazos).toEqual([...m.icono]);
    }
  });

  it("la rejilla es la del artboard y el pie dice lo que dice", () => {
    render(<App />);
    fireEvent.click(botonDelLanzador());
    const rejilla = modulo("Inicio").parentElement as HTMLElement;
    expect(rejilla.style.gridTemplateColumns).toBe("repeat(auto-fill,minmax(168px,1fr))");
    expect((lanzador() as HTMLElement).textContent).toContain(PIE_DEL_LANZADOR);
    expect((lanzador() as HTMLElement).textContent).toContain(TITULO_DEL_LANZADOR);
    expect((lanzador() as HTMLElement).textContent).toContain(NOTA_DEL_LANZADOR);
    expect(PIE_DEL_LANZADOR).toBe(
      "El ejercicio de trabajo es global a la sesión: al cambiarlo, cambia para los doce módulos.",
    );
  });

  it("pulsar Tesorería dice «Ya está en Tesorería.» y cierra el lanzador", () => {
    render(<App />);
    fireEvent.click(botonDelLanzador());
    fireEvent.click(modulo("Tesorería"));
    expect(toast()).toBe("Ya está en Tesorería.");
    expect(YA_ESTA_EN).toBe("Ya está en Tesorería.");
    expect(lanzador()).toBeNull();
  });

  it("pulsar otro dice «Abriría el módulo …» con su nombre, y NO navega", () => {
    render(<App />);
    fireEvent.click(botonDelLanzador());
    fireEvent.click(modulo("Coactiva"));
    expect(toast()).toBe("Abriría el módulo Coactiva.");
    expect(abririaElModulo("Coactiva")).toBe("Abriría el módulo Coactiva.");
    // Lo que el issue prohibe: navegar de verdad a otro modulo. La seccion activa no se mueve.
    expect(document.querySelector("[data-ir]")?.getAttribute("data-ir")).toBe("panel");
  });

  it("los once ajenos dicen cada uno el suyo", () => {
    render(<App />);
    for (const m of MODULOS.filter((x) => x.nombre !== MI_MODULO)) {
      fireEvent.click(botonDelLanzador());
      fireEvent.click(modulo(m.nombre));
      expect(toast()).toBe(`Abriría el módulo ${m.nombre}.`);
    }
  });

  it("el fondo transparente lo cierra sin avisar", () => {
    render(<App />);
    fireEvent.click(botonDelLanzador());
    const fondo = (lanzador() as HTMLElement).previousElementSibling as HTMLElement;
    fireEvent.click(fondo);
    expect(lanzador()).toBeNull();
    expect(toast()).toBeNull();
  });
});

describe("criterio 7 · el menu de sesion", () => {
  it("la ficha lo abre y lo cierra", () => {
    render(<App />);
    expect(menu()).toBeNull();
    fireEvent.click(fichaDeSesion());
    expect(menu()).not.toBeNull();
    fireEvent.click(fichaDeSesion());
    expect(menu()).toBeNull();
  });

  it("ensena quien tiene la ventanilla abierta", () => {
    render(<App />);
    fireEvent.click(fichaDeSesion());
    const texto = (menu() as HTMLElement).textContent ?? "";
    expect(texto).toContain(SESION.nombre);
    expect(texto).toContain(SESION.puesto);
    expect(texto).toContain(SESION.iniciales);
  });

  it("son tres opciones, con sus rotulos y sus iconos", () => {
    render(<App />);
    fireEvent.click(fichaDeSesion());
    expect(opciones()).toHaveLength(3);
    expect(opciones().map((o) => o.textContent)).toEqual([
      "Mi perfil",
      "Cambiar contraseña",
      "Cerrar sesión",
    ]);
    for (const o of OPCIONES_DE_SESION) {
      expect([...opcion(o.label).querySelectorAll("path")].map((p) => p.getAttribute("d"))).toEqual(
        [...o.icono],
      );
    }
  });

  it("«Cerrar sesión» va en `#8F2A17` y con peso 600; las otras dos no", () => {
    render(<App />);
    fireEvent.click(fichaDeSesion());
    const salida = getComputedStyle(opcion("Cerrar sesión"));
    expect(salida.color).toBe("#8F2A17");
    expect(salida.fontWeight).toBe("600");

    const perfil = getComputedStyle(opcion("Mi perfil"));
    expect(perfil.color).toBe("#3A4A55");
    expect(perfil.fontWeight).toBe("400");
  });

  it("cada una saca su toast y cierra el menu", () => {
    render(<App />);
    for (const esperado of [
      ["Mi perfil", "Abriría mi perfil."],
      ["Cambiar contraseña", "Abriría cambiar contraseña."],
      ["Cerrar sesión", "Cerraría la sesión."],
    ] as const) {
      fireEvent.click(fichaDeSesion());
      fireEvent.click(opcion(esperado[0]));
      expect(toast()).toBe(esperado[1]);
      expect(menu()).toBeNull();
    }
    // Los dos textos, tambien contra la funcion que los compone: el toast de la salida NO se
    // deriva del rotulo, y derivarlo daria «Abriría cerrar sesión.».
    expect(abriria("Mi perfil")).toBe("Abriría mi perfil.");
    expect(CERRARIA_LA_SESION).toBe("Cerraría la sesión.");
  });

  it("y ninguna cierra sesion de verdad: aqui no hay ninguna que cerrar", () => {
    render(<App />);
    fireEvent.click(fichaDeSesion());
    fireEvent.click(opcion("Cerrar sesión"));
    // La aplicacion sigue entera: la barra, el arbol y la pestana del Panel.
    expect(screen.getByRole("banner")).not.toBeNull();
    expect(arbol()).not.toBeNull();
    expect(document.querySelector('[data-pestana="panel"]')).not.toBeNull();
  });
});

describe("criterio 7 · el pie que cuenta las pestanas sucias", () => {
  it("sin ninguna sucia no hay pie", () => {
    render(<App />);
    fireEvent.click(fichaDeSesion());
    expect(pieDeSucias()).toBeNull();
  });

  it("con una sucia dice «Hay 1 pestaña …», en singular", () => {
    render(<App Pantalla={PantallaQueEdita} />);
    ensuciar("panel", "x");
    fireEvent.click(fichaDeSesion());
    expect(pieDeSucias()?.textContent).toBe(
      "Hay 1 pestaña con cambios sin guardar. Al cerrar sesión se pierden.",
    );
  });

  it("con dos dice «Hay 2 pestañas …», en plural", () => {
    render(<App Pantalla={PantallaQueEdita} />);
    ensuciar("panel", "x");
    abrirSeccion("predios");
    ensuciar("predios", "y");
    fireEvent.click(fichaDeSesion());
    expect(pieDeSucias()?.textContent).toBe(
      "Hay 2 pestañas con cambios sin guardar. Al cerrar sesión se pierden.",
    );
  });

  it("y el texto se compone con su singular tambien fuera de la pantalla", () => {
    expect(avisoDeSucias(1)).toBe(
      "Hay 1 pestaña con cambios sin guardar. Al cerrar sesión se pierden.",
    );
    expect(avisoDeSucias(2)).toBe(
      "Hay 2 pestañas con cambios sin guardar. Al cerrar sesión se pierden.",
    );
  });

  it("va en los colores del aviso: fondo `#FFF4D9` y tinta `#7A5200`", () => {
    render(<App Pantalla={PantallaQueEdita} />);
    ensuciar("panel", "x");
    fireEvent.click(fichaDeSesion());
    const estilo = getComputedStyle(pieDeSucias() as HTMLElement);
    expect(estilo.backgroundColor).toBe("#FFF4D9");
    expect(estilo.color).toBe("#7A5200");
  });

  it("cerrar la pestana sucia lo retira, que es lo que hace que cuente de verdad", () => {
    // Sin esto, un contador que solo sumara pasaria las tres pruebas de arriba.
    render(<App Pantalla={PantallaQueEdita} />);
    ensuciar("panel", "x");
    abrirSeccion("predios");
    ensuciar("predios", "y");

    fireEvent.click(screen.getByRole("button", { name: /^Cerrar Recibos/ }));
    fireEvent.click(screen.getByRole("button", { name: "Descartar y cerrar" }));

    fireEvent.click(fichaDeSesion());
    expect(pieDeSucias()?.textContent).toBe(
      "Hay 1 pestaña con cambios sin guardar. Al cerrar sesión se pierden.",
    );
  });
});

describe("que cierra a que, tal como el artboard lo dice", () => {
  it("abrir el menu de sesion cierra el lanzador", () => {
    // `abrirSesion` apaga `lanzador` y `pal` (linea 1685).
    render(<App />);
    fireEvent.click(botonDelLanzador());
    fireEvent.click(fichaDeSesion());
    expect(lanzador()).toBeNull();
    expect(menu()).not.toBeNull();
  });

  /**
   * **La otra mitad NO existe, y esta prueba lo fija a proposito.**
   *
   * `abrirLanzador` apaga solo `pal` (linea 1759): con el menu de sesion abierto, abrir el
   * lanzador deja los dos. No es un descuido del port —se leyo el artboard y se ejecuto—, y
   * tampoco es un choque: el lanzador cuelga de la izquierda (`left:10px`) y el menu de la
   * derecha (`right:0`), asi que no se pisan. Lo que si cuesta es que quedan dos fondos de
   * cierre apilados y hace falta pulsar dos veces fuera para cerrarlos.
   *
   * Se afirma para que cambiarlo tenga que ser una decision: si algun dia se cierra el menu al
   * abrir el lanzador, esta prueba sale roja y quien lo haga tendra que escribir por que se
   * separa del diseno.
   */
  it("pero abrir el lanzador NO cierra el menu de sesion, como en el artboard", () => {
    render(<App />);
    fireEvent.click(fichaDeSesion());
    fireEvent.click(botonDelLanzador());
    expect(menu()).not.toBeNull();
    expect(lanzador()).not.toBeNull();
  });

  it("y navegar por el arbol cierra el lanzador", () => {
    render(<App />);
    fireEvent.click(botonDelLanzador());
    abrirSeccion(SECCIONES[1]?.clave ?? "predios");
    expect(lanzador()).toBeNull();
  });
});
