import type {
  AvanceDeRecaudacion,
  CajaEnLista,
  DistribucionDeRecaudacion,
  PagoDelBuzon,
  Paginado,
  ReciboEnLista,
} from './lecturas.ts';

/**
 * **Lo que contestan las cinco lecturas de Tesoreria, para las pruebas** (#84).
 *
 * **No esta medido con `curl`, y la marca lo dice.** Tiene la forma exacta de los `Resource` —la
 * compara `camino-a-la-api.test.ts` campo a campo contra los `.java`— y los valores estan elegidos
 * para ejercer los casos que el reparto tiene que saber tratar:
 *
 *   · un recibo emitido a las **21:04 de Lima**, que en UTC ya es el dia siguiente;
 *   · un recibo **ANULADO** y una caja **INACTIVA**, que pintan su insignia en rojo;
 *   · una caja **sin area** y una fila de la distribucion **sin area ni partida**, que son nulos
 *     deliberados del backend;
 *   · una pagina de recibos **que no llega entera** (`hayMas`), que tiene que decir de cuantos.
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
