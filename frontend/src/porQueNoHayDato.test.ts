import { describe, expect, it } from 'vitest';

import { ARBOL, CLAVES_DE_HOJA, hojaDe } from './pantallas/arbol.ts';
import type { Hoja } from './pantallas/tipos.ts';
import { SIN_PEDIR, SOLO_ESCRIBE, lecturasDe, porQueNoHayDato } from './porQueNoHayDato.ts';

/**
 * **Por que una hoja de la ventanilla no tiene datos** (#74, #100).
 *
 * Lo que se comprueba no es que las frases suenen bien: es que los dos casos no se confundan. «Esta
 * hoja todavia no pide» y «esta hoja no tiene nada que leer» se arreglan en sitios distintos —un
 * conector, o nada—, y una frase unica mandaria a buscar un conector que no falta.
 *
 * <h2>El segundo caso ya no lo cumple ninguna hoja, y por eso hay una de mentira</h2>
 *
 * Lo cumplia `anulacion-recibo`, que dejo de ser una hoja en #100: anular es ahora una accion de
 * `duplicado-recibo` (ADR-0044). Con la hoja retirada, la unica forma de seguir ejerciendo esa rama
 * es plantarle una hoja que solo escriba — y hacerlo ademas dice algo cierto: lo que
 * `porQueNoHayDato` decide es una regla sobre hojas, no sobre las seis que hay hoy.
 */

/** Una hoja que solo escribe, como la que #100 retiro. No esta en el arbol: no tiene por que. */
const SOLO_ESCRIBIRIA: Hoja = {
  clave: 'hoja-de-mentira',
  rotulo: 'Una hoja que solo escribiria',
  acceso: 'acceso_de_mentira',
  operaciones: [{ verbo: 'POST', ruta: '/cobros', controlador: 'CajaController' }],
};

describe('los dos casos, y a que hojas les toca cada uno', () => {
  it('EL CENTINELA: hay seis hojas y un modulo', () => {
    expect(ARBOL).toHaveLength(1);
    expect(CLAVES_DE_HOJA).toHaveLength(6);
  });

  it('una hoja que SOLO escribe dice que no hay nada que leer, no que falta conectarla', () => {
    expect(lecturasDe(SOLO_ESCRIBIRIA)).toEqual([]);
    expect(porQueNoHayDato(SOLO_ESCRIBIRIA)).toBe(SOLO_ESCRIBE);
  });

  it('y ninguna hoja del arbol cae ya en ese caso: las seis leen (#100)', () => {
    const mudas = CLAVES_DE_HOJA.filter((clave) => lecturasDe(hojaDe(clave)).length === 0);
    expect(mudas, 'una hoja sin ninguna lectura no lleva a ninguna parte: eso es lo que cerro #100').toEqual([]);
  });

  it('las seis tienen lecturas: sin su conector dirian que no las piden (hoy lo tienen, #84)', () => {
    for (const clave of CLAVES_DE_HOJA) {
      expect(porQueNoHayDato(hojaDe(clave)), clave).toBe(SIN_PEDIR);
    }
  });

  /**
   * La escritura de una hoja no cuenta como lectura, **y la de una ACCION suya tampoco** (#100).
   *
   * `duplicado-recibo` sirve dos accesos desde ADR-0044, y el segundo lo sirve con un `POST`. Si
   * `lecturasDe` mirase tambien las acciones, esa hoja diria lo mismo por casualidad —ya tiene dos
   * `GET`—, y la que se rompiera seria la siguiente.
   */
  it('una escritura no cuenta como lectura: ni la de la hoja ni la de su accion', () => {
    expect(lecturasDe(hojaDe('cierre-caja')).map((o) => o.ruta)).toEqual([
      // `/turnos/del-dia` es la que #97 anadio: de ella sale el `turnoId` de la siguiente.
      '/turnos/del-dia',
      '/turnos/{turnoId}/cierre',
      '/pagos/sin-entregar',
      '/conciliacion',
    ]);
    expect(lecturasDe(hojaDe('duplicado-recibo')).map((o) => o.ruta)).toEqual([
      '/recibos',
      '/recibos/{nro}/duplicado',
    ]);
  });

  it('y ninguna de las dos frases promete una cifra: las dos lo dicen', () => {
    for (const ausencia of [SIN_PEDIR, SOLO_ESCRIBE]) {
      expect(ausencia.explicacion.length).toBeGreaterThan(40);
      expect(ausencia.enElCampo).not.toMatch(/\d/);
    }
  });
});
