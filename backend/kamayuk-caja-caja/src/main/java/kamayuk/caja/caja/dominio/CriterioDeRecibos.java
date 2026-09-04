package kamayuk.caja.caja.dominio;

import java.time.LocalDate;
import java.util.Locale;
import org.jspecify.annotations.Nullable;

/**
 * Los filtros del listado de recibos (#548, RF-082, pantalla {@code duplicado_recibo}).
 *
 * <p>Todos opcionales, todos por igualdad o por rango. Nada de aproximacion ni de prefijo: si algun
 * dia hiciera falta, se escribe como rango con {@code ~>=~} / {@code ~<~} y nunca con {@code LIKE},
 * porque bajo RLS un {@code LIKE 'prefijo%'} no llega al indice (DAT-01 §0, hallazgo 3).
 *
 * <p><b>No hay filtro por numero de recibo, y no es un olvido.</b> El numero exacto ya tiene su
 * propia ruta —{@code GET /tesoreria/recibos/{nro}/duplicado}—: quien lo sabe no necesita la lista.
 * Este listado existe justamente para quien <b>no</b> lo sabe, que es el caso que hasta #548 no
 * tenia salida —perdido el papel, el recibo no se podia encontrar—.
 *
 * <p>{@code estado} tampoco es una columna: se deriva de si hay movimiento de anulacion (V30), asi
 * que filtrar por el se resuelve contra {@code recibo_movimiento}. Es el precio de no tener una
 * columna que mienta, y se paga una vez, aqui.
 *
 * @param documentoDelPagador el documento de quien pago, exacto — <b>no</b> el codigo del padron de
 *     {@code rentas} (P5E). Hasta P5E este filtro era {@code codigoContribuyente} y se resolvia con
 *     una subconsulta a {@code contribuyente}, una tabla que esta base <b>no tiene</b>: era el
 *     ultimo trozo vivo de {@code PENDIENTE-CRUCE-06}, que P5D dio por cerrado al copiar el pagador
 *     en el recibo y que solo cerro la mitad de la emision. Se busca por documento porque es lo que
 *     {@link Pagador} ya declaraba de si mismo —«es con lo que se busca un recibo en ventanilla, y
 *     por eso tiene indice»— y porque un pagador que no esta en ningun padron no tiene codigo
 * @param caja el codigo de la caja que emitio, exacto
 * @param cajero la cuenta de quien cobro, exacta
 * @param desde el primer dia del rango de emision, inclusive
 * @param hasta el ultimo dia del rango, inclusive
 * @param estado {@code EMITIDO} o {@code ANULADO}; {@code null} es «todos»
 */
public record CriterioDeRecibos(
        @Nullable String documentoDelPagador,
        @Nullable String caja,
        @Nullable String cajero,
        @Nullable LocalDate desde,
        @Nullable LocalDate hasta,
        @Nullable EstadoDeRecibo estado) {

    public CriterioDeRecibos {
        documentoDelPagador = normalizar(documentoDelPagador);
        caja = normalizar(caja);
        // El cajero es la cuenta del token y llega tal cual: `recibo.cajero` guarda lo que
        // `OrigenContext` traia, y pasarlo a mayusculas aqui haria que el filtro no
        // encontrara nunca los recibos de `jperez`.
        cajero = cajero == null || cajero.isBlank() ? null : cajero.strip();
        if (desde != null && hasta != null && desde.isAfter(hasta)) {
            throw new IllegalArgumentException(
                    "El rango de fechas esta al reves: desde " + desde + " hasta " + hasta);
        }
    }

    /** Sin ningun filtro: todos los recibos de la municipalidad. */
    public static CriterioDeRecibos todos() {
        return new CriterioDeRecibos(null, null, null, null, null, null);
    }

    private static @Nullable String normalizar(@Nullable String texto) {
        return texto == null || texto.isBlank() ? null : texto.strip().toUpperCase(Locale.ROOT);
    }
}
