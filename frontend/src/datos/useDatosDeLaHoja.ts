import type { Ausencia, DatosDeLaPantalla } from '@kamayuk/ui';
import { useQuery } from '@tanstack/react-query';

import { ErrorDeLaApi } from '../api/cliente.ts';
import type { ClaveDeHoja } from '../pantallas/arbol.ts';
import { hojaDe } from '../pantallas/arbol.ts';
import { porQueNoHayDato } from '../porQueNoHayDato.ts';
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

export function useDatosDeLaHoja(clave: ClaveDeHoja): DatosDeLaPantalla {
  const conector = CONECTORES[clave];

  const consulta = useQuery({
    queryKey: conector?.clave ?? ['sin-conector', clave],
    queryFn: ({ signal }) => conector?.pedir(signal) ?? Promise.resolve(null),
    // Sin conector no se pide nada: es lo que mantiene a `anulacion-recibo` fuera de la red.
    enabled: conector !== undefined,
    retry: false,
  });

  if (conector === undefined) return { ausencia: porQueNoHayDato(hojaDe(clave)) };
  if (consulta.isPending) return { ausencia: CARGANDO };
  if (consulta.isError) return { ausencia: alFallar(consulta.error) };

  const reparto = conector.repartir(consulta.data as never);
  return {
    valores: reparto.valores,
    filas: reparto.filas,
    conteos: reparto.conteos,
    ausenciaPorCampo: reparto.sinDato,
    ausencia: { enElCampo: conector.enElCampo, explicacion: conector.explicacion, tono: 'info' },
  };
}

export { CARGANDO };
