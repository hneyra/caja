import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

import {
  CLIENTE_DE_MEDICION,
  CUENTA_DE_MEDICION,
  MedicionImposible,
  VARIABLE_DE_LA_CLAVE,
  codigoDeSalida,
  medir,
  problemasDeLasOpciones,
  redactar,
} from './medicion.ts';

// Globales de Node 24. ESLint no le da globales a un `.mjs` de este arbol —ni de navegador ni de
// Node— y aqui se declaran las dos que se usan, en vez de abrirle a todo `.mjs` las de Node.
/* global fetch, AbortSignal */

/**
 * **Medir las capturas de la ventanilla contra un backend de verdad, en una orden** (#89).
 *
 * La cascara: lee la orden, pone la red, el disco y la consola, y llama a `medir` de
 * `medicion.ts`, que es donde esta todo lo demas y lo que prueba `yarn verificar`. Se corre con
 * **Node 24**, que carga `medicion.ts` y las capturas sin compilar (sus tipos se borran al cargar).
 *
 * La orden exacta, contra `stg` y contra la plataforma local, esta en
 * `docs/D0-desarrollo/pruebas.md` §«Medir las capturas». Lo esencial:
 *
 *     KAMAYUK_CLAVE_DE_MEDICION="$(cat "$PRIVADO/clave")" \
 *       node desarrollo/medir-las-capturas.mjs \
 *         --base https://<dominio> --emisor https://<dominio>/keycloak/realms/kamayuk
 *
 * **La clave va por la variable y nunca por un argumento**: `parseArgs` en modo estricto rechaza
 * cualquier opcion que no este abajo, y `--clave` no esta.
 *
 * **Lo medido lleva datos de personas** —los pagadores de los recibos—: por omision va a un
 * directorio temporal con permisos `700`, y **no se versiona**. Lo que se lleva a la captura es la
 * FORMA, con valores elegidos, como hasta ahora.
 *
 * Sale con `0` si las catorce lecturas llegaron en 200 con la forma de su captura, `1` si alguna
 * difiere o fallo, y `2` si no se pudo medir: la orden esta incompleta o no hubo token.
 */

const AYUDA = `Uso: node desarrollo/medir-las-capturas.mjs --base <origen> --emisor <emisor> [opciones]

  --base     El origen del ingreso, sin /caja/api/v1.        (o KAMAYUK_MEDICION_BASE)
             stg: https://<dominio> · local: http://localhost:8080
  --emisor   El emisor OIDC del realm de funcionarios.       (o KAMAYUK_MEDICION_EMISOR)
             stg: https://<dominio>/keycloak/realms/kamayuk · local: http://localhost:8180/realms/kamayuk
  --cuenta   Por omision ${CUENTA_DE_MEDICION}.   (o KAMAYUK_MEDICION_CUENTA)
  --cliente  Por omision ${CLIENTE_DE_MEDICION}.     (o KAMAYUK_MEDICION_CLIENTE)
  --recibo   El recibo del duplicado. Por omision, el primero de /recibos.
  --turno    El turno del arqueo. Por omision, el ABIERTO de /turnos/del-dia.
  --fecha    El dia de la conciliacion (AAAA-MM-DD). Por omision, el de /turnos/del-dia.
  --salida   Donde dejar lo medido. Por omision, un directorio temporal nuevo con permisos 700.

  La clave, SOLO en ${VARIABLE_DE_LA_CLAVE}.`;

function salir(codigo, texto) {
  (codigo === 0 ? process.stdout : process.stderr).write(`${texto}\n`);
  process.exit(codigo);
}

let argumentos;
try {
  argumentos = parseArgs({
    options: {
      base: { type: 'string' },
      emisor: { type: 'string' },
      cuenta: { type: 'string' },
      cliente: { type: 'string' },
      recibo: { type: 'string' },
      turno: { type: 'string' },
      fecha: { type: 'string' },
      salida: { type: 'string' },
      ayuda: { type: 'boolean', short: 'h' },
    },
    strict: true,
    allowPositionals: false,
  }).values;
} catch (error) {
  salir(2, `${error instanceof Error ? error.message : String(error)}\n\n${AYUDA}`);
}
if (argumentos.ayuda) salir(0, AYUDA);

const entorno = process.env;
const clave = entorno[VARIABLE_DE_LA_CLAVE] ?? '';
const base = argumentos.base ?? entorno.KAMAYUK_MEDICION_BASE ?? '';
const emisor = argumentos.emisor ?? entorno.KAMAYUK_MEDICION_EMISOR ?? '';

const problemas = [...problemasDeLasOpciones({ base, emisor, clave })];
if (argumentos.turno !== undefined && !/^\d+$/.test(argumentos.turno)) {
  problemas.push(`--turno tiene que ser un numero: «${argumentos.turno}»`);
}
if (argumentos.fecha !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(argumentos.fecha)) {
  problemas.push(`--fecha tiene que ser AAAA-MM-DD: «${argumentos.fecha}»`);
}
if (problemas.length > 0) {
  salir(
    2,
    redactar(
      `No se puede medir:\n  · ${problemas.join('\n  · ')}\n\n` +
        'La clave de la cuenta de medicion se lee del Secret `kamayuk-<amb>-keycloak`, clave\n' +
        '`clave-de-medicion`, con el KUBECONFIG del ambiente: infrastructure,\n' +
        '`docs/B0-operacion/runbooks/medir-una-interfaz-con-login-real.md`.\n\n' +
        AYUDA,
      [clave],
    ),
  );
}

const salida = argumentos.salida
  ? resolve(argumentos.salida)
  : mkdtempSync(join(tmpdir(), 'caja-medicion-'));
mkdirSync(salida, { recursive: true, mode: 0o700 });
chmodSync(salida, 0o700);

// La orden tal como se escribio. No lleva la clave —esa va por el entorno— y aun asi se redacta.
const invocacion = ['node', 'desarrollo/medir-las-capturas.mjs', ...process.argv.slice(2)]
  .map((parte) => (/^[\w./:@=,+-]+$/.test(parte) ? parte : `'${parte.replace(/'/g, `'\\''`)}'`))
  .join(' ');

try {
  const resultados = await medir(
    {
      base,
      emisor,
      clave,
      cuenta: argumentos.cuenta ?? entorno.KAMAYUK_MEDICION_CUENTA ?? CUENTA_DE_MEDICION,
      cliente: argumentos.cliente ?? entorno.KAMAYUK_MEDICION_CLIENTE ?? CLIENTE_DE_MEDICION,
      ...(argumentos.recibo === undefined ? {} : { recibo: argumentos.recibo }),
      ...(argumentos.turno === undefined ? {} : { turno: Number(argumentos.turno) }),
      ...(argumentos.fecha === undefined ? {} : { fecha: argumentos.fecha }),
      invocacion,
    },
    {
      pedir: (url, init) => fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(20_000) }),
      guardar: async (nombre, contenido) => {
        writeFileSync(join(salida, nombre), contenido, { mode: 0o600 });
      },
      registrar: (linea) => process.stdout.write(`${linea}\n`),
      ahora: () => new Date(),
    },
  );
  const codigo = codigoDeSalida(resultados);
  process.stdout.write(`\nLo medido esta en ${salida}\n`);
  process.exit(codigo);
} catch (error) {
  if (error instanceof MedicionImposible) salir(2, `${error.message}\n\nLo que llego a medirse esta en ${salida}`);
  throw error;
}
