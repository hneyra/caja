package kamayuk.caja.seguridad.infraestructura.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import java.io.IOException;
import java.lang.reflect.Method;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import kamayuk.caja.auditoria.Origen;
import kamayuk.caja.auditoria.OrigenContext;
import kamayuk.caja.autorizacion.ComprobadorDeAcceso;
import kamayuk.caja.autorizacion.GuardiaDeAcceso;
import kamayuk.caja.autorizacion.Privilegio;
import kamayuk.caja.autorizacion.RequiereAcceso;
import kamayuk.caja.compartido.TenantContext;
import kamayuk.caja.dominio.MunicipalidadId;
import kamayuk.caja.esquema.BaseDeDatosDePrueba;
import kamayuk.caja.plataforma.tenant.TenantTransactionManager;
import kamayuk.caja.seguridad.aplicacion.CatalogoDeLaCopiaLocal;
import kamayuk.caja.seguridad.aplicacion.IdentidadDeLaSesion;
import kamayuk.caja.seguridad.aplicacion.MunicipalidadDeLaSesion;
import kamayuk.caja.seguridad.aplicacion.PermisosDeLaSesion;
import kamayuk.caja.seguridad.infraestructura.LecturaDeLaCopiaLocalJdbc;
import kamayuk.caja.web.ConfiguracionDeJson;
import kamayuk.caja.web.GuardiaDeParametros;
import kamayuk.caja.web.ManejadorDeErrores;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.http.converter.json.JacksonJsonHttpMessageConverter;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Las cinco lecturas de la sesion de la ventanilla, de HTTP a PostgreSQL y sin un doble por el
 * camino (ADR-0042).
 *
 * <h2>Que mide, y por que asi</h2>
 *
 * <p><b>La forma exacta.</b> La interfaz de esta caja se reconstruye con el metodo de {@code
 * rentas-web}, y lo que lee son estos nombres de campo: un {@code moduloId} que saliera como {@code
 * modulo} deja el arbol sin ramas y ningun rojo en el servidor. Por eso los cuerpos se comparan
 * enteros, o campo a campo por su nombre.
 *
 * <p><b>La transaccion la decide la anotacion.</b> Los cuatro casos de uso van envueltos en un
 * {@link TransactionInterceptor} con {@link AnnotationTransactionAttributeSource}, como el
 * contenedor los proxifica, y el repositorio va <b>sin</b> proxy: quitar la {@code @Transactional}
 * de un caso de uso tiene que dar el 500 de «unrecognized configuration parameter» aqui, que es el
 * defecto que {@code rentas} solo vio levantando la instalacion (etapa 4 de ADR-0039).
 *
 * <p><b>El guardia es el de verdad, con un comprobador que niega todo.</b> Es la unica forma de
 * medir que las cinco se leen con solo un token —ADR-0042 §Decision— sin confiar en que la
 * anotacion diga lo que se cree: con un acceso del catalogo aqui saldria 403. Y ademas se lee la
 * anotacion por reflexion, porque {@code TODO_ENDPOINT_DECLARA_SU_ACCESO} exige que la haya y no
 * <b>cual</b> es, y {@code CatalogoDelSistemaTest} excluye los centinelas y no veria un {@code
 * SESION_PROPIA} cambiado por un acceso que si esta en el catalogo.
 *
 * <p>La conexion es la de {@code kamayuk_app}: lo fija {@link #seConectaComoKamayukApp}.
 */
@DisplayName("ADR-0042 — las cinco lecturas de la sesion, de HTTP a PostgreSQL")
class LecturasDeLaSesionFronteraTest {

    private static final Clock RELOJ =
            Clock.fixed(Instant.parse("2026-03-16T15:00:00Z"), ZoneId.of("America/Lima"));

    private static final String RAIZ = "/caja/api/v1/seguridad";
    private static final String PERMISOS = RAIZ + "/sesion/permisos";
    private static final String SESION = RAIZ + "/sesion";
    private static final String MUNICIPALIDAD = RAIZ + "/sesion/municipalidad";
    private static final String MODULOS = RAIZ + "/modulos";
    private static final String ACCESOS = RAIZ + "/accesos";

    private static final String JPEREZ = "jperez";
    private static final String SIN_PERMISOS = "sin.permisos";

    private static final String UBIGEO_A = "209931";
    private static final String UBIGEO_B = "209932";
    private static final String NOMBRE_A = "Municipalidad Distrital de la Ventanilla A";
    private static final String NOMBRE_B = "Municipalidad Provincial de la Ventanilla B";

    private static final JsonMapper LECTOR = JsonMapper.builder().build();

    private static BaseDeDatosDePrueba base;
    private static JdbcClient jdbc;
    private static MockMvc mvc;
    private static ComprobadorQueNiegaTodo comprobador;

    private static long municipalidadA;
    private static long municipalidadB;
    private static long jperezDeA;
    private static long jperezDeB;
    private static long tesoreriaDeA;
    private static long consultasDeA;

    @BeforeAll
    static void provisionar() throws SQLException, IOException {
        base = BaseDeDatosDePrueba.provisionar();
        municipalidadA = crearMunicipalidad(UBIGEO_A, NOMBRE_A, "DISTRITAL");
        municipalidadB = crearMunicipalidad(UBIGEO_B, NOMBRE_B, "PROVINCIAL");

        // A: TESORERIA va primero en el menu y ultima por codigo, a proposito — asi el orden por
        // omision («orden») y el alfabetico no pueden coincidir por casualidad.
        tesoreriaDeA =
                insertar(
                        "modulo_sistema",
                        "codigo, nombre, orden",
                        municipalidadA,
                        "TESORERIA",
                        "Tesoreria",
                        1);
        consultasDeA =
                insertar(
                        "modulo_sistema",
                        "codigo, nombre, orden",
                        municipalidadA,
                        "CONSULTAS",
                        "Consultas",
                        2);
        long cajaTributaria =
                acceso(
                        municipalidadA,
                        tesoreriaDeA,
                        "OPCION_MENU",
                        "caja_tributaria",
                        "Caja tributaria");
        long cierre =
                acceso(
                        municipalidadA,
                        tesoreriaDeA,
                        "OPCION_MENU",
                        "cierre_caja",
                        "Cierre y arqueo de caja");
        acceso(
                municipalidadA,
                consultasDeA,
                "POLITICA",
                "avance_recaudacion",
                "Avance de recaudacion");
        long cajerosDeA = insertar("grupo", "nombre", municipalidadA, "Cajeros");
        jperezDeA =
                insertar("usuario", "cuenta, nombre", municipalidadA, JPEREZ, "Juana Perez Chero");
        insertar("usuario", "cuenta, nombre", municipalidadA, SIN_PERMISOS, "Cuenta sin permisos");
        miembro(municipalidadA, cajerosDeA, jperezDeA);
        permiso(municipalidadA, cajaTributaria, cajerosDeA, "lectura, impresion");
        permiso(
                municipalidadA,
                cierre,
                cajerosDeA,
                "ejecucion, lectura, registro, modificacion, eliminacion, impresion, especial");

        // B: la MISMA cuenta y el mismo codigo, con otro nombre y otro privilegio.
        long tesoreriaDeB =
                insertar(
                        "modulo_sistema",
                        "codigo, nombre, orden",
                        municipalidadB,
                        "TESORERIA",
                        "Tesoreria",
                        1);
        long cajaTributariaDeB =
                acceso(
                        municipalidadB,
                        tesoreriaDeB,
                        "OPCION_MENU",
                        "caja_tributaria",
                        "Caja tributaria");
        long cajerosDeB = insertar("grupo", "nombre", municipalidadB, "Cajeros");
        jperezDeB =
                insertar(
                        "usuario",
                        "cuenta, nombre",
                        municipalidadB,
                        JPEREZ,
                        "Julio Perez Sandoval");
        miembro(municipalidadB, cajerosDeB, jperezDeB);
        permiso(municipalidadB, cajaTributariaDeB, cajerosDeB, "modificacion");

        DriverManagerDataSource pool = new DriverManagerDataSource();
        pool.setUrl(base.url());
        pool.setUsername(BaseDeDatosDePrueba.APP);
        pool.setPassword(base.clave(BaseDeDatosDePrueba.APP));

        jdbc = JdbcClient.create(pool);
        TenantTransactionManager gestor = new TenantTransactionManager(pool);
        LecturaDeLaCopiaLocalJdbc copiaLocal = new LecturaDeLaCopiaLocalJdbc(jdbc);

        comprobador = new ComprobadorQueNiegaTodo();
        mvc =
                MockMvcBuilders.standaloneSetup(
                                new SesionController(
                                        conLaTransaccionQueDiceLaAnotacion(
                                                new PermisosDeLaSesion(copiaLocal, RELOJ), gestor),
                                        conLaTransaccionQueDiceLaAnotacion(
                                                new IdentidadDeLaSesion(copiaLocal), gestor),
                                        conLaTransaccionQueDiceLaAnotacion(
                                                new MunicipalidadDeLaSesion(copiaLocal), gestor)),
                                new CatalogoDeLaCopiaLocalController(
                                        conLaTransaccionQueDiceLaAnotacion(
                                                new CatalogoDeLaCopiaLocal(copiaLocal), gestor)))
                        .addInterceptors(
                                new GuardiaDeAcceso(comprobador, RELOJ), new GuardiaDeParametros())
                        .setControllerAdvice(new ManejadorDeErrores())
                        .setMessageConverters(
                                new JacksonJsonHttpMessageConverter(
                                        JsonMapper.builder()
                                                .addModule(
                                                        new ConfiguracionDeJson()
                                                                .moduloDeObjetosDeValor())
                                                .build()))
                        .build();
    }

    @AfterAll
    static void cerrar() {
        if (base != null) {
            base.close();
        }
    }

    @BeforeEach
    void fijarContexto() {
        entrarComo(municipalidadA, JPEREZ);
        comprobador.preguntas.clear();
    }

    @AfterEach
    void limpiarContexto() {
        TenantContext.limpiar();
        OrigenContext.limpiar();
    }

    // ------------------------------------------------------------------ permisos

    @Test
    @DisplayName("sesion/permisos: por codigo, los privilegios con su nombre de columna y en orden")
    void laMatrizDeLaSesion() throws Exception {
        MvcResult resultado = mvc.perform(get(PERMISOS)).andReturn();

        assertThat(resultado.getResponse().getStatus())
                .as(
                        "[sin la @Transactional de PermisosDeLaSesion no hay SET LOCAL y la politica"
                                + " RLS no devuelve vacio: revienta, y esto es un 500 (#486). Cuerpo:"
                                + " %s]",
                        resultado.getResponse().getContentAsString())
                .isEqualTo(200);
        assertThat(resultado.getResponse().getContentAsString())
                .as(
                        "los nombres son los de las columnas de `permiso` —los mismos que publica"
                                + " rentas— y el orden el del enum, no el alfabetico")
                .isEqualTo(
                        "{\"caja_tributaria\":[\"lectura\",\"impresion\"],"
                                + "\"cierre_caja\":[\"ejecucion\",\"lectura\",\"registro\","
                                + "\"modificacion\",\"eliminacion\",\"impresion\",\"especial\"]}");
    }

    @Test
    @DisplayName("sesion/permisos: la cuenta sin nada recibe {}, y la que no existe tambien")
    void laCuentaSinNadaRecibeUnObjetoVacio() throws Exception {
        entrarComo(municipalidadA, SIN_PERMISOS);
        assertThat(cuerpoDe(PERMISOS))
                .as(
                        "«esta cuenta no puede abrir nada» es {}, no un 403 ni tres codigos con"
                                + " listas vacias: la interfaz no tiene que distinguir «esta, sin"
                                + " nada» de «no esta»")
                .isEqualTo("{}");

        entrarComo(municipalidadA, "nadie.de.aqui");
        assertThat(cuerpoDe(PERMISOS)).isEqualTo("{}");
    }

    @Test
    @DisplayName("sesion/permisos: desde B, la misma cuenta lee la matriz de B")
    void laMatrizDeBEsLaDeB() throws Exception {
        entrarComo(municipalidadB, JPEREZ);
        assertThat(cuerpoDe(PERMISOS)).isEqualTo("{\"caja_tributaria\":[\"modificacion\"]}");
    }

    // ------------------------------------------------------------------ sesion

    @Test
    @DisplayName("sesion: usuarioId, cuenta y nombre, de la fila de esta municipalidad")
    void quienEsLaSesion() throws Exception {
        assertThat(cuerpoDe(SESION))
                .isEqualTo(
                        "{\"usuarioId\":"
                                + jperezDeA
                                + ",\"cuenta\":\"jperez\",\"nombre\":\"Juana Perez Chero\"}");

        entrarComo(municipalidadB, JPEREZ);
        assertThat(cuerpoDe(SESION))
                .as("la misma cuenta en B es otra fila, con otro id")
                .isEqualTo(
                        "{\"usuarioId\":"
                                + jperezDeB
                                + ",\"cuenta\":\"jperez\",\"nombre\":\"Julio Perez Sandoval\"}");
    }

    @Test
    @DisplayName(
            "sesion: una cuenta que la copia no tiene es 404 NO_ENCONTRADO, no un id inventado")
    void unaCuentaDesconocidaEs404() throws Exception {
        entrarComo(municipalidadA, "nadie.de.aqui");

        MvcResult resultado = mvc.perform(get(SESION)).andReturn();

        assertThat(resultado.getResponse().getStatus()).isEqualTo(404);
        assertThat(resultado.getResponse().getContentAsString())
                .contains("\"codigo\":\"NO_ENCONTRADO\"")
                .contains("nadie.de.aqui");
    }

    // ------------------------------------------------------------------ municipalidad

    @Test
    @DisplayName("sesion/municipalidad: id, ubigeo, nombre verbatim y tipo, de la del token")
    void laMunicipalidadDeLaSesion() throws Exception {
        assertThat(cuerpoDe(MUNICIPALIDAD))
                .isEqualTo(
                        "{\"id\":"
                                + municipalidadA
                                + ",\"ubigeo\":\""
                                + UBIGEO_A
                                + "\",\"nombre\":\""
                                + NOMBRE_A
                                + "\",\"tipo\":\"DISTRITAL\"}");

        entrarComo(municipalidadB, JPEREZ);
        assertThat(cuerpoDe(MUNICIPALIDAD))
                .isEqualTo(
                        "{\"id\":"
                                + municipalidadB
                                + ",\"ubigeo\":\""
                                + UBIGEO_B
                                + "\",\"nombre\":\""
                                + NOMBRE_B
                                + "\",\"tipo\":\"PROVINCIAL\"}");
    }

    // ------------------------------------------------------------------ modulos y accesos

    @Test
    @DisplayName("modulos: el sobre paginado, los cinco campos y por orden del menu")
    void losModulos() throws Exception {
        JsonNode pagina = LECTOR.readTree(cuerpoDe(MODULOS));

        assertThat(pagina.propertyNames())
                .containsExactly(
                        "contenido",
                        "pagina",
                        "tamano",
                        "totalElementos",
                        "totalPaginas",
                        "hayMas");
        assertThat(pagina.path("totalElementos").asLong()).isEqualTo(2);
        JsonNode primero = pagina.path("contenido").get(0);
        assertThat(primero.propertyNames())
                .containsExactly("id", "codigo", "nombre", "orden", "activo");
        assertThat(campo(pagina, "codigo"))
                .as("por «orden» si el cliente no dice otra cosa: TESORERIA va primero")
                .containsExactly("TESORERIA", "CONSULTAS");
        assertThat(campo(pagina, "id"))
                .containsExactly(String.valueOf(tesoreriaDeA), String.valueOf(consultasDeA));
        assertThat(campo(pagina, "orden")).containsExactly("1", "2");
        assertThat(campo(pagina, "activo")).containsExactly("true", "true");
    }

    @Test
    @DisplayName("modulos: se ordena por la lista blanca, y lo que no esta en ella es 422")
    void losModulosSeOrdenanPorLaListaBlanca() throws Exception {
        assertThat(campo(LECTOR.readTree(cuerpoDe(MODULOS + "?ordenarPor=codigo")), "codigo"))
                .containsExactly("CONSULTAS", "TESORERIA");

        MvcResult inyeccion = mvc.perform(get(MODULOS + "?ordenarPor=(SELECT+1)")).andReturn();
        assertThat(inyeccion.getResponse().getStatus()).isEqualTo(422);
    }

    @Test
    @DisplayName("accesos: con ?tamano=200, los seis campos, por codigo y con su modulo")
    void losAccesos() throws Exception {
        JsonNode pagina = LECTOR.readTree(cuerpoDe(ACCESOS + "?tamano=200"));

        assertThat(pagina.path("tamano").asInt())
                .as("la interfaz los pide de una vez: el tope es Paginacion.TAMANO_MAXIMO, 500")
                .isEqualTo(200);
        assertThat(pagina.path("totalElementos").asLong()).isEqualTo(3);
        assertThat(pagina.path("contenido").get(0).propertyNames())
                .containsExactly("id", "moduloId", "tipo", "codigo", "nombre", "activo");
        assertThat(campo(pagina, "codigo"))
                .containsExactly("avance_recaudacion", "caja_tributaria", "cierre_caja");
        assertThat(campo(pagina, "moduloId"))
                .containsExactly(
                        String.valueOf(consultasDeA),
                        String.valueOf(tesoreriaDeA),
                        String.valueOf(tesoreriaDeA));
        assertThat(campo(pagina, "tipo")).containsExactly("POLITICA", "OPCION_MENU", "OPCION_MENU");
    }

    @Test
    @DisplayName("accesos: por encima del tope de 500 es 422, no el catalogo entero")
    void losAccesosTienenTope() throws Exception {
        assertThat(mvc.perform(get(ACCESOS + "?tamano=501")).andReturn().getResponse().getStatus())
                .isEqualTo(422);
    }

    // ------------------------------------------------------------------ el acceso que declaran

    @Test
    @DisplayName("las cinco se leen con solo un token: el guardia no le pregunta nada al catalogo")
    void lasCincoSeLeenSinPermisos() throws Exception {
        entrarComo(municipalidadA, SIN_PERMISOS);
        Map<String, Integer> estados = new TreeMap<>();
        for (String ruta : List.of(PERMISOS, SESION, MUNICIPALIDAD, MODULOS, ACCESOS)) {
            estados.put(ruta, mvc.perform(get(ruta)).andReturn().getResponse().getStatus());
        }

        assertThat(estados)
                .as(
                        "el comprobador niega TODO: con un acceso del catalogo cualquiera de estas"
                                + " seria 403, y una cuenta sin permisos no podria leer que no puede"
                                + " abrir nada (ADR-0042 §Decision)")
                .containsOnly(
                        Map.entry(PERMISOS, 200),
                        Map.entry(SESION, 200),
                        Map.entry(MUNICIPALIDAD, 200),
                        Map.entry(MODULOS, 200),
                        Map.entry(ACCESOS, 200));
        assertThat(comprobador.preguntas)
                .as("SESION_PROPIA no se comprueba contra el catalogo (ADR-0013)")
                .isEmpty();
    }

    @Test
    @DisplayName("y cada una de las cinco DECLARA SESION_PROPIA con LECTURA, leido por reflexion")
    void lasCincoDeclaranSesionPropia() {
        Map<String, String> declarados = new TreeMap<>();
        for (Class<?> controlador :
                List.of(SesionController.class, CatalogoDeLaCopiaLocalController.class)) {
            assertThat(controlador.getAnnotation(RequiereAcceso.class))
                    .as("%s no declara acceso en la clase: lo declara cada metodo", controlador)
                    .isNull();
            for (Method metodo : controlador.getDeclaredMethods()) {
                RequestMapping mapeo =
                        AnnotatedElementUtils.findMergedAnnotation(metodo, RequestMapping.class);
                if (mapeo == null) {
                    continue;
                }
                RequiereAcceso requisito = metodo.getAnnotation(RequiereAcceso.class);
                declarados.put(
                        metodo.getName(),
                        List.of(mapeo.method())
                                + " "
                                + (requisito == null
                                        ? "SIN ANOTACION"
                                        : requisito.acceso()
                                                + "|"
                                                + requisito.privilegio()
                                                + "|"
                                                + List.of(requisito.oTambien())));
            }
        }

        String esperado =
                List.of(RequestMethod.GET)
                        + " "
                        + RequiereAcceso.SESION_PROPIA
                        + "|"
                        + Privilegio.LECTURA
                        + "|[]";
        assertThat(declarados)
                .as(
                        "las cinco, y solo cinco, son GET con SESION_PROPIA y LECTURA, sin"
                                + " alternativas. TODO_ENDPOINT_DECLARA_SU_ACCESO solo exige que haya"
                                + " anotacion, y CatalogoDelSistemaTest no veria un centinela cambiado"
                                + " por un acceso que SI esta en el catalogo")
                .containsOnly(
                        Map.entry("permisosDeLaSesion", esperado),
                        Map.entry("identidadDeLaSesion", esperado),
                        Map.entry("municipalidadDeLaSesion", esperado),
                        Map.entry("modulos", esperado),
                        Map.entry("accesos", esperado));
    }

    @Test
    @DisplayName("el centinela: la prueba se conecta como kamayuk_app y no como otra cosa")
    void seConectaComoKamayukApp() {
        assertThat(jdbc.sql("SELECT current_user").query(String.class).single())
                .as(
                        "con superusuario RLS se omite y la matriz de B podria salir desde A sin que"
                                + " nada lo dijera (#537, #545)")
                .isEqualTo(BaseDeDatosDePrueba.APP);
    }

    // ------------------------------------------------------------------ apoyo

    /** El token ya validado, reducido a lo que los dos filtros de produccion dejan en el hilo. */
    private static void entrarComo(long municipalidad, String cuenta) {
        TenantContext.limpiar();
        TenantContext.fijar(new MunicipalidadId(municipalidad));
        OrigenContext.fijar(new Origen(cuenta, "PC-CAJA-03", "10.4.4.4"));
    }

    private static String cuerpoDe(String ruta) throws Exception {
        MvcResult resultado = mvc.perform(get(ruta)).andReturn();
        assertThat(resultado.getResponse().getStatus())
                .as("%s contesto %s", ruta, resultado.getResponse().getContentAsString())
                .isEqualTo(200);
        return resultado.getResponse().getContentAsString();
    }

    /** El valor de un campo en cada fila del contenido, como texto y en el orden en que salio. */
    private static List<String> campo(JsonNode pagina, String nombre) {
        List<String> valores = new ArrayList<>();
        for (JsonNode fila : pagina.path("contenido")) {
            valores.add(fila.path(nombre).asString());
        }
        return valores;
    }

    @SuppressWarnings("unchecked")
    private static <T> T conLaTransaccionQueDiceLaAnotacion(
            T objetivo, TenantTransactionManager gestor) {
        ProxyFactory fabrica = new ProxyFactory(objetivo);
        fabrica.setProxyTargetClass(true);
        fabrica.addAdvice(
                new TransactionInterceptor(gestor, new AnnotationTransactionAttributeSource()));
        return (T) fabrica.getProxy();
    }

    private static long acceso(long m, long modulo, String tipo, String codigo, String nombre)
            throws SQLException {
        return insertar(
                "acceso", "modulo_id, tipo, codigo, nombre", m, modulo, tipo, codigo, nombre);
    }

    private static void miembro(long m, long grupo, long usuario) throws SQLException {
        try (Connection admin = base.conexionAdmin();
                PreparedStatement sentencia =
                        admin.prepareStatement(
                                "INSERT INTO miembro (municipalidad_id, grupo_id, usuario_id,"
                                        + " usuario_alta) VALUES (?, ?, ?, 'prueba')")) {
            sentencia.setLong(1, m);
            sentencia.setLong(2, grupo);
            sentencia.setLong(3, usuario);
            sentencia.executeUpdate();
        }
    }

    /** Un permiso de grupo con estas columnas en {@code true} y las demas en su {@code false}. */
    private static void permiso(long m, long acceso, long grupo, String columnas)
            throws SQLException {
        String valores = ", true".repeat(columnas.split(",").length);
        try (Connection admin = base.conexionAdmin();
                PreparedStatement sentencia =
                        admin.prepareStatement(
                                "INSERT INTO permiso (municipalidad_id, acceso_id, grupo_id,"
                                        + " usuario_registro, "
                                        + columnas
                                        + ") VALUES (?, ?, ?, 'prueba'"
                                        + valores
                                        + ")")) {
            sentencia.setLong(1, m);
            sentencia.setLong(2, acceso);
            sentencia.setLong(3, grupo);
            sentencia.executeUpdate();
        }
    }

    /** Inserta como superusuario —lo que se prueba es la LECTURA— y devuelve el id. */
    private static long insertar(String tabla, String columnas, long m, Object... valores)
            throws SQLException {
        try (Connection admin = base.conexionAdmin();
                PreparedStatement sentencia =
                        admin.prepareStatement(
                                "INSERT INTO "
                                        + tabla
                                        + " (municipalidad_id, "
                                        + columnas
                                        + ") VALUES (?"
                                        + ", ?".repeat(valores.length)
                                        + ") RETURNING id")) {
            sentencia.setLong(1, m);
            for (int i = 0; i < valores.length; i++) {
                sentencia.setObject(i + 2, valores[i]);
            }
            try (ResultSet fila = sentencia.executeQuery()) {
                fila.next();
                return fila.getLong(1);
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

    /** Niega todo y apunta cada pregunta: asi se mide que SESION_PROPIA no llega a preguntar. */
    private static final class ComprobadorQueNiegaTodo implements ComprobadorDeAcceso {

        private final List<String> preguntas = new ArrayList<>();

        @Override
        public boolean autoriza(
                String usuario, String acceso, Privilegio privilegio, LocalDate fecha) {
            preguntas.add(usuario + "|" + acceso + "|" + privilegio);
            return false;
        }

        @Override
        public boolean conoceAlUsuario(String usuario) {
            preguntas.add(usuario + "|conoceAlUsuario");
            return true;
        }
    }
}
