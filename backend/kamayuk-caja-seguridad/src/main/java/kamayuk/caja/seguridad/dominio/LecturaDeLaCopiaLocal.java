package kamayuk.caja.seguridad.dominio;

import java.time.LocalDate;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import kamayuk.caja.autorizacion.Privilegio;
import kamayuk.caja.compartido.Pagina;
import kamayuk.caja.compartido.Paginacion;

/**
 * Lo que la interfaz de esta caja LEE de la copia local de la autorizacion, y nada mas (ADR-0042).
 *
 * <p>La copia local —{@code modulo_sistema}, {@code acceso}, {@code usuario}, {@code grupo}, {@code
 * miembro} y {@code permiso}— ya se leia para <b>autorizar</b>: {@code ComprobadorDeAccesoJdbc},
 * desde el {@code preHandle} del guardia. Lo que no hacia nadie era <b>publicarla</b>, y sin eso la
 * ventanilla no puede dibujar su arbol sin preguntarle a {@code rentas}, cuya copia no sabe quien
 * puede cobrar (ADR-0042 §Contexto).
 *
 * <p><b>No tiene ningun metodo de escritura, y es la afirmacion.</b> Quien escribe la copia es el
 * consumidor del buzon de {@code identidad} ({@code AplicarUnEventoDeIdentidad}); este puerto es la
 * otra mitad, la que la ensena.
 *
 * <p>Ningun metodo recibe la municipalidad (regla 2): la pone el {@code SET LOCAL} de la
 * transaccion que abre quien llama, y por eso los casos de uso que lo usan son todos {@code
 * Transactional(readOnly = true)}.
 */
public interface LecturaDeLaCopiaLocal {

    /** Los modulos de este sistema, paginados. */
    Pagina<Modulo> modulos(Paginacion paginacion);

    /** Los accesos de este sistema, paginados, con el modulo del que cuelga cada uno. */
    Pagina<Acceso> accesos(Paginacion paginacion);

    /**
     * La fila de {@code usuario} de esa cuenta en <b>esta</b> municipalidad, o vacio si la copia no
     * la tiene.
     *
     * <p>Se pregunta por la existencia y nada mas —ni {@code habilitado} ni vigencia—, igual que
     * {@code ComprobadorDeAcceso.conoceAlUsuario}: una cuenta deshabilitada SI esta en la copia, y
     * lo que le falta se lo dice su matriz vacia, no un 404.
     */
    Optional<Identidad> usuarioPorCuenta(String cuenta);

    /**
     * La matriz efectiva de una cuenta a una fecha: por codigo de acceso, los privilegios que el
     * guardia le concederia ese dia.
     *
     * <p>Con <b>la misma precedencia</b> que {@code ComprobadorDeAccesoJdbc}, y eso es parte del
     * contrato y no un detalle (ADR-0042 §Decision): la excepcion del usuario decide, otorgue o
     * niegue; si no la hay, la union de sus grupos vigentes; y por encima de todo, el usuario
     * habilitado y vigente. Un acceso sin ningun privilegio <b>no aparece</b>: la cuenta sin nada
     * recibe un mapa vacio.
     */
    Map<String, Set<Privilegio>> permisosEfectivosDe(String cuenta, LocalDate fecha);

    /** La fila del registro de municipalidades que corresponde a la sesion, o vacio si no esta. */
    Optional<Municipalidad> municipalidadDeLaSesion();
}
