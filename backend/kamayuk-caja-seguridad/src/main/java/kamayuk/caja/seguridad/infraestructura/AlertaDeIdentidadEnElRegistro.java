package kamayuk.caja.seguridad.infraestructura;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.StringJoiner;
import kamayuk.caja.seguridad.AlertaDeEventosSinAplicar;
import kamayuk.caja.seguridad.EventoDeIdentidadRecibido;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * El aviso de un evento de la autorizacion que no se pudo aplicar, al mismo responsable y por el
 * mismo canal que el de un pago sin registrar (ADR-0026 §4).
 *
 * <p>Son las mismas dos variables —{@code KAMAYUK_CAJA_RESPONSABLE} y {@code KAMAYUK_CAJA_CANAL}— y
 * a proposito: la caja tiene UNA persona que responde por lo que este despliegue no consigue hacer
 * solo, y un permiso concedido que aqui no rige es de esa clase. Como {@code AlertaEnElRegistro},
 * hoy el canal es una direccion y el aviso es una linea de ERROR con ella dentro: quien opere la
 * instalacion la encamina.
 *
 * <p>Sin valor por omision para el responsable, y aqui SI se exige: {@code
 * ResponsableDeLaConciliacion} lo hace en el perfil web y este proceso corre en {@code batch},
 * donde aquel bean no participa del arranque.
 */
@Component
@Profile("batch")
@ConditionalOnProperty("kamayuk.identidad.url")
public class AlertaDeIdentidadEnElRegistro implements AlertaDeEventosSinAplicar {

    private static final Logger REGISTRO =
            LoggerFactory.getLogger(AlertaDeIdentidadEnElRegistro.class);

    private final String responsable;
    private final String canal;

    public AlertaDeIdentidadEnElRegistro(
            @Value("${kamayuk.caja.conciliacion.responsable}") String responsable,
            @Value("${kamayuk.caja.conciliacion.canal}") String canal) {
        if (responsable.isBlank() || canal.isBlank()) {
            throw new IllegalStateException(
                    "El consumidor de identidad necesita a quien avisar: KAMAYUK_CAJA_RESPONSABLE"
                            + " y KAMAYUK_CAJA_CANAL (ADR-0026 §4). Sin ellos un permiso que no"
                            + " llega se apartaria en silencio");
        }
        this.responsable = responsable;
        this.canal = canal;
    }

    @Override
    public void hayUnEventoSinAplicar(
            EventoDeIdentidadRecibido evento, String motivo, long apartados) {
        REGISTRO.error(
                "LA COPIA LOCAL DE LA AUTORIZACION ESTA INCOMPLETA: el evento {} ({}, secuencia"
                        + " {}) de `identidad` no se pudo aplicar y se aparto. Motivo: {}. Hay {}"
                        + " evento(s) apartados en esta municipalidad. Mientras esten ahi, alguien"
                        + " tiene en `identidad` un permiso, una cuenta o una afiliacion que en"
                        + " esta caja no rige, y ninguna cifra lo delata (ADR-0039 etapa 4,"
                        + " ADR-0026 §4). Responsable: {} <{}>",
                evento.eventoId(),
                evento.tipoPublicado(),
                evento.secuencia(),
                motivo,
                apartados,
                responsable,
                canal);
    }

    @Override
    public void hayEventosPospuestos(
            List<EventoDeIdentidadRecibido> pospuestos, Instant ahora, Duration umbral) {
        StringJoiner lista = new StringJoiner("; ");
        for (EventoDeIdentidadRecibido evento : pospuestos) {
            lista.add(
                    evento.tipoPublicado()
                            + " sujeto "
                            + evento.sujetoId()
                            + ", secuencia "
                            + evento.secuencia()
                            + ", lleva "
                            + enMinutos(Duration.between(evento.creadoEn(), ahora)));
        }
        REGISTRO.error(
                "LA COPIA LOCAL DE LA AUTORIZACION ESTA DESATRASADA: {} evento(s) de `identidad`"
                        + " llevan mas de {} sin poder aplicarse porque falta aquello de lo que"
                        + " dependen, y siguen en el buzon. No se han perdido —la corrida acaba"
                        + " bien y la siguiente los vuelve a intentar—, pero mientras esten ahi"
                        + " alguien tiene en `identidad` un permiso, una cuenta o una afiliacion"
                        + " que en esta caja no rige, y ninguna cifra lo delata (ADR-0039 etapa 4,"
                        + " ADR-0026 §4). Son: {}. Responsable: {} <{}>",
                pospuestos.size(),
                enMinutos(umbral),
                lista,
                responsable,
                canal);
    }

    /** La edad en minutos, que es la unidad en que se lee una ventana de cinco. */
    private static String enMinutos(Duration edad) {
        return edad.toMinutes() + " min";
    }
}
