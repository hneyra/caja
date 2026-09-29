package kamayuk.caja.nucleo.dominio;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** El buzon de salida de la caja (ADR-0026 §3). */
public interface BuzonDeSalida {

    /**
     * Deja el evento en el buzon.
     *
     * <p>Se llama DENTRO de la transaccion del cobro, y por eso no recibe ni devuelve nada que
     * dependa de la red. Si esto hiciera una llamada HTTP, el buzon dejaria de ser un buzon.
     */
    EventoDePago encolar(EventoDePago evento);

    /**
     * Lo que toca intentar a esa hora, en el orden en que se cobro.
     *
     * <p>Los PENDIENTES cuyo {@link EventoDePago#noAntesDe()} es nulo o ya paso (#131). Hasta #131
     * eran todos los PENDIENTES, en cada vuelta: sin espera propia, un pago moria en ocho vueltas.
     * Y dejar fuera a los que esperan evita tambien que cincuenta pagos de una caida larga ocupen
     * el lote entero de la vuelta y dejen detras a los que acaban de cobrarse.
     *
     * @param ahora el instante de la vuelta, del reloj inyectado (regla 6)
     */
    List<EventoDePago> pendientes(Instant ahora, int cuantos);

    /** Marca la entrega, con su hora. */
    void marcarEntregado(long id, Instant cuando);

    /**
     * Cuenta un intento fallido, y lo aplaza o lo mata.
     *
     * <p>Solo cuenta si el evento sigue PENDIENTE <b>y</b> sus intentos siguen siendo {@code
     * intentosLeidos}: dos publicadores que leyeron el mismo evento y fallaron los dos cuentan una
     * caida, no dos (#109). Si otro ya lo conto, no hace nada.
     *
     * <p>Si es el primer fallo de la racha, {@code cuando} pasa a ser su {@code fallandoDesde}; si
     * no, el que tenia se conserva (#131).
     *
     * @param intentosLeidos los intentos que tenia el evento cuando se leyo para entregarlo
     * @param cuando el instante del fallo
     * @param noAntesDe cuando se puede volver a intentar; <b>nulo si con este fallo muere</b>
     */
    void marcarFallido(
            long id, int intentosLeidos, String error, Instant cuando, @Nullable Instant noAntesDe);

    /** Alguien se hizo cargo por escrito. */
    void explicar(long id, String explicacion);

    /**
     * Un MUERTO vuelve a estar en camino (#131): PENDIENTE, sin espera y sin racha.
     *
     * <p>Conserva su {@code pagoId} —el receptor deduplica por el, asi que si el pago ya habia
     * llegado, el reintento lo encuentra— y sus {@code intentos}, que siguen contando las llamadas
     * de verdad. Lo que se vacia es {@code no_antes_de} y {@code fallando_desde}: el plazo empieza
     * de nuevo, porque quien lo pone en camino dice que la causa se arreglo.
     *
     * @throws IllegalStateException si el evento no esta MUERTO. Uno PENDIENTE ya esta en camino,
     *     uno ENTREGADO ya llego, y uno EXPLICADO lo resolvio alguien por escrito —quiza
     *     registrandolo a mano en el origen, con otro identificador—: entregarlo seria el segundo
     *     asiento del mismo dinero
     */
    void reencolar(long id);

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
