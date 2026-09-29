package kamayuk.caja.seguridad.infraestructura;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import kamayuk.caja.persistencia.RepositorioJdbc;
import kamayuk.caja.seguridad.dominio.PlazoDeAdopcion;
import org.jspecify.annotations.Nullable;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Lo que la implantacion necesita saber de la copia local para decir <b>por que</b> alguien no
 * puede entrar, y <b>a quien mas</b> preguntarle si puede (#138).
 *
 * <h2>No decide nada: decide el guardia</h2>
 *
 * <p>Quien contesta «puede» o «no puede» sigue siendo {@link ComprobadorDeAccesoJdbc}, el mismo de
 * cada peticion, con su precedencia y sus tres vigencias. Esta clase hace las dos cosas que el
 * guardia no hace, y ninguna de las dos cambia su respuesta:
 *
 * <ul>
 *   <li><b>Acotar a quien preguntar.</b> {@link #otrasCuentasConAlgunPermiso} devuelve una
 *       condicion <b>necesaria</b> del guardia —habilitada, y con una fila de {@code permiso}
 *       propia o de un grupo al que esta afiliada—, no suficiente: quita solo a quien el guardia
 *       negaria seguro. La copia tiene a <b>todas</b> las cuentas de la municipalidad, la mayoria
 *       sin nada en esta caja, y preguntarle al guardia los 49 pares por cada una seria una
 *       consulta por par y cuenta en el caso que falla.
 *   <li><b>Poner nombre a la negativa.</b> {@link #ficha} lee lo que el guardia mira —la cuenta,
 *       sus afiliaciones y sus excepciones— para que el mensaje distinga «esta inhabilitado» de «no
 *       esta en ningun grupo» de «una excepcion suya se lo niega». Solo se usa para escribir el
 *       mensaje, despues de que el guardia haya contestado que no.
 * </ul>
 *
 * <p>Solo lee: la regla 12 deja un unico escritor de estas tablas, {@code
 * AplicarUnEventoDeIdentidad}. Y existe donde existe la implantacion —perfil {@code batch} y la
 * misma propiedad—, como {@link RegistroDeMunicipalidadesJdbc}: el proceso {@code web} no la
 * necesita.
 *
 * <p>Ningun metodo recibe la municipalidad (regla 2): la pone el {@code SET LOCAL} que la
 * transaccion abre con el contexto que la implantacion fijo. Por eso los dos son {@code
 * Transactional(readOnly = true)}: sin transaccion, las politicas RLS con {@code FORCE} no
 * devuelven vacio, revientan.
 */
@Component
@Profile("batch")
@ConditionalOnProperty("kamayuk.implantacion.ubigeo")
public class CuentasDeLaCopiaJdbc extends RepositorioJdbc {

    public CuentasDeLaCopiaJdbc(JdbcClient jdbc) {
        super(jdbc);
    }

    /**
     * Lo que la copia dice de una cuenta, en los tres sitios donde el guardia puede negarle algo.
     *
     * @param habilitado la columna de {@code usuario}
     * @param vigenciaDesde desde cuando concede, o {@code null} si desde siempre
     * @param vigenciaHasta hasta cuando concede, o {@code null} si sin fin
     * @param adoptada si tiene sujeto de {@code identidad}, o esta dentro del {@link
     *     PlazoDeAdopcion plazo} para tenerlo (#125): la misma condicion que el guardia
     * @param gruposVigentes a cuantos grupos habilitados, vigentes y adoptados esta afiliada con la
     *     pertenencia activa; son los que el guardia une cuando no hay excepcion
     * @param opcionesConExcepcion los codigos sobre los que la cuenta tiene una fila de {@code
     *     permiso} propia, que en esa opcion <b>sustituye</b> a sus grupos, otorgue o niegue
     */
    public record FichaDeLaCuenta(
            boolean habilitado,
            @Nullable LocalDate vigenciaDesde,
            @Nullable LocalDate vigenciaHasta,
            boolean adoptada,
            int gruposVigentes,
            Set<String> opcionesConExcepcion) {

        /**
         * Si la propia fila de {@code usuario} deja conceder algo ese dia: la tercera condicion del
         * guardia, la que anula cualquier permiso. Solo elige que decir en el mensaje.
         */
        public boolean concedeEl(LocalDate dia) {
            return habilitado
                    && adoptada
                    && (vigenciaDesde == null || !vigenciaDesde.isAfter(dia))
                    && (vigenciaHasta == null || !vigenciaHasta.isBefore(dia));
        }
    }

    /**
     * Las cuentas, salvo {@code excepto}, a las que el guardia <b>podria</b> dejar abrir algo de
     * este sistema: habilitadas y con alguna fila de {@code permiso}, propia o de un grupo al que
     * estan afiliadas con la pertenencia activa. En {@code permiso} de esta base solo hay permisos
     * de ESTE sistema —los ajenos se acusan y no se aplican—, asi que «alguna fila» es «algo de
     * esta caja».
     *
     * <p>Es una condicion necesaria y nada mas: no mira vigencias, ni el sujeto, ni si el grupo
     * esta habilitado, ni si la columna concede. Eso lo decide el guardia, cuenta por cuenta.
     */
    @Transactional(readOnly = true)
    public List<String> otrasCuentasConAlgunPermiso(String excepto) {
        return jdbc().sql(
                        "SELECT u.cuenta FROM usuario u"
                                + " WHERE u.cuenta <> :excepto AND u.habilitado"
                                + "   AND (EXISTS (SELECT 1 FROM permiso p WHERE p.usuario_id = u.id)"
                                + "        OR EXISTS (SELECT 1 FROM miembro m"
                                + "                     JOIN permiso p ON p.grupo_id = m.grupo_id"
                                + "                    WHERE m.usuario_id = u.id AND m.activo))"
                                + " ORDER BY u.id")
                .param("excepto", excepto)
                .query((fila, numero) -> fila.getString(1))
                .list();
    }

    /**
     * La ficha de la cuenta el dia {@code fecha}, o vacio si la copia no la tiene.
     *
     * <p>Las condiciones del grupo son las del guardia, letra por letra —habilitado, adoptado o en
     * plazo, y vigente—, porque «no esta en ningun grupo» tiene que querer decir lo mismo que ve el
     * guardia: un grupo inhabilitado no le concede nada, y decir que «esta en el grupo» mandaria a
     * mirar donde no es.
     */
    @Transactional(readOnly = true)
    public Optional<FichaDeLaCuenta> ficha(String cuenta, LocalDate fecha) {
        Set<String> excepciones =
                new TreeSet<>(
                        jdbc().sql(
                                        "SELECT a.codigo FROM permiso p"
                                                + " JOIN acceso a ON a.id = p.acceso_id"
                                                + " JOIN usuario u ON u.id = p.usuario_id"
                                                + " WHERE u.cuenta = :cuenta")
                                .param("cuenta", cuenta)
                                .query((fila, numero) -> fila.getString(1))
                                .list());
        return jdbc().sql(
                        "SELECT u.habilitado, u.vigencia_desde, u.vigencia_hasta,"
                                + " COALESCE(u.identidad_sujeto_id IS NOT NULL"
                                + "          OR u.sin_sujeto_desde >= :corte, false) AS adoptada,"
                                + " (SELECT count(*) FROM miembro m"
                                + "    JOIN grupo g ON g.id = m.grupo_id"
                                + "                AND g.habilitado"
                                + "                AND (g.identidad_sujeto_id IS NOT NULL"
                                + "                     OR g.sin_sujeto_desde >= :corte)"
                                + "                AND (g.vigencia_desde IS NULL OR g.vigencia_desde <= :fecha)"
                                + "                AND (g.vigencia_hasta IS NULL OR g.vigencia_hasta >= :fecha)"
                                + "   WHERE m.usuario_id = u.id AND m.activo) AS grupos_vigentes"
                                + " FROM usuario u WHERE u.cuenta = :cuenta")
                .param("cuenta", cuenta)
                .param("fecha", fecha)
                .param("corte", PlazoDeAdopcion.primerInstanteQueConcede(fecha))
                .query(
                        (fila, numero) ->
                                new FichaDeLaCuenta(
                                        fila.getBoolean("habilitado"),
                                        fila.getObject("vigencia_desde", LocalDate.class),
                                        fila.getObject("vigencia_hasta", LocalDate.class),
                                        fila.getBoolean("adoptada"),
                                        fila.getInt("grupos_vigentes"),
                                        excepciones))
                .optional();
    }
}
