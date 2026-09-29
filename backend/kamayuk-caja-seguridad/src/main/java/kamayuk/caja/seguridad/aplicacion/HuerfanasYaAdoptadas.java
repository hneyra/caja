package kamayuk.caja.seguridad.aplicacion;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.StringJoiner;
import kamayuk.caja.autorizacion.Privilegio;
import kamayuk.caja.persistencia.RepositorioJdbc;
import kamayuk.caja.seguridad.HuerfanaYaAdoptada;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Las filas de {@code usuario} y {@code grupo} que un sujeto NUEVO ya adopto sobre la de otro, y
 * que por eso le conceden lo que era de aquel (#137). <b>Solo lee.</b>
 *
 * <h2>De donde salen, y por que nadie las veia</h2>
 *
 * <p>Hubo dos ventanas en las que un alta de {@code identidad} fue a parar a una fila que ya era de
 * otro sujeto:
 *
 * <ol>
 *   <li><b>Antes de V5</b>, el aplicador de la etapa 4 ({@code 5eacae1}) escribia un alta con
 *       {@code ON CONFLICT (municipalidad_id, cuenta) DO UPDATE}. «jperez» (sujeto 100) renombrado
 *       en {@code identidad} dejaba aqui su fila vieja con la clave «jperez» —el defecto de #111—,
 *       y el alta de un «jperez» nuevo (sujeto 200) se fundia en ella con los miembros y los
 *       permisos del 100 dentro. Ese alta quedo en {@code identidad_evento_aplicado} y no en {@code
 *       identidad_evento_muerto}, asi que el primer evento del 200 despues de V5 le estampa su id
 *       —lo decide {@code exigirQueSuAltaNoSeHayaApartado}, que solo niega el alta APARTADA—. Esta
 *       ventana <b>no esta cerrada</b>: la adopcion ocurre el dia que el 200 recibe su primer
 *       evento, que puede ser manana.
 *   <li><b>Entre #111 y #125</b> (su ronda 1, #130), un alta todavia adoptaba por la clave una fila
 *       sin sujeto.
 * </ol>
 *
 * <p>En los dos casos la fila ya LLEVA sujeto: {@code filasSinSujeto} no la lista —mira {@code
 * identidad_sujeto_id IS NULL}— y el plazo de {@link
 * kamayuk.caja.seguridad.dominio.PlazoDeAdopcion} no le aplica.
 *
 * <h2>El criterio: lo que concede es anterior al alta de quien la tiene</h2>
 *
 * <p>Una fila es candidata si esta habilitada, su sujeto tiene su alta en {@code
 * identidad_evento_aplicado} —la del tipo de su tabla, la primera—, y concede algo que entro en
 * esta copia <b>antes</b> que ese alta, con {@link #MARGEN} de holgura:
 *
 * <ul>
 *   <li>una cuenta: una afiliacion ACTIVA ({@code miembro.fecha_alta}) o una excepcion propia que
 *       conceda al menos un privilegio ({@code permiso.fecha_registro});
 *   <li>un grupo: un miembro ACTIVO o un permiso que conceda al menos un privilegio.
 * </ul>
 *
 * <p>El por que: una fila que nace de su propia alta no puede tener nada anterior a ella. El
 * aplicador pospone ({@code TodaviaNo}) toda afiliacion o permiso que nombre a quien esta copia no
 * tiene todavia, y las dos fechas las pone ESTA copia —el alta con el {@code Clock} del aplicador,
 * lo demas con el {@code now()} de su transaccion—, asi que no dependen de cuanto tarde el buzon.
 * Lo que concede y es anterior al alta solo pudo ponerlo otro sujeto, o alguien que no es el
 * aplicador.
 *
 * <p><b>Y se mira lo que concede, no la fila</b>, por tres motivos: {@code grupo} no tiene fecha
 * propia; una fila que no concede nada heredado no es un riesgo aunque fuera de otro —el alta le
 * sobrescribio nombre, habilitado y vigencias—; y es lo unico que se puede deshacer desde {@code
 * identidad}, de modo que retirar lo heredado (desafiliar, negar el permiso) saca la fila de la
 * lista en la corrida siguiente.
 *
 * <h2>Lo que no cuenta: lo sembrado antes de la primera corrida</h2>
 *
 * <p>Hasta la etapa 5, la implantacion de esta caja sembraba al administrador, el grupo
 * «Administracion del sistema», su afiliacion y sus permisos, y el alta del mismo administrador en
 * {@code identidad} se fundia despues en esa fila: lo sembrado es anterior al alta y la fila es de
 * la misma persona —lo exige {@code kamayuk.implantacion.administrador}—. Por eso no cuenta lo que
 * concede desde antes del <b>primer evento aplicado en esta municipalidad</b> (mas {@link
 * #MARGEN}): antes de esa corrida ningun sujeto de {@code identidad} pudo escribir nada aqui, asi
 * que no pudo dejar nada que heredar. Sin esta exclusion, toda instalacion sembrada antes de la
 * etapa 5 gritaria en cada corrida, y para siempre, por su administrador.
 *
 * <h2>Lo que se le escapa, y lo que lista de mas</h2>
 *
 * <ul>
 *   <li><b>Lo que un buzon atrasado aplico en menos de {@link #MARGEN}</b>: si la historia entera
 *       —el alta del 100, su permiso, su renombrado y el alta del 200— entro en una sola corrida,
 *       todo queda a milisegundos. Las fechas son de esta copia, no de {@code identidad}.
 *   <li><b>Una huerfana heredada de lo sembrado</b>: si la fila sembrada fue la que quedo huerfana,
 *       lo que concede es anterior a la primera corrida y no cuenta.
 *   <li><b>Un sujeto cuya alta no paso por esta copia</b> —adoptado por un {@code *_MODIFICADO},
 *       una afiliacion o un permiso—: sin alta no hay con que comparar.
 *   <li><b>Lo heredado que {@code identidad} volvio a confirmar</b> sigue saliendo: la afiliacion o
 *       el permiso que se vuelven a fijar para el sujeto nuevo son la misma fila, con su fecha
 *       original ({@code ON CONFLICT … DO UPDATE} no la toca). Desde aqui no se distingue
 *       «heredado» de «heredado y aceptado», y no hay donde anotar lo segundo sin un segundo
 *       escritor (regla 12).
 * </ul>
 *
 * <p>Lo que se hace con cada una, y lo que haria falta para dejar de adivinar, esta en {@code
 * docs/40-datos/huerfanas-ya-adoptadas.md}.
 */
@Service
@Profile("batch")
@ConditionalOnProperty("kamayuk.identidad.url")
public class HuerfanasYaAdoptadas extends RepositorioJdbc {

    /**
     * La holgura entre las dos fechas que se comparan: <b>un minuto</b>.
     *
     * <p>No es un plazo de negocio ni el retraso del buzon —las dos fechas las pone esta copia—: es
     * cuanto pueden discrepar dos relojes, el de la aplicacion (que fecha el acuse) y el de la base
     * (que fecha la fila con {@code now()}, el comienzo de su transaccion). Con NTP discrepan en
     * milisegundos, asi que con un minuto nada de lo que vino DESPUES de su propia alta pasa por
     * heredado. Lo que cuesta esta en la clase: lo que se aplico todo junto en menos de un minuto
     * no se ve.
     */
    public static final Duration MARGEN = Duration.ofMinutes(1);

    public HuerfanasYaAdoptadas(JdbcClient jdbc) {
        super(jdbc);
    }

    /**
     * Las candidatas de la municipalidad del contexto, ordenadas por tabla y clave, con lo que cada
     * una hereda por fecha. Vacia en una base implantada despues de la etapa 5 que nunca tuvo una
     * clave reasignada, que es lo corriente.
     */
    @Transactional(readOnly = true)
    public List<HuerfanaYaAdoptada> candidatas() {
        StringJoiner concede = new StringJoiner(" OR ", "(", ")");
        for (Privilegio privilegio : Privilegio.values()) {
            concede.add("p." + privilegio.columna());
        }
        String sql =
                "WITH primera AS (SELECT min(aplicado_en) AS en FROM identidad_evento_aplicado),"
                        + " altas AS (SELECT tipo, sujeto_id, min(aplicado_en) AS en"
                        + " FROM identidad_evento_aplicado"
                        + " WHERE tipo IN ('USUARIO_DADO_DE_ALTA', 'GRUPO_DADO_DE_ALTA')"
                        + " GROUP BY tipo, sujeto_id),"
                        + " filas AS ("
                        + " SELECT 'usuario' AS tabla, u.id, u.cuenta AS clave,"
                        + " u.identidad_sujeto_id AS sujeto, a.en AS alta"
                        + " FROM usuario u JOIN altas a ON a.tipo = 'USUARIO_DADO_DE_ALTA'"
                        + " AND a.sujeto_id = u.identidad_sujeto_id WHERE u.habilitado"
                        + " UNION ALL"
                        + " SELECT 'grupo', g.id, g.nombre, g.identidad_sujeto_id, a.en"
                        + " FROM grupo g JOIN altas a ON a.tipo = 'GRUPO_DADO_DE_ALTA'"
                        + " AND a.sujeto_id = g.identidad_sujeto_id WHERE g.habilitado),"
                        + " lo_que_concede AS ("
                        + " SELECT 'usuario' AS tabla, m.usuario_id AS fila, 'miembro' AS que,"
                        + " g.nombre AS de, m.fecha_alta AS desde"
                        + " FROM miembro m JOIN grupo g ON g.id = m.grupo_id WHERE m.activo"
                        + " UNION ALL"
                        + " SELECT 'usuario', p.usuario_id, 'permiso', a.codigo, p.fecha_registro"
                        + " FROM permiso p JOIN acceso a ON a.id = p.acceso_id"
                        + " WHERE p.usuario_id IS NOT NULL AND "
                        + concede
                        + " UNION ALL"
                        + " SELECT 'grupo', m.grupo_id, 'miembro', u.cuenta, m.fecha_alta"
                        + " FROM miembro m JOIN usuario u ON u.id = m.usuario_id WHERE m.activo"
                        + " UNION ALL"
                        + " SELECT 'grupo', p.grupo_id, 'permiso', a.codigo, p.fecha_registro"
                        + " FROM permiso p JOIN acceso a ON a.id = p.acceso_id"
                        + " WHERE p.grupo_id IS NOT NULL AND "
                        + concede
                        + ")"
                        + " SELECT f.tabla, f.id, f.clave, f.sujeto, f.alta, c.que, c.de, c.desde"
                        + " FROM filas f JOIN lo_que_concede c ON c.tabla = f.tabla"
                        + " AND c.fila = f.id CROSS JOIN primera"
                        + " WHERE c.desde < f.alta - make_interval(secs => :margen)"
                        + " AND c.desde >= primera.en + make_interval(secs => :margen)"
                        + " ORDER BY f.tabla, f.clave, f.id, c.desde, c.que, c.de";

        Map<String, Candidata> porFila = new LinkedHashMap<>();
        jdbc().sql(sql)
                .param("margen", MARGEN.toSeconds())
                .query(
                        fila -> {
                            String tabla = fila.getString("tabla");
                            long id = fila.getLong("id");
                            String clave = fila.getString("clave");
                            long sujeto = fila.getLong("sujeto");
                            Instant alta = instante(fila, "alta");
                            HuerfanaYaAdoptada.Herencia herencia =
                                    new HuerfanaYaAdoptada.Herencia(
                                            fila.getString("que"),
                                            fila.getString("de"),
                                            instante(fila, "desde"));
                            porFila.computeIfAbsent(
                                            tabla + ":" + id,
                                            k ->
                                                    new Candidata(
                                                            tabla,
                                                            id,
                                                            clave,
                                                            sujeto,
                                                            alta,
                                                            new ArrayList<>()))
                                    .heredado()
                                    .add(herencia);
                        });

        List<HuerfanaYaAdoptada> candidatas = new ArrayList<>();
        for (Candidata candidata : porFila.values()) {
            candidatas.add(
                    new HuerfanaYaAdoptada(
                            candidata.tabla(),
                            candidata.id(),
                            candidata.clave(),
                            candidata.sujeto(),
                            candidata.alta(),
                            candidata.heredado()));
        }
        return candidatas;
    }

    private static Instant instante(ResultSet fila, String columna) throws SQLException {
        return fila.getObject(columna, OffsetDateTime.class).toInstant();
    }

    /** Lo que se va juntando de una fila mientras llegan sus herencias, una por renglon. */
    private record Candidata(
            String tabla,
            long id,
            String clave,
            long sujeto,
            Instant alta,
            List<HuerfanaYaAdoptada.Herencia> heredado) {}
}
