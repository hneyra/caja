// @vitest-environment node
//
// En `node`: lee un archivo del arbol y compara datos. No toca el DOM.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { compararImportes } from '@kamayuk/formato';
import { describe, expect, it } from 'vitest';

import { LECTURAS, compararConLaFirma, describir, type Derivada, type FormaMedida } from '../desarrollo/medicion.ts';
import { ORIGEN_DE_LA_CAPTURA } from '../src/datos/seguridadMedida.ts';
import {
  AVANCE_MEDIDO,
  CONCILIACION_MEDIDA,
  DISTRIBUCION_MEDIDA,
  DUPLICADO_ANULADO_MEDIDO,
  DUPLICADO_DE_TASA_MEDIDO,
  DUPLICADO_MEDIDO,
  ORIGEN_DE_ESTA_CAPTURA,
  PAGOS_MEDIDOS,
  RECIBOS_MEDIDOS,
} from '../src/datos/tesoreriaMedida.ts';
import { RAIZ } from './raiz.ts';

/**
 * **Las capturas tienen la forma que se midio, y no la que se dedujo** (#89).
 *
 * `camino-a-la-api.test.ts` compara los NOMBRES de los campos con los `.java`, y no ve nada mas: ni
 * el formato de un `Instant`, ni un importe `"0"` sin decimales, ni un nulo que el backend si
 * manda, ni el orden de una lista. Hasta #89 las tres capturas de `src/datos/*Medida.ts` estaban
 * derivadas, y lo derivado no era lo que el backend contesta en siete sitios.
 *
 * La medicion cruda no se versiona —lleva a los pagadores—, y lo que queda de ella es su **firma**:
 * `forma-medida.json`, las clases de valor de cada ruta JSON y los campos de cada objeto, **sin un
 * solo valor**. La escribe `desarrollo/medir-las-capturas.mjs --forma` y dice dentro con que ordenes,
 * cuando, contra que y con que cuenta. Esta guarda la compara con las capturas **en los dos
 * sentidos**:
 *
 *   · todo lo que llego lo ejerce alguna captura —si no, la pantalla nunca se probo con ello—;
 *   · y todo lo que la captura ejerce llego alguna vez, **o esta declarado aqui abajo** con su
 *     porque. Sin esta vuelta, una fila podria volver a escribir el instante sin fraccion y seguir
 *     en verde, porque la otra fila de la misma lista ejerce el medido.
 *
 * Y el ORDEN, que la firma no ve: el de cada lista es el de su `ORDER BY`, y la pantalla lo pinta
 * tal cual llega, sin reordenar.
 */

const FORMA: FormaMedida = JSON.parse(
  readFileSync(join(RAIZ, 'verificaciones', 'forma-medida.json'), 'utf8'),
) as FormaMedida;

/** La unica rama que sigue derivada, y por que no se pudo medir. */
const SIN_RENTAS =
  'la rama en que el sistema de origen CONTESTA a la conciliacion: `rentas` no estaba en la maquina que midio, y un origen de mentira mediria su propia respuesta';

/** Lo que las capturas ejercen sin que ninguna medicion lo trajera, lectura a lectura. */
const DERIVADAS: Readonly<Record<string, readonly Derivada[]>> = {
  conciliacion: [
    { ruta: '$.lineas[].recibidosEnElOrigen', forma: 'numero:entero', porque: SIN_RENTAS },
    { ruta: '$.lineas[].aplicadosEnElOrigen', forma: 'numero:entero', porque: SIN_RENTAS },
    { ruta: '$.lineas[].rechazadosEnElOrigen', forma: 'numero:entero', porque: SIN_RENTAS },
    { ruta: '$.lineas[].importeAplicadoEnElOrigen', forma: 'texto:decimal-2', porque: SIN_RENTAS },
    { ruta: '$.lineas[].diferencia', forma: 'texto:decimal-2', porque: SIN_RENTAS },
    { ruta: '$.lineas[].porQueNoSeSabe', forma: 'nulo', porque: SIN_RENTAS },
  ],
};

describe('la forma medida', () => {
  it('EL CENTINELA: tiene las catorce lecturas, y dice con que ordenes y cuentas se midio', () => {
    expect(Object.keys(FORMA.lecturas).sort()).toEqual(LECTURAS.map((l) => l.clave).sort());
    expect(FORMA.mediciones.length).toBeGreaterThan(0);
    for (const medicion of FORMA.mediciones) {
      expect(medicion.orden).toMatch(/^node desarrollo\/medir-las-capturas\.mjs .*--forma /);
      expect(Number.isNaN(Date.parse(medicion.fecha)), medicion.fecha).toBe(false);
    }
    // La cuenta de medicion, y no solo el administrador: la de medicion es la que `stg` tiene.
    expect(FORMA.mediciones.map((m) => m.cuenta)).toContain('medicion-de-interfaces');
  });

  it('y no lleva un solo valor: ningun importe, documento, fecha ni instante', () => {
    const texto = JSON.stringify(FORMA.lecturas);
    expect(texto).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(texto).not.toMatch(/"\d+(\.\d+)?"/);
  });
});

describe.each(LECTURAS.map((l) => [l.clave, l] as const))('«%s»: la captura es la medida', (clave, lectura) => {
  it('ejerce todo lo medido, y lo que ejerce sin medir esta declarado', () => {
    const medida = FORMA.lecturas[clave];
    expect(medida, `«${clave}» no se midio`).toBeDefined();
    if (medida === undefined) return;
    expect(compararConLaFirma(medida, lectura.capturas, DERIVADAS[clave] ?? []).map(describir)).toEqual([]);
  });
});

describe('el orden de las listas es el del backend', () => {
  it('los recibos, por `fecha` ascendente (`ReciboController.ORDEN_POR_OMISION`)', () => {
    const instantes = RECIBOS_MEDIDOS.contenido.map((r) => Date.parse(r.emitidoEn));
    expect(instantes).toEqual([...instantes].sort((a, b) => a - b));
  });

  it('el avance y la distribucion, por `cobrado` descendente y luego por tributo', () => {
    for (const filas of [AVANCE_MEDIDO.filas, DISTRIBUCION_MEDIDA.filas]) {
      const ordenadas = [...filas].sort(
        (a, b) => compararImportes(b.cobrado.importe, a.cobrado.importe) || a.tributo.localeCompare(b.tributo),
      );
      expect(filas.map((f) => f.tributo)).toEqual(ordenadas.map((f) => f.tributo));
    }
  });

  it('la conciliacion, por sistema (`ORDER BY e.sistema_destino`)', () => {
    const sistemas = CONCILIACION_MEDIDA.lineas.map((l) => l.sistema);
    expect(sistemas).toEqual([...sistemas].sort());
  });
});

describe('lo que la ruta da, y nada mas', () => {
  it('`/pagos/sin-entregar` solo da pagos MUERTOS, y sin entregar ni explicar', () => {
    // `BuzonDeSalidaJdbc.muertos()`: `WHERE estado = 'MUERTO'`. La captura derivada ensenaba uno
    // `PENDIENTE`, que esta ruta no devuelve nunca.
    for (const pago of PAGOS_MEDIDOS) {
      expect(pago.estado).toBe('MUERTO');
      expect(pago.entregadoEn).toBeNull();
      expect(pago.explicacion).toBeNull();
    }
  });

  it('el numero de un recibo es su serie y siete digitos, y cuadra con su correlativo', () => {
    // Medido: `001-0000001`. La derivada escribia seis digitos, y el recibo que una prueba elegia
    // por su numero era uno que el backend no puede emitir.
    for (const recibo of RECIBOS_MEDIDOS.contenido) expect(recibo.numero).toMatch(/^\d{3}-\d{7}$/);
    for (const { recibo } of [DUPLICADO_MEDIDO, DUPLICADO_ANULADO_MEDIDO, DUPLICADO_DE_TASA_MEDIDO]) {
      expect(recibo.numero).toBe(`${recibo.serie}-${String(recibo.correlativo).padStart(7, '0')}`);
    }
  });
});

describe('el origen de las capturas lo dice', () => {
  it.each([
    ['seguridadMedida.ts', ORIGEN_DE_LA_CAPTURA],
    ['tesoreriaMedida.ts', ORIGEN_DE_ESTA_CAPTURA],
  ])('«%s»: medida con curl, con fecha y commits, y con la marca que busca el Dockerfile', (_archivo, origen) => {
    expect(origen.startsWith('captura-medida-de-caja: ')).toBe(true);
    expect(origen).toContain('curl -sS');
    expect(origen).toMatch(/el \d{4}-\d{2}-\d{2} /);
    expect(origen).toMatch(/caja@[0-9a-f]{7}/);
    expect(origen).toContain('medicion-de-interfaces');
    expect(origen).not.toMatch(/pendiente de medir|derivada de/);
  });
});
