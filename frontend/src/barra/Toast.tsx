import { useCallback, useEffect, useState } from "react";

/**
 * El toast de V6 y su reloj.
 *
 * Plantilla en `TesoreriaV6.dc.html` lineas 885-890; el reloj, en `aplicar()` (1271-1277).
 *
 * <h2>El reloj es un efecto, y eso no es una traduccion libre</h2>
 *
 * El artboard guarda el ultimo texto en `this._ultimo` y **no reinicia el reloj cuando el
 * mensaje que llega es el que ya se esta mostrando**. Un `useEffect` con `[texto]` de
 * dependencia hace exactamente eso —React no vuelve a ejecutarlo si el valor no cambio—, asi
 * que no hay que reproducir el guardian a mano.
 *
 * Lo que un `useEffect` anade y el artboard no tenia es la **limpieza**: al desmontar, el
 * `setTimeout` se cancela. Sin ella, un temporizador que sobrevive al desmontaje intenta
 * actualizar un componente que ya no esta, y eso es exactamente lo que el criterio 7 del issue
 * prohibe.
 */

/** Lo que el toast dura, en milisegundos. Linea 1275 del artboard. */
export const MILISEGUNDOS_DEL_TOAST = 3400;

/** El toast y la unica forma de lanzarlo. */
export interface Avisador {
  /** El texto que se muestra, o cadena vacia cuando no hay ninguno. */
  readonly toast: string;
  readonly avisar: (texto: string) => void;
}

/**
 * El estado del toast, con su reloj de {@link MILISEGUNDOS_DEL_TOAST} y su cancelacion.
 *
 * Vive aqui y no en `App` porque el reloj es lo unico delicado de este componente: teniendolo
 * al lado de su plantilla, quien cambie uno ve el otro.
 */
export function usarToast(): Avisador {
  const [toast, fijar] = useState("");

  useEffect(() => {
    if (toast === "") return;
    // `setTimeout` a secas y no `window.setTimeout`: son el mismo reloj en el navegador, pero
    // los temporizadores falsos de una prueba sustituyen el global, no la propiedad de
    // `window`. Con `window.setTimeout` la prueba del criterio 7 mediria el reloj de verdad.
    const reloj = setTimeout(() => fijar(""), MILISEGUNDOS_DEL_TOAST);
    return () => clearTimeout(reloj);
  }, [toast]);

  const avisar = useCallback((texto: string) => fijar(texto), []);

  return { toast, avisar };
}

export interface ToastProps {
  readonly texto: string;
}

export function Toast({ texto }: ToastProps) {
  return (
    <div
      role="status"
      style={{
        position: "fixed",
        zIndex: 90,
        bottom: 20,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 20px",
        borderRadius: "var(--radio-7)",
        background: "var(--tinta)",
        color: "#fff",
        fontSize: 14,
        boxShadow: "var(--sombra-aviso)",
        animation: "subir .18s ease",
        maxWidth: "calc(100vw - 40px)",
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--acento)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flex: "0 0 auto" }}
      >
        <path d="M5 12.5l4.5 4.5L19 7" />
      </svg>
      {texto}
    </div>
  );
}
