package kamayuk.caja.nucleo.infraestructura.web;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import kamayuk.caja.autorizacion.Privilegio;
import kamayuk.caja.autorizacion.RequiereAcceso;
import kamayuk.caja.nucleo.aplicacion.ArqueoDeTurno;
import kamayuk.caja.nucleo.dominio.EventoDePago;
import kamayuk.caja.web.Api;
import kamayuk.caja.web.ImporteActualizado;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code GET /caja/api/v1/turnos/&#123;id&#125;/cierre}: si el turno puede cerrar, y si no, por que
 * no (ADR-0026 §4).
 *
 * <h2>Se pregunta ANTES de cerrar, y por eso es un GET</h2>
 *
 * <p>El cierre es bloqueante: un turno con un pago sin entregar no cierra. Descubrirlo al pulsar
 * «Cerrar» dejaria al cajero con el cajon contado y un error; con esta lectura, la pantalla lo dice
 * antes y nombra los pagos <b>uno a uno</b>, que es lo que ADR-0026 §4 pide.
 *
 * <p><b>No devuelve un booleano a secas.</b> Quien no puede cerrar tiene derecho a saber cuales
 * son, con su hora de cobro y su ultimo error, porque cada uno se resuelve de una manera: esperar a
 * que el publicador lo consiga, o explicarlo por escrito.
 */
@RestController
@RequestMapping(Api.RAIZ + "/turnos")
public class EstadoDelCierreController {

    private final ArqueoDeTurno arqueo;
    private final Clock reloj;

    public EstadoDelCierreController(ArqueoDeTurno arqueo, Clock reloj) {
        this.arqueo = arqueo;
        this.reloj = reloj;
    }

    @GetMapping("/{turnoId}/cierre")
    @RequiereAcceso(acceso = "cierre_caja", privilegio = Privilegio.LECTURA)
    @Transactional(readOnly = true)
    public EstadoDelCierreResource del(@PathVariable long turnoId) {
        LocalDate hoy = LocalDate.now(reloj);
        var declarado =
                Map.<kamayuk.caja.nucleo.dominio.FormaDePago, kamayuk.caja.dominio.Dinero>of();
        var elArqueo = arqueo.del(turnoId, declarado, hoy);
        try {
            ArqueoDeTurno.Cuadre cuadre = arqueo.cuadrar(turnoId, hoy);
            return new EstadoDelCierreResource(
                    turnoId,
                    true,
                    ArqueoResource.de(elArqueo),
                    new ImporteActualizado(cuadre.conEvento(), cuadre.aLaFecha()),
                    new ImporteActualizado(cuadre.sinEvento(), cuadre.aLaFecha()),
                    List.of());
        } catch (ArqueoDeTurno.HayPagosSinEntregar noPuede) {
            List<PagoController.PagoResource> pendientes =
                    new ArrayList<>(noPuede.sinResolver().size());
            for (EventoDePago evento : noPuede.sinResolver()) {
                pendientes.add(PagoController.PagoResource.de(evento));
            }
            return new EstadoDelCierreResource(
                    turnoId,
                    false,
                    ArqueoResource.de(elArqueo),
                    null,
                    null,
                    List.copyOf(pendientes));
        }
    }

    /**
     * @param puedeCerrar si el turno se puede cerrar ahora mismo
     * @param loQueImpideCerrar los pagos sin entregar, uno a uno. Vacio si {@code puedeCerrar}
     */
    public record EstadoDelCierreResource(
            long turnoId,
            boolean puedeCerrar,
            ArqueoResource arqueo,
            @org.jspecify.annotations.Nullable ImporteActualizado cobradoConEvento,
            @org.jspecify.annotations.Nullable ImporteActualizado cobradoSinEvento,
            List<PagoController.PagoResource> loQueImpideCerrar) {}
}
