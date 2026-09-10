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
 * postcondicion es la unica afirmacion que importa —el administrador puede entrar—, y no se deduce
 * de que el consumidor no fallara: un buzon que contesta 200 con cero eventos es exactamente lo que
 * devuelve {@code identidad} cuando esta municipalidad todavia no se ha implantado alli.
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
 * <h2>Idempotente, entera</h2>
 *
 * <p>Se ejecuta en cada despliegue. Lo que ya existe se queda como esta —con los permisos que
 * alguien haya configurado despues—, y lo que falta se crea. Nunca borra.
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

    public ImplantarMunicipalidad(
            RegistroDeMunicipalidadesJdbc registro,
            SembradorDelCatalogo sembrador,
            DatosDeImplantacion datos,
            ObjectProvider<CorrerElConsumidorDeIdentidad> consumidor,
            ComprobadorDeAcceso guardia,
            Clock reloj) {
        this.registro = registro;
        this.sembrador = sembrador;
        this.datos = datos;
        this.consumidor = consumidor;
        this.guardia = guardia;
        this.reloj = reloj;
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
            comprobarQueLaCopiaLlego();

            log.info(
                    "Municipalidad {} lista en caja: el administrador '{}' esta en la copia local"
                            + " con sus {} privilegios sobre las {} opciones de este sistema",
                    datos.ubigeo(),
                    datos.administrador(),
                    Privilegio.values().length,
                    CatalogoDelSistema.opciones().size());
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
     * La postcondicion: el administrador puede entrar.
     *
     * <p>Se comprueba con el <b>mismo</b> {@link ComprobadorDeAcceso} que usa el guardia en cada
     * peticion, y no contando filas: lo que decide si alguien puede abrir una pantalla es esa
     * consulta —con su precedencia usuario-sobre-grupo y sus tres vigencias—, y contar filas de
     * {@code permiso} daria por buena una copia en la que el administrador esta deshabilitado o su
     * grupo caducado.
     *
     * <p>Se distinguen los dos motivos porque se arreglan distinto: que no haya <b>ninguna</b> fila
     * suya dice que el buzon no trajo su alta —casi siempre, que {@code identidad} todavia no
     * implanto esta municipalidad—; que este y le falten privilegios dice que llego su alta y no su
     * matriz, que es lo que pasa cuando un evento se quedo pospuesto.
     */
    private void comprobarQueLaCopiaLlego() {
        String cuenta = datos.administrador();
        if (!guardia.conoceAlUsuario(cuenta)) {
            throw new IllegalStateException(
                    "La implantacion de "
                            + datos.ubigeo()
                            + " corrio el consumidor del buzon y la copia local se quedo SIN"
                            + " NINGUNA fila de `usuario` para el administrador «"
                            + cuenta
                            + "». El buzon contesto y no trajo su alta, que es lo que pasa cuando"
                            + " esta municipalidad todavia no esta implantada en `identidad`: alli"
                            + " no hay cola que servirle a esta caja. Dar esto por bueno dejaria el"
                            + " Job en Complete y la ventanilla sin nadie que pueda entrar."
                            + " Remedio: implantar `identidad` primero y volver a correr esta"
                            + " implantacion");
        }
        LocalDate hoy = LocalDate.now(reloj);
        List<String> faltan = new ArrayList<>();
        for (CatalogoDelSistema.Opcion opcion : CatalogoDelSistema.opciones()) {
            for (Privilegio privilegio : Privilegio.values()) {
                if (!guardia.autoriza(cuenta, opcion.codigo(), privilegio, hoy)) {
                    faltan.add(opcion.codigo() + ":" + privilegio.name());
                }
            }
        }
        if (!faltan.isEmpty()) {
            throw new IllegalStateException(
                    "La implantacion de "
                            + datos.ubigeo()
                            + " dejo al administrador «"
                            + cuenta
                            + "» dado de alta en la copia local y SIN poder abrir "
                            + faltan.size()
                            + " de las "
                            + CatalogoDelSistema.opciones().size() * Privilegio.values().length
                            + " cosas que este sistema le tiene que dejar hacer: "
                            + faltan
                            + ". Su alta llego por el buzon y su matriz de permisos no —o llego y"
                            + " se quedo pospuesta porque le faltaba su dependencia—. Remedio:"
                            + " comprobar en `identidad` que esa cuenta esta en el grupo de"
                            + " administracion de esta municipalidad, y volver a correr esta"
                            + " implantacion");
        }
    }
}
