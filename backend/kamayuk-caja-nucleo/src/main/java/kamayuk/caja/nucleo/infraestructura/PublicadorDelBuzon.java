package kamayuk.caja.nucleo.infraestructura;

import java.util.Optional;
import kamayuk.caja.nucleo.aplicacion.EntregarEventos;
import kamayuk.caja.plataforma.RecorridoPorMunicipalidades;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
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
 * <p><b>Una rama que revienta no tumba las demas.</b> Si el sistema de origen de una municipalidad
 * esta caido, sus eventos se quedan pendientes y las otras se entregan igual. Lo contrario dejaria
 * a todas las municipalidades del cluster esperando a la que peor esta.
 *
 * <h2>Perfil {@code batch}, y no {@code web}</h2>
 *
 * <p>Por lo mismo que {@code ImplantarMunicipalidad} (#202): un proceso que corre solo no tiene por
 * que estar en el que atiende peticiones. En un despliegue con tres replicas web, tres publicadores
 * compitiendo por el mismo buzon no producen pagos duplicados —{@code FOR UPDATE SKIP LOCKED} lo
 * impide— pero si gastan intentos de mas, y los intentos son lo que separa un evento vivo de uno
 * MUERTO.
 */
@Component
@Profile("batch")
public class PublicadorDelBuzon {

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
