import { coordenada } from '@kamayuk/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PAGOS_MEDIDOS } from './tesoreriaMedida.ts';
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

/** Sustituye `fetch` por una respuesta fija, y devuelve el doble para mirar que se pidio. */
function contesta(cuerpo: unknown, estado = 200) {
  const doble = vi.fn<typeof fetch>(() =>
    Promise.resolve(
      new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'content-type': 'application/json' } }),
    ),
  );
  vi.stubGlobal('fetch', doble);
  return doble;
}

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
    contesta(PAGOS_MEDIDOS);
    const { result } = renderHook(() => useDatosDeLaHoja('cierre-caja'), { wrapper: arnes() });
    expect(result.current.ausencia.enElCampo).toBe('pidiendo…');
  });

  it('pide su ruta y solo esa, bajo `/caja/api/v1`', async () => {
    const doble = contesta(PAGOS_MEDIDOS);
    const { result } = renderHook(() => useDatosDeLaHoja('cierre-caja'), { wrapper: arnes() });
    await waitFor(() => {
      expect(result.current.filas?.get(1)).toHaveLength(1);
    });
    expect(doble.mock.calls.map(([url]) => String(url))).toEqual(['/caja/api/v1/pagos/sin-entregar']);
  });

  it('cuando llega, reparte lo que trae y dice con su palabra lo que falta', async () => {
    contesta(PAGOS_MEDIDOS);
    const { result } = renderHook(() => useDatosDeLaHoja('cierre-caja'), { wrapper: arnes() });

    await waitFor(() => {
      expect(result.current.filas?.get(1)).toHaveLength(1);
    });
    expect(result.current.ausenciaPorCampo?.get(coordenada(0, 0))).toBe('sin turno');
    expect(result.current.ausencia.tono).toBe('info');
    expect(result.current.ausencia.explicacion).toMatch(/pagos sin entregar/);
  });

  it('una lista vacia es una respuesta: filas vacias, no una ausencia', async () => {
    contesta([]);
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
