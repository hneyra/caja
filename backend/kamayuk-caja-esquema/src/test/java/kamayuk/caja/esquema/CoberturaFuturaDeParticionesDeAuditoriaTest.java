package kamayuk.caja.esquema;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Clock;
import java.time.Instant;
import java.time.Year;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * #113 — Cuanto falta para que se acabe la cobertura de particiones de {@code auditoria}, y con
 * cuanta antelacion se avisa.
 *
 * <h2>Lo que este archivo NO repite</h2>
 *
 * <p>{@link AislamientoMultiTenantTest}{@code $CoberturaEstructural#todaParticionTieneRlsExplicita}
 * ya censa TODAS las particiones que haya en el catalogo -incluidas las que {@code V4} agrega- y
 * exige {@code relrowsecurity}, {@code relforcerowsecurity} y una politica con {@code USING} y
 * {@code WITH CHECK} en cada una. Esa prueba es generica: no hace falta tocarla para que una
 * particion nueva quede aislada, porque no enumera particiones a mano. Lo que esa prueba NO dice es
 * si algun dia va a FALTAR una particion -su censo es de lo que YA existe-, y eso es lo que mide
 * esta clase.
 *
 * <h2>Lo que mide</h2>
 *
 * <p>Que la ULTIMA particion de {@code auditoria} cubra, como minimo, {@value #ANIOS_DE_ANTELACION}
 * anios por delante del reloj. Sin particion {@code DEFAULT} (V1, V4: a proposito, para no esconder
 * el hueco), quedarse corto es exactamente el defecto de #113: una escritura auditada del primer
 * dia sin particion falla con «no partition of relation "auditoria" found», y sin esta guarda esa
 * fecha se descubre el dia que ya llego.
 *
 * <p>El reloj se inyecta a proposito -{@link #verificarCobertura(Clock)}- para poder demostrar la
 * guarda sin esperar a que el calendario la ejerza de verdad: con el reloj fijo en 2026 la
 * cobertura hasta 2035 alcanza, y con el reloj fijo en 2034 ya no -hacen falta {@value
 * #ANIOS_DE_ANTELACION} anios mas de los que hay, o sea hasta 2036-. {@link
 * #hoyLaCoberturaAlcanza()} es la que corre de verdad en {@code verificarAislamiento} con el reloj
 * del sistema, y la que un dia se pondra roja sola si nadie escribe la migracion siguiente a
 * tiempo.
 */
@DisplayName("#113 — Cobertura futura de las particiones de auditoria")
class CoberturaFuturaDeParticionesDeAuditoriaTest {

    /**
     * Cuantos anios de antelacion exige la guarda. Es el margen entre «hace falta la migracion
     * siguiente» y «ya falta»: con dos anios, una particion que cubra hasta 2035 deja de alcanzar
     * quien lo mire desde 2034 en adelante, mucho antes del 1-ene real en que fallaria una
     * escritura.
     */
    private static final int ANIOS_DE_ANTELACION = 2;

    /** El patron de nombre que las particiones de {@code auditoria} siguen desde V1 y V4. */
    private static final Pattern SUFIJO_DEL_ANIO = Pattern.compile("^auditoria_(\\d{4})$");

    private static BaseDeDatosDePrueba base;

    @BeforeAll
    static void provisionar() throws SQLException, IOException {
        base = BaseDeDatosDePrueba.provisionar();
    }

    @AfterAll
    static void liberar() {
        if (base != null) {
            base.close();
        }
    }

    @Test
    @DisplayName(
            "con el reloj de esta corrida, la ultima particion cubre los anios de antelacion que"
                    + " la guarda exige")
    void hoyLaCoberturaAlcanza() throws SQLException {
        verificarCobertura(Clock.systemUTC());
    }

    @Test
    @DisplayName("con un reloj fijo en 2026, la cobertura hasta 2035 alcanza")
    void conElRelojFijoEn2026LaCoberturaAlcanza() throws SQLException {
        verificarCobertura(relojFijoEn(2026));
    }

    @Test
    @DisplayName(
            "con un reloj fijo en 2034 la cobertura de hoy ya no alcanza, y el mensaje dice que"
                    + " migracion escribir")
    void conElRelojFijoEn2034LaCoberturaNoAlcanzaYElMensajeDiceQueMigracionEscribir()
            throws SQLException {
        int ultimoAnioCubierto = ultimoAnioCubierto();
        String migracionSiguiente = siguienteMigracion();

        assertThatThrownBy(() -> verificarCobertura(relojFijoEn(2034)))
                .as(
                        "en 2034 la guarda exige cobertura hasta 2036 (2034 + %s); hoy la ultima"
                                + " particion es %s, asi que tiene que fallar nombrando las dos"
                                + " cifras y la migracion que hay que escribir",
                        ANIOS_DE_ANTELACION, ultimoAnioCubierto)
                .isInstanceOf(AssertionError.class)
                .hasMessageContaining(String.valueOf(ultimoAnioCubierto))
                .hasMessageContaining("2036")
                .hasMessageContaining(migracionSiguiente);
    }

    // ------------------------------------------------------------------

    private void verificarCobertura(Clock reloj) throws SQLException {
        int ultimoAnioCubierto = ultimoAnioCubierto();
        int anioExigido = Year.now(reloj).getValue() + ANIOS_DE_ANTELACION;
        assertThat(ultimoAnioCubierto)
                .as(
                        "la ultima particion de auditoria cubre %s y con el reloj de esta corrida"
                                + " hacen falta %s anios de antelacion -hasta %s-. Escribe una"
                                + " migracion nueva (%s) que cree las particiones de auditoria que"
                                + " falten, cada una con su RLS ENABLE+FORCE y su politica -como"
                                + " V4- y SIN particion DEFAULT (esconderia el hueco en vez de"
                                + " gritarlo)",
                        ultimoAnioCubierto, ANIOS_DE_ANTELACION, anioExigido, siguienteMigracion())
                .isGreaterThanOrEqualTo(anioExigido);
    }

    /** El mayor anio con particion propia de {@code auditoria}, leido del catalogo. */
    private static int ultimoAnioCubierto() throws SQLException {
        List<Integer> anios = new ArrayList<>();
        try (Connection admin = base.conexionAdmin();
                Statement sentencia = admin.createStatement();
                ResultSet fila =
                        sentencia.executeQuery(
                                "SELECT c.relname FROM pg_inherits i"
                                        + "  JOIN pg_class c ON c.oid = i.inhrelid"
                                        + "  JOIN pg_class p ON p.oid = i.inhparent"
                                        + "  JOIN pg_namespace n ON n.oid = p.relnamespace"
                                        + " WHERE n.nspname = 'public' AND p.relname ="
                                        + " 'auditoria'")) {
            while (fila.next()) {
                Matcher coincidencia = SUFIJO_DEL_ANIO.matcher(fila.getString(1));
                if (coincidencia.matches()) {
                    anios.add(Integer.valueOf(coincidencia.group(1)));
                }
            }
        }
        assertThat(anios)
                .as(
                        "ninguna particion de auditoria sigue el patron auditoria_<anio>: la"
                                + " consulta al catalogo, o la convencion de nombres, cambiaron")
                .isNotEmpty();
        return Collections.max(anios);
    }

    private static Clock relojFijoEn(int anio) {
        return Clock.fixed(Instant.parse(anio + "-06-15T12:00:00Z"), ZoneOffset.UTC);
    }

    /**
     * El nombre de la migracion que hay falta escribir, calculado de las que ya se aplicaron -no
     * fijo en el texto-, para que el mensaje no mienta el dia que alguien escriba {@code V5} por
     * otro motivo y la cobertura vuelva a quedarse corta en {@code V6}.
     */
    private static String siguienteMigracion() throws SQLException {
        return "V" + (ultimaMigracionAplicada() + 1);
    }

    private static int ultimaMigracionAplicada() throws SQLException {
        try (Connection admin = base.conexionAdmin();
                Statement sentencia = admin.createStatement();
                ResultSet fila =
                        sentencia.executeQuery(
                                "SELECT max(version::int) FROM flyway_schema_history WHERE"
                                        + " success")) {
            fila.next();
            return fila.getInt(1);
        }
    }
}
