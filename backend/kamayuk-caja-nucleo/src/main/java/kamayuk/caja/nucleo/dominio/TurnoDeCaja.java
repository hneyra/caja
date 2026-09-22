package kamayuk.caja.nucleo.dominio;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Objects;
import org.jspecify.annotations.Nullable;

/**
 * La apertura de una caja por un cajero en un dia: la fila de {@code cierre_caja} (V3, V29).
 *
 * <p>La tabla se llama {@code cierre_caja} desde V3 y guarda los dos extremos del mismo hecho. Aqui
 * se le da el nombre que tiene mientras esta viva: un <b>turno</b>. Nace abierto, se cobra contra
 * el, y #35 lo cierra con su arqueo.
 *
 * <p>{@code cierre_uq} lo hace unico por (caja, cajero, fecha), asi que un cajero no puede tener
 * dos turnos abiertos el mismo dia en la misma caja aunque lo pida dos veces: la segunda peticion
 * recibe el turno de la primera.
 *
 * @param id nulo mientras no se haya guardado
 * @param cajaId la ventanilla
 * @param cajero quien la atiende
 * @param fecha el dia de trabajo; no sale del reloj, entra como argumento (regla 6)
 * @param abiertoEn el instante en que se abrio: {@code cierre_caja.fecha_apertura}, que es {@code
 *     NOT NULL} desde el baseline y la escribe la apertura con el reloj de la caja (#104). No se
 *     deduce del primer cobro ni del dia: un turno sin su hora seria un turno inventado
 * @param estado abierto mientras se pueda cobrar contra el
 */
public record TurnoDeCaja(
        @Nullable Long id,
        long cajaId,
        String cajero,
        LocalDate fecha,
        Instant abiertoEn,
        EstadoDeTurno estado) {

    public TurnoDeCaja {
        Objects.requireNonNull(cajero, "Un turno lo abre un cajero con nombre");
        cajero = cajero.strip();
        if (cajero.isEmpty()) {
            throw new IllegalArgumentException("El cajero no puede estar vacio");
        }
        Objects.requireNonNull(fecha, "El turno es de un dia concreto");
        Objects.requireNonNull(abiertoEn, "El turno lleva la hora a la que se abrio");
        Objects.requireNonNull(estado, "El turno necesita su estado");
        if (cajaId <= 0) {
            throw new IllegalArgumentException("Un turno es de una caja concreta");
        }
    }

    public boolean estaAbierto() {
        return estado == EstadoDeTurno.ABIERTO;
    }

    /** El identificador, exigiendo que ya se haya guardado. */
    public long idGuardado() {
        Long guardado = id;
        if (guardado == null) {
            throw new IllegalStateException("Un turno sin guardar todavia no puede recibir cobros");
        }
        return guardado;
    }
}
