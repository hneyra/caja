import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Ningun importe de `src/` se declara como `number`.
 *
 * Regla 1 de CLAUDE.md (RNF-055) y forma real del contrato: el backend emite
 * `{ "importe": "482.50", "actualizadoA": "2026-09-06" }`, y un importe que pasa por `number`
 * pierde centimos sin avisar —`0.1 + 0.2` no es `0.3`— justo en la pantalla donde alguien cobra.
 *
 * <h2>Por que esto existiendo la regla de ESLint</h2>
 *
 * La regla de `eslint.config.mjs` mira **tipos**: `TSPropertySignature … TSNumberKeyword` y las
 * conversiones (`Number`, `parseFloat`, `parseInt`). Eso caza `readonly deudaTotal: number`, y no
 * caza lo que este directorio hace todo el rato, que es escribir **datos**:
 *
 * ```ts
 * { cod: "0003-0041184", deudaTotal: 3455.24 }
 * ```
 *
 * Ahi no hay ni un tipo escrito: el `number` lo pone TypeScript al inferirlo. Este escaner lee el
 * AST de cada archivo y mira las dos formas —la declaracion y el literal—, con **la misma lista de
 * campos de dinero que ESLint**, leida del texto de su configuracion para que no haya dos listas
 * que puedan separarse.
 *
 * <h2>Las excepciones</h2>
 *
 * Se declaran abajo, una a una y con su motivo. No se conceden escondiendo el campo del selector:
 * `valor` esta **dentro** de la lista de ESLint desde #5, la declaracion lleva su
 * `eslint-disable-next-line` con el motivo escrito al lado, y este archivo comprueba que siga ahi.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..");
const SRC = join(RAIZ, "src");
const CONFIG_DE_ESLINT = join(RAIZ, "eslint.config.mjs");

/** Una excepcion concedida: donde vive, que campo es y por que se le permite. */
interface Excepcion {
  readonly archivo: string;
  readonly campo: string;
  readonly motivo: string;
}

/**
 * Las excepciones, con su motivo. Hoy hay **una**.
 *
 * El motivo no es un tramite: es lo que la revision lee para decidir si la excepcion sigue siendo
 * cierta. «Existe solo para ordenar» deja de serlo el dia que alguien pinte ese campo, y entonces
 * hay que quitarlo de aqui, no ampliarlo.
 */
const EXCEPCIONES: readonly Excepcion[] = [
  {
    archivo: "datos/recibos-del-turno.ts",
    campo: "valor",
    motivo:
      "Es la clave con la que se ordena la lista de recibos, y nada mas: no se muestra, no se " +
      "suma y no viaja. Lo que se pinta es `autovaluo`, que es texto ('S/ 2,511.94'). Ordenar por " +
      "ese texto pondria 'S/ 18.19' por debajo de 'S/ 2,006.25'. El dia que haya backend, el orden " +
      "lo dara el ORDER BY de la consulta y este campo desaparece.",
  },
];

/** Como se escribe una excepcion al lado del codigo que la necesita. */
const DIRECTIVA = /eslint-disable-next-line\s+no-restricted-syntax\s+--\s+(\S.*)/;

/**
 * La lista de campos de dinero, leida del texto de `eslint.config.mjs`.
 *
 * No se copia: se lee. Con dos listas escritas a mano, ampliar una y no la otra deja el escaner
 * mirando menos campos que el lint sin que nada lo diga.
 */
const CAMPOS_DE_DINERO = (() => {
  const texto = readFileSync(CONFIG_DE_ESLINT, "utf8");
  return /const CAMPOS_DE_DINERO\s*=\s*"([^"]+)"/.exec(texto)?.[1] ?? "";
})();

/** Una infraccion encontrada: donde, que campo y de que forma. */
interface Ofensa {
  readonly archivo: string;
  readonly linea: number;
  readonly campo: string;
  /** `declaracion` es `campo: number`; `literal` es `campo: 3455.24` dentro de un objeto. */
  readonly forma: "declaracion" | "literal";
}

/** Los archivos de codigo bajo `src/`, en rutas relativas y con `/` en cualquier sistema. */
function archivosDeCodigo(carpeta: string): string[] {
  const encontrados: string[] = [];
  for (const entrada of readdirSync(carpeta, { withFileTypes: true })) {
    const ruta = join(carpeta, entrada.name);
    if (entrada.isDirectory()) encontrados.push(...archivosDeCodigo(ruta));
    else if (/\.tsx?$/.test(entrada.name)) encontrados.push(relative(SRC, ruta).split(sep).join("/"));
  }
  return encontrados.sort();
}

function nombreDe(nodo: ts.PropertyName): string | null {
  if (ts.isIdentifier(nodo) || ts.isStringLiteral(nodo)) return nodo.text;
  return null;
}

/** `3455.24` y tambien `-3455.24`, que es un numero con un signo delante y nada mas. */
function esLiteralNumerico(nodo: ts.Expression): boolean {
  if (ts.isNumericLiteral(nodo)) return true;
  return (
    ts.isPrefixUnaryExpression(nodo) &&
    (nodo.operator === ts.SyntaxKind.MinusToken || nodo.operator === ts.SyntaxKind.PlusToken) &&
    ts.isNumericLiteral(nodo.operand)
  );
}

function ofensasDe(archivo: string, codigo: string, esDeDinero: RegExp): Ofensa[] {
  const fuente = ts.createSourceFile(archivo, codigo, ts.ScriptTarget.ES2022, true);
  const ofensas: Ofensa[] = [];

  const anotar = (nodo: ts.Node, campo: string, forma: Ofensa["forma"]) => {
    if (!esDeDinero.test(campo)) return;
    const { line } = fuente.getLineAndCharacterOfPosition(nodo.getStart(fuente));
    ofensas.push({ archivo, linea: line + 1, campo, forma });
  };

  const visitar = (nodo: ts.Node): void => {
    if (
      (ts.isPropertySignature(nodo) || ts.isPropertyDeclaration(nodo)) &&
      nodo.type?.kind === ts.SyntaxKind.NumberKeyword
    ) {
      const campo = nombreDe(nodo.name);
      if (campo !== null) anotar(nodo, campo, "declaracion");
    }
    if (ts.isPropertyAssignment(nodo) && esLiteralNumerico(nodo.initializer)) {
      const campo = nombreDe(nodo.name);
      if (campo !== null) anotar(nodo, campo, "literal");
    }
    ts.forEachChild(nodo, visitar);
  };

  visitar(fuente);
  return ofensas;
}

const esDeDinero = new RegExp(`^(${CAMPOS_DE_DINERO})`, "i");

const fuentes = new Map(
  archivosDeCodigo(SRC).map((archivo) => [archivo, readFileSync(join(SRC, archivo), "utf8")]),
);

const OFENSAS = [...fuentes].flatMap(([archivo, codigo]) =>
  ofensasDe(archivo, codigo, esDeDinero),
);

const exceptuada = (ofensa: Ofensa) =>
  EXCEPCIONES.some((e) => e.archivo === ofensa.archivo && e.campo === ofensa.campo);

const comoTexto = (ofensa: Ofensa) =>
  `src/${ofensa.archivo}:${ofensa.linea}  ${ofensa.campo} (${ofensa.forma})`;

describe("la lista de campos de dinero es la de ESLint", () => {
  it("se lee de `eslint.config.mjs` y trae los campos de los que este escaner depende", () => {
    // Sin esta comprobacion, un cambio de forma en la configuracion dejaria la lista vacia y el
    // escaner recorreria `src/` entero sin poder senalar nada, en verde.
    expect(CAMPOS_DE_DINERO, "no se pudo leer CAMPOS_DE_DINERO de eslint.config.mjs").not.toBe("");
    expect(CAMPOS_DE_DINERO.split("|")).toEqual(
      expect.arrayContaining(["monto", "importe", "deuda", "total", "valor"]),
    );
  });
});

describe("ningun importe de `src/` se declara como number", () => {
  it("ni como tipo ni como literal, salvo lo que este en la lista de excepciones", () => {
    const sinExcusa = OFENSAS.filter((ofensa) => !exceptuada(ofensa));
    expect(
      sinExcusa.map(comoTexto),
      "Un importe es texto de punta a punta (regla 1 de CLAUDE.md, RNF-055). Si de verdad no es " +
        "un importe, dilo en EXCEPCIONES de esta prueba con su motivo.",
    ).toEqual([]);
  });
});

describe("las excepciones estan vivas y estan justificadas", () => {
  it("cada excepcion de la lista se corresponde con algo que existe", () => {
    // Una excepcion que ya no protege nada es peor que ninguna: se lee como que el campo sigue
    // ahi y nadie vuelve a mirarlo.
    const muertas = EXCEPCIONES.filter(
      (e) => !OFENSAS.some((o) => o.archivo === e.archivo && o.campo === e.campo),
    );
    expect(muertas.map((e) => `${e.archivo}: ${e.campo}`)).toEqual([]);
  });

  it("cada excepcion trae su motivo escrito", () => {
    expect(EXCEPCIONES.filter((e) => e.motivo.trim().length < 40)).toEqual([]);
  });

  it("la declaracion exceptuada lleva su `eslint-disable` con el motivo al lado", () => {
    const declaraciones = OFENSAS.filter((o) => o.forma === "declaracion" && exceptuada(o));

    // Que hoy haya exactamente una es parte de lo que se afirma: sin esto, el dia que la
    // excepcion desapareciera esta prueba pasaria recorriendo una lista vacia.
    expect(declaraciones.map(comoTexto)).toHaveLength(1);

    for (const declaracion of declaraciones) {
      const lineas = (fuentes.get(declaracion.archivo) ?? "").split("\n");
      const anterior = lineas[declaracion.linea - 2] ?? "";
      const motivo = DIRECTIVA.exec(anterior)?.[1] ?? "";
      expect(
        motivo.length,
        `src/${declaracion.archivo}:${declaracion.linea} declara \`${declaracion.campo}: number\` ` +
          "sin la directiva de ESLint con su motivo en la linea de arriba.",
      ).toBeGreaterThan(20);
    }
  });
});
