package kamayuk.caja.seguridad.aplicacion;

import kamayuk.caja.compartido.Pagina;
import kamayuk.caja.compartido.Paginacion;
import kamayuk.caja.seguridad.dominio.Acceso;
import kamayuk.caja.seguridad.dominio.LecturaDeLaCopiaLocal;
import kamayuk.caja.seguridad.dominio.Modulo;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Los modulos y los accesos de esta caja: de lo que la interfaz compone su arbol antes de filtrarlo
 * con la matriz de la sesion (ADR-0042).
 *
 * <p>Es un caso de uso y no una llamada suelta al repositorio por lo que {@code rentas} pago en la
 * etapa 4 de ADR-0039: su {@code SeguridadController} se quedo llamando al repositorio, sin nadie
 * que abriera transaccion, y {@code GET /seguridad/modulos} contestaba 500 con «invalid input
 * syntax for type bigint: ""». Aqui la {@code @Transactional(readOnly = true)} vive en el caso de
 * uso y el controlador no sostiene el puerto.
 *
 * <p><b>Y eso no lo vigila ArchUnit, dicho en vez de supuesto:</b> {@code
 * NINGUN_CONTROLADOR_SOSTIENE_UN_REPOSITORIO} reconoce un repositorio por el sufijo {@code
 * Repository} del tipo del campo, y {@code LecturaDeLaCopiaLocal} no lo lleva. Lo que lo sujeta es
 * {@code LecturasDeLaSesionFronteraTest}, que monta el repositorio sin proxy y los casos de uso con
 * el que obedece a la anotacion: sin la {@code @Transactional} de aqui, las dos rutas contestan 500
 * en esa prueba.
 */
@Service
public class CatalogoDeLaCopiaLocal {

    private final LecturaDeLaCopiaLocal copiaLocal;

    public CatalogoDeLaCopiaLocal(LecturaDeLaCopiaLocal copiaLocal) {
        this.copiaLocal = copiaLocal;
    }

    @Transactional(readOnly = true)
    public Pagina<Modulo> modulos(Paginacion paginacion) {
        return copiaLocal.modulos(paginacion);
    }

    @Transactional(readOnly = true)
    public Pagina<Acceso> accesos(Paginacion paginacion) {
        return copiaLocal.accesos(paginacion);
    }
}
