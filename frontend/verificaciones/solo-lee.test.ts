// @vitest-environment node
//
// Lee archivos del disco. No hay DOM que necesitar.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { eleccionDe, seEscribe, tipoDe } from '@kamayuk/ui';

import * as cliente from '../src/api/cliente.ts';
import { CATALOGO } from '../src/catalogo.ts';
import { PANTALLAS } from '../src/pantallas/definiciones/index.ts';
import type { Pantalla } from '../src/pantallas/tipos.ts';
import { RAIZ } from './raiz.ts';

/**
 * **La ventanilla solo lee** (#74, ADR-0040).
 *
 * ADR-0040 acepto conectar la ventanilla **para leer**. Cobrar, cerrar el turno y anular estan
 * declarados en el arbol y no se llaman. Lo que hace cierta esa frase no es una intencion: son tres
 * cosas, y esta guarda mira las tres —mas la barrera de tipo de `verificaciones/tipos/`, que hace que
 * `leer` no acepte un `metodo`—.
 *
 *   · **`api/cliente.ts` no publica un camino para escribir.** Solo `leer`, `PREFIJO` y `ErrorDeLaApi`.
 *   · **Nada de `src/` compone una escritura**: ni un `metodo:` ni un `solicitar(` fuera del cliente.
 *   · **Ninguna pantalla ofrece «Guardar»**: todos los destinos del catalogo tienen `seEscribe` falso,
 *     que es lo que decide las acciones del pie del armazon.
 *
 * <h2>Y desde #98 hay UN campo de entrada, que no es una escritura</h2>
 *
 * El dia de la conciliacion, en `cierre-caja`. Lo que escribe es **la direccion de la hoja**
 * (`eleccion.enLaRuta`, `kamayuk-lib`#94), y de ahi sale el `?fecha=` de una LECTURA: no hay ningun
 * `POST` detras. `catalogo.ts` no lo cuenta para `seEscribe` por eso, y la tercera prueba de aqui
 * mide **las dos mitades** — que el que lo declara no cuenta, y que uno que no lo declarara SI
 * contaria—. Sin la segunda mitad, la regla podria haberse escrito como «ningun campo cuenta» y
 * nadie lo notaria hasta que una pantalla ganara un formulario de verdad.
 *
 * El dia que se decida escribir en el backend, esta guarda se cambia en el mismo PR que el ADR que
 * lo decida.
 */

function fuentes(desde = join(RAIZ, 'src')): readonly string[] {
  return readdirSync(desde).flatMap((entrada) => {
    const ruta = join(desde, entrada);
    if (statSync(ruta).isDirectory()) return fuentes(ruta);
    return /\.tsx?$/.test(entrada) && !/\.test\.tsx?$/.test(entrada) ? [ruta] : [];
  });
}

const sinComentarios = (texto: string) => texto.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('la ventanilla solo lee (ADR-0040)', () => {
  it('el cliente publica leer, su prefijo y su error, y NADA con que escribir', () => {
    expect(Object.keys(cliente).sort()).toEqual(['ErrorDeLaApi', 'PREFIJO', 'leer']);
  });

  it('ningun archivo de `src/` compone una peticion que escriba', () => {
    const culpables = fuentes().flatMap((ruta) => {
      const codigo = sinComentarios(readFileSync(ruta, 'utf8'));
      const donde = relative(RAIZ, ruta);
      return [
        ...(/\bmetodo\s*:/.test(codigo) ? [`${donde}: \`metodo:\``] : []),
        ...(/\bsolicitar\s*\(/.test(codigo) && !donde.endsWith('api/cliente.ts') ? [`${donde}: \`solicitar(\``] : []),
      ];
    });
    expect(culpables.length, 'el barrido no tiene nada que barrer').toBe(0);
    expect(fuentes().length).toBeGreaterThan(10);
  });

  it('ningun destino del catalogo se escribe: el pie no ofrece Guardar', () => {
    const destinos = CATALOGO.flatMap((m) => m.destinos);
    expect(destinos).toHaveLength(7);
    expect(destinos.filter((d) => d.seEscribe).map((d) => d.clave)).toEqual([]);
  });

  it('el unico campo de entrada de la ventanilla escribe en la RUTA, no en el backend (#98)', () => {
    const campos = Object.entries(PANTALLAS as Record<string, Pantalla>).flatMap(([clave, pantalla]) =>
      pantalla.bloques.flatMap((bloque, b) =>
        bloque.campos.map((campo, c) => ({ donde: `${clave} ${String(b)}|${String(c)}`, campo })),
      ),
    );
    const deEntrada = campos.filter(({ campo }) => seEscribe(tipoDe(campo.tipo)));

    // EL CENTINELA: hay exactamente uno, y es el dia de la conciliacion. Con cero, lo de abajo
    // pasaria en verde sin mirar nada.
    expect(deEntrada.map(({ donde }) => donde)).toEqual(['cierre-caja 2|0']);
    // Y declara donde vive lo que se elige en el: eso es lo que lo saca de la cuenta de `seEscribe`.
    expect(deEntrada.map(({ campo }) => eleccionDe(campo)?.enLaRuta)).toEqual(['fecha']);
    // La otra mitad de la regla: uno que NO lo declarara si contaria como escritura.
    expect(seEscribe(tipoDe('d')) && eleccionDe({ etiqueta: 'Fecha', tipo: 'd' }) === undefined).toBe(true);
  });
});
