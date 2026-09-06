import type { ReactNode } from "react";
import type { ClaveDeSeccion } from "@/datos";
import { SECCIONES } from "@/datos";
import type { Destino } from "@/marco/destino";

/**
 * El hueco de una de las cuatro pantallas propias, mientras la pantalla no esta portada.
 *
 * <h2>Por que el marco no sabe cual es cual</h2>
 *
 * El marco —pestanas, titulo, hash y cierre— no tiene por que saber que pantalla dibuja cada
 * seccion. `App` recibe **el componente** que pinta la seccion activa y lo llama con
 * {@link PropsDePantalla}; quien reparte es `pantallas/PantallaDeSeccion`, que desde #10 manda
 * `panel` al Panel de Tesoreria y las otras tres aqui. Portar una mas no toca el marco.
 *
 * Esa ranura es tambien lo unico que hace observable `fijarCampo`, que es la forma —la del
 * artboard, su `set(k, v)` de la linea 1352— de ensuciar una pestana: una pantalla que edita un
 * campo lo llama y el marco pone el ` *`, el aviso de cerrar y el dialogo. Ninguna de las
 * pantallas portadas tiene campos todavia, asi que hoy solo lo llaman las pruebas del marco.
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
}

/** El componente que dibuja una seccion propia. */
export type Pantalla = (props: PropsDePantalla) => ReactNode;

/** El texto del marcador, compuesto con el rotulo de la seccion. */
export const textoDelMarcador = (rotulo: string) =>
  `La pantalla de «${rotulo}» se porta en un issue siguiente. El marco ya funciona: se abre ` +
  "en pestaña, se navega entre las abiertas, se cierra y el hash de la URL dice cuál está a " +
  "la vista.";

export function MarcadorDeSeccion({ seccion }: PropsDePantalla) {
  const rotulo = SECCIONES.find((x) => x.clave === seccion)?.label ?? seccion;
  return (
    <div
      data-seccion={seccion}
      // El contenedor de pantalla del artboard (linea 480): mismo relleno y misma entrada.
      style={{ flex: 1, overflow: "auto", padding: 18, animation: "fadeIn .22s ease" }}
    >
      <div
        style={{
          maxWidth: 640,
          background: "#fff",
          border: "1px dashed var(--linea)",
          borderRadius: "var(--radio-8)",
          padding: "16px 18px",
        }}
      >
        <p style={{ margin: 0, fontSize: 15, fontWeight: "var(--peso-fuerte)" }}>{rotulo}</p>
        <p
          style={{
            margin: "7px 0 0",
            fontSize: 13.5,
            lineHeight: 1.6,
            color: "var(--tinta-3)",
            textWrap: "pretty",
          }}
        >
          {textoDelMarcador(rotulo)}
        </p>
      </div>
    </div>
  );
}
