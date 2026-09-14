import type { AccesoDelSistema, ModuloDelSistema, PermisosDeLaSesion } from './lecturas.ts';

/**
 * Las tres lecturas de seguridad de la ventanilla, **tal como las contesta su backend** (#74).
 *
 * Es el hermano de `rentas/frontend/src/datos/seguridadMedida.ts` y existe por lo mismo: las
 * pruebas de la aplicacion montada, la siembra de `yarn dev` y el arnes de navegador necesitan
 * decir que puede abrir la cuenta, y con literales sueltos el dia que la forma cambie habria veinte
 * sitios que corregir y ninguno que lo dijera.
 *
 * <h2>De donde sale</h2>
 *
 * De `GET /caja/api/v1/seguridad/{modulos, accesos?tamano=200, sesion/permisos}` con la cuenta del
 * administrador de una implantacion de cero. `ORIGEN_DE_LA_CAPTURA` dice **como** se obtuvo, y esa
 * cadena es tambien la marca que el `Dockerfile` y `e2e/la-siembra-no-viaja-al-bundle.spec.ts`
 * buscan en lo servido: los rotulos de la captura son los mismos que los del arbol de verdad, asi
 * que no distinguen nada, y la marca si.
 *
 * <h2>No lo importa ningun modulo de produccion, y se comprueba</h2>
 *
 * `verificaciones/camino-a-la-api.test.ts` exige que solo lo importen pruebas, `e2e/` y
 * `desarrollo/`. Sin esa guarda acabaria siendo un respaldo —`permisos ?? PERMISOS_MEDIDOS`— que
 * ofreceria el arbol entero a quien el backend no se lo ofrece.
 */

/** Como se obtuvo esta captura. Ver la cabecera: es tambien la marca que se busca en lo servido. */
export const ORIGEN_DE_LA_CAPTURA =
  'captura-medida-de-caja: derivada de CatalogoDelSistema (caja#77) con los siete privilegios; pendiente de medir con curl contra #80';

/** Los modulos que publica la caja: uno. */
export const MODULOS_MEDIDOS: readonly ModuloDelSistema[] = [
  { id: 1, codigo: 'TESORERIA', nombre: 'Tesoreria', orden: 1, activo: true },
];

/** Los siete accesos del catalogo, en el orden en que el backend los publica: por codigo. */
export const ACCESOS_MEDIDOS: readonly AccesoDelSistema[] = [
  { id: 4, moduloId: 1, tipo: 'OPCION', codigo: 'anulacion_recibo', nombre: 'Anulacion de recibo', activo: true },
  { id: 6, moduloId: 1, tipo: 'OPCION', codigo: 'avance_recaudacion', nombre: 'Avance de recaudacion', activo: true },
  { id: 2, moduloId: 1, tipo: 'OPCION', codigo: 'caja_tasas', nombre: 'Caja de tasas y derechos administrativos', activo: true },
  { id: 1, moduloId: 1, tipo: 'OPCION', codigo: 'caja_tributaria', nombre: 'Caja tributaria', activo: true },
  { id: 5, moduloId: 1, tipo: 'OPCION', codigo: 'cierre_caja', nombre: 'Cierre y arqueo de caja', activo: true },
  { id: 3, moduloId: 1, tipo: 'OPCION', codigo: 'duplicado_recibo', nombre: 'Duplicado de recibo', activo: true },
  { id: 7, moduloId: 1, tipo: 'OPCION', codigo: 'recaudacion_area', nombre: 'Recaudacion por area', activo: true },
];

const LOS_SIETE = ['ejecucion', 'lectura', 'registro', 'modificacion', 'eliminacion', 'impresion', 'especial'] as const;

/** La matriz del administrador: los siete accesos con los siete privilegios. */
export const PERMISOS_MEDIDOS: PermisosDeLaSesion = Object.fromEntries(
  ACCESOS_MEDIDOS.map((acceso) => [acceso.codigo, [...LOS_SIETE]]),
);

/**
 * La misma matriz sin algunos accesos.
 *
 * Existe porque el administrador puede todo, y el filtro hoja por hoja tiene que comprobarse en las
 * dos direcciones: con una cuenta que puede todo, el arbol sale entero aunque el filtro no filtre.
 */
export function sinLosAccesos(...codigos: readonly string[]): PermisosDeLaSesion {
  return Object.fromEntries(
    Object.entries(PERMISOS_MEDIDOS).filter(([codigo]) => !codigos.includes(codigo)),
  );
}
