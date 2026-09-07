package kamayuk.caja.verificaciones;

import java.util.Set;
import kamayuk.comun.verificaciones.contrato.ContratoConElConsumidorTestBase;
import org.junit.jupiter.api.DisplayName;

/**
 * {@code caja} sigue publicando lo que {@code rentas} le pide (ADR-0026, ADR-0030 §4).
 *
 * <h2>La direccion que faltaba</h2>
 *
 * <p>De las dos direcciones de esta frontera solo una estaba comprometida. {@code
 * ContratoQueConsumeDeRentas} publica lo que <b>esta</b> caja le pide a {@code rentas} —el {@code
 * POST /pagos} del evento de cobro— y el CI de {@code rentas} lo comprueba desde C-1. La contraria
 * —{@code rentas} <b>pidiendo</b> a {@code caja}: el avance del dia, los recibos de tramite, los
 * cobros de tasas y las ordenes de cobro— no tenia contrato ni prueba: un parametro podia cambiar
 * de nombre en cualquiera de los dos lados y los dos CI seguian verdes.
 *
 * <p><b>Y no es hipotetico</b> (`rentas`#27): {@code AvanceDeCajaHttp} llevaba pidiendo {@code GET
 * /caja/api/v1/recaudacion/avance?dia=…&aLaFecha=…} contra un endpoint que admite {@code desde} y
 * {@code hasta}. Medido con las dos aplicaciones levantadas y hablando entre si: {@code 422
 * «Parametros desconocidos: 'aLaFecha', 'dia'»}, y {@code GET
 * /rentas/api/v1/indicadores/recaudacion} en <b>500</b> — el panel de ese modulo no se podia
 * dibujar con esta caja levantada, autorizada y sana.
 *
 * <h2>Por que el rojo tiene que llegar AQUI</h2>
 *
 * <p>Porque quien retira un campo o deja de leer un parametro es este repositorio. Con la prueba
 * del lado del consumidor, el aviso le llegaria a quien no rompio nada y quien rompio algo
 * integraria en verde. Es el reparto de ADR-0030 §4, el mismo que {@code catastro} y {@code
 * normativa} ya tienen para {@code rentas}.
 *
 * <p><b>Esta prueba no se salta si el clon de {@code rentas} no esta</b>: falla nombrando el
 * archivo y el {@code git clone} que falta. Una prueba de contrato que no encuentra su contrato y
 * pasa en verde es peor que ninguna.
 */
@DisplayName("Contrato con rentas (caja es el proveedor)")
class ContratoConRentasTest extends ContratoConElConsumidorTestBase {

    @Override
    protected String consumidor() {
        return "rentas";
    }

    @Override
    protected String proveedor() {
        return "caja";
    }

    /**
     * <b>Vacia, y esa es la afirmacion.</b> Lo que {@code rentas} lee de esta caja, esta caja lo
     * publica; y todo parametro que manda, esta caja lo lee.
     *
     * <p>Se deja declarada con la lista vacia en vez de borrar el metodo: lo que permite es una
     * excepcion temporal y con nombre, y a cero un desajuste nuevo no tiene donde esconderse. La
     * lista sigue con las dos direcciones cerradas — una entrada nueva pone el build rojo, y una
     * que ya no ocurre tambien.
     *
     * <p>Nace vacia porque `rentas`#27 y `rentas`#41 <b>arreglaron el consumidor</b> antes de
     * publicar el contrato: pasa a pedir con {@code desde} y {@code hasta}, que es lo que esta caja
     * ya admite, y a leer {@code cobrado.importe} en vez de un {@code cobrado} escalar que aqui
     * nunca existio. Publicar el contrato con los nombres viejos habria dejado esta prueba roja el
     * primer dia, y un rojo permanente es la forma segura de que nadie vuelva a mirarla.
     */
    @Override
    protected Set<String> desajustesVivos() {
        return Set.of();
    }
}
