import { formatearFecha, formatearImporte } from '@kamayuk/formato';
import { coordenada, type Coordenada } from '@kamayuk/ui';
import { describe, expect, it } from 'vitest';

import { ErrorDeLaApi } from '../api/cliente.ts';
import { ARBOL, hojaDe, type ClaveDeHoja } from '../pantallas/arbol.ts';
import { pantallaDe } from '../pantallas/definiciones/index.ts';
import {
  NUMERO_DE_LA_FILA,
  TABLA_DE_LINEAS,
  TABLA_DE_RECIBOS,
} from '../pantallas/definiciones/tesoreria.ts';
import { lecturasDe } from '../porQueNoHayDato.ts';
import { CONECTORES, instanteEnLima, type Conector, type Reparto } from './conectores.ts';
import { rutaDelDuplicado } from './lecturas.ts';
import {
  AVANCE_MEDIDO,
  CAJAS_MEDIDAS,
  CIERRE_MEDIDO,
  DISTRIBUCION_MEDIDA,
  DUPLICADO_MEDIDO,
  PAGOS_MEDIDOS,
  RECIBOS_MEDIDOS,
  TURNO_MEDIDO,
  TURNO_SIN_ABRIR_MEDIDO,
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
  'cierre-caja': { turno: TURNO_MEDIDO, cierre: CIERRE_MEDIDO, pagos: PAGOS_MEDIDOS },
  'avance-recaudacion': AVANCE_MEDIDO,
  'recaudacion-area': DISTRIBUCION_MEDIDA,
};

const CONECTADAS = Object.entries(CONECTORES) as [ClaveDeHoja, Conector][];

/** Los dos repartos de una hoja en uno, como los une el gancho. */
function unir(uno: Reparto, otro: Reparto): Reparto {
  return {
    valores: new Map([...uno.valores, ...otro.valores]),
    filas: new Map([...uno.filas, ...otro.filas]),
    tablas: new Map([...uno.tablas, ...otro.tablas]),
    conteos: new Map([...uno.conteos, ...otro.conteos]),
    sinDato: new Map([...uno.sinDato, ...otro.sinDato]),
  };
}

/**
 * Lo que la pantalla tiene **con su primera lectura contestada y sin elegir nada**.
 *
 * Es el estado en que se abre una hoja, y el que el recorrido de abajo mide: ningun campo sin
 * decidir, ninguna fila con celdas de mas. La segunda lectura entra por su paso `sin-elegir`, que
 * es lo que pone la palabra en los huecos que ella llenaria.
 */
function repartoDe(clave: ClaveDeHoja, elegido: string | null = null): Reparto {
  const conector = CONECTORES[clave];
  if (conector === undefined) throw new Error(`«${clave}» no tiene conector`);
  const base = conector.repartir(RESPUESTAS[clave] as never, elegido);
  const deLoElegido = conector.deLoElegido;
  return deLoElegido === undefined ? base : unir(base, deLoElegido.repartir({ paso: 'sin-elegir' }).reparto);
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

  it('y lo mismo las tablas con nombre: el nombre es el de una tabla de esta pantalla', () => {
    const porClave = new Map(
      definicion.bloques.flatMap((bloque) =>
        bloque.tabla?.clave === undefined ? [] : [[bloque.tabla.clave, bloque.tabla] as const],
      ),
    );
    for (const [nombre, datos] of reparto.tablas) {
      const tabla = porClave.get(nombre);
      expect(tabla, `ninguna tabla de «${clave}» se llama «${nombre}»`).toBeDefined();
      for (const fila of datos.filas) expect(fila.celdas).toHaveLength(tabla?.columnas.length ?? -1);
    }
  });

  it('cada una de las rutas de su primera lectura es una que su hoja declara', () => {
    const conector = CONECTORES[clave];
    const declaradas = lecturasDe(hojaDe(clave)).map((o) => o.ruta);
    const pedidas = (conector?.rutas ?? []).map((r) => r.split('?')[0]);
    expect(pedidas.length).toBeGreaterThan(0);
    for (const ruta of pedidas) expect(declaradas).toContain(ruta);
  });

  it('y la de lo elegido, si la tiene, tambien', () => {
    const deLoElegido = CONECTORES[clave]?.deLoElegido;
    if (deLoElegido === undefined) return;
    const rutas = lecturasDe(hojaDe(clave)).map((o) => o.ruta);
    expect(rutas).toContain(deLoElegido.ruta);
  });
});

describe('lo que el reparto decide, con los casos que la captura planta', () => {
  it('un instante en UTC se dice con la fecha y la hora de Lima: las 02:04 del 16 son las 21:04 del 15', () => {
    expect(instanteEnLima('2026-03-16T02:04:00Z')).toBe('15/03/2026 21:04');
    expect(repartoDe('duplicado-recibo').tablas.get(TABLA_DE_RECIBOS)?.filas[0]?.celdas[1]).toBe('15/03/2026 21:04');
  });

  it('una pagina que no llega entera dice de cuantas es; una entera no dice nada', () => {
    expect(repartoDe('duplicado-recibo').tablas.get(TABLA_DE_RECIBOS)?.conteo).toBe('2 / 356');
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

  it('en el cierre, el arqueo ya no espera al turno; la conciliacion sigue esperando la fecha', () => {
    const cierre = repartoDe('cierre-caja');
    expect(cierre.valores.get(coordenada(0, 2)), 'recibos emitidos').toBe('12');
    expect(cierre.valores.get(coordenada(0, 6)), 'neto').toBe(formatearImporte('1842.60'));
    expect(cierre.valores.get(coordenada(0, 1)), 'puede cerrarse').toBe('no');
    expect(cierre.sinDato.get(coordenada(2, 1))).toBe('sin fecha');
    expect(cierre.filas.get(0), 'una fila por forma de pago').toHaveLength(2);
    expect(cierre.filas.get(1), 'y los pagos que impiden cerrar').toHaveLength(1);
  });
});

/**
 * **El turno de la ventanilla y su arqueo** (#97).
 *
 * Las cuatro situaciones que `GET /turnos/del-dia` distingue, medidas sobre el reparto. Lo que se
 * comprueba no es que «funcione»: es que **ninguna de las tres sin arqueo diga lo mismo que otra**,
 * porque se arreglan en sitios distintos, y que lo que nadie conto **no se pinte como un cero**.
 */
describe('«cierre-caja»: el turno del dia, y lo que nadie ha contado', () => {
  const conSituacion = (situacion: string) =>
    CONECTORES['cierre-caja']?.repartir({
      turno: { ...TURNO_SIN_ABRIR_MEDIDO, situacion },
      cierre: null,
      pagos: PAGOS_MEDIDOS,
    } as never);

  it('lo que nadie conto se dice «sin declarar», en los tres campos y en las dos columnas', () => {
    const cierre = repartoDe('cierre-caja');
    for (const campo of [7, 8, 9]) {
      expect(cierre.sinDato.get(coordenada(0, campo)), `campo ${String(campo)}`).toBe('sin declarar');
    }
    // Un cero aqui seria «conte el cajon y no habia nada», que descuadra el turno entero.
    expect(cierre.filas.get(0)?.[0]?.slice(4)).toEqual(['sin declarar', 'sin declarar']);
    expect([...cierre.valores.values()]).not.toContain(formatearImporte('0.00'));
  });

  it('sin turno abierto no hay arqueo, y los diez campos dicen por que no lo hay', () => {
    const reparto = conSituacion('SIN_ABRIR');
    expect(reparto?.valores.size, 'no se finge ni una cifra').toBe(0);
    expect(reparto?.sinDato.get(coordenada(0, 0))).toBe('sin turno');
    expect(reparto?.ausencia?.explicacion).toContain('no tiene turno abierto hoy');
    expect(reparto?.filas.get(1), 'los pagos sin entregar se leen igual').toHaveLength(1);
  });

  it('«ya cerro» y «tiene dos ventanillas» no dicen lo mismo que «no abrio»', () => {
    expect(conSituacion('CERRADO')?.sinDato.get(coordenada(0, 0))).toBe('turno cerrado');
    expect(conSituacion('CERRADO')?.ausencia?.explicacion).toContain('reversar');
    expect(conSituacion('VARIOS_ABIERTOS')?.sinDato.get(coordenada(0, 0))).toBe('varias cajas');
    expect(conSituacion('VARIOS_ABIERTOS')?.ausencia?.explicacion).toContain('más de una ventanilla');
  });
});

/**
 * **El recibo elegido** (#99).
 *
 * Los tres estados de la segunda lectura, medidos sobre el reparto: sin elegir, con el duplicado
 * que contesta el backend, y con un numero que no existe.
 */
describe('«duplicado-recibo»: elegir una fila y lo que su detalle llena', () => {
  const deLoElegido = CONECTORES['duplicado-recibo']?.deLoElegido;

  it('EL CENTINELA: la hoja declara su segunda lectura, en la ruta y con el sujeto', () => {
    expect(deLoElegido?.enLaRuta).toBe('sujeto');
    expect(deLoElegido?.ruta).toBe('/recibos/{nro}/duplicado');
    // Sin `?formato=`: esa exige IMPRESION y registra la reimpresion (ADR-0040).
    expect(rutaDelDuplicado('001-000123')).toBe('/recibos/001-000123/duplicado');
    // La clave de TanStack lleva el numero dentro: dos recibos no comparten cache.
    expect(deLoElegido?.clave('001-000123')).not.toEqual(deLoElegido?.clave('001-000124'));
  });

  it('sin elegir nada, los ocho campos del bloque dicen «sin elegir» y no hay lineas', () => {
    const reparto = repartoDe('duplicado-recibo');
    for (let campo = 0; campo < 8; campo += 1) {
      expect(reparto.sinDato.get(coordenada(1, campo)), `el campo ${String(campo)}`).toBe('sin elegir');
    }
    expect(reparto.valores.size).toBe(0);
    expect(reparto.tablas.has(TABLA_DE_LINEAS)).toBe(false);
  });

  it('elegida una fila, es la unica realzada y la lista NO cambia de ninguna otra forma', () => {
    const sinElegir = repartoDe('duplicado-recibo');
    const conElegido = repartoDe('duplicado-recibo', '001-000124');
    const realzadas = conElegido.tablas.get(TABLA_DE_RECIBOS)?.filas.filter((f) => f.realzada === true);
    expect(realzadas?.map((f) => f.clave)).toEqual(['001-000124']);
    expect(sinElegir.tablas.get(TABLA_DE_RECIBOS)?.filas.some((f) => f.realzada === true)).toBe(false);
    // Y las celdas son las mismas: realzar no reescribe ni una.
    expect(conElegido.tablas.get(TABLA_DE_RECIBOS)?.filas.map((f) => f.celdas)).toEqual(
      sinElegir.tablas.get(TABLA_DE_RECIBOS)?.filas.map((f) => f.celdas),
    );
  });

  it('cada fila lleva el numero con que su boton pide el duplicado', () => {
    const filas = repartoDe('duplicado-recibo').tablas.get(TABLA_DE_RECIBOS)?.filas ?? [];
    expect(filas.map((f) => f.datos?.get(NUMERO_DE_LA_FILA))).toEqual(['001-000123', '001-000124']);
  });

  it('con el duplicado contestado, los ocho campos se llenan y ninguno se queda con la palabra', () => {
    const aporte = deLoElegido?.repartir({ paso: 'dato', respuesta: DUPLICADO_MEDIDO as never });
    const valores = aporte?.reparto.valores;

    expect(valores?.get(coordenada(1, 0))).toBe('001-000123');
    expect(valores?.get(coordenada(1, 1))).toBe('EMITIDO');
    expect(valores?.get(coordenada(1, 2))).toBe('Cajero de la prueba');
    expect(valores?.get(coordenada(1, 3))).toBe('EFECTIVO');
    expect(valores?.get(coordenada(1, 4))).toBe('15/03/2026 21:04');
    expect(valores?.get(coordenada(1, 5))).toBe('1');
    expect(valores?.get(coordenada(1, 6))).toBe(formatearImporte('1842.60'));
    expect(valores?.get(coordenada(1, 7))).toBe(formatearFecha('2026-03-15'));
    expect(aporte?.reparto.sinDato.size).toBe(0);
    expect(aporte?.ausencia.explicacion).toBe('');
  });

  it('el total es el que llego, y no la suma de las lineas', () => {
    // Un total que NO cuadra con sus lineas, a proposito: el backend garantiza que cuadre, y lo que
    // se mide aqui es que la pantalla dice el que llego. Un reparto que sumara saldria rojo.
    const distinto = {
      ...DUPLICADO_MEDIDO,
      recibo: { ...DUPLICADO_MEDIDO.recibo, total: { importe: '999.99', actualizadoA: '2026-03-15' } },
    };
    const valores = deLoElegido?.repartir({ paso: 'dato', respuesta: distinto as never }).reparto.valores;
    expect(valores?.get(coordenada(1, 6))).toBe(formatearImporte('999.99'));
  });

  it('las lineas se pintan, y los nulos de una que no es tasa se marcan en vez de valer cero', () => {
    const lineas = deLoElegido?.repartir({ paso: 'dato', respuesta: DUPLICADO_MEDIDO as never }).reparto.tablas.get(
      TABLA_DE_LINEAS,
    );
    expect(lineas?.filas).toHaveLength(2);
    expect(lineas?.filas[0]?.celdas).toEqual([
      'TASA-MER-01 · TASA',
      '3',
      formatearImporte('40.00'),
      formatearImporte('120.00'),
    ]);
    expect(lineas?.filas[1]?.celdas).toEqual([
      'TRIB-01 · PAGO',
      '—',
      '—',
      formatearImporte('1722.60'),
    ]);
  });

  it('un numero que no existe lo dice, y no es el mismo mensaje que un fallo cualquiera', () => {
    const cuatroCeroCuatro = deLoElegido?.repartir({
      paso: 'fallo',
      error: new ErrorDeLaApi(404, 'GET /recibos/001-999999/duplicado'),
    });
    const otro = deLoElegido?.repartir({ paso: 'fallo', error: new Error('red') });

    expect(cuatroCeroCuatro?.ausencia.enElCampo).toBe('no está');
    expect(cuatroCeroCuatro?.ausencia.tono).toBe('atencion');
    expect(otro?.ausencia.enElCampo).toBe('fallo');
    expect(cuatroCeroCuatro?.ausencia.explicacion).not.toBe(otro?.ausencia.explicacion);
    // Y ninguno de los dos toca la lista: lo unico que traen son los ocho huecos del bloque.
    expect(cuatroCeroCuatro?.reparto.tablas.size).toBe(0);
    expect(cuatroCeroCuatro?.reparto.sinDato.size).toBe(8);
  });
});
