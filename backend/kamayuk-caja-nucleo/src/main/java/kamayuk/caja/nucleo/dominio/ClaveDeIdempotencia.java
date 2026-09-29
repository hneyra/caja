package kamayuk.caja.nucleo.dominio;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;

/**
 * La cabecera {@code Idempotency-Key} de un cobro, <b>atada a la peticion que la trajo</b> (#143).
 *
 * <h2>Por que la clave sola no basta</h2>
 *
 * <p>Hasta #143 el recibo se buscaba solo por la clave: la misma clave mandada a {@code
 * /cobros/tasas} y despues a {@code /cobros} con otras ordenes devolvia el recibo de la tasa —con
 * un 201—, y las ordenes se quedaban {@code PENDIENTE} sin que nada lo dijera. Una clave nombra
 * <b>un</b> cobro, y la caja no tenia como distinguir el reintento de ese cobro de otra peticion
 * que reusaba la clave. Ahora guarda al lado la {@link #huella()} de la peticion, y un reintento
 * solo recibe el recibo si su huella es la misma: si no, es {@link UsadaConOtraPeticion}.
 *
 * <h2>Que es «la misma peticion»</h2>
 *
 * <p>Lo decide cada caso de uso, y es una lista de partes <b>en un orden fijo</b> —la forma
 * canonica— de la que se guarda el SHA-256 en hexadecimal. Entra lo que define el cobro: el acto,
 * la caja, el cajero, la forma de pago y lo que se cobra. <b>No entra la fecha</b>: la pone el
 * reloj cuando no viene, y un reintento que cruza la medianoche es el mismo cobro —dejarla dentro
 * le contestaria «otra peticion» justo al reintento que mas necesita su recibo—. <b>Ni la
 * observacion</b>: explica el cobro, no lo define.
 *
 * <p>Cada parte va precedida de su largo, asi que ninguna combinacion de valores puede escribirse
 * como otra: {@code ["ab", "c"]} y {@code ["a", "bc"]} tienen huellas distintas, y un nombre de
 * pagador con un separador dentro no puede hacerse pasar por dos campos.
 *
 * <p><b>Cambiar la forma canonica cambia la huella de las peticiones ya atendidas</b>, y sus
 * reintentos contestarian 422 en vez de su recibo. Se cambia a sabiendas, no de paso.
 *
 * @param valor la cabecera, sin espacios alrededor; cabe en {@code recibo.clave_idempotencia}
 * @param huella el SHA-256 de la forma canonica de la peticion, en hexadecimal y minusculas
 */
public record ClaveDeIdempotencia(String valor, String huella) {

    /** El largo de {@code recibo.clave_idempotencia}. */
    public static final int LARGO_MAXIMO = 64;

    /** Lo que {@code recibo_huella_ck} (V8) admite: un SHA-256 en hexadecimal. */
    private static final Pattern FORMA_DE_LA_HUELLA = Pattern.compile("[0-9a-f]{64}");

    public ClaveDeIdempotencia {
        exigirValida(valor);
        Objects.requireNonNull(huella, "Una clave de idempotencia va atada a su peticion (#143)");
        if (!FORMA_DE_LA_HUELLA.matcher(huella).matches()) {
            throw new IllegalArgumentException(
                    "La huella de la peticion es un SHA-256 en hexadecimal, y llego: " + huella);
        }
    }

    /**
     * La clave de una peticion, con su huella calculada.
     *
     * @param valor la cabecera {@code Idempotency-Key}
     * @param peticion la forma canonica de la peticion: las partes que la definen, en el orden que
     *     fije el caso de uso. Ver {@link #parte}
     * @throws IllegalArgumentException si la cabecera esta vacia o no cabe en la columna
     */
    public static ClaveDeIdempotencia de(String valor, List<String> peticion) {
        Objects.requireNonNull(peticion, "La huella sale de la peticion");
        return new ClaveDeIdempotencia(valor, huellaDe(peticion));
    }

    /**
     * Una parte de la forma canonica: el campo con su valor, o solo el campo si no lo trae.
     *
     * <p>El nulo no se escribe como la cadena vacia ni como un guion: un pagador sin nombre y uno
     * que se llamara «-» serian la misma peticion.
     */
    public static String parte(String campo, @Nullable Object valor) {
        Objects.requireNonNull(campo, "Cada parte dice de que campo es");
        return valor == null ? campo : campo + "=" + valor;
    }

    /**
     * Comprueba que la cabecera cabe en {@code recibo.clave_idempotencia} antes de cobrar nada.
     *
     * <p>Hasta #143 una clave de mas de 64 caracteres llegaba al {@code INSERT} y salia como un 500
     * sin detalle, con la cobranza ya hecha y deshecha.
     *
     * @throws IllegalArgumentException si esta vacia o no cabe
     */
    public static void exigirValida(String valor) {
        Objects.requireNonNull(valor, "La clave de idempotencia es la cabecera que vino");
        if (valor.isBlank() || !valor.equals(valor.strip())) {
            throw new IllegalArgumentException(
                    "La cabecera Idempotency-Key no puede estar vacia ni llevar espacios alrededor");
        }
        if (valor.length() > LARGO_MAXIMO) {
            throw new IllegalArgumentException(
                    "La cabecera Idempotency-Key admite hasta "
                            + LARGO_MAXIMO
                            + " caracteres, y trae "
                            + valor.length()
                            + ". Un UUID cabe de sobra");
        }
    }

    /**
     * Si el recibo guardado con esta clave es la respuesta a esta peticion.
     *
     * <p>Un nulo es un recibo emitido antes de V8, que no guardo su huella: no se sabe que peticion
     * lo trajo, y se reconoce como hasta entonces. {@code recibo_clave_con_huella_ck} impide que
     * nazca otro asi, de modo que esta indulgencia solo alcanza a esas filas.
     *
     * @param huellaGuardada la de {@code recibo.huella_de_la_peticion}
     */
    public boolean reconoce(@Nullable String huellaGuardada) {
        return huellaGuardada == null || huella.equals(huellaGuardada);
    }

    private static String huellaDe(List<String> partes) {
        StringBuilder canonica = new StringBuilder();
        for (String parte : partes) {
            Objects.requireNonNull(
                    parte, "Una parte de la peticion ausente se escribe con parte()");
            canonica.append(parte.length()).append(':').append(parte).append('\n');
        }
        try {
            return HexFormat.of()
                    .formatHex(
                            MessageDigest.getInstance("SHA-256")
                                    .digest(canonica.toString().getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException sinSha256) {
            throw new IllegalStateException(
                    "Toda JVM trae SHA-256 (JCA, «Standard Algorithm Names»)", sinSha256);
        }
    }

    /**
     * La clave ya nombra otro cobro: se mando con una peticion distinta de la que la estreno.
     *
     * <p>No se devuelve el recibo de aquella —seria el recibo de otra cosa, con un exito que no lo
     * es— ni se cobra esta —la clave ya no puede distinguir sus reintentos—. El remedio es del
     * cliente: una clave nueva por cobro. El mensaje no dice que recibo emitio la clave: quien la
     * reusa puede no ser quien la estreno.
     */
    public static final class UsadaConOtraPeticion extends RuntimeException {

        @java.io.Serial private static final long serialVersionUID = 1L;

        public UsadaConOtraPeticion(ClaveDeIdempotencia clave) {
            super(
                    "La cabecera Idempotency-Key '"
                            + clave.valor()
                            + "' ya se uso con otra peticion —otro acto, otra caja, otro cajero,"
                            + " otra forma de pago o algo distinto que cobrar— y nombra ese cobro,"
                            + " no este. No se devuelve aquel recibo ni se cobra este: mande una"
                            + " clave nueva para cada cobro");
        }
    }
}
