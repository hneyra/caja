package kamayuk.caja.seguridad.aplicacion;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import kamayuk.caja.seguridad.AlertaDeEventosSinAplicar;
import kamayuk.caja.seguridad.EventoDeIdentidadRecibido;
import kamayuk.caja.seguridad.FuenteDeEventosDeIdentidad;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Una vuelta del consumidor del buzon de {@code identidad}: lee una pagina, aplica cada evento en
 * su propia transaccion, y acusa <b>despues</b> los que quedaron resueltos (ADR-0039 etapa 4,
 * ADR-0028 §3).
 *
 * <h2>Los cuatro desenlaces de un evento, y que se acusa</h2>
 *
 * <table>
 *   <caption>Lo que pasa con cada evento</caption>
 *   <tr><th>desenlace</th><th>copia</th><th>acuse</th><th>aviso</th></tr>
 *   <tr><td>aplicado (o ya estaba)</td><td>escrita</td><td>si</td><td>no</td></tr>
 *   <tr><td>de otro sistema ({@code PERMISO_FIJADO} ajeno)</td><td>intacta</td><td>si</td>
 *       <td>una linea de aviso</td></tr>
 *   <tr><td>no se podra aplicar nunca</td><td>apartado</td><td>si</td><td>al responsable</td></tr>
 *   <tr><td>todavia no (falta su dependencia)</td><td>intacta</td><td><b>NO</b></td>
 *       <td>una linea</td></tr>
 * </table>
 *
 * <p>La cuarta fila es la que separa a este consumidor de uno que «funciona»: un evento que llega
 * antes que aquel del que depende se deja en el buzon del emisor, y la siguiente vuelta —o la
 * siguiente corrida— lo encuentra con su dependencia puesta. Acusarlo lo perderia para siempre.
 *
 * <h2>El acuse va DESPUES de las transacciones, y esto tiene prueba</h2>
 *
 * <p>Cada {@code aplicar} es {@code REQUIRES_NEW} y ya hizo {@code commit} cuando vuelve. El acuse
 * al emisor se manda con la lista de los que volvieron, una vez por pagina. Un acuse mandado antes
 * del {@code commit} —o dentro de la transaccion— es la forma exacta de perder un evento sin que
 * nada lo diga: el emisor deja de servirlo y esta copia nunca lo escribio. Es el R1 de la etapa 2
 * de {@code identidad} visto desde el receptor.
 *
 * <h2>El acuse que falla no es un evento que falla</h2>
 *
 * <p>Si el acuse no llega ({@link FuenteDeEventosDeIdentidad.IdentidadNoContesta}), lo aplicado
 * SIGUE aplicado: el emisor lo vuelve a servir y {@code identidad_evento_aplicado} lo descarta. Se
 * deja subir, porque es transitorio y la corrida tiene que acabar en rojo. Si el emisor lo
 * <b>rechaza</b> ({@link FuenteDeEventosDeIdentidad.AcuseRechazado}) es otra cosa: mandar lo mismo
 * otra vez da lo mismo, asi que se registra, la vuelta se da por «sin progreso» y la corrida
 * termina — reintentar seria dar cincuenta vueltas sobre el mismo 422.
 */
public class ConsumirEventosDeIdentidad {

    private static final Logger log = LoggerFactory.getLogger(ConsumirEventosDeIdentidad.class);

    /** Cuantos se piden por vuelta. Es el tope que {@code identidad} sirve por omision. */
    public static final int POR_VUELTA = 200;

    private final FuenteDeEventosDeIdentidad fuente;
    private final AplicarUnEventoDeIdentidad aplicador;
    private final AlertaDeEventosSinAplicar alerta;

    public ConsumirEventosDeIdentidad(
            FuenteDeEventosDeIdentidad fuente,
            AplicarUnEventoDeIdentidad aplicador,
            AlertaDeEventosSinAplicar alerta) {
        this.fuente = fuente;
        this.aplicador = aplicador;
        this.alerta = alerta;
    }

    /** Una pagina del buzon, resuelta y acusada. Con el contexto de municipalidad ya fijado. */
    public Vuelta consumir() {
        FuenteDeEventosDeIdentidad.Lote lote = fuente.pendientes(POR_VUELTA);
        List<UUID> resueltos = new ArrayList<>();
        int aplicados = 0;
        int yaEstaban = 0;
        int ajenos = 0;
        int apartados = 0;
        int pendientes = 0;

        for (EventoDeIdentidadRecibido evento : lote.eventos()) {
            try {
                AplicarUnEventoDeIdentidad.Aplicacion resultado = aplicador.aplicar(evento);
                switch (resultado) {
                    case APLICADO -> aplicados++;
                    case YA_APLICADO -> yaEstaban++;
                    case IGNORADO_AJENO -> {
                        ajenos++;
                        log.warn(
                                "Evento {} ({}, secuencia {}) es un permiso de OTRO sistema y no"
                                        + " rige en esta copia: se acusa y no se aplica. No es un"
                                        + " fallo: `identidad` publica los cinco catalogos por un"
                                        + " solo buzon, y a esta caja solo le tocan los suyos",
                                evento.eventoId(),
                                evento.tipoPublicado(),
                                evento.secuencia());
                    }
                    // Los tres estan arriba; Checkstyle exige el `default` aunque el enumerado
                    // este cubierto, y un cuarto valor que alguien anada manana no puede pasar
                    // como «resuelto» sin decidir que es.
                    default ->
                            throw new IllegalStateException(
                                    "Resultado de aplicacion sin tratar: " + resultado);
                }
                resueltos.add(evento.eventoId());
            } catch (AplicarUnEventoDeIdentidad.NoSePuedeAplicar nunca) {
                String motivo = motivoDe(nunca);
                aplicador.apartar(evento, motivo);
                apartados++;
                resueltos.add(evento.eventoId());
                alerta.hayUnEventoSinAplicar(evento, motivo, aplicador.apartados());
            } catch (AplicarUnEventoDeIdentidad.TodaviaNo todaviaNo) {
                pendientes++;
                log.warn(
                        "Evento {} ({}, secuencia {}) TODAVIA no se puede aplicar y se deja"
                                + " pendiente en el buzon de `identidad`: {}",
                        evento.eventoId(),
                        evento.tipoPublicado(),
                        evento.secuencia(),
                        todaviaNo.getMessage());
            }
        }

        boolean acuseRechazado = false;
        if (!resueltos.isEmpty()) {
            try {
                fuente.acusar(List.copyOf(resueltos));
            } catch (FuenteDeEventosDeIdentidad.AcuseRechazado rechazo) {
                acuseRechazado = true;
                log.error(
                        "`identidad` RECHAZO el acuse de {} evento(s) con {}: {}. Los eventos SI"
                                + " estan resueltos en esta copia; lo que no cuadra es lo que este"
                                + " consumidor y el buzon entienden por un acuse, y eso no cambia"
                                + " reintentando. La corrida termina aqui",
                        resueltos.size(),
                        rechazo.estado(),
                        rechazo.getMessage());
            }
        }
        return new Vuelta(
                lote.eventos().size(),
                aplicados,
                yaEstaban,
                ajenos,
                apartados,
                pendientes,
                lote.quedan(),
                acuseRechazado);
    }

    private static String motivoDe(RuntimeException noSePudo) {
        String mensaje = noSePudo.getMessage();
        return mensaje == null ? noSePudo.getClass().getSimpleName() : mensaje;
    }

    /**
     * Lo que dejo una vuelta.
     *
     * @param leidos cuantos vinieron en la pagina
     * @param aplicados cuantos entraron en la copia
     * @param yaEstaban cuantos se descartaron por deduplicacion
     * @param ajenos cuantos eran permisos de otro sistema
     * @param apartados cuantos no se podran aplicar nunca
     * @param pendientes cuantos se dejaron en el buzon por faltarles su dependencia
     * @param quedan cuantos dice el emisor que faltan, contando los de esta pagina
     * @param acuseRechazado si el emisor rechazo el acuse por su contenido
     */
    public record Vuelta(
            int leidos,
            int aplicados,
            int yaEstaban,
            int ajenos,
            int apartados,
            int pendientes,
            long quedan,
            boolean acuseRechazado) {

        /**
         * Si dar otra vuelta no cambiaria nada.
         *
         * <p>Sin progreso es: no vino nada; o vino y NADA se resolvio —todo se dejo pendiente, y
         * volver a pedir devolveria lo mismo—; o el acuse se rechazo, con lo que la siguiente
         * pagina traeria los mismos eventos ya resueltos. Con eventos pendientes y algo resuelto en
         * la misma vuelta SI hay progreso: lo resuelto puede ser justo la dependencia que a los
         * pendientes les faltaba.
         */
        public boolean sinProgreso() {
            return leidos == 0 || leidos == pendientes || acuseRechazado;
        }

        @Override
        public String toString() {
            return leidos
                    + " evento(s) leidos: "
                    + aplicados
                    + " aplicados, "
                    + yaEstaban
                    + " ya estaban, "
                    + ajenos
                    + " de otro sistema, "
                    + apartados
                    + " apartados sin poder aplicarse, "
                    + pendientes
                    + " pendientes por su dependencia; quedan "
                    + quedan
                    + " en el buzon de `identidad`"
                    + (acuseRechazado ? "; y el acuse fue RECHAZADO" : "");
        }
    }
}
