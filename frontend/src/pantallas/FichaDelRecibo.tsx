import type { CSSProperties } from "react";
import { PASOS, VALORES_DEL_RECIBO } from "@/datos";
import type { Columna, Recibo, TablaDeCuotas } from "@/datos";
import { INSIGNIAS, type TonoDeInsignia } from "@/ds/tokens";
import { CampoDeFicha } from "@/pantallas/CampoDeFicha";

/**
 * La ficha de un recibo **existente**: su cabecera, sus cinco secciones y su barra inferior.
 *
 * Portado de `TesoreriaV6.dc.html`: la plantilla de las lineas 609-621 (cabecera), 654-663
 * (pestanas), 665-708 (los campos, que dibuja {@link CampoDeFicha}), 710-741 (la tabla de
 * cuotas) y 767-771 (la barra inferior). La logica: `ficha` (1894-1923), `tabs` (1943-1955),
 * `paso` (1956-1968) y `atras` / `adelante` / `pasoNota` (2009-2031). Los estilos van **en linea
 * y con los valores del artboard**, que es la doctrina de `PORTAR.md`.
 *
 * <h2>Lo que este componente NO dibuja, y no es un olvido</h2>
 *
 * El artboard mete en la misma rama la ficha de un recibo y el **cobro nuevo**: `hayFicha` es
 * `nuevo || sel !== undefined` (linea 1892). De esa rama quedan fuera aqui las tres piezas que
 * solo existen con `esNuevo`, que son de #13:
 *
 * <ul>
 *   <li>La barra de **caja y contribuyente** (623-652) con su aviso bloqueante.</li>
 *   <li>El **contador de pendientes** de cada pestana, que el artboard condiciona a
 *       `nuevo && f > 0` (linea 1948). La cuenta se puede hacer igual —`faltan`, en
 *       `CampoDeFicha`— y da **2** en «Anulación» con estos valores; lo que no se dibuja es la
 *       pastilla.</li>
 *   <li>El resumen **«Lo que se va a registrar»** (743-763), que el artboard condiciona a
 *       `nuevo && paso >= PASOS.length - 1` (linea 1970).</li>
 * </ul>
 *
 * <h2>Guardar es un toast, y eso es todo lo que hay</h2>
 *
 * No hay backend, asi que «Continuar» y «Guardar los cambios» hacen lo que hacen en el artboard:
 * avanzar y avisar. Lo que si es de verdad es **ensuciar la pestana**: escribir en un campo
 * llama al `fijarCampo` del marco —el `set(k, v)` de la linea 1352— y con eso aparecen el ` *`
 * de la pestana, el del arbol y el dialogo de cierre.
 */

/** Las tres acciones de la cabecera (linea 1910), en su orden. */
export const VER_LA_CUENTA_CORRIENTE = "Ver la cuenta corriente";
export const REIMPRIMIR = "Reimprimir";
export const ANULAR_EL_RECIBO = "Anular el recibo";

/** Lo que sale al pedir la cuenta corriente (linea 1915). **No navega**: eso es otro sistema. */
export const AVISO_DE_LA_CUENTA_CORRIENTE =
  "Abriría la cuenta corriente del contribuyente en Rentas.";

/** Lo que sale al pulsar «Anular el recibo», ademas de saltar a la seccion 5 (linea 1916). */
export const AVISO_DE_LA_ANULACION =
  "Anular devuelve la deuda a la cuenta corriente. Indique el motivo y quién autoriza.";

/** El toast de las acciones que no tienen tratamiento propio: hoy «Reimprimir» (linea 1917). */
export const mensajeDeAccion = (accion: string, codigo: string) => `${accion}: ${codigo}.`;

/** La linea gris bajo el titulo: `sel.titular + ' · ' + sel.contexto` (linea 1905). */
export const contextoDe = (recibo: Recibo) => `${recibo.titular} · ${recibo.contexto}`;

/** Los rotulos de la barra inferior (lineas 768 y 2013). */
export const ANTERIOR = "Anterior";
export const CONTINUAR = "Continuar";
export const GUARDAR_LOS_CAMBIOS = "Guardar los cambios";

/** Los dos toasts de avanzar en un recibo existente (lineas 2025 y 2026). */
export const CAMBIOS_GUARDADOS = "Cambios guardados.";
export const CAMBIOS_GUARDADOS_EN_EL_RECIBO = "Cambios guardados en el recibo.";

/** La nota del paso (lineas 2028-2031), en sus dos formas para un recibo existente. */
export const NOTA_DEL_ULTIMO_PASO =
  "Anular un recibo devuelve la deuda a la cuenta corriente y queda en la bitácora.";
export const NOTA_DEL_PASO = "Los cambios se guardan al avanzar de sección.";

/**
 * A que seccion salta «Anular el recibo».
 *
 * El artboard escribe `paso: 4` a mano (linea 1916). Aqui se busca **por el id de la seccion**:
 * un 4 escrito a mano deja de senalar a «Anulación» en cuanto alguien inserte una seccion
 * delante, y lo haria en silencio. Que hoy valga 4 lo afirma `verificaciones/ficha.test.tsx`.
 */
export const PASO_DE_LA_ANULACION = PASOS.findIndex((p) => p.id === "anulacion");

/** La ultima seccion: la que cambia el rotulo del boton de la derecha (linea 2013). */
export const ULTIMO_PASO = PASOS.length - 1;

/** La nota de la barra inferior segun donde se este (lineas 2028-2031, rama de recibo existente). */
export const notaDelPaso = (paso: number) =>
  paso >= ULTIMO_PASO ? NOTA_DEL_ULTIMO_PASO : NOTA_DEL_PASO;

/** El rotulo del boton de la derecha (linea 2013, rama de recibo existente). */
export const rotuloDeAdelante = (paso: number) =>
  paso >= ULTIMO_PASO ? GUARDAR_LOS_CAMBIOS : CONTINUAR;

/** El azul de la accion y de la pestana activa (linea 914). */
const AZUL = "var(--azul)";

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

/** Las dos formas de un boton de la cabecera (lineas 1919-1921): la primaria y la de borde. */
const accionDe = (primaria: boolean): CSSProperties =>
  primaria
    ? {
        border: 0,
        borderRadius: "var(--radio-6)",
        padding: "8px 16px",
        background: AZUL,
        color: "#fff",
        fontSize: 13,
        fontWeight: "var(--peso-medio)",
        cursor: "pointer",
      }
    : {
        border: "1px solid var(--linea)",
        borderRadius: "var(--radio-6)",
        padding: "7px 13px",
        background: "#fff",
        fontSize: 13,
        cursor: "pointer",
      };

/** Una pestana de seccion (lineas 1951-1953). La activa lleva subrayado, tinta y peso. */
const pestanaDe = (activa: boolean): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 7,
  border: 0,
  borderBottom: `2px solid ${activa ? AZUL : "transparent"}`,
  background: "transparent",
  padding: "11px 12px 9px",
  cursor: "pointer",
  fontSize: 13.5,
  whiteSpace: "nowrap",
  color: activa ? "var(--tinta)" : "var(--tinta-3)",
  fontWeight: activa ? "var(--peso-fuerte)" : "var(--peso-normal)",
});

/** `TH` y `THN` (lineas 929-930): la cabecera de la tabla, y la de una columna con cifras. */
const cabeceraDe = (columna: Columna): CSSProperties => ({
  padding: "9px 16px",
  textAlign: columna.numerica ? "right" : "left",
  fontSize: 11,
  fontWeight: "var(--peso-fuerte)",
  textTransform: "uppercase",
  letterSpacing: ".07em",
  color: "var(--tinta-3)",
  whiteSpace: "nowrap",
  background: "var(--sup)",
  borderBottom: "1px solid var(--linea)",
});

/**
 * `TD1`, `TDN` y `TD` (lineas 931-933), repartidos como en `filas()` (linea 1363).
 *
 * La primera columna va en peso 600 **por ser la primera**, no por su contenido; las demas
 * miran si su columna es numerica. Son dos criterios distintos y el artboard los escribe asi.
 */
const celdaDe = (columna: Columna | undefined, primera: boolean): CSSProperties => {
  if (primera)
    return {
      padding: "11px 16px",
      fontSize: 13.5,
      fontWeight: "var(--peso-medio)",
      color: "var(--tinta)",
      whiteSpace: "nowrap",
    };
  if (columna?.numerica === true)
    return {
      padding: "11px 16px",
      fontSize: 13.5,
      color: "var(--tinta)",
      textAlign: "right",
      whiteSpace: "nowrap",
      fontVariantNumeric: "tabular-nums",
    };
  return { padding: "11px 16px", fontSize: 13.5, color: "var(--tinta-2)" };
};

/** La tabla de cuotas del paso «Deuda a cobrar» (lineas 710-741). */
function TablaDeCuotasDelPaso({ tabla }: { readonly tabla: TablaDeCuotas }) {
  return (
    <section
      data-tabla="cuotas"
      style={{
        marginTop: 18,
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
          gap: 10,
          padding: "11px 14px",
          borderBottom: "1px solid var(--linea-2)",
        }}
      >
        <h3 style={{ margin: 0, flex: 1, fontSize: 13.5, fontWeight: "var(--peso-fuerte)" }}>
          {tabla.titulo}
        </h3>
        {/* El artboard no le da `onClick` (linea 714): cambiar la seleccion abriria un dialogo
            que V6 no dibuja. Se porta como esta —sin accion y sin toast— en vez de inventarle
            un texto: un aviso escrito aqui seria prosa que el diseno no tiene. */}
        <button
          type="button"
          className="hov-borde"
          style={{
            border: "1px solid var(--linea)",
            borderRadius: "var(--radio-5)",
            padding: "5px 11px",
            background: "#fff",
            fontSize: 12.5,
            cursor: "pointer",
          }}
        >
          {tabla.accion}
        </button>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{ width: "100%", borderCollapse: "collapse", minWidth: tabla.anchoMinimo }}
        >
          <thead>
            <tr>
              {tabla.columnas.map((columna) => (
                <th key={columna.titulo} style={cabeceraDe(columna)}>
                  {columna.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tabla.filas.map((fila, i) => (
              <tr
                // Las cuotas no traen identificador propio —son tres listas de celdas— y su
                // orden es el del dato, que no se reordena aqui. La posicion es la clave.
                key={`${fila[0] ?? ""}-${fila[1] ?? ""}-${i}`}
                className="hov-fila"
                style={{ borderTop: "1px solid var(--linea-2)" }}
              >
                {fila.map((celda, j) => (
                  <td key={`${j}-${celda}`} style={celdaDe(tabla.columnas[j], j === 0)}>
                    {celda}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* El `paso.tabla.vacia` de la linea 1964 es `nuevo`: en un recibo existente las tres
          cuotas estan siempre, asi que el texto del vacio (737) es del cobro nuevo, o sea #13. */}

      <p
        style={{
          margin: 0,
          padding: "10px 14px",
          borderTop: "1px solid var(--linea-2)",
          background: "var(--sup)",
          fontSize: 12.5,
          lineHeight: 1.5,
          color: "var(--tinta-3)",
          textWrap: "pretty",
        }}
      >
        {tabla.nota}
      </p>
    </section>
  );
}

export interface FichaDelReciboProps {
  /** El recibo elegido. La cabecera sale de aqui; el cuerpo, de `VALORES_DEL_RECIBO`. */
  readonly recibo: Recibo;
  /** En que seccion se esta. Es el `s.paso` del artboard, y vive en la pantalla que la aloja. */
  readonly paso: number;
  readonly alIrAPaso: (paso: number) => void;
  /** Guarda un campo y **ensucia la pestana**: el `set(k, v)` de la linea 1352. */
  readonly fijarCampo: (clave: string, valor: string) => void;
  /** El valor de un campo, o el del recibo si nadie lo ha tocado: el `val(k, d)` de la 1358. */
  readonly valorDeCampo: (clave: string, porOmision: string) => string;
  readonly avisar: (texto: string) => void;
}

export function FichaDelRecibo({
  recibo,
  paso,
  alIrAPaso,
  fijarCampo,
  valorDeCampo,
  avisar,
}: FichaDelReciboProps) {
  /** El `Math.min(s.paso, PASOS.length - 1)` de la linea 1423, por si el paso se sale. */
  const actual = Math.min(Math.max(paso, 0), ULTIMO_PASO);
  const pasoDef = PASOS[actual];

  /** El `val(f.k, d[f.k])` de la linea 1396, con `d` ya resuelto a los valores del recibo. */
  const valorDe = (clave: string) => valorDeCampo(clave, VALORES_DEL_RECIBO[clave] ?? "");

  /**
   * El `state.intento` de la linea 1404, que en un recibo existente **nadie enciende**.
   *
   * Lo enciende `adelante` cuando el cobro nuevo no puede emitir (linea 2021), y eso es #13. Se
   * pasa explicito y no se omite para que el dia que llegue el cobro nuevo el estilo de error ya
   * este escrito y probado en {@link CampoDeFicha}.
   */
  const intento = false;

  const esUltimo = actual >= ULTIMO_PASO;

  /** El `atras` de la linea 2012. No mira si esta apagado: en la primera seccion no mueve nada. */
  const atras = () => alIrAPaso(Math.max(actual - 1, 0));

  /** El `adelante` de las lineas 2018-2027, sin la rama del cobro nuevo. */
  const adelante = () => {
    if (esUltimo) {
      avisar(CAMBIOS_GUARDADOS_EN_EL_RECIBO);
      return;
    }
    alIrAPaso(actual + 1);
    avisar(CAMBIOS_GUARDADOS);
  };

  /** Las tres acciones de la cabecera y lo que hace cada una (lineas 1908-1922). */
  const acciones: readonly { readonly label: string; readonly primaria: boolean }[] = [
    { label: VER_LA_CUENTA_CORRIENTE, primaria: false },
    { label: REIMPRIMIR, primaria: false },
    { label: ANULAR_EL_RECIBO, primaria: true },
  ];

  const alPulsarAccion = (label: string) => {
    if (label === VER_LA_CUENTA_CORRIENTE) {
      avisar(AVISO_DE_LA_CUENTA_CORRIENTE);
      return;
    }
    if (label === ANULAR_EL_RECIBO) {
      alIrAPaso(PASO_DE_LA_ANULACION);
      avisar(AVISO_DE_LA_ANULACION);
      return;
    }
    avisar(mensajeDeAccion(label, recibo.cod));
  };

  return (
    <>
      {/* ——— La cabecera (609-621) ——— */}
      <div
        data-ficha={recibo.cod}
        style={{
          flex: "0 0 auto",
          padding: "12px 18px",
          background: "#fff",
          borderBottom: "1px solid var(--linea)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span
            data-codigo="1"
            style={{
              fontSize: 14,
              fontWeight: "var(--peso-fuerte)",
              color: AZUL,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {recibo.cod}
          </span>
          <span style={insignia(recibo.tono)}>{recibo.estado}</span>
          <span style={{ flex: 1, minWidth: 20 }} />
          {acciones.map((accion) => (
            <button
              key={accion.label}
              type="button"
              className={accion.primaria ? "hov-primario" : "hov-borde"}
              data-accion={accion.label}
              onClick={() => alPulsarAccion(accion.label)}
              style={accionDe(accion.primaria)}
            >
              {accion.label}
            </button>
          ))}
        </div>
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 17,
            fontWeight: "var(--peso-fuerte)",
            letterSpacing: "-.015em",
            textWrap: "pretty",
          }}
        >
          {recibo.titulo}
        </p>
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 13.5,
            lineHeight: 1.5,
            color: "var(--tinta-3)",
            textWrap: "pretty",
          }}
        >
          {contextoDe(recibo)}
        </p>
      </div>

      {/* ——— Las cinco pestanas (654-663) ——— */}
      <div
        style={{
          flex: "0 0 auto",
          display: "flex",
          alignItems: "stretch",
          gap: 2,
          padding: "0 14px",
          background: "#fff",
          borderBottom: "1px solid var(--linea)",
          overflowX: "auto",
        }}
      >
        {PASOS.map((p, i) => (
          <button
            key={p.id}
            type="button"
            data-paso={p.id}
            aria-current={i === actual ? "true" : "false"}
            onClick={() => alIrAPaso(i)}
            style={pestanaDe(i === actual)}
          >
            <span>{p.label}</span>
            {/* El contador de pendientes va aqui en el artboard (658-660) y **solo se dibuja en
                cobro nuevo** (`nuevo && f > 0`, linea 1948). En un recibo existente no hay
                ninguno, y no porque la cuenta de cero: `faltan` da 2 en «Anulación». */}
          </button>
        ))}
      </div>

      {/* ——— La seccion, con su nota, sus campos y su tabla (665-741) ——— */}
      <div
        data-cuerpo={pasoDef?.id ?? ""}
        style={{
          flex: 1,
          overflow: "auto",
          minHeight: 0,
          padding: "16px 18px 24px",
          animation: "fadeIn .18s ease",
        }}
      >
        <div style={{ maxWidth: 920 }}>
          <p
            style={{
              margin: "0 0 14px",
              fontSize: 13.5,
              lineHeight: 1.6,
              color: "var(--tinta-2)",
              maxWidth: "74ch",
              textWrap: "pretty",
            }}
          >
            {pasoDef?.nota}
          </p>

          <div
            data-campos="1"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(212px,1fr))",
              gap: "14px 16px",
            }}
          >
            {(pasoDef?.campos ?? []).map((campo) => (
              <CampoDeFicha
                key={campo.clave}
                campo={campo}
                valor={valorDe(campo.clave)}
                intento={intento}
                alCambiar={(valor) => fijarCampo(campo.clave, valor)}
              />
            ))}
          </div>

          {pasoDef?.tabla !== undefined && <TablaDeCuotasDelPaso tabla={pasoDef.tabla} />}
        </div>
      </div>

      {/* ——— La barra inferior (767-771) ——— */}
      <div
        style={{
          flex: "0 0 auto",
          display: "flex",
          alignItems: "center",
          gap: 11,
          flexWrap: "wrap",
          padding: "11px 18px",
          background: "#fff",
          borderTop: "1px solid var(--linea)",
        }}
      >
        <button
          type="button"
          onClick={atras}
          aria-disabled={actual === 0 ? "true" : "false"}
          style={{
            border: `1px solid ${actual === 0 ? "var(--linea)" : AZUL}`,
            borderRadius: "var(--radio-6)",
            padding: "9px 18px",
            background: "#fff",
            fontSize: 13.5,
            fontWeight: "var(--peso-medio)",
            cursor: "pointer",
            color: actual === 0 ? "var(--tenue)" : AZUL,
          }}
        >
          {ANTERIOR}
        </button>
        <p
          style={{
            margin: 0,
            flex: 1,
            minWidth: 170,
            fontSize: 12.5,
            lineHeight: 1.45,
            color: "var(--tinta-3)",
            textWrap: "pretty",
          }}
        >
          {notaDelPaso(actual)}
        </p>
        {/* `aria-disabled` y el `title` con el motivo son del cobro nuevo que no puede emitir
            (lineas 2014-2015): en un recibo existente `bloqueado` es siempre `'false'` y el
            motivo es la cadena vacia, asi que aqui no hay tooltip que poner. */}
        <button
          type="button"
          className="hov-primario"
          onClick={adelante}
          aria-disabled="false"
          style={{
            border: 0,
            borderRadius: "var(--radio-6)",
            padding: "10px 22px",
            background: AZUL,
            color: "#fff",
            fontSize: 13.5,
            fontWeight: "var(--peso-medio)",
            cursor: "pointer",
            opacity: 1,
          }}
        >
          {rotuloDeAdelante(actual)}
        </button>
      </div>
    </>
  );
}
