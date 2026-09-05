package kamayuk.caja.nucleo.dominio;

import java.util.Locale;
import java.util.Objects;

/**
 * De donde viene una orden de cobro (ADR-0026 §1).
 *
 * <p><b>Es texto y no un enumerado, y esa es la decision.</b> Un enumerado con {@code RENTAS} y
 * nada mas dejaria a la caja sabiendo cuantos sistemas hay y cuales son, y anadir el de mercados
 * seria un despliegue de la caja. Lo que la hace reutilizable es justamente que no lo sepa: recibe
 * una cadena, la guarda, y la devuelve dentro del evento del pago para que el que la mando se
 * reconozca.
 *
 * <p>Lo unico que se comprueba es la forma —minusculas, sin espacios, corta— porque es la mitad de
 * la clave de idempotencia del alta ({@code orden_referencia_uq}) y dos escrituras distintas del
 * mismo nombre serian dos sistemas distintos para la base.
 */
public record SistemaDeOrigen(String nombre) implements Comparable<SistemaDeOrigen> {

    /** El largo de {@code orden_de_cobro.sistema_origen}. */
    private static final int LARGO_MAXIMO = 20;

    public SistemaDeOrigen {
        Objects.requireNonNull(nombre, "Una orden dice de que sistema viene");
        nombre = nombre.strip().toLowerCase(Locale.ROOT);
        if (nombre.isEmpty()) {
            throw new IllegalArgumentException(
                    "El sistema de origen no puede estar vacio: es la mitad de la clave con la que"
                            + " el alta de una orden es idempotente");
        }
        if (nombre.length() > LARGO_MAXIMO) {
            throw new IllegalArgumentException(
                    "El sistema de origen no cabe en la columna (" + LARGO_MAXIMO + "): " + nombre);
        }
        if (!nombre.matches("[a-z0-9_-]+")) {
            throw new IllegalArgumentException(
                    "El sistema de origen se escribe en minusculas, sin espacios ni acentos, para"
                            + " que dos formas de teclearlo no sean dos sistemas: "
                            + nombre);
        }
    }

    public static SistemaDeOrigen de(String nombre) {
        return new SistemaDeOrigen(nombre);
    }

    @Override
    public int compareTo(SistemaDeOrigen otro) {
        return nombre.compareTo(otro.nombre);
    }

    @Override
    public String toString() {
        return nombre;
    }
}
