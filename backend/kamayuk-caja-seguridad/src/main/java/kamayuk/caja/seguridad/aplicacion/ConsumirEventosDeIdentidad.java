package kamayuk.caja.seguridad.aplicacion;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import kamayuk.caja.dominio.ZonaHoraria;
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
 *   <tr><td>todavia no, pero lleva mas de {@value #MINUTOS_QUE_SE_ESPERA} min desde que se
 *       emitio</td><td>apartado</td><td>si</td><td>al responsable, como la tercera fila</td></tr>
 * </table>
 *
 * <p>La cuarta fila es la que separa a este consumidor de uno que «funciona»: un evento que llega
 * antes que aquel del que depende se deja en el buzon del emisor, y la siguiente vuelta —o la
 * siguiente corrida— lo encuentra con su dependencia puesta. Acusarlo lo perderia para siempre.
 *
 * <h2>Y la quinta: nada espera para siempre en cabeza del buzon (#139)</h2>
 *
 * <p>La cuarta fila tenia un limite que no estaba escrito: el buzon sirve lo mas viejo sin acusar y
 * lo pospuesto no se acusa, asi que {@value #POR_VUELTA} pospuestos que no se van a resolver nunca
 * llenan la pagina, la vuelta no progresa, la corrida se para, y todo lo que {@code identidad}
 * publique despues —una inhabilitacion incluida— no se lee jamas. Habia dos salidas: (a) dejar de
 * esperar pasado un plazo y apartar con aviso, o (b) leer mas alla de la cabeza. <b>La (b) no
 * existe sin cambiar {@code identidad}</b>: su {@code GET /eventos/pendientes} solo admite {@code
 * limite} —de 1 a 500— y su {@code BuzonDeIdentidadJdbc.pendientesPara} es {@code ORDER BY e.id
 * LIMIT :limite}, sin desplazamiento ni cursor (medido en {@code identidad@6c5e433}; y un cursor es
 * justo lo que ese buzon rechaza, porque pierde eventos en silencio). Pedir 500 solo moveria el
 * umbral. Asi que es la (a): {@link #MINUTOS_QUE_SE_ESPERA}, con su porque. Y el caso que de verdad
 * no iba a llegar nunca —los dependientes de un alta que se aparto aqui— ya no espera ni ese plazo:
 * el aplicador lo aparta en el primer intento.
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

    /**
     * Cuanto puede esperar un pospuesto a su dependencia, contado desde que {@code identidad} lo
     * emitio ({@link EventoDeIdentidadRecibido#creadoEn()}), antes de que se aparte como lo que no
     * se podra aplicar nunca: <b>una hora</b>, doce ticks del {@code CronJob} y cuatro veces el
     * umbral del aviso (<a href="https://github.com/hneyra/caja/issues/139">#139</a>).
     *
     * <p>Por que hace falta un plazo: el buzon sirve lo mas viejo sin acusar, un pospuesto no se
     * acusa, y una vuelta cuya pagina entera se pospone no progresa. Con {@value #POR_VUELTA}
     * pospuestos que no se van a resolver en cabeza, la corrida se para en la primera vuelta y lo
     * que viene detras —la inhabilitacion de un cajero— no se lee nunca; el aviso de los quince
     * minutos lo dice cada cinco, y no lo arregla.
     *
     * <p>Por que una hora y no mas: la dependencia de un evento sale del emisor ANTES que el —en
     * {@code identidad} no se afilia ni se concede nada a quien no existe, asi que su alta tiene un
     * {@code id} menor— y un alta o una modificacion nunca se posponen; medido, cuando la
     * dependencia llega el pospuesto entra en <b>una</b> corrida (informe de AC-5/AC-6 §3(d)). Lo
     * que a los quince minutos ya no se explicaba por el troceado en paginas, a la hora no se va a
     * explicar por nada que llegue solo. Cada minuto de mas es un minuto en que una baja puede no
     * aplicarse. El unico caso que esperando se habria arreglado es un acceso que {@code identidad}
     * concede antes de que esta caja despliegue el catalogo que lo trae —hoy no pasa: los dos
     * declaran los mismos siete—, y ese falla cerrado: el permiso no rige aqui hasta que se vuelva
     * a fijar en {@code identidad}, y el apartado lo dice.
     *
     * <p>Por que desde que se EMITIO y no desde que se vio por primera vez: es lo que el sobre ya
     * trae, lo mismo con que se mide el aviso de arriba, y no exige una tabla nueva. Tras una
     * parada larga del consumidor, un pospuesto viejo se aparta la primera vez que se lee; por lo
     * de arriba, esperar mas no le habria traido la dependencia.
     */
    public static final int MINUTOS_QUE_SE_ESPERA = 60;

    private static final Duration EDAD_QUE_SE_APARTA = Duration.ofMinutes(MINUTOS_QUE_SE_ESPERA);

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
                AplicarUnEventoDeIdentidad.Aplicacion resultado = aplicarSinEsperarDeMas(evento);
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
     * Aplica el evento y, si lo que vuelve es un «todavia no» de un evento que ya lleva {@value
     * #MINUTOS_QUE_SE_ESPERA} minutos desde que se emitio, lo convierte en un «nunca» (#139): el
     * {@code catch} de {@link AplicarUnEventoDeIdentidad.NoSePuedeAplicar} de {@link #consumir()}
     * lo aparta, lo acusa y avisa al responsable, igual que a cualquier otro apartado. La
     * transaccion del intento ya se deshizo al salir de {@code aplicar}, asi que no queda nada
     * escrito a medias.
     *
     * <p>Aqui y no en el aplicador: el aplicador dice que falta y no mira el reloj; cuanto se
     * espera es una politica de la corrida, como el umbral del aviso, y vive junto a el.
     */
    private AplicarUnEventoDeIdentidad.Aplicacion aplicarSinEsperarDeMas(
            EventoDeIdentidadRecibido evento) {
        try {
            return aplicador.aplicar(evento);
        } catch (AplicarUnEventoDeIdentidad.TodaviaNo todaviaNo) {
            Duration espera = Duration.between(evento.creadoEn(), reloj.instant());
            if (espera.compareTo(EDAD_QUE_SE_APARTA) < 0) {
                throw todaviaNo;
            }
            throw new AplicarUnEventoDeIdentidad.NoSePuedeAplicar(
                    "Llevaba "
                            + espera.toMinutes()
                            + " min sin poder aplicarse desde que `identidad` lo emitio ("
                            + evento.creadoEn()
                            + "), y el plazo es de "
                            + MINUTOS_QUE_SE_ESPERA
                            + ": su dependencia sale antes que el en el buzon, asi que ya no va a"
                            + " llegar sola, y esperarla mas deja que los pospuestos tapen el buzon"
                            + " (#139). Lo que se dijo en cada intento: "
                            + todaviaNo.getMessage(),
                    todaviaNo);
        }
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

    /**
     * El aviso de las filas sin sujeto de {@code identidad} que todavia conceden, <b>una vez por
     * corrida</b> (#125). Lo llama el runner al final, junto al de los pospuestos.
     *
     * <p>Una fila sin sujeto no es un fallo de la corrida —ningun evento que esta corrida pudiera
     * aplicar la arregla—, asi que no falla ni cambia el codigo de salida. Lo que este metodo evita
     * es que una huerfana de #111 conceda durante su plazo sin que lo sepa nadie, y que una cuenta
     * legitima que espera su primer evento pierda el acceso sin que nadie lo viera venir: el aviso
     * dice cual es cada una y el dia en que deja de conceder (ver {@link
     * kamayuk.caja.seguridad.dominio.PlazoDeAdopcion}).
     *
     * <p>El dia es el de Lima ({@link ZonaHoraria#diaDe}), el mismo con que el guardia corta: el
     * bean del reloj esta en esa zona, pero un {@code Clock} en UTC —el de las pruebas, o uno mal
     * configurado— daria de noche el dia siguiente, y el aviso diria «concede» de una fila que el
     * guardia ya niega.
     *
     * <p><b>El ERROR al responsable se repite en cada corrida</b> mientras quede alguna que
     * concede, como el de los pospuestos: es un riesgo vivo con fecha de fin —el plazo—, y callarlo
     * entre corridas seria esconderlo. <b>Las que ya no conceden, no</b>: ya no son un riesgo, y
     * hasta la ronda 2 una linea WARN las contaba en cada corrida, cada cinco minutos y sin fin,
     * que es el canal que grita en lo corriente (#437). Ahora el WARN nombra solo las que dejaron
     * de conceder HOY —su ultimo dia fue ayer—, asi que cada fila aparece un solo dia, calculado
     * con el reloj inyectado; las demas solo entran como cuenta en el ERROR, si lo hay.
     *
     * @return cuantas se avisaron; cero, que es lo corriente en una base implantada despues de #111
     */
    public int avisarDeLasFilasSinSujeto() {
        LocalDate hoy = ZonaHoraria.diaDe(reloj.instant());
        AplicarUnEventoDeIdentidad.FilasSinSujeto filas = aplicador.filasSinSujeto(hoy);
        if (!filas.queDejaronDeConcederHoy().isEmpty()) {
            java.util.StringJoiner cuales = new java.util.StringJoiner(", ");
            for (kamayuk.caja.seguridad.FilaSinSujeto fila : filas.queDejaronDeConcederHoy()) {
                cuales.add(fila.tabla() + " «" + fila.clave() + "» (id " + fila.id() + " aqui)");
            }
            log.warn(
                    "HOY ({}) dejan de conceder {} fila(s) de usuario o grupo sin sujeto de"
                            + " `identidad`, al cumplirse su plazo de {} dias desde V6 (#125): {}."
                            + " No se vuelve a decir manana. Si alguna era legitima, se recupera"
                            + " cuando `identidad` la toque, comprobando antes que es el MISMO"
                            + " sujeto y no una clave reasignada",
                    hoy,
                    filas.queDejaronDeConcederHoy().size(),
                    kamayuk.caja.seguridad.dominio.PlazoDeAdopcion.DIAS,
                    cuales);
        }
        if (filas.queConceden().isEmpty()) {
            return 0;
        }
        alerta.hayFilasSinSujeto(filas.queConceden(), filas.queYaNoConceden(), hoy);
        return filas.queConceden().size();
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
