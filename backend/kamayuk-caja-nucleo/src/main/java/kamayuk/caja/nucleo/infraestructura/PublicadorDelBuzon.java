package kamayuk.caja.nucleo.infraestructura;

import java.util.Optional;
import kamayuk.caja.nucleo.aplicacion.EntregarEventos;
import kamayuk.caja.plataforma.RecorridoPorMunicipalidades;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Saca el buzon, municipalidad por municipalidad (ADR-0026 §3).
 *
 * <h2>Recorre el registro de municipalidades, y tiene que hacerlo</h2>
 *
 * <p>El buzon lleva RLS: sin contexto de tenant no se puede leer ni una fila —revienta, no devuelve
 * vacio (#486)—. Y un proceso de fondo no tiene un token del que sacar la municipalidad. Asi que
 * usa {@link RecorridoPorMunicipalidades}, el mismo mecanismo que el portal del ciudadano (#57):
 * una transaccion y un {@code SET LOCAL} por municipalidad.
 *
 * <p><b>Esa transaccion de la rama no es la de los eventos</b> (#109). Dentro de ella, {@link
 * EntregarEventos} lee y marca cada evento en una transaccion nueva —{@code REQUIRES_NEW}, en otro
 * bean para que el proxy la aplique—, que recibe su propio {@code SET LOCAL} del mismo contexto de
 * tenant; la de la rama queda suspendida, sin leer nada ni retener candado alguno mientras dura la
 * llamada al origen. Hasta #109 no era asi: por autoinvocacion, la vuelta entera corria en la de la
 * rama.
 *
 * <p><b>Una rama que revienta no tumba las demas.</b> Si el sistema de origen de una municipalidad
 * esta caido, sus eventos se quedan pendientes y las otras se entregan igual. Lo contrario dejaria
 * a todas las municipalidades del cluster esperando a la que peor esta.
 *
 * <h2>Ni {@code web} ni {@code batch}: su propio perfil, {@value #PERFIL} (#79)</h2>
 *
 * <p>No va en {@code web} por lo mismo que {@code ImplantarMunicipalidad} (#202): un proceso que
 * corre solo no tiene por que estar en el que atiende peticiones. En un despliegue con tres
 * replicas web, tres publicadores compitiendo por el mismo buzon entregarian el mismo evento hasta
 * tres veces —el receptor lo deduplica por {@code pagoId}— y, desde #109, no le cuentan de mas
 * intentos: la marca solo cuenta si {@code intentos} sigue valiendo lo que valia al leerlo. Hasta
 * #109 eso lo decia de un {@code FOR UPDATE SKIP LOCKED} que duraba la vuelta entera, con los
 * {@code POST} dentro. Aun asi sobran: los intentos son lo que separa un evento vivo de uno MUERTO,
 * y el descriptor despliega uno solo.
 *
 * <p><b>Y no va en {@code batch}, que es donde estuvo hasta #79.</b> En {@code stg}, el 2026-09-14,
 * {@code pago_evento} valia 0 en la base de {@code rentas}: ningun pago habia llegado. Lo que habia
 * debajo no era lo que se creia:
 *
 * <ol>
 *   <li>Se daba por hecho —P6 §4.4, el descriptor, los javadocs hermanos de {@code rentas} y {@code
 *       catastro}— que ningun backend tenia {@code @EnableScheduling}. <b>En este no es cierto</b>,
 *       medido en #79: {@code spring-modulith-starter-core} trae {@code MomentsAutoConfiguration},
 *       que lo declara en todos los perfiles. Asi que este metodo SI se planificaba en {@code
 *       batch}.
 *   <li>Y {@code batch} es el perfil de lo que <b>termina</b>: el Job de implantacion y el {@code
 *       CronJob} del consumidor de {@code identidad}. El publicador vivia los segundos que viven
 *       ellos, cada cinco minutos, con un entorno que no lleva {@code KAMAYUK_CAJA_ORIGENES} ni la
 *       credencial hacia {@code rentas}: la direccion por omision es {@code rentas:8080}, que en el
 *       cluster no resuelve, y cada {@code NoContesta} le cuenta un intento al pago. Con {@code
 *       kamayuk.caja.entrega.intentos} = 8, por el codigo un pago cobrado moria sin entregarse en a
 *       lo sumo ocho corridas del {@code CronJob}. Que corria se midio en #79; lo que gastaba no se
 *       midio en {@code stg}, donde no habia ni un pago.
 *   <li>Y ningun proceso de larga vida lo llevaba: el perfil {@code web} no, y el descriptor no
 *       desplegaba otro.
 * </ol>
 *
 * <p>Con un perfil propio las dos formas dejan de estorbarse. El {@code CronJob} del consumidor
 * sigue en {@code batch}: termina, y el publicador no esta. El {@code Deployment} del publicador
 * corre en {@value #PERFIL}: planifica, no arranca ningun {@code ApplicationRunner} —todos son de
 * {@code batch}, y la regla {@code TODA_SIEMBRA_CORRE_SOLO_EN_EL_PERFIL_BATCH} lo sujeta— y no
 * termina. Que no termine no sale gratis: con {@code spring.threads.virtual.enabled} el
 * planificador corre en hilos virtuales, que son DEMONIO, y sin nada mas la JVM saldria sola con
 * codigo 0 —el {@code CrashLoopBackOff} de {@code kamayuk-rentas-batch} que C-17 §5 midio—. Lo
 * sujeta {@code spring.main.keep-alive} en el bloque {@code publicador} de {@code
 * application.yaml}. Las dos mitades las mide {@code ArranqueDeLaAplicacionTest}, contra el
 * artefacto de verdad.
 *
 * <p><b>{@code @EnableScheduling} va aqui aunque hoy sea redundante</b>, y se dice para que nadie
 * lo lea como la causa de que planifique: quitarlo deja la prueba de arranque en verde, porque
 * {@code MomentsAutoConfiguration} lo sigue poniendo. Se queda para que el unico proceso de este
 * sistema que depende de planificar no lo haga de una autoconfiguracion de otra libreria, que puede
 * dejar de traerlo en cualquier version.
 */
@Component
@Profile(PublicadorDelBuzon.PERFIL)
@EnableScheduling
public class PublicadorDelBuzon {

    /** El perfil del proceso de larga vida que saca el buzon. Ni {@code web} ni {@code batch}. */
    public static final String PERFIL = "publicador";

    private static final Logger REGISTRO = LoggerFactory.getLogger(PublicadorDelBuzon.class);

    private final EntregarEventos entregar;
    private final RecorridoPorMunicipalidades municipalidades;

    public PublicadorDelBuzon(
            EntregarEventos entregar, RecorridoPorMunicipalidades municipalidades) {
        this.entregar = entregar;
        this.municipalidades = municipalidades;
    }

    /**
     * Una vuelta.
     *
     * <p>El intervalo es {@code fixedDelayString} y no {@code fixedRate}: con {@code fixedRate},
     * una vuelta lenta —el destino tardando treinta segundos por evento— se solaparia con la
     * siguiente y las dos competirian por el mismo lote.
     */
    @Scheduled(fixedDelayString = "${kamayuk.caja.entrega.intervalo:PT10S}")
    public void publicar() {
        RecorridoPorMunicipalidades.Resultado<EntregarEventos.Vuelta> resultado =
                municipalidades.recorrer(
                        municipalidad -> {
                            EntregarEventos.Vuelta vuelta = entregar.entregarPendientes();
                            if (vuelta.leidos() > 0) {
                                REGISTRO.info(
                                        "Buzon de {} ({}): {} leidos, {} entregados, {} muertos",
                                        municipalidad.nombre(),
                                        municipalidad.id(),
                                        vuelta.leidos(),
                                        vuelta.entregados(),
                                        vuelta.muertos());
                            }
                            return Optional.of(vuelta);
                        });
        // Una rama que revienta no tumba las demas: el recorrido las anota en `fallidas` y sigue.
        // Lo que aqui NO se hace es totalizar como si estuvieran todas —el recorrido lo prohibe—:
        // se dice cuantas quedaron sin sacar, que es lo unico honesto que se puede decir.
        if (!resultado.completo()) {
            REGISTRO.error(
                    "El buzon de {} municipalidad(es) de {} no se pudo sacar en esta vuelta: {}",
                    resultado.fallidas().size(),
                    resultado.recorridas(),
                    resultado.fallidas());
        }
    }
}
