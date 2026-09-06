import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App";
import { ENTIDAD, MODULO, NOMBRE_DE_LA_APLICACION } from "../src/aplicacion";

/**
 * El andamio se dibuja y dice a que sirve.
 *
 * Es la prueba mas barata que existe y aun asi mide algo que ninguna otra mide: que la cadena
 * React → JSX → alias → jsdom esta entera. Rota cualquier pieza de esa cadena, esto sale rojo.
 *
 * **El marcador de posicion ya no esta.** Hasta el issue de las pestanas, a la derecha del arbol
 * habia un `<h1>caja-web</h1>` y un parrafo diciendo que la pantalla llegaria despues; ahora
 * ese sitio lo ocupa el marco de verdad —la barra de pestanas, la fila del titulo y el hueco de
 * «No hay ningún submódulo abierto»—, asi que lo que se afirma aqui es lo que queda: que el
 * `<h1>` existe y lo pone el marco, que la entidad la dice la barra, y que las dos constantes
 * que identifican la aplicacion **siguen siendo las que el `<title>` del HTML escribe**.
 */
afterEach(cleanup);
beforeEach(() => window.history.replaceState(null, "", window.location.pathname));

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("el andamio de caja-web", () => {
  it("dibuja el marco, con el titulo de la seccion que arranca abierta", () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Panel de Tesorería");
  });

  it("la barra global dice a que entidad sirve", () => {
    render(<App />);
    expect(screen.getByText(ENTIDAD)).toBeDefined();
  });

  it("el `<title>` del HTML es el modulo y el nombre, sin escribirlos dos veces", () => {
    // `src/aplicacion.ts` es la fuente de verdad de como se llama esto. Si alguien renombra la
    // aplicacion y se olvida del HTML —o al reves—, esta prueba lo dice; sin ella, la pestana
    // del navegador y el codigo se separan en silencio.
    const html = readFileSync(join(RAIZ, "index.html"), "utf8");
    expect(html).toContain(`<title>${MODULO} · ${NOMBRE_DE_LA_APLICACION}</title>`);
  });
});
