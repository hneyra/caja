import type { MunicipalidadDeLaSesion, SesionDeLaVentanilla } from './lecturas.ts';

/**
 * La sesion de la ventanilla, **tal como la contesta su backend** (#74).
 *
 * `GET /caja/api/v1/seguridad/sesion` y `GET /caja/api/v1/seguridad/sesion/municipalidad` con la
 * cuenta del administrador. El origen y su marca son los de `seguridadMedida.ts`.
 *
 * **Es la cuenta de la implantacion, no una persona.** «Administrador del Sistema» es el nombre con
 * que `identidad` da de alta al administrador; `caja` retiro en #44 un cajero inventado que su
 * maqueta ensenaba en la barra y en el recibo, y la guarda que lo impide
 * (`verificaciones/la-cuenta-no-se-inventa.test.tsx`) comprueba que este nombre solo llega a la
 * pantalla cuando lo contesta el backend.
 *
 * No lo importa ningun modulo de produccion: lo comprueba `camino-a-la-api.test.ts`.
 */
export const SESION_MEDIDA: SesionDeLaVentanilla = {
  usuarioId: 1,
  cuenta: 'administrador',
  nombre: 'Administrador del Sistema',
};

/** La municipalidad de esa misma sesion. */
export const MUNICIPALIDAD_MEDIDA: MunicipalidadDeLaSesion = {
  id: 1,
  ubigeo: '200105',
  nombre: 'Municipalidad Distrital de Catacaos',
  tipo: 'DISTRITAL',
};
