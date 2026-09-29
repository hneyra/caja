package kamayuk.caja.nucleo.aplicacion;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import kamayuk.caja.nucleo.dominio.BuzonDelSistemaDeOrigen;
import kamayuk.caja.nucleo.dominio.EventoDePago;
import kamayuk.caja.nucleo.dominio.ReintentosDeLaEntrega;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * El publicador del buzon de salida (ADR-0026 §3).
 *
 * <h2>Una transaccion por evento, y a proposito</h2>
 *
 * <p>No hay una transaccion que envuelva la corrida entera. Envolverla es el defecto que #328, #54
 * y #430 midieron tres veces: la fila que se rechaza marca la transaccion como <i>rollback-only</i>
 * y se lleva por delante <b>el informe y las que ya iban bien</b> — y aqui «las que ya iban bien»
 * son pagos entregados que volverian a entregarse.
 *
 * <p><b>Y hasta #109 la habia, aunque este javadoc dijera lo contrario.</b> Cada evento se marcaba
 * en un {@code entregarUno} anotado {@code REQUIRES_NEW}, pero llamado desde esta misma clase: en
 * modo proxy la autoinvocacion no pasa por el interceptor, y la vuelta entera corria en la
 * transaccion del recorrido por municipalidades, con el {@code FOR UPDATE} de los cincuenta tomado
 * durante todos los {@code POST}. Una excepcion inesperada en el evento 2 devolvia el 1 a PENDIENTE
 * —para entregarlo otra vez— y dejaba el 2 sin gastar intento, primero en la cola para siempre.
 *
 * <p>Hoy cada lectura y cada marca las hace {@link AnotarLaEntrega}, <b>otro bean</b>, en su propia
 * transaccion, y la llamada al origen ocurre <b>entre</b> ellas, sin ninguna abierta que retenga un
 * candado. Lo mide {@code CadaEventoEnSuTransaccionTest}, con un contexto de Spring de verdad, y
 * mirando desde otra conexion mientras el evento 2 esta en la red.
 *
 * <h2>Que pasa cuando algo falla</h2>
 *
 * <table>
 *   <tr><th>Que paso</th><th>Que se hace</th><th>Por que</th></tr>
 *   <tr><td>El origen no contesta, o contesta que ahora no (408, 429, 5xx), o la ruta o la
 *       credencial no valen (401, 403, 404, 405…)</td>
 *       <td>se cuenta el intento y se aplaza: el siguiente, no antes de lo que el pago lleva
 *           fallando, con tope ({@link ReintentosDeLaEntrega})</td>
 *       <td>Se arregla levantando un despliegue o corrigiendo la configuracion, y entonces el pago
 *           sale solo. La raya entre esto y un rechazo la pone {@code
 *           ClienteHttpDelSistemaDeOrigen.veredictoDe} (#131)</td></tr>
 *   <tr><td>El origen rechaza el pago</td><td>se mata en el acto</td>
 *       <td>El cuerpo esta congelado: reintentarlo da la misma respuesta hasta agotar el plazo, y
 *           avisa un dia tarde por un motivo que ya se sabia</td></tr>
 *   <tr><td>Cualquier otra excepcion al entregar</td><td>se cuenta el intento, como si no
 *       contestara</td>
 *       <td>Si no gastara intento no llegaria nunca a MUERTO ni avisaria, y como va primero en
 *           la cola, atascaria el buzon de su municipalidad (#109)</td></tr>
 *   <tr><td>Se agoto el plazo</td><td>MUERTO, y alerta a una persona con nombre</td>
 *       <td>Es dinero cobrado sin registrar. No se queda en un registro (ADR-0026 §4)</td></tr>
 * </table>
 *
 * <h2>El presupuesto es un tiempo, no un numero de vueltas (#131)</h2>
 *
 * <p>Hasta #131 eran ocho intentos, uno por vuelta, y una vuelta cada diez segundos: con el origen
 * caido un pago moria a los ~80 s, antes de que acabara el despliegue de dos minutos que {@code
 * application.yaml} decia cubrir. Ahora cada fallo que no mata deja escrito cuando se puede volver
 * a intentar ({@code pago_evento.no_antes_de}), {@link AnotarLaEntrega#pendientes} solo devuelve lo
 * que ya toca, y se muere cuando se agota {@code kamayuk.caja.entrega.plazo} desde el primer fallo
 * de la racha. Los numeros y su porque, en {@link ReintentosDeLaEntrega}.
 *
 * <p>Y MUERTO deja de ser para siempre: si la causa se arregla, una persona lo vuelve a poner en
 * camino con {@link ReintentarPagoMuerto}, con su observacion y con el mismo {@code pagoId}.
 *
 * <p>Lo que <b>no</b> se atrapa es un fallo al <i>anotar</i>: si la base no deja marcar, no hay
 * donde contar el intento. Esa excepcion corta la vuelta de esa municipalidad —el recorrido la
 * anota en sus fallidas y sigue con las demas—, lo ya anotado queda anotado, y el evento sigue
 * PENDIENTE para la vuelta siguiente; si el origen ya lo tenia, lo recibe otra vez con el mismo
 * {@code pagoId} y lo deduplica.
 */
@Service
public class EntregarEventos {

    /**
     * Cuantos se entregan por vuelta. Un lote y no la tabla entera: una vuelta tiene que acabar.
     */
    private static final int POR_VUELTA = 50;

    private static final Logger REGISTRO = LoggerFactory.getLogger(EntregarEventos.class);

    private final AnotarLaEntrega anotar;
    private final BuzonDelSistemaDeOrigen destino;
    private final AlertaDeCobrosSinImputar alerta;
    private final ReintentosDeLaEntrega reintentos;
    private final Clock reloj;

    /**
     * @param reintentos cuando se vuelve a intentar y cuando se deja de intentar. Lo arma {@code
     *     ConfiguracionDeLaEntrega} con {@code kamayuk.caja.entrega.espera-maxima} y {@code .plazo}
     * @param reloj el del contexto, con la zona del producto (#112). Solo se lee su instante
     */
    public EntregarEventos(
            AnotarLaEntrega anotar,
            BuzonDelSistemaDeOrigen destino,
            AlertaDeCobrosSinImputar alerta,
            ReintentosDeLaEntrega reintentos,
            Clock reloj) {
        this.anotar = anotar;
        this.destino = destino;
        this.alerta = alerta;
        this.reintentos = Objects.requireNonNull(reintentos, "La entrega sabe cuando reintentar");
        this.reloj = Objects.requireNonNull(reloj, "La entrega mide el plazo con un reloj");
    }

    /**
     * Entrega lo que haya pendiente.
     *
     * <p>No lleva {@code @Transactional}, y no debe: la transaccion de cada evento la abre {@link
     * AnotarLaEntrega}. Si este metodo abriera una, las de dentro seguirian siendo nuevas —{@code
     * REQUIRES_NEW}—, pero la de fuera quedaria abierta durante todas las llamadas al origen.
     *
     * @return cuantos se entregaron y cuantos murieron en esta vuelta
     */
    public Vuelta entregarPendientes() {
        List<EventoDePago> pendientes = anotar.pendientes(reloj.instant(), POR_VUELTA);
        int entregados = 0;
        int muertos = 0;
        for (EventoDePago evento : pendientes) {
            Resultado resultado = entregarUno(evento);
            if (resultado == Resultado.ENTREGADO) {
                entregados++;
            } else if (resultado == Resultado.MUERTO) {
                muertos++;
            }
        }
        if (muertos > 0) {
            alerta.hayCobrosSinImputar(anotar.muertos());
        }
        return new Vuelta(pendientes.size(), entregados, muertos);
    }

    /**
     * Un evento: se entrega fuera de toda transaccion y se anota en una propia.
     *
     * <p>No lleva {@code @Transactional}: hasta #109 lo llevaba, y como se llama desde {@link
     * #entregarPendientes} —la misma clase— nunca se aplico. La marca la hace {@link
     * AnotarLaEntrega}, que es otro bean y por eso si pasa por el proxy.
     */
    // `IllegalCatch` prohibe atrapar RuntimeException porque casi siempre esconde un defecto.
    // Aqui lo contrario seria el defecto (#109): una excepcion que no sea NoContesta ni Rechazado
    // —un `IllegalArgumentException` de `URI.create`, un fallo de serializacion— saldria sin
    // contar intento, y el evento, primero en la cola, se reintentaria en cada vuelta sin morir
    // ni avisar. No se traga: cuenta como intento fallido, se registra con su traza, y agotados
    // los intentos el evento muere y la alerta salta como con cualquier otro.
    @SuppressWarnings("checkstyle:IllegalCatch")
    public Resultado entregarUno(EventoDePago evento) {
        Objects.requireNonNull(evento, "No se entrega un evento nulo");
        try {
            destino.entregar(evento);
        } catch (BuzonDelSistemaDeOrigen.Rechazado rechazado) {
            // No se reintenta: el cuerpo esta congelado y la respuesta no va a cambiar sola.
            anotar.muerto(evento, recortar(rechazado.getMessage()), reloj.instant());
            return Resultado.MUERTO;
        } catch (BuzonDelSistemaDeOrigen.NoContesta noContesta) {
            return fallar(evento, noContesta.getMessage());
        } catch (RuntimeException inesperada) {
            // En la fila va el TIPO y no el mensaje, como en `RecorridoPorMunicipalidades`: la
            // columna la lee quien explica el pago, y el mensaje de una excepcion cualquiera
            // puede llevar una direccion, una tabla o una restriccion. La traza va al registro.
            REGISTRO.warn(
                    "El evento {} no se pudo entregar por un fallo inesperado; cuenta como intento",
                    evento.idGuardado(),
                    inesperada);
            return fallar(
                    evento,
                    "Fallo inesperado al entregar: " + inesperada.getClass().getSimpleName());
        }
        anotar.entregado(evento);
        return Resultado.ENTREGADO;
    }

    /**
     * Un fallo que no es un rechazo: se aplaza, o muere si ya se agoto el plazo (#131).
     *
     * <p>El instante se lee una vez y sirve para las dos cosas —decidir y anotar—: leido dos veces,
     * la fila podria decir que empezo a fallar despues de lo que se uso para decidir.
     */
    private Resultado fallar(EventoDePago evento, @Nullable String motivo) {
        Instant ahora = reloj.instant();
        Optional<Instant> siguiente = reintentos.siguienteIntento(evento.fallandoDesde(), ahora);
        if (siguiente.isEmpty()) {
            anotar.muerto(evento, recortar(motivo), ahora);
            return Resultado.MUERTO;
        }
        anotar.aplazado(evento, recortar(motivo), ahora, siguiente.get());
        return Resultado.REINTENTABLE;
    }

    /** El largo de {@code pago_evento.ultimo_error}. */
    private static String recortar(@Nullable String mensaje) {
        String limpio = mensaje == null ? "sin mensaje" : mensaje;
        return limpio.length() <= 400 ? limpio : limpio.substring(0, 400);
    }

    /** Que paso con un evento. */
    public enum Resultado {
        ENTREGADO,
        REINTENTABLE,
        MUERTO
    }

    /** Lo que hizo una vuelta del publicador. */
    public record Vuelta(int leidos, int entregados, int muertos) {}
}
