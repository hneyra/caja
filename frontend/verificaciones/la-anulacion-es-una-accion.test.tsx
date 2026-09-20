import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { Aplicacion, CONSULTAS } from '../src/aplicacion.tsx';
import type { PermisosDeLaSesion } from '../src/datos/lecturas.ts';
import {
  ACCESOS_MEDIDOS,
  MODULOS_MEDIDOS,
  PERMISOS_MEDIDOS,
} from '../src/datos/seguridadMedida.ts';
import { MUNICIPALIDAD_MEDIDA, SESION_MEDIDA } from '../src/datos/sesionMedida.ts';
import { DUPLICADO_MEDIDO, RECIBOS_MEDIDOS } from '../src/datos/tesoreriaMedida.ts';
import { ACTO_DE_ANULACION } from '../src/pantallas/arbol.ts';

/**
 * **Anular es una accion del recibo elegido, y escribe de verdad** (#100, ADR-0044).
 *
 * Es la guarda de la decision entera, sobre la aplicacion montada y no sobre una pieza suelta:
 * lo que puede fallar no es el acto ni el conector, es **la costura** —que la accion sepa sobre que
 * recibo actua, que el acto llegue al manejador, que el manejador mande lo que el backend espera, y
 * que la pantalla no ofrezca anular a quien no puede—.
 *
 * <h2>Las cuatro cosas que mide, y por que ninguna sobra</h2>
 *
 *   · **Con permiso y con un recibo elegido, se escribe.** UN `POST`, a su ruta, con los cuatro
 *     campos del backend y ni uno mas.
 *   · **Sin el privilegio, el boton NO se puede pulsar y DICE por que.** Un boton apagado y mudo
 *     deja a quien lo mira concluyendo lo que se le ocurra, y ninguna conclusion tiene por que ser
 *     la verdadera (`kamayuk-lib`#66). Se mide el `aria-disabled` **y** el texto.
 *   · **Quien solo puede anular ve la hoja, y el motivo nombra lo que le falta.** Es la respuesta a
 *     «que ve una cuenta que solo tiene `anulacion_recibo`», y no es una pantalla vacia.
 *   · **Sin recibo elegido no se anula nada.** Es lo que impide el numero a ciegas que ADR-0026 §4
 *     y la regla 10 no admiten.
 *
 * <h2>La regla 10, medida y no supuesta</h2>
 *
 * La observacion es obligatoria **en el tipo** del acto, asi que no se puede definir uno sin ella.
 * Lo que aqui se comprueba es lo que eso produce: el primario nace impedido, y sigue impedido hasta
 * que la observacion llega a su minimo. Se envia solo entonces.
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

/** Lo que contesta el doble, y lo que le pidieron. */
let permisos: PermisosDeLaSesion = PERMISOS_MEDIDOS;
let duplicado: unknown = DUPLICADO_MEDIDO;
let escrituras: { readonly url: string; readonly cuerpo: unknown }[] = [];

beforeEach(() => {
  // La cache de consultas es de MODULO y sobrevive a cada `render`: ver `aplicacion.tsx`.
  CONSULTAS.clear();
  permisos = PERMISOS_MEDIDOS;
  duplicado = DUPLICADO_MEDIDO;
  escrituras = [];
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
        escrituras.push({ url, cuerpo: JSON.parse(String(opciones.body)) });
        return json({ numero: '001-000123', estado: 'ANULADO' }, 201);
      }
      if (url.includes('/seguridad/modulos')) return pagina(MODULOS_MEDIDOS);
      if (url.includes('/seguridad/accesos')) return pagina(ACCESOS_MEDIDOS);
      if (url.includes('/seguridad/sesion/permisos')) return json(permisos);
      if (url.includes('/seguridad/sesion/municipalidad')) return json(MUNICIPALIDAD_MEDIDA);
      if (url.includes('/seguridad/sesion')) return json(SESION_MEDIDA);
      if (url.includes('/duplicado')) return json(duplicado);
      if (url.includes('/recibos')) return json(RECIBOS_MEDIDOS);
      return Promise.resolve(new Response('{}', { status: 404 }));
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = '';
});

/** Monta con el hash puesto y espera al armazon. */
async function abrir(hash: string) {
  window.location.hash = `#/${hash}`;
  render(<Aplicacion />);
  await waitFor(() => {
    expect(document.querySelector('[data-slot="barra-global"], header, nav')).not.toBeNull();
  });
}

/** El boton que abre el acto de anular, buscado por lo que la libreria le pone y no por su rotulo. */
const elBoton = () => document.querySelector(`[data-accion="abre:${ACTO_DE_ANULACION}"]`);

/** El motivo que describe a ese boton, leido por `aria-describedby` como lo leeria un lector. */
function motivoDelBoton(): string {
  const boton = elBoton();
  const id = boton?.getAttribute('aria-describedby') ?? '';
  const parrafo = id === '' ? null : document.getElementById(id.split(' ')[0] ?? '');
  return parrafo?.textContent ?? '';
}

const EL_RECIBO = '001-000123';

describe('la accion de anular se ofrece donde esta el recibo', () => {
  it('EL CENTINELA: la captura del duplicado trae un recibo EMITIDO, no uno ya anulado', () => {
    // Con uno anulado, el ultimo impedimento se cumpliria siempre y las pruebas de abajo medirian
    // ese y no el que dicen medir.
    expect(DUPLICADO_MEDIDO.estado).not.toBe('ANULADO');
  });

  it('con el recibo elegido y el privilegio, el boton se puede pulsar', async () => {
    await abrir(`duplicado-recibo/${EL_RECIBO}`);
    await waitFor(() => {
      expect(elBoton()).not.toBeNull();
    });
    await waitFor(() => {
      expect(elBoton()?.getAttribute('aria-disabled')).toBeNull();
    });
  });

  it('sin recibo elegido NO se anula: el motivo manda a elegir uno', async () => {
    await abrir('duplicado-recibo');
    await waitFor(() => {
      expect(elBoton()).not.toBeNull();
    });
    expect(elBoton()?.getAttribute('aria-disabled')).toBe('true');
    expect(motivoDelBoton()).toMatch(/Elija primero un recibo/);
  });

  it('un recibo YA anulado no se anula dos veces, y se dice antes de abrir el formulario', async () => {
    duplicado = { ...DUPLICADO_MEDIDO, estado: 'ANULADO' };
    await abrir(`duplicado-recibo/${EL_RECIBO}`);
    await waitFor(() => {
      expect(motivoDelBoton()).toMatch(/ya está anulado/);
    });
    expect(elBoton()?.getAttribute('aria-disabled')).toBe('true');
  });

  /**
   * **El catalogo se filtra por permisos, y la accion tambien** (#100, AC).
   *
   * Que la hoja se ofrezca no quiere decir que todo lo suyo se pueda: quien busca duplicados no
   * tiene por que poder anular. El boton sale impedido **con su motivo**, que es lo que
   * `BotonConMotivo` existe para hacer, y el motivo nombra la opcion del catalogo que falta —que es
   * lo que quien administra la seguridad tiene que buscar—.
   */
  it('sin `anulacion_recibo`, el boton esta impedido y dice que falta el privilegio', async () => {
    permisos = { duplicado_recibo: ['lectura'] };
    await abrir(`duplicado-recibo/${EL_RECIBO}`);
    await waitFor(() => {
      expect(elBoton()).not.toBeNull();
    });
    expect(elBoton()?.getAttribute('aria-disabled')).toBe('true');
    expect(motivoDelBoton()).toMatch(/no puede anular cobros/);
    expect(motivoDelBoton()).toMatch(/Anulación de recibo/);
  });

  /**
   * **Y lo que ve quien SOLO puede anular** (#100, AC-2): la hoja donde se anula, no una vacia.
   *
   * `oTambien` conserva el privilegio, asi que con solo `eliminacion` el backend le niega la lista.
   * Lo que la ventanilla hace con eso no es esconderse: dice que le falta y que pedir.
   */
  it('con SOLO `eliminacion`, la hoja se abre y el motivo nombra la lectura que falta', async () => {
    permisos = { anulacion_recibo: ['eliminacion'] };
    await abrir(`duplicado-recibo/${EL_RECIBO}`);
    await waitFor(() => {
      expect(elBoton()).not.toBeNull();
    });
    expect(screen.getByRole('heading', { level: 1, name: 'Duplicado de recibo' })).toBeTruthy();
    expect(elBoton()?.getAttribute('aria-disabled')).toBe('true');
    expect(motivoDelBoton()).toMatch(/no puede ver los recibos/);
  });
});

describe('y cuando se anula, se escribe lo que el backend espera', () => {
  // Con mas margen que los cinco segundos por omision: este camino teclea dos campos entero con
  // `userEvent` —tecla a tecla, que es como se mide de verdad— sobre la aplicacion montada, y con
  // la suite entera en paralelo pasa de los cinco. Medido: 2,1 s sola, 5,3 s acompanada.
  it('el acto no envia sin observacion (regla 10), y con ella manda UN `POST` con sus campos', { timeout: 30_000 }, async () => {
    const persona = userEvent.setup();
    await abrir(`duplicado-recibo/${EL_RECIBO}`);
    await waitFor(() => {
      expect(elBoton()?.getAttribute('aria-disabled')).toBeNull();
    });

    await persona.click(elBoton() as HTMLElement);
    const formulario = await waitFor(() => {
      const abierto = document.querySelector(`[data-acto="${ACTO_DE_ANULACION}"]`);
      expect(abierto).not.toBeNull();
      return abierto as HTMLElement;
    });
    // El acto dice sobre QUE recibo se actua: un formulario de anulacion que no lo nombra es el
    // mismo numero a ciegas que la accion impide.
    expect(formulario.textContent).toContain(EL_RECIBO);

    const primario = formulario.querySelector('button[type="submit"]') as HTMLElement;
    expect(primario.getAttribute('aria-disabled'), 'nace impedido: faltan el motivo y la observacion').toBe('true');

    await persona.type(screen.getByLabelText(/Motivo/), 'Cobro duplicado del mismo recibo');
    expect(primario.getAttribute('aria-disabled'), 'con el motivo pero sin observacion, sigue impedido').toBe('true');

    await persona.type(screen.getByLabelText(/Observación/), 'Se anula a pedido de tesorería');
    await waitFor(() => {
      expect(primario.getAttribute('aria-disabled')).toBeNull();
    });
    expect(escrituras, 'nada se ha escrito todavia: no se ha confirmado').toEqual([]);

    // Y no se deshace, asi que se confirma: el primario abre la confirmacion en vez de enviar.
    // Nunca un `confirm()` del navegador, que bloquea el hilo y no lo lee un lector de pantalla.
    await persona.click(primario);
    expect(await screen.findByText(/Esto no se deshace/), 'el acto declara su advertencia').toBeTruthy();
    expect(escrituras, 'abrir la confirmacion no escribe nada').toEqual([]);
    await persona.click(await screen.findByRole('button', { name: /confirmar/i }));

    await waitFor(() => {
      expect(escrituras).toHaveLength(1);
    });
    expect(escrituras[0]?.url).toBe(`/caja/api/v1/cobros/${EL_RECIBO}/anulacion`);
    expect(escrituras[0]?.cuerpo).toEqual({
      motivo: 'Cobro duplicado del mismo recibo',
      observacion: 'Se anula a pedido de tesorería',
    });
  });
});
