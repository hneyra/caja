import type { Ausencia, DatosDeLaPantalla, RutaDeLaHoja } from '@kamayuk/ui';
import { valorEnLaRuta } from '@kamayuk/ui';
import { useQuery } from '@tanstack/react-query';

import { ErrorDeLaApi } from '../api/cliente.ts';
import type { ClaveDeHoja } from '../pantallas/arbol.ts';
import { hojaDe } from '../pantallas/arbol.ts';
import { porQueNoHayDato } from '../porQueNoHayDato.ts';
import type { PasoDeLoElegido, Reparto } from './conectores.ts';
import { CONECTORES } from './conectores.ts';

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
  explicacion: 'La sesión no vale para pedir estos datos. Vuelva a entrar.',
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

/** Lo que se dice cuando fallo. El codigo decide la frase, y la frase no lleva el codigo: se traduce. */
export function alFallar(error: unknown): Ausencia {
  const estado = error instanceof ErrorDeLaApi ? error.estado : null;
  if (estado === 401) return SIN_SESION;
  if (estado === 403) return SIN_PERMISO;
  return FALLO;
}

/** Todas las frases de este archivo, para el catalogo del locale. */
export const AUSENCIAS_DE_UNA_LECTURA: readonly Ausencia[] = [CARGANDO, SIN_SESION, SIN_PERMISO, FALLO];

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

  const consulta = useQuery({
    queryKey: conector?.clave ?? ['sin-conector', clave],
    queryFn: ({ signal }) => conector?.pedir(signal) ?? Promise.resolve(null),
    // Sin conector no se pide nada: es lo que mantiene a `anulacion-recibo` fuera de la red.
    enabled: conector !== undefined,
    retry: false,
  });

  // La segunda lectura. **La clave lleva lo elegido dentro**: dos recibos no comparten cache, y
  // volver al de antes lo ensena mientras refresca en vez de pedirlo de cero.
  const delDetalle = useQuery({
    queryKey: deLoElegido !== undefined && elegido !== null ? deLoElegido.clave(elegido) : ['sin-elegir', clave],
    queryFn: ({ signal }) =>
      deLoElegido !== undefined && elegido !== null ? deLoElegido.pedir(elegido, signal) : Promise.resolve(null),
    // Sin nada elegido no se pide nada: abrir la hoja no manda una peticion a un numero inventado.
    enabled: deLoElegido !== undefined && elegido !== null,
    retry: false,
  });

  if (conector === undefined) return { ausencia: porQueNoHayDato(hojaDe(clave)) };
  if (consulta.isPending) return { ausencia: CARGANDO };
  if (consulta.isError) return { ausencia: alFallar(consulta.error) };

  const reparto = conector.repartir(consulta.data as never, elegido);
  // El reparto puede afinar la frase con lo que llego: `cierre-caja` la necesita, porque «no
  // abrio turno», «ya cerro» y «tiene dos ventanillas» dejan los mismos huecos y se arreglan en
  // tres sitios distintos (#97). Los demas no la ponen, y manda la del conector.
  if (deLoElegido === undefined) {
    return { ...deUnReparto(reparto), ausencia: reparto.ausencia ?? conector.ausencia };
  }

  // La lista ya contesto; lo que quede por decir es de la segunda lectura, y **nunca tapa la
  // lista**: un recibo que no existe deja la de arriba donde estaba.
  const aporte = deLoElegido.repartir(pasoDe(elegido, delDetalle));
  return {
    ...deUnReparto({
      valores: unir(reparto.valores, aporte.reparto.valores),
      filas: unir(reparto.filas, aporte.reparto.filas),
      tablas: unir(reparto.tablas, aporte.reparto.tablas),
      conteos: unir(reparto.conteos, aporte.reparto.conteos),
      sinDato: unir(reparto.sinDato, aporte.reparto.sinDato),
    }),
    ausencia: aporte.ausencia,
  };
}

/** En cual de sus cuatro pasos esta la segunda lectura. */
function pasoDe(
  elegido: string | null,
  consulta: { isPending: boolean; isError: boolean; error: unknown; data: unknown },
): PasoDeLoElegido {
  if (elegido === null) return { paso: 'sin-elegir' };
  if (consulta.isError) return { paso: 'fallo', error: consulta.error };
  if (consulta.isPending) return { paso: 'pidiendo' };
  return { paso: 'dato', respuesta: consulta.data as never };
}

/** Un reparto, con los nombres que el interprete lee. */
function deUnReparto(reparto: Reparto): Omit<DatosDeLaPantalla, 'ausencia'> {
  return {
    valores: reparto.valores,
    filas: reparto.filas,
    tablas: reparto.tablas,
    conteos: reparto.conteos,
    ausenciaPorCampo: reparto.sinDato,
  };
}

export { CARGANDO };
