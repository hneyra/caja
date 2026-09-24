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

    /**
     * Un renombrado que choco con la clave de OTRA fila y por eso se aplico SIN ella (ronda 1 de
     * #111): un choque no puede impedir que una fila de esta copia se cierre, asi que la fila del
     * {@code id} de {@code identidad} recibe todo lo que el evento trae —habilitado, vigencias,
     * nombre, correo, descripcion— menos la clave, que conserva la que ya tenia; la fila con la que
     * chocaba no se toca. El evento {@code aplica} igual y se acusa: no es un {@link
     * #hayUnEventoSinAplicar}, porque nada se aparto.
     *
     * <p>Mientras el choque siga —la otra fila no suelte esa clave—, cada evento siguiente de este
     * mismo sujeto va a volver a chocar y a avisar otra vez: es deliberado, porque es la unica
     * senal de que la copia tiene dos filas que deberian ser una y de que alguien tiene que
     * resolverlo a mano, moviendo miembros y permisos si corresponde.
     *
     * @param evento el que choco
     * @param motivo la clave que se pidio y cual de las dos filas ya la tenia
     */
    void hayUnChoqueDeRenombrado(EventoDeIdentidadRecibido evento, String motivo);

    /**
     * Los que llevan POSPUESTOS mas de lo que se admite, una vez por corrida.
     *
     * <p>Un evento pospuesto no es un fallo —le falta su dependencia y la vuelta siguiente lo
     * encuentra puesta—, asi que no se aparta y no se acusa. Lo que si es un defecto es que se
     * quede ahi: medido con las cinco aplicaciones levantadas (informe de AC-5/AC-6, hallazgo H7),
     * un pospuesto sobrevivio DOS corridas enteras produciendo un WARN por vuelta y <b>cero</b>
     * avisos — o sea que la copia estaba desatrasada, se sabia dentro del proceso, y no salia de
     * ahi. Por eso este metodo existe aparte del de arriba: aquel dice «esto no entrara nunca» y
     * este, «esto lleva demasiado sin entrar».
     *
     * <p>Se llama <b>una vez por corrida</b> y con la lista entera, no una vez por evento: cuatro
     * pospuestos permanentes por cuatro ticks a la hora son 96 avisos al dia diciendo lo mismo, y
     * un canal que repite se deja de mirar.
     *
     * @param pospuestos los que pasan del umbral, sin repetir, en el orden en que se leyeron
     * @param ahora el instante contra el que se midio la edad de todos, para que la lista sea
     *     coherente consigo misma
     * @param umbral desde cuando se avisa, para que el aviso diga cuanto es «demasiado»
     */
    void hayEventosPospuestos(
            java.util.List<EventoDeIdentidadRecibido> pospuestos,
            java.time.Instant ahora,
            java.time.Duration umbral);
}
