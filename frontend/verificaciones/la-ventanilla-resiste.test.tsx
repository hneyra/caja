import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { Aplicacion, CONSULTAS } from '../src/aplicacion.tsx';
import { CLAVE_DEL_BORRADOR } from '../src/datos/borradorDeLaAnulacion.ts';
import {
  ACCESOS_MEDIDOS,
  MODULOS_MEDIDOS,
  PERMISOS_MEDIDOS,
} from '../src/datos/seguridadMedida.ts';
import { MUNICIPALIDAD_MEDIDA, SESION_MEDIDA } from '../src/datos/sesionMedida.ts';
import { AVANCE_MEDIDO, DUPLICADO_MEDIDO, RECIBOS_MEDIDOS } from '../src/datos/tesoreriaMedida.ts';
import { ACTO_DE_ANULACION } from '../src/pantallas/arbol.ts';

/**
 * **La ventanilla sobrevive a un dato malformado y a un token caducado** (#117).
 *
 * Sobre la aplicacion montada, porque lo que se rompia no era una pieza: era **la raiz**. Un
 * importe con una forma que el backend no sirve hacia lanzar a `formatearImporte` dentro del
 * render, y sin nadie que lo recogiera React desmontaba el arbol entero —menu y sesion incluidos—.
 * Y un 401 a mitad de la anulacion decia «No se pudo anular el cobro» y, al volver a entrar,
 * lo escrito se habia perdido.
 *
 * <h2>Lo que se mide</h2>
 *
 *   · **Un importe malformado deja ESA hoja en fallo, y el menu en pie.** El reparto corre en el
 *     `select` de TanStack Query: lo que lanza pasa a `isError` y lo pinta el estado de fallo que ya
 *     existia, con su frase.
 *   · **Un 401 en la anulacion dice que la sesion caduco y que hay que volver a entrar**, y lo
 *     escrito en el acto se encuentra al volver a abrirlo sobre el mismo recibo, aunque la
 *     aplicacion se haya montado de nuevo —que es lo que pasa al volver del emisor—.
 *   · **El borrador se va cuando deja de servir**: al anular con exito y al cerrar el acto.
 */

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

let avance: unknown = AVANCE_MEDIDO;
/** Lo que contesta el `POST` de la anulacion: su estado. */
let alAnular = 201;
let escrituras = 0;

beforeEach(() => {
  CONSULTAS.clear();
  sessionStorage.clear();
  avance = AVANCE_MEDIDO;
  alAnular = 201;
  escrituras = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>((entrada, opciones) => {
      const url = String(entrada);
      const json = (cuerpo: unknown, estado = 200) =>
        Promise.resolve(
          new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'content-type': 'application/json' } }),
        );
      const pagina = (contenido: readonly unknown[]) =>
        json({ contenido, pagina: 0, tamano: 200, totalElementos: contenido.length, totalPaginas: 1, hayMas: false });
      if (opciones?.method === 'POST') {
        escrituras += 1;
        return alAnular === 201
          ? json({ numero: EL_RECIBO, estado: 'ANULADO' }, 201)
          : json({ status: alAnular, codigo: 'NO_AUTENTICADO', mensaje: 'Token caducado' }, alAnular);
      }
      if (url.includes('/seguridad/modulos')) return pagina(MODULOS_MEDIDOS);
      if (url.includes('/seguridad/accesos')) return pagina(ACCESOS_MEDIDOS);
      if (url.includes('/seguridad/sesion/permisos')) return json(PERMISOS_MEDIDOS);
      if (url.includes('/seguridad/sesion/municipalidad')) return json(MUNICIPALIDAD_MEDIDA);
      if (url.includes('/seguridad/sesion')) return json(SESION_MEDIDA);
      if (url.includes('/recaudacion/avance')) return json(avance);
      if (url.includes('/duplicado')) return json(DUPLICADO_MEDIDO);
      if (url.includes('/recibos')) return json(RECIBOS_MEDIDOS);
      return Promise.resolve(new Response('{}', { status: 404 }));
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  window.location.hash = '';
});

const EL_RECIBO = '001-000123';

async function abrir(hash: string) {
  window.location.hash = `#/${hash}`;
  render(<Aplicacion />);
  await waitFor(() => {
    expect(document.querySelector('[data-slot="barra-global"]')).not.toBeNull();
  });
}

const elCarril = () => document.querySelector('[data-slot="carril-de-modulos"]');

describe('un dato malformado deja SU hoja en fallo, y el resto en pie', () => {
  it('EL CENTINELA: con el avance bien formado, la hoja lo pinta', { timeout: 30_000 }, async () => {
    await abrir('avance-recaudacion');
    expect(await screen.findAllByText('S/ 1,867.60', {}, { timeout: 5_000 })).not.toHaveLength(0);
    expect(elCarril()).not.toBeNull();
  });

  it('un importe que el backend no sirve no desmonta la raiz: la hoja dice que fallo, el menu sigue', { timeout: 30_000 }, async () => {
    avance = { ...AVANCE_MEDIDO, cobrado: { importe: '1.867,60', actualizadoA: '2026-03-15' } };
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await abrir('avance-recaudacion');
      expect(
        await screen.findByText(/Llegaron datos que esta pantalla no sabe leer/, {}, { timeout: 5_000 }),
      ).toBeTruthy();
      expect(elCarril(), 'el menu de la ventanilla sigue montado').not.toBeNull();
      expect(document.querySelector('[data-slot="barra-global"]'), 'y la barra de la sesion').not.toBeNull();
      expect(screen.getByRole('heading', { level: 1, name: 'Avance de recaudación' })).toBeTruthy();
    } finally {
      consola.mockRestore();
    }
  });
});

describe('un 401 a mitad del acto no pierde el borrador', () => {
  const elBoton = () => document.querySelector(`[data-accion="abre:${ACTO_DE_ANULACION}"]`) as HTMLElement | null;
  const elActo = () => document.querySelector(`[data-acto="${ACTO_DE_ANULACION}"]`) as HTMLElement | null;

  async function abrirElActo(persona: ReturnType<typeof userEvent.setup>) {
    await waitFor(() => {
      expect(elBoton()?.getAttribute('aria-disabled')).toBeNull();
    });
    await persona.click(elBoton() as HTMLElement);
    return waitFor(() => {
      const acto = elActo();
      expect(acto).not.toBeNull();
      return acto as HTMLElement;
    });
  }

  async function rellenarYEnviar(persona: ReturnType<typeof userEvent.setup>) {
    const acto = await abrirElActo(persona);
    await persona.type(screen.getByLabelText(/Motivo/), 'Cobro duplicado');
    await persona.type(screen.getByLabelText(/Autorizado por/), 'La jefa de caja');
    await persona.type(screen.getByLabelText(/memorando/), 'MEM-12');
    await persona.type(screen.getByLabelText(/Observación/), 'A pedido de tesoreria');
    const primario = acto.querySelector('button[type="submit"]') as HTMLElement;
    await waitFor(() => {
      expect(primario.getAttribute('aria-disabled')).toBeNull();
    });
    await persona.click(primario);
    await persona.click(await screen.findByRole('button', { name: /confirmar/i }));
    await waitFor(() => {
      expect(escrituras).toBe(1);
    });
  }

  it('dice que la sesion caduco y que hay que volver a entrar, no «No se pudo anular»', { timeout: 30_000 }, async () => {
    alAnular = 401;
    const persona = userEvent.setup();
    await abrir(`duplicado-recibo/${EL_RECIBO}`);
    await rellenarYEnviar(persona);

    const fallo = await waitFor(() => {
      const nodo = document.querySelector(`[data-fallo-de="${ACTO_DE_ANULACION}"]`);
      expect(nodo).not.toBeNull();
      return nodo as HTMLElement;
    });
    expect(fallo.textContent).toMatch(/La sesión caducó/);
    expect(fallo.textContent).toMatch(/Vuelva a entrar/);
    expect(fallo.textContent).not.toMatch(/No se pudo anular el cobro/);
  });

  it('al volver a entrar y abrir el acto sobre el MISMO recibo, lo escrito sigue ahi', { timeout: 30_000 }, async () => {
    alAnular = 401;
    const persona = userEvent.setup();
    await abrir(`duplicado-recibo/${EL_RECIBO}`);
    await rellenarYEnviar(persona);
    await waitFor(() => {
      expect(document.querySelector(`[data-fallo-de="${ACTO_DE_ANULACION}"]`)).not.toBeNull();
    });

    // Volver del emisor es una pagina nueva: se desmonta todo y la cache no sobrevive.
    cleanup();
    CONSULTAS.clear();
    await abrir(`duplicado-recibo/${EL_RECIBO}`);
    await abrirElActo(persona);

    expect((screen.getByLabelText(/Motivo/) as HTMLTextAreaElement).value).toBe('Cobro duplicado');
    expect((screen.getByLabelText(/Autorizado por/) as HTMLInputElement).value).toBe('La jefa de caja');
    expect((screen.getByLabelText(/memorando/) as HTMLInputElement).value).toBe('MEM-12');
    expect((screen.getByLabelText(/Observación/) as HTMLTextAreaElement).value).toBe('A pedido de tesoreria');
  });

  it('el borrador no guarda el token, y lleva el prefijo de esta interfaz', { timeout: 30_000 }, async () => {
    alAnular = 401;
    const persona = userEvent.setup();
    await abrir(`duplicado-recibo/${EL_RECIBO}`);
    await rellenarYEnviar(persona);
    expect(CLAVE_DEL_BORRADOR.startsWith('kamayuk.caja.')).toBe(true);
    const guardado = sessionStorage.getItem(CLAVE_DEL_BORRADOR) ?? '';
    expect(guardado).toContain('Cobro duplicado');
    expect(guardado).not.toMatch(/token|bearer|eyJ/i);
  });

  it('anulado con exito, el borrador se borra', { timeout: 30_000 }, async () => {
    const persona = userEvent.setup();
    await abrir(`duplicado-recibo/${EL_RECIBO}`);
    await rellenarYEnviar(persona);
    await waitFor(() => {
      expect(document.querySelector('[data-fase-del-acto="hecho"]')).not.toBeNull();
    });
    await waitFor(() => {
      expect(sessionStorage.getItem(CLAVE_DEL_BORRADOR)).toBeNull();
    });
  });

  it('cerrar el acto es cancelarlo: el borrador se borra y al reabrir esta vacio', { timeout: 30_000 }, async () => {
    const persona = userEvent.setup();
    await abrir(`duplicado-recibo/${EL_RECIBO}`);
    await abrirElActo(persona);
    await persona.type(screen.getByLabelText(/Motivo/), 'Me equivoque de recibo');
    await waitFor(() => {
      expect(sessionStorage.getItem(CLAVE_DEL_BORRADOR) ?? '').toContain('Me equivoque');
    });
    await persona.click(screen.getByRole('button', { name: /cerrar/i }));
    await waitFor(() => {
      expect(elActo()).toBeNull();
    });
    expect(sessionStorage.getItem(CLAVE_DEL_BORRADOR)).toBeNull();
    await abrirElActo(persona);
    expect((screen.getByLabelText(/Motivo/) as HTMLTextAreaElement).value).toBe('');
  });
});
