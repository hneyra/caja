package kamayuk.caja.seguridad.aplicacion;

import java.util.List;
import java.util.Optional;
import kamayuk.caja.compartido.TenantContext;
import kamayuk.caja.dominio.MunicipalidadId;
import kamayuk.caja.plataforma.RecorridoPorMunicipalidades;
import kamayuk.caja.seguridad.AlertaDeHuerfanasYaAdoptadas;
import kamayuk.caja.seguridad.HuerfanaYaAdoptada;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * El aviso de las filas que un sujeto nuevo ya adopto sobre la de otro (#137), <b>una vez por
 * corrida</b> y justo DETRAS de la pasada del consumidor.
 *
 * <h2>Por que un runner aparte y no una linea mas del consumidor</h2>
 *
 * <p>Los otros dos avisos de cada corrida —los pospuestos y las filas sin sujeto— los manda {@link
 * CorrerElConsumidorDeIdentidad} al final de {@code unaPasada}. Este va en su propio {@code
 * ApplicationRunner}, ordenado inmediatamente detras, para no tocar ni aquel runner ni {@link
 * ConsumirEventosDeIdentidad} ni {@link AplicarUnEventoDeIdentidad}: los tres estan cambiando en
 * paralelo por #125 y sus seguimientos, y lo que esto hace —leer y avisar— no necesita nada de
 * ellos salvo que ya hayan corrido. El efecto es el mismo:
 *
 * <ul>
 *   <li>corre en las dos invocaciones del perfil {@code batch} que llevan {@code
 *       kamayuk.identidad.url} —el {@code CronJob} cada cinco minutos y el {@code Job} de
 *       implantacion, donde la pasada la hace {@link ImplantarMunicipalidad} en linea—, y en las
 *       dos DESPUES de la pasada: {@link #ORDEN};
 *   <li>una corrida que muere porque {@code identidad} no contesta no lo manda: Spring Boot corta
 *       los runners en el primero que falla, igual que los otros dos avisos van dentro del {@code
 *       try} de la pasada;
 *   <li>y la municipalidad es la misma que la del buzon: sale de la cuenta de servicio con {@link
 *       CorrerElConsumidorDeIdentidad#municipalidadDe}, no de una segunda regla.
 * </ul>
 *
 * <p>No falla ni cambia el codigo de salida: una candidata no es un fallo de la corrida —ningun
 * evento que esta corrida pudiera aplicar la arregla—, como no lo es una fila sin sujeto.
 */
@Component
@Profile("batch")
@ConditionalOnProperty("kamayuk.identidad.url")
@Order(AvisarDeLasHuerfanasYaAdoptadas.ORDEN)
public class AvisarDeLasHuerfanasYaAdoptadas implements ApplicationRunner {

    /** Detras del consumidor: primero se trae lo que falta, despues se mira lo que quedo. */
    public static final int ORDEN = CorrerElConsumidorDeIdentidad.DESPUES_DE_IMPLANTAR + 1;

    private final HuerfanasYaAdoptadas huerfanas;
    private final AlertaDeHuerfanasYaAdoptadas alerta;
    private final RecorridoPorMunicipalidades registro;
    private final String clienteDeServicio;

    public AvisarDeLasHuerfanasYaAdoptadas(
            HuerfanasYaAdoptadas huerfanas,
            AlertaDeHuerfanasYaAdoptadas alerta,
            RecorridoPorMunicipalidades registro,
            @Value("${kamayuk.identidad.cliente:}") String clienteDeServicio) {
        this.huerfanas = huerfanas;
        this.alerta = alerta;
        this.registro = registro;
        this.clienteDeServicio = clienteDeServicio;
    }

    @Override
    public void run(ApplicationArguments argumentos) {
        avisar();
    }

    /**
     * Lee las candidatas de la municipalidad del buzon y, si hay alguna, avisa.
     *
     * <p>El contexto de municipalidad se <b>restaura</b> al salir, como en {@link
     * CorrerElConsumidorDeIdentidad#unaPasada}: quien lo fijo es quien lo quita.
     *
     * @return cuantas se avisaron; cero, que es lo corriente
     */
    public int avisar() {
        Optional<MunicipalidadId> anterior = TenantContext.actualSiHay();
        TenantContext.fijar(
                new MunicipalidadId(
                        CorrerElConsumidorDeIdentidad.municipalidadDe(
                                clienteDeServicio, registro)));
        try {
            List<HuerfanaYaAdoptada> candidatas = huerfanas.candidatas();
            if (candidatas.isEmpty()) {
                return 0;
            }
            alerta.hayHuerfanasYaAdoptadas(candidatas);
            return candidatas.size();
        } finally {
            anterior.ifPresentOrElse(TenantContext::fijar, TenantContext::limpiar);
        }
    }
}
