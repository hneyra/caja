import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/App";
import { ENTIDAD, MODULO, NOMBRE_DE_LA_APLICACION } from "../src/aplicacion";

/**
 * El andamio se dibuja y dice su nombre.
 *
 * Es la prueba mas barata que existe y aun asi mide algo que ninguna otra mide: que la cadena
 * React → JSX → alias → jsdom esta entera. Rota cualquier pieza de esa cadena, esto sale rojo.
 *
 * **El escudo ya no esta aqui**: desde el issue de la barra global lo pinta la barra, con el
 * `alt` literal del artboard, y quien lo comprueba —incluida la peticion de verdad contra el
 * servidor de Vite— es `barra.test.tsx`. Dos escudos en la misma pagina no eran fidelidad al
 * diseno, eran un resto del andamio.
 */
afterEach(cleanup);

describe("el andamio de caja-web", () => {
  it("dibuja el nombre de la aplicacion", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: NOMBRE_DE_LA_APLICACION })).toBeDefined();
  });

  it("dice a que modulo y a que entidad sirve", () => {
    render(<App />);
    expect(screen.getByText(`${MODULO} · ${ENTIDAD}`)).toBeDefined();
  });

  it("dice que debajo de la barra todavia no hay pantalla", () => {
    render(<App />);
    expect(screen.getByText(/todavía no hay ninguna pantalla/)).toBeDefined();
  });
});
