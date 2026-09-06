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
import { COBRO_NUEVO, SIN_EXTRAS } from "@/marco/destino";
import type { PropsDePantalla } from "@/marco/pantalla";
import { MENSAJE_DE_COBRO_NUEVO } from "@/marco/rotulos";
import { BORRADOR_DESCARTADO, reciboEmitido } from "@/pantallas/CobroNuevo";
import { FichaDelRecibo } from "@/pantallas/FichaDelRecibo";

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
 * <h2>Los tres estados de la mitad derecha</h2>
 *
 * Son los del artboard, y se excluyen: **sin nada elegido** el «Elija un recibo de la lista»
 * (599-607); con un recibo elegido, {@link FichaDelRecibo} con ese recibo; y con un cobro
 * empezado, la misma {@link FichaDelRecibo} con un cobro. Los dos ultimos son la misma plantilla
 * en el artboard (`hayFicha` es `nuevo || sel !== undefined`, linea 1892) y desde #13 tambien
 * aqui.
 *
 * <h2>Lo que esta pantalla recuerda de un cobro, y por que no lo recuerda la ficha</h2>
 *
 * Dos cosas: en que seccion se esta (`paso`) y si ya se intento emitir (`intento`). Las dos son
 * estado global en el artboard (linea 1221) y aqui viven en esta pantalla por el mismo motivo:
 * la ficha se desmonta cuando el cobro se emite o se descarta, asi que guardarlas dentro seria
 * guardarlas en algo que desaparece justo cuando hacen falta.
 *
 * <h2>Un defecto del port de #12, medido y corregido aqui</h2>
 *
 * `abrir(cod)` en el artboard (linea 2081) hace **dos** cosas ademas de elegir el recibo: pone
 * `paso: 0` y `vals: {}`. #12 no porto ninguna de las dos, y ademas escribio —en el comentario de
 * una prueba— que «el `paso` del artboard vive en su estado global y **nadie lo reinicia al
 * cambiar de recibo**». Ejecutando su logica en Node, el estado que `abrir` deja es
 * `{"predio":"0003-0041180","paso":0,"vals":{},"intento":false}`: lo reinicia.
 *
 * Aqui se reponen **las dos**, y la prueba que defendia lo contrario se retiro con su motivo. El
 * porque de cada una esta al lado de {@link abrir}; el porque de retirar la prueba, en la fila de
 * `CLAUDE.md`: una prueba que afirma como comportamiento del diseno lo contrario de lo que el
 * diseno hace no protege nada, defiende un defecto.
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

export function Recibos({
  destino,
  irA,
  fijarCampo,
  valorDeCampo,
  limpiarCampos,
  avisar,
}: PropsDePantalla) {
  const [consulta, fijarConsulta] = useState("");
  const [orden, fijarOrden] = useState<OrdenDeLaLista>(ORDEN_NATURAL);

  /**
   * En que seccion de la ficha se esta: el `s.paso` del artboard (linea 1423).
   *
   * Vive **aqui y no en la ficha** para que sobreviva a soltar el recibo y elegir otro, que es
   * lo que hace el artboard teniendolo en su estado global. Dentro de `FichaDelRecibo` se
   * reiniciaria cada vez que la mitad derecha se queda sin nada elegido, y eso seria una
   * segunda desviacion distinta de la que esta pantalla ya declara arriba.
   */
  const [paso, fijarPaso] = useState(0);

  /**
   * Si ya se intento emitir: el `state.intento` del artboard (linea 1221).
   *
   * Solo lo enciende «Cobrar y emitir el recibo» cuando **no** se puede (linea 2021), y es lo
   * unico que hace visible el estilo de error de los campos obligatorios vacios. Vive aqui y no
   * en la ficha por lo mismo que `paso`.
   */
  const [intento, fijarIntento] = useState(false);

  /**
   * Cada navegacion reinicia el intento, y una a un cobro nuevo reinicia ademas la seccion.
   *
   * Es el mismo patron de dos `useState` que el chip de abajo, y con la misma razon: hace falta
   * ajustar estado propio cuando cambia una prop. Lo que se compara es **el objeto `destino`**,
   * no su contenido: `irA` lo reemplaza entero en cada navegacion (ver `marco/destino.ts`), asi
   * que una identidad distinta significa exactamente «se ha navegado». Comparando `destino.recibo`
   * en su lugar, pulsar «Cobrar» estando ya en un cobro nuevo no reiniciaria nada, y el artboard
   * si lo reinicia: su `nuevo()` escribe `paso: 0` (linea 2075) sea cual sea el estado anterior.
   *
   * `paso` se reinicia **solo** cuando se empieza un cobro. Abrir un recibo de la lista lo
   * conserva, que es lo que #12 decidio y lo que su prueba afirma; ver la cabecera del modulo.
   */
  const [ultimoDestino, fijarUltimoDestino] = useState(destino);
  if (destino !== ultimoDestino) {
    fijarUltimoDestino(destino);
    fijarIntento(false);
    if (destino.recibo === COBRO_NUEVO) fijarPaso(0);
  }

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

  /**
   * Abrir un recibo es el `abrir(cod)` de la linea 2081, **con sus dos mitades**.
   *
   * `vals: {}` y `paso: 0`, que es lo que esa linea escribe. Ninguna de las dos es cosmetica:
   *
   * <ul>
   *   <li>Sin **`vals: {}`**, el recibo que se abre despues de un cobro ensena la caja y el
   *       documento del cobro en sus dos campos de solo lectura.</li>
   *   <li>Sin **`paso: 0`**, se abre un recibo y se aterriza en «Anulación» porque es donde
   *       dejo el anterior — la seccion que da de baja un cobro, y la unica de las cinco que no
   *       se quiere encontrar por inercia.</li>
   * </ul>
   */
  const abrir = (cod: string) => {
    limpiarCampos();
    fijarPaso(0);
    irA(SECCION_DE_RECIBOS, { recibo: cod });
  };

  /**
   * Empezar un cobro desde el vacio de la lista: el `nuevaFicha` de la linea 579.
   *
   * Es el mismo `nuevo()` (2073-2079) que el «Cobrar» de la fila del titulo y el de la paleta,
   * y **con su toast**, que es el hueco que #11 dejo declarado: entonces una pantalla no tenia
   * con que avisar, y desde #12 lo tiene.
   */
  const cobrarNuevo = () => {
    limpiarCampos();
    irA(SECCION_DE_RECIBOS, { recibo: COBRO_NUEVO });
    avisar(MENSAJE_DE_COBRO_NUEVO);
  };

  /**
   * «Descartar»: el `predio: null, vals: {}, intento: false` de la linea 1914.
   *
   * Suelta la ficha —la mitad derecha vuelve al «Elija un recibo de la lista»—, tira lo escrito y
   * apaga el intento. **No reinicia la seccion**, tambien como el artboard: medido, tras descartar
   * desde la tercera seccion `paso` sigue valiendo 2.
   *
   * Su `limpiarCampos()` es del artboard y **no se puede observar**, medido: quitarlo deja las
   * 2 769 pruebas en verde. El motivo es que, descartado el borrador, la mitad derecha no dibuja
   * ningun campo, y las **dos** unicas salidas de ese estado vuelven a tirar lo escrito —empezar
   * otro cobro (`cobrarNuevo`) y abrir un recibo (`abrir`)—. Se porta igualmente porque es lo que
   * la linea 1914 escribe, y queda dicho aqui para que no se cuente como cubierto: lo que cubre
   * la prueba del criterio 10 es **la pareja**, no esta mitad.
   */
  const descartar = () => {
    limpiarCampos();
    irA(SECCION_DE_RECIBOS, SIN_EXTRAS);
    avisar(BORRADOR_DESCARTADO);
  };

  /**
   * Emitir: el `adelante` de la linea 2022.
   *
   * Deja **elegido el codigo que se acaba de emitir** y vuelve a la primera seccion. Y aqui el
   * artboard hace algo que hay que decir en voz alta: ese codigo no es ninguno de los cinco
   * recibos del turno, asi que `sel` queda `undefined` y la mitad derecha se va al «Elija un
   * recibo de la lista». Se porta tal cual —medido: `hayFicha` pasa a `false` y `sinSeleccion` a
   * `true`—, porque la alternativa seria inventarle al recibo emitido un juego de datos que el
   * diseno no trae. Lo que el cajero ve es el toast con su numero, que es lo que el criterio pide.
   *
   * Lo escrito **no** se tira, que es lo que hace el artboard: su emision no lleva `vals: {}`.
   */
  const emitir = (codigo: string) => {
    irA(SECCION_DE_RECIBOS, { recibo: codigo });
    fijarPaso(0);
    avisar(reciboEmitido(codigo));
  };

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
              // El `aria-label` no esta en la linea 549 del artboard, y se anade con #15 por lo
              // mismo que la linea 212 SI lo lleva en el filtro del arbol: un `placeholder` es
              // un nombre accesible de ultimo recurso y **desaparece en cuanto se escribe**, asi
              // que quien vuelva a preguntar por el campo con algo tecleado dentro se encuentra
              // un cuadro sin nombre. Es la misma cadena, que es lo que hace el arbol.
              aria-label={BUSQUEDA}
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
              {/* El `nuevaFicha` de la linea 579: el mismo `nuevo()` que el «Cobrar» de la
                  fila del titulo y el de la paleta, con su toast. */}
              <button
                type="button"
                onClick={cobrarNuevo}
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

        {esNuevo && (
          <FichaDelRecibo
            cobro={{
              intento,
              alIntentar: () => fijarIntento(true),
              alEmitir: emitir,
              alDescartar: descartar,
            }}
            paso={paso}
            alIrAPaso={fijarPaso}
            fijarCampo={fijarCampo}
            valorDeCampo={valorDeCampo}
            avisar={avisar}
          />
        )}

        {elegido !== undefined && (
          <FichaDelRecibo
            recibo={elegido}
            paso={paso}
            alIrAPaso={fijarPaso}
            fijarCampo={fijarCampo}
            valorDeCampo={valorDeCampo}
            avisar={avisar}
          />
        )}
      </div>
    </div>
  );
}
