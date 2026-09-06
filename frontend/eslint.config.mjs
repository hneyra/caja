import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Las reglas de `caja-web`.
 *
 * Lo mismo que hace ArchUnit en el backend: **toda prohibicion que pueda expresarse como
 * verificacion automatica se expresa asi**. Una prohibicion que solo vive en un documento se
 * incumple en seis meses, y nadie se entera.
 *
 * Cada regla propia de este archivo tiene su muestra que la viola en
 * `verificaciones/muestras/`, y `verificaciones/reglas-de-eslint.test.ts` exige que muerda:
 * **una regla que no puede fallar no protege nada**. Es la misma exigencia que
 * `ReglasDeArquitecturaMuerdenTest` impone en el backend de este repositorio.
 *
 * Si anades una regla, anade su muestra y su fila en `PROHIBICIONES`. La prueba no lo puede
 * adivinar, pero la revision si lo puede leer.
 */

/**
 * Nombres de campo que llevan dinero. Sobre ellos no se declara `number` ni se convierte a
 * `number`: un importe es texto de punta a punta (regla 1 de CLAUDE.md, RNF-055).
 *
 * `valor` entra en la lista con #5, y entra **sabiendo** que `src/datos/recibos-del-turno.ts`
 * declara uno: la alternativa era dejarlo fuera del selector, y una excepcion que se consigue no
 * mirando no es una excepcion, es un hueco. Declarado esta, con su `eslint-disable` y su motivo
 * escrito al lado, y ademas en la lista de `verificaciones/importes-de-datos.test.ts`.
 *
 * La misma cadena la lee ese escaner —**del texto de este archivo**, para que no haya dos listas—
 * y con ella mira lo que un selector de AST no puede ver: un `deudaTotal: 3455.24` suelto dentro de
 * un objeto de datos, que no declara ningun tipo.
 */
const CAMPOS_DE_DINERO =
  "monto|importe|saldo|deuda|total|insoluto|interes|recargo|vuelto|recibido|efectivo|pagado|valor";

/** Tildes y enie: prohibidas en identificadores. Checkstyle hace lo mismo en el backend. */
const LETRAS_ACENTUADAS = "áéíóúÁÉÍÓÚñÑüÜ";

/**
 * Extensiones de recurso: lo que un navegador pide por su cuenta despues de cargar la pagina.
 *
 * Sirven para reconocer una ruta absoluta a la raiz del dominio escrita a mano. Sin extension no
 * se marca nada: `"/caja/api/v1/pagos"` no es un recurso servido por este nginx, y marcarlo
 * pondria rojo el dia que haya backend por un motivo que no es este.
 */
const RECURSOS = "png|jpe?g|gif|svg|webp|avif|ico|woff2?|css|js|mjs|json";

/** El texto que delata cada prohibicion. La prueba busca exactamente estos. */
const MENSAJES = {
  tilde:
    "Sin tildes ni eñe en identificadores: «alicuota», no «alícuota». " +
    "El texto con tildes va en las cadenas, no en los nombres.",
  importe:
    "Un importe es texto y jamás number: como number pierde céntimos " +
    "(regla 1 de CLAUDE.md, RNF-055). La cifra la calcula el backend, no esta interfaz.",
  red:
    "Esta interfaz no habla con nadie: sin fetch y sin XMLHttpRequest. " +
    "Los datos salen de src/datos/, y el día que haya backend será una decisión con su ADR, " +
    "no un fetch suelto dentro de una pantalla.",
  ruta:
    "Un recurso no se pide a la raíz del dominio: se cuelga de `import.meta.env.BASE_URL`. " +
    "Vite reescribe el base en el index.html y en los recursos importados, pero NO dentro de " +
    "un literal de JavaScript, así que esta petición se iría fuera de /caja y sería un 404.",
};

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      // Violan las reglas a proposito. Se lintan desde la prueba, no desde `yarn lint`:
      // si `yarn lint` las senalara, el andamio naceria en rojo.
      "verificaciones/muestras/**",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.es2022 },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      "no-restricted-syntax": [
        "error",

        // —— Idioma de CLAUDE.md: sin tildes ni enie en identificadores ——
        {
          selector: `Identifier[name=/[${LETRAS_ACENTUADAS}]/]`,
          message: MENSAJES.tilde,
        },

        // —— Regla 1 de CLAUDE.md: un importe es texto, nunca `number` (RNF-055) ——
        // Dos formas de romperla, y las dos cuentan: DECLARARLO number, y CONVERTIRLO.
        {
          selector: `TSPropertySignature[key.name=/^(${CAMPOS_DE_DINERO})/i] TSNumberKeyword`,
          message: MENSAJES.importe,
        },
        {
          selector: `PropertyDefinition[key.name=/^(${CAMPOS_DE_DINERO})/i] TSNumberKeyword`,
          message: MENSAJES.importe,
        },
        {
          selector: `CallExpression[callee.name=/^(Number|parseFloat|parseInt)$/] > MemberExpression[property.name=/^(${CAMPOS_DE_DINERO})/i]`,
          message: MENSAJES.importe,
        },
        {
          selector: "CallExpression[callee.name=/^(parseFloat)$/]",
          message: MENSAJES.importe,
        },

        // —— Esta interfaz no habla con nadie ——
        {
          selector: "CallExpression[callee.name='fetch']",
          message: MENSAJES.red,
        },
        {
          selector: "MemberExpression[property.name='fetch']",
          message: MENSAJES.red,
        },
        {
          selector: "NewExpression[callee.name='XMLHttpRequest']",
          message: MENSAJES.red,
        },
        {
          selector: "MemberExpression[property.name='sendBeacon']",
          message: MENSAJES.red,
        },

        // —— La interfaz se sirve bajo `/caja`: ningun recurso a la raiz del dominio ——
        // Caza `"/escudo-catacaos.png"` y tambien `"/caja/escudo-catacaos.png"`: escribir el
        // prefijo a mano es la misma ruta absoluta, y ademas duplica el `base` de Vite.
        //
        // Mira **literales de cadena**, que es donde estaba el defecto. Lo que un selector de
        // AST no puede ver —un literal de plantilla, o un `url(/x.png)` en el CSS de `src/ds/`,
        // que ESLint ni linta— lo mira `verificaciones/rutas-absolutas.test.ts` sobre el texto.
        {
          selector: `Literal[value=/^\\/[^\\s"'\`]*\\.(?:${RECURSOS})$/]`,
          message: MENSAJES.ruta,
        },
      ],
    },
  },

  {
    // Las pruebas corren en Node y ademas HABLAN de lo prohibido: la de las reglas linta las
    // muestras, y una de ellas trae la palabra `fetch` dentro. Aqui las prohibiciones se
    // apagan; lo que protegen es `src/`, que es lo que se despliega.
    files: ["verificaciones/**/*.{ts,tsx}", "*.ts", "*.mjs"],
    languageOptions: { globals: { ...globals.node } },
    rules: { "no-restricted-syntax": "off" },
  },

  {
    // Los arneses de navegador (`verificaciones/*.mjs`) viven **en los dos mundos a la vez**:
    // el archivo corre en Node —`process`, `console`— y los cuerpos que se pasan a
    // `page.evaluate` corren dentro del navegador, con su `document` y su `URL`. Sin este
    // bloque, `eslint .` saca doce `no-undef` sobre codigo que funciona; se midio antes de
    // escribirlo. El patron es `verificaciones/**/*.mjs` y no `*.mjs`, que solo casa la raiz.
    files: ["verificaciones/**/*.mjs"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: { "no-restricted-syntax": "off" },
  },
);
