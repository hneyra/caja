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
 *   · **La hoja lee de operaciones servidas y todavia no las pide.** Es cuestion de conectarla.
 *     Desde #84 las seis que leen tienen conector (`datos/conectores.ts`), asi que este caso solo
 *     lo alcanzaria una hoja nueva que llegara sin el: se queda para que esa hoja lo diga.
 *   · **La hoja solo escribe.** Ninguna lectura que pedir. Decir aqui «sin conectar» haria creer
 *     que falta un conector, y no falta: no hay nada que pedir.
 *
 * <h2>Hoy NINGUNA hoja cae en el segundo, y se queda escrito (#100)</h2>
 *
 * Lo cumplia `anulacion-recibo`, y **dejo de ser una hoja**: ADR-0044 movio anular a una accion de
 * `duplicado-recibo`, donde el recibo ya esta elegido. Las seis que quedan leen.
 *
 * El caso no se retira por eso. Retirarlo dejaria a la hoja siguiente que solo escriba diciendo
 * «esta pantalla todavia no pide», que manda a buscar un conector que no falta — y ese es
 * exactamente el error que esta funcion existe para no cometer. Lo ejerce su prueba, con una hoja
 * de mentira: lo que aqui se decide es una regla sobre hojas, no sobre las seis de hoy.
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
    'Esta pantalla no tiene nada que leer: lo único que hace es registrar. No le falta ningún ' +
    'conector, así que no hay nada que esperar aquí.',
  tono: 'info',
};

/** Que decir en una pantalla que no tiene dato. */
export function porQueNoHayDato(hoja: Hoja): Ausencia {
  return lecturasDe(hoja).length > 0 ? SIN_PEDIR : SOLO_ESCRIBE;
}

export { SIN_PEDIR, SOLO_ESCRIBE };
