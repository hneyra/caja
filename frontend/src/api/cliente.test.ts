import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorDeLaApi, PREFIJO, leer } from './cliente.ts';
import { fijarToken } from './identidad.ts';

/**
 * **La costura con `@kamayuk/api`: el prefijo de la ventanilla, el token de su puerta, y solo leer** (#74).
 *
 * Como el cliente es el de la libreria, lo que se prueba aqui es lo que `cliente.ts` decide: a que
 * API se habla, con que token, y que no se puede escribir. Lo que el `problem+json` trae y como se
 * lee lo prueba `paquetes/api/cliente.test.ts`; aqui solo se comprueba que llega, con los codigos
 * que publica el `ManejadorDeErrores` de este backend.
 */

function fetchQueContesta(respuesta: Response) {
  const espia = vi.fn<typeof fetch>(() => Promise.resolve(respuesta.clone()));
  vi.stubGlobal('fetch', espia);
  return espia;
}

/** Un `problem+json` con la forma que publica la cadena de identidad: CUATRO miembros. */
function problema(estado: number, codigo: string, mensaje: string): Response {
  return new Response(JSON.stringify({ status: estado, title: mensaje, codigo, mensaje }), {
    status: estado,
    headers: { 'content-type': 'application/problem+json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  fijarToken(null);
});

describe('la ventanilla habla con SU API y con ninguna otra (ADR-0042)', () => {
  it('cuelga la ruta de /caja/api/v1', async () => {
    const espia = fetchQueContesta(Response.json({ ok: true }));

    await leer('/cajas');

    expect(PREFIJO).toBe('/caja/api/v1');
    expect(espia.mock.calls[0]?.[0]).toBe('/caja/api/v1/cajas');
  });

  it('pide con GET y sin cuerpo: `leer` no sabe escribir', async () => {
    const espia = fetchQueContesta(Response.json({ ok: true }));

    await leer('/recibos');

    const opciones = espia.mock.calls[0]?.[1];
    expect(opciones?.method).toBe('GET');
    expect(opciones?.body).toBeUndefined();
  });
});

describe('manda el token de la puerta, y sin token no manda nada', () => {
  it('con token, manda Authorization: Bearer', async () => {
    fijarToken('un-token-de-prueba');
    const espia = fetchQueContesta(Response.json({ ok: true }));

    await leer('/seguridad/sesion');

    const cabeceras = espia.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(cabeceras['Authorization']).toBe('Bearer un-token-de-prueba');
  });

  it('sin token NO manda la cabecera, en vez de mandar «Bearer null»', async () => {
    const espia = fetchQueContesta(Response.json({ ok: true }));

    await leer('/seguridad/sesion');

    const cabeceras = espia.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(cabeceras['Authorization']).toBeUndefined();
  });

  it('el token se lee en CADA peticion, no se congela al cargar el modulo', async () => {
    const espia = fetchQueContesta(Response.json({ ok: true }));
    await leer('/seguridad/sesion');
    fijarToken('llego-despues');
    await leer('/seguridad/sesion');

    const segunda = espia.mock.calls[1]?.[1]?.headers as Record<string, string>;
    expect(segunda['Authorization']).toBe('Bearer llego-despues');
  });
});

describe('el cliente jamas manda municipalidadId (regla 2)', () => {
  it.each(['/seguridad/sesion', '/seguridad/sesion/municipalidad', '/cajas', '/recibos'])(
    'ni en la ruta, ni en la consulta, ni en las cabeceras: %s',
    async (ruta) => {
      fijarToken('un-token');
      const espia = fetchQueContesta(Response.json({ ok: true }));

      await leer(ruta);

      const [url, opciones] = espia.mock.calls[0] ?? [];
      const todo = `${String(url)} ${JSON.stringify(opciones?.headers)}`.toLowerCase();
      expect(todo).not.toContain('municipalidadid');
      expect(todo).not.toContain('municipalidad_id');
    },
  );
});

describe('el error del backend llega con su codigo', () => {
  it('los tres peldanos de la cadena de identidad se distinguen', async () => {
    fetchQueContesta(problema(401, 'NO_AUTENTICADO', 'La peticion no trae un token valido'));
    await expect(leer('/seguridad/sesion')).rejects.toMatchObject({ estado: 401, codigo: 'NO_AUTENTICADO' });

    vi.unstubAllGlobals();
    fetchQueContesta(problema(403, 'SIN_MUNICIPALIDAD', 'El token no identifica una municipalidad'));
    await expect(leer('/seguridad/sesion')).rejects.toMatchObject({ estado: 403, codigo: 'SIN_MUNICIPALIDAD' });

    vi.unstubAllGlobals();
    fetchQueContesta(problema(403, 'SIN_PRIVILEGIO', 'No tiene el privilegio LECTURA sobre duplicado_recibo'));
    await expect(leer('/recibos')).rejects.toBeInstanceOf(ErrorDeLaApi);
  });
});
