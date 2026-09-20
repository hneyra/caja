import type {
  AvanceDeRecaudacion,
  CajaEnLista,
  ConciliacionDelDia,
  DistribucionDeRecaudacion,
  DuplicadoDeUnRecibo,
  EstadoDelCierre,
  Paginado,
  PagoDelBuzon,
  ReciboEnLista,
  TurnoDelDia,
} from './lecturas.ts';

/**
 * **Lo que contestan las lecturas de Tesoreria, para las pruebas** (#84, #99, #97).
 *
 * **No esta medido con `curl`, y la marca lo dice.** Tiene la forma exacta de los `Resource` —la
 * compara `camino-a-la-api.test.ts` campo a campo contra los `.java`— y los valores estan elegidos
 * para ejercer los casos que el reparto tiene que saber tratar:
 *
 *   · un recibo emitido a las **21:04 de Lima**, que en UTC ya es el dia siguiente;
 *   · un recibo **ANULADO** y una caja **INACTIVA**, que pintan su insignia en rojo;
 *   · una caja **sin area** y una fila de la distribucion **sin area ni partida**, que son nulos
 *     deliberados del backend;
 *   · una pagina de recibos **que no llega entera** (`hayMas`), que tiene que decir de cuantos;
 *   · y, desde #99, un duplicado con **dos lineas de distinta clase**: una tasa, con su cantidad y
 *     su precio unitario, y una de tributo, donde los dos llegan **nulos a proposito** —lo dice el
 *     javadoc de `LineaResource`— y hay que marcarlos en vez de pintar un cero;
 *   · y, desde #97, un **arqueo en vivo** con `declarado`, `diferencia` y `cuadra` en nulo —que es
 *     lo que el backend manda por esa ruta— y un turno del dia con y sin ventanilla abierta.
 *
 * **No se siembra** —la siembra de `yarn dev` es solo del catalogo y la cuenta, la regla de `rentas`
 * #114— y no la importa ningun modulo de produccion: lo comprueba `camino-a-la-api.test.ts`.
 */
export const ORIGEN_DE_ESTA_CAPTURA =
  'captura-medida-de-caja: derivada de los Resource de Tesoreria (#84), pendiente de medir con curl';

export const CAJAS_MEDIDAS: Paginado<CajaEnLista> = {
  contenido: [
    { codigo: 'C-01', nombre: 'Caja principal', areaCodigo: 'TES', areaNombre: 'Tesorería', activa: true },
    { codigo: 'C-02', nombre: 'Caja de mercado', areaCodigo: null, areaNombre: null, activa: false },
  ],
  pagina: 0,
  tamano: 200,
  totalElementos: 2,
  totalPaginas: 1,
  hayMas: false,
};

export const RECIBOS_MEDIDOS: Paginado<ReciboEnLista> = {
  contenido: [
    {
      numero: '001-000123',
      // 02:04 en UTC del 16 son las 21:04 del 15 en Lima.
      emitidoEn: '2026-03-16T02:04:00Z',
      documentoDelPagador: '40123456',
      pagador: 'Pagador de la prueba',
      importe: { importe: '1842.60', actualizadoA: '2026-03-15' },
      medioDePago: 'EFECTIVO',
      duplicados: 1,
      estado: 'EMITIDO',
    },
    {
      numero: '001-000124',
      emitidoEn: '2026-03-15T15:30:00Z',
      documentoDelPagador: null,
      pagador: null,
      importe: { importe: '25.00', actualizadoA: '2026-03-15' },
      medioDePago: 'TARJETA',
      duplicados: 0,
      estado: 'ANULADO',
    },
  ],
  pagina: 0,
  tamano: 20,
  totalElementos: 356,
  totalPaginas: 18,
  hayMas: true,
};

/**
 * `GET /recibos/{nro}/duplicado` del primer recibo de la lista (#99).
 *
 * **Derivada, y por eso lo dice `ORIGEN_DE_ESTA_CAPTURA`**: tiene la forma exacta de
 * `DuplicadoResource` y `ReciboResource` —la compara `camino-a-la-api.test.ts` campo a campo— y sus
 * cifras cuadran con las de `RECIBOS_MEDIDOS`: el total es el mismo `1842.60` de la fila, a la
 * misma fecha. Medirla con `curl` contra la instalacion es lo que queda pendiente en #89.
 *
 * `anulacion` va nula porque este recibo esta `EMITIDO`. El estado lo deriva el backend del
 * movimiento de anulacion, no de ninguna columna.
 */
export const DUPLICADO_MEDIDO: DuplicadoDeUnRecibo = {
  estado: 'EMITIDO',
  duplicados: 1,
  anulacion: null,
  recibo: {
    numero: '001-000123',
    serie: '001',
    correlativo: 123,
    cajero: 'Cajero de la prueba',
    formaDePago: 'EFECTIVO',
    tipoDePago: 'TRIBUTARIO',
    beneficioDeclarado: null,
    emitidoEn: '2026-03-16T02:04:00Z',
    total: { importe: '1842.60', actualizadoA: '2026-03-15' },
    lineas: [
      {
        // Una tasa: tiene cantidad y precio unitario.
        tributo: 'TASA-MER-01',
        concepto: 'TASA',
        ejercicio: null,
        predioId: null,
        vehiculoId: null,
        cantidad: 3,
        precioUnitario: { importe: '40.00', actualizadoA: '2026-03-15' },
        insoluto: { importe: '120.00', actualizadoA: '2026-03-15' },
        reajuste: { importe: '0.00', actualizadoA: '2026-03-15' },
        interes: { importe: '0.00', actualizadoA: '2026-03-15' },
        gasto: { importe: '0.00', actualizadoA: '2026-03-15' },
        monto: { importe: '120.00', actualizadoA: '2026-03-15' },
      },
      {
        // Un tributo: `cantidad` y `precioUnitario` NULOS, que es lo que el backend manda.
        tributo: 'TRIB-01',
        concepto: 'PAGO',
        ejercicio: 2026,
        predioId: 4210,
        vehiculoId: null,
        cantidad: null,
        precioUnitario: null,
        insoluto: { importe: '1600.00', actualizadoA: '2026-03-15' },
        reajuste: { importe: '42.60', actualizadoA: '2026-03-15' },
        interes: { importe: '80.00', actualizadoA: '2026-03-15' },
        gasto: { importe: '0.00', actualizadoA: '2026-03-15' },
        monto: { importe: '1722.60', actualizadoA: '2026-03-15' },
      },
    ],
  },
};

export const PAGOS_MEDIDOS: readonly PagoDelBuzon[] = [
  {
    pagoId: '6f1c0b5e-8d2a-4c71-9e3b-2a5d7c9e1f04',
    tipo: 'PAGO_REGISTRADO',
    destino: 'rentas',
    reciboId: 123,
    turnoId: 7,
    estado: 'PENDIENTE',
    intentos: 3,
    ultimoError: 'Connection refused',
    creadoEn: '2026-03-15T14:10:00Z',
    entregadoEn: null,
    explicacion: null,
  },
];

/** `GET /turnos/del-dia` con un turno abierto: lo normal de una ventanilla a media mañana. */
export const TURNO_MEDIDO: TurnoDelDia = {
  cajero: 'jperez',
  fecha: '2026-03-15',
  situacion: 'ABIERTO',
  turnos: [
    {
      turnoId: 7,
      caja: 'C-01',
      cajaNombre: 'Caja principal',
      cajero: 'jperez',
      fecha: '2026-03-15',
      estadoDelTurno: 'ABIERTO',
    },
  ],
};

/** El mismo cajero sin haber cobrado todavia. No es un 404: es la respuesta de las ocho. */
export const TURNO_SIN_ABRIR_MEDIDO: TurnoDelDia = {
  cajero: 'jperez',
  fecha: '2026-03-15',
  situacion: 'SIN_ABRIR',
  turnos: [],
};

/**
 * `GET /turnos/{turnoId}/cierre` del turno de arriba: el **arqueo en vivo**.
 *
 * Los tres campos que nadie ha contado —`declarado`, `diferencia`, `cuadra`— llegan **nulos**, en
 * el recurso y en cada linea. Hasta #97 llegaban en `0,00`, `-neto` y `false`, y la pantalla los
 * pintaba como tres cifras reales de un turno que nadie habia arqueado.
 */
export const CIERRE_MEDIDO: EstadoDelCierre = {
  turnoId: 7,
  puedeCerrar: false,
  arqueo: {
    turnoId: 7,
    fecha: '2026-03-15',
    recibosEmitidos: 12,
    recibosAnulados: 1,
    cobrado: { importe: '1867.60', actualizadoA: '2026-03-15' },
    anulado: { importe: '25.00', actualizadoA: '2026-03-15' },
    neto: { importe: '1842.60', actualizadoA: '2026-03-15' },
    declarado: null,
    diferencia: null,
    cuadra: null,
    lineas: [
      {
        formaDePago: 'EFECTIVO',
        cobrado: { importe: '1742.60', actualizadoA: '2026-03-15' },
        anulado: { importe: '0.00', actualizadoA: '2026-03-15' },
        neto: { importe: '1742.60', actualizadoA: '2026-03-15' },
        declarado: null,
        diferencia: null,
      },
      {
        formaDePago: 'TARJETA',
        cobrado: { importe: '125.00', actualizadoA: '2026-03-15' },
        anulado: { importe: '25.00', actualizadoA: '2026-03-15' },
        neto: { importe: '100.00', actualizadoA: '2026-03-15' },
        declarado: null,
        diferencia: null,
      },
    ],
  },
  cobradoConEvento: null,
  cobradoSinEvento: null,
  loQueImpideCerrar: PAGOS_MEDIDOS,
};

export const AVANCE_MEDIDO: AvanceDeRecaudacion = {
  desde: '2026-03-01',
  hasta: '2026-03-15',
  aLaFecha: '2026-03-15',
  filas: [
    {
      tributo: 'TRIB-01',
      cobrado: { importe: '1867.60', actualizadoA: '2026-03-15' },
      anulado: { importe: '25.00', actualizadoA: '2026-03-15' },
      neto: { importe: '1842.60', actualizadoA: '2026-03-15' },
    },
  ],
  cobrado: { importe: '1867.60', actualizadoA: '2026-03-15' },
  anulado: { importe: '25.00', actualizadoA: '2026-03-15' },
  neto: { importe: '1842.60', actualizadoA: '2026-03-15' },
  turno: null,
};

export const DISTRIBUCION_MEDIDA: DistribucionDeRecaudacion = {
  desde: '2026-03-01',
  hasta: '2026-03-15',
  aLaFecha: '2026-03-15',
  filas: [
    {
      area: 'MER',
      areaNombre: 'Mercados',
      partida: '1.3.2.1',
      tributo: 'TASA-MER-01',
      cobrado: { importe: '120.00', actualizadoA: '2026-03-15' },
      anulado: { importe: '0.00', actualizadoA: '2026-03-15' },
      neto: { importe: '120.00', actualizadoA: '2026-03-15' },
    },
    {
      area: null,
      areaNombre: null,
      partida: null,
      tributo: 'TRIB-01',
      cobrado: { importe: '1867.60', actualizadoA: '2026-03-15' },
      anulado: { importe: '25.00', actualizadoA: '2026-03-15' },
      neto: { importe: '1842.60', actualizadoA: '2026-03-15' },
    },
  ],
  neto: { importe: '1962.60', actualizadoA: '2026-03-15' },
  netoSinPartida: { importe: '1842.60', actualizadoA: '2026-03-15' },
};

/**
 * `GET /conciliacion?fecha=2026-03-15` (#98).
 *
 * **Las dos lineas son los dos casos, y el segundo es el que importa**: `rentas` contesto y su
 * diferencia es cero; `mercados` no contesto, asi que sus cuatro cifras del origen llegan **nulas**
 * y `porQueNoSeSabe` dice por que. Una pantalla que pintara cero ahi diria que el dia cuadra.
 *
 * Y el dia **no cuadra**, que es lo coherente con sus lineas: `rentas` tiene un pago en transito
 * —`PAGOS_MEDIDOS` es justo ese— y de `mercados` no se sabe nada.
 */
export const CONCILIACION_MEDIDA: ConciliacionDelDia = {
  fecha: '2026-03-15',
  cuadra: false,
  lineas: [
    {
      sistema: 'rentas',
      registrados: 12,
      anulados: 1,
      enTransito: 1,
      muertos: 0,
      explicados: 0,
      cobrado: { importe: '1867.60', actualizadoA: '2026-03-15' },
      anulado: { importe: '25.00', actualizadoA: '2026-03-15' },
      neto: { importe: '1842.60', actualizadoA: '2026-03-15' },
      recibidosEnElOrigen: 12,
      aplicadosEnElOrigen: 11,
      rechazadosEnElOrigen: 0,
      importeAplicadoEnElOrigen: '1842.60',
      diferencia: '0.00',
      porQueNoSeSabe: null,
      cuadra: false,
    },
    {
      sistema: 'mercados',
      registrados: 3,
      anulados: 0,
      enTransito: 0,
      muertos: 0,
      explicados: 0,
      cobrado: { importe: '120.00', actualizadoA: '2026-03-15' },
      anulado: { importe: '0.00', actualizadoA: '2026-03-15' },
      neto: { importe: '120.00', actualizadoA: '2026-03-15' },
      recibidosEnElOrigen: null,
      aplicadosEnElOrigen: null,
      rechazadosEnElOrigen: null,
      importeAplicadoEnElOrigen: null,
      diferencia: null,
      porQueNoSeSabe: 'El sistema de origen no contesto: Connection refused',
      cuadra: false,
    },
  ],
};
