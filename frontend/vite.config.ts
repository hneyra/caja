import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/*
 * `caja-web` no habla con nadie.
 *
 * Aqui NO hay `server.proxy`, y no es un olvido: mientras esta interfaz no tenga backend,
 * un proxy declarado seria una invitacion a escribir la primera peticion sin que nadie lo
 * decida. La prohibicion esta ademas escrita como regla de ESLint, con su muestra.
 */
export default defineConfig({
  /*
   * La interfaz se sirve bajo `/caja`, y esto es la mitad que le toca a Vite.
   *
   * La otra mitad es el `stripPrefix` del `IngressRoute` (#17), y **no son alternativas**: las
   * cuatro combinaciones las midio #17 contra el nginx real de `nginx:1.31.4-alpine` con dos
   * `dist/` distintos, y solo la ultima funciona.
   *
   *   - `base: "/"` sin quitar el prefijo → nginx recibe `/caja/assets/index-<huella>.js`, no
   *     encuentra el archivo, cae en el `try_files` y contesta **200 text/html** con el
   *     `index.html` dentro. El navegador rechaza el modulo por su tipo y la pantalla queda en
   *     blanco, sin un solo error en el servidor: un 200 que miente.
   *   - `base: "/"` quitando el prefijo → nginx sirve bien lo que le llega, pero el navegador
   *     pide `/assets/...` **a la raiz del dominio**, que `PathPrefix(/caja)` no casa.
   *   - `base: "/caja/"` sin quitar el prefijo → el mismo 200 que miente.
   *   - `base: "/caja/"` **quitando el prefijo** → correcto: HTML, JS, PNG y recarga en
   *     `/caja/recibos`.
   *
   * Con la barra final: `import.meta.env.BASE_URL` vale exactamente esta cadena, y quien la use
   * concatena sin anadir ninguna. Que este valor y el `stripPrefix` no se puedan separar lo
   * vigila `infrastructure/verificaciones/descriptor.test.ts`, que ademas exige que no quede en
   * `src/` ninguna ruta absoluta a la raiz del dominio: Vite reescribe el `base` en el
   * `index.html` y en los recursos importados, pero **no dentro de un literal de JavaScript**.
   */
  base: "/caja/",
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: { port: 5181, strictPort: false },
  build: { target: "es2022" },
  test: {
    // `jsdom` para todo, incluida la prueba que linta las muestras: en Vitest el entorno del
    // navegador no quita los modulos de Node, asi que un solo entorno evita partir la suite.
    environment: "jsdom",
    globals: true,
    // Sin esto, `import "@/ds/global.css"` desde una prueba no inyecta nada y la prueba de los
    // tokens mediria un documento sin estilos: verde, y sin haber verificado nada. Con `css`
    // encendido es Vite quien resuelve la cadena de `@import`, o sea la misma que se despliega.
    css: true,
    include: ["verificaciones/**/*.test.{ts,tsx}"],
  },
});
