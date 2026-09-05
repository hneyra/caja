package kamayuk.caja.esquema;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * El esquema de la caja aplica entero sobre una base con CERO extensiones (P5D, C-10).
 *
 * <h2>Que defecto cierra</h2>
 *
 * <p>P5D retiro las cuatro extensiones de {@code crear-roles.sql} y escribio por que: «la caja
 * tiene que poder correr en el motor mas simple que exista, y una ventanilla cuya base necesita
 * PostGIS no se levanta en cualquier sitio». <b>Esa frase no la comprobaba nadie.</b>
 *
 * <p>Y en el entorno local era directamente falsa: {@code
 * despliegue/inicializacion-del-motor/05-crear-bases.sh} de {@code infrastructure} creaba {@code
 * pg_trgm}, {@code unaccent}, {@code btree_gist} y {@code postgis} <b>en las cuatro bases</b>, con
 * la lista escrita a mano, «para que el baseline de cualquiera pueda correr sin sorpresas». C-10
 * hizo que ese guion derive de lo que cada sistema declara, asi que la base de la caja ya nace sin
 * ninguna — y esta prueba es lo que impide que vuelva a dar igual.
 *
 * <h2>Por que aqui y no en `infrastructure`</h2>
 *
 * <p>Porque lo que hay que sujetar no es que un guion no las cree —eso lo mide C-10 leyendo lo que
 * el guion hace—, sino que <b>este esquema no las necesita</b>. Eso solo lo puede decir quien
 * aplica este esquema, y solo aplicandolo.
 *
 * <h2>Por que basta con esto, y donde esta el limite</h2>
 *
 * <p>{@code MotorPostgres.sentenciaDeCreacion} crea la base con {@code TEMPLATE template0}, que por
 * definicion no trae ninguna extension (#706). Asi que la base de cada corrida ya es «el motor mas
 * simple»: lo unico que faltaba era <b>afirmarlo</b>, porque nada distinguia «no necesita ninguna»
 * de «ya se las habia creado alguien».
 *
 * <p><b>Y esa frase era falsa a medias hasta C-21, que es lo que esta prueba destapo.</b> {@code
 * sentenciaDeCreacion} solo la ejecutaba el camino del motor externo —el de local—; el de
 * Testcontainers se quedaba con la base por omision del contenedor, que {@code initdb} crea desde
 * {@code template1}, y la imagen instala PostGIS ahi. Por eso este caso llevaba rojo en CI diciendo
 * {@code ["fuzzystrmatch", "postgis", "postgis_tiger_geocoder", "postgis_topology"]} y verde en
 * toda maquina de desarrollo. Desde C-21 los dos caminos crean su base igual, y la premisa de
 * arriba es cierta se llegue por donde se llegue.
 *
 * <p>Lo que esta prueba NO puede decir es que la IMAGEN del motor pueda ser {@code
 * postgres:16-alpine} en vez de {@code postgis/postgis}. Eso no depende de este esquema sino del
 * cluster, que es <b>uno solo para los cuatro sistemas</b>: basta con que {@code catastro} necesite
 * PostGIS desde {@code V61} para que la imagen tenga que traerlo. Lo que C-10 cambia no es la
 * imagen sino que base recibe la extension. Es el mismo limite que P5E dejo escrito para {@code
 * rentas} y por el mismo motivo: no se toca lo que no se puede medir.
 */
@DisplayName("P5D/C-10 — El esquema de la caja aplica sin ninguna extension")
class BaseSinExtensionesTest {

    /**
     * La unica que PostgreSQL trae de serie: {@code template0} la incluye y no la crea nadie.
     *
     * <p>Excluirla no es una excepcion consentida sino la linea base: si esta prueba exigiera cero
     * filas en {@code pg_extension} estaria en rojo en toda instalacion del mundo.
     */
    private static final String DE_SERIE = "plpgsql";

    private static BaseDeDatosDePrueba base;

    @BeforeAll
    static void provisionar() throws Exception {
        // Crea la base, ejecuta `crear-roles.sql` y aplica las migraciones. Que esto no lance ya
        // es media prueba: es el esquema entero aplicando sobre una base recien nacida.
        base = BaseDeDatosDePrueba.provisionar();
    }

    @AfterAll
    static void cerrar() {
        if (base != null) {
            base.close();
        }
    }

    @Test
    @DisplayName("la base no tiene ninguna extension instalada, ni siquiera de rebote")
    void laBaseNoTieneNingunaExtension() throws SQLException {
        assertThat(extensionesInstaladas())
                .as(
                        "el esquema de la caja aplico entero sobre esta base, asi que cualquier"
                                + " extension que aparezca aqui la creo alguien que no es este sistema:"
                                + " o `crear-roles.sql` volvio a declarar una (P5D la dejo sin ninguna),"
                                + " o el guion que provisiona la base se las crea a todo el mundo, que"
                                + " es el defecto que C-10 cerro en"
                                + " `infrastructure/despliegue/inicializacion-del-motor/05-crear-bases.sh`")
                .isEmpty();
    }

    @Test
    @DisplayName("EL CONTRASTE: y el esquema esta de verdad ahi, no es una base vacia")
    void yElEsquemaEstaDeVerdadAhi() throws SQLException {
        // Sin esto, «cero extensiones» seria compatible con «no se aplico nada»: una base recien
        // creada y sin migrar tambien tiene cero. Lo que se afirma es que el esquema ENTERO aplica
        // sin ninguna, y para eso hay que comprobar que aplico.
        assertThat(cuantas("SELECT count(*) FROM flyway_schema_history WHERE success"))
                .as("no se aplico ninguna migracion: esta prueba no estaria midiendo nada")
                .isGreaterThan(0);

        assertThat(
                        cuantas(
                                "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'"
                                        + " AND tablename <> 'flyway_schema_history'"))
                .as("el esquema de la caja tiene tablas; si aqui sale cero, no aplico nada")
                .isGreaterThan(10);
    }

    @Test
    @DisplayName("y `crear-roles.sql` sigue sin declarar ninguna, que es de donde sale todo")
    void crearRolesSigueSinDeclararNinguna() throws Exception {
        // La otra direccion. Sin esta, alguien podria devolver un `CREATE EXTENSION` al archivo y
        // las dos pruebas de arriba se pondrian rojas sin decir donde esta la causa.
        // Se lee del classpath, que es exactamente el mismo archivo que `provisionar()`
        // acaba de ejecutar: leerlo por ruta relativa diria lo que hay en el arbol y no lo
        // que se aplico.
        String guion;
        try (InputStream recurso =
                BaseSinExtensionesTest.class.getResourceAsStream("/db/roles/crear-roles.sql")) {
            assertThat(recurso).as("no esta /db/roles/crear-roles.sql en el classpath").isNotNull();
            guion = new String(recurso.readAllBytes(), StandardCharsets.UTF_8);
        }
        List<String> declaradas = new ArrayList<>();
        for (String linea : guion.split("\n")) {
            String sql = linea.replaceAll("--.*$", "").trim();
            if (sql.toUpperCase(java.util.Locale.ROOT).startsWith("CREATE EXTENSION")) {
                declaradas.add(sql);
            }
        }

        assertThat(declaradas)
                .as(
                        "P5D dejo este archivo sin ninguna extension a proposito. Los comentarios no"
                                + " cuentan —la cabecera nombra las cuatro para explicar por que NO se"
                                + " declaran—, asi que se quitan antes de mirar: es el mismo reparto que"
                                + " `extensiones_declaradas` hace en shell y la guarda de"
                                + " `infrastructure` en TypeScript")
                .isEmpty();
    }

    private static List<String> extensionesInstaladas() throws SQLException {
        List<String> nombres = new ArrayList<>();
        try (Connection admin = base.conexionAdmin();
                Statement sentencia = admin.createStatement();
                ResultSet filas =
                        sentencia.executeQuery(
                                "SELECT extname FROM pg_extension WHERE extname <> '"
                                        + DE_SERIE
                                        + "' ORDER BY extname")) {
            while (filas.next()) {
                nombres.add(filas.getString(1));
            }
        }
        return nombres;
    }

    private static long cuantas(String consulta) throws SQLException {
        try (Connection admin = base.conexionAdmin();
                Statement sentencia = admin.createStatement();
                ResultSet filas = sentencia.executeQuery(consulta)) {
            filas.next();
            return filas.getLong(1);
        }
    }
}
