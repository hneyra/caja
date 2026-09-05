package kamayuk.caja.nucleo.dominio;

import java.util.Locale;
import org.jspecify.annotations.Nullable;

/**
 * Quien paga, tal como la caja lo conoce (P5D, ADR-0026 §1).
 *
 * <h2>Los tres campos son anulables, y eso es lo que hace reutilizable a la caja</h2>
 *
 * <p>Hasta P5D, «quien paga» era un {@code contribuyenteId} con clave foranea al padron de {@code
 * rentas}, y la caja llegaba a traducir un codigo del padron a su identificador dentro de un {@code
 * SELECT} (GOB-05 §6.8). Con la separacion eso no se puede y <b>tampoco se debe</b>: el dia que se
 * cobre un puesto de mercado, quien paga puede no estar en ningun padron.
 *
 * <p>Asi que la caja guarda lo que le digan y no lo cruza contra nada:
 *
 * <ul>
 *   <li>{@code documento} es con lo que se busca un recibo en ventanilla —«vengo por el duplicado
 *       del recibo de mi DNI»— y por eso tiene indice;
 *   <li>{@code nombre} es lo que se imprime en el papel, <b>congelado</b>: releerlo del padron
 *       daria un duplicado distinto del original con el mismo numero (#34);
 *   <li>{@code idExterno} es el identificador que le da el sistema de origen —en {@code rentas}, el
 *       {@code contribuyente_id}— y viaja de vuelta en el evento del pago para que el origen sepa a
 *       quien imputar sin volver a resolver nada.
 * </ul>
 *
 * <p><b>D-17 no se decide aqui.</b> Sigue abierto si la caja tendra registro propio de pagadores o
 * si habra uno compartido; lo que este tipo hace es que la respuesta deje de bloquear la
 * separacion.
 */
public record Pagador(
        @Nullable String documento, @Nullable String nombre, @Nullable Long idExterno) {

    /** El largo de {@code recibo.pagador_documento}. */
    private static final int LARGO_DOCUMENTO = 20;

    /** El largo de {@code recibo.pagador_nombre}. */
    private static final int LARGO_NOMBRE = 150;

    /** Quien paga y no dice quien es: una tasa al contado en ventanilla. */
    public static final Pagador ANONIMO = new Pagador(null, null, null);

    public Pagador {
        documento = normalizar(documento, LARGO_DOCUMENTO, "documento");
        if (documento != null) {
            documento = documento.toUpperCase(Locale.ROOT);
        }
        nombre = normalizar(nombre, LARGO_NOMBRE, "nombre");
        if (idExterno != null && idExterno <= 0) {
            throw new IllegalArgumentException(
                    "El identificador que da el sistema de origen es un identificador, y "
                            + idExterno
                            + " no lo es. Si el origen no le da ninguno, va nulo: eso es"
                            + " «no lo tiene», no «es el cero»");
        }
    }

    private static @Nullable String normalizar(@Nullable String valor, int largo, String campo) {
        if (valor == null) {
            return null;
        }
        String limpio = valor.strip();
        if (limpio.isEmpty()) {
            return null;
        }
        if (limpio.length() > largo) {
            throw new IllegalArgumentException(
                    "El " + campo + " del pagador no cabe en la columna (" + largo + ")");
        }
        return limpio;
    }

    /** Si de este pagador no se sabe absolutamente nada. */
    public boolean esAnonimo() {
        return documento == null && nombre == null && idExterno == null;
    }

    /**
     * El nombre para el papel, o el motivo por el que no lo hay.
     *
     * <p>Nunca la cadena vacia: una celda vacia en un recibo se lee como un defecto de impresion, y
     * un guion con su motivo se lee como lo que es (RNF-080).
     */
    public String nombreImpreso() {
        if (nombre != null) {
            return nombre;
        }
        return documento != null ? documento : "— (no se identifico al pagador)";
    }
}
