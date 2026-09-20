package kamayuk.caja.nucleo.dominio;

import java.util.Objects;

/**
 * Un turno con el rotulo de la ventanilla en la que se abrio (#97).
 *
 * <p>{@link TurnoDeCaja} guarda {@code cajaId}, que es un numero que fuera del servidor no puede
 * leer nadie (RNF-080). Quien pregunta «cual es mi turno» no lo pregunta para tener un
 * identificador: lo pregunta para saber <b>en que ventanilla</b> esta y poder pedir su arqueo. Por
 * eso el codigo y el nombre viajan junto al turno y no se resuelven despues con una segunda
 * lectura, que es como una pantalla acaba dibujando «Caja 7».
 *
 * <p>No es un turno distinto ni una vista: es el mismo turno con lo que hace falta para nombrarlo.
 *
 * @param turno el turno, con su estado ya derivado de {@code cierre_turno}
 * @param cajaCodigo como se rotula la ventanilla ({@code caja.codigo})
 * @param cajaNombre como se llama ({@code caja.nombre})
 */
public record TurnoConSuCaja(TurnoDeCaja turno, String cajaCodigo, String cajaNombre) {

    public TurnoConSuCaja {
        Objects.requireNonNull(turno, "Un turno con su caja lleva el turno");
        Objects.requireNonNull(cajaCodigo, "La ventanilla se rotula con su codigo");
        Objects.requireNonNull(cajaNombre, "La ventanilla tiene nombre");
    }

    /** El identificador del turno, exigiendo que ya se haya guardado. */
    public long turnoId() {
        return turno.idGuardado();
    }
}
