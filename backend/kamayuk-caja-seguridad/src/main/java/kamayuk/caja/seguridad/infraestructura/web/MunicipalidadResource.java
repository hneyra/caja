package kamayuk.caja.seguridad.infraestructura.web;

import kamayuk.caja.seguridad.dominio.Municipalidad;

/**
 * El rotulo de la entidad, tal como sale impreso. {@code nombre} es la columna verbatim y {@code
 * tipo} <b>no se antepone</b>: ver {@link Municipalidad}.
 */
public record MunicipalidadResource(long id, String ubigeo, String nombre, String tipo) {

    static MunicipalidadResource de(Municipalidad municipalidad) {
        return new MunicipalidadResource(
                municipalidad.id(),
                municipalidad.ubigeo(),
                municipalidad.nombre(),
                municipalidad.tipo());
    }
}
