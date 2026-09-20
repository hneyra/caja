package kamayuk.caja.nucleo.infraestructura;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import kamayuk.caja.dominio.Observacion;
import kamayuk.caja.nucleo.dominio.EstadoDeTurno;
import kamayuk.caja.nucleo.dominio.TipoDeMovimientoDeTurno;
import kamayuk.caja.nucleo.dominio.TurnoConSuCaja;
import kamayuk.caja.nucleo.dominio.TurnoDeCaja;
import kamayuk.caja.nucleo.dominio.TurnoDeCajaRepository;
import kamayuk.caja.persistencia.RepositorioJdbc;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * Los turnos de caja contra PostgreSQL: la tabla {@code cierre_caja} (V3, V29).
 *
 * <p>Dos cosas que no se pueden separar de aqui:
 *
 * <ul>
 *   <li>{@link #abrir} es un {@code ON CONFLICT DO NOTHING} sobre {@code cierre_uq} seguido de la
 *       lectura del que quedo. Con un {@code SELECT} previo, dos aperturas simultaneas del mismo
 *       cajero lo pasarian las dos y la segunda reventaria la clave unica <b>abortando su
 *       transaccion entera</b> —y con ella la cobranza que iba dentro—.
 *   <li>{@link #abierto} es un {@code SELECT} llano. HASTA P5D llevaba {@code FOR UPDATE} y era
 *       primera barrera contra el doble cobro, y la que hace que la lectura de idempotencia que
 *       viene despues pueda ver lo que la peticion anterior escribio.
 * </ul>
 */
@Repository
public class TurnoDeCajaRepositoryJdbc extends RepositorioJdbc implements TurnoDeCajaRepository {

    /**
     * {@code estado} ya no esta: V32 la retiro (ver {@link EstadoDeTurno}). Se lee la fila desnuda
     * y el estado se resuelve aparte, con {@link #ultimoMovimientoDe}.
     */
    private static final String COLUMNAS = "id, caja_id, cajero, fecha";

    private static final String DEL_TURNO =
            " WHERE caja_id = :caja AND cajero = :cajero AND fecha = :fecha";

    public TurnoDeCajaRepositoryJdbc(JdbcClient jdbc) {
        super(jdbc);
    }

    @Override
    public TurnoDeCaja abrir(
            long cajaId,
            String cajero,
            LocalDate fecha,
            Instant apertura,
            Observacion observacion) {

        jdbc().sql(
                        "INSERT INTO cierre_caja"
                                + " (municipalidad_id, caja_id, cajero, fecha,"
                                + "  fecha_apertura, usuario_apertura, observacion)"
                                + " VALUES ("
                                + MUNICIPALIDAD_ACTUAL
                                + ", :caja, :cajero, :fecha, :apertura, :usuario, :observacion)"
                                + " ON CONFLICT (municipalidad_id, caja_id, cajero, fecha)"
                                + " DO NOTHING")
                .param("caja", cajaId)
                .param("cajero", cajero)
                .param("fecha", fecha)
                .param("apertura", Timestamp.from(apertura))
                .param("usuario", UsuarioDeLaSesion.actual())
                .param("observacion", observacion.texto())
                .update();

        return abierto(cajaId, cajero, fecha)
                .orElseThrow(
                        () ->
                                new IllegalStateException(
                                        "El turno de "
                                                + cajero
                                                + " no se inserto ni existia; con RLS activo eso"
                                                + " solo puede pasar sin contexto de tenant"));
    }

    @Override
    public Optional<TurnoDeCaja> abierto(long cajaId, String cajero, LocalDate fecha) {
        return jdbc().sql("SELECT " + COLUMNAS + " FROM cierre_caja" + DEL_TURNO)
                .param("caja", cajaId)
                .param("cajero", cajero)
                .param("fecha", fecha)
                .query(TurnoDeCajaRepositoryJdbc::mapearAbierto)
                .optional()
                .map(this::conSuEstado);
    }

    /**
     * Los turnos del cajero ese dia, con el rotulo de su ventanilla (#97).
     *
     * <p>El {@code JOIN} es <b>interno</b> y no izquierdo, al reves que el del catalogo de cajas:
     * {@code cierre_caja.caja_id} es {@code NOT NULL} y apunta a una caja que existe, asi que aqui
     * una fila sin ventanilla no seria un nulo legitimo que conservar sino una fila rota.
     *
     * <p>Se ordena por el codigo de la caja: {@code caja_codigo_uq} lo hace un orden total dentro
     * de la municipalidad, de modo que dos lecturas seguidas dibujan las mismas ventanillas en el
     * mismo sitio. Sin orden explicito, el cajero con turno en dos ventanillas las veria bailar.
     *
     * <p>Ningun {@code WHERE municipalidad_id}: filtra RLS en las dos tablas (regla 2).
     */
    @Override
    public List<TurnoConSuCaja> delCajeroEn(String cajero, LocalDate fecha) {
        List<TurnoConSuCaja> crudos =
                jdbc().sql(
                                "SELECT t.id, t.caja_id, t.cajero, t.fecha,"
                                        + " c.codigo AS caja_codigo, c.nombre AS caja_nombre"
                                        + " FROM cierre_caja t JOIN caja c ON c.id = t.caja_id"
                                        + " WHERE t.cajero = :cajero AND t.fecha = :fecha"
                                        + " ORDER BY c.codigo")
                        .param("cajero", cajero)
                        .param("fecha", fecha)
                        .query(TurnoDeCajaRepositoryJdbc::mapearConSuCaja)
                        .list();

        List<TurnoConSuCaja> resueltos = new ArrayList<>(crudos.size());
        for (TurnoConSuCaja uno : crudos) {
            resueltos.add(
                    new TurnoConSuCaja(
                            conSuEstado(uno.turno()), uno.cajaCodigo(), uno.cajaNombre()));
        }
        return List.copyOf(resueltos);
    }

    @Override
    public Optional<TurnoDeCaja> porId(long id) {
        return jdbc().sql("SELECT " + COLUMNAS + " FROM cierre_caja WHERE id = :id")
                .param("id", id)
                .query(TurnoDeCajaRepositoryJdbc::mapearAbierto)
                .optional()
                .map(this::conSuEstado);
    }

    /**
     * El estado del turno, derivado de {@code cierre_turno} (V32).
     *
     * <p>En una consulta aparte y no en un {@code JOIN} sobre la de {@link #bloquear}: mezclar un
     * {@code LEFT JOIN LATERAL} con {@code FOR UPDATE} obliga a acotar el bloqueo con {@code FOR
     * UPDATE OF}, y eso es exactamente la clase de SQL que alguien simplifica meses despues sin
     * darse cuenta de que estaba bloqueando la tabla equivocada. Son dos viajes dentro de la misma
     * transaccion, con la fila ya bloqueada: nadie puede cerrar el turno entre uno y otro.
     */
    private TurnoDeCaja conSuEstado(TurnoDeCaja turno) {
        return new TurnoDeCaja(
                turno.id(),
                turno.cajaId(),
                turno.cajero(),
                turno.fecha(),
                EstadoDeTurno.trasElUltimoMovimiento(ultimoMovimientoDe(turno.idGuardado())));
    }

    /** El tipo del ultimo movimiento del turno, o nulo si no tiene ninguno. */
    private @Nullable TipoDeMovimientoDeTurno ultimoMovimientoDe(long turnoId) {
        return jdbc().sql(
                        "SELECT tipo FROM cierre_turno WHERE turno_id = :turno"
                                + " ORDER BY id DESC LIMIT 1")
                .param("turno", turnoId)
                .query(String.class)
                .optional()
                .map(tipo -> TipoDeMovimientoDeTurno.valueOf(tipo.strip()))
                .orElse(null);
    }

    /**
     * La fila del {@code JOIN} con {@code caja}, tambien con el estado provisional.
     *
     * <p>Mismo motivo que {@link #mapearAbierto}: el estado lo dice {@code cierre_turno} y nadie lo
     * ha consultado todavia. {@link #delCajeroEn} lo sustituye antes de devolver nada.
     */
    private static TurnoConSuCaja mapearConSuCaja(ResultSet fila, int numeroDeFila)
            throws SQLException {
        return new TurnoConSuCaja(
                mapearAbierto(fila, numeroDeFila),
                fila.getString("caja_codigo"),
                fila.getString("caja_nombre"));
    }

    /**
     * La fila de {@code cierre_caja} tal cual, con el estado provisional {@code ABIERTO}.
     *
     * <p>Provisional porque la fila no lo dice: lo dice {@code cierre_turno}, y quien mapea todavia
     * no lo ha consultado. Nadie ve este objeto: {@link #conSuEstado} lo sustituye antes de salir
     * del repositorio.
     */
    private static TurnoDeCaja mapearAbierto(ResultSet fila, int numeroDeFila) throws SQLException {
        return new TurnoDeCaja(
                fila.getLong("id"),
                fila.getLong("caja_id"),
                fila.getString("cajero"),
                fila.getDate("fecha").toLocalDate(),
                EstadoDeTurno.ABIERTO);
    }
}
