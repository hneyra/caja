// El contexto acotado `caja` (ADR-0026).
//
// El punto donde entra el dinero: la orden de cobro, la ventanilla, el recibo con su numeracion,
// el turno, el cierre y el arqueo.
//
// NO DEPENDE DE NADIE. No hay `implementation(project(...))` de ningun otro contexto, y esa lista
// vacia es la propiedad entera de esta separacion: la caja no lee el libro de cuenta corriente, no
// consulta el padron de contribuyentes y no pregunta a normativa. Lo que sabe se lo dice la orden
// de cobro; lo que hace lo publica en su buzon de salida.
//
// El dia que aparezca aqui una dependencia hacia un contexto tributario, la caja habra dejado de
// servir para cobrar un puesto de mercado — que es la razon por la que se separo.

plugins {
    id("sgtm.modulo")
    id("sgtm.pruebas-postgres")
}

dependencies {
    // El transporte hacia el sistema que emitio la orden. Se habla HTTP con la JDK; de Spring solo
    // entran el estereotipo, `@Value` y el acceso a la peticion en curso, y de Jackson el arbol
    // JSON —el cuerpo del evento se congela como texto, asi que hace falta escribirlo y leerlo—.
    implementation("org.springframework:spring-web")
    implementation("tools.jackson.core:jackson-databind")

    // Las pruebas de repositorio y de atomicidad corren contra PostgreSQL de verdad: provisionan
    // la base como un ambiente real y se conectan como sgtm_app, no como el superusuario que
    // entrega Testcontainers (CAL-01 §3.2). Contra un doble no se puede demostrar ni el FOR UPDATE
    // sobre la orden, ni el REVOKE de `cierre_caja`, ni que una transaccion deje cero filas al
    // fallar a mitad.
    testImplementation(testFixtures(project(":kamayuk-caja-esquema")))
    testImplementation("org.springframework.boot:spring-boot-starter-jdbc")

    // El caso de uso se prueba envuelto en un proxy transaccional de verdad, para que lo que se
    // verifique sea la anotacion y no un TransactionTemplate de la prueba.
    testImplementation("org.springframework:spring-aop")

    // MockMvc para el endpoint: transporte sin base de datos.
    testImplementation("org.springframework:spring-test")
    testRuntimeOnly(libs.postgresql)
}
