import type { Catalogo, ModuloDelCatalogo } from '@kamayuk/shell';
import { seEscribe, tipoDe } from '@kamayuk/ui';

import { ARBOL, type ClaveDeHoja } from './pantallas/arbol.ts';
import type { Modulo } from './pantallas/tipos.ts';
import { pantallaDe } from './pantallas/definiciones/index.ts';

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
 *   · **Cada destino lleva su acceso**, por `ACCESO_POR_DESTINO`: es lo que deja a `permisos.ts`
 *     filtrar hoja por hoja.
 *   · **`seEscribe` sale siempre `false`** —se calcula igual que en `rentas`, del dato—, porque
 *     ninguna definicion de la ventanilla tiene un campo que se escriba (ADR-0040). Si alguna lo
 *     ganara, el armazon ofreceria «Guardar» sin que nadie lo hubiera decidido, y lo impide
 *     `verificaciones/solo-lee.test.ts`.
 *
 * **No traduce ni filtra**: traduce `traducirCatalogo()` y filtra `permisos.ts`, por lo mismo que
 * en `rentas`.
 */

/** Si alguna de las pantallas de una hoja tiene un campo que se escribe. */
function laHojaSeEscribe(clave: ClaveDeHoja): boolean {
  return pantallaDe(clave).bloques.some((bloque) =>
    bloque.campos.some((campo) => seEscribe(tipoDe(campo.tipo))),
  );
}

/** El codigo de modulo de cada entrada del catalogo, por su clave: el slug para el hash, el codigo para el backend. */
export const CODIGO_POR_CLAVE: ReadonlyMap<string, string> = new Map(
  ARBOL.map((modulo) => [modulo.slug, modulo.codigo]),
);

/** El codigo de acceso de cada destino, por su clave. Es la correspondencia que `rentas`#120 no tiene. */
export const ACCESO_POR_DESTINO: ReadonlyMap<string, string> = new Map(
  ARBOL.flatMap((modulo) => modulo.hojas.map((hoja) => [hoja.clave, hoja.acceso] as const)),
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
