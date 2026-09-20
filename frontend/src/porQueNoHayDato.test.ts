import { describe, expect, it } from 'vitest';

import { ARBOL, CLAVES_DE_HOJA, hojaDe } from './pantallas/arbol.ts';
import { SIN_PEDIR, SOLO_ESCRIBE, lecturasDe, porQueNoHayDato } from './porQueNoHayDato.ts';

/**
 * **Por que una hoja de la ventanilla no tiene datos** (#74).
 *
 * Lo que se comprueba no es que las frases suenen bien: es que los dos casos no se confundan. «Esta
 * hoja todavia no pide» y «esta hoja solo escribe» se arreglan en sitios distintos —un conector, o
 * una decision que ADR-0040 no tomo—, y una frase unica mandaria a buscar un conector que no falta.
 */
describe('los dos casos, y a que hojas les toca cada uno', () => {
  it('EL CENTINELA: hay siete hojas y un modulo', () => {
    expect(ARBOL).toHaveLength(1);
    expect(CLAVES_DE_HOJA).toHaveLength(7);
  });

  it('la anulacion SOLO escribe: dice que no hay nada que leer, no que falta conectarla', () => {
    expect(lecturasDe(hojaDe('anulacion-recibo'))).toEqual([]);
    expect(porQueNoHayDato(hojaDe('anulacion-recibo'))).toBe(SOLO_ESCRIBE);
  });

  it('las otras seis tienen lecturas: sin su conector dirian que no las piden (hoy lo tienen, #84)', () => {
    const conLecturas = CLAVES_DE_HOJA.filter((clave) => clave !== 'anulacion-recibo');
    expect(conLecturas).toHaveLength(6);
    for (const clave of conLecturas) {
      expect(porQueNoHayDato(hojaDe(clave)), clave).toBe(SIN_PEDIR);
    }
  });

  it('una escritura no cuenta como lectura: el cierre declara dos POST y sigue leyendo sus GET', () => {
    expect(lecturasDe(hojaDe('cierre-caja')).map((o) => o.ruta)).toEqual([
      // `/turnos/del-dia` es la que #97 anadio: de ella sale el `turnoId` de la siguiente.
      '/turnos/del-dia',
      '/turnos/{turnoId}/cierre',
      '/pagos/sin-entregar',
      '/conciliacion',
    ]);
  });

  it('y ninguna de las dos frases promete una cifra: las dos lo dicen', () => {
    for (const ausencia of [SIN_PEDIR, SOLO_ESCRIBE]) {
      expect(ausencia.explicacion.length).toBeGreaterThan(40);
      expect(ausencia.enElCampo).not.toMatch(/\d/);
    }
  });
});
