package kamayuk.caja.nucleo.dominio;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** El buzon de salida de la caja (ADR-0026 §3). */
public interface BuzonDeSalida {

    /**
     * Deja el evento en el buzon.
     *
     * <p>Se llama DENTRO de la transaccion del cobro, y por eso no recibe ni devuelve nada que
     * dependa de la red. Si esto hiciera una llamada HTTP, el buzon dejaria de ser un buzon.
     */
    EventoDePago encolar(EventoDePago evento);

    /** Lo que falta por entregar, en el orden en que se cobro. */
    List<EventoDePago> pendientes(int cuantos);

    /** Marca la entrega, con su hora. */
    void marcarEntregado(long id, Instant cuando);

    /** Cuenta un intento fallido, y mata el evento si se agotaron. */
    void marcarFallido(long id, String error, boolean seAgotaron);

    /** Alguien se hizo cargo por escrito. */
    void explicar(long id, String explicacion);

    Optional<EventoDePago> porId(long id);

    Optional<EventoDePago> porEventoId(UUID eventoId);

    /**
     * El evento de un recibo, del tipo que se pida.
     *
     * <p>Lo necesita el camino de idempotencia del cobro: cuando se reenvia el mismo intento se
     * devuelve el recibo de la primera vez, y con el <b>el mismo {@code pagoId}</b>. Devolver uno
     * nuevo dejaria al cliente creyendo que hubo dos pagos.
     */
    Optional<EventoDePago> delRecibo(long reciboId, TipoDeEventoDePago tipo);

    /**
     * Los eventos de un turno que impiden cerrarlo.
     *
     * <p>Vacio significa que el turno puede cerrar. No devuelve un booleano a proposito: quien no
     * puede cerrar tiene derecho a saber CUALES son, uno por uno (ADR-0026 §4), y un «no se puede»
     * a secas manda a buscar a ciegas.
     */
    List<EventoDePago> loQueImpideCerrar(long turnoId);

    /** Los muertos: dinero cobrado sin registrar. Es lo que dispara la alerta. */
    List<EventoDePago> muertos();

    /** El recuento del dia por sistema de destino, para la conciliacion. */
    List<RecuentoDelDia> recuentoDe(LocalDate dia);

    /**
     * Cuantos eventos de un dia hay en cada estado, y por cuanto dinero.
     *
     * @param sistema a quien iban
     * @param diaDelRecuento el dia contado. Viaja EN el recuento y no aparte, para que la pregunta
     *     al sistema de origen se haga con exactamente la misma fecha con la que se conto aqui:
     *     conciliar dos dias distintos cuadra a veces, y cuando cuadra no dice nada
     * @param registrados eventos de cobro
     * @param anulados eventos de anulacion
     * @param pendientes los que todavia estan en transito
     * @param muertos los que no se pudieron entregar
     * @param explicados los que alguien se hizo cargo de explicar
     * @param cobrado lo que la caja cobro ese dia para ese sistema
     * @param anulado lo que la caja devolvio ese dia
     */
    record RecuentoDelDia(
            SistemaDeOrigen sistema,
            java.time.LocalDate diaDelRecuento,
            int registrados,
            int anulados,
            int pendientes,
            int muertos,
            int explicados,
            kamayuk.caja.dominio.Dinero cobrado,
            kamayuk.caja.dominio.Dinero anulado) {

        public kamayuk.caja.dominio.Dinero neto() {
            return cobrado.menos(anulado);
        }

        public int entregados() {
            return registrados + anulados - pendientes - muertos - explicados;
        }
    }
}
