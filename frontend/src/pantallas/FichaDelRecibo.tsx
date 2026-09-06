import type { CSSProperties } from "react";
import {
  CAJA_POR_OMISION,
  nombreCortoDe,
  PASOS,
  turnoDe,
  valoresDelCobroNuevo,
  VALORES_DEL_RECIBO,
} from "@/datos";
import type { Columna, Recibo, TablaDeCuotas } from "@/datos";
import { INSIGNIAS, type TonoDeInsignia } from "@/ds/tokens";
import { CampoDeFicha, faltan } from "@/pantallas/CampoDeFicha";
import {
  BarraDeCajaYContribuyente,
  BORRADOR,
  COBRAR_Y_EMITIR,
  cobroAlDocumento,
  COBRO_NUEVO_SIN_DOCUMENTO,
  codigoDe,
  CONTEXTO_DE_CAJA_CERRADA,
  CONTEXTO_SIN_CONTRIBUYENTE,
  contextoDeLaCaja,
  DESCARTAR,
  EL_RECIBO,
  GUARDADO_EN_EL_BORRADOR,
  GUARDAR_BORRADOR,
  lineasDelResumen,
  motivoDe,
  NOTA_DE_LA_EMISION,
  NOTA_DEL_BORRADOR,
  puedeCobrar,
  ResumenDelCobro,
} from "@/pantallas/CobroNuevo";

/**
 * La ficha: **la de un recibo existente y la de un cobro nuevo**, que son la misma plantilla.
 *
 * Portado de `TesoreriaV6.dc.html`: la plantilla de las lineas 609-621 (cabecera), 623-652 (la
 * barra de caja y contribuyente, solo en cobro nuevo), 654-663 (pestanas), 665-708 (los campos,
 * que dibuja {@link CampoDeFicha}), 710-741 (la tabla de cuotas), 743-763 (el resumen «Lo que se
 * va a registrar», solo en cobro nuevo) y 767-771 (la barra inferior). La logica: el calculo de
 * las 1428-1448, `ficha` (1894-1923), `codigo` (1924-1942), `tabs` (1943-1955), `paso`
 * (1956-1968), `cierre` (1969-2008) y `bloqueado` / `motivo` / `adelante` / `pasoNota`
 * (2009-2031). Los estilos van **en linea y con los valores del artboard**, que es la doctrina de
 * `PORTAR.md`.
 *
 * <h2>Una sola plantilla para los dos casos, porque en el artboard tambien lo es</h2>
 *
 * `hayFicha` es `nuevo || sel !== undefined` (linea 1892): el artboard dibuja el recibo abierto y
 * el cobro que todavia no existe con el mismo marcado, y lo que cambia es lo que la logica
 * compone. Partirlo en dos componentes obligaria a repetir la cabecera, las cinco pestanas, la
 * rejilla de campos, la tabla y la barra inferior, y entonces un arreglo en una de las dos mitades
 * se quedaria sin hacer en la otra sin que nada lo dijera. Lo que **si** es propio del cobro nuevo
 * —la barra de arriba y el resumen del final— vive aparte, en
 * {@link import("./CobroNuevo").BarraDeCajaYContribuyente} y
 * {@link import("./CobroNuevo").ResumenDelCobro}.
 *
 * Cual de los dos se dibuja lo decide el tipo: {@link FichaDelReciboProps} es la union de «trae un
 * `recibo`» y «trae un `cobro`», de modo que no existe la forma de llamarla con los dos ni con
 * ninguno.
 *
 * <h2>Las cuatro cosas que solo pasan en un cobro nuevo</h2>
 *
 * <ul>
 *   <li>La barra de **caja y contribuyente** (623-652), con su aviso, que **bloquea** cuando la
 *       caja esta cerrada.</li>
 *   <li>El **contador de pendientes** de cada pestana (`nuevo && f > 0`, linea 1948). En un recibo
 *       existente la cuenta se puede hacer igual —da 2 en «Anulación»— y aun asi no se dibuja
 *       ninguno.</li>
 *   <li>El resumen **«Lo que se va a registrar»** en la ultima seccion (`nuevo && paso >=
 *       PASOS.length - 1`, linea 1970).</li>
 *   <li>La **tabla de cuotas vacia** (`vacia: nuevo`, linea 1964): no hay cuotas elegidas todavia,
 *       y en su lugar se lee que el sistema imputa de lo mas antiguo a lo mas nuevo.</li>
 * </ul>
 *
 * <h2>Guardar es un toast, y eso es todo lo que hay</h2>
 *
 * No hay backend, asi que «Continuar», «Guardar los cambios» y «Cobrar y emitir el recibo» hacen
 * lo que hacen en el artboard: avanzar, avisar y —en la emision— dejar el recibo elegido. Lo que
 * si es de verdad es **ensuciar la pestana**: escribir en un campo llama al `fijarCampo` del marco
 * —el `set(k, v)` de la linea 1352— y con eso aparecen el ` *` de la pestana, el del arbol y el
 * dialogo de cierre. La caja y el documento de la barra pasan por ese mismo `fijarCampo`, con las
 * claves `caja` y `docContrib`, que es lo que hace el artboard.
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

/**
 * La nota de la barra inferior en un **borrador** (lineas 2028-2030, rama de cobro nuevo).
 *
 * En la ultima seccion **no es una frase fija**: si se puede cobrar dice lo que va a pasar, y si
 * no, dice el motivo por el que no. Es la tercera vez que ese mismo motivo se lee en la pantalla
 * —el pie del resumen, el `title` del boton y aqui—, y las tres estan en el artboard: el cajero
 * tiene que poder ver por que no puede cobrar sin pasar el raton por encima de nada.
 */
export const notaDelBorrador = (paso: number, puede: boolean, motivo: string) => {
  if (paso < ULTIMO_PASO) return NOTA_DEL_BORRADOR;
  return puede ? NOTA_DE_LA_EMISION : motivo;
};

/** El rotulo del boton de la derecha (linea 2013): en la ultima seccion, uno de dos. */
export const rotuloDeAdelante = (paso: number, nuevo = false) => {
  if (paso < ULTIMO_PASO) return CONTINUAR;
  return nuevo ? COBRAR_Y_EMITIR : GUARDAR_LOS_CAMBIOS;
};

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

/**
 * La tabla de cuotas del paso «Deuda a cobrar» (lineas 710-741).
 *
 * `vacia` es el `paso.tabla.vacia` de la linea 1964, que el artboard hace valer `nuevo`: en un
 * cobro que acaba de empezar **no hay ninguna cuota elegida**, y lo que se lee en su lugar es
 * quien decide el orden de la imputacion. La cabecera y el pie **siguen dibujandose**, tambien en
 * el artboard: son las seis columnas que van a llenarse y la regla del Codigo Tributario que las
 * ordenara, y ninguna de las dos depende de que ya haya una cuota.
 */
function TablaDeCuotasDelPaso({
  tabla,
  vacia,
}: {
  readonly tabla: TablaDeCuotas;
  readonly vacia: boolean;
}) {
  const filas = vacia ? [] : tabla.filas;
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
            {filas.map((fila, i) => (
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

      {/* El vacio de la linea 737. En un recibo existente las tres cuotas estan siempre, asi que
          esto solo se ve en un cobro nuevo. */}
      {vacia && (
        <p
          data-cuotas-vacias="1"
          style={{
            margin: 0,
            padding: "22px 14px",
            textAlign: "center",
            fontSize: 13,
            color: "var(--tinta-3)",
            textWrap: "pretty",
          }}
        >
          {tabla.vacioTexto}
        </p>
      )}

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

/**
 * Lo que **solo existe mientras se cobra**: el intento, la emision y el descarte.
 *
 * Los tres viven fuera de este componente —en la pantalla de Recibos— por lo mismo que el `paso`:
 * en el artboard son estado global (`intento` y `predio`, linea 1221), y aqui la ficha se
 * desmonta en cuanto el cobro se emite o se descarta, de modo que guardarlos dentro seria
 * guardarlos en algo que va a desaparecer justo cuando se usan.
 */
export interface CobroEnCurso {
  /** El `state.intento` de la linea 1404: si ya se intento emitir sin poder. */
  readonly intento: boolean;
  /** Lo que hace el boton cuando **no** se puede: encender el intento (linea 2021). */
  readonly alIntentar: () => void;
  /** Lo que hace cuando **si** se puede: emitir con ese codigo (linea 2022). */
  readonly alEmitir: (codigo: string) => void;
  /** «Descartar»: tira el borrador y suelta la ficha (linea 1914). */
  readonly alDescartar: () => void;
}

/** Lo que la ficha necesita en los dos casos. */
interface ComunDeLaFicha {
  /** En que seccion se esta. Es el `s.paso` del artboard, y vive en la pantalla que la aloja. */
  readonly paso: number;
  readonly alIrAPaso: (paso: number) => void;
  /** Guarda un campo y **ensucia la pestana**: el `set(k, v)` de la linea 1352. */
  readonly fijarCampo: (clave: string, valor: string) => void;
  /** El valor de un campo, o el del recibo si nadie lo ha tocado: el `val(k, d)` de la 1358. */
  readonly valorDeCampo: (clave: string, porOmision: string) => string;
  readonly avisar: (texto: string) => void;
}

/**
 * O trae un recibo, o trae un cobro: **nunca los dos y nunca ninguno**.
 *
 * Es la union la que lo garantiza, y no un comentario ni un `if` dentro: el artboard resuelve lo
 * mismo con `sel = nuevo ? null : PREDIOS.find(…)` (linea 1426), donde el `null` y el objeto se
 * excluyen por construccion.
 */
export type FichaDelReciboProps = ComunDeLaFicha &
  (
    | {
        /** El recibo elegido. La cabecera sale de aqui; el cuerpo, de `VALORES_DEL_RECIBO`. */
        readonly recibo: Recibo;
        readonly cobro?: undefined;
      }
    | {
        readonly recibo?: undefined;
        /** El cobro en curso. La cabecera y el cuerpo salen de la caja y del documento. */
        readonly cobro: CobroEnCurso;
      }
  );

/** La clave con la que la barra guarda la caja elegida. Es un campo de «Operación» (linea 987). */
export const CLAVE_DE_LA_CAJA = "caja";
/** La clave con la que la barra guarda el documento. Tambien es un campo de «Operación». */
export const CLAVE_DEL_DOCUMENTO = "docContrib";

export function FichaDelRecibo({
  recibo,
  cobro,
  paso,
  alIrAPaso,
  fijarCampo,
  valorDeCampo,
  avisar,
}: FichaDelReciboProps) {
  /** El `esNuevo()` de la linea 1359. */
  const nuevo = cobro !== undefined;

  /** El `Math.min(s.paso, PASOS.length - 1)` de la linea 1423, por si el paso se sale. */
  const actual = Math.min(Math.max(paso, 0), ULTIMO_PASO);
  const pasoDef = PASOS[actual];

  /**
   * La caja y el documento, leidos del **mismo mapa de campos** que la seccion «Operación».
   *
   * No es un atajo: es lo que hace el artboard. Su barra escribe `this.set('caja', …)` y
   * `this.set('docContrib', …)` (lineas 1926 y 1929), que son las mismas dos claves que dos de los
   * campos de solo lectura de la primera seccion. La consecuencia es visible y se porta tal cual:
   * en cuanto se elige una caja, el campo «Caja» de «Operación» pasa de decir `C-3` a decir el
   * nombre entero —`'C-3 — abierta · turno mañana'`—, porque el valor guardado gana al de
   * `datos()`. Medido ejecutando el artboard, no supuesto.
   *
   * El valor por omision de la caja es {@link CAJA_POR_OMISION} y **no** el `caja` de los datos,
   * que es el nombre corto: son dos lecturas distintas de la misma clave con dos omisiones
   * distintas, exactamente como en las lineas 1431 y 1370.
   */
  const caja = valorDeCampo(CLAVE_DE_LA_CAJA, CAJA_POR_OMISION);
  const documento = valorDeCampo(CLAVE_DEL_DOCUMENTO, "");
  const codigo = codigoDe(caja, documento);

  /** El `d` de la linea 1424: los valores del recibo, o los que un cobro nuevo trae de partida. */
  const valores = nuevo ? valoresDelCobroNuevo(caja, documento) : VALORES_DEL_RECIBO;

  /** El `val(f.k, d[f.k])` de la linea 1396, con `d` ya resuelto. */
  const valorDe = (clave: string) => valorDeCampo(clave, valores[clave] ?? "");

  /** El `pendPorPaso` / `pendientes` de las lineas 1438-1439. */
  const pendientesPorPaso = PASOS.map((p) => faltan(p, valorDe));
  const pendientes = pendientesPorPaso.reduce((a, n) => a + n, 0);

  /** El `puede` y el `motivo` de las lineas 1440-1446. En un recibo existente no bloquean nada. */
  const puede = nuevo && puedeCobrar(codigo, pendientes);
  const motivo = nuevo ? motivoDe(codigo, pendientes) : "";

  /**
   * El `state.intento` de la linea 1404. En un recibo existente **nadie lo enciende**.
   *
   * Lo enciende un solo sitio del artboard: la emision de un cobro nuevo que no puede emitir
   * (linea 2021). Por eso llega de fuera y no se declara aqui: es la pantalla la que lo recuerda
   * entre pulsaciones.
   */
  const intento = cobro?.intento === true;

  const esUltimo = actual >= ULTIMO_PASO;

  /** El `bloqueado` de la linea 2014: las **tres** condiciones, y solo en la ultima seccion. */
  const bloqueado = nuevo && esUltimo && !puede;

  /** El `atras` de la linea 2012. No mira si esta apagado: en la primera seccion no mueve nada. */
  const atras = () => alIrAPaso(Math.max(actual - 1, 0));

  /** El `adelante` de las lineas 2018-2027, con sus tres desenlaces. */
  const adelante = () => {
    if (esUltimo && cobro !== undefined) {
      // **La emision.** Si no se puede, no emite: enciende el intento —que es lo que pinta de rojo
      // los obligatorios vacios— y saca el motivo. Es la unica forma de encender `IN_MAL`.
      if (!puede) {
        cobro.alIntentar();
        avisar(motivo);
        return;
      }
      cobro.alEmitir(codigo.completo);
      return;
    }
    if (esUltimo) {
      avisar(CAMBIOS_GUARDADOS_EN_EL_RECIBO);
      return;
    }
    alIrAPaso(actual + 1);
    avisar(nuevo ? GUARDADO_EN_EL_BORRADOR : CAMBIOS_GUARDADOS);
  };

  /** Las acciones de la cabecera (linea 1909): dos en un borrador, tres en un recibo. */
  const acciones: readonly { readonly label: string; readonly primaria: boolean }[] = nuevo
    ? [
        { label: DESCARTAR, primaria: false },
        { label: GUARDAR_BORRADOR, primaria: false },
      ]
    : [
        { label: VER_LA_CUENTA_CORRIENTE, primaria: false },
        { label: REIMPRIMIR, primaria: false },
        { label: ANULAR_EL_RECIBO, primaria: true },
      ];

  const alPulsarAccion = (label: string) => {
    if (label === DESCARTAR) {
      cobro?.alDescartar();
      return;
    }
    if (label === VER_LA_CUENTA_CORRIENTE) {
      avisar(AVISO_DE_LA_CUENTA_CORRIENTE);
      return;
    }
    if (label === ANULAR_EL_RECIBO) {
      alIrAPaso(PASO_DE_LA_ANULACION);
      avisar(AVISO_DE_LA_ANULACION);
      return;
    }
    // La rama por descarte de la linea 1917: «Reimprimir» en un recibo y «Guardar borrador» en un
    // cobro nuevo, que no tiene codigo todavia y por eso se nombra a si mismo «el recibo».
    avisar(mensajeDeAccion(label, recibo?.cod ?? EL_RECIBO));
  };

  /** El `ficha.codigo` / `titulo` / `contexto` / `estado` de las lineas 1895-1908. */
  const codigoDeLaCabecera = nuevo ? codigo.completo : (recibo?.cod ?? "");
  const titulo = nuevo
    ? codigo.listo
      ? cobroAlDocumento(codigo.documento)
      : COBRO_NUEVO_SIN_DOCUMENTO
    : (recibo?.titulo ?? "");
  const contexto = nuevo
    ? codigo.cerrada
      ? CONTEXTO_DE_CAJA_CERRADA
      : codigo.listo
        ? contextoDeLaCaja(nombreCortoDe(codigo.caja))
        : CONTEXTO_SIN_CONTRIBUYENTE
    : recibo !== undefined
      ? contextoDe(recibo)
      : "";
  const estado = nuevo ? BORRADOR : (recibo?.estado ?? "");
  const tono: TonoDeInsignia = nuevo ? "warn" : (recibo?.tono ?? "info");

  return (
    <>
      {/* ——— La cabecera (609-621) ——— */}
      <div
        data-ficha={codigoDeLaCabecera}
        data-nuevo={nuevo ? "1" : "0"}
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
            {codigoDeLaCabecera}
          </span>
          <span data-estado-de-la-ficha={estado} style={insignia(tono)}>
            {estado}
          </span>
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
          {titulo}
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
          {contexto}
        </p>
      </div>

      {/* ——— La barra de caja y contribuyente (623-652), solo en un cobro nuevo ——— */}
      {nuevo && (
        <BarraDeCajaYContribuyente
          codigo={codigo}
          alElegirCaja={(elegida) => fijarCampo(CLAVE_DE_LA_CAJA, elegida)}
          alEscribirDocumento={(digitos) => fijarCampo(CLAVE_DEL_DOCUMENTO, digitos)}
        />
      )}

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
            {/* El contador de pendientes (658-660). La condicion es `nuevo && f > 0` (linea 1948),
                y las dos mitades cuentan: en un recibo existente no se dibuja **aunque la cuenta
                no de cero** —da 2 en «Anulación»—, y en un cobro nuevo desaparece en cuanto la
                seccion queda completa. */}
            {nuevo && (pendientesPorPaso[i] ?? 0) > 0 && (
              <span
                data-pendientes={String(pendientesPorPaso[i])}
                style={{
                  fontSize: 10.5,
                  fontWeight: "var(--peso-fuerte)",
                  borderRadius: "var(--radio-pastilla)",
                  padding: "1px 6px",
                  background: "var(--ins-warn-fondo)",
                  color: "var(--ins-warn-tinta)",
                }}
              >
                {String(pendientesPorPaso[i])}
              </span>
            )}
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

          {pasoDef?.tabla !== undefined && (
            <TablaDeCuotasDelPaso tabla={pasoDef.tabla} vacia={nuevo} />
          )}

          {/* ——— «Lo que se va a registrar» (743-763): solo en la ultima seccion de un cobro ——— */}
          {nuevo && esUltimo && (
            <ResumenDelCobro
              lineas={lineasDelResumen(codigo, valorDe("medio"), turnoDe(caja))}
              puede={puede}
              motivo={motivo}
            />
          )}
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
          {nuevo ? notaDelBorrador(actual, puede, motivo) : notaDelPaso(actual)}
        </p>
        {/* `aria-disabled`, el `title` con el motivo y la opacidad son del cobro nuevo que no
            puede emitir (lineas 2014-2017), y **solo en la ultima seccion**: el artboard escribe
            `nuevo && paso >= PASOS.length - 1 && !puede` en las tres. Antes de llegar ahi el
            boton dice «Continuar» y no bloquea nada, que es lo correcto —avanzar de seccion no
            cobra— y es tambien lo que hace que el bloqueo signifique algo cuando aparece. En un
            recibo existente `bloqueado` es siempre `'false'` y el motivo la cadena vacia. */}
        <button
          type="button"
          className="hov-primario"
          onClick={adelante}
          aria-disabled={bloqueado ? "true" : "false"}
          title={bloqueado ? motivo : ""}
          style={{
            border: 0,
            borderRadius: "var(--radio-6)",
            padding: "10px 22px",
            background: AZUL,
            color: "#fff",
            fontSize: 13.5,
            fontWeight: "var(--peso-medio)",
            cursor: "pointer",
            // Cadenas y no numeros: el artboard escribe `.55` y `1` (linea 2016), y `0.55` seria
            // el mismo color con otra grafia. Aqui se copia la que el diseno tiene.
            opacity: bloqueado ? ".55" : "1",
          }}
        >
          {rotuloDeAdelante(actual, nuevo)}
        </button>
      </div>
    </>
  );
}
