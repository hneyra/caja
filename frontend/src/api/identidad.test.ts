import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { canjearSiVuelve, entrar, fijarToken, token, urlDeLaCuenta } from './identidad.ts';

/**
 * **La costura con `@kamayuk/sesion`: lo que la puerta de la ventanilla decide por su cuenta** (#74).
 *
 * El flujo PKCE —el reto S256, el tope de idas, la sonda del emisor, la consola de la cuenta— lo
 * prueba la libreria en `paquetes/sesion/identidad.test.ts`, y repetirlo aqui seria medir dos veces
 * lo mismo con el riesgo de que las dos copias divergieran. Lo que se mide aqui son las cuatro
 * decisiones de `identidad.ts`, que la libreria no puede conocer:
 *
 *   · que el retorno es la raiz DE LA APLICACION (`/caja/`), la leccion de `rentas`#71;
 *   · que las claves del rebote llevan el prefijo de ESTE sistema;
 *   · que las senias se leen al usar la puerta, no al importar el modulo;
 *   · y que el token del canje no acaba en ningun almacenamiento del navegador.
 */

const REALM = 'http://localhost:8180/realms/kamayuk';

/** Sustituye `location`, que en jsdom no se puede espiar de otra manera. */
function ubicacion(href = 'http://localhost:5181/caja/') {
  const url = new URL(href);
  const asignar = vi.fn();
  vi.stubGlobal('location', {
    origin: url.origin,
    href: url.href,
    pathname: url.pathname,
    search: url.search,
    hash: url.hash,
    assign: asignar,
    replace: vi.fn(),
    reload: vi.fn(),
  });
  vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
  return asignar;
}

/** El emisor contesta la sonda de `entrar()`: es el estado normal. */
function elEmisorContesta() {
  const espia = vi.fn<typeof fetch>(() => Promise.resolve(new Response(null, { status: 200 })));
  vi.stubGlobal('fetch', espia);
  return espia;
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  fijarToken(null);
  elEmisorContesta();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete window.__KAMAYUK_CAJA__;
  sessionStorage.clear();
  localStorage.clear();
  fijarToken(null);
});

describe('la ida a la puerta lleva las senias de la ventanilla', () => {
  it('al realm y al cliente de la instalacion, y de vuelta a la raiz de la APLICACION', async () => {
    const asignar = ubicacion();

    const falla = await entrar();

    expect(falla).toBeNull();
    const destino = new URL(String(asignar.mock.calls[0]?.[0]));
    expect(destino.origin + destino.pathname).toBe(`${REALM}/protocol/openid-connect/auth`);
    expect(destino.searchParams.get('client_id')).toBe('kamayuk-backoffice');
    // `/caja/`, la `base` de `vite.config.ts` y de `vitest.config.ts`. Con la raiz del SITIO el
    // emisor devolveria al usuario a `https://<dominio>/` —la interfaz de nadie— con el `code`
    // correcto: `rentas`#71, y ADR-0040 manda traer la leccion pagada.
    expect(destino.searchParams.get('redirect_uri')).toBe('http://localhost:5181/caja/');
  });

  it('y las claves del rebote llevan el prefijo de caja, para no pisar a rentas en la pestana de al lado', async () => {
    ubicacion();
    sessionStorage.setItem('kamayuk.rentas.pkce.verificador', 'el-de-rentas');

    await entrar();

    const claves = Object.keys(sessionStorage);
    expect(claves.some((c) => c.startsWith('kamayuk.caja.pkce.'))).toBe(true);
    expect(claves.filter((c) => !c.startsWith('kamayuk.caja.') && !c.startsWith('kamayuk.rentas.'))).toEqual([]);
    expect(sessionStorage.getItem('kamayuk.rentas.pkce.verificador')).toBe('el-de-rentas');
  });

  it('las senias se leen al USAR la puerta: lo servido despues de importar el modulo manda', async () => {
    ubicacion();
    await entrar();

    window.__KAMAYUK_CAJA__ = { oidcRealm: 'https://muni.example/realms/kamayuk' };
    const asignar = ubicacion();
    await entrar();

    const destino = new URL(String(asignar.mock.calls[0]?.[0]));
    expect(destino.origin).toBe('https://muni.example');
    expect(urlDeLaCuenta('perfil').startsWith('https://muni.example/realms/kamayuk/account')).toBe(true);
  });
});

describe('el canje deja el token en memoria y en ningun almacenamiento', () => {
  it('canjea el code de vuelta, y ni localStorage ni sessionStorage contienen el token', async () => {
    const asignar = ubicacion();
    await entrar();
    const ida = new URL(String(asignar.mock.calls[0]?.[0]));
    const estado = ida.searchParams.get('state') ?? '';

    ubicacion(`http://localhost:5181/caja/?code=un-codigo&state=${estado}`);
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() =>
        Promise.resolve(Response.json({ access_token: 'el-token-de-la-ventanilla', id_token: 'la-identidad' })),
      ),
    );

    const vuelta = await canjearSiVuelve();

    expect(vuelta.estado).toBe('canjeado');
    expect(token()).toBe('el-token-de-la-ventanilla');
    const guardado = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage });
    expect(guardado).not.toContain('el-token-de-la-ventanilla');
  });
});
