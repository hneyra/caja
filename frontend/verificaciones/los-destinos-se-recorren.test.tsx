import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { Aplicacion, CONSULTAS } from '../src/aplicacion.tsx';
import { CATALOGO } from '../src/catalogo.ts';
import type { PermisosDeLaSesion } from '../src/datos/lecturas.ts';
import {
  ACCESOS_MEDIDOS,
  MODULOS_MEDIDOS,
  PERMISOS_MEDIDOS,
  sinLosAccesos,
} from '../src/datos/seguridadMedida.ts';
import { MUNICIPALIDAD_MEDIDA, SESION_MEDIDA } from '../src/datos/sesionMedida.ts';
import type { ClaveDeHoja } from '../src/pantallas/arbol.ts';
import { bloquesDe, pantallaDe } from '../src/pantallas/definiciones/index.ts';

/**
 * **Las seis hojas de la ventanilla se abren, en la aplicacion montada, por su hash** (#74, #100).
 *
 * Es `los-cuarenta-destinos-se-recorren` de `rentas` con dos cambios. Seis destinos y no cuarenta.
 * Y **el filtro se mide por hoja**, porque en `caja` es la hoja lo que se filtra (`permisos.ts`):
 * una cuenta sin `cierre_caja` no ve «Cierre y arqueo» ni la abre por su hash, y ve las otras cinco.
 *
 * Se monta la aplicacion entera y se llega a cada destino por su hash, que es como se llega de
 * verdad: montar la pantalla suelta no comprueba que el destino este en el catalogo, ni que el
 * armazon sepa enrutarlo, ni que hoja y definicion sigan emparejadas.
 */

const DESTINOS = CATALOGO.flatMap((modulo) => modulo.destinos.map((destino) => ({ destino })));

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

/** Los permisos con que contesta el doble. Una prueba los cambia para medir el filtrado. */
let permisos: PermisosDeLaSesion = PERMISOS_MEDIDOS;

/** Las peticiones que salieron. Ninguna puede ir fuera de `/caja/api/v1` (ADR-0042). */
let pedidas: string[] = [];

beforeEach(() => {
  // La cache de consultas es de MODULO y sobrevive a cada `render`: ver `aplicacion.tsx`.
  CONSULTAS.clear();
  permisos = PERMISOS_MEDIDOS;
  pedidas = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>((entrada) => {
      const url = String(entrada);
      pedidas.push(url);
      const json = (cuerpo: unknown) =>
        Promise.resolve(new Response(JSON.stringify(cuerpo), { status: 200, headers: { 'content-type': 'application/json' } }));
      const pagina = (contenido: readonly unknown[]) =>
        json({ contenido, pagina: 0, tamano: 200, totalElementos: contenido.length, totalPaginas: 1, hayMas: false });
      if (url.includes('/seguridad/modulos')) return pagina(MODULOS_MEDIDOS);
      if (url.includes('/seguridad/accesos')) return pagina(ACCESOS_MEDIDOS);
      if (url.includes('/seguridad/sesion/permisos')) return json(permisos);
      if (url.includes('/seguridad/sesion/municipalidad')) return json(MUNICIPALIDAD_MEDIDA);
      if (url.includes('/seguridad/sesion')) return json(SESION_MEDIDA);
      return Promise.resolve(new Response('{}', { status: 404 }));
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = '';
});

/** Monta con el hash puesto y espera al armazon, que no se monta hasta saber que puede abrir la cuenta. */
async function abrir(clave: string) {
  window.location.hash = `#/${clave}`;
  render(<Aplicacion />);
  await waitFor(() => {
    expect(document.querySelector('[data-slot="barra-global"], header, nav')).not.toBeNull();
  });
}

describe('las seis hojas se recorren, en la aplicacion montada', () => {
  it('EL CENTINELA: el catalogo trae un modulo y seis destinos', () => {
    expect(CATALOGO).toHaveLength(1);
    // Seis desde #100: `anulacion-recibo` dejo de ser una hoja y anular se ofrece donde esta el
    // recibo, como accion (ADR-0044).
    expect(DESTINOS).toHaveLength(6);
  });

  it.each(DESTINOS)('«$destino.clave» — $destino.rotulo', async ({ destino }) => {
    await abrir(destino.clave);
    const definicion = pantallaDe(destino.clave as ClaveDeHoja);

    expect(screen.getByRole('heading', { level: 1, name: destino.rotulo }), `«${destino.clave}» no abrio por su hash`).toBeTruthy();
    expect(screen.getByText(new RegExp(escapar(definicion.instruccion)))).toBeTruthy();
    for (const bloque of bloquesDe(definicion)) {
      expect(
        screen.getByRole('heading', { level: 2, name: bloque.titulo }),
        `«${destino.clave}» no pinto el bloque «${bloque.titulo}»`,
      ).toBeTruthy();
    }
    // Y abrir una hoja no pide nada fuera de la API de la ventanilla.
    expect(pedidas.filter((url) => !url.startsWith('/caja/api/v1/'))).toEqual([]);
  });

  it('una hoja que la cuenta NO puede abrir no esta en el arbol NI se abre por su hash', async () => {
    permisos = sinLosAccesos('cierre_caja');
    await abrir('cierre-caja');

    expect(screen.queryByRole('heading', { level: 1, name: 'Cierre y arqueo de caja' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cierre y arqueo de caja' })).toBeNull();
    // Por `data-slot` y no por texto: las frases son de `@kamayuk/shell` y del idioma de la sesion.
    expect(elArmazonLoDice()).toBe(true);
    // Y las otras seis siguen en el arbol: se filtro la hoja, no el modulo. El modulo viene plegado
    // —no hay destino abierto que lo despliegue—, asi que se despliega a mano.
    fireEvent.click(screen.getByRole('button', { name: /Tesoreria/ }));
    expect(screen.getByRole('button', { name: 'Duplicado de recibo' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cierre y arqueo de caja' })).toBeNull();
  });

  it('y el CENTINELA: con permiso, ese MISMO hash si abre', async () => {
    await abrir('cierre-caja');
    expect(screen.getByRole('heading', { level: 1, name: 'Cierre y arqueo de caja' })).toBeTruthy();
  });

  it('un hash que no es de ningun destino NO abre una pantalla', async () => {
    await abrir('no-existe-este-destino');
    expect(screen.queryByRole('heading', { level: 2, name: 'Arqueo del turno' })).toBeNull();
    expect(elArmazonLoDice()).toBe(true);
  });

  it('el modulo lleva el rotulo del backend, y viene desplegado con sus siete hojas', async () => {
    await abrir('caja-tributaria');
    expect(screen.getByRole('button', { name: /Tesoreria/ })).toBeTruthy();
    for (const { destino } of DESTINOS) {
      expect(screen.getAllByRole('button', { name: destino.rotulo }).length, `el carril no ofrece «${destino.rotulo}»`).toBeGreaterThan(0);
    }
  });
});

/** Si el armazon esta diciendo que ahi no hay destino, de cualquiera de sus dos formas. */
function elArmazonLoDice(): boolean {
  return (
    document.querySelector('[data-slot="sin-destino"]') !== null ||
    document.querySelector('[data-slot="destino-no-ofrecido"]') !== null
  );
}

/** Una instruccion lleva parentesis y puntos: sin escapar, la expresion regular no casa. */
function escapar(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
