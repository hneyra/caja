import { expect, test } from '@playwright/test';

import { ARBOL } from '../src/pantallas/arbol.ts';
import type { ClaveDeHoja } from '../src/pantallas/arbol.ts';
import { bloquesDe, pantallaDe } from '../src/pantallas/definiciones/index.ts';
import { abrir, conLaSeguridadContestada } from './instalacion.ts';

/**
 * **Las seis hojas de la ventanilla se abren y se ven, en Chromium** (#74, #100).
 *
 * `verificaciones/los-destinos-se-recorren.test.tsx` ya las recorre en jsdom. Esto mide lo que jsdom
 * no puede: que se VEAN —con caja y con el CSS de la libreria aplicado—, sobre el `dist/` de verdad.
 *
 * Importa `ARBOL` y no `CATALOGO` a proposito, como `rentas`: el cargador de Playwright no aplica el
 * `dedupe` de Vite, y `catalogo.ts` arrastra `@kamayuk/ui` con su React.
 */

test.beforeEach(async ({ page }) => {
  await conLaSeguridadContestada(page);
});

const DESTINOS = ARBOL.flatMap((modulo) => modulo.hojas.map((hoja) => ({ destino: hoja })));

test('EL CENTINELA: hay seis destinos que recorrer', () => {
  // Seis desde #100: `anulacion-recibo` dejo de ser una hoja, y anular se ofrece como accion
  // dentro de `duplicado-recibo` (ADR-0044).
  expect(DESTINOS).toHaveLength(6);
});

for (const { destino } of DESTINOS) {
  test(`«${destino.clave}» — ${destino.rotulo} se abre y se ve`, async ({ page }) => {
    await abrir(page, destino.clave);

    const titulo = page.getByRole('heading', { level: 1, name: destino.rotulo });
    await expect(titulo, `«${destino.clave}» no abrio por su hash`).toBeVisible();

    const definicion = pantallaDe(destino.clave as ClaveDeHoja);
    // Los BLOQUES: un acto no se dibuja con la pantalla —solo existe abierto— y su titulo no es un
    // encabezado de la pagina (#100).
    for (const bloque of bloquesDe(definicion)) {
      await expect(page.getByRole('heading', { level: 2, name: bloque.titulo })).toBeVisible();
    }

    // Visible de verdad: con caja. Una pantalla con altura cero tiene su DOM perfecto y no se ve.
    const caja = await titulo.boundingBox();
    expect(caja?.height ?? 0, `el titulo de «${destino.clave}» no ocupa nada`).toBeGreaterThan(10);
  });
}
