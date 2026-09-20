import { coordenada } from '@kamayuk/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TABLA_DE_LINEAS, TABLA_DE_RECIBOS } from '../pantallas/definiciones/tesoreria.ts';
import {
  CIERRE_MEDIDO,
  DUPLICADO_MEDIDO,
  PAGOS_MEDIDOS,
  RECIBOS_MEDIDOS,
  TURNO_MEDIDO,
  TURNO_SIN_ABRIR_MEDIDO,
} from './tesoreriaMedida.ts';
import { useDatosDeLaHoja } from './useDatosDeLaHoja.ts';

/**
 * **Los estados de una hoja de la ventanilla que pide** (#84).
 *
 * Con `fetch` sustituido y no con un doble del gancho, como en `rentas`: lo que puede fallar es como
 * se traduce **una respuesta de verdad** —o su ausencia— a lo que la pantalla ensena.
 */

function arnes() {
  // Un cliente por prueba: compartido, la respuesta de una se quedaria en la cache de la siguiente.
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { readonly children: ReactNode }) => (
    <QueryClientProvider client={cliente}>{children}</QueryClientProvider>
  );
}

const JSON_ = { 'content-type': 'application/json' };

/** Sustituye `fetch` por una respuesta fija, y devuelve el doble para mirar que se pidio. */
function contesta(cuerpo: unknown, estado = 200) {
  const doble = vi.fn<typeof fetch>(() =>
    Promise.resolve(new Response(JSON.stringify(cuerpo), { status: estado, headers: JSON_ })),
  );
  vi.stubGlobal('fetch', doble);
  return doble;
}

/**
 * Lo mismo, pero contestando distinto por ruta.
 *
 * Lo pide `cierre-caja` desde #97: es la unica hoja que **encadena dentro de su primera lectura**
 * —su turno, y despues el arqueo del turno que ese acaba de nombrar—, y una respuesta unica para
 * las tres la dejaria midiendo cualquier cosa menos el encadenado.
 */
function contestaPorRuta(porFinal: Readonly<Record<string, unknown>>) {
  const doble = vi.fn<typeof fetch>((url) => {
    const camino = String(url);
    const clave = Object.keys(porFinal).find((final) => camino.endsWith(final));
    if (clave === undefined) return Promise.resolve(new Response('{}', { status: 404, headers: JSON_ }));
    return Promise.resolve(new Response(JSON.stringify(porFinal[clave]), { status: 200, headers: JSON_ }));
  });
  vi.stubGlobal('fetch', doble);
  return doble;
}

/** Lo que contesta la ventanilla de un cajero con un turno abierto y su arqueo. */
const EL_CIERRE_ENTERO = {
  '/turnos/del-dia': TURNO_MEDIDO,
  '/turnos/7/cierre': CIERRE_MEDIDO,
  '/pagos/sin-entregar': PAGOS_MEDIDOS,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('una hoja SIN conector no toca la red', () => {
  it('`anulacion-recibo` solo escribe: no pide nada y dice que no tiene nada que leer', () => {
    const pedir = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', pedir);

    const { result } = renderHook(() => useDatosDeLaHoja('anulacion-recibo'), { wrapper: arnes() });

    expect(pedir).not.toHaveBeenCalled();
    expect(result.current.ausencia.enElCampo).toBe('sin lectura');
  });
});

describe('una hoja CON conector recorre sus estados', () => {
  it('primero dice que esta pidiendo', () => {
    contestaPorRuta(EL_CIERRE_ENTERO);
    const { result } = renderHook(() => useDatosDeLaHoja('cierre-caja'), { wrapper: arnes() });
    expect(result.current.ausencia.enElCampo).toBe('pidiendo…');
  });

  it('pide sus rutas y solo esas, bajo `/caja/api/v1`, con el arqueo DESPUES del turno', async () => {
    const doble = contestaPorRuta(EL_CIERRE_ENTERO);
    const { result } = renderHook(() => useDatosDeLaHoja('cierre-caja'), { wrapper: arnes() });
    await waitFor(() => {
      expect(result.current.filas?.get(1)).toHaveLength(1);
    });
    const pedidas = doble.mock.calls.map(([url]) => String(url));
    expect(pedidas.slice(0, 2).sort()).toEqual(['/caja/api/v1/pagos/sin-entregar', '/caja/api/v1/turnos/del-dia']);
    // El `7` no esta escrito en ningun sitio de `src/`: sale del turno que acaba de llegar.
    expect(pedidas[2]).toBe('/caja/api/v1/turnos/7/cierre');
    expect(pedidas).toHaveLength(3);
  });

  it('cuando llega, reparte lo que trae y dice con su palabra lo que falta', async () => {
    contestaPorRuta(EL_CIERRE_ENTERO);
    const { result } = renderHook(() => useDatosDeLaHoja('cierre-caja'), { wrapper: arnes() });

    await waitFor(() => {
      expect(result.current.filas?.get(1)).toHaveLength(1);
    });
    expect(result.current.valores?.get(coordenada(0, 2)), 'recibos emitidos').toBe('12');
    expect(result.current.ausenciaPorCampo?.get(coordenada(0, 9)), 'cuadra').toBe('sin declarar');
    expect(result.current.ausencia.tono).toBe('info');
    expect(result.current.ausencia.explicacion).toMatch(/turno abierto/);
  });

  it('sin turno abierto no se pide el arqueo, y la frase dice por que no lo hay', async () => {
    const doble = contestaPorRuta({
      '/turnos/del-dia': TURNO_SIN_ABRIR_MEDIDO,
      '/pagos/sin-entregar': PAGOS_MEDIDOS,
    });
    const { result } = renderHook(() => useDatosDeLaHoja('cierre-caja'), { wrapper: arnes() });

    await waitFor(() => {
      expect(result.current.filas?.get(1)).toHaveLength(1);
    });
    expect(doble.mock.calls.map(([url]) => String(url))).not.toContain('/caja/api/v1/turnos/7/cierre');
    expect(result.current.ausenciaPorCampo?.get(coordenada(0, 0))).toBe('sin turno');
    expect(result.current.ausencia.explicacion).toMatch(/no tiene turno abierto hoy/);
  });

  it('una lista vacia es una respuesta: filas vacias, no una ausencia', async () => {
    contestaPorRuta({ ...EL_CIERRE_ENTERO, '/pagos/sin-entregar': [] });
    const { result } = renderHook(() => useDatosDeLaHoja('cierre-caja'), { wrapper: arnes() });
    await waitFor(() => {
      expect(result.current.filas?.get(1)).toEqual([]);
    });
  });

  it('un 401 dice que se vuelva a entrar, y un 403 que falta el permiso', async () => {
    contesta({ status: 401 }, 401);
    const con401 = renderHook(() => useDatosDeLaHoja('avance-recaudacion'), { wrapper: arnes() });
    await waitFor(() => {
      expect(con401.result.current.ausencia.enElCampo).toBe('sin acceso');
    });
    expect(con401.result.current.ausencia.explicacion).toMatch(/Vuelva a entrar/);

    contesta({ status: 403 }, 403);
    const con403 = renderHook(() => useDatosDeLaHoja('recaudacion-area'), { wrapper: arnes() });
    await waitFor(() => {
      expect(con403.result.current.ausencia.enElCampo).toBe('sin acceso');
    });
    expect(con403.result.current.ausencia.explicacion).toMatch(/permiso/);
  });

  it('y otro error dice que fallo, sin fingir datos', async () => {
    contesta({ status: 500 }, 500);
    const { result } = renderHook(() => useDatosDeLaHoja('caja-tasas'), { wrapper: arnes() });
    await waitFor(() => {
      expect(result.current.ausencia.enElCampo).toBe('fallo');
    });
    expect(result.current.filas).toBeUndefined();
  });
});

/**
 * **El recibo elegido viaja en la ruta, y la segunda lectura lo lee de ahi** (#99).
 *
 * Con `fetch` sustituido, como el resto: lo que se mide es que **de la ruta sale una peticion** y
 * que lo que conteste llena el segundo bloque. La ruta se pasa a mano —es lo que el marco daria—
 * porque este gancho se prueba sin montar el armazon.
 */
describe('«duplicado-recibo»: lo elegido sale de la ruta', () => {
  /** Contesta la lista o el duplicado segun lo que se pida, y apunta las rutas pedidas. */
  function contestaLosDos(duplicado: unknown, estadoDelDuplicado = 200) {
    const pedidas: string[] = [];
    const doble = vi.fn<typeof fetch>((entrada) => {
      const url = String(entrada);
      pedidas.push(url);
      const esElDuplicado = url.includes('/duplicado');
      return Promise.resolve(
        new Response(JSON.stringify(esElDuplicado ? duplicado : RECIBOS_MEDIDOS), {
          status: esElDuplicado ? estadoDelDuplicado : 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });
    vi.stubGlobal('fetch', doble);
    return pedidas;
  }

  const ruta = (sujeto: string | null) => ({ sujeto, parametros: {} });

  it('sin sujeto en la ruta NO se pide el duplicado, y los ocho campos dicen «sin elegir»', async () => {
    const pedidas = contestaLosDos(DUPLICADO_MEDIDO);
    const { result } = renderHook(() => useDatosDeLaHoja('duplicado-recibo', ruta(null)), {
      wrapper: arnes(),
    });

    await waitFor(() => {
      expect(result.current.tablas?.get(TABLA_DE_RECIBOS)?.filas).toHaveLength(2);
    });
    expect(pedidas).toEqual(['/caja/api/v1/recibos']);
    expect(result.current.ausenciaPorCampo?.get(coordenada(1, 0))).toBe('sin elegir');
    expect(result.current.ausenciaPorCampo?.get(coordenada(1, 7))).toBe('sin elegir');
    expect(result.current.valores?.size).toBe(0);
    expect(result.current.tablas?.has(TABLA_DE_LINEAS)).toBe(false);
  });

  it('con un sujeto, se pide SU duplicado y el segundo bloque se llena con lo que contesto', async () => {
    const pedidas = contestaLosDos(DUPLICADO_MEDIDO);
    const { result } = renderHook(() => useDatosDeLaHoja('duplicado-recibo', ruta('001-000123')), {
      wrapper: arnes(),
    });

    await waitFor(() => {
      expect(result.current.valores?.get(coordenada(1, 0))).toBe('001-000123');
    });
    expect(pedidas).toEqual([
      '/caja/api/v1/recibos',
      '/caja/api/v1/recibos/001-000123/duplicado',
    ]);
    expect(result.current.valores?.get(coordenada(1, 2))).toBe('Cajero de la prueba');
    expect(result.current.valores?.get(coordenada(1, 4))).toBe('15/03/2026 21:04');
    expect(result.current.tablas?.get(TABLA_DE_LINEAS)?.filas).toHaveLength(2);
    // Ni un hueco: los ocho campos tienen dato.
    expect(result.current.ausenciaPorCampo?.size).toBe(0);
    expect(result.current.ausencia.explicacion).toBe('');
    // Y la fila elegida es la que esta realzada.
    const realzadas = result.current.tablas
      ?.get(TABLA_DE_RECIBOS)
      ?.filas.filter((f) => f.realzada === true);
    expect(realzadas?.map((f) => f.clave)).toEqual(['001-000123']);
  });

  it('un numero que no existe lo dice, y NO vacia la lista que ya estaba', async () => {
    contestaLosDos({ status: 404 }, 404);
    const { result } = renderHook(() => useDatosDeLaHoja('duplicado-recibo', ruta('001-999999')), {
      wrapper: arnes(),
    });

    await waitFor(() => {
      expect(result.current.ausencia.enElCampo).toBe('no está');
    });
    expect(result.current.ausencia.tono).toBe('atencion');
    expect(result.current.tablas?.get(TABLA_DE_RECIBOS)?.filas).toHaveLength(2);
    expect(result.current.ausenciaPorCampo?.get(coordenada(1, 0))).toBe('no está');
  });
});
