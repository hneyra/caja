import type { Ausencia } from '@kamayuk/ui';

import type { Hoja, Operacion } from './pantallas/tipos.ts';

/**
 * **Por que una pantalla de la ventanilla no tiene datos**, dicho con las palabras de cada caso (#74).
 *
 * <h2>Por que vive aqui y no en el interprete</h2>
 *
 * Porque cruza cosas de ESTE sistema —las operaciones que declara cada hoja— y el interprete es de
 * `@kamayuk/ui`: recibe el resultado ya redactado, que es lo que `rentas` hizo con el suyo.
 *
 * <h2>Los dos casos NO son uno</h2>
 *
 * El arbol de `caja` sale de sus controladores, asi que aqui no existen los casos de `rentas` —la
 * operacion que el backend no sirve, el verbo `BASE` sin verificar—: toda operacion declarada
 * existe, y lo vigila `el-arbol-cuadra-con-el-backend`. Quedan dos, y se dicen distinto porque se
 * arreglan en sitios distintos:
 *
 *   · **La hoja lee de operaciones servidas y todavia no las pide.** Es cuestion de conectarla
 *     (#74, fila C2).
 *   · **La hoja solo escribe.** Ninguna lectura que pedir, y esta interfaz no escribe todavia
 *     (ADR-0040). Decir aqui «sin conectar» haria creer que falta un conector, y no falta: falta
 *     una decision.
 */

/** Las operaciones de una hoja con las que se puede dibujar algo. */
export function lecturasDe(hoja: Hoja): readonly Operacion[] {
  return hoja.operaciones.filter((o) => o.verbo === 'GET');
}

const SIN_PEDIR: Ausencia = {
  enElCampo: 'sin pedir',
  explicacion:
    'Esta pantalla lee de operaciones que el sistema de caja ya sirve, y todavía no las pide. Lo que ' +
    'se ve es su forma —qué campos tiene y qué columnas llevan sus listas—, no sus datos: en una ' +
    'ventanilla, una cifra de ejemplo se lee como real.',
  tono: 'info',
};

const SOLO_ESCRIBE: Ausencia = {
  enElCampo: 'sin lectura',
  explicacion:
    'Esta pantalla no tiene nada que leer: lo único que hace es registrar, y la ventanilla se conectó ' +
    'para leer. Registrar desde aquí llega con su propia decisión (ADR-0040).',
  tono: 'info',
};

/** Que decir en una pantalla que no tiene dato. */
export function porQueNoHayDato(hoja: Hoja): Ausencia {
  return lecturasDe(hoja).length > 0 ? SIN_PEDIR : SOLO_ESCRIBE;
}

export { SIN_PEDIR, SOLO_ESCRIBE };
