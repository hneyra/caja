package kamayuk.caja.nucleo.infraestructura.web;

import java.util.Map;
import org.jspecify.annotations.Nullable;

/**
 * El cuerpo de {@code POST /tesoreria/caja/cierre} (#36, RF-087).
 *
 * <p>Una sola ruta y dos actos, distinguidos por el cuerpo: con {@code declarado} cierra; con
 * {@code motivoDeReversion} reversa el cierre vigente y reabre el turno. No es RPC disfrazado: la
 * pantalla «Cierre y arqueo de caja» declara <b>un</b> endpoint, y publicar aqui una segunda ruta
 * que ninguna pantalla llama la rechazaria el contrato ({@code ContratoDeApiTest}). Los dos son
 * actos sobre el mismo turno, igual que la anulacion y el duplicado son actos sobre el mismo
 * recibo.
 *
 * <p><b>Las cifras declaradas llegan como texto</b>, no como numero JSON: un {@code double} que
 * atraviese el analizador ya perdio precision antes de que nadie pueda comprobarlo, y la regla 1
 * prohibe la coma flotante en un importe. Se convierten con {@code new BigDecimal(texto)}.
 *
 * <p>Las claves de {@code declarado} son las cinco {@code FormaDePago} del recibo —EFECTIVO,
 * CHEQUE, DEPOSITO, TARJETA, TRANSFERENCIA— y no las cuatro casillas del prototipo. El prototipo
 * dibuja «efectivo», «tarjeta de débito/crédito», «depósito en cuenta» y «pago en línea», y deja el
 * cheque sin casilla: declarar por las casillas haria que un turno con un cheque saliera
 * descuadrado sin que el cajero pudiera decir nada.
 *
 * @param caja el codigo de la ventanilla
 * @param cajero opcional, y solo el propio. Quien cierra es quien firma el token: el cajero sale
 *     del token (#114, ADR-0028) y este campo solo sigue por compatibilidad del contrato: se admite
 *     omitido o igual al usuario del token; con otro nombre, 403
 * @param fecha el dia del turno, en ISO; sin ella, hoy. Cualquier otra fecha es 422 (#114): se
 *     cierra el turno de hoy
 * @param declarado lo contado en el cajon por forma de pago, en texto decimal
 * @param motivoDeReversion si viene, la peticion reversa el cierre vigente en vez de cerrar
 * @param observacion por que se hace (regla 10, RNF-052). Obligatoria
 */
public record PeticionDeCierre(
        @Nullable String caja,
        @Nullable String cajero,
        @Nullable String fecha,
        @Nullable Map<String, String> declarado,
        @Nullable String motivoDeReversion,
        @Nullable String observacion) {}
