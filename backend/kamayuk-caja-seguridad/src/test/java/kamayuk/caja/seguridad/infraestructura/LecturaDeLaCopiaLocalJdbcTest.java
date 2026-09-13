package kamayuk.caja.seguridad.infraestructura;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Supplier;
import java.util.stream.Collectors;
import kamayuk.caja.autorizacion.Privilegio;
import kamayuk.caja.compartido.Paginacion;
import kamayuk.caja.compartido.TenantContext;
import kamayuk.caja.dominio.MunicipalidadId;
import kamayuk.caja.esquema.BaseDeDatosDePrueba;
import kamayuk.caja.plataforma.tenant.TenantTransactionManager;
import kamayuk.caja.seguridad.dominio.Identidad;
import kamayuk.caja.seguridad.dominio.Modulo;
import kamayuk.caja.seguridad.dominio.Municipalidad;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * La lectura de la copia local que compone la sesion de la ventanilla, contra PostgreSQL real y
 * como {@code kamayuk_app} (ADR-0042).
 *
 * <h2>El instrumento de la matriz es el guardia de produccion</h2>
 *
 * <p>ADR-0042 no pide «una matriz razonable»: pide la matriz que {@link ComprobadorDeAccesoJdbc}
 * contestaria, par a par. Por eso la prueba central no enumera casos a mano —se escribirian con la
 * misma idea que el SQL y fallarian a la vez—: recorre <b>todos</b> los pares cuenta × acceso ×
 * privilegio del escenario y compara la matriz con {@link ComprobadorDeAccesoJdbc#autoriza} de
 * verdad. Las pruebas de casos sueltos van ademas, para que el rojo diga que regla se rompio y no
 * solo que algo discrepa.
 *
 * <h2>El escenario, y por que tiene cada fila</h2>
 *
 * <p>Cada acceso de la municipalidad A existe para una rama de la precedencia: el grupo que
 * concede, la excepcion que sustituye concediendo otra cosa, la que sustituye negando, los tres
 * grupos que no cuentan (caducado, futuro, deshabilitado), la pertenencia dada de baja, el grupo
 * vigente <b>solo hoy</b> (las vigencias son inclusivas), la union de dos grupos, el acceso sin
 * nada, y los dos accesos <b>desactivados</b> — uno concedido por grupo y otro por excepcion, que
 * es donde este sistema difiere de {@code rentas}. Las cuentas cubren al usuario deshabilitado, al
 * vencido, al futuro, al que existe sin nada y al que no existe.
 *
 * <p>La municipalidad B tiene <b>la misma cuenta y los mismos codigos</b> con otros privilegios: es
 * lo unico que distingue «se leyo la copia de esta municipalidad» de «se leyo la primera fila que
 * habia».
 *
 * <p>Se siembra como superusuario a proposito —lo que esta bajo prueba es la LECTURA— y se lee como
 * {@code kamayuk_app}, con el {@code SET LOCAL} que emite {@link TenantTransactionManager}, el de
 * produccion.
 */
@DisplayName("ADR-0042 — la lectura de la copia local, con la precedencia del guardia")
class LecturaDeLaCopiaLocalJdbcTest {

    private static final LocalDate HOY = LocalDate.of(2026, 3, 16);
    private static final LocalDate AYER = HOY.minusDays(1);
    private static final LocalDate MANANA = HOY.plusDays(1);

    private static final String JPEREZ = "jperez";
    private static final String DESHABILITADO = "deshabilitado";
    private static final String VENCIDO = "vencido";
    private static final String FUTURO = "futuro";
    private static final String SIN_GRUPOS = "sin.grupos";
    private static final String NADIE = "nadie.de.aqui";

    private static final List<String> CUENTAS =
            List.of(JPEREZ, DESHABILITADO, VENCIDO, FUTURO, SIN_GRUPOS, NADIE);

    private static final String UBIGEO_A = "209921";
    private static final String UBIGEO_B = "209922";
    private static final String NOMBRE_A = "Municipalidad Distrital de la Copia A";
    private static final String NOMBRE_B = "Municipalidad Provincial de la Copia B";

    private static BaseDeDatosDePrueba base;
    private static JdbcClient jdbc;
    private static TransactionTemplate transaccion;
    private static LecturaDeLaCopiaLocalJdbc lectura;
    private static ComprobadorDeAccesoJdbc comprobador;

    private static long municipalidadA;
    private static long municipalidadB;
    private static long jperezDeA;
    private static long jperezDeB;
    private static long tesoreriaDeA;
    private static long reportesDeA;
    private static long tesoreriaDeB;

    @BeforeAll
    static void provisionar() throws SQLException, IOException {
        base = BaseDeDatosDePrueba.provisionar();
        municipalidadA = crearMunicipalidad(UBIGEO_A, NOMBRE_A, "DISTRITAL");
        municipalidadB = crearMunicipalidad(UBIGEO_B, NOMBRE_B, "PROVINCIAL");

        sembrarA();
        sembrarB();

        DriverManagerDataSource pool = new DriverManagerDataSource();
        pool.setUrl(base.url());
        pool.setUsername(BaseDeDatosDePrueba.APP);
        pool.setPassword(base.clave(BaseDeDatosDePrueba.APP));

        jdbc = JdbcClient.create(pool);
        transaccion = new TransactionTemplate(new TenantTransactionManager(pool));
        lectura = new LecturaDeLaCopiaLocalJdbc(jdbc);
        comprobador = new ComprobadorDeAccesoJdbc(jdbc);
    }

    @AfterAll
    static void liberar() {
        if (base != null) {
            base.close();
        }
    }

    @AfterEach
    void limpiarContexto() {
        TenantContext.limpiar();
    }

    // ------------------------------------------------------------------ la paridad

    @Test
    @DisplayName("la matriz dice, par a par, lo mismo que el ComprobadorDeAccesoJdbc de produccion")
    void laMatrizDiceLoMismoQueElGuardia() {
        List<String> discrepancias = new ArrayList<>();
        int preguntas = 0;
        int concedidas = 0;

        for (long municipalidad : List.of(municipalidadA, municipalidadB)) {
            List<String> codigos = codigosDeAcceso(municipalidad);
            for (String cuenta : CUENTAS) {
                Map<String, Set<Privilegio>> matriz = matrizEn(municipalidad, cuenta);
                Map<String, Set<Privilegio>> guardia =
                        en(municipalidad, () -> loQueAutorizaElGuardia(cuenta, codigos));
                for (String codigo : codigos) {
                    for (Privilegio privilegio : Privilegio.values()) {
                        boolean autoriza = guardia.get(codigo).contains(privilegio);
                        boolean ofrece = matriz.getOrDefault(codigo, Set.of()).contains(privilegio);
                        preguntas++;
                        if (autoriza) {
                            concedidas++;
                        }
                        if (autoriza != ofrece) {
                            discrepancias.add(
                                    (municipalidad == municipalidadA ? "A " : "B ")
                                            + cuenta
                                            + " "
                                            + codigo
                                            + "|"
                                            + privilegio
                                            + ": el guardia dice "
                                            + autoriza
                                            + " y la matriz "
                                            + ofrece);
                        }
                    }
                }
            }
        }

        assertThat(preguntas)
                .as(
                        "el sujeto: 13 accesos en A y 2 en B, por 6 cuentas y 7 privilegios. Con"
                                + " menos, la paridad se estaria afirmando sobre un escenario que no"
                                + " es el que el javadoc describe")
                .isEqualTo((13 + 2) * CUENTAS.size() * Privilegio.values().length);
        assertThat(concedidas)
                .as(
                        "y el guardia concede algo y niega algo: sobre un escenario donde todo es"
                                + " false, «la matriz coincide» se cumpliria con una matriz vacia")
                .isPositive()
                .isLessThan(preguntas);
        assertThat(discrepancias)
                .as(
                        "ADR-0042: una interfaz que ofrece lo que el guardia luego niega —o esconde"
                                + " lo que permite— es peor que no filtrar. Cada linea es un par en"
                                + " que el arbol y el 403 dirian cosas distintas")
                .isEmpty();
    }

    // ------------------------------------------------------------------ la precedencia, rama a
    // rama

    @Test
    @DisplayName("el permiso del grupo se ve, con sus privilegios y ninguno mas")
    void elPermisoDelGrupoSeVe() {
        assertThat(matrizEn(municipalidadA, JPEREZ).get("caja_tributaria"))
                .containsExactly(Privilegio.LECTURA, Privilegio.IMPRESION);
    }

    @Test
    @DisplayName("dos grupos vigentes se unen, y los siete privilegios salen en el orden del enum")
    void dosGruposSeUnen() {
        Map<String, Set<Privilegio>> matriz = matrizEn(municipalidadA, JPEREZ);

        assertThat(matriz.get("union_de_grupos"))
                .containsExactly(Privilegio.LECTURA, Privilegio.MODIFICACION);
        assertThat(matriz.get("todos")).containsExactly(Privilegio.values());
    }

    @Test
    @DisplayName(
            "la excepcion del usuario SUSTITUYE al grupo: concede lo suyo y quita lo del grupo")
    void laExcepcionSustituyeAlGrupo() {
        assertThat(matrizEn(municipalidadA, JPEREZ).get("caja_tasas"))
                .as(
                        "el grupo concede LECTURA y la excepcion solo REGISTRO: con una union"
                                + " saldrian las dos, y el guardia contestaria 403 a la lectura")
                .containsExactly(Privilegio.REGISTRO);
    }

    @Test
    @DisplayName("y la excepcion que NIEGA todo tambien sustituye: el acceso desaparece")
    void laExcepcionQueNiegaTambienSustituye() {
        assertThat(matrizEn(municipalidadA, JPEREZ))
                .as(
                        "el grupo concede LECTURA y ESPECIAL sobre anulacion_recibo; la excepcion"
                                + " lo niega todo. Es la unica forma de quitarle un permiso a"
                                + " alguien sin sacarlo del grupo")
                .doesNotContainKey("anulacion_recibo");
    }

    @Test
    @DisplayName("un grupo caducado, futuro o deshabilitado no cuenta, ni una pertenencia de baja")
    void losGruposQueNoCuentan() {
        assertThat(matrizEn(municipalidadA, JPEREZ))
                .doesNotContainKey("cierre_caja")
                .doesNotContainKey("avance_recaudacion")
                .doesNotContainKey("recaudacion_area")
                .doesNotContainKey("duplicado_recibo");
    }

    @Test
    @DisplayName("la vigencia es inclusiva: el grupo que vale solo hoy, hoy cuenta")
    void laVigenciaEsInclusiva() {
        assertThat(matrizEn(municipalidadA, JPEREZ).get("vigente_hoy"))
                .containsExactly(Privilegio.EJECUCION);
    }

    @Test
    @DisplayName(
            "el usuario deshabilitado, vencido, futuro o desconocido recibe una matriz vacia,"
                    + " aunque su grupo conceda")
    void elUsuarioQueNoValeRecibeNada() {
        for (String cuenta : List.of(DESHABILITADO, VENCIDO, FUTURO, NADIE)) {
            assertThat(matrizEn(municipalidadA, cuenta))
                    .as(
                            "«%s» esta en Cajeros, que concede caja_tributaria y todos: la"
                                    + " condicion del usuario anula cualquier permiso",
                            cuenta)
                    .isEmpty();
        }
    }

    @Test
    @DisplayName("un acceso sin ningun privilegio no se publica: ni una lista vacia por codigo")
    void loQueNoTienePrivilegiosNoSePublica() {
        assertThat(matrizEn(municipalidadA, SIN_GRUPOS))
                .as("la cuenta existe y no tiene nada: su matriz es {}, no trece codigos vacios")
                .isEmpty();

        Map<String, Set<Privilegio>> deJperez = matrizEn(municipalidadA, JPEREZ);
        assertThat(deJperez)
                .as("y en la de quien si tiene, solo estan los codigos con algo")
                .doesNotContainKey("sin_permiso")
                .doesNotContainKey("retirado_por_grupo");
        assertThat(deJperez.values()).noneMatch(Set::isEmpty);
        assertThat(deJperez.keySet())
                .containsExactly(
                        "caja_tasas",
                        "caja_tributaria",
                        "retirado_con_excepcion",
                        "todos",
                        "union_de_grupos",
                        "vigente_hoy");
    }

    @Test
    @DisplayName(
            "el acceso desactivado: por grupo no concede, por excepcion SI — como el comprobador"
                    + " de esta caja, y no como la lectura de rentas")
    void elAccesoDesactivadoComoElComprobadorDeCaja() {
        Map<String, Set<Privilegio>> matriz = matrizEn(municipalidadA, JPEREZ);

        assertThat(matriz)
                .as("el comprobador exige a.activo en la rama del grupo")
                .doesNotContainKey("retirado_por_grupo");
        assertThat(matriz.get("retirado_con_excepcion"))
                .as(
                        "y NO en la de la excepcion: el guardia de esta caja autoriza ESPECIAL"
                                + " sobre un acceso desactivado si la excepcion lo concede. La"
                                + " lectura de rentas lo esconderia, y aqui el arbol esconderia algo"
                                + " que el guardia deja hacer")
                .containsExactly(Privilegio.ESPECIAL);
        assertThat(en(municipalidadA, () -> concedeEspecial(JPEREZ, "retirado_con_excepcion")))
                .as("medido contra el comprobador de produccion, no supuesto")
                .isTrue();
    }

    // ------------------------------------------------------------------ el aislamiento

    @Test
    @DisplayName("la misma cuenta y los mismos codigos: cada municipalidad contesta con lo suyo")
    void cadaMunicipalidadConLoSuyo() {
        assertThat(matrizEn(municipalidadB, JPEREZ))
                .as(
                        "B tiene caja_tributaria y caja_tasas con otros privilegios, y la misma"
                                + " cuenta: si se leyera la copia de A, esto traeria la IMPRESION"
                                + " y el REGISTRO de A")
                .containsOnlyKeys("caja_tasas", "caja_tributaria")
                .containsEntry("caja_tributaria", EnumSet.of(Privilegio.MODIFICACION))
                .containsEntry("caja_tasas", EnumSet.of(Privilegio.LECTURA));
        assertThat(matrizEn(municipalidadA, JPEREZ))
                .containsEntry(
                        "caja_tributaria", EnumSet.of(Privilegio.LECTURA, Privilegio.IMPRESION))
                .containsEntry("caja_tasas", EnumSet.of(Privilegio.REGISTRO));
    }

    @Test
    @DisplayName("la cuenta se resuelve a la fila de SU municipalidad")
    void laCuentaSeResuelveEnSuMunicipalidad() {
        assertThat(en(municipalidadA, () -> lectura.usuarioPorCuenta(JPEREZ)))
                .contains(new Identidad(jperezDeA, JPEREZ, "Juana Perez Chero"));
        assertThat(en(municipalidadB, () -> lectura.usuarioPorCuenta(JPEREZ)))
                .contains(new Identidad(jperezDeB, JPEREZ, "Julio Perez Sandoval"));
        assertThat(en(municipalidadB, () -> lectura.usuarioPorCuenta(SIN_GRUPOS)))
                .as("«sin.grupos» existe en A y no en B")
                .isEmpty();
    }

    @Test
    @DisplayName("la municipalidad de la sesion es la fila de A desde A, y la de B desde B")
    void laMunicipalidadDeLaSesionEsLaSuya() {
        assertThat(en(municipalidadA, () -> lectura.municipalidadDeLaSesion()))
                .as(
                        "municipalidad se lee con USING (true): sin el WHERE id ="
                                + " current_setting(...) salen todas las filas del registro, y lo"
                                + " unico que aisla esta lectura es ese WHERE")
                .contains(new Municipalidad(municipalidadA, UBIGEO_A, NOMBRE_A, "DISTRITAL"));
        assertThat(en(municipalidadB, () -> lectura.municipalidadDeLaSesion()))
                .contains(new Municipalidad(municipalidadB, UBIGEO_B, NOMBRE_B, "PROVINCIAL"));
    }

    @Test
    @DisplayName("los modulos y los accesos son los de la municipalidad del contexto")
    void losModulosYLosAccesosSonLosSuyos() {
        List<Modulo> deA =
                en(municipalidadA, () -> lectura.modulos(Paginacion.de(0, 20, "orden")))
                        .contenido();
        assertThat(deA)
                .containsExactly(
                        new Modulo(tesoreriaDeA, "TESORERIA", "Tesoreria", 1, true),
                        new Modulo(reportesDeA, "REPORTES", "Reportes", 2, true));
        assertThat(
                        en(municipalidadB, () -> lectura.modulos(Paginacion.de(0, 20, "orden")))
                                .contenido())
                .containsExactly(new Modulo(tesoreriaDeB, "TESORERIA", "Tesoreria", 1, true));

        assertThat(
                        en(municipalidadA, () -> lectura.accesos(Paginacion.de(0, 200, "codigo")))
                                .totalElementos())
                .isEqualTo(13);
        assertThat(
                        en(municipalidadB, () -> lectura.accesos(Paginacion.de(0, 200, "codigo")))
                                .contenido()
                                .stream()
                                .map(acceso -> acceso.codigo() + "@" + acceso.moduloId())
                                .toList())
                .containsExactly("caja_tasas@" + tesoreriaDeB, "caja_tributaria@" + tesoreriaDeB);
    }

    @Test
    @DisplayName("el centinela: la prueba se conecta como kamayuk_app y no como otra cosa")
    void seConectaComoKamayukApp() {
        assertThat(jdbc.sql("SELECT current_user").query(String.class).single())
                .as(
                        "con superusuario RLS se omite —incluso con FORCE ROW LEVEL SECURITY— y el"
                                + " aislamiento de arriba pasaria sin verificar nada; con"
                                + " kamayuk_owner tampoco basta (#537, #545)")
                .isEqualTo(BaseDeDatosDePrueba.APP);
    }

    // ------------------------------------------------------------------ apoyo

    private static Map<String, Set<Privilegio>> matrizEn(long municipalidad, String cuenta) {
        return en(municipalidad, () -> lectura.permisosEfectivosDe(cuenta, HOY));
    }

    /** Todas las preguntas al guardia de una cuenta, en UNA transaccion: son cientos. */
    private static Map<String, Set<Privilegio>> loQueAutorizaElGuardia(
            String cuenta, List<String> codigos) {
        return codigos.stream()
                .collect(
                        Collectors.toMap(
                                codigo -> codigo,
                                codigo -> {
                                    Set<Privilegio> concedidos = EnumSet.noneOf(Privilegio.class);
                                    for (Privilegio privilegio : Privilegio.values()) {
                                        if (comprobador.autoriza(cuenta, codigo, privilegio, HOY)) {
                                            concedidos.add(privilegio);
                                        }
                                    }
                                    return concedidos;
                                }));
    }

    private static boolean concedeEspecial(String cuenta, String codigo) {
        return comprobador.autoriza(cuenta, codigo, Privilegio.ESPECIAL, HOY);
    }

    private static <T> T en(long municipalidad, Supplier<T> consulta) {
        TenantContext.fijar(new MunicipalidadId(municipalidad));
        try {
            return transaccion.execute(estado -> consulta.get());
        } finally {
            TenantContext.limpiar();
        }
    }

    private static List<String> codigosDeAcceso(long municipalidad) {
        List<String> codigos = new ArrayList<>();
        try (Connection admin = base.conexionAdmin();
                PreparedStatement sentencia =
                        admin.prepareStatement(
                                "SELECT codigo FROM acceso WHERE municipalidad_id = ?"
                                        + " ORDER BY codigo")) {
            sentencia.setLong(1, municipalidad);
            try (ResultSet filas = sentencia.executeQuery()) {
                while (filas.next()) {
                    codigos.add(filas.getString(1));
                }
            }
        } catch (SQLException fallo) {
            throw new IllegalStateException(fallo);
        }
        return codigos;
    }

    /**
     * La municipalidad A: un acceso por cada rama de la precedencia. Ver el javadoc de la clase.
     */
    private static void sembrarA() throws SQLException {
        long m = municipalidadA;
        tesoreriaDeA =
                insertar(m, "modulo_sistema", "codigo, nombre, orden", "TESORERIA", "Tesoreria", 1);
        reportesDeA =
                insertar(m, "modulo_sistema", "codigo, nombre, orden", "REPORTES", "Reportes", 2);

        long cajaTributaria = acceso(m, tesoreriaDeA, "caja_tributaria", true);
        long cajaTasas = acceso(m, tesoreriaDeA, "caja_tasas", true);
        long anulacion = acceso(m, tesoreriaDeA, "anulacion_recibo", true);
        long cierre = acceso(m, tesoreriaDeA, "cierre_caja", true);
        long avance = acceso(m, tesoreriaDeA, "avance_recaudacion", true);
        long recaudacion = acceso(m, tesoreriaDeA, "recaudacion_area", true);
        long duplicado = acceso(m, tesoreriaDeA, "duplicado_recibo", true);
        long retiradoPorGrupo = acceso(m, tesoreriaDeA, "retirado_por_grupo", false);
        long retiradoConExcepcion = acceso(m, tesoreriaDeA, "retirado_con_excepcion", false);
        long vigenteHoy = acceso(m, tesoreriaDeA, "vigente_hoy", true);
        long todos = acceso(m, reportesDeA, "todos", true);
        acceso(m, reportesDeA, "sin_permiso", true);
        long union = acceso(m, reportesDeA, "union_de_grupos", true);

        long cajeros = grupo(m, "Cajeros", true, null, null);
        long caducado = grupo(m, "Caducado", true, null, AYER);
        long futuro = grupo(m, "Futuro", true, MANANA, null);
        long deshabilitado = grupo(m, "Deshabilitado", false, null, null);
        long deBaja = grupo(m, "Con la pertenencia de baja", true, null, null);
        long soloHoy = grupo(m, "Vigente solo hoy", true, HOY, HOY);

        jperezDeA = usuario(m, JPEREZ, "Juana Perez Chero", true, null, null);
        for (long g : List.of(cajeros, caducado, futuro, deshabilitado, soloHoy)) {
            miembro(m, g, jperezDeA, true);
        }
        miembro(m, deBaja, jperezDeA, false);
        miembro(
                m,
                cajeros,
                usuario(m, DESHABILITADO, "Usuario deshabilitado", false, null, null),
                true);
        miembro(m, cajeros, usuario(m, VENCIDO, "Usuario vencido", true, null, AYER), true);
        miembro(m, cajeros, usuario(m, FUTURO, "Usuario futuro", true, MANANA, null), true);
        usuario(m, SIN_GRUPOS, "Usuario sin grupos", true, null, null);

        permisoDeGrupo(m, cajaTributaria, cajeros, Privilegio.LECTURA, Privilegio.IMPRESION);
        permisoDeGrupo(m, cajaTasas, cajeros, Privilegio.LECTURA);
        excepcion(m, cajaTasas, jperezDeA, Privilegio.REGISTRO);
        permisoDeGrupo(m, anulacion, cajeros, Privilegio.LECTURA, Privilegio.ESPECIAL);
        excepcion(m, anulacion, jperezDeA);
        permisoDeGrupo(m, cierre, caducado, Privilegio.values());
        permisoDeGrupo(m, avance, futuro, Privilegio.LECTURA);
        permisoDeGrupo(m, recaudacion, deshabilitado, Privilegio.LECTURA);
        permisoDeGrupo(m, duplicado, deBaja, Privilegio.LECTURA);
        permisoDeGrupo(m, retiradoPorGrupo, cajeros, Privilegio.LECTURA);
        excepcion(m, retiradoConExcepcion, jperezDeA, Privilegio.ESPECIAL);
        permisoDeGrupo(m, vigenteHoy, soloHoy, Privilegio.EJECUCION);
        permisoDeGrupo(m, todos, cajeros, Privilegio.values());
        permisoDeGrupo(m, todos, soloHoy, Privilegio.LECTURA);
        permisoDeGrupo(m, union, cajeros, Privilegio.LECTURA);
        permisoDeGrupo(m, union, soloHoy, Privilegio.MODIFICACION);
    }

    /** La municipalidad B: la MISMA cuenta y los mismos dos codigos, con otros privilegios. */
    private static void sembrarB() throws SQLException {
        long m = municipalidadB;
        tesoreriaDeB =
                insertar(m, "modulo_sistema", "codigo, nombre, orden", "TESORERIA", "Tesoreria", 1);
        long cajaTributaria = acceso(m, tesoreriaDeB, "caja_tributaria", true);
        long cajaTasas = acceso(m, tesoreriaDeB, "caja_tasas", true);
        long cajeros = grupo(m, "Cajeros", true, null, null);
        jperezDeB = usuario(m, JPEREZ, "Julio Perez Sandoval", true, null, null);
        miembro(m, cajeros, jperezDeB, true);
        permisoDeGrupo(m, cajaTributaria, cajeros, Privilegio.MODIFICACION);
        permisoDeGrupo(m, cajaTasas, cajeros, Privilegio.LECTURA);
    }

    private static long acceso(long m, long modulo, String codigo, boolean activo)
            throws SQLException {
        return insertar(
                m,
                "acceso",
                "modulo_id, tipo, codigo, nombre, activo",
                modulo,
                "OPCION_MENU",
                codigo,
                "Acceso " + codigo,
                activo);
    }

    private static long grupo(
            long m,
            String nombre,
            boolean habilitado,
            @Nullable LocalDate desde,
            @Nullable LocalDate hasta)
            throws SQLException {
        return insertar(
                m,
                "grupo",
                "nombre, habilitado, vigencia_desde, vigencia_hasta",
                nombre,
                habilitado,
                desde,
                hasta);
    }

    private static long usuario(
            long m,
            String cuenta,
            String nombre,
            boolean habilitado,
            @Nullable LocalDate desde,
            @Nullable LocalDate hasta)
            throws SQLException {
        return insertar(
                m,
                "usuario",
                "cuenta, nombre, habilitado, vigencia_desde, vigencia_hasta",
                cuenta,
                nombre,
                habilitado,
                desde,
                hasta);
    }

    private static void miembro(long m, long grupo, long usuario, boolean activo)
            throws SQLException {
        ejecutar(
                "INSERT INTO miembro (municipalidad_id, grupo_id, usuario_id, usuario_alta, activo)"
                        + " VALUES (?, ?, ?, 'prueba', ?)",
                m,
                grupo,
                usuario,
                activo);
    }

    private static void permisoDeGrupo(long m, long acceso, long grupo, Privilegio... privilegios)
            throws SQLException {
        permiso(m, acceso, "grupo_id", grupo, privilegios);
    }

    /** Una excepcion de usuario: concede EXACTAMENTE estos, y niega los otros. */
    private static void excepcion(long m, long acceso, long usuario, Privilegio... privilegios)
            throws SQLException {
        permiso(m, acceso, "usuario_id", usuario, privilegios);
    }

    private static void permiso(
            long m, long acceso, String sujeto, long id, Privilegio... privilegios)
            throws SQLException {
        Set<Privilegio> concedidos = EnumSet.noneOf(Privilegio.class);
        concedidos.addAll(Arrays.asList(privilegios));
        StringBuilder columnas = new StringBuilder();
        StringBuilder valores = new StringBuilder();
        for (Privilegio privilegio : Privilegio.values()) {
            columnas.append(", ").append(privilegio.columna());
            valores.append(", ").append(concedidos.contains(privilegio));
        }
        ejecutar(
                "INSERT INTO permiso (municipalidad_id, acceso_id, "
                        + sujeto
                        + ", usuario_registro"
                        + columnas
                        + ") VALUES (?, ?, ?, 'prueba'"
                        + valores
                        + ")",
                m,
                acceso,
                id);
    }

    private static long insertar(long m, String tabla, String columnas, Object... valores)
            throws SQLException {
        String marcas = "?" + ", ?".repeat(valores.length);
        try (Connection admin = base.conexionAdmin();
                PreparedStatement sentencia =
                        admin.prepareStatement(
                                "INSERT INTO "
                                        + tabla
                                        + " (municipalidad_id, "
                                        + columnas
                                        + ") VALUES ("
                                        + marcas
                                        + ") RETURNING id")) {
            sentencia.setLong(1, m);
            enlazar(sentencia, 2, valores);
            try (ResultSet fila = sentencia.executeQuery()) {
                fila.next();
                return fila.getLong(1);
            }
        }
    }

    private static void ejecutar(String sql, Object... valores) throws SQLException {
        try (Connection admin = base.conexionAdmin();
                PreparedStatement sentencia = admin.prepareStatement(sql)) {
            enlazar(sentencia, 1, valores);
            sentencia.executeUpdate();
        }
    }

    private static void enlazar(PreparedStatement sentencia, int desde, Object... valores)
            throws SQLException {
        for (int i = 0; i < valores.length; i++) {
            Object valor = valores[i];
            if (valor == null) {
                sentencia.setNull(desde + i, Types.DATE);
            } else {
                sentencia.setObject(desde + i, valor);
            }
        }
    }

    private static long crearMunicipalidad(String ubigeo, String nombre, String tipo)
            throws SQLException {
        try (Connection admin = base.conexionAdmin();
                PreparedStatement sentencia =
                        admin.prepareStatement(
                                "INSERT INTO municipalidad (ubigeo, nombre, tipo)"
                                        + " VALUES (?, ?, ?) RETURNING id")) {
            sentencia.setString(1, ubigeo);
            sentencia.setString(2, nombre);
            sentencia.setString(3, tipo);
            try (ResultSet fila = sentencia.executeQuery()) {
                fila.next();
                return fila.getLong(1);
            }
        }
    }
}
