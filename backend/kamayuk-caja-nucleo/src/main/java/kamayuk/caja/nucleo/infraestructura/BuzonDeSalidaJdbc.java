package kamayuk.caja.nucleo.infraestructura;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import kamayuk.caja.dominio.Dinero;
import kamayuk.caja.nucleo.dominio.BuzonDeSalida;
import kamayuk.caja.nucleo.dominio.EstadoDelEvento;
import kamayuk.caja.nucleo.dominio.EventoDePago;
import kamayuk.caja.nucleo.dominio.SistemaDeOrigen;
import kamayuk.caja.nucleo.dominio.TipoDeEventoDePago;
import kamayuk.caja.persistencia.RepositorioJdbc;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** El buzon de salida, contra PostgreSQL. */
@Repository
public class BuzonDeSalidaJdbc extends RepositorioJdbc implements BuzonDeSalida {

    private static final String COLUMNAS =
            "id, evento_id, tipo, sistema_destino, recibo_id, turno_id, cuerpo::text AS cuerpo,"
                    + " estado, intentos, ultimo_error, creado_en, entregado_en, explicacion,"
                    + " no_antes_de, fallando_desde";

    public BuzonDeSalidaJdbc(JdbcClient jdbc) {
        super(jdbc);
    }

    @Override
    public EventoDePago encolar(EventoDePago evento) {
        long id =
                jdbc().sql(
                                "INSERT INTO pago_evento (municipalidad_id, evento_id, tipo,"
                                        + " sistema_destino, recibo_id, turno_id, cuerpo, estado,"
                                        + " intentos, creado_en) VALUES ("
                                        + MUNICIPALIDAD_ACTUAL
                                        + ", :evento, :tipo, :destino, :recibo, :turno,"
                                        + " CAST(:cuerpo AS jsonb), 'PENDIENTE', 0, :creado)"
                                        + " RETURNING id")
                        .param("evento", evento.eventoId())
                        .param("tipo", evento.tipo().name())
                        .param("destino", evento.sistemaDestino().nombre())
                        .param("recibo", evento.reciboId())
                        .param("turno", evento.turnoId())
                        .param("cuerpo", evento.cuerpo())
                        .param("creado", Timestamp.from(evento.creadoEn()))
                        .query(Long.class)
                        .single();
        return porId(id)
                .orElseThrow(
                        () ->
                                new IllegalStateException(
                                        "El evento se acaba de encolar y no se puede leer; con RLS"
                                                + " activo eso solo puede pasar sin contexto de"
                                                + " tenant"));
    }

    /**
     * Lo pendiente, en el orden en que se cobro.
     *
     * <p><b>Sin {@code FOR UPDATE SKIP LOCKED} desde #109, y no es un descuido.</b> Ese candado se
     * tomaba en la transaccion del recorrido y duraba la vuelta entera, con todos sus {@code POST}
     * dentro: no porque se quisiera, sino porque el {@code REQUIRES_NEW} que debia partir la vuelta
     * no se aplicaba (autoinvocacion). Con la vuelta partida de verdad, el candado ya no sirve en
     * este sitio: la lectura va en su propia transaccion, que se cierra antes de la primera llamada
     * al origen, y lo soltaria al instante; y si se quedara abierto, la marca de cada evento —en
     * otra transaccion— esperaria detras de el para siempre.
     *
     * <p>Lo que el candado impedia —dos publicadores contando dos veces el intento de un mismo
     * evento— lo impide ahora {@link #marcarFallido}, que solo cuenta si {@code intentos} sigue
     * valiendo lo que valia al leerlo. Lo que ya no impide nada es que dos publicadores
     * <b>entreguen</b> el mismo evento: el receptor deduplica por {@code pagoId}, que es la razon
     * de que lo genere la caja al cobrar, y el despliegue corre uno solo ({@code replicas: 1},
     * {@code maxSurge: 0}).
     *
     * <p><b>Y desde #131 solo lo que ya toca</b>: un PENDIENTE que fallo espera a su {@code
     * no_antes_de}. El instante lo pone Java con el reloj inyectado y no el {@code now()} de la
     * base, por la regla 6 y para que una prueba con un reloj fijo mida lo mismo que produccion. El
     * indice parcial {@code pago_evento_pendiente_ix} sigue sirviendo: el filtro nuevo se evalua
     * sobre las filas que el ya recorta.
     */
    @Override
    public List<EventoDePago> pendientes(Instant ahora, int cuantos) {
        return jdbc().sql(
                        "SELECT "
                                + COLUMNAS
                                + " FROM pago_evento WHERE estado = 'PENDIENTE'"
                                + " AND (no_antes_de IS NULL OR no_antes_de <= :ahora)"
                                + " ORDER BY id LIMIT :cuantos")
                .param("ahora", Timestamp.from(ahora))
                .param("cuantos", cuantos)
                .query(BuzonDeSalidaJdbc::mapear)
                .list();
    }

    @Override
    public void marcarEntregado(long id, Instant cuando) {
        jdbc().sql(
                        "UPDATE pago_evento SET estado = 'ENTREGADO', entregado_en = :cuando,"
                                + " intentos = intentos + 1, ultimo_error = NULL,"
                                + " no_antes_de = NULL, fallando_desde = NULL"
                                + " WHERE id = :id AND estado = 'PENDIENTE'")
                .param("cuando", Timestamp.from(cuando))
                .param("id", id)
                .update();
    }

    /**
     * Cuenta el intento y lo aplaza o lo mata, en un solo {@code UPDATE}.
     *
     * <p>{@code no_antes_de} se escribe nulo cuando muere: {@code pago_evento_no_antes_de_ck} no
     * deja que un MUERTO espere a un intento que no va a llegar. {@code fallando_desde} se conserva
     * si ya lo tenia —la racha sigue— y si no, empieza en este fallo (#131).
     */
    @Override
    public void marcarFallido(
            long id,
            int intentosLeidos,
            String error,
            Instant cuando,
            @Nullable Instant noAntesDe) {
        jdbc().sql(
                        "UPDATE pago_evento SET intentos = intentos + 1, ultimo_error = :error,"
                                + " fallando_desde = coalesce(fallando_desde, :cuando),"
                                + " no_antes_de = :noAntesDe,"
                                + " estado = CASE WHEN :muerto THEN 'MUERTO' ELSE estado END"
                                + " WHERE id = :id AND estado = 'PENDIENTE'"
                                + " AND intentos = :leidos")
                .param("error", error)
                .param("cuando", Timestamp.from(cuando))
                // Con su tipo: un nulo sin tipo obliga al driver a preguntarselo a la base.
                .param(
                        "noAntesDe",
                        noAntesDe == null ? null : Timestamp.from(noAntesDe),
                        Types.TIMESTAMP)
                .param("muerto", noAntesDe == null)
                .param("leidos", intentosLeidos)
                .param("id", id)
                .update();
    }

    @Override
    public void explicar(long id, String explicacion) {
        int filas =
                jdbc().sql(
                                "UPDATE pago_evento SET estado = 'EXPLICADO',"
                                        + " explicacion = :explicacion"
                                        + " WHERE id = :id AND estado = 'MUERTO'")
                        .param("explicacion", explicacion)
                        .param("id", id)
                        .update();
        if (filas == 0) {
            // Un evento que todavia se puede entregar no se explica: explicarlo lo sacaria de la
            // cola y el pago no llegaria nunca, con el turno cerrado y todo en orden.
            throw new IllegalStateException(
                    "Solo se explica un evento MUERTO. El "
                            + id
                            + " no lo esta: o ya se entrego, o sigue en camino, o alguien ya lo"
                            + " explico");
        }
    }

    /**
     * MUERTO a PENDIENTE, sin espera y sin racha (#131).
     *
     * <p>Es el unico {@code UPDATE} que devuelve una fila a la cola, y solo desde MUERTO: la guarda
     * va en el {@code WHERE} y no en una lectura previa, para que dos personas que lo pongan en
     * camino a la vez no puedan pasar las dos.
     */
    @Override
    public void reencolar(long id) {
        int filas =
                jdbc().sql(
                                "UPDATE pago_evento SET estado = 'PENDIENTE',"
                                        + " no_antes_de = NULL, fallando_desde = NULL"
                                        + " WHERE id = :id AND estado = 'MUERTO'")
                        .param("id", id)
                        .update();
        if (filas == 0) {
            throw new IllegalStateException(
                    "Solo se vuelve a poner en camino un evento MUERTO. El "
                            + id
                            + " no lo esta: o sigue en camino, o ya se entrego, o alguien lo"
                            + " explico por escrito —y entonces entregarlo podria asentar dos"
                            + " veces el mismo dinero—");
        }
    }

    @Override
    public Optional<EventoDePago> porId(long id) {
        return jdbc().sql("SELECT " + COLUMNAS + " FROM pago_evento WHERE id = :id")
                .param("id", id)
                .query(BuzonDeSalidaJdbc::mapear)
                .optional();
    }

    @Override
    public Optional<EventoDePago> porEventoId(UUID eventoId) {
        return jdbc().sql("SELECT " + COLUMNAS + " FROM pago_evento WHERE evento_id = :evento")
                .param("evento", eventoId)
                .query(BuzonDeSalidaJdbc::mapear)
                .optional();
    }

    @Override
    public Optional<EventoDePago> delRecibo(long reciboId, TipoDeEventoDePago tipo) {
        return jdbc().sql(
                        "SELECT "
                                + COLUMNAS
                                + " FROM pago_evento WHERE recibo_id = :recibo AND tipo = :tipo"
                                + " ORDER BY id DESC LIMIT 1")
                .param("recibo", reciboId)
                .param("tipo", tipo.name())
                .query(BuzonDeSalidaJdbc::mapear)
                .optional();
    }

    @Override
    public List<EventoDePago> loQueImpideCerrar(long turnoId) {
        return jdbc().sql(
                        "SELECT "
                                + COLUMNAS
                                + " FROM pago_evento"
                                + " WHERE turno_id = :turno AND estado IN ('PENDIENTE','MUERTO')"
                                + " ORDER BY id")
                .param("turno", turnoId)
                .query(BuzonDeSalidaJdbc::mapear)
                .list();
    }

    @Override
    public List<EventoDePago> muertos() {
        return jdbc().sql(
                        "SELECT "
                                + COLUMNAS
                                + " FROM pago_evento WHERE estado = 'MUERTO'"
                                + " ORDER BY id")
                .query(BuzonDeSalidaJdbc::mapear)
                .list();
    }

    /**
     * El recuento del dia por sistema de destino.
     *
     * <p>El dia sale del <b>turno</b> ({@code cierre_caja.fecha}) y no de {@code
     * pago_evento.creado_en}: el instante en que se encolo el evento es tecnico —depende de la zona
     * horaria del proceso y de si el cobro se hizo a las 23:58— y el dia de caja es lo que se
     * arquea, lo que se cierra y lo que el cajero cuenta en el cajon. Conciliar por el instante
     * dejaria cobros de un turno repartidos en dos dias de conciliacion.
     *
     * <p>Lo cobrado y lo anulado salen del <b>recibo</b> y de {@code recibo_movimiento}, no de la
     * suma de los eventos: un evento no lleva importe propio a proposito —lleva su cuerpo—, y sumar
     * cifras de un JSON seria componer dinero fuera del sitio donde vive (RNF-083).
     */
    @Override
    public List<RecuentoDelDia> recuentoDe(LocalDate dia) {
        return jdbc().sql(
                        """
                        SELECT e.sistema_destino,
                               count(*) FILTER (WHERE e.tipo = 'PAGO_REGISTRADO') AS registrados,
                               count(*) FILTER (WHERE e.tipo = 'PAGO_ANULADO')    AS anulados,
                               count(*) FILTER (WHERE e.estado = 'PENDIENTE')     AS pendientes,
                               count(*) FILTER (WHERE e.estado = 'MUERTO')        AS muertos,
                               count(*) FILTER (WHERE e.estado = 'EXPLICADO')     AS explicados,
                               coalesce(sum(r.total) FILTER
                                   (WHERE e.tipo = 'PAGO_REGISTRADO'), 0)         AS cobrado,
                               coalesce(sum(r.total) FILTER
                                   (WHERE e.tipo = 'PAGO_ANULADO'), 0)            AS anulado
                          FROM pago_evento e
                          JOIN cierre_caja t ON t.id = e.turno_id
                          JOIN recibo      r ON r.id = e.recibo_id
                         WHERE t.fecha = :dia
                         GROUP BY e.sistema_destino
                         ORDER BY e.sistema_destino
                        """)
                .param("dia", dia)
                .query(
                        (fila, numero) ->
                                new RecuentoDelDia(
                                        SistemaDeOrigen.de(fila.getString("sistema_destino")),
                                        dia,
                                        fila.getInt("registrados"),
                                        fila.getInt("anulados"),
                                        fila.getInt("pendientes"),
                                        fila.getInt("muertos"),
                                        fila.getInt("explicados"),
                                        new Dinero(fila.getBigDecimal("cobrado")),
                                        new Dinero(fila.getBigDecimal("anulado"))))
                .list();
    }

    private static EventoDePago mapear(ResultSet fila, int numero) throws SQLException {
        Timestamp entregado = fila.getTimestamp("entregado_en");
        Timestamp noAntesDe = fila.getTimestamp("no_antes_de");
        Timestamp fallandoDesde = fila.getTimestamp("fallando_desde");
        return new EventoDePago(
                fila.getLong("id"),
                UUID.fromString(fila.getString("evento_id")),
                TipoDeEventoDePago.valueOf(fila.getString("tipo")),
                SistemaDeOrigen.de(fila.getString("sistema_destino")),
                fila.getLong("recibo_id"),
                fila.getLong("turno_id"),
                fila.getString("cuerpo"),
                EstadoDelEvento.valueOf(fila.getString("estado")),
                fila.getInt("intentos"),
                fila.getString("ultimo_error"),
                fila.getTimestamp("creado_en").toInstant(),
                entregado == null ? null : entregado.toInstant(),
                fila.getString("explicacion"),
                noAntesDe == null ? null : noAntesDe.toInstant(),
                fallandoDesde == null ? null : fallandoDesde.toInstant());
    }
}
