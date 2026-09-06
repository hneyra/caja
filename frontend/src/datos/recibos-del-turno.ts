import type { TonoDeInsignia } from "@/ds/tokens";

/**
 * Los cinco recibos del turno que la lista ensena.
 *
 * Origen: `TesoreriaV6.dc.html`, `PREDIOS`, lineas 1047-1063. El nombre `PREDIOS` es de la
 * plantilla de Catastro sobre la que se dibujo V6 —igual que `autovaluo` y que la clave de seccion
 * `predios`—; lo que hay dentro son recibos.
 *
 * Los cinco no son cinco cualesquiera, y el artboard lo dice en su comentario de la linea 1045: uno
 * esta **anulado**, que es el acto mas sensible del modulo, y otro esta **sin conciliar**, que es el
 * que hay que resolver antes del cierre. Los tres tonos de insignia de la lista salen de ahi.
 *
 * <h2>Lo que el diseno pide y el contrato del backend no da: el numero del recibo</h2>
 *
 * Los cinco codigos son de la forma `0003-0041184`: **serie de cuatro caracteres** y correlativo de
 * siete. `ReciboResource.numero`
 * (`backend/kamayuk-caja-nucleo/.../infraestructura/web/ReciboResource.java`) documenta el suyo como
 * `001-0000123`: **serie de tres**.
 *
 * Medido en `NumeroDeRecibo`, que es quien lo compone y el unico sitio donde se compone: el formato
 * es `"%s-%07d"` y la serie se valida contra `serie varchar(5)` (V3, V29), o sea de 1 a 5
 * caracteres. De ahi salen dos hechos distintos que conviene no confundir:
 *
 * <ul>
 *   <li>El correlativo **si** coincide: siete digitos con ceros a la izquierda a los dos lados.</li>
 *   <li>El ancho de la serie **no lo fija nadie**. `0003` cabe, y `1` tambien: un recibo real puede
 *       imprimirse `1-0041184`. De modo que una pantalla que reserve sitio para cuatro digitos, que
 *       parta el codigo por la posicion del guion o que ordene los recibos por su texto se rompe con
 *       la primera caja cuya serie no mida cuatro.</li>
 * </ul>
 *
 * No se corrige el diseno: los codigos se copian como estan. Queda escrito para que el dia de
 * conectar la serie se lea de `ReciboResource.serie`, que viaja aparte justo para esto.
 */

/** Un recibo del turno, tal como lo dibuja la lista. */
export interface Recibo {
  /** El numero impreso: `'0003-0041184'`. El artboard lo llama `cod`. */
  readonly cod: string;
  /** Quien pago. */
  readonly titulo: string;
  /** Que se cobro y con que medio, en una linea. */
  readonly titular: string;
  /**
   * El estado, como se lee sobre la tarjeta.
   *
   * El artboard trae `uso` y `estado` con **el mismo texto en los cinco**: son dos huecos de la
   * plantilla de Catastro que V6 rellena igual. Se conservan los dos porque asi estan, y porque
   * fundirlos seria decidir por la pantalla cual de los dos sitios deja de existir.
   */
  readonly uso: string;
  /**
   * El importe del recibo, ya compuesto: `'S/ 2,511.94'`.
   *
   * Se llama `autovaluo` en el artboard —el hueco de la plantilla de Catastro— y **es texto**, con
   * su simbolo y su separador de millares, tal como se copio. No se convierte ni se recompone:
   * regla 1 de CLAUDE.md (RNF-055), y el backend lo emite igual (`ImporteActualizado`).
   */
  readonly autovaluo: string;
  /** El rotulo de la insignia. */
  readonly estado: string;
  /** El tono de la insignia, de los cuatro que declara `ds/tokens.ts` (#4). */
  readonly tono: TonoDeInsignia;
  /**
   * La clave con la que la lista se ordena. **No es un importe que se muestre.**
   *
   * Es la unica excepcion de este directorio a «los importes son texto», y esta declarada como tal
   * en `verificaciones/importes-de-datos.test.ts`, con su motivo, para que se vea y no se extienda
   * sola. Existe porque ordenar `'S/ 2,511.94'` como texto pone `'S/ 18.19'` por debajo de
   * `'S/ 2,006.25'` —compara `1` contra `2` en la segunda posicion— y la lista saldria en un orden
   * que no es ninguno.
   *
   * Lo que la hace segura es que **no se ensena, no se suma y no viaja**: lo que se pinta es
   * `autovaluo`. El dia que haya backend, el orden lo dara el `ORDER BY` de la consulta y este
   * campo desaparece; mientras tanto, un `number` que solo compara no puede perder un centimo
   * porque su valor nunca llega a los ojos de nadie.
   */
  // eslint-disable-next-line no-restricted-syntax -- Ordena la lista y nada mas: no se muestra, no se suma y no viaja. Lo que se pinta es `autovaluo`, que es texto.
  readonly valor: number;
  /** La linea de contexto: donde, a que hora y con que particularidad se cobro. */
  readonly contexto: string;
}

/** Los cinco recibos del turno, del mas reciente al mas antiguo, como en el artboard. */
export const RECIBOS: readonly Recibo[] = [
  {
    cod: "0003-0041184",
    titulo: "Suc. Rufina Medina Medina",
    titular: "Predial 2024 y arbitrios 2026 · efectivo",
    uso: "Aplicado",
    autovaluo: "S/ 2,511.94",
    estado: "Aplicado",
    tono: "ok",
    valor: 2511.94,
    contexto:
      "Cobrado en C-3 a las 09:41 · tres cuotas imputadas de lo más antiguo a lo más nuevo · recibo impreso y entregado",
  },
  {
    cod: "0003-0041183",
    titulo: "Castillo Pascuala, María Elena",
    titular: "Predial 2026 cuotas 1 y 2 · tarjeta de débito",
    uso: "Sin conciliar",
    autovaluo: "S/ 301.80",
    estado: "Sin conciliar",
    tono: "warn",
    valor: 301.80,
    contexto:
      "Cobrado en C-3 a las 09:12 · voucher 884120 del BCP · no aparece todavía en el extracto del día",
  },
  {
    cod: "0003-0041182",
    titulo: "Díaz Madrid, Julio César",
    titular: "Multa administrativa RSA-2026-000884 · efectivo",
    uso: "Aplicado",
    autovaluo: "S/ 2,006.25",
    estado: "Aplicado",
    tono: "ok",
    valor: 2006.25,
    contexto:
      "Cobrado en C-3 a las 08:54 · con el descuento del 50 % por pronto pago · el administrado renunció a apelar",
  },
  {
    cod: "0003-0041181",
    titulo: "Inversiones del Norte S.A.C.",
    titular: "Derecho de licencia de edificación · depósito",
    uso: "Aplicado",
    autovaluo: "S/ 6,365.63",
    estado: "Aplicado",
    tono: "ok",
    valor: 6365.63,
    contexto:
      "Depósito en el Banco de la Nación del 4 de septiembre · conciliado contra el extracto · recibo emitido en C-3",
  },
  {
    cod: "0003-0041180",
    titulo: "Zapata Rivas, Óscar",
    titular: "Papeleta P-2026-081882 · efectivo",
    uso: "Anulado",
    autovaluo: "S/ 18.19",
    estado: "Anulado",
    tono: "bad",
    valor: 18.19,
    contexto:
      "Anulado a las 08:32 por error en la cuota imputada · autorizado por el Jefe de Tesorería · la deuda volvió a la cuenta corriente",
  },
];
