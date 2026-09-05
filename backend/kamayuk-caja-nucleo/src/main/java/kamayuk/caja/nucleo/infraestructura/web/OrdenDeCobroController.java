package kamayuk.caja.nucleo.infraestructura.web;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import kamayuk.caja.autorizacion.Privilegio;
import kamayuk.caja.autorizacion.RequiereAcceso;
import kamayuk.caja.dominio.Dinero;
import kamayuk.caja.dominio.Observacion;
import kamayuk.caja.nucleo.aplicacion.RegistrarOrdenDeCobro;
import kamayuk.caja.nucleo.dominio.OrdenDeCobro;
import kamayuk.caja.nucleo.dominio.OrdenDeCobroRepository;
import kamayuk.caja.nucleo.dominio.Pagador;
import kamayuk.caja.nucleo.dominio.SistemaDeOrigen;
import kamayuk.caja.web.Api;
import kamayuk.caja.web.CodigoDeError;
import kamayuk.caja.web.ProblemaDeNegocio;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * La unica puerta por la que entra a la caja algo que cobrar (ADR-0026 §1).
 *
 * <h2>El codigo de estado dice si fue un alta o un reintento</h2>
 *
 * <p><b>201</b> cuando la orden se dio de alta y <b>200</b> cuando ya estaba. No es cosmetico: el
 * alta es idempotente por {@code (sistemaOrigen, referenciaExterna)}, y un sistema de origen que
 * reintenta tiene derecho a saber si su reintento se reconocio o si acaba de crear una segunda
 * orden. Devolver 201 siempre haria que las dos cosas se leyeran igual, y la unica forma de
 * distinguirlas seria contar filas.
 *
 * <p>La garantia ultima es {@code orden_referencia_uq} y no esta lectura: dos peticiones
 * simultaneas del mismo origen las serializa el motor (#188).
 */
@RestController
@RequestMapping(Api.RAIZ + "/ordenes-de-cobro")
public class OrdenDeCobroController {

    private final RegistrarOrdenDeCobro registrar;

    public OrdenDeCobroController(RegistrarOrdenDeCobro registrar) {
        this.registrar = registrar;
    }

    /** Da de alta una orden, o devuelve la que ya estaba. */
    @PostMapping
    @RequiereAcceso(acceso = "caja_tributaria", privilegio = Privilegio.REGISTRO)
    public ResponseEntity<OrdenDeCobroResource> registrar(
            @RequestBody PeticionDeOrdenDeCobro peticion) {

        Observacion observacion = observacionDe(peticion.observacion());
        RegistrarOrdenDeCobro.Peticion orden;
        try {
            orden =
                    new RegistrarOrdenDeCobro.Peticion(
                            SistemaDeOrigen.de(
                                    CajaController.exigir(
                                            peticion.sistemaOrigen(), "sistemaOrigen")),
                            CajaController.exigir(
                                    peticion.referenciaExterna(), "referenciaExterna"),
                            CajaController.exigir(peticion.concepto(), "concepto"),
                            CajaController.vacioAnulo(peticion.detalle()),
                            importeDe(peticion.importe()),
                            fechaDe(peticion.fechaExigibilidad(), "fechaExigibilidad"),
                            fechaDe(peticion.actualizadoA(), "actualizadoA"),
                            new Pagador(
                                    CajaController.vacioAnulo(peticion.pagadorDocumento()),
                                    CajaController.vacioAnulo(peticion.pagadorNombre()),
                                    peticion.pagadorIdExterno()));
        } catch (IllegalArgumentException invalido) {
            throw new ProblemaDeNegocio(
                    CodigoDeError.VALIDACION, CajaController.mensajeDe(invalido));
        }

        OrdenDeCobroRepository.Alta alta = registrar.registrar(orden, observacion);
        HttpStatus estado = alta.nueva() ? HttpStatus.CREATED : HttpStatus.OK;
        return ResponseEntity.status(estado).body(OrdenDeCobroResource.de(alta));
    }

    // ------------------------------------------------------------------

    /**
     * El importe llega como CADENA.
     *
     * <p>RNF-055 al otro lado de una frontera HTTP: leerlo como numero de coma flotante puede
     * cambiarle el valor, y el sitio donde eso pasa es el camino del dinero.
     */
    private static Dinero importeDe(@Nullable String texto) {
        String valor = CajaController.exigir(texto, "importe");
        try {
            return Dinero.de(valor);
        } catch (IllegalArgumentException malEscrito) {
            throw new ProblemaDeNegocio(
                    CodigoDeError.VALIDACION,
                    "El campo 'importe' no es un importe: '" + valor + "'");
        }
    }

    private static LocalDate fechaDe(@Nullable String texto, String campo) {
        String valor = CajaController.exigir(texto, campo);
        try {
            return LocalDate.parse(valor);
        } catch (DateTimeParseException malEscrita) {
            throw new ProblemaDeNegocio(
                    CodigoDeError.VALIDACION,
                    "El campo '" + campo + "' no es una fecha ISO: '" + valor + "'");
        }
    }

    private static Observacion observacionDe(@Nullable String texto) {
        try {
            return Observacion.de(CajaController.exigir(texto, "observacion"));
        } catch (IllegalArgumentException invalido) {
            throw new ProblemaDeNegocio(
                    CodigoDeError.VALIDACION, CajaController.mensajeDe(invalido));
        }
    }

    /**
     * Lo que la caja devuelve de una orden.
     *
     * @param nueva si se dio de alta ahora, o ya estaba. Va en el cuerpo ADEMAS de en el codigo de
     *     estado: un cliente que solo mire el cuerpo tiene que poder distinguirlo igual
     */
    public record OrdenDeCobroResource(
            long ordenId,
            String sistemaOrigen,
            String referenciaExterna,
            String concepto,
            String importe,
            String fechaExigibilidad,
            String actualizadoA,
            String estado,
            @Nullable Long reciboId,
            boolean nueva) {

        static OrdenDeCobroResource de(OrdenDeCobroRepository.Alta alta) {
            OrdenDeCobro orden = alta.orden();
            return new OrdenDeCobroResource(
                    orden.idGuardado(),
                    orden.sistemaOrigen().nombre(),
                    orden.referenciaExterna(),
                    orden.concepto(),
                    orden.importe().valor().toPlainString(),
                    orden.fechaExigibilidad().toString(),
                    orden.actualizadoA().toString(),
                    orden.estado().name(),
                    orden.reciboId(),
                    alta.nueva());
        }
    }
}
