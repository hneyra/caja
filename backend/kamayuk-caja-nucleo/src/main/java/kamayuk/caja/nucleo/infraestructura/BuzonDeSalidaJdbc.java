package kamayuk.caja.nucleo.infraestructura;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
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
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** El buzon de salida, contra PostgreSQL. */
@Repository
public class BuzonDeSalidaJdbc extends RepositorioJdbc implements BuzonDeSalida {

    private static final String COLUMNAS =
            "id, evento_id, tipo, sistema_destino, recibo_id, turno_id, cuerpo::text AS cuerpo,"
                    + " estado, intentos, ultimo_error, creado_en, entregado_en, explicacion";

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
     * <p>{@code FOR UPDATE SKIP LOCKED}: si dos instancias del publicador corren a la vez —y en un
     * despliegue con dos replicas corren— la segunda <b>salta</b> lo que la primera tiene tomado en
     * vez de esperarla. Sin {@code SKIP LOCKED} las dos entregarian el mismo evento en cuanto la
     * primera soltara, y aunque el receptor deduplique por {@code pagoId}, el segundo intento
     * contaria como intento y acercaria el evento a MUERTO sin que hubiera pasado nada malo.
     */
    @Override
    public List<EventoDePago> pendientes(int cuantos) {
        return jdbc().sql(
                        "SELECT "
                                + COLUMNAS
                                + " FROM pago_evento WHERE estado = 'PENDIENTE'"
                                + " ORDER BY id LIMIT :cuantos FOR UPDATE SKIP LOCKED")
                .param("cuantos", cuantos)
                .query(BuzonDeSalidaJdbc::mapear)
                .list();
    }

    @Override
    public void marcarEntregado(long id, Instant cuando) {
        jdbc().sql(
                        "UPDATE pago_evento SET estado = 'ENTREGADO', entregado_en = :cuando,"
                                + " intentos = intentos + 1, ultimo_error = NULL"
                                + " WHERE id = :id AND estado = 'PENDIENTE'")
                .param("cuando", Timestamp.from(cuando))
                .param("id", id)
                .update();
    }

    @Override
    public void marcarFallido(long id, String error, boolean seAgotaron) {
        jdbc().sql(
                        "UPDATE pago_evento SET intentos = intentos + 1, ultimo_error = :error,"
                                + " estado = CASE WHEN :muerto THEN 'MUERTO' ELSE estado END"
                                + " WHERE id = :id AND estado = 'PENDIENTE'")
                .param("error", error)
                .param("muerto", seAgotaron)
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
                fila.getString("explicacion"));
    }
}
