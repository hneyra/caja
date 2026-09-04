package kamayuk.caja.caja.aplicacion;

import java.time.Clock;
import java.time.LocalDate;
import java.util.Objects;
import kamayuk.caja.auditoria.Auditoria;
import kamayuk.caja.auditoria.Operacion;
import kamayuk.caja.auditoria.RegistroDeAuditoria;
import kamayuk.caja.caja.dominio.OrdenDeCobro;
import kamayuk.caja.caja.dominio.OrdenDeCobroRepository;
import kamayuk.caja.caja.dominio.Pagador;
import kamayuk.caja.caja.dominio.SistemaDeOrigen;
import kamayuk.caja.dominio.Dinero;
import kamayuk.caja.dominio.Observacion;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Da de alta una orden de cobro (ADR-0026 §1).
 *
 * <h2>Es idempotente, y lo sostiene la base</h2>
 *
 * <p>La clave es {@code (sistemaOrigen, referenciaExterna)} y la garantiza {@code
 * orden_referencia_uq}, no una comprobacion previa. Reintentar el alta —porque el sistema de origen
 * no recibio la respuesta, o porque su propio reintento se solapo con el primero— devuelve la orden
 * que ya estaba, con {@code nueva = false}.
 *
 * <p><b>Que la garantia sea del motor y no de un {@code if} es lo que #188 dejo escrito</b>: una
 * comprobacion en Java se cuela por la carrera, y aqui colarse significa que el mismo administrado
 * aparece con dos ordenes por la misma deuda y en ventanilla se le cobra dos veces.
 *
 * <h2>Lo que este caso de uso NO comprueba</h2>
 *
 * <p><b>No comprueba que el pagador exista.</b> No hay contra que comprobarlo: el padron de
 * contribuyentes es de {@code rentas} y esta base no lo tiene (ADR-0026 §1, GOB-05 §6.8). Y aunque
 * lo tuviera no deberia: el dia que se cobre un puesto de mercado, quien paga puede no estar en
 * ningun padron. La caja guarda lo que le digan.
 *
 * <p><b>No comprueba el importe contra nada.</b> Cuanto se debe lo dice el sistema que emitio la
 * orden; si la caja lo recalculara, el sistema tendria dos verdades sobre lo que se debe — que es
 * lo que ARQ-01 §3.8 lleva prohibiendo desde el monolito, dicho ahora al otro lado de una frontera.
 */
@Service
public class RegistrarOrdenDeCobro {

    private final OrdenDeCobroRepository ordenes;
    private final Auditoria auditoria;
    private final Clock reloj;

    public RegistrarOrdenDeCobro(OrdenDeCobroRepository ordenes, Auditoria auditoria, Clock reloj) {
        this.ordenes = ordenes;
        this.auditoria = auditoria;
        this.reloj = reloj;
    }

    /**
     * @param peticion lo que el sistema de origen manda
     * @param observacion por que se da de alta (regla 10, RNF-052)
     */
    @Transactional
    public OrdenDeCobroRepository.Alta registrar(Peticion peticion, Observacion observacion) {
        Objects.requireNonNull(peticion, "No se da de alta una orden sin peticion");
        Objects.requireNonNull(observacion, "Sin observacion no se guarda (regla 10, RNF-052)");

        OrdenDeCobro orden =
                OrdenDeCobro.nueva(
                        peticion.sistemaOrigen(),
                        peticion.referenciaExterna(),
                        peticion.concepto(),
                        peticion.detalle(),
                        peticion.importe(),
                        peticion.fechaExigibilidad(),
                        peticion.actualizadoA(),
                        peticion.pagador(),
                        reloj.instant(),
                        observacion);

        OrdenDeCobroRepository.Alta alta = ordenes.registrar(orden);
        if (alta.nueva()) {
            auditoria.registrar(
                    RegistroDeAuditoria.enLaFechaDe(
                                    LocalDate.now(reloj),
                                    "orden_de_cobro",
                                    String.valueOf(alta.orden().idGuardado()),
                                    Operacion.ALTA,
                                    observacion)
                            .con(null, descripcion(alta.orden())));
        }
        return alta;
    }

    /** Sin datos personales: esto acaba en la columna JSON de la auditoria. */
    private static String descripcion(OrdenDeCobro orden) {
        return "{\"sistemaOrigen\":\""
                + orden.sistemaOrigen()
                + "\",\"referenciaExterna\":\""
                + orden.referenciaExterna()
                + "\",\"importe\":\""
                + orden.importe().valor().toPlainString()
                + "\",\"actualizadoA\":\""
                + orden.actualizadoA()
                + "\"}";
    }

    /**
     * Lo que el sistema de origen manda.
     *
     * <p>Un tipo y no nueve argumentos: cuatro de ellos son cadenas y dos son fechas, y esta es la
     * frontera donde mas facil es intercambiar dos parametros del mismo tipo sin que el compilador
     * diga nada.
     */
    public record Peticion(
            SistemaDeOrigen sistemaOrigen,
            String referenciaExterna,
            String concepto,
            @Nullable String detalle,
            Dinero importe,
            LocalDate fechaExigibilidad,
            LocalDate actualizadoA,
            Pagador pagador) {

        public Peticion {
            Objects.requireNonNull(sistemaOrigen, "Una orden dice de que sistema viene");
            Objects.requireNonNull(referenciaExterna, "Una orden dice como la llaman alli");
            Objects.requireNonNull(concepto, "Una orden dice que se imprime");
            Objects.requireNonNull(importe, "Una orden dice cuanto");
            Objects.requireNonNull(fechaExigibilidad, "Una orden dice desde cuando se cobra");
            Objects.requireNonNull(actualizadoA, "Toda cifra indica su fecha (regla 9)");
            Objects.requireNonNull(pagador, "El pagador es anonimo, no nulo");
        }
    }
}
