package kamayuk.caja.seguridad.aplicacion;

import java.util.Locale;
import java.util.Set;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Lo que hay que saber para implantar la municipalidad en la base de {@code caja}.
 *
 * <p>Son propiedades y no argumentos de linea de comandos por lo mismo que en el migrador: la clave
 * de {@code kamayuk_owner} esta entre ellas, y un argumento queda en el historial del proceso y en
 * los registros del orquestador.
 *
 * <p><b>El prefijo es {@code kamayuk.implantacion}, y desde R-A/B lo es en los cuatro</b>. Hasta
 * entonces {@code rentas} leia {@code sgtm.implantacion} —era el monolito— y este nacio con el
 * nombre del producto; esa asimetria es la que dejo el Job de implantacion de {@code rentas}
 * arrancando, no haciendo nada y saliendo con codigo 0 desde C-14, porque su descriptor ponia las
 * variables con el prefijo de sus hermanos y {@code @ConditionalOnProperty} no registraba el
 * runner. Lo que impide ahora que un descuido apunte este Job con las variables de otro sistema no
 * es que el nombre difiera —no difiere—, sino la guarda de {@code infrastructure} que compara
 * <b>cada</b> descriptor con <b>su</b> Java, y que cada sistema tenga su propio Job, su propio
 * espacio de nombres y su propia base.
 *
 * <h2>Por que no la registra un {@code @ConfigurationPropertiesScan}</h2>
 *
 * <p>Porque un escaneo la registra en <b>todos</b> los perfiles, y este record valida en su
 * constructor compacto: sin las propiedades puestas, el bean falla y el contexto no arranca. Con el
 * escaneo, el proceso <b>web</b> —que no implanta nada y no tiene por que conocer la clave de
 * {@code kamayuk_owner}— moriria al arrancar. Por eso la declara {@code ImplantarMunicipalidad} con
 * {@code @EnableConfigurationProperties}: asi hereda sus dos condiciones.
 *
 * @param ubigeo los seis digitos que identifican a la municipalidad; es la clave por la que el
 *     procedimiento es idempotente
 * @param nombre nombre de la municipalidad
 * @param tipo {@code DISTRITAL} o {@code PROVINCIAL}, como exige el {@code CHECK} de la tabla
 * @param administrador cuenta del primer administrador. <b>Tiene que ser el mismo {@code
 *     preferred_username} que emite Keycloak</b>: es lo unico que une la fila con la identidad
 * @param nombreDelAdministrador su nombre, para las pantallas y la auditoria
 * @param esDemostracion si la instalacion es de demostracion. <b>Por omision {@code false}</b>, y
 *     ese es el valor correcto: de los dos errores posibles, el valor por omision tiene que ser el
 *     que no se pueda cometer callando
 * @param usuarioDelProceso con que nombre firma la auditoria lo que hace este proceso. No es una
 *     persona y no debe parecerlo
 */
@ConfigurationProperties("kamayuk.implantacion")
public record DatosDeImplantacion(
        String ubigeo,
        String nombre,
        String tipo,
        String administrador,
        String nombreDelAdministrador,
        boolean esDemostracion,
        String usuarioDelProceso) {

    private static final Set<String> TIPOS = Set.of("DISTRITAL", "PROVINCIAL");

    public DatosDeImplantacion {
        ubigeo = exigir(ubigeo, "kamayuk.implantacion.ubigeo");
        if (!ubigeo.matches("\\d{6}")) {
            throw new IllegalArgumentException(
                    "El ubigeo son seis digitos, y llego '" + ubigeo + "'");
        }
        nombre = exigir(nombre, "kamayuk.implantacion.nombre");
        tipo = exigir(tipo, "kamayuk.implantacion.tipo").toUpperCase(Locale.ROOT);
        if (!TIPOS.contains(tipo)) {
            throw new IllegalArgumentException(
                    "El tipo de municipalidad es DISTRITAL o PROVINCIAL, y llego '" + tipo + "'");
        }
        administrador = exigir(administrador, "kamayuk.implantacion.administrador");
        nombreDelAdministrador =
                exigir(nombreDelAdministrador, "kamayuk.implantacion.nombre-del-administrador");
        usuarioDelProceso =
                usuarioDelProceso == null || usuarioDelProceso.isBlank()
                        ? "implantacion"
                        : usuarioDelProceso;
    }

    private static String exigir(String valor, String propiedad) {
        if (valor == null || valor.isBlank()) {
            throw new IllegalArgumentException(
                    "Falta " + propiedad + ", que no tiene valor por omision");
        }
        return valor.strip();
    }
}
