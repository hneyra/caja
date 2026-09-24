import type { TecleadoDeUnActo } from '@kamayuk/ui';

import { ACTO_DE_ANULACION } from '../pantallas/arbol.ts';

/**
 * **El borrador de la anulacion: lo escrito en el acto, guardado en la pestana** (#117).
 *
 * <h2>Por que hace falta</h2>
 *
 * El token caduca a los quince minutos (`accessTokenLifespan: 900` en el realm) y la ventanilla no
 * lo renueva: la renovacion silenciosa con `prompt=none` es de `@kamayuk/sesion` y alli consta como
 * pendiente. Quien estaba rellenando una anulacion —motivo, quien autoriza, memorando y la
 * observacion obligatoria— recibe un 401 al confirmar, y volver a entrar es **una pagina nueva**:
 * se va al emisor y se vuelve, y todo lo que vivia en memoria se pierde con ella. Guardado aqui,
 * abrir el acto otra vez sobre el mismo recibo lo encuentra escrito.
 *
 * <h2>Por que `sessionStorage` y no el almacenamiento que persiste</h2>
 *
 * Porque un borrador de anulacion es de **esta pestana y este turno**: sobrevive a la ida y vuelta
 * del emisor —que es la misma pestana— y muere al cerrarla. En una PC de ventanilla que tres turnos
 * comparten, uno persistente le dejaria al siguiente cajero la anulacion a medias del
 * anterior.
 *
 * <h2>Lo que NUNCA se guarda aqui</h2>
 *
 * **El token**, ni nada que se le parezca: este archivo no importa la puerta, y lo comprueba
 * `verificaciones/camino-a-la-api.test.ts`, que ademas exige que este sea **el unico** archivo de
 * `src/` que toca el almacenamiento del navegador. Lo que se guarda es exactamente lo que la persona
 * escribio en los campos del acto, y nada que el backend haya contestado.
 *
 * <h2>Por que el navegador puede fallar y el acto no</h2>
 *
 * Una ventana privada, un almacenamiento lleno o bloqueado por politica lanzan al tocarlo. Todo
 * acceso va en `try/catch`: en el peor caso no hay borrador, que es exactamente como estaba la
 * ventanilla antes de #117. Y lo leido se comprueba campo a campo: un valor con otra forma no se
 * cuela en el formulario como si lo hubiera escrito alguien.
 *
 * <h2>Cuando se borra</h2>
 *
 * Al anular con exito y al cerrar el acto —que es cancelarlo—, salvo que lo que se cierre sea el
 * rechazo de un 401: entonces cerrar y recargar es justo lo que se le pide a quien mira, y el borrador
 * tiene que seguir ahi. Lo decide `useLaAnulacion.ts`, que es quien sabe cuando pasa cada cosa. Y al
 * cerrar la sesion, desde `aplicacion.tsx`.
 *
 * <h2>Y es de UNA cuenta</h2>
 *
 * Se guarda con el `cuenta` de `GET /seguridad/sesion`, y sólo se le devuelve a esa: otra cuenta que
 * entre en la misma pestana lo encuentra borrado. Nunca el token: la cuenta llega como argumento.
 */

/**
 * La clave, con el prefijo de esta interfaz: las cuatro se sirven del mismo origen y comparten el
 * almacenamiento, asi que sin prefijo propio se pisarian (la misma razon que en `identidad.ts`).
 */
export const CLAVE_DEL_BORRADOR = 'kamayuk.caja.borrador-de-la-anulacion';

/** Lo tecleado en los actos, por apertura: la forma de `LoTecleado.actos` de `@kamayuk/ui`. */
export type Borradores = Readonly<Record<string, TecleadoDeUnActo>>;

const PREFIJO_DE_LA_APERTURA = `${ACTO_DE_ANULACION}|`;

/**
 * La apertura del acto de anular abierto con esos parametros, **escrita como la escribe el
 * interprete** (`ActoDeLaPantalla`: la clave del acto, una barra y los parametros en JSON).
 *
 * Es la clave con que el interprete lee y cambia lo tecleado, y por eso la misma anulacion sobre
 * otro recibo es otro borrador. Si la libreria cambiara la forma, el borrador no se borraria al
 * anular ni al cerrar, y `verificaciones/la-ventanilla-resiste.test.tsx` sale en rojo.
 */
export function aperturaDeLaAnulacion(parametros: Readonly<Record<string, string>>): string {
  return `${PREFIJO_DE_LA_APERTURA}${JSON.stringify(parametros)}`;
}

/** Si lo leido tiene la forma de lo tecleado en un acto, campo a campo. */
function esTecleado(valor: unknown): valor is TecleadoDeUnActo {
  if (typeof valor !== 'object' || valor === null) return false;
  const { valores, observacion, intentado } = valor as Record<string, unknown>;
  if (typeof observacion !== 'string' || typeof intentado !== 'boolean') return false;
  if (typeof valores !== 'object' || valores === null) return false;
  return Object.values(valores).every((v) => typeof v === 'string' || typeof v === 'boolean');
}

/** Solo lo del acto de anular: lo de cualquier otro acto no sale de la memoria. */
function soloLaAnulacion(borradores: Borradores): Borradores {
  return Object.fromEntries(
    Object.entries(borradores).filter(([apertura]) => apertura.startsWith(PREFIJO_DE_LA_APERTURA)),
  );
}

/**
 * Los borradores que **esta cuenta** guardo en esta pestana, o ninguno si no hay, no se puede leer o
 * no se entiende.
 *
 * **Los de otra cuenta no se devuelven, y se borran** (#117, revision): en una PC que tres turnos
 * comparten, quien entra despues en la misma pestana no puede encontrarse el memorando y la
 * observacion del anterior. La cuenta es el `cuenta` de `GET /seguridad/sesion` —lo que la barra
 * ensena—, nunca el token.
 */
export function leerLosBorradores(cuenta: string): Borradores {
  try {
    const crudo = sessionStorage.getItem(CLAVE_DEL_BORRADOR);
    if (crudo === null) return {};
    const leido: unknown = JSON.parse(crudo);
    if (typeof leido !== 'object' || leido === null) return {};
    const { cuenta: suya, actos } = leido as Record<string, unknown>;
    if (suya !== cuenta) {
      olvidarLosBorradores();
      return {};
    }
    if (typeof actos !== 'object' || actos === null) return {};
    const validos = Object.entries(actos).filter((entrada): entrada is [string, TecleadoDeUnActo] =>
      esTecleado(entrada[1]),
    );
    return soloLaAnulacion(Object.fromEntries(validos));
  } catch {
    return {};
  }
}

/** Guarda los de la anulacion, con la cuenta que los escribio; sin ninguno, quita la clave. Nunca lanza. */
export function guardarLosBorradores(cuenta: string, borradores: Borradores): void {
  try {
    const suyos = soloLaAnulacion(borradores);
    if (Object.keys(suyos).length === 0) sessionStorage.removeItem(CLAVE_DEL_BORRADOR);
    else sessionStorage.setItem(CLAVE_DEL_BORRADOR, JSON.stringify({ cuenta, actos: suyos }));
  } catch {
    // Sin almacenamiento no hay borrador: la ventanilla sigue como antes de #117.
  }
}

/**
 * Quita todo borrador de la pestana. Lo llama `aplicacion.tsx` **antes** de `salir()`: cerrar la
 * sesion es dejar el puesto, y lo que se deja no puede quedar escrito para el siguiente.
 */
export function olvidarLosBorradores(): void {
  try {
    sessionStorage.removeItem(CLAVE_DEL_BORRADOR);
  } catch {
    // Nada que olvidar si no se puede tocar.
  }
}
