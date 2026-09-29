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
import { DUPLICADO_MEDIDO, RECIBOS_MEDIDOS } from '../src/datos/tesoreriaMedida.ts';
import { ACTO_DE_ANULACION } from '../src/pantallas/arbol.ts';

/**
 * **El acto de anular es del recibo elegido, y su rechazo tambien** (#134).
 *
 * Sobre la aplicacion montada, porque el defecto no estaba en ninguna pieza: estaba en **donde vivia
 * el acto abierto**. `<Pantalla>` lo guardaba en su estado, y la pantalla solo se vuelve a montar al
 * cambiar de hoja; elegir otra fila mueve la ruta y el bloque del recibo, pero no el acto. Lo
 * reprodujo la auditoria sobre el arnes de `la-ventanilla-resiste`: acto abierto sobre `001-000123`,
 * un motivo escrito, «Ver el duplicado» en `001-000124` → la ruta y el bloque dicen 124, el acto
 * sigue diciendo 123, y confirmar manda `POST /cobros/001-000123/anulacion`.
 *
 * <h2>Lo que se mide, una cosa por prueba</h2>
 *
 *   · **Elegir otro recibo cierra el acto**, y lo que sale al cable es el de la ruta.
 *   · **Ese cierre es cancelar**, como el boton «Cerrar»: el borrador del recibo que se deja se va —
 *     y **tras un 401 se queda**, por lo mismo que alli (#117, ADR-0044 §Decisión·4).
 *   · **Abrir el acto borra el rechazo anterior**: lo que se ve al abrir es el formulario, no el envio
 *     de antes.
 *   · **El rechazo es del recibo al que se envio**: el de un envio del 123 que contesta cuando ya se
 *     mira el 124 no sale encima del acto del 124.
 *   · **La confirmacion nombra el recibo** que se va a anular.
 *
 * Las cifras son las capturas de siempre; el 124 es el duplicado medido con su numero cambiado, que
 * es lo unico que el defecto necesitaba: dos recibos distintos en la misma lista.
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

const EL_123 = '001-000123';
const EL_124 = '001-000124';

/** Lo que contesta el `POST`: un estado, o `'en-vilo'` para contestarlo cuando la prueba diga. */
let alAnular: number | 'en-vilo' = 201;
/** Las rutas de los `POST` que salieron, en orden. */
let escrituras: string[] = [];
/** Las rutas de los `GET` que salieron, en orden. */
let lecturas: string[] = [];
/** Contesta el `POST` que quedo en vilo. */
let contestarElEnVilo: ((estado: number) => void) | null = null;

const json = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  CONSULTAS.clear();
  sessionStorage.clear();
  alAnular = 201;
  escrituras = [];
  lecturas = [];
  contestarElEnVilo = null;
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>((entrada, opciones) => {
      const url = new URL(String(entrada), 'http://ventanilla.prueba');
      const pagina = (contenido: readonly unknown[]) =>
        json({ contenido, pagina: 0, tamano: 200, totalElementos: contenido.length, totalPaginas: 1, hayMas: false });
      if (opciones?.method === 'POST') {
        escrituras.push(url.pathname);
        const rechazo = (estado: number) =>
          json({ status: estado, codigo: 'CONFLICTO', mensaje: `Rechazado con ${String(estado)}` }, estado);
        if (alAnular === 'en-vilo') {
          return new Promise<Response>((resolver) => {
            contestarElEnVilo = (estado) => {
              resolver(rechazo(estado));
            };
          });
        }
        return Promise.resolve(alAnular === 201 ? json({ numero: EL_123, estado: 'ANULADO' }, 201) : rechazo(alAnular));
      }
      lecturas.push(url.pathname);
      if (url.pathname.endsWith('/seguridad/modulos')) return Promise.resolve(pagina(MODULOS_MEDIDOS));
      if (url.pathname.endsWith('/seguridad/accesos')) return Promise.resolve(pagina(ACCESOS_MEDIDOS));
      if (url.pathname.endsWith('/seguridad/sesion/permisos')) return Promise.resolve(json(PERMISOS_MEDIDOS));
      if (url.pathname.endsWith('/seguridad/sesion/municipalidad')) return Promise.resolve(json(MUNICIPALIDAD_MEDIDA));
      if (url.pathname.endsWith('/seguridad/sesion')) return Promise.resolve(json(SESION_MEDIDA));
      const duplicado = /\/recibos\/([^/]+)\/duplicado$/.exec(url.pathname);
      if (duplicado !== null) {
        const numero = decodeURIComponent(duplicado[1] ?? '');
        return Promise.resolve(json({ ...DUPLICADO_MEDIDO, recibo: { ...DUPLICADO_MEDIDO.recibo, numero } }));
      }
      if (url.pathname.endsWith('/recibos')) return Promise.resolve(json(RECIBOS_MEDIDOS));
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

async function abrir(hash: string) {
  window.location.hash = `#/${hash}`;
  render(<Aplicacion />);
  await waitFor(() => {
    expect(document.querySelector('[data-slot="barra-global"]')).not.toBeNull();
  });
}

const elBoton = () => document.querySelector(`[data-accion="abre:${ACTO_DE_ANULACION}"]`) as HTMLElement | null;
const elActo = () => document.querySelector(`[data-acto="${ACTO_DE_ANULACION}"]`) as HTMLElement | null;
const elFallo = () => document.querySelector(`[data-fallo-de="${ACTO_DE_ANULACION}"]`);

async function abrirElActo(persona: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
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

/**
 * «Ver el duplicado» en la fila de ese recibo, y esperar a que la hoja lo tenga elegido y lo haya
 * pedido. Por el DOM y no por rol: sobre la aplicacion entera, los nombres accesibles de todo el
 * arbol tardan decenas de segundos con la suite en paralelo (ver `la-ventanilla-resiste`).
 */
async function elegir(persona: ReturnType<typeof userEvent.setup>, numero: string): Promise<void> {
  const fila = [...document.querySelectorAll('tr')].find((tr) => tr.querySelector('td')?.textContent === numero);
  const boton = fila?.querySelector('[data-acciones-de-la-fila] button') as HTMLElement | null | undefined;
  expect(boton, `la fila de ${numero} no tiene su «Ver el duplicado»`).toBeTruthy();
  await persona.click(boton as HTMLElement);
  await waitFor(() => {
    expect(window.location.hash).toBe(`#/duplicado-recibo/${numero}`);
    expect(lecturas).toContain(`/caja/api/v1/recibos/${numero}/duplicado`);
  });
}

/** Rellena lo obligatorio del acto abierto, pulsa el primario y confirma. */
async function rellenarYConfirmar(persona: ReturnType<typeof userEvent.setup>, acto: HTMLElement): Promise<void> {
  await persona.type(screen.getByLabelText(/Motivo/), 'Cobro duplicado');
  await persona.type(screen.getByLabelText(/Observación/), 'A pedido de tesoreria');
  const primario = acto.querySelector('button[type="submit"]') as HTMLElement;
  await waitFor(() => {
    expect(primario.getAttribute('aria-disabled')).toBeNull();
  });
  await persona.click(primario);
  await persona.click(await screen.findByRole('button', { name: /confirmar/i }));
}

describe('elegir otro recibo con el acto abierto', () => {
  it('lo cierra, y lo que se anula despues es el recibo de la ruta, nunca el de antes', { timeout: 30_000 }, async () => {
    const persona = userEvent.setup();
    await abrir(`duplicado-recibo/${EL_123}`);
    const delPrimero = await abrirElActo(persona);
    expect(delPrimero.textContent).toContain(EL_123);
    await persona.type(screen.getByLabelText(/Motivo/), 'Era del 123');

    await elegir(persona, EL_124);

    expect(elActo(), 'el acto abierto sobre el 123 sigue abierto mirando el 124').toBeNull();
    const delSegundo = await abrirElActo(persona);
    expect(delSegundo.textContent).toContain(EL_124);
    expect(delSegundo.textContent).not.toContain(EL_123);
    expect((screen.getByLabelText(/Motivo/) as HTMLTextAreaElement).value, 'lo escrito para el 123 no pasa al 124').toBe('');

    await rellenarYConfirmar(persona, delSegundo);
    await waitFor(() => {
      expect(escrituras).toHaveLength(1);
    });
    expect(escrituras).toEqual([`/caja/api/v1/cobros/${EL_124}/anulacion`]);
  });

  it('es cancelarlo, como «Cerrar»: el borrador del recibo que se deja se va', { timeout: 30_000 }, async () => {
    const persona = userEvent.setup();
    await abrir(`duplicado-recibo/${EL_123}`);
    await abrirElActo(persona);
    await persona.type(screen.getByLabelText(/Motivo/), 'A medio escribir');
    await waitFor(() => {
      expect(sessionStorage.getItem(CLAVE_DEL_BORRADOR) ?? '').toContain('A medio escribir');
    });

    await elegir(persona, EL_124);

    await waitFor(() => {
      expect(sessionStorage.getItem(CLAVE_DEL_BORRADOR)).toBeNull();
    });
  });

  it('tras un 401 NO es cancelarlo: lo escrito sigue, y vuelve al abrir otra vez el acto sobre ese recibo', { timeout: 30_000 }, async () => {
    alAnular = 401;
    const persona = userEvent.setup();
    await abrir(`duplicado-recibo/${EL_123}`);
    await rellenarYConfirmar(persona, await abrirElActo(persona));
    await waitFor(() => {
      expect(elFallo()?.textContent ?? '').toMatch(/La sesión caducó/);
    });

    await elegir(persona, EL_124);
    expect(elActo()).toBeNull();
    expect(sessionStorage.getItem(CLAVE_DEL_BORRADOR) ?? '', 'el borrador del 123 se perdio').toContain('Cobro duplicado');

    await elegir(persona, EL_123);
    await abrirElActo(persona);
    expect((screen.getByLabelText(/Motivo/) as HTMLTextAreaElement).value).toBe('Cobro duplicado');
  });
});

describe('el rechazo es del acto y del recibo', () => {
  it('abrir el acto lo borra: el 409 de antes no sale encima de un formulario que no se ha enviado', { timeout: 30_000 }, async () => {
    alAnular = 409;
    const persona = userEvent.setup();
    await abrir(`duplicado-recibo/${EL_123}`);
    await rellenarYConfirmar(persona, await abrirElActo(persona));
    await waitFor(() => {
      expect(elFallo()?.textContent ?? '').toMatch(/ya no admite la anulación/);
    });

    await persona.click(screen.getByRole('button', { name: /cerrar/i }));
    await waitFor(() => {
      expect(elActo()).toBeNull();
    });
    await abrirElActo(persona);

    expect(elFallo(), 'el rechazo del envio anterior sale al abrir, antes de enviar nada').toBeNull();
    expect(escrituras).toHaveLength(1);
  });

  it('el de un envio del 123 que contesta mirando ya el 124 no sale en el acto del 124', { timeout: 30_000 }, async () => {
    alAnular = 'en-vilo';
    const persona = userEvent.setup();
    await abrir(`duplicado-recibo/${EL_123}`);
    await rellenarYConfirmar(persona, await abrirElActo(persona));
    await waitFor(() => {
      expect(escrituras).toEqual([`/caja/api/v1/cobros/${EL_123}/anulacion`]);
    });

    // Mientras el `POST` del 123 viaja, se elige el 124 y se abre su acto.
    await elegir(persona, EL_124);
    const delSegundo = await abrirElActo(persona);
    expect(delSegundo.textContent).toContain(EL_124);

    // Y entonces el backend rechaza el del 123.
    expect(contestarElEnVilo).not.toBeNull();
    contestarElEnVilo?.(409);
    await new Promise((listo) => setTimeout(listo, 150));

    expect(elFallo(), 'el rechazo del 123 salio encima del acto del 124').toBeNull();
    expect(escrituras).toHaveLength(1);
  });
});

describe('la confirmacion', () => {
  it('nombra el recibo que se va a anular', { timeout: 30_000 }, async () => {
    const persona = userEvent.setup();
    await abrir(`duplicado-recibo/${EL_123}`);
    const acto = await abrirElActo(persona);
    await persona.type(screen.getByLabelText(/Motivo/), 'Cobro duplicado');
    await persona.type(screen.getByLabelText(/Observación/), 'A pedido de tesoreria');
    const primario = acto.querySelector('button[type="submit"]') as HTMLElement;
    await waitFor(() => {
      expect(primario.getAttribute('aria-disabled')).toBeNull();
    });
    await persona.click(primario);

    const confirmacion = await waitFor(() => {
      const dialogo = document.querySelector('[role="alertdialog"]');
      expect(dialogo).not.toBeNull();
      return dialogo as HTMLElement;
    });
    expect(confirmacion.textContent).toContain(`Va a anular el recibo ${EL_123}.`);
    expect(escrituras, 'abrir la confirmacion no escribe nada').toEqual([]);
  });
});
