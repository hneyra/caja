import { useState, type CSSProperties } from "react";
import {
  CHIP_DE_TODOS,
  CHIPS,
  ORDEN_NATURAL,
  ORDENES,
  RECIBOS,
  SECCION_DE_RECIBOS,
  TOTAL_DEL_TURNO,
} from "@/datos";
import type { OrdenDeLaLista, Recibo } from "@/datos";
import { INSIGNIAS, type TonoDeInsignia } from "@/ds/tokens";
import { COBRO_NUEVO } from "@/marco/destino";
import type { PropsDePantalla } from "@/marco/MarcadorDeSeccion";

/**
 * `#recibos` — la lista de los recibos del turno, y el hueco de la ficha a su derecha.
 *
 * Portado de `TesoreriaV6.dc.html`: la plantilla de las lineas 542-596 —la lista de 376 px— y la
 * 599-607 —el «Elija un recibo de la lista» de la derecha—, con la logica que las alimenta: el
 * filtrado y el orden (1450-1458), `chips` (1867-1875), `orden` (1876-1877), `conteo` y `filas`
 * (1878-1890) y `sinSeleccion` (1891). Los estilos van **en linea y con los valores del
 * artboard**, que es la doctrina de `PORTAR.md`.
 *
 * <h2>Que se filtra, que se ordena y que NO se cuenta</h2>
 *
 * El conteo dice «N de {@link TOTAL_DEL_TURNO}»: N es lo que queda tras filtrar y 52 es lo que
 * lleva el turno. **No es «N de N»**, y por eso el numero de la derecha no sale de contar nada
 * que esta pantalla tenga: sale de los datos. Un filtro que deja una fila dice «1 de 52».
 *
 * <h2>Donde vive lo que la lista recuerda, y en que se desvia del artboard</h2>
 *
 * La consulta, el chip y el orden viven **en esta pantalla**; cual esta elegido vive en el
 * {@link import("@/marco/destino").Destino} del marco. Esa division no es un capricho:
 *
 * <ul>
 *   <li>Lo elegido tiene que poder venir **de fuera** —una fila de «Actividad reciente» del
 *       panel, o una entrada de la paleta— y por eso es el `destino`, que es el `extra` del
 *       `ir(dest, extra)` del artboard. Pulsar una fila navega con `irA`, igual que el `abrir`
 *       de la linea 2080, y asi ni el hash ni las pestanas se tocan desde aqui.</li>
 *   <li>El chip tambien puede venir de fuera —«Recibos anulados» de la paleta manda
 *       `{ chip: 'Anulado' }`—, pero **ademas se cambia aqui**. Es estado propio que un destino
 *       puede fijar, y por eso se sincroniza cuando el destino trae uno nuevo.</li>
 *   <li>La consulta y el orden no los fija ningun destino: son de la pantalla y solo de ella.</li>
 * </ul>
 *
 * **La desviacion**: en el artboard esos tres viven en el estado global, asi que irse al panel y
 * volver conserva lo escrito en la busqueda. Aqui la pantalla se desmonta al cambiar de seccion
 * y vuelve limpia. Se deja asi a proposito —el marco no es el sitio donde guardar el filtro de
 * una pantalla— y queda dicho para que no se descubra como un defecto.
 *
 * <h2>La ficha no entra en este issue</h2>
 *
 * La mitad derecha dibuja **solo** el estado vacio del artboard. Con un recibo elegido queda el
 * marcador de {@link FICHA_PENDIENTE}, por lo mismo que `MarcadorDeSeccion` existe: una mitad de
 * pantalla en blanco es la forma silenciosa de fallar que `PORTAR.md` avisa.
 */

/** El texto del campo de busqueda (linea 549). */
export const BUSQUEDA = "Recibo, contribuyente o documento";

/** El rotulo del boton que la vacia, que solo se dibuja cuando hay algo escrito (linea 551). */
export const LIMPIAR_LA_BUSQUEDA = "Limpiar la búsqueda";

/** El rotulo del `<select>` del orden (linea 564). */
export const ORDENAR_LA_LISTA = "Ordenar la lista";

/** Lo que dice la lista cuando no casa ningun recibo (lineas 576-578). */
export const NINGUNO_COINCIDE = "Ningún recibo coincide";
export const DONDE_MIRAR =
  "Puede ser de otro turno o de otra caja. Los recibos de días anteriores se consultan por " +
  "fecha en el cierre.";
export const COBRAR = "Cobrar";

/** Lo que dice la mitad derecha sin nada elegido (lineas 604-605). */
export const ELIJA_UN_RECIBO = "Elija un recibo de la lista";
export const DONDE_SE_ABRE =
  "El recibo se abre aquí al lado, sin salir de la lista. También puede cobrar uno nuevo.";

/**
 * El marcador de la ficha, que **no es del artboard**: es de este port y se va con #12.
 *
 * Se escribe por lo mismo que `MarcadorDeSeccion`: con un recibo elegido, la mitad derecha se
 * quedaria en blanco y una pantalla a medio portar que no da ningun error es justo el modo de
 * fallo que `PORTAR.md` avisa.
 */
export const FICHA_PENDIENTE =
  "La ficha del recibo se porta en el issue siguiente. La lista ya funciona: busca, filtra, " +
  "ordena y recuerda cuál está elegido.";

/** El conteo de la barra gris: «5 de 52» (linea 1878). */
export const conteoDe = (cuantas: number) => `${cuantas} de ${TOTAL_DEL_TURNO}`;

/**
 * Si un recibo casa con lo escrito: en minusculas y por subcadena, contra **tres** campos.
 *
 * Son los tres de la linea 1451: el codigo, el titulo —quien pago— y el titular —que se cobro—.
 * El placeholder promete ademas «documento», y el documento no es un campo de `Recibo`: no se
 * inventa uno, se copia el texto del artboard tal cual.
 */
export const casaLaBusqueda = (recibo: Recibo, consulta: string) => {
  const q = consulta.trim().toLowerCase();
  return (
    q === "" ||
    [recibo.cod, recibo.titulo, recibo.titular].some((campo) => campo.toLowerCase().includes(q))
  );
};

/**
 * Si un recibo casa con el chip: contra su `estado` **o** contra su `uso` (linea 1453).
 *
 * Los dos, y no solo uno. Hoy los cinco recibos traen el mismo texto en los dos campos —son dos
 * huecos de la plantilla de Catastro que V6 rellena igual, y esta escrito donde vive el dato—,
 * de modo que **ningun dato real distingue una implementacion de la otra**: quedarse con
 * `estado` daria hoy exactamente la misma lista. Lo que lo distingue es un recibo cuyos dos
 * campos difieran, y por eso esta funcion se exporta y se mide con uno.
 */
export const casaElChip = (recibo: Recibo, chip: string) =>
  chip === CHIP_DE_TODOS || recibo.estado === chip || recibo.uso === chip;

/** El filtro entero: lo escrito **y** el chip (linea 1450). */
export const filtrar = (recibos: readonly Recibo[], consulta: string, chip: string) =>
  recibos.filter((recibo) => casaLaBusqueda(recibo, consulta) && casaElChip(recibo, chip));

/**
 * El orden elegido (lineas 1457-1458). Devuelve una copia: `sort` ordena en el sitio.
 *
 * `Recibo` es **el natural** y no ordena: devuelve la lista tal como llego. `Importe` va por
 * `valor` descendente —el unico numero de estos datos, y esta ahi para esto—. `Contribuyente`
 * va por `titulo` con `localeCompare(…, 'es')`, que **no** es `<`: comparando por unidades de
 * codigo, la eñe (U+00D1) cae detras de la Z y «Ñañez» se iria al final de la lista.
 */
export const ordenar = (recibos: readonly Recibo[], orden: OrdenDeLaLista): readonly Recibo[] => {
  if (orden === "Importe") return [...recibos].sort((a, b) => b.valor - a.valor);
  if (orden === "Contribuyente")
    return [...recibos].sort((a, b) => a.titulo.localeCompare(b.titulo, "es"));
  return recibos;
};

/** El azul de la accion y del chip activo (linea 914). */
const AZUL = "var(--azul)";

/**
 * La tinta del chip activo: el `#004670` de la linea 1874.
 *
 * En el artboard es un literal, y vale lo mismo que la tinta de la insignia `info` —que ese
 * mismo artboard escribe tambien a mano en su `INS`—. Va por el token por lo mismo que el verde
 * del arqueo en el Panel: es un color del diseno, y la paleta del diseno vive en
 * `ds/tokens/colores.css`.
 */
const TINTA_DEL_CHIP = "var(--ins-info-tinta)";

/** La insignia de un tono, con la forma exacta de `INS` (lineas 935-940). */
const insignia = (tono: TonoDeInsignia): CSSProperties => ({
  display: "inline-block",
  fontSize: 11.5,
  fontWeight: "var(--peso-medio)",
  borderRadius: "var(--radio-4)",
  padding: "2px 8px",
  background: INSIGNIAS[tono].fondo,
  color: INSIGNIAS[tono].tinta,
  whiteSpace: "nowrap",
  flex: "0 0 auto",
});

/** Un chip del filtro (lineas 1872-1874): pastilla, y el activo con borde, fondo y peso. */
const chipDe = (activo: boolean): CSSProperties => ({
  border: `1px solid ${activo ? AZUL : "var(--linea)"}`,
  borderRadius: "var(--radio-pastilla)",
  padding: "3px 10px",
  cursor: "pointer",
  fontSize: 12,
  background: activo ? "var(--azul-suave)" : "#fff",
  color: activo ? TINTA_DEL_CHIP : "var(--tinta-3)",
  fontWeight: activo ? "var(--peso-medio)" : "var(--peso-normal)",
});

/** Una fila de la lista (lineas 1886-1889). La elegida lleva el borde izquierdo y el fondo. */
const filaDe = (elegida: boolean): CSSProperties => ({
  display: "block",
  width: "100%",
  textAlign: "left",
  border: 0,
  borderBottom: "1px solid var(--linea-2)",
  borderLeft: `3px solid ${elegida ? AZUL : "transparent"}`,
  background: elegida ? "var(--azul-suave)" : "transparent",
  padding: "11px 13px",
  cursor: "pointer",
});

export function Recibos({ destino, irA }: PropsDePantalla) {
  const [consulta, fijarConsulta] = useState("");
  const [orden, fijarOrden] = useState<OrdenDeLaLista>(ORDEN_NATURAL);

  /**
   * El chip, que es de esta pantalla **y** lo puede fijar un destino.
   *
   * Los dos `useState` son el patron de React para ajustar estado cuando cambia una prop: se
   * guarda el ultimo `destino.chip` visto y se compara durante el dibujado. Con un `useEffect`
   * la lista se pintaria una vez con el chip viejo; sin nada, «Recibos anulados» de la paleta
   * **no haria nada** estando ya en `#recibos`, que es donde la pantalla no se vuelve a montar.
   *
   * Y solo se sincroniza cuando el destino trae uno: pulsar una fila navega con
   * `{ recibo: … }` y ningun chip, y eso NO puede deshacer el filtro que el cajero puso.
   */
  const [chipDelDestino, fijarChipDelDestino] = useState(destino.chip);
  const [chip, fijarChip] = useState(destino.chip ?? CHIP_DE_TODOS);
  if (destino.chip !== chipDelDestino) {
    fijarChipDelDestino(destino.chip);
    if (destino.chip !== undefined) fijarChip(destino.chip);
  }

  const filas = ordenar(filtrar(RECIBOS, consulta, chip), orden);

  /** Cual esta elegido (linea 1426), y el `sinSeleccion` de la 1891. */
  const esNuevo = destino.recibo === COBRO_NUEVO;
  const elegido = esNuevo ? undefined : RECIBOS.find((r) => r.cod === destino.recibo);
  const sinSeleccion = !esNuevo && elegido === undefined;

  /** Abrir un recibo es el `abrir(cod)` de la linea 2080, con el marco haciendo de `setState`. */
  const abrir = (cod: string) => irA(SECCION_DE_RECIBOS, { recibo: cod });

  return (
    <div
      data-seccion="predios"
      data-split="1"
      // La fila de la linea 543: la lista a la izquierda y la ficha a la derecha.
      style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}
    >
      {/* ——— La lista de 376 px (545-594) ——— */}
      <div
        data-lista="1"
        style={{
          flex: "0 0 376px",
          width: 376,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          background: "#fff",
          borderRight: "1px solid var(--linea)",
        }}
      >
        <div
          style={{
            flex: "0 0 auto",
            padding: "11px 12px 10px",
            borderBottom: "1px solid var(--linea-2)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              border: "1px solid var(--linea)",
              borderRadius: "var(--radio-6)",
              padding: "7px 10px",
              background: "var(--sup)",
            }}
          >
            {/* La lupa va en #5A6B78 y no en el gris del `::placeholder` (linea 548). */}
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--tinta-3)"
              strokeWidth="1.8"
              strokeLinecap="round"
              style={{ flex: "0 0 auto" }}
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-4.3-4.3" />
            </svg>
            <input
              value={consulta}
              onChange={(e) => fijarConsulta(e.target.value)}
              placeholder={BUSQUEDA}
              style={{
                flex: 1,
                minWidth: 0,
                border: 0,
                background: "transparent",
                fontSize: 14,
                outline: "none",
              }}
            />
            {/* El `sc-if` de la linea 550: el aspa solo existe con algo escrito. */}
            {consulta !== "" && (
              <button
                type="button"
                onClick={() => fijarConsulta("")}
                aria-label={LIMPIAR_LA_BUSQUEDA}
                style={{
                  border: 0,
                  background: "transparent",
                  padding: 0,
                  cursor: "pointer",
                  color: "var(--tenue)",
                  flex: "0 0 auto",
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            )}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexWrap: "wrap",
              marginTop: 9,
            }}
          >
            {CHIPS.map((c) => (
              <button
                key={c}
                type="button"
                data-chip={c}
                aria-pressed={chip === c ? "true" : "false"}
                onClick={() => fijarChip(c)}
                style={chipDe(chip === c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* ——— El conteo y el orden (561-568) ——— */}
        <div
          style={{
            flex: "0 0 auto",
            display: "flex",
            alignItems: "center",
            gap: 9,
            padding: "8px 12px",
            borderBottom: "1px solid var(--linea-2)",
            background: "var(--sup)",
          }}
        >
          <span
            data-conteo="1"
            style={{
              flex: 1,
              fontSize: 12,
              fontWeight: "var(--peso-medio)",
              color: "var(--tinta-3)",
            }}
          >
            {conteoDe(filas.length)}
          </span>
          <select
            value={orden}
            // El valor solo puede ser uno de los tres que este mismo `<select>` ofrece, asi que
            // buscarlo en `ORDENES` es lo que evita un `as` sobre el `string` del DOM.
            onChange={(e) => {
              const pedido = ORDENES.find((o) => o === e.target.value);
              if (pedido !== undefined) fijarOrden(pedido);
            }}
            aria-label={ORDENAR_LA_LISTA}
            style={{
              border: "1px solid var(--linea)",
              borderRadius: "var(--radio-5)",
              padding: "3px 7px",
              background: "#fff",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {ORDENES.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>

        {/* ——— Las filas, o el vacio (570-593) ——— */}
        <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
          {filas.length === 0 && (
            <div data-vacio="1" style={{ padding: "32px 20px", textAlign: "center" }}>
              {/* La misma lupa de la busqueda, mas grande y en el gris tenue (linea 575). */}
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--tenue)"
                strokeWidth="1.7"
                strokeLinecap="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-4.3-4.3" />
              </svg>
              <p style={{ margin: "10px 0 0", fontSize: 14.5, fontWeight: "var(--peso-medio)" }}>
                {NINGUNO_COINCIDE}
              </p>
              <p
                style={{
                  margin: "6px 0 0",
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: "var(--tinta-3)",
                  textWrap: "pretty",
                }}
              >
                {DONDE_MIRAR}
              </p>
              {/* El `nuevaFicha` de la linea 579: el mismo destino que el «Cobrar» de la fila
                  del titulo. Lo que abre —el formulario de cobro— es de #13; hoy deja el
                  destino puesto y nada mas. El toast se queda con el, porque una pantalla no
                  tiene con que avisar: eso es del marco. */}
              <button
                type="button"
                onClick={() => abrir(COBRO_NUEVO)}
                style={{
                  marginTop: 14,
                  border: 0,
                  borderRadius: "var(--radio-6)",
                  padding: "9px 16px",
                  background: AZUL,
                  color: "#fff",
                  fontSize: 13.5,
                  fontWeight: "var(--peso-medio)",
                  cursor: "pointer",
                }}
              >
                {COBRAR}
              </button>
            </div>
          )}

          {filas.map((r) => {
            const elegida = elegido?.cod === r.cod;
            return (
              <button
                key={r.cod}
                type="button"
                className="hov-fila"
                data-recibo={r.cod}
                aria-current={elegida ? "true" : "false"}
                onClick={() => abrir(r.cod)}
                style={filaDe(elegida)}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 14,
                      fontWeight: "var(--peso-medio)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.titulo}
                  </span>
                  <span style={insignia(r.tono)}>{r.estado}</span>
                </span>
                <span
                  style={{
                    display: "block",
                    fontSize: 12.5,
                    color: "var(--tinta-3)",
                    marginTop: 3,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.titular}
                </span>
                <span
                  style={{ display: "flex", alignItems: "baseline", gap: 9, marginTop: 6 }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--tinta-3)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {r.cod}
                  </span>
                  <span style={{ flex: 1 }} />
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: "var(--peso-medio)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {r.autovaluo}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ——— La mitad derecha (596-607) ——— */}
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
        {sinSeleccion && (
          <div
            data-sin-seleccion="1"
            style={{ flex: 1, display: "grid", placeItems: "center", padding: 32 }}
          >
            <div style={{ maxWidth: "38ch", textAlign: "center" }}>
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
                {ELIJA_UN_RECIBO}
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
                {DONDE_SE_ABRE}
              </p>
            </div>
          </div>
        )}

        {!sinSeleccion && (
          <div
            data-ficha-pendiente={esNuevo ? COBRO_NUEVO : (elegido?.cod ?? "")}
            style={{ flex: 1, display: "grid", placeItems: "center", padding: 32 }}
          >
            <div
              style={{
                maxWidth: 480,
                background: "#fff",
                border: "1px dashed var(--linea)",
                borderRadius: "var(--radio-8)",
                padding: "16px 18px",
                fontSize: 13.5,
                lineHeight: 1.6,
                color: "var(--tinta-3)",
                textWrap: "pretty",
              }}
            >
              {FICHA_PENDIENTE}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
