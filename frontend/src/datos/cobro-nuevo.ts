import { CAJAS } from "./cajas";

/**
 * Lo que la ficha de un **cobro nuevo** trae escrito en sus campos.
 *
 * Origen: `TesoreriaV6.dc.html`, la rama `if (this.esNuevo())` de `datos()`, lineas 1368-1378. La
 * otra rama —la del recibo existente— vive en `valores-del-recibo.ts` desde #12.
 *
 * <h2>No es una constante: depende de la caja y del documento</h2>
 *
 * Es la diferencia con {@link import("./valores-del-recibo").VALORES_DEL_RECIBO}, que si es un
 * objeto fijo. Aqui tres de los catorce valores salen de lo que el cajero acaba de elegir en la
 * barra de arriba —la caja en corto, el turno que esa caja implica y el documento— y por eso esto
 * es una funcion. El artboard hace exactamente lo mismo: su `datos()` lee `this.val('caja', …)`
 * antes de componer el objeto.
 *
 * <h2>Los once que no dependen de nada, y por que son un guion y no un vacio</h2>
 *
 * `deudaTotal`, `seleccionado`, `montoDesc`, `aCobrar`, `vuelto` e `importe` valen {@link SIN_DATO}
 * —un guion largo— y **no** la cadena vacia. La diferencia importa: son campos de solo lectura, de
 * modo que ninguno cuenta en los pendientes que bloquean la emision, y lo que el cajero tiene que
 * leer ahi es «todavia no hay cifra», no una casilla en blanco que se confunda con un cero. La
 * cifra la pondra el backend cuando el documento resuelva contra el padron.
 *
 * `numRecibo` dice «Se asigna al emitir» por lo mismo, y es literal del artboard: el correlativo
 * no existe hasta que el recibo se emite, y ensenar uno antes seria prometer un numero que otra
 * ventanilla puede llevarse.
 *
 * <h2>Los importes son texto, tambien aqui</h2>
 *
 * Regla 1 de CLAUDE.md (RNF-055): ninguno pasa por `number`. Aqui es ademas trivial, porque
 * ninguno trae una cantidad.
 */

/** El cajero que atiende la ventanilla (artboard, linea 1371). */
export const CAJERO = "Cárdenas Vega, José";

/** Lo que se lee donde todavia no hay cifra ni dato: el guion largo del artboard. */
export const SIN_DATO = "—";

/** Los dos turnos que una caja puede tener (linea 1372). */
export const TURNO_DE_TARDE = "Tarde";
export const TURNO_DE_MANANA = "Mañana";

/** La palabra que en el nombre de la caja delata el turno de tarde (linea 1372). */
const DICE_TARDE = "tarde";

/** El separador entre el codigo de la caja y su descripcion: `'C-3 — abierta · turno mañana'`. */
const SEPARADOR = " — ";

/**
 * La caja con la que arranca un cobro: **la primera de la lista**.
 *
 * Es el `Object.keys(PROGRAMAS)[0]` de la linea 1431, y por eso el orden de {@link CAJAS} no es
 * decorativo: la primera es la caja del cajero que esta atendiendo.
 */
export const CAJA_POR_OMISION = CAJAS[0]?.nombre ?? "";

/** El codigo de una caja, sin su descripcion: `'C-3 — abierta · turno mañana'` → `'C-3'`. */
export const nombreCortoDe = (caja: string) => caja.split(SEPARADOR)[0] ?? caja;

/**
 * El turno que implica una caja, leido de su propio nombre (linea 1372).
 *
 * El artboard no guarda el turno en ninguna parte: lo deduce buscando la palabra «tarde» dentro
 * del rotulo. Se porta asi —y no anadiendo un campo `turno` a {@link CAJAS}— porque inventarle un
 * campo al dato seria decidir por el diseno; queda dicho aqui para que se vea que es una lectura
 * de texto y no un dato.
 */
export const turnoDe = (caja: string) =>
  caja.includes(DICE_TARDE) ? TURNO_DE_TARDE : TURNO_DE_MANANA;

/**
 * Los catorce valores con los que un cobro nuevo empieza, para la caja y el documento elegidos.
 *
 * Las claves son las de {@link import("./recibo").PASOS}. Las que **no** estan aqui —`fechaOp`,
 * `horaOp`, `quienPaga`, `descuento`, `medio`, `recibido`, `copias`, `motivoAnul` y `autoriza`—
 * faltan a proposito: son los nueve obligatorios que el cajero tiene que llenar, y son justo los
 * que el contador de pendientes cuenta.
 */
export const valoresDelCobroNuevo = (
  caja: string,
  documento: string,
): Readonly<Record<string, string>> => ({
  // —— Operación ——
  caja: nombreCortoDe(caja),
  cajero: CAJERO,
  turno: turnoDe(caja),
  contrib: "Se resuelve con el documento",
  docContrib: documento === "" ? SIN_DATO : documento,

  // —— Deuda a cobrar ——
  deudaTotal: SIN_DATO,
  seleccionado: SIN_DATO,
  montoDesc: SIN_DATO,
  aCobrar: SIN_DATO,

  // —— Medio de pago ——
  vuelto: SIN_DATO,

  // —— Recibo ——
  serie: "0003",
  numRecibo: "Se asigna al emitir",
  importe: SIN_DATO,

  // —— Anulación ——
  devuelveDeuda: "Sí, con el interés recalculado a la fecha",
});
