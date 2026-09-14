import { expect, test } from '@playwright/test';

import { URL_DEL_ARNES } from '../puerto-del-arnes.mjs';
import { ARBOL } from '../src/pantallas/arbol.ts';
import { abrir, conLaSeguridadContestada } from './instalacion.ts';

/**
 * **La ventanilla no habla con nadie mas que con su API** (#74, ADR-0042), medido en un navegador.
 *
 * ADR-0042 decide que la interfaz de `caja` habla con `/caja/api/v1` y con el emisor, y con ningun
 * otro sistema. Lo vigilan tambien el codigo (`verificaciones/la-frontera-de-caja.test.ts`) y el
 * paquete (el `Dockerfile`); esto mira **lo que el navegador pide de verdad** al recorrer las siete
 * hojas, que es donde una llamada fuera de la frontera hace su dano: con `rentas` apagado.
 *
 * Es la heredera de `cero-red.mjs` de la maqueta V6, que media cero peticiones de conexion. Ya no
 * son cero —la ventanilla lee su API—, y lo que se mide es a donde van.
 */

test.beforeEach(async ({ page }) => {
  await conLaSeguridadContestada(page);
});

test('recorriendo las siete hojas, ninguna peticion sale del propio origen ni de `/caja/`', async ({ page }) => {
  const origen = new URL(URL_DEL_ARNES).origin;
  const fuera: string[] = [];
  const deOtroSistema: string[] = [];
  page.on('request', (peticion) => {
    const url = new URL(peticion.url());
    if (url.protocol.startsWith('http') && url.origin !== origen) fuera.push(peticion.url());
    if (/\/(rentas|catastro|normativa|identidad)\//.test(url.pathname)) deOtroSistema.push(peticion.url());
  });

  const hojas = ARBOL.flatMap((modulo) => modulo.hojas);
  expect(hojas).toHaveLength(7);
  for (const hoja of hojas) {
    await abrir(page, hoja.clave);
    await expect(page.getByRole('heading', { level: 1, name: hoja.rotulo })).toBeVisible();
  }

  expect(deOtroSistema, 'la ventanilla pidio algo a otro sistema').toEqual([]);
  expect(fuera, 'la ventanilla pidio algo fuera de su origen').toEqual([]);
});
