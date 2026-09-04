package kamayuk.caja.caja.infraestructura;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import kamayuk.caja.caja.aplicacion.CobrarOrdenes;
import kamayuk.caja.caja.dominio.OrdenDeCobro;
import kamayuk.caja.caja.dominio.Recibo;
import kamayuk.caja.dominio.Dinero;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Escribe el cuerpo de los eventos que la caja publica (ADR-0026 §3).
 *
 * <h2>Los importes viajan como CADENA</h2>
 *
 * <p>{@code "350.00"} y no {@code 350.0}. Es RNF-055 al otro lado de una frontera HTTP: un importe
 * que viaja como numero de coma flotante puede volver con otro valor, y el sitio donde eso pasa es
 * el camino del dinero. Lo mismo que {@code ConfiguracionDeJson} hace en las respuestas.
 *
 * <h2>El cuerpo se congela y no se recompone</h2>
 *
 * <p>Se escribe una vez, dentro de la transaccion del cobro, y se guarda en {@code
 * pago_evento.cuerpo}. El publicador lo entrega tal cual. Recomponerlo al entregar leeria las
 * ordenes <b>de hoy</b> —que pueden haber cambiado de estado— y lo que se entregaria no seria lo
 * que ocurrio. Es la misma decision que {@code recibo_movimiento.importe} (#34).
 *
 * <h2>Lo que el evento NO lleva</h2>
 *
 * <p>No lleva imputacion. Ni un orden, ni un reparto entre insoluto e interes, ni una obligacion
 * concreta. Lleva <b>la referencia externa de cada orden y su importe</b>, y el sistema de origen
 * decide que extingue con eso: es su regla, no la de la caja (ADR-0026 §2). Si este JSON llevara un
 * campo «insoluto», la regla del art. 31 del Codigo Tributario estaria escrita en dos sitios.
 */
@Component
public class ComponedorDeEventosJson implements CobrarOrdenes.ComponedorDeEventos {

    private final JsonMapper json;

    public ComponedorDeEventosJson(JsonMapper json) {
        this.json = json;
    }

    @Override
    public String pagoRegistrado(UUID pagoId, Recibo recibo, List<OrdenDeCobro> ordenes) {
        ObjectNode raiz = json.createObjectNode();
        raiz.put("pagoId", pagoId.toString());
        raiz.put("tipo", "PAGO_REGISTRADO");
        raiz.put("sistemaOrigen", ordenes.get(0).sistemaOrigen().nombre());
        raiz.set("recibo", reciboDe(recibo));
        raiz.set("pagador", pagadorDe(recibo));
        raiz.put("total", recibo.total().valor().toPlainString());
        raiz.put("actualizadoA", recibo.actualizadoA().toString());
        ArrayNode lineas = raiz.putArray("ordenes");
        for (OrdenDeCobro orden : ordenes) {
            ObjectNode linea = lineas.addObject();
            linea.put("ordenId", orden.idGuardado());
            linea.put("referenciaExterna", orden.referenciaExterna());
            linea.put("importe", orden.importe().valor().toPlainString());
            linea.put("actualizadoA", orden.actualizadoA().toString());
        }
        return escribir(raiz);
    }

    @Override
    public String pagoAnulado(
            UUID pagoId,
            UUID pagoOriginal,
            Recibo recibo,
            String motivo,
            LocalDate fecha,
            Dinero total) {
        ObjectNode raiz = json.createObjectNode();
        raiz.put("pagoId", pagoId.toString());
        raiz.put("tipo", "PAGO_ANULADO");
        // El pago que se deshace. Va por identificador y no por el numero del papel: el numero es
        // texto y el receptor tendria que analizarlo para encontrar sus asientos.
        raiz.put("pagoOriginalId", pagoOriginal.toString());
        raiz.set("recibo", reciboDe(recibo));
        raiz.put("motivo", motivo);
        raiz.put("fecha", fecha.toString());
        raiz.put("total", total.valor().toPlainString());
        return escribir(raiz);
    }

    private ObjectNode reciboDe(Recibo recibo) {
        ObjectNode nodo = json.createObjectNode();
        nodo.put("numero", recibo.numero().impreso());
        nodo.put("serie", recibo.numero().serie());
        nodo.put("fechaDePago", recibo.actualizadoA().toString());
        nodo.put("cajero", recibo.cajero());
        nodo.put("formaDePago", recibo.formaDePago().name());
        return nodo;
    }

    private ObjectNode pagadorDe(Recibo recibo) {
        ObjectNode nodo = json.createObjectNode();
        nodo.put("documento", recibo.pagador().documento());
        nodo.put("nombre", recibo.pagador().nombre());
        if (recibo.pagador().idExterno() == null) {
            nodo.putNull("idExterno");
        } else {
            nodo.put("idExterno", recibo.pagador().idExterno());
        }
        return nodo;
    }

    private String escribir(ObjectNode raiz) {
        try {
            return json.writeValueAsString(raiz);
        } catch (tools.jackson.core.JacksonException noSePuede) {
            // No puede pasar con un arbol que este componedor construye. Si pasara, la cobranza
            // entera tiene que caerse: un evento que no se puede escribir es un pago que nadie
            // va a imputar, y dejarlo pasar seria cobrar sin registrar.
            throw new IllegalStateException(
                    "No se pudo escribir el cuerpo del evento del pago", noSePuede);
        }
    }
}
