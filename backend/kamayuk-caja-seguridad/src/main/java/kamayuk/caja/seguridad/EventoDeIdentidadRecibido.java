package kamayuk.caja.seguridad;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Un evento del buzon de {@code identidad}, tal como llego.
 *
 * <p>El {@code tipoPublicado} se guarda <b>tal como el emisor lo escribio</b> y el {@link #tipo()}
 * se deriva: un tipo que esta copia no conoce no es un evento mal formado, es un evento que hay que
 * apartar diciendo cual era. El {@code cuerpo} viaja como texto —es el JSON de la fila entera tal
 * como quedo en {@code identidad}— y se interpreta al aplicar, no al leer: un cuerpo ilegible se
 * aparta con su motivo, y un cuerpo que no se puede leer <b>tampoco</b> se pierde, porque lo que se
 * guarda en {@code identidad_evento_muerto} es este texto.
 *
 * @param eventoId la identidad del evento, que es lo que se acusa
 * @param secuencia el orden en que {@code identidad} lo emitio, por municipalidad
 * @param tipoPublicado el nombre del tipo, tal como llego
 * @param sujetoId el identificador del sujeto EN {@code identidad}; aqui no coincide con ninguna
 *     clave, y por eso el aplicador casa por claves naturales (cuenta, nombre)
 * @param cuerpo la fila entera, como JSON en texto
 * @param huella la huella que el emisor calculo; se guarda para poder cotejar
 * @param creadoEn cuando se emitio
 */
public record EventoDeIdentidadRecibido(
        UUID eventoId,
        long secuencia,
        String tipoPublicado,
        long sujetoId,
        String cuerpo,
        String huella,
        Instant creadoEn) {

    public EventoDeIdentidadRecibido {
        Objects.requireNonNull(eventoId, "un evento tiene identidad");
        Objects.requireNonNull(tipoPublicado, "un evento tiene tipo");
        Objects.requireNonNull(cuerpo, "un evento tiene cuerpo");
        Objects.requireNonNull(huella, "un evento tiene huella");
        Objects.requireNonNull(creadoEn, "un evento tiene fecha");
    }

    /** El tipo, si esta copia lo conoce; {@code null} si no. */
    public @Nullable TipoDeEventoDeIdentidad tipo() {
        return TipoDeEventoDeIdentidad.declarado(tipoPublicado);
    }
}
