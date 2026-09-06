import type { TonoDeInsignia } from "@/ds/tokens";

/**
 * Lo que el Panel de Tesoreria ensena: las cuatro cifras, la bandeja, el arqueo en vivo y la
 * actividad reciente.
 *
 * Origen: `TesoreriaV6.dc.html` — `cifras` (lineas 1813-1821), `colaTotal` (1822), `bandeja`
 * (1831-1838), `cobertura` (1841-1851) y `actividad` (1852-1860).
 *
 * <h2>Ninguna de estas cifras se deriva</h2>
 *
 * El artboard las escribe una a una y el port hace lo mismo: `S/ 27,693` no es la suma de nada
 * que esta interfaz tenga, y `2,7 %` no sale de dividir `200.00` entre `7,420.41` —que daria
 * 2,695…—. Lo unico que el artboard calcula sobre ellas es **como se escriben**, y eso si se
 * porta: ver {@link LineaDeArqueo.porcentaje}.
 *
 * <h2>Tres cosas que este panel repite de otros datos, y por que se copian igual</h2>
 *
 * Las tres cifras de {@link BANDEJA} son las de `COLA`, y las de {@link COBERTURA} son las de
 * la tabla de C-3 en `DETERMINACIONES[0]`. El artboard las escribe por separado y aqui se
 * copian por separado: derivarlas seria inventar un vinculo que el diseno no declara, y ademas
 * no se puede —la bandeja tiene rotulos y detalles propios—. Lo que si se hace es **comprobar
 * que siguen coincidiendo**, en `verificaciones/panel.test.tsx`: una cifra que baila entre dos
 * pantallas del mismo modulo no rompe nada, solo miente.
 *
 * <h2>Una discrepancia del artboard que NO se corrige</h2>
 *
 * La primera fila de {@link ACTIVIDAD} dice `S/ 2,281.06` del recibo `0003-0041184`, y ese
 * mismo recibo vale `S/ 2,511.94` en `RECIBOS` (linea 1049 del artboard). Son dos cifras
 * distintas para el mismo numero de recibo. Se copian las dos como estan —`PORTAR.md` regla
 * 2— y queda escrito aqui: elegir una seria decidir por el diseno cual de las dos pantallas
 * miente.
 */

/** Una de las cuatro tarjetas de la cabecera (lineas 1814-1817). */
export interface CifraDelPanel {
  readonly etiqueta: string;
  /** Ya compuesto, con su simbolo: `'S/ 27,693'`. Es texto (regla 1 de CLAUDE.md). */
  readonly valor: string;
  /**
   * La pastilla verde de la derecha, o `''` cuando la tarjeta no lleva ninguna.
   *
   * La cadena vacia **es el dato**: el artboard dibuja la pastilla con un `sc-if` sobre este
   * mismo campo (linea 474), asi que dos de las cuatro tarjetas no la llevan.
   */
  readonly delta: string;
  readonly nota: string;
}

/** Las cuatro cifras, en el orden del artboard. */
export const CIFRAS: readonly CifraDelPanel[] = [
  {
    etiqueta: "Recaudado hoy",
    valor: "S/ 27,693",
    delta: "",
    nota: "148 recibos entre las cuatro cajas del día.",
  },
  {
    etiqueta: "Su caja — C-3",
    valor: "S/ 9,419",
    delta: "52 recibos",
    nota: "Desde las 08:00. Turno mañana, sin cerrar.",
  },
  {
    etiqueta: "Diferencia de arqueo",
    valor: "S/ 0.00",
    delta: "cuadra",
    nota: "Lo contado coincide con lo registrado.",
  },
  {
    etiqueta: "Cajas sin arquear",
    valor: "2",
    delta: "",
    nota: "C-1 y C-2, de ayer. El cierre del día espera por ellas.",
  },
];

/** Una fila de «Lo que espera» (lineas 1832-1834). */
export interface EsperaDelPanel {
  /** El rotulo de la insignia de la izquierda. */
  readonly etiqueta: string;
  readonly tono: TonoDeInsignia;
  readonly titulo: string;
  readonly detalle: string;
  /** La cifra de la derecha. Texto, como en el artboard (`String(b[4])`). */
  readonly cuantos: string;
  /**
   * El nodo de «Cajas y arqueo» que abre. **Es una posicion en `NODOS`, no una cantidad.**
   *
   * Los tres indices son los del artboard (linea 1837) y no una eleccion de este port. Un
   * indice que baila no rompe nada visible: abre otro panel, que es por lo que la prueba
   * comprueba uno a uno que cada uno caiga en el nodo que su fila promete.
   */
  readonly nodo: number;
}

/** Las tres filas de la bandeja, en el orden del artboard. */
export const BANDEJA: readonly EsperaDelPanel[] = [
  {
    etiqueta: "Sin arquear",
    tono: "bad",
    titulo: "Cajas cerradas sin arqueo",
    detalle:
      "C-1 y C-2 de ayer. Hasta arquearlas, la recaudación de esos turnos no se puede depositar y el cierre del día no cuadra.",
    cuantos: "2",
    nodo: 2,
  },
  {
    etiqueta: "Sin conciliar",
    tono: "warn",
    titulo: "Cobros con tarjeta o depósito sin confirmar",
    detalle:
      "El recibo está emitido y el dinero no está confirmado. Hasta conciliar contra el extracto, el ingreso es provisional.",
    cuantos: "11",
    nodo: 5,
  },
  {
    etiqueta: "Anulados",
    tono: "warn",
    titulo: "Anulaciones del día",
    detalle:
      "Cada una devolvió la deuda a la cuenta corriente. Quedan en la bitácora con el usuario, la hora y el motivo.",
    cuantos: "3",
    nodo: 4,
  },
];

/** Una linea del arqueo en vivo (lineas 1842-1845). */
export interface LineaDeArqueo {
  readonly label: string;
  /**
   * El porcentaje de la barra. **No es un importe y no se opera**: se escribe de dos formas.
   *
   * Es lo unico numerico de este archivo, y esta aqui porque el artboard lo escribe asi y
   * porque las dos formas salen del **mismo** numero: el rotulo con `toFixed(0)` —`2,7` se lee
   * `3 %`— y el ancho de la barra con `toFixed(1)` —`2.7%`—. Guardarlas como dos cadenas
   * sueltas dejaria que una cambiara sin la otra, que es exactamente lo que no puede pasar.
   */
  readonly porcentaje: number;
  /** El importe de la derecha, ya compuesto. Texto. */
  readonly detalle: string;
}

/** Las cinco lineas, en el orden del artboard: es una cuenta y se lee de arriba abajo. */
export const COBERTURA: readonly LineaDeArqueo[] = [
  { label: "Fondo inicial", porcentaje: 2.7, detalle: "S/ 200.00" },
  { label: "Cobrado en efectivo", porcentaje: 97.6, detalle: "S/ 7,238.60" },
  { label: "Anulaciones", porcentaje: 0.2, detalle: "− S/ 18.19" },
  { label: "Debe haber en caja", porcentaje: 100, detalle: "S/ 7,420.41" },
  { label: "Contado en el arqueo", porcentaje: 100, detalle: "S/ 7,420.41" },
];

/**
 * Desde que fila el arqueo deja de ensenar un porcentaje y ensena la palabra «cuadra».
 *
 * Es el `i >= 3` del artboard (lineas 1847 y 1850), y esta aqui como una constante y no
 * escrito dos veces en la pantalla: el rotulo, su color y el color de la barra dependen los
 * tres del mismo corte.
 */
export const DESDE_DONDE_CUADRA = 3;

/**
 * Las dos ultimas lineas no dicen un porcentaje: dicen que cuadra.
 *
 * `100 %` y `100 %` seguidos no informan de nada —los dos son el total—; lo que el cajero
 * necesita leer es que lo contado coincide con lo que debe haber.
 */
export const CUADRA = "cuadra";

/** El nodo de «Cajas y arqueo» al que lleva cualquier linea del arqueo: la caja propia. */
export const NODO_DE_MI_CAJA = 0;

/** Una fila de «Actividad reciente» (lineas 1853-1856). */
export interface ActividadDelPanel {
  /** El rotulo de la insignia: `'Aplicado'`, `'Sin conciliar'`, `'Anulado'`. */
  readonly tipo: string;
  readonly tono: TonoDeInsignia;
  /** El numero del recibo que la fila abre. Es la clave contra `RECIBOS`. */
  readonly codigo: string;
  readonly detalle: string;
  readonly cuando: string;
}

/** Las cuatro filas, de la mas reciente a la mas antigua. */
export const ACTIVIDAD: readonly ActividadDelPanel[] = [
  {
    tipo: "Aplicado",
    tono: "ok",
    codigo: "0003-0041184",
    detalle: "Suc. Rufina Medina · S/ 2,281.06 en efectivo · 3 cuotas",
    cuando: "hace 12 min",
  },
  {
    tipo: "Sin conciliar",
    tono: "warn",
    codigo: "0003-0041183",
    detalle: "M. Castillo · S/ 301.80 con tarjeta BCP · voucher 884120",
    cuando: "hace 41 min",
  },
  {
    tipo: "Aplicado",
    tono: "ok",
    codigo: "0003-0041182",
    detalle: "J. Díaz · multa RSA-2026-000884 con 50 % de descuento",
    cuando: "hace 59 min",
  },
  {
    tipo: "Anulado",
    tono: "bad",
    codigo: "0003-0041180",
    detalle: "Ó. Zapata · error en la cuota imputada · autorizado",
    cuando: "hace 1 h",
  },
];
