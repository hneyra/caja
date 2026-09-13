package kamayuk.caja.seguridad.dominio;

/**
 * Quien es la sesion: la cuenta del token ya resuelta a la fila de {@code usuario} de <b>esta</b>
 * copia.
 *
 * <p>Tres campos y no los cuatro de {@code rentas}: alli la identidad lleva ademas el {@code
 * ejercicioDeTrabajo} de la tabla {@code sesion}, que es un acto de {@code rentas} —cambiar el
 * ejercicio sobre el que se trabaja— y que esta caja no tiene. La caja cobra contra una orden, y la
 * orden ya dice lo que dice (ADR-0026 §1); inventarle aqui un ejercicio seria darle un campo que la
 * frontera de este repositorio prohibe.
 *
 * @param usuarioId el de esta municipalidad: la misma cuenta en dos municipalidades son dos filas
 */
public record Identidad(long usuarioId, String cuenta, String nombre) {}
