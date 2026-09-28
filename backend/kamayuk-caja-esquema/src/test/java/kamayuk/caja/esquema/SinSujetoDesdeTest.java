package kamayuk.caja.esquema;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * #125 — {@code V6} fecha las filas de la copia de la autorizacion que llegaron sin sujeto de
 * {@code identidad}, y NINGUNA posterior.
 *
 * <p>Lo que se mide es una propiedad del MOTOR, no del SQL que se lee: que un {@code ADD COLUMN …
 * DEFAULT} con una expresion estable guarde ese valor en las filas que ya estaban —sin un solo
 * {@code UPDATE}, que es lo que el migrador no puede hacer: sin contexto de tenant, el DML muere
 * bajo la politica RLS (hallazgo 4)— y que el {@code DROP DEFAULT} inmediato deje en nulo las que
 * lleguen despues. Que no reescriba la tabla es un detalle de eficiencia, no lo que la deja pasar:
 * medido en PostgreSQL 16, una reescritura entera de {@code ALTER TABLE} tampoco muere bajo RLS
 * (ver el hallazgo 4). Por eso la base se migra hasta {@code V5}, se le ponen filas, y se termina
 * de migrar con el {@link Migrador} del despliegue.
 */
@DisplayName("#125 — V6 fecha las filas que ya estaban sin sujeto de identidad")
class SinSujetoDesdeTest {

    private static BaseDeDatosDePrueba base;
    private static OffsetDateTime antes;
    private static OffsetDateTime despues;
    private static int aplicadas;

    @BeforeAll
    static void migrarConFilasDentro() throws SQLException, IOException {
        base = BaseDeDatosDePrueba.provisionarSinMigrar();
        Migrador.configuracion(
                        base.url(),
                        BaseDeDatosDePrueba.OWNER,
                        base.clave(BaseDeDatosDePrueba.OWNER))
                .target("5")
                .load()
                .migrate();
        try (Connection admin = base.conexionAdmin();
                Statement s = admin.createStatement()) {
            s.execute(
                    "INSERT INTO municipalidad (ubigeo, nombre, tipo)"
                            + " VALUES ('209961', 'Municipalidad de V6', 'DISTRITAL')");
            s.execute(
                    "INSERT INTO usuario (municipalidad_id, cuenta, nombre)"
                            + " SELECT id, 'vieja', 'Sin sujeto' FROM municipalidad");
            s.execute(
                    "INSERT INTO usuario (municipalidad_id, identidad_sujeto_id, cuenta, nombre)"
                            + " SELECT id, 7, 'adoptada', 'Con sujeto' FROM municipalidad");
            s.execute(
                    "INSERT INTO grupo (municipalidad_id, nombre)"
                            + " SELECT id, 'Viejo' FROM municipalidad");
        }
        antes = ahoraEnLaBase();
        aplicadas =
                Migrador.migrar(
                        base.url(),
                        BaseDeDatosDePrueba.OWNER,
                        base.clave(BaseDeDatosDePrueba.OWNER));
        despues = ahoraEnLaBase();
    }

    @AfterAll
    static void liberar() {
        if (base != null) {
            base.close();
        }
    }

    @Test
    @DisplayName("el migrador, que corre sin contexto de tenant, la aplica sobre tablas con FORCE")
    void seAplicaSinContextoDeTenant() {
        assertThat(aplicadas)
                .as(
                        "[V6 y lo que venga detras, con el dueno, sin contexto de tenant y con"
                                + " FORCE. Si V6 fechara las filas con un UPDATE —o con cualquier"
                                + " DML sobre usuario o grupo—, moriria con «unrecognized"
                                + " configuration parameter \"app.municipalidad_id\"», como el"
                                + " UPDATE del hallazgo 4: la politica se aplica al DML, no a la"
                                + " reescritura de un ALTER TABLE]")
                .isPositive();
    }

    @Test
    @DisplayName("la fila de usuario y la de grupo que ya estaban quedan con el instante de V6")
    void lasQueEstabanQuedanFechadas() throws SQLException {
        assertThat(sinSujetoDesde("usuario", "cuenta", "vieja")).isBetween(antes, despues);
        assertThat(sinSujetoDesde("grupo", "nombre", "Viejo")).isBetween(antes, despues);
        assertThat(sinSujetoDesde("usuario", "cuenta", "adoptada"))
                .as(
                        "[tambien la que ya tenia sujeto: la migracion no puede elegir filas sin"
                                + " consultar, y a una fila con sujeto la fecha no le cambia nada]")
                .isBetween(antes, despues);
    }

    @Test
    @DisplayName("y la que llega despues de V6 NO: sin sujeto y sin fecha, no concede nunca")
    void lasQueLleganDespuesNoSeFechan() throws SQLException {
        try (Connection admin = base.conexionAdmin();
                Statement s = admin.createStatement()) {
            s.execute(
                    "INSERT INTO usuario (municipalidad_id, cuenta, nombre)"
                            + " SELECT id, 'nueva', 'Llego despues' FROM municipalidad");
            s.execute(
                    "INSERT INTO grupo (municipalidad_id, nombre)"
                            + " SELECT id, 'Nuevo' FROM municipalidad");
        }
        assertThat(sinSujetoDesde("usuario", "cuenta", "nueva"))
                .as(
                        "[el DROP DEFAULT: si la columna conservara su valor por omision, una fila"
                                + " escrita por fuera del aplicador recibiria una semana de gracia]")
                .isNull();
        assertThat(sinSujetoDesde("grupo", "nombre", "Nuevo")).isNull();
    }

    /** El reloj del MOTOR, que es el que lee el `now()` de V6. */
    private static OffsetDateTime ahoraEnLaBase() throws SQLException {
        try (Connection admin = base.conexionAdmin();
                Statement s = admin.createStatement();
                ResultSet fila = s.executeQuery("SELECT clock_timestamp()")) {
            fila.next();
            return fila.getObject(1, OffsetDateTime.class);
        }
    }

    private static OffsetDateTime sinSujetoDesde(String tabla, String clave, String valor)
            throws SQLException {
        try (Connection admin = base.conexionAdmin();
                Statement s = admin.createStatement();
                ResultSet fila =
                        s.executeQuery(
                                "SELECT sin_sujeto_desde FROM "
                                        + tabla
                                        + " WHERE "
                                        + clave
                                        + " = '"
                                        + valor
                                        + "'")) {
            assertThat(fila.next()).as("la fila «%s» de %s", valor, tabla).isTrue();
            return fila.getObject(1, OffsetDateTime.class);
        }
    }
}
