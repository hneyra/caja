import type { ClaveDeHoja } from '../arbol.ts';
import type { Pantalla } from '../tipos.ts';

/**
 * **Las siete pantallas de Tesorería, como dato** (#74).
 *
 * <h2>De donde sale cada campo y cada columna</h2>
 *
 * De los `Resource` que el backend publica en las lecturas que la hoja declara en `arbol.ts`: un
 * campo de solo lectura por componente que se lee suelto, y una tabla por lista. Los nombres son
 * los de la pantalla, no los del registro —«Emitido» y no `emitidoEn`—, y **no se traen todos**:
 * lo que es de otro sistema no se ensena en la ventanilla. La linea de un recibo lleva `tributo`,
 * `ejercicio`, `predioId` y `vehiculoId`, que son de `rentas`; aqui se ensena el concepto, la
 * cantidad y el importe, que es lo que un recibo de mercado tambien tendria.
 *
 * <h2>Lo que estas definiciones NO traen, y es la decision</h2>
 *
 * · **Ni una cifra.** Los campos `r` no llevan valor y las tablas no llevan filas: entran por los
 *   datos (`datos/conectores.ts`, #84), y mientras no entran la pantalla dice por que. En una
 *   ventanilla, una cifra de ejemplo se lee como real. Lo que SI llevan las tablas que se leen es su
 *   `vacio`: una lista vacia es una respuesta, y no la ausencia de dato.
 * · **Ni un campo que se escriba.** ADR-0040 acepto conectar la ventanilla para leer, asi que ninguna
 *   pantalla tiene un campo de entrada y el armazon no ofrece «Guardar». Las escrituras estan
 *   declaradas en el arbol y dichas en la nota de su bloque.
 * · **Ni un desplegable con opciones inventadas.** Las cajas, los cajeros y las areas son datos de la
 *   instalacion: un «C-1, C-2, C-3» escrito aqui seria una lista falsa con aspecto de filtro.
 *
 * Toda cifra lleva su fecha al lado (regla 9): cada bloque con importes tiene su «A la fecha».
 */
export const TESORERIA = {
  'caja-tributaria': {
    instruccion:
      'consulte las cajas de la municipalidad. El cobro de una orden se registra en ventanilla contra la orden que envía el sistema de origen.',
    bloques: [
      {
        titulo: 'Cajas',
        nota: 'Las ventanillas de la municipalidad y el área a la que pertenece cada una.',
        campos: [],
        tabla: {
          titulo: 'Cajas de la municipalidad',
          columnas: [
            { rotulo: 'Código', alineadoDerecha: false },
            { rotulo: 'Caja', alineadoDerecha: false },
            { rotulo: 'Área', alineadoDerecha: false },
            { rotulo: 'Situación', alineadoDerecha: false },
          ],
          columnaDeInsignia: 3,
          vacio: 'Esta municipalidad no tiene ninguna caja cargada.',
        },
      },
      {
        titulo: 'Cobro de una orden',
        nota: 'Esta pantalla todavía no registra cobros: la ventanilla se conectó para leer (ADR-0040).',
        campos: [],
      },
    ],
  },
  'caja-tasas': {
    instruccion:
      'consulte las cajas donde se cobran las tasas y los derechos administrativos del TUPA.',
    bloques: [
      {
        titulo: 'Cajas',
        nota: 'Las mismas ventanillas: una tasa se cobra en cualquiera que esté activa.',
        campos: [],
        tabla: {
          titulo: 'Cajas de la municipalidad',
          columnas: [
            { rotulo: 'Código', alineadoDerecha: false },
            { rotulo: 'Caja', alineadoDerecha: false },
            { rotulo: 'Área', alineadoDerecha: false },
            { rotulo: 'Situación', alineadoDerecha: false },
          ],
          columnaDeInsignia: 3,
          vacio: 'Esta municipalidad no tiene ninguna caja cargada.',
        },
      },
      {
        titulo: 'Cobro de tasas',
        nota: 'Esta pantalla todavía no registra cobros: la ventanilla se conectó para leer (ADR-0040).',
        campos: [],
      },
    ],
  },
  'duplicado-recibo': {
    instruccion:
      'busque el recibo por el documento del pagador, la caja, el cajero o las fechas, y ábralo para ver su duplicado.',
    bloques: [
      {
        titulo: 'Recibos localizados',
        nota: 'Lo emitido y lo anulado, con cuántas veces se reimprimió cada recibo.',
        campos: [],
        tabla: {
          titulo: 'Recibos',
          columnas: [
            { rotulo: 'Número', alineadoDerecha: false },
            { rotulo: 'Emitido', alineadoDerecha: false },
            { rotulo: 'Documento', alineadoDerecha: false },
            { rotulo: 'Pagador', alineadoDerecha: false },
            { rotulo: 'Importe S/', alineadoDerecha: true },
            { rotulo: 'Medio de pago', alineadoDerecha: false },
            { rotulo: 'Duplicados', alineadoDerecha: true },
            { rotulo: 'Estado', alineadoDerecha: false },
          ],
          columnaDeInsignia: 7,
          vacio: 'Ningún recibo coincide.',
          nota: 'El importe es el del recibo a la fecha de su emisión: un recibo no se recalcula.',
        },
      },
      {
        titulo: 'El recibo elegido',
        nota: 'Lo que dice el papel que se entregó en ventanilla.',
        campos: [
          { etiqueta: 'Número', tipo: 'r' },
          { etiqueta: 'Estado', tipo: 'r' },
          { etiqueta: 'Cajero', tipo: 'r' },
          { etiqueta: 'Forma de pago', tipo: 'r' },
          { etiqueta: 'Emitido', tipo: 'r' },
          { etiqueta: 'Duplicados emitidos', tipo: 'r' },
          { etiqueta: 'Total S/', tipo: 'r' },
          { etiqueta: 'A la fecha', tipo: 'r' },
        ],
        tabla: {
          titulo: 'Líneas del recibo',
          columnas: [
            { rotulo: 'Concepto', alineadoDerecha: false },
            { rotulo: 'Cantidad', alineadoDerecha: true },
            { rotulo: 'Precio unitario S/', alineadoDerecha: true },
            { rotulo: 'Monto S/', alineadoDerecha: true },
          ],
        },
      },
    ],
  },
  'anulacion-recibo': {
    instruccion:
      'la anulación de un recibo exige su motivo, quién la autoriza y el memorando que la respalda.',
    bloques: [
      {
        titulo: 'Anular un recibo',
        nota:
          'Anular no borra: reversa lo cobrado y deja el recibo marcado como anulado. Esta pantalla todavía no anula: la ventanilla se conectó para leer (ADR-0040).',
        campos: [],
      },
    ],
  },
  'cierre-caja': {
    instruccion:
      'cuadre lo contado en caja contra lo registrado. Lo que impide cerrar son los pagos que todavía no llegaron a su sistema de origen.',
    bloques: [
      {
        titulo: 'Arqueo del turno',
        nota: 'Lo cobrado y lo anulado del turno, contra lo declarado por forma de pago.',
        campos: [
          { etiqueta: 'Fecha', tipo: 'r' },
          { etiqueta: 'Puede cerrarse', tipo: 'r' },
          { etiqueta: 'Recibos emitidos', tipo: 'r' },
          { etiqueta: 'Recibos anulados', tipo: 'r' },
          { etiqueta: 'Cobrado S/', tipo: 'r' },
          { etiqueta: 'Anulado S/', tipo: 'r' },
          { etiqueta: 'Neto S/', tipo: 'r' },
          { etiqueta: 'Declarado S/', tipo: 'r' },
          { etiqueta: 'Diferencia S/', tipo: 'r' },
          { etiqueta: 'Cuadra', tipo: 'r' },
        ],
        tabla: {
          titulo: 'Por forma de pago',
          columnas: [
            { rotulo: 'Forma de pago', alineadoDerecha: false },
            { rotulo: 'Cobrado S/', alineadoDerecha: true },
            { rotulo: 'Anulado S/', alineadoDerecha: true },
            { rotulo: 'Neto S/', alineadoDerecha: true },
            { rotulo: 'Declarado S/', alineadoDerecha: true },
            { rotulo: 'Diferencia S/', alineadoDerecha: true },
          ],
          nota: 'El arqueo se cuadra contra lo contado en caja, no contra lo registrado: la diferencia es lo que hay que explicar.',
        },
      },
      {
        titulo: 'Pagos sin entregar',
        nota: 'Cobros de la ventanilla que su sistema de origen todavía no recibió. Mientras haya alguno, el turno no se cierra.',
        campos: [],
        tabla: {
          titulo: 'Pagos pendientes de entrega',
          columnas: [
            { rotulo: 'Pago', alineadoDerecha: false },
            { rotulo: 'Destino', alineadoDerecha: false },
            { rotulo: 'Recibo', alineadoDerecha: true },
            { rotulo: 'Intentos', alineadoDerecha: true },
            { rotulo: 'Último error', alineadoDerecha: false },
            { rotulo: 'Creado', alineadoDerecha: false },
            { rotulo: 'Estado', alineadoDerecha: false },
          ],
          columnaDeInsignia: 6,
          vacio: 'Ningún pago espera entrega: por este lado, el turno puede cerrarse.',
        },
      },
      {
        titulo: 'Conciliación del día',
        nota: 'Lo cobrado en ventanilla contra lo que cada sistema de origen dice haber aplicado.',
        campos: [
          { etiqueta: 'Fecha', tipo: 'r' },
          { etiqueta: 'Cuadra', tipo: 'r' },
        ],
        tabla: {
          titulo: 'Por sistema de origen',
          columnas: [
            { rotulo: 'Sistema', alineadoDerecha: false },
            { rotulo: 'Registrados', alineadoDerecha: true },
            { rotulo: 'Anulados', alineadoDerecha: true },
            { rotulo: 'En tránsito', alineadoDerecha: true },
            { rotulo: 'Neto S/', alineadoDerecha: true },
            { rotulo: 'Diferencia S/', alineadoDerecha: true },
            { rotulo: 'Situación', alineadoDerecha: false },
          ],
          columnaDeInsignia: 6,
          nota: 'Cuando el sistema de origen no contesta, la línea dice por qué no se sabe en vez de mostrar un cero.',
        },
      },
    ],
  },
  'avance-recaudacion': {
    instruccion: 'revise lo recaudado en el periodo, por concepto. Toda cifra lleva la fecha a la que se calculó.',
    bloques: [
      {
        titulo: 'Recaudación del periodo',
        nota: '',
        campos: [
          { etiqueta: 'Desde', tipo: 'r' },
          { etiqueta: 'Hasta', tipo: 'r' },
          { etiqueta: 'A la fecha', tipo: 'r' },
          { etiqueta: 'Cobrado S/', tipo: 'r' },
          { etiqueta: 'Anulado S/', tipo: 'r' },
          { etiqueta: 'Neto S/', tipo: 'r' },
        ],
        tabla: {
          titulo: 'Por concepto',
          columnas: [
            { rotulo: 'Concepto', alineadoDerecha: false },
            { rotulo: 'Cobrado S/', alineadoDerecha: true },
            { rotulo: 'Anulado S/', alineadoDerecha: true },
            { rotulo: 'Neto S/', alineadoDerecha: true },
          ],
          vacio: 'No se cobró nada en el periodo.',
        },
      },
    ],
  },
  'recaudacion-area': {
    instruccion: 'revise lo recaudado por cada área de la municipalidad y su partida.',
    bloques: [
      {
        titulo: 'Recaudación por área',
        nota: 'Lo que no tiene partida asignada se cuenta aparte, para que se vea.',
        campos: [
          { etiqueta: 'Desde', tipo: 'r' },
          { etiqueta: 'Hasta', tipo: 'r' },
          { etiqueta: 'A la fecha', tipo: 'r' },
          { etiqueta: 'Neto S/', tipo: 'r' },
          { etiqueta: 'Neto sin partida S/', tipo: 'r' },
        ],
        tabla: {
          titulo: 'Por área y partida',
          columnas: [
            { rotulo: 'Área', alineadoDerecha: false },
            { rotulo: 'Partida', alineadoDerecha: false },
            { rotulo: 'Concepto', alineadoDerecha: false },
            { rotulo: 'Cobrado S/', alineadoDerecha: true },
            { rotulo: 'Anulado S/', alineadoDerecha: true },
            { rotulo: 'Neto S/', alineadoDerecha: true },
          ],
          vacio: 'No se cobró nada en el periodo.',
        },
      },
    ],
  },
} satisfies Record<ClaveDeHoja, Pantalla>;
