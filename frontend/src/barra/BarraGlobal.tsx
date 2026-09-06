import type { CSSProperties } from "react";
import { ENTIDAD } from "@/aplicacion";
import { AVISO, EJERCICIOS, SESION } from "@/datos";

/**
 * La barra global de 52 px: lo primero que se ve, y lo unico que esta en las cuatro pantallas.
 *
 * Portada de `TesoreriaV6.dc.html` — plantilla de las lineas 99-202, y la logica que la alimenta
 * en 1494-1496 (entidad y ejercicio), 1505-1508 (hamburguesa), 1681-1704 (avisos y sesion) y
 * 1706-1711 (lanzador). Los estilos van **en linea y con los valores del artboard**, que es la
 * doctrina de `PORTAR.md`: el objetivo declarado es que la pantalla se vea identica al diseno.
 *
 * <h2>Que colores son token y cuales no</h2>
 *
 * Donde `src/ds/tokens/` declara ese valor exacto se escribe `var(--token)`; donde no, va el
 * literal del artboard. No es una preferencia: `#9FC6DF` (5 usos), `#C0492F` (3) y `#004670`
 * fuera de la insignia `info` **no son constantes del artboard** —solo `AZUL`, `AZUL_OSC`,
 * `AZUL_SUAVE`, `ACENTO`, `LINEA`, `LINEA_2`, `BORDE_CAMPO`, `TINTA`, `TINTA_2`, `TINTA_3` y
 * `SUP` lo son (lineas 914-924)—, y `verificaciones/tokens.test.ts` exige que `tokens/` no
 * declare **ningun** color que no este en esa lista. Inventarles un token aqui saldria rojo
 * alli, y con razon: seria ampliar la paleta del diseno desde una pantalla.
 *
 * <h2>Lo que este componente NO hace</h2>
 *
 * Ni abre la paleta, ni el lanzador, ni el menu de sesion: solo dispara el estado que los
 * abrira. Sus contenidos llegan en el issue de la paleta, y el arbol de modulos en el suyo.
 */

/** El estilo comun de los dos botones cuadrados de la barra: la campana y la lupa. */
const BOTON_CUADRADO: CSSProperties = {
  display: "grid",
  placeItems: "center",
  width: 32,
  height: 32,
  border: "1px solid rgba(255,255,255,.2)",
  borderRadius: "var(--radio-6)",
  background: "rgba(255,255,255,.09)",
  color: "#fff",
  cursor: "pointer",
  flex: "0 0 auto",
};

/**
 * El estilo de un boton que se enciende cuando lo suyo esta abierto.
 *
 * Es `lanzadorStyle` del artboard (linea 1708), literal. **La hamburguesa lo comparte, y eso es
 * una decision con una medicion detras**: `seccionesStyle` —el estilo que su plantilla pide en
 * la linea 106— *no existe en el artboard*. No se dedujo leyendo: se ejecuto su `renderVals()`
 * en Node con un `DCLogic` de mentira, y para esa clave devuelve `undefined`, con
 * `hasOwnProperty` en `false`. Que dibuje entonces el prototipo no se ha medido —haria falta su
 * `support.js`, que no viaja con el archivo—, pero el hueco es un hecho.
 *
 * Puestos a elegir, el unico estilo que el artboard define para un boton de esta barra que
 * **alterna** algo es este, y es el del lanzador, su vecino de la derecha.
 */
const botonQueAlterna = (encendido: boolean): CSSProperties => ({
  display: "grid",
  placeItems: "center",
  width: 40,
  height: 38,
  border: 0,
  borderRadius: "var(--radio-8)",
  cursor: "pointer",
  color: "#fff",
  flex: "0 0 auto",
  background: encendido ? "rgba(255,255,255,.2)" : "transparent",
});

/** El subtitulo de la entidad, literal (linea 114). */
const SUBTITULO = "Sistema de gestión tributaria municipal";

/**
 * Los nueve puntos del lanzador: `cx/cy = 6 + n*6`, en tres filas de tres.
 *
 * Se derivan igual que en el artboard (linea 1706) en vez de escribir los nueve pares a mano:
 * una rejilla escrita a mano se puede torcer sin que nada lo diga.
 */
const PUNTOS: readonly { readonly x: number; readonly y: number }[] = [0, 1, 2].flatMap((fila) =>
  [0, 1, 2].map((columna) => ({ x: 6 + columna * 6, y: 6 + fila * 6 })),
);

export interface BarraGlobalProps {
  /**
   * El nombre de la entidad. Es una prop **con valor por omision** —igual que el
   * `this.props.entidad || '…'` del artboard—: el dia que llegue del token, la barra no cambia.
   */
  readonly entidad?: string;
  /** Si el arbol de modulos esta desplegado. Lo dibuja el issue del arbol; aqui solo se alterna. */
  readonly modulosVisibles: boolean;
  readonly alAlternarModulos: () => void;
  /** Si la campana se ofrece. El artboard la esconde en cuanto el aviso se despliega. */
  readonly hayAviso: boolean;
  readonly alVerAviso: () => void;
  readonly ejercicio: string;
  readonly alCambiarEjercicio: (ejercicio: string) => void;
  readonly alAbrirPaleta: () => void;
  readonly lanzadorAbierto: boolean;
  readonly alAlternarLanzador: () => void;
  readonly sesionAbierta: boolean;
  readonly alAlternarSesion: () => void;
}

export function BarraGlobal({
  entidad = ENTIDAD,
  modulosVisibles,
  alAlternarModulos,
  hayAviso,
  alVerAviso,
  ejercicio,
  alCambiarEjercicio,
  alAbrirPaleta,
  lanzadorAbierto,
  alAlternarLanzador,
  sesionAbierta,
  alAlternarSesion,
}: BarraGlobalProps) {
  return (
    <header
      style={{
        flex: "0 0 auto",
        display: "flex",
        alignItems: "center",
        gap: 12,
        height: 52,
        padding: "0 12px 0 8px",
        background: "var(--azul-osc)",
        zIndex: 50,
      }}
    >
      {/* La pila de tres barras muestra u oculta el arbol de modulos de la izquierda, que
          empuja el contenido en lugar de taparlo. */}
      <button
        type="button"
        onClick={alAlternarModulos}
        aria-label="Mostrar u ocultar los módulos"
        aria-expanded={modulosVisibles}
        title={modulosVisibles ? "Ocultar los módulos" : "Mostrar los módulos"}
        style={botonQueAlterna(modulosVisibles)}
      >
        <svg
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
        >
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      <span
        style={{ display: "flex", alignItems: "center", gap: 10, flex: "1 1 auto", minWidth: 0 }}
      >
        <img
          src="/escudo-catacaos.png"
          alt="Escudo de la municipalidad"
          width={30}
          height={36}
          style={{ display: "block", width: "auto", height: 36, flex: "0 0 auto" }}
        />
        <span style={{ flex: "1 1 auto", minWidth: 0, lineHeight: 1.15 }}>
          <span
            style={{
              display: "block",
              fontSize: 14.5,
              fontWeight: "var(--peso-fuerte)",
              color: "#fff",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {entidad}
          </span>
          {/* `data-sm-hide` lo apaga `global.css` bajo 760 px, que es el corte del artboard. */}
          <span data-sm-hide="1" style={{ display: "block", fontSize: 10.5, color: "#9FC6DF" }}>
            {SUBTITULO}
          </span>
        </span>
      </span>

      {/* El aviso de servicio vive en la barra global: asi lo alcanzan los tres marcos. */}
      {hayAviso && (
        <button
          type="button"
          className="hov-barra"
          onClick={alVerAviso}
          aria-label={AVISO.rotulo}
          title={AVISO.rotulo}
          style={{ ...BOTON_CUADRADO, position: "relative" }}
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 15.6V10.5a6 6 0 0 0-12 0v5.1L4.4 18h15.2z" />
            <path d="M9.8 18a2.2 2.2 0 0 0 4.4 0" />
          </svg>
          <span
            style={{
              position: "absolute",
              top: -5,
              right: -5,
              minWidth: 17,
              height: 17,
              padding: "0 4px",
              borderRadius: "var(--radio-pastilla)",
              display: "grid",
              placeItems: "center",
              fontSize: 10.5,
              fontWeight: "var(--peso-fuerte)",
              background: "#C0492F",
              color: "#fff",
              border: "1.5px solid var(--azul-osc)",
            }}
          >
            {AVISO.cuantos}
          </span>
        </button>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          border: "1px solid rgba(255,255,255,.2)",
          borderRadius: "var(--radio-6)",
          padding: "3px 4px 3px 10px",
          background: "rgba(255,255,255,.09)",
          flex: "0 0 auto",
        }}
      >
        <span
          data-sm-hide="1"
          style={{
            fontSize: 11,
            fontWeight: "var(--peso-medio)",
            textTransform: "uppercase",
            letterSpacing: ".08em",
            color: "#9FC6DF",
          }}
        >
          Ejercicio
        </span>
        <select
          value={ejercicio}
          onChange={(e) => alCambiarEjercicio(e.target.value)}
          aria-label="Ejercicio de trabajo"
          style={{
            border: 0,
            background: "var(--azul-suave)",
            color: "#004670",
            borderRadius: "var(--radio-4)",
            padding: "3px 7px",
            fontSize: 13,
            fontWeight: "var(--peso-medio)",
            cursor: "pointer",
          }}
        >
          {EJERCICIOS.map((anio) => (
            <option key={anio} value={anio}>
              {anio}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        className="hov-barra"
        onClick={alAbrirPaleta}
        aria-label="Buscar"
        title="Buscar — Ctrl K"
        style={BOTON_CUADRADO}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-4.3-4.3" />
        </svg>
      </button>

      {/* El lanzador de los doce modulos, entre el buscador y el usuario: cambiar de modulo es
          menos frecuente que buscar dentro del propio. */}
      <button
        type="button"
        onClick={alAlternarLanzador}
        aria-label="Ver todos los módulos"
        aria-expanded={lanzadorAbierto}
        title="Todos los módulos"
        style={botonQueAlterna(lanzadorAbierto)}
      >
        <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor">
          {PUNTOS.map((p) => (
            <circle key={`${p.x}-${p.y}`} cx={p.x} cy={p.y} r="1.9" />
          ))}
        </svg>
      </button>

      <div
        style={{
          position: "relative",
          borderLeft: "1px solid rgba(255,255,255,.18)",
          paddingLeft: 12,
          flex: "0 0 auto",
        }}
      >
        <button
          type="button"
          className="hov-sesion"
          onClick={alAlternarSesion}
          aria-expanded={sesionAbierta}
          aria-label={`Sesión de ${SESION.nombre}`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            border: 0,
            borderRadius: "var(--radio-7)",
            padding: "3px 6px 3px 3px",
            cursor: "pointer",
            background: sesionAbierta ? "rgba(255,255,255,.16)" : "transparent",
          }}
        >
          <span
            style={{
              width: 27,
              height: 27,
              borderRadius: "var(--radio-circulo)",
              background: "var(--azul-suave)",
              color: "#004670",
              display: "grid",
              placeItems: "center",
              fontSize: 11.5,
              fontWeight: "var(--peso-fuerte)",
              flex: "0 0 auto",
            }}
          >
            {SESION.iniciales}
          </span>
          <span data-sm-hide="1" style={{ lineHeight: 1.2, textAlign: "left" }}>
            <span
              style={{
                display: "block",
                fontSize: 12.5,
                fontWeight: "var(--peso-medio)",
                color: "#fff",
              }}
            >
              {SESION.nombre}
            </span>
            <span style={{ display: "block", fontSize: 10.5, color: "#9FC6DF" }}>
              {SESION.puesto}
            </span>
          </span>
          <span
            style={{
              display: "grid",
              placeItems: "center",
              width: 15,
              height: 15,
              flex: "0 0 auto",
              color: "#9FC6DF",
              transform: `rotate(${sesionAbierta ? "180" : "0"}deg)`,
              transition: "transform .15s ease",
            }}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 9.5l6 6 6-6" />
            </svg>
          </span>
        </button>
      </div>
    </header>
  );
}
