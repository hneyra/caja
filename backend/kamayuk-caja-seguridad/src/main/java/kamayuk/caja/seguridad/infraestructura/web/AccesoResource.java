package kamayuk.caja.seguridad.infraestructura.web;

import kamayuk.caja.seguridad.dominio.Acceso;

/**
 * Un acceso del catalogo, con el modulo del que cuelga. Sin {@code municipalidadId}: sale del token
 * y no viaja de vuelta.
 */
public record AccesoResource(
        long id, long moduloId, String tipo, String codigo, String nombre, boolean activo) {

    static AccesoResource de(Acceso acceso) {
        return new AccesoResource(
                acceso.id(),
                acceso.moduloId(),
                acceso.tipo(),
                acceso.codigo(),
                acceso.nombre(),
                acceso.activo());
    }
}
