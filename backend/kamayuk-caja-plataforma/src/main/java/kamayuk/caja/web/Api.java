package kamayuk.caja.web;

/** Constantes del contrato HTTP. */
public final class Api {

    /**
     * Raiz de todas las operaciones de este sistema (ADR-0030).
     *
     * <p>Cada uno de los cuatro sistemas publica bajo su propio prefijo —{@code /rentas/api/v1},
     * {@code /catastro/api/v1}, {@code /normativa/api/v1} y este— y los cuatro se sirven del mismo
     * origen. El prefijo no es decorativo: es lo que permite que la puerta de entrada enrute sin
     * mirar el cuerpo, y lo que hace que un cliente que se equivoque de sistema reciba un 404 en
     * vez de un 401 confuso.
     */
    public static final String RAIZ = "/caja/api/v1";

    private Api() {}
}
