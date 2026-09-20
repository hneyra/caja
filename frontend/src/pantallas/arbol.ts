import type { AccionDeLaHoja, Hoja, Modulo, Operacion } from './tipos.ts';

/**
 * **El arbol de la ventanilla: un modulo, seis hojas y una accion** (#74, #100).
 *
 * <h2>De donde sale, y por que asi</h2>
 *
 * No hay artboard de `caja`. Lo que hay es su backend, y el backend ya dice que se puede hacer en
 * esta ventanilla: **siete accesos** en `CatalogoDelSistema` —desde #77, que declaro los cuatro que
 * los controladores exigian y el catalogo no traia— y un `@RequiereAcceso` en cada metodo de cada
 * controlador. El arbol es eso, dibujado:
 *
 *   · **la clave de la hoja es el codigo con guiones**, que es lo que viaja al hash;
 *   · **cada hoja declara las operaciones de su acceso**, leidas metodo a metodo. Las de lectura son
 *     las que la pantalla pide; las de escritura se declaran, y **solo una se llama**: la anulacion
 *     de un cobro (ADR-0044);
 *   · y el rotulo de cada hoja es el del catalogo —con sus tildes: el catalogo los guarda en ASCII
 *     y la guarda compara sin ellas—.
 *
 * Que el arbol y el backend digan lo mismo, en los dos sentidos, lo comprueba
 * `verificaciones/el-arbol-cuadra-con-el-backend.test.ts`, leyendo los `.java`.
 *
 * <h2>Siete accesos y SEIS hojas: el septimo lo sirve una accion (#100, ADR-0044)</h2>
 *
 * Hasta #100 habia una hoja por acceso, y la septima —la de `anulacion_recibo`— **no llevaba a ninguna
 * parte**: su unica operacion es un `POST`, asi que no podia pedir nada, y quien solo tenia ese
 * acceso entraba a una ventanilla cuyo arbol era esa sola hoja muda. Se retiro.
 *
 * Anular se ofrece ahora **donde esta el recibo**: una accion del bloque «El recibo elegido» de
 * `duplicado-recibo`, que abre el acto y llama a `POST /cobros/{nro}/anulacion` con el numero que ya
 * esta en la ruta. Lo que la hoja gana es `acciones`, y cada una declara **que acceso sirve**: eso
 * es lo que mantiene la cuenta en siete, y lo que la guarda comprueba contra el catalogo.
 *
 * Y para que el acceso que se quedo sin hoja no se quede tampoco sin lista, el backend abrio
 * `GET /recibos` y `GET /recibos/{nro}/duplicado` a `anulacion_recibo` por `oTambien` (#100). Lo que
 * eso alcanza y lo que no, en ADR-0044 §«Lo que ve quien solo puede anular».
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

/**
 * La `clave` del acto que anula, en `definiciones/tesoreria.ts` y en el arbol.
 *
 * Vive aqui —y no escrita dos veces— porque es la misma cadena en tres sitios que no se ven entre
 * si: lo que la accion `abre`, lo que la pieza del acto se llama, y lo que `<Pantalla actos>`
 * atiende. Escrita tres veces, un renombrado deja un boton que abre un acto que no existe, y eso no
 * da ningun error: no pasa nada al pulsarlo.
 */
export const ACTO_DE_ANULACION = 'anular-el-recibo';
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
        // **Anular es una accion de esta hoja, y sirve OTRO acceso** (#100, ADR-0044). Aqui el
        // recibo ya esta elegido y a la vista —su pagador, su importe y su estado—, que es la
        // condicion que ADR-0026 §4 y la regla 10 ponen para deshacer un cobro: anular un numero
        // tecleado a ciegas es justo lo que no puede poder hacerse.
        acciones: [
          {
            clave: ACTO_DE_ANULACION,
            acceso: 'anulacion_recibo',
            operacion: { verbo: 'POST', ruta: '/cobros/{nro}/anulacion', controlador: 'ReciboController' },
          },
        ],
        // **El recibo elegido viaja en la ruta** (#99): `#/duplicado-recibo/001-000123`. Es lo que
        // hace que recargar —o pasarle el enlace a quien tiene que revisar ese recibo— siga
        // ensenando el mismo, y que la segunda lectura sepa cual pedir sin guardarlo en ningun
        // estado. Es la unica hoja que declara algo: las otras cinco no eligen nada.
        enLaRuta: { sujeto: true },
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

/** Las seis claves de hoja, como tipo: las definiciones se declaran `Record<ClaveDeHoja, Pantalla>`. */
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

/** Las acciones de una hoja. Vacio en las cinco que no ofrecen ninguna. */
export const accionesDe = (hoja: Hoja): readonly AccionDeLaHoja[] => hoja.acciones ?? [];

/**
 * **Los accesos que una hoja sirve**: el suyo, y el de cada una de sus acciones (#100).
 *
 * Es lo que `permisos.ts` cruza con la matriz de la sesion: una hoja se ofrece si la cuenta puede
 * **alguno** de ellos. Sin esto, quien solo pudiera anular no veria `duplicado-recibo` —que es
 * donde se anula— y volveria a quedarse con un arbol vacio, que es el defecto de #100.
 */
export const accesosDe = (hoja: Hoja): readonly string[] => [
  hoja.acceso,
  ...accionesDe(hoja).map((accion) => accion.acceso),
];

/** Todas las operaciones que una hoja declara: las suyas y las de sus acciones. */
export const operacionesDe = (hoja: Hoja): readonly Operacion[] => [
  ...hoja.operaciones,
  ...accionesDe(hoja).map((accion) => accion.operacion),
];

/** Todas las hojas del arbol, sin sus modulos. */
export const HOJAS: readonly Hoja[] = (ARBOL as readonly Modulo[]).flatMap((modulo) => [...modulo.hojas]);
