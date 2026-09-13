/**
 * Los casos de uso de la copia local: implantarla, sembrarla, mantenerla con el buzon de {@code
 * identidad} y, desde ADR-0042, leerla para la sesion de la interfaz. Es la frontera transaccional
 * (ARQ-04 §1): las cuatro lecturas son {@code Transactional(readOnly = true)} porque sin
 * transaccion no hay {@code SET LOCAL} y la politica RLS revienta (#486).
 */
@org.jspecify.annotations.NullMarked
package kamayuk.caja.seguridad.aplicacion;
