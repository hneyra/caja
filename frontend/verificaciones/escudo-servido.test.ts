// @vitest-environment node
//
// El escudo se pide de verdad, no se lee del JSX.
//
// El criterio 3 del issue de la barra dice literalmente «comprobado en `yarn dev` o en el arnes,
// **no leyendo el JSX**», y tiene motivo: `expect(img.src).toBe('/escudo-catacaos.png')` sigue
// verde con el archivo borrado, con el archivo vacio y con el archivo fuera de `public/`. Lo
// unico que distingue esos tres casos es preguntarle a un servidor.
//
// Por eso esta prueba levanta el servidor de desarrollo de Vite —el mismo que sirve `yarn dev`—
// y hace un GET. Corre en el entorno `node` y usa `node:http` a proposito: el `fetch` de un
// emulador de DOM tiene su propia idea del origen y de CORS, y aqui lo que se quiere medir es
// el servidor, no el emulador.
//
// Esto NO es «la interfaz habla con alguien». La prohibicion de red de `eslint.config.mjs`
// protege `src/`, que es lo que se despliega; una prueba que arranca su propio servidor en el
// puerto 0 y le pide un PNG no es una peticion de la aplicacion a nadie.
import { request } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const RUTA = "/escudo-catacaos.png";
/** El prefijo bajo el que se sirve la interfaz, o sea el `base` de `vite.config.ts` sin su barra. */
const PREFIJO = "/caja";

/** Los ocho bytes con los que empieza todo PNG. Un archivo vacio o un HTML de error no los trae. */
const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface Respuesta {
  readonly estado: number;
  readonly tipo: string;
  readonly cuerpo: Buffer;
}

function pedir(url: string): Promise<Respuesta> {
  return new Promise((resolver, rechazar) => {
    const peticion = request(url, (respuesta) => {
      const trozos: Buffer[] = [];
      respuesta.on("data", (trozo: Buffer) => trozos.push(trozo));
      respuesta.on("end", () =>
        resolver({
          estado: respuesta.statusCode ?? 0,
          tipo: String(respuesta.headers["content-type"] ?? ""),
          cuerpo: Buffer.concat(trozos),
        }),
      );
    });
    peticion.on("error", rechazar);
    peticion.end();
  });
}

let servidor: ViteDevServer;
/** Donde escucha el servidor, **con el prefijo**: `http://localhost:<puerto>/caja`. */
let base = "";
/** El mismo servidor sin el prefijo, que es donde el escudo NO tiene que estar. */
let origen = "";

beforeAll(async () => {
  // Se carga `vite.config.ts`, el de verdad: lo que hay que comprobar es que **`yarn dev`**
  // sirva el escudo, no que un servidor de juguete lo sirva. Con `configFile: false` la prueba
  // pasaba igual y ademas escupia el fallo del escaneo de dependencias —`@/ds/global.css` sin
  // el alias—, o sea que medir el servidor equivocado ya se estaba notando.
  //
  // El puerto 0 es el unico ajuste: el del proyecto es fijo, y una prueba no puede pelearse
  // por el con un `yarn dev` que este levantado al lado.
  //
  // `noDiscovery` apaga el rastreo de dependencias, que no toca nada de lo que aqui se mide
  // —`public/` se sirve igual— y que, al cerrarse el servidor antes de terminar, dejaba un
  // «The server is being restarted or closed» de tres pantallas en la salida de `yarn test`.
  servidor = await createServer({
    root: RAIZ,
    logLevel: "error",
    server: { port: 0, strictPort: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  await servidor.listen();
  // `resolvedUrls` trae el `base` dentro —medido: `["http://localhost:5174/caja/"]`—, que es
  // exactamente lo que hace falta aqui: la aplicacion se sirve bajo el prefijo, no en la raiz.
  const local = servidor.resolvedUrls?.local ?? [];
  base = (local[0] ?? "").replace(/\/$/, "");
  origen = base === "" ? "" : new URL(base).origin;
}, 60_000);

afterAll(async () => {
  await servidor?.close();
});

describe("el escudo se sirve desde `/caja/escudo-catacaos.png`", () => {
  it("el servidor de Vite arranco, y sirve bajo el prefijo", () => {
    // Sin esto, un `base` vacio dejaria a las de abajo pidiendole a una URL invalida y
    // fallando por el motivo equivocado. Y el `/caja` del final no es decoracion: es lo que
    // dice que `vite.config.ts` declara su `base`, medido en el servidor y no leido del archivo.
    expect(base).toMatch(new RegExp(`^http://(localhost|127\\.0\\.0\\.1):\\d+${PREFIJO}$`));
  });

  it("responde 200 con un PNG, y con el archivo entero", async () => {
    const respuesta = await pedir(base + RUTA);
    expect(respuesta.estado).toBe(200);
    expect(respuesta.tipo).toContain("image/png");
    expect(respuesta.cuerpo.subarray(0, 8)).toEqual(FIRMA_PNG);
    expect(respuesta.cuerpo.length).toBe(readFileSync(join(RAIZ, "public", "escudo-catacaos.png")).length);
  });

  it("una ruta que no existe responde 200 con el `index.html`, y por eso el 200 no basta", async () => {
    // **Medido, y no supuesto.** La primera version de esta prueba afirmaba «una ruta que no
    // existe NO responde 200» y salio roja: el servidor de desarrollo de Vite contesta 200 con
    // el `index.html` para cualquier ruta desconocida, que es lo que hace falta para que una
    // aplicacion de una sola pagina se pueda recargar en cualquier URL.
    //
    // Lo que eso significa es lo importante: **un 200 no prueba que el escudo exista**. Lo que
    // lo prueba son las otras tres aserciones de la prueba de arriba —el `content-type`, la
    // firma PNG y el tamano exacto—, y esta esta aqui para dejar dicho por que hacen falta las
    // tres. Con el escudo borrado de `public/`, la prueba de arriba recibiria este mismo HTML.
    const respuesta = await pedir(base + "/escudo-que-no-existe.png");
    expect(respuesta.estado).toBe(200);
    expect(respuesta.tipo).not.toContain("image/png");
    expect(respuesta.cuerpo.subarray(0, 8)).not.toEqual(FIRMA_PNG);
  });

  it("y en la RAIZ del dominio no esta: por eso el `src` no puede ser un literal", async () => {
    // La otra mitad de la de arriba, y la que este issue existe para poder afirmar. Hasta #37 el
    // JSX escribia `src="/escudo-catacaos.png"`, y Vite **no reescribe un literal de cadena de
    // JavaScript**: con la aplicacion servida bajo `/caja`, esa peticion sale a la raiz del
    // dominio. Aqui se mide que ahi no hay nada — 404 `text/plain`, medido — y en el despliegue
    // es peor que un 404 propio: es una ruta que `PathPrefix(/caja)` ni siquiera casa.
    //
    // Sin esta prueba, «el escudo se sirve» seguiria en verde con el literal puesto: lo serviria
    // el servidor de desarrollo desde la raiz, que es donde el navegador NO va a pedirlo.
    const respuesta = await pedir(origen + RUTA);
    expect(respuesta.estado).toBe(404);
    expect(respuesta.tipo).not.toContain("image/png");
    expect(respuesta.cuerpo.subarray(0, 8)).not.toEqual(FIRMA_PNG);
  });
});
