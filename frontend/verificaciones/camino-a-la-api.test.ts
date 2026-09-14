// @vitest-environment node
//
// En `node` y no en jsdom: este archivo importa `vite.config.ts` de verdad —en vez de leerlo como
// texto— y eso arrastra a esbuild, que bajo jsdom muere con «Invariant violation: new
// TextEncoder().encode("") instanceof Uint8Array is incorrectly false». Lo medido en `rentas`.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { PROHIBICIONES } from '../eslint.prohibiciones.mjs';
import { PREFIJO as RAIZ } from '../src/api/cliente.ts';
import { RUTAS } from '../src/datos/lecturas.ts';
import configuracion from '../vite.config.ts';

/**
 * **El camino a la API de la ventanilla: que exista, que sea UNO, y que sea el suyo** (#74).
 *
 * Es la guarda de `rentas` con dos cambios que son la decision de ADR-0042:
 *
 *   · **El otro lado del contrato no es un JSON generado, son los `.java` de este mismo
 *     repositorio.** `rentas` compara sus rutas con `docs/50-api/formas-de-la-api.json`; `caja` no
 *     lo tiene, y no le hace falta: el backend esta en el mismo arbol, y leer su `Api.RAIZ` y sus
 *     `Resource` es comparar contra lo que se despliega, no contra una foto de ello.
 *   · **Ni un archivo de `src/` toca el almacenamiento del navegador.** En `rentas` es uno, su
 *     puerta; aqui la puerta es la de `@kamayuk/sesion`, y lo que se guarda lo guarda la libreria.
 *
 * Y lo de siempre, porque las tres cosas no dan sintoma al romperse: sin `server.proxy` Vite
 * contesta `index.html` con un 200 donde se espera JSON; con las raices desalineadas cada mitad
 * funciona sola; y una captura importada por produccion parece un dato medido.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const FRONTEND = join(AQUI, '..');
const REPOSITORIO = join(FRONTEND, '..');

/** Todos los `.ts`/`.tsx` bajo `src/`, con su ruta relativa al frontend. */
function fuentes(desde = join(FRONTEND, 'src')): readonly string[] {
  return readdirSync(desde).flatMap((entrada) => {
    const ruta = join(desde, entrada);
    if (statSync(ruta).isDirectory()) return fuentes(ruta);
    return /\.tsx?$/.test(entrada) ? [relative(FRONTEND, ruta)] : [];
  });
}

const deProduccion = fuentes().filter((ruta) => !/\.test\.tsx?$/.test(ruta));

/** Los componentes de un `record` de Java, por su nombre. */
function componentesDe(archivo: string): readonly string[] {
  const fuente = readFileSync(join(REPOSITORIO, archivo), 'utf8');
  const cabecera = /public record \w+\(([^)]*)\)/.exec(fuente)?.[1];
  if (cabecera === undefined) throw new Error(`«${archivo}» no declara un record.`);
  return cabecera
    .split(',')
    .map((parte) => parte.trim().split(/\s+/).pop() ?? '')
    .filter((nombre) => nombre !== '');
}

describe('vite.config.ts declara el camino a la API', () => {
  const proxy = configuracion.server?.proxy ?? {};

  it('una regla para la raiz del sistema, y ninguna otra: no hay otra API a la que ir', () => {
    expect(Object.keys(proxy)).toEqual([RAIZ]);
  });

  it('el destino por omision es el Traefik de la plataforma, en el 8080, y sale de una variable', () => {
    const regla = proxy[RAIZ];
    expect(typeof regla === 'object' ? regla.target : regla).toBe('http://localhost:8080');
    expect(readFileSync(join(FRONTEND, 'vite.config.ts'), 'utf8')).toContain('process.env.KAMAYUK_BACKEND');
    // Es el `${KAMAYUK_PUERTO_INGRESO:-8080}` de `infrastructure/despliegue/plataforma.compose.yaml`.
    // No se lee de alli a proposito: `yarn verificar` corre tambien en la CI de `kamayuk-lib`, que
    // clona este repositorio y la libreria y nada mas, y una guarda que necesita un tercer clon
    // saldria roja alli por un motivo que no es suyo.
  });

  it('y NO reescribe la ruta: Traefik enruta por el prefijo', () => {
    const regla = proxy[RAIZ];
    expect(typeof regla === 'object' ? regla.rewrite : undefined).toBeUndefined();
  });
});

describe('la raiz de la API es UNA, y la escribe el backend', () => {
  it('el prefijo del cliente, la regla de Vite y `Api.RAIZ` dicen lo mismo', () => {
    const api = readFileSync(join(REPOSITORIO, 'backend/kamayuk-caja-plataforma/src/main/java/kamayuk/caja/web/Api.java'), 'utf8');
    const delBackend = /String RAIZ = "([^"]+)"/.exec(api)?.[1];

    expect(delBackend).toBe('/caja/api/v1');
    expect(RAIZ).toBe(delBackend);
    expect(Object.keys(configuracion.server?.proxy ?? {})).toContain(delBackend);
  });

  it('ninguna fuente de produccion escribe la URL del backend: la API es del mismo origen', () => {
    const culpables = deProduccion.filter((ruta) =>
      /localhost:80[0-9]{2}|127\.0\.0\.1:80[0-9]{2}/.test(readFileSync(join(FRONTEND, ruta), 'utf8')),
    );
    expect(culpables).toEqual([]);
  });

  it('el emisor por omision es el de la plataforma local, el mismo que espera el backend del compose', () => {
    const conf = readFileSync(join(FRONTEND, 'src/api/configuracion.ts'), 'utf8');
    const compose = readFileSync(join(REPOSITORIO, 'despliegue/compose.yaml'), 'utf8');
    const deLaInterfaz = /oidcRealm: '([^']+)'/.exec(conf)?.[1];
    const delBackend = /KAMAYUK_OIDC_EMISOR: \$\{KAMAYUK_OIDC_EMISOR:-([^}]+)\}(\/realms\/\w+)/.exec(compose);

    expect(deLaInterfaz).toBe(`${delBackend?.[1] ?? '?'}${delBackend?.[2] ?? '?'}`);
  });
});

describe('lo que la interfaz lee tiene la forma con que el backend lo publica', () => {
  const WEB = 'backend/kamayuk-caja-seguridad/src/main/java/kamayuk/caja/seguridad/infraestructura/web';
  /** Las rutas `GET` de los dos controladores de sesion: su `@RequestMapping` mas cada `@GetMapping`. */
  const GETS = ['SesionController.java', 'CatalogoDeLaCopiaLocalController.java'].flatMap((c) => {
    const fuente = readFileSync(join(REPOSITORIO, WEB, c), 'utf8');
    const base = /@RequestMapping\(Api\.RAIZ \+ "([^"]*)"\)/.exec(fuente)?.[1] ?? '';
    return [...fuente.matchAll(/@GetMapping(?:\("([^"]*)"\))?/g)].map((m) => `${base}${m[1] ?? ''}`);
  });

  it('EL CENTINELA: se leyeron las cinco rutas de sesion del backend', () => {
    expect([...GETS].sort()).toEqual([
      '/seguridad/accesos',
      '/seguridad/modulos',
      '/seguridad/sesion',
      '/seguridad/sesion/municipalidad',
      '/seguridad/sesion/permisos',
    ]);
  });

  it.each([
    ['sesion', '/seguridad/sesion'],
    ['municipalidadDeLaSesion', '/seguridad/sesion/municipalidad'],
    ['modulos', '/seguridad/modulos'],
    ['accesos', '/seguridad/accesos'],
    ['permisosDeLaSesion', '/seguridad/sesion/permisos'],
  ] as const)('RUTAS.%s es un `GET` publicado por el backend de la ventanilla', (clave, ruta) => {
    expect(RUTAS[clave].split('?')[0]).toBe(ruta);
    expect(GETS).toContain(ruta);
  });

  it.each([
    ['IdentidadResource.java', ['usuarioId', 'cuenta', 'nombre']],
    ['MunicipalidadResource.java', ['id', 'ubigeo', 'nombre', 'tipo']],
    ['ModuloResource.java', ['id', 'codigo', 'nombre', 'orden', 'activo']],
    ['AccesoResource.java', ['id', 'moduloId', 'tipo', 'codigo', 'nombre', 'activo']],
  ] as const)('«%s» publica exactamente los campos que `lecturas.ts` lee', (archivo, campos) => {
    // El sintoma de un campo renombrado no es un error: es `undefined` en la barra o en el arbol.
    expect(componentesDe(`${WEB}/${archivo}`)).toEqual(campos);
  });

  it('y las capturas tienen esos mismos campos, ni uno mas', async () => {
    const { MODULOS_MEDIDOS, ACCESOS_MEDIDOS } = await import('../src/datos/seguridadMedida.ts');
    const { SESION_MEDIDA, MUNICIPALIDAD_MEDIDA } = await import('../src/datos/sesionMedida.ts');

    expect(Object.keys(MODULOS_MEDIDOS[0] ?? {})).toEqual(componentesDe(`${WEB}/ModuloResource.java`));
    expect(Object.keys(ACCESOS_MEDIDOS[0] ?? {})).toEqual(componentesDe(`${WEB}/AccesoResource.java`));
    expect(Object.keys(SESION_MEDIDA)).toEqual(componentesDe(`${WEB}/IdentidadResource.java`));
    expect(Object.keys(MUNICIPALIDAD_MEDIDA)).toEqual(componentesDe(`${WEB}/MunicipalidadResource.java`));
  });
});

describe('el token no toca el almacenamiento del navegador, y el fetch vive en un sitio', () => {
  it('la prohibicion sigue en la lista y sin excepcion', () => {
    const suya = PROHIBICIONES.find((p) => p.clave === 'token-en-almacenamiento');
    expect(suya).toBeDefined();
    expect(suya?.salvo).toBeUndefined();
  });

  it('NINGUN archivo de produccion de `src/` toca localStorage ni sessionStorage', () => {
    // En `rentas` es uno, su puerta. Aqui la puerta es `@kamayuk/sesion`, y el tema lo guarda
    // `@kamayuk/ui`: lo que este arbol escribe en el navegador es nada, y asi se queda.
    const tocan = deProduccion.filter((ruta) =>
      /\b(localStorage|sessionStorage)\b/.test(readFileSync(join(FRONTEND, ruta), 'utf8')),
    );
    expect(tocan).toEqual([]);
  });

  it('la prohibicion del fetch tiene UNA excepcion, y es `src/api/`', () => {
    const delFetch = PROHIBICIONES.find((p) => p.clave === 'fetch-fuera-del-cliente');
    expect([...(delFetch?.salvo ?? [])]).toEqual(['src/api/']);
    expect(PROHIBICIONES.filter((p) => p.salvo !== undefined)).toHaveLength(1);
  });
});

/**
 * Las capturas son de las pruebas, y no respaldos de produccion.
 *
 * Tienen el riesgo mas feo de `src/`: **parecen datos legitimos**. Un `permisos ?? PERMISOS_MEDIDOS`
 * ofreceria las siete hojas a quien el backend no se las ofrece, y un `sesion ?? SESION_MEDIDA`
 * pondria al administrador en la barra de cualquiera.
 */
const CAPTURAS = ['src/datos/seguridadMedida.ts', 'src/datos/sesionMedida.ts'];

describe('las capturas solo las importan las pruebas', () => {
  it.each(CAPTURAS)('«%s» no la importa ningun archivo de produccion', (captura) => {
    const archivo = captura.slice(captura.lastIndexOf('/') + 1);
    // Se busca un `import … from '…/<archivo>'` y no una mencion: los docblocks se nombran entre
    // si, y una guarda que confunde «lo menciona» con «lo importa» acaba desactivada.
    const importa = new RegExp(`from\\s+'[^']*${archivo.replace('.', '\\.')}'`);
    const culpables = deProduccion.filter(
      (ruta) => ruta !== captura && importa.test(readFileSync(join(FRONTEND, ruta), 'utf8')),
    );
    expect(culpables).toEqual([]);
  });
});
