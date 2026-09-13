package kamayuk.caja.seguridad.infraestructura.web;

import kamayuk.caja.seguridad.dominio.Identidad;

/**
 * Quien es la sesion, en tres campos. Sin el {@code ejercicioDeTrabajo} de {@code rentas}: ver
 * {@link Identidad}.
 */
public record IdentidadResource(long usuarioId, String cuenta, String nombre) {

    static IdentidadResource de(Identidad identidad) {
        return new IdentidadResource(identidad.usuarioId(), identidad.cuenta(), identidad.nombre());
    }
}
