import type { CSSProperties } from "react";
import type { PestanaVisible } from "@/marco/rotulos";

/**
 * La barra de pestanas: cada submodulo abierto, con su icono, su rotulo y su aspa.
 *
 * Portada de `TesoreriaV6.dc.html` lineas 380-401; los estilos son los que `renderVals()`
 * compone en 1655-1673, medidos ejecutandolo y no leyendolos. Van **en linea y con los valores
 * del artboard**, que es la doctrina de `PORTAR.md`.
 *
 * <h2>La barra se dibuja siempre, incluso vacia</h2>
 *
 * En el artboard no esta dentro de ningun `sc-if`: con cero pestanas queda una franja de 44 px
 * y el sitio de las pestanas no se mueve al abrir la primera. Se porta igual.
 *
 * <h2>Que se busca por el nombre accesible y que por `data-`</h2>
 *
 * Mismo criterio que el arbol: el **aspa** se busca por su `aria-label` —«Cerrar Panel», que es
 * lo que un lector de pantalla anuncia y lo que el criterio 1 exige—, y la pestana en si por
 * `data-pestana`, porque su rotulo cambia con el estado (` *` al ensuciarse) y ademas lo repite
 * el arbol de la izquierda.
 */

export interface BarraDePestanasProps {
  readonly pestanas: readonly PestanaVisible[];
  readonly alIr: (clave: string) => void;
  readonly alCerrar: (clave: string) => void;
}

/** El marco de una pestana: el filete azul de arriba es lo que dice cual esta activa. */
const marcoDe = (actual: boolean): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 2,
  flex: "0 0 auto",
  padding: "0 6px 0 0",
  borderRight: "1px solid var(--linea-2)",
  background: actual ? "#fff" : "transparent",
  borderTop: `2px solid ${actual ? "var(--azul)" : "transparent"}`,
});

const botonDe = (actual: boolean): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  border: 0,
  background: "transparent",
  padding: "11px 8px 11px 13px",
  cursor: "pointer",
  fontSize: 13.5,
  color: actual ? "var(--tinta)" : "var(--tinta-3)",
  fontWeight: actual ? "var(--peso-fuerte)" : "var(--peso-normal)",
});

const iconoDe = (actual: boolean): CSSProperties => ({
  display: "grid",
  placeItems: "center",
  flex: "0 0 auto",
  color: actual ? "var(--azul)" : "var(--tinta-3)",
});

const aspaDe = (actual: boolean): CSSProperties => ({
  display: "grid",
  placeItems: "center",
  width: 22,
  height: 22,
  border: 0,
  borderRadius: "var(--radio-5)",
  background: "transparent",
  cursor: "pointer",
  color: actual ? "var(--tinta-3)" : "var(--tenue)",
  flex: "0 0 auto",
});

export function BarraDePestanas({ pestanas, alIr, alCerrar }: BarraDePestanasProps) {
  return (
    <div
      data-pestanas=""
      // Cromo: no se imprime. Ver `data-cromo` en `BarraGlobal`.
      data-cromo="pestanas"
      style={{
        flex: "0 0 auto",
        display: "flex",
        alignItems: "stretch",
        gap: 0,
        padding: "0 12px 0 0",
        minHeight: 44,
        background: "var(--fondo)",
        borderBottom: "1px solid var(--linea)",
        zIndex: 40,
        overflowX: "auto",
      }}
    >
      {pestanas.map((pestana) => (
        <span key={pestana.clave} style={marcoDe(pestana.actual)}>
          <button
            type="button"
            data-pestana={pestana.clave}
            onClick={() => alIr(pestana.clave)}
            aria-current={pestana.actual ? "true" : "false"}
            style={botonDe(pestana.actual)}
          >
            <span style={iconoDe(pestana.actual)}>
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {pestana.icono.map((trazo) => (
                  <path key={trazo} d={trazo} />
                ))}
              </svg>
            </span>
            <span style={{ whiteSpace: "nowrap" }}>{pestana.label}</span>
          </button>
          <button
            type="button"
            className="hov-aspa"
            onClick={() => alCerrar(pestana.clave)}
            aria-label={pestana.cerrarAria}
            title={pestana.cerrarAria}
            style={aspaDe(pestana.actual)}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </span>
      ))}
      {/* El relleno de la derecha: lo que hace que la ultima pestana no se estire. */}
      <span style={{ flex: 1, minWidth: 8 }} />
    </div>
  );
}
