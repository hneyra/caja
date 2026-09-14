// @vitest-environment node
//
// Lee `.java` del disco. No hay DOM que necesitar.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ARBOL } from '../src/pantallas/arbol.ts';
import type { Hoja, Modulo } from '../src/pantallas/tipos.ts';
import { RAIZ } from './raiz.ts';
import { mapeosDe, mapeosDelDirectorio, opcionesDelCatalogo, sinTildes } from './controladores.ts';

/**
 * **El arbol de la ventanilla y su backend dicen lo mismo, en los dos sentidos** (#74).
 *
 * <h2>Lo que ocupa el lugar del artboard</h2>
 *
 * `rentas` compara sus cuarenta pantallas con `RentasV8.dc.html`, campo a campo. `caja` no tiene
 * artboard: su arbol sale de los accesos de `CatalogoDelSistema` y de los `@RequiereAcceso` de sus
 * controladores. Esta guarda es la que impide que esa frase envejezca:
 *
 *   · **cada hoja nombra un acceso que el catalogo tiene**, y **cada acceso del catalogo tiene su
 *     hoja** — una opcion sin hoja es una pantalla a la que se da permiso y que nadie puede abrir;
 *   · **cada operacion que una hoja declara existe** con ese verbo, esa ruta y ese controlador, y
 *     **la exige ese acceso** (o lo admite en su `oTambien`);
 *   · **las lecturas declaradas son lecturas**: un `GET` que pide `IMPRESION` —el duplicado con
 *     `?formato=`, que registra la reimpresion— no es algo que la pantalla pueda pedir para dibujar;
 *   · **y los rotulos son los del catalogo**, sin contar las tildes, que el catalogo no guarda.
 *
 * Y el lector se prueba sobre una muestra con las trampas que ya costaron un defecto —la constante de
 * #77, `oTambien`, dos mapeos con la misma ruta— antes de creerle nada del backend.
 */

const WEB = join(RAIZ, '../backend/kamayuk-caja-nucleo/src/main/java/kamayuk/caja/nucleo/infraestructura/web');
const CATALOGO_JAVA = join(
  RAIZ,
  '../backend/kamayuk-caja-seguridad/src/main/java/kamayuk/caja/seguridad/dominio/CatalogoDelSistema.java',
);

const { controladores, mapeos } = mapeosDelDirectorio(WEB);
const opciones = opcionesDelCatalogo(readFileSync(CATALOGO_JAVA, 'utf8'));
const MODULOS = ARBOL as readonly Modulo[];
const HOJAS: readonly Hoja[] = MODULOS.flatMap((m) => [...m.hojas]);

describe('EL CENTINELA: el lector ve lo que tiene que ver', () => {
  it('sobre la muestra: la constante resuelta, las alternativas y los parametros', () => {
    const muestra = mapeosDe('ControladorDeMuestra', readFileSync(join(RAIZ, 'verificaciones/muestras-de-las-guardas/ControladorDeMuestra.java.txt'), 'utf8'));
    expect(muestra).toEqual([
      {
        controlador: 'ControladorDeMuestra',
        verbo: 'GET',
        ruta: '/muestras',
        parametros: null,
        acceso: 'acceso_de_muestra',
        oTambien: ['alternativa_uno', 'alternativa_dos'],
        privilegio: 'LECTURA',
      },
      {
        controlador: 'ControladorDeMuestra',
        verbo: 'GET',
        ruta: '/muestras/{id}',
        parametros: 'formato',
        acceso: 'acceso_de_muestra',
        oTambien: [],
        privilegio: 'IMPRESION',
      },
      {
        controlador: 'ControladorDeMuestra',
        verbo: 'POST',
        ruta: '/muestras/{id}/anulacion',
        parametros: null,
        acceso: 'acceso_de_muestra',
        oTambien: [],
        privilegio: 'ELIMINACION',
      },
    ]);
  });

  it('sobre el backend: controladores, mapeos y opciones contados, no supuestos', () => {
    // Sin esto, un cambio de forma que dejara ciego al lector compararia el arbol contra la nada.
    expect(controladores, 'no se leyo ningun controlador').toBeGreaterThanOrEqual(10);
    // Diecinueve hoy, contados a mano sobre los once controladores al escribir esto (#74). Se exige
    // un suelo y no la cifra exacta: una ruta nueva no tiene por que tocar esta guarda.
    expect(mapeos.length, 'no se leyo ningun mapeo').toBeGreaterThanOrEqual(15);
    // Y el controlador con las cuatro trampas a la vez —constantes, `params`, lectura e impresion de
    // la misma ruta, una escritura— se leyo entero.
    expect(mapeos.filter((m) => m.controlador === 'ReciboController')).toHaveLength(4);
    expect(opciones.length, 'no se leyo ninguna opcion del catalogo').toBeGreaterThanOrEqual(3);
  });
});

describe('las hojas y el catalogo, en los dos sentidos', () => {
  const codigos = opciones.map((o) => o.codigo);

  it('cada hoja nombra un acceso que el catalogo tiene', () => {
    expect(HOJAS.map((h) => h.acceso).filter((a) => !codigos.includes(a))).toEqual([]);
  });

  it('y cada acceso del catalogo tiene exactamente una hoja', () => {
    const conCuantas = codigos.map((c) => [c, HOJAS.filter((h) => h.acceso === c).length] as const);
    expect(conCuantas.filter(([, n]) => n !== 1)).toEqual([]);
  });

  it('y todo acceso que exige un controlador tiene su hoja', () => {
    const exigidos = [...new Set(mapeos.flatMap((m) => [m.acceso, ...m.oTambien]))].sort();
    expect(exigidos.filter((a) => !HOJAS.some((h) => h.acceso === a))).toEqual([]);
  });

  it('los rotulos son los del catalogo, sin contar las tildes', () => {
    const distintos = HOJAS.flatMap((h) => {
      const opcion = opciones.find((o) => o.codigo === h.acceso);
      return opcion !== undefined && sinTildes(opcion.nombre) !== sinTildes(h.rotulo)
        ? [`${h.clave}: «${h.rotulo}» y el catalogo dice «${opcion.nombre}»`]
        : [];
    });
    expect(distintos).toEqual([]);
  });

  it('y el modulo es el del catalogo, por su codigo', () => {
    for (const modulo of MODULOS) {
      const suyas = opciones.filter((o) => modulo.hojas.some((h) => h.acceso === o.codigo));
      expect(suyas.length).toBeGreaterThan(0);
      for (const opcion of suyas) {
        expect(opcion.moduloCodigo, `«${opcion.codigo}» cuelga de otro modulo en el catalogo`).toBe(modulo.codigo);
        expect(sinTildes(opcion.moduloNombre)).toBe(sinTildes(modulo.rotulo));
      }
    }
  });
});

describe('las operaciones que cada hoja declara existen, y las exige su acceso', () => {
  it.each(HOJAS.flatMap((h) => h.operaciones.map((o) => [`${h.clave}: ${o.verbo} ${o.ruta}`, h, o] as const)))(
    '%s',
    (_nombre, hoja, operacion) => {
      // El que no lleva `params` gana: dos mapeos con la misma ruta se distinguen por ahi, y el que
      // lo lleva es otra operacion.
      // Las rutas del lector van relativas a `Api.RAIZ`, como las del arbol.
      const candidatos = mapeos.filter((m) => m.verbo === operacion.verbo && m.ruta === operacion.ruta);
      const mapeo = candidatos.find((m) => m.parametros === null) ?? candidatos[0];

      expect(mapeo, `no hay ningun ${operacion.verbo} /caja/api/v1${operacion.ruta} en los controladores`).toBeDefined();
      expect(mapeo?.controlador).toBe(operacion.controlador);
      expect(
        [mapeo?.acceso, ...(mapeo?.oTambien ?? [])],
        `«${hoja.clave}» declara una operacion que su acceso «${hoja.acceso}» no abre`,
      ).toContain(hoja.acceso);
      if (operacion.verbo === 'GET') {
        expect(mapeo?.privilegio, 'una lectura declarada que no pide LECTURA no es una lectura').toBe('LECTURA');
      }
    },
  );
});
