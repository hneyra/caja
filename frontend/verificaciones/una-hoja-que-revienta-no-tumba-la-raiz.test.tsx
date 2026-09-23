import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { Aplicacion, CONSULTAS } from '../src/aplicacion.tsx';
import {
  ACCESOS_MEDIDOS,
  MODULOS_MEDIDOS,
  PERMISOS_MEDIDOS,
} from '../src/datos/seguridadMedida.ts';
import { MUNICIPALIDAD_MEDIDA, SESION_MEDIDA } from '../src/datos/sesionMedida.ts';
import { AVANCE_MEDIDO, DISTRIBUCION_MEDIDA } from '../src/datos/tesoreriaMedida.ts';

/**
 * **La red de cada pantalla: lo que lance al dibujarse se queda en ella** (#117).
 *
 * El reparto ya no puede tumbar la raiz —corre en el `select`, ver `la-ventanilla-resiste`—, pero
 * no es lo unico que corre al dibujar: el interprete de `@kamayuk/ui` compone la definicion con los
 * datos, y cualquier excepcion ahi, sin nadie que la recoja, la recoge el enrutador y pinta su
 * «Unexpected Application Error!» **en lugar del armazon entero**. Medido.
 *
 * Aqui se fuerza esa excepcion en una sola hoja —el interprete de esa hoja lanza— y se mide que la
 * red de la pantalla la recoge: esa hoja dice que no se pudo dibujar, el menu sigue, y cambiar de
 * hoja deja la siguiente dibujada como siempre.
 */

vi.mock('../src/pantallas/PantallaDelSistema.tsx', async (original) => {
  const real = await original<typeof import('../src/pantallas/PantallaDelSistema.tsx')>();
  return {
    ...real,
    PantallaDelSistema: (props: Parameters<typeof real.PantallaDelSistema>[0]) => {
      if (props.definicion.instruccion.includes('por concepto')) throw new Error('El interprete tropezo con esta hoja');
      return real.PantallaDelSistema(props);
    },
  };
});

beforeAll(() => {
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

beforeEach(() => {
  CONSULTAS.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>((entrada) => {
      const url = String(entrada);
      const json = (cuerpo: unknown) =>
        Promise.resolve(new Response(JSON.stringify(cuerpo), { status: 200, headers: { 'content-type': 'application/json' } }));
      const pagina = (contenido: readonly unknown[]) =>
        json({ contenido, pagina: 0, tamano: 200, totalElementos: contenido.length, totalPaginas: 1, hayMas: false });
      if (url.includes('/seguridad/modulos')) return pagina(MODULOS_MEDIDOS);
      if (url.includes('/seguridad/accesos')) return pagina(ACCESOS_MEDIDOS);
      if (url.includes('/seguridad/sesion/permisos')) return json(PERMISOS_MEDIDOS);
      if (url.includes('/seguridad/sesion/municipalidad')) return json(MUNICIPALIDAD_MEDIDA);
      if (url.includes('/seguridad/sesion')) return json(SESION_MEDIDA);
      if (url.includes('/recaudacion/avance')) return json(AVANCE_MEDIDO);
      if (url.includes('/recaudacion/por-area')) return json(DISTRIBUCION_MEDIDA);
      return Promise.resolve(new Response('{}', { status: 404 }));
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = '';
});

describe('una hoja que revienta al dibujarse no tumba la raiz', () => {
  it('EL CENTINELA: la definicion de «avance-recaudacion» es la que el doble hace lanzar', async () => {
    const { pantallaDe } = await import('../src/pantallas/definiciones/index.ts');
    expect(pantallaDe('avance-recaudacion').instruccion).toMatch(/por concepto/);
    expect(pantallaDe('recaudacion-area').instruccion).not.toMatch(/por concepto/);
  });

  it('la hoja dice que no se pudo dibujar, el menu sigue, y la siguiente hoja se dibuja', { timeout: 30_000 }, async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      window.location.hash = '#/avance-recaudacion';
      render(<Aplicacion />);
      expect(await screen.findByText(/Esta pantalla no se pudo dibujar/, {}, { timeout: 5_000 })).toBeTruthy();
      expect(document.querySelector('[data-slot="carril-de-modulos"]'), 'el menu sigue montado').not.toBeNull();
      expect(document.querySelector('[data-slot="barra-global"]'), 'y la barra de la sesion').not.toBeNull();
      // Lo que lanzo se nombra: es lo que soporte necesita para encontrarlo.
      expect(screen.getByText(/El interprete tropezo con esta hoja/)).toBeTruthy();

      const persona = userEvent.setup();
      await persona.click(screen.getAllByRole('button', { name: 'Recaudación por área' })[0] as HTMLElement);
      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: 'Recaudación por área' })).toBeTruthy();
      });
      expect(screen.queryByText(/Esta pantalla no se pudo dibujar/)).toBeNull();
    } finally {
      consola.mockRestore();
    }
  });
});
