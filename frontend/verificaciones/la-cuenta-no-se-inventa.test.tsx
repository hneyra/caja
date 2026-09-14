import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { Aplicacion, CONSULTAS } from '../src/aplicacion.tsx';
import { ACCESOS_MEDIDOS, MODULOS_MEDIDOS, PERMISOS_MEDIDOS } from '../src/datos/seguridadMedida.ts';
import { MUNICIPALIDAD_MEDIDA, SESION_MEDIDA } from '../src/datos/sesionMedida.ts';
import { RAIZ } from './raiz.ts';

/**
 * **La cuenta de la barra la dice el backend, y cuando no la dice no se inventa** (#74; `caja`#44).
 *
 * `caja` ya pago esto una vez. Su maqueta V6 ensenaba «J. Cárdenas Vega · Cajero · caja C-3» en la
 * barra y el mismo nombre en el campo «Cajero» del recibo impreso, servida en el dominio de
 * produccion; #44 lo retiro, porque una persona inventada en la ficha de sesion de una ventanilla se
 * lee como la persona que cobro. Y `rentas-web`, de donde se copio esta interfaz, **sigue escribiendo
 * ese nombre** en su `aplicacion.tsx`.
 *
 * Asi que se mide lo que hace cierta la frase de `datos/useCuentaDeLaSesion.ts`:
 *
 *   · con `/seguridad/sesion` contestando, la barra dice ese nombre y esa municipalidad;
 *   · con `/seguridad/sesion` en 404, dice que esta caja no conoce la cuenta, y no ensena un nombre;
 *   · y ningun archivo de `src/` escribe un nombre de persona: ni el de la captura, ni el que se retiro.
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

let sesion: { estado: number; cuerpo: unknown } = { estado: 200, cuerpo: SESION_MEDIDA };

beforeEach(() => {
  CONSULTAS.clear();
  sesion = { estado: 200, cuerpo: SESION_MEDIDA };
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>((entrada) => {
      const url = String(entrada);
      const responde = (estado: number, cuerpo: unknown) =>
        Promise.resolve(new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'content-type': 'application/json' } }));
      const pagina = (contenido: readonly unknown[]) =>
        responde(200, { contenido, pagina: 0, tamano: 200, totalElementos: contenido.length, totalPaginas: 1, hayMas: false });
      if (url.includes('/seguridad/modulos')) return pagina(MODULOS_MEDIDOS);
      if (url.includes('/seguridad/accesos')) return pagina(ACCESOS_MEDIDOS);
      if (url.includes('/seguridad/sesion/permisos')) return responde(200, PERMISOS_MEDIDOS);
      if (url.includes('/seguridad/sesion/municipalidad')) return responde(200, MUNICIPALIDAD_MEDIDA);
      if (url.includes('/seguridad/sesion')) return responde(sesion.estado, sesion.cuerpo);
      return responde(404, {});
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = '';
});

async function montar() {
  window.location.hash = '#/caja-tributaria';
  render(<Aplicacion />);
  await waitFor(() => {
    expect(document.querySelector('[data-slot="barra-global"]')).not.toBeNull();
  });
}

describe('la cuenta de la barra', () => {
  it('con la sesion contestada, dice el nombre y la municipalidad que contesta el backend', async () => {
    await montar();
    await waitFor(() => {
      expect(screen.getAllByText(SESION_MEDIDA.nombre).length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText(MUNICIPALIDAD_MEDIDA.nombre).length).toBeGreaterThan(0);
  });

  it('con la cuenta desconocida para esta copia (404), lo dice y no ensena ningun nombre', async () => {
    sesion = { estado: 404, cuerpo: { status: 404, codigo: 'NO_ENCONTRADO', mensaje: 'no esta' } };
    await montar();
    await waitFor(() => {
      expect(screen.getAllByText('Cuenta que esta caja todavia no conoce').length).toBeGreaterThan(0);
    });
    expect(screen.queryByText(SESION_MEDIDA.nombre)).toBeNull();
  });

  it('y ningun archivo de `src/` escribe un nombre de persona', () => {
    const fuentes = (desde: string): readonly string[] =>
      readdirSync(desde).flatMap((e) => {
        const ruta = join(desde, e);
        return statSync(ruta).isDirectory() ? fuentes(ruta) : /\.tsx?$/.test(e) && !/\.test\./.test(e) && !/Medida\.ts$/.test(e) ? [ruta] : [];
      });
    const archivos = fuentes(join(RAIZ, 'src'));
    expect(archivos.length).toBeGreaterThan(10);
    const culpables = archivos.filter((ruta) => {
      const codigo = readFileSync(ruta, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
      return codigo.includes(SESION_MEDIDA.nombre) || /C[aá]rdenas/.test(codigo);
    });
    expect(culpables).toEqual([]);
  });
});
