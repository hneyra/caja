package kamayuk.caja.nucleo.aplicacion;

import java.time.Clock;
import java.util.List;
import java.util.Objects;
import kamayuk.caja.nucleo.dominio.BuzonDeSalida;
import kamayuk.caja.nucleo.dominio.EventoDePago;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Lo que el publicador le lee y le escribe al buzon, <b>cada cosa en su propia transaccion</b>
 * (#109).
 *
 * <h2>Por que es otro bean, y no un metodo de {@link EntregarEventos}</h2>
 *
 * <p>Hasta #109 la transaccion de cada evento era un {@code @Transactional(REQUIRES_NEW)} sobre
 * {@code EntregarEventos.entregarUno}, llamado desde {@code entregarPendientes}, <b>de la misma
 * clase</b>. En modo proxy —el proyecto no usa AspectJ— esa autoinvocacion no pasa por el
 * interceptor y la anotacion no se aplicaba nunca, aunque su javadoc dijera que era {@code public}
 * «para que el proxy la intercepte»: {@code public} es condicion necesaria, no suficiente. La
 * vuelta entera de una municipalidad corria en la transaccion del recorrido, y un fallo inesperado
 * en el evento 2 deshacia la entrega ya marcada del 1. Lo mide {@code
 * CadaEventoEnSuTransaccionTest}, con un contexto de Spring de verdad.
 *
 * <p>Un bean aparte y no un {@code TransactionTemplate} dentro del caso de uso, por una razon que
 * no es de gusto: la regla 10 ({@code ConObservacionEnLasEscrituras}) mira los metodos anotados
 * {@code @Transactional} que escriben. Con un {@code TransactionTemplate} estas escrituras dejarian
 * de ser visibles para ella; asi siguen siendolo, y su exencion en {@code ConfiguracionDeCaja}
 * nombra cada metodo por su firma.
 *
 * <h2>Ninguna transaccion abierta mientras se habla con el origen</h2>
 *
 * <p>Los cuatro metodos abren y cierran la suya ({@link Propagation#REQUIRES_NEW}): la de fuera, la
 * del recorrido, queda suspendida y sin candados. Ni siquiera la lectura de lo pendiente se hace en
 * la de fuera: un {@code SELECT} deja un {@code ACCESS SHARE} sobre {@code pago_evento} hasta que
 * su transaccion acaba, y una migracion que quisiera alterar la tabla esperaria detras de todos los
 * {@code POST} de la vuelta.
 */
@Service
public class AnotarLaEntrega {

    private final BuzonDeSalida buzon;
    private final Clock reloj;

    public AnotarLaEntrega(BuzonDeSalida buzon, Clock reloj) {
        this.buzon = buzon;
        this.reloj = reloj;
    }

    /** Lo pendiente, leido y soltado: al volver no queda ninguna fila tomada. */
    @Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true)
    public List<EventoDePago> pendientes(int cuantos) {
        return buzon.pendientes(cuantos);
    }

    /** El evento llego. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void entregado(EventoDePago evento) {
        Objects.requireNonNull(evento, "No se anota un evento nulo");
        buzon.marcarEntregado(evento.idGuardado(), reloj.instant());
    }

    /**
     * El evento no llego: cuenta su intento y, si se agotaron, lo mata.
     *
     * <p>Cuenta solo si nadie lo conto desde que se leyo —ver {@link BuzonDeSalida#marcarFallido}—,
     * que es lo que antes daba el {@code FOR UPDATE SKIP LOCKED}.
     *
     * @param evento tal como se leyo al empezar la vuelta: sus {@code intentos} son los esperados
     * @param error por que, ya recortado al largo de la columna
     * @param seAgotaron si con este intento muere
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void fallido(EventoDePago evento, String error, boolean seAgotaron) {
        Objects.requireNonNull(evento, "No se anota un evento nulo");
        buzon.marcarFallido(evento.idGuardado(), evento.intentos(), error, seAgotaron);
    }

    /** Los muertos, para la alerta. */
    @Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true)
    public List<EventoDePago> muertos() {
        return buzon.muertos();
    }
}
