package kamayuk.caja.seguridad.aplicacion;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
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
 *       <td>una linea de RESUMEN por vuelta</td></tr>
 *   <tr><td>no se podra aplicar nunca</td><td>apartado</td><td>si</td><td>al responsable</td></tr>
 *   <tr><td>todavia no (falta su dependencia)</td><td>intacta</td><td><b>NO</b></td>
 *       <td>una linea, y al responsable si lleva mas de {@value #MINUTOS_QUE_SE_ADMITEN} min</td></tr>
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

    /**
     * Cuanto puede llevar un evento pospuesto antes de que se avise: <b>tres ticks</b> del {@code
     * CronJob}, que corre cada cinco minutos.
     *
     * <p>Uno no basta: un evento que llega antes que su dependencia es NORMAL —el emisor sirve por
     * secuencia, pero una pagina se corta donde se corta— y la vuelta siguiente lo resuelve; avisar
     * al primer tick seria avisar de lo que se arregla solo, y un canal que grita en lo corriente
     * se deja de mirar (#437). Tres es lo primero que ya no se explica por el troceado en paginas:
     * medido con las cinco aplicaciones levantadas, cuando la dependencia llega el pospuesto entra
     * en <b>una</b> corrida (informe de AC-5/AC-6 §3(d)), asi que quince minutos son tres corridas
     * en las que no llego.
     */
    public static final int MINUTOS_QUE_SE_ADMITEN = 15;

    private static final Duration EDAD_QUE_SE_AVISA = Duration.ofMinutes(MINUTOS_QUE_SE_ADMITEN);

    private final FuenteDeEventosDeIdentidad fuente;
    private final AplicarUnEventoDeIdentidad aplicador;
    private final AlertaDeEventosSinAplicar alerta;
    private final Clock reloj;

    public ConsumirEventosDeIdentidad(
            FuenteDeEventosDeIdentidad fuente,
            AplicarUnEventoDeIdentidad aplicador,
            AlertaDeEventosSinAplicar alerta,
            Clock reloj) {
        this.fuente = fuente;
        this.aplicador = aplicador;
        this.alerta = alerta;
        this.reloj = reloj;
    }

    /** Una pagina del buzon, resuelta y acusada. Con el contexto de municipalidad ya fijado. */
    public Vuelta consumir() {
        FuenteDeEventosDeIdentidad.Lote lote = fuente.pendientes(POR_VUELTA);
        List<UUID> resueltos = new ArrayList<>();
        int aplicados = 0;
        int yaEstaban = 0;
        int ajenos = 0;
        int apartados = 0;
        List<EventoDeIdentidadRecibido> pospuestos = new ArrayList<>();

        for (EventoDeIdentidadRecibido evento : lote.eventos()) {
            try {
                AplicarUnEventoDeIdentidad.Aplicacion resultado = aplicador.aplicar(evento);
                switch (resultado) {
                    case APLICADO -> aplicados++;
                    case YA_APLICADO -> yaEstaban++;
                    // Se CUENTAN y se resumen al final de la vuelta, en UNA linea. Una por evento
                    // eran 159 lineas en una implantacion entera de esta caja, medido con las
                    // cinco aplicaciones levantadas (hallazgo H6): la mayoria de los 161 accesos
                    // del catalogo unido son de otros sistemas, asi que lo corriente es que casi
                    // toda la pagina sea ajena y el registro de la corrida no diga otra cosa.
                    case IGNORADO_AJENO -> ajenos++;
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
                pospuestos.add(evento);
                log.warn(
                        "Evento {} ({}, secuencia {}) TODAVIA no se puede aplicar y se deja"
                                + " pendiente en el buzon de `identidad`: {}",
                        evento.eventoId(),
                        evento.tipoPublicado(),
                        evento.secuencia(),
                        todaviaNo.getMessage());
            }
        }

        if (ajenos > 0) {
            log.info(
                    "{} permiso(s) de otros sistemas ignorados y acusados en esta vuelta: no rigen"
                            + " en esta copia. No es un fallo: `identidad` publica los cinco"
                            + " catalogos por un solo buzon, y a esta caja solo le tocan los suyos",
                    ajenos);
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
                List.copyOf(pospuestos),
                lote.quedan(),
                acuseRechazado);
    }

    /**
     * El aviso de los pospuestos que llevan demasiado, <b>una vez por corrida</b>. Lo llama el
     * runner cuando ya no va a dar mas vueltas, con lo que quedo pospuesto en todas ellas.
     *
     * <p>No falla ni cambia el codigo de salida: un pospuesto <b>no es un fallo de la corrida</b>
     * —lo que le falta es un evento que todavia no ha llegado, y esta corrida hizo todo lo que
     * podia hacer—. Lo que este metodo arregla es que nadie se enterara: hasta aqui la unica huella
     * era un WARN por vuelta dentro del registro del pod.
     *
     * @return cuantos se avisaron; cero si ninguno pasa del umbral, que es lo corriente
     */
    public int avisarDeLosPospuestosQueLlevanDemasiado(
            Collection<EventoDeIdentidadRecibido> pospuestos) {
        Instant ahora = reloj.instant();
        List<EventoDeIdentidadRecibido> viejos = new ArrayList<>();
        for (EventoDeIdentidadRecibido evento : pospuestos) {
            if (Duration.between(evento.creadoEn(), ahora).compareTo(EDAD_QUE_SE_AVISA) >= 0) {
                viejos.add(evento);
            }
        }
        if (viejos.isEmpty()) {
            return 0;
        }
        alerta.hayEventosPospuestos(List.copyOf(viejos), ahora, EDAD_QUE_SE_AVISA);
        return viejos.size();
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
     * @param pospuestos los que se dejaron en el buzon por faltarles su dependencia. La lista, y no
     *     la cuenta: el aviso del final de la corrida los nombra uno a uno
     * @param quedan cuantos dice el emisor que faltan <b>al servir la pagina</b>, con ella dentro.
     *     Es una medida ANTES del acuse, y por eso no se publica cruda: ver {@link
     *     #quedanTrasElAcuse()}
     * @param acuseRechazado si el emisor rechazo el acuse por su contenido
     */
    public record Vuelta(
            int leidos,
            int aplicados,
            int yaEstaban,
            int ajenos,
            int apartados,
            List<EventoDeIdentidadRecibido> pospuestos,
            long quedan,
            boolean acuseRechazado) {

        /** Cuantos se dejaron en el buzon por faltarles su dependencia. */
        public int pendientes() {
            return pospuestos.size();
        }

        /** Cuantos se acusaron: los resueltos, y ninguno si el emisor rechazo el acuse. */
        public int acusados() {
            return acuseRechazado ? 0 : leidos - pendientes();
        }

        /**
         * Lo que le queda al buzon DESPUES de este acuse.
         *
         * <p>El emisor cuenta {@code quedan} al servir la pagina y con la pagina dentro, asi que
         * publicarlo crudo da la linea que el hallazgo H6 encontro: «174 acusados; quedan 174», que
         * se lee como que la corrida no avanzo cuando acababa de vaciar el buzon. Lo que interesa
         * es el retraso que queda, y ese es el que sobra tras descontar lo acusado.
         */
        public long quedanTrasElAcuse() {
            return Math.max(0, quedan - acusados());
        }

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
            return leidos == 0 || leidos == pendientes() || acuseRechazado;
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
                    + pendientes()
                    + " pospuestos por su dependencia; "
                    + acusados()
                    + " acusados y quedan "
                    + quedanTrasElAcuse()
                    + " en el buzon de `identidad`"
                    + (acuseRechazado ? "; y el acuse fue RECHAZADO" : "");
        }
    }
}
