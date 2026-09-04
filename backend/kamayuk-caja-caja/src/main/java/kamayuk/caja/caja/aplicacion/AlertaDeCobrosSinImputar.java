package kamayuk.caja.caja.aplicacion;

import java.util.List;
import kamayuk.caja.caja.dominio.EventoDePago;

/**
 * Le dice a una persona con nombre que hay dinero cobrado sin registrar (ADR-0026 §4).
 *
 * <p><b>La pieza no es «una alerta»: es «una alerta a una persona con nombre».</b> Un evento muerto
 * es dinero que entro por ventanilla y que el sistema de origen no sabe que entro; escribirlo en un
 * registro y seguir es exactamente lo que ADR-0026 §4 prohibe, porque un registro no tiene dueno y
 * nadie descubre el descuadre hasta que alguien reclama.
 *
 * <p>Que el destinatario tenga nombre lo sostiene {@code ResponsableDeLaConciliacion}, que se lee
 * de la configuracion y <b>no admite estar en blanco</b>: sin el, la aplicacion no arranca. Es la
 * unica forma de que «hay un responsable» no sea una frase del javadoc.
 */
public interface AlertaDeCobrosSinImputar {

    /**
     * @param muertos todos los que hay, no solo los de esta vuelta: quien recibe el aviso tiene que
     *     ver el estado entero, no el incremento
     */
    void hayCobrosSinImputar(List<EventoDePago> muertos);
}
