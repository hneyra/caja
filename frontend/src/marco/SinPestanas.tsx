/**
 * Lo que se ve cuando no queda ninguna pestana abierta.
 *
 * `TesoreriaV6.dc.html`, lineas 418-426, literal.
 *
 * Cerrar la ultima **no reabre nada**: deja este hueco. Es la decision del artboard y es la
 * honesta —«no hay nada abierto» es un estado real de la ventanilla—; reabrir el Panel por su
 * cuenta le diria al cajero que cerro algo que no se puede cerrar.
 */

/** El titulo del hueco (linea 422), literal. */
export const TITULO_DEL_HUECO = "No hay ningún submódulo abierto";

/** Su explicacion (linea 423), literal. */
export const EXPLICACION_DEL_HUECO =
  "Elija uno en el menú de la izquierda y se abrirá como pestaña. " +
  "Puede tener varios abiertos y moverse entre ellos.";

export function SinPestanas() {
  return (
    <div style={{ flex: 1, display: "grid", placeItems: "center", padding: 32 }}>
      <div style={{ maxWidth: "40ch", textAlign: "center" }}>
        {/* El mismo dibujo de documento que el artboard pone aqui. Va literal y no tomado de
            `ICONOS_DE_SECCION.valores`: que coincidan trazo a trazo no los hace el mismo icono,
            y acoplarlos haria que retocar el de la seccion cambiara este hueco. */}
        <svg
          width="30"
          height="30"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--tenue)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        >
          <path d="M6.5 3.5h7.5l4 4v13h-11.5z" />
          <path d="M14 3.5v4h4" />
          <path d="M9.5 12.5h5" />
        </svg>
        <p style={{ margin: "12px 0 0", fontSize: 16, fontWeight: "var(--peso-fuerte)" }}>
          {TITULO_DEL_HUECO}
        </p>
        <p
          style={{
            margin: "7px 0 0",
            fontSize: 13.5,
            lineHeight: 1.55,
            color: "var(--tinta-3)",
            textWrap: "pretty",
          }}
        >
          {EXPLICACION_DEL_HUECO}
        </p>
      </div>
    </div>
  );
}
