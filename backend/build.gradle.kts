// Raiz del build de `caja`. No produce artefactos: solo agrupa y declara las dos tareas
// bloqueantes, con los mismos nombres que en los otros cuatro repositorios.
//
// Van SEPARADAS a proposito, y en CI son dos pasos: cuando algo se rompe, el nombre del paso ya
// dice que barrera cayo.

tasks.register("verificarAislamiento") {
    group = "verification"
    description =
        "Aislamiento multi-tenant: la prueba del esquema y la del pool. " +
            "Bloqueante. Requiere PostgreSQL 16."
    dependsOn(":kamayuk-caja-esquema:test", ":kamayuk-caja-plataforma:test")
}

tasks.register("verificarArquitectura") {
    group = "verification"
    description =
        "Reglas de ArchUnit, escaner del codigo fuente, aserciones, frontera de sistema y " +
            "limites de Spring Modulith. Bloqueante."
    dependsOn(":kamayuk-caja-aplicacion:test")
}
