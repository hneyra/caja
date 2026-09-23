package kamayuk.caja.nucleo.infraestructura.web;

import java.time.Clock;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import kamayuk.caja.auditoria.OrigenContext;
import kamayuk.caja.web.CodigoDeError;
import kamayuk.caja.web.ProblemaDeNegocio;
import org.jspecify.annotations.Nullable;

/**
 * Quien trabaja en la ventanilla y en que dia: los dos salen del token y del reloj, no del cuerpo
 * (#114, ADR-0028).
 *
 * <p>Hasta #114 {@link CajaController} y {@link CierreController} tomaban el {@code cajero} del
 * cuerpo y aceptaban cualquier fecha. Quien tuviera el privilegio de REGISTRO cobraba en el turno
 * de otro cajero —y el recibo salia a nombre de ese otro, que es el texto con el que {@link
 * ReciboController} decide si un recibo es «ajeno»—, cerraba el turno ajeno con su propio
 * declarado, o abria un turno de hace un mes. {@link TurnoController#delDia()} ya leia el token, y
 * lecturas y escrituras no decian lo mismo.
 *
 * <h2>El cajero</h2>
 *
 * <p>Es el {@code usuario} de {@link OrigenContext}, el mismo {@code preferred_username} con el que
 * el guardia comprueba el privilegio. El campo {@code cajero} de las peticiones <b>sigue en el
 * contrato</b> por compatibilidad, y solo se admite igual al del token: si trae otro nombre se
 * contesta 403 diciendolo. Ignorarlo en silencio dejaria al cliente creyendo que cobro por otro.
 *
 * <p>Actuar por otro cajero no existe en este sistema. Si algun dia hace falta, sera un privilegio
 * explicito del catalogo y quedara auditado; no una cadena que el cliente escribe.
 *
 * <h2>El dia de trabajo</h2>
 *
 * <p>Si no viene, hoy segun el reloj de la caja, que lleva la zona del producto (#112). Si viene,
 * lo que se admite depende del acto, y cada acto nombra su {@link Politica}:
 *
 * <ul>
 *   <li><b>cobrar</b> ({@link Politica#SOLO_HOY}): solo hoy. La fecha de un cobro no es un dato que
 *       el cliente elija, y cobrar «ayer» abriria un turno de ayer;
 *   <li><b>cerrar o reversar</b> ({@link Politica#HOY_O_UN_DIA_PASADO}): hoy o cualquier dia
 *       pasado, nunca uno futuro. Un turno que se quedo abierto ayer tiene que poder cerrarse, y
 *       eso no reabre lo que #114 cierra: el turno sigue siendo el del cajero del token, asi que
 *       nadie cierra el de otro.
 * </ul>
 *
 * <p>Sin excepcion por privilegio en ninguno de los dos.
 */
final class QuienYCuando {

    private QuienYCuando() {}

    /** Que dias admite un acto de ventanilla. */
    enum Politica {

        /** Solo hoy: el cobro y el cobro de tasas. */
        SOLO_HOY,

        /** Hoy o un dia pasado, nunca futuro: el cierre y su reversion. */
        HOY_O_UN_DIA_PASADO;

        boolean admite(LocalDate pedida, LocalDate hoy) {
            return switch (this) {
                case SOLO_HOY -> pedida.equals(hoy);
                case HOY_O_UN_DIA_PASADO -> !pedida.isAfter(hoy);
            };
        }

        String loQueAdmite(LocalDate hoy) {
            return switch (this) {
                case SOLO_HOY -> "solo admite el dia de hoy (" + hoy + ")";
                case HOY_O_UN_DIA_PASADO ->
                        "admite hoy (" + hoy + ") o un dia pasado, nunca uno futuro";
            };
        }
    }

    /**
     * El cajero de la operacion: quien firma el token.
     *
     * @param pedido el {@code cajero} que trae la peticion, si trae alguno
     * @throws ProblemaDeNegocio 403 si la peticion nombra a otro cajero
     */
    static String cajero(@Nullable String pedido) {
        String delToken = OrigenContext.actual().usuario();
        if (pedido != null && !pedido.isBlank() && !pedido.strip().equals(delToken)) {
            throw new ProblemaDeNegocio(
                    CodigoDeError.SIN_PRIVILEGIO,
                    "El cajero es quien firma el token ('"
                            + delToken
                            + "'), y la peticion pide actuar como '"
                            + pedido.strip()
                            + "': nadie cobra ni cierra en el turno de otro cajero. Omita el campo"
                            + " 'cajero' o mande el suyo");
        }
        return delToken;
    }

    /**
     * El dia de trabajo: hoy, en la zona del reloj de la caja, si no viene; si viene, el que la
     * politica del acto admita.
     *
     * @param texto la fecha que trae la peticion, en ISO, si trae alguna
     * @param campo el nombre del campo, para decirlo en el error
     * @param politica que dias admite el acto
     * @throws ProblemaDeNegocio 422 si no es una fecha ISO o si la politica no la admite
     */
    static LocalDate dia(@Nullable String texto, String campo, Politica politica, Clock reloj) {
        LocalDate hoy = LocalDate.now(reloj);
        if (texto == null || texto.isBlank()) {
            return hoy;
        }
        LocalDate pedida;
        try {
            pedida = LocalDate.parse(texto.strip());
        } catch (DateTimeParseException malEscrita) {
            throw new ProblemaDeNegocio(
                    CodigoDeError.VALIDACION,
                    "El campo '" + campo + "' no es una fecha ISO: '" + texto + "'");
        }
        if (!politica.admite(pedida, hoy)) {
            throw new ProblemaDeNegocio(
                    CodigoDeError.VALIDACION,
                    "El campo '"
                            + campo
                            + "' "
                            + politica.loQueAdmite(hoy)
                            + ", y trae "
                            + pedida
                            + ". Omita el campo para trabajar en el dia de hoy");
        }
        return pedida;
    }
}
