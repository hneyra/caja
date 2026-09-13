package kamayuk.caja.seguridad.dominio;

/**
 * La municipalidad de la sesion, tal como esta en el registro de municipalidades de esta base.
 *
 * <p>{@code nombre} es la columna <b>verbatim</b> —el nombre completo, con su tipo delante— y
 * {@code tipo} va aparte para quien necesite distinguir una distrital de una provincial, <b>no</b>
 * para anteponerlo: componer «Municipalidad » + tipo + « de » + nombre da el nombre dos veces, y
 * eso no se ve hasta que sale impreso en un recibo.
 *
 * <p>Lleva un {@code long} y no un {@code MunicipalidadId}: el tipo del dominio no aparece en
 * ninguna firma (regla 2), y un componente de {@code record} es un parametro del constructor.
 *
 * @param ubigeo los seis digitos del distrito, sin el relleno de {@code char(6)}
 * @param tipo {@code DISTRITAL} o {@code PROVINCIAL}, lo que admite el {@code CHECK} de la tabla
 */
public record Municipalidad(long id, String ubigeo, String nombre, String tipo) {}
