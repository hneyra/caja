import type { Catalogo, ModuloDelCatalogo } from '@kamayuk/shell';
import { eleccionDe, seEscribe, tipoDe } from '@kamayuk/ui';

import { ARBOL, accesosDe, type ClaveDeHoja } from './pantallas/arbol.ts';
import type { Modulo } from './pantallas/tipos.ts';
import { bloquesDe, pantallaDe } from './pantallas/definiciones/index.ts';

/**
 * **El catalogo de la ventanilla**, en la forma que `@kamayuk/shell` entiende (#74).
 *
 * Es la costura del reparto de ADR-0030 §4, igual que en `rentas`: el armazon no sabe que existe
 * una caja, y alguien tiene que traducir el arbol de este sistema a la forma generica. Tres cosas
 * cambian respecto de la copia de `rentas`, y las tres salen de que aqui no hay artboard:
 *
 *   · **El icono se nombra en el arbol** en vez de deducirse de un trazo. No hay trazo del que
 *     deducirlo; `NombreDeIcono` es una union, asi que un nombre que la libreria no publique no
 *     compila.
 *   · **Cada destino lleva SUS accesos**, por `ACCESOS_POR_DESTINO`: es lo que deja a `permisos.ts`
 *     filtrar hoja por hoja. Son varios desde #100, porque una hoja puede servir mas de un acceso —
 *     `duplicado-recibo` sirve tambien `anulacion_recibo`, con su accion—.
 *   · **`seEscribe` sale siempre `false`** —se calcula igual que en `rentas`, del dato—, porque
 *     ningun **bloque** de la ventanilla tiene un campo que escriba en el backend. Si alguno lo
 *     ganara, el armazon ofreceria «Guardar» sin que nadie lo hubiera decidido, y lo impide
 *     `verificaciones/solo-lee.test.ts`.
 *
 * **Hay DOS cosas que escriben y que aqui no cuentan, y cada una por su motivo.**
 *
 *   · **El campo que elige el dia** (#98): el que declara `eleccion.enLaRuta` (`kamayuk-lib`#94) no
 *     escribe en ningun backend — escribe en la direccion de la hoja, y de ahi sale el parametro de
 *     una LECTURA. Contarlo pondria «Guardar» en el pie de `cierre-caja` sin que exista nada que
 *     guardar. Un campo de entrada sin `eleccion` sigue contando, y eso es lo que mide la guarda.
 *   · **El acto que anula** (#100): ese SI escribe en el backend, y aun asi no cuenta aqui, porque
 *     no se envia desde el pie — tiene su propio primario, su confirmacion y su observacion. Dos
 *     botones de guardar en la misma pantalla serian dos escrituras distintas con el mismo aspecto.
 *     Queda fuera por ser un acto y no un bloque (`bloquesDe`), no por una excepcion.
 *
 * **No traduce ni filtra**: traduce `traducirCatalogo()` y filtra `permisos.ts`, por lo mismo que
 * en `rentas`.
 */

/** Si algun BLOQUE de la pantalla de una hoja tiene un campo que escribe en el backend. Ver arriba. */
function laHojaSeEscribe(clave: ClaveDeHoja): boolean {
  return bloquesDe(pantallaDe(clave)).some((bloque) =>
    bloque.campos.some((campo) => seEscribe(tipoDe(campo.tipo)) && eleccionDe(campo) === undefined),
  );
}

/** El codigo de modulo de cada entrada del catalogo, por su clave: el slug para el hash, el codigo para el backend. */
export const CODIGO_POR_CLAVE: ReadonlyMap<string, string> = new Map(
  ARBOL.map((modulo) => [modulo.slug, modulo.codigo]),
);

/**
 * Los codigos de acceso de cada destino, por su clave. Es la correspondencia que `rentas`#120 no tiene.
 *
 * **Son una lista y no uno solo desde #100**: el suyo, y el de cada accion que la hoja ofrezca. Una
 * hoja se ofrece si la cuenta puede alguno; ver `permisos.ts`.
 */
export const ACCESOS_POR_DESTINO: ReadonlyMap<string, readonly string[]> = new Map(
  (ARBOL as readonly Modulo[]).flatMap((modulo) =>
    modulo.hojas.map((hoja) => [hoja.clave, accesosDe(hoja)] as const),
  ),
);

export const CATALOGO: Catalogo = (ARBOL as readonly Modulo[]).map(
  (modulo): ModuloDelCatalogo => ({
    clave: modulo.slug,
    rotulo: modulo.rotulo,
    nota: modulo.nota,
    icono: modulo.icono,
    destinos: modulo.hojas.map((hoja) => ({
      clave: hoja.clave,
      rotulo: hoja.rotulo,
      seEscribe: laHojaSeEscribe(hoja.clave as ClaveDeHoja),
      // Que hay que HACER aqui. Vive en la definicion de la pantalla y llega al marco por aqui,
      // porque el marco no puede saberla.
      instruccion: pantallaDe(hoja.clave as ClaveDeHoja).instruccion,
      // Lo que la ruta de la hoja guarda (#99). Lo declara el arbol y aqui se copia: el marco
      // ignora —con aviso— lo que el destino no declare, asi que una hoja que elige algo y no lo
      // declara aqui lo pierde al recargar sin que nada lo diga.
      ...(hoja.enLaRuta === undefined ? {} : { enLaRuta: hoja.enLaRuta }),
    })),
  }),
);

/**
 * Un catalogo **con sus rotulos traducidos**, igual que en `rentas`.
 *
 * **El rotulo del modulo NO se traduce**: lo pisa `GET /seguridad/modulos`, y el nombre que la
 * municipalidad le dio a su modulo no tiene traduccion que deducir. Se traduce lo que es de la
 * interfaz: la nota del modulo y los rotulos e instrucciones de sus destinos.
 */
export function traducirCatalogo(catalogo: Catalogo, t: (clave: string) => string): Catalogo {
  return catalogo.map((modulo) => ({
    ...modulo,
    nota: t(modulo.nota),
    destinos: modulo.destinos.map((destino) => ({
      ...destino,
      rotulo: t(destino.rotulo),
      instruccion: destino.instruccion === undefined ? undefined : t(destino.instruccion),
    })),
  }));
}
