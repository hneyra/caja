// La copia local de usuarios, grupos y permisos de `caja` (D-N5, que contesta D-19).
//
// Lo que hay aqui son DOS cosas y no un contexto acotado entero: quien LEE la copia para autorizar
// —`ComprobadorDeAccesoJdbc`, la implementacion del puerto que `kamayuk-caja-plataforma`
// declara— y quien la SIEMBRA al implantar la municipalidad. Las nueve escrituras de
// administracion de seguridad se quedan en `rentas` (ADR-0030 §3), asi que aqui no hay ni
// controlador ni pantalla.
//
// El nombre del modulo no se elige: `ConfiguracionDeCaja` ya lo reparte a
// SISTEMA_REPLICADO desde P5C, porque las cinco tablas de seguridad estan replicadas en los cuatro
// baselines (ADR-0032). Este modulo es el que las usa.

plugins {
    id("sgtm.modulo")
    id("sgtm.pruebas-postgres")
}

dependencies {
    testImplementation(testFixtures(project(":kamayuk-caja-esquema")))
    testImplementation("org.springframework.boot:spring-boot-starter-jdbc")
    testImplementation("org.springframework:spring-aop")
    testRuntimeOnly(libs.postgresql)
}
