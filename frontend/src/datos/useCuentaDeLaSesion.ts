import { useQuery } from '@tanstack/react-query';
import type { CuentaEnLaBarra } from '@kamayuk/shell';
import { useTranslation } from 'react-i18next';

import { ErrorDeLaApi } from '../api/cliente.ts';
import type { MunicipalidadDeLaSesion, SesionDeLaVentanilla } from './lecturas.ts';
import { RUTAS, pedirUno } from './lecturas.ts';
import { LLAVES } from './useCatalogoPermitido.ts';

/**
 * **Quien esta en la ventanilla, tal como lo conoce la copia de esta caja** (#74).
 *
 * <h2>Aqui no hay un nombre escrito, y es una decision con historia</h2>
 *
 * `rentas-web` dibuja en su barra «J. Cardenas Vega», escrito en `aplicacion.tsx`. **`caja` ya pago
 * ese nombre una vez**: su maqueta V6 lo ensenaba en la barra y en el campo «Cajero» del recibo
 * impreso, servida en el dominio de produccion, y #44 lo retiro porque una persona inventada en la
 * ficha de sesion de una ventanilla se lee como la persona que cobro. Asi que la cuenta sale de
 * `GET /seguridad/sesion` y la entidad de `GET /seguridad/sesion/municipalidad`, y **lo vigila
 * `verificaciones/la-cuenta-no-se-inventa.test.tsx`**.
 *
 * <h2>Y cuando no se sabe, se dice sin inventar</h2>
 *
 * Mientras se pide, o si la copia no conoce la cuenta (404), la barra dice que no se sabe: nunca un
 * nombre de relleno. Un 404 aqui no es un fallo de red: es una cuenta que `identidad` todavia no
 * trajo a esta caja, y por eso se dice asi.
 */

/** Las iniciales de un nombre: la primera letra de las dos primeras palabras. */
export function inicialesDe(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter((p) => p !== '');
  return palabras
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}

export function useCuentaDeLaSesion(): CuentaEnLaBarra {
  const { t } = useTranslation();

  const sesion = useQuery({
    queryKey: LLAVES.sesion,
    queryFn: ({ signal }) => pedirUno<SesionDeLaVentanilla>(RUTAS.sesion, signal),
    retry: false,
  });
  const municipalidad = useQuery({
    queryKey: LLAVES.municipalidad,
    queryFn: ({ signal }) => pedirUno<MunicipalidadDeLaSesion>(RUTAS.municipalidadDeLaSesion, signal),
    retry: false,
  });

  const nota = municipalidad.data?.nombre ?? t('Municipalidad sin identificar');

  if (sesion.data !== undefined) {
    return { nombre: sesion.data.nombre, iniciales: inicialesDe(sesion.data.nombre), nota };
  }
  if (sesion.isError) {
    const estado = sesion.error instanceof ErrorDeLaApi ? sesion.error.estado : null;
    return {
      nombre: estado === 404 ? t('Cuenta que esta caja todavia no conoce') : t('Cuenta sin identificar'),
      iniciales: '—',
      nota,
    };
  }
  return { nombre: t('Identificando la cuenta…'), iniciales: '…', nota };
}
