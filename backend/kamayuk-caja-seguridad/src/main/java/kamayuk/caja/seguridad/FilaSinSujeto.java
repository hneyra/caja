package kamayuk.caja.seguridad;

import java.time.LocalDate;
import java.util.Objects;
import kamayuk.caja.seguridad.dominio.PlazoDeAdopcion;

/**
 * Una fila de {@code usuario} o de {@code grupo} de la copia local que sigue sin sujeto de {@code
 * identidad} y que TODAVIA concede, porque su plazo no ha pasado (#125).
 *
 * <p>Desde aqui no se sabe si es una cuenta legitima que espera su primer evento o una huerfana que
 * no lo recibira nunca: ver {@link PlazoDeAdopcion}. Por eso el aviso la nombra con lo unico que la
 * identifica en los dos sistemas —su clave natural— y dice cuando deja de conceder.
 *
 * @param tabla {@code usuario} o {@code grupo}
 * @param id su {@code id} en ESTA copia, para quien tenga que mirarla en la base
 * @param clave la cuenta o el nombre del grupo, que es como se la busca en {@code identidad}
 * @param desde el dia, en Lima, del {@code sin_sujeto_desde} que le puso V6
 */
public record FilaSinSujeto(String tabla, long id, String clave, LocalDate desde) {

    public FilaSinSujeto {
        Objects.requireNonNull(tabla, "una fila es de una tabla");
        Objects.requireNonNull(clave, "una fila tiene clave");
        Objects.requireNonNull(desde, "solo concede la que tiene fecha");
    }

    /** El ultimo dia en que concede. */
    public LocalDate concedeHasta() {
        return PlazoDeAdopcion.concedeHasta(desde);
    }
}
