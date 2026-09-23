import { ACTO_DE_ANULACION, type ClaveDeHoja } from '../arbol.ts';
import type { Pantalla } from '../tipos.ts';

/**
 * **Las seis pantallas de Tesorería, como dato** (#74, #100).
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
 * · **Ningun campo de BLOQUE que escriba en el backend**, asi que el pie del armazon sigue sin
 *   ofrecer «Guardar» en ninguna hoja. Desde #98 hay **un** campo de entrada —el dia de la
 *   conciliacion, en `cierre-caja`— y no es una excepcion: lo que escribe es la direccion de la hoja
 *   (`eleccion.enLaRuta`, `kamayuk-lib`#94), y de ahi sale el `?fecha=` de una lectura.
 * · **Y una sola cosa que SI escribe en el backend**: el acto que anula un cobro (#100, ADR-0044),
 *   con su propio primario, su confirmacion y su observacion obligatoria. Tampoco pasa por el pie.
 *   Las demas escrituras del arbol siguen declaradas y sin llamarse. `catalogo.ts` deja las dos
 *   fuera de `seEscribe`, cada una por su motivo, y `solo-lee.test.ts` mide los dos.
 * · **Ni un desplegable con opciones inventadas.** Las cajas, los cajeros y las areas son datos de la
 *   instalacion: un «C-1, C-2, C-3» escrito aqui seria una lista falsa con aspecto de filtro.
 *
 * Toda cifra lleva su fecha al lado (regla 9): cada bloque con importes tiene su «A la fecha».
 */

/**
 * **El nombre de las dos tablas de `duplicado-recibo` y del dato con que se elige** (#99).
 *
 * Son nombres y no indices porque sus filas llevan mas que celdas —el numero con que el boton
 * pide, la marca de estar elegida— y eso solo cabe en `DatosDeLaPantalla.tablas`. Viven aqui, con
 * la definicion que los declara, y los lee `datos/conectores.ts` al llenarlas: escritos dos veces,
 * una tabla se quedaria sin filas en silencio.
 */
export const TABLA_DE_RECIBOS = 'recibos';
export const TABLA_DE_LINEAS = 'lineas';
export const NUMERO_DE_LA_FILA = 'numero';

/**
 * **El nombre de la lectura del cuadre del dia** (#98), por lo mismo que los de arriba.
 *
 * El bloque lo declara en su `lectura.clave` y `datos/conectores.ts` pone su estado con el. Escrito
 * dos veces, el bloque diria «nadie ha dado el estado de esta lectura» y nadie sabria por que.
 */
export const LECTURA_DE_LA_CONCILIACION = 'conciliacion';

/**
 * **Los cuatro datos con nombre que la accion de anular lee** (#100).
 *
 * `cuando`, `impedida` y las plantillas de un `Texto` leen `DatosDeLaPantalla.nombrados` por su
 * nombre, que es una cadena. Escritas sueltas en la definicion y otra vez en quien las pone, un
 * renombrado no da ningun error: el impedimento deja de cumplirse y el boton sale **habilitado**,
 * que es el peor de los dos fallos posibles. Aqui hay un solo sitio.
 *
 * Los dos primeros los pone la lectura (`datos/conectores.ts`); los dos ultimos, lo que la sesion
 * puede (`datos/laAnulacion.ts`), que sale de `GET /seguridad/sesion/permisos`.
 */
export const NUMERO_DEL_RECIBO = 'numeroDelRecibo';
export const ESTADO_DEL_RECIBO = 'estadoDelRecibo';
export const PUEDE_ANULAR = 'puedeAnular';
export const PUEDE_LEER_RECIBOS = 'puedeLeerRecibos';

/** Lo que el backend llama a un recibo ya anulado. Es un dato suyo, no una palabra: no se traduce. */
export const ANULADO = 'ANULADO';

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
    // Lo tecleado en el acto de anular vive fuera de la pantalla (#117): asi la costura
    // (`useLaAnulacion.ts`) lo copia a la pestana, y un 401 a mitad del acto no se lo lleva al
    // volver a entrar. Sin `suciaAlTeclear`: la hoja no ofrece «Guardar» ni se marca sucia.
    hoja: { conservaLoTecleado: 'soloSiSucia' },
    instruccion:
      'busque el recibo por el documento del pagador, la caja, el cajero o las fechas, ábralo para ver su duplicado y, si procede, anúlelo desde aquí.',
    bloques: [
      {
        titulo: 'Recibos localizados',
        nota: 'Lo emitido y lo anulado, con cuántas veces se reimprimió cada recibo.',
        campos: [],
        tabla: {
          titulo: 'Recibos',
          clave: TABLA_DE_RECIBOS,
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
          // **La fila se elige aquí** (#99). La acción no abre ningún formulario y no escribe: lleva
          // a esta misma hoja con el número del recibo en el sujeto de la ruta, y es leyendo esa
          // ruta como el bloque de abajo pide `GET /recibos/{nro}/duplicado`. Al ser un botón, se
          // pulsa con el ratón y se llega a él con el tabulador, sin teclas propias que aprender.
          accionesPorFila: {
            columna: 'Duplicado',
            acciones: [
              {
                clave: 'ver-el-duplicado',
                rotulo: 'Ver el duplicado',
                va: { hoja: 'duplicado-recibo', sujeto: { desde: NUMERO_DE_LA_FILA } },
              },
            ],
            sinAcciones: 'Sin acciones',
          },
        },
      },
      {
        titulo: 'El recibo elegido',
        nota: 'Lo que dice el papel que se entregó en ventanilla.',
        // **Anular se ofrece aquí, y no en una hoja aparte** (#100, ADR-0044): aquí el recibo ya
        // está elegido, con su pagador, su importe y su estado a la vista.
        //
        // Los cuatro impedimentos van en este orden y gana el primero que se cumple, porque es el
        // orden en que se arreglan: primero lo que no depende de esta pantalla —el privilegio—, y
        // después lo que sí. Nunca un botón apagado sin motivo: lo dibuja `BotonConMotivo`.
        acciones: [
          {
            rotulo: 'Anular el recibo',
            principal: true,
            abre: ACTO_DE_ANULACION,
            // Lo que el acto necesita saber de dónde se abrió: sobre qué recibo se actúa.
            con: { [NUMERO_DEL_RECIBO]: { desde: NUMERO_DEL_RECIBO } },
            impedida: [
              {
                si: { dato: PUEDE_ANULAR, vale: false },
                motivo:
                  'Su cuenta no puede anular cobros en esta caja. El privilegio lo concede quien administra la seguridad, sobre la opción «Anulación de recibo».',
              },
              {
                si: { dato: PUEDE_LEER_RECIBOS, vale: false },
                motivo:
                  'Su cuenta puede anular, pero no puede ver los recibos, y un cobro no se anula sin verlo. Pida lectura sobre «Anulación de recibo» o sobre «Duplicado de recibo».',
              },
              {
                si: { dato: NUMERO_DEL_RECIBO, hay: false },
                motivo: 'Elija primero un recibo en la lista de arriba: aquí no se anula un número tecleado a ciegas.',
              },
              {
                si: { dato: ESTADO_DEL_RECIBO, vale: ANULADO },
                motivo: 'Este recibo ya está anulado, y un recibo no se anula dos veces.',
              },
            ],
          },
        ],
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
          clave: TABLA_DE_LINEAS,
          columnas: [
            { rotulo: 'Concepto', alineadoDerecha: false },
            { rotulo: 'Cantidad', alineadoDerecha: true },
            { rotulo: 'Precio unitario S/', alineadoDerecha: true },
            { rotulo: 'Monto S/', alineadoDerecha: true },
          ],
          vacio: 'Este recibo no tiene ninguna línea.',
          nota: 'La cantidad y el precio unitario sólo los tiene una tasa: en una línea de tributo llegan vacíos, y se marcan.',
        },
      },
      /*
       * **El acto que anula, y la ÚNICA escritura de esta interfaz** (#100, ADR-0044).
       *
       * Sólo existe abierto: lo abre la acción del bloque de arriba y lo envía el manejador que
       * `datos/laAnulacion.ts` registra. Sus tres campos son los de `PeticionDeAnulacion` del
       * backend —`motivo`, `autorizadoPor` y `nDeMemorando`—, con su misma obligatoriedad; la
       * `observacion` va aparte porque va **siempre** (regla 10), y sus límites son los de
       * `Observacion` del dominio. Que los cuatro sigan cuadrando con el backend lo mide
       * `verificaciones/el-arbol-cuadra-con-el-backend.test.ts`, leyendo los `.java`.
       *
       * El primer campo es de sólo lectura y dice **sobre qué recibo se está actuando**: un
       * formulario de anulación que no nombra el recibo es el mismo número a ciegas que la acción
       * impide.
       */
      {
        tipo: 'acto',
        clave: ACTO_DE_ANULACION,
        titulo: 'Anular el recibo',
        nota: 'Anular no borra: reversa lo cobrado, deja el recibo marcado como anulado y avisa al sistema que emitió la orden.',
        campos: [
          { etiqueta: 'Recibo', tipo: 'r', nombre: NUMERO_DEL_RECIBO },
          { etiqueta: 'Motivo', tipo: 'a1', nombre: 'motivo' },
          { etiqueta: 'Autorizado por', tipo: '', nombre: 'autorizadoPor', opcional: true },
          { etiqueta: 'N.° de memorando', tipo: '', nombre: 'nDeMemorando', opcional: true },
        ],
        observacion: {
          etiqueta: 'Observación',
          ayuda: 'Por qué se anula, para quien lea la bitácora. El motivo de arriba es otra cosa: es el sustento del acto, y se imprime en el duplicado.',
          // Los de `Observacion` del dominio: el `CHECK` de la auditoría y el ancho de la columna.
          largo: { minimo: 5, maximo: 500 },
        },
        advertencia:
          'Anular reversa lo cobrado y publica el aviso al sistema de origen. No se deshace desde la ventanilla.',
        hecho: {
          titulo: 'El cobro quedó anulado',
          texto: {
            plantilla:
              'El recibo {numeroDelRecibo} queda anulado. El sistema que emitió la orden recibirá el aviso para reversar lo aplicado.',
          },
        },
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
          // Al final y no tras «Fecha» (#104): moverlo renumeraria los nueve de arriba, que el
          // conector llena por su posicion. Sale del turno de del-dia, no del arqueo.
          { etiqueta: 'Abierto desde', tipo: 'r' },
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
        nota: 'Elija el día que quiere conciliar. La fecha viaja en la dirección de esta pantalla, así que el enlace se puede guardar y compartir.',
        campos: [
          // **El unico campo que se escribe en toda la ventanilla, y no es una escritura** (#98):
          // lo que mueve es la direccion de la hoja, no el backend. `GET /conciliacion` exige la
          // fecha a proposito —regla 6: una conciliacion que se responde sola con la fecha del
          // reloj no es reproducible al dia siguiente—, asi que aqui no hay «hoy» por omision.
          { etiqueta: 'Fecha', tipo: 'd', eleccion: { enLaRuta: 'fecha' } },
        ],
      },
      {
        titulo: 'El cuadre del día',
        nota: 'Lo cobrado en ventanilla contra lo que cada sistema de origen dice haber aplicado.',
        // Es un bloque aparte del selector, y por eso: **los cuatro estados de una lectura
        // sustituyen al cuerpo**, y con el selector dentro no habria con que elegir el dia
        // justamente en el estado que pide elegirlo.
        lectura: {
          clave: LECTURA_DE_LA_CONCILIACION,
          espera: 'Elija arriba el día que quiere conciliar y aquí saldrá su cuadre.',
        },
        campos: [{ etiqueta: 'Cuadra', tipo: 'r' }],
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
          vacio: 'Ese día no tiene ningún cobro registrado en esta caja.',
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
