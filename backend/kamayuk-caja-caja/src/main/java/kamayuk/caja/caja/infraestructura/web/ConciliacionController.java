package kamayuk.caja.caja.infraestructura.web;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import kamayuk.caja.autorizacion.Privilegio;
import kamayuk.caja.autorizacion.RequiereAcceso;
import kamayuk.caja.caja.aplicacion.ConciliacionDelDia;
import kamayuk.caja.caja.dominio.BuzonDeSalida;
import kamayuk.caja.dominio.Dinero;
import kamayuk.caja.web.Api;
import kamayuk.caja.web.CodigoDeError;
import kamayuk.caja.web.ImporteActualizado;
import kamayuk.caja.web.ProblemaDeNegocio;
import org.jspecify.annotations.Nullable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * La conciliacion del dia (ADR-0026 §3).
 *
 * <p><b>Es una operacion de negocio, no un proceso silencioso.</b> ADR-0026 lo dice con todas las
 * letras: con la caja y el libro en dos bases no hay forma de que un cobro sea atomico, y lo que
 * sustituye a la atomicidad es esta comparacion — con su pantalla, su responsable y su hora. Si no
 * cuadra, el dia no cierra.
 *
 * <p>La respuesta dice <b>por sistema de destino</b>, y no un total: sumar rentas con mercados
 * daria una cifra que no se puede conciliar contra nadie, y un dia que cuadrara «en total» podria
 * tener un sistema de mas y otro de menos.
 */
@RestController
@RequestMapping(Api.RAIZ + "/conciliacion")
public class ConciliacionController {

    private final ConciliacionDelDia conciliacion;

    public ConciliacionController(ConciliacionDelDia conciliacion) {
        this.conciliacion = conciliacion;
    }

    /**
     * @param fecha el dia de caja que se concilia. <b>Obligatorio</b>: sin el habria que elegir uno
     *     —«hoy»— y una conciliacion que se responde sola con la fecha del reloj no es reproducible
     *     al dia siguiente (regla 6)
     */
    @GetMapping
    @RequiereAcceso(acceso = "cierre_caja", privilegio = Privilegio.LECTURA)
    public ConciliacionResource del(@RequestParam String fecha) {
        LocalDate dia;
        try {
            dia = LocalDate.parse(fecha.strip());
        } catch (DateTimeParseException malEscrita) {
            throw new ProblemaDeNegocio(
                    CodigoDeError.VALIDACION, "El parametro 'fecha' no es una fecha ISO: " + fecha);
        }
        return ConciliacionResource.de(conciliacion.de(dia));
    }

    /**
     * @param cuadra si el dia entero cuadra. <b>Es la unica cifra que importa</b>, y es la que
     *     ADR-0026 exige que valga cero treinta dias seguidos antes de apagar el camino viejo
     */
    public record ConciliacionResource(String fecha, boolean cuadra, List<LineaResource> lineas) {

        static ConciliacionResource de(ConciliacionDelDia.Conciliacion conciliacion) {
            List<LineaResource> lineas = new ArrayList<>(conciliacion.lineas().size());
            for (ConciliacionDelDia.Linea linea : conciliacion.lineas()) {
                lineas.add(LineaResource.de(linea, conciliacion.dia()));
            }
            return new ConciliacionResource(
                    conciliacion.dia().toString(), conciliacion.cuadra(), List.copyOf(lineas));
        }
    }

    /**
     * Una linea: un sistema de destino.
     *
     * @param aplicadoEnElOrigen lo que el sistema de origen dice haber imputado; <b>nulo si no
     *     contesto</b>, y entonces {@code porQueNoSeSabe} dice por que. No se pone cero: un cero se
     *     leeria como «no aplicaron nada», que es indistinguible de un dia sin cobros, y la
     *     conciliacion diria que cuadra
     * @param diferencia lo cobrado menos lo aplicado; nulo por lo mismo
     */
    public record LineaResource(
            String sistema,
            int registrados,
            int anulados,
            int enTransito,
            int muertos,
            int explicados,
            ImporteActualizado cobrado,
            ImporteActualizado anulado,
            ImporteActualizado neto,
            @Nullable Integer recibidosEnElOrigen,
            @Nullable Integer aplicadosEnElOrigen,
            @Nullable Integer rechazadosEnElOrigen,
            @Nullable String importeAplicadoEnElOrigen,
            @Nullable String diferencia,
            @Nullable String porQueNoSeSabe,
            boolean cuadra) {

        static LineaResource de(ConciliacionDelDia.Linea linea, LocalDate dia) {
            BuzonDeSalida.RecuentoDelDia recuento = linea.recuento();
            Dinero diferencia = linea.diferencia();
            return new LineaResource(
                    linea.sistema().nombre(),
                    recuento.registrados(),
                    recuento.anulados(),
                    recuento.pendientes(),
                    recuento.muertos(),
                    recuento.explicados(),
                    new ImporteActualizado(recuento.cobrado(), dia),
                    new ImporteActualizado(recuento.anulado(), dia),
                    new ImporteActualizado(recuento.neto(), dia),
                    linea.aplicado() == null ? null : linea.aplicado().recibidos(),
                    linea.aplicado() == null ? null : linea.aplicado().aplicados(),
                    linea.aplicado() == null ? null : linea.aplicado().rechazados(),
                    linea.aplicado() == null
                            ? null
                            : linea.aplicado().importeAplicado().valor().toPlainString(),
                    diferencia == null ? null : diferencia.valor().toPlainString(),
                    linea.porQueNoSeSabe(),
                    linea.cuadra());
        }
    }
}
