import { HOJAS, SECCIONES } from "@/datos";

/**
 * El hash de la URL: lo unico de la navegacion que sobrevive a una recarga.
 *
 * Portado de `TesoreriaV6.dc.html` — `marcarHash` y `destDeHash`, lineas 1279-1297.
 *
 * <h2>`replaceState` y no `pushState`</h2>
 *
 * Lo dice el propio artboard en su comentario de las lineas 1279-1281: se escribe con
 * `replaceState` **para no llenar el historial ni provocar un salto de desplazamiento**. Con
 * `pushState`, moverse entre las cuatro secciones dejaria cuatro entradas y el boton de
 * «atras» del navegador desharia una navegacion que el usuario no recuerda haber hecho.
 *
 * <h2>Y envuelto en `try`/`catch`</h2>
 *
 * Tambien del artboard: «sin permiso de historial el hash es un extra». Un `about:srcdoc`, un
 * `file://` o una politica que prohiba tocar el historial hacen que `replaceState` lance; la
 * pantalla tiene que seguir funcionando, porque el hash no es de donde sale el estado — el
 * estado esta en React y el hash es su reflejo.
 *
 * <h2>Que es un destino y que es un slug</h2>
 *
 * El **destino** es la clave interna (`territorio`); el **slug** es lo que se escribe en la URL
 * (`cajas`). Para las cuatro secciones propias los dos difieren y el par lo declara `SECCIONES`
 * (`datos/navegacion.ts`); para los cuarenta y cuatro submodulos ajenos son la misma cadena,
 * que es lo que hace enlazable tambien una pestana de otro modulo. Medido sobre el artboard
 * ejecutado: `#cajas` da `territorio`, `#tra-pap` da `tra-pap`, y `#zzz`, `#` y el hash vacio
 * dan `null`.
 */

/** El slug con el que se escribe `destino` en la URL, o `null` si ese destino no existe. */
export function slugDeDestino(destino: string): string | null {
  const seccion = SECCIONES.find((x) => x.clave === destino);
  if (seccion !== undefined) return seccion.slug;
  return HOJAS[destino] === undefined ? null : destino;
}

/** El destino que nombra `slug`, o `null` si no nombra ninguno. */
export function destinoDeSlug(slug: string): string | null {
  const seccion = SECCIONES.find((x) => x.slug === slug);
  if (seccion !== undefined) return seccion.clave;
  return HOJAS[slug] === undefined ? null : slug;
}

/**
 * El destino que trae un `location.hash` («#cajas»), o `null` si no trae ninguno valido.
 *
 * Recibe el hash en vez de leerlo de `window` para poder comprobarse sin navegador ni DOM: es
 * una funcion pura y las quince entradas de la prueba lo son tambien.
 */
export function destinoDelHash(hash: string): string | null {
  return destinoDeSlug(hash.slice(1));
}

/**
 * Escribe el destino en la URL, **sin crecer el historial**.
 *
 * No hace nada si el destino no tiene slug —el artboard corta igual, linea 1283— ni si el hash
 * ya dice lo mismo, que es lo que evita una escritura por cada redibujo.
 */
export function marcarHash(destino: string): void {
  const slug = slugDeDestino(destino);
  if (slug === null) return;
  try {
    if (window.location.hash.slice(1) !== slug) {
      window.history.replaceState(null, "", "#" + slug);
    }
  } catch {
    // Sin permiso de historial: el hash es un extra y la pantalla sigue.
  }
}
