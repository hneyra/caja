import type { CSSProperties } from "react";
import {
  ACTIVIDAD,
  BANDEJA,
  CIFRAS,
  COBERTURA,
  CUADRA,
  DESDE_DONDE_CUADRA,
  NODO_DE_MI_CAJA,
  SECCION_DE_CAJAS,
  SECCION_DE_RECIBOS,
} from "@/datos";
import type { LineaDeArqueo } from "@/datos";
import { INSIGNIAS, type TonoDeInsignia } from "@/ds/tokens";
import type { PropsDePantalla } from "@/marco/pantalla";

/**
 * `#panel` — el Panel de Tesoreria: la primera pantalla que ve el cajero al entrar.
 *
 * Portado de `TesoreriaV6.dc.html`: la plantilla de las lineas 466-539 y la logica que la
 * alimenta —`cifras` (1813-1821), `colaTotal` (1822), `bandeja` (1831-1838), `cobertura`
 * (1841-1851), `actividad` (1852-1860) e `irPredios` (1861)—. Los estilos van **en linea y con
 * los valores del artboard**, que es la doctrina de `PORTAR.md`.
 *
 * <h2>Aqui no se calcula nada, y una cosa si se formatea</h2>
 *
 * Las cifras salen enteras de `src/datos/panel.ts`: ni una suma, ni un porcentaje derivado. Lo
 * unico que esta pantalla hace con un numero es **escribirlo de dos formas**, que es lo que el
 * artboard hace: el rotulo con `toFixed(0)` y el ancho de la barra con `toFixed(1)`. Son dos
 * formatos del mismo dato —`2,7` se lee `3 %` y mide `2.7%`— y no se unifican: redondear la
 * barra a entero haria desaparecer la de «Anulaciones», y escribir el rotulo con un decimal
 * llenaria la columna de `100.0 %`.
 *
 * <h2>Las cuatro navegaciones pasan por el marco</h2>
 *
 * Ninguna fila toca el hash ni el estado de las pestanas: todas llaman a `irA`, que es el mismo
 * `ir(dest, extra)` por el que pasan el arbol, la barra de pestanas y la paleta. Lo que cambia
 * de una fila a otra es **con que estado se abre el destino**, y eso es {@link
 * import("@/marco/destino").Destino}: el `nodo` de «Cajas y arqueo» o el `recibo` de «Recibos».
 * El dia que esas dos pantallas se porten leeran ese destino tal cual, sin que este panel
 * cambie.
 */

/** El texto gris de la cabecera de «Lo que espera». Es el `colaTotal` de la linea 1822. */
export const CUANDO_DE_LA_BANDEJA = "del día de hoy";

/** Los tres titulos de seccion, literales del artboard (lineas 488, 506 y 525). */
export const TITULO_DE_LA_BANDEJA = "Lo que espera";
export const TITULO_DEL_ARQUEO = "Arqueo de la caja C-3, en vivo";
export const TITULO_DE_LA_ACTIVIDAD = "Actividad reciente";

/** El texto gris de la cabecera del arqueo (linea 507). */
export const TURNO_DEL_ARQUEO = "turno mañana";

/** El boton de la cabecera de «Actividad reciente» (linea 526). */
export const VER_LOS_RECIBOS = "Ver los recibos del turno";

/**
 * El pie del arqueo, literal de la linea 519 — **con su «se conciliaba»**.
 *
 * El artboard escribe el verbo en pasado donde el resto del parrafo va en presente. Se copia
 * tal cual (`PORTAR.md`, regla 2): corregirlo aqui seria reescribir la prosa del diseno desde
 * el port, y la prosa del rediseno es parte del diseno.
 */
export const PIE_DEL_ARQUEO =
  "La tarjeta no entra al arqueo: se conciliaba contra el extracto del banco. " +
  "Lo que se cuenta al cerrar es solo el efectivo.";

/** El rotulo de la izquierda de una linea del arqueo: `'3 %'` o la palabra «cuadra». */
export const rotuloDeArqueo = (linea: LineaDeArqueo, i: number) =>
  i >= DESDE_DONDE_CUADRA ? CUADRA : `${linea.porcentaje.toFixed(0)} %`;

/** El ancho de su barra: **con un decimal**, que es otro formato del mismo numero. */
export const anchoDeArqueo = (linea: LineaDeArqueo) => `${linea.porcentaje.toFixed(1)}%`;

/**
 * La opacidad de la barra: `0.5 + i * 0.2` en las tres primeras, entera en las que cuadran.
 *
 * Es la escalera del artboard (linea 1851). Las tres primeras son partes de la misma cuenta y
 * la opacidad las ordena; las dos ultimas son el total, y un total a media tinta se leeria como
 * si tambien fuera una parte.
 */
export const opacidadDeArqueo = (i: number) =>
  i >= DESDE_DONDE_CUADRA ? 1 : 0.5 + i * 0.2;

/** El verde con el que se escribe «cuadra» y se rellena su barra (lineas 1848 y 1850). */
const VERDE_QUE_CUADRA = "var(--ins-ok-tinta)";

/** Una tarjeta, una seccion: fondo blanco, borde y radio 8 (lineas 471, 487 y 524). */
const TARJETA: CSSProperties = {
  background: "#fff",
  border: "1px solid var(--linea)",
  borderRadius: "var(--radio-8)",
};

/** La cabecera de las tres secciones (lineas 488, 506 y 525). */
const CABECERA: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "12px 15px",
  borderBottom: "1px solid var(--linea-2)",
};

/** El `<h2>` de una cabecera. */
const TITULO: CSSProperties = { margin: 0, flex: 1, fontSize: 14.5, fontWeight: "var(--peso-fuerte)" };

/** Lo gris de la derecha de una cabecera. */
const NOTA_DE_CABECERA: CSSProperties = { fontSize: 12, color: "var(--tinta-3)" };

/**
 * Una fila pulsable de las tres listas. Solo el relleno cambia: 12, 11 y 10 px (492, 510, 529).
 *
 * El `hov-fila` es el `style-hover="background:#F7FBFE"` de esas mismas tres lineas, que
 * `PORTAR.md` traduce a una clase porque un estilo en linea no puede expresar `:hover`.
 */
const fila = (relleno: string): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 12,
  width: "100%",
  textAlign: "left",
  border: 0,
  borderBottom: "1px solid var(--linea-2)",
  background: "transparent",
  padding: relleno,
  cursor: "pointer",
});

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

export function Panel({ irA }: PropsDePantalla) {
  return (
    <div
      data-seccion="panel"
      // El contenedor de pantalla de la linea 467, con su entrada.
      style={{ flex: 1, overflow: "auto", padding: 18, animation: "fadeIn .22s ease" }}
    >
      <div style={{ maxWidth: 1180, display: "flex", flexDirection: "column", gap: 14 }}>
        {/* ——— Las cuatro cifras (470-484) ——— */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(212px,1fr))",
            gap: 12,
          }}
        >
          {CIFRAS.map((cifra) => (
            <div key={cifra.etiqueta} data-cifra={cifra.etiqueta} style={{ ...TARJETA, padding: "14px 15px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <p
                  style={{
                    margin: 0,
                    flex: 1,
                    fontSize: 11,
                    fontWeight: "var(--peso-medio)",
                    textTransform: "uppercase",
                    letterSpacing: ".09em",
                    color: "var(--tinta-3)",
                  }}
                >
                  {cifra.etiqueta}
                </p>
                {/* El `sc-if` de la linea 474: la pastilla se dibuja **sobre el propio delta**,
                    asi que las dos tarjetas que lo traen vacio no llevan ninguna. */}
                {cifra.delta !== "" && (
                  <span
                    data-delta={cifra.etiqueta}
                    style={{
                      fontSize: 11.5,
                      fontWeight: "var(--peso-fuerte)",
                      borderRadius: "var(--radio-4)",
                      padding: "1px 6px",
                      background: "var(--ins-ok-fondo)",
                      color: "var(--ins-ok-tinta)",
                    }}
                  >
                    {cifra.delta}
                  </span>
                )}
              </div>
              <p
                style={{
                  margin: "9px 0 0",
                  fontSize: 29,
                  fontWeight: "var(--peso-fuerte)",
                  letterSpacing: "-.025em",
                  lineHeight: 1,
                  color: "var(--tinta)",
                }}
              >
                {cifra.valor}
              </p>
              <p
                style={{
                  margin: "8px 0 0",
                  fontSize: 12.5,
                  lineHeight: 1.45,
                  color: "var(--tinta-3)",
                  textWrap: "pretty",
                }}
              >
                {cifra.nota}
              </p>
            </div>
          ))}
        </div>

        {/* ——— La bandeja y el arqueo, uno al lado del otro (486-521) ——— */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))",
            gap: 14,
          }}
        >
          <section data-bloque="espera" style={{ ...TARJETA, overflow: "hidden" }}>
            <div style={CABECERA}>
              <h2 style={TITULO}>{TITULO_DE_LA_BANDEJA}</h2>
              <span style={NOTA_DE_CABECERA}>{CUANDO_DE_LA_BANDEJA}</span>
            </div>
            {BANDEJA.map((espera) => (
              <button
                key={espera.etiqueta}
                type="button"
                className="hov-fila"
                data-espera={espera.etiqueta}
                onClick={() => irA(SECCION_DE_CAJAS, { nodo: espera.nodo })}
                style={fila("12px 15px")}
              >
                <span style={insignia(espera.tono)}>{espera.etiqueta}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{ display: "block", fontSize: 14, fontWeight: "var(--peso-medio)" }}
                  >
                    {espera.titulo}
                  </span>
                  <span
                    style={{
                      display: "block",
                      fontSize: 12.5,
                      lineHeight: 1.45,
                      color: "var(--tinta-3)",
                      marginTop: 2,
                      textWrap: "pretty",
                    }}
                  >
                    {espera.detalle}
                  </span>
                </span>
                <span style={{ fontSize: 17, fontWeight: "var(--peso-fuerte)", flex: "0 0 auto" }}>
                  {espera.cuantos}
                </span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--tenue)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ flex: "0 0 auto" }}
                >
                  <path d="M10 6l6 6-6 6" />
                </svg>
              </button>
            ))}
          </section>

          <section data-bloque="arqueo" style={{ ...TARJETA, overflow: "hidden" }}>
            <div style={CABECERA}>
              <h2 style={TITULO}>{TITULO_DEL_ARQUEO}</h2>
              <span style={NOTA_DE_CABECERA}>{TURNO_DEL_ARQUEO}</span>
            </div>
            {COBERTURA.map((linea, i) => {
              const cuadra = i >= DESDE_DONDE_CUADRA;
              return (
                <button
                  key={linea.label}
                  type="button"
                  className="hov-fila"
                  data-arqueo={linea.label}
                  // Las cinco lineas son la misma caja: abren el nodo de C-3 (linea 1849).
                  onClick={() => irA(SECCION_DE_CAJAS, { nodo: NODO_DE_MI_CAJA })}
                  style={fila("11px 15px")}
                >
                  <span
                    style={{
                      flex: "0 0 130px",
                      minWidth: 0,
                      fontSize: 13.5,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {linea.label}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 40,
                      height: 8,
                      borderRadius: "var(--radio-pastilla)",
                      background: "var(--azul-suave)",
                      overflow: "hidden",
                      position: "relative",
                    }}
                  >
                    <span
                      data-barra={linea.label}
                      style={{
                        position: "absolute",
                        inset: "0 auto 0 0",
                        width: anchoDeArqueo(linea),
                        borderRadius: "var(--radio-pastilla)",
                        background: cuadra ? VERDE_QUE_CUADRA : "var(--azul)",
                        opacity: opacidadDeArqueo(i),
                      }}
                    />
                  </span>
                  <span
                    data-pct={linea.label}
                    style={{
                      flex: "0 0 46px",
                      textAlign: "right",
                      fontSize: 13,
                      fontWeight: "var(--peso-medio)",
                      color: cuadra ? VERDE_QUE_CUADRA : "var(--tinta-3)",
                    }}
                  >
                    {rotuloDeArqueo(linea, i)}
                  </span>
                  {/* Bajo 760 px se esconde, como en el artboard (linea 516 y el corte de la 37). */}
                  <span
                    data-sm-hide="1"
                    style={{
                      flex: "0 0 74px",
                      textAlign: "right",
                      fontSize: 12.5,
                      color: "var(--tinta-3)",
                    }}
                  >
                    {linea.detalle}
                  </span>
                </button>
              );
            })}
            <p
              style={{
                margin: 0,
                padding: "11px 15px",
                background: "var(--sup)",
                fontSize: 12.5,
                lineHeight: 1.5,
                color: "var(--tinta-3)",
                textWrap: "pretty",
              }}
            >
              {PIE_DEL_ARQUEO}
            </p>
          </section>
        </div>

        {/* ——— La actividad reciente (523-536) ——— */}
        <section data-bloque="actividad" style={{ ...TARJETA, overflow: "hidden" }}>
          <div style={CABECERA}>
            <h2 style={TITULO}>{TITULO_DE_LA_ACTIVIDAD}</h2>
            <button
              type="button"
              className="hov-borde"
              // El `irPredios` de la linea 1861: la lista **sin ningun recibo elegido**.
              onClick={() => irA(SECCION_DE_RECIBOS)}
              style={{
                border: "1px solid var(--linea)",
                borderRadius: "var(--radio-5)",
                padding: "5px 11px",
                background: "#fff",
                fontSize: 12.5,
                cursor: "pointer",
              }}
            >
              {VER_LOS_RECIBOS}
            </button>
          </div>
          {ACTIVIDAD.map((entrada) => (
            <button
              key={entrada.codigo}
              type="button"
              className="hov-fila"
              data-actividad={entrada.codigo}
              onClick={() => irA(SECCION_DE_RECIBOS, { recibo: entrada.codigo })}
              style={fila("10px 15px")}
            >
              <span style={insignia(entrada.tono)}>{entrada.tipo}</span>
              <span
                style={{
                  flex: "0 0 auto",
                  fontSize: 13,
                  fontWeight: "var(--peso-medio)",
                  color: "var(--azul)",
                }}
              >
                {entrada.codigo}
              </span>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 13,
                  color: "var(--tinta-2)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {entrada.detalle}
              </span>
              <span style={{ flex: "0 0 auto", fontSize: 12, color: "var(--tinta-3)" }}>
                {entrada.cuando}
              </span>
            </button>
          ))}
        </section>
      </div>
    </div>
  );
}
