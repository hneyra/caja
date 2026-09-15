package kamayuk.caja.verificaciones;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.sql.SQLException;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import kamayuk.caja.KamayukAplicacion;
import kamayuk.caja.autorizacion.ComprobadorDeAcceso;
import kamayuk.caja.esquema.BaseDeDatosDePrueba;
import kamayuk.caja.nucleo.infraestructura.ClienteHttpDelSistemaDeOrigen;
import kamayuk.caja.nucleo.infraestructura.ComponedorDeEventosJson;
import kamayuk.caja.nucleo.infraestructura.PublicadorDelBuzon;
import kamayuk.caja.nucleo.infraestructura.web.CierreController;
import kamayuk.caja.web.Api;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.scheduling.config.ScheduledTask;
import org.springframework.scheduling.config.ScheduledTaskHolder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.web.context.WebApplicationContext;

/**
 * {@code caja} arranca. Los tres perfiles —{@code web}, {@code batch} y, desde #79, {@code
 * publicador}—, con el artefacto de verdad.
 *
 * <h2>El hueco que cierra (C-7)</h2>
 *
 * <p>C-6 midio, intentando sembrar la demostracion, que <b>ninguno de los cuatro sistemas
 * arrancaba, en ningun perfil</b>. Dos causas: los clientes HTTP entre sistemas inyectaban el
 * {@code ObjectMapper} de <b>Jackson 2</b> y Spring Boot 4 solo autoconfigura el {@code JsonMapper}
 * de <b>Jackson 3</b>; y {@code ComprobadorDeAcceso} no lo implementaba nadie fuera de {@code
 * rentas}. Las dos son fallos de <b>ensamblaje</b>: el contexto no levanta.
 *
 * <p>Y ninguna de las pruebas que habia podia verlas. Las de capa web montan un {@code
 * standaloneSetup} con los colaboradores puestos a mano; las de persistencia hablan con PostgreSQL
 * desde dentro de una transaccion que abre la propia prueba; y las que necesitan un mapeador lo
 * construyen con {@code new}. <b>Ninguna pide un bean al contexto</b>, asi que un bean que falta no
 * pone nada en rojo — el sintoma aparece la primera vez que alguien arranca el jar.
 *
 * <h2>Por que el contexto ENTERO y no un {@code ApplicationContextRunner}</h2>
 *
 * <p>Porque lo que falla es el ensamblaje del artefacto que se despliega: {@code KamayukAplicacion}
 * con sus {@code @Import}, su {@code @SpringBootApplication} y el {@code application.yaml} que
 * viaja en el jar. Un contexto armado a mano con las clases que uno recuerda es exactamente el
 * lugar donde un bean que falta no se nota.
 *
 * <h2>Como se demuestra que muerde</h2>
 *
 * <ul>
 *   <li>Quitandole al modulo {@code kamayuk-caja-seguridad} el {@code ComprobadorDeAccesoJdbc} —o
 *       su {@code @Component}—: «required a bean of type ComprobadorDeAcceso that could not be
 *       found».
 *   <li>Devolviendo cualquiera de los clientes HTTP a {@code
 *       com.fasterxml.jackson.databind.ObjectMapper}: «required a bean of type ObjectMapper that
 *       could not be found».
 * </ul>
 *
 * <p>Las dos dejan el contexto sin levantar, asi que caen <b>todos</b> los casos de esta clase.
 */
@SpringBootTest(
        classes = KamayukAplicacion.class,
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "spring.profiles.active=web",
            // El emisor no se alcanza y no hace falta que se alcance: Spring Boot construye un
            // decodificador PEREZOSO —solo va a la red al validar el primer token— y aqui no se
            // valida ninguno. Lo que se comprueba es que la cadena se monta, que es lo que falta
            // cuando la variable no esta puesta.
            "KAMAYUK_OIDC_EMISOR=https://identidad.invalido/realms/kamayuk",
            "KAMAYUK_CAJA_RESPONSABLE=Jefa de Tesoreria",
            "KAMAYUK_CAJA_CANAL=tesoreria@municipalidad.gob.pe",
        })
@DisplayName("C-7 — caja arranca, en sus tres perfiles")
class ArranqueDeLaAplicacionTest {

    private static BaseDeDatosDePrueba base;

    /**
     * Se provisiona en un bloque estatico y no en {@code @BeforeAll} porque {@link
     * DynamicPropertySource} corre antes: el contexto necesita la URL de la base ya resuelta.
     *
     * <p>La base es real y la aplicacion se conecta como {@code kamayuk_app}, igual que en
     * produccion. No es por rigor de aislamiento —aqui no se lee ni una fila de negocio— sino
     * porque un arranque contra una URL inventada no distingue «arranca» de «arranca y no llega a
     * la base»: la sonda de salud consulta la base, y es lo que el orquestador mira para dar el pod
     * por vivo.
     */
    static {
        try {
            base = BaseDeDatosDePrueba.provisionar();
        } catch (SQLException | IOException noSePudo) {
            throw new IllegalStateException(
                    "No se pudo provisionar la base de la prueba", noSePudo);
        }
    }

    /**
     * Se llenan las <b>variables que pone el descriptor</b> —{@code KAMAYUK_DB_URL} y las suyas—,
     * no las propiedades de Spring que hay debajo. Es la diferencia entre comprobar que la
     * aplicacion arranca y comprobar que arranca <b>con la configuracion que el despliegue le
     * entrega</b>: un {@code application.yaml} que dejara de leer una de estas variables pasaria
     * inadvertido si la prueba escribiera {@code spring.datasource.url} directamente.
     */
    @DynamicPropertySource
    static void configurar(DynamicPropertyRegistry propiedades) {
        propiedades.add("KAMAYUK_DB_URL", base::url);
        propiedades.add("KAMAYUK_DB_USUARIO", () -> BaseDeDatosDePrueba.APP);
        propiedades.add("KAMAYUK_DB_CLAVE", () -> base.clave(BaseDeDatosDePrueba.APP));
    }

    @AfterAll
    static void liberar() {
        if (base != null) {
            base.close();
        }
    }

    @LocalServerPort private int puerto;

    private final HttpClient cliente = HttpClient.newHttpClient();

    @Test
    @DisplayName("el perfil web levanta con todos sus beans")
    void elPerfilWebLevanta(org.springframework.context.ApplicationContext contexto) {
        assertThat(contexto.getBeanNamesForType(ComponedorDeEventosJson.class))
                .as("quien escribe el cuerpo de cada evento de pago")
                .isNotEmpty();

        assertThat(contexto.getBeanNamesForType(ClienteHttpDelSistemaDeOrigen.class))
                .as("el unico camino de la caja hacia otro sistema")
                .isNotEmpty();

        assertThat(contexto.getBeanNamesForType(ComprobadorDeAcceso.class))
                .as("el puerto que el guardia pide en cada peticion")
                .isNotEmpty();

        assertThat(contexto.getBeanNamesForType(CierreController.class))
                .as("el controlador que C-6 vio caerse por el comprobador que faltaba")
                .isNotEmpty();

        assertThat(contexto.getBeanNamesForType(PublicadorDelBuzon.class))
                .as(
                        "el publicador no va en web (#79): con replicas, varios publicadores gastan"
                                + " intentos de mas sobre el mismo buzon")
                .isEmpty();
    }

    @Test
    @DisplayName("y sirve: la sonda de salud contesta 200 y llega a la base")
    void laSondaContesta() throws Exception {
        HttpResponse<String> respuesta = pedir("/actuator/health");

        assertThat(respuesta.statusCode())
                .as(
                        "es lo que el orquestador mira para dar el pod por vivo, y consulta la"
                                + " base: un 503 aqui es un despliegue que nunca pasa a Ready")
                .isEqualTo(200);
        assertThat(respuesta.body()).contains("\"status\":\"UP\"");
    }

    @Test
    @DisplayName("y la cadena de seguridad esta montada: sin token, 401 en problem+json")
    void sinTokenNoSeEntra() throws Exception {
        HttpResponse<String> respuesta = pedir(Api.RAIZ + "/no-importa-cual");

        assertThat(respuesta.statusCode())
                .as("un 200 aqui seria la API entera abierta; un 500, la cadena sin montar")
                .isEqualTo(401);
        assertThat(respuesta.headers().firstValue("Content-Type").orElse(""))
                .startsWith("application/problem+json");
    }

    /**
     * El perfil {@code batch}, arrancado aparte.
     *
     * <p>Es el perfil del Job de implantacion y el de las corridas masivas, y es <b>el que C-6
     * midio</b>. No comparte contexto con el de arriba a proposito: {@code batch} apaga el servidor
     * web, asi que ni {@code ConfiguracionDeAutorizacion} —que es
     * {@code @ConditionalOnWebApplication}— ni los controladores se instancian. Que uno de los dos
     * levante no dice nada del otro, y eso es justo lo que hizo que el defecto sobreviviera: el jar
     * se probaba en {@code batch}, donde el comprobador de acceso no se pide.
     *
     * <p>Se arranca con {@code SpringApplicationBuilder} y no con {@code main}: {@code main} llama
     * a {@code System.exit} en este perfil (ADR-0003), que es correcto en un contenedor de un solo
     * uso y mataria la JVM de las pruebas.
     */
    @Test
    @DisplayName("y el perfil batch levanta tambien, sin servidor web")
    void elPerfilBatchLevanta() {
        try (ConfigurableApplicationContext contexto =
                new SpringApplicationBuilder(KamayukAplicacion.class)
                        .profiles("batch")
                        .web(org.springframework.boot.WebApplicationType.NONE)
                        .properties(
                                "KAMAYUK_DB_URL=" + base.url(),
                                "KAMAYUK_DB_USUARIO=" + BaseDeDatosDePrueba.APP,
                                "KAMAYUK_DB_CLAVE=" + base.clave(BaseDeDatosDePrueba.APP),
                                "KAMAYUK_CAJA_RESPONSABLE=Jefa de Tesoreria",
                                "KAMAYUK_CAJA_CANAL=tesoreria@municipalidad.gob.pe")
                        .run()) {
            assertThat(contexto.isActive()).isTrue();

            // #79: el perfil del `CronJob` del consumidor de `identidad` TERMINA. Un `Job` que no
            // acaba deja a `concurrencyPolicy: Forbid` sin lanzar el siguiente, y la copia local
            // de la autorizacion se queda congelada sin un solo rojo.
            assertThat(KamayukAplicacion.terminaAlAcabar(contexto.getEnvironment()))
                    .as("el perfil batch tiene que salir al acabar sus ApplicationRunner")
                    .isTrue();

            // Y NO saca el buzon. Planificar, en `batch` SI se planifica —y no por nada de este
            // repositorio: `MomentsAutoConfiguration`, de `spring-modulith-starter-core`, declara
            // `@EnableScheduling` en todos los perfiles, y por eso aqui se ven sus dos tareas—.
            // Lo que no puede estar es el publicador: hasta #79 estaba, y corria unos segundos en
            // cada Job de implantacion y en cada CronJob del consumidor, con un entorno sin
            // `KAMAYUK_CAJA_ORIGENES` ni credencial. Cada vuelta le cuenta un intento a cada pago
            // pendiente contra un `rentas:8080` que en el cluster no existe.
            assertThat(contexto.getBeanNamesForType(PublicadorDelBuzon.class))
                    .as(
                            "el publicador del buzon no es de batch: ahi gasta intentos y lo corta la salida")
                    .isEmpty();
            assertThat(tareasPlanificadas(contexto))
                    .as("ninguna tarea del publicador en el proceso que termina")
                    .noneSatisfy(tarea -> assertThat(tarea).contains("PublicadorDelBuzon"));
        }
    }

    /**
     * El perfil {@code publicador}, arrancado aparte (#79).
     *
     * <h2>Lo que mide, y por que asi</h2>
     *
     * <p>Hasta #79 el buzon de pagos no lo sacaba nadie en el clúster: {@code PublicadorDelBuzon}
     * era un {@code @Scheduled} del perfil {@code batch}, sin un solo {@code @EnableScheduling} en
     * el sistema, y el descriptor no desplegaba ningun proceso que lo llevara. Ahora corre en su
     * propio perfil, en un {@code Deployment}, y eso son <b>tres</b> afirmaciones distintas:
     *
     * <ol>
     *   <li><b>planifica</b>: el metodo del publicador esta entre las tareas del planificador;
     *   <li><b>no arranca ningun {@code ApplicationRunner}</b>: ni el consumidor de {@code
     *       identidad} —aunque {@code kamayuk.identidad.url} este puesta, que es lo que lo activa
     *       en {@code batch}—, ni la implantacion, ni la carga de cajas;
     *   <li>y <b>no termina</b>: {@link KamayukAplicacion#terminaAlAcabar} dice que no, y ademas el
     *       contexto deja vivo al menos un hilo que no es demonio. Lo segundo no es redundante: con
     *       hilos virtuales el planificador corre en hilos demonio, y un proceso al que {@code
     *       main} no manda salir sale igual si no le queda ningun otro. Se mide como diferencia
     *       entre antes y despues de arrancar, porque la JVM de las pruebas ya tiene los suyos.
     * </ol>
     *
     * <p>No se le pasa {@code .web(...)}: que no levante servidor lo tiene que decir el {@code
     * application.yaml} del jar, que es lo que el {@code Deployment} recibe.
     */
    @Test
    @DisplayName("y el perfil publicador planifica el buzon, no arranca runners y no termina")
    void elPerfilPublicadorPlanificaYNoTermina() {
        Set<Thread> antes = hilosQueNoSonDemonio();
        try (ConfigurableApplicationContext contexto =
                new SpringApplicationBuilder(KamayukAplicacion.class)
                        .profiles(PublicadorDelBuzon.PERFIL)
                        .properties(
                                "KAMAYUK_DB_URL=" + base.url(),
                                "KAMAYUK_DB_USUARIO=" + BaseDeDatosDePrueba.APP,
                                "KAMAYUK_DB_CLAVE=" + base.clave(BaseDeDatosDePrueba.APP),
                                "KAMAYUK_CAJA_RESPONSABLE=Jefa de Tesoreria",
                                "KAMAYUK_CAJA_CANAL=tesoreria@municipalidad.gob.pe",
                                // La que activa el consumidor en `batch`. Aqui tiene que dar igual.
                                "kamayuk.identidad.url=http://identidad.invalido/identidad/api/v1")
                        .run()) {
            assertThat(contexto)
                    .as("el publicador no atiende HTTP, y lo tiene que decir el application.yaml")
                    .isNotInstanceOf(WebApplicationContext.class);

            assertThat(tareasPlanificadas(contexto))
                    .as(
                            "sin @EnableScheduling el @Scheduled no lo planifica nadie y el buzon"
                                    + " se queda como esta: pago_evento = 0 en rentas (stg, #79)")
                    .anySatisfy(tarea -> assertThat(tarea).contains("PublicadorDelBuzon.publicar"));

            assertThat(contexto.getBeansOfType(ApplicationRunner.class))
                    .as(
                            "un ApplicationRunner en el publicador correria al arrancar cada pod: el"
                                    + " consumidor de identidad es del CronJob, y la implantacion"
                                    + " de su Job")
                    .isEmpty();

            assertThat(KamayukAplicacion.terminaAlAcabar(contexto.getEnvironment()))
                    .as("es un Deployment: si main lo manda salir, CrashLoopBackOff")
                    .isFalse();

            Set<Thread> nuevos = hilosQueNoSonDemonio();
            nuevos.removeAll(antes);
            assertThat(nuevos)
                    .as(
                            "sin un hilo que no sea demonio la JVM sale sola con codigo 0 aunque"
                                    + " main no la mande salir (spring.main.keep-alive, #79)")
                    .isNotEmpty();
        }
    }

    /** Lo que el planificador tiene apuntado, por el nombre de cada tarea. */
    private static List<String> tareasPlanificadas(ConfigurableApplicationContext contexto) {
        return contexto.getBeansOfType(ScheduledTaskHolder.class).values().stream()
                .flatMap(quien -> quien.getScheduledTasks().stream())
                .map(ScheduledTask::toString)
                .toList();
    }

    private static Set<Thread> hilosQueNoSonDemonio() {
        return Thread.getAllStackTraces().keySet().stream()
                .filter(hilo -> hilo.isAlive() && !hilo.isDaemon())
                .collect(Collectors.toCollection(HashSet::new));
    }

    private HttpResponse<String> pedir(String ruta) throws Exception {
        return cliente.send(
                HttpRequest.newBuilder(URI.create("http://localhost:" + puerto + ruta)).build(),
                HttpResponse.BodyHandlers.ofString());
    }
}
