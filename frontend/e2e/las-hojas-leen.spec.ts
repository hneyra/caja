import { expect, test, type Page } from '@playwright/test';

import {
  CIERRE_MEDIDO,
  CONCILIACION_MEDIDA,
  DUPLICADO_MEDIDO,
  PAGOS_MEDIDOS,
  RECIBOS_MEDIDOS,
  TURNO_MEDIDO,
} from '../src/datos/tesoreriaMedida.ts';
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
 * Contesta las lecturas de estas dos hojas y apunta lo que se pidio.
 *
 * `sinDuplicado` deja el duplicado en 404, que es lo que el backend contesta a un numero que no
 * existe: es un estado de verdad y hay que poder mirarlo (#99).
 *
 * El `7` de `/turnos/7/cierre` es el `turnoId` que `TURNO_MEDIDO` acaba de publicar (#97): si la
 * interfaz lo compusiera mal —o se lo inventara— esa ruta no casaria, se contestaria 404 y la
 * peticion no saldria en `pedidas`.
 */
async function contestaLosDatos(pagina: Page, sinDuplicado = false): Promise<string[]> {
  const pedidas: string[] = [];
  await pagina.route('**/caja/api/v1/{recibos,recibos/**,pagos/sin-entregar,turnos/**}', async (ruta) => {
    const url = new URL(ruta.request().url());
    if (url.pathname.endsWith('/duplicado')) {
      pedidas.push(url.pathname);
      await ruta.fulfill({
        status: sinDuplicado ? 404 : 200,
        contentType: 'application/json',
        body: JSON.stringify(sinDuplicado ? { status: 404 } : DUPLICADO_MEDIDO),
      });
      return;
    }
    const cuerpo = url.pathname.endsWith('/recibos')
      ? RECIBOS_MEDIDOS
      : url.pathname.endsWith('/pagos/sin-entregar')
        ? PAGOS_MEDIDOS
        : url.pathname.endsWith('/turnos/del-dia')
          ? TURNO_MEDIDO
          : url.pathname.endsWith('/turnos/7/cierre')
            ? CIERRE_MEDIDO
            : null;
    if (cuerpo === null) {
      await ruta.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      return;
    }
    pedidas.push(url.pathname);
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

/**
 * **El arqueo se pide con el turno que la lectura de antes nombro** (#97), en el navegador.
 *
 * Es la cadena entera y el `turnoId` no esta escrito en `src/`: sale de `/turnos/del-dia`.
 */
test('«cierre-caja» encadena su turno con el arqueo de ese turno, y dibuja sus bloques', async ({ page }) => {
  const pedidas = await contestaLosDatos(page);
  await abrir(page, 'cierre-caja');

  await expect(page.getByRole('row').filter({ hasText: PAGOS_MEDIDOS[0]?.pagoId ?? '?' })).toBeVisible();
  // El arqueo del turno que `/turnos/del-dia` nombro: su neto, formateado por `@kamayuk/formato`.
  await expect(page.getByText('S/ 1,842.60').first()).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'EFECTIVO' })).toBeVisible();
  // Y lo que nadie conto NO se pinta como un cero.
  await expect(page.getByText('sin declarar').first()).toBeVisible();
  await expect(page.getByText('sin turno')).toHaveCount(0);

  expect([...pedidas].sort()).toEqual([
    '/caja/api/v1/pagos/sin-entregar',
    '/caja/api/v1/turnos/7/cierre',
    '/caja/api/v1/turnos/del-dia',
  ]);
});

/**
 * **La conciliacion del dia: elegirlo, pedirlo y leerlo, en un navegador de verdad** (#98).
 *
 * <h2>Por que este camino tiene que estar aqui y no puede quedarse en jsdom</h2>
 *
 * Porque lo que se mide es **el gesto**: abrir el calendario, pulsar un dia, y que de ahi salga un
 * `?fecha=aaaa-mm-dd` en la barra de direcciones y una peticion con ese mismo dia. El calendario
 * vive dentro de una capa de Radix, y abrir una capa bajo jsdom cuesta minutos y caduca
 * —`kamayuk-lib`#94 lo midio de tres maneras y lo dejo escrito—. En Chromium cuesta milisegundos.
 *
 * Es ademas la unica prueba del producto que recorre entero lo que #94 monto: definicion -> campo
 * -> ruta -> lectura -> tabla.
 */
test('«cierre-caja» no concilia hasta que se elige un dia, y entonces lo pide con el', async ({ page }) => {
  const pedidas = await contestaLosDatos(page);
  await page.route('**/caja/api/v1/conciliacion**', async (ruta) => {
    const url = new URL(ruta.request().url());
    pedidas.push(`${url.pathname}${url.search}`);
    await ruta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CONCILIACION_MEDIDA) });
  });
  await abrir(page, 'cierre-caja');

  // Sin dia elegido: el bloque dice que lo espera, y NO se ha pedido la conciliacion.
  await expect(page.getByText('Elija arriba el día que quiere conciliar y aquí saldrá su cuadre.')).toBeVisible();
  expect(pedidas.filter((p) => p.startsWith('/caja/api/v1/conciliacion'))).toEqual([]);
  // Y no se pinta ningun cero mientras tanto.
  await expect(page.getByRole('row').filter({ hasText: 'mercados' })).toHaveCount(0);

  // El calendario del campo, y un dia de el.
  await page.getByRole('button', { name: 'dd/mm/aaaa' }).click();
  await page.getByRole('gridcell').filter({ hasText: /^15$/ }).first().click();

  // Lo que viaja es ISO, y lo que se lee es dd/mm/aaaa.
  await expect(page).toHaveURL(/[?&]fecha=\d{4}-\d{2}-\d{2}/);
  const elegida = new URL(page.url().replace('#/', '')).searchParams.get('fecha') ?? '';
  expect(elegida).toMatch(/^\d{4}-\d{2}-15$/);
  await expect(page.getByRole('button', { name: `15/${elegida.slice(5, 7)}/${elegida.slice(0, 4)}` })).toBeVisible();

  // Y la peticion salio con ese mismo dia, una sola vez.
  await expect
    .poll(() => pedidas.filter((p) => p.startsWith('/caja/api/v1/conciliacion')))
    .toEqual([`/caja/api/v1/conciliacion?fecha=${elegida}`]);

  // La tabla se llena, y la linea del origen que no contesto dice por que en vez de un cero.
  const sinContestar = page.getByRole('row').filter({ hasText: 'mercados' });
  await expect(sinContestar).toBeVisible();
  await expect(sinContestar).toContainText('El sistema de origen no contesto: Connection refused');
  // Con los dos filtros: «rentas» tambien es el destino de un pago sin entregar, dos bloques mas
  // arriba, y una sola condicion casa con las dos filas.
  await expect(page.getByRole('row').filter({ hasText: 'rentas' }).filter({ hasText: 'NO CUADRA' })).toContainText(
    'S/ 1,842.60',
  );
});
