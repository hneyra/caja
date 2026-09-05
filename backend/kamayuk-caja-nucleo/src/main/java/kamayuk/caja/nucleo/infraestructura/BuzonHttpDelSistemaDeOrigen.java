package kamayuk.caja.nucleo.infraestructura;

import kamayuk.caja.nucleo.dominio.BuzonDelSistemaDeOrigen;
import kamayuk.caja.nucleo.dominio.EventoDePago;
import org.springframework.stereotype.Component;

/**
 * Entrega un evento del buzon al sistema que emitio la orden (ADR-0026 §3).
 *
 * <p>Manda el cuerpo <b>tal cual se congelo</b>. No lo recompone, no le anade nada y no lo valida:
 * lo que se entrega tiene que ser exactamente lo que se escribio en la transaccion del cobro, o el
 * receptor podria recibir algo que nunca ocurrio.
 *
 * <p>La ruta es la misma para los dos tipos de evento —{@code POST {raiz}/pagos}— y el tipo va
 * dentro. Dos rutas obligarian a la caja a decidir cual usar mirando el evento, que es un {@code
 * switch} sobre un concepto ajeno; con una sola, el receptor decide, que es de quien es la
 * decision.
 */
@Component
public class BuzonHttpDelSistemaDeOrigen implements BuzonDelSistemaDeOrigen {

    /** La ruta del buzon de entrada del sistema de origen. */
    private static final String RUTA = "/pagos";

    private final ClienteHttpDelSistemaDeOrigen cliente;

    public BuzonHttpDelSistemaDeOrigen(ClienteHttpDelSistemaDeOrigen cliente) {
        this.cliente = cliente;
    }

    @Override
    public void entregar(EventoDePago evento) {
        cliente.publicar(evento.sistemaDestino(), RUTA, evento.cuerpo());
    }
}
