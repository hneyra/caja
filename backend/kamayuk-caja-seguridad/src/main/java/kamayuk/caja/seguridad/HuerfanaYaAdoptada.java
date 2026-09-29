package kamayuk.caja.seguridad;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

/**
 * Una fila de {@code usuario} o de {@code grupo} que YA lleva sujeto de {@code identidad} y que
 * probablemente lo gano sobre la fila de OTRO: concede algo que existia aqui antes de que el alta
 * de su sujeto entrara en esta copia (#137).
 *
 * <p>Es un <b>candidato</b>, no una certeza: desde aqui no se sabe de quien era la fila antes de
 * que la adoptara su sujeto —{@code identidad_evento_aplicado} no guarda la clave, e {@code
 * identidad} no publica la historia de sus claves—. Lo que si se sabe, con fechas de esta misma
 * copia, es que la fila ya daba algo antes de que naciera aqui quien la tiene hoy. El criterio y lo
 * que se le escapa estan en {@code kamayuk.caja.seguridad.aplicacion.HuerfanasYaAdoptadas} y en
 * {@code docs/40-datos/huerfanas-ya-adoptadas.md}.
 *
 * @param tabla {@code usuario} o {@code grupo}
 * @param id su {@code id} en ESTA copia, para quien tenga que mirarla en la base
 * @param clave la cuenta o el nombre del grupo, que es como se la busca en {@code identidad}
 * @param sujeto su {@code identidad_sujeto_id}: el sujeto que la tiene hoy
 * @param altaAplicadaEn cuando entro aqui el alta de ese sujeto (la primera, si hubiera dos)
 * @param heredado lo que concede y es anterior a ese alta, por fecha; nunca vacio
 */
public record HuerfanaYaAdoptada(
        String tabla,
        long id,
        String clave,
        long sujeto,
        Instant altaAplicadaEn,
        List<Herencia> heredado) {

    public HuerfanaYaAdoptada {
        Objects.requireNonNull(tabla, "una fila es de una tabla");
        Objects.requireNonNull(clave, "una fila tiene clave");
        Objects.requireNonNull(altaAplicadaEn, "solo es candidata la que tiene su alta aplicada");
        heredado = List.copyOf(heredado);
        if (heredado.isEmpty()) {
            throw new IllegalArgumentException(
                    "una fila sin nada heredado no concede nada ajeno: no es candidata");
        }
    }

    /**
     * Una afiliacion activa o un permiso que concede algo, anterior al alta del sujeto de la fila.
     *
     * @param que {@code miembro} o {@code permiso}
     * @param de para una cuenta, el grupo al que esta afiliada o el acceso del permiso; para un
     *     grupo, la cuenta afiliada o el acceso del permiso
     * @param desde su {@code fecha_alta} o su {@code fecha_registro}: cuando entro en esta copia
     */
    public record Herencia(String que, String de, Instant desde) {
        public Herencia {
            Objects.requireNonNull(que, "una herencia es de algo");
            Objects.requireNonNull(de, "una herencia nombra algo");
            Objects.requireNonNull(desde, "una herencia tiene fecha");
        }
    }
}
