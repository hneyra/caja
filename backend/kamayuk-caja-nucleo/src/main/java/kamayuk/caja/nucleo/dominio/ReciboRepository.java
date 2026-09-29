package kamayuk.caja.nucleo.dominio;

import java.util.Optional;
import kamayuk.caja.compartido.Pagina;
import kamayuk.caja.compartido.Paginacion;
import org.jspecify.annotations.Nullable;

/**
 * Los recibos. <b>Solo se agregan</b>: no hay {@code actualizar} ni {@code borrar}, y no es un
 * olvido —V29 le retira a {@code kamayuk_app} el privilegio de {@code UPDATE} y {@code DELETE}
 * nunca lo tuvo (V7)—.
 */
public interface ReciboRepository {

    /**
     * El siguiente correlativo de una serie, reservado.
     *
     * <p>Un {@code INSERT ... ON CONFLICT DO UPDATE SET ultimo = ultimo + 1} sobre {@code
     * recibo_correlativo}: una sola sentencia, que bloquea la fila del contador mientras la
     * actualiza. Nunca un {@code SELECT} seguido de un {@code UPDATE} —entre los dos cabe otra
     * cobranza, y las dos leerian el mismo numero—.
     */
    NumeroDeRecibo siguienteNumero(Caja caja);

    /**
     * Guarda el recibo con su detalle y, si vino, su clave con la huella de la peticion (#143).
     * Devuelve el recibo con su identificador.
     *
     * @throws ClaveEnUso si otra transaccion ya confirmo un recibo con esa clave
     */
    Recibo emitir(Recibo recibo, @Nullable ClaveDeIdempotencia clave);

    /**
     * El recibo que se emitio con esa clave de idempotencia, si ya existe, con la huella de la
     * peticion que lo emitio (#143).
     *
     * <p><b>Solo por la clave, y a proposito</b>: una clave es de un cobro. Si se buscara por clave
     * y huella, la misma clave con otra peticion no encontraria nada y emitiria —o chocaria con
     * {@code recibo_idempotencia_uq}—; lo que hay que contestarle es que la clave ya es de otro
     * cobro, y para eso hay que ver ese cobro. Comparar la huella es cosa de {@link
     * ClaveDeIdempotencia#reconoce}.
     *
     * <p>Por si sola una lectura no garantiza nada —dos peticiones simultaneas no verian nada las
     * dos—: quien cobra la repite con el candado del turno puesto (#110), y la garantia final sigue
     * siendo {@code recibo_idempotencia_uq}. Esta consulta es lo que convierte un reenvio en una
     * respuesta correcta en vez de en un error.
     */
    Optional<EmitidoConClave> porClaveDeIdempotencia(String clave);

    /** El recibo con ese numero impreso, con su detalle. */
    Optional<Recibo> porNumero(NumeroDeRecibo numero);

    /**
     * Los recibos que pide el criterio, paginados y <b>sin su detalle</b> (#548).
     *
     * <p>Es lo que le faltaba a la ventanilla: hasta #548 un recibo solo se podia pedir por su
     * numero impreso, asi que quien perdia el papel no tenia forma de encontrarlo. La fila que
     * devuelve es {@link ReciboEnConsulta}, con el estado y los duplicados ya derivados de {@code
     * recibo_movimiento}.
     *
     * <p>Un criterio que no encuentra nada devuelve una <b>pagina vacia</b>, nunca una excepcion:
     * un contribuyente sin recibos no es un error, es una busqueda sin resultados.
     */
    Pagina<ReciboEnConsulta> buscar(CriterioDeRecibos criterio, Paginacion paginacion);

    /**
     * Un recibo emitido con clave de idempotencia, y la huella de la peticion que lo emitio.
     *
     * @param huella la de {@code recibo.huella_de_la_peticion}; nula en los recibos anteriores a
     *     V8, que no la guardaron
     */
    record EmitidoConClave(Recibo recibo, @Nullable String huella) {}

    /**
     * Otra transaccion confirmo un recibo con la misma clave mientras esta emitia el suyo (#143).
     *
     * <p>Lo dice {@code recibo_idempotencia_uq}, no una lectura: las dos peticiones miraron antes y
     * ninguna vio a la otra, porque no compartian candado —otra caja, otro cajero u otro dia—. Esta
     * transaccion ya no puede leer nada (el motor la aborto con el choque), asi que no sabe si la
     * otra era su reintento o una peticion distinta: se dice eso, y reintentar con la misma clave
     * contesta cual de las dos.
     */
    final class ClaveEnUso extends RuntimeException {

        @java.io.Serial private static final long serialVersionUID = 1L;

        public ClaveEnUso(String clave, Throwable causa) {
            super(
                    "Otra peticion con la cabecera Idempotency-Key '"
                            + clave
                            + "' se confirmo mientras esta se atendia, y esta no emitio nada."
                            + " Reintente con la misma clave: si era el mismo cobro recibira su"
                            + " recibo, y si era otro, se le dira",
                    causa);
        }
    }
}
