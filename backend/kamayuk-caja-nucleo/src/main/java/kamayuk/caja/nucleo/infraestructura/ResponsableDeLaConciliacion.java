package kamayuk.caja.nucleo.infraestructura;

import java.util.Objects;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * A quien se le avisa cuando hay dinero cobrado sin registrar (ADR-0026 §4).
 *
 * <h2>Por que esto es una clase y no una cadena suelta</h2>
 *
 * <p>ADR-0026 §4 no pide «una alerta»: pide <b>«alerta a una persona con nombre»</b>. La diferencia
 * es todo: una alerta sin destinatario acaba en un panel que nadie mira, y un pago que no se pudo
 * imputar es dinero que entro por ventanilla y que el sistema de origen no sabe que entro.
 *
 * <p>Asi que el nombre y el canal son <b>obligatorios</b> y se comprueban al arrancar: sin ellos la
 * aplicacion no levanta. Es la unica forma de que «hay un responsable» no sea una frase del javadoc
 * — una propiedad opcional con valor por omision vacio se queda vacia en el ambiente donde importa,
 * y nadie se entera hasta que hace falta.
 *
 * <p>Es el mismo mecanismo con que #157 exigio que todo pod declarara su clase de prioridad, y por
 * el mismo motivo: lo que no es obligatorio se olvida exactamente en la instalacion que menos se
 * mira.
 */
@Component
public class ResponsableDeLaConciliacion {

    private final String nombre;
    private final String canal;

    public ResponsableDeLaConciliacion(
            @Value("${kamayuk.caja.conciliacion.responsable:}") String nombre,
            @Value("${kamayuk.caja.conciliacion.canal:}") String canal) {
        this.nombre = nombre.strip();
        this.canal = canal.strip();
        if (this.nombre.isEmpty() || this.canal.isEmpty()) {
            throw new IllegalStateException(
                    "Faltan kamayuk.caja.conciliacion.responsable y/o .canal. No son opcionales:"
                            + " ADR-0026 §4 exige que un pago que no se pudo imputar avise A UNA PERSONA"
                            + " CON NOMBRE, porque es dinero cobrado sin registrar y no se queda en un"
                            + " registro. Una alerta sin destinatario acaba en un panel que nadie mira,"
                            + " y esta instalacion no arranca hasta que alguien diga quien la recibe");
        }
    }

    public String nombre() {
        return nombre;
    }

    /** Donde se le avisa: un correo, un canal de mensajeria, un telefono. */
    public String canal() {
        return canal;
    }

    @Override
    public String toString() {
        return Objects.requireNonNull(nombre) + " <" + canal + ">";
    }
}
