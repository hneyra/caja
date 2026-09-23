import { afterEach, describe, expect, it, vi } from 'vitest';

import { ACTO_DE_ANULACION } from '../pantallas/arbol.ts';
import {
  CLAVE_DEL_BORRADOR,
  aperturaDeLaAnulacion,
  guardarLosBorradores,
  leerLosBorradores,
} from './borradorDeLaAnulacion.ts';

/**
 * **El borrador de la anulacion, en el almacenamiento de la pestana** (#117).
 *
 * Lo que puede fallar aqui es lo que el navegador hace por su cuenta: un almacenamiento bloqueado
 * que lanza al tocarlo, un valor que otra version dejo con otra forma. Ninguno de los dos puede
 * tumbar el acto: en el peor caso, no hay borrador.
 */

const APERTURA = aperturaDeLaAnulacion({ numeroDelRecibo: '001-000123' });
const ESCRITO = {
  valores: { motivo: 'Cobro duplicado', autorizadoPor: 'La jefa' },
  observacion: 'A pedido de tesoreria',
  intentado: true,
};

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('el borrador de la anulacion', () => {
  it('la apertura es la del interprete: la clave del acto y los parametros con que se abrio', () => {
    expect(APERTURA).toBe(`${ACTO_DE_ANULACION}|{"numeroDelRecibo":"001-000123"}`);
  });

  it('lo guardado se lee igual, bajo la clave con el prefijo de esta interfaz', () => {
    guardarLosBorradores({ [APERTURA]: ESCRITO });
    expect(CLAVE_DEL_BORRADOR.startsWith('kamayuk.caja.')).toBe(true);
    expect(sessionStorage.getItem(CLAVE_DEL_BORRADOR)).not.toBeNull();
    expect(leerLosBorradores()).toEqual({ [APERTURA]: ESCRITO });
  });

  it('solo guarda lo del acto de anular: lo de otro acto no sale de la memoria', () => {
    guardarLosBorradores({ [APERTURA]: ESCRITO, 'otro-acto|{}': ESCRITO });
    expect(Object.keys(leerLosBorradores())).toEqual([APERTURA]);
  });

  it('sin borradores, la clave se quita: no se deja un objeto vacio en la pestana', () => {
    guardarLosBorradores({ [APERTURA]: ESCRITO });
    guardarLosBorradores({});
    expect(sessionStorage.getItem(CLAVE_DEL_BORRADOR)).toBeNull();
  });

  it('un valor ilegible o con otra forma no es un borrador', () => {
    sessionStorage.setItem(CLAVE_DEL_BORRADOR, '{no es json');
    expect(leerLosBorradores()).toEqual({});
    sessionStorage.setItem(
      CLAVE_DEL_BORRADOR,
      JSON.stringify({ [APERTURA]: { valores: { motivo: 3 }, observacion: 'x', intentado: false } }),
    );
    expect(leerLosBorradores()).toEqual({});
  });

  it('un almacenamiento que lanza no tumba nada: se lee vacio y guardar no hace nada', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(leerLosBorradores()).toEqual({});
    expect(() => {
      guardarLosBorradores({ [APERTURA]: ESCRITO });
    }).not.toThrow();
  });
});
