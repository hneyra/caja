package kamayuk.caja.verificaciones;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import kamayuk.comun.verificaciones.contrato.ContratoDelConsumidor;
import kamayuk.comun.verificaciones.contrato.ContratoQueSePublicaTestBase;
import org.junit.jupiter.api.DisplayName;

/**
 * Lo que {@code caja} le manda a {@code rentas}, publicado para que su CI lo comprueba.
 *
 * <p>Es una sola operacion y es de <b>escritura</b>: {@code POST /pagos}, el buzon de entrada del
 * sistema de origen (ADR-0026 §3). {@code BuzonHttpDelSistemaDeOrigen} manda el cuerpo <b>tal cual
 * se congelo</b> en la transaccion del cobro y no lee la respuesta —solo el codigo de estado—, asi
 * que aqui lo que hay que comprobar es lo contrario que en una lectura: que el receptor
 * <b>acepte</b> cada campo que este sistema manda.
 *
 * <h2>Por que esto no se ve de ninguna otra manera</h2>
 *
 * <p>Los cuatro backends tienen {@code FAIL_ON_UNKNOWN_PROPERTIES} apagado, y endurecerlo cambiaria
 * el borde de todas las operaciones con cuerpo a la vez (#538, #539). De modo que un campo que este
 * sistema manda y {@code PeticionDePago} no declara <b>se pierde con 201 de vuelta</b>: el evento
 * se marca ENTREGADO, el buzon se vacia, y el dato no llego. No hay reintento, porque para la caja
 * la entrega salio bien.
 *
 * <h2>Las dos formas del cuerpo, y por que se declara la union</h2>
 *
 * <p>{@code ComponedorDeEventosJson} escribe dos cuerpos distintos por la misma ruta —{@code
 * PAGO_REGISTRADO} y {@code PAGO_ANULADO}—, y el tipo va dentro a proposito: «dos rutas obligarian
 * a la caja a decidir cual usar mirando el evento, que es un switch sobre un concepto ajeno». El
 * contrato declara la <b>union</b> de los dos, que es exactamente lo que el receptor tiene que
 * saber leer: un {@code record} que solo cubriera uno de los dos perderia el otro en silencio.
 */
@DisplayName("Contrato que caja consume de rentas")
public class ContratoQueConsumeDeRentas extends ContratoQueSePublicaTestBase {

    /** Lo que `ComponedorDeEventosJson.pagoRegistrado` y `.pagoAnulado` escriben, unidos. */
    public static final Map<String, Object> CUERPO_DEL_PAGO =
            ordenados(
                    Map.entry("pagoId", "texto"),
                    Map.entry("tipo", "texto"),
                    // Solo en PAGO_ANULADO. El pago que se deshace, por identificador y no
                    // por el numero del papel.
                    Map.entry("pagoOriginalId", "texto"),
                    // Solo en PAGO_REGISTRADO.
                    Map.entry("sistemaOrigen", "texto"),
                    Map.entry("total", "texto"),
                    Map.entry("actualizadoA", "texto"),
                    Map.entry(
                            "recibo",
                            ordenados(
                                    Map.entry("numero", "texto"),
                                    Map.entry("serie", "texto"),
                                    Map.entry("fechaDePago", "texto"),
                                    Map.entry("cajero", "texto"),
                                    Map.entry("formaDePago", "texto"))),
                    Map.entry(
                            "pagador",
                            ordenados(
                                    Map.entry("documento", "texto"),
                                    Map.entry("nombre", "texto"),
                                    Map.entry("idExterno", "entero"))),
                    Map.entry(
                            "ordenes",
                            List.of(
                                    ordenados(
                                            Map.entry("ordenId", "entero"),
                                            Map.entry("referenciaExterna", "texto"),
                                            Map.entry("importe", "texto"),
                                            Map.entry("actualizadoA", "texto")))),
                    // Los dos que SOLO lleva PAGO_ANULADO, y que hoy el receptor no declara.
                    Map.entry("motivo", "texto"),
                    Map.entry("fecha", "texto"));

    @Override
    protected ContratoDelConsumidor contrato() {
        Map<String, ContratoDelConsumidor.OperacionEsperada> operaciones = new LinkedHashMap<>();
        operaciones.put(
                "POST /pagos", ContratoDelConsumidor.OperacionEsperada.escritura(CUERPO_DEL_PAGO));
        return new ContratoDelConsumidor("caja", "rentas", "/rentas/api/v1", operaciones);
    }

    @SafeVarargs
    static Map<String, Object> ordenados(Map.Entry<String, Object>... campos) {
        Map<String, Object> mapa = new LinkedHashMap<>();
        for (Map.Entry<String, Object> campo : campos) {
            mapa.put(campo.getKey(), campo.getValue());
        }
        // `unmodifiableMap` sobre un `LinkedHashMap`, no `Map.copyOf`: este mapa se
        // serializa al archivo comprometido, y el orden de iteracion de `Map.copyOf` no
        // esta especificado.
        return Collections.unmodifiableMap(mapa);
    }
}
