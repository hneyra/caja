package kamayuk.caja.seguridad;

import org.jspecify.annotations.Nullable;

/**
 * Los siete tipos de hecho que {@code identidad} publica por su buzon (ADR-0039, etapa 2), tal como
 * esta copia local los sabe aplicar.
 *
 * <p>Son los siete de {@code identidad_evento_tipo_ck} en el esquema de {@code identidad}, y los
 * siete se aplican aqui: la copia local de la autorizacion es <b>la misma tabla en los cinco</b>
 * (D-N5), asi que no hay un tipo que hable de algo que esta base no tenga. Es la diferencia con la
 * ingestion del padron de {@code rentas}, donde {@code catastro} publica siete y aquel aplica tres.
 *
 * <p>Un octavo tipo —uno que {@code identidad} publique y este enumerado no conozca— <b>no se
 * ignora ni se espera: se aparta</b>. Que un evento de la autorizacion no llegue a esta copia no es
 * una capacidad que falta sino un permiso que alguien concedio y aqui no rige, y eso tiene que
 * avisarse al responsable en vez de quedarse pendiente en silencio hasta que alguien despliegue.
 */
public enum TipoDeEventoDeIdentidad {
    USUARIO_DADO_DE_ALTA,
    USUARIO_MODIFICADO,
    GRUPO_DADO_DE_ALTA,
    GRUPO_MODIFICADO,
    MIEMBRO_AFILIADO,
    MIEMBRO_DESAFILIADO,
    PERMISO_FIJADO;

    /** El tipo con ese nombre, o {@code null} si esta copia no lo conoce. */
    public static @Nullable TipoDeEventoDeIdentidad declarado(@Nullable String nombre) {
        if (nombre == null) {
            return null;
        }
        for (TipoDeEventoDeIdentidad tipo : values()) {
            if (tipo.name().equals(nombre)) {
                return tipo;
            }
        }
        return null;
    }
}
