import { formatearImporte } from '@kamayuk/formato';
import { coordenada, type Coordenada } from '@kamayuk/ui';
import { describe, expect, it } from 'vitest';

import { ARBOL, hojaDe, type ClaveDeHoja } from '../pantallas/arbol.ts';
import { pantallaDe } from '../pantallas/definiciones/index.ts';
import { lecturasDe } from '../porQueNoHayDato.ts';
import { CONECTORES, instanteEnLima, type Conector, type Reparto } from './conectores.ts';
import {
  AVANCE_MEDIDO,
  CAJAS_MEDIDAS,
  DISTRIBUCION_MEDIDA,
  PAGOS_MEDIDOS,
  RECIBOS_MEDIDOS,
} from './tesoreriaMedida.ts';

/**
 * **Lo que cada pantalla de la ventanilla saca de su respuesta** (#84).
 *
 * Lo que se comprueba no es que el reparto «funcione»: es que **ningun campo se quede sin decidir**.
 * Un campo de solo lectura de una pantalla conectada esta en uno de los dos sitios —con dato, o con
 * la palabra de por que no lo tiene— y **nunca en los dos ni en ninguno**. Un campo olvidado se
 * dibujaria con la palabra de la tabla, que dice otra cosa: seria un hueco mintiendo sobre su causa.
 */

const RESPUESTAS: Readonly<Record<string, unknown>> = {
  'caja-tributaria': CAJAS_MEDIDAS,
  'caja-tasas': CAJAS_MEDIDAS,
  'duplicado-recibo': RECIBOS_MEDIDOS,
  'cierre-caja': PAGOS_MEDIDOS,
  'avance-recaudacion': AVANCE_MEDIDO,
  'recaudacion-area': DISTRIBUCION_MEDIDA,
};

const CONECTADAS = Object.entries(CONECTORES) as [ClaveDeHoja, Conector][];

function repartoDe(clave: ClaveDeHoja): Reparto {
  const conector = CONECTORES[clave];
  if (conector === undefined) throw new Error(`«${clave}» no tiene conector`);
  return conector.repartir(RESPUESTAS[clave] as never);
}

describe('que hoja pide', () => {
  it('EL CENTINELA: hay seis hojas conectadas y una respuesta para cada una', () => {
    expect(CONECTADAS).toHaveLength(6);
    expect(Object.keys(RESPUESTAS).sort()).toEqual(CONECTADAS.map(([c]) => c).sort());
  });

  it('se conecta toda hoja que tiene algo que leer, y ninguna que solo escribe', () => {
    const conLecturas = ARBOL.flatMap((m) => m.hojas)
      .filter((h) => lecturasDe(h).length > 0)
      .map((h) => h.clave)
      .sort();
    expect(CONECTADAS.map(([c]) => c).sort()).toEqual(conLecturas);
    expect(CONECTORES['anulacion-recibo']).toBeUndefined();
  });
});

describe.each(CONECTADAS.map(([clave]) => clave))('«%s» reparte a su definicion', (clave) => {
  const definicion = pantallaDe(clave);
  const reparto = repartoDe(clave);

  it('cada campo de solo lectura tiene dato O su palabra, nunca las dos ni ninguna', () => {
    const decididos = new Set<Coordenada>();
    const problemas: string[] = [];
    definicion.bloques.forEach((bloque, b) => {
      bloque.campos.forEach((campo, c) => {
        if (campo.tipo !== 'r') return;
        const k = coordenada(b, c);
        const conDato = reparto.valores.has(k);
        const sinDato = reparto.sinDato.has(k);
        if (conDato === sinDato) problemas.push(`${k} «${campo.etiqueta}»: ${conDato ? 'en los dos' : 'en ninguno'}`);
        decididos.add(k);
      });
    });
    expect(problemas).toEqual([]);
    const huerfanas = [...reparto.valores.keys(), ...reparto.sinDato.keys()].filter((k) => !decididos.has(k));
    expect(huerfanas, 'el reparto pone valor en una coordenada que no es un campo de solo lectura').toEqual([]);
  });

  it('cada fila tiene tantas celdas como columnas su tabla, y solo hay filas donde hay tabla', () => {
    for (const [b, filas] of reparto.filas) {
      const tabla = definicion.bloques[b]?.tabla;
      expect(tabla, `el bloque ${String(b)} no tiene tabla`).toBeDefined();
      for (const fila of filas) expect(fila).toHaveLength(tabla?.columnas.length ?? -1);
    }
  });

  it('su ruta es una lectura que su hoja declara', () => {
    const conector = CONECTORES[clave];
    const rutas = lecturasDe(hojaDe(clave)).map((o) => o.ruta);
    expect(rutas).toContain(conector?.ruta.split('?')[0]);
  });
});

describe('lo que el reparto decide, con los casos que la captura planta', () => {
  it('un instante en UTC se dice con la fecha y la hora de Lima: las 02:04 del 16 son las 21:04 del 15', () => {
    expect(instanteEnLima('2026-03-16T02:04:00Z')).toBe('15/03/2026 21:04');
    expect(repartoDe('duplicado-recibo').filas.get(0)?.[0]?.[1]).toBe('15/03/2026 21:04');
  });

  it('una pagina que no llega entera dice de cuantas es; una entera no dice nada', () => {
    expect(repartoDe('duplicado-recibo').conteos.get(0)).toBe('2 / 356');
    expect(repartoDe('caja-tributaria').conteos.size).toBe(0);
  });

  it('los nulos del backend se marcan, y no se sustituyen', () => {
    expect(repartoDe('caja-tributaria').filas.get(0)?.[1]).toEqual(['C-02', 'Caja de mercado', '—', 'INACTIVA']);
    expect(repartoDe('recaudacion-area').filas.get(0)?.[1]?.slice(0, 2)).toEqual(['—', '—']);
  });

  it('los totales se leen de la respuesta: no se suman las filas', () => {
    // Un neto que NO es la suma de sus filas, a proposito. El backend garantiza que lo sea; lo que se
    // mide aqui es que la pantalla dice el que llego, y que un reparto que sumara saldria rojo.
    const distinto = { ...DISTRIBUCION_MEDIDA, neto: { importe: '999.99', actualizadoA: '2026-03-15' } };
    const reparto = CONECTORES['recaudacion-area']?.repartir(distinto as never);
    expect(reparto?.valores.get(coordenada(0, 3))).toBe(formatearImporte('999.99'));
    expect(reparto?.valores.get(coordenada(0, 3))).not.toBe(formatearImporte('1962.60'));
  });

  it('en el cierre, el arqueo espera al turno y la conciliacion a la fecha', () => {
    const cierre = repartoDe('cierre-caja');
    expect(cierre.sinDato.get(coordenada(0, 0))).toBe('sin turno');
    expect(cierre.sinDato.get(coordenada(2, 1))).toBe('sin fecha');
    expect(cierre.filas.get(1)).toHaveLength(1);
  });
});
