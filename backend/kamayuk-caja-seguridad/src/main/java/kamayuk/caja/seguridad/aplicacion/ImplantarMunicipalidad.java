package kamayuk.caja.seguridad.aplicacion;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import kamayuk.caja.auditoria.Origen;
import kamayuk.caja.auditoria.OrigenContext;
import kamayuk.caja.autorizacion.ComprobadorDeAcceso;
import kamayuk.caja.autorizacion.Privilegio;
import kamayuk.caja.compartido.TenantContext;
import kamayuk.caja.dominio.MunicipalidadId;
import kamayuk.caja.dominio.Observacion;
import kamayuk.caja.seguridad.dominio.CatalogoDelSistema;
import kamayuk.caja.seguridad.dominio.PlazoDeAdopcion;
import kamayuk.caja.seguridad.infraestructura.CuentasDeLaCopiaJdbc;
import kamayuk.caja.seguridad.infraestructura.CuentasDeLaCopiaJdbc.FichaDeLaCuenta;
import kamayuk.caja.seguridad.infraestructura.RegistroDeMunicipalidadesJdbc;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * Pone la municipalidad dentro de la base de {@code caja}, siembra el catalogo de este sistema y
 * <b>trae la autorizacion del buzon de {@code identidad}</b> antes de darse por terminada.
 *
 * <h2>El hueco que cierra (C-6, hueco 3)</h2>
 *
 * <p>Cada sistema tiene <b>su propia base</b> (ADR-0032) y en cada una hay una tabla {@code
 * municipalidad} con su {@code es_demostracion}. {@code SoloEnDemostracion} la consulta <b>en la
 * base de su propio sistema</b>, y las politicas RLS resuelven {@code app.municipalidad_id} contra
 * ella. Hasta C-7, el unico {@code INSERT INTO municipalidad} del arbol de este repositorio estaba
 * en fixtures de prueba: una instalacion real no tenia como escribir esa fila, y sin ella los pasos
 * de siembra se negaban a correr —correctamente— sin que nada dijera que era lo que faltaba.
 *
 * <p>Es el mismo hueco que #430 cerro para {@code area} y {@code caja}, y se cierra igual: <b>por
 * donde entra la configuracion de la municipalidad, no con una pantalla</b>.
 *
 * <h2>Por que un proceso y no un endpoint</h2>
 *
 * <p>Porque {@code municipalidad} solo la escribe {@code kamayuk_owner}. Un endpoint que lo hiciera
 * le exigiria a {@code kamayuk_app} un privilegio que se le quito a proposito, y seria el camino
 * mas corto de una pantalla de alta a una escalada entre municipalidades.
 *
 * <p>Corre en el perfil {@code batch}: sin servidor web, sin puerto expuesto y con vida corta. Las
 * credenciales de {@code kamayuk_owner} entran <b>solo</b> en el paso 1, para <b>un</b> {@code
 * INSERT}, en una conexion que se abre y se cierra. Todo lo demas va por el camino normal de la
 * aplicacion, como {@code kamayuk_app} y con su auditoria.
 *
 * <h2>Ni un grupo, ni un usuario, ni un permiso: eso es de {@code identidad} (ADR-0039, etapa 5)
 * </h2>
 *
 * <p>Hasta la etapa 4 esta implantacion fabricaba el arranque en frio con SQL propio: un grupo de
 * administracion, el primer administrador, su afiliacion y sus siete privilegios. Con {@code
 * identidad} implantado eso son <b>dos</b> sitios que dan de alta al mismo administrador, cada uno
 * en su base y sin saber del otro; y el sintoma de que discrepen no es un error sino una respuesta
 * distinta a «quien puede hacer esto» segun la pantalla que se abra. Desde esta etapa la
 * implantacion siembra <b>solo el catalogo</b> ({@link SembradorDelCatalogo}) y todo lo demas llega
 * por el buzon.
 *
 * <h2>Y por eso la pasada del consumidor se llama AQUI, en linea</h2>
 *
 * <p>Hasta la etapa 4 el consumidor corria como un runner detras de este, encadenado por {@link
 * Order}. Eso bastaba mientras la siembra dejaba un administrador: si el consumidor no existia, la
 * municipalidad quedaba usable. Ya no. Un encadenamiento por {@code @Order} tiene un modo de fallo
 * que en esta etapa es exactamente el defecto: {@code CorrerElConsumidorDeIdentidad} es
 * {@code @ConditionalOnProperty("kamayuk.identidad.url")}, asi que <b>sin esa variable el bean no
 * existe, no corre nadie y este Job sale {@code Complete} con la copia local vacia</b> — el Job
 * roto de C-18 con otra cara: arranca, no hace nada y sale con codigo 0.
 *
 * <p>Llamandolo en linea se pueden hacer las dos cosas que un vecino no puede hacer: <b>exigir</b>
 * que exista antes de tocar nada, y <b>comprobar la postcondicion</b> cuando termina. La
 * postcondicion es la unica afirmacion que importa —alguien puede entrar; en una copia recien
 * nacida, el administrador y con todo (#138)—, y no se deduce de que el consumidor no fallara: un
 * buzon que contesta 200 con cero eventos es exactamente lo que devuelve {@code identidad} cuando
 * esta municipalidad todavia no se ha implantado alli.
 *
 * <h2>Y esto NO convierte el {@code CronJob} en un Job que falla cada cinco minutos</h2>
 *
 * <p>Lo que falla es la <b>implantacion</b>, no toda corrida del consumidor. Las vueltas periodicas
 * siguen tratando un evento pospuesto como lo que es —un retraso, que avisa a los quince minutos y
 * termina en {@code rc=0}, hallazgo H7 de la medida de la etapa 4—. La diferencia esta en lo que
 * cada una promete: una vuelta periodica promete acercar la copia, y una implantacion promete
 * dejarla utilizable. Una municipalidad implantada sin administrador no es una copia con retraso:
 * es una instalacion que nadie puede abrir, y sale asi de la unica corrida que iba a mirar alguien.
 *
 * <h2>Lo que la postcondicion garantiza en CADA despliegue (#138)</h2>
 *
 * <p>Este Job se recrea en cada despliegue —su nombre lleva la version— y comprueba su
 * postcondicion en cada uno. Hasta #138 era una sola, la del arranque en frio: el administrador
 * configurado abre las siete opciones con sus siete privilegios. Pero esa cuenta es de la
 * municipalidad desde que existe, y lo normal es que la municipalidad decida sobre ella: la
 * inhabilita cuando ya tiene administradores nominales, la deja vencer, o le niega con una
 * excepcion propia lo que no debe hacer quien administra. {@code identidad} no deshace ninguna de
 * las tres al reimplantar, asi que cada una atascaba TODO despliegue de esta caja tras seis
 * reintentos —y con un mensaje que mandaba a mirar el grupo—. La postcondicion es ahora <b>que
 * alguien puede entrar a esta caja</b>, y lo sigue contestando el guardia de produccion:
 *
 * <ol>
 *   <li><b>Si una cuenta DISTINTA del administrador configurado puede abrir al menos una opcion de
 *       este sistema</b> —con un privilegio basta, que es lo que basta para que la ventanilla le
 *       ofrezca la hoja—, la copia esta en uso y lo que la municipalidad haya decidido sobre el
 *       administrador se respeta: no se exige, y se dice en un WARN con su diagnostico.
 *   <li><b>Si no hay ninguna, el administrador configurado es la unica entrada, y tiene que poder
 *       las siete opciones con sus siete privilegios</b>: lo que a el le falte no lo puede hacer
 *       nadie. Si no puede, la implantacion falla diciendo por que —no esta en la copia; esta
 *       inhabilitado o fuera de vigencia; no esta en ningun grupo vigente; o le falta un
 *       privilegio, cuales, y si se lo niega una excepcion suya o no se lo concede ninguno de sus
 *       grupos—.
 * </ol>
 *
 * <p>Asi nace toda copia —el administrador y cuatro cuentas de servicio que aqui no abren nada—, de
 * modo que <b>la primera implantacion sigue exigiendo la matriz entera</b>, y una copia vacia, o en
 * la que nadie abre nada, sigue sin salir nunca en {@code Complete}. Lo que cambia es la
 * reimplantacion de una municipalidad que ya usa esta caja: garantiza que alguien entra, no quien.
 *
 * <p><b>Y «primera» no se mide por la historia, a proposito.</b> Lo tentador es preguntar si la
 * fila de {@code municipalidad} existia antes de esta corrida, o si la copia tenia usuarios antes
 * de la pasada. Las dos las rompe el propio Job: su {@code backoffLimit: 6} existe para esperar a
 * que {@code identidad} implante, y cada reintento vuelve a correr sobre lo que el intento anterior
 * ya dejo con {@code commit} —la fila, y los eventos que alcanzo a aplicar—. Con esa definicion el
 * segundo intento del MISMO despliegue ya seria una reimplantacion, y la matriz que el primero vio
 * llegar incompleta dejaria de exigirse justo cuando {@code identidad} tarda, que en un ambiente de
 * cero es lo normal. Una regla sobre el ESTADO da la misma respuesta en cada intento.
 *
 * <p><b>Lo que NO garantiza</b>, dicho: que el administrador configurado pueda entrar en una
 * municipalidad donde ya entra otro; que cada opcion la pueda abrir alguien —dejar una sin usar es
 * decision de la municipalidad, y {@code identidad} no lo impide—; ni que el catalogo de {@code
 * identidad} este al dia con el de esta caja cuando ya entra otro: eso se avisa, no se exige. Y una
 * cuenta de servicio con un permiso de esta caja contaria como «alguien»; hoy la implantacion de
 * {@code identidad} solo les da {@code identidad:eventos}, que aqui se ignora.
 *
 * <h2>Idempotente, entera</h2>
 *
 * <p>Se ejecuta en cada despliegue. Lo que ya existe se queda como esta —con los permisos que
 * alguien haya configurado despues, que desde #138 tampoco la postcondicion obliga a deshacer—, y
 * lo que falta se crea. Nunca borra.
 */
@Component
@Profile("batch")
@ConditionalOnProperty("kamayuk.implantacion.ubigeo")
@EnableConfigurationProperties(DatosDeImplantacion.class)
@Order(ImplantarMunicipalidad.ORDEN)
public class ImplantarMunicipalidad implements ApplicationRunner {

    /**
     * Antes que el consumidor del buzon.
     *
     * <p>Sigue haciendo falta aunque la pasada se llame en linea: el runner del consumidor es el
     * mismo bean, y si corriera ANTES que esto no habria ni fila de {@code municipalidad} que
     * resolver — se pararia diciendo «esa municipalidad no esta implantada en esta caja», que es
     * cierto y no es el diagnostico que hace falta.
     */
    public static final int ORDEN = 100;

    private static final Logger log = LoggerFactory.getLogger(ImplantarMunicipalidad.class);

    private final RegistroDeMunicipalidadesJdbc registro;
    private final SembradorDelCatalogo sembrador;
    private final DatosDeImplantacion datos;
    private final ObjectProvider<CorrerElConsumidorDeIdentidad> consumidor;
    private final ComprobadorDeAcceso guardia;
    private final Clock reloj;
    private final CuentasDeLaCopiaJdbc cuentas;

    public ImplantarMunicipalidad(
            RegistroDeMunicipalidadesJdbc registro,
            SembradorDelCatalogo sembrador,
            DatosDeImplantacion datos,
            ObjectProvider<CorrerElConsumidorDeIdentidad> consumidor,
            ComprobadorDeAcceso guardia,
            Clock reloj,
            CuentasDeLaCopiaJdbc cuentas) {
        this.registro = registro;
        this.sembrador = sembrador;
        this.datos = datos;
        this.consumidor = consumidor;
        this.guardia = guardia;
        this.reloj = reloj;
        this.cuentas = cuentas;
    }

    @Override
    public void run(ApplicationArguments argumentos) {
        // ANTES de tocar la base: sin consumidor no hay copia local que traer, y una implantacion
        // que empieza a escribir para descubrirlo al final deja la municipalidad a medias.
        CorrerElConsumidorDeIdentidad pasada = exigirElConsumidor();

        long municipalidadId =
                registro.darDeAltaSiFalta(
                        datos.ubigeo(), datos.nombre(), datos.tipo(), datos.esDemostracion());

        // El perfil batch no tiene filtros HTTP, asi que los dos contextos que en una peticion
        // salen del token se fijan aqui a mano. `Origen.deProceso` existe para esto: una escritura
        // sin peticion detras, que aun asi tiene que decir quien.
        TenantContext.fijar(new MunicipalidadId(municipalidadId));
        OrigenContext.fijar(Origen.deProceso(datos.usuarioDelProceso()));
        try {
            int nuevos =
                    sembrador.sembrar(
                            Observacion.de(
                                    "Implantacion de la municipalidad "
                                            + datos.ubigeo()
                                            + " en caja (despliegue)"));

            // El regimen se registra aunque sea una sola palabra: es lo unico del resultado que no
            // se puede comprobar mirando pantallas. Una instalacion que se creia de demostracion y
            // salio real emite papeles sin marca, y quien lo descubre es quien recibe uno (#122).
            log.info(
                    "Municipalidad {} dada de alta en caja ({}): id {}, {} accesos nuevos."
                            + " La autorizacion no se siembra: se trae del buzon de `identidad`",
                    datos.ubigeo(),
                    datos.esDemostracion() ? "DEMOSTRACION" : "instalacion real",
                    municipalidadId,
                    nuevos);

            pasada.unaPasada();
            String quienEntra = comprobarQueLaCopiaLlego();

            log.info("Municipalidad {} lista en caja: {}", datos.ubigeo(), quienEntra);
        } finally {
            OrigenContext.limpiar();
            TenantContext.limpiar();
        }
    }

    /**
     * El consumidor del buzon, o el rojo que dice que falta.
     *
     * <p>Sin el no hay nada que traer: desde la etapa 5 esta implantacion no escribe ni un usuario.
     */
    private CorrerElConsumidorDeIdentidad exigirElConsumidor() {
        @Nullable CorrerElConsumidorDeIdentidad disponible = consumidor.getIfAvailable();
        if (disponible == null) {
            throw new IllegalStateException(
                    "No hay consumidor del buzon de `identidad` en esta invocacion, asi que no hay"
                            + " de donde sacar la autorizacion: falta «kamayuk.identidad.url»"
                            + " (KAMAYUK_IDENTIDAD_URL). Desde la etapa 5 de ADR-0039 la"
                            + " implantacion NO siembra ni un usuario, ni un grupo, ni un permiso:"
                            + " los trae el buzon. Sin esto la municipalidad "
                            + datos.ubigeo()
                            + " quedaria dada de alta, con su catalogo sembrado y SIN UN SOLO"
                            + " USUARIO —ni siquiera el administrador «"
                            + datos.administrador()
                            + "»—, y este Job saldria Complete. Remedio: implantar `identidad`"
                            + " primero y darle a este Job KAMAYUK_IDENTIDAD_URL,"
                            + " KAMAYUK_IDENTIDAD_TOKEN, KAMAYUK_IDENTIDAD_CLIENTE y"
                            + " KAMAYUK_IDENTIDAD_CREDENCIAL");
        }
        return disponible;
    }

    /**
     * La postcondicion: alguien puede entrar a esta caja (#138). Devuelve quien, para el registro.
     *
     * <p>Se comprueba con el <b>mismo</b> {@link ComprobadorDeAcceso} que usa el guardia en cada
     * peticion, y no contando filas: lo que decide si alguien puede abrir una pantalla es esa
     * consulta —con su precedencia usuario-sobre-grupo y sus tres vigencias—, y contar filas de
     * {@code permiso} daria por buena una copia en la que el administrador esta deshabilitado o su
     * grupo caducado.
     *
     * <p>El orden es el de la regla del javadoc de la clase. Primero el administrador configurado,
     * que en una copia sana puede todo y acaba aqui. Si no puede, se busca <b>otra</b> cuenta que
     * pueda abrir algo: si la hay, lo del administrador fue una decision de la municipalidad y se
     * avisa sin exigirlo; si no la hay, el es la unica entrada y lo que le falte no lo puede hacer
     * nadie, asi que la implantacion falla. En los dos casos se dice POR QUE no puede, porque cada
     * motivo se arregla en otro sitio: no tener ninguna fila manda a implantar {@code identidad};
     * estar inhabilitado o vencido, a habilitarlo; no estar en ningun grupo, a afiliarlo; y que le
     * falte un privilegio, a mirar si se lo niega una excepcion suya o no se lo da su grupo.
     */
    private String comprobarQueLaCopiaLlego() {
        String cuenta = datos.administrador();
        LocalDate hoy = LocalDate.now(reloj);
        boolean loConoce = guardia.conoceAlUsuario(cuenta);
        List<Par> leNiega = loConoce ? loQueLeNiega(cuenta, hoy) : List.of();
        if (loConoce && leNiega.isEmpty()) {
            return "el administrador '"
                    + cuenta
                    + "' esta en la copia local con sus "
                    + Privilegio.values().length
                    + " privilegios sobre las "
                    + CatalogoDelSistema.opciones().size()
                    + " opciones de este sistema";
        }

        @Nullable Diagnostico diagnostico = loConoce ? diagnostico(cuenta, leNiega, hoy) : null;
        @Nullable String otra = otraCuentaQueEntra(cuenta, hoy);
        if (otra != null) {
            log.warn(
                    "El administrador configurado «{}» de {} no puede abrir todo lo de esta caja:"
                            + " {}. NO se exige (#138): la cuenta «{}» puede entrar, asi que la"
                            + " copia esta en uso, y lo que la municipalidad haya decidido en"
                            + " `identidad` sobre la cuenta de la implantacion se respeta. Si no"
                            + " fue una decision, el remedio es el de siempre: {}",
                    cuenta,
                    datos.ubigeo(),
                    diagnostico != null
                            ? diagnostico.porQue()
                            : "no esta en la copia local —se renombro en `identidad`, o"
                                    + " kamayuk.implantacion.administrador nombra otra cuenta—",
                    otra,
                    diagnostico != null
                            ? diagnostico.remedio()
                            : "comprobar en `identidad` como se llama hoy esa cuenta");
            return "entra «" + otra + "», y al administrador configurado no se le exige (#138)";
        }

        if (diagnostico == null) {
            throw new IllegalStateException(
                    "La implantacion de "
                            + datos.ubigeo()
                            + " corrio el consumidor del buzon y la copia local se quedo SIN"
                            + " NINGUNA fila de `usuario` para el administrador «"
                            + cuenta
                            + "», ni ninguna otra cuenta que pueda abrir una sola opcion de esta"
                            + " caja. El buzon contesto y no trajo su alta, que es lo que pasa"
                            + " cuando esta municipalidad todavia no esta implantada en"
                            + " `identidad`: alli no hay cola que servirle a esta caja. Dar esto por"
                            + " bueno dejaria el Job en Complete y la ventanilla sin nadie que pueda"
                            + " entrar. Remedio: implantar `identidad` primero y volver a correr"
                            + " esta implantacion");
        }
        throw new IllegalStateException(
                "La implantacion de "
                        + datos.ubigeo()
                        + " deja la copia local sin ninguna otra cuenta que pueda abrir una sola"
                        + " opcion de esta caja, asi que el administrador «"
                        + cuenta
                        + "» es la unica entrada y tiene que poder las "
                        + CatalogoDelSistema.opciones().size()
                        + " opciones con sus "
                        + Privilegio.values().length
                        + " privilegios: lo que a el le falte no lo puede hacer nadie. Y no puede: "
                        + diagnostico.porQue()
                        + ". Remedio: "
                        + diagnostico.remedio()
                        + " —o dar a otra cuenta un permiso de esta caja: con una que entre, al"
                        + " administrador configurado no se le exige nada (#138)—, y volver a"
                        + " correr esta implantacion");
    }

    /** Un par opcion-privilegio del catalogo de este sistema. */
    private record Par(String opcion, Privilegio privilegio) {
        @Override
        public String toString() {
            return opcion + ":" + privilegio.name();
        }
    }

    /** Los pares del catalogo que el guardia le niega a esa cuenta hoy. Vacio es «puede todo». */
    private List<Par> loQueLeNiega(String cuenta, LocalDate hoy) {
        List<Par> niega = new ArrayList<>();
        for (CatalogoDelSistema.Opcion opcion : CatalogoDelSistema.opciones()) {
            for (Privilegio privilegio : Privilegio.values()) {
                if (!guardia.autoriza(cuenta, opcion.codigo(), privilegio, hoy)) {
                    niega.add(new Par(opcion.codigo(), privilegio));
                }
            }
        }
        return niega;
    }

    /**
     * La primera cuenta, distinta del administrador configurado, a la que el guardia le deja abrir
     * al menos una opcion de este sistema con al menos un privilegio; o {@code null}.
     *
     * <p>Un privilegio basta porque es lo que basta para que la ventanilla ofrezca la hoja ({@code
     * frontend/src/permisos.ts}): quien la tiene, entra. A quien preguntar lo acota {@link
     * CuentasDeLaCopiaJdbc#otrasCuentasConAlgunPermiso}, que solo descarta a quien el guardia
     * negaria seguro; quien decide es el guardia.
     */
    private @Nullable String otraCuentaQueEntra(String administrador, LocalDate hoy) {
        for (String otra : cuentas.otrasCuentasConAlgunPermiso(administrador)) {
            for (CatalogoDelSistema.Opcion opcion : CatalogoDelSistema.opciones()) {
                for (Privilegio privilegio : Privilegio.values()) {
                    if (guardia.autoriza(otra, opcion.codigo(), privilegio, hoy)) {
                        return otra;
                    }
                }
            }
        }
        return null;
    }

    /** Por que no puede, y donde se arregla: el mensaje y su remedio, en el mismo orden. */
    private record Diagnostico(String porQue, String remedio) {}

    /**
     * Por que el guardia le niega a una cuenta que la copia SI tiene lo que le niega.
     *
     * <p>Lo decidio el guardia; esto solo le pone nombre, leyendo los tres sitios donde el guardia
     * puede negar: la propia cuenta —que anula todo—, sus excepciones —que sustituyen a sus grupos
     * en su opcion— y sus grupos.
     */
    private Diagnostico diagnostico(String cuenta, List<Par> leNiega, LocalDate hoy) {
        FichaDeLaCuenta ficha =
                cuentas.ficha(cuenta, hoy)
                        .orElseThrow(
                                () ->
                                        new IllegalStateException(
                                                "El guardia conoce la cuenta «"
                                                        + cuenta
                                                        + "» y la copia no la tiene: se borro a"
                                                        + " mitad de la implantacion"));
        if (!ficha.concedeEl(hoy)) {
            return new Diagnostico(
                    "esta INHABILITADO O FUERA DE VIGENCIA en la copia ("
                            + String.join("; ", queLeImpideConceder(ficha, hoy))
                            + "), y con la cuenta asi el guardia le niega todo, conceda lo que"
                            + " conceda su grupo",
                    "habilitar esa cuenta en `identidad`, o darle vigencia");
        }
        List<Par> porExcepcion = new ArrayList<>();
        List<Par> porGrupo = new ArrayList<>();
        for (Par par : leNiega) {
            if (ficha.opcionesConExcepcion().contains(par.opcion())) {
                porExcepcion.add(par);
            } else {
                porGrupo.add(par);
            }
        }
        List<String> motivos = new ArrayList<>();
        List<String> remedios = new ArrayList<>();
        if (!porExcepcion.isEmpty()) {
            motivos.add(
                    "LE FALTA UN PRIVILEGIO que le niega una excepcion suya —un permiso fijado a la"
                            + " cuenta, que en esa opcion sustituye a sus grupos—: "
                            + porExcepcion);
            remedios.add("corregir o retirar en `identidad` la excepcion de esa cuenta");
        }
        if (!porGrupo.isEmpty()) {
            motivos.add(
                    ficha.gruposVigentes() == 0
                            ? "NO ESTA EN NINGUN GRUPO vigente de la copia —no esta afiliado, o lo"
                                    + " esta a un grupo inhabilitado, vencido o sin adoptar—, y por"
                                    + " eso le falta: "
                                    + porGrupo
                            : "LE FALTA UN PRIVILEGIO que ninguno de sus "
                                    + ficha.gruposVigentes()
                                    + " grupos vigentes le concede —su matriz no llego, llego"
                                    + " pospuesta, o el catalogo de `identidad` no tiene esa"
                                    + " opcion—: "
                                    + porGrupo);
            remedios.add(
                    "comprobar en `identidad` que esa cuenta esta en el grupo de administracion de"
                            + " esta municipalidad, y que ese grupo tiene esas opciones de `caja`");
        }
        return new Diagnostico(
                "esta habilitado y vigente, y SIN poder abrir "
                        + leNiega.size()
                        + " de las "
                        + CatalogoDelSistema.opciones().size() * Privilegio.values().length
                        + " cosas que este sistema le tiene que dejar hacer. "
                        + String.join(". Y ", motivos),
                String.join("; y ", remedios));
    }

    /** Cuales de las cuatro condiciones de la propia cuenta no se cumplen ese dia. */
    private static List<String> queLeImpideConceder(FichaDeLaCuenta ficha, LocalDate hoy) {
        List<String> impide = new ArrayList<>();
        if (!ficha.habilitado()) {
            impide.add("esta inhabilitado en `identidad`");
        }
        @Nullable LocalDate desde = ficha.vigenciaDesde();
        if (desde != null && desde.isAfter(hoy)) {
            impide.add("su vigencia empieza el " + desde);
        }
        @Nullable LocalDate hasta = ficha.vigenciaHasta();
        if (hasta != null && hasta.isBefore(hoy)) {
            impide.add("su vigencia termino el " + hasta);
        }
        if (!ficha.adoptada()) {
            impide.add(
                    "no tiene sujeto de `identidad` y esta fuera de su plazo de adopcion de "
                            + PlazoDeAdopcion.DIAS
                            + " dias (#125)");
        }
        return impide;
    }
}
