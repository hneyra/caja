import type { Columna, Fila } from "./tabla";

/**
 * «Cajas y arqueo»: los seis nodos de la seccion y la tabla de cada uno.
 *
 * Origen: `TesoreriaV6.dc.html` — `NODOS` (lineas 1066-1072) y `DETERMINACIONES` (1074-1137). El
 * nombre `DETERMINACIONES` es de la plantilla de Rentas sobre la que se dibujo V6; lo que hay
 * dentro son arqueos, anulaciones y pendientes de conciliar.
 *
 * Los dos van juntos y **emparejados por el titulo**: el nodo que se elige a la izquierda decide
 * que tabla se dibuja a la derecha. `verificaciones/datos.test.ts` comprueba que los seis titulos
 * casan uno a uno, porque un nodo sin tabla es un panel en blanco y una tabla sin nodo es un dato
 * que nadie puede llegar a ver.
 *
 * <h2>Lo que el diseno pide y el contrato del backend no da: el fondo inicial del turno</h2>
 *
 * Las cuatro tablas de arqueo empiezan por la misma linea —«Fondo inicial del turno», `200.00`— y
 * la usan para sumar: en C-3, `200.00 + 7,238.60 − 18.19 = 7,420.41`, que es el «Debe haber en
 * caja» contra el que se cuenta el cajon. Sin esa primera linea, el arqueo no cuadra por 200 soles
 * en todos los turnos.
 *
 * `ArqueoResource` (`backend/kamayuk-caja-nucleo/.../infraestructura/web/ArqueoResource.java`)
 * **no lo modela**. Lo que publica es `turnoId`, `fecha`, `recibosEmitidos`, `recibosAnulados`,
 * `cobrado`, `anulado`, `neto`, `declarado`, `diferencia`, `cuadra` y una `LineaResource` por forma
 * de pago con esas mismas cinco cifras. No hay fondo, ni apertura, ni entrega de turno.
 *
 * Y no es que falte un campo: `diferencia` sale de `ArqueoDelTurno` como `declarado − neto`, o sea
 * que **el fondo no esta ni sumado por dentro**. Un cajero que empiece con 200,00 en el cajon y
 * cuente 7 420,41 al cerrar declarara una diferencia de +200,00 contra un backend que no sabe de
 * donde salen. De las tres discrepancias de este directorio, esta es la unica que **no se arregla
 * con un rotulo**: o el turno guarda su fondo, o la pantalla no puede dibujar esta tabla con datos
 * de verdad. Queda escrito aqui, sin corregir el diseno ni tocar el backend.
 */

/** Un nodo de la lista de la izquierda. */
export interface Nodo {
  readonly titulo: string;
  /** Lo que se lee debajo: `'52 recibos'`, `'11 operaciones'`. */
  readonly resumen: string;
}

/** Los seis nodos, en el orden del artboard. */
export const NODOS: readonly Nodo[] = [
  { titulo: "C-3 — su caja, abierta", resumen: "52 recibos" },
  { titulo: "C-4 — abierta, turno tarde", resumen: "18 recibos" },
  { titulo: "C-1 — cerrada ayer sin arquear", resumen: "84 recibos" },
  { titulo: "C-2 — cerrada ayer sin arquear", resumen: "68 recibos" },
  { titulo: "Anulaciones del día", resumen: "3 recibos" },
  { titulo: "Pendientes de conciliar", resumen: "11 operaciones" },
];

/** La tabla de un nodo: su titulo, lo que explica y sus filas. */
export interface TablaDeNodo {
  /** El mismo texto que el `titulo` del nodo: es lo que los empareja. */
  readonly titulo: string;
  readonly nota: string;
  readonly columnas: readonly Columna[];
  readonly filas: readonly Fila[];
}

/**
 * Las seis tablas, una por nodo y en su mismo orden.
 *
 * En las cuatro de arqueo, la primera columna no tiene rotulo: lleva el signo con el que la fila
 * entra en la cuenta —`+`, `−`, `=`— y va vacia en las que solo se declaran. El `—` de «Contado en
 * caja» de las cajas sin arquear **es el dato**: no es un cero, es que todavia nadie ha contado.
 */
export const DETERMINACIONES: readonly TablaDeNodo[] = [
  {
    titulo: "C-3 — su caja, abierta",
    nota: "El arqueo cuadra en vivo: lo contado contra lo registrado. La diferencia es lo único que hay que explicar al cerrar.",
    columnas: [
      { titulo: "", numerica: false },
      { titulo: "Concepto", numerica: false },
      { titulo: "Detalle", numerica: false },
      { titulo: "S/", numerica: true },
    ],
    filas: [
      ["", "Fondo inicial del turno", "Entregado a las 08:00", "200.00"],
      ["+", "Cobrado en efectivo", "38 recibos", "7,238.60"],
      ["+", "Cobrado con tarjeta", "11 recibos · no entra al arqueo", "2,180.00"],
      ["−", "Anulaciones del turno", "3 recibos · S/ 18.19 devueltos", "18.19"],
      ["=", "Debe haber en caja", "Fondo más efectivo menos anulaciones", "7,420.41"],
      ["", "Contado en caja", "Arqueo físico de las 13:00", "7,420.41"],
      ["=", "Diferencia", "Cuadra", "0.00"],
    ],
  },
  {
    titulo: "C-4 — abierta, turno tarde",
    nota: "Caja abierta de otro cajero. Se puede consultar pero no cobrar en ella: cada recibo se imputa a la caja de quien lo emite.",
    columnas: [
      { titulo: "", numerica: false },
      { titulo: "Concepto", numerica: false },
      { titulo: "Detalle", numerica: false },
      { titulo: "S/", numerica: true },
    ],
    filas: [
      ["", "Fondo inicial del turno", "Entregado a las 13:00", "200.00"],
      ["+", "Cobrado en efectivo", "14 recibos", "2,884.20"],
      ["+", "Cobrado con tarjeta", "4 recibos", "612.00"],
      ["=", "Debe haber en caja", "", "3,084.20"],
      ["", "Contado en caja", "Sin arquear todavía", "—"],
      ["=", "Diferencia", "Pendiente de arqueo", "—"],
    ],
  },
  {
    titulo: "C-1 — cerrada ayer sin arquear",
    nota: "Cerrada al final del turno y sin arqueo. Hasta que se arquee, la recaudación de ese turno no se puede depositar ni el cierre del día cuadra.",
    columnas: [
      { titulo: "", numerica: false },
      { titulo: "Concepto", numerica: false },
      { titulo: "Detalle", numerica: false },
      { titulo: "S/", numerica: true },
    ],
    filas: [
      ["", "Fondo inicial", "Turno mañana del 4 de septiembre", "200.00"],
      ["+", "Cobrado en efectivo", "61 recibos", "12,884.40"],
      ["+", "Cobrado con tarjeta", "23 recibos", "4,182.00"],
      ["=", "Debe haber", "", "13,084.40"],
      ["", "Contado en caja", "Sin arquear · 2 días", "—"],
      ["=", "Diferencia", "Sin determinar", "—"],
    ],
  },
  {
    titulo: "C-2 — cerrada ayer sin arquear",
    nota: "Igual que la C-1: cerrada y sin arqueo. Dos cajas sin arquear son dos turnos de recaudación que no se pueden depositar.",
    columnas: [
      { titulo: "", numerica: false },
      { titulo: "Concepto", numerica: false },
      { titulo: "Detalle", numerica: false },
      { titulo: "S/", numerica: true },
    ],
    filas: [
      ["", "Fondo inicial", "Turno tarde del 4 de septiembre", "200.00"],
      ["+", "Cobrado en efectivo", "48 recibos", "9,418.60"],
      ["+", "Cobrado con tarjeta", "20 recibos", "3,204.00"],
      ["=", "Debe haber", "", "9,618.60"],
      ["", "Contado en caja", "Sin arquear · 2 días", "—"],
      ["=", "Diferencia", "Sin determinar", "—"],
    ],
  },
  {
    titulo: "Anulaciones del día",
    nota: "Cada anulación devuelve la deuda a la cuenta corriente y queda en la bitácora. Es el acto que más se audita del módulo.",
    columnas: [
      { titulo: "Recibo", numerica: false },
      { titulo: "Contribuyente", numerica: false },
      { titulo: "Importe S/", numerica: true },
      { titulo: "Motivo", numerica: false },
      { titulo: "Autorizó", numerica: false },
      { titulo: "Hora", numerica: false },
    ],
    filas: [
      [
        "0003-0041180",
        "Zapata Rivas, Óscar",
        "18.19",
        "Error en la cuota imputada",
        "Jefe de Tesorería",
        "08:32",
      ],
      [
        "0003-0041174",
        "Ruiz Inga, Fernando",
        "412.00",
        "Error en el importe",
        "Jefe de Tesorería",
        "08:18",
      ],
      [
        "0003-0041168",
        "Noblecilla Arismendiz S.A.C.",
        "1,284.00",
        "Pago no efectivizado",
        "Gerente de Adm. Tributaria",
        "08:04",
      ],
    ],
  },
  {
    titulo: "Pendientes de conciliar",
    nota: "Cobros con tarjeta o depósito que no aparecen todavía en el extracto del banco. Hasta conciliarlos, el recibo está emitido y el dinero no está confirmado.",
    columnas: [
      { titulo: "Recibo", numerica: false },
      { titulo: "Medio", numerica: false },
      { titulo: "Banco", numerica: false },
      { titulo: "Nº operación", numerica: false },
      { titulo: "Importe S/", numerica: true },
      { titulo: "Antigüedad", numerica: false },
    ],
    filas: [
      ["0003-0041183", "Tarjeta de débito", "BCP", "884120", "301.80", "hoy"],
      ["0003-0041176", "Tarjeta de crédito", "Interbank", "412884", "1,128.00", "hoy"],
      [
        "0003-0041142",
        "Depósito en cuenta",
        "Banco de la Nación",
        "2026-88412",
        "6,365.63",
        "2 días",
      ],
      ["0003-0041118", "Tarjeta de débito", "BBVA", "204118", "591.94", "3 días"],
    ],
  },
];
