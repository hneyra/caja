package kamayuk.caja.nucleo.dobles;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import kamayuk.caja.nucleo.dominio.BuzonDeSalida;
import kamayuk.caja.nucleo.dominio.EstadoDelEvento;
import kamayuk.caja.nucleo.dominio.EventoDePago;
import kamayuk.caja.nucleo.dominio.TipoDeEventoDePago;

/**
 * El buzon de salida, en memoria. Solo agrega y marca: igual que la tabla.
 *
 * <p>Reproduce las tres transiciones que el caso de uso da por sentadas —entregar, fallar y
 * explicar— <b>con sus guardas</b>: solo se marca entregado lo que sigue {@code PENDIENTE}, y solo
 * se explica lo que esta {@code MUERTO}. La segunda importa: sin ella, una prueba podria explicar
 * un evento que todavia esta en camino, el turno cerraria y el pago no llegaria nunca.
 *
 * <p>Lo que <b>no</b> puede demostrar es el {@code FOR UPDATE SKIP LOCKED} de {@link #pendientes}
 * —dos publicadores no se pisan porque aqui no hay dos— ni que la fila del buzon y la del recibo se
 * escriban en la misma transaccion, que es la razon entera de que el buzon exista. Las dos se
 * prueban contra PostgreSQL.
 *
 * <p>{@link #recuentoDe} <b>no agrega nada</b>: devuelve lo que se le declara, igual que {@code
 * RecaudacionEnMemoria} y por lo mismo. La cuenta real cruza {@code pago_evento} con {@code
 * cierre_caja} y con {@code recibo} —el importe sale del recibo, no del evento— y aqui no hay ni
 * turnos ni recibos que cruzar; recomponerla en Java compararia dos agregaciones distintas sin
 * probar ninguna.
 */
public final class BuzonEnMemoria implements BuzonDeSalida {

    private final Map<Long, EventoDePago> porId = new LinkedHashMap<>();
    private final List<RecuentoDelDia> recuentos = new ArrayList<>();
    private long siguienteId = 1;

    /** Todo lo que se encolo, en orden. */
    public List<EventoDePago> encolados() {
        return List.copyOf(porId.values());
    }

    /**
     * Los eventos de un tipo, en orden: lo que se mira al comprobar que se publico la anulacion.
     */
    public List<EventoDePago> deTipo(TipoDeEventoDePago tipo) {
        return porId.values().stream().filter(evento -> evento.tipo() == tipo).toList();
    }

    /** Declara lo que la conciliacion del dia va a leer. */
    public BuzonEnMemoria conRecuento(RecuentoDelDia recuento) {
        recuentos.add(recuento);
        return this;
    }

    @Override
    public EventoDePago encolar(EventoDePago evento) {
        long id = siguienteId++;
        EventoDePago guardado =
                new EventoDePago(
                        id,
                        evento.eventoId(),
                        evento.tipo(),
                        evento.sistemaDestino(),
                        evento.reciboId(),
                        evento.turnoId(),
                        evento.cuerpo(),
                        evento.estado(),
                        evento.intentos(),
                        evento.ultimoError(),
                        evento.creadoEn(),
                        evento.entregadoEn(),
                        evento.explicacion());
        porId.put(id, guardado);
        return guardado;
    }

    @Override
    public List<EventoDePago> pendientes(int cuantos) {
        return porId.values().stream()
                .filter(evento -> evento.estado() == EstadoDelEvento.PENDIENTE)
                .sorted(Comparator.comparing(EventoDePago::idGuardado))
                .limit(cuantos)
                .toList();
    }

    @Override
    public void marcarEntregado(long id, Instant cuando) {
        cambiar(
                id,
                EstadoDelEvento.PENDIENTE,
                evento ->
                        rehacer(
                                evento,
                                EstadoDelEvento.ENTREGADO,
                                evento.intentos() + 1,
                                null,
                                cuando,
                                evento.explicacion()));
    }

    @Override
    public void marcarFallido(long id, String error, boolean seAgotaron) {
        cambiar(
                id,
                EstadoDelEvento.PENDIENTE,
                evento ->
                        rehacer(
                                evento,
                                seAgotaron ? EstadoDelEvento.MUERTO : EstadoDelEvento.PENDIENTE,
                                evento.intentos() + 1,
                                error,
                                evento.entregadoEn(),
                                evento.explicacion()));
    }

    /**
     * Solo se explica lo MUERTO, y si no lo esta se lanza.
     *
     * <p>Es la unica guarda de este doble que rechaza en vez de callar, y reproduce a proposito lo
     * que {@code BuzonDeSalidaJdbc} hace cuando su {@code UPDATE} no toca ninguna fila: explicar un
     * evento que todavia se puede entregar lo sacaria de la cola, el turno cerraria en verde y el
     * pago no llegaria nunca.
     */
    @Override
    public void explicar(long id, String explicacion) {
        EventoDePago evento = porId.get(id);
        if (evento == null || evento.estado() != EstadoDelEvento.MUERTO) {
            throw new IllegalStateException(
                    "Solo se explica un evento MUERTO. El "
                            + id
                            + " no lo esta: o ya se entrego, o sigue en camino, o alguien ya lo"
                            + " explico");
        }
        porId.put(
                id,
                rehacer(
                        evento,
                        EstadoDelEvento.EXPLICADO,
                        evento.intentos(),
                        evento.ultimoError(),
                        evento.entregadoEn(),
                        explicacion));
    }

    @Override
    public Optional<EventoDePago> porId(long id) {
        return Optional.ofNullable(porId.get(id));
    }

    @Override
    public Optional<EventoDePago> porEventoId(UUID eventoId) {
        return porId.values().stream()
                .filter(evento -> evento.eventoId().equals(eventoId))
                .findFirst();
    }

    /** El ultimo de ese tipo, como el {@code ORDER BY id DESC LIMIT 1} de la consulta real. */
    @Override
    public Optional<EventoDePago> delRecibo(long reciboId, TipoDeEventoDePago tipo) {
        return porId.values().stream()
                .filter(evento -> evento.reciboId() == reciboId && evento.tipo() == tipo)
                .max(Comparator.comparing(EventoDePago::idGuardado));
    }

    @Override
    public List<EventoDePago> loQueImpideCerrar(long turnoId) {
        return porId.values().stream()
                .filter(evento -> evento.turnoId() == turnoId)
                .filter(evento -> !evento.permiteCerrarElTurno())
                .sorted(Comparator.comparing(EventoDePago::idGuardado))
                .toList();
    }

    @Override
    public List<EventoDePago> muertos() {
        return porId.values().stream()
                .filter(evento -> evento.estado() == EstadoDelEvento.MUERTO)
                .sorted(Comparator.comparing(EventoDePago::idGuardado))
                .toList();
    }

    @Override
    public List<RecuentoDelDia> recuentoDe(LocalDate dia) {
        return recuentos.stream().filter(r -> r.diaDelRecuento().equals(dia)).toList();
    }

    // ------------------------------------------------------------------

    /**
     * Aplica el cambio solo si el evento esta en el estado del que se sale, como el {@code UPDATE
     * ... WHERE estado}.
     */
    private void cambiar(
            long id, EstadoDelEvento desde, java.util.function.UnaryOperator<EventoDePago> cambio) {
        EventoDePago evento = porId.get(id);
        if (evento != null && evento.estado() == desde) {
            porId.put(id, cambio.apply(evento));
        }
    }

    private static EventoDePago rehacer(
            EventoDePago evento,
            EstadoDelEvento estado,
            int intentos,
            String ultimoError,
            Instant entregadoEn,
            String explicacion) {
        return new EventoDePago(
                evento.id(),
                evento.eventoId(),
                evento.tipo(),
                evento.sistemaDestino(),
                evento.reciboId(),
                evento.turnoId(),
                evento.cuerpo(),
                estado,
                intentos,
                ultimoError,
                // El orden del record es creadoEn y DESPUES entregadoEn, y los dos son
                // Instant: cambiarlos de sitio compila y deja el evento diciendo que se
                // entrego antes de cobrarse.
                evento.creadoEn(),
                entregadoEn,
                explicacion);
    }
}
