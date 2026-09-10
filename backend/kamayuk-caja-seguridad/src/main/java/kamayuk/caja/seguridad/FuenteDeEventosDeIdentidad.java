package kamayuk.caja.seguridad;

import java.util.List;
import java.util.UUID;

/**
 * De donde salen los eventos de la autorizacion: el buzon de {@code identidad} (ADR-0039, etapa 4;
 * ADR-0028 §3).
 *
 * <p>Es un puerto y no un cliente HTTP a proposito: el consumidor se prueba sin red, y el cliente
 * de verdad —que vive en {@code nucleo.infraestructura}, junto al otro cliente HTTP de esta caja—
 * se prueba contra un servidor de verdad. Lo que el puerto promete es el contrato del buzon: <b>al
 * menos una vez</b>. Un evento se sirve hasta que se acusa, asi que el consumidor tiene que saber
 * recibirlo dos veces —y por eso el acuse local ({@code identidad_evento_aplicado}) se escribe en
 * la misma transaccion que la copia—.
 *
 * <h2>Lo que este puerto NO toca: el camino del cobro</h2>
 *
 * <p>Ningun controlador de esta caja inyecta este puerto ni ninguno hacia otro sistema. El
 * consumidor corre en el perfil {@code batch}, en un proceso de vida corta, y lo unico que comparte
 * con la ventanilla es la tabla que ella lee para autorizar. Es lo que conserva la propiedad de
 * ADR-0026 §1: la caja cobra con {@code identidad} apagado, y con {@code identidad} apagado lo que
 * pasa es que la copia se desatrasa, no que la ventanilla cierre.
 */
public interface FuenteDeEventosDeIdentidad {

    /**
     * Los siguientes eventos pendientes para esta caja, en orden de secuencia.
     *
     * @param limite cuantos como maximo; {@code identidad} admite de 1 a 500
     * @throws IdentidadNoContesta si no se pudo leer, por lo que sea
     */
    Lote pendientes(int limite);

    /**
     * Acusa los eventos que ya estan resueltos aqui —aplicados o apartados—, para que {@code
     * identidad} deje de servirlos.
     *
     * <p>Se llama <b>despues</b> de que cada uno haya confirmado su transaccion: un acuse antes del
     * {@code commit} es un evento que el emisor deja de servir y esta copia nunca aplico, y eso no
     * lo corrige nadie.
     *
     * @throws IdentidadNoContesta si no se pudo acusar por transporte o por credencial; los eventos
     *     SI estan resueltos aqui, se volveran a servir y se descartaran por deduplicacion
     * @throws AcuseRechazado si {@code identidad} rechazo el acuse por su contenido (4xx de
     *     negocio); se registra y no se reintenta, porque el motivo no va a cambiar solo
     */
    Acuse acusar(List<UUID> eventoIds);

    /**
     * Una pagina del buzon.
     *
     * @param eventos los eventos, en orden de secuencia
     * @param quedan cuantos le faltan a esta caja en total, contando los de esta pagina
     */
    record Lote(List<EventoDeIdentidadRecibido> eventos, long quedan) {}

    /**
     * Lo que {@code identidad} contesto al acuse.
     *
     * @param recibidos cuantos identificadores llegaron
     * @param escritos cuantos acuses se escribieron de verdad (los repetidos no)
     * @param quedan cuantos siguen pendientes despues del acuse
     */
    record Acuse(int recibidos, int escritos, long quedan) {}

    /**
     * {@code identidad} no contesto, o contesto algo que no es un buzon.
     *
     * <p><b>Todo fallo de transporte es transitorio a proposito</b>, y tambien lo son el 401 y el
     * 403: una credencial que falta o una cuenta de servicio sin afiliar al grupo «Consumidores del
     * buzon» se arreglan del lado del despliegue y cambian solas. Lo que no puede pasar es que un
     * fallo de transporte mate un evento: un evento muerto es un permiso que alguien concedio y que
     * aqui nunca va a regir, asi que solo se aparta lo que no se podra aplicar NUNCA.
     */
    final class IdentidadNoContesta extends RuntimeException {
        @java.io.Serial private static final long serialVersionUID = 1L;

        public IdentidadNoContesta(String mensaje) {
            super(mensaje);
        }

        public IdentidadNoContesta(String mensaje, Throwable causa) {
            super(mensaje, causa);
        }
    }

    /**
     * {@code identidad} rechazo el acuse por lo que decia: un identificador que no es un evento, o
     * uno que no se le sirvio a esta caja (422).
     *
     * <p>No es transitorio: mandar lo mismo otra vez da lo mismo. Y no cuesta ningun evento: los
     * que se acusaban ya estan resueltos aqui, y si {@code identidad} los vuelve a servir se
     * descartan por deduplicacion. Lo que cuesta es que este consumidor y el buzon han dejado de
     * hablar el mismo idioma, y eso se registra para que alguien lo mire.
     */
    final class AcuseRechazado extends RuntimeException {
        @java.io.Serial private static final long serialVersionUID = 1L;

        private final int estado;

        public AcuseRechazado(int estado, String mensaje) {
            super(mensaje);
            this.estado = estado;
        }

        public int estado() {
            return estado;
        }
    }
}
