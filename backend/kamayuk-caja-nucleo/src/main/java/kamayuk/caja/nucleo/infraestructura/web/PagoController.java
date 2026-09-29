package kamayuk.caja.nucleo.infraestructura.web;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import kamayuk.caja.autorizacion.Privilegio;
import kamayuk.caja.autorizacion.RequiereAcceso;
import kamayuk.caja.dominio.Observacion;
import kamayuk.caja.nucleo.aplicacion.ExplicarPagoSinEntregar;
import kamayuk.caja.nucleo.aplicacion.ReintentarPagoMuerto;
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
 * <p>Es la pantalla del responsable de la conciliacion: lo que la alerta le dice que mire. Y las
 * dos salidas de un pago MUERTO: explicarlo, o volver a ponerlo en camino (#131).
 */
@RestController
@RequestMapping(Api.RAIZ + "/pagos")
public class PagoController {

    private final BuzonDeSalida buzon;
    private final ExplicarPagoSinEntregar explicar;
    private final ReintentarPagoMuerto reintentar;

    public PagoController(
            BuzonDeSalida buzon,
            ExplicarPagoSinEntregar explicar,
            ReintentarPagoMuerto reintentar) {
        this.buzon = buzon;
        this.explicar = explicar;
        this.reintentar = reintentar;
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
        UUID identificador = identificador(pagoId);
        Observacion observacion = observacion(peticion.observacion());
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

    /**
     * Un pago MUERTO vuelve a ponerse en camino, con el mismo {@code pagoId} (#131).
     *
     * <p>El mismo acceso y el mismo privilegio que la explicacion —{@code cierre_caja}, {@code
     * MODIFICACION}—, porque son las dos salidas de MUERTO y las decide la misma persona: la que la
     * alerta despierta. La diferencia es lo que afirma: explicar dice «este pago no va a llegar, y
     * me hago cargo»; reintentar dice «ya se arreglo lo que lo impedia». Si no era verdad, vuelve a
     * morir y a avisar cuando se agote el plazo otra vez.
     */
    @PostMapping("/{pagoId}/reintento")
    @RequiereAcceso(acceso = "cierre_caja", privilegio = Privilegio.MODIFICACION)
    public PagoResource reintento(
            @PathVariable String pagoId, @RequestBody PeticionDeReintento peticion) {
        UUID identificador = identificador(pagoId);
        Observacion observacion = observacion(peticion.observacion());
        try {
            return PagoResource.de(reintentar.reintentar(identificador, observacion));
        } catch (ExplicarPagoSinEntregar.PagoInexistente noExiste) {
            throw new ProblemaDeNegocio(
                    CodigoDeError.NO_ENCONTRADO, CajaController.mensajeDe(noExiste));
        } catch (IllegalStateException noSePuede) {
            // 409: la peticion esta bien, lo que no admite la operacion es el estado del evento.
            throw new ProblemaDeNegocio(
                    CodigoDeError.CONFLICTO, CajaController.mensajeDe(noSePuede));
        }
    }

    private static UUID identificador(String pagoId) {
        try {
            return UUID.fromString(pagoId);
        } catch (IllegalArgumentException malEscrito) {
            throw new ProblemaDeNegocio(
                    CodigoDeError.VALIDACION, "'" + pagoId + "' no es un identificador de pago");
        }
    }

    private static Observacion observacion(@Nullable String texto) {
        try {
            return Observacion.de(CajaController.exigir(texto, "observacion"));
        } catch (IllegalArgumentException invalido) {
            throw new ProblemaDeNegocio(
                    CodigoDeError.VALIDACION, CajaController.mensajeDe(invalido));
        }
    }

    /** El cuerpo de la explicacion. <b>Lista blanca</b>: lo que no esta aqui no entra. */
    public record PeticionDeExplicacion(
            @Nullable String explicacion, @Nullable String observacion) {}

    /**
     * El cuerpo del reintento: solo la observacion. <b>Lista blanca</b>: lo que no esta aqui no
     * entra —ni un {@code pagoId} nuevo, ni un cuerpo corregido: lo que se entrega es lo que se
     * congelo al cobrar—.
     */
    public record PeticionDeReintento(@Nullable String observacion) {}

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
