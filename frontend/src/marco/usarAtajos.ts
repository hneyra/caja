import { useEffect, useRef } from "react";

/**
 * Los dos atajos globales del marco: `Ctrl/Cmd + K` y `Esc`.
 *
 * Portados de `TesoreriaV6.dc.html` — el `_tecla` de las lineas 1246-1262, que el artboard
 * engancha en `componentDidMount` y **desengancha en `componentWillUnmount`** (linea 1266).
 * Aqui es lo mismo: el `return` del efecto retira el oyente, y ese retiro es lo que se mide.
 *
 * <h2>Por que un oyente en `window` y no en el dialogo</h2>
 *
 * `Ctrl + K` tiene que abrir la paleta desde cualquier sitio de la pantalla —ese es el atajo—,
 * asi que no puede colgar de un elemento que solo existe cuando la paleta ya esta abierta. `Esc`
 * va al lado por simetria: cierra las tres capas flotantes desde donde sea que este el foco.
 *
 * <h2>El oyente se engancha UNA vez, y las acciones viajan por una referencia</h2>
 *
 * `App` recrea sus funciones en cada dibujado. Con ellas en las dependencias del efecto, el
 * oyente se quitaria y se volveria a poner en cada tecla que se escriba en la paleta, y «se
 * retira al desmontar» dejaria de ser una propiedad observable: seria una carrera. Con la
 * referencia, se engancha uno y se retira ese mismo.
 */

/** Lo que los atajos disparan. */
export interface Atajos {
  /** `Ctrl/Cmd + K`: abre la paleta si esta cerrada y la cierra si esta abierta. */
  readonly alAlternarPaleta: () => void;
  /** `Esc`: cierra la paleta, el lanzador y el menu de sesion. */
  readonly alCerrarCapas: () => void;
}

export function usarAtajos(acciones: Atajos): void {
  const ultimas = useRef(acciones);

  useEffect(() => {
    ultimas.current = acciones;
  }, [acciones]);

  useEffect(() => {
    const alPulsarTecla = (evento: KeyboardEvent) => {
      if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === "k") {
        // Sin esto, `Ctrl + K` se lo lleva el navegador —en varios es «buscar»— y el atajo no
        // llega nunca. Es tambien lo que hace observable que el oyente se haya retirado: un
        // evento cancelable disparado despues del desmontaje sale con `defaultPrevented` en
        // `false` si, y solo si, ya no hay nadie escuchando.
        evento.preventDefault();
        ultimas.current.alAlternarPaleta();
      } else if (evento.key === "Escape") {
        ultimas.current.alCerrarCapas();
      }
    };
    window.addEventListener("keydown", alPulsarTecla);
    return () => window.removeEventListener("keydown", alPulsarTecla);
  }, []);
}
