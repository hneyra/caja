import type { Catalogo, ModuloDelCatalogo } from '@kamayuk/shell';

import type { AccesoDelSistema, ModuloDelSistema, PermisosDeLaSesion } from './datos/lecturas.ts';

/**
 * **Lo que la cuenta no puede abrir, no se ofrece** — y en la ventanilla, hoja por hoja (#74).
 *
 * <h2>Que se cruza</h2>
 *
 * Las tres lecturas de `rentas`, pero **contra el backend de `caja`** (ADR-0042):
 *
 *   · `GET /seguridad/modulos` dice que modulos existen, en que orden, con que rotulo y si estan
 *     activos. En `caja` es uno: `TESORERIA`.
 *   · `GET /seguridad/accesos` dice que accesos cuelgan de cada modulo y si estan activos.
 *   · `GET /seguridad/sesion/permisos` dice que puede esta cuenta, como `codigo → privilegios[]`.
 *
 * <h2>Por que aqui se filtra la HOJA y en `rentas` el modulo</h2>
 *
 * `rentas`#120 lo explica: su arbol no tiene correspondencia publicada entre hoja y acceso, y
 * escribirla en la interfaz seria decidir alli quien ve que. **En `caja` esa correspondencia es el
 * arbol mismo**: cada hoja nombra su acceso, y `verificaciones/el-arbol-cuadra-con-el-backend.test.ts`
 * comprueba contra los `.java` que es el que exige su controlador. No se inventa nada, y filtrar
 * por modulo aqui seria ofrecer las siete hojas a quien solo puede abrir una.
 *
 * <h2>Cuando se ofrece una hoja</h2>
 *
 * Cuando **alguno** de sus accesos esta publicado y activo bajo un modulo activo, **y la cuenta
 * tiene al menos un privilegio sobre el**. Dos cosas, y las dos son decisiones:
 *
 *   · **Alguno, y no el suyo.** Desde #100 una hoja puede servir mas de un acceso —`duplicado-recibo`
 *     sirve tambien `anulacion_recibo`, con su accion de anular—, y exigir el propio dejaria a quien
 *     solo puede anular sin la unica pantalla donde se anula. Que es exactamente el defecto que #100
 *     cerro: una cuenta con `anulacion_recibo` y nada mas entraba a un arbol de una sola hoja muda.
 *   · **Basta UN privilegio, no `lectura`.** Anular pide `eliminacion`, y exigir `lectura` esconderia
 *     la hoja a quien si puede anular. Una hoja ofrecida a quien no puede leer sus datos no miente:
 *     su pantalla dice «sin acceso» donde iria el dato —que es lo que el guardia del backend
 *     contesta— y la accion de anular lo dice tambien, en el motivo de su boton.
 *
 * <h2>El rotulo del modulo es el del BACKEND</h2>
 *
 * Por lo mismo que en `rentas`: el dia que la municipalidad lo renombre, el arbol dira el nombre
 * nuevo sin tocar este repositorio. Las hojas conservan el suyo, que lleva tildes; el catalogo los
 * guarda en ASCII.
 */

/** Lo que se sabe del catalogo despues de componerlo. */
export interface CatalogoCompuesto {
  /** Lo que se ofrece, en el orden en que el backend publica sus modulos. */
  readonly catalogo: Catalogo;
  /** Los modulos que el backend publica y el arbol de esta ventanilla no tiene. */
  readonly sinCatalogo: readonly string[];
  /** Los accesos del arbol que la cuenta no puede abrir. Uno por acceso, no uno por hoja (#100). */
  readonly sinPermiso: readonly string[];
}

/** Los codigos sobre los que la cuenta tiene algun privilegio. */
function loQuePuedeHacer(permisos: PermisosDeLaSesion): ReadonlySet<string> {
  return new Set(
    Object.entries(permisos)
      .filter(([, privilegios]) => Array.isArray(privilegios) && privilegios.length > 0)
      .map(([codigo]) => codigo),
  );
}

/**
 * El catalogo que esta cuenta puede abrir.
 *
 * @param nuestro el catalogo entero de la ventanilla, ya en la forma de `@kamayuk/shell`
 * @param codigoDe el codigo de modulo de cada entrada del catalogo
 * @param accesosDe los codigos de acceso que cada destino sirve, por su clave (#100)
 */
export function componer(
  nuestro: Catalogo,
  modulos: readonly ModuloDelSistema[],
  accesos: readonly AccesoDelSistema[],
  permisos: PermisosDeLaSesion,
  codigoDe: (modulo: ModuloDelCatalogo) => string,
  accesosDe: (claveDelDestino: string) => readonly string[],
): CatalogoCompuesto {
  const posibles = loQuePuedeHacer(permisos);
  const porCodigo = new Map(nuestro.map((m) => [codigoDe(m), m]));

  const catalogo: ModuloDelCatalogo[] = [];
  const sinCatalogo: string[] = [];
  const sinPermiso: string[] = [];

  for (const modulo of [...modulos].sort((a, b) => a.orden - b.orden)) {
    if (!modulo.activo) continue;

    const nuestroModulo = porCodigo.get(modulo.codigo);
    if (nuestroModulo === undefined) {
      sinCatalogo.push(modulo.codigo);
      continue;
    }

    const publicados = new Set(
      accesos.filter((a) => a.moduloId === modulo.id && a.activo).map((a) => a.codigo),
    );
    const destinos = nuestroModulo.destinos.filter((destino) => {
      const suyos = accesosDe(destino.clave);
      const abiertos = suyos.filter((acceso) => publicados.has(acceso) && posibles.has(acceso));
      // Se cuenta acceso a acceso y no hoja a hoja: una hoja que se ofrece por uno de los dos deja
      // el otro sin abrir igualmente, y esconderlo en el recuento haria que «lo que esta cuenta no
      // puede» dejara de cuadrar con la matriz que el backend contesto.
      sinPermiso.push(...suyos.filter((acceso) => !abiertos.includes(acceso)));
      return abiertos.length > 0;
    });

    // Un modulo sin ninguna hoja que abrir no se dibuja: una rama vacia en el arbol invita a
    // desplegarla para no encontrar nada.
    if (destinos.length === 0) continue;

    // El rotulo del backend pisa al del arbol. Ver el javadoc.
    catalogo.push({ ...nuestroModulo, rotulo: modulo.nombre, destinos });
  }

  return { catalogo, sinCatalogo, sinPermiso };
}
