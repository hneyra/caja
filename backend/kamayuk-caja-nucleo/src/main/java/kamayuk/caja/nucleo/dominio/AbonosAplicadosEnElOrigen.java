package kamayuk.caja.nucleo.dominio;

import java.time.LocalDate;
import kamayuk.caja.dominio.Dinero;

/**
 * Lo que el sistema de origen dice haber aplicado un dia (ADR-0026 §3, la conciliacion).
 *
 * <p>Es la <b>unica</b> pregunta sincrona que la caja le hace a otro sistema, y no esta en el
 * camino del cobro: esta en el de la conciliacion, que es una operacion de negocio con su pantalla
 * y su hora. Si el origen no contesta, <b>la conciliacion no se puede hacer</b> y el dia no cierra
 * — que es exactamente lo que ADR-0026 dice que cuesta esta separacion.
 */
public interface AbonosAplicadosEnElOrigen {

    /**
     * @param sistema a quien se le pregunta
     * @param dia el dia de caja que se concilia
     * @throws BuzonDelSistemaDeOrigen.NoContesta si el origen no contesta. <b>No devuelve
     *     ceros</b>: un cero se leeria como «no aplicaron nada», que es indistinguible de un dia en
     *     que de verdad no se cobro, y la conciliacion diria que cuadra
     */
    Aplicado delDia(SistemaDeOrigen sistema, LocalDate dia);

    /**
     * @param recibidos cuantos pagos de ese dia le llegaron
     * @param aplicados cuantos imputo
     * @param rechazados cuantos no pudo imputar y estan esperando a alguien
     * @param importeAplicado por cuanto dinero
     */
    record Aplicado(int recibidos, int aplicados, int rechazados, Dinero importeAplicado) {}
}
