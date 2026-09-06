import { useState, type CSSProperties } from "react";
import { DETERMINACIONES, NODOS } from "@/datos";
import type { PropsDePantalla } from "@/marco/pantalla";
import { TablaDeDatos } from "@/pantallas/TablaDeDatos";

/**
 * `#cajas` — «Cajas y arqueo»: los seis nodos a la izquierda y el arqueo del elegido a la derecha.
 *
 * Portado de `TesoreriaV6.dc.html`: la plantilla de las lineas 777-818 y la logica que la
 * alimenta —`arbol` (2034-2043) y `terr` (2044-2049)— sobre `NODOS` (1066-1072) y
 * `DETERMINACIONES` (1074-1137), que ya viven en `src/datos/arqueo.ts` desde #5. Los estilos van
 * **en linea y con los valores del artboard**, que es la doctrina de `PORTAR.md`.
 *
 * <h2>Es una pantalla de lectura, y eso se nota en lo que NO tiene</h2>
 *
 * No hay filtro, ni busqueda, ni exportacion, ni un solo campo editable: el artboard no los trae
 * y el issue los excluye. Lo unico que se puede hacer aqui es **elegir un nodo**, que es lo que
 * el `ir: () => this.setState({ nodo: i })` de la linea 2038 hace: cambia lo que se mira, no lo
 * que hay.
 *
 * <h2>La deuda de #9 y #10 que esta pantalla paga</h2>
 *
 * Tres filas del Panel y cuatro acciones de la paleta navegan a esta seccion **con un nodo
 * concreto** en el destino —«Sin arquear» al 2, «Sin conciliar» al 5, «Anulaciones del día» al
 * 4—, y hasta este issue no habia quien lo recogiera: los seis van a la misma seccion, asi que
 * sin leer el `nodo` las siete entradas eran la misma pantalla con siete rotulos. Aqui se lee, y
 * lo que las pruebas afirman es **el titulo del nodo que queda elegido** y no su indice: un
 * indice que baila abre otro panel sin que nada lo diga.
 *
 * El mecanismo es el mismo que el chip de {@link import("@/pantallas/Recibos")}: dos `useState`
 * —el ultimo destino visto y el nodo elegido— comparados durante el dibujado. Con un `useEffect`
 * la pantalla se pintaria una vez con el nodo viejo; sin nada, «Anulaciones del día» de la paleta
 * **no haria nada** estando ya en `#cajas`, que es donde la pantalla no se vuelve a montar.
 *
 * <h2>La desviacion del artboard, medida</h2>
 *
 * El artboard elige la tabla con `Math.min(s.nodo, DETERMINACIONES.length - 1)` (linea 1460) pero
 * marca el nodo con `s.nodo === i` (2035), o sea que **los dos indices pueden separarse**:
 * ejecutando su logica con `nodo: 9`, `terr.titulo` da «Pendientes de conciliar» y ninguno de los
 * seis botones queda con `aria-current="true"`. Es una tabla que nadie eligio, y es el mismo
 * defecto que el arranque con hash del issue del marco.
 *
 * Aqui el indice **se acota una sola vez** ({@link acotar}) y lo usan los dos, de modo que la
 * tabla de la derecha siempre es la del nodo marcado a la izquierda. La cota por abajo la anade
 * este port: el artboard no la tiene, y con un indice negativo su tabla seria `undefined` — una
 * mitad derecha en blanco, que es la forma silenciosa de fallar que `PORTAR.md` avisa.
 */

/** El rotulo de la cabecera de la lista de la izquierda (linea 781). */
export const TITULO_DE_LA_LISTA = "Cajas y movimientos";

/** El `min-width` de la tabla de esta pantalla (linea 797). */
export const ANCHO_MINIMO_DEL_ARQUEO = 620;

/**
 * El indice que de verdad se dibuja: el pedido, acotado a los que hay.
 *
 * `Math.min` es del artboard (linea 1460); `Math.max` lo anade este port. Ver la cabecera.
 */
export const acotar = (indice: number, cuantos: number) =>
  Math.min(Math.max(indice, 0), cuantos - 1);

/** Un nodo de la lista (lineas 2039-2041): el elegido con su borde izquierdo, su fondo y su peso. */
const nodoDe = (elegido: boolean): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 10,
  width: "100%",
  border: 0,
  borderBottom: "1px solid var(--linea-2)",
  borderLeft: `3px solid ${elegido ? "var(--azul)" : "transparent"}`,
  background: elegido ? "var(--azul-suave)" : "transparent",
  padding: "10px 13px",
  cursor: "pointer",
  color: "var(--tinta)",
  fontWeight: elegido ? "var(--peso-fuerte)" : "var(--peso-normal)",
});

export function Cajas({ destino }: PropsDePantalla) {
  /**
   * El nodo elegido, que es de esta pantalla **y** lo puede fijar un destino.
   *
   * Solo se sincroniza cuando el destino trae uno: navegar aqui desde el arbol no lleva ninguno
   * —`arbol.test.tsx` afirma que `data-ir-nodo` queda vacio— y eso NO puede deshacer el nodo que
   * el cajero acaba de elegir.
   */
  const [nodoDelDestino, fijarNodoDelDestino] = useState(destino.nodo);
  const [pedido, fijarPedido] = useState(destino.nodo ?? 0);
  if (destino.nodo !== nodoDelDestino) {
    fijarNodoDelDestino(destino.nodo);
    if (destino.nodo !== undefined) fijarPedido(destino.nodo);
  }

  const elegido = acotar(pedido, NODOS.length);
  const tabla = DETERMINACIONES[elegido];

  return (
    <div
      data-seccion="territorio"
      data-split="1"
      // La fila de la linea 779: la lista de nodos a la izquierda y el arqueo a la derecha.
      style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}
    >
      {/* ——— La lista de 300 px (780-790) ——— */}
      <div
        data-lista="1"
        style={{
          flex: "0 0 300px",
          width: 300,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          background: "#fff",
          borderRight: "1px solid var(--linea)",
        }}
      >
        <p
          style={{
            margin: 0,
            flex: "0 0 auto",
            padding: "11px 14px",
            borderBottom: "1px solid var(--linea-2)",
            fontSize: 12.5,
            fontWeight: "var(--peso-fuerte)",
          }}
        >
          {TITULO_DE_LA_LISTA}
        </p>
        <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
          {NODOS.map((nodo, i) => (
            <button
              key={nodo.titulo}
              type="button"
              // El `style-hover="background:#F7FBFE"` de la linea 784 es el mismo `SUP` de las
              // filas del Panel, asi que reusa su clase. Como alli, le gana al fondo del nodo
              // elegido: es el `!important` que el estilo en linea obliga a poner.
              className="hov-fila"
              data-nodo={nodo.titulo}
              aria-current={i === elegido ? "true" : "false"}
              onClick={() => fijarPedido(i)}
              style={nodoDe(i === elegido)}
            >
              <span style={{ flex: 1, minWidth: 0, textAlign: "left", fontSize: 13.5 }}>
                {nodo.titulo}
              </span>
              <span style={{ fontSize: 12, color: "var(--tinta-3)", flex: "0 0 auto" }}>
                {nodo.resumen}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ——— El arqueo del nodo elegido (791-816) ——— */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            flex: "0 0 auto",
            padding: "13px 18px",
            background: "#fff",
            borderBottom: "1px solid var(--linea)",
          }}
        >
          <h2
            data-titulo-del-nodo="1"
            style={{ margin: 0, fontSize: 16, fontWeight: "var(--peso-fuerte)" }}
          >
            {tabla?.titulo ?? ""}
          </h2>
          <p
            style={{
              margin: "5px 0 0",
              fontSize: 13.5,
              lineHeight: 1.55,
              color: "var(--tinta-3)",
              maxWidth: "78ch",
              textWrap: "pretty",
            }}
          >
            {tabla?.nota ?? ""}
          </p>
        </div>
        {/* El contenedor con desplazamiento es lo que hace que la cabecera pegajosa se pegue a
            algo: sin el, `position: sticky` no tiene respecto de que quedarse. Ver
            `TablaDeDatos`. */}
        <div data-desplazable="arqueo" style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
          <TablaDeDatos
            nombre="arqueo"
            columnas={tabla?.columnas ?? []}
            filas={tabla?.filas ?? []}
            anchoMinimo={ANCHO_MINIMO_DEL_ARQUEO}
          />
        </div>
      </div>
    </div>
  );
}
