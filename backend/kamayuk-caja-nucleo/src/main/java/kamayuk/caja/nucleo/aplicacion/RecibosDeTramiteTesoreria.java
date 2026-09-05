package kamayuk.caja.nucleo.aplicacion;

import java.util.List;
import java.util.Objects;
import java.util.Optional;
import kamayuk.caja.nucleo.ReciboDeTramite;
import kamayuk.caja.nucleo.RecibosDeTramite;
import kamayuk.caja.nucleo.dominio.LineaDeRecibo;
import kamayuk.caja.nucleo.dominio.MovimientoDeReciboRepository;
import kamayuk.caja.nucleo.dominio.NumeroDeRecibo;
import kamayuk.caja.nucleo.dominio.Recibo;
import kamayuk.caja.nucleo.dominio.ReciboRepository;
import kamayuk.caja.nucleo.dominio.TipoDePago;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Implementa {@link RecibosDeTramite} sobre los repositorios de la caja (#44, RF-110).
 *
 * <p>Resuelve <b>aqui</b> las tres cosas que el consumidor no debe tener que saber: que el numero
 * impreso se descompone en serie y correlativo, que un recibo de tasas es el de {@link
 * TipoDePago#TASA} y que la anulacion vive en {@code recibo_movimiento} desde #34, no en una
 * columna del recibo.
 *
 * <p>El {@code @Transactional(readOnly = true)} es el que abre la transaccion donde {@code
 * TenantTransactionManager} emite el {@code SET LOCAL app.municipalidad_id} que las politicas RLS
 * de {@code recibo} y {@code recibo_movimiento} consultan. Sin el, la lectura no devuelve vacio:
 * <b>falla</b>, y con un mensaje que no se parece a su causa. Es el defecto que la marcha blanca de
 * seguridad destapo en {@code GET /catastro/vias} y que {@code ConsultaDeVias} arreglo.
 */
@Service
public class RecibosDeTramiteTesoreria implements RecibosDeTramite {

    private final ReciboRepository recibos;
    private final MovimientoDeReciboRepository movimientos;

    public RecibosDeTramiteTesoreria(
            ReciboRepository recibos, MovimientoDeReciboRepository movimientos) {
        this.recibos = recibos;
        this.movimientos = movimientos;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<ReciboDeTramite> porNumeroImpreso(String numeroImpreso) {
        return analizar(numeroImpreso).flatMap(recibos::porNumero).map(this::aPublico);
    }

    private ReciboDeTramite aPublico(Recibo recibo) {
        long id = Objects.requireNonNull(recibo.id(), "Un recibo leido siempre trae su id");
        return new ReciboDeTramite(
                id,
                recibo.numero().impreso(),
                // La fecha del cobro es la que el recibo llama `actualizadoA`: en caja de tasas es
                // el dia a cuya tarifa se cobro, que es el dia del cobro. `emitidoEn` es un
                // instante con zona, y convertirlo aqui elegiria una zona horaria que este modulo
                // no tiene por que elegir.
                recibo.actualizadoA(),
                // El identificador que le da el SISTEMA DE ORIGEN, si lo tiene (P5D). En una
                // tasa cobrada en ventanilla puede no haberlo, y entonces va cero: quien consume
                // este puerto lo usa para cruzar contra su propio padron, y un cero no cruza con
                // nadie — que es exactamente lo que significa «esta caja no sabe quien es».
                recibo.pagador().idExterno() == null ? 0L : recibo.pagador().idExterno(),
                recibo.tipoDePago() == TipoDePago.TASA,
                movimientos.anulacionDe(id).isPresent(),
                conceptosDe(recibo),
                recibo.total(),
                recibo.actualizadoA());
    }

    /**
     * Los codigos del TUPA que el recibo cobro.
     *
     * <p>Se toman de {@code LineaDeRecibo#tributo}, que en una linea de caja de tasas <b>es</b> el
     * codigo de la tasa (ver {@code CobrarTasa}). No se recomponen consultando {@code tasa} por
     * {@code tasaId}: el desglose del recibo esta congelado a proposito, y releer el catalogo daria
     * el codigo de hoy para un recibo de hace dos anios.
     */
    private static List<String> conceptosDe(Recibo recibo) {
        return recibo.lineas().stream().map(LineaDeRecibo::tributo).distinct().toList();
    }

    /**
     * El numero impreso, descompuesto.
     *
     * <p>Devuelve vacio en vez de lanzar: para quien pregunta, un numero mal formado y un numero
     * inexistente significan lo mismo —«ese recibo no respalda nada»—, y publicar una excepcion de
     * formato solo serviria para que el consumidor la tradujera otra vez.
     */
    private static Optional<NumeroDeRecibo> analizar(String impreso) {
        String texto = impreso == null ? "" : impreso.strip();
        int guion = texto.lastIndexOf('-');
        if (guion <= 0 || guion == texto.length() - 1) {
            return Optional.empty();
        }
        try {
            return Optional.of(
                    new NumeroDeRecibo(
                            texto.substring(0, guion), Long.parseLong(texto.substring(guion + 1))));
        } catch (IllegalArgumentException invalido) {
            return Optional.empty();
        }
    }
}
