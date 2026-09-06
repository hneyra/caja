import { useState, type CSSProperties } from "react";
import { TARIFARIO } from "@/datos";
import type { PropsDePantalla } from "@/marco/pantalla";
import { acotar } from "@/pantallas/Cajas";
import { TablaDeDatos } from "@/pantallas/TablaDeDatos";

/**
 * `#tarifario` — «Tarifario y cierre»: tres pestanas de consulta, cada una con su tabla.
 *
 * Portado de `TesoreriaV6.dc.html`: la plantilla de las lineas 820-857 y la logica que la
 * alimenta —`valTabs` (2052-2060) y `val` (2061-2066)— sobre `VAL` (1139-1168), que vive en
 * `src/datos/tarifario.ts` desde #5.
 *
 * <h2>Tres notas de cabecera y tres notas de pie, y no son la misma prosa</h2>
 *
 * Cada pestana trae `nota` **y** `pie`, distintos entre si y distintos de los de las otras dos.
 * No es redundancia: la nota dice **que es** esta tabla —«las tasas que se cobran en ventanilla,
 * aparte de los tributos»— y el pie dice **lo que las filas no pueden decir** —que el derecho de
 * emision es la unica tasa que viaja dentro de la cuponera—. Una pantalla que dibujara solo una
 * de las dos perderia exactamente la mitad que no se puede deducir mirando la tabla.
 *
 * <h2>La pildora «Solo lectura», y por que esta en las tres</h2>
 *
 * El artboard la dibuja fuera del `sc-for` de las pestanas (lineas 828-833), o sea una vez y para las
 * tres. Aqui es lo mismo: un solo elemento en la fila de la nota. Y no es decoracion — es lo que
 * contesta a «¿donde cambio yo esta tasa?» antes de que nadie lo intente: el tarifario del TUPA
 * se aprueba por ordenanza, y esta pantalla no es donde se edita.
 *
 * La pestana elegida sigue el mismo mecanismo que el nodo de {@link import("@/pantallas/Cajas")}
 * —dos `useState` comparados durante el dibujado— y por la misma razon: dos acciones de la paleta
 * abren esta seccion y solo se distinguen por su `valTab` («Tarifario del TUPA» al 0, «Cierre y
 * depósito» al 2). El indice se acota con el mismo {@link acotar}, que es el `Math.min` de la
 * linea 1464 con su cota de abajo.
 */

/** El rotulo de la pildora de la linea 832, dentro de la pastilla de la 830. */
export const SOLO_LECTURA = "Solo lectura";

/** Los dos trazos del candado (linea 831), copiados letra por letra. */
export const CANDADO: readonly string[] = ["M7 11V8a5 5 0 0 1 10 0v3", "M5.5 11h13v9.5h-13z"];

/** El `min-width` de la tabla de esta pantalla (linea 836). */
export const ANCHO_MINIMO_DEL_TARIFARIO = 660;

/** Una pestana del tarifario (lineas 2057-2059): la activa con su filete, su tinta y su peso. */
const pestanaDe = (activa: boolean): CSSProperties => ({
  border: 0,
  borderBottom: `2px solid ${activa ? "var(--azul)" : "transparent"}`,
  background: "transparent",
  padding: "12px 14px 10px",
  cursor: "pointer",
  fontSize: 14,
  whiteSpace: "nowrap",
  color: activa ? "var(--tinta)" : "var(--tinta-3)",
  fontWeight: activa ? "var(--peso-fuerte)" : "var(--peso-normal)",
});

export function Tarifario({ destino }: PropsDePantalla) {
  const [tabDelDestino, fijarTabDelDestino] = useState(destino.valTab);
  const [pedida, fijarPedida] = useState(destino.valTab ?? 0);
  if (destino.valTab !== tabDelDestino) {
    fijarTabDelDestino(destino.valTab);
    if (destino.valTab !== undefined) fijarPedida(destino.valTab);
  }

  const elegida = acotar(pedida, TARIFARIO.length);
  const pestana = TARIFARIO[elegida];

  return (
    <div
      data-seccion="valores"
      // El contenedor de la linea 822: las pestanas, la nota y la tabla, en columna.
      style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}
    >
      {/* ——— Las tres pestanas (823-827) ——— */}
      <div
        style={{
          flex: "0 0 auto",
          display: "flex",
          alignItems: "stretch",
          gap: 2,
          padding: "0 16px",
          background: "#fff",
          borderBottom: "1px solid var(--linea)",
          overflowX: "auto",
        }}
      >
        {TARIFARIO.map((t, i) => (
          <button
            key={t.label}
            type="button"
            data-pestana-de-tarifario={t.label}
            aria-current={i === elegida ? "true" : "false"}
            onClick={() => fijarPedida(i)}
            style={pestanaDe(i === elegida)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ——— La nota de la pestana y la pildora (828-834) ——— */}
      <div
        style={{
          flex: "0 0 auto",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          padding: "12px 18px",
          background: "#fff",
          borderBottom: "1px solid var(--linea)",
        }}
      >
        <p
          data-nota-de-cabecera="1"
          style={{
            margin: 0,
            flex: 1,
            minWidth: 220,
            fontSize: 13.5,
            lineHeight: 1.55,
            color: "var(--tinta-2)",
            maxWidth: "80ch",
            textWrap: "pretty",
          }}
        >
          {pestana?.nota ?? ""}
        </p>
        <span
          data-solo-lectura="1"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            border: "1px solid var(--linea)",
            borderRadius: "var(--radio-pastilla)",
            padding: "4px 12px",
            background: "var(--sup)",
            fontSize: 12.5,
            color: "var(--tinta-3)",
            flex: "0 0 auto",
          }}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            {CANDADO.map((trazo) => (
              <path key={trazo} d={trazo} />
            ))}
          </svg>
          {SOLO_LECTURA}
        </span>
      </div>

      {/* ——— La tabla y su pie (835-855) ——— */}
      <div data-desplazable="tarifario" style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        <TablaDeDatos
          nombre="tarifario"
          columnas={pestana?.columnas ?? []}
          filas={pestana?.filas ?? []}
          anchoMinimo={ANCHO_MINIMO_DEL_TARIFARIO}
        />
        {/* El pie va **dentro** del contenedor con desplazamiento (linea 854), o sea que se va
            hacia arriba con la tabla en vez de quedarse anclado abajo. Es del artboard y se
            porta tal cual: es una nota de la tabla, no una barra de estado. */}
        <p
          data-nota-de-pie="1"
          style={{
            margin: 0,
            padding: "13px 18px",
            fontSize: 12.5,
            lineHeight: 1.55,
            color: "var(--tinta-3)",
            textWrap: "pretty",
          }}
        >
          {pestana?.pie ?? ""}
        </p>
      </div>
    </div>
  );
}
