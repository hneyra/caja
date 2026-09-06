import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Ningun recurso de `src/` se pide a la raiz del dominio.
 *
 * La interfaz se sirve bajo `/caja` —`vite.config.ts` declara `base: "/caja/"` y el
 * `IngressRoute` quita el prefijo (#17)—, y **Vite reescribe el `base` en el `index.html` y en
 * los recursos importados, pero no dentro de un literal de JavaScript**. Medido sobre el `dist/`:
 * con `base: "/caja/"` puesto y el `src="/escudo-catacaos.png"` de #6 todavia escrito a mano,
 * `dist/index.html` decia `/caja/escudo-catacaos.png` y `dist/assets/index-*.js` seguia diciendo
 * `"/escudo-catacaos.png"` (`grep -c` da 1 y 0). Esa peticion se va a la raiz del dominio, que es
 * una ruta que `PathPrefix(/caja)` no casa: 404, y la barra sin escudo.
 *
 * <h2>Por que esto existiendo la regla de ESLint</h2>
 *
 * `eslint.config.mjs` prohibe el mismo literal con un selector de AST, y hace falta: salta al
 * escribirlo. Lo que un selector de AST **no** ve es lo que este escaner mira, y son dos cosas
 * medidas, no supuestas:
 *
 *   1. un **literal de plantilla** — `` `/estorbo.png` `` es un `TemplateElement`, no un
 *      `Literal`, y el selector no lo caza;
 *   2. el **CSS** de `src/ds/`, que ESLint ni siquiera linta: un `url(/estorbo.png)` alli es
 *      exactamente la misma peticion a la raiz del dominio.
 *
 * <h2>Sobre el codigo sin comentarios</h2>
 *
 * Se quitan los comentarios antes de mirar, y no es cosmetico: `BarraGlobal.tsx` **habla** de la
 * ruta prohibida para explicar por que no la escribe, y `vite.config.ts` tambien. Un escaner que
 * mirase el archivo entero pondria rojo la explicacion de la propia prohibicion — es el mismo
 * hallazgo que #16 anoto sobre `grep -c proxy_pass` y #10 sobre los rotulos del panel.
 *
 * <h2>Que NO se mira, y por que</h2>
 *
 * `index.html` no: ahi el `href="/escudo-catacaos.png"` del favicon **si** lo reescribe Vite —el
 * `dist/index.html` lo demuestra—, asi que marcarlo seria prohibir la forma correcta. Y una ruta
 * sin extension tampoco: `"/caja/api/v1/pagos"` no es un recurso de este nginx, y el dia que haya
 * backend esa ruta sera la buena.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const SRC = join(AQUI, "..", "src");

/** Extensiones de recurso, las mismas que `eslint.config.mjs` reconoce. */
const RECURSOS = "png|jpe?g|gif|svg|webp|avif|ico|woff2?|css|js|mjs|json";

/** Una ruta absoluta encontrada: donde estaba, que decia y con que forma se escribio. */
interface Hallazgo {
  readonly archivo: string;
  readonly ruta: string;
  readonly forma: "literal" | "url()";
}

/**
 * El texto sin comentarios.
 *
 * El `[^:]` de la segunda sustitucion evita comerse `https://…`: sin el, media cabecera de este
 * repositorio desapareceria y el escaner miraria menos codigo del que dice mirar.
 */
export function sinComentarios(texto: string, esCss: boolean): string {
  const sinBloques = texto.replace(/\/\*[\s\S]*?\*\//g, "");
  return esCss ? sinBloques : sinBloques.replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Las rutas absolutas a la raiz del dominio que hay en un texto ya sin comentarios. */
export function absolutasEn(texto: string, esCss: boolean): Omit<Hallazgo, "archivo">[] {
  const hallazgos: Omit<Hallazgo, "archivo">[] = [];
  const limpio = sinComentarios(texto, esCss);
  // Entre comillas, comilla simple o tilde invertida: las tres formas de escribir una cadena.
  for (const m of limpio.matchAll(
    new RegExp(`["'\`](/[A-Za-z0-9._~/-]+\\.(?:${RECURSOS}))["'\`]`, "g"),
  )) {
    hallazgos.push({ ruta: m[1]!, forma: "literal" });
  }
  // Y la del CSS, que no lleva comillas obligatorias.
  for (const m of limpio.matchAll(/url\(\s*["']?(\/[^)"'\s]+)["']?\s*\)/g)) {
    hallazgos.push({ ruta: m[1]!, forma: "url()" });
  }
  return hallazgos;
}

/** Todo lo que se despliega: los `.ts`, los `.tsx` y el CSS de `src/`. */
function fuentes(): { archivo: string; texto: string; esCss: boolean }[] {
  return readdirSync(SRC, { recursive: true, encoding: "utf8" })
    .filter((n) => /\.(tsx?|css)$/.test(n))
    .map((n) => ({
      archivo: n,
      texto: readFileSync(join(SRC, n), "utf8"),
      esCss: n.endsWith(".css"),
    }));
}

describe("ningun recurso de `src/` se pide a la raiz del dominio", () => {
  it("hay archivos que mirar: un escaner sobre cero archivos siempre sale verde", () => {
    // «No encontro nada» y «no miro nada» se leen igual en la salida. Las dos cifras de abajo son
    // las que distinguen un verde de un vacio.
    const todas = fuentes();
    expect(todas.filter((f) => !f.esCss).length).toBeGreaterThan(30);
    expect(todas.filter((f) => f.esCss).length).toBeGreaterThan(0);
  });

  it("no queda ninguna, ni en el codigo ni en el CSS", () => {
    const hallazgos: Hallazgo[] = fuentes().flatMap(({ archivo, texto, esCss }) =>
      absolutasEn(texto, esCss).map((h) => ({ archivo, ...h })),
    );
    expect(
      hallazgos.map((h) => `${h.archivo}: ${h.ruta} (${h.forma})`),
      "Vite no reescribe el `base` dentro de un literal, asi que esa peticion se va a la raiz " +
        "del dominio y `PathPrefix(/caja)` no la casa. Se cuelga de `import.meta.env.BASE_URL`, " +
        "que ya termina en barra.",
    ).toEqual([]);
  });
});

describe("el escaner muerde, y sabe distinguir", () => {
  /**
   * Las tres formas que hay que cazar. La primera la caza tambien ESLint; **la segunda y la
   * tercera no**, y son la razon de que este archivo exista al lado de la regla.
   */
  it.each([
    { forma: "un literal de cadena", esCss: false, codigo: 'const a = "/escudo-catacaos.png";' },
    { forma: "un literal de plantilla", esCss: false, codigo: "const a = `/escudo-catacaos.png`;" },
    { forma: "un `url()` del CSS", esCss: true, codigo: "body { background: url(/escudo.png) }" },
  ])("caza $forma", ({ codigo, esCss }) => {
    expect(absolutasEn(codigo, esCss).length).toBe(1);
  });

  /**
   * Y lo que NO tiene que marcar. Sin esta mitad, un escaner que marcara todo cumpliria la de
   * arriba y dejaria `src/` en rojo permanente — que es la forma mas rapida de que una
   * verificacion se apague.
   */
  it.each([
    { forma: "una ruta relativa", esCss: false, codigo: 'const a = "escudo-catacaos.png";' },
    {
      forma: "la forma correcta, colgada del `base`",
      esCss: false,
      codigo: "const a = `${import.meta.env.BASE_URL}escudo-catacaos.png`;",
    },
    { forma: "un hash de seccion", esCss: false, codigo: 'const a = "#recibos";' },
    { forma: "una ruta de API sin extension", esCss: false, codigo: 'const a = "/caja/api/v1";' },
    { forma: "una URL de un tercero", esCss: false, codigo: 'const a = "https://x.test/y.css";' },
    {
      forma: "la ruta prohibida dentro de un comentario que la explica",
      esCss: false,
      codigo: '// Aqui NO se escribe "/escudo-catacaos.png".\nconst a = 1;',
    },
    {
      forma: "la ruta prohibida dentro de un comentario de bloque del CSS",
      esCss: true,
      codigo: "/* nada de url(/escudo.png) */\nbody { color: red }",
    },
  ])("no marca $forma", ({ codigo, esCss }) => {
    expect(absolutasEn(codigo, esCss)).toEqual([]);
  });
});
