package kamayuk.caja.seguridad.infraestructura;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.StringJoiner;
import kamayuk.caja.autorizacion.Privilegio;
import kamayuk.caja.compartido.Pagina;
import kamayuk.caja.compartido.Paginacion;
import kamayuk.caja.persistencia.OrdenSeguro;
import kamayuk.caja.persistencia.RepositorioJdbc;
import kamayuk.caja.seguridad.dominio.Acceso;
import kamayuk.caja.seguridad.dominio.Identidad;
import kamayuk.caja.seguridad.dominio.LecturaDeLaCopiaLocal;
import kamayuk.caja.seguridad.dominio.Modulo;
import kamayuk.caja.seguridad.dominio.Municipalidad;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * La lectura de la copia local que la interfaz de esta caja necesita para componer su sesion
 * (ADR-0042).
 *
 * <p>Ni un {@code INSERT} ni un {@code UPDATE}. Y <b>ningun metodo abre transaccion</b>, que es la
 * doctrina de {@link RepositorioJdbc} en este repositorio y la diferencia con la gemela de {@code
 * rentas}: alli {@code SeguridadController} llamaba a este SQL directamente y hubo que anotar el
 * repositorio (AC-5/AC-6 de {@code identidad}#4); aqui lo llaman cuatro casos de uso {@code
 * Transactional(readOnly = true)} y ningun controlador lo sostiene. Anotarlo tambien aqui dejaria
 * pasando en verde la prueba de frontera con la anotacion del caso de uso quitada — el modo de
 * fallo de #486, escondido detras de un segundo proxy.
 *
 * <h2>La matriz, y por que su SQL se parece al del comprobador y no al de {@code rentas}</h2>
 *
 * <p>{@link #permisosEfectivosDe} tiene que decir <b>exactamente</b> lo que {@link
 * ComprobadorDeAccesoJdbc#autoriza} diria para cada par acceso–privilegio. Si se separan, el arbol
 * ofrece lo que el guardia luego niega, o esconde lo que permite (ADR-0042 §Decision). Por eso cada
 * columna efectiva es el mismo {@code COALESCE} que el comprobador escribe, con sus tres ramas en
 * el mismo orden:
 *
 * <ol>
 *   <li><b>La excepcion del usuario</b> ({@code ux}): si hay fila de {@code permiso} para esa
 *       cuenta y ese acceso, su columna decide, otorgue o niegue. Las siete columnas son {@code NOT
 *       NULL}, asi que un {@code NULL} aqui solo puede significar «no hay excepcion».
 *   <li><b>Si no la hay, la union de sus grupos</b> ({@code gx}): {@code bool_or} sobre los grupos
 *       habilitados y vigentes a la fecha, con la pertenencia activa.
 *   <li><b>Y por encima de todo</b>, el {@code EXISTS} del usuario habilitado y vigente, que anula
 *       la matriz entera.
 * </ol>
 *
 * <p><b>La diferencia con {@code rentas}, medida y a proposito:</b> el comprobador de esta caja
 * exige {@code a.activo} <b>solo en la rama del grupo</b>; la excepcion del usuario sobre un acceso
 * desactivado sigue autorizando. La lectura de {@code rentas} filtra {@code a.activo} fuera, para
 * las dos ramas. Aqui se copia al comprobador de aqui y no a la lectura de alli: la que manda es la
 * que contesta 403, y la paridad la mide {@code LecturaDeLaCopiaLocalJdbcTest} par a par contra el
 * comprobador de produccion.
 *
 * <h2>{@code municipalidad} es la unica con {@code WHERE}</h2>
 *
 * <p>Las cinco tablas de la copia llevan politica de tenant y no se filtran a mano (regla 2).
 * {@code municipalidad} es el <b>registro</b> de tenants y su politica de lectura es {@code USING
 * (true)} (V1): sin el {@code WHERE id =} {@link RepositorioJdbc#MUNICIPALIDAD_ACTUAL}, la consulta
 * devuelve todas. Ese {@code WHERE} es el unico aislamiento de esa lectura, y usa la forma estricta
 * de {@code current_setting} para que sin contexto falle en vez de contestar por otra.
 */
@Repository
public class LecturaDeLaCopiaLocalJdbc extends RepositorioJdbc implements LecturaDeLaCopiaLocal {

    private static final OrdenSeguro ORDEN_MODULO =
            OrdenSeguro.sobre("codigo", "nombre", "orden", "id").desempatandoPor("id");

    private static final OrdenSeguro ORDEN_ACCESO =
            OrdenSeguro.sobre("codigo", "nombre", "tipo", "id").desempatandoPor("id");

    private static final String MUNICIPALIDAD_DE_LA_SESION =
            "SELECT id, ubigeo, nombre, tipo FROM municipalidad WHERE id = " + MUNICIPALIDAD_ACTUAL;

    public LecturaDeLaCopiaLocalJdbc(JdbcClient jdbc) {
        super(jdbc);
    }

    @Override
    public Pagina<Modulo> modulos(Paginacion paginacion) {
        return paginar(
                "SELECT id, codigo, nombre, orden, activo FROM modulo_sistema",
                "SELECT count(*) FROM modulo_sistema",
                Map.of(),
                paginacion,
                ORDEN_MODULO,
                LecturaDeLaCopiaLocalJdbc::mapearModulo);
    }

    @Override
    public Pagina<Acceso> accesos(Paginacion paginacion) {
        return paginar(
                "SELECT id, modulo_id, tipo, codigo, nombre, activo FROM acceso",
                "SELECT count(*) FROM acceso",
                Map.of(),
                paginacion,
                ORDEN_ACCESO,
                LecturaDeLaCopiaLocalJdbc::mapearAcceso);
    }

    @Override
    public Optional<Identidad> usuarioPorCuenta(String cuenta) {
        return jdbc().sql("SELECT id, cuenta, nombre FROM usuario WHERE cuenta = :cuenta")
                .param("cuenta", cuenta)
                .query(
                        (fila, numero) ->
                                new Identidad(
                                        fila.getLong("id"),
                                        fila.getString("cuenta"),
                                        fila.getString("nombre")))
                .optional();
    }

    @Override
    public Map<String, Set<Privilegio>> permisosEfectivosDe(String cuenta, LocalDate fecha) {
        StringJoiner efectivas = new StringJoiner(", ");
        StringJoiner deLaExcepcion = new StringJoiner(", ");
        StringJoiner deLosGrupos = new StringJoiner(", ");
        for (Privilegio privilegio : Privilegio.values()) {
            String columna = privilegio.columna();
            efectivas.add(columnaEfectiva(columna));
            deLaExcepcion.add("p." + columna);
            deLosGrupos.add("bool_or(p." + columna + ") AS " + columna);
        }

        String sql =
                "SELECT a.codigo, "
                        + efectivas
                        + " FROM acceso a"
                        // 1. La excepcion del usuario, si la hay. SIN `a.activo`: el comprobador
                        //    tampoco lo exige en esta rama.
                        + " LEFT JOIN LATERAL ("
                        + "   SELECT "
                        + deLaExcepcion
                        + "     FROM permiso p JOIN usuario u ON u.id = p.usuario_id"
                        + "    WHERE p.acceso_id = a.id AND u.cuenta = :cuenta"
                        + " ) ux ON true"
                        // 2. La union de los grupos vigentes, CON `a.activo`, como el comprobador.
                        + " LEFT JOIN LATERAL ("
                        + "   SELECT "
                        + deLosGrupos
                        + "     FROM usuario u"
                        + "     JOIN miembro m ON m.usuario_id = u.id AND m.activo"
                        + "     JOIN grupo g ON g.id = m.grupo_id"
                        + "                 AND g.habilitado"
                        + "                 AND (g.vigencia_desde IS NULL OR g.vigencia_desde <= :fecha)"
                        + "                 AND (g.vigencia_hasta IS NULL OR g.vigencia_hasta >= :fecha)"
                        + "     JOIN permiso p ON p.grupo_id = g.id"
                        + "    WHERE u.cuenta = :cuenta AND p.acceso_id = a.id AND a.activo"
                        + " ) gx ON true"
                        // 3. Y por encima de todo: el usuario habilitado y vigente.
                        + " WHERE EXISTS ("
                        + "   SELECT 1 FROM usuario u"
                        + "    WHERE u.cuenta = :cuenta"
                        + "      AND u.habilitado"
                        + "      AND (u.vigencia_desde IS NULL OR u.vigencia_desde <= :fecha)"
                        + "      AND (u.vigencia_hasta IS NULL OR u.vigencia_hasta >= :fecha))"
                        + " ORDER BY a.codigo";

        Map<String, Set<Privilegio>> matriz = new LinkedHashMap<>();
        RowCallbackHandler porFila =
                fila -> {
                    Set<Privilegio> otorgados = EnumSet.noneOf(Privilegio.class);
                    for (Privilegio privilegio : Privilegio.values()) {
                        if (fila.getBoolean(privilegio.columna())) {
                            otorgados.add(privilegio);
                        }
                    }
                    // Un acceso sin ningun privilegio no se publica: la cuenta sin nada recibe
                    // `{}`, y una lista vacia por codigo obligaria a la interfaz a distinguir
                    // «esta, sin nada» de «no esta», que para el guardia son lo mismo.
                    if (!otorgados.isEmpty()) {
                        matriz.put(fila.getString("codigo"), otorgados);
                    }
                };
        jdbc().sql(sql).param("cuenta", cuenta).param("fecha", fecha).query(porFila);
        return matriz;
    }

    @Override
    public Optional<Municipalidad> municipalidadDeLaSesion() {
        return jdbc().sql(MUNICIPALIDAD_DE_LA_SESION)
                .query(
                        (fila, numero) ->
                                new Municipalidad(
                                        fila.getLong("id"),
                                        // char(6): PostgreSQL rellena con espacios, y el ubigeo
                                        // se compara.
                                        fila.getString("ubigeo").strip(),
                                        fila.getString("nombre"),
                                        fila.getString("tipo")))
                .optional();
    }

    /**
     * La columna efectiva, con la forma del comprobador: {@code COALESCE(excepcion, grupos,
     * false)}.
     *
     * <p>{@code ux.<columna>} solo es {@code NULL} cuando no hay excepcion —la columna es {@code
     * NOT NULL}—, y {@code gx.<columna>} es {@code NULL} cuando ningun grupo vigente tiene fila
     * para ese acceso ({@code bool_or} sobre cero filas). Es la misma expresion, rama por rama, que
     * {@link ComprobadorDeAccesoJdbc#autoriza}.
     */
    private static String columnaEfectiva(String columna) {
        return "COALESCE(ux." + columna + ", gx." + columna + ", false) AS " + columna;
    }

    private static Modulo mapearModulo(ResultSet fila, int numero) throws SQLException {
        return new Modulo(
                fila.getLong("id"),
                fila.getString("codigo"),
                fila.getString("nombre"),
                fila.getInt("orden"),
                fila.getBoolean("activo"));
    }

    private static Acceso mapearAcceso(ResultSet fila, int numero) throws SQLException {
        return new Acceso(
                fila.getLong("id"),
                fila.getLong("modulo_id"),
                fila.getString("tipo"),
                fila.getString("codigo"),
                fila.getString("nombre"),
                fila.getBoolean("activo"));
    }
}
