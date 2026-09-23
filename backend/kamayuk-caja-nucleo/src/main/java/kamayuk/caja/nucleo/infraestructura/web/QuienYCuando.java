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
 * <p>Si no viene, hoy segun el reloj de la caja, que lleva la zona del producto (#112). Si viene y
 * no es hoy, 422: la fecha de un cobro o de un cierre no es un dato que el cliente elija. Sin
 * excepcion por privilegio.
 */
final class QuienYCuando {

    private QuienYCuando() {}

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
     * El dia de trabajo: hoy, en la zona del reloj de la caja.
     *
     * @param texto la fecha que trae la peticion, en ISO, si trae alguna
     * @param campo el nombre del campo, para decirlo en el error
     * @throws ProblemaDeNegocio 422 si no es una fecha ISO o si no es hoy
     */
    static LocalDate dia(@Nullable String texto, String campo, Clock reloj) {
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
        if (!pedida.equals(hoy)) {
            throw new ProblemaDeNegocio(
                    CodigoDeError.VALIDACION,
                    "El campo '"
                            + campo
                            + "' solo admite el dia de hoy ("
                            + hoy
                            + "), y trae "
                            + pedida
                            + ": la ventanilla trabaja en el dia en que esta. Omita el campo o"
                            + " mande el de hoy");
        }
        return pedida;
    }
}
