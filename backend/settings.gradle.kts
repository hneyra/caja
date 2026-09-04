// Backend de `caja`. La ventanilla: la orden de cobro, el recibo, el turno, el cierre, el arqueo y
// el catalogo de conceptos cobrables (ADR-0026).
//
// CAJA NO SABE QUE ES UN TRIBUTO, y la lista de modulos de abajo es donde primero se ve: no hay
// `parametros`, no hay `cuentacorriente`, no hay `contribuyentes`. Si algun dia apareciera uno de
// los tres, la caja habria dejado de servir para cobrar un puesto de mercado.
//
// Las barreras —ArchUnit, el escaner de fuentes, el de aserciones y la frontera de sistema— viven
// en `infrastructure/librerias-backend` y las comparten los cinco repositorios. Se consumen como
// *composite build* y no como artefacto publicado, y el motivo es el modo de fallo: un jar
// publicado a mano se queda viejo sin que nada se ponga rojo, y una verificacion vieja que pasa en
// verde es lo que este proyecto lleva doscientos issues evitando.
//
// LO QUE CUESTA, dicho aqui y no descubierto mas tarde: este backend NO COMPILA sin tener
// `infrastructure` clonado al lado.
val libreriasComunes = file("../../infrastructure/librerias-backend")

// LA UNICA SALIDA, Y SOLO PARA CONSTRUIR EL ARTEFACTO (C-7, punto 5).
//
// La imagen construye con el contexto en la raiz de ESTE repositorio, y
// `infrastructure/librerias-backend` vive en un clon hermano: fuera del contexto, y sin forma de
// meterlo dentro —un `.dockerignore` no puede describir un contexto que es el directorio padre—.
//
// Lo que se midio antes de decidir: `comun-verificaciones` es `testImplementation` y **solo** de
// `kamayuk-caja-aplicacion`. La imagen construye `bootJar` e `installDist` y no corre ni una
// prueba, asi que no necesita la libreria para nada — lo unico que la necesitaba era el `require`.
//
// Con la propiedad puesta el build se queda SIN las verificaciones, y para que eso no pueda
// convertirse en «verificar sin verificar» el `build.gradle.kts` de la raiz **hace fallar toda
// tarea de prueba** mientras este puesta. O sea: o esta la libreria, o no hay verificacion; nunca
// una verificacion que pasa en verde sin ella (#192).
val soloElArtefacto = providers.gradleProperty("kamayuk.sinLibreriasComunes").isPresent

require(libreriasComunes.isDirectory || soloElArtefacto) {
    "No esta ${libreriasComunes.canonicalPath}. El backend consume comun-verificaciones como" +
        " composite build, asi que `infrastructure` tiene que estar clonado al lado de" +
        " `caja`: git clone https://github.com/hneyra/infrastructure ../../infrastructure"
}
if (!soloElArtefacto) {
    includeBuild(libreriasComunes)
}

rootProject.name = "kamayuk-caja-backend"

// Compartido: objetos de valor y contexto de tenant. No depende de ningun contexto acotado.
include("kamayuk-caja-dominio-compartido")

// Esquema: el baseline de ADR-0032, la orden de cobro con su buzon, y la prueba de aislamiento.
include("kamayuk-caja-esquema")

// Plataforma: lleva el contexto de tenant hasta la transaccion (ARQ-03 §2).
include("kamayuk-caja-plataforma")

// El contexto acotado. Se llama igual que el sistema porque `caja` es las dos cosas: el
// repositorio y el unico contexto que contiene, igual que `kamayuk-catastro-catastro`.
include("kamayuk-caja-caja")

// La copia local de usuarios, grupos y permisos, y su siembra (D-N5). No es un contexto
// acotado: es el lector que autoriza y el sembrador que implanta. Las pantallas de
// administracion de seguridad viven en `rentas` (ADR-0030 §3).
include("kamayuk-caja-seguridad")

// Ensambla el artefacto y aloja las barreras: es el unico modulo que ve a todos los demas.
include("kamayuk-caja-aplicacion")

dependencyResolutionManagement {
    repositoriesMode = RepositoriesMode.FAIL_ON_PROJECT_REPOS
    repositories {
        mavenCentral()
    }
}
