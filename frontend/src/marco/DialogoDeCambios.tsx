import { useEffect } from "react";

/**
 * La pregunta antes de cerrar una pestana con cambios sin guardar.
 *
 * `TesoreriaV6.dc.html`, lineas 862-883; las tres salidas las compone `confirmar` (1641-1653).
 * El comentario de las lineas 862-863 dice lo que decide el orden: *«cerrar una pestaña con
 * cambios los descarta: se pregunta antes, y la salida por defecto es guardar, no perder»*.
 *
 * <h2>Las tres salidas, y por que estan en ese orden</h2>
 *
 * A la izquierda **Descartar y cerrar**, en rojo y separada del resto por un relleno elastico:
 * es la unica que pierde trabajo y es la unica que no se puede deshacer. A la derecha
 * **Seguir editando** y, la ultima y primaria, **Guardar y cerrar**. Quien pulse por inercia el
 * boton azul de la derecha guarda; para perder hay que cruzar el dialogo.
 *
 * <h2>El fondo y la tecla de escape</h2>
 *
 * Pulsar el fondo cancela, como en el artboard. La tecla `Escape` tambien: el artboard la trata
 * en su `_tecla` global (linea 1243) junto con la paleta y el lanzador, que son de otro issue,
 * asi que aqui se escucha **solo mientras el dialogo esta puesto** y solo hace lo suyo. Un
 * dialogo modal del que no se sale con `Escape` es una trampa para quien navega con teclado.
 */

/** El titulo del dialogo, compuesto como en la linea 869. */
export const tituloDelDialogo = (rotulo: string) => `${rotulo} tiene cambios sin guardar`;

/** Su explicacion (linea 870), literal. */
export const EXPLICACION_DEL_DIALOGO =
  "Si cierra la pestaña se pierden. Guárdelos primero o ciérrela descartándolos: " +
  "eso no se puede deshacer.";

/** El nombre accesible del dialogo (linea 866), literal. */
export const ROTULO_DEL_DIALOGO = "Cerrar con cambios sin guardar";

export interface DialogoDeCambiosProps {
  /** El rotulo de la pestana, sin el ` *`. */
  readonly rotulo: string;
  /** «Descartar y cerrar»: cierra y pierde lo escrito. */
  readonly alDescartar: () => void;
  /** «Seguir editando»: retira el dialogo y no cierra nada. */
  readonly alSeguir: () => void;
  /** «Guardar y cerrar»: la salida primaria. */
  readonly alGuardar: () => void;
}

/** El estilo comun de los dos botones de borde. */
const BOTON_DE_BORDE = {
  border: "1px solid var(--linea)",
  borderRadius: "var(--radio-6)",
  padding: "9px 15px",
  background: "#fff",
  fontSize: 13.5,
  cursor: "pointer",
  whiteSpace: "nowrap",
} as const;

export function DialogoDeCambios({
  rotulo,
  alDescartar,
  alSeguir,
  alGuardar,
}: DialogoDeCambiosProps) {
  useEffect(() => {
    const alPulsarTecla = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") alSeguir();
    };
    window.addEventListener("keydown", alPulsarTecla);
    return () => window.removeEventListener("keydown", alPulsarTecla);
  }, [alSeguir]);

  return (
    <>
      {/* El fondo. Es decoracion —`aria-hidden`— y lo que hace se puede hacer tambien con
          «Seguir editando» y con `Escape`, asi que no deja a nadie fuera. */}
      <div
        aria-hidden="true"
        onClick={alSeguir}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 88,
          background: "rgba(0,54,90,.4)",
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ROTULO_DEL_DIALOGO}
        style={{
          position: "fixed",
          zIndex: 89,
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          width: "min(556px,calc(100vw - 32px))",
          background: "#fff",
          borderRadius: "var(--radio-10)",
          boxShadow: "var(--sombra-modal)",
          overflow: "hidden",
          animation: "pop .14s ease",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            padding: "18px 20px 14px",
          }}
        >
          <span
            style={{
              display: "grid",
              placeItems: "center",
              width: 32,
              height: 32,
              borderRadius: "var(--radio-circulo)",
              flex: "0 0 auto",
              // `#FFF4D9` y `#7A5200` tienen token —los de la insignia `warn`— y esto no es una
              // insignia. Mismo criterio que la banda del aviso, y por el mismo motivo.
              background: "#FFF4D9",
              color: "#7A5200",
            }}
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.1"
              strokeLinecap="round"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7.6V13M12 16.4h.02" />
            </svg>
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: "var(--peso-fuerte)",
                textWrap: "pretty",
              }}
            >
              {tituloDelDialogo(rotulo)}
            </p>
            <p
              style={{
                margin: "7px 0 0",
                fontSize: 13.5,
                lineHeight: 1.55,
                color: "var(--tinta-2)",
                textWrap: "pretty",
              }}
            >
              {EXPLICACION_DEL_DIALOGO}
            </p>
          </span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            flexWrap: "wrap",
            padding: "13px 20px",
            borderTop: "1px solid var(--linea-2)",
            background: "var(--sup)",
          }}
        >
          <button
            type="button"
            className="hov-borde-rojo"
            onClick={alDescartar}
            // `#8F2A17` tiene token —`--ins-bad-tinta`— y tampoco es una insignia: aqui es la
            // tinta de la salida que pierde trabajo.
            style={{ ...BOTON_DE_BORDE, color: "#8F2A17" }}
          >
            Descartar y cerrar
          </button>
          {/* El relleno que separa la salida destructiva de las otras dos. */}
          <span style={{ flex: 1, minWidth: 0 }} />
          <button type="button" className="hov-borde" onClick={alSeguir} style={BOTON_DE_BORDE}>
            Seguir editando
          </button>
          <button
            type="button"
            className="hov-primario"
            onClick={alGuardar}
            style={{
              border: 0,
              borderRadius: "var(--radio-6)",
              padding: "10px 18px",
              background: "var(--azul)",
              color: "#fff",
              fontSize: 13.5,
              fontWeight: "var(--peso-medio)",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Guardar y cerrar
          </button>
        </div>
      </div>
    </>
  );
}
