package kamayuk.caja.nucleo.dominio;

import java.util.List;
import java.util.Objects;

/**
 * En que situacion esta un cajero en un dia de trabajo: si tiene ventanilla abierta y cual (#97).
 *
 * <h2>Por que no es un booleano</h2>
 *
 * <p>Lo dice el javadoc de {@link TurnoDeCajaRepository#abierto}, y esta enumeracion es ese mismo
 * criterio llevado al borde HTTP: «quien pregunta necesita distinguir "este cajero no ha abierto
 * hoy" de "este cajero ya cerro", y las dos respuestas llevan a sitios distintos». Un {@code
 * hayTurno: false} mandaria a las dos al mismo sitio — y a la segunda la mandaria al equivocado,
 * porque lo que le falta no es abrir sino reversar su cierre.
 *
 * <h2>Y por que hay una cuarta</h2>
 *
 * <p>{@code cierre_uq} (V3) hace unico el turno por (caja, cajero, <b>fecha</b>): un cajero no
 * puede tener dos turnos en la misma ventanilla el mismo dia, pero <b>si</b> puede tenerlos en dos
 * ventanillas distintas. Cuando eso pasa, quien lee no puede elegir uno: elegir «el primero» seria
 * arquear una ventanilla por otra sin que nada lo dijera. Se dice que son varios y se dejan los dos
 * en la respuesta, para que quien pregunta sepa cuales.
 *
 * <p>Se deriva, como {@link EstadoDeTurno}: no hay ninguna columna que la guarde.
 */
public enum SituacionDelCajero {

    /** No abrio ninguna ventanilla ese dia: no hay ningun turno suyo. */
    SIN_ABRIR,

    /** Tiene exactamente un turno abierto, y es contra el que se cobra. */
    ABIERTO,

    /** Abrio y ya cerro: todos sus turnos del dia tienen su arqueo firmado. */
    CERRADO,

    /** Tiene turno abierto en mas de una ventanilla: cual se arquea no lo decide esta lectura. */
    VARIOS_ABIERTOS;

    /**
     * La situacion que describen esos turnos.
     *
     * @param delDia los turnos de ese cajero en ese dia, en todas sus ventanillas
     */
    public static SituacionDelCajero de(List<TurnoConSuCaja> delDia) {
        Objects.requireNonNull(delDia, "La lista es vacia, no nula");
        long abiertos = delDia.stream().filter(uno -> uno.turno().estaAbierto()).count();
        if (abiertos > 1) {
            return VARIOS_ABIERTOS;
        }
        if (abiertos == 1) {
            return ABIERTO;
        }
        return delDia.isEmpty() ? SIN_ABRIR : CERRADO;
    }
}
