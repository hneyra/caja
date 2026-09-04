package kamayuk.caja.caja.infraestructura;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.LocalDate;
import kamayuk.caja.caja.dominio.AbonosAplicadosEnElOrigen;
import kamayuk.caja.caja.dominio.SistemaDeOrigen;
import kamayuk.caja.dominio.Dinero;
import org.springframework.stereotype.Component;

/**
 * Le pregunta al sistema de origen que aplico un dia (ADR-0026 §3, la conciliacion).
 *
 * <p>Es la <b>unica</b> llamada sincrona que la caja hace, y no esta en el camino del cobro. Si no
 * contesta, la conciliacion de ese dia no se puede cerrar — y eso es correcto: el precio de esta
 * separacion es que la conciliacion diaria pasa de buena practica a obligacion operativa.
 *
 * <p><b>No devuelve ceros cuando no contesta</b>: lanza. Un cero se leeria como «no aplicaron
 * nada», que es indistinguible de un dia en que de verdad no se cobro, y entonces la conciliacion
 * diria que cuadra. Es el criterio de #48 con la licencia que salia con «valor de obra 0,00»,
 * aplicado a la unica cifra que dice si falta dinero.
 */
@Component
public class AbonosAplicadosHttp implements AbonosAplicadosEnElOrigen {

    private final ClienteHttpDelSistemaDeOrigen cliente;

    public AbonosAplicadosHttp(ClienteHttpDelSistemaDeOrigen cliente) {
        this.cliente = cliente;
    }

    @Override
    public Aplicado delDia(SistemaDeOrigen sistema, LocalDate dia) {
        JsonNode cuerpo =
                cliente.preguntar(
                        sistema,
                        "/pagos/conciliacion?fecha=" + dia,
                        "preguntar que aplico «" + sistema + "» el " + dia);
        return new Aplicado(
                cuerpo.path("recibidos").asInt(),
                cuerpo.path("aplicados").asInt(),
                cuerpo.path("rechazados").asInt(),
                // Como cadena: los importes no viajan como numero de coma flotante (RNF-055), y
                // leerlo con asDouble() volveria a introducir el defecto por la puerta de atras.
                Dinero.de(cuerpo.path("importeAplicado").asText("0")));
    }
}
