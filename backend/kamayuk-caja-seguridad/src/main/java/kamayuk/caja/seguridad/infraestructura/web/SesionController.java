package kamayuk.caja.seguridad.infraestructura.web;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import kamayuk.caja.autorizacion.Privilegio;
import kamayuk.caja.autorizacion.RequiereAcceso;
import kamayuk.caja.seguridad.aplicacion.IdentidadDeLaSesion;
import kamayuk.caja.seguridad.aplicacion.MunicipalidadDeLaSesion;
import kamayuk.caja.seguridad.aplicacion.PermisosDeLaSesion;
import kamayuk.caja.web.Api;
import kamayuk.caja.web.CodigoDeError;
import kamayuk.caja.web.ProblemaDeNegocio;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * La sesion hablando de si misma: que puede abrir, quien es y de que municipalidad es (ADR-0042).
 *
 * <p>Las tres son lecturas y declaran el centinela {@link RequiereAcceso#SESION_PROPIA}: basta un
 * token valido. <b>No son opciones del catalogo</b> —no hay privilegio que configurar— y exigir uno
 * haria que una cuenta sin permisos recibiera un 403 donde tiene que leer «esta cuenta no puede
 * abrir nada», que son dos cosas distintas (ADR-0042 §Decision). Leer los permisos propios no
 * revela nada que no se pueda enumerar probando cada endpoint (ADR-0013).
 *
 * <p><b>Ninguna declara un parametro</b>: el sujeto sale del token, nunca de la peticion. Uno de
 * mas ni siquiera se ignora — {@code GuardiaDeParametros} lo rechaza con 422 nombrandolo.
 */
@RestController
@RequestMapping(Api.RAIZ + "/seguridad/sesion")
public class SesionController {

    private final PermisosDeLaSesion permisos;
    private final IdentidadDeLaSesion identidad;
    private final MunicipalidadDeLaSesion municipalidad;

    public SesionController(
            PermisosDeLaSesion permisos,
            IdentidadDeLaSesion identidad,
            MunicipalidadDeLaSesion municipalidad) {
        this.permisos = permisos;
        this.identidad = identidad;
        this.municipalidad = municipalidad;
    }

    /**
     * La matriz efectiva de la cuenta del token: por codigo de acceso, sus privilegios con los
     * nombres de las columnas de {@code permiso} —{@code ejecucion}, {@code lectura}…— en el orden
     * de {@link Privilegio}. Un acceso sin ninguno no aparece, y la cuenta que no puede abrir nada
     * recibe {@code {}}, no un 403.
     */
    @GetMapping("/permisos")
    @RequiereAcceso(acceso = RequiereAcceso.SESION_PROPIA, privilegio = Privilegio.LECTURA)
    public Map<String, List<String>> permisosDeLaSesion() {
        Map<String, List<String>> salida = new LinkedHashMap<>();
        permisos.efectivos()
                .forEach(
                        (acceso, privilegios) ->
                                salida.put(
                                        acceso,
                                        privilegios.stream()
                                                .sorted()
                                                .map(Privilegio::columna)
                                                .toList()));
        return salida;
    }

    /**
     * Quien es la sesion. {@code 404 NO_ENCONTRADO} si la copia local no tiene la cuenta del token:
     * un {@code usuarioId} inventado se leeria como un usuario que existe.
     */
    @GetMapping
    @RequiereAcceso(acceso = RequiereAcceso.SESION_PROPIA, privilegio = Privilegio.LECTURA)
    public IdentidadResource identidadDeLaSesion() {
        try {
            return IdentidadResource.de(identidad.actual());
        } catch (IdentidadDeLaSesion.CuentaSinFicha sinFicha) {
            throw new ProblemaDeNegocio(CodigoDeError.NO_ENCONTRADO, mensajeDe(sinFicha));
        }
    }

    /** El rotulo de la entidad: la municipalidad del token, del registro de esta base. */
    @GetMapping("/municipalidad")
    @RequiereAcceso(acceso = RequiereAcceso.SESION_PROPIA, privilegio = Privilegio.LECTURA)
    public MunicipalidadResource municipalidadDeLaSesion() {
        return MunicipalidadResource.de(municipalidad.actual());
    }

    private static String mensajeDe(RuntimeException problema) {
        String mensaje = problema.getMessage();
        return mensaje == null ? problema.getClass().getSimpleName() : mensaje;
    }
}
