package kamayuk.caja.seguridad.aplicacion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

import java.io.IOException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import kamayuk.caja.autorizacion.ComprobadorDeAcceso;
import kamayuk.caja.autorizacion.Privilegio;
import kamayuk.caja.compartido.TenantContext;
import kamayuk.caja.dominio.MunicipalidadId;
import kamayuk.caja.dominio.Observacion;
import kamayuk.caja.esquema.BaseDeDatosDePrueba;
import kamayuk.caja.plataforma.RecorridoPorMunicipalidades;
import kamayuk.caja.plataforma.tenant.TenantTransactionManager;
import kamayuk.caja.seguridad.AlertaDeEventosSinAplicar;
import kamayuk.caja.seguridad.EventoDeIdentidadRecibido;
import kamayuk.caja.seguridad.FuenteDeEventosDeIdentidad;
import kamayuk.caja.seguridad.dominio.CatalogoDelSistema;
import kamayuk.caja.seguridad.infraestructura.ComprobadorDeAccesoJdbc;
import kamayuk.caja.seguridad.infraestructura.RegistroDeMunicipalidadesJdbc;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import tools.jackson.databind.json.JsonMapper;

/**
 * <b>Una implantacion de cero, contra PostgreSQL de verdad</b> (ADR-0039, etapa 5; AC-2 y AC-3 de
 * {@code identidad}#5).
 *
 * <p>Base vacia: ni municipalidad, ni catalogo, ni un usuario. Corre {@link ImplantarMunicipalidad}
 * de punta a punta y afirma lo unico que decide si la ventanilla se puede abrir: que <b>antes de la
 * primera peticion</b> el administrador esta en la copia local con sus <b>siete</b> privilegios
 * sobre las opciones de ESTE sistema, y que llego por el buzon y no lo sembro nadie.
 *
 * <h2>El instrumento es el guardia de produccion</h2>
 *
 * <p>La comprobacion no cuenta filas de {@code permiso}: pregunta al {@link
 * ComprobadorDeAccesoJdbc} de verdad, que es el que corre en cada peticion con su precedencia
 * usuario-sobre-grupo y sus tres vigencias. Contar filas daria por buena una copia en la que el
 * administrador esta deshabilitado o su grupo caducado — que son dos formas de estar implantado y
 * no poder entrar.
 *
 * <p>Las tres piezas que declaran transaccion van envueltas en un {@link TransactionInterceptor} de
 * verdad, como Spring las proxifica: sin eso un {@code @Transactional} es un comentario (leccion R2
 * de la etapa 2 de {@code identidad}), y ademas estas tablas llevan RLS con {@code FORCE} — sin
 * {@code SET LOCAL} no devuelven vacio, revientan.
 *
 * <h2>Cada prueba, su municipalidad</h2>
 *
 * <p>La implantacion es idempotente y comparte base con las demas, asi que cada una implanta un
 * ubigeo propio: dos pruebas sobre la misma municipalidad dejarian que el orden en que JUnit las
 * ejecute decidiera lo que la otra mide.
 */
@DisplayName("Etapa 5 — una implantacion de cero: la autorizacion llega por el buzon")
class ImplantacionDeCeroJdbcTest {

    private static final Instant AHORA = Instant.parse("2026-09-10T09:00:00Z");
    private static final String ADMINISTRADOR = "administrador";

    private static BaseDeDatosDePrueba base;
    private static DriverManagerDataSource pool;
    private static TenantTransactionManager gestor;
    private static JdbcClient jdbc;

    @BeforeAll
    static void provisionar() throws SQLException, IOException {
        base = BaseDeDatosDePrueba.provisionar();
        pool = new DriverManagerDataSource();
        pool.setUrl(base.url());
        pool.setUsername(BaseDeDatosDePrueba.APP);
        pool.setPassword(base.clave(BaseDeDatosDePrueba.APP));
        gestor = new TenantTransactionManager(pool);
        jdbc = JdbcClient.create(pool);
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

    // ------------------------------------------------------------------
    //  AC-2 — la implantacion de cero
    // ------------------------------------------------------------------

    @Test
    @DisplayName(
            "AC-2: de una base vacia sale un administrador que puede abrir las tres opciones de"
                    + " esta caja, con sus siete privilegios, y NINGUNA fila la escribio la siembra")
    void unaImplantacionDeCero() throws SQLException {
        String ubigeo = "209911";
        CorrienteDeIdentidad buzon =
                CorrienteDeIdentidad.deUnaImplantacion(ubigeo, ADMINISTRADOR, codigos(), AHORA);
        Arnes arnes = new Arnes(ubigeo, buzon);

        arnes.implantacion().run(new DefaultApplicationArguments());

        long municipalidad = idDe(ubigeo);
        assertThat(contar(municipalidad, "usuario", "true"))
                .as(
                        "[AC-2: el administrador y las cuatro cuentas de servicio, TODOS del buzon."
                                + " La implantacion ya no escribe ni una fila de `usuario`: si esto"
                                + " es 0 es que nadie la trajo, y el Job habria salido Complete con"
                                + " la ventanilla cerrada]")
                .isEqualTo(5);
        assertThat(contar(municipalidad, "grupo", "true"))
                .as("los dos grupos que `identidad` crea al implantar, tambien del buzon")
                .isEqualTo(2);
        assertThat(contar(municipalidad, "miembro", "activo"))
                .as("la afiliacion del administrador y las cuatro de las cuentas de servicio")
                .isEqualTo(5);
        assertThat(contar(municipalidad, "permiso", "true"))
                .as(
                        "[solo los de ESTE sistema: los otros cinco PERMISO_FIJADO de la corriente"
                                + " son de `identidad`, `catastro`, `normativa` y `rentas`, y se"
                                + " ignoran y se acusan. Aplicarlos «por el codigo» concederia aqui"
                                + " lo que se concedio en otra parte]")
                .isEqualTo(codigos().size());

        // Y lo que decide de verdad: el guardia de produccion contesta que si, a las tres opciones
        // por los siete privilegios. Es lo que le va a preguntar la primera peticion.
        assertThat(loQueElGuardiaLeNiega(arnes.guardia(), municipalidad, ADMINISTRADOR))
                .as(
                        "[AC-2: «antes de la primera peticion». No se cuentan filas: se le pregunta"
                                + " al mismo comprobador que corre en cada peticion, que es el que"
                                + " sabe de vigencias y de precedencias]")
                .isEmpty();

        assertThat(arnes.sembrador().vecesQueSembroLaAutorizacion())
                .as(
                        "[y ninguna de esas filas la escribio la implantacion: el sembrador se"
                                + " quedo con `modulo_sistema` y `acceso`, y este contador esta aqui"
                                + " para que «llego por el buzon» no se pueda cumplir sembrando]")
                .isZero();
        assertThat(contar(municipalidad, "acceso", "true"))
                .as("lo que SI siembra la implantacion: el catalogo de este sistema")
                .isEqualTo(codigos().size());
        assertThat(contar(municipalidad, "identidad_evento_aplicado", "true"))
                .as("los veinte de la corriente, ajenos incluidos: un ajeno tambien se acusa")
                .isEqualTo(buzon.total());
        assertThat(buzon.lecturas)
                .as("una pagina con los veinte y una segunda vacia, que es la que para la corrida")
                .isEqualTo(2);
    }

    @Test
    @DisplayName("y reimplantar no duplica nada: el estado no crece, y el buzon ya no sirve nada")
    void segundoDespliegue() throws SQLException {
        String ubigeo = "209912";
        CorrienteDeIdentidad buzon =
                CorrienteDeIdentidad.deUnaImplantacion(ubigeo, ADMINISTRADOR, codigos(), AHORA);
        new Arnes(ubigeo, buzon).implantacion().run(new DefaultApplicationArguments());
        long municipalidad = idDe(ubigeo);
        long usuariosTrasLaPrimera = contar(municipalidad, "usuario", "true");

        // Un segundo despliegue, con el MISMO buzon: los veinte ya se acusaron, asi que no sirve
        // ninguno. La copia tiene que seguir en pie por si sola.
        new Arnes(ubigeo, buzon).implantacion().run(new DefaultApplicationArguments());

        assertThat(contar(municipalidad, "usuario", "true")).isEqualTo(usuariosTrasLaPrimera);
        assertThat(contar(municipalidad, "acceso", "true")).isEqualTo(codigos().size());
        assertThat(buzon.total()).isEqualTo(20);
    }

    // ------------------------------------------------------------------
    //  AC-3 — el orden equivocado falla diciendolo
    // ------------------------------------------------------------------

    @Test
    @DisplayName(
            "AC-3: sin consumidor —sin KAMAYUK_IDENTIDAD_URL— la implantacion falla ANTES de tocar"
                    + " la base, y nombra el remedio")
    void sinConsumidorNoSeImplanta() throws SQLException {
        String ubigeo = "209913";
        Arnes arnes = new Arnes(ubigeo, CorrienteDeIdentidad.sinNada());

        Throwable rojo =
                catchThrowable(() -> arnes.sinConsumidor().run(new DefaultApplicationArguments()));

        assertThat(rojo)
                .as(
                        "[el `CronJob` del consumidor es @ConditionalOnProperty(kamayuk.identidad.url):"
                                + " sin esa variable el bean NO EXISTE, no corre nadie y hasta la"
                                + " etapa 4 este Job salia Complete con la copia local vacia — el Job"
                                + " roto de C-18 con otra cara]")
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("kamayuk.identidad.url")
                .hasMessageContaining("KAMAYUK_IDENTIDAD_URL")
                .hasMessageContaining("SIN UN SOLO USUARIO")
                .hasMessageContaining("implantar `identidad` primero");
        assertThat(existe(ubigeo))
                .as(
                        "[y falla ANTES de dar de alta la municipalidad: una implantacion que"
                                + " empieza a escribir para descubrirlo al final la deja a medias, y"
                                + " «a medias» es peor que «no implantada» porque parece lista]")
                .isFalse();
    }

    @Test
    @DisplayName("AC-3: si el buzon no contesta, la corrida acaba en rojo y no en Complete")
    void siElBuzonNoContestaNoSeImplanta() throws SQLException {
        String ubigeo = "209914";
        Arnes arnes = new Arnes(ubigeo, new BuzonCaido());

        Throwable rojo =
                catchThrowable(() -> arnes.implantacion().run(new DefaultApplicationArguments()));

        assertThat(rojo)
                .as(
                        "[sin token o sin buzon la copia local se queda vacia. Que el Job muera es"
                                + " lo correcto: lo que no puede es salir con codigo 0]")
                .isInstanceOf(FuenteDeEventosDeIdentidad.IdentidadNoContesta.class)
                .hasMessageContaining("403");
        assertThat(contar(idDe(ubigeo), "usuario", "true")).isZero();
    }

    @Test
    @DisplayName(
            "AC-3: un buzon que contesta 200 y no trae NADA tampoco pasa por implantada — que es"
                    + " lo que devuelve `identidad` cuando esta municipalidad no esta implantada alli")
    void unBuzonVacioNoPasaPorImplantada() throws SQLException {
        String ubigeo = "209915";
        CorrienteDeIdentidad vacio = CorrienteDeIdentidad.sinNada();
        Arnes arnes = new Arnes(ubigeo, vacio);

        Throwable rojo =
                catchThrowable(() -> arnes.implantacion().run(new DefaultApplicationArguments()));

        assertThat(rojo)
                .as(
                        "[ESTE es el caso que un encadenamiento por @Order no puede ver: el"
                                + " consumidor no fallo —contesto 200 con cero eventos— y aun asi no"
                                + " hay administrador. Sin la postcondicion, `Complete` con cero"
                                + " usuarios]")
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("SIN NINGUNA fila de `usuario`")
                .hasMessageContaining(ADMINISTRADOR)
                .hasMessageContaining("implantar `identidad` primero");
        assertThat(vacio.lecturas)
                .as("y el consumidor SI corrio: no es que no se intentara")
                .isPositive();
        assertThat(contar(idDe(ubigeo), "acceso", "true"))
                .as("el catalogo si quedo sembrado: es de este sistema y no depende de nadie")
                .isEqualTo(codigos().size());
    }

    @Test
    @DisplayName(
            "AC-3: y un alta que llega SIN su matriz de permisos se distingue de la anterior,"
                    + " porque se arregla de otra manera")
    void elAltaSinSuMatrizTampocoPasa() throws SQLException {
        String ubigeo = "209916";
        Arnes arnes = new Arnes(ubigeo, CorrienteDeIdentidad.soloElAlta(ADMINISTRADOR, AHORA));

        Throwable rojo =
                catchThrowable(() -> arnes.implantacion().run(new DefaultApplicationArguments()));

        assertThat(rojo)
                .as(
                        "[los dos motivos se separan porque el remedio es otro: «no hay ninguna"
                                + " fila» manda a implantar `identidad`; «esta y no puede» manda a"
                                + " mirar de que grupo cuelga esa cuenta alli]")
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("SIN poder abrir")
                .hasMessageContaining("caja_tributaria:LECTURA");
        assertThat(rojo)
                .as("y no dice lo que dice el otro caso, que mandaria a mirar donde no es")
                .hasMessageNotContaining("SIN NINGUNA fila");
        assertThat(contar(idDe(ubigeo), "usuario", "true"))
                .as("el alta si llego: es lo que hace que este caso NO sea el anterior")
                .isEqualTo(1);
    }

    // ------------------------------------------------------------------
    //  Lo que sostiene a los de arriba
    // ------------------------------------------------------------------

    @Test
    @DisplayName(
            "el runner del CronJob no repite la pasada que la implantacion ya hizo en esta misma"
                    + " invocacion")
    void elRunnerNoRepiteLaPasada() {
        String ubigeo = "209917";
        CorrienteDeIdentidad buzon =
                CorrienteDeIdentidad.deUnaImplantacion(ubigeo, ADMINISTRADOR, codigos(), AHORA);
        Arnes arnes = new Arnes(ubigeo, buzon);

        arnes.implantacion().run(new DefaultApplicationArguments());
        int lecturasDeLaImplantacion = buzon.lecturas;
        arnes.consumidor().run(new DefaultApplicationArguments());

        assertThat(buzon.lecturas)
                .as(
                        "[el runner sigue existiendo en una invocacion de implantacion —es el mismo"
                                + " bean que despierta el CronJob— y sin el interruptor daria una"
                                + " segunda corrida sobre un buzon que la primera acaba de vaciar:"
                                + " dos bloques de vueltas en el registro del mismo Job]")
                .isEqualTo(lecturasDeLaImplantacion);
    }

    @Test
    @DisplayName(
            "el doble sirve `quedan` como lo sirve el emisor: CON la pagina dentro (leccion H6)")
    void elDobleCuentaQuedanComoElEmisor() {
        CorrienteDeIdentidad buzon =
                CorrienteDeIdentidad.deUnaImplantacion("209918", ADMINISTRADOR, codigos(), AHORA);

        FuenteDeEventosDeIdentidad.Lote lote = buzon.pendientes(5);

        assertThat(lote.eventos()).hasSize(5);
        assertThat(lote.quedan())
                .as(
                        "[`EventosController` de `identidad` contesta «cuantos le faltan en total,"
                                + " CONTANDO los de esta pagina». En la etapa 4 tres de los cuatro"
                                + " consumidores tenian su doble restando la pagina, o sea mintiendo"
                                + " justo sobre el campo que el registro de la vuelta publica: si"
                                + " este doble no cuadra con el emisor, lo que hay que corregir es"
                                + " el doble]")
                .isEqualTo(buzon.total());
    }

    // ------------------------------------------------------------------
    //  El arnes
    // ------------------------------------------------------------------

    /** Monta la implantacion con sus piezas de produccion y un buzon de mentira. */
    private static final class Arnes {

        private final String ubigeo;

        /**
         * El objetivo SIN proxificar, que es de donde se lee el contador. La fabrica de proxies
         * devuelve una subclase con sus PROPIOS campos, asi que leerlo del proxy daria un cero que
         * no ha contado nada: una afirmacion en verde sin sujeto.
         */
        private final SembradorQueCuenta objetivo;

        private final SembradorDelCatalogo sembrador;
        private final CorrerElConsumidorDeIdentidad consumidor;
        private final ComprobadorDeAcceso guardia;

        Arnes(String ubigeo, FuenteDeEventosDeIdentidad buzon) {
            this.ubigeo = ubigeo;
            this.objetivo = new SembradorQueCuenta(jdbc);
            this.sembrador = envolver(objetivo);
            AplicarUnEventoDeIdentidad aplicador =
                    envolver(
                            new AplicarUnEventoDeIdentidad(
                                    jdbc,
                                    JsonMapper.builder().build(),
                                    Clock.fixed(AHORA, ZoneOffset.UTC)));
            this.consumidor =
                    new CorrerElConsumidorDeIdentidad(
                            new ConsumirEventosDeIdentidad(
                                    buzon,
                                    aplicador,
                                    new AlertaQueCalla(),
                                    Clock.fixed(AHORA, ZoneOffset.UTC)),
                            new RecorridoPorMunicipalidades(jdbc, gestor),
                            "kamayuk-caja-servicio-" + ubigeo);
            this.guardia = envolver(new ComprobadorDeAccesoJdbc(jdbc));
        }

        ImplantarMunicipalidad implantacion() {
            return implantacionCon(hay(consumidor));
        }

        /** Sin `kamayuk.identidad.url`: el bean del consumidor no existe. */
        ImplantarMunicipalidad sinConsumidor() {
            return implantacionCon(hay(null));
        }

        CorrerElConsumidorDeIdentidad consumidor() {
            return consumidor;
        }

        ComprobadorDeAcceso guardia() {
            return guardia;
        }

        SembradorQueCuenta sembrador() {
            return objetivo;
        }

        private ImplantarMunicipalidad implantacionCon(
                ObjectProvider<CorrerElConsumidorDeIdentidad> proveedor) {
            return new ImplantarMunicipalidad(
                    new RegistroDeMunicipalidadesJdbc(
                            base.url(),
                            BaseDeDatosDePrueba.OWNER,
                            base.clave(BaseDeDatosDePrueba.OWNER)),
                    sembrador,
                    new DatosDeImplantacion(
                            ubigeo,
                            "Municipalidad de la prueba " + ubigeo,
                            "DISTRITAL",
                            ADMINISTRADOR,
                            "Administrador del Sistema",
                            false,
                            "implantacion"),
                    proveedor,
                    guardia,
                    Clock.fixed(AHORA, ZoneOffset.UTC));
        }
    }

    /**
     * El sembrador de produccion, con un contador de lo que la etapa 5 le quito.
     *
     * <p>Sobrescribe {@code jdbc()} no: lo que cuenta es cuantas veces alguien escribio una de las
     * cuatro tablas de la autorizacion desde aqui. Como {@link SembradorDelCatalogo} ya no tiene
     * ningun metodo que lo haga, el contador se queda en cero por construccion — y eso es
     * exactamente lo que hay que poder afirmar sin leer el fuente.
     */
    private static class SembradorQueCuenta extends SembradorDelCatalogo {

        private int veces;

        SembradorQueCuenta(JdbcClient jdbc) {
            super(jdbc, registro -> {}, Clock.fixed(AHORA, ZoneOffset.UTC));
        }

        /** Cuantas veces una siembra cambio el numero de filas de las cuatro tablas. */
        int vecesQueSembroLaAutorizacion() {
            return veces;
        }

        @Override
        public int sembrar(Observacion porQue) {
            int antes = filasDeLaAutorizacion();
            int creados = super.sembrar(porQue);
            if (filasDeLaAutorizacion() != antes) {
                veces++;
            }
            return creados;
        }

        private int filasDeLaAutorizacion() {
            return jdbc().sql(
                            "SELECT (SELECT count(*) FROM usuario) + (SELECT count(*) FROM grupo)"
                                    + " + (SELECT count(*) FROM miembro)"
                                    + " + (SELECT count(*) FROM permiso)")
                    .query(Integer.class)
                    .single();
        }
    }

    /** Contesta lo mismo que `identidad` a quien no tiene credencial: 403, y transitorio. */
    private static final class BuzonCaido implements FuenteDeEventosDeIdentidad {
        @Override
        public Lote pendientes(int limite) {
            throw new IdentidadNoContesta("`identidad` contesto 403 al leer el buzon");
        }

        @Override
        public Acuse acusar(List<UUID> eventoIds) {
            throw new IdentidadNoContesta("`identidad` contesto 403 al acusar");
        }
    }

    /** No hay nada que avisar en estas corridas, y si lo hubiera la prueba tiene que saberlo. */
    private static final class AlertaQueCalla implements AlertaDeEventosSinAplicar {
        @Override
        public void hayUnEventoSinAplicar(
                EventoDeIdentidadRecibido evento, String motivo, long apartados) {
            throw new AssertionError("ningun evento de esta corriente se aparta: " + motivo);
        }

        @Override
        public void hayEventosPospuestos(
                List<EventoDeIdentidadRecibido> lista, Instant ahora, Duration umbral) {
            throw new AssertionError("ningun evento de esta corriente se pospone: " + lista);
        }
    }

    // ------------------------------------------------------------------

    private static List<String> codigos() {
        List<String> codigos = new ArrayList<>();
        for (CatalogoDelSistema.Opcion opcion : CatalogoDelSistema.opciones()) {
            codigos.add(opcion.codigo());
        }
        return codigos;
    }

    /** Lo que el guardia de produccion le sigue negando al administrador. Vacio es «puede todo». */
    private static List<String> loQueElGuardiaLeNiega(
            ComprobadorDeAcceso guardia, long municipalidad, String cuenta) {
        List<String> niega = new ArrayList<>();
        TenantContext.fijar(new MunicipalidadId(municipalidad));
        try {
            if (!guardia.conoceAlUsuario(cuenta)) {
                niega.add("ni siquiera lo conoce");
                return niega;
            }
            for (CatalogoDelSistema.Opcion opcion : CatalogoDelSistema.opciones()) {
                for (Privilegio privilegio : Privilegio.values()) {
                    if (!guardia.autoriza(
                            cuenta, opcion.codigo(), privilegio, LocalDate.now(AHORA_UTC))) {
                        niega.add(opcion.codigo() + ":" + privilegio.name());
                    }
                }
            }
        } finally {
            TenantContext.limpiar();
        }
        return niega;
    }

    private static final Clock AHORA_UTC = Clock.fixed(AHORA, ZoneOffset.UTC);

    private static <T> T envolver(T objetivo) {
        ProxyFactory fabrica = new ProxyFactory(objetivo);
        fabrica.setProxyTargetClass(true);
        fabrica.addAdvice(
                new TransactionInterceptor(gestor, new AnnotationTransactionAttributeSource()));
        @SuppressWarnings("unchecked")
        T proxy = (T) fabrica.getProxy();
        return proxy;
    }

    private static ObjectProvider<CorrerElConsumidorDeIdentidad> hay(
            @Nullable CorrerElConsumidorDeIdentidad consumidor) {
        // Todos los metodos de `ObjectProvider` son `default`; el unico que la implantacion
        // llama es este, y es el que decide si el bean existe en esta invocacion.
        return new ObjectProvider<>() {
            @Override
            public @Nullable CorrerElConsumidorDeIdentidad getIfAvailable() {
                return consumidor;
            }
        };
    }

    private static long idDe(String ubigeo) throws SQLException {
        try (Connection admin = base.conexionAdmin();
                PreparedStatement sentencia =
                        admin.prepareStatement(
                                "SELECT id FROM municipalidad WHERE ubigeo = '" + ubigeo + "'");
                ResultSet fila = sentencia.executeQuery()) {
            assertThat(fila.next())
                    .as("la municipalidad " + ubigeo + " esta dada de alta")
                    .isTrue();
            return fila.getLong(1);
        }
    }

    private static boolean existe(String ubigeo) throws SQLException {
        try (Connection admin = base.conexionAdmin();
                PreparedStatement sentencia =
                        admin.prepareStatement(
                                "SELECT count(*) FROM municipalidad WHERE ubigeo = '"
                                        + ubigeo
                                        + "'");
                ResultSet fila = sentencia.executeQuery()) {
            fila.next();
            return fila.getLong(1) > 0;
        }
    }

    private static long contar(long municipalidad, String de, String condicion)
            throws SQLException {
        try (Connection admin = base.conexionAdmin();
                PreparedStatement sentencia =
                        admin.prepareStatement(
                                "SELECT count(*) FROM "
                                        + de
                                        + " WHERE municipalidad_id = "
                                        + municipalidad
                                        + " AND ("
                                        + condicion
                                        + ")");
                ResultSet fila = sentencia.executeQuery()) {
            fila.next();
            return fila.getLong(1);
        }
    }
}
