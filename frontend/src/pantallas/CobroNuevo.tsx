import type { CSSProperties } from "react";
import { CAJAS, CAJAS_CERRADAS, nombreCortoDe } from "@/datos";
import { INSIGNIAS, type TonoDeInsignia } from "@/ds/tokens";

/**
 * Lo que **solo existe en un cobro nuevo**: la barra de caja y contribuyente, y el resumen.
 *
 * Portado de `TesoreriaV6.dc.html`: la plantilla de las lineas 623-652 —la barra sobre `#F7FBFE`—
 * y la 743-763 —«Lo que se va a registrar»—, con la logica que las alimenta: el calculo de las
 * 1428-1448, `codigo` (1924-1942) y `cierre` (1969-2008). Lo que estas dos piezas comparten con
 * la ficha de un recibo existente —cabecera, pestanas, cuerpo y barra inferior— no se repite
 * aqui: lo dibuja {@link import("./FichaDelRecibo").FichaDelRecibo}, que es una sola plantilla
 * para los dos casos porque en el artboard tambien lo es (`hayFicha`, linea 1892).
 *
 * <h2>Por que la caja cerrada BLOQUEA, y no solo avisa</h2>
 *
 * Es el argumento que el propio artboard escribe en su comentario de las lineas 1428-1430:
 * *«cobrar en una caja cerrada dejaria el recibo sin turno al que imputarse ni arqueo donde
 * cuadrar»*. Un recibo sin turno no aparece en ningun arqueo, de modo que el dinero cobrado no
 * tiene donde cuadrarse y la diferencia del cierre deja de significar nada. Por eso `puede` exige
 * `!cajaCerrada` y no se conforma con pintarlo de rojo.
 *
 * Y las dos cajas cerradas **se ofrecen igual** en el desplegable (comentario de las 964-966):
 * esconderlas haria que una caja cerrada fuese indistinguible de una que no existe, y el cajero se
 * quedaria sin saber por que no puede cobrar donde cobraba ayer.
 *
 * <h2>El documento admite once y desbloquea a los ocho</h2>
 *
 * `maxlength` es {@link DOCUMENTO_MAXIMO} —once, que es un RUC— y el minimo sale de
 * `largoDeDocumento` de la caja elegida, que para las cuatro es ocho, que es un DNI. No son el
 * mismo numero y no es un descuido: se admite escribir un RUC entero, y con ocho digitos ya se
 * puede emitir. **No se valida el digito verificador**, ni aqui ni en el artboard: eso lo resuelve
 * el padron de contribuyentes, que es de otro sistema.
 */

/** Cuantos digitos caben en el campo del documento: un RUC (artboard, `codigo.largo`, linea 1928). */
export const DOCUMENTO_MAXIMO = 11;

/** Lo que se lee donde el codigo todavia no existe (linea 1932). */
export const SIN_CODIGO = "—";

/** Los rotulos de la barra (lineas 626, 632, 640 y 644). */
export const CAJA_Y_CONTRIBUYENTE = "Caja y contribuyente";
export const POR_QUE_HACE_FALTA =
  "Sin caja abierta no se puede cobrar: el recibo no tendría turno al que imputarse. El " +
  "documento trae la deuda al día.";
export const CAJA = "Caja";
export const CONTRIBUYENTE = "Contribuyente";
export const RECIBO_QUE_SE_EMITIRA = "Recibo que se emitirá";

/** Los dos `aria-label` de la barra (lineas 633 y 641). */
export const CAJA_EN_LA_QUE_SE_COBRA = "Caja en la que se cobra";
export const DOCUMENTO_DEL_CONTRIBUYENTE = "Documento del contribuyente";

/** El marcador de posicion del campo del documento (linea 1928). */
export const DNI_O_RUC = "DNI o RUC";

/** Los tres textos de la insignia de estado (linea 1933). */
export const CAJA_CERRADA = "Caja cerrada";
export const CONTRIBUYENTE_LOCALIZADO = "Contribuyente localizado";
export const digitosQueFaltan = (escritos: number, minimo: number) =>
  `${escritos} de ${minimo} dígitos mínimo`;

/** Los dos avisos de la barra (lineas 1936-1938). */
export const AVISO_DE_CAJA_CERRADA =
  "Esa caja está cerrada desde ayer y además sin arquear. Un recibo emitido en una caja cerrada " +
  "no tiene turno al que imputarse ni arqueo donde cuadrar: elija una caja abierta.";
export const AVISO_DEL_DOCUMENTO =
  "El documento tiene 8 dígitos si es DNI y 11 si es RUC. Se resuelve contra el padrón de " +
  "contribuyentes para traer la deuda al día, con el interés calculado a hoy.";

/**
 * Los tres motivos que bloquean, **en su orden de prioridad** (lineas 1441-1446).
 *
 * El orden no es cosmetico: es lo que decide que se lee cuando fallan dos cosas a la vez. Con la
 * caja cerrada y el documento a medias, lo que hay que arreglar primero es la caja —cambiarla
 * desbloquea de golpe— y por eso su motivo gana. Cambiar el orden dejaria al cajero tecleando
 * digitos contra una caja en la que no va a poder emitir de todos modos.
 */
export const CAJA_CERRADA_NO_EMITE = "La caja elegida está cerrada: no se puede emitir en ella.";
export const FALTA_EL_DOCUMENTO = "Falta el documento del contribuyente.";
export const datosSinLlenar = (cuantos: number) =>
  `Quedan ${cuantos} datos obligatorios sin llenar.`;

/** Lo que dice la cabecera de un cobro nuevo (lineas 1895-1907). */
export const COBRO_NUEVO_SIN_DOCUMENTO = "Cobro nuevo";
export const cobroAlDocumento = (documento: string) => `Cobro al documento ${documento}`;
export const CONTEXTO_DE_CAJA_CERRADA = "Caja cerrada · elija una caja abierta para poder cobrar";
export const contextoDeLaCaja = (caja: string) =>
  `Caja ${caja} · nada se cobra hasta la última sección`;
export const CONTEXTO_SIN_CONTRIBUYENTE =
  "Sin contribuyente · nada se cobra hasta la última sección";
export const BORRADOR = "Borrador";

/** Las dos acciones de la cabecera de un cobro nuevo (linea 1909). */
export const DESCARTAR = "Descartar";
export const GUARDAR_BORRADOR = "Guardar borrador";

/** Como se nombra el borrador en el toast de «Guardar borrador» (linea 1917). */
export const EL_RECIBO = "el recibo";

/** El toast de «Descartar» (linea 1914). */
export const BORRADOR_DESCARTADO = "Borrador descartado.";

/** Lo que dice el resumen (lineas 746-747). */
export const LO_QUE_SE_VA_A_REGISTRAR = "Lo que se va a registrar";

/**
 * El subtitulo del resumen, **copiado literal aunque hable de predios** (linea 747).
 *
 * V6 se dibujo sobre la plantilla de Catastro y esta frase se quedo de alli: habla de una ficha
 * que entra en el padron y de un predio que genera obligacion predial, que no es lo que pasa al
 * cobrar. Se porta tal cual —`PORTAR.md` regla 1, y lo mismo que se hizo con el nombre `PROGRAMAS`
 * en `datos/cajas.ts`— porque reescribirla seria inventar prosa que el diseno no tiene; queda
 * anotado aqui para que se corrija **en el artboard**, que es donde vive la decision.
 */
export const DE_QUE_VA_EL_RESUMEN =
  "Una ficha registrada entra en el padrón y desde ese momento el predio genera obligación " +
  "predial.";

/** Las cuatro lineas del resumen (lineas 1978-2000), con sus textos literales. */
export const SE_EMITE_EL_RECIBO_SIN_NUMERO = "Se emite el recibo sin número";
export const seEmiteElRecibo = (codigo: string) => `Se emite el recibo ${codigo}`;
export const CERRADA_NO_TIENE_TURNO =
  "La caja elegida está cerrada: el recibo no tendría turno al que imputarse.";
export const imputadoA = (caja: string, turno: string) =>
  `Imputado a la caja ${caja}, turno de ${turno}.`;
export const LA_CUOTA_SE_DESCUENTA = "La cuota queda descontada al instante";
export const COMO_SE_IMPUTA =
  "La imputación es de lo más antiguo a lo más nuevo, y dentro del año primero el interés y " +
  "luego el insoluto.";
export const AL_APLICAR = "Al aplicar";
export const EL_EFECTIVO_AL_ARQUEO = "El efectivo entra al arqueo de la caja";
export const COMO_SE_ARQUEA =
  "Se cuenta al cerrar el turno. La diferencia entre lo contado y lo registrado es lo único que " +
  "hay que explicar.";
export const AL_ARQUEO = "Al arqueo";
export const SIN_MEDIO_DE_PAGO = "Sin medio de pago elegido";
export const POR_QUE_EL_MEDIO =
  "Elija el medio de pago: decide si el importe entra al arqueo o se conciliaba contra el banco.";
export const FALTA = "Falta";
export const noEntraAlArqueo = (medio: string) => `${medio}: no entra al arqueo`;
export const COMO_SE_CONCILIA =
  "Se conciliaba contra el extracto del banco. Hasta entonces el recibo está emitido y el dinero " +
  "no está confirmado.";
export const A_CONCILIAR = "A conciliar";
export const SE_IMPRIME_Y_SE_ENTREGA = "Se imprime y se entrega al contribuyente";
export const POR_QUE_SE_IMPRIME =
  "Sin recibo el contribuyente no puede probar que pagó. Se imprimen dos copias: una para él y " +
  "una para el expediente.";
export const DOS_COPIAS = "2 copias";

/** El pie del resumen (lineas 2001-2003). */
export const TODO_LISTO =
  "Todo listo. Al cobrar, la cuota se descuenta de la cuenta corriente y el importe entra al " +
  "turno de la caja.";
export const noSePuedeTodavia = (motivo: string) => `No se puede cobrar todavía. ${motivo}`;

/** El rotulo del boton que emite (linea 2013) y el toast que saca (linea 2022). */
export const COBRAR_Y_EMITIR = "Cobrar y emitir el recibo";
export const reciboEmitido = (codigo: string) =>
  `Recibo ${codigo} emitido. La cuota ya está descontada de la cuenta corriente.`;

/** El toast de avanzar de seccion en un borrador (linea 2026) y la nota del pie (linea 2030). */
export const GUARDADO_EN_EL_BORRADOR = "Guardado en el borrador.";
export const NOTA_DEL_BORRADOR = "El borrador se guarda al avanzar.";
export const NOTA_DE_LA_EMISION =
  "Al cobrar, la cuota se descuenta y el importe entra al turno de la caja.";

/** El medio de pago que entra al arqueo. Es el unico rotulo de `medio` que el resumen mira. */
export const EFECTIVO = "Efectivo";

/** El icono ✓ y el icono ! de las lineas del resumen (lineas 1971-1972). */
export const ICONO_BIEN = "M5 12.5l4.5 4.5L19 7";
export const ICONO_PENDIENTE = "M12 7.5V13M12 16.5h.02";

/**
 * Lo escrito en el campo del documento, filtrado: **solo digitos y como mucho once** (linea 1929).
 *
 * Las dos mitades cuentan. Sin el filtro, `abc123def` dejaria nueve caracteres y `codigoListo`
 * daria por bueno un documento que no es un numero; sin el corte, pegar quince digitos dejaria
 * quince, y el `maxlength` del `<input>` no protege de un pegado por programa.
 */
export const soloDigitos = (escrito: string) =>
  escrito.replace(/[^0-9]/g, "").slice(0, DOCUMENTO_MAXIMO);

/**
 * El correlativo que se emitiria (linea 1434).
 *
 * Es una cuenta del artboard y no una regla de negocio: `85 + (largo % 9)` sobre una serie fija.
 * Se copia tal cual —ocho digitos dan `0003-0041193`, nueve dan `0003-0041185`— porque el numero
 * de verdad lo asigna el backend al emitir, y cualquier otra formula seria inventarse una.
 */
export const codigoEmitido = (documento: string) =>
  `0003-00411${String(85 + (documento.length % 9))}`;

/** Todo lo que la barra deriva de la caja y del documento: el `codigo` de las lineas 1924-1942. */
export interface EstadoDelCodigo {
  /** El nombre entero de la caja elegida, tal como se lee en el desplegable. */
  readonly caja: string;
  /** Los digitos escritos, ya filtrados. */
  readonly documento: string;
  /** Cuantos digitos hacen falta para dar el documento por bueno: `largoDeDocumento`. */
  readonly minimo: number;
  /** La caja elegida esta cerrada. **Es lo que bloquea.** */
  readonly cerrada: boolean;
  /** Hay documento suficiente. */
  readonly listo: boolean;
  /** El codigo que se emitiria, o {@link SIN_CODIGO}. */
  readonly completo: string;
  /** El texto de la insignia y su tono. */
  readonly estado: string;
  readonly tono: TonoDeInsignia;
  /** Si hay que dibujar el aviso de debajo, y con que texto y colores. */
  readonly problema: boolean;
  readonly aviso: string;
  readonly fondo: string;
  readonly borde: string;
  readonly tinta: string;
}

/** Cuantos digitos pide una caja. Es `PROGRAMAS[docTipo] || 8` de la linea 1432. */
const minimoDe = (caja: string) =>
  CAJAS.find((x) => x.nombre === caja)?.largoDeDocumento ?? 8;

/**
 * El estado de la barra para una caja y un documento (lineas 1431-1438 y 1924-1942).
 *
 * Es una funcion pura y se exporta como tal: los tres estados —cerrada, corto y listo— se miden
 * llamandola, y no solo tecleando en la pantalla. Tecleando quedaria sin comprobar que el orden
 * de prioridad es el que es, porque una caja cerrada **con** documento corto y una caja cerrada
 * **sin** documento se ven igual.
 */
export const codigoDe = (caja: string, documento: string): EstadoDelCodigo => {
  const minimo = minimoDe(caja);
  const cerrada = CAJAS_CERRADAS.includes(caja);
  const listo = documento.length >= minimo;
  return {
    caja,
    documento,
    minimo,
    cerrada,
    listo,
    completo: listo && !cerrada ? codigoEmitido(documento) : SIN_CODIGO,
    estado: cerrada
      ? CAJA_CERRADA
      : listo
        ? CONTRIBUYENTE_LOCALIZADO
        : digitosQueFaltan(documento.length, minimo),
    tono: cerrada ? "bad" : listo ? "ok" : "warn",
    problema: cerrada || !listo,
    aviso: cerrada ? AVISO_DE_CAJA_CERRADA : AVISO_DEL_DOCUMENTO,
    fondo: cerrada ? "var(--ins-bad-fondo)" : "var(--sup)",
    borde: cerrada ? "#A8321E" : "var(--acento)",
    tinta: cerrada ? "var(--ins-bad-tinta)" : "var(--tinta-2)",
  };
};

/**
 * Si se puede emitir: **las tres condiciones a la vez** (linea 1440).
 *
 * `codigoListo && !cajaCerrada && pendientes === 0`. Ninguna sobra, y la del medio es la que este
 * issue existe para poner: sin ella se podria cobrar en una caja cerrada con el documento entero.
 */
export const puedeCobrar = (codigo: EstadoDelCodigo, pendientes: number) =>
  codigo.listo && !codigo.cerrada && pendientes === 0;

/** El motivo por el que no se puede, en el orden de la linea 1441. Vacio si se puede. */
export const motivoDe = (codigo: EstadoDelCodigo, pendientes: number) => {
  if (codigo.cerrada) return CAJA_CERRADA_NO_EMITE;
  if (!codigo.listo) return FALTA_EL_DOCUMENTO;
  return pendientes > 0 ? datosSinLlenar(pendientes) : "";
};

/** Una de las cuatro lineas del resumen (lineas 1978-2000). */
export interface LineaDelResumen {
  readonly titulo: string;
  readonly detalle: string;
  /** Lo que se lee a la derecha: `'Al aplicar'`, `'2 copias'`… Nunca es un importe. */
  readonly valor: string;
  /** `true` pinta el ✓ verde; `false`, el ! ambar. */
  readonly bien: boolean;
}

/**
 * Las cuatro lineas del resumen, en su orden (lineas 1978-2000).
 *
 * La **tercera** es la unica que depende del medio de pago, y tiene tres redacciones distintas
 * porque son tres consecuencias distintas: el efectivo entra al arqueo del turno, cualquier otro
 * medio se concilia contra el banco, y sin medio elegido no se sabe cual de las dos. Fundirlas en
 * dos —«efectivo» y «lo demas»— dejaria «sin elegir» diciendo que el dinero se concilia, que es
 * una afirmacion sobre dinero que nadie ha decidido todavia.
 */
export const lineasDelResumen = (
  codigo: EstadoDelCodigo,
  medio: string,
  turno: string,
): readonly LineaDelResumen[] => {
  const puedeEmitirse = codigo.listo && !codigo.cerrada;
  const enEfectivo = medio === EFECTIVO;
  const sinMedio = medio === "";
  return [
    {
      titulo: puedeEmitirse ? seEmiteElRecibo(codigo.completo) : SE_EMITE_EL_RECIBO_SIN_NUMERO,
      detalle: codigo.cerrada
        ? CERRADA_NO_TIENE_TURNO
        : codigo.listo
          ? imputadoA(nombreCortoDe(codigo.caja), turno.toLowerCase())
          : FALTA_EL_DOCUMENTO,
      valor: puedeEmitirse ? codigo.completo : SIN_CODIGO,
      bien: puedeEmitirse,
    },
    { titulo: LA_CUOTA_SE_DESCUENTA, detalle: COMO_SE_IMPUTA, valor: AL_APLICAR, bien: true },
    {
      titulo: enEfectivo
        ? EL_EFECTIVO_AL_ARQUEO
        : sinMedio
          ? SIN_MEDIO_DE_PAGO
          : noEntraAlArqueo(medio),
      detalle: enEfectivo ? COMO_SE_ARQUEA : sinMedio ? POR_QUE_EL_MEDIO : COMO_SE_CONCILIA,
      valor: enEfectivo ? AL_ARQUEO : sinMedio ? FALTA : A_CONCILIAR,
      bien: !sinMedio,
    },
    {
      titulo: SE_IMPRIME_Y_SE_ENTREGA,
      detalle: POR_QUE_SE_IMPRIME,
      valor: DOS_COPIAS,
      bien: true,
    },
  ];
};

/**
 * La insignia de un tono, con la forma exacta de `INS` (lineas 935-940).
 *
 * Es la tercera copia de este objeto —las otras dos estan en `Recibos.tsx` y en
 * `FichaDelRecibo.tsx`— y se deja copiada a proposito: el artboard escribe `INS` una vez y lo usa
 * en tres sitios, y lo que aqui no puede divergir son **los colores**, que salen de `INSIGNIAS` y
 * de `tokens/colores.css` y estan medidos en `tokens.test.ts`.
 */
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

/** El rotulo en versalitas de los dos campos de la barra (lineas 632 y 640). */
const ROTULO_DE_CAMPO: CSSProperties = {
  display: "block",
  fontSize: 10.5,
  fontWeight: "var(--peso-medio)",
  textTransform: "uppercase",
  letterSpacing: ".06em",
  color: "var(--tinta-3)",
  marginBottom: 4,
};

/**
 * El estilo del campo del documento (linea 1930): su ancho sale del minimo de digitos.
 *
 * `minimo * 13 + 26` da 130 px con las cuatro cajas de hoy. Va tal cual, con su cuenta, porque es
 * el artboard quien decide que el campo mida lo que mide el documento que pide.
 *
 * El borde tiene **tres** valores y no dos: rojo con la caja cerrada, gris cuando el documento ya
 * vale, y `#C08A00` —un ambar que no esta en la paleta de V6, asi que va literal— mientras faltan
 * digitos. Es la misma señal que la insignia, en el sitio donde se esta escribiendo.
 */
const campoDelDocumento = (codigo: EstadoDelCodigo): CSSProperties => ({
  width: codigo.minimo * 13 + 26,
  boxSizing: "border-box",
  border: `1px solid ${codigo.cerrada ? "#A8321E" : codigo.listo ? "var(--borde-campo)" : "#C08A00"}`,
  borderRadius: "var(--radio-5)",
  padding: "8px 9px",
  background: "#fff",
  fontSize: 14.5,
  textAlign: "center",
  letterSpacing: ".06em",
  fontVariantNumeric: "tabular-nums",
});

export interface BarraDeCajaProps {
  readonly codigo: EstadoDelCodigo;
  readonly alElegirCaja: (caja: string) => void;
  readonly alEscribirDocumento: (documento: string) => void;
}

/** La barra de caja y contribuyente (lineas 623-652). Solo se dibuja en un cobro nuevo. */
export function BarraDeCajaYContribuyente({
  codigo,
  alElegirCaja,
  alEscribirDocumento,
}: BarraDeCajaProps) {
  return (
    <div
      data-barra-de-caja="1"
      style={{
        flex: "0 0 auto",
        padding: "12px 18px",
        background: "var(--sup)",
        borderBottom: "1px solid var(--linea)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 9,
        }}
      >
        <p style={{ margin: 0, fontSize: 12.5, fontWeight: "var(--peso-fuerte)" }}>
          {CAJA_Y_CONTRIBUYENTE}
        </p>
        <p
          style={{
            margin: 0,
            flex: 1,
            minWidth: 180,
            fontSize: 12.5,
            color: "var(--tinta-3)",
            textWrap: "pretty",
          }}
        >
          {POR_QUE_HACE_FALTA}
        </p>
        <span data-estado-del-codigo={codigo.estado} style={insignia(codigo.tono)}>
          {codigo.estado}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", gap: 9, flexWrap: "wrap" }}>
        <label style={{ display: "block" }}>
          <span style={ROTULO_DE_CAMPO}>{CAJA}</span>
          {/* Las dos cerradas se ofrecen igual (comentario de las lineas 964-966): esconderlas
              haria que «cerrada» y «no existe» se vieran igual desde la ventanilla. */}
          <select
            value={codigo.caja}
            onChange={(e) => alElegirCaja(e.target.value)}
            aria-label={CAJA_EN_LA_QUE_SE_COBRA}
            style={{
              border: "1px solid var(--borde-campo)",
              borderRadius: "var(--radio-5)",
              padding: "8px 9px",
              background: "#fff",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            {CAJAS.map((caja) => (
              <option key={caja.nombre} value={caja.nombre}>
                {caja.nombre}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "block" }}>
          <span style={ROTULO_DE_CAMPO}>{CONTRIBUYENTE}</span>
          <input
            data-tramo="1"
            value={codigo.documento}
            onChange={(e) => alEscribirDocumento(soloDigitos(e.target.value))}
            placeholder={DNI_O_RUC}
            maxLength={DOCUMENTO_MAXIMO}
            aria-label={DOCUMENTO_DEL_CONTRIBUYENTE}
            style={campoDelDocumento(codigo)}
          />
        </label>

        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginLeft: 4,
            paddingBottom: 2,
          }}
        >
          <span style={{ fontSize: 12, color: "var(--tinta-3)" }}>{RECIBO_QUE_SE_EMITIRA}</span>
          <code
            data-codigo-que-se-emitira="1"
            style={{
              fontSize: 14.5,
              fontWeight: "var(--peso-fuerte)",
              letterSpacing: ".04em",
              color: "var(--ins-info-tinta)",
              background: "var(--azul-suave)",
              borderRadius: "var(--radio-5)",
              padding: "7px 11px",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {codigo.completo}
          </code>
        </span>
      </div>

      {codigo.problema && (
        <p
          data-aviso-del-codigo="1"
          style={{
            margin: "9px 0 0",
            padding: "9px 11px",
            borderLeft: `3px solid ${codigo.borde}`,
            borderRadius: "0 5px 5px 0",
            background: codigo.fondo,
            fontSize: 13,
            lineHeight: 1.5,
            color: codigo.tinta,
            textWrap: "pretty",
          }}
        >
          {codigo.aviso}
        </p>
      )}
    </div>
  );
}

/** El circulo del icono de una linea del resumen (lineas 1973-1974). */
const circuloDe = (bien: boolean): CSSProperties => ({
  display: "grid",
  placeItems: "center",
  width: 24,
  height: 24,
  borderRadius: "var(--radio-circulo)",
  flex: "0 0 auto",
  background: bien ? "var(--ins-ok-fondo)" : "var(--ins-warn-fondo)",
  color: bien ? "var(--ins-ok-tinta)" : "var(--ins-warn-tinta)",
});

export interface ResumenProps {
  readonly lineas: readonly LineaDelResumen[];
  /** Si se puede cobrar: decide el color del pie y lo que dice. */
  readonly puede: boolean;
  readonly motivo: string;
}

/** El resumen «Lo que se va a registrar» (lineas 743-763). Solo en la ultima seccion de un cobro. */
export function ResumenDelCobro({ lineas, puede, motivo }: ResumenProps) {
  return (
    <section
      data-resumen="1"
      style={{
        marginTop: 18,
        background: "#fff",
        border: "1px solid var(--linea)",
        borderRadius: "var(--radio-8)",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "13px 15px", borderBottom: "1px solid var(--linea-2)" }}>
        <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: "var(--peso-fuerte)" }}>
          {LO_QUE_SE_VA_A_REGISTRAR}
        </h3>
        <p
          style={{
            margin: "5px 0 0",
            fontSize: 13,
            lineHeight: 1.55,
            color: "var(--tinta-3)",
            maxWidth: "72ch",
            textWrap: "pretty",
          }}
        >
          {DE_QUE_VA_EL_RESUMEN}
        </p>
      </div>

      {lineas.map((linea) => (
        <div
          key={linea.titulo}
          data-linea-del-resumen={linea.titulo}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            padding: "12px 15px",
            borderBottom: "1px solid var(--linea-2)",
          }}
        >
          <span data-bien={linea.bien ? "1" : "0"} style={circuloDe(linea.bien)}>
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={linea.bien ? ICONO_BIEN : ICONO_PENDIENTE} />
            </svg>
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 13.5 }}>{linea.titulo}</span>
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
              {linea.detalle}
            </span>
          </span>
          <span
            style={{
              fontSize: 13,
              fontWeight: "var(--peso-medio)",
              color: "var(--tinta-2)",
              flex: "0 0 auto",
              whiteSpace: "nowrap",
            }}
          >
            {linea.valor}
          </span>
        </div>
      ))}

      <p
        data-pie-del-resumen="1"
        style={{
          margin: 0,
          padding: "12px 15px",
          borderLeft: `4px solid ${puede ? "var(--ins-ok-tinta)" : "#A8321E"}`,
          background: puede ? "var(--ins-ok-fondo)" : "var(--ins-bad-fondo)",
          fontSize: 13,
          lineHeight: 1.55,
          color: puede ? "var(--ins-ok-tinta)" : "var(--ins-bad-tinta)",
          textWrap: "pretty",
        }}
      >
        {puede ? TODO_LISTO : noSePuedeTodavia(motivo)}
      </p>
    </section>
  );
}
