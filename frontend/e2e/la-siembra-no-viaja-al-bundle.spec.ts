import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

import { ACCESOS_MEDIDOS } from '../src/datos/seguridadMedida.ts';
import { SESION_MEDIDA } from '../src/datos/sesionMedida.ts';

/**
 * **La siembra de desarrollo NO viaja al paquete que se publica** (`rentas`#114; aqui #74).
 *
 * Vive en el arnes y no en `vitest` por lo mismo que en `rentas`: lo que hay que medir es el
 * `dist/`, y este arnes ya lo construye (`webServer: yarn build && yarn preview`). No abre navegador.
 *
 * <h2>Que se busca, y por que ESTAS cadenas</h2>
 *
 * `rentas` busca los rotulos de un modulo que no sirve. La ventanilla sirve el unico que publica su
 * backend, asi que busca tres cosas que **solo** pueden venir de la captura:
 *
 *   · **La marca de `ORIGEN_DE_LA_CAPTURA`**, que existe para esto y la busca tambien el `Dockerfile`.
 *   · **Los nombres de acceso en ASCII**, como los guarda el catalogo del backend —«Recaudacion por
 *     area»—. El arbol de la interfaz los escribe con tildes, asi que en el paquete no pueden salir de
 *     ninguna pantalla.
 *   · **El nombre de la cuenta capturada.** La barra lo lee del backend; escrito en el paquete, es la
 *     captura —o un nombre de relleno, que es lo que #44 retiro—.
 *
 * Y se mira el `.map` tambien: lleva el codigo fuente entero de cada modulo que entro en el paquete.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const DIST = join(AQUI, '../dist');

const MARCA = 'captura-medida-de-caja';
const ROTULOS_ASCII = ACCESOS_MEDIDOS.map((a) => a.nombre).filter((n) => /cion\b/.test(n));

function loConstruido(desde = DIST): readonly string[] {
  return readdirSync(desde).flatMap((entrada) => {
    const ruta = join(desde, entrada);
    return statSync(ruta).isDirectory() ? loConstruido(ruta) : [ruta];
  });
}

test('EL CENTINELA: hay un `dist/` que mirar y cadenas que buscar', () => {
  expect(loConstruido().filter((r) => r.endsWith('.js')).length).toBeGreaterThan(0);
  // «Anulacion de recibo», «Avance de recaudacion» y «Recaudacion por area»: las tres en ASCII.
  expect(ROTULOS_ASCII).toHaveLength(3);
  expect(SESION_MEDIDA.nombre.length).toBeGreaterThan(5);
});

test('ni la marca, ni un rotulo de la captura, ni la cuenta capturada estan en el bundle', () => {
  const culpables: string[] = [];
  for (const archivo of loConstruido()) {
    const contenido = readFileSync(archivo, 'utf8');
    for (const cadena of [MARCA, ...ROTULOS_ASCII, SESION_MEDIDA.nombre]) {
      if (contenido.includes(cadena)) culpables.push(`${relative(DIST, archivo)} — «${cadena}»`);
    }
  }
  expect(
    culpables,
    'La captura VIAJO al paquete:\n' +
      `  ${culpables.join('\n  ')}\n\n` +
      '  La siembra solo puede entrar por el `import()` dinamico de `src/arranque.ts`, y solo si\n' +
      '  las dos condiciones que lo guardan se leen AL CONSTRUIR.',
  ).toEqual([]);
});
