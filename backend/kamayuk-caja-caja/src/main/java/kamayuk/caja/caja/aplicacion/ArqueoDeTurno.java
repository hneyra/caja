package kamayuk.caja.caja.aplicacion;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import kamayuk.caja.caja.dominio.ArqueoDelTurno;
import kamayuk.caja.caja.dominio.BuzonDeSalida;
import kamayuk.caja.caja.dominio.CierreDeTurnoRepository;
import kamayuk.caja.caja.dominio.EventoDePago;
import kamayuk.caja.caja.dominio.FormaDePago;
import kamayuk.caja.caja.dominio.ReciboDelTurno;
import kamayuk.caja.dominio.Dinero;
import org.springframework.stereotype.Service;

/**
 * Arma el arqueo de un turno y comprueba que <b>se puede cerrar</b> (#36, RF-087; ADR-0026 §4).
 *
 * <p>Lo usan los dos lados de la misma pregunta: el {@link CerrarTurno cierre}, que lo congela, y
 * el {@link ConsultaDeRecaudacion avance en vivo}, que lo mira sin escribir nada. Que sea el mismo
 * codigo no es ahorro: es lo que impide que la cifra que el cajero ve antes de cerrar sea distinta
 * de la que el acta acaba diciendo.
 *
 * <h2>Contra que se cuadra, ahora que el libro no esta (P5D)</h2>
 *
 * <p>Hasta P5D esta clase preguntaba al libro de cuenta corriente —{@code ConciliacionDeCaja},
 * {@code AbonadoEnElLibro}— si lo recaudado en deuda tributaria coincidia con lo asentado. Con la
 * separacion ese libro vive en otra base y la pregunta <b>no se puede hacer aqui</b>: hacerla
 * sincronamente dejaria el cierre dependiendo de que el sistema de origen conteste, que es lo que
 * ADR-0026 evita en el camino del dinero.
 *
 * <p>Lo que la sustituye no es «nada»: es el <b>buzon de salida</b>. El turno no cierra hasta que
 * cada uno de sus pagos esta entregado o explicado uno por uno (ADR-0026 §4). Es una comprobacion
 * distinta y hay que decir en que se pierde y en que se gana:
 *
 * <ul>
 *   <li><b>Se pierde</b> que el cierre compruebe que el importe asentado coincide centimo a
 *       centimo. Eso pasa a la conciliacion del dia ({@link ConciliacionDelDia}), que si pregunta
 *       al origen y que <b>es la que puede fallar sin dejar la ventanilla parada</b>.
 *   <li><b>Se gana</b> que el cierre deje de poder pasar en verde con un pago perdido: en el
 *       monolito, un abono que nunca se escribio salia como descuadre de importe; aqui un pago que
 *       no se entrego <b>tiene nombre y fila</b>, y el cierre dice cual es.
 * </ul>
 *
 * <h2>Sin transaccion propia, a proposito</h2>
 *
 * <p>No lleva {@code @Transactional}: la abre quien llama. El cierre necesita que el arqueo se lea
 * dentro de su transaccion —si el arqueo abriera la suya, entre leer y escribir cabria otra
 * cobranza y el acta congelaria una cifra que ya no es— y el avance necesita la suya de solo
 * lectura. Ninguna de las dos se puede decidir aqui.
 */
@Service
public class ArqueoDeTurno {

    private final CierreDeTurnoRepository cierres;
    private final BuzonDeSalida buzon;

    public ArqueoDeTurno(CierreDeTurnoRepository cierres, BuzonDeSalida buzon) {
        this.cierres = cierres;
        this.buzon = buzon;
    }

    /**
     * El arqueo del turno a esa fecha, con lo que el cajero declaro.
     *
     * @param turnoId el turno
     * @param declarado lo contado en el cajon por medio de pago; vacio en el avance en vivo, donde
     *     todavia no hay nada declarado
     * @param aLaFecha la fecha con la que se responde (regla 9); entra, no se lee del reloj
     */
    public ArqueoDelTurno del(
            long turnoId, Map<FormaDePago, Dinero> declarado, LocalDate aLaFecha) {
        Objects.requireNonNull(declarado, "El mapa es vacio, no nulo");
        Objects.requireNonNull(aLaFecha, "Toda cifra indica su fecha (RNF-075, regla 9)");
        return ArqueoDelTurno.de(turnoId, cierres.recibosDelTurno(turnoId), declarado, aLaFecha);
    }

    /**
     * Comprueba que el turno se puede cerrar.
     *
     * <p><b>Es bloqueante y es una de las cinco piezas que ADR-0026 §4 exige antes de encender esto
     * en produccion.</b> Un turno que cerrara con un pago sin entregar dejaria el acta firmada, el
     * cajon cuadrado y la deuda del administrado viva — y nadie lo descubriria hasta que reclamara.
     *
     * @throws HayPagosSinEntregar si queda alguno pendiente o muerto, <b>nombrandolos uno a uno</b>
     */
    public Cuadre cuadrar(long turnoId, LocalDate aLaFecha) {
        List<ReciboDelTurno> recibos = cierres.recibosDelTurno(turnoId);

        Dinero conEvento = Dinero.CERO;
        Dinero sinEvento = Dinero.CERO;
        for (ReciboDelTurno recibo : recibos) {
            // El NETO del recibo: cero si se anulo. Un recibo de caja de TASAS no produce
            // evento —el concepto es de la propia caja, no hay a quien avisarle— y por eso
            // cuadra solo contra el recibo. Meterlo en la comprobacion de entrega haria que
            // todo turno que cobrara una tasa no pudiera cerrar nunca.
            if (recibo.abonaEnElLibro()) {
                conEvento = conEvento.mas(recibo.neto());
            } else {
                sinEvento = sinEvento.mas(recibo.neto());
            }
        }

        List<EventoDePago> sinResolver = buzon.loQueImpideCerrar(turnoId);
        if (!sinResolver.isEmpty()) {
            throw new HayPagosSinEntregar(turnoId, sinResolver);
        }
        return new Cuadre(conEvento, sinEvento, aLaFecha);
    }

    /**
     * Lo que el turno recaudo, partido en las dos mitades que se comprueban distinto.
     *
     * @param conEvento lo que se cobro contra una orden, y que produjo un evento que hay que
     *     entregar al sistema que la emitio
     * @param sinEvento lo que se cobro de conceptos de la propia caja —las tasas del TUPA—, que no
     *     avisa a nadie porque no hay nadie a quien avisar
     * @param aLaFecha la fecha a la que se comprobo (regla 9, RNF-075)
     */
    public record Cuadre(Dinero conEvento, Dinero sinEvento, LocalDate aLaFecha) {

        public Cuadre {
            Objects.requireNonNull(conEvento, "El cuadre trae las dos mitades");
            Objects.requireNonNull(sinEvento, "El cuadre trae las dos mitades");
            Objects.requireNonNull(aLaFecha, "Toda cifra indica su fecha (RNF-075, regla 9)");
        }

        /** Las dos mitades: tiene que ser el neto del arqueo. */
        public Dinero total() {
            return conEvento.mas(sinEvento);
        }
    }

    /**
     * El turno tiene pagos que el sistema de origen todavia no sabe que existen.
     *
     * <p>Es un {@link IllegalStateException} y no un error de validacion: la peticion esta bien, lo
     * que esta mal es el estado del sistema. Y <b>nombra los eventos uno a uno</b> —no dice «hay
     * tres pendientes»— porque quien no puede cerrar tiene que poder ir a mirar cuales, y un «no se
     * puede» a secas manda a buscar a ciegas.
     */
    public static final class HayPagosSinEntregar extends IllegalStateException {

        @java.io.Serial private static final long serialVersionUID = 1L;

        private final transient List<EventoDePago> sinResolver;

        HayPagosSinEntregar(long turnoId, List<EventoDePago> sinResolver) {
            super(mensaje(turnoId, sinResolver));
            this.sinResolver = List.copyOf(sinResolver);
        }

        public List<EventoDePago> sinResolver() {
            return sinResolver;
        }

        private static String mensaje(long turnoId, List<EventoDePago> sinResolver) {
            List<String> lineas = new ArrayList<>(sinResolver.size());
            for (EventoDePago evento : sinResolver) {
                lineas.add(
                        evento.eventoId()
                                + " ("
                                + evento.estado()
                                + ", recibo "
                                + evento.reciboId()
                                + ", "
                                + evento.intentos()
                                + " intento(s)"
                                + (evento.ultimoError() == null
                                        ? ""
                                        : ", ultimo error: " + evento.ultimoError())
                                + ")");
            }
            return "El turno "
                    + turnoId
                    + " no se puede cerrar: quedan "
                    + sinResolver.size()
                    + " pago(s) que «"
                    + sinResolver.get(0).sistemaDestino()
                    + "» todavia no sabe que existen. Un turno cerrado con uno de estos deja el"
                    + " acta firmada, el cajon cuadrado y la deuda del administrado viva. Se"
                    + " resuelven entregandolos —esperar a que el publicador lo consiga— o"
                    + " explicando cada uno por escrito: "
                    + String.join("; ", lineas);
        }
    }
}
