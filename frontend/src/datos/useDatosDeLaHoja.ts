import type { Ausencia, DatosDeLaPantalla, RutaDeLaHoja } from '@kamayuk/ui';
import { valorEnLaRuta } from '@kamayuk/ui';
import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';

import { ErrorDeLaApi } from '../api/cliente.ts';
import type { ClaveDeHoja } from '../pantallas/arbol.ts';
import { hojaDe } from '../pantallas/arbol.ts';
import { porQueNoHayDato } from '../porQueNoHayDato.ts';
import type { Aporte, Conector, LecturaDeLoElegido, PasoDeLoElegido, Reparto } from './conectores.ts';
import { CONECTORES, ErrorAlRepartir } from './conectores.ts';

/**
 * **Los datos de una hoja de la ventanilla, pedidos de verdad** (#84).
 *
 * Es el gancho de `rentas` (`rentas`#97) con su misma firma, que es lo que hizo que `aplicacion.tsx`
 * no cambiara al conectarlo.
 *
 * <h2>Los cuatro estados, y por que ninguno se puede saltar</h2>
 *
 * · **Sin conector.** No se pide nada, y el motivo lo redacta `porQueNoHayDato.ts`.
 * · **Cargando.** Sin decirlo, una pantalla llena de huecos es indistinguible de una sin backend.
 * · **Error.** Un 401 o un 403 no es «fallo la red»: es la sesion o el permiso, y se dice asi.
 * · **Dato.** Lo que llego, repartido por su conector, y los huecos que deja con su palabra.
 *
 * <h2>Por que no se reintenta</h2>
 *
 * `retry: false`. Un 403 reintentado tres veces son tres idas a un backend que ya dijo que no, y el
 * cajero espera el triple para leer el mismo mensaje.
 */

const CARGANDO: Ausencia = {
  enElCampo: 'pidiendo…',
  explicacion: 'Pidiendo los datos de esta pantalla.',
  tono: 'info',
};

const SIN_SESION: Ausencia = {
  enElCampo: 'sin acceso',
  // Dice COMO se vuelve a entrar (#117): el token caduca a los quince minutos y nadie lo renueva.
  explicacion: 'La sesión caducó o no vale para pedir estos datos. Vuelva a entrar recargando la página.',
  tono: 'atencion',
};

const SIN_PERMISO: Ausencia = {
  enElCampo: 'sin acceso',
  explicacion: 'Su cuenta no tiene permiso para ver los datos de esta pantalla.',
  tono: 'atencion',
};

const FALLO: Ausencia = {
  enElCampo: 'fallo',
  explicacion: 'No se pudieron pedir los datos de esta pantalla. Lo que se ve es su forma, no sus datos.',
  tono: 'atencion',
};

/**
 * Llego una respuesta, pero con una forma que esta pantalla no sabe leer (#117): un importe con
 * separador de miles, una fecha que no es fecha. No se pinta nada —una cifra a medio leer es peor que
 * ninguna— y se dice que el resto de la ventanilla sigue en pie, porque sigue.
 */
const ILEGIBLE: Ausencia = {
  enElCampo: 'fallo',
  explicacion:
    'Llegaron datos que esta pantalla no sabe leer, y no se pintan para no enseñar una cifra equivocada. El resto de la ventanilla sigue en pie: avise a soporte con el nombre de esta pantalla.',
  tono: 'atencion',
};

/** Lo que se dice cuando fallo. El codigo decide la frase, y la frase no lleva el codigo: se traduce. */
export function alFallar(error: unknown): Ausencia {
  const estado = error instanceof ErrorDeLaApi ? error.estado : null;
  if (estado === 401) return SIN_SESION;
  if (estado === 403) return SIN_PERMISO;
  if (error instanceof ErrorAlRepartir) return ILEGIBLE;
  return FALLO;
}

/** Todas las frases de este archivo, para el catalogo del locale. */
export const AUSENCIAS_DE_UNA_LECTURA: readonly Ausencia[] = [CARGANDO, SIN_SESION, SIN_PERMISO, FALLO, ILEGIBLE];

/** Dos mapas en uno, con el de la derecha encima. El de la segunda lectura no pisa nada del primero. */
function unir<K, V>(uno: ReadonlyMap<K, V>, otro: ReadonlyMap<K, V>): ReadonlyMap<K, V> {
  return new Map([...uno, ...otro]);
}

/**
 * Los datos de una hoja.
 *
 * `ruta` es la de la hoja abierta (`useHoja().ruta`), y solo la mira la hoja que **elige algo**
 * (#99). Se pasa desde fuera y no se lee aqui con `useHoja()` a proposito: este gancho se prueba
 * sin montar el armazon, y `useHoja()` revienta fuera de una pantalla suya.
 */
export function useDatosDeLaHoja(clave: ClaveDeHoja, ruta?: RutaDeLaHoja): DatosDeLaPantalla {
  const conector = CONECTORES[clave];
  const deLoElegido = conector?.deLoElegido;
  const elegido = deLoElegido === undefined || ruta === undefined ? null : valorEnLaRuta(ruta, deLoElegido.enLaRuta);

  // **El reparto corre en el `select`, y no en el render** (#117). `formatearImporte` e
  // `instanteEnLima` lanzan —a proposito, nombrando el valor— con un dato que el backend no sirve,
  // y en el render ese lanzamiento desmontaba la raiz entera: menu y sesion con la hoja. En el
  // `select`, TanStack lo recoge y la consulta pasa a `isError`, que es el estado de fallo que ya
  // existia. `useCallback` para que no se reparta en cada pintada: el `select` se vuelve a correr
  // solo si cambian los datos o la funcion.
  const repartirLaLista = useCallback(
    (respuesta: unknown): Reparto => sinLanzar(() => (conector as Conector).repartir(respuesta as never, elegido)),
    [conector, elegido],
  );
  const consulta = useQuery({
    queryKey: conector?.clave ?? ['sin-conector', clave],
    queryFn: ({ signal }) => conector?.pedir(signal) ?? Promise.resolve(null),
    // Sin conector no se pide nada. Hoy lo tienen las seis hojas; lo que mantiene la rama es una
    // hoja nueva que llegara sin el, y entonces `porQueNoHayDato` dice cual de los dos casos es.
    enabled: conector !== undefined,
    retry: false,
    select: repartirLaLista,
  });

  // La segunda lectura. **La clave lleva lo elegido dentro**: dos recibos no comparten cache, y
  // volver al de antes lo ensena mientras refresca en vez de pedirlo de cero.
  const repartirElDetalle = useCallback(
    (respuesta: unknown): Aporte =>
      sinLanzar(() => (deLoElegido as LecturaDeLoElegido).repartir({ paso: 'dato', respuesta: respuesta as never })),
    [deLoElegido],
  );
  const delDetalle = useQuery({
    queryKey: deLoElegido !== undefined && elegido !== null ? deLoElegido.clave(elegido) : ['sin-elegir', clave],
    queryFn: ({ signal }) =>
      deLoElegido !== undefined && elegido !== null ? deLoElegido.pedir(elegido, signal) : Promise.resolve(null),
    // Sin nada elegido no se pide nada: abrir la hoja no manda una peticion a un numero inventado.
    enabled: deLoElegido !== undefined && elegido !== null,
    retry: false,
    select: repartirElDetalle,
  });

  /*
   * **El aporte de la segunda lectura se calcula ANTES de las tres salidas de arriba** (#98).
   *
   * Porque no depende de la primera: la conciliacion de un dia no espera a que llegue el turno. Y
   * porque su estado tiene que viajar aunque la primera este pidiendo o haya fallado — si no, el
   * bloque que declara `lectura` dibuja «nadie ha dado el estado de «conciliacion»», que el
   * interprete dice en castellano y sin pasar por `t()`. Lo destapo `todo-el-texto-se-traduce`
   * montando la hoja sin backend.
   *
   * Con dato, el aporte ya viene repartido del `select` (#117); en los otros tres pasos no hay
   * respuesta que leer, y se reparte aqui lo que cada uno dice.
   */
  const paso = pasoDe(elegido, delDetalle);
  const aporte =
    deLoElegido === undefined ? undefined : paso.paso === 'dato' ? paso.aporte : deLoElegido.repartir(paso);
  const conLasLecturas = aporte?.lecturas === undefined ? {} : { lecturas: aporte.lecturas };

  if (conector === undefined) return { ausencia: porQueNoHayDato(hojaDe(clave)) };
  if (consulta.isPending) return { ...conLasLecturas, ausencia: CARGANDO };
  if (consulta.isError) return { ...conLasLecturas, ausencia: alFallar(consulta.error) };

  const reparto = consulta.data;
  // El reparto puede afinar la frase con lo que llego: `cierre-caja` la necesita, porque «no
  // abrio turno», «ya cerro» y «tiene dos ventanillas» dejan los mismos huecos y se arreglan en
  // tres sitios distintos (#97). Los demas no la ponen, y manda la del conector.
  if (aporte === undefined) {
    return { ...deUnReparto(reparto), ausencia: reparto.ausencia ?? conector.ausencia };
  }

  // La lista ya contesto; lo que quede por decir es de la segunda lectura, y **nunca tapa la
  // lista**: un recibo que no existe deja la de arriba donde estaba.
  //
  // Y lo dice de una de las dos maneras (#98): hablando por la pantalla entera —`aporte.ausencia`,
  // que es lo que hace `duplicado-recibo`— o por la PIEZA que la declara —`aporte.lecturas`, que es
  // lo que hace la conciliacion de `cierre-caja`—. Sin lo segundo, elegir un dia borraria de la
  // pantalla el motivo por el que faltan los campos del arqueo, que lo decide el turno (#97).
  return {
    ...deUnReparto({
      valores: unir(reparto.valores, aporte.reparto.valores),
      filas: unir(reparto.filas, aporte.reparto.filas),
      tablas: unir(reparto.tablas, aporte.reparto.tablas),
      conteos: unir(reparto.conteos, aporte.reparto.conteos),
      sinDato: unir(reparto.sinDato, aporte.reparto.sinDato),
      // Y lo que las piezas leen por su nombre (#100). La segunda lectura va encima: el estado del
      // recibo lo dice ella, y lo que la primera sabe es cual se eligio.
      nombrados: unir(reparto.nombrados ?? new Map(), aporte.reparto.nombrados ?? new Map()),
    }),
    ...conLasLecturas,
    ausencia: aporte.ausencia ?? reparto.ausencia ?? conector.ausencia,
  };
}

/** En cual de sus cuatro pasos esta la segunda lectura; con dato, ya repartido por el `select`. */
function pasoDe(
  elegido: string | null,
  consulta: { isPending: boolean; isError: boolean; error: unknown; data: Aporte | undefined },
): Exclude<PasoDeLoElegido, { readonly paso: 'dato' }> | { readonly paso: 'dato'; readonly aporte: Aporte } {
  if (elegido === null) return { paso: 'sin-elegir' };
  if (consulta.isError) return { paso: 'fallo', error: consulta.error };
  if (consulta.isPending || consulta.data === undefined) return { paso: 'pidiendo' };
  return { paso: 'dato', aporte: consulta.data };
}

/**
 * Corre un reparto y, si lanza, lanza **un `ErrorAlRepartir`** con la causa dentro (#117).
 *
 * Envolverlo es lo que deja decir «llego algo que no se sabe leer» en vez de «no se pudo pedir»: el
 * dato si llego, y mandar a mirar la red seria mandar al sitio equivocado.
 */
function sinLanzar<T>(repartir: () => T): T {
  try {
    return repartir();
  } catch (causa) {
    throw new ErrorAlRepartir(causa);
  }
}

/** Un reparto, con los nombres que el interprete lee. */
function deUnReparto(reparto: Reparto): Omit<DatosDeLaPantalla, 'ausencia'> {
  return {
    valores: reparto.valores,
    filas: reparto.filas,
    tablas: reparto.tablas,
    conteos: reparto.conteos,
    ausenciaPorCampo: reparto.sinDato,
    ...(reparto.nombrados === undefined ? {} : { nombrados: reparto.nombrados }),
  };
}

export { CARGANDO };
