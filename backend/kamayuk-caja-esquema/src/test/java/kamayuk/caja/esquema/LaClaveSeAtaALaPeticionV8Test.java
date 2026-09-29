package kamayuk.caja.esquema;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * #143 — {@code V8} pone la huella de la peticion al lado de la clave de idempotencia del recibo, y
 * deja las filas que ya estaban como estaban.
 *
 * <p>Lo que se mide es lo que el SQL solo promete: que la migracion, que corre sin contexto de
 * tenant, pase sobre una tabla con {@code FORCE} y con un recibo con clave dentro —el {@code CHECK}
 * de la huella se valida y no atraviesa la politica; el de la clave con huella va {@code NOT VALID}
 * porque esa fila lo violaria—, y que despues los dos muerdan en cada {@code INSERT}. Por eso la
 * base se migra hasta {@code V6}, se le pone el recibo y se termina con el {@link Migrador} del
 * despliegue.
 */
@DisplayName("#143 — V8 ata la clave de idempotencia a la huella de su peticion")
class LaClaveSeAtaALaPeticionV8Test {

    /** Un SHA-256 cualquiera en hexadecimal: la forma, que es lo que la base comprueba. */
    private static final String HUELLA = "ab".repeat(32);

    private static BaseDeDatosDePrueba base;
    private static int aplicadas;

    @BeforeAll
    static void migrarConUnReciboDentro() throws SQLException, IOException {
        base = BaseDeDatosDePrueba.provisionarSinMigrar();
        Migrador.configuracion(
                        base.url(),
                        BaseDeDatosDePrueba.OWNER,
                        base.clave(BaseDeDatosDePrueba.OWNER))
                .target("6")
                .load()
                .migrate();
        try (Connection admin = base.conexionAdmin();
                Statement s = admin.createStatement()) {
            s.execute(
                    "INSERT INTO municipalidad (ubigeo, nombre, tipo)"
                            + " VALUES ('209981', 'Municipalidad de V8', 'DISTRITAL')");
            s.execute(
                    "INSERT INTO caja (municipalidad_id, codigo, nombre, serie)"
                            + " SELECT id, 'C-V8', 'Caja de V8', 'V8' FROM municipalidad");
            s.execute(recibo(1, "'vieja'", null));
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
            "se aplica sin contexto de tenant, y la fila vieja se queda con su clave y sin huella")
    void laFilaViejaSeQuedaComoEstaba() throws SQLException {
        assertThat(aplicadas)
                .as(
                        "[V8 y lo que venga detras. Con el CHECK de la clave con huella VALIDADO, el"
                                + " recibo con clave de antes lo violaria y la migracion moriria]")
                .isPositive();
        try (Connection admin = base.conexionAdmin();
                Statement s = admin.createStatement();
                ResultSet fila =
                        s.executeQuery(
                                "SELECT clave_idempotencia, huella_de_la_peticion FROM recibo"
                                        + " WHERE numero = 1")) {
            assertThat(fila.next()).isTrue();
            assertThat(fila.getString(1)).isEqualTo("vieja");
            assertThat(fila.getString(2))
                    .as("[nulo: «no se sabe que peticion la trajo», y se reintenta como antes]")
                    .isNull();
        }
    }

    @Test
    @DisplayName("desde V8 una clave nueva no entra sin su huella")
    void unaClaveNuevaNoEntraSinHuella() {
        assertThatThrownBy(() -> insertar(recibo(2, "'nueva-sin-huella'", null)))
                .as(
                        "[recibo_clave_con_huella_ck: un camino que emitiera con clave y sin huella"
                                + " reabriria #143, y choca aqui y no en produccion]")
                .hasMessageContaining("recibo_clave_con_huella_ck");
    }

    @Test
    @DisplayName("una huella no va sin clave, ni con una forma que no es la de un SHA-256")
    void laHuellaTieneSuForma() {
        assertThatThrownBy(() -> insertar(recibo(3, "NULL", "'" + HUELLA + "'")))
                .hasMessageContaining("recibo_huella_ck");
        assertThatThrownBy(
                        () ->
                                insertar(
                                        recibo(
                                                4,
                                                "'mayusculas'",
                                                "'"
                                                        + HUELLA.toUpperCase(java.util.Locale.ROOT)
                                                        + "'")))
                .hasMessageContaining("recibo_huella_ck");
    }

    @Test
    @DisplayName("una clave con su huella entra")
    void unaClaveConSuHuellaEntra() throws SQLException {
        insertar(recibo(5, "'nueva'", "'" + HUELLA + "'"));

        try (Connection admin = base.conexionAdmin();
                Statement s = admin.createStatement();
                ResultSet fila =
                        s.executeQuery(
                                "SELECT huella_de_la_peticion FROM recibo"
                                        + " WHERE clave_idempotencia = 'nueva'")) {
            assertThat(fila.next()).isTrue();
            assertThat(fila.getString(1)).isEqualTo(HUELLA);
        }
    }

    private static void insertar(String sql) throws SQLException {
        try (Connection admin = base.conexionAdmin();
                Statement s = admin.createStatement()) {
            s.execute(sql);
        }
    }

    /**
     * Un recibo minimo de la caja sembrada. Antes de V8 no existe la columna de la huella, asi que
     * con {@code huella} nula no se nombra.
     */
    private static String recibo(int numero, String clave, String huella) {
        return "INSERT INTO recibo (municipalidad_id, serie, numero, caja_id, cajero, forma_pago,"
                + " total, actualizado_a, clave_idempotencia,"
                + (huella == null ? "" : " huella_de_la_peticion,")
                + " usuario_registro, observacion)"
                + " SELECT c.municipalidad_id, 'V8', "
                + numero
                + ", c.id, 'cajero', 'EFECTIVO', 1, DATE '2026-09-28', "
                + clave
                + ", "
                + (huella == null ? "" : huella + ", ")
                + "'prueba', 'recibo de la prueba de V8' FROM caja c WHERE c.codigo = 'C-V8'";
    }
}
