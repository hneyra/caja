package kamayuk.caja.seguridad;

/**
 * A quien se le avisa cuando un evento de la autorizacion se aparta sin aplicar (ADR-0026 §4,
 * aplicado a la copia local).
 *
 * <p>Un evento apartado es un permiso, una cuenta o una afiliacion que alguien decidio en {@code
 * identidad} y que en esta caja <b>no rige</b>. Ninguna cifra lo delata: la ventanilla sigue
 * cobrando y el guardia sigue contestando con lo que tiene. Por eso no basta con guardarlo en
 * {@code identidad_evento_muerto}: hay que decirselo a una persona con nombre, la misma que recibe
 * el aviso de un pago sin registrar.
 */
public interface AlertaDeEventosSinAplicar {

    /**
     * @param evento el que se aparto
     * @param motivo por que no se pudo aplicar nunca
     * @param apartados cuantos hay apartados en esta municipalidad, este incluido
     */
    void hayUnEventoSinAplicar(EventoDeIdentidadRecibido evento, String motivo, long apartados);
}
