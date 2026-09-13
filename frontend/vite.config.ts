import process from 'node:process';

import tailwind from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { LO_QUE_PONE_EL_CONSUMIDOR } from './resolucion.ts';

/**
 * El empaquetado de `caja-web`, que es el de `rentas-web` con el prefijo de este sistema (#74).
 *
 * `base` es `/caja/` y no `/`: ADR-0030 §2 pone el sistema delante de la ruta, y el
 * mismo Traefik sirve las cuatro interfaces. Con `base: '/'` el bundle pediria
 * `/assets/…`, que en el cluster es de otro sistema — y el fallo no aparece en
 * desarrollo, donde todo cuelga de la raiz.
 */

/**
 * A donde van las peticiones de la API en desarrollo.
 *
 * Por variable de entorno, con el Traefik de la plataforma en el puerto **8080** por omision: es el
 * `${KAMAYUK_PUERTO_INGRESO:-8080}` de `infrastructure/despliegue/plataforma.compose.yaml`, medido
 * al copiar este archivo de `rentas`, que todavia dice 8082. Quien levante el backend en otro sitio
 * no tiene que editar este archivo para probar.
 */
const BACKEND = process.env.KAMAYUK_BACKEND ?? 'http://localhost:8080';

/**
 * La raiz de la API de este sistema. Tiene que ser la misma que `PREFIJO` de `api/cliente.ts` y que
 * `Api.RAIZ` del backend, y que lo sea lo comprueba `verificaciones/camino-a-la-api.test.ts`.
 */
const RAIZ_DE_LA_API = '/caja/api/v1';

export default defineConfig({
  base: '/caja/',
  /**
   * Tailwind v4, **desde #90**.
   *
   * No estaba antes y no podia estar: su *preflight* normaliza margenes, tipografia y filos de
   * todo el documento, y la V6 —3 446 lineas de CSS escritas a mano— se apoyaba en los valores
   * por omision del navegador. Encenderlo con las dos interfaces vivas le habria cambiado la cara
   * a la que se estaba sirviendo. Por eso la guarda de #91 compila la hoja DENTRO de la prueba: se
   * podia medir que los tokens llegan al CSS sin aplicarselo a nadie.
   */
  plugins: [tailwind(), react()],
  /**
   * **UNA sola copia de lo que los paquetes enlazados dan por puesto.**
   *
   * La lista NO se escribe: se deriva de las `peerDependencies` de cada `@kamayuk/*` enlazado.
   * El porque entero —con los dos rojos que costo, `Cannot read properties of null (reading
   * 'useId')` en local y `Cannot find module 'react'` en CI— esta en `resolucion.ts`.
   */
  resolve: {
    dedupe: [...LO_QUE_PONE_EL_CONSUMIDOR],
  },
  /**
   * El camino a la API en desarrollo, y **por que hace falta uno** (I-1, AC4).
   *
   * <h2>No es comodidad: es la unica via, y esta medido</h2>
   *
   * El backend **no publica ninguna cabecera `Access-Control-Allow-Origin`** —cero
   * `CorsConfiguration` y cero `@CrossOrigin` en todo `backend/`—, asi que una peticion de
   * `http://localhost:5181` a `http://localhost:8080` la bloquea el navegador antes de que
   * nadie la lea. La unica salida sin tocar el backend es que todo salga del **mismo origen**:
   * la pagina y la API por el puerto de Vite, y Vite reenviando a Traefik.
   *
   * <h2>Y sin esto el fallo no parece un fallo</h2>
   *
   * Sin `server.proxy`, `/caja/api/v1/...` lo atiende el propio servidor de Vite, que para
   * cualquier ruta desconocida devuelve el `index.html` de la aplicacion con un **200**. La
   * pantalla pide JSON y recibe HTML con un codigo de exito: no un error, una pagina. Es el
   * modo de fallo que `datos/servidas.ts` de `rentas` llevaba escrito como motivo para no
   * encender ninguna ruta.
   *
   * `rewrite` no hace falta y por eso no esta: Traefik enruta por `PathPrefix(/caja/api/v1)`, o sea
   * que la ruta que sale de aqui es exactamente la que el backend espera. Reescribirla seria
   * quitarle el prefijo por el que se enruta.
   */
  server: {
    /**
     * **5181, y estricto.** Es el puerto que `caja` documenta desde su primera interfaz, y deja correr
     * `rentas` (5173) al lado. `strictPort` porque si Vite se mudara en silencio al 5182, Keycloak
     * rechazaria el `redirect_uri` —el realm admite `localhost:5181`, no el siguiente libre— y el
     * sintoma seria un «Invalid parameter: redirect_uri» que no nombra el puerto.
     */
    port: 5181,
    strictPort: true,
    proxy: {
      [RAIZ_DE_LA_API]: {
        target: BACKEND,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    // Que el bundle sea reproducible importa mas que su tamano: la imagen se etiqueta con
    // el `sha` del repositorio (D), asi que dos construcciones del mismo `sha` tienen que
    // dar el mismo contenido.
    sourcemap: true,
  },
});
