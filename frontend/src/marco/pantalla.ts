import type { ReactNode } from "react";
import type { ClaveDeSeccion } from "@/datos";
import type { Destino } from "@/marco/destino";

/**
 * El contrato entre el marco y la pantalla que dibuja la seccion activa.
 *
 * <h2>Por que el marco no sabe cual es cual</h2>
 *
 * El marco —pestanas, titulo, hash y cierre— no tiene por que saber que pantalla dibuja cada
 * seccion. `App` recibe **el componente** que pinta la seccion activa y lo llama con
 * {@link PropsDePantalla}; quien reparte es `pantallas/PantallaDeSeccion`. Portar una pantalla
 * nunca toco el marco, que era la propiedad que esta ranura compraba.
 *
 * <h2>Lo que este archivo tenia hasta #14, y por que ya no</h2>
 *
 * Se llamaba `MarcadorDeSeccion.tsx` y ademas del contrato traia el **hueco**: la tarjeta con
 * borde discontinuo que decia en pantalla «la pantalla de «X» se porta en un issue siguiente».
 * Con las cuatro portadas ya no queda ninguna seccion que mandar alli, y el `switch` de
 * `PantallaDeSeccion` cubre la union entera sin `default`. Un componente al que no llega nadie
 * no protege de nada: lo que protege hoy es el propio exhaustivo, que se pone rojo en `tsc` el
 * dia que aparezca una quinta seccion.
 *
 * La ranura sigue siendo tambien lo unico que hace observable `fijarCampo` —la forma del
 * artboard (`set(k, v)`, linea 1352) de ensuciar una pestana—, y por eso las pruebas del marco
 * enchufan por ella una pantalla que edita un campo.
 */

/** Lo que el marco le da a la pantalla que dibuja la seccion activa. */
export interface PropsDePantalla {
  /** Cual de las cuatro secciones propias se esta dibujando. */
  readonly seccion: ClaveDeSeccion;
  /**
   * **Con que estado se abre**: el `extra` del `ir(dest, extra)` del artboard (linea 1343).
   *
   * Es lo que distingue dos aperturas de la misma seccion: «Cajas y arqueo» con el `nodo` 2 no
   * es la misma pantalla que con el 4, y «Recibos» con un `recibo` elegido no es la misma que
   * la lista sin seleccion. Lo pone quien navega —el arbol, la paleta, la barra de pestanas o
   * una fila del panel— y lo lee la pantalla que se dibuja.
   */
  readonly destino: Destino;
  /**
   * Navegar a otra seccion, con el estado con el que quiere que se abra.
   *
   * Es **el mismo `irA` del marco** por el que pasan el arbol y la paleta, y por eso una
   * pantalla no toca ni el hash ni las pestanas: eso es del marco. Una pantalla que navegara
   * por su cuenta dejaria la seccion cambiada y la pestana sin abrir, que es el defecto que el
   * propio artboard tiene al arrancar con un hash valido (ver `usarPestanas`).
   */
  readonly irA: (clave: string, extra?: Destino) => void;
  /** Guarda el valor de un campo y **marca sucia** la pestana activa. Es el `set` de la 1352. */
  readonly fijarCampo: (clave: string, valor: string) => void;
  /** El valor de un campo, o `porOmision` si nadie lo ha tocado. Es el `val` de la 1358. */
  readonly valorDeCampo: (clave: string, porOmision: string) => string;
  /**
   * Tira lo escrito en todos los campos: el `vals: {}` del artboard.
   *
   * Lo necesita quien cambia **de que ficha** se esta hablando. En `#recibos` son tres cosas:
   * empezar un cobro nuevo, abrir un recibo de la lista y descartar el borrador. Sin esto, lo
   * escrito en un cobro se leeria en el recibo que se abre despues, porque el mapa de campos es
   * uno solo — y lo es tambien en el artboard.
   */
  readonly limpiarCampos: () => void;
  /**
   * Sacar un toast. Es el `this.setState({ toast: … })` que el artboard escribe por todas partes.
   *
   * Entra con #12 y **cierra un hueco que #11 dejo declarado**: sin el, una pantalla no tenia
   * con que avisar, y el «Cobrar» del vacio de la lista dejaba el destino puesto sin decir nada.
   * El toast y su reloj siguen viviendo en el marco (`usarToast`), que es lo unico que garantiza
   * que haya **uno** y que se cancele al desmontar.
   */
  readonly avisar: (texto: string) => void;
}

/** El componente que dibuja una seccion propia. */
export type Pantalla = (props: PropsDePantalla) => ReactNode;
