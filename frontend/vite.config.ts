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
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: { port: 5181, strictPort: false },
  build: { target: "es2022" },
  test: {
    // `jsdom` para todo, incluida la prueba que linta las muestras: en Vitest el entorno del
    // navegador no quita los modulos de Node, asi que un solo entorno evita partir la suite.
    //
    // Con UNA excepcion, declarada en el propio archivo con `@vitest-environment happy-dom`:
    // `verificaciones/tokens.test.ts`. Medido, no supuesto: el `getComputedStyle` de jsdom
    // **ignora toda regla con pseudo-clase**, asi que un `input:focus` nunca aplica y la regla
    // de foco del diseno seria inverificable. happy-dom si la aplica.
    environment: "jsdom",
    globals: true,
    // Sin esto, `import "@/ds/global.css"` desde una prueba no inyecta nada y la prueba de los
    // tokens mediria un documento sin estilos: verde, y sin haber verificado nada. Con `css`
    // encendido es Vite quien resuelve la cadena de `@import`, o sea la misma que se despliega.
    css: true,
    include: ["verificaciones/**/*.test.{ts,tsx}"],
  },
});
