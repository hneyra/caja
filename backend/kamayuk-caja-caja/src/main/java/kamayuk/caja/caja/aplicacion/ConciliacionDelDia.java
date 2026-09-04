package kamayuk.caja.caja.aplicacion;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import kamayuk.caja.caja.dominio.AbonosAplicadosEnElOrigen;
import kamayuk.caja.caja.dominio.BuzonDeSalida;
import kamayuk.caja.caja.dominio.BuzonDelSistemaDeOrigen;
import kamayuk.caja.caja.dominio.SistemaDeOrigen;
import kamayuk.caja.dominio.Dinero;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * La conciliacion del dia (ADR-0026 §3).
 *
 * <h2>Por que existe, y por que no es un proceso silencioso</h2>
 *
 * <p>Con la caja y el libro en dos bases no hay forma de que un cobro sea atomico entre las dos. Lo
 * que sustituye a la atomicidad es <b>esto</b>: cada dia se compara lo que la caja cobro con lo que
 * el sistema de origen aplico, y si no coinciden <b>el dia no cierra</b>. ADR-0026 lo dice con
 * todas las letras: la conciliacion deja de ser buena practica y pasa a ser obligacion operativa,
 * con su pantalla, su responsable y su hora.
 *
 * <h2>No abre transaccion propia sobre el sistema ajeno, y falla en voz alta</h2>
 *
 * <p>Preguntar al origen es una llamada de red que puede no contestar. Cuando no contesta, <b>esta
 * lectura falla</b> y no devuelve ceros: un cero se leeria como «no aplicaron nada», que es
 * indistinguible de un dia en que de verdad no se cobro — y la conciliacion diria que cuadra. Es el
 * criterio de #48 con la licencia que salia con «valor de obra 0,00», aplicado a la unica cifra que
 * dice si falta dinero.
 *
 * <h2>Lo que la caja puede decir sola, lo dice sola</h2>
 *
 * <p>Los eventos pendientes, muertos y explicados salen del buzon y no dependen de nadie. Asi que
 * un origen caido deja la conciliacion incompleta, no ciega: se sigue sabiendo cuantos pagos estan
 * en transito y cuantos murieron.
 */
@Service
public class ConciliacionDelDia {

    private final BuzonDeSalida buzon;
    private final AbonosAplicadosEnElOrigen origen;

    public ConciliacionDelDia(BuzonDeSalida buzon, AbonosAplicadosEnElOrigen origen) {
        this.buzon = buzon;
        this.origen = origen;
    }

    /**
     * @param dia el dia de caja que se concilia; entra como argumento (regla 6)
     */
    @Transactional(readOnly = true)
    public Conciliacion de(LocalDate dia) {
        Objects.requireNonNull(dia, "La conciliacion es de un dia concreto (regla 6)");
        List<Linea> lineas = new ArrayList<>();
        for (BuzonDeSalida.RecuentoDelDia recuento : buzon.recuentoDe(dia)) {
            lineas.add(lineaDe(recuento));
        }
        return new Conciliacion(dia, List.copyOf(lineas));
    }

    private Linea lineaDe(BuzonDeSalida.RecuentoDelDia recuento) {
        try {
            AbonosAplicadosEnElOrigen.Aplicado aplicado =
                    origen.delDia(recuento.sistema(), diaDe(recuento));
            return new Linea(recuento, aplicado, null);
        } catch (BuzonDelSistemaDeOrigen.NoContesta noContesta) {
            // No se traga: la linea sale SIN cifra del origen y CON su motivo. Poner ceros
            // aqui haria que un origen caido se leyera como un dia que cuadra en cero.
            return new Linea(recuento, null, noContesta.getMessage());
        }
    }

    /**
     * El dia del recuento.
     *
     * <p>Va aparte para que se vea que la fecha con la que se pregunta al origen es EXACTAMENTE la
     * que se conto en la caja. Preguntar por otra —«ayer», «hoy»— es como se producen las
     * conciliaciones que cuadran comparando dos dias distintos.
     */
    private static LocalDate diaDe(BuzonDeSalida.RecuentoDelDia recuento) {
        return recuento.diaDelRecuento();
    }

    /**
     * El resultado.
     *
     * @param dia el dia conciliado
     * @param lineas una por sistema de destino
     */
    public record Conciliacion(LocalDate dia, List<Linea> lineas) {

        public Conciliacion {
            Objects.requireNonNull(dia, "Toda cifra indica su fecha (regla 9, RNF-075)");
            lineas = List.copyOf(lineas);
        }

        /**
         * Si el dia cuadra: cero diferencias y nada sin resolver, en todos los sistemas.
         *
         * <p>Un dia sin ningun cobro cuadra, y tiene razon en cuadrar.
         */
        public boolean cuadra() {
            for (Linea linea : lineas) {
                if (!linea.cuadra()) {
                    return false;
                }
            }
            return true;
        }
    }

    /**
     * Una linea de la conciliacion.
     *
     * @param recuento lo que la caja sabe sola
     * @param aplicado lo que el origen dice; nulo si no contesto
     * @param porQueNoSeSabe el motivo de que no haya cifra del origen; nulo si la hay
     */
    public record Linea(
            BuzonDeSalida.RecuentoDelDia recuento,
            AbonosAplicadosEnElOrigen.@Nullable Aplicado aplicado,
            @Nullable String porQueNoSeSabe) {

        public Linea {
            Objects.requireNonNull(recuento, "La linea sale de un recuento");
            // Una de las dos, nunca las dos ni ninguna: «no hay cifra» es un hecho con motivo.
            if ((aplicado == null) == (porQueNoSeSabe == null)) {
                throw new IllegalArgumentException(
                        "O el origen contesto, o hay un motivo por el que no: las dos cosas a la"
                                + " vez, o ninguna, dejan la linea diciendo que cuadra sin poder"
                                + " saberlo");
            }
        }

        public SistemaDeOrigen sistema() {
            return recuento.sistema();
        }

        /** Lo que la caja cobro menos lo que el origen aplico. Nulo si el origen no contesto. */
        @Nullable
        public Dinero diferencia() {
            return aplicado == null ? null : recuento.neto().menos(aplicado.importeAplicado());
        }

        /**
         * Si esta linea cuadra.
         *
         * <p>Tres condiciones y no una, porque se arreglan de tres maneras distintas: que no quede
         * nada en transito ni muerto, que el origen haya contestado, y que la diferencia sea cero.
         * Un dia con la diferencia en cero y tres pagos en transito <b>no cuadra</b>: cuadra por
         * casualidad, porque todavia no se han aplicado.
         */
        public boolean cuadra() {
            if (recuento.pendientes() > 0 || recuento.muertos() > 0) {
                return false;
            }
            Dinero diferencia = diferencia();
            return diferencia != null
                    && diferencia.esCero()
                    && Objects.requireNonNull(aplicado).rechazados() == 0;
        }
    }
}
