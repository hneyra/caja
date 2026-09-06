import type { Columna, Fila } from "./tabla";

/**
 * Las cinco secciones del recibo y todos sus campos.
 *
 * Origen: `TesoreriaV6.dc.html`, `PASOS`, lineas 978-1043.
 *
 * <h2>Lo que el diseno pide y el contrato del backend no da: los medios de pago</h2>
 *
 * El campo `medio` del paso «Medio de pago» ofrece **cinco opciones**: «Efectivo», «Tarjeta de
 * débito», «Tarjeta de crédito», «Depósito en cuenta» y «Cheque de gerencia». El enumerado
 * `FormaDePago` de este mismo repositorio
 * (`backend/kamayuk-caja-nucleo/.../dominio/FormaDePago.java`) declara otras cinco, y **no son las
 * mismas**: `EFECTIVO`, `CHEQUE`, `DEPOSITO`, `TARJETA` y `TRANSFERENCIA`. Hay **una sola tarjeta**,
 * el cheque no distingue el de gerencia de ningun otro, y `TRANSFERENCIA` no tiene rotulo en la
 * pantalla.
 *
 * No se corrige aqui ninguna de las dos partes, y el motivo es que la eleccion tiene consecuencias
 * medibles en el arqueo: la tercera tabla de `TARIFARIO` da a debito y credito **plazos de abono y
 * comisiones distintos** (1 dia y 1,80 % contra 2 dias y 3,20 %), de modo que fundirlas en `TARJETA`
 * al mandarlas pierde justo el dato con el que Tesoreria concilia. Y traducir por parecido es peor:
 * el cheque de gerencia mandado como `CHEQUE` se canjea, mientras que mandado como `DEPOSITO`
 * cuadraria el turno en el acto. **Lo decide D-20 y ADR-0026 §4, no esta pantalla.** Es lo mismo que
 * `sgtm/frontend/src/datos/tesoreria.ts` dejo escrito de «pago en línea».
 *
 * <h2>Los importes de este archivo son rotulos, no cifras</h2>
 *
 * `deudaTotal`, `montoDesc`, `aCobrar` y `recibido` son **claves de campo**: texto que nombra una
 * casilla. Ninguna trae una cantidad. La cifra la pondra el backend, ya compuesta y con su fecha
 * (`ImporteActualizado`, regla 9 de CLAUDE.md).
 */

/** Las seis clases de campo que el artboard dibuja. Sin `t`, un campo es `'text'`. */
export type TipoDeCampo = "text" | "date" | "sel" | "area" | "chk" | "ro";

/** Un campo del formulario del recibo. */
export interface Campo {
  /** La clave con la que el campo guarda su valor. El artboard la llama `k`. */
  readonly clave: string;
  /** El rotulo, con sus tildes y su unidad: `'Deuda total a hoy (S/)'`. El artboard lo llama `l`. */
  readonly label: string;
  /** Sin `t` es `'text'`, tal como lo resuelve el artboard. */
  readonly t?: TipoDeCampo;
  /** Las opciones de un `'sel'`. La primera es `''`: «sin elegir» es un valor y se ve. */
  readonly o?: readonly string[];
  /** El texto de ayuda dentro del campo, o la aclaracion de una casilla. */
  readonly ph?: string;
  /** La ayuda que va debajo del campo. */
  readonly ayuda?: string;
  /** Ocupa la fila entera. El artboard lo escribe como `ancho: 1`. */
  readonly ancho?: boolean;
  /** El campo se puede dejar vacio: no cuenta en los pendientes que bloquean la emision. */
  readonly opcional?: boolean;
}

/** La tabla de cuotas que cuelga del paso «Deuda a cobrar». Es la unica tabla dentro de un paso. */
export interface TablaDeCuotas {
  readonly titulo: string;
  /** El ancho minimo antes de que la tabla desplace en horizontal. El artboard lo llama `min`. */
  readonly anchoMinimo: string;
  /** El rotulo del boton de la cabecera. */
  readonly accion: string;
  /** Lo que se lee cuando no hay ninguna cuota elegida. */
  readonly vacioTexto: string;
  readonly columnas: readonly Columna[];
  readonly filas: readonly Fila[];
  /** El pie de la tabla: por que la imputacion no es opcional. */
  readonly nota: string;
}

/** Una de las cinco secciones del recibo. */
export interface Paso {
  readonly id: string;
  readonly label: string;
  /** Lo que la seccion explica antes de pedir nada. */
  readonly nota: string;
  readonly campos: readonly Campo[];
  readonly tabla?: TablaDeCuotas;
}

/** Las cinco secciones del recibo, en el orden en que se recorren. */
export const PASOS: readonly Paso[] = [
  {
    id: "operacion",
    label: "Operación",
    nota: "Quién paga, en qué caja y en qué turno. El recibo se imputa a la caja del cajero que lo emite: no se puede cobrar en una caja ajena.",
    campos: [
      { clave: "caja", label: "Caja", t: "ro" },
      { clave: "cajero", label: "Cajero", t: "ro" },
      { clave: "turno", label: "Turno", t: "ro" },
      { clave: "fechaOp", label: "Fecha", t: "date" },
      { clave: "horaOp", label: "Hora" },
      { clave: "contrib", label: "Contribuyente", t: "ro", ancho: true },
      { clave: "docContrib", label: "Documento", t: "ro" },
      {
        clave: "quienPaga",
        label: "Quién paga",
        t: "sel",
        o: [
          "",
          "El propio contribuyente",
          "Un tercero autorizado",
          "Un tercero sin autorización",
        ],
      },
      {
        clave: "obsOp",
        label: "Observaciones",
        t: "area",
        ancho: true,
        opcional: true,
        ph: "Lo que haya que anotar de la atención",
      },
    ],
  },
  {
    id: "deuda",
    label: "Deuda a cobrar",
    nota: "Lo que el contribuyente debe hoy, con el interés al día. Se cobra por cuotas completas: no se admiten pagos parciales de una cuota, salvo fraccionamiento.",
    campos: [
      { clave: "deudaTotal", label: "Deuda total a hoy (S/)", t: "ro" },
      { clave: "seleccionado", label: "Seleccionado para cobrar (S/)", t: "ro" },
      {
        clave: "descuento",
        label: "Descuento aplicable",
        t: "sel",
        o: [
          "",
          "No aplica",
          "Amnistía — 100 % del interés",
          "Pronto pago — 15 % del insoluto",
        ],
      },
      { clave: "montoDesc", label: "Descuento (S/)", t: "ro" },
      { clave: "aCobrar", label: "Importe a cobrar (S/)", t: "ro" },
    ],
    tabla: {
      titulo: "Cuotas seleccionadas",
      anchoMinimo: "780px",
      accion: "Cambiar selección",
      vacioTexto:
        "Sin cuotas seleccionadas. Elija qué se cobra: el sistema imputa siempre de lo más antiguo a lo más nuevo.",
      columnas: [
        { titulo: "Año", numerica: false },
        { titulo: "Concepto", numerica: false },
        { titulo: "Cuota", numerica: false },
        { titulo: "Insoluto S/", numerica: true },
        { titulo: "Interés S/", numerica: true },
        { titulo: "Total S/", numerica: true },
      ],
      filas: [
        ["2024", "Impuesto predial", "1 a 4", "1,842.60", "212.44", "2,055.04"],
        ["2026", "Arbitrios municipales", "1 a 8", "291.60", "18.44", "310.04"],
        ["2026", "Impuesto predial", "3", "146.86", "0.00", "146.86"],
      ],
      nota: "La imputación es de lo más antiguo a lo más nuevo, y dentro del año primero el interés y luego el insoluto. No es opcional: lo manda el Código Tributario.",
    },
  },
  {
    id: "pago",
    label: "Medio de pago",
    nota: "Efectivo, tarjeta o depósito. El efectivo entra al arqueo de la caja; la tarjeta y el depósito se conciliaban contra el extracto del banco.",
    campos: [
      // Las cinco opciones que `FormaDePago` no sabe recibir. Ver la cabecera del archivo:
      // dos tarjetas contra una, y un cheque de gerencia que el enumerado no distingue.
      {
        clave: "medio",
        label: "Medio de pago",
        t: "sel",
        ancho: true,
        o: [
          "",
          "Efectivo",
          "Tarjeta de débito",
          "Tarjeta de crédito",
          "Depósito en cuenta",
          "Cheque de gerencia",
        ],
      },
      { clave: "recibido", label: "Importe recibido (S/)" },
      { clave: "vuelto", label: "Vuelto (S/)", t: "ro", ayuda: "Solo en efectivo" },
      {
        clave: "operacionBanco",
        label: "Nº de operación",
        opcional: true,
        ph: "Del voucher o del depósito",
      },
      {
        clave: "banco",
        label: "Banco",
        t: "sel",
        opcional: true,
        o: ["", "Banco de la Nación", "BCP", "Interbank", "BBVA", "Scotiabank"],
      },
      { clave: "ultimos4", label: "Últimos 4 dígitos", opcional: true },
      {
        clave: "conciliado",
        label: "Conciliado con el banco",
        t: "chk",
        ph: "Aparece en el extracto del día",
      },
    ],
  },
  {
    id: "recibo",
    label: "Recibo",
    nota: "El recibo es el documento que acredita el pago y descuenta la cuota. Se imprime en el acto: sin él el contribuyente no puede probar que pagó.",
    campos: [
      { clave: "serie", label: "Serie", t: "ro" },
      { clave: "numRecibo", label: "Número", t: "ro" },
      { clave: "importe", label: "Importe (S/)", t: "ro" },
      {
        clave: "aplicado",
        label: "Aplicado a la cuenta corriente",
        t: "chk",
        ph: "La cuota queda descontada al instante",
      },
      {
        clave: "impreso",
        label: "Impreso",
        t: "chk",
        ph: "Se entregó el recibo al contribuyente",
      },
      { clave: "copias", label: "Copias impresas", t: "sel", o: ["1", "2", "3"] },
      { clave: "obsRecibo", label: "Glosa del recibo", t: "area", ancho: true, opcional: true },
    ],
  },
  {
    id: "anulacion",
    label: "Anulación",
    nota: "Anular un recibo devuelve la deuda a la cuenta corriente. Es el acto más sensible del módulo: queda en la bitácora con el usuario, la hora y el motivo.",
    campos: [
      { clave: "anulado", label: "Recibo anulado", t: "chk", ph: "El recibo quedó sin efecto" },
      { clave: "fechaAnul", label: "Fecha de la anulación", t: "date", opcional: true },
      {
        clave: "motivoAnul",
        label: "Motivo",
        t: "sel",
        ancho: true,
        o: [
          "",
          "Error en el importe",
          "Error en el contribuyente",
          "Error en la cuota imputada",
          "Pago no efectivizado",
          "Devolución al contribuyente",
        ],
      },
      {
        clave: "autoriza",
        label: "Autorizado por",
        t: "sel",
        o: ["", "Jefe de Tesorería", "Gerente de Administración Tributaria"],
      },
      { clave: "resAnul", label: "Nº de autorización", opcional: true },
      {
        clave: "devuelveDeuda",
        label: "Devuelve la deuda",
        t: "ro",
        ayuda: "La cuota vuelve a estar pendiente y el interés se recalcula",
      },
      { clave: "fundamentoAnul", label: "Fundamento", t: "area", ancho: true, opcional: true },
    ],
  },
];
