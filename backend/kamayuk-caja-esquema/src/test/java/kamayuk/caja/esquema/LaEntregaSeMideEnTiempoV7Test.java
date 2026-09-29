package kamayuk.caja.esquema;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * #131 — {@code V7} se aplica sobre un buzon con filas, sin tocarlas, y su {@code CHECK} muerde.
 *
 * <p>Como {@code SinSujetoDesdeTest}: se migra hasta {@code V6}, se ponen filas —una PENDIENTE,
 * como la escribe la aplicacion, y una MUERTA—, y se termina con el {@link Migrador} del
 * despliegue, que corre sin contexto de tenant sobre una tabla con {@code FORCE ROW LEVEL
 * SECURITY}. Lo que se mide es que el {@code ADD COLUMN} sin {@code DEFAULT} y el {@code ADD
 * CONSTRAINT … CHECK} validado no atraviesan la politica (hallazgo 4, y el parrafo del {@code
 * CHECK} de #542), que las filas de antes quedan sin espera y sin racha, y que {@code kamayuk_app}
 * puede escribir las dos columnas nuevas con el {@code GRANT} de tabla de {@code V2}.
 */
@DisplayName("#131 — V7 da a cada pago su plazo sin tocar las filas que ya estaban")
class LaEntregaSeMideEnTiempoV7Test {

    private static BaseDeDatosDePrueba base;
    private static long municipalidad;
    private static int aplicadas;

    @BeforeAll
    static void migrarConFilasDentro() throws SQLException, IOException {
        base = BaseDeDatosDePrueba.provisionarSinMigrar();
        Migrador.configuracion(
                        base.url(),
                        BaseDeDatosDePrueba.OWNER,
                        base.clave(BaseDeDatosDePrueba.OWNER))
                .target("6")
                .load()
                .migrate();
        municipalidad = DatosDePrueba.crearMunicipalidad(base, "209971", "Municipalidad de V7");
        DatosDePrueba.sembrarTenant(base, municipalidad, "v7");
        try (Connection admin = base.conexionAdmin();
                Statement s = admin.createStatement()) {
            // Una MUERTA, copiada de la PENDIENTE que siembra la aplicacion: mismo recibo y turno.
            s.execute(
                    "INSERT INTO pago_evento (municipalidad_id, evento_id, tipo, sistema_destino,"
                            + " recibo_id, turno_id, cuerpo, estado, intentos, ultimo_error,"
                            + " creado_en)"
                            + " SELECT municipalidad_id, gen_random_uuid(), tipo, sistema_destino,"
                            + " recibo_id, turno_id, cuerpo, 'MUERTO', 8, 'el origen no contesta',"
                            + " creado_en FROM pago_evento");
        }
        aplicadas =
                Migrador.migrar(
                        base.url(),
                        BaseDeDatosDePrueba.OWNER,
                        base.clave(BaseDeDatosDePrueba.OWNER));
    }

    @AfterAll
    static void liberar() {
        if (base != null) {
            base.close();
        }
    }

    @Test
    @DisplayName(
            "el migrador la aplica sin contexto de tenant, y las filas quedan sin espera ni racha")
    void seAplicaYNoTocaLasFilas() throws SQLException {
        assertThat(aplicadas)
                .as(
                        "[V7 y lo que venga detras. Un ADD COLUMN con DEFAULT volatil o un UPDATE"
                                + " de relleno moririan aqui bajo RLS, como el del hallazgo 4]")
                .isPositive();
        try (Connection admin = base.conexionAdmin();
                Statement s = admin.createStatement();
                ResultSet fila =
                        s.executeQuery(
                                "SELECT count(*) FILTER (WHERE no_antes_de IS NULL"
                                        + " AND fallando_desde IS NULL), count(*)"
                                        + " FROM pago_evento")) {
            fila.next();
            assertThat(fila.getInt(1)).isEqualTo(fila.getInt(2)).isEqualTo(2);
        }
    }

    @Test
    @DisplayName("un MUERTO no puede esperar a un intento siguiente: lo rechaza la base")
    void unMuertoNoEspera() throws SQLException {
        try (Connection admin = base.conexionAdmin();
                Statement s = admin.createStatement()) {
            assertThatThrownBy(
                            () ->
                                    s.executeUpdate(
                                            "UPDATE pago_evento SET no_antes_de = now()"
                                                    + " WHERE estado = 'MUERTO'"))
                    .as(
                            "[si un MUERTO conservara su espera, volver a ponerlo en camino la"
                                    + " heredaria]")
                    .hasMessageContaining("pago_evento_no_antes_de_ck");
        }
    }

    @Test
    @DisplayName(
            "y kamayuk_app escribe las dos columnas de un PENDIENTE con el GRANT de tabla de V2")
    void laAplicacionLasEscribe() throws SQLException {
        Instant cuando = Instant.parse("2026-09-29T14:00:00Z");
        try (Connection app = base.conexion(BaseDeDatosDePrueba.APP)) {
            ContextoDeTenant.fijar(app, municipalidad);
            try (PreparedStatement sentencia =
                    app.prepareStatement(
                            "UPDATE pago_evento SET no_antes_de = ?, fallando_desde = ?"
                                    + " WHERE estado = 'PENDIENTE'")) {
                sentencia.setTimestamp(1, Timestamp.from(cuando.plusSeconds(10)));
                sentencia.setTimestamp(2, Timestamp.from(cuando));
                assertThat(sentencia.executeUpdate()).isEqualTo(1);
            }
            app.rollback();
        }
    }
}
