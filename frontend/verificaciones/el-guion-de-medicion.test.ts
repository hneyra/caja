// @vitest-environment node
//
// En `node`: el guion corre en Node, arranca un proceso hijo y no toca el DOM.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  LECTURAS,
  MedicionImposible,
  PREFIJO_DE_LA_API,
  REDACTADO,
  codigoDeSalida,
  compararFormas,
  formaDe,
  medir,
  problemasDeLasOpciones,
  redactar,
  rutaDeLaConciliacion as laDelGuion,
  rutaDelCierre as elDelGuion,
  rutaDelDuplicado as elDuplicadoDelGuion,
  type Efectos,
  type Opciones,
} from '../desarrollo/medicion.ts';
import { PREFIJO } from '../src/api/cliente.ts';
import { RUTAS, rutaDeLaConciliacion, rutaDelCierre, rutaDelDuplicado } from '../src/datos/lecturas.ts';
import { PERMISOS_MEDIDOS } from '../src/datos/seguridadMedida.ts';
import { SESION_MEDIDA } from '../src/datos/sesionMedida.ts';
import {
  CIERRE_MEDIDO,
  DUPLICADO_MEDIDO,
  RECIBOS_MEDIDOS,
  TURNO_MEDIDO,
  TURNO_SIN_ABRIR_MEDIDO,
} from '../src/datos/tesoreriaMedida.ts';
import { RAIZ } from './raiz.ts';

/**
 * **El guion de medicion de #89: lo que se puede probar sin `stg`.**
 *
 * La medicion de verdad necesita la cuenta de medicion, que solo existe en `stg`. Lo que se prueba
 * aqui es que el dia que exista el guion **diga la verdad**:
 *
 *   · que pide **las mismas rutas** que la ventanilla —las de `RUTAS`, con su consulta— y no una
 *     lista que se quede vieja al lado;
 *   · que la comparacion de formas **ve** lo que tiene que ver: un campo que sobra, uno que falta, un
 *     nulo que la captura no ejerce, un `Instant` con fraccion, un importe con un decimal de menos;
 *   · que **ni la clave ni el token** salen en la consola ni en un archivo, aunque el servidor los
 *     devuelva en el cuerpo;
 *   · y que **solo lee**: un `POST`, el del token, y ninguno mas.
 */

const CLAVE = 'clave-de-prueba-9f3c1a';
// Con forma de JWT a proposito: la red de `redactar` los busca por su forma, ademas de por su valor.
const TOKEN = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJtZWRpY2lvbiJ9.firma-de-prueba';
const BASE = 'https://caja.ejemplo';
const EMISOR = 'https://caja.ejemplo/keycloak/realms/kamayuk';
const URL_DEL_TOKEN = `${EMISOR}/protocol/openid-connect/token`;

const OPCIONES: Opciones = {
  base: BASE,
  emisor: EMISOR,
  cliente: 'kamayuk-verificacion',
  cuenta: 'medicion-de-interfaces',
  clave: CLAVE,
  invocacion: 'node desarrollo/medir-las-capturas.mjs --base https://caja.ejemplo',
};

const json = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'content-type': 'application/json' } });

/** Lo que contesta el backend falso: la propia captura, que es lo que una medicion ideal daria. */
function respuestasIdeales(): Map<string, unknown> {
  const mapa = new Map<string, unknown>();
  for (const lectura of LECTURAS) mapa.set(lectura.clave, lectura.capturas[0]);
  return mapa;
}

interface Llamada {
  readonly metodo: string;
  readonly url: string;
  readonly autorizacion: string | null;
  readonly cuerpo: string;
}

/**
 * Un emisor y un backend falsos, en memoria. Cada ruta contesta lo que diga `contestar`; lo que no
 * contesta es un 404. Anota cada llamada, y lo que el guion escribe y registra.
 */
function montar(contestar: (ruta: string, llamada: Llamada) => Response | undefined) {
  const llamadas: Llamada[] = [];
  const archivos = new Map<string, string>();
  const lineas: string[] = [];
  const efectos: Efectos = {
    pedir: async (url, init) => {
      const cabeceras = new Headers(init.headers);
      const llamada: Llamada = {
        metodo: init.method ?? 'GET',
        url,
        autorizacion: cabeceras.get('authorization'),
        cuerpo: typeof init.body === 'string' ? init.body : '',
      };
      llamadas.push(llamada);
      if (url === URL_DEL_TOKEN) {
        const recibido = new URLSearchParams(llamada.cuerpo);
        return recibido.get('password') === CLAVE
          ? json({ access_token: TOKEN, refresh_token: `${TOKEN}-refresco`, token_type: 'Bearer' })
          : json({ error: 'invalid_grant', error_description: 'Invalid user credentials' }, 401);
      }
      const ruta = url.slice(`${BASE}${PREFIJO_DE_LA_API}`.length);
      return contestar(ruta, llamada) ?? new Response('', { status: 404 });
    },
    guardar: async (nombre, contenido) => {
      archivos.set(nombre, contenido);
    },
    registrar: (linea) => lineas.push(linea),
    ahora: () => new Date('2026-09-23T15:00:00Z'),
  };
  return { efectos, llamadas, archivos, lineas };
}

/** Un backend que contesta a cada ruta con lo que `porClave` diga para su lectura. */
function backend(porClave: Map<string, unknown>) {
  return (ruta: string) => {
    const lectura = LECTURAS.find((l) => {
      const plantilla = new RegExp(
        `^${l.plantilla.replace(/[?.]/g, '\\$&').replace(/\{[^}]+\}/g, '[^/?]+')}(\\?.*)?$`,
      );
      return plantilla.test(ruta);
    });
    if (lectura === undefined || !porClave.has(lectura.clave)) return undefined;
    return json(porClave.get(lectura.clave));
  };
}

describe('el guion pide lo que pide la ventanilla', () => {
  it('las catorce lecturas son las de `RUTAS`, clave a clave y con la misma consulta', () => {
    expect(Object.fromEntries(LECTURAS.map((l) => [l.clave, l.plantilla]))).toEqual(RUTAS);
    expect(LECTURAS).toHaveLength(14);
  });

  it('las rutas con variable se componen igual que en `lecturas.ts`', () => {
    for (const numero of ['001-000123', 'A/B 7']) expect(elDuplicadoDelGuion(numero)).toBe(rutaDelDuplicado(numero));
    expect(elDelGuion(7)).toBe(rutaDelCierre(7));
    expect(laDelGuion('2026-03-15')).toBe(rutaDeLaConciliacion('2026-03-15'));
  });

  it('y bajo el mismo prefijo que el cliente', () => {
    expect(PREFIJO_DE_LA_API).toBe(PREFIJO);
  });
});

describe('la comparacion de formas', () => {
  it('EL CENTINELA: cada captura comparada consigo misma no tiene ninguna diferencia', () => {
    // Sin esto, una comparacion que lo marcara TODO pasaria las pruebas de abajo.
    for (const lectura of LECTURAS) {
      for (const captura of lectura.capturas) expect(compararFormas(captura, lectura.capturas), lectura.clave).toEqual([]);
    }
  });

  it('clasifica los formatos que importan en el borde', () => {
    expect(formaDe('2026-03-16T02:04:00Z')).toBe('texto:instante-utc');
    expect(formaDe('2026-03-16T02:04:00.123456Z')).toBe('texto:instante-utc-fraccion-6');
    expect(formaDe('2026-03-15T21:04:00-05:00')).toBe('texto:instante-con-desfase');
    expect(formaDe('2026-03-16T02:04:00')).toBe('texto:fecha-y-hora-sin-zona');
    expect(formaDe('2026-03-15')).toBe('texto:fecha');
    expect(formaDe('1842.60')).toBe('texto:decimal-2');
    expect(formaDe('1842.6')).toBe('texto:decimal-1');
    expect(formaDe(1842.6)).toBe('numero:con-decimales');
    expect(formaDe(7)).toBe('numero:entero');
    expect(formaDe(null)).toBe('nulo');
    expect(formaDe('6f1c0b5e-8d2a-4c71-9e3b-2a5d7c9e1f04')).toBe('texto:uuid');
  });

  it('un campo que SOBRA en lo medido se dice', () => {
    const medida = { ...SESION_MEDIDA, ejercicio: 2026 };
    expect(compararFormas(medida, [SESION_MEDIDA])).toEqual([
      { ruta: '$.ejercicio', clase: 'sobra', detalle: 'lo medido lo trae y la captura no' },
    ]);
  });

  it('un campo que FALTA —un nulo omitido por el backend— se dice', () => {
    const { anulacion: _omitida, ...medida } = DUPLICADO_MEDIDO;
    expect(compararFormas(medida, [DUPLICADO_MEDIDO])).toEqual([
      { ruta: '$.anulacion', clase: 'falta', detalle: 'la captura lo tiene y lo medido no lo trae' },
    ]);
  });

  it('un `Instant` con fraccion y un importe con un decimal de menos, dentro de una lista', () => {
    const [primero, segundo] = RECIBOS_MEDIDOS.contenido;
    const medida = {
      ...RECIBOS_MEDIDOS,
      contenido: [
        { ...primero, emitidoEn: '2026-03-16T02:04:00.123456Z' },
        { ...segundo, importe: { importe: '25.0', actualizadoA: '2026-03-15' } },
      ],
    };
    expect(compararFormas(medida, [RECIBOS_MEDIDOS]).map((d) => [d.clase, d.ruta, d.detalle])).toEqual([
      [
        'forma',
        '$.contenido[].emitidoEn',
        'llega «texto:instante-utc-fraccion-6» y la captura solo ejerce «texto:instante-utc»',
      ],
      ['forma', '$.contenido[].importe.importe', 'llega «texto:decimal-1» y la captura solo ejerce «texto:decimal-2»'],
    ]);
  });

  it('un nulo que la captura no ejerce se dice; uno que si ejerce, no', () => {
    expect(compararFormas({ ...SESION_MEDIDA, nombre: null }, [SESION_MEDIDA]).map((d) => d.ruta)).toEqual([
      '$.nombre',
    ]);
    // `documentoDelPagador` llega nulo en la segunda fila de la captura: es legitimo.
    const [, segundo] = RECIBOS_MEDIDOS.contenido;
    expect(compararFormas({ ...RECIBOS_MEDIDOS, contenido: [segundo] }, [RECIBOS_MEDIDOS])).toEqual([]);
  });

  it('lo que la captura solo ejerce como nulo y llega lleno se dice UNA vez, sin bajar', () => {
    const importe = { importe: '1842.60', actualizadoA: '2026-03-15' };
    const medida = { ...CIERRE_MEDIDO, arqueo: { ...CIERRE_MEDIDO.arqueo, declarado: importe } };
    expect(compararFormas(medida, [CIERRE_MEDIDO])).toEqual([
      { ruta: '$.arqueo.declarado', clase: 'forma', detalle: 'llega «objeto» y la captura solo ejerce «nulo»' },
    ]);
  });

  it('las capturas de una misma lectura se unen, y una lista vacia no es una diferencia', () => {
    expect(compararFormas(TURNO_SIN_ABRIR_MEDIDO, [TURNO_MEDIDO, TURNO_SIN_ABRIR_MEDIDO])).toEqual([]);
    expect(compararFormas(TURNO_MEDIDO, [TURNO_MEDIDO, TURNO_SIN_ABRIR_MEDIDO])).toEqual([]);
  });
});

describe('los secretos no salen', () => {
  it('`redactar` quita el valor, su forma codificada y cualquier JWT, y no la cadena vacia', () => {
    const clave = 'a b&c';
    expect(redactar(`x ${clave} y ${encodeURIComponent(clave)} z`, [clave])).toBe(`x ${REDACTADO} y ${REDACTADO} z`);
    expect(redactar(`Bearer ${TOKEN}`, [])).toBe(`Bearer ${REDACTADO}`);
    expect(redactar('nada que ocultar', [''])).toBe('nada que ocultar');
  });

  it('ni la clave ni el token llegan a la consola ni a un archivo, aunque el backend los devuelva', async () => {
    const eco = (ruta: string, llamada: Llamada) =>
      ruta === '/seguridad/sesion'
        ? json({ detail: `me llego ${llamada.autorizacion ?? ''} y la clave ${CLAVE}` }, 403)
        : backend(respuestasIdeales())(ruta);
    const { efectos, archivos, lineas } = montar(eco);

    await medir(OPCIONES, efectos);

    // Primero la fuga, que es lo que tiene que nombrar el rojo.
    for (const [donde, texto] of [['la consola', lineas.join('\n')], ...archivos.entries()]) {
      expect(texto, `la clave salio en ${donde}`).not.toContain(CLAVE);
      expect(texto, `el token salio en ${donde}`).not.toContain(TOKEN);
      expect(texto, `la firma del token salio en ${donde}`).not.toContain(TOKEN.split('.')[2]);
    }
    // EL CENTINELA: el eco llego a lo escrito, redactado. Sin esto, un guion que no guardara nada
    // pasaria lo de arriba en verde.
    expect(archivos.get('01-sesion.cuerpo')).toContain(REDACTADO);
    expect(lineas.some((l) => l.includes('FALLO') && l.includes(REDACTADO))).toBe(true);
    // Y la respuesta del token —con el de refresco— no se guarda.
    expect(archivos.get('00-token.json')).not.toMatch(/access_token|refresh_token/);
  });

  it('si el emisor rechaza la clave, el error no la lleva y dice donde mirar', async () => {
    const { efectos, lineas, archivos } = montar(() => undefined);
    const fallo = medir({ ...OPCIONES, clave: `${CLAVE}-otra` }, efectos);
    await expect(fallo).rejects.toBeInstanceOf(MedicionImposible);
    await expect(fallo).rejects.toThrow(/invalid_grant[\s\S]*UPDATE_PASSWORD/);
    expect([...lineas, ...archivos.values()].join('\n')).not.toContain(CLAVE);
  });
});

describe('el guion solo lee', () => {
  it('un POST, al emisor, con la clave; lo demas son GET a la API con el token', async () => {
    const { efectos, llamadas } = montar(backend(respuestasIdeales()));

    const resultados = await medir(OPCIONES, efectos);

    expect(llamadas[0]?.metodo).toBe('POST');
    expect(llamadas[0]?.url).toBe(URL_DEL_TOKEN);
    expect(llamadas.filter((l) => l.metodo !== 'GET')).toHaveLength(1);
    const lecturas = llamadas.slice(1);
    expect(lecturas.every((l) => l.autorizacion === `Bearer ${TOKEN}` && l.url.startsWith(`${BASE}${PREFIJO}`))).toBe(
      true,
    );
    // Las catorce, en su orden, con las tres variables encadenadas de las respuestas anteriores.
    expect(lecturas.map((l) => l.url.slice(`${BASE}${PREFIJO}`.length))).toEqual([
      RUTAS.sesion,
      RUTAS.municipalidadDeLaSesion,
      RUTAS.modulos,
      RUTAS.accesos,
      RUTAS.permisosDeLaSesion,
      RUTAS.cajas,
      RUTAS.recibos,
      rutaDelDuplicado(RECIBOS_MEDIDOS.contenido[0]?.numero ?? ''),
      RUTAS.turnoDelDia,
      rutaDelCierre(TURNO_MEDIDO.turnos[0]?.turnoId ?? 0),
      RUTAS.pagosSinEntregar,
      RUTAS.avanceDeRecaudacion,
      RUTAS.recaudacionPorArea,
      rutaDeLaConciliacion(TURNO_MEDIDO.fecha),
    ]);
    expect(resultados.every((r) => r.estado === 200 && r.diferencias.length === 0)).toBe(true);
    expect(codigoDeSalida(resultados)).toBe(0);
  });

  it('sin turno abierto el arqueo se OMITE y lo dice; con `--turno`, se pide ese', async () => {
    const respuestas = respuestasIdeales();
    respuestas.set('turnoDelDia', TURNO_SIN_ABRIR_MEDIDO);

    const sinTurno = montar(backend(respuestas));
    const resultados = await medir(OPCIONES, sinTurno.efectos);
    const cierre = resultados.find((r) => r.clave === 'cierreDelTurno');
    expect(cierre?.omitida).toMatch(/--turno/);
    expect(sinTurno.lineas.some((l) => l.startsWith('OMITIDA cierreDelTurno'))).toBe(true);
    // Una omision no es un fallo: la cuenta de medicion no cobra.
    expect(codigoDeSalida(resultados)).toBe(0);

    const conTurno = montar(backend(respuestas));
    await medir({ ...OPCIONES, turno: 42 }, conTurno.efectos);
    expect(conTurno.llamadas.map((l) => l.url)).toContain(`${BASE}${PREFIJO}${rutaDelCierre(42)}`);
  });

  it('una forma distinta o un estado que no es 200 salen con 1', async () => {
    const respuestas = respuestasIdeales();
    respuestas.set('permisosDeLaSesion', { ...PERMISOS_MEDIDOS, caja_tasas: null });
    const { efectos, lineas, archivos } = montar(backend(respuestas));
    const resultados = await medir(OPCIONES, efectos);
    expect(codigoDeSalida(resultados)).toBe(1);
    expect(lineas.some((l) => l.startsWith('DISTINTA permisosDeLaSesion'))).toBe(true);
    // Lo guardado lleva la orden exacta —con `$TOKEN`, no su valor—, el estado y la fecha.
    const meta = JSON.parse(archivos.get('05-permisosDeLaSesion.json') ?? '{}') as Record<string, unknown>;
    expect(meta.orden).toBe(
      `curl -sS -H "Authorization: Bearer $TOKEN" -H 'Accept: application/json' '${BASE}${PREFIJO}${RUTAS.permisosDeLaSesion}'`,
    );
    expect(meta.estado).toBe(200);
    expect(meta.fecha).toBe('2026-09-23T15:00:00.000Z');
  });

  it('en el texto: la cascara llama a `fetch` UNA vez, y el nucleo no escribe con otro metodo', () => {
    const cascara = readFileSync(join(RAIZ, 'desarrollo/medir-las-capturas.mjs'), 'utf8');
    const nucleo = readFileSync(join(RAIZ, 'desarrollo/medicion.ts'), 'utf8');
    expect(cascara.match(/\bfetch\s*\(/g)).toHaveLength(1);
    expect(nucleo.match(/method:\s*'[A-Z]+'/g)).toEqual(["method: 'POST'", "method: 'GET'"]);
  });
});

describe('la orden', () => {
  it('exige https fuera de la maquina propia, y la clave', () => {
    expect(problemasDeLasOpciones({ base: 'http://localhost:8080', emisor: 'http://localhost:8180/realms/kamayuk', clave: 'x' })).toEqual([]);
    expect(problemasDeLasOpciones({ base: 'http://caja.ejemplo', emisor: EMISOR, clave: '' })).toEqual([
      '--base tiene que ser https (o http a localhost): «http://caja.ejemplo»',
      'falta la clave en KAMAYUK_CLAVE_DE_MEDICION',
    ]);
  });

  it('la clave NO se admite como argumento, y lo que se imprime al rechazar no la lleva', () => {
    const guion = join(RAIZ, 'desarrollo/medir-las-capturas.mjs');
    const conArgumento = spawnSync(process.execPath, [guion, '--clave', CLAVE], { encoding: 'utf8' });
    expect(conArgumento.status).toBe(2);
    expect(conArgumento.stderr).toMatch(/Unknown option '--clave'/);

    const sinBase = spawnSync(process.execPath, [guion, '--emisor', 'http://caja.ejemplo'], {
      encoding: 'utf8',
      env: { ...process.env, KAMAYUK_CLAVE_DE_MEDICION: CLAVE, KAMAYUK_MEDICION_BASE: '' },
    });
    expect(sinBase.status).toBe(2);
    expect(sinBase.stderr).toContain('falta --base');
    expect(sinBase.stderr).toContain('clave-de-medicion');
    expect(`${sinBase.stdout}${sinBase.stderr}`).not.toContain(CLAVE);
  });
});
