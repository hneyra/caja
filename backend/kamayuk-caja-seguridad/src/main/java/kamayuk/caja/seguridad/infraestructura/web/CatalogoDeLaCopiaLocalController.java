package kamayuk.caja.seguridad.infraestructura.web;

import kamayuk.caja.autorizacion.Privilegio;
import kamayuk.caja.autorizacion.RequiereAcceso;
import kamayuk.caja.seguridad.aplicacion.CatalogoDeLaCopiaLocal;
import kamayuk.caja.web.Api;
import kamayuk.caja.web.ParametrosDePaginacion;
import kamayuk.caja.web.RespuestaPaginada;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Los modulos y los accesos de esta caja, de los que la interfaz compone su arbol (ADR-0042).
 *
 * <p>Con la misma forma que {@code rentas} publica los suyos —las mismas rutas, los mismos campos,
 * el mismo sobre paginado— y con <b>otro acceso</b>, y esa es la diferencia que hay que conocer:
 * alli {@code /seguridad/modulos} y {@code /seguridad/accesos} exigen las opciones {@code modulos}
 * y {@code accesos} de su catalogo; aqui declaran {@link RequiereAcceso#SESION_PROPIA}. Exigir un
 * acceso para leer el arbol obligaria a anadirlo a {@code identidad} y a concederselo a cada cajero
 * solo para ver el menu, y convertiria «no puede abrir nada» en un 403 (ADR-0042 §Alternativas).
 */
@RestController
@RequestMapping(Api.RAIZ + "/seguridad")
public class CatalogoDeLaCopiaLocalController {

    private final CatalogoDeLaCopiaLocal catalogo;

    public CatalogoDeLaCopiaLocalController(CatalogoDeLaCopiaLocal catalogo) {
        this.catalogo = catalogo;
    }

    /** Por {@code orden} si el cliente no dice otra cosa: es el orden del menu. */
    @GetMapping("/modulos")
    @RequiereAcceso(acceso = RequiereAcceso.SESION_PROPIA, privilegio = Privilegio.LECTURA)
    public RespuestaPaginada<ModuloResource> modulos(ParametrosDePaginacion paginacion) {
        return RespuestaPaginada.de(
                catalogo.modulos(paginacion.aPaginacion("orden")), ModuloResource::de);
    }

    /**
     * Por {@code codigo} si el cliente no dice otra cosa. La interfaz los pide de una vez con
     * {@code ?tamano=200}, dentro del tope de {@code Paginacion.TAMANO_MAXIMO}.
     */
    @GetMapping("/accesos")
    @RequiereAcceso(acceso = RequiereAcceso.SESION_PROPIA, privilegio = Privilegio.LECTURA)
    public RespuestaPaginada<AccesoResource> accesos(ParametrosDePaginacion paginacion) {
        return RespuestaPaginada.de(
                catalogo.accesos(paginacion.aPaginacion("codigo")), AccesoResource::de);
    }
}
