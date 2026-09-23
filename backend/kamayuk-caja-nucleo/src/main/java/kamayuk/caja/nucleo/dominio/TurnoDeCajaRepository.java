package kamayuk.caja.nucleo.dominio;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import kamayuk.caja.dominio.Observacion;

/** Los turnos de caja: la apertura, su lectura y su candado (#110). */
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
     * El turno de ese cajero, en esa caja y ese dia, <b>sin bloquear</b>. Lo devuelve tal como
     * este, abierto o cerrado.
     *
     * <p>Hasta P5D llevaba {@code FOR UPDATE} y era lo que serializaba la ventanilla (#33). Desde
     * `V2` no puede: {@code kamayuk_app} ya no tiene UPDATE sobre {@code cierre_caja}, y un {@code
     * FOR UPDATE} daria {@code permission denied}. Quien vaya a escribir contra el turno —cobrar,
     * anular, cerrar— lo lee aqui para saber cual es y despues toma su candado con {@link
     * #bloquear}; el estado que decide es el que devuelve aquel, no este (#110).
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
     * El turno con ese identificador, <b>sin bloquear</b>: para leerlo, no para escribir contra el.
     *
     * <p>Hasta #110 lo usaba tambien la anulacion, y ese era el defecto: leia el turno ABIERTO
     * mientras un cierre ya habia congelado su arqueo, anulaba, y el acta firmada seguia contando
     * como cobrado un recibo que ya no lo estaba. La anulacion usa ahora {@link #bloquear}.
     */
    Optional<TurnoDeCaja> porId(long id);

    /**
     * Toma el candado del turno hasta el fin de la transaccion y lo devuelve leido <b>despues</b>
     * de tenerlo, con su estado de ese momento (#110).
     *
     * <p>Es el punto de serializacion de todo lo que escribe contra un turno: cobrar una orden,
     * cobrar una tasa, anular un recibo y cerrar o reversar el cierre. Sin el, con READ COMMITTED,
     * un cobro que lee el turno ABIERTO mientras el cierre ya calculo su arqueo emite y confirma, y
     * el cierre firma despues un acta sin ese dinero. {@code cierre_turno_secuencia_uq} no lo
     * evita: ordena un cierre contra otro, no un cobro contra un cierre.
     *
     * <p>No es un {@code FOR UPDATE}, porque {@code kamayuk_app} no tiene UPDATE sobre {@code
     * cierre_caja} desde `V2` ni lo va a recuperar: es un candado consultivo de transaccion, que se
     * suelta solo con el {@code COMMIT} o el {@code ROLLBACK} —nunca uno de sesion, que como {@code
     * SET SESSION} sobreviviria a la conexion devuelta al pool (regla 3)—.
     *
     * <p><b>Se toma antes que cualquier otro candado de la transaccion</b> —antes del {@code FOR
     * UPDATE} de las ordenes y del correlativo del recibo—, y cada transaccion toma uno solo. Con
     * ese orden no hay ciclo posible: quien lo tiene puede esperar una fila, pero nadie que tenga
     * una fila esta esperando un turno.
     *
     * <p>La municipalidad no entra (regla 2): si el turno no es de la municipalidad del {@code SET
     * LOCAL}, RLS lo esconde, no se toma ningun candado y la respuesta es vacia.
     *
     * @return el turno leido con el candado puesto, o vacio si no existe para esta municipalidad
     */
    Optional<TurnoDeCaja> bloquear(long turnoId);
}
