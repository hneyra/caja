package kamayuk.caja.nucleo.dominio;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import kamayuk.caja.dominio.Observacion;

/** Los turnos de caja: la apertura y su lectura. */
public interface TurnoDeCajaRepository {

    /**
     * Abre el turno de ese cajero en esa caja y ese dia, o devuelve el que ya estaba abierto.
     *
     * <p><b>Idempotente en la base</b>, con {@code ON CONFLICT} sobre {@code cierre_uq}, y no con
     * un {@code SELECT} previo: dos peticiones simultaneas del mismo cajero pasarian las dos por
     * cualquier comprobacion escrita en Java y la segunda chocaria contra la clave unica en plena
     * cola. Pedir abrir dos veces devuelve el mismo turno, con su apertura original.
     *
     * @param apertura el instante que se estampa; sale del reloj inyectado (regla 6)
     */
    TurnoDeCaja abrir(
            long cajaId, String cajero, LocalDate fecha, Instant apertura, Observacion observacion);

    /**
     * El turno de ese cajero, en esa caja y ese dia, <b>bloqueado</b> hasta el fin de la
     * transaccion. Lo devuelve tal como este, abierto o cerrado.
     *
     * <p>El bloqueo es lo que serializa la ventanilla (#33). Una caja es un cajero y una cola: dos
     * cobranzas de la misma caja tienen que ordenarse, y ordenarlas en el motor —con {@code SELECT
     * ... FOR UPDATE} sobre esta fila— es lo que hace que la comprobacion de idempotencia que viene
     * despues pueda leer lo que la peticion anterior ya escribio. Sin el, el doble clic del cajero
     * produce dos recibos y la unica defensa seria el indice unico, que ademas de rechazar
     * <b>aborta</b> la transaccion entera.
     *
     * <p>Devuelve el turno cerrado en vez de vacio a proposito: quien pregunta necesita distinguir
     * «este cajero no ha abierto hoy» de «este cajero ya cerro», y las dos respuestas llevan a
     * sitios distintos.
     */
    Optional<TurnoDeCaja> abierto(long cajaId, String cajero, LocalDate fecha);

    /**
     * Los turnos de ese cajero en ese dia, en <b>todas</b> sus ventanillas, con el rotulo de cada
     * una y su estado ya derivado.
     *
     * <p>Es la lectura de la que sale «cual es mi turno» (#97). No recibe la caja a proposito:
     * quien pregunta es precisamente quien todavia no sabe en cual esta, y exigirsela obligaria a
     * la interfaz a probarlas una por una contra el catalogo. {@code cierre_uq} (V3) garantiza una
     * fila por ventanilla, asi que la lista es corta por construccion.
     *
     * <p>Devuelve tambien los <b>cerrados</b>, por el mismo motivo que {@link #abierto}: «no abrio»
     * y «ya cerro» se arreglan en sitios distintos, y una lista que solo trajera los abiertos
     * dejaria las dos indistinguibles.
     *
     * <p>La municipalidad no entra (regla 2): la pone la politica RLS con el {@code SET LOCAL} de
     * la transaccion, tambien al otro lado del {@code JOIN} con {@code caja}.
     *
     * @param cajero de quien son los turnos; sale del contexto de origen, nunca de un parametro
     * @param fecha el dia de trabajo; entra como argumento y no se lee del reloj (regla 6)
     */
    List<TurnoConSuCaja> delCajeroEn(String cajero, LocalDate fecha);

    /**
     * El turno con ese identificador, <b>sin bloquear</b>.
     *
     * <p>Lo necesita la anulacion (#34): parte del recibo, y el recibo apunta a su turno por
     * identificador —no por (caja, cajero, fecha)—. Se lee sin bloquear a proposito: lo que la
     * anulacion serializa es el recibo, y eso lo hace {@code recibo_movimiento_anulacion_uq}, no un
     * candado sobre la apertura. Bloquear el turno aqui pondria a esperar a toda la ventanilla por
     * una anulacion que ni siquiera toca su recaudacion hasta que se registre.
     */
    Optional<TurnoDeCaja> porId(long id);
}
