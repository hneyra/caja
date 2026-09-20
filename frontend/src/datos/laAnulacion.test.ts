import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorDeLaApi } from '../api/cliente.ts';
import {
  ACCESOS_QUE_LEEN_RECIBOS,
  RUTA_DE_LA_ANULACION,
  anularElCobro,
  loQuePuedeLaSesion,
  rutaDeLaAnulacion,
} from './laAnulacion.ts';
import { falloDeLaAnulacion } from './useLaAnulacion.ts';

/**
 * **La unica escritura de la ventanilla, medida sin montar nada** (#100, ADR-0044).
 *
 * Tres cosas, y las tres son las que un componente no puede medir bien:
 *
 *   · **Lo que sale al cable**: el verbo, la ruta y el cuerpo, tal cual.
 *   · **Lo que la sesion puede**, con la regla EXACTA del guardia del backend. Una interfaz que
 *     ofrece lo que el guardia niega —o esconde lo que permite— es peor que no filtrar (ADR-0042).
 *   · **Que dice cada rechazo.** Un 404, un 409, un 422 y un 403 se arreglan en cuatro sitios
 *     distintos, y una frase unica manda a tres de ellos al equivocado.
 */

const JSON_ = { 'content-type': 'application/json' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('lo que sale al cable', () => {
  it('es un `POST` a la ruta del cobro, con el cuerpo tal cual', async () => {
    const doble = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ numero: '001-000123' }), { status: 201, headers: JSON_ })),
    );
    vi.stubGlobal('fetch', doble);

    await anularElCobro('001-000123', { motivo: 'Cobro duplicado', observacion: 'Se anula por duplicado' });

    const [url, opciones] = doble.mock.calls[0] ?? [];
    expect(String(url)).toBe('/caja/api/v1/cobros/001-000123/anulacion');
    expect(opciones?.method).toBe('POST');
    expect(JSON.parse(String(opciones?.body))).toEqual({
      motivo: 'Cobro duplicado',
      observacion: 'Se anula por duplicado',
    });
    // Y ninguna clave de idempotencia: este backend no la lee para esta ruta, y mandarla daria la
    // ilusion de que un reintento es inocuo. Lo que contesta un reintento es 409.
    expect(JSON.stringify(opciones?.headers)).not.toContain('Idempotency');
  });

  it('la ruta lleva la variable entre llaves, como su `@PostMapping`, y el numero se codifica', () => {
    expect(RUTA_DE_LA_ANULACION).toBe('/cobros/{nro}/anulacion');
    expect(rutaDeLaAnulacion('001-000123')).toBe('/cobros/001-000123/anulacion');
    // La serie la pone cada instalacion: una con una barra dentro partiria la ruta en dos.
    expect(rutaDeLaAnulacion('001/A-9')).toBe('/cobros/001%2FA-9/anulacion');
  });

  it('y un rechazo del backend NO se traga aqui: sube con su estado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() =>
        Promise.resolve(new Response(JSON.stringify({ mensaje: 'Ese recibo ya fue anulado' }), { status: 409, headers: JSON_ })),
      ),
    );

    await expect(anularElCobro('001-000123', { motivo: 'm', observacion: 'obs' })).rejects.toMatchObject({
      estado: 409,
    });
  });
});

describe('lo que la sesion puede, con la regla del guardia', () => {
  it('anular exige ELIMINACION sobre `anulacion_recibo`, ni mas ni menos', () => {
    expect(loQuePuedeLaSesion({ anulacion_recibo: ['eliminacion'] }).puedeAnular).toBe(true);
    // No hay jerarquia entre los siete privilegios: `GuardiaDeAcceso` pregunta por el exacto.
    expect(loQuePuedeLaSesion({ anulacion_recibo: ['lectura'] }).puedeAnular).toBe(false);
    expect(loQuePuedeLaSesion({ anulacion_recibo: ['especial'] }).puedeAnular).toBe(false);
    expect(loQuePuedeLaSesion({}).puedeAnular).toBe(false);
  });

  it('y leer recibos, LECTURA sobre cualquiera de los dos accesos que el controlador declara', () => {
    expect(ACCESOS_QUE_LEEN_RECIBOS).toEqual(['duplicado_recibo', 'anulacion_recibo']);
    expect(loQuePuedeLaSesion({ duplicado_recibo: ['lectura'] }).puedeLeerRecibos).toBe(true);
    expect(loQuePuedeLaSesion({ anulacion_recibo: ['lectura'] }).puedeLeerRecibos).toBe(true);
    // **El limite de `oTambien`, medido**: conserva el privilegio, asi que ELIMINACION sola no abre
    // la lista. Es lo que la accion dice en su segundo motivo en vez de dejar una pantalla vacia.
    expect(loQuePuedeLaSesion({ anulacion_recibo: ['eliminacion'] }).puedeLeerRecibos).toBe(false);
  });

  it('una matriz con algo que no es una lista no tumba nada: se lee como «no puede»', () => {
    const rara = { anulacion_recibo: 'eliminacion' as unknown as readonly string[] };
    expect(() => loQuePuedeLaSesion(rara)).not.toThrow();
    expect(loQuePuedeLaSesion(rara).puedeAnular).toBe(false);
  });
});

describe('que dice cada rechazo', () => {
  const t = (clave: string) => clave;
  const fallo = (estado: number | null, mensaje: string | null = null) =>
    falloDeLaAnulacion(
      estado === null
        ? new TypeError('Failed to fetch')
        : new ErrorDeLaApi(estado, 'POST /cobros/1/anulacion', mensaje === null ? {} : { mensaje }),
      t,
    );

  it.each([
    [403, /no puede anular/, /otro cajero/],
    [404, /no existe/, undefined],
    [409, /ya no admite/, /Vuelva a abrir/],
    [422, /no se pudo registrar/, /Corrija/],
  ] as const)('un %i dice lo suyo, y su remedio', (estado, titulo, remedio) => {
    const peldano = fallo(estado);
    expect(peldano.estado).toBe('fallo');
    if (peldano.estado !== 'fallo') return;
    expect(peldano.peldano.titulo).toMatch(titulo);
    if (remedio !== undefined) expect(peldano.peldano.remedio).toMatch(remedio);
    // Y ninguno es una averia del sistema: una banda roja mandaria a avisar a soporte por un
    // recibo ya anulado.
    expect(peldano.tono).toBe('atencion');
  });

  it('el DETALLE es lo que dijo el backend, palabra por palabra', () => {
    const peldano = fallo(409, 'Ese recibo no se cobro hoy: fuera del dia de pago');
    expect(peldano.estado === 'fallo' && peldano.peldano.detalle).toBe(
      'Ese recibo no se cobro hoy: fuera del dia de pago',
    );
  });

  it('y sin respuesta —la red— se dice que no contesto, y que reintentar puede cambiar algo', () => {
    const peldano = fallo(null);
    expect(peldano.estado).toBe('fallo');
    if (peldano.estado !== 'fallo') return;
    expect(peldano.peldano.detalle).toMatch(/no contestó/);
    expect(peldano.peldano.remedio).toMatch(/conexión/);
    expect(peldano.tono, 'sin estado no se sabe que fue: se trata como averia').toBe('mal');
  });
});
