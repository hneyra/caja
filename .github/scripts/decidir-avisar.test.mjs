import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  coincidePatron,
  algunoAplica,
  analizarDisparadoresPush,
  nombreDelWorkflow,
  workflowsRequeridos,
  decidirAccion,
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
  });

  test('"push:" sin "paths:" (como backend.yml): aplica siempre', () => {
    const yaml = `name: Backend
on:
  push:
    branches: [main]
  pull_request:
`;
    const r = analizarDisparadoresPush(yaml);
    assert.equal(r.tienePush, true);
    assert.deepEqual(r.ramas, ['main']);
    assert.equal(r.patrones, null);
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
});
