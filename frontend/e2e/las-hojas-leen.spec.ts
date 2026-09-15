import { expect, test, type Page } from '@playwright/test';

import { PAGOS_MEDIDOS, RECIBOS_MEDIDOS } from '../src/datos/tesoreriaMedida.ts';
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

async function contestaLosDatos(pagina: Page): Promise<string[]> {
  const pedidas: string[] = [];
  await pagina.route('**/caja/api/v1/{recibos,pagos/sin-entregar}**', async (ruta) => {
    const url = new URL(ruta.request().url());
    pedidas.push(url.pathname);
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

test('«cierre-caja» dibuja los pagos sin entregar, y el arqueo dice que espera al turno', async ({ page }) => {
  const pedidas = await contestaLosDatos(page);
  await abrir(page, 'cierre-caja');

  await expect(page.getByRole('row').filter({ hasText: PAGOS_MEDIDOS[0]?.pagoId ?? '?' })).toBeVisible();
  await expect(page.getByText('sin turno').first()).toBeVisible();
  expect(pedidas).toEqual(['/caja/api/v1/pagos/sin-entregar']);
});
