import { describe, expect, it } from 'vitest';

import { ACCESO_POR_DESTINO, CATALOGO, CODIGO_POR_CLAVE } from './catalogo.ts';
import {
  ACCESOS_MEDIDOS,
  MODULOS_MEDIDOS,
  PERMISOS_MEDIDOS,
  sinLosAccesos,
} from './datos/seguridadMedida.ts';
import type { PermisosDeLaSesion } from './datos/lecturas.ts';
import { componer } from './permisos.ts';

/**
 * **Lo que la cuenta no puede abrir, no se ofrece — hoja por hoja** (#74).
 *
 * Contra `seguridadMedida.ts`, como en `rentas`: la forma de lo que el backend contesta. Y en las
 * dos direcciones, porque el administrador puede todo y con el el arbol sale entero aunque el
 * filtro no filtrara.
 */

const codigoDe = (m: { readonly clave: string }) => CODIGO_POR_CLAVE.get(m.clave) ?? '';
const accesoDe = (clave: string) => ACCESO_POR_DESTINO.get(clave) ?? '';
const componerMedido = (permisos: PermisosDeLaSesion = PERMISOS_MEDIDOS, modulos = MODULOS_MEDIDOS, accesos = ACCESOS_MEDIDOS) =>
  componer(CATALOGO, modulos, accesos, permisos, codigoDe, accesoDe);

const clavesDe = (resultado: ReturnType<typeof componerMedido>) =>
  resultado.catalogo.flatMap((m) => m.destinos.map((d) => d.clave));

describe('el catalogo se compone de lo que la cuenta puede abrir', () => {
  it('EL CENTINELA: la captura trae un modulo, siete accesos y la matriz entera', () => {
    expect(MODULOS_MEDIDOS).toHaveLength(1);
    expect(ACCESOS_MEDIDOS).toHaveLength(7);
    expect(Object.keys(PERMISOS_MEDIDOS)).toHaveLength(7);
  });

  it('con el administrador salen las siete hojas, en el orden del arbol', () => {
    expect(clavesDe(componerMedido())).toEqual([
      'caja-tributaria',
      'caja-tasas',
      'duplicado-recibo',
      'anulacion-recibo',
      'cierre-caja',
      'avance-recaudacion',
      'recaudacion-area',
    ]);
  });

  it('se filtra la HOJA, no el modulo: sin `cierre_caja` se cae esa hoja y las otras seis se quedan', () => {
    const resultado = componerMedido(sinLosAccesos('cierre_caja'));
    expect(clavesDe(resultado)).toHaveLength(6);
    expect(clavesDe(resultado)).not.toContain('cierre-caja');
    // Y se cuenta: una hoja escondida en silencio no se distingue de una que no existe.
    expect(resultado.sinPermiso).toEqual(['cierre_caja']);
  });

  it('basta UN privilegio: quien solo puede anular ve la anulacion aunque no pueda leer', () => {
    const soloAnular: PermisosDeLaSesion = { anulacion_recibo: ['eliminacion'] };
    expect(clavesDe(componerMedido(soloAnular))).toEqual(['anulacion-recibo']);
  });

  it('un acceso con la lista VACIA no abre nada', () => {
    const vacio: PermisosDeLaSesion = { ...sinLosAccesos('caja_tasas'), caja_tasas: [] };
    expect(clavesDe(componerMedido(vacio))).not.toContain('caja-tasas');
  });

  it('sin NINGUN permiso, el catalogo sale vacio — y el modulo tampoco se dibuja', () => {
    const { catalogo, sinPermiso } = componerMedido({});
    expect(catalogo).toEqual([]);
    expect(sinPermiso).toHaveLength(7);
  });

  it('un acceso INACTIVO no se ofrece aunque la cuenta tenga permiso sobre el', () => {
    const conUnoApagado = ACCESOS_MEDIDOS.map((a) => (a.codigo === 'recaudacion_area' ? { ...a, activo: false } : a));
    expect(clavesDe(componerMedido(PERMISOS_MEDIDOS, MODULOS_MEDIDOS, conUnoApagado))).not.toContain('recaudacion-area');
  });

  it('un acceso publicado bajo OTRO modulo no abre una hoja de Tesoreria', () => {
    const enOtroModulo = ACCESOS_MEDIDOS.map((a) => (a.codigo === 'duplicado_recibo' ? { ...a, moduloId: 99 } : a));
    expect(clavesDe(componerMedido(PERMISOS_MEDIDOS, MODULOS_MEDIDOS, enOtroModulo))).not.toContain('duplicado-recibo');
  });

  it('un modulo INACTIVO no se ofrece, y uno que el arbol no tiene se cuenta', () => {
    const apagado = MODULOS_MEDIDOS.map((m) => ({ ...m, activo: false }));
    expect(componerMedido(PERMISOS_MEDIDOS, apagado).catalogo).toEqual([]);

    const conUnoNuevo = [...MODULOS_MEDIDOS, { id: 2, codigo: 'MERCADOS', nombre: 'Mercados', orden: 2, activo: true }];
    expect(componerMedido(PERMISOS_MEDIDOS, conUnoNuevo).sinCatalogo).toEqual(['MERCADOS']);
  });

  it('el ROTULO del modulo es el del backend', () => {
    const renombrado = MODULOS_MEDIDOS.map((m) => ({ ...m, nombre: 'Tesoreria municipal' }));
    expect(componerMedido(PERMISOS_MEDIDOS, renombrado).catalogo[0]?.rotulo).toBe('Tesoreria municipal');
  });

  it('un privilegio que no sea lista no tumba el arbol', () => {
    const raros = { ...PERMISOS_MEDIDOS, caja_tasas: 'lectura' as unknown as readonly string[] };
    expect(() => componerMedido(raros)).not.toThrow();
    expect(clavesDe(componerMedido(raros))).not.toContain('caja-tasas');
  });
});
