// La copia local de usuarios, grupos y permisos de `caja` (D-N5, que contesta D-19).
//
// Lo que hay aqui son CUATRO cosas y no un contexto acotado entero: quien LEE la copia para
// autorizar —`ComprobadorDeAccesoJdbc`, la implementacion del puerto que `kamayuk-caja-plataforma`
// declara—, quien la SIEMBRA al implantar la municipalidad, desde la etapa 4 de ADR-0039 quien la
// ACTUALIZA con lo que `identidad` publica por su buzon (`AplicarUnEventoDeIdentidad`), y desde
// ADR-0042 quien la PUBLICA: las cinco lecturas con las que la interfaz de esta caja compone su
// sesion —`/seguridad/sesion`, `/sesion/permisos`, `/sesion/municipalidad`, `/modulos` y
// `/accesos`—, todas `SESION_PROPIA`. Las once escrituras de administracion siguen en
// `identidad`, asi que aqui hay controladores pero ni un POST ni una pantalla de administracion:
// lo que llega es la fila tal como quedo alli, y lo que sale es esa misma fila, leida.
//
// El nombre del modulo no se elige: `ConfiguracionDeCaja` ya lo reparte a
// SISTEMA_REPLICADO desde P5C, porque las cinco tablas de seguridad estan replicadas en los cuatro
// baselines (ADR-0032). Este modulo es el que las usa.

plugins {
    id("kamayuk.modulo")
    id("kamayuk.pruebas-postgres")
}

dependencies {
    // El cuerpo de cada evento del buzon es JSON en texto, y se interpreta al aplicarlo.
    implementation("tools.jackson.core:jackson-databind")

    testImplementation(testFixtures(project(":kamayuk-caja-esquema")))
    testImplementation("org.springframework.boot:spring-boot-starter-jdbc")
    testImplementation("org.springframework:spring-aop")
    // MockMvc para las cinco lecturas de la sesion (ADR-0042): de HTTP a PostgreSQL, con el
    // guardia y el manejador de errores de produccion.
    testImplementation("org.springframework:spring-test")
    testRuntimeOnly(libs.postgresql)
}
