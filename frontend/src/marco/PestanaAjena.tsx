import { HOJAS, ICONOS_POR_MODULO } from "@/datos";

/**
 * La tarjeta de un submodulo que **no es de Tesoreria**.
 *
 * `TesoreriaV6.dc.html`, lineas 438-464; el texto y el icono los compone `ajena` (1628-1638).
 *
 * Es lo que hace que el arbol de la izquierda sea el del sistema entero y no solo el de esta
 * caja: pulsar «Papeletas» abre una pestana de verdad, navegable y cerrable, que dice de donde
 * viene. **No consulta nada a nadie** —el rotulo, la nota y el trazo del icono salen de
 * `src/datos/navegacion.ts`—, que es la frontera que CLAUDE.md describe.
 */

/** El texto de la linea 1633, compuesto igual que en el artboard. */
export const textoDeAjena = (rotulo: string, modulo: string) =>
  "Este marco abre cada submódulo como pestaña, de cualquier módulo. La pantalla de «" +
  rotulo +
  "» está diseñada en el archivo de " +
  modulo +
  ": lo que se prueba aquí es la navegación entre varias cosas abiertas a la vez.";

/** El pie de la tarjeta (linea 461), literal. */
export const PIE_DE_AJENA = "Puede dejarla abierta y volver a ella desde la barra de pestañas.";

/** El rotulo de su boton (linea 462), literal. */
export const CERRAR_LA_PESTANA = "Cerrar la pestaña";

export interface PestanaAjenaProps {
  /** La clave del submodulo ajeno que esta activo. */
  readonly clave: string;
  readonly alCerrar: () => void;
}

export function PestanaAjena({ clave, alCerrar }: PestanaAjenaProps) {
  // El artboard cae en `{ mod: '—', nota: '', label: '—' }` cuando la clave no esta en `HOJAS`
  // (linea 1630). Se porta igual: una clave inventada dibuja la tarjeta con rayas, no revienta.
  const hoja = HOJAS[clave] ?? { modulo: "—", nota: "", label: "—" };
  const icono = ICONOS_POR_MODULO[hoja.modulo] ?? [];

  return (
    <div style={{ flex: 1, overflow: "auto", padding: 18 }}>
      <div
        style={{
          maxWidth: 640,
          background: "#fff",
          border: "1px solid var(--linea)",
          borderRadius: "var(--radio-8)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 11,
            padding: "14px 16px",
            borderBottom: "1px solid var(--linea-2)",
          }}
        >
          <span
            style={{
              display: "grid",
              placeItems: "center",
              width: 30,
              height: 30,
              borderRadius: "var(--radio-7)",
              flex: "0 0 auto",
              background: "var(--azul-suave)",
              // `#004670` tiene token —`--ins-info-tinta`— pero es el de una **insignia**, y
              // esto no lo es. Mismo criterio que en la barra global y en el arbol.
              color: "#004670",
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {icono.map((trazo) => (
                <path key={trazo} d={trazo} />
              ))}
            </svg>
          </span>
          <span style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }}>
            <span style={{ display: "block", fontSize: 15, fontWeight: "var(--peso-fuerte)" }}>
              {hoja.label}
            </span>
            <span style={{ display: "block", fontSize: 12.5, color: "var(--tinta-3)" }}>
              {hoja.modulo} · {hoja.nota}
            </span>
          </span>
        </div>

        <p
          style={{
            margin: 0,
            padding: "15px 16px",
            fontSize: 13.5,
            lineHeight: 1.6,
            color: "var(--tinta-2)",
            textWrap: "pretty",
          }}
        >
          {textoDeAjena(hoja.label, hoja.modulo)}
        </p>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            padding: "12px 16px",
            borderTop: "1px solid var(--linea-2)",
            background: "var(--sup)",
          }}
        >
          <p
            style={{
              margin: 0,
              flex: 1,
              minWidth: 180,
              fontSize: 12.5,
              color: "var(--tinta-3)",
              textWrap: "pretty",
            }}
          >
            {PIE_DE_AJENA}
          </p>
          <button
            type="button"
            className="hov-borde"
            onClick={alCerrar}
            style={{
              border: "1px solid var(--linea)",
              borderRadius: "var(--radio-6)",
              padding: "8px 15px",
              background: "#fff",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {CERRAR_LA_PESTANA}
          </button>
        </div>
      </div>
    </div>
  );
}
