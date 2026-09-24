import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
 * `salir()` de verdad manda el navegador al emisor, y jsdom no navega. Se sustituye SOLO esa: lo
 * que se mide es que el borrador ya no esta cuando se la llama, y el doble apunta que habia en la
 * pestana en ese instante.
 */
const alSalir = vi.hoisted(() => ({ borradorQueQuedaba: undefined as string | null | undefined, veces: 0 }));
vi.mock('../src/api/identidad.ts', async (original) => ({
  ...(await original<typeof import('../src/api/identidad.ts')>()),
  salir: () => {
    alSalir.veces += 1;
    alSalir.borradorQueQuedaba = sessionStorage.getItem('kamayuk.caja.borrador-de-la-anulacion');
  },
}));

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
 *   · **El borrador se va cuando deja de servir**: al anular con exito, al cerrar el acto —salvo
 *     si lo que se cierra es el rechazo de un 401, que es justo cuando hay que conservarlo— y al
 *     cerrar la sesion. Y es de UNA cuenta: otra que entre en la misma pestana no lo ve.
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
  alSalir.veces = 0;
  alSalir.borradorQueQuedaba = undefined;
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
    expect(fallo.textContent).toMatch(/seguirá ahí/);
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

describe('el borrador es de la cuenta que lo escribio, y no sobrevive a su sesion', () => {
  const elBoton = () => document.querySelector(`[data-accion="abre:${ACTO_DE_ANULACION}"]`) as HTMLElement | null;
  const elActo = () => document.querySelector(`[data-acto="${ACTO_DE_ANULACION}"]`) as HTMLElement | null;
  const APERTURA = `${ACTO_DE_ANULACION}|${JSON.stringify({ numeroDelRecibo: EL_RECIBO })}`;
  const ESCRITO = { valores: { motivo: 'Lo escribio otro' }, observacion: 'De otro turno', intentado: false };

  async function abrirElActo(persona: ReturnType<typeof userEvent.setup>) {
    await waitFor(() => {
      expect(elBoton()?.getAttribute('aria-disabled')).toBeNull();
    });
    await persona.click(elBoton() as HTMLElement);
    await waitFor(() => {
      expect(elActo()).not.toBeNull();
    });
  }

  it('EL CENTINELA: el borrador de la MISMA cuenta si se restaura', { timeout: 30_000 }, async () => {
    sessionStorage.setItem(CLAVE_DEL_BORRADOR, JSON.stringify({ cuenta: 'administrador', actos: { [APERTURA]: ESCRITO } }));
    const persona = userEvent.setup();
    await abrir(`duplicado-recibo/${EL_RECIBO}`);
    await abrirElActo(persona);
    await waitFor(() => {
      expect((screen.getByLabelText(/Motivo/) as HTMLTextAreaElement).value).toBe('Lo escribio otro');
    });
  });

  it('el de OTRA cuenta no se ofrece, y se borra de la pestana', { timeout: 30_000 }, async () => {
    sessionStorage.setItem(CLAVE_DEL_BORRADOR, JSON.stringify({ cuenta: 'otro.cajero', actos: { [APERTURA]: ESCRITO } }));
    const persona = userEvent.setup();
    await abrir(`duplicado-recibo/${EL_RECIBO}`);
    await abrirElActo(persona);
    await waitFor(() => {
      expect(sessionStorage.getItem(CLAVE_DEL_BORRADOR)).toBeNull();
    });
    expect((screen.getByLabelText(/Motivo/) as HTMLTextAreaElement).value).toBe('');
    expect((screen.getByLabelText(/Observación/) as HTMLTextAreaElement).value).toBe('');
  });

  // 60s y no 30_000 como el resto: es la unica que abre el menu de sesion con teclado sobre la
  // aplicacion entera, y eso ya tardaba 25-28s medido en solitario (ver el comentario de mas
  // abajo); bajo `yarn verificar` completo, con la suite entera disputando cuatro nucleos, se
  // midio pasar de los 30s y salir en rojo por tiempo y no por el aserto (#117, revision).
  it('cerrar la sesion borra el borrador ANTES de irse al emisor', { timeout: 60_000 }, async () => {
    const persona = userEvent.setup();
    await abrir(`duplicado-recibo/${EL_RECIBO}`);
    await abrirElActo(persona);
    await persona.type(screen.getByLabelText(/Motivo/), 'A medio escribir');
    await waitFor(() => {
      expect(sessionStorage.getItem(CLAVE_DEL_BORRADOR) ?? '').toContain('A medio escribir');
    });

    // Con el teclado y `fireEvent`, no con `userEvent.click`: el clic de `userEvent` sobre el
    // disparador del menu tarda mas de veinte segundos en jsdom (medido), y la tecla lo abre igual.
    const disparador = document.querySelector('[data-slot="abrir-la-sesion"]') as HTMLElement;
    disparador.focus();
    fireEvent.keyDown(disparador, { key: 'Enter' });
    // Por el rol en el DOM y no con `findByRole`: sobre la aplicacion entera, calcular los nombres
    // accesibles de todo el arbol tarda decenas de segundos con la suite en paralelo.
    const cerrar = await waitFor(() => {
      const opcion = [...document.querySelectorAll('[role="menuitem"]')].find((o) => o.textContent === 'Cerrar sesion');
      expect(opcion).toBeDefined();
      return opcion as HTMLElement;
    });
    fireEvent.click(cerrar);

    expect(alSalir.veces).toBe(1);
    expect(alSalir.borradorQueQuedaba, 'cuando se llama a salir(), ya no hay borrador').toBeNull();
  });

  it('cerrar el acto despues de un 401 NO es cancelarlo: lo escrito sigue al reabrir', { timeout: 30_000 }, async () => {
    alAnular = 401;
    const persona = userEvent.setup();
    await abrir(`duplicado-recibo/${EL_RECIBO}`);
    await abrirElActo(persona);
    await persona.type(screen.getByLabelText(/Motivo/), 'Cobro duplicado');
    await persona.type(screen.getByLabelText(/Observación/), 'A pedido de tesoreria');
    const primario = elActo()?.querySelector('button[type="submit"]') as HTMLElement;
    await waitFor(() => {
      expect(primario.getAttribute('aria-disabled')).toBeNull();
    });
    await persona.click(primario);
    await persona.click(await screen.findByRole('button', { name: /confirmar/i }));
    await waitFor(() => {
      expect(document.querySelector(`[data-fallo-de="${ACTO_DE_ANULACION}"]`)).not.toBeNull();
    });

    await persona.click(screen.getByRole('button', { name: /cerrar/i }));
    await waitFor(() => {
      expect(elActo()).toBeNull();
    });
    expect(sessionStorage.getItem(CLAVE_DEL_BORRADOR) ?? '').toContain('Cobro duplicado');
    await abrirElActo(persona);
    expect((screen.getByLabelText(/Motivo/) as HTMLTextAreaElement).value).toBe('Cobro duplicado');
  });
});
