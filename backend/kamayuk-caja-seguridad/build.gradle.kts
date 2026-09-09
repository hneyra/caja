// La copia local de usuarios, grupos y permisos de `caja` (D-N5, que contesta D-19).
//
// Lo que hay aqui son TRES cosas y no un contexto acotado entero: quien LEE la copia para autorizar
// —`ComprobadorDeAccesoJdbc`, la implementacion del puerto que `kamayuk-caja-plataforma`
// declara—, quien la SIEMBRA al implantar la municipalidad, y desde la etapa 4 de ADR-0039 quien
// la ACTUALIZA con lo que `identidad` publica por su buzon (`AplicarUnEventoDeIdentidad`). Las
// once escrituras de administracion viven en `identidad`, asi que aqui no hay ni controlador ni
// pantalla: lo que llega es la fila tal como quedo alli.
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
    testRuntimeOnly(libs.postgresql)
}
