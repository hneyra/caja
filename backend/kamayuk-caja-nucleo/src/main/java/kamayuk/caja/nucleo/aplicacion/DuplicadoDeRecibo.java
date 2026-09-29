package kamayuk.caja.nucleo.aplicacion;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import kamayuk.caja.auditoria.Auditoria;
import kamayuk.caja.auditoria.Operacion;
import kamayuk.caja.auditoria.RegistroDeAuditoria;
import kamayuk.caja.documentos.FormatoDeDocumento;
import kamayuk.caja.documentos.GeneradorDeDocumentos;
import kamayuk.caja.documentos.ModeloDeDocumento;
import kamayuk.caja.dominio.Observacion;
import kamayuk.caja.nucleo.dominio.MovimientoDeRecibo;
import kamayuk.caja.nucleo.dominio.MovimientoDeReciboRepository;
import kamayuk.caja.nucleo.dominio.NumeroDeRecibo;
import kamayuk.caja.nucleo.dominio.Recibo;
import kamayuk.caja.nucleo.dominio.ReciboRepository;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Reimprime un recibo ya emitido, marcado como duplicado (#34, RF-082).
 *
 * <h2>Identico al original, meses despues</h2>
 *
 * <p>No se recalcula nada: cada cifra sale del desglose que la cobranza congelo en {@code
 * recibo_detalle}, y la fecha del papel es {@link Recibo#actualizadoA}, la fecha a la que estaban
 * actualizados los importes cobrados —nunca el dia en que se pide la reimpresion (regla 9)—. Volver
 * a preguntarle al libro daria un papel distinto cada vez.
 *
 * <p>Y no se afirma: se <b>comprueba</b>. El primer duplicado guarda el SHA-256 de lo congelado; el
 * segundo lo vuelve a calcular y, si no coincide, <b>falla</b> en vez de entregar un papel distinto
 * al original con el mismo numero. Es la misma garantia que {@code EmitirDocumento} le da a un
 * valor (V15), aplicada aqui sobre {@code recibo_movimiento}.
 *
 * <h2>Los duplicados que ya salieron con la hora en UTC (#141)</h2>
 *
 * <p>#141 cambio como se escribe la hora de emision —de UTC a la de Lima, ver {@link
 * ModeloDelRecibo.Forma}— y con ella los bytes de todo recibo. Sin mas, cada recibo que ya tenia un
 * duplicado contestaria 409 al siguiente, porque su resumen guardado es el de la forma antigua.
 *
 * <p><b>El resumen ya dice con que forma salio.</b> Es el SHA-256 de los bytes, y las dos formas
 * nunca dan los mismos —una acaba la hora en «Z» y la otra en «-05:00»—, asi que a lo sumo una de
 * las dos reproduce el resumen guardado. {@link #formaDelPapel} prueba la vigente y, si no
 * coincide, la anterior; la que coincida es la que se imprime y la que se vuelve a guardar, y si no
 * coincide ninguna sigue siendo {@link LaReimpresionNoCoincide}, como antes.
 *
 * <p>Por eso no hay una columna {@code version} en {@code recibo_movimiento}. Repetiria lo que el
 * resumen ya dice, costaria una migracion y un campo mas en {@link MovimientoDeRecibo} y en su
 * repositorio, y no ahorraria la comprobacion: una columna que dice «v2» no demuestra que los bytes
 * salgan iguales, y el resumen habria que seguir comparandolo. Lo que cuesta no tenerla es dibujar
 * dos veces el PDF de un recibo antiguo al reimprimirlo, y nada mas.
 *
 * <p>Y la forma antigua <b>se imprime</b>, no solo se reconoce: el primer duplicado de ese recibo
 * ya circula con su «…Z», y el resumen existe para que con el mismo numero no circulen dos papeles
 * distintos. Un recibo sin duplicado previo sale en Lima desde el primero.
 *
 * <h2>Por que el recibo no pasa por {@code documento_emitido}</h2>
 *
 * <p>Porque su duplicado tiene que decir si el recibo esta <b>anulado</b>, y eso ocurre despues de
 * emitirlo. {@code documento_emitido} archiva un modelo y un disparador impide cambiarlo, asi que
 * un recibo archivado no podria anunciar su propia anulacion. Y porque el recibo ya tiene
 * numeracion correlativa propia ({@code recibo_correlativo}, V29): archivarlo daria un segundo
 * numero para el mismo papel.
 *
 * <h2>El duplicado deja rastro</h2>
 *
 * <p>Cada reimpresion agrega su fila —«queda registrado en la bitacora con el usuario que lo
 * genero», dice la pantalla— y de contarlas sale el {@code DUPLICADO N.° 3} que el papel lleva
 * impreso. Un recibo de caja reimpreso sin marca y sin rastro circula como si fuera el original.
 *
 * <p>Por eso {@link #imprimir} escribe, aunque el verbo de la ruta sea {@code GET}: el verbo lo
 * fija el prototipo, y el manual exige el registro. La <b>vista previa</b> —{@link #consultar}— es
 * la que no escribe: mira, no emite.
 */
@Service
public class DuplicadoDeRecibo {

    /** El formato con el que se calcula el resumen, sea cual sea el que se pida imprimir. */
    private static final FormatoDeDocumento FORMATO_DEL_RESUMEN = FormatoDeDocumento.PDF;

    private final ReciboRepository recibos;
    private final MovimientoDeReciboRepository movimientos;
    private final GeneradorDeDocumentos generador;
    private final Auditoria auditoria;
    private final Clock reloj;

    public DuplicadoDeRecibo(
            ReciboRepository recibos,
            MovimientoDeReciboRepository movimientos,
            GeneradorDeDocumentos generador,
            Auditoria auditoria,
            Clock reloj) {
        this.recibos = recibos;
        this.movimientos = movimientos;
        this.generador = generador;
        this.auditoria = auditoria;
        this.reloj = reloj;
    }

    /**
     * El recibo tal como quedo, sin emitir nada.
     *
     * <p>Es la «vista previa» de la pantalla. No escribe: mirar un recibo no es reimprimirlo, y
     * numerar un duplicado cada vez que alguien abre la pantalla llenaria la bitacora de
     * reimpresiones que nunca salieron por la impresora.
     */
    @Transactional(readOnly = true)
    public Optional<Consultado> consultar(NumeroDeRecibo numero) {
        return recibos.porNumero(numero)
                .map(
                        recibo -> {
                            long id = Objects.requireNonNull(recibo.id());
                            return new Consultado(
                                    recibo,
                                    movimientos.anulacionDe(id).orElse(null),
                                    movimientos.duplicadosDe(id));
                        });
    }

    /**
     * Dibuja el duplicado y lo registra.
     *
     * <p>La {@link Observacion} va en la firma: esto escribe, y la regla 10 no tiene una excepcion
     * para las escrituras pequenas. Quien pide el duplicado dice por que lo pide.
     *
     * @param formato en cual de los tres formatos se quiere el papel (RF-132)
     * @throws ReciboInexistente si no hay ningun recibo con ese numero en esta municipalidad
     * @throws LaReimpresionNoCoincide si dibujar lo congelado ya no da los mismos bytes
     */
    @Transactional
    public Duplicado imprimir(
            NumeroDeRecibo numero, FormatoDeDocumento formato, Observacion observacion) {
        Objects.requireNonNull(formato, "Hay que decir en que formato sale el duplicado");
        Objects.requireNonNull(observacion, "Sin observacion no se guarda (regla 10, RNF-052)");

        Recibo recibo = recibos.porNumero(numero).orElseThrow(() -> new ReciboInexistente(numero));
        long reciboId =
                Objects.requireNonNull(recibo.id(), "Un recibo leido trae su identificador");

        Dibujo dibujo = formaDelPapel(numero, recibo, reciboId);

        @Nullable MovimientoDeRecibo anulacion = movimientos.anulacionDe(reciboId).orElse(null);
        int cual = (int) movimientos.duplicadosDe(reciboId) + 1;

        ModeloDeDocumento impreso =
                ModeloDelRecibo.de(recibo, anulacion, dibujo.forma()).comoDuplicado(cual);
        byte[] documento = generador.generar(impreso, formato);

        MovimientoDeRecibo registrado =
                movimientos.registrar(
                        MovimientoDeRecibo.duplicado(
                                recibo, LocalDate.now(reloj), dibujo.resumen(), observacion));

        auditoria.registrar(
                RegistroDeAuditoria.enLaFechaDe(
                                LocalDate.now(reloj),
                                "recibo_movimiento",
                                String.valueOf(registrado.id()),
                                Operacion.ALTA,
                                observacion)
                        .con(null, descripcion(recibo, cual, formato)));

        return new Duplicado(recibo, anulacion, cual, formato, documento);
    }

    // ------------------------------------------------------------------

    /**
     * Con que forma se dibuja este recibo, comprobando que dibujar lo congelado sigue dando los
     * mismos bytes que la primera vez.
     *
     * <p>Es lo unico que convierte «la reimpresion sale identica al original» en una afirmacion
     * comprobable. Si alguien cambia el renderizador —una fuente, un margen— o hace que el modelo
     * lea algo que no esta congelado, esto salta en el segundo duplicado en vez de entregar en
     * silencio un papel distinto al original con el mismo numero.
     *
     * <p>Se compara con el <b>primer</b> duplicado y no con el ultimo: si algo se movio entre el
     * primero y el segundo, el que hay que reproducir es el primero. Su resumen es tambien el que
     * elige la forma (#141): la primera de {@link ModeloDelRecibo.Forma} que lo reproduce. Sin
     * duplicado previo no hay nada que reproducir, y sale la vigente.
     *
     * <p>El resumen se calcula sobre LO CONGELADO —sin la anulacion ni la marca de duplicado, que
     * cambian despues—, para que cubra exactamente lo que tiene que salir identico: todas las
     * cifras y todo el desglose.
     */
    private Dibujo formaDelPapel(NumeroDeRecibo numero, Recibo recibo, long reciboId) {
        List<String> anteriores = new ArrayList<>();
        for (MovimientoDeRecibo movimiento : movimientos.deRecibo(reciboId)) {
            String antes = movimiento.resumen();
            if (antes != null) {
                anteriores.add(antes);
            }
        }

        String vigente = resumenDe(recibo, ModeloDelRecibo.Forma.VIGENTE);
        if (anteriores.isEmpty()) {
            return new Dibujo(ModeloDelRecibo.Forma.VIGENTE, vigente);
        }

        String primero = anteriores.getFirst();
        for (ModeloDelRecibo.Forma forma : ModeloDelRecibo.Forma.values()) {
            String resumen =
                    forma == ModeloDelRecibo.Forma.VIGENTE ? vigente : resumenDe(recibo, forma);
            if (resumen.equals(primero)) {
                for (String antes : anteriores) {
                    if (!antes.equals(resumen)) {
                        throw new LaReimpresionNoCoincide(numero, antes, resumen);
                    }
                }
                return new Dibujo(forma, resumen);
            }
        }
        throw new LaReimpresionNoCoincide(numero, primero, vigente);
    }

    private String resumenDe(Recibo recibo, ModeloDelRecibo.Forma forma) {
        return generador.resumenDe(ModeloDelRecibo.de(recibo, null, forma), FORMATO_DEL_RESUMEN);
    }

    /** La forma con que sale el papel y el resumen que se guarda de ella. */
    private record Dibujo(ModeloDelRecibo.Forma forma, String resumen) {}

    /** Sin datos personales: esto acaba en la columna JSON de la auditoria. */
    private static String descripcion(Recibo recibo, int cual, FormatoDeDocumento formato) {
        return "{\"numero\":\""
                + recibo.numero().impreso()
                + "\",\"duplicado\":"
                + cual
                + ",\"formato\":\""
                + formato
                + "\",\"actualizadoA\":\""
                + recibo.actualizadoA()
                + "\"}";
    }

    /**
     * Un recibo y su estado, sin emitir nada.
     *
     * @param anulacion la anulacion, si la hubo; es de donde sale el estado efectivo
     * @param duplicados cuantas veces se ha reimpreso ya
     */
    public record Consultado(
            Recibo recibo, @Nullable MovimientoDeRecibo anulacion, long duplicados) {

        public boolean estaAnulado() {
            return anulacion != null;
        }
    }

    /**
     * El duplicado dibujado.
     *
     * @param cual que numero de duplicado es; el primero es 1
     * @param contenido los bytes del documento
     */
    public record Duplicado(
            Recibo recibo,
            @Nullable MovimientoDeRecibo anulacion,
            int cual,
            FormatoDeDocumento formato,
            byte[] contenido) {

        public boolean estaAnulado() {
            return anulacion != null;
        }

        public String nombreDeArchivo() {
            return formato.nombreDeArchivo("recibo-" + recibo.numero().impreso());
        }
    }

    /** No hay ningun recibo con ese numero en esta municipalidad. */
    public static final class ReciboInexistente extends RuntimeException {

        @java.io.Serial private static final long serialVersionUID = 1L;

        ReciboInexistente(NumeroDeRecibo numero) {
            super("No hay ningun recibo " + numero.impreso() + " en esta municipalidad");
        }
    }

    /** Dibujar lo congelado ya no da los mismos bytes que la primera reimpresion. */
    public static final class LaReimpresionNoCoincide extends IllegalStateException {

        @java.io.Serial private static final long serialVersionUID = 1L;

        LaReimpresionNoCoincide(NumeroDeRecibo numero, String antes, String ahora) {
            super(
                    "El recibo "
                            + numero.impreso()
                            + " ya no se dibuja igual que en su primer duplicado: el resumen era "
                            + antes.substring(0, 12)
                            + "… y ahora es "
                            + ahora.substring(0, 12)
                            + "…. Entregar esto seria dar un papel distinto al original con el"
                            + " mismo numero");
        }
    }
}
