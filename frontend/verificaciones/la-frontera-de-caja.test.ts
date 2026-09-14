// @vitest-environment node
//
// Lee archivos del disco. No hay DOM que necesitar.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { RAIZ } from './raiz.ts';

/**
 * **La ventanilla no cruza su frontera, y se mira en el codigo** (#74, ADR-0042).
 *
 * ADR-0042 decide que la interfaz de `caja` habla con `/caja/api/v1` y con el emisor, y con nadie
 * mas: `rentas` apagado no puede dejar la ventanilla sin pantalla. Y el `CLAUDE.md` de este
 * repositorio da la definicion practica de la otra mitad: **la caja no conoce tributos**, y el dia
 * que los conozca habra dejado de servir para cobrar un puesto de mercado.
 *
 * Esta guarda mira el codigo servido —`src/` sin comentarios, `vite.config.ts`, `nginx.conf`,
 * `index.html` y `public/`— y prohibe cuatro cosas. Las mismas se miran tambien en el paquete (el
 * `Dockerfile`) y en un navegador (`e2e/la-frontera.spec.ts`); aqui salen antes, en `yarn verificar`.
 *
 * **`tributo` no se prohibe**, y es a proposito: el backend lo publica en la linea de un recibo y en
 * el avance de recaudacion (`FilaDeTributo`). Lo prohibido es el vocabulario del libro de `rentas`,
 * no la palabra con que el backend de esta caja nombra un campo que ya existe.
 */

const REGLAS: readonly { readonly clave: string; readonly patron: RegExp; readonly porQue: string }[] = [
  {
    clave: 'api-de-otro-sistema',
    patron: /\/(rentas|catastro|normativa|identidad)\/api\b/,
    porQue: 'la ventanilla habla con `/caja/api/v1` y con nadie mas (ADR-0042)',
  },
  {
    clave: 'senas-de-otro-sistema',
    patron: /__KAMAYUK_(?!CAJA__)[A-Z]+__/,
    porQue: 'las senias del ambiente de otra interfaz no son las de esta',
  },
  {
    clave: 'codigo-de-otro-repositorio',
    patron: /from\s+'(?:\.\.\/)+(?:rentas|catastro|normativa|identidad)\//,
    porQue: 'un import a otro clon hermano es un acoplamiento que el build no ve',
  },
  {
    clave: 'vocabulario-de-rentas',
    // Sin `\b` por delante: dentro de camelCase no hay limite de palabra, y es ahi donde se cuela.
    patron: /arbitrios?\b|alicuotas?\b|autovaluo\b|predial\b|padron\b|padrón\b|contribuyentes?\b/i,
    porQue: 'la caja no conoce tributos: el dia que los conozca, deja de servir para un puesto de mercado',
  },
];

/** Todos los archivos de un directorio, recursivo. */
function todos(desde: string): readonly string[] {
  return readdirSync(desde).flatMap((entrada) => {
    const ruta = join(desde, entrada);
    return statSync(ruta).isDirectory() ? todos(ruta) : [ruta];
  });
}

/** El codigo sin comentarios: los docblocks explican de donde salio cada pieza, y eso es medicion. */
function codigoDe(ruta: string): string {
  const texto = readFileSync(ruta, 'utf8');
  if (ruta.endsWith('nginx.conf')) return texto.replace(/#.*$/gm, ' ');
  if (ruta.endsWith('.html')) return texto.replace(/<!--[\s\S]*?-->/g, ' ');
  return texto.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const SERVIDO = [
  ...todos(join(RAIZ, 'src')).filter((r) => /\.(tsx?|css|json)$/.test(r) && !/\.test\.tsx?$/.test(r)),
  ...todos(join(RAIZ, 'public')),
  join(RAIZ, 'vite.config.ts'),
  join(RAIZ, 'nginx.conf'),
  join(RAIZ, 'index.html'),
];

describe('la ventanilla no cruza su frontera', () => {
  it('EL CENTINELA: hay codigo servido que barrer', () => {
    expect(SERVIDO.length, 'el barrido no encontro ni un archivo').toBeGreaterThan(20);
  });

  it('LA MUESTRA: cada regla dispara sobre el codigo que la viola', () => {
    // Una regla que no puede fallar no protege nada: se ejerce cada una sobre su muestra.
    const muestra = codigoDe(join(RAIZ, 'verificaciones/muestras-de-las-guardas/frontera-cruzada.ts.txt'));
    expect(REGLAS.filter((r) => !r.patron.test(muestra)).map((r) => r.clave)).toEqual([]);
  });

  it.each(REGLAS.map((r) => [r.clave, r] as const))('no se escribe: %s', (_clave, regla) => {
    const hallazgos = SERVIDO.filter((ruta) => regla.patron.test(codigoDe(ruta))).map((ruta) => relative(RAIZ, ruta));
    expect(hallazgos, `${regla.porQue}.\n  Donde aparece: ${hallazgos.join(', ')}`).toEqual([]);
  });
});
