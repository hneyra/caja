import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * **El filtro `paths:` de `infraestructura.yml` cubre lo que las pruebas del descriptor leen** (#136).
 *
 * `descriptor.test.ts` lee archivos de fuera de `infrastructure/` —el `Dockerfile` y el `nginx.conf`
 * de la interfaz, `vite.config.ts`, `frontend/src/`, el compose, `Api.java` y, desde #79,
 * `PublicadorDelBuzon.java`—, y el flujo solo corre cuando cambia algo de su lista. La lista se
 * escribia a mano y **`PublicadorDelBuzon.java` no estaba**: renombrar su perfil no hacia correr la
 * prueba que exige que el `Deployment` arranque ese mismo perfil. La guarda no se rompe: deja de
 * correr, en verde.
 *
 * Aqui se parsea con TypeScript cada archivo de codigo de `infrastructure/` y se recogen sus
 * **literales** que nombran algo de `backend/`, `frontend/` o `despliegue/` —los comentarios no
 * leen nada, y la prosa de este repositorio nombra muchos archivos—; cada ruta tiene que estar
 * cubierta en `push` **y** en `pull_request`. Un archivo, por un patron que lo case; un directorio
 * (`../../frontend/src/`), por uno que case todo lo de dentro. El analizador sabe `*` y `**`, y con
 * cualquier otro comodin de GitHub **lanza**: una duda sobre que cubre el filtro no sale en verde.
 *
 * Su gemela, sobre `frontend.yml`, es `frontend/verificaciones/la-ci-mira-lo-que-las-guardas-leen.test.ts`.
 * Van separadas a proposito: cada flujo se vigila desde la suite que ese flujo corre, o un cambio en
 * las pruebas de uno no despertaria la guarda del otro. Estan escritas igual; no se comparten porque
 * este paquete y el del frontend no se importan entre si.
 */

const AQUI = fileURLToPath(new URL("..", import.meta.url));
const REPOSITORIO = join(AQUI, "..");
const FLUJO = ".github/workflows/infraestructura.yml";
/** Este archivo: sus muestras son literales con rutas, y no son lecturas. */
const ESTE = "verificaciones/la-ci-mira-lo-que-el-descriptor-lee.test.ts";
const FUERA = new Set(["node_modules", "dist"]);
/** Lo de fuera de `infrastructure/` que una prueba de aqui puede leer. */
const DE_FUERA = /^(?:\.\.\/)*(?:backend|frontend|despliegue)(?:\/|$)/;

interface Lectura {
  readonly archivo: string;
  readonly ruta: string;
  readonly directorio: boolean;
}

function fuentes(desde = AQUI): readonly string[] {
  return readdirSync(desde).flatMap((entrada) => {
    if (FUERA.has(entrada)) return [];
    const ruta = join(desde, entrada);
    if (statSync(ruta).isDirectory()) return fuentes(ruta);
    return /\.(?:[cm]?js|tsx?)$/.test(entrada) ? [relative(AQUI, ruta).split(sep).join("/")] : [];
  });
}

function textoDe(nodo: ts.Node): string | undefined {
  if (ts.isStringLiteral(nodo) || ts.isNoSubstitutionTemplateLiteral(nodo)) return nodo.text;
  if (ts.isTemplateExpression(nodo)) return nodo.head.text;
  return undefined;
}

/** Las rutas de fuera que nombra un archivo en literales; los tramos seguidos de un `join(…)`, juntos. */
function lecturasDeFuera(archivo: string, fuente: string): readonly Lectura[] {
  const arbol = ts.createSourceFile(archivo, fuente, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  const textos: string[] = [];
  const juntados = new Set<ts.Node>();
  const visitar = (nodo: ts.Node): void => {
    if (ts.isCallExpression(nodo)) {
      const llamada = nodo.expression;
      const nombre = ts.isIdentifier(llamada)
        ? llamada.text
        : ts.isPropertyAccessExpression(llamada)
          ? llamada.name.text
          : "";
      if (nombre === "join" || nombre === "resolve") {
        let tramo: ts.Node[] = [];
        const cerrar = () => {
          if (tramo.length > 1) {
            textos.push(tramo.map((n) => textoDe(n) ?? "").join("/"));
            for (const n of tramo) juntados.add(n);
          }
          tramo = [];
        };
        for (const argumento of nodo.arguments) {
          if (ts.isStringLiteral(argumento) || ts.isNoSubstitutionTemplateLiteral(argumento)) tramo.push(argumento);
          else cerrar();
        }
        cerrar();
      }
    }
    const texto = juntados.has(nodo) ? undefined : textoDe(nodo);
    if (texto !== undefined) textos.push(texto);
    ts.forEachChild(nodo, visitar);
  };
  visitar(arbol);
  return textos
    .filter((texto) => DE_FUERA.test(texto))
    .map((texto) => {
      const ruta = texto.replace(/^(?:\.\.\/)+/, "").replace(/\/+$/, "");
      // Lo que existe se mira en el disco —`frontend/Dockerfile` no lleva extension y es un archivo—;
      // lo que no, por su forma: sin extension, un directorio.
      const enDisco = join(REPOSITORIO, ruta);
      const directorio = existsSync(enDisco)
        ? statSync(enDisco).isDirectory()
        : !/\.\w+$/.test(ruta.slice(ruta.lastIndexOf("/") + 1));
      return { archivo, ruta, directorio };
    });
}

/** Los patrones de `paths:` de un evento del `on:`, en linea o en bloque; `null` si no filtra. */
function patronesDelEvento(flujo: string, evento: string): readonly string[] | null {
  const lineas = flujo.split("\n");
  const inicioDelOn = lineas.findIndex((l) => /^on:\s*$/.test(l));
  if (inicioDelOn < 0) throw new Error("El flujo no tiene un bloque `on:` que este analizador sepa leer.");
  const delOn: string[] = [];
  for (const linea of lineas.slice(inicioDelOn + 1)) {
    if (/^\S/.test(linea)) break;
    delOn.push(linea);
  }
  const sangriaDe = (linea: string) => /^(\s*)/.exec(linea)?.[1]?.length ?? 0;
  const inicio = delOn.findIndex((l) => new RegExp(`^\\s+${evento}:\\s*$`).test(l));
  if (inicio < 0) throw new Error(`El \`on:\` del flujo no declara «${evento}».`);
  const delEvento: string[] = [];
  for (const linea of delOn.slice(inicio + 1)) {
    if (linea.trim() !== "" && sangriaDe(linea) <= sangriaDe(delOn[inicio] ?? "")) break;
    delEvento.push(linea);
  }
  if (delEvento.some((l) => /^\s+paths-ignore:/.test(l))) {
    throw new Error(`«${evento}» usa \`paths-ignore\`, y este analizador no lo sabe leer.`);
  }
  const i = delEvento.findIndex((l) => /^\s+paths:/.test(l));
  if (i < 0) return null;
  const enLinea = /^\s+paths:\s*\[(.*)\]\s*$/.exec(delEvento[i] ?? "");
  const patrones: string[] = [];
  if (enLinea) {
    for (const m of (enLinea[1] ?? "").matchAll(/"([^"]*)"|'([^']*)'/g)) patrones.push(m[1] ?? m[2] ?? "");
  } else {
    for (const linea of delEvento.slice(i + 1)) {
      if (linea.trim() === "" || /^\s*#/.test(linea)) continue;
      if (sangriaDe(linea) <= sangriaDe(delEvento[i] ?? "")) break;
      const item = /^\s*-\s*(?:"([^"]*)"|'([^']*)'|(\S+))\s*$/.exec(linea);
      if (item === null) throw new Error(`«${evento}»: no se entiende esta linea de \`paths:\`: ${linea.trim()}`);
      patrones.push(item[1] ?? item[2] ?? item[3] ?? "");
    }
  }
  if (patrones.length === 0) throw new Error(`«${evento}» declara \`paths:\` y no se leyo ningun patron.`);
  for (const patron of patrones) {
    if (/[?+[\]!]/.test(patron)) {
      throw new Error(`«${evento}»: el patron «${patron}» usa un comodin que este analizador no evalua.`);
    }
  }
  return patrones;
}

function comoExpresion(patron: string): RegExp {
  const cuerpo = patron
    .split("**")
    .map((trozo) => trozo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, "[^/]*"))
    .join(".*");
  return new RegExp(`^${cuerpo}$`);
}

function cubre(patrones: readonly string[] | null, lectura: Pick<Lectura, "ruta" | "directorio">): boolean {
  if (patrones === null) return true;
  const casa = (ruta: string) => patrones.some((p) => comoExpresion(p).test(ruta));
  return lectura.directorio
    ? casa(`${lectura.ruta}/Cualquiera.ts`) && casa(`${lectura.ruta}/un/nivel/Cualquiera.ts`)
    : casa(lectura.ruta);
}

const flujo = existsSync(join(REPOSITORIO, FLUJO)) ? readFileSync(join(REPOSITORIO, FLUJO), "utf8") : "";
const lecturas = fuentes()
  .filter((archivo) => archivo !== ESTE)
  .flatMap((archivo) => lecturasDeFuera(archivo, readFileSync(join(AQUI, archivo), "utf8")));

describe("#136 — lo que las pruebas del descriptor leen de fuera despierta a su CI", () => {
  it("EL CENTINELA: se leyeron las lecturas de fuera, y los dos filtros", () => {
    // Sin esto, un barrido que no encontrara nada felicitaria a un filtro sin compararlo con nada.
    const rutas = lecturas.map((l) => l.ruta);
    expect(rutas).toContain("backend/kamayuk-caja-plataforma/src/main/java/kamayuk/caja/web/Api.java");
    expect(rutas).toContain("frontend/nginx.conf");
    expect(rutas).toContain("despliegue/compose.yaml");
    expect(lecturas.find((l) => l.ruta === "frontend/src")?.directorio).toBe(true);
    expect(patronesDelEvento(flujo, "push")?.length ?? 0).toBeGreaterThan(3);
    expect(patronesDelEvento(flujo, "pull_request")?.length ?? 0).toBeGreaterThan(3);
  });

  it.each(["push", "pull_request"])("«%s» cubre cada archivo y cada directorio de fuera que una prueba lee", (evento) => {
    const patrones = patronesDelEvento(flujo, evento);
    const sinCubrir = [
      ...new Set(
        lecturas
          .filter((l) => !cubre(patrones, l))
          .map((l) => `  ${l.ruta}${l.directorio ? "/**" : ""}   (lo lee ${l.archivo})`),
      ),
    ];
    expect(
      sinCubrir,
      `El filtro \`paths:\` de «${evento}» en ${FLUJO} no cubre lo que estas pruebas leen:\n` +
        `${sinCubrir.join("\n")}\n\n` +
        "  Un cambio ahi no haria correr la prueba que lo mira: no se rompe, deja de correr, en\n" +
        "  verde. Anada la ruta a `paths:` de `push` Y de `pull_request` (#136).",
    ).toEqual([]);
  });

  it("el analizador ve lo que se lee y no lo que la prosa nombra, y lanza con lo que no evalua", () => {
    const fuente = [
      "// lee `backend/x/Comentado.java`",
      'const A = delRepositorio("backend/a/Uno.java");',
      'const B = fileURLToPath(new URL("../../frontend/src/", import.meta.url));',
      'const C = join(REPOSITORIO, "despliegue", "compose.yaml");',
    ].join("\n");
    expect(lecturasDeFuera("muestra.ts", fuente)).toEqual([
      { archivo: "muestra.ts", ruta: "backend/a/Uno.java", directorio: false },
      { archivo: "muestra.ts", ruta: "frontend/src", directorio: true },
      { archivo: "muestra.ts", ruta: "despliegue/compose.yaml", directorio: false },
    ]);
    const enBloque = 'on:\n  push:\n    paths:\n      - "frontend/src/**"\n      - backend/a/Uno.java\n';
    expect(patronesDelEvento(enBloque, "push")).toEqual(["frontend/src/**", "backend/a/Uno.java"]);
    expect(cubre(["frontend/src/**"], { ruta: "frontend/src", directorio: true })).toBe(true);
    expect(cubre(["frontend/src/*.ts"], { ruta: "frontend/src", directorio: true })).toBe(false);
    expect(() => patronesDelEvento('on:\n  push:\n    paths: ["!frontend/**"]\n', "push")).toThrow(/no evalua/);
  });
});
