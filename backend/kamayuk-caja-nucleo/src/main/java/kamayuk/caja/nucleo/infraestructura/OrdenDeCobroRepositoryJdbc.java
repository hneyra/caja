package kamayuk.caja.nucleo.infraestructura;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import kamayuk.caja.compartido.Pagina;
import kamayuk.caja.compartido.Paginacion;
import kamayuk.caja.dominio.Dinero;
import kamayuk.caja.dominio.Observacion;
import kamayuk.caja.nucleo.dominio.EstadoDeOrden;
import kamayuk.caja.nucleo.dominio.OrdenDeCobro;
import kamayuk.caja.nucleo.dominio.OrdenDeCobroRepository;
import kamayuk.caja.nucleo.dominio.Pagador;
import kamayuk.caja.nucleo.dominio.SistemaDeOrigen;
import kamayuk.caja.persistencia.OrdenSeguro;
import kamayuk.caja.persistencia.RepositorioJdbc;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Las ordenes de cobro, contra PostgreSQL. */
@Repository
public class OrdenDeCobroRepositoryJdbc extends RepositorioJdbc implements OrdenDeCobroRepository {

    private static final String COLUMNAS =
            "id, sistema_origen, referencia_externa, concepto, detalle, importe,"
                    + " fecha_exigibilidad, actualizado_a, pagador_documento, pagador_nombre,"
                    + " pagador_externo_id, estado, recibo_id, creada_en, observacion";

    /**
     * Por que se admite ordenar.
     *
     * <p>Con desempate por {@code id}, que es la unica columna con orden total de esta tabla. Sin
     * el, dos ordenes exigibles el mismo dia pueden salir en distinto orden en dos peticiones y una
     * fila aparecer dos veces mientras otra no aparece nunca — el defecto que #548 midio en el
     * listado de recibos y que ahi paso VERDE dos veces por casualidad.
     */
    private static final OrdenSeguro ORDEN =
            OrdenSeguro.sobre("fecha_exigibilidad", "importe", "concepto").desempatandoPor("id");

    public OrdenDeCobroRepositoryJdbc(JdbcClient jdbc) {
        super(jdbc);
    }

    /**
     * El alta idempotente.
     *
     * <p>Es UN solo {@code INSERT ... ON CONFLICT DO NOTHING RETURNING}, y no un {@code SELECT}
     * seguido de un {@code INSERT}. La diferencia importa: con dos sentencias, dos peticiones
     * simultaneas del mismo sistema de origen leen las dos «no esta» y las dos insertan, y una
     * recibe {@code 23505} — o, si el indice unico no estuviera, entran las dos y el administrado
     * paga dos veces. Con una sola sentencia, la carrera la resuelve el motor.
     *
     * <p>El {@code RETURNING} vuelve vacio cuando no inserto, y entonces se lee la que ya estaba.
     * Ese segundo {@code SELECT} no es una carrera: la fila existe y no se va a ir.
     */
    @Override
    public Alta registrar(OrdenDeCobro orden) {
        Optional<Long> insertado =
                jdbc().sql(
                                "INSERT INTO orden_de_cobro (municipalidad_id, sistema_origen,"
                                        + " referencia_externa, concepto, detalle, importe,"
                                        + " fecha_exigibilidad, actualizado_a, pagador_documento,"
                                        + " pagador_nombre, pagador_externo_id, estado, creada_en,"
                                        + " observacion) VALUES ("
                                        + MUNICIPALIDAD_ACTUAL
                                        + ", :sistema, :referencia, :concepto, :detalle, :importe,"
                                        + " :exigible, :actualizado, :documento, :nombre,"
                                        + " :externo, 'PENDIENTE', :creada, :observacion)"
                                        + " ON CONFLICT ON CONSTRAINT orden_referencia_uq"
                                        + " DO NOTHING RETURNING id")
                        .param("sistema", orden.sistemaOrigen().nombre())
                        .param("referencia", orden.referenciaExterna())
                        .param("concepto", orden.concepto())
                        .param("detalle", orden.detalle())
                        .param("importe", orden.importe().valor())
                        .param("exigible", orden.fechaExigibilidad())
                        .param("actualizado", orden.actualizadoA())
                        .param("documento", orden.pagador().documento())
                        .param("nombre", orden.pagador().nombre())
                        .param("externo", orden.pagador().idExterno())
                        .param("creada", Timestamp.from(orden.creadaEn()))
                        .param("observacion", orden.observacion().texto())
                        .query(Long.class)
                        .optional();

        if (insertado.isPresent()) {
            return new Alta(
                    porId(insertado.get())
                            .orElseThrow(
                                    () ->
                                            new IllegalStateException(
                                                    "La orden se acaba de insertar y no se puede"
                                                            + " leer; con RLS activo eso solo puede"
                                                            + " pasar sin contexto de tenant")),
                    true);
        }
        return new Alta(
                porReferencia(orden.sistemaOrigen(), orden.referenciaExterna())
                        .orElseThrow(
                                () ->
                                        new IllegalStateException(
                                                "El alta no inserto y la orden no esta: la unica"
                                                        + " forma es que otra municipalidad la tenga,"
                                                        + " y entonces el contexto de tenant esta"
                                                        + " mal fijado")),
                false);
    }

    @Override
    public Optional<OrdenDeCobro> porId(long id) {
        return jdbc().sql("SELECT " + COLUMNAS + " FROM orden_de_cobro WHERE id = :id")
                .param("id", id)
                .query(OrdenDeCobroRepositoryJdbc::mapear)
                .optional();
    }

    @Override
    public Optional<OrdenDeCobro> porReferencia(SistemaDeOrigen sistema, String referencia) {
        return jdbc().sql(
                        "SELECT "
                                + COLUMNAS
                                + " FROM orden_de_cobro"
                                + " WHERE sistema_origen = :sistema"
                                + "   AND referencia_externa = :referencia")
                .param("sistema", sistema.nombre())
                .param("referencia", referencia)
                .query(OrdenDeCobroRepositoryJdbc::mapear)
                .optional();
    }

    /**
     * Las ordenes que se van a cobrar, bloqueadas.
     *
     * <p>{@code ORDER BY id} <b>dentro</b> del {@code FOR UPDATE}, y no es cosmetico: dos cajeros
     * marcando el mismo par de ordenes en distinto orden se bloquearian cruzados y uno de los dos
     * moriria por interbloqueo. Un fallo intermitente en la ventanilla es el peor sitio donde
     * tenerlo, y ordenar por una clave total lo hace imposible.
     */
    @Override
    public List<OrdenDeCobro> bloquear(List<Long> ids) {
        if (ids.isEmpty()) {
            return List.of();
        }
        List<OrdenDeCobro> encontradas =
                jdbc().sql(
                                "SELECT "
                                        + COLUMNAS
                                        + " FROM orden_de_cobro WHERE id IN (:ids)"
                                        + " ORDER BY id FOR UPDATE")
                        .param("ids", ids)
                        .query(OrdenDeCobroRepositoryJdbc::mapear)
                        .list();
        if (encontradas.size() != ids.size()) {
            for (Long id : ids) {
                boolean esta = encontradas.stream().anyMatch(o -> o.idGuardado() == id);
                if (!esta) {
                    throw new OrdenInexistente(id);
                }
            }
        }
        // Se devuelven en el orden en que las marco el cajero, que es el que sale impreso en el
        // recibo. El orden del bloqueo es cosa del motor y no tiene por que ser el del papel.
        List<OrdenDeCobro> enOrdenDelCajero = new ArrayList<>(ids.size());
        for (Long id : ids) {
            encontradas.stream()
                    .filter(o -> o.idGuardado() == id)
                    .findFirst()
                    .ifPresent(enOrdenDelCajero::add);
        }
        return List.copyOf(enOrdenDelCajero);
    }

    @Override
    public void marcarPagadas(List<Long> ids, long reciboId) {
        if (ids.isEmpty()) {
            return;
        }
        int filas =
                jdbc().sql(
                                "UPDATE orden_de_cobro SET estado = 'PAGADA', recibo_id = :recibo"
                                        + " WHERE id IN (:ids) AND estado = 'PENDIENTE'")
                        .param("recibo", reciboId)
                        .param("ids", ids)
                        .update();
        if (filas != ids.size()) {
            // Con el FOR UPDATE puesto esto no puede pasar; si pasa, lo que fallo es el bloqueo
            // y no la marca, y seguir dejaria un recibo cobrando una orden que sigue pendiente.
            throw new IllegalStateException(
                    "Se marcaron "
                            + filas
                            + " ordenes de "
                            + ids.size()
                            + " como pagadas por el recibo "
                            + reciboId
                            + ". Alguna dejo de estar PENDIENTE entre el bloqueo y la marca, que"
                            + " con FOR UPDATE no deberia poder pasar");
        }
    }

    @Override
    public void devolverAPendiente(long reciboId) {
        jdbc().sql(
                        "UPDATE orden_de_cobro SET estado = 'PENDIENTE', recibo_id = NULL"
                                + " WHERE recibo_id = :recibo AND estado = 'PAGADA'")
                .param("recibo", reciboId)
                .update();
    }

    @Override
    public List<OrdenDeCobro> delRecibo(long reciboId) {
        return jdbc().sql(
                        "SELECT "
                                + COLUMNAS
                                + " FROM orden_de_cobro WHERE recibo_id = :recibo ORDER BY id")
                .param("recibo", reciboId)
                .query(OrdenDeCobroRepositoryJdbc::mapear)
                .list();
    }

    @Override
    public Pagina<OrdenDeCobro> buscar(
            SistemaDeOrigen sistema, EstadoDeOrden estado, Paginacion paginacion) {
        String donde = " WHERE sistema_origen = :sistema AND estado = :estado";
        return paginar(
                "SELECT " + COLUMNAS + " FROM orden_de_cobro" + donde,
                "SELECT count(*) FROM orden_de_cobro" + donde,
                java.util.Map.of("sistema", sistema.nombre(), "estado", estado.name()),
                paginacion,
                ORDEN,
                OrdenDeCobroRepositoryJdbc::mapear);
    }

    private static OrdenDeCobro mapear(ResultSet fila, int numero) throws SQLException {
        Long externo = (Long) fila.getObject("pagador_externo_id");
        Long recibo = (Long) fila.getObject("recibo_id");
        return new OrdenDeCobro(
                fila.getLong("id"),
                SistemaDeOrigen.de(fila.getString("sistema_origen")),
                fila.getString("referencia_externa"),
                fila.getString("concepto"),
                fila.getString("detalle"),
                new Dinero(fila.getBigDecimal("importe")),
                fila.getObject("fecha_exigibilidad", java.time.LocalDate.class),
                fila.getObject("actualizado_a", java.time.LocalDate.class),
                new Pagador(
                        fila.getString("pagador_documento"),
                        fila.getString("pagador_nombre"),
                        externo),
                EstadoDeOrden.valueOf(fila.getString("estado")),
                recibo,
                fila.getTimestamp("creada_en").toInstant(),
                Observacion.de(fila.getString("observacion")));
    }
}
