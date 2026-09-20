import type { Hoja, Modulo } from './tipos.ts';

/**
 * **El arbol de la ventanilla: un modulo y siete hojas, una por acceso** (#74).
 *
 * <h2>De donde sale, y por que asi</h2>
 *
 * No hay artboard de `caja`. Lo que hay es su backend, y el backend ya dice que se puede hacer en
 * esta ventanilla: **siete accesos** en `CatalogoDelSistema` —desde #77, que declaro los cuatro que
 * los controladores exigian y el catalogo no traia— y un `@RequiereAcceso` en cada metodo de cada
 * controlador. El arbol es eso, dibujado:
 *
 *   · **una hoja por acceso**, con el rotulo del catalogo —con sus tildes: el catalogo los guarda en
 *     ASCII y la guarda compara sin ellas—;
 *   · **la clave de la hoja es el codigo con guiones**, que es lo que viaja al hash;
 *   · **y cada hoja declara las operaciones de su acceso**, leidas metodo a metodo. Las de lectura
 *     son las que la pantalla podra pedir; las de escritura se declaran y **no se llaman**: ADR-0040
 *     acepto conectar la ventanilla solo para leer.
 *
 * Que el arbol y el backend digan lo mismo, en los dos sentidos, lo comprueba
 * `verificaciones/el-arbol-cuadra-con-el-backend.test.ts`, leyendo los `.java`.
 *
 * <h2>Lo que queda fuera del arbol, a proposito</h2>
 *
 *   · **`POST /ordenes-de-cobro`**: la manda otro sistema, no una persona en ventanilla.
 *   · **`GET /recibos/{nro}/duplicado?formato=`**: parece una lectura y **escribe** —registra la
 *     reimpresion y exige `IMPRESION`—.
 *   · **Las cuatro rutas de `ReciboDeTramiteController`**: las pide `rentas`, servidor a servidor.
 *
 * <h2>El hueco que #74 declaro aqui, cerrado en #97</h2>
 *
 * Decia que ninguna lectura de `cierre_caja` devolvia el `turnoId` de una caja, un cajero y una
 * fecha —y `GET /turnos/{turnoId}/cierre` lo necesita—, de modo que solo salia de
 * `/recaudacion/avance`, que es otro acceso, o del `turnoId` de un pago sin entregar. Se declaro en
 * vez de inventarlo, y #97 lo resolvio donde tocaba: **`GET /turnos/del-dia`**, del mismo acceso
 * `cierre_caja`, publica el turno abierto de quien pregunta —y dice tambien cuando no lo hay—.
 */
export const ARBOL = [
  {
    rotulo: 'Tesorería',
    nota: 'Lo que se cobra en ventanilla, sus recibos, el cierre del turno y la recaudación.',
    slug: 'tesoreria',
    codigo: 'TESORERIA',
    icono: 'valor',
    hojas: [
      {
        clave: 'caja-tributaria',
        rotulo: 'Caja tributaria',
        acceso: 'caja_tributaria',
        operaciones: [
          { verbo: 'GET', ruta: '/cajas', controlador: 'CatalogoDeCajasController' },
          { verbo: 'POST', ruta: '/cobros', controlador: 'CajaController' },
        ],
      },
      {
        clave: 'caja-tasas',
        rotulo: 'Caja de tasas y derechos administrativos',
        acceso: 'caja_tasas',
        operaciones: [
          { verbo: 'GET', ruta: '/cajas', controlador: 'CatalogoDeCajasController' },
          { verbo: 'POST', ruta: '/cobros/tasas', controlador: 'CajaController' },
        ],
      },
      {
        clave: 'duplicado-recibo',
        rotulo: 'Duplicado de recibo',
        acceso: 'duplicado_recibo',
        operaciones: [
          { verbo: 'GET', ruta: '/recibos', controlador: 'ReciboController' },
          { verbo: 'GET', ruta: '/recibos/{nro}/duplicado', controlador: 'ReciboController' },
        ],
        // **El recibo elegido viaja en la ruta** (#99): `#/duplicado-recibo/001-000123`. Es lo que
        // hace que recargar —o pasarle el enlace a quien tiene que revisar ese recibo— siga
        // ensenando el mismo, y que la segunda lectura sepa cual pedir sin guardarlo en ningun
        // estado. Es la unica hoja que declara algo: las otras seis no eligen nada.
        enLaRuta: { sujeto: true },
      },
      {
        clave: 'anulacion-recibo',
        rotulo: 'Anulación de recibo',
        acceso: 'anulacion_recibo',
        operaciones: [
          { verbo: 'POST', ruta: '/cobros/{nro}/anulacion', controlador: 'ReciboController' },
        ],
      },
      {
        clave: 'cierre-caja',
        rotulo: 'Cierre y arqueo de caja',
        acceso: 'cierre_caja',
        // El dia que se concilia vive en la direccion (#98). Lo que no se declara aqui, el marco lo
        // ignora con aviso al abrir la hoja: sin esta linea, elegir un dia no llegaria a la ruta y
        // el bloque del cuadre se quedaria esperando para siempre.
        enLaRuta: { parametros: ['fecha'] },
        operaciones: [
          { verbo: 'GET', ruta: '/turnos/del-dia', controlador: 'TurnoController' },
          { verbo: 'GET', ruta: '/turnos/{turnoId}/cierre', controlador: 'EstadoDelCierreController' },
          { verbo: 'GET', ruta: '/pagos/sin-entregar', controlador: 'PagoController' },
          { verbo: 'GET', ruta: '/conciliacion', controlador: 'ConciliacionController' },
          { verbo: 'POST', ruta: '/turnos/cierre', controlador: 'CierreController' },
          { verbo: 'POST', ruta: '/pagos/{pagoId}/explicacion', controlador: 'PagoController' },
        ],
      },
      {
        clave: 'avance-recaudacion',
        rotulo: 'Avance de recaudación',
        acceso: 'avance_recaudacion',
        operaciones: [
          { verbo: 'GET', ruta: '/recaudacion/avance', controlador: 'RecaudacionController' },
        ],
      },
      {
        clave: 'recaudacion-area',
        rotulo: 'Recaudación por área',
        acceso: 'recaudacion_area',
        operaciones: [
          { verbo: 'GET', ruta: '/recaudacion/por-area', controlador: 'RecaudacionController' },
        ],
      },
    ],
  },
] as const satisfies readonly Modulo[];

/** Las siete claves de hoja, como tipo: las definiciones se declaran `Record<ClaveDeHoja, Pantalla>`. */
export type ClaveDeHoja = (typeof ARBOL)[number]['hojas'][number]['clave'];

/** Las claves en el orden del arbol, que es el que se dibuja. */
export const CLAVES_DE_HOJA: readonly ClaveDeHoja[] = ARBOL.flatMap((modulo) =>
  modulo.hojas.map((hoja) => hoja.clave),
);

const POR_CLAVE: ReadonlyMap<string, Hoja> = new Map(
  ARBOL.flatMap((modulo) => modulo.hojas.map((hoja) => [hoja.clave, hoja] as const)),
);

/** La hoja de una clave. Revienta si no existe: con `ClaveDeHoja` eso es que el arbol se desincronizo. */
export function hojaDe(clave: ClaveDeHoja): Hoja {
  const hoja = POR_CLAVE.get(clave);
  if (hoja === undefined) {
    throw new Error(`«${clave}» no esta en el arbol. El arbol y las claves se desincronizaron.`);
  }
  return hoja;
}
