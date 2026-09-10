package kamayuk.caja.seguridad.aplicacion;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import kamayuk.caja.compartido.TenantContext;
import kamayuk.caja.dominio.MunicipalidadId;
import kamayuk.caja.plataforma.RecorridoPorMunicipalidades;
import kamayuk.caja.seguridad.EventoDeIdentidadRecibido;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * El proceso de vida corta que trae de {@code identidad} lo que esta copia no tiene (ADR-0039,
 * etapa 4). Lo lanza el {@code CronJob} del descriptor cada cinco minutos, y lo lanza tambien la
 * implantacion al terminar, <b>despues</b> de sembrar.
 *
 * <h2>Perfil {@code batch}, y fuera del camino del cobro</h2>
 *
 * <p>Corre sin servidor web y sin puerto, con las credenciales de {@code kamayuk_app} y su
 * auditoria. Ningun controlador de esta caja lo conoce, y la ventanilla no lo espera: lo que
 * comparte con ella es la tabla que el guardia lee. Con {@code identidad} apagado la ventanilla
 * cobra igual; lo que pasa es que esta corrida sale en rojo y la copia se queda como estaba.
 *
 * <h2>De que municipalidad, y de donde sale</h2>
 *
 * <p>De la cuenta de servicio con que se pide el token: {@code kamayuk-caja-servicio-<ubigeo>}
 * (ADR-0028 §2: una cuenta por sistema y municipalidad, porque el token lleva {@code
 * municipalidad_id} y {@code identidad} sirve el buzon de ESA). El ubigeo se lee de ahi y se
 * resuelve contra el registro local: si esta municipalidad no esta implantada aqui, no hay copia
 * que escribir y el proceso se niega en vez de escribir en la nada. Es la misma regla que el emisor
 * aplica al leer el {@code azp}, y por eso las dos puntas no pueden discrepar sobre de quien es el
 * buzon.
 *
 * <h2>Acotado</h2>
 *
 * <p>Como mucho {@value #VUELTAS_MAXIMAS} paginas por corrida, y se para antes en cuanto una vuelta
 * no progresa. Un proceso que no acaba no es un consumidor: es un pod que nadie mira.
 *
 * <h2>Y al terminar, quien lleva demasiado pospuesto</h2>
 *
 * <p>Lo que quedo pospuesto se junta de TODAS las vueltas —sin repetir, porque el emisor lo vuelve
 * a servir en cada una— y se pasa una sola vez a {@link
 * ConsumirEventosDeIdentidad#avisarDeLosPospuestosQueLlevanDemasiado}. La corrida termina igual de
 * bien: un pospuesto no es un fallo de la corrida, y salir en rojo por el convertiria un retraso en
 * un `Job` fallido cada cinco minutos. Lo que no puede seguir pasando es que no se entere nadie
 * (hallazgo H7 de la medida de AC-5/AC-6).
 *
 * <p>El aviso va DENTRO del {@code try} y despues del bucle, asi que una corrida que muere porque
 * {@code identidad} no contesta no lo manda: ahi lo que hay que mirar es otra cosa, y el rojo de la
 * corrida ya lo dice.
 */
@Component
@Profile("batch")
@ConditionalOnProperty("kamayuk.identidad.url")
@Order(CorrerElConsumidorDeIdentidad.DESPUES_DE_IMPLANTAR)
public class CorrerElConsumidorDeIdentidad implements ApplicationRunner {

    /** Detras de {@link ImplantarMunicipalidad}: primero se siembra, despues se trae. */
    public static final int DESPUES_DE_IMPLANTAR = ImplantarMunicipalidad.ORDEN + 1;

    private static final Logger log = LoggerFactory.getLogger(CorrerElConsumidorDeIdentidad.class);

    private static final int VUELTAS_MAXIMAS = 50;

    /** La forma del cliente de servicio, la misma que `identidad` lee del `azp` del token. */
    private static final Pattern CLIENTE_DE_SERVICIO =
            Pattern.compile("^kamayuk-caja-servicio-([0-9]{6})$");

    private final ConsumirEventosDeIdentidad consumidor;
    private final RecorridoPorMunicipalidades registro;
    private final String clienteDeServicio;

    public CorrerElConsumidorDeIdentidad(
            ConsumirEventosDeIdentidad consumidor,
            RecorridoPorMunicipalidades registro,
            @Value("${kamayuk.identidad.cliente:}") String clienteDeServicio) {
        this.consumidor = consumidor;
        this.registro = registro;
        this.clienteDeServicio = clienteDeServicio;
    }

    @Override
    public void run(ApplicationArguments argumentos) {
        long municipalidadId = municipalidadDe(clienteDeServicio, registro);
        TenantContext.fijar(new MunicipalidadId(municipalidadId));
        try {
            // Sin repetir y en el orden en que se leyeron: el emisor sirve el pospuesto otra vez
            // en cada vuelta —no se acusa, a proposito—, asi que una lista a secas diria que hay
            // tantos como vueltas se dieron.
            Map<UUID, EventoDeIdentidadRecibido> pospuestos = new LinkedHashMap<>();
            boolean seAgotaron = true;
            for (int vuelta = 1; vuelta <= VUELTAS_MAXIMAS; vuelta++) {
                ConsumirEventosDeIdentidad.Vuelta resultado = consumidor.consumir();
                log.info("Vuelta {} del consumidor de identidad: {}", vuelta, resultado);
                for (EventoDeIdentidadRecibido pospuesto : resultado.pospuestos()) {
                    pospuestos.putIfAbsent(pospuesto.eventoId(), pospuesto);
                }
                if (resultado.sinProgreso()) {
                    seAgotaron = false;
                    break;
                }
            }
            if (seAgotaron) {
                log.warn(
                        "Se agotaron las {} vueltas y el buzon de `identidad` sigue teniendo"
                                + " eventos. No es un fallo: la corrida acaba a proposito en vez"
                                + " de no acabar, y la siguiente sigue por donde esta se quedo",
                        VUELTAS_MAXIMAS);
            }
            consumidor.avisarDeLosPospuestosQueLlevanDemasiado(pospuestos.values());
        } finally {
            TenantContext.limpiar();
        }
    }

    /**
     * El identificador local de la municipalidad cuya cuenta de servicio es esta.
     *
     * @throws IllegalStateException si el cliente no tiene la forma, o la municipalidad no esta
     *     implantada aqui: sin fila en {@code municipalidad} no hay copia que escribir
     */
    static long municipalidadDe(String clienteDeServicio, RecorridoPorMunicipalidades registro) {
        Matcher forma = CLIENTE_DE_SERVICIO.matcher(clienteDeServicio.strip());
        if (!forma.matches()) {
            throw new IllegalStateException(
                    "kamayuk.identidad.cliente vale «"
                            + clienteDeServicio
                            + "» y tiene que ser `kamayuk-caja-servicio-<ubigeo>`: de ahi sale de"
                            + " que municipalidad es el buzon que se va a leer, y es lo mismo que"
                            + " `identidad` lee del token");
        }
        String ubigeo = forma.group(1);
        for (RecorridoPorMunicipalidades.Municipalidad municipalidad : registro.activas()) {
            if (ubigeo.equals(municipalidad.ubigeo())) {
                return municipalidad.id();
            }
        }
        throw new IllegalStateException(
                "La cuenta de servicio es de la municipalidad "
                        + ubigeo
                        + " y esa municipalidad no esta implantada en esta caja: no hay copia"
                        + " local que escribir. Primero la implantacion (ImplantarMunicipalidad)");
    }
}
