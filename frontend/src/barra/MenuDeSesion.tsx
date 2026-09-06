import type { CSSProperties } from "react";
import { OPCIONES_DE_SESION, SESION } from "@/datos";

/**
 * El menu que despliega la ficha de sesion de la barra.
 *
 * Portado de `TesoreriaV6.dc.html` — plantilla de las lineas 174-200, `sesionOpciones` de la 1694
 * y el aviso de pestanas sucias de la 1691. Los estilos van **en linea y con los valores del
 * artboard** (`PORTAR.md`).
 *
 * <h2>Aqui no hay sesion que cerrar</h2>
 *
 * No hay OIDC, ni Keycloak, ni token: `caja-web` no habla con nadie. Las tres opciones sacan su
 * toast, que es lo que hace el diseno, y **eso es todo lo que hacen**. Lo unico que aqui es de
 * verdad es el aviso de abajo: si hay pestanas con cambios sin guardar, el menu lo dice **antes**
 * de que alguien pulse «Cerrar sesión», que es el unico momento en que decirlo sirve de algo.
 *
 * <h2>Va dentro de la barra y no al lado</h2>
 *
 * Es `position:absolute` colgando de la ficha (`top:44px; right:0`, linea 176), no un flotante
 * del documento como el lanzador y la paleta: se alinea con el boton que lo abre. Por eso lo
 * dibuja `BarraGlobal` desde dentro de su envoltorio `position:relative` y no `App`.
 */

/** El texto del aviso de pestanas sucias, con su singular (lineas 1691-1693). */
export const avisoDeSucias = (cuantas: number) =>
  `Hay ${cuantas} ${cuantas === 1 ? "pestaña" : "pestañas"} con cambios sin guardar. ` +
  "Al cerrar sesión se pierden.";

/** Lo que dice elegir una opcion que no es la salida (linea 1700). */
export const abriria = (label: string) => `Abriría ${label.toLowerCase()}.`;

/** Lo que dice «Cerrar sesión» (linea 1700). */
export const CERRARIA_LA_SESION = "Cerraría la sesión.";

/**
 * El boton de una opcion (linea 1701).
 *
 * `#8F2A17` es `--ins-bad-tinta`, que declara ese mismo valor, asi que va como token: es la
 * regla que `BarraGlobal` dejo escrita —token donde `src/ds/tokens/` declare el valor exacto,
 * literal donde no—.
 */
const botonDeOpcion = (salida: boolean): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 10,
  width: "100%",
  border: 0,
  borderRadius: "var(--radio-6)",
  padding: "9px 9px",
  cursor: "pointer",
  background: "transparent",
  color: salida ? "var(--ins-bad-tinta)" : "var(--tinta-2)",
  fontWeight: salida ? "var(--peso-medio)" : "var(--peso-normal)",
});

export interface MenuDeSesionProps {
  /** Cerrarlo sin elegir: el fondo transparente de la linea 175 y `Esc`. */
  readonly alCerrar: () => void;
  /** El toast que saca elegir una opcion. Lo dispara el marco, que es quien tiene el reloj. */
  readonly alAvisar: (texto: string) => void;
  /** Cuantas pestanas tienen cambios sin guardar. Con cero, el pie no se dibuja. */
  readonly cuantasSucias: number;
}

export function MenuDeSesion({ alCerrar, alAvisar, cuantasSucias }: MenuDeSesionProps) {
  return (
    <>
      {/* El fondo de la linea 175: transparente, solo para cerrar pulsando fuera. */}
      <div
        onClick={alCerrar}
        aria-hidden="true"
        style={{ position: "fixed", inset: 0, zIndex: 84 }}
      />

      <div
        role="menu"
        aria-label="Sesión"
        data-menu-de-sesion="1"
        style={{
          position: "absolute",
          zIndex: 85,
          top: 44,
          right: 0,
          width: "min(258px,calc(100vw - 24px))",
          background: "#fff",
          border: "1px solid var(--linea)",
          // 9 px no es ninguno de los radios censados en `tokens/formas.css`, asi que va literal.
          borderRadius: 9,
          boxShadow: "var(--sombra-menu)",
          overflow: "hidden",
          animation: "pop .13s ease",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "13px 14px",
            borderBottom: "1px solid var(--linea-2)",
          }}
        >
          <span
            style={{
              width: 34,
              height: 34,
              borderRadius: "var(--radio-circulo)",
              background: "var(--azul-suave)",
              color: "#004670",
              display: "grid",
              placeItems: "center",
              fontSize: 13,
              fontWeight: "var(--peso-fuerte)",
              flex: "0 0 auto",
            }}
          >
            {SESION.iniciales}
          </span>
          <span style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }}>
            <span
              style={{
                display: "block",
                fontSize: 13.5,
                fontWeight: "var(--peso-fuerte)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {SESION.nombre}
            </span>
            <span style={{ display: "block", fontSize: 11.5, color: "var(--tinta-3)" }}>
              {SESION.puesto}
            </span>
          </span>
        </div>

        <div style={{ padding: 5 }}>
          {OPCIONES_DE_SESION.map((opcion) => (
            <button
              key={opcion.label}
              type="button"
              role="menuitem"
              className="hov-flotante"
              data-opcion-de-sesion={opcion.label}
              onClick={() => {
                alCerrar();
                alAvisar(opcion.salida ? CERRARIA_LA_SESION : abriria(opcion.label));
              }}
              style={botonDeOpcion(opcion.salida)}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flex: "0 0 auto" }}
              >
                {opcion.icono.map((trazo) => (
                  <path key={trazo} d={trazo} />
                ))}
              </svg>
              <span style={{ flex: 1, minWidth: 0, textAlign: "left", fontSize: 13.5 }}>
                {opcion.label}
              </span>
            </button>
          ))}
        </div>

        {cuantasSucias > 0 && (
          <p
            data-sucias-en-sesion="1"
            style={{
              margin: 0,
              padding: "10px 14px",
              borderTop: "1px solid var(--linea-2)",
              background: "var(--ins-warn-fondo)",
              fontSize: 12,
              lineHeight: 1.5,
              color: "var(--ins-warn-tinta)",
              textWrap: "pretty",
            }}
          >
            {avisoDeSucias(cuantasSucias)}
          </p>
        )}
      </div>
    </>
  );
}
