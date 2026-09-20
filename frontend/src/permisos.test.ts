import { describe, expect, it } from 'vitest';

import { ACCESOS_POR_DESTINO, CATALOGO, CODIGO_POR_CLAVE } from './catalogo.ts';
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
const accesosDe = (clave: string) => ACCESOS_POR_DESTINO.get(clave) ?? [];
const componerMedido = (permisos: PermisosDeLaSesion = PERMISOS_MEDIDOS, modulos = MODULOS_MEDIDOS, accesos = ACCESOS_MEDIDOS) =>
  componer(CATALOGO, modulos, accesos, permisos, codigoDe, accesosDe);

const clavesDe = (resultado: ReturnType<typeof componerMedido>) =>
  resultado.catalogo.flatMap((m) => m.destinos.map((d) => d.clave));

describe('el catalogo se compone de lo que la cuenta puede abrir', () => {
  it('EL CENTINELA: la captura trae un modulo, siete accesos y la matriz entera', () => {
    expect(MODULOS_MEDIDOS).toHaveLength(1);
    expect(ACCESOS_MEDIDOS).toHaveLength(7);
    expect(Object.keys(PERMISOS_MEDIDOS)).toHaveLength(7);
  });

  it('con el administrador salen las seis hojas, en el orden del arbol', () => {
    expect(clavesDe(componerMedido())).toEqual([
      'caja-tributaria',
      'caja-tasas',
      'duplicado-recibo',
      'cierre-caja',
      'avance-recaudacion',
      'recaudacion-area',
    ]);
  });

  it('se filtra la HOJA, no el modulo: sin `cierre_caja` se cae esa hoja y las otras cinco se quedan', () => {
    const resultado = componerMedido(sinLosAccesos('cierre_caja'));
    expect(clavesDe(resultado)).toHaveLength(5);
    expect(clavesDe(resultado)).not.toContain('cierre-caja');
    // Y se cuenta: una hoja escondida en silencio no se distingue de una que no existe.
    expect(resultado.sinPermiso).toEqual(['cierre_caja']);
  });

  /**
   * **El defecto de #100, medido al reves.**
   *
   * Hasta ADR-0044 esta prueba afirmaba que esa cuenta veia `anulacion-recibo` — una hoja que no
   * podia pedir nada, con un titulo, una nota y cero campos. Era cierto y era inutil: el arbol
   * entero de esa cuenta era una pantalla muda.
   *
   * Hoy ve `duplicado-recibo`, que es **donde se anula**: la hoja la sirven dos accesos, y basta
   * poder uno. Lo que le pase a la lista de esa hoja lo dice la pantalla —con `oTambien` (#100) la
   * ve quien tenga `lectura` sobre cualquiera de los dos; con solo `eliminacion`, el backend niega
   * y la accion lo dice en el motivo de su boton—, pero el arbol ya no la deja sin sitio al que ir.
   */
  it('quien solo puede anular ve la hoja DONDE se anula, y no una hoja muda (#100)', () => {
    const soloAnular: PermisosDeLaSesion = { anulacion_recibo: ['eliminacion'] };
    expect(clavesDe(componerMedido(soloAnular))).toEqual(['duplicado-recibo']);
  });

  it('y esa hoja la sirven DOS accesos: sin ninguno de los dos no se ofrece', () => {
    const conLosDos: PermisosDeLaSesion = { duplicado_recibo: ['lectura'], anulacion_recibo: ['eliminacion'] };
    expect(clavesDe(componerMedido(conLosDos))).toEqual(['duplicado-recibo']);
    // Y el que no se pudo abrir se cuenta igual: el recuento cuadra con la matriz, no con las hojas.
    expect(componerMedido({ anulacion_recibo: ['eliminacion'] }).sinPermiso).toContain('duplicado_recibo');
    expect(clavesDe(componerMedido(sinLosAccesos('duplicado_recibo', 'anulacion_recibo')))).not.toContain(
      'duplicado-recibo',
    );
  });

  it('un acceso con la lista VACIA no abre nada', () => {
    const vacio: PermisosDeLaSesion = { ...sinLosAccesos('caja_tasas'), caja_tasas: [] };
    expect(clavesDe(componerMedido(vacio))).not.toContain('caja-tasas');
  });

  it('sin NINGUN permiso, el catalogo sale vacio — y el modulo tampoco se dibuja', () => {
    const { catalogo, sinPermiso } = componerMedido({});
    expect(catalogo).toEqual([]);
    // Siete y no seis: se cuentan los ACCESOS que se quedaron sin abrir, y son siete aunque las
    // hojas sean seis (#100).
    expect(sinPermiso).toHaveLength(7);
  });

  it('un acceso INACTIVO no se ofrece aunque la cuenta tenga permiso sobre el', () => {
    const conUnoApagado = ACCESOS_MEDIDOS.map((a) => (a.codigo === 'recaudacion_area' ? { ...a, activo: false } : a));
    expect(clavesDe(componerMedido(PERMISOS_MEDIDOS, MODULOS_MEDIDOS, conUnoApagado))).not.toContain('recaudacion-area');
  });

  it('un acceso publicado bajo OTRO modulo no abre una hoja de Tesoreria', () => {
    // Los DOS que sirven esa hoja: con uno solo movido, el otro la sigue abriendo (#100), que es
    // exactamente lo que «basta uno» significa.
    const enOtroModulo = ACCESOS_MEDIDOS.map((a) =>
      a.codigo === 'duplicado_recibo' || a.codigo === 'anulacion_recibo' ? { ...a, moduloId: 99 } : a,
    );
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
