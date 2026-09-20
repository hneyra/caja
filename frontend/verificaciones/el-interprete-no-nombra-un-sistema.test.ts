import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ARBOL, accionesDe } from '../src/pantallas/arbol.ts';
import type { Modulo } from '../src/pantallas/tipos.ts';

/**
 * **El interprete de `@kamayuk/ui` no nombra la ventanilla** (#74; en `rentas` desde #88).
 *
 * <h2>Por que esta guarda vive en el CONSUMIDOR y mira la libreria</h2>
 *
 * En `rentas` el interprete estaba en su propio `src/pantallas`, y esta guarda lo barria alli. Desde
 * `kamayuk-lib`#27 vive en la libreria, que ya tiene su `sin-suponer-un-sistema` con el vocabulario
 * tributario y los prefijos de API. **Lo que la libreria no puede saber es el arbol de cada
 * sistema**: que «Tesorería», `TESORERIA` o `'cierre-caja'` son de `caja`. Esa mitad solo la puede
 * comprobar quien tiene el arbol, y por eso se queda aqui, leyendo el interprete por el enlace.
 *
 * Los comentarios se omiten: los docblocks del interprete cuentan de que sistema salio, y esa
 * procedencia es la medicion que se hizo.
 */

/** Donde resuelve `@kamayuk/ui` desde este arbol, que es el clon hermano. */
const INTERPRETE = join(dirname(createRequire(import.meta.url).resolve('@kamayuk/ui')), 'interprete');

function archivosDelInterprete(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) return archivosDelInterprete(ruta);
    if (!/\.tsx?$/.test(e.name) || e.name.includes('.test.')) return [];
    return [ruta];
  });
}

const ARCHIVOS = archivosDelInterprete(INTERPRETE);

/** Sin comentarios de bloque ni de linea. Ver el javadoc. */
const sinComentarios = (fuente: string): string =>
  fuente.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ');

/**
 * Lo que el interprete no puede nombrar, derivado del arbol mas lo estructural.
 *
 * Los rotulos entran **enteros y entre limites de palabra**: «Panel» a secas es una palabra comun
 * y prohibirla suelta daria falsos rojos en cualquier comentario tecnico.
 */
const PROHIBIDO: readonly { readonly que: string; readonly patron: RegExp }[] = [
  ...ARBOL.map((m) => ({ que: `el modulo «${m.rotulo}»`, patron: new RegExp(`['"\`]${escapar(m.rotulo)}['"\`]`) })),
  ...ARBOL.map((m) => ({ que: `el codigo de modulo «${m.codigo}»`, patron: new RegExp(`\\b${escapar(m.codigo)}\\b`) })),
  ...ARBOL.flatMap((m) =>
    m.hojas.map((h) => ({ que: `la clave de hoja «${h.clave}»`, patron: new RegExp(`['"\`]${escapar(h.clave)}['"\`]`) })),
  ),
  // Y las claves de acto (#100): `abre`, la `clave` del acto y lo que `<Pantalla actos>` atiende
  // son la misma cadena, y es de este sistema. El interprete la recibe; no la conoce.
  ...(ARBOL as readonly Modulo[]).flatMap((m) =>
    m.hojas.flatMap((h) =>
      accionesDe(h).map((a) => ({
        que: `la clave de acto «${a.clave}»`,
        patron: new RegExp(`['"\`]${escapar(a.clave)}['"\`]`),
      })),
    ),
  ),
  { que: 'el prefijo de la API de un sistema', patron: /\/(rentas|catastro|caja|normativa|identidad)\/api/i },
  { que: 'el global de configuracion de un sistema', patron: /__KAMAYUK_[A-Z]+__/ },
  {
    que: 'vocabulario tributario, que es negocio de un contexto (ADR-0030 §4)',
    // Sin `\b` por delante: el limite de palabra no existe dentro de camelCase, y es justo ahi
    // donde el vocabulario se cuela de verdad —`totalDeArbitrios`—. Lo aprendio la libreria.
    patron: /arbitrios?\b|alicuotas?\b|autovaluo\b|predial\b|padron\b|padrón\b|contribuyentes?\b/i,
  },
];

function escapar(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('el interprete no nombra un sistema', () => {
  it('EL CENTINELA: hay archivos que barrer y palabras que prohibir', () => {
    // Sin esto, renombrar el directorio dejaria las comprobaciones de abajo recorriendo la lista
    // vacia y pasando en verde — que es como una guarda se queda sin sujeto sin que nadie la
    // borre. Ya paso en este repositorio con el artboard (#78).
    expect(ARCHIVOS.length, 'no se leyo ni un archivo del interprete').toBeGreaterThanOrEqual(6);
    // Un modulo + un codigo + seis hojas + una clave de acto + las tres estructurales (#100).
    expect(PROHIBIDO.length, 'la lista prohibida vino vacia').toBeGreaterThanOrEqual(12);
  });

  it('ninguno nombra un modulo, una hoja, una ruta ni un tributo', () => {
    const hallazgos = ARCHIVOS.flatMap((ruta) => {
      const codigo = sinComentarios(readFileSync(ruta, 'utf8'));
      return PROHIBIDO.filter((p) => p.patron.test(codigo)).map(
        (p) => `  ${ruta}: nombra ${p.que}`,
      );
    });

    expect(
      hallazgos,
      'El interprete dejo de ser comun:\n' +
        `${hallazgos.join('\n')}\n\n` +
        '  La forma `[titulo, nota, campos, tabla]` es del PRODUCTO y vive en `@kamayuk/ui`. Lo que\n' +
        '  sabe de la ventanilla entra como dato, no escrito dentro.',
    ).toEqual([]);
  });
});
