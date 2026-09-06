import type { Columna, Fila } from "./tabla";

/**
 * Las tres pestanas de «Tarifario y cierre».
 *
 * Origen: `TesoreriaV6.dc.html`, `VAL`, lineas 1139-1168. El nombre `VAL` es el hueco de «Valores»
 * de la plantilla; aqui dentro hay el tarifario del TUPA, la tabla de medios de pago y el orden del
 * cierre.
 *
 * Las tres son **de consulta**: nada de lo que hay aqui se rellena ni se manda. Es lo que el cajero
 * mira cuando le preguntan cuanto cuesta una constancia o por que un turno sin arquear para el
 * deposito.
 *
 * <h2>La segunda tabla es la que mide el desajuste de los medios de pago</h2>
 *
 * «Tarjeta de débito» y «Tarjeta de crédito» tienen aqui **plazo de abono y comision distintos**
 * —1 dia habil y 1,80 % contra 2 dias habiles y 3,20 %—, y el «Cheque de gerencia» se conciliaba
 * «al canje» y no contra el extracto. `FormaDePago` los funde en `TARJETA` y `CHEQUE`. El detalle
 * esta en la cabecera de `recibo.ts`, que es donde estan las opciones que el cajero elige.
 */

/** Una pestana del tarifario: su rotulo, lo que explica, su tabla y su pie. */
export interface PestanaDeTarifario {
  /** El rotulo de la pestana. El artboard lo llama `label`. */
  readonly label: string;
  readonly nota: string;
  readonly columnas: readonly Columna[];
  readonly filas: readonly Fila[];
  /** La linea de debajo de la tabla: lo que no se puede leer de las filas. */
  readonly pie: string;
}

/** Las tres pestanas, en el orden del artboard. */
export const TARIFARIO: readonly PestanaDeTarifario[] = [
  {
    label: "Tarifario del TUPA",
    nota: "Las tasas que se cobran en ventanilla, aparte de los tributos. Cada una tiene su código presupuestal: no se cobran contra la cuenta corriente.",
    columnas: [
      { titulo: "Código", numerica: false },
      { titulo: "Concepto", numerica: false },
      { titulo: "Unidad", numerica: false },
      { titulo: "Tasa S/", numerica: true },
      { titulo: "Clasificador", numerica: false },
    ],
    filas: [
      ["T-001", "Constancia de no adeudo", "Por documento", "12.00", "1.3.1.1.1.1"],
      ["T-014", "Copia de ficha catastral", "Por hoja", "4.50", "1.3.1.1.1.2"],
      ["T-028", "Certificado de numeración", "Por predio", "38.00", "1.3.1.1.1.3"],
      ["T-041", "Certificado de parámetros", "Por predio", "84.00", "1.3.1.1.1.3"],
      ["T-055", "Licencia de funcionamiento", "Por trámite", "184.00", "1.3.1.2.1.1"],
      ["T-072", "Derecho de emisión de cuponera", "Por ejercicio", "4.50", "1.3.1.1.1.1"],
    ],
    pie: "El derecho de emisión es la única tasa que se cobra junto al tributo, en la misma cuponera.",
  },
  {
    label: "Medios de pago y conciliación",
    nota: "Qué entra al arqueo de la caja y qué se conciliaba contra el banco. El efectivo es lo único que se cuenta al cerrar.",
    columnas: [
      { titulo: "Medio", numerica: false },
      { titulo: "Entra al arqueo", numerica: false },
      { titulo: "Se conciliaba", numerica: false },
      { titulo: "Plazo de abono", numerica: false },
      { titulo: "Comisión", numerica: true },
    ],
    filas: [
      ["Efectivo", "Sí", "No", "Inmediato", "0.00 %"],
      ["Tarjeta de débito", "No", "Sí, con el extracto", "1 día hábil", "1.80 %"],
      ["Tarjeta de crédito", "No", "Sí, con el extracto", "2 días hábiles", "3.20 %"],
      ["Depósito en cuenta", "No", "Sí, con el extracto", "Inmediato", "0.00 %"],
      ["Cheque de gerencia", "No", "Sí, al canje", "2 días hábiles", "0.00 %"],
    ],
    pie: "La comisión de las tarjetas la paga la municipalidad: el contribuyente paga el importe íntegro de su deuda.",
  },
  {
    label: "Cierre y depósito",
    nota: "Qué hay que hacer al final del día y en qué orden. Un turno sin arquear bloquea el cierre y con él el depósito.",
    columnas: [
      { titulo: "Paso", numerica: false },
      { titulo: "Acto", numerica: false },
      { titulo: "Responsable", numerica: false },
      { titulo: "Plazo", numerica: false },
      { titulo: "Si no se hace", numerica: false },
    ],
    filas: [
      [
        "1",
        "Arqueo de cada caja",
        "El cajero del turno",
        "Al cerrar el turno",
        "El cierre del día no cuadra",
      ],
      [
        "2",
        "Conciliación con el banco",
        "Tesorería",
        "Al día siguiente",
        "El cobro no se confirma",
      ],
      ["3", "Cierre del día", "Jefe de Tesorería", "Mismo día", "No se puede depositar"],
      [
        "4",
        "Depósito en cuenta municipal",
        "Tesorería",
        "24 horas",
        "Observación de control interno",
      ],
      [
        "5",
        "Parte diario de recaudación",
        "Tesorería",
        "Mismo día",
        "Contabilidad no registra el ingreso",
      ],
    ],
    pie: "El orden no es una formalidad: cada paso necesita que el anterior esté hecho. Por eso dos cajas sin arquear paran todo lo demás.",
  },
];
