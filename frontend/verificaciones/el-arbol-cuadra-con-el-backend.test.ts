// @vitest-environment node
//
// Lee `.java` del disco. No hay DOM que necesitar.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ACCESOS_QUE_LEEN_RECIBOS, RUTA_DE_LA_ANULACION } from '../src/datos/laAnulacion.ts';
import { ACTO_DE_ANULACION, ARBOL, accesosDe, accionesDe } from '../src/pantallas/arbol.ts';
import { actosDe, pantallaDe } from '../src/pantallas/definiciones/index.ts';
import type { ClaveDeHoja } from '../src/pantallas/arbol.ts';
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
 *   · **cada hoja nombra accesos que el catalogo tiene**, y **cada acceso del catalogo tiene quien
 *     lo sirva, exactamente uno** — una opcion sin nadie que la sirva es una pantalla a la que se da
 *     permiso y que nadie puede abrir;
 *   · **cada operacion que una hoja declara existe** con ese verbo, esa ruta y ese controlador, y
 *     **la exige ese acceso** (o lo admite en su `oTambien`);
 *   · **las lecturas declaradas son lecturas**: un `GET` que pide `IMPRESION` —el duplicado con
 *     `?formato=`, que registra la reimpresion— no es algo que la pantalla pueda pedir para dibujar;
 *   · **y los rotulos son los del catalogo**, sin contar las tildes, que el catalogo no guarda.
 *
 * Y el lector se prueba sobre una muestra con las trampas que ya costaron un defecto —la constante de
 * #77, `oTambien`, dos mapeos con la misma ruta— antes de creerle nada del backend.
 *
 * <h2>Lo que #100 cambio aqui, y por que no es aflojarla</h2>
 *
 * Hasta ADR-0044 esto exigia **una hoja por acceso**, en los dos sentidos. Deja de valer: la
 * anulacion se sirve desde una **accion** dentro de `duplicado-recibo`, y su acceso no tiene hoja
 * propia. Lo que NO cambia es lo que la guarda protege —ningun acceso sin quien lo sirva, ninguna
 * operacion declarada que no exista, ningun acceso servido dos veces—: lo que cambia es que «quien
 * lo sirve» puede ser una hoja **o** una accion de una hoja. Sigue siendo una cuenta exacta, no un
 * «al menos uno».
 *
 * Y se anade lo que antes no hacia falta: **la escritura que ahora SI se llama cuadra con el
 * backend**, campo a campo y limite a limite (`PeticionDeAnulacion`, `Observacion`), y la lista de
 * accesos con que la interfaz decide si puede leer recibos es la que el controlador declara en su
 * `oTambien`.
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

/**
 * **Quien sirve cada acceso**: la hoja que lo lleva, o la accion que lo ofrece dentro de otra hoja.
 *
 * Se aplana en una lista y no en un mapa a proposito: lo que hay que poder contar es **cuantas
 * veces** aparece un acceso, y un mapa se comeria el segundo en silencio.
 */
const SERVIDORES: readonly { readonly acceso: string; readonly donde: string }[] = HOJAS.flatMap((hoja) => [
  { acceso: hoja.acceso, donde: `la hoja «${hoja.clave}»` },
  ...accionesDe(hoja).map((accion) => ({
    acceso: accion.acceso,
    donde: `la accion «${accion.clave}» de «${hoja.clave}»`,
  })),
]);

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

  it('EL CENTINELA: hay mas accesos servidos que hojas, y la diferencia son las acciones (#100)', () => {
    // Sin esto, un arbol que perdiera sus acciones dejaria las cuentas de abajo midiendo solo
    // hojas, que es exactamente lo que valia antes de ADR-0044.
    expect(SERVIDORES).toHaveLength(HOJAS.length + HOJAS.flatMap(accionesDe).length);
    expect(HOJAS.flatMap(accionesDe).length).toBeGreaterThan(0);
  });

  it('cada acceso que el arbol sirve —hoja o accion— lo tiene el catalogo', () => {
    expect(SERVIDORES.filter((s) => !codigos.includes(s.acceso)).map((s) => `${s.acceso}, en ${s.donde}`)).toEqual([]);
  });

  it('y cada acceso del catalogo lo sirve EXACTAMENTE uno: ni ninguno, ni dos', () => {
    const conCuantos = codigos.map((c) => [c, SERVIDORES.filter((s) => s.acceso === c).length] as const);
    expect(
      conCuantos.filter(([, n]) => n !== 1),
      'un acceso sin quien lo sirva es un permiso que no abre nada; servido dos veces, dos caminos ' +
        'al mismo sitio que se desincronizan',
    ).toEqual([]);
  });

  it('y todo acceso que exige un controlador tiene quien lo sirva', () => {
    const exigidos = [...new Set(mapeos.flatMap((m) => [m.acceso, ...m.oTambien]))].sort();
    expect(exigidos.filter((a) => !SERVIDORES.some((s) => s.acceso === a))).toEqual([]);
  });

  /**
   * **La accion abre un acto que existe en la pantalla de su hoja** (#100).
   *
   * Las dos mitades de la costura son cadenas: lo que la accion `abre` y la `clave` del acto. Si
   * dejaran de coincidir no habria ningun error —el boton se pulsa y no pasa nada—, y la unica
   * manera de enterarse seria intentar anular un recibo de verdad.
   */
  it('y cada accion nombra un acto que su pantalla declara, con esa misma clave', () => {
    const sueltas = HOJAS.flatMap((hoja) =>
      accionesDe(hoja)
        .filter((accion) => !actosDe(pantallaDe(hoja.clave as ClaveDeHoja)).some((acto) => acto.clave === accion.clave))
        .map((accion) => `«${accion.clave}» no es ningun acto de «${hoja.clave}»`),
    );
    expect(sueltas).toEqual([]);
  });

  it('los rotulos de las HOJAS son los del catalogo, sin contar las tildes', () => {
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
      // Los accesos de sus hojas Y los de sus acciones: un acceso servido desde una accion tiene
      // que colgar del mismo modulo que la hoja que lo ofrece, o el filtro por permisos lo
      // esconderia sin decir nada.
      const suyas = opciones.filter((o) => modulo.hojas.some((h) => accesosDe(h).includes(o.codigo)));
      expect(suyas.length).toBeGreaterThan(0);
      for (const opcion of suyas) {
        expect(opcion.moduloCodigo, `«${opcion.codigo}» cuelga de otro modulo en el catalogo`).toBe(modulo.codigo);
        expect(sinTildes(opcion.moduloNombre)).toBe(sinTildes(modulo.rotulo));
      }
    }
  });
});

describe('las operaciones que cada hoja declara existen, y las exige su acceso', () => {
  it.each(
    HOJAS.flatMap((hoja) => [
      ...hoja.operaciones.map((o) => [`${hoja.clave}: ${o.verbo} ${o.ruta}`, hoja.acceso, o] as const),
      // Las de una accion las exige el acceso de LA ACCION, no el de la hoja: es lo que hace que
      // declarar una accion sin su acceso no cuele (#100).
      ...accionesDe(hoja).map(
        (a) => [`${hoja.clave} · ${a.clave}: ${a.operacion.verbo} ${a.operacion.ruta}`, a.acceso, a.operacion] as const,
      ),
    ]),
  )(
    '%s',
    (_nombre, acceso, operacion) => {
      // El que no lleva `params` gana: dos mapeos con la misma ruta se distinguen por ahi, y el que
      // lo lleva es otra operacion.
      // Las rutas del lector van relativas a `Api.RAIZ`, como las del arbol.
      const candidatos = mapeos.filter((m) => m.verbo === operacion.verbo && m.ruta === operacion.ruta);
      const mapeo = candidatos.find((m) => m.parametros === null) ?? candidatos[0];

      expect(mapeo, `no hay ningun ${operacion.verbo} /caja/api/v1${operacion.ruta} en los controladores`).toBeDefined();
      expect(mapeo?.controlador).toBe(operacion.controlador);
      expect(
        [mapeo?.acceso, ...(mapeo?.oTambien ?? [])],
        `se declara una operacion que el acceso «${acceso}» no abre`,
      ).toContain(acceso);
      if (operacion.verbo === 'GET') {
        expect(mapeo?.privilegio, 'una lectura declarada que no pide LECTURA no es una lectura').toBe('LECTURA');
      }
    },
  );
});

/**
 * **La escritura que la ventanilla SI llama, contra lo que el backend exige** (#100, ADR-0044).
 *
 * Hasta aqui las escrituras estaban declaradas y no se llamaban, asi que su forma daba igual: la
 * unica manera de equivocarse era declarar una ruta que no existe, y eso ya lo mide el bloque de
 * arriba. Desde ADR-0044 una **se envia**, con un cuerpo y con unos limites, y los tres sitios
 * donde eso esta escrito —el acto de la definicion, el tipo del cuerpo y el `.java`— no se ven
 * entre si.
 *
 * El sintoma de un desajuste no seria un error de compilacion: seria un 422 en la ventanilla
 * **despues** de que alguien rellene el formulario y confirme un acto irreversible.
 */
describe('la anulacion cuadra con el backend, campo a campo', () => {
  const RECIBO_CONTROLLER = join(WEB, 'ReciboController.java');
  const PETICION = readFileSync(join(WEB, 'PeticionDeAnulacion.java'), 'utf8');
  const OBSERVACION = readFileSync(
    join(RAIZ, '../backend/kamayuk-caja-dominio-compartido/src/main/java/kamayuk/caja/dominio/Observacion.java'),
    'utf8',
  );
  const acto = actosDe(pantallaDe('duplicado-recibo')).find((a) => a.clave === ACTO_DE_ANULACION);

  it('EL CENTINELA: se leyeron los dos `.java` y el acto existe', () => {
    expect(PETICION).toContain('public record PeticionDeAnulacion(');
    expect(OBSERVACION).toContain('public record Observacion(');
    expect(acto, 'sin el acto, todo lo de abajo pasaria por vacio').toBeDefined();
  });

  /**
   * Los campos que viajan son los del `record`, **menos la observacion**, que la libreria pide
   * aparte porque va siempre (regla 10). Ni uno mas: un nombre que el backend no conoce se ignora
   * en silencio, y quien lo escribio cree haberlo mandado.
   */
  it('los campos del acto son los de `PeticionDeAnulacion`, sin la observacion', () => {
    const delBackend = (/public record PeticionDeAnulacion\(([^)]*)\)/.exec(PETICION)?.[1] ?? '')
      .split(',')
      .map((parte) => parte.trim().split(/\s+/).pop() ?? '')
      .filter((nombre) => nombre !== '' && nombre !== 'observacion');
    // El primero del acto es de solo lectura —dice sobre que recibo se actua— y no viaja.
    const queViajan = (acto?.campos ?? []).filter((campo) => campo.tipo !== 'r').map((campo) => campo.nombre);

    expect(queViajan).toEqual(delBackend);
  });

  /**
   * Y su obligatoriedad. El backend exige `motivo` con `exigir(...)` y deja pasar los otros dos con
   * `vacioAnulo(...)`: un acto que pidiera los tres haria imposible anular sin un memorando que
   * muchas veces no existe, y uno que no pidiera ninguno mandaria un 422 despues de confirmar.
   */
  it('y lo obligatorio aqui es lo obligatorio alli: el motivo si, los otros dos no', () => {
    const controlador = readFileSync(RECIBO_CONTROLLER, 'utf8');
    const anulacion = /public ResponseEntity<AnulacionResource> anulacion\([\s\S]*?\n {4}}/.exec(controlador)?.[0] ?? '';

    expect(anulacion).toContain('exigir(peticion.motivo(), "motivo")');
    expect(anulacion).toContain('vacioAnulo(peticion.autorizadoPor())');
    expect(anulacion).toContain('vacioAnulo(peticion.nDeMemorando())');

    const obligatorios = (acto?.campos ?? [])
      .filter((campo) => campo.tipo !== 'r' && campo.opcional !== true)
      .map((campo) => campo.nombre);
    expect(obligatorios).toEqual(['motivo']);
  });

  /**
   * Los limites de la observacion son los de `Observacion`, y por eso se leen de alli.
   *
   * La libreria no trae ninguno por omision a proposito (`kamayuk-lib`#66): los pone quien define
   * el acto. Escritos a ojo, el formulario dejaria enviar lo que el dominio rechaza —o al reves,
   * pediria mas de lo que la columna admite— y las dos cosas se descubren enviando.
   */
  it('los limites de la observacion son los del dominio, leidos de `Observacion.java`', () => {
    const minimo = Number(/LARGO_MINIMO = (\d+)/.exec(OBSERVACION)?.[1]);
    const maximo = Number(/LARGO_MAXIMO = (\d+)/.exec(OBSERVACION)?.[1]);

    expect(Number.isFinite(minimo) && Number.isFinite(maximo)).toBe(true);
    expect(acto?.observacion.largo).toEqual({ minimo, maximo });
  });

  /** Y no se deshace, asi que se confirma antes de enviar: es lo que `advertencia` significa. */
  it('lo irreversible se confirma: el acto declara su advertencia', () => {
    expect(acto?.advertencia).toBeTruthy();
  });

  /**
   * **Y quien puede LEER recibos es quien el controlador dice** (#100).
   *
   * La interfaz escribe esa lista para poder decirle a quien mira que pedir cuando el backend le
   * niegue la lista. Si el `oTambien` del backend cambiara, la frase quedaria mandando a pedir un
   * permiso que ya no abre nada — y eso no daria ningun error: daria un 403 con un consejo malo.
   */
  it('los accesos que leen recibos son los que `GET /recibos` declara, con su `oTambien`', () => {
    const listado = mapeos.find((m) => m.verbo === 'GET' && m.ruta === '/recibos');
    expect(listado, 'no se leyo el mapeo de `GET /recibos`').toBeDefined();
    expect([listado?.acceso, ...(listado?.oTambien ?? [])]).toEqual([...ACCESOS_QUE_LEEN_RECIBOS]);
    expect(listado?.privilegio).toBe('LECTURA');
  });

  it('y la ficha del recibo se abre con los mismos: ver el recibo es parte de anularlo', () => {
    const ficha = mapeos.find(
      (m) => m.verbo === 'GET' && m.ruta === '/recibos/{nro}/duplicado' && m.parametros === null,
    );
    expect([ficha?.acceso, ...(ficha?.oTambien ?? [])]).toEqual([...ACCESOS_QUE_LEEN_RECIBOS]);
    // Y la del `?formato=` NO: reimprimir un papel no es parte de anular, y exige `IMPRESION`.
    const impresa = mapeos.find((m) => m.ruta === '/recibos/{nro}/duplicado' && m.parametros === 'formato');
    expect(impresa?.oTambien).toEqual([]);
    expect(impresa?.privilegio).toBe('IMPRESION');
  });

  it('y la escritura que la interfaz compone es la que el arbol declara', () => {
    expect(RUTA_DE_LA_ANULACION).toBe('/cobros/{nro}/anulacion');
    const anulacion = mapeos.find((m) => m.verbo === 'POST' && m.ruta === RUTA_DE_LA_ANULACION);
    expect(anulacion?.acceso).toBe('anulacion_recibo');
    expect(anulacion?.privilegio, 'anular es la baja de un documento').toBe('ELIMINACION');
  });
});
