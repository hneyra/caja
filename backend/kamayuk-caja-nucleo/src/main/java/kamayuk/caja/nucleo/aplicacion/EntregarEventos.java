package kamayuk.caja.nucleo.aplicacion;

import java.time.Clock;
import java.util.List;
import java.util.Objects;
import kamayuk.caja.nucleo.dominio.BuzonDeSalida;
import kamayuk.caja.nucleo.dominio.BuzonDelSistemaDeOrigen;
import kamayuk.caja.nucleo.dominio.EventoDePago;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * El publicador del buzon de salida (ADR-0026 §3).
 *
 * <h2>Una transaccion por evento, y a proposito</h2>
 *
 * <p>No hay una transaccion que envuelva la corrida entera. Envolverla es el defecto que #328, #54
 * y #430 midieron tres veces: la fila que se rechaza marca la transaccion como <i>rollback-only</i>
 * y se lleva por delante <b>el informe y las que ya iban bien</b> — y aqui «las que ya iban bien»
 * son pagos entregados que volverian a entregarse.
 *
 * <p>Cada evento se marca en su propia transaccion ({@link Propagation#REQUIRES_NEW}), y por eso
 * este metodo <b>no</b> lleva {@code @Transactional}: si lo llevara, la de fuera se propagaria y la
 * separacion no existiria.
 *
 * <h2>Que pasa cuando algo falla</h2>
 *
 * <table>
 *   <tr><th>Que paso</th><th>Que se hace</th><th>Por que</th></tr>
 *   <tr><td>El origen no contesta</td><td>se cuenta el intento y se reintenta</td>
 *       <td>Se arregla levantando un despliegue, y va a arreglarse solo</td></tr>
 *   <tr><td>El origen rechaza</td><td>se mata en el acto</td>
 *       <td>Reintentar un rechazo gasta los intentos hasta morir por un motivo que no es el
 *           suyo</td></tr>
 *   <tr><td>Se agotaron los intentos</td><td>MUERTO, y alerta a una persona con nombre</td>
 *       <td>Es dinero cobrado sin registrar. No se queda en un registro (ADR-0026 §4)</td></tr>
 * </table>
 */
@Service
public class EntregarEventos {

    /**
     * Cuantos se entregan por vuelta. Un lote y no la tabla entera: una vuelta tiene que acabar.
     */
    private static final int POR_VUELTA = 50;

    private final BuzonDeSalida buzon;
    private final BuzonDelSistemaDeOrigen destino;
    private final AlertaDeCobrosSinImputar alerta;
    private final int intentosMaximos;
    private final Clock reloj;

    public EntregarEventos(
            BuzonDeSalida buzon,
            BuzonDelSistemaDeOrigen destino,
            AlertaDeCobrosSinImputar alerta,
            @Value("${kamayuk.caja.entrega.intentos:8}") int intentosMaximos,
            Clock reloj) {
        this.buzon = buzon;
        this.destino = destino;
        this.alerta = alerta;
        this.intentosMaximos = intentosMaximos;
        this.reloj = reloj;
        if (intentosMaximos < 1) {
            throw new IllegalArgumentException(
                    "Con cero intentos todo pago nace muerto: " + intentosMaximos);
        }
    }

    /**
     * Entrega lo que haya pendiente.
     *
     * @return cuantos se entregaron y cuantos murieron en esta vuelta
     */
    public Vuelta entregarPendientes() {
        List<EventoDePago> pendientes = buzon.pendientes(POR_VUELTA);
        int entregados = 0;
        int muertos = 0;
        for (EventoDePago evento : pendientes) {
            Resultado resultado = entregarUno(evento);
            if (resultado == Resultado.ENTREGADO) {
                entregados++;
            } else if (resultado == Resultado.MUERTO) {
                muertos++;
            }
        }
        if (muertos > 0) {
            alerta.hayCobrosSinImputar(buzon.muertos());
        }
        return new Vuelta(pendientes.size(), entregados, muertos);
    }

    /**
     * Un evento, en su propia transaccion.
     *
     * <p>Es {@code public} para que el proxy transaccional de Spring lo intercepte: llamado desde
     * dentro de la clase por auto-invocacion, la anotacion no se aplicaria y la separacion de
     * transacciones seria una promesa del javadoc. Es la leccion que #536 midio con el bucle de la
     * carga cartografica y #430 con {@code ImportarCajas}.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Resultado entregarUno(EventoDePago evento) {
        Objects.requireNonNull(evento, "No se entrega un evento nulo");
        long id = evento.idGuardado();
        try {
            destino.entregar(evento);
            buzon.marcarEntregado(id, reloj.instant());
            return Resultado.ENTREGADO;
        } catch (BuzonDelSistemaDeOrigen.Rechazado rechazado) {
            // No se reintenta: el motivo no va a cambiar solo.
            buzon.marcarFallido(id, recortar(rechazado.getMessage()), true);
            return Resultado.MUERTO;
        } catch (BuzonDelSistemaDeOrigen.NoContesta noContesta) {
            boolean seAgotaron = evento.intentos() + 1 >= intentosMaximos;
            buzon.marcarFallido(id, recortar(noContesta.getMessage()), seAgotaron);
            return seAgotaron ? Resultado.MUERTO : Resultado.REINTENTABLE;
        }
    }

    /** El largo de {@code pago_evento.ultimo_error}. */
    private static String recortar(@org.jspecify.annotations.Nullable String mensaje) {
        String limpio = mensaje == null ? "sin mensaje" : mensaje;
        return limpio.length() <= 400 ? limpio : limpio.substring(0, 400);
    }

    /** Que paso con un evento. */
    public enum Resultado {
        ENTREGADO,
        REINTENTABLE,
        MUERTO
    }

    /** Lo que hizo una vuelta del publicador. */
    public record Vuelta(int leidos, int entregados, int muertos) {}
}
