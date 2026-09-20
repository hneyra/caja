import { expect, test, type Page } from '@playwright/test';

import { DUPLICADO_MEDIDO, PAGOS_MEDIDOS, RECIBOS_MEDIDOS } from '../src/datos/tesoreriaMedida.ts';
import { abrir, conLaSeguridadContestada } from './instalacion.ts';

/**
 * **Una hoja que lee dibuja lo que le contestan, en Chromium** (#84).
 *
 * `src/datos/conectores.test.ts` mide el reparto y `useDatosDeLaHoja.test.tsx` los estados, los dos
 * en jsdom. Esto mide la cadena entera sobre el `dist/`: la peticion sale a su ruta, la respuesta
 * llega al interprete y las celdas se ven donde dice la definicion.
 *
 * Las respuestas son las capturas de `tesoreriaMedida.ts`, **contestadas solo en este archivo**:
 * `instalacion.ts` sigue contestando 404 a todo lo que no es seguridad, a proposito.
 *
 * No importa `conectores.ts`: el cargador de Playwright no aplica el `dedupe` de Vite, y ese archivo
 * arrastra `@kamayuk/ui`. Por eso lo esperado se escribe aqui, y es lo que un cajero leeria.
 */

/**
 * Contesta las tres lecturas de estas dos hojas y apunta lo que se pidio.
 *
 * `sinDuplicado` deja el duplicado en 404, que es lo que el backend contesta a un numero que no
 * existe: es un estado de verdad y hay que poder mirarlo (#99).
 */
async function contestaLosDatos(pagina: Page, sinDuplicado = false): Promise<string[]> {
  const pedidas: string[] = [];
  await pagina.route('**/caja/api/v1/{recibos,recibos/**,pagos/sin-entregar}', async (ruta) => {
    const url = new URL(ruta.request().url());
    pedidas.push(url.pathname);
    if (url.pathname.endsWith('/duplicado')) {
      await ruta.fulfill({
        status: sinDuplicado ? 404 : 200,
        contentType: 'application/json',
        body: JSON.stringify(sinDuplicado ? { status: 404 } : DUPLICADO_MEDIDO),
      });
      return;
    }
    const cuerpo = url.pathname.endsWith('/recibos') ? RECIBOS_MEDIDOS : PAGOS_MEDIDOS;
    await ruta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cuerpo) });
  });
  return pedidas;
}

test.beforeEach(async ({ page }) => {
  await conLaSeguridadContestada(page);
});

test('«duplicado-recibo» dibuja los recibos con la hora de Lima y dice de cuantos son', async ({ page }) => {
  const pedidas = await contestaLosDatos(page);
  await abrir(page, 'duplicado-recibo');

  const primera = page.getByRole('row').filter({ hasText: '001-000123' });
  await expect(primera).toBeVisible();
  // 02:04 del 16 en UTC: la celda dice las 21:04 del 15, que es cuando se cobro en la ventanilla.
  await expect(primera).toContainText('15/03/2026 21:04');
  await expect(page.getByText('2 / 356')).toBeVisible();
  expect(pedidas).toEqual(['/caja/api/v1/recibos']);
});

/**
 * **Elegir una fila y que el segundo bloque se llene** (#99), en el navegador.
 *
 * Es la cadena entera: el boton de la fila escribe el numero en la ruta, la ruta hace que salga
 * `GET /recibos/{nro}/duplicado` —**sin `?formato=`**— y lo que contesta llega a los ocho campos y
 * a la tabla de lineas.
 */
test('«duplicado-recibo»: sin elegir dice «sin elegir», y al elegir una fila se llena el recibo', async ({ page }) => {
  const pedidas = await contestaLosDatos(page);
  await abrir(page, 'duplicado-recibo');

  // Sin elegir: los ocho campos con su palabra, y ni una cifra del recibo.
  await expect(page.getByText('sin elegir').first()).toBeVisible();
  await expect(page.getByText('Cajero de la prueba')).toHaveCount(0);
  expect(pedidas).toEqual(['/caja/api/v1/recibos']);

  await page.getByRole('row').filter({ hasText: '001-000123' })
    .getByRole('button', { name: 'Ver el duplicado' })
    .click();

  await expect(page.getByText('Cajero de la prueba')).toBeVisible();
  expect(pedidas).toEqual(['/caja/api/v1/recibos', '/caja/api/v1/recibos/001-000123/duplicado']);
  // El numero elegido esta en la direccion: recargar —o pasar el enlace— ensena el mismo recibo.
  expect(page.url()).toContain('#/duplicado-recibo/001-000123');
  // Las dos lineas, con los nulos de la que no es una tasa marcados y no puestos a cero.
  const deTributo = page.getByRole('row').filter({ hasText: 'TRIB-01 · PAGO' });
  await expect(deTributo).toBeVisible();
  await expect(deTributo.getByRole('cell').nth(1)).toHaveText('—');
  await expect(deTributo.getByRole('cell').nth(2)).toHaveText('—');
  // Y la fila elegida se ve: es la que lleva `aria-current`.
  await expect(page.locator('tr[aria-current="true"]')).toHaveCount(1);
  await expect(page.locator('tr[aria-current="true"]')).toContainText('001-000123');
});

test('«duplicado-recibo»: con el recibo en la direccion se pide al abrir, y un 404 no vacia la lista', async ({ page }) => {
  const pedidas = await contestaLosDatos(page, true);
  await abrir(page, 'duplicado-recibo/001-999999');

  await expect(page.getByText('no está').first()).toBeVisible();
  expect(pedidas).toEqual(['/caja/api/v1/recibos', '/caja/api/v1/recibos/001-999999/duplicado']);
  // La lista sigue donde estaba: la que fallo es la otra lectura.
  await expect(page.getByRole('row').filter({ hasText: '001-000123' })).toBeVisible();
});

test('«cierre-caja» dibuja los pagos sin entregar, y el arqueo dice que espera al turno', async ({ page }) => {
  const pedidas = await contestaLosDatos(page);
  await abrir(page, 'cierre-caja');

  await expect(page.getByRole('row').filter({ hasText: PAGOS_MEDIDOS[0]?.pagoId ?? '?' })).toBeVisible();
  await expect(page.getByText('sin turno').first()).toBeVisible();
  expect(pedidas).toEqual(['/caja/api/v1/pagos/sin-entregar']);
});
