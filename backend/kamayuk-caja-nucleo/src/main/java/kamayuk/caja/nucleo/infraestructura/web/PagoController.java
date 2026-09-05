package kamayuk.caja.nucleo.infraestructura.web;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import kamayuk.caja.autorizacion.Privilegio;
import kamayuk.caja.autorizacion.RequiereAcceso;
import kamayuk.caja.dominio.Observacion;
import kamayuk.caja.nucleo.aplicacion.ExplicarPagoSinEntregar;
import kamayuk.caja.nucleo.dominio.BuzonDeSalida;
import kamayuk.caja.nucleo.dominio.EventoDePago;
import kamayuk.caja.web.Api;
import kamayuk.caja.web.CodigoDeError;
import kamayuk.caja.web.ProblemaDeNegocio;
import org.jspecify.annotations.Nullable;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Los pagos en transito y los que no se pudieron entregar (ADR-0026 §4).
 *
 * <p>Es la pantalla del responsable de la conciliacion: lo que la alerta le dice que mire.
 */
@RestController
@RequestMapping(Api.RAIZ + "/pagos")
public class PagoController {

    private final BuzonDeSalida buzon;
    private final ExplicarPagoSinEntregar explicar;

    public PagoController(BuzonDeSalida buzon, ExplicarPagoSinEntregar explicar) {
        this.buzon = buzon;
        this.explicar = explicar;
    }

    /**
     * Los pagos que ningun sistema de origen ha podido imputar.
     *
     * <p>Es dinero cobrado sin registrar, y por eso tiene ruta propia en vez de ser un filtro de un
     * listado general: lo que se mira aqui no es «todos los pagos» sino los que hay que resolver
     * hoy.
     */
    @GetMapping("/sin-entregar")
    @RequiereAcceso(acceso = "cierre_caja", privilegio = Privilegio.LECTURA)
    @Transactional(readOnly = true)
    public List<PagoResource> sinEntregar() {
        List<EventoDePago> muertos = buzon.muertos();
        List<PagoResource> filas = new ArrayList<>(muertos.size());
        for (EventoDePago evento : muertos) {
            filas.add(PagoResource.de(evento));
        }
        return List.copyOf(filas);
    }

    /** Alguien se hace cargo por escrito de un pago que no se pudo entregar. */
    @PostMapping("/{pagoId}/explicacion")
    @RequiereAcceso(acceso = "cierre_caja", privilegio = Privilegio.MODIFICACION)
    public PagoResource explicacion(
            @PathVariable String pagoId, @RequestBody PeticionDeExplicacion peticion) {
        UUID identificador;
        try {
            identificador = UUID.fromString(pagoId);
        } catch (IllegalArgumentException malEscrito) {
            throw new ProblemaDeNegocio(
                    CodigoDeError.VALIDACION, "'" + pagoId + "' no es un identificador de pago");
        }
        Observacion observacion;
        try {
            observacion =
                    Observacion.de(CajaController.exigir(peticion.observacion(), "observacion"));
        } catch (IllegalArgumentException invalido) {
            throw new ProblemaDeNegocio(
                    CodigoDeError.VALIDACION, CajaController.mensajeDe(invalido));
        }
        try {
            return PagoResource.de(
                    explicar.explicar(
                            identificador,
                            CajaController.exigir(peticion.explicacion(), "explicacion"),
                            observacion));
        } catch (ExplicarPagoSinEntregar.PagoInexistente noExiste) {
            throw new ProblemaDeNegocio(
                    CodigoDeError.NO_ENCONTRADO, CajaController.mensajeDe(noExiste));
        } catch (IllegalStateException noSePuede) {
            // 409: la peticion esta bien, lo que no admite la operacion es el estado del evento.
            throw new ProblemaDeNegocio(
                    CodigoDeError.CONFLICTO, CajaController.mensajeDe(noSePuede));
        } catch (IllegalArgumentException invalido) {
            throw new ProblemaDeNegocio(
                    CodigoDeError.VALIDACION, CajaController.mensajeDe(invalido));
        }
    }

    /** El cuerpo de la explicacion. <b>Lista blanca</b>: lo que no esta aqui no entra. */
    public record PeticionDeExplicacion(
            @Nullable String explicacion, @Nullable String observacion) {}

    /**
     * Un pago del buzon.
     *
     * @param creadoEn la hora del cobro. <b>Es la hora del transito</b> (ADR-0026 §4): con ella se
     *     sabe cuanto lleva ese dinero cobrado sin que el sistema de origen lo sepa
     */
    public record PagoResource(
            String pagoId,
            String tipo,
            String destino,
            long reciboId,
            long turnoId,
            String estado,
            int intentos,
            @Nullable String ultimoError,
            String creadoEn,
            @Nullable String entregadoEn,
            @Nullable String explicacion) {

        static PagoResource de(EventoDePago evento) {
            return new PagoResource(
                    evento.eventoId().toString(),
                    evento.tipo().name(),
                    evento.sistemaDestino().nombre(),
                    evento.reciboId(),
                    evento.turnoId(),
                    evento.estado().name(),
                    evento.intentos(),
                    evento.ultimoError(),
                    evento.creadoEn().toString(),
                    evento.entregadoEn() == null ? null : evento.entregadoEn().toString(),
                    evento.explicacion());
        }
    }
}
