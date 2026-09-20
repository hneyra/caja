import { ARBOL } from '../pantallas/arbol.ts';
import { PANTALLAS, actosDe, bloquesDe } from '../pantallas/definiciones/index.ts';
import type { Accion, Modulo, Pantalla, Texto } from '../pantallas/tipos.ts';
import { FRASES_DE_LOS_CONECTORES } from '../datos/conectores.ts';
import { AUSENCIAS_DE_UNA_LECTURA } from '../datos/useDatosDeLaHoja.ts';
import { SIN_PEDIR, SOLO_ESCRIBE } from '../porQueNoHayDato.ts';
import { clavesDelMarco } from './textosDelMarco.ts';

/**
 * **Todas las cadenas traducibles del sistema, sacadas de donde estan** (`rentas`#103; en `caja` desde #74).
 *
 * <h2>Por que esto existe, y por que `i18next-cli` no basta</h2>
 *
 * `i18next-cli` extrae lo que encuentra escrito como una llamada con la frase dentro. Medido:
 * encontraba 12 en `rentas`. Las demas **no estan escritas asi y no pueden estarlo**: viven en las
 * definiciones de las pantallas y en el arbol, y el interprete las traduce con
 * `t(campo.etiqueta)` — una variable, que ninguna extraccion estatica puede seguir.
 *
 * **Y ojo con los ejemplos en los comentarios.** Este parrafo decia la llamada con una frase
 * literal dentro, a modo de ejemplo, y el extractor **la cogio como clave de verdad**: `status`
 * salio rojo con «✗ una frase (absent)» sobre un codigo perfecto. No distingue un ejemplo de una
 * llamada, asi que aqui no se escriben ejemplos con la frase dentro.
 *
 * No es un defecto de la herramienta ni de la forma: es la consecuencia de que **las pantallas
 * sean dato**, que es justo lo que hace posible la guarda anti-deriva. Se paga aqui.
 *
 * Asi que el catalogo se DERIVA del dato en vez de extraerse del codigo. La ventaja es que no
 * puede quedarse corto: una pantalla nueva trae sus cadenas sin que nadie se acuerde de nada.
 *
 * <h2>Y desde #133 tambien lo que dice el MARCO</h2>
 *
 * Las treinta y dos palabras de `@kamayuk/shell` y las tres del interprete de `@kamayuk/ui` entran
 * por `textosDelMarco.ts`, y entran **derivadas** por el mismo motivo: escritas dentro
 * de cada `t()` habria que acordarse de listarlas a mano en el inventario del locale, y un olvido
 * ahi no produce ningun rojo — nadie echa de menos lo que nadie listo.
 *
 * <h2>Lo que NO entra</h2>
 *
 * **Los valores de los campos de solo lectura y las filas de las tablas** — ya no existen aqui
 * (#97), y no se traducirian aunque existieran: un importe no tiene traduccion.
 */

/**
 * Lo traducible de un `Texto`: la cadena entera, o **la plantilla** de una con huecos.
 *
 * Un `{ desde }` y un `{ segun }` no entran: el primero es el dato tal cual —que no se traduce— y
 * del segundo lo que se traduce son sus casos, que hoy ninguna definicion de esta ventanilla usa.
 * El dia que use uno, esta funcion crece y su prueba lo pide.
 */
function deUnTexto(texto: Texto | undefined): readonly string[] {
  if (texto === undefined) return [];
  if (typeof texto === 'string') return [texto];
  if ('plantilla' in texto) return [texto.plantilla];
  if ('casos' in texto) return [...Object.values(texto.casos), ...(texto.otro === undefined ? [] : [texto.otro])];
  return [];
}

/** Lo que dicen las acciones de un bloque o de un acto: su rotulo y el motivo de cada impedimento. */
function deLasAcciones(acciones: readonly Accion[] | undefined): readonly string[] {
  return (acciones ?? []).flatMap((accion) => [
    ...deUnTexto(accion.rotulo),
    ...(accion.impedida ?? []).flatMap((impedimento) => deUnTexto(impedimento.motivo)),
  ]);
}

/**
 * Todo lo que los ACTOS dicen (#100).
 *
 * Es la mitad que un recorrido de bloques no ve: un acto no es un bloque, y sus cadenas —el titulo
 * que es tambien el rotulo de su primario, la etiqueta y la ayuda de la observacion obligatoria, la
 * advertencia de lo que no se deshace, y lo que se lee cuando el sistema lo acepta— no las dice
 * nadie mas. Sin esto, la ventanilla anularia en castellano en cualquier idioma.
 */
function deLosActos(pantalla: Pantalla): readonly string[] {
  return actosDe(pantalla).flatMap((acto) => [
    ...deUnTexto(acto.titulo),
    ...deUnTexto(acto.nota),
    ...acto.campos.flatMap((campo) => [
      campo.etiqueta,
      ...('opciones' in campo ? campo.opciones : []),
      ...('casilla' in campo ? [campo.casilla] : []),
      ...('ayuda' in campo && campo.ayuda !== undefined ? [campo.ayuda] : []),
    ]),
    ...deUnTexto(acto.observacion.etiqueta),
    ...deUnTexto(acto.observacion.ayuda),
    ...deUnTexto(acto.advertencia),
    ...deUnTexto(acto.hecho?.titulo),
    ...deUnTexto(acto.hecho?.texto),
    ...deLasAcciones(acto.hecho?.acciones),
  ]);
}

/** Todo lo que las pantallas dicen. */
function deLasPantallas(): readonly string[] {
  const salida: string[] = [];
  // Anotado: `PANTALLAS` es un `satisfies` de formas distintas, y sin la anotacion el compilador
  // intenta unificarlas. La forma comun la da el `satisfies`, que garantiza que no miente.
  for (const pantalla of Object.values(PANTALLAS) as readonly Pantalla[]) {
    salida.push(pantalla.instruccion);
    salida.push(...deLosActos(pantalla));
    for (const bloque of bloquesDe(pantalla)) {
      salida.push(...deLasAcciones(bloque.acciones));
      salida.push(bloque.titulo);
      if (bloque.nota !== '') salida.push(bloque.nota);
      // Lo que un bloque dice mientras su lectura no se puede pedir (#98): es una frase de la hoja,
      // la escribe la definicion y la traduce el interprete, asi que entra por aqui como las demas.
      const espera = bloque.lectura?.espera;
      if (typeof espera === 'string') salida.push(espera);
      for (const campo of bloque.campos) {
        salida.push(campo.etiqueta);
        if ('opciones' in campo) salida.push(...campo.opciones);
        if ('casilla' in campo) salida.push(campo.casilla);
        if ('ayuda' in campo && campo.ayuda !== undefined) salida.push(campo.ayuda);
      }
      const tabla = bloque.tabla;
      if (tabla === undefined) continue;
      salida.push(tabla.titulo, ...tabla.columnas.map((c) => c.rotulo));
      if (tabla.nota !== undefined) salida.push(tabla.nota);
      if (tabla.accion !== undefined) salida.push(tabla.accion);
      if (tabla.vacio !== undefined) salida.push(tabla.vacio);
      // Los botones de cada fila (#99): el rotulo de su columna, el de cada boton y lo que se lee
      // en la fila que no ofrece ninguno. Son frases de la definicion como cualquier otra, y sin
      // esto la primera tabla que gane acciones las ensena en castellano en los demas idiomas.
      const porFila = tabla.accionesPorFila;
      if (porFila === undefined) continue;
      salida.push(porFila.columna, porFila.sinAcciones);
      for (const accion of porFila.acciones) {
        if (typeof accion.rotulo === 'string') salida.push(accion.rotulo);
      }
    }
  }
  return salida;
}

/** Los rotulos del arbol: sus modulos con su nota, y sus hojas. */
function delArbol(): readonly string[] {
  return (ARBOL as readonly Modulo[]).flatMap((modulo) => [
    modulo.rotulo,
    modulo.nota,
    ...modulo.hojas.map((hoja) => hoja.rotulo),
  ]);
}

/** Las frases con que el sistema explica que no hay dato. */
function deLasAusencias(): readonly string[] {
  // Las de una hoja sin conector, las de una lectura que no contesto (#84) y las palabras de los
  // huecos que deja una que si contesto.
  return [
    ...[SIN_PEDIR, SOLO_ESCRIBE, ...AUSENCIAS_DE_UNA_LECTURA].flatMap((a) => [a.enElCampo, a.explicacion]),
    ...FRASES_DE_LOS_CONECTORES,
  ];
}

/** El catalogo entero, sin repetidos y en orden. */
export function catalogoDeClaves(): readonly string[] {
  const todas = new Set([
    ...deLasPantallas(),
    ...delArbol(),
    ...deLasAusencias(),
    ...clavesDelMarco(),
  ]);
  return [...todas].filter((c) => c.trim() !== '').sort((a, b) => a.localeCompare(b, 'es'));
}
