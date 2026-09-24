import type {
  CambioDeLoTecleado,
  DatoConNombre,
  DatosDeLaPantalla,
  EnvioDeUnActo,
  EstadoDeUnaLectura,
  HojaDelMarco,
  LoTecleado,
  ManejadoresDeLosActos,
} from '@kamayuk/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ErrorDeLaApi } from '../api/cliente.ts';
import { ACTO_DE_ANULACION, type ClaveDeHoja } from '../pantallas/arbol.ts';
import {
  NUMERO_DEL_RECIBO,
  PUEDE_ANULAR,
  PUEDE_LEER_RECIBOS,
} from '../pantallas/definiciones/tesoreria.ts';
import { aperturaDeLaAnulacion, guardarLosBorradores, leerLosBorradores } from './borradorDeLaAnulacion.ts';
import { anularElCobro, loQuePuedeLaSesion } from './laAnulacion.ts';
import { usePermisosDeLaSesion } from './useCatalogoPermitido.ts';
import { useCuentaQueEscribe } from './useCuentaDeLaSesion.ts';

/**
 * **La costura del acto que anula** (#100, ADR-0044): quien lo atiende, que sabe la pantalla de la
 * sesion, y que se dice cuando el backend lo rechaza.
 *
 * <h2>Las tres cosas que hace, y ninguna mas</h2>
 *
 *   · **Registra el manejador** que `<Pantalla actos>` espera. Un acto sin manejador sale impedido
 *     con su motivo —lo hace la libreria—, asi que esto es lo que lo hace enviable.
 *   · **Pone en `nombrados` lo que la sesion puede.** La accion de anular declara dos impedimentos
 *     que leen `puedeAnular` y `puedeLeerRecibos`, y los dos salen de la matriz que contesto
 *     `GET /seguridad/sesion/permisos`, con la regla exacta del guardia (`laAnulacion.ts`).
 *   · **Traduce el rechazo a un fallo con peldano**, en `datos.lecturas` y con la clave del acto:
 *     es donde la pieza lo pinta, encima del formulario y sin perder lo escrito.
 *
 * <h2>Por que la relectura es una invalidacion y no un dato que se guarde</h2>
 *
 * Porque lo que la pantalla tiene que ensenar despues de anular **no es lo que contesto la
 * escritura**: es lo que dice el recibo ahora, con su movimiento, su estado derivado y su recuento
 * de duplicados. Guardar aqui el acta y pintarla seria una tercera version de la verdad; invalidar
 * hace que la hoja vuelva a preguntar, que es lo que haria cualquiera al recargar.
 *
 * <h2>Y desde #117, el borrador, y que decir cuando la sesion caduco</h2>
 *
 * El token caduca a los quince minutos y nadie lo renueva (la renovacion silenciosa es de
 * `@kamayuk/sesion`, pendiente). Un 401 al confirmar ya no dice «No se pudo anular el cobro»: dice
 * que la sesion caduco y que hay que volver a entrar. Y lo escrito no se pierde en esa vuelta: la
 * definicion pide `conservaLoTecleado`, el interprete guarda lo tecleado donde esta costura le dice
 * —`conLaHoja`— y esta costura lo copia a la pestana (`borradorDeLaAnulacion.ts`). Al volver del
 * emisor, abrir la anulacion sobre el mismo recibo lo encuentra escrito. Se borra al anular con
 * exito y al cerrar el acto, que es cancelarlo.
 *
 * <h2>Y por que vive fuera de `useDatosDeLaHoja`</h2>
 *
 * Porque aquel gancho es **las lecturas de una hoja** y se prueba sin saber quien mira. Meterle la
 * escritura y los permisos lo convertiria en la costura entera, y entonces su suite tendria que
 * sembrar una sesion para medir el reparto de un arqueo.
 */

/** Lo que la costura de la anulacion le pone a la pantalla. */
export interface LaAnulacion {
  /** Los manejadores de `<Pantalla actos>`. Vacio en las hojas que no tienen ningun acto. */
  readonly actos: ManejadoresDeLosActos;
  /** Los datos de la hoja, con lo que la sesion puede y el fallo de la escritura si lo hubo. */
  readonly conLaSesion: (datos: DatosDeLaPantalla) => DatosDeLaPantalla;
  /**
   * La hoja del marco, con lo tecleado en los actos guardado **aqui** y copiado a la pestana (#117).
   * En las hojas sin acto, la misma hoja.
   */
  readonly conLaHoja: (hoja: HojaDelMarco) => HojaDelMarco;
  /** Se abrio o se cerro un acto. Cerrar el de anular es cancelarlo: su borrador se va (#117). */
  readonly alAbrirActo: (clave: string | null, parametros?: Readonly<Record<string, string>>) => void;
}

/** El titulo del peldano, por lo que el backend contesto. Cada uno se arregla en otro sitio. */
function tituloDelRechazo(estado: number | null, t: (clave: string) => string): string {
  if (estado === 401) return t('La sesión caducó antes de anular el cobro');
  if (estado === 403) return t('Su cuenta no puede anular este cobro');
  if (estado === 404) return t('Ese recibo no existe en esta municipalidad');
  if (estado === 409) return t('El estado de ese recibo ya no admite la anulación');
  if (estado === 422) return t('La anulación no se pudo registrar tal como llegó');
  return t('No se pudo anular el cobro');
}

/** Y que hacer para salir de ahi. Sin remedio cuando insistir no puede cambiar nada. */
function remedioDelRechazo(estado: number | null, t: (clave: string) => string): string | undefined {
  // El cobro NO se anulo: el backend no llego a mirarlo. Lo que se arregla es la sesion, y lo
  // escrito espera en esta pestana (#117).
  if (estado === 401) {
    return t(
      'Vuelva a entrar: cierre este formulario y recargue la página. Lo escrito queda guardado en esta pestaña para su cuenta: al volver a entrar, abra otra vez la anulación sobre este mismo recibo y seguirá ahí.',
    );
  }
  if (estado === 403) {
    return t(
      'Ese recibo lo cobró otro cajero, y anularlo toca el arqueo de su turno: lo autoriza quien responde por la caja.',
    );
  }
  if (estado === 409) return t('Vuelva a abrir el recibo: lo que se ve puede ser anterior a lo que pasó.');
  if (estado === 422) return t('Corrija lo escrito y vuelva a enviarlo.');
  if (estado === null) return t('Compruebe la conexión con el sistema de caja y vuelva a intentarlo.');
  return undefined;
}

/**
 * El fallo, ya resuelto, tal como lo pinta la pieza del acto.
 *
 * **El `detalle` es lo que dijo el backend**, palabra por palabra, y no pasa por el catálogo de
 * traducciones: es la frase que nombra el caso concreto —«ese recibo no se cobró hoy», «el turno ya
 * está cerrado»— y reescribirla aquí la perdería.
 */
export function falloDeLaAnulacion(error: unknown, t: (clave: string) => string): EstadoDeUnaLectura {
  const estado = error instanceof ErrorDeLaApi ? error.estado : null;
  const dicho = error instanceof ErrorDeLaApi ? (error.mensaje ?? error.detalle) : null;
  const remedio = remedioDelRechazo(estado, t);
  return {
    estado: 'fallo',
    peldano: {
      titulo: tituloDelRechazo(estado, t),
      detalle: dicho ?? t('El sistema de caja no contestó a la anulación.'),
      ...(remedio === undefined ? {} : { remedio }),
    },
    // `atencion` y no `mal`: un 404, un 409 o un 422 no son una averia del sistema, son lo que
    // pasa. Una banda roja de incidencia mandaria a avisar a soporte por un recibo ya anulado.
    tono: estado !== null && estado < 500 ? 'atencion' : 'mal',
  };
}

export function useLaAnulacion(clave: ClaveDeHoja): LaAnulacion {
  const { t } = useTranslation();
  const consultas = useQueryClient();
  const permisos = usePermisosDeLaSesion();
  const [fallo, setFallo] = useState<EstadoDeUnaLectura | null>(null);
  const puede = loQuePuedeLaSesion(permisos);
  const conActos = clave === 'duplicado-recibo';
  // Quien escribe: el borrador se guarda con su cuenta y solo a ella se le devuelve (#117).
  const cuenta = useCuentaQueEscribe();
  // Lo tecleado en los actos de la hoja. Nace de lo que la pestana guardaba para ESTA cuenta: es lo
  // que hace que, al volver del emisor, el acto se abra con lo escrito (#117).
  const [tecleado, setTecleado] = useState<LoTecleado>(() => ({
    campos: {},
    actos: conActos && cuenta !== null ? leerLosBorradores(cuenta) : {},
  }));
  // La cuenta cuyo borrador ya se leyo. Mientras no coincida con la de la sesion no se guarda nada:
  // guardar antes de leer escribiria un borrador vacio encima del que habia.
  const [leidoPara, setLeidoPara] = useState<string | null>(conActos ? cuenta : null);
  if (conActos && cuenta !== null && leidoPara !== cuenta) {
    // Durante el render, y no en un efecto: asi el primer guardado ya ve lo leido.
    setLeidoPara(cuenta);
    const guardados = leerLosBorradores(cuenta);
    setTecleado((antes) => ({ ...antes, actos: { ...guardados, ...antes.actos } }));
  }
  useEffect(() => {
    if (conActos && cuenta !== null && leidoPara === cuenta) guardarLosBorradores(cuenta, tecleado.actos);
  }, [conActos, cuenta, leidoPara, tecleado.actos]);
  /** Los parametros del acto de anular abierto, para saber que borrador se cancela al cerrarlo. */
  const abierto = useRef<Readonly<Record<string, string>> | null>(null);
  /**
   * El ultimo envio lo rechazo un 401 (#117, revision). Entonces cerrar el acto NO es cancelarlo: lo
   * que se le pide a quien mira es cerrar, recargar y volver a entrar, y el borrador tiene que seguir.
   */
  const rechazadoPorLaSesion = useRef(false);
  const olvidar = (parametros: Readonly<Record<string, string>>): void => {
    const apertura = aperturaDeLaAnulacion(parametros);
    setTecleado((antes) => {
      if (!Object.hasOwn(antes.actos, apertura)) return antes;
      const actos = { ...antes.actos };
      delete actos[apertura];
      return { ...antes, actos };
    });
  };

  const anular = async (envio: EnvioDeUnActo): Promise<void> => {
    // El numero sale de lo que la accion le dio al acto (`con`), que a su vez sale de la ruta de la
    // hoja: es el recibo que se esta mirando, y no uno tecleado.
    const numero = envio.parametros[NUMERO_DEL_RECIBO] ?? '';
    setFallo(null);
    rechazadoPorLaSesion.current = false;
    try {
      await anularElCobro(numero, {
        motivo: String(envio.valores['motivo'] ?? ''),
        ...(envio.valores['autorizadoPor'] === undefined
          ? {}
          : { autorizadoPor: String(envio.valores['autorizadoPor']) }),
        ...(envio.valores['nDeMemorando'] === undefined
          ? {}
          : { nDeMemorando: String(envio.valores['nDeMemorando']) }),
        observacion: envio.observacion,
      });
    } catch (error) {
      setFallo(falloDeLaAnulacion(error, t));
      rechazadoPorLaSesion.current = error instanceof ErrorDeLaApi && error.estado === 401;
      // Se relanza: la pieza distingue «enviado» de «rechazado» por si la promesa se rompio, y
      // tragarla aqui dejaria el acto diciendo que el cobro quedo anulado cuando no lo esta.
      throw error;
    }
    // Anulado, el borrador ya no sirve: volver a abrir el acto no puede ofrecer lo de un cobro que ya
    // no existe como tal (#117).
    olvidar(envio.parametros);
    // Lo que se ensena despues no es el acta: es el recibo tal como quedo. Ver el javadoc.
    await consultas.invalidateQueries({ queryKey: ['duplicado-recibo'] });
  };

  const actos: ManejadoresDeLosActos =
    clave === 'duplicado-recibo' ? { [ACTO_DE_ANULACION]: anular } : {};

  return {
    actos,
    conLaHoja: (hoja) =>
      conActos
        ? {
            ...hoja,
            tecleado,
            alTeclear: (cambio: CambioDeLoTecleado) => {
              setTecleado((antes) => cambio(antes));
            },
          }
        : hoja,
    alAbrirActo: (claveDelActo, parametros) => {
      if (claveDelActo === null) {
        if (abierto.current !== null && !rechazadoPorLaSesion.current) olvidar(abierto.current);
        abierto.current = null;
        return;
      }
      abierto.current = claveDelActo === ACTO_DE_ANULACION ? (parametros ?? {}) : null;
      rechazadoPorLaSesion.current = false;
    },
    conLaSesion: (datos) => {
      const nombrados = new Map<string, DatoConNombre>([
        ...(datos.nombrados ?? []),
        [PUEDE_ANULAR, puede.puedeAnular],
        [PUEDE_LEER_RECIBOS, puede.puedeLeerRecibos],
      ]);
      return {
        ...datos,
        nombrados,
        ...(fallo === null
          ? {}
          : { lecturas: new Map([...(datos.lecturas ?? []), [ACTO_DE_ANULACION, fallo]]) }),
      };
    },
  };
}
