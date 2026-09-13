/**
 * El borde HTTP de la copia local: las cinco lecturas con las que la interfaz de esta caja compone
 * su sesion sin preguntarle a nadie mas (ADR-0042).
 *
 * <p>Las cinco declaran {@code SESION_PROPIA} y ninguna escribe. Las escrituras de la autorizacion
 * viven en {@code identidad} y llegan por su buzon (ADR-0039): aqui no hay ni un {@code POST}.
 *
 * <p>Los DTO son tipos propios y no los records del dominio: un cambio en el modelo interno no debe
 * publicar ni retirar campos de la API sin que nadie lo decida.
 */
@org.jspecify.annotations.NullMarked
package kamayuk.caja.seguridad.infraestructura.web;
