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
 * **Lo que contestan las lecturas de Tesoreria, para las pruebas** (#84, #99, #97, #89).
 *
 * <h2>Medida con `curl`, con valores elegidos (#89)</h2>
 *
 * Hasta #89 esto era una captura **derivada**: tenia la forma de los `Resource` —la compara
 * `camino-a-la-api.test.ts` campo a campo contra los `.java`— y nadie la habia pedido a un backend.
 * El 2026-09-28 se pidieron las nueve lecturas con `curl` contra una plataforma local completa
 * (`ORIGEN_DE_ESTA_CAPTURA` dice la orden, las cuentas y los commits), y **lo medido no era lo
 * derivado** en siete sitios. Esta captura tiene ahora la forma, el formato y el orden medidos; los
 * valores siguen elegidos para ejercer casos, y lo que no se pudo medir lo dice.
 *
 *   · **Los instantes llevan seis decimales de segundo**: `2026-09-28T19:07:06.557166Z`, el
 *     `timestamptz` de PostgreSQL tal cual lo escribe `ISO_INSTANT`. La captura los escribia sin
 *     fraccion, que es una forma que el backend solo da una vez por millon.
 *   · **Un importe que no suma nada llega `"0"`, no `"0.00"`**: el `anulado` de una forma de pago
 *     sin anulaciones, el de un tributo del avance o de la distribucion, el de un sistema de la
 *     conciliacion. Es `Dinero.CERO` —o el `coalesce(…, 0)` de la consulta— con escala cero, y
 *     `formatearImporte` lo acepta: sale `S/ 0.00`.
 *   · **El numero de recibo es la serie y SIETE digitos**: `001-0000123`, no `001-000123`.
 *   · **`tipoDePago` es `NORMAL` o `TASA`**, que es lo que escriben `CobrarOrdenes` y `CobrarTasa`.
 *   · **Una linea que sale de una orden de cobro** lleva de `tributo` el sistema de origen en
 *     mayusculas —`RENTAS`— y de `concepto` el de la orden, con `ejercicio`, `predioId`,
 *     `cantidad` y `precioUnitario` **nulos**; todo su importe es insoluto. Y **una orden y una tasa
 *     no comparten papel**: son dos rutas de cobro, y cada recibo es de una clase. Por eso hay tres
 *     duplicados y no uno con dos lineas de distinta clase.
 *   · **`/pagos/sin-entregar` solo devuelve pagos MUERTOS** —`WHERE estado = 'MUERTO'`—, con sus
 *     ocho intentos gastados. La captura ensenaba uno `PENDIENTE`, que esa ruta no da nunca.
 *   · **El orden es el del backend**: los recibos por `fecha` ascendente, el avance y la
 *     distribucion por `cobrado` descendente y luego tributo, y la conciliacion por sistema.
 *
 * Lo sostiene `verificaciones/las-capturas-son-las-medidas.test.ts`, que compara estas capturas con
 * `verificaciones/forma-medida.json` —la forma medida, sin un solo valor— en los dos sentidos: que
 * la captura ejerza todo lo medido, y que lo que ejerce sin haberse medido este declarado.
 *
 * <h2>Los casos que los valores ejercen</h2>
 *
 *   · un recibo emitido a las **21:04 de Lima**, que en UTC ya es el dia siguiente;
 *   · un recibo **ANULADO** —con su acta— y una caja **INACTIVA**, que pintan su insignia en rojo;
 *   · una caja **sin area** y una fila de la distribucion **sin area ni partida**, que son nulos
 *     deliberados del backend;
 *   · una pagina de recibos **que no llega entera** (`hayMas`), que tiene que decir de cuantos;
 *   · un duplicado de una **orden**, con `cantidad` y `precioUnitario` **nulos** —lo dice el javadoc
 *     de `LineaResource`—, y otro de una **tasa**, con los dos llenos;
 *   · un **arqueo en vivo** con `declarado`, `diferencia` y `cuadra` en nulo (#97), y un turno del
 *     dia con y sin ventanilla abierta;
 *   · y una conciliacion con un sistema que **no contesto**. La rama en que el origen **si**
 *     contesta es la unica que sigue derivada: `rentas` no estaba en la maquina que midio.
 *
 * **No se siembra** —la siembra de `yarn dev` es solo del catalogo y la cuenta, la regla de `rentas`
 * #114— y no la importa ningun modulo de produccion: lo comprueba `camino-a-la-api.test.ts`.
 */
export const ORIGEN_DE_ESTA_CAPTURA =
  'captura-medida-de-caja: forma medida con curl el 2026-09-28 contra la plataforma local, por su ingreso ' +
  '(caja@4acbbdf, identidad@6c5e433, infrastructure@1e00e86), con medicion-de-interfaces y con jperez: ' +
  "curl -sS -H \"Authorization: Bearer $TOKEN\" -H 'Accept: application/json' " +
  '"$INGRESO/caja/api/v1{/cajas?tamano=200,/recibos,/recibos/{nro}/duplicado,/turnos/del-dia,' +
  '/turnos/{turnoId}/cierre,/pagos/sin-entregar,/recaudacion/avance,/recaudacion/por-area,/conciliacion?fecha=}"; ' +
  'valores elegidos, y derivada solo la conciliacion de un origen que contesta';

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

/**
 * `GET /recibos`: la primera pagina, **por `fecha` ascendente** como la ordena el backend
 * (`ReciboController.ORDEN_POR_OMISION`), y con el tamano por omision, 20.
 */
export const RECIBOS_MEDIDOS: Paginado<ReciboEnLista> = {
  contenido: [
    {
      numero: '001-0000123',
      // 02:04 en UTC del 16 son las 21:04 del 15 en Lima. Con sus seis decimales, como llega.
      emitidoEn: '2026-03-16T02:04:00.557166Z',
      documentoDelPagador: '40123456',
      pagador: 'Pagador de la prueba',
      importe: { importe: '1722.60', actualizadoA: '2026-03-15' },
      medioDePago: 'EFECTIVO',
      duplicados: 1,
      estado: 'EMITIDO',
    },
    {
      numero: '001-0000124',
      emitidoEn: '2026-03-16T02:11:37.625637Z',
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
 * `GET /recibos/{nro}/duplicado` del primer recibo de la lista (#99): **el de una orden de cobro**.
 *
 * Su unica linea es la que `OrdenDeCobro.comoLineaDeRecibo()` escribe: el sistema de origen en
 * mayusculas como tributo, el concepto de la orden, y `cantidad` y `precioUnitario` **nulos**. Sus
 * cifras cuadran con la fila de `RECIBOS_MEDIDOS`: el mismo `1722.60`, a la misma fecha.
 *
 * `anulacion` va nula porque este recibo esta `EMITIDO`. El estado lo deriva el backend del
 * movimiento de anulacion, no de ninguna columna.
 */
export const DUPLICADO_MEDIDO: DuplicadoDeUnRecibo = {
  estado: 'EMITIDO',
  duplicados: 1,
  anulacion: null,
  recibo: {
    numero: '001-0000123',
    serie: '001',
    correlativo: 123,
    cajero: 'Cajero de la prueba',
    formaDePago: 'EFECTIVO',
    tipoDePago: 'NORMAL',
    beneficioDeclarado: null,
    emitidoEn: '2026-03-16T02:04:00.557166Z',
    total: { importe: '1722.60', actualizadoA: '2026-03-15' },
    lineas: [
      {
        // Una orden: `cantidad` y `precioUnitario` NULOS, que es lo que el backend manda.
        tributo: 'RENTAS',
        concepto: 'PAGO',
        ejercicio: null,
        predioId: null,
        vehiculoId: null,
        cantidad: null,
        precioUnitario: null,
        insoluto: { importe: '1722.60', actualizadoA: '2026-03-15' },
        reajuste: { importe: '0.00', actualizadoA: '2026-03-15' },
        interes: { importe: '0.00', actualizadoA: '2026-03-15' },
        gasto: { importe: '0.00', actualizadoA: '2026-03-15' },
        monto: { importe: '1722.60', actualizadoA: '2026-03-15' },
      },
    ],
  },
};

/**
 * El duplicado del segundo recibo de la lista: **ANULADO, y con su acta**.
 *
 * Medido: un recibo anulado trae `anulacion` llena —dia, motivo y quien—, y un `estado` que el
 * backend deriva de ese mismo movimiento. Un `ANULADO` con `anulacion: null` no lo da nunca.
 */
export const DUPLICADO_ANULADO_MEDIDO: DuplicadoDeUnRecibo = {
  estado: 'ANULADO',
  duplicados: 0,
  anulacion: { fecha: '2026-03-15', motivo: 'Error de digitacion', usuario: 'Cajero de la prueba' },
  recibo: {
    numero: '001-0000124',
    serie: '001',
    correlativo: 124,
    cajero: 'Cajero de la prueba',
    formaDePago: 'TARJETA',
    tipoDePago: 'NORMAL',
    beneficioDeclarado: null,
    emitidoEn: '2026-03-16T02:11:37.625637Z',
    total: { importe: '25.00', actualizadoA: '2026-03-15' },
    lineas: [
      {
        tributo: 'RENTAS',
        concepto: 'CUOTA',
        ejercicio: null,
        predioId: null,
        vehiculoId: null,
        cantidad: null,
        precioUnitario: null,
        insoluto: { importe: '25.00', actualizadoA: '2026-03-15' },
        reajuste: { importe: '0.00', actualizadoA: '2026-03-15' },
        interes: { importe: '0.00', actualizadoA: '2026-03-15' },
        gasto: { importe: '0.00', actualizadoA: '2026-03-15' },
        monto: { importe: '25.00', actualizadoA: '2026-03-15' },
      },
    ],
  },
};

/**
 * El duplicado de un recibo **de tasa**: `tipoDePago` `TASA`, y su linea con cantidad y precio
 * unitario, que son los dos campos que una orden deja nulos. Lo escribe `CobrarTasa`: el importe
 * entero de un derecho de tramite es insoluto.
 */
export const DUPLICADO_DE_TASA_MEDIDO: DuplicadoDeUnRecibo = {
  estado: 'EMITIDO',
  duplicados: 0,
  anulacion: null,
  recibo: {
    numero: '001-0000125',
    serie: '001',
    correlativo: 125,
    cajero: 'Cajero de la prueba',
    formaDePago: 'EFECTIVO',
    tipoDePago: 'TASA',
    beneficioDeclarado: null,
    emitidoEn: '2026-03-16T02:15:12.678801Z',
    total: { importe: '120.00', actualizadoA: '2026-03-15' },
    lineas: [
      {
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
    ],
  },
};

/**
 * `GET /pagos/sin-entregar`: **los MUERTOS**, y solo ellos.
 *
 * La ruta es `WHERE estado = 'MUERTO'`, asi que aqui no llega ni un `PENDIENTE` ni un `EXPLICADO`, y
 * `entregadoEn` y `explicacion` son siempre nulos. Medido con el sistema de origen apagado: ocho
 * intentos —`kamayuk.caja.entrega.intentos`— y el error del ultimo, que no es el de Java.
 */
export const PAGOS_MEDIDOS: readonly PagoDelBuzon[] = [
  {
    pagoId: '6f1c0b5e-8d2a-4c71-9e3b-2a5d7c9e1f04',
    tipo: 'PAGO_REGISTRADO',
    destino: 'rentas',
    reciboId: 123,
    turnoId: 7,
    estado: 'MUERTO',
    intentos: 8,
    ultimoError: 'No se pudo publicar el pago: «rentas» no contesta',
    creadoEn: '2026-03-16T02:04:00.571437Z',
    entregadoEn: null,
    explicacion: null,
  },
];

/** `GET /turnos/del-dia` con un turno abierto: lo normal de una ventanilla a media jornada. */
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
      // Nocturna a proposito (#104): las 02:03 UTC del 16 son las 21:03 del 15 en Lima, asi que un
      // reparto que cortara el instante en UTC diria otro dia que el del turno, y saldria rojo. Y
      // un poco ANTES del primer recibo, que es lo medido: el turno se abre con el primer cobro.
      abiertoEn: '2026-03-16T02:03:58.537276Z',
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
 *
 * Con un pago muerto el turno **no puede cerrar**, y entonces `cobradoConEvento` y `cobradoSinEvento`
 * van nulos: el cuadre solo se calcula cuando no queda nada sin entregar. Y el `anulado` de la forma
 * de pago sin anulaciones es `"0"`, sin decimales: es lo medido.
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
        anulado: { importe: '0', actualizadoA: '2026-03-15' },
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

/**
 * `GET /recaudacion/avance` sin parametros: **el año entero** —es lo medido—, y las filas por
 * `cobrado` descendente. Lo que sale de una orden va con el sistema de origen como tributo.
 */
export const AVANCE_MEDIDO: AvanceDeRecaudacion = {
  desde: '2026-01-01',
  hasta: '2026-12-31',
  aLaFecha: '2026-03-15',
  filas: [
    {
      tributo: 'RENTAS',
      cobrado: { importe: '1747.60', actualizadoA: '2026-03-15' },
      anulado: { importe: '25.00', actualizadoA: '2026-03-15' },
      neto: { importe: '1722.60', actualizadoA: '2026-03-15' },
    },
    {
      tributo: 'TASA-MER-01',
      cobrado: { importe: '120.00', actualizadoA: '2026-03-15' },
      anulado: { importe: '0', actualizadoA: '2026-03-15' },
      neto: { importe: '120.00', actualizadoA: '2026-03-15' },
    },
  ],
  cobrado: { importe: '1867.60', actualizadoA: '2026-03-15' },
  anulado: { importe: '25.00', actualizadoA: '2026-03-15' },
  neto: { importe: '1842.60', actualizadoA: '2026-03-15' },
  turno: null,
};

/**
 * `GET /recaudacion/por-area`, con las mismas filas y el mismo orden que el avance: lo que sale de
 * una orden no tiene area ni partida —nulos deliberados—, y la tasa si.
 */
export const DISTRIBUCION_MEDIDA: DistribucionDeRecaudacion = {
  desde: '2026-01-01',
  hasta: '2026-12-31',
  aLaFecha: '2026-03-15',
  filas: [
    {
      area: null,
      areaNombre: null,
      partida: null,
      tributo: 'RENTAS',
      cobrado: { importe: '1747.60', actualizadoA: '2026-03-15' },
      anulado: { importe: '25.00', actualizadoA: '2026-03-15' },
      neto: { importe: '1722.60', actualizadoA: '2026-03-15' },
    },
    {
      area: 'MER',
      areaNombre: 'Mercados',
      partida: '1.3.2.1',
      tributo: 'TASA-MER-01',
      cobrado: { importe: '120.00', actualizadoA: '2026-03-15' },
      anulado: { importe: '0', actualizadoA: '2026-03-15' },
      neto: { importe: '120.00', actualizadoA: '2026-03-15' },
    },
  ],
  neto: { importe: '1842.60', actualizadoA: '2026-03-15' },
  netoSinPartida: { importe: '1722.60', actualizadoA: '2026-03-15' },
};

/**
 * `GET /conciliacion?fecha=2026-03-15` (#98), con las lineas **por sistema**, como las ordena el
 * backend (`ORDER BY e.sistema_destino`).
 *
 * **Las dos lineas son los dos casos, y el que importa es el de `mercados`**: no contesto, asi que
 * sus cinco cifras del origen llegan **nulas** y `porQueNoSeSabe` dice por que —con la frase que
 * el backend escribe, medida—. Una pantalla que pintara cero ahi diria que el dia cuadra.
 *
 * **La linea de `rentas` es la unica parte derivada de estas capturas**: es la rama en que el origen
 * SI contesta, y en la maquina que midio `rentas` no estaba. Su forma sale del `LineaResource`.
 *
 * Y el dia **no cuadra**, que es lo coherente con sus lineas: `rentas` tiene un pago en transito y
 * de `mercados` no se sabe nada.
 */
export const CONCILIACION_MEDIDA: ConciliacionDelDia = {
  fecha: '2026-03-15',
  cuadra: false,
  lineas: [
    {
      sistema: 'mercados',
      registrados: 1,
      anulados: 0,
      enTransito: 0,
      muertos: 1,
      explicados: 0,
      cobrado: { importe: '80.00', actualizadoA: '2026-03-15' },
      anulado: { importe: '0', actualizadoA: '2026-03-15' },
      neto: { importe: '80.00', actualizadoA: '2026-03-15' },
      recibidosEnElOrigen: null,
      aplicadosEnElOrigen: null,
      rechazadosEnElOrigen: null,
      importeAplicadoEnElOrigen: null,
      diferencia: null,
      porQueNoSeSabe: 'No se pudo preguntar que aplico «mercados» el 2026-03-15: «mercados» no contesta',
      cuadra: false,
    },
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
  ],
};
