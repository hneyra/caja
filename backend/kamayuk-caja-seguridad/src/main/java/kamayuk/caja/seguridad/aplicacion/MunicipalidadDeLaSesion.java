package kamayuk.caja.seguridad.aplicacion;

import kamayuk.caja.seguridad.dominio.LecturaDeLaCopiaLocal;
import kamayuk.caja.seguridad.dominio.Municipalidad;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * A quien pertenecen las cifras de la ventanilla: el rotulo de la entidad (ADR-0042).
 *
 * <p>Sin ningun argumento, y eso es la mitad de la decision: no hay donde poner el identificador de
 * otra municipalidad, asi que esta lectura no puede convertirse en un directorio.
 *
 * <p>La {@code @Transactional(readOnly = true)} aqui es <b>lo que da valor al filtro</b>: {@code
 * municipalidad} se lee con {@code USING (true)}, lo que la aisla es el {@code WHERE id =
 * current_setting('app.municipalidad_id')::bigint}, y ese parametro solo existe dentro de la
 * transaccion que lo fijo con {@code SET LOCAL}.
 */
@Service
public class MunicipalidadDeLaSesion {

    private final LecturaDeLaCopiaLocal copiaLocal;

    public MunicipalidadDeLaSesion(LecturaDeLaCopiaLocal copiaLocal) {
        this.copiaLocal = copiaLocal;
    }

    /**
     * La municipalidad de la sesion en curso.
     *
     * @throws IllegalStateException si el token trae una municipalidad que no esta en el registro.
     *     Es una instalacion rota y no una respuesta de negocio, asi que sale ruidosa: un nombre
     *     vacio acabaria impreso en la cabecera de un recibo
     */
    @Transactional(readOnly = true)
    public Municipalidad actual() {
        return copiaLocal
                .municipalidadDeLaSesion()
                .orElseThrow(
                        () ->
                                new IllegalStateException(
                                        "La municipalidad de la sesion no esta en el registro de"
                                                + " municipalidades de esta base: sin su nombre la"
                                                + " ventanilla no puede decir de quien cobra"));
    }
}
