package kamayuk.caja.seguridad;

import java.util.List;

/**
 * A quien se le avisa de las filas de la copia que un sujeto nuevo ya adopto sobre la de otro
 * (#137).
 *
 * <p>Es un puerto aparte de {@link AlertaDeEventosSinAplicar} y no un metodo mas de aquel, a
 * proposito: aquel lo recibe el aplicador y lo implementan los dobles de sus pruebas, y este lo
 * pide solo quien lee estas filas. Un metodo nuevo alli obligaria a tocar cada doble de cada prueba
 * del consumidor para decir «a mi no me llaman».
 *
 * <p>Se llama <b>una vez por corrida</b> y solo si hay alguna, como el aviso de las filas sin
 * sujeto: es un riesgo vivo —la fila concede lo de otra persona a quien entra con su clave— y
 * callarlo entre corridas seria esconderlo.
 */
public interface AlertaDeHuerfanasYaAdoptadas {

    /**
     * @param candidatas las que conceden algo anterior al alta de su sujeto, ordenadas por tabla y
     *     clave; nunca vacia
     */
    void hayHuerfanasYaAdoptadas(List<HuerfanaYaAdoptada> candidatas);
}
