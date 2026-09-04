// Ensambla el artefacto unico, desplegado en los perfiles web y batch (ADR-0003).
//
// Es tambien donde corren las verificaciones que necesitan ver todo el sistema a la
// vez: las reglas de ArchUnit de ARQ-04 §2 y los limites de modulo de Spring
// Modulith. Ningun otro modulo tiene en su classpath a todos los demas.

plugins {
    id("sgtm.java-base")
    id("sgtm.pruebas")
    alias(libs.plugins.spring.boot)
}

dependencies {
    implementation(platform(libs.spring.boot.bom))
    implementation(platform(libs.spring.modulith.bom))

    implementation(project(":kamayuk-caja-dominio-compartido"))
    implementation(project(":kamayuk-caja-plataforma"))


    // El unico contexto acotado de este sistema. UNO, y sin puertos de entrada hacia otros
    // sistemas: la caja no le pregunta nada a nadie para cobrar. Lo unico que sale de aqui es el
    // buzon, y sale despues del COMMIT (ADR-0026 §3).
    implementation(project(":kamayuk-caja-caja"))

    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.modulith:spring-modulith-starter-core")

    // Actuator entra por dos razones: la sonda de vida y las metricas (issue #156).
    // Sin un endpoint que diga si el proceso esta arriba Y llega a la base,
    // `depends_on: service_healthy` del compose no puede significar nada, y el
    // despliegue se queda esperando a un contenedor que quiza nunca sirva una
    // peticion. Se exponen `health` y `prometheus`, y nada mas (application.yaml,
    // SeguridadWeb).
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    // El registro de Prometheus. Sin el, `/actuator/prometheus` no existe aunque
    // este en la lista de exposicion: Micrometer necesita SABER en que formato
    // escribir, y este es el que Prometheus sabe leer.
    implementation("io.micrometer:micrometer-registry-prometheus")

    // Las migraciones viven en kamayuk-caja-esquema y las ejecuta el proceso de despliegue
    // como sgtm_owner. La aplicacion NO migra al arrancar: se conecta como
    // sgtm_app, que no tiene DDL (ARQ-03 §4).
    runtimeOnly(libs.postgresql)

    // Las barreras, compartidas con los otros cuatro repositorios (composite build; ver
    // settings.gradle.kts). Trae ArchUnit consigo como `api`, junto con JUnit y AssertJ.
    testImplementation("kamayuk.comun:comun-verificaciones")

    // La muestra de caso de uso que viola la regla 10 lleva @Transactional: sin
    // spring-tx no compilaria, y sin ella la regla no tendria como demostrarse.
    testImplementation("org.springframework:spring-tx")
    testImplementation("org.springframework.modulith:spring-modulith-starter-test")
}

// El contrato vive fuera de este modulo y dos pruebas lo leen del disco:
// `ContratoDeApiTest` compara sus rutas con las publicadas, y
// `ParametrosDeLaConsultaTest` compara sus parametros de consulta con lo que cada
// controlador lee. Sin declararlo como entrada, editar el YAML deja a `test` en
// UP-TO-DATE y una rotura del contrato pasa en **verde rancio** en local —en CI
// corre fresco y muerde, que es la peor forma de enterarse—. Es la leccion de
// #192 punto 2, aplicada al contrato: lo destapo #399 al mutar el YAML y ver la
// prueba dar BUILD SUCCESSFUL sin haber corrido.
tasks.test {
    // Gradle NO hereda las propiedades del sistema en la JVM de las pruebas: sin esto,
    // `-Dkamayuk.contratos.regenerar=true` no llega y el contrato que este repositorio
    // publica para sus proveedores no se puede regenerar. Es la misma linea que
    // `rentas` tiene desde #400 para las formas de la API.
    providers
        .systemProperty("kamayuk.contratos.regenerar")
        .orNull
        ?.let { systemProperty("kamayuk.contratos.regenerar", it) }

    // `AsercionesQueNoPuedenFallarTest` lee del disco las pruebas de TODOS los modulos (#724).
    // Es el unico escaner que recorre `src/test`, y esas fuentes no estan en el classpath de este
    // modulo —solo lo estan las de `src/main`, por las dependencias—, asi que sin declararlas
    // editar una prueba de otro modulo dejaria esta tarea en UP-TO-DATE y una asercion que no
    // puede fallar pasaria en verde rancio. Es la leccion de #192 punto 2.
    inputs
        .files(
            rootProject.layout.projectDirectory.asFileTree.matching {
                include("*/src/test/java/**/*.java")
            })
        .withPathSensitivity(PathSensitivity.RELATIVE)

    // Las tres entradas de `rentas` —el contrato OpenAPI, el archivo de formas y el censo de
    // respuestas— NO estan aqui, y no es un olvido: `caja` no tiene contrato derivado. El
    // generador de `rentas` deriva del prototipo del manual (#312) y aqui no hay prototipo del que
    // derivar; inventar un YAML a mano seria exactamente lo que ese issue prohibe. Es el mismo
    // hueco que P5B declaro para `normativa` y P5C para `catastro`, declarado por tercera vez.
}

// Nombre fijo del artefacto ejecutable. La imagen lo copia por nombre y no por
// comodin: `*.jar` casaria tambien con el `-plain.jar` que produce el plugin de
// java-library, y cual de los dos acaba en el contenedor dependeria del orden
// alfabetico.
tasks.named<org.springframework.boot.gradle.tasks.bundling.BootJar>("bootJar") {
    archiveFileName.set("sgtm.jar")
}
