import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { sembrarElCatalogo } from '../desarrollo/sembrarElCatalogo.ts';
import { Aplicacion, CONSULTAS } from '../src/aplicacion.tsx';
import { CATALOGO } from '../src/catalogo.ts';
import { SESION_MEDIDA } from '../src/datos/sesionMedida.ts';
import type { ClaveDeHoja } from '../src/pantallas/arbol.ts';
import { bloquesDe, pantallaDe } from '../src/pantallas/definiciones/index.ts';

/**
 * **La siembra abre las hojas de la ventanilla sin que nadie conteste** (`rentas`#114; aqui #74).
 *
 * `los-destinos-se-recorren.test.tsx` contesta las lecturas de seguridad con un doble que responde.
 * Esta mide lo otro: que la cadena funcione **cuando no contesta nadie**, que es el estado de un
 * puesto de desarrollo sin plataforma. Aqui `fetch` **rechaza todo**: si la siembra no pusiera el
 * dato donde las consultas lo buscan —o lo pusiera rancio y salieran a refrescarlo—, no habria arbol.
 *
 * Y se cuentan las peticiones. Desde #84 las hojas piden sus datos, como las dos de `rentas`: la
 * siembra cubre la seguridad y la cuenta, **nunca los datos**, asi que en una hoja que lee sale su
 * lectura y ninguna mas.
 *
 * <h2>Lo que #100 quito de aqui</h2>
 *
 * Habia una prueba de `anulacion-recibo`: abierta por su hash, no salia ni una peticion. Esa hoja
 * ya no existe —anular es una accion de `duplicado-recibo` (ADR-0044)—, y dejar la prueba con su
 * hash la habria convertido en verde por el motivo equivocado: un hash que no es ningun destino no
 * pide nada **porque no abre nada**. En su sitio se mide lo que si es cierto: abrir una hoja no
 * manda ninguna escritura, y la que escribe no sale hasta que alguien lo pide.
 */

beforeAll(() => {
  // Lo que jsdom no trae y las piezas del armazon piden. Sus motivos, en `@kamayuk/shell`.
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  globalThis.matchMedia ??= ((consulta: string) => ({
    matches: false,
    media: consulta,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof matchMedia;
});

/** Las URL que se pidieron. */
let pedidas: string[] = [];

beforeEach(() => {
  CONSULTAS.clear();
  pedidas = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>((entrada) => {
      pedidas.push(String(entrada));
      // Nadie contesta: sin PostgreSQL, sin Keycloak, sin Traefik y sin backend.
      return Promise.reject(new TypeError('Failed to fetch'));
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = '';
});

async function abrir(clave: string) {
  window.location.hash = `#/${clave}`;
  render(<Aplicacion />);
  await waitFor(() => {
    expect(document.querySelector('[data-slot="barra-global"], header, nav')).not.toBeNull();
  });
}

const DESTINOS = CATALOGO.flatMap((m) => m.destinos.map((d) => ({ clave: d.clave, rotulo: d.rotulo })));

describe('con el catalogo sembrado, la ventanilla se recorre sin backend', () => {
  it('EL CENTINELA: sin sembrar NO abre nada, y ese es el hueco que la siembra cierra', async () => {
    render(<Aplicacion />);
    await waitFor(() => {
      expect(screen.getByText(/No se pudo saber que puede abrir esta cuenta/)).toBeTruthy();
    });
    expect(document.querySelector('[data-slot="barra-global"]')).toBeNull();
  });

  it.each(DESTINOS)('sembrado, «$clave» abre con su titulo y sus bloques', async (destino) => {
    sembrarElCatalogo();
    await abrir(destino.clave);
    const definicion = pantallaDe(destino.clave as ClaveDeHoja);

    expect(screen.getByRole('heading', { level: 1, name: destino.rotulo }), `«${destino.clave}» no abrio por su hash`).toBeTruthy();
    for (const bloque of bloquesDe(definicion)) {
      expect(screen.getByRole('heading', { level: 2, name: bloque.titulo })).toBeTruthy();
    }
  });

  it('y la barra dice la cuenta de la captura, no una inventada ni «identificando…»', async () => {
    sembrarElCatalogo();
    await abrir('caja-tributaria');
    expect(screen.getAllByText(SESION_MEDIDA.nombre).length).toBeGreaterThan(0);
  });

  it('abrir la hoja que escribe no escribe nada: sale su lectura y ninguna escritura (#100)', async () => {
    sembrarElCatalogo();
    await abrir('duplicado-recibo');
    await waitFor(() => {
      expect(pedidas.length).toBeGreaterThan(0);
    });
    // La lista, y nada mas: sin recibo elegido no se pide su ficha, y la anulacion no sale sola.
    // Es lo que hace cierto que la unica escritura de esta interfaz la dispare una persona.
    expect(pedidas).toEqual(['/caja/api/v1/recibos']);
    expect(pedidas.filter((url) => url.includes('/anulacion'))).toEqual([]);
  });

  it('y en una que lee, sale SOLO su lectura: la siembra no llega a los datos (rentas#114)', async () => {
    sembrarElCatalogo();
    await abrir('cierre-caja');
    await waitFor(() => {
      expect(pedidas.length).toBeGreaterThan(1);
    });
    // Los datos de una hoja no se siembran nunca: sembrados, `yarn dev` ensenaria una cifra que nadie
    // contesto. Asi que la hoja pide, nadie contesta, y la pantalla dice que fallo.
    //
    // Son las DOS que no dependen de nada (#97): el arqueo va DESPUES del turno, y como el turno
    // no llega, no se pide. Que `/turnos/{turnoId}/cierre` no aparezca aqui es lo que demuestra
    // que la interfaz no se inventa un identificador cuando su lectura falla.
    expect([...pedidas].sort()).toEqual([
      '/caja/api/v1/pagos/sin-entregar',
      '/caja/api/v1/turnos/del-dia',
    ]);
  });
});
