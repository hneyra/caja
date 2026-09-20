// @vitest-environment node
//
// Lee archivos del disco. No hay DOM que necesitar.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

import { eleccionDe, seEscribe, tipoDe } from '@kamayuk/ui';

import * as cliente from '../src/api/cliente.ts';
import { CATALOGO } from '../src/catalogo.ts';
import { RUTA_DE_LA_ANULACION } from '../src/datos/laAnulacion.ts';
import { HOJAS, accionesDe, operacionesDe } from '../src/pantallas/arbol.ts';
import { PANTALLAS, actosDe, bloquesDe, pantallaDe } from '../src/pantallas/definiciones/index.ts';
import type { Pantalla } from '../src/pantallas/tipos.ts';
import { RAIZ } from './raiz.ts';

/**
 * **La ventanilla lee, y escribe EN UN SITIO** (#74, #100; ADR-0040 y ADR-0044).
 *
 * <h2>Lo que esta guarda decia, y por que cambia aqui y no despues</h2>
 *
 * Hasta #100 decia «la ventanilla solo lee», y era cierto: ADR-0040 acepto conectarla para leer, y
 * cobrar, cerrar y anular estaban declaradas y no se llamaban. ADR-0044 amplia aquella decision con
 * **una** escritura —la anulacion de un cobro, como accion del recibo elegido—, y esta guarda
 * cambia **en el mismo PR que el ADR**. Aflojarla sin mas —borrar el barrido, o taparlo con una
 * excepcion generica— habria dejado la interfaz sin nadie que vigile la segunda escritura; lo que
 * se hace es apretarla: ahora nombra **cual** es la que se llama y **desde donde**.
 *
 * <h2>Las cinco cosas que mide</h2>
 *
 *   · **`api/cliente.ts` publica cuatro nombres y no cinco.** `leer`, `escribir`, `PREFIJO` y
 *     `ErrorDeLaApi`. `solicitar` de la libreria no sale de ese archivo.
 *   · **Un solo archivo de `src/` escribe.** `datos/laAnulacion.ts`. Cualquier otro que nombre
 *     `escribir(`, `metodo:` o `solicitar(` sale en rojo con su ruta.
 *   · **El pie del armazon sigue sin ofrecer «Guardar»**: todos los destinos tienen `seEscribe`
 *     falso. Lo que escribe es el acto, que tiene su primario, su confirmacion y su observacion.
 *   · **El unico campo de entrada de un BLOQUE escribe en la ruta, no en el backend** (#98): el dia
 *     de la conciliacion. `catalogo.ts` no lo cuenta para `seEscribe` por eso, y la prueba mide
 *     **las dos mitades** —que el que lo declara no cuenta, y que uno que no lo declarara SI
 *     contaria—. Sin la segunda, la regla podria haberse escrito como «ningun campo cuenta» y nadie
 *     lo notaria hasta que una pantalla ganara un formulario de verdad.
 *   · **De las escrituras que el arbol declara, se llama UNA.** Las demas —cobrar, cobrar tasas,
 *     cerrar el turno, explicar un pago— siguen declaradas y sin llamarse, y eso se comprueba
 *     buscando su ruta en el codigo servido.
 */

function fuentes(desde = join(RAIZ, 'src')): readonly string[] {
  return readdirSync(desde).flatMap((entrada) => {
    const ruta = join(desde, entrada);
    if (statSync(ruta).isDirectory()) return fuentes(ruta);
    return /\.tsx?$/.test(entrada) && !/\.test\.tsx?$/.test(entrada) ? [ruta] : [];
  });
}

const sinComentarios = (texto: string) => texto.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** La ruta relativa al frontend, con barras, sea cual sea el sistema de archivos. */
const donde = (ruta: string) => relative(RAIZ, ruta).split(sep).join('/');

/** Donde vive el cliente, y donde vive la unica escritura. Se escriben una vez. */
const EL_CLIENTE = 'src/api/cliente.ts';
const LA_ESCRITURA = 'src/datos/laAnulacion.ts';

describe('la ventanilla lee, y escribe en un sitio (ADR-0040, ADR-0044)', () => {
  it('el cliente publica leer, escribir, su prefijo y su error, y nada mas', () => {
    expect(Object.keys(cliente).sort()).toEqual(['ErrorDeLaApi', 'PREFIJO', 'escribir', 'leer']);
  });

  it('UN solo archivo de `src/` compone una peticion que escribe, y es el declarado', () => {
    const culpables = fuentes().flatMap((ruta) => {
      const codigo = sinComentarios(readFileSync(ruta, 'utf8'));
      const suyo = donde(ruta);
      if (suyo === EL_CLIENTE || suyo === LA_ESCRITURA) return [];
      return [
        ...(/\bmetodo\s*:/.test(codigo) ? [`${suyo}: \`metodo:\``] : []),
        ...(/\bsolicitar\s*\(/.test(codigo) ? [`${suyo}: \`solicitar(\``] : []),
        ...(/\bescribir\s*[<(]/.test(codigo) ? [`${suyo}: \`escribir(\``] : []),
      ];
    });
    expect(
      culpables,
      'la escritura de esta interfaz vive en `datos/laAnulacion.ts` y en ningun otro sitio (ADR-0044)',
    ).toEqual([]);
    expect(fuentes().length).toBeGreaterThan(10);
  });

  it('EL CENTINELA: los dos archivos declarados existen y dicen lo que se les supone', () => {
    // Sin esto, renombrar cualquiera de los dos convierte el barrido de arriba en «nadie escribe»,
    // que es verde y es falso.
    const rutas = fuentes().map(donde);
    expect(rutas).toContain(EL_CLIENTE);
    expect(rutas).toContain(LA_ESCRITURA);
    expect(sinComentarios(readFileSync(join(RAIZ, LA_ESCRITURA), 'utf8'))).toMatch(/\bescribir\s*[<(]/);
  });

  it('ningun destino del catalogo se escribe: el pie del armazon no ofrece Guardar', () => {
    const destinos = CATALOGO.flatMap((m) => m.destinos);
    expect(destinos).toHaveLength(6);
    expect(destinos.filter((d) => d.seEscribe).map((d) => d.clave)).toEqual([]);
  });

  /**
   * **El unico campo de entrada de un BLOQUE escribe en la ruta, no en el backend** (#98).
   *
   * Se recorren los bloques y **no las piezas** (#100): el acto de la anulacion tiene tres campos
   * de entrada y SI escriben en el backend, pero no se envian desde el pie del armazon — los envia
   * su propio primario, con su confirmacion y su observacion—. Contarlos aqui pondria «Guardar» en
   * el pie de `duplicado-recibo` para una escritura que ya tiene su boton.
   */
  it('el unico campo de entrada de un BLOQUE escribe en la RUTA, no en el backend (#98)', () => {
    const campos = Object.entries(PANTALLAS as Record<string, Pantalla>).flatMap(([clave, pantalla]) =>
      bloquesDe(pantalla).flatMap((bloque, b) =>
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

  /**
   * Y la tercera mitad, que #100 anade: **los campos del acto SI son de entrada**, y estan fuera de
   * la cuenta por vivir en un acto y no por una excepcion tallada para ellos.
   *
   * Sin esto, `bloquesDe` podria dejar de ver una pieza entera —un formulario nuevo, en otro sitio—
   * y la cuenta de arriba seguiria dando uno.
   */
  it('y los del acto que anula tambien son de entrada: estan fuera por ser un acto (#100)', () => {
    const delActo = actosDe(pantallaDe('duplicado-recibo')).flatMap((acto) => acto.campos);
    expect(delActo.filter((campo) => seEscribe(tipoDe(campo.tipo))).map((campo) => campo.nombre)).toEqual([
      'motivo',
      'autorizadoPor',
      'nDeMemorando',
    ]);
    // Y ninguno elige nada en la ruta: no son filtros, son lo que viaja en el cuerpo del `POST`.
    expect(delActo.map((campo) => eleccionDe(campo))).toEqual(delActo.map(() => undefined));
  });
});

describe('de las escrituras que el arbol declara, se llama UNA', () => {
  const escrituras = HOJAS.flatMap((hoja) => operacionesDe(hoja).filter((o) => o.verbo === 'POST'));
  /** Donde se declaran las rutas del arbol. Ahi TIENEN que estar: es el arbol. */
  const EL_ARBOL = 'src/pantallas/arbol.ts';
  const servido = fuentes()
    .map((ruta) => ({ suyo: donde(ruta), codigo: sinComentarios(readFileSync(ruta, 'utf8')) }))
    .filter(({ suyo }) => suyo !== EL_ARBOL);

  it('EL CENTINELA: el arbol declara varias escrituras, y el barrido tiene donde mirar', () => {
    // Con una sola declarada —o sin archivos que barrer— lo de abajo pasaria por vacio.
    expect(escrituras.length).toBeGreaterThan(3);
    expect(servido.length).toBeGreaterThan(10);
    expect(fuentes().map(donde)).toContain(EL_ARBOL);
  });

  it('la que se llama es la anulacion, y la declara una ACCION y no una hoja', () => {
    const acciones = HOJAS.flatMap(accionesDe);
    expect(acciones.map((a) => a.operacion.ruta)).toEqual([RUTA_DE_LA_ANULACION]);
    expect(acciones.every((a) => a.operacion.verbo === 'POST')).toBe(true);
  });

  it.each(escrituras.filter((o) => o.ruta !== RUTA_DE_LA_ANULACION).map((o) => o.ruta))(
    '«POST %s» sigue declarada y sin llamarse: nadie la escribe fuera del arbol',
    (ruta) => {
      // La ruta ENTRECOMILLADA, que es como la escribiria quien la llamara. Sin las comillas,
      // `/cobros` casaria dentro de `/cobros/{nro}/anulacion` y esta guarda diria que la anulacion
      // es una llamada a cobrar.
      const culpables = servido.filter(({ codigo }) => codigo.includes(`'${ruta}'`)).map(({ suyo }) => suyo);
      expect(culpables, `«POST ${ruta}» esta declarada y no se llama (ADR-0044)`).toEqual([]);
    },
  );
});
