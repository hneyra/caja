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
    environment: "jsdom",
    globals: true,
    include: ["verificaciones/**/*.test.{ts,tsx}"],
  },
});
