import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  coincidePatron,
  algunoAplica,
  analizarDisparadoresPush,
  nombreDelWorkflow,
  workflowsRequeridos,
  decidirAccion,
  esperarYDecidir,
} from './decidir-avisar.mjs';

describe('coincidePatron', () => {
  test('literal: solo casa exacto', () => {
    assert.equal(coincidePatron('despliegue/compose.yaml', 'despliegue/compose.yaml'), true);
    assert.equal(coincidePatron('despliegue/otro.yaml', 'despliegue/compose.yaml'), false);
  });

  test('prefijo/**: casa cualquier cosa debajo, no el propio directorio a secas', () => {
    assert.equal(coincidePatron('frontend/src/api/cliente.ts', 'frontend/**'), true);
    assert.equal(coincidePatron('frontend/package.json', 'frontend/**'), true);
    assert.equal(coincidePatron('backend/build.gradle.kts', 'frontend/**'), false);
  });
});

describe('analizarDisparadoresPush', () => {
  test('sin "push:" en absoluto (como registro.yml): no aplica nunca a un push', () => {
    const yaml = `name: Registro
on:
  pull_request:
    types: [opened, synchronize, reopened, edited]
`;
    const r = analizarDisparadoresPush(yaml);
    assert.equal(r.tienePush, false);
    assert.equal(r.aplicaAMain, false);
  });

  test('"push:" sin restriccion de rama ni "paths:": aplica siempre', () => {
    const yaml = `name: Backend
on:
  push:
    branches: [main]
  pull_request:
`;
    const r = analizarDisparadoresPush(yaml);
    assert.equal(r.tienePush, true);
    assert.equal(r.aplicaAMain, true);
    assert.equal(r.patrones, null);
  });

  test('"push:" sin "branches:" en absoluto: aplica a cualquier rama, main incluida', () => {
    const yaml = `name: Loquesea
on:
  push:
  pull_request:
`;
    const r = analizarDisparadoresPush(yaml);
    assert.equal(r.tienePush, true);
    assert.equal(r.aplicaAMain, true);
  });

  test('"branches:" en linea, main fuera de la lista: no aplica', () => {
    const yaml = `name: Otro
on:
  push:
    branches: [otra-rama]
`;
    const r = analizarDisparadoresPush(yaml);
    assert.equal(r.aplicaAMain, false);
  });

  test('"branches:" en BLOQUE, con main: aplica (regresion del hallazgo de la revision — antes esto devolvia [] en silencio)', () => {
    const yaml = `name: Backend
on:
  push:
    branches:
      - main
      - otra
  pull_request:
`;
    const r = analizarDisparadoresPush(yaml);
    assert.equal(r.tienePush, true);
    assert.equal(r.aplicaAMain, true);
  });

  test('"branches:" en BLOQUE, sin main: no aplica', () => {
    const yaml = `name: Otro
on:
  push:
    branches:
      - dev
      - staging
`;
    const r = analizarDisparadoresPush(yaml);
    assert.equal(r.aplicaAMain, false);
  });

  test('"branches-ignore:" en linea, con main excluido: no aplica', () => {
    const yaml = `name: Otro
on:
  push:
    branches-ignore: [main]
`;
    const r = analizarDisparadoresPush(yaml);
    assert.equal(r.aplicaAMain, false);
  });

  test('"branches-ignore:" en BLOQUE, sin main en la lista: aplica (main no esta excluida)', () => {
    const yaml = `name: Otro
on:
  push:
    branches-ignore:
      - dev
      - staging
`;
    const r = analizarDisparadoresPush(yaml);
    assert.equal(r.aplicaAMain, true);
  });

  test('"branches:" con un comodin: FALLA CERRADO (lanza, no adivina)', () => {
    const yaml = `name: Otro
on:
  push:
    branches: ["release/*"]
`;
    assert.throws(() => analizarDisparadoresPush(yaml, 'otro.yml'), /comodin/);
  });

  test('"paths:" en linea (como frontend.yml)', () => {
    const yaml = `name: Frontend
on:
  push:
    branches: [main]
    paths: ["frontend/**", ".github/workflows/frontend.yml"]
  pull_request:
    paths: ["frontend/**", ".github/workflows/frontend.yml"]
`;
    const r = analizarDisparadoresPush(yaml);
    assert.equal(r.tienePush, true);
    assert.deepEqual(r.patrones, ['frontend/**', '.github/workflows/frontend.yml']);
  });

  test('"paths:" en bloque (como infraestructura.yml y despliegue.yml)', () => {
    const yaml = `name: Infraestructura
on:
  push:
    branches: [main]
    paths:
      - "infrastructure/**"
      - "frontend/nginx.conf"
  pull_request:
    paths:
      - "infrastructure/**"
      - "frontend/nginx.conf"
`;
    const r = analizarDisparadoresPush(yaml);
    assert.equal(r.tienePush, true);
    assert.deepEqual(r.patrones, ['infrastructure/**', 'frontend/nginx.conf']);
  });

  test('"paths:" con un comodin suelto (no "/**"): FALLA CERRADO', () => {
    const yaml = `name: Otro
on:
  push:
    branches: [main]
    paths: ["frontend/*.ts"]
`;
    assert.throws(() => analizarDisparadoresPush(yaml, 'otro.yml'), /comodin/);
  });

  test('"paths:" con "/**" SI esta soportado y no lanza', () => {
    const yaml = `name: Otro
on:
  push:
    branches: [main]
    paths: ["frontend/**"]
`;
    assert.doesNotThrow(() => analizarDisparadoresPush(yaml));
  });

  test('"branches:" y "branches-ignore:" a la vez: FALLA CERRADO (GitHub no lo admite, y no hay interpretacion segura)', () => {
    const yaml = `name: Otro
on:
  push:
    branches: [main]
    branches-ignore: [dev]
`;
    assert.throws(() => analizarDisparadoresPush(yaml, 'otro.yml'));
  });
});

describe('nombreDelWorkflow', () => {
  test('lee el "name:" de primer nivel', () => {
    assert.equal(nombreDelWorkflow('name: Backend\non:\n  push:\n'), 'Backend');
  });
});

describe('workflowsRequeridos (integracion sobre los .yml reales de este repositorio)', () => {
  // Relativo a ESTE archivo, no al directorio de trabajo: `node --test` se puede invocar desde
  // cualquier sitio, y `.github/scripts/` es hermano de `.github/workflows/`.
  const dirReal = new URL('../workflows', import.meta.url).pathname;

  test('Backend aplica aunque el push no toque backend/ (no tiene paths:)', () => {
    const req = workflowsRequeridos(dirReal, 'publicar-imagenes.yml', ['docs/algo.md']);
    assert.ok(req.some((w) => w.nombre === 'Backend'));
  });

  test('Registro nunca aplica a un push (no tiene push: en absoluto)', () => {
    const req = workflowsRequeridos(dirReal, 'publicar-imagenes.yml', ['frontend/src/x.ts']);
    assert.ok(!req.some((w) => w.nombre === 'Registro'));
  });

  test('Frontend solo aplica si el push toca algo de su lista de paths', () => {
    const conFrontend = workflowsRequeridos(dirReal, 'publicar-imagenes.yml', ['frontend/src/api/cliente.ts']);
    assert.ok(conFrontend.some((w) => w.nombre === 'Frontend'));

    const sinFrontend = workflowsRequeridos(dirReal, 'publicar-imagenes.yml', ['docs/algo-sin-relacion.md']);
    assert.ok(!sinFrontend.some((w) => w.nombre === 'Frontend'));
  });

  test('Infraestructura solo aplica si el push toca infrastructure/', () => {
    const con = workflowsRequeridos(dirReal, 'publicar-imagenes.yml', ['infrastructure/src/descriptor.ts']);
    assert.ok(con.some((w) => w.nombre === 'Infraestructura'));

    const sin = workflowsRequeridos(dirReal, 'publicar-imagenes.yml', ['backend/kamayuk-caja-nucleo/src/main/java/X.java']);
    assert.ok(!sin.some((w) => w.nombre === 'Infraestructura'));
  });

  test('Despliegue solo aplica si el push toca despliegue/', () => {
    const con = workflowsRequeridos(dirReal, 'publicar-imagenes.yml', ['despliegue/compose.yaml']);
    assert.ok(con.some((w) => w.nombre === 'Despliegue'));

    const sin = workflowsRequeridos(dirReal, 'publicar-imagenes.yml', ['docs/algo.md']);
    assert.ok(!sin.some((w) => w.nombre === 'Despliegue'));
  });
});

describe('decidirAccion — los cuatro casos que pide el issue #115', () => {
  test('todos success -> avisar', () => {
    const r = decidirAccion([
      { nombre: 'Backend', ejecucion: { status: 'completed', conclusion: 'success' } },
      { nombre: 'Frontend', ejecucion: { status: 'completed', conclusion: 'success' } },
    ]);
    assert.equal(r.accion, 'avisar');
  });

  test('uno fallido -> no-avisar', () => {
    const r = decidirAccion([
      { nombre: 'Backend', ejecucion: { status: 'completed', conclusion: 'failure' } },
      { nombre: 'Frontend', ejecucion: { status: 'completed', conclusion: 'success' } },
    ]);
    assert.equal(r.accion, 'no-avisar');
    assert.match(r.motivo, /Backend \(failure\)/);
  });

  test('uno que no aplica por paths no bloquea: si no esta en la lista de estados, no cuenta', () => {
    // "no aplica" se resuelve ANTES de llegar aqui (workflowsRequeridos ya lo excluyo), asi que
    // la lista de entrada simplemente no lo trae. Si solo Backend aplica y termino bien, avisa
    // aunque Despliegue nunca haya corrido para este sha.
    const r = decidirAccion([{ nombre: 'Backend', ejecucion: { status: 'completed', conclusion: 'success' } }]);
    assert.equal(r.accion, 'avisar');
  });

  test('uno pendiente (sin ejecucion todavia) -> esperar', () => {
    const r = decidirAccion([
      { nombre: 'Backend', ejecucion: { status: 'completed', conclusion: 'success' } },
      { nombre: 'Frontend', ejecucion: null },
    ]);
    assert.equal(r.accion, 'esperar');
    assert.match(r.motivo, /Frontend/);
  });

  test('uno pendiente (in_progress) -> esperar', () => {
    const r = decidirAccion([{ nombre: 'Backend', ejecucion: { status: 'in_progress', conclusion: null } }]);
    assert.equal(r.accion, 'esperar');
  });

  test('sin ningun workflow requerido -> avisar (nada que esperar)', () => {
    const r = decidirAccion([]);
    assert.equal(r.accion, 'avisar');
  });

  // Los tres desenlaces de GitHub que no son "success" ni un estado a medias: cada uno tiene
  // que bloquear igual que "failure". Antes solo se probaba "failure"; la revision independiente
  // pidio cubrir estos tres explicitamente.
  test('cancelled -> no-avisar', () => {
    const r = decidirAccion([{ nombre: 'Backend', ejecucion: { status: 'completed', conclusion: 'cancelled' } }]);
    assert.equal(r.accion, 'no-avisar');
    assert.match(r.motivo, /Backend \(cancelled\)/);
  });

  test('timed_out -> no-avisar', () => {
    const r = decidirAccion([{ nombre: 'Backend', ejecucion: { status: 'completed', conclusion: 'timed_out' } }]);
    assert.equal(r.accion, 'no-avisar');
    assert.match(r.motivo, /Backend \(timed_out\)/);
  });

  test('skipped -> no-avisar (un workflow EXIGIDO que se salto no es un exito)', () => {
    const r = decidirAccion([{ nombre: 'Backend', ejecucion: { status: 'completed', conclusion: 'skipped' } }]);
    assert.equal(r.accion, 'no-avisar');
    assert.match(r.motivo, /Backend \(skipped\)/);
  });
});

describe('esperarYDecidir — el reintento, y los fallos de la consulta tratados como pendiente', () => {
  const listaFinal = [{ archivo: 'backend.yml', nombre: 'Backend' }];
  const sinEsperarDeVerdad = async () => {}; // dormir() de mentira: las pruebas no tardan 30s

  test('todo success al primer intento -> avisar, sin reintentar', async () => {
    let llamadas = 0;
    const r = await esperarYDecidir({
      listaFinal,
      obtenerEjecuciones: () => {
        llamadas += 1;
        return [{ name: 'Backend', status: 'completed', conclusion: 'success' }];
      },
      intentosMax: 5,
      dormir: sinEsperarDeVerdad,
    });
    assert.equal(r.accion, 'avisar');
    assert.equal(llamadas, 1);
  });

  test('un fallo REAL (conclusion failure) no se reintenta: no-avisar de inmediato', async () => {
    let llamadas = 0;
    const r = await esperarYDecidir({
      listaFinal,
      obtenerEjecuciones: () => {
        llamadas += 1;
        return [{ name: 'Backend', status: 'completed', conclusion: 'failure' }];
      },
      intentosMax: 5,
      dormir: sinEsperarDeVerdad,
    });
    assert.equal(r.accion, 'no-avisar');
    assert.equal(llamadas, 1);
  });

  // El hallazgo #2 de la revision: `ejecucionesParaElSha` (la consulta a `gh api`) puede lanzar
  // —sin red, un 5xx transitorio, "gh" no autenticado— y eso NO tiene que tumbar todo el guion:
  // se trata como pendiente y se reintenta.
  test('una consulta que lanza UNA VEZ y luego funciona: se recupera, avisar', async () => {
    let llamadas = 0;
    const r = await esperarYDecidir({
      listaFinal,
      obtenerEjecuciones: () => {
        llamadas += 1;
        if (llamadas === 1) throw new Error('gh: connection reset (simulado)');
        return [{ name: 'Backend', status: 'completed', conclusion: 'success' }];
      },
      intentosMax: 5,
      dormir: sinEsperarDeVerdad,
    });
    assert.equal(r.accion, 'avisar');
    assert.equal(llamadas, 2);
  });

  test('una consulta que SIEMPRE lanza: agota los intentos y no-avisar, nombrando el error', async () => {
    let llamadas = 0;
    const r = await esperarYDecidir({
      listaFinal,
      obtenerEjecuciones: () => {
        llamadas += 1;
        throw new Error('gh: rate limited (simulado)');
      },
      intentosMax: 3,
      dormir: sinEsperarDeVerdad,
    });
    assert.equal(r.accion, 'no-avisar');
    assert.equal(llamadas, 3);
    assert.match(
      r.motivo,
      /rate limited \(simulado\)/,
      'el motivo tiene que nombrar el error de gh, no solo decir "se agoto el plazo"',
    );
  });

  test('pendiente varias veces y luego success: avisar tras varios reintentos', async () => {
    let llamadas = 0;
    const r = await esperarYDecidir({
      listaFinal,
      obtenerEjecuciones: () => {
        llamadas += 1;
        if (llamadas < 3) return [{ name: 'Backend', status: 'in_progress', conclusion: null }];
        return [{ name: 'Backend', status: 'completed', conclusion: 'success' }];
      },
      intentosMax: 5,
      dormir: sinEsperarDeVerdad,
    });
    assert.equal(r.accion, 'avisar');
    assert.equal(llamadas, 3);
  });

  test('agota los intentos sin resolverse (siempre pendiente, sin error): no-avisar', async () => {
    const r = await esperarYDecidir({
      listaFinal,
      obtenerEjecuciones: () => [{ name: 'Backend', status: 'in_progress', conclusion: null }],
      intentosMax: 2,
      dormir: sinEsperarDeVerdad,
    });
    assert.equal(r.accion, 'no-avisar');
    assert.match(r.motivo, /Agotados los 2 intentos/);
  });
});
