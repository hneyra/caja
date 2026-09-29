package kamayuk.caja.seguridad.infraestructura;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import org.jspecify.annotations.Nullable;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * La unica clase de {@code caja} que se conecta como {@code kamayuk_owner}, y por eso conviene
 * mirarla con atencion.
 *
 * <h2>Por que no usa el pool de la aplicacion</h2>
 *
 * <p>Porque no puede: el pool es {@code kamayuk_app}, y {@code municipalidad} solo la escribe
 * {@code kamayuk_owner} —el baseline le da una politica {@code FOR ALL TO kamayuk_owner} y lo
 * explica: dar de alta una municipalidad es una operacion de implantacion—. La conexion se abre
 * para una sentencia y se cierra; no queda en ningun pool ni la puede tomar nadie mas.
 *
 * <h2>Las tres condiciones que la mantienen encerrada</h2>
 *
 * <ul>
 *   <li>{@code @Profile("batch")}: no existe en el proceso que atiende HTTP.
 *   <li>{@code @ConditionalOnProperty}: tampoco en una corrida batch normal. Hay que pedir la
 *       implantacion explicitamente.
 *   <li>Sus credenciales llegan por propiedades propias, distintas de las de la aplicacion, asi que
 *       un despliegue que no las ponga no obtiene un componente a medias: no lo obtiene.
 * </ul>
 *
 * <p>Es la gemela de la de {@code rentas}, y son dos porque son <b>dos bases</b>: cada sistema
 * tiene la suya (ADR-0032) y la fila de {@code municipalidad} de una no existe en la otra. Ese es
 * el hueco 3 que C-6 midio: sin esta clase, {@code caja} no tenia nada que escribiera esa fila — y
 * sin ella {@code SoloEnDemostracion} y toda politica RLS se quedan sin municipalidad que resolver.
 */
@Component
@Profile("batch")
@ConditionalOnProperty("kamayuk.implantacion.ubigeo")
public class RegistroDeMunicipalidadesJdbc {

    /** {@code unique_violation}: la clave primaria, cuando el id declarado ya es de otra. */
    private static final String VIOLACION_DE_UNICIDAD = "23505";

    private final String url;
    private final String usuario;
    private final String clave;

    public RegistroDeMunicipalidadesJdbc(
            @Value("${kamayuk.implantacion.url}") String url,
            @Value("${kamayuk.implantacion.owner-usuario:kamayuk_owner}") String usuario,
            @Value("${kamayuk.implantacion.owner-clave}") String clave) {
        this.url = url;
        this.usuario = usuario;
        this.clave = clave;
    }

    /**
     * Deja la fila con el {@code id} DECLARADO si falta, y comprueba que la que hay lo tiene.
     * Idempotente.
     *
     * <p><b>El id se escribe, no se pide a la secuencia</b> (#132, la mitad de {@code caja} de la
     * salida 1 de <a href="https://github.com/hneyra/infrastructure/issues/73">
     * infrastructure#73</a>, que {@code identidad} ya cerro en la suya). El contexto de cada
     * peticion sale del claim {@code municipalidad_id} del token —{@code TenantContextFilter}—, y
     * ese claim lo escribe Keycloak con el numero que el ambiente declara; con la secuencia, el de
     * la fila lo elegia PostgreSQL y nada comparaba los dos. Coincidian por casualidad: {@code stg}
     * y {@code prod} declaran 1 y una base recien creada tambien da 1. Con otro declarado, cada
     * cajero recibia 403 con la fila delante y {@code /seguridad/sesion/municipalidad} un 500; y
     * con una segunda municipalidad en la misma base el id quedaba sin relacion con ningun claim —
     * o igual al de OTRA—.
     *
     * <p><b>Por eso no devuelve ningun id.</b> Hasta #132 devolvia el que la base tenia, y la
     * implantacion fijaba con el su contexto y comprobaba con el su postcondicion: miraba la
     * municipalidad desde la fila, que es justo desde donde el desacuerdo no se ve. El numero con
     * el que se trabaja despues es el declarado, y lo unico que esta clase puede decir de el es si
     * la base lo tiene.
     *
     * <p><b>Y si la fila ya existe con OTRO id, esto FALLA en vez de seguir.</b> De ese id cuelgan,
     * por clave foranea y por RLS, todas las tablas de esta base: llevarlo al declarado es mover
     * cada fila de cajas, turnos, recibos, la copia de la autorizacion y el buzon, o sea una
     * migracion de datos y no un paso de despliegue. Y seguir sin moverlo deja el claim de cada
     * token apuntando a un inquilino sin una sola fila, sin ningun error, porque la base hace
     * exactamente lo que se le pide. Un ambiente que ya existe con otro id se arregla decidiendolo
     * (declarar el que tiene, o migrar los datos). Es el mismo contrato que el de {@code
     * identidad}.
     *
     * @throws IllegalStateException si la fila del ubigeo tiene otro id, si el declarado ya es el
     *     de otra municipalidad, o si la base no contesta
     */
    public void darDeAltaSiFalta(
            String ubigeo,
            long municipalidadId,
            String nombre,
            String tipo,
            boolean esDemostracion) {
        try (Connection conexion = DriverManager.getConnection(url, usuario, clave)) {
            insertarSiFalta(conexion, ubigeo, municipalidadId, nombre, tipo, esDemostracion);
            long enLaBase = identificador(conexion, ubigeo);
            if (enLaBase != municipalidadId) {
                throw new IllegalStateException(
                        "La municipalidad "
                                + ubigeo
                                + " ya esta dada de alta en caja con el id "
                                + enLaBase
                                + " y lo declarado es "
                                + municipalidadId
                                + ". NO se cambia de pasada: de ese id cuelgan, por clave foranea"
                                + " y por RLS, todas las tablas de esta base, y llevarlo al"
                                + " declarado es mover cada fila de cajas, turnos, recibos, la"
                                + " copia de la autorizacion y el buzon. Y seguir con la fila como"
                                + " esta deja el claim `municipalidad_id` de cada token apuntando a"
                                + " un inquilino sin una sola fila: 403 a cada cajero, sin un solo"
                                + " error. Se arregla decidiendolo: o se declara el id que la base"
                                + " tiene"
                                + " (kamayuk.implantacion.municipalidad-id), o se migran los datos"
                                + " al declarado (#132, infrastructure#73)");
            }
            avanzarLaSecuencia(conexion);
        } catch (SQLException noSePudo) {
            // Sin el ubigeo, el mensaje de PostgreSQL no dice de que municipalidad habla.
            throw new IllegalStateException(
                    "No se pudo dar de alta la municipalidad " + ubigeo, noSePudo);
        }
    }

    /**
     * {@code ON CONFLICT (ubigeo) DO NOTHING} y despues la consulta.
     *
     * <p>Es lo que hace el paso idempotente sin leer primero: leer y luego insertar deja una
     * ventana entre las dos cosas, y dos despliegues a la vez acabarian uno de ellos con un error
     * de clave duplicada. Asi los dos acaban con la misma fila.
     *
     * <p>El arbitro es el {@code ubigeo} y no el {@code id}, a proposito: si el id declarado ya lo
     * tiene OTRA municipalidad, el choque es con la clave primaria, el {@code DO NOTHING} no lo
     * cubre y la sentencia falla. Es el caso que la secuencia hacia posible sin que nadie lo viera
     * —dos municipalidades, y el id de una igual al claim de la otra—, y aqui se dice con los dos
     * ubigeos en vez de con el nombre de una restriccion.
     */
    private static void insertarSiFalta(
            Connection conexion,
            String ubigeo,
            long municipalidadId,
            String nombre,
            String tipo,
            boolean esDemostracion)
            throws SQLException {
        try (PreparedStatement alta =
                conexion.prepareStatement(
                        "INSERT INTO municipalidad (id, ubigeo, nombre, tipo, es_demostracion)"
                                + " OVERRIDING SYSTEM VALUE"
                                + " VALUES (?, ?, ?, ?, ?)"
                                + " ON CONFLICT (ubigeo) DO NOTHING")) {
            alta.setLong(1, municipalidadId);
            alta.setString(2, ubigeo);
            alta.setString(3, nombre);
            alta.setString(4, tipo);
            alta.setBoolean(5, esDemostracion);
            alta.executeUpdate();
        } catch (SQLException choque) {
            if (VIOLACION_DE_UNICIDAD.equals(choque.getSQLState())) {
                String otra = ubigeoDelId(conexion, municipalidadId);
                if (otra != null) {
                    throw new IllegalStateException(
                            "El id declarado para la municipalidad "
                                    + ubigeo
                                    + " es "
                                    + municipalidadId
                                    + ", y en esta base ese id ya es el de la municipalidad "
                                    + otra
                                    + ". Dos municipalidades con el mismo id son un solo"
                                    + " inquilino para el RLS: los cajeros de una leerian las"
                                    + " cajas y los recibos de la otra. Se arregla declarando"
                                    + " otro id (kamayuk.implantacion.municipalidad-id) (#132)",
                            choque);
                }
            }
            throw choque;
        }
    }

    /**
     * Deja la secuencia por encima del id mas alto que hay.
     *
     * <p>Hace falta porque insertar un id explicito NO la avanza: sin esto, un {@code INSERT}
     * posterior que si la use —una prueba, o una segunda municipalidad dada de alta por otro
     * camino— pediria un valor que ya esta ocupado y fallaria con una violacion de clave primaria
     * mucho despues y en otro sitio. Es el efecto colateral conocido de {@code OVERRIDING SYSTEM
     * VALUE}, y se paga aqui una vez en cada implantacion.
     */
    private static void avanzarLaSecuencia(Connection conexion) throws SQLException {
        try (PreparedStatement ajuste =
                conexion.prepareStatement(
                        "SELECT setval(pg_get_serial_sequence('municipalidad', 'id'),"
                                + " GREATEST((SELECT max(id) FROM municipalidad), 1))")) {
            ajuste.executeQuery().close();
        }
    }

    private static @Nullable String ubigeoDelId(Connection conexion, long municipalidadId)
            throws SQLException {
        try (PreparedStatement consulta =
                conexion.prepareStatement("SELECT ubigeo FROM municipalidad WHERE id = ?")) {
            consulta.setLong(1, municipalidadId);
            try (ResultSet fila = consulta.executeQuery()) {
                return fila.next() ? fila.getString("ubigeo").strip() : null;
            }
        }
    }

    private static long identificador(Connection conexion, String ubigeo) throws SQLException {
        try (PreparedStatement consulta =
                conexion.prepareStatement("SELECT id FROM municipalidad WHERE ubigeo = ?")) {
            consulta.setString(1, ubigeo);
            try (ResultSet fila = consulta.executeQuery()) {
                if (!fila.next()) {
                    throw new IllegalStateException(
                            "La municipalidad " + ubigeo + " no quedo dada de alta");
                }
                return fila.getLong("id");
            }
        }
    }
}
