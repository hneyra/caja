package kamayuk.caja.caja.infraestructura;

import java.util.List;
import kamayuk.caja.caja.aplicacion.AlertaDeCobrosSinImputar;
import kamayuk.caja.caja.dominio.EventoDePago;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * La alerta, escrita con nivel ERROR y con el nombre del responsable dentro.
 *
 * <h2>Un hueco declarado, y esta escrito aqui a proposito</h2>
 *
 * <p>Esto <b>no manda un correo ni un mensaje</b>: escribe en el registro. ADR-0026 §4 dice «no se
 * queda en un log», y esta clase es exactamente un log — asi que hay que decir en que se queda
 * corta y en que no.
 *
 * <p>Lo que <b>si</b> cumple, y no es poco: la linea sale con nivel ERROR, nombra al responsable y
 * su canal, y dice cuantos pagos y por que fila. La observabilidad del proyecto (INF-11) alerta
 * sobre {@code logback} con nivel ERROR y esa regla ya tiene receptor comprobado —«apagando
 * PostgreSQL sin receptor configurado, la regla llega a firing y el receptor de prueba recibe 0
 * peticiones; con receptor, la misma alerta activa se entrega»—. De modo que el aviso <b>llega</b>
 * si el ambiente esta configurado.
 *
 * <p>Lo que <b>no</b> cumple: nada aqui comprueba que llegue. La verificacion equivalente —
 * `observabilidad/verificar-alertas.sh`, que apaga la base y comprueba que la alerta se entrega—
 * vive en `infrastructure` y <b>no se ha extendido a esta regla</b>. Hasta que se extienda, «avisa
 * a una persona con nombre» esta construido y no esta medido, y eso es un hueco declarado del
 * entregable de P5D, no una promesa cumplida.
 */
@Component
public class AlertaEnElRegistro implements AlertaDeCobrosSinImputar {

    private static final Logger REGISTRO = LoggerFactory.getLogger(AlertaEnElRegistro.class);

    private final ResponsableDeLaConciliacion responsable;

    public AlertaEnElRegistro(ResponsableDeLaConciliacion responsable) {
        this.responsable = responsable;
    }

    @Override
    public void hayCobrosSinImputar(List<EventoDePago> muertos) {
        if (muertos.isEmpty()) {
            return;
        }
        StringBuilder detalle = new StringBuilder();
        for (EventoDePago evento : muertos) {
            detalle.append("\n  - pagoId ")
                    .append(evento.eventoId())
                    .append(", recibo ")
                    .append(evento.reciboId())
                    .append(", turno ")
                    .append(evento.turnoId())
                    .append(", destino ")
                    .append(evento.sistemaDestino())
                    .append(", ")
                    .append(evento.intentos())
                    .append(" intento(s), ultimo error: ")
                    .append(evento.ultimoError());
        }
        REGISTRO.error(
                "DINERO COBRADO SIN REGISTRAR: {} pago(s) que ningun sistema de origen ha podido"
                        + " imputar. Responsable de la conciliacion: {}. Ninguno de los turnos de estos"
                        + " recibos puede cerrar hasta que se entreguen o se expliquen uno por uno"
                        + " (ADR-0026 §4).{}",
                muertos.size(),
                responsable,
                detalle);
    }
}
