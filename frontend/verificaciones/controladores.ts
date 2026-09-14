import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **Lo que los controladores de la ventanilla publican, leido de sus `.java`** (#74).
 *
 * `rentas` compara su arbol con un artboard; `caja` no tiene artboard, y el otro lado del contrato
 * es su backend, que esta en este mismo repositorio. Este lector saca de cada controlador sus
 * mapeos —verbo, ruta entera, parametros obligatorios— y el `@RequiereAcceso` de cada uno, con las
 * **constantes resueltas**: `acceso = ACCESO_DUPLICADO` vale lo que valga la constante. Es la leccion
 * de #77, donde una guarda que solo leia literales dejo cuatro accesos fuera del catalogo.
 *
 * No es un analizador de Java y no lo pretende: lee la forma que estos controladores tienen, y la
 * prueba que lo usa exige minimos contados —cuantos controladores, cuantos mapeos— para que un
 * cambio de forma que lo deje ciego se ponga rojo en vez de comparar contra la nada.
 */

export interface Mapeo {
  readonly controlador: string;
  readonly verbo: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly ruta: string;
  /** El `params = "…"` del mapeo, si lo lleva: dos mapeos con la misma ruta se distinguen por el. */
  readonly parametros: string | null;
  readonly acceso: string;
  readonly oTambien: readonly string[];
  readonly privilegio: string;
}

/** Sin comentarios de bloque ni de linea. */
const sinComentarios = (fuente: string): string =>
  fuente.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Las constantes `static final String X = "…";` de un archivo. */
function constantesDe(fuente: string): ReadonlyMap<string, string> {
  return new Map(
    [...fuente.matchAll(/static\s+final\s+String\s+(\w+)\s*=\s*"([^"]*)"\s*;/g)].map((m) => [m[1] ?? '', m[2] ?? '']),
  );
}

/** Un literal o una constante, resuelto. `null` si no se sabe resolver, y eso es un rojo de quien lo use. */
function valorDe(expresion: string, constantes: ReadonlyMap<string, string>): string | null {
  const limpia = expresion.trim();
  const literal = /^"([^"]*)"$/.exec(limpia);
  if (literal) return literal[1] ?? '';
  const nombre = limpia.split('.').pop() ?? '';
  return constantes.get(nombre) ?? null;
}

/** Los mapeos de un fuente de controlador. Exportado para ejercitarlo sobre la muestra. */
export function mapeosDe(controlador: string, crudo: string): Mapeo[] {
  const fuente = sinComentarios(crudo);
  const constantes = constantesDe(fuente);
  const base = /@RequestMapping\(\s*Api\.RAIZ(?:\s*\+\s*"([^"]*)")?\s*\)/.exec(fuente)?.[1] ?? '';

  const salida: Mapeo[] = [];
  const patron = /@(Get|Post|Put|Patch|Delete)Mapping(?:\(([^)]*)\))?\s*@RequiereAcceso\(([\s\S]*?)\)\s*public/g;
  for (const m of fuente.matchAll(patron)) {
    const argumentos = m[2] ?? '';
    const valor = /(?:value\s*=\s*)?"([^"]*)"/.exec(argumentos)?.[1] ?? '';
    const parametros = /params\s*=\s*"([^"]*)"/.exec(argumentos)?.[1] ?? null;
    const requisito = m[3] ?? '';
    const acceso = valorDe(/acceso\s*=\s*([^,)]+)/.exec(requisito)?.[1] ?? '', constantes);
    const oTambien = [...(/oTambien\s*=\s*\{([^}]*)\}/.exec(requisito)?.[1] ?? '').matchAll(/[^,\s][^,]*/g)]
      .map((e) => valorDe(e[0], constantes))
      .filter((v): v is string => v !== null);
    const privilegio = /privilegio\s*=\s*Privilegio\.(\w+)/.exec(requisito)?.[1] ?? '';
    if (acceso === null) {
      throw new Error(`«${controlador}»: no se pudo resolver el acceso de «${requisito.trim()}».`);
    }
    salida.push({
      controlador,
      verbo: (m[1] ?? '').toUpperCase() as Mapeo['verbo'],
      ruta: `${base}${valor}`,
      parametros,
      acceso,
      oTambien,
      privilegio,
    });
  }
  return salida;
}

/** Todos los mapeos de los controladores de un directorio. */
export function mapeosDelDirectorio(directorio: string): { controladores: number; mapeos: Mapeo[] } {
  const archivos = readdirSync(directorio).filter((n) => n.endsWith('Controller.java'));
  return {
    controladores: archivos.length,
    mapeos: archivos.flatMap((n) => mapeosDe(n.replace('.java', ''), readFileSync(join(directorio, n), 'utf8'))),
  };
}

export interface OpcionDelCatalogo {
  readonly moduloCodigo: string;
  readonly moduloNombre: string;
  readonly codigo: string;
  readonly nombre: string;
}

/** Las opciones de `CatalogoDelSistema.java`, con las cadenas partidas en varias lineas unidas. */
export function opcionesDelCatalogo(crudo: string): OpcionDelCatalogo[] {
  const fuente = sinComentarios(crudo).replace(/\s+/g, ' ');
  return [...fuente.matchAll(/new Opcion\( ?"([^"]*)", ?"([^"]*)", ?"([^"]*)", ?"([^"]*)" ?\)/g)].map((m) => ({
    moduloCodigo: m[1] ?? '',
    moduloNombre: m[2] ?? '',
    codigo: m[3] ?? '',
    nombre: m[4] ?? '',
  }));
}

/** Sin tildes ni enie y en minusculas: el catalogo guarda sus nombres en ASCII, y el arbol con tildes. */
export const sinTildes = (texto: string): string =>
  texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
