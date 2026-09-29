package kamayuk.caja.seguridad.infraestructura;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

import java.io.IOException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import kamayuk.caja.esquema.BaseDeDatosDePrueba;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * El {@code id} de la municipalidad se ESCRIBE, no se pide a la secuencia (#132).
 *
 * <h2>El defecto que esta clase existe para impedir</h2>
 *
 * <p>Es la mitad de {@code caja} de la salida 1 de <a
 * href="https://github.com/hneyra/infrastructure/issues/73">infrastructure#73</a>, y la misma clase
 * de pruebas que {@code identidad} escribio para la suya. El contexto de cada peticion sale del
 * claim {@code municipalidad_id} del token —{@code TenantContextFilter}—, que Keycloak escribe con
 * el numero que el ambiente declara ({@code kamayuk:municipalidadId}); la fila la escribia la
 * implantacion dejando que la secuencia eligiera. Nada comparaba los dos, y coincidian porque
 * {@code stg} y {@code prod} declaran 1 y una base recien creada tambien da 1.
 *
 * <p>Se rompe en dos sitios. Con otro id declarado, cada cajero recibe 403 con la fila delante. Y
 * con una segunda municipalidad en la misma base, el {@code ON CONFLICT (ubigeo) DO NOTHING} gasta
 * un valor de la secuencia en cada despliegue, asi que su id no tiene relacion con ningun claim — y
 * puede ser el de OTRA, que es leer sus cajas y sus recibos.
 *
 * <h2>Por que las afirmaciones usan un id que la secuencia NO habria dado</h2>
 *
 * <p>En una base recien creada la secuencia tambien da {@code 1}, asi que afirmar «vale 1» no
 * distinguiria un id declarado de uno asignado. De ahi el {@code 42}: si la fila sale con 42, el id
 * lo decidio quien declara la municipalidad y no PostgreSQL.
 */
@DisplayName("#132 — el id de la municipalidad es el DECLARADO, en la base de caja")
class RegistroDeMunicipalidadesJdbcTest {

    /** Un ubigeo que nadie siembra: aqui se ejerce el camino de CREAR la fila. */
    private static final String UBIGEO_NUEVO = "150101";

    private static final long DECLARADO = 42L;

    private static BaseDeDatosDePrueba base;

    @BeforeAll
    static void provisionar() throws SQLException, IOException {
        base = BaseDeDatosDePrueba.provisionar();
    }

    @AfterAll
    static void cerrar() {
        if (base != null) {
            base.close();
        }
    }

    private static RegistroDeMunicipalidadesJdbc registro() {
        return new RegistroDeMunicipalidadesJdbc(
                base.url(), BaseDeDatosDePrueba.OWNER, base.clave(BaseDeDatosDePrueba.OWNER));
    }

    private static void darDeAlta(String ubigeo, long municipalidadId) {
        registro().darDeAltaSiFalta(ubigeo, municipalidadId, "Lima", "PROVINCIAL", false);
    }

    @Test
    void laFilaSeEscribeConElIdDeclaradoYNoConElDeLaSecuencia() throws SQLException {
        darDeAlta(UBIGEO_NUEVO, DECLARADO);

        assertThat(idEnLaBase(UBIGEO_NUEVO))
                .as(
                        "la fila se escribio con el id que la SECUENCIA asigno y no con el"
                                + " declarado. El claim `municipalidad_id` de todo token lleva el"
                                + " declarado, asi que un id que el ambiente no conoce deja al RLS"
                                + " escondiendo las filas de esta municipalidad: 403 a cada cajero"
                                + " CON LA FILA DELANTE (#132)")
                .isEqualTo(DECLARADO);
    }

    @Test
    void repetirloConElMismoIdEsIdempotente() throws SQLException {
        darDeAlta(UBIGEO_NUEVO, DECLARADO);
        darDeAlta(UBIGEO_NUEVO, DECLARADO);

        assertThat(cuantasFilas(UBIGEO_NUEVO))
                .as("reimplantar duplico la fila: un despliegue repetido no puede crecer el estado")
                .isEqualTo(1);
        assertThat(idEnLaBase(UBIGEO_NUEVO)).isEqualTo(DECLARADO);
    }

    @Test
    void siLaFilaExisteConOtroIdFallaNombrandoLosDos() throws SQLException {
        darDeAlta(UBIGEO_NUEVO, DECLARADO);

        Throwable salio = catchThrowable(() -> darDeAlta(UBIGEO_NUEVO, 7L));

        // `catchThrowable` y no `assertThatThrownBy`, que revienta antes de aplicar la
        // descripcion cuando no se lanza nada: es la leccion de `rentas`#40.
        assertThat(salio)
                .as(
                        "dar de alta con un id declarado distinto del que la fila tiene paso sin"
                                + " protestar. Ese id es el inquilino del que cuelga el RLS de TODAS"
                                + " las tablas, asi que seguir deja el claim apuntando a un inquilino"
                                + " sin una sola fila — y el RLS no lo delata, porque la base hace"
                                + " exactamente lo que se le pide")
                .isInstanceOf(IllegalStateException.class);
        assertThat(salio.getMessage())
                .as("el mensaje tiene que nombrar LOS DOS numeros, o no se sabe cual cambiar")
                .contains("ya esta dada de alta en caja con el id 42")
                .contains("lo declarado es 7");
        assertThat(idEnLaBase(UBIGEO_NUEVO))
                .as("y la fila no se toco: de ese id cuelga cada fila de la base")
                .isEqualTo(DECLARADO);
    }

    /**
     * El caso de un ambiente que ya existe: la fila la dejo la secuencia, como hacia la
     * implantacion hasta #132, y el ambiente declara otro numero.
     *
     * <p>Es lo que va a encontrar el primer despliegue con esto dentro en cualquier base cuya fila
     * no tenga el id declarado. Tiene que salir rojo diciendolo, y no seguir con el claim
     * desalineado.
     */
    @Test
    void unaFilaQueDioLaSecuenciaConOtroIdFallaNombrandoLosDos() throws SQLException {
        String ubigeo = "150103";
        long legado = altaComoAntesDe132(ubigeo);
        long declarado = 77L;
        assertThat(legado)
                .as("premisa: la secuencia dio un id distinto del declarado, o esto no mide nada")
                .isNotEqualTo(declarado);

        Throwable salio = catchThrowable(() -> darDeAlta(ubigeo, declarado));

        assertThat(salio)
                .as(
                        "una fila que dio la secuencia con otro id paso por implantada: el claim"
                                + " de cada token dice "
                                + declarado
                                + " y las filas de esta municipalidad cuelgan de "
                                + legado)
                .isInstanceOf(IllegalStateException.class);
        assertThat(salio.getMessage())
                .contains("ya esta dada de alta en caja con el id " + legado)
                .contains("lo declarado es " + declarado);
        assertThat(idEnLaBase(ubigeo)).isEqualTo(legado);
    }

    /**
     * El id declarado ya es el de OTRA municipalidad de la misma base.
     *
     * <p>Con la secuencia esto no fallaba nunca —la base elegia uno libre— y por eso era peor: el
     * id quedaba sin relacion con ningun claim, y podia ser el que otra municipalidad lleva en sus
     * tokens. Dos municipalidades con el mismo id son un solo inquilino para el RLS.
     */
    @Test
    void siElIdDeclaradoEsElDeOtraMunicipalidadFallaNombrandoLasDos() throws SQLException {
        darDeAlta(UBIGEO_NUEVO, DECLARADO);
        String otra = "150102";

        Throwable salio = catchThrowable(() -> darDeAlta(otra, DECLARADO));

        assertThat(salio)
                .as(
                        "dar de alta una segunda municipalidad con el id de la primera paso sin"
                                + " protestar: los cajeros de una leerian las cajas de la otra")
                .isInstanceOf(IllegalStateException.class);
        assertThat(salio.getMessage())
                .as("el mensaje nombra las DOS municipalidades y el id que se disputan")
                .contains("para la municipalidad " + otra + " es 42")
                .contains("ya es el de la municipalidad " + UBIGEO_NUEVO);
        assertThat(cuantasFilas(otra)).as("y la segunda no quedo dada de alta").isZero();
        assertThat(idEnLaBase(UBIGEO_NUEVO)).as("ni la primera se toco").isEqualTo(DECLARADO);
    }

    /**
     * Y la secuencia queda por encima del id escrito.
     *
     * <p>Insertar un id explicito NO la avanza, asi que sin el {@code setval} un {@code INSERT}
     * posterior que si la use pediria un valor ya ocupado y fallaria con una violacion de clave
     * primaria <b>mucho despues y en otro sitio</b> — con un mensaje que habla de una clave
     * duplicada y no de quien escribio el id a mano.
     */
    @Test
    void laSecuenciaQuedaPorEncimaDelIdEscrito() throws SQLException {
        darDeAlta(UBIGEO_NUEVO, DECLARADO);

        assertThat(siguienteDeLaSecuencia())
                .as(
                        "la secuencia se quedo por debajo del id escrito a mano: el siguiente"
                                + " `INSERT` que la use pedira un valor ocupado y fallara con una"
                                + " violacion de clave primaria que no dice de donde viene")
                .isGreaterThan(DECLARADO);
    }

    private static long altaComoAntesDe132(String ubigeo) throws SQLException {
        try (Connection admin = base.conexionAdmin();
                PreparedStatement alta =
                        admin.prepareStatement(
                                "INSERT INTO municipalidad (ubigeo, nombre, tipo)"
                                        + " VALUES (?, 'Implantada antes de #132', 'DISTRITAL')"
                                        + " RETURNING id")) {
            alta.setString(1, ubigeo);
            try (ResultSet fila = alta.executeQuery()) {
                fila.next();
                return fila.getLong(1);
            }
        }
    }

    private static long idEnLaBase(String ubigeo) throws SQLException {
        try (Connection admin = base.conexionAdmin();
                PreparedStatement consulta =
                        admin.prepareStatement("SELECT id FROM municipalidad WHERE ubigeo = ?")) {
            consulta.setString(1, ubigeo);
            try (ResultSet fila = consulta.executeQuery()) {
                assertThat(fila.next()).as("no hay fila para el ubigeo " + ubigeo).isTrue();
                return fila.getLong(1);
            }
        }
    }

    private static int cuantasFilas(String ubigeo) throws SQLException {
        try (Connection admin = base.conexionAdmin();
                PreparedStatement consulta =
                        admin.prepareStatement(
                                "SELECT count(*) FROM municipalidad WHERE ubigeo = ?")) {
            consulta.setString(1, ubigeo);
            try (ResultSet fila = consulta.executeQuery()) {
                fila.next();
                return fila.getInt(1);
            }
        }
    }

    private static long siguienteDeLaSecuencia() throws SQLException {
        try (Connection admin = base.conexionAdmin();
                Statement sentencia = admin.createStatement();
                ResultSet fila =
                        sentencia.executeQuery(
                                "SELECT nextval(pg_get_serial_sequence('municipalidad', 'id'))")) {
            fila.next();
            return fila.getLong(1);
        }
    }
}
