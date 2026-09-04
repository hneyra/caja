package kamayuk.caja.caja.aplicacion;

import kamayuk.caja.caja.dominio.MovimientoDeReciboRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Si un recibo sigue en pie, preguntado por su identificador interno (P5D).
 *
 * <h2>Por que existe este caso de uso de tres lineas</h2>
 *
 * <p>Porque <b>un controlador no sostiene un repositorio</b>. Ningun {@code RepositoryJdbc} es
 * transaccional —ni tiene por que serlo: la transaccion es del caso de uso—, asi que un controlador
 * que llamara al repositorio correria <b>sin el {@code SET LOCAL}</b> que RLS exige, y la politica
 * no devolveria vacio: <b>reventaria</b>, porque {@code current_setting('app.municipalidad_id')}
 * sobre la cadena vacia no se puede evaluar. Es el defecto de clase que #486 censo en veinticuatro
 * rutas de seis modulos, y la regla de ArchUnit que lo vigila lo encontro aqui antes de que llegara
 * a ejecucion.
 *
 * <h2>Y para que se pregunta</h2>
 *
 * <p>`rentas` no deja anular un convenio de fraccionamiento cuyo recibo de cuota inicial siga vivo
 * —seria dinero cobrado por un acto que ya no existe, y ningun arqueo lo detectaria—. Esa
 * comprobacion la hacia leyendo {@code recibo_movimiento} directamente; con la separacion no puede,
 * y <b>no le sirve</b> preguntar por el numero impreso: {@code convenio_movimiento} guarda el
 * identificador interno, no el numero del papel.
 */
@Service
public class ConsultaDelEstadoDelRecibo {

    private final MovimientoDeReciboRepository movimientos;

    public ConsultaDelEstadoDelRecibo(MovimientoDeReciboRepository movimientos) {
        this.movimientos = movimientos;
    }

    /**
     * @return si ese recibo esta anulado
     */
    @Transactional(readOnly = true)
    public boolean estaAnulado(long reciboId) {
        return movimientos.anulacionDe(reciboId).isPresent();
    }
}
