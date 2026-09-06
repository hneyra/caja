import type { CSSProperties } from "react";
import { MI_MODULO, MODULOS } from "@/datos";

/**
 * El lanzador de los doce modulos, lo que despliegan los nueve puntos de la barra.
 *
 * Portado de `TesoreriaV6.dc.html` — plantilla de las lineas 48-72 y `modulos` de la 1756. Los
 * estilos van **en linea y con los valores del artboard** (`PORTAR.md`).
 *
 * <h2>Un defecto del artboard, corregido con la medida delante</h2>
 *
 * `modulos` esta escrita **dos veces**: la de la linea 1713 marca como actual `'Tránsito'` —resto
 * de copiar el archivo de otro modulo— y la de la 1756 marca `'Tesorería'`. En JavaScript gana la
 * ultima, asi que el prototipo se ve bien y el defecto solo muerde a quien porte la primera. No
 * se resolvio leyendo: se cargo el `<script type="text/x-dc">` en Node con un `DCLogic` de
 * mentira y `renderVals().modulos` devuelve `actual: 'true'` en **Tesorería**.
 *
 * Aqui no hay ninguna de las dos cadenas escritas: el modulo actual es {@link MI_MODULO}, que es
 * el `MI_MODULO` del artboard (linea 1175) y el mismo que usa el arbol para saber que rama abre
 * secciones de verdad. Un rotulo escrito a mano en dos sitios es exactamente como se llega a que
 * uno diga Tránsito y el otro Tesorería.
 *
 * <h2>Aqui no se navega</h2>
 *
 * Pulsar un modulo saca un toast, como en el diseno: `caja-web` es la ventanilla, y los otros
 * once modulos no existen todavia. Lo que si es de verdad es cual esta marcado.
 */

/** El pie del lanzador, literal (linea 70). */
export const PIE_DEL_LANZADOR =
  "El ejercicio de trabajo es global a la sesión: al cambiarlo, cambia para los doce módulos.";

/** El titulo y su explicacion (lineas 53-54). */
export const TITULO_DEL_LANZADOR = "Módulos";
export const NOTA_DEL_LANZADOR = "Los doce comparten este marco";

/** Lo que dice pulsar el modulo en el que ya se esta (linea 1760). */
export const YA_ESTA_EN = `Ya está en ${MI_MODULO}.`;

/** Lo que dice pulsar cualquier otro (linea 1760). */
export const abririaElModulo = (nombre: string) => `Abriría el módulo ${nombre}.`;

/** El boton de un modulo: relleno del actual y transparente en los otros once (linea 1764). */
const botonDeModulo = (actual: boolean): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 10,
  width: "100%",
  border: 0,
  borderRadius: "var(--radio-8)",
  padding: 10,
  cursor: "pointer",
  background: actual ? "var(--azul-suave)" : "transparent",
  color: "var(--tinta)",
  fontWeight: actual ? "var(--peso-fuerte)" : "var(--peso-normal)",
});

/**
 * La caja del icono (linea 1762).
 *
 * `#004670` va literal y no como token: no es ninguna de las constantes del artboard (lineas
 * 914-924) fuera de la insignia `info`, y darle un token aqui seria ampliar la paleta del diseno
 * desde una pantalla. Es el mismo criterio que `BarraGlobal` dejo escrito.
 */
const cajaDelIcono = (actual: boolean): CSSProperties => ({
  display: "grid",
  placeItems: "center",
  width: 32,
  height: 32,
  borderRadius: "var(--radio-8)",
  flex: "0 0 auto",
  background: actual ? "var(--azul)" : "var(--azul-suave)",
  color: actual ? "#fff" : "#004670",
});

export interface LanzadorDeModulosProps {
  /** Cerrarlo sin elegir: el fondo transparente de la linea 50 y `Esc`. */
  readonly alCerrar: () => void;
  /** El toast que saca pulsar un modulo. Lo dispara el marco, que es quien tiene el reloj. */
  readonly alAvisar: (texto: string) => void;
}

export function LanzadorDeModulos({ alCerrar, alAvisar }: LanzadorDeModulosProps) {
  return (
    <>
      {/* El fondo de la linea 50: transparente, solo para cerrar pulsando fuera. */}
      <div
        onClick={alCerrar}
        aria-hidden="true"
        style={{ position: "fixed", inset: 0, zIndex: 80 }}
      />

      <div
        role="dialog"
        aria-label="Módulos del sistema"
        data-lanzador="1"
        style={{
          position: "fixed",
          zIndex: 81,
          top: 50,
          left: 10,
          width: "min(560px,calc(100vw - 20px))",
          background: "#fff",
          border: "1px solid var(--linea)",
          borderRadius: "var(--radio-10)",
          boxShadow: "var(--sombra-lanzador)",
          overflow: "hidden",
          animation: "pop .14s ease",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 10,
            padding: "14px 16px 12px",
            borderBottom: "1px solid var(--linea-2)",
          }}
        >
          <p style={{ margin: 0, flex: 1, fontSize: 15, fontWeight: "var(--peso-fuerte)" }}>
            {TITULO_DEL_LANZADOR}
          </p>
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--tinta-3)" }}>{NOTA_DEL_LANZADOR}</p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(168px,1fr))",
            gap: 0,
            padding: 6,
          }}
        >
          {MODULOS.map((modulo) => {
            const actual = modulo.nombre === MI_MODULO;
            return (
              <button
                key={modulo.nombre}
                type="button"
                className="hov-flotante"
                data-modulo-del-lanzador={modulo.nombre}
                aria-current={actual ? "true" : "false"}
                onClick={() => {
                  alCerrar();
                  alAvisar(actual ? YA_ESTA_EN : abririaElModulo(modulo.nombre));
                }}
                style={botonDeModulo(actual)}
              >
                <span style={cajaDelIcono(actual)}>
                  <svg
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {modulo.icono.map((trazo) => (
                      <path key={trazo} d={trazo} />
                    ))}
                  </svg>
                </span>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    textAlign: "left",
                    fontSize: 13.5,
                    lineHeight: 1.3,
                    textWrap: "pretty",
                  }}
                >
                  {modulo.nombre}
                </span>
              </button>
            );
          })}
        </div>

        <p
          style={{
            margin: 0,
            padding: "11px 16px",
            borderTop: "1px solid var(--linea-2)",
            background: "var(--sup)",
            fontSize: 12.5,
            color: "var(--tinta-3)",
          }}
        >
          {PIE_DEL_LANZADOR}
        </p>
      </div>
    </>
  );
}
