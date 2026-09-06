import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * Las reglas propias de `eslint.config.mjs` muerden.
 *
 * Cada prohibicion tiene su muestra que la viola, y esta prueba exige que ESLint la detecte.
 * **Una regla que no puede fallar no protege nada** — el mismo argumento por el que la prueba
 * de aislamiento del backend demuestra que el superusuario omite RLS en vez de afirmarlo, y el
 * mismo que sostiene `ReglasDeArquitecturaMuerdenTest`.
 *
 * Las muestras estan en `ignores` de la configuracion para que `yarn lint` no las senale; aqui
 * se lintan como texto, con una ruta sintetica dentro de `src/`, que es donde la regla tiene
 * que aplicar de verdad.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..");
const MUESTRAS = join(AQUI, "muestras");

/** Ruta sintetica: la muestra se juzga como si viviera en el codigo que se despliega. */
const rutaEnSrc = (nombre: string) => join(RAIZ, "src", nombre);

const eslint = new ESLint({ cwd: RAIZ });

async function mensajesDe(muestra: string, ruta: string): Promise<string[]> {
  const codigo = readFileSync(join(MUESTRAS, muestra), "utf8");
  const [resultado] = await eslint.lintText(codigo, { filePath: ruta });
  return (resultado?.messages ?? []).map((m) => `${m.ruleId ?? "?"}: ${m.message}`);
}

/**
 * Cada prohibicion, su muestra y el texto que la delata.
 *
 * El texto se escribe aqui a mano y NO se importa de `eslint.config.mjs`: importandolo, un
 * cambio de mensaje se propagaria a la prueba y la prueba no podria decir nunca que la regla
 * que salto no era la que se esperaba.
 */
const PROHIBICIONES: { prohibicion: string; muestra: string; delata: RegExp }[] = [
  {
    prohibicion: "identificador con tilde o eñe",
    muestra: "identificador-con-tilde.ts",
    delata: /Sin tildes ni eñe en identificadores/,
  },
  {
    prohibicion: "un importe declarado o convertido a number",
    muestra: "importe-como-number.ts",
    delata: /Un importe es texto y jamás number/,
  },
  {
    prohibicion: "una petición de red desde la interfaz",
    muestra: "peticion-de-red.ts",
    delata: /Esta interfaz no habla con nadie/,
  },
  {
    prohibicion: "un recurso pedido a la raíz del dominio",
    muestra: "recurso-en-la-raiz.ts",
    delata: /Un recurso no se pide a la raíz del dominio/,
  },
];

describe("cada regla propia tiene una muestra que la viola, y ESLint la detecta", () => {
  it.each(PROHIBICIONES)("$prohibicion", async ({ muestra, delata }) => {
    const mensajes = await mensajesDe(muestra, rutaEnSrc(muestra));
    expect(
      mensajes.some((m) => delata.test(m)),
      `Se esperaba un mensaje que casara con ${delata}. Se obtuvo:\n${
        mensajes.length === 0 ? "  (ninguno)" : mensajes.map((m) => `  · ${m}`).join("\n")
      }`,
    ).toBe(true);
  });
});

describe("el inventario de muestras esta completo", () => {
  it("no hay ninguna muestra que la prueba no recorra", () => {
    const enDisco = readdirSync(MUESTRAS).filter((n) => n.endsWith(".ts") || n.endsWith(".tsx"));
    const recorridas = PROHIBICIONES.map((p) => p.muestra);
    expect([...enDisco].sort()).toEqual([...recorridas].sort());
  });
});

describe("las muestras se juzgan por donde viven", () => {
  it("dentro de `verificaciones/` las prohibiciones estan apagadas a proposito", async () => {
    // Si no lo estuvieran, esta misma prueba —que trae la palabra prohibida en su texto— no
    // podria existir. Que este apagado ahi y encendido en `src/` es la propiedad que importa.
    const mensajes = await mensajesDe("peticion-de-red.ts", join(RAIZ, "verificaciones", "x.ts"));
    expect(mensajes.filter((m) => /Esta interfaz no habla con nadie/.test(m))).toEqual([]);
  });
});
