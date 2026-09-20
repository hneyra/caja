package kamayuk.caja.nucleo.aplicacion;

import java.time.LocalDate;
import java.util.List;
import java.util.Objects;
import kamayuk.caja.nucleo.dominio.TurnoConSuCaja;
import kamayuk.caja.nucleo.dominio.TurnoDeCajaRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * De que turno es la ventanilla de quien pregunta (#97).
 *
 * <h2>Lo que este caso de uso existe para NO hacer</h2>
 *
 * <p>No abre, no cierra y no reversa nada: es la mitad que faltaba para poder <b>pedir</b> el
 * arqueo. Hasta #97, {@code GET /turnos/&#123;turnoId&#125;/cierre} existia y ninguna lectura
 * publicaba ese {@code turnoId}: la unica forma de tenerlo era el {@code turnoId} de un pago sin
 * entregar —que solo aparece cuando algo va mal— o {@code /recaudacion/avance?caja=&cajero=}, que
 * es <b>otro acceso</b> y ademas exige saber ya en que caja se esta. Diez campos de «Cierre y
 * arqueo de caja» decian «sin turno» por eso.
 *
 * <p>Solo lee, y la transaccion lo dice (ADR-0040): la ventanilla se conecto para leer.
 *
 * <h2>El cajero no es un parametro, y ese es el punto</h2>
 *
 * <p>Entra como argumento de este metodo porque un caso de uso no habla de HTTP, pero el
 * <b>unico</b> llamador lo saca del {@code OrigenContext} que fijo el filtro desde el token.
 * Admitirlo como parametro de consulta convertiria esta lectura en «el turno de quien yo diga», que
 * es lo que el javadoc de {@code UsuarioDeLaSesion} dice que haria que el arqueo dejara de
 * significar nada.
 */
@Service
public class ConsultaDelTurno {

    private final TurnoDeCajaRepository turnos;

    public ConsultaDelTurno(TurnoDeCajaRepository turnos) {
        this.turnos = turnos;
    }

    /**
     * Los turnos de ese cajero en ese dia, en todas sus ventanillas.
     *
     * <p>Vacio es una respuesta y no un error: el cajero que todavia no ha cobrado nada hoy no
     * tiene turno, porque la apertura la hace la primera cobranza ({@link AbrirCaja}). Lanzar aqui
     * obligaria a la pantalla a tratar como fallo el estado normal de las ocho de la manana.
     *
     * @param cajero de quien son; sale del contexto de origen
     * @param fecha el dia de trabajo; entra, no se lee del reloj (regla 6)
     */
    @Transactional(readOnly = true)
    public List<TurnoConSuCaja> delCajeroEn(String cajero, LocalDate fecha) {
        Objects.requireNonNull(cajero, "Los turnos son de un cajero concreto");
        Objects.requireNonNull(fecha, "Los turnos son de un dia concreto");
        return turnos.delCajeroEn(cajero.strip(), fecha);
    }
}
