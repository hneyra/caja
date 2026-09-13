package kamayuk.caja.seguridad.infraestructura.web;

import kamayuk.caja.seguridad.dominio.Modulo;

/** Un modulo del menu, con los campos que {@code rentas} publica para el suyo (ADR-0042). */
public record ModuloResource(long id, String codigo, String nombre, int orden, boolean activo) {

    static ModuloResource de(Modulo modulo) {
        return new ModuloResource(
                modulo.id(), modulo.codigo(), modulo.nombre(), modulo.orden(), modulo.activo());
    }
}
