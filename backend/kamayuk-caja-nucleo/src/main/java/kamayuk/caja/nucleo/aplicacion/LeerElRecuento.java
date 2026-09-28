package kamayuk.caja.nucleo.aplicacion;

import java.time.LocalDate;
import java.util.List;
import java.util.Objects;
import kamayuk.caja.nucleo.dominio.BuzonDeSalida;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Lo que la conciliacion le lee a la base: el recuento del dia, <b>en su propia transaccion y nada
 * mas</b> (#133).
 *
 * <h2>Por que es otro bean, y no un metodo de {@link ConciliacionDelDia}</h2>
 *
 * <p>Hasta #133 {@code ConciliacionDelDia.de} era {@code @Transactional(readOnly = true)} entero:
 * la transaccion —y con ella la conexion del pool, que {@code TenantTransactionManager} toma al
 * empezar para fijar el {@code SET LOCAL}— seguia abierta mientras se le preguntaba a cada sistema
 * de origen por HTTP. Eso son hasta 5 s de conexion y 30 s de lectura por sistema, mas lo que tarde
 * el token (otros 5 y 10), con una conexion de las diez de Hikari retenida sin hacer nada. Con
 * {@code rentas} aceptando conexiones y sin contestar, diez personas que abren la hoja de cierre
 * agotan el pool, y {@code POST /cobros} espera su conexion y contesta 500: la ventanilla deja de
 * cobrar por una lectura que no esta en el camino del cobro (ADR-0026).
 *
 * <p>Un metodo {@code @Transactional} de la propia {@code ConciliacionDelDia} no serviria: llamado
 * desde {@code de}, la autoinvocacion no pasa por el proxy y la anotacion no se aplicaria — el
 * defecto que #109 midio en el publicador. Por eso vive aqui, en otro bean, como {@link
 * AnotarLaEntrega}.
 *
 * <h2>La transaccion no es opcional</h2>
 *
 * <p>{@code pago_evento}, {@code cierre_caja} y {@code recibo} llevan RLS, y la politica lee {@code
 * app.municipalidad_id}, que solo existe dentro de una transaccion abierta por {@code
 * TenantTransactionManager}. Sin ella la consulta no devuelve vacio: <b>revienta</b>. La
 * municipalidad sale del {@code TenantContext} del hilo, que el filtro de la peticion ya puso.
 *
 * <p>Es {@code REQUIRED} y no {@code REQUIRES_NEW} a proposito: el caso previsto es que no haya
 * ninguna fuera, y entonces las dos son lo mismo. Si alguien la envolviera en una, {@code
 * REQUIRES_NEW} pediria <b>una segunda</b> conexion con la primera retenida, que es peor.
 */
@Service
public class LeerElRecuento {

    private final BuzonDeSalida buzon;

    public LeerElRecuento(BuzonDeSalida buzon) {
        this.buzon = buzon;
    }

    /**
     * El recuento del dia, leido y soltado: al volver no queda ni transaccion abierta ni conexion
     * tomada.
     *
     * @param dia el dia de caja que se concilia; entra como argumento (regla 6)
     */
    @Transactional(readOnly = true)
    public List<BuzonDeSalida.RecuentoDelDia> delDia(LocalDate dia) {
        Objects.requireNonNull(dia, "La conciliacion es de un dia concreto (regla 6)");
        return List.copyOf(buzon.recuentoDe(dia));
    }
}
