package kamayuk.caja.nucleo.infraestructura.web;

import kamayuk.caja.dominio.Dinero;
import kamayuk.caja.web.CodigoDeError;
import kamayuk.caja.web.ProblemaDeNegocio;

/**
 * Un importe que entra por una peticion: con dos decimales como mucho, o 422 (#142).
 *
 * <h2>Por que</h2>
 *
 * <p>Toda columna de importe de esta base es del dominio {@code dinero}, {@code numeric(15,2)}
 * (V1), y PostgreSQL no rechaza un valor con mas decimales: <b>lo redondea al guardarlo</b>, con el
 * empate lejos del cero. Medido en PostgreSQL 16 (#142): {@code '10.005'} se guarda {@code 10.01},
 * {@code '0.004'} se guarda {@code 0.00}, y dos {@code 50.005} guardados por separado suman {@code
 * 100.02} donde su suma guardada es {@code 100.01}. Hasta #142 ninguna de las dos puertas por las
 * que entra un importe lo miraba, asi que:
 *
 * <ul>
 *   <li>una orden de {@code "10.005"} se guardaba como {@code 10.01}, y asi se contestaba y se
 *       auditaba —el repositorio relee la fila—, sin que nadie dijera que la cifra habia cambiado;
 *   <li>una de {@code "0.004"} pasaba {@code esPositivo}, se redondeaba a cero y moria en {@code
 *       orden_importe_ck} (V2) como un 500;
 *   <li>un cierre que declaraba {@code 50.005} en dos formas de pago contestaba que cuadraba con
 *       {@code 100.010}, guardaba {@code 100.01} en la cabecera y, releido desde el detalle, decia
 *       {@code 100.02}.
 * </ul>
 *
 * <p>Ese redondeo es una decision de D-03 —con cuantos decimales, con que modo y en que punto del
 * calculo— que nadie tomo: la tomaba el motor por omision. <b>Aqui no se toma otra.</b> No se
 * redondea: se rechaza diciendo por que, y quien manda el importe decide como redondearlo.
 *
 * <h2>Por que aqui y no en {@link Dinero}</h2>
 *
 * <p>{@code Dinero} lleva a proposito cifras intermedias sin redondear —{@link Dinero#por} devuelve
 * el producto con todos sus decimales, y su javadoc dice que la escala no la decide el tipo
 * (D-03a)—: un constructor que rechazara la escala 3 romperia esa aritmetica u obligaria a
 * redondear en cada paso, que es D-03c. Y {@code Dinero} es una de las copias que el censo de
 * {@code infrastructure} compara en los cinco sistemas. El limite es de lo que se <b>guarda</b>,
 * asi que va donde entra lo que se va a guardar: {@link OrdenDeCobroController} y {@link
 * CierreController}, las dos unicas peticiones que traen un importe. Las demas cifras que esta caja
 * guarda salen de su propia base —ya con dos decimales— o de una tasa por una cantidad entera.
 *
 * <h2>Los ceros de la derecha no cuentan</h2>
 *
 * <p>{@code "10.500"} se admite: su valor tiene un decimal y cabe entero en la columna, que guarda
 * {@code 10.50} sin redondear nada. Se mira la escala de {@code stripTrailingZeros()}, no la del
 * texto.
 *
 * <p>Lo que <b>no</b> mira es la parte entera. Un importe de mas de trece cifras enteras tampoco
 * cabe en {@code numeric(15,2)}, pero el motor no lo redondea: lo rechaza («numeric field
 * overflow»). No es el defecto de #142, y queda fuera.
 */
final class ImporteRecibido {

    /**
     * Los decimales del dominio {@code dinero} de V1, {@code numeric(15,2)}: los que la columna
     * guarda sin redondear. Es un limite del almacenamiento, no la respuesta a D-03a.
     */
    static final int DECIMALES_QUE_SE_GUARDAN = 2;

    private ImporteRecibido() {}

    /**
     * El importe tal cual, si la columna lo guarda sin redondearlo; si no, 422.
     *
     * @param importe el ya leido del texto
     * @param queEs como lo nombra el mensaje: «El campo 'importe'», «Lo declarado en EFECTIVO»
     * @param escrito el texto tal como llego, para repetirlo en el mensaje
     */
    static Dinero sinRedondear(Dinero importe, String queEs, String escrito) {
        if (importe.valor().stripTrailingZeros().scale() > DECIMALES_QUE_SE_GUARDAN) {
            throw new ProblemaDeNegocio(
                    CodigoDeError.VALIDACION,
                    queEs
                            + " trae mas de dos decimales: '"
                            + escrito
                            + "'. Un importe se guarda con dos, y esta caja no lo redondea por su"
                            + " cuenta —como redondear sigue sin decidirse (D-03)—: hay que"
                            + " mandarlo con dos decimales como mucho");
        }
        return importe;
    }
}
