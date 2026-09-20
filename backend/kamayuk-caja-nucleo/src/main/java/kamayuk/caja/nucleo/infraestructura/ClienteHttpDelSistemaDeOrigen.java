package kamayuk.caja.nucleo.infraestructura;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import java.util.Objects;
import kamayuk.caja.nucleo.dominio.BuzonDelSistemaDeOrigen;
import kamayuk.caja.nucleo.dominio.SistemaDeOrigen;
import kamayuk.caja.plataforma.RespuestaAjena;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * El unico camino de la caja hacia otro sistema (P5D, ADR-0026 §3 y ADR-0030).
 *
 * <h2>Se usa DESPUES del COMMIT, nunca dentro</h2>
 *
 * <p>Lo llaman el publicador del buzon y la conciliacion del dia. <b>No lo llama la cobranza</b>, y
 * eso es lo que hace cierto el criterio 2 del encargo: con el sistema de origen apagado, la
 * ventanilla sigue cobrando y emitiendo recibo, porque nadie le pregunto nada.
 *
 * <h2>A donde se llama, y por que es un mapa</h2>
 *
 * <p>La caja no sabe cuantos sistemas hay. La direccion de cada uno se configura por nombre —{@code
 * kamayuk.caja.origenes.rentas=http://...}— y el dia que aparezca {@code mercados} es una linea de
 * configuracion, no un despliegue. Si esto fuera una propiedad unica, la caja tendria un destino y
 * habriamos vuelto a un sistema que solo sabe hablar con `rentas`.
 *
 * <h2>Las dos negativas se distinguen, y no es un matiz</h2>
 *
 * <p>{@link BuzonDelSistemaDeOrigen.NoContesta} se reintenta y se arregla levantando un despliegue;
 * {@link BuzonDelSistemaDeOrigen.Rechazado} no se reintenta y se arregla mirando por que el
 * receptor no acepta ese pago. Confundirlas hace que un rechazo consuma los ocho intentos y acabe
 * MUERTO por un motivo que no es el suyo — y un evento muerto dispara una alerta a una persona, asi
 * que confundirlas cuesta el tiempo de alguien.
 *
 * <h2>El token, y por que un 401 NO es un rechazo (#21)</h2>
 *
 * <p>El publicador corre <b>sin usuario delante</b>: no hay peticion en curso de la que sacar un
 * {@code Authorization}. Desde #21 AC-2 <b>pide el suyo</b> con {@code client_credentials} y la
 * clave de su cliente confidencial —uno por sistema y municipalidad, ADR-0028 §2—, en vez de mandar
 * una cadena configurada que ningun emisor firmo. Quien lo pide y lo guarda es {@link
 * TokenDeServicioDeKeycloak}; este cliente solo sabe que hay una {@link CredencialDeServicio} y que
 * puede tardar, porque un token se renueva.
 *
 * <p><b>Y eso obliga a separar los 4xx en dos, que es el defecto que #21 cierra.</b> Hasta este
 * issue, {@code publicar} clasificaba <b>todo</b> 4xx como {@link
 * BuzonDelSistemaDeOrigen.Rechazado}, y {@code EntregarEventos} marca un rechazo MUERTO <b>sin
 * gastar ninguno de los ocho reintentos</b>. Con la credencial ausente o caducada, el destino
 * contesta <b>401</b>: cobrado, impreso, y el pago muerto al primer intento — el libro sin
 * enterarse y una alerta a una persona por un motivo que no es el suyo.
 *
 * <p>El criterio es el del propio puerto: {@code Rechazado} es «el motivo no va a cambiar solo». Un
 * 401 o un 403 <b>si</b> cambia solo —en cuanto la credencial se emite, se renueva o se le concede
 * el acceso—, y se arregla del lado del despliegue, que es literalmente la definicion de {@link
 * BuzonDelSistemaDeOrigen.NoContesta}. Un 422 no cambia solo: ese sigue siendo un rechazo, y
 * seguirlo reintentando gastaria los ocho intentos para acabar en el mismo sitio.
 *
 * <h2>El 401 y el 403 se CLASIFICAN igual y se DICEN distinto (#96)</h2>
 *
 * <p><b>Hasta #96 los dos compartian un mensaje que afirmaba la causa del 401</b> —«la que esta
 * caja manda no vale»—, y el cuerpo de la respuesta se tiraba. Con un 403 eso es falso: la
 * credencial <b>si</b> vale —el emisor la firmo y el destino la valido—, lo que falta es un permiso
 * sobre el recurso. Y se arreglan en sitios distintos: el 401 en Keycloak (el cliente confidencial
 * y su secreto), el 403 en {@code identidad} (la concesion sobre el acceso). Es la misma familia
 * que #95 y que <a href="https://github.com/hneyra/rentas/issues/66">`rentas`#66</a>: un mensaje
 * confiado que descarta la informacion que ya tiene en la mano.
 *
 * <p><b>Lo que cambia es el texto y nada mas</b>: 401 y 403 siguen siendo {@link
 * BuzonDelSistemaDeOrigen.NoContesta} —transitorios, se reintentan, el pago no se mata— y un 4xx de
 * negocio sigue siendo {@link BuzonDelSistemaDeOrigen.Rechazado}. Quien clasifica es {@link
 * #esDeCredencial}, que mira el codigo de estado y no el cuerpo, a proposito: el cuerpo lo escribe
 * el otro sistema y cambiar de redaccion no puede cambiar si un pago se reintenta.
 *
 * <h2>Y el mensaje cabe en la columna, porque no hay ningun otro sitio donde acabe</h2>
 *
 * <p>Estos mensajes no se registran en ningun log: {@code EntregarEventos} los guarda en {@code
 * pago_evento.ultimo_error} —{@code varchar(400)}, y alli los recorta a 400— y {@code
 * PublicadorDelBuzon} solo cuenta leidos, entregados y muertos. O sea que <b>los 400 caracteres de
 * esa columna son todo el presupuesto</b>, y de ahi sale el orden de este mensaje, que es el
 * contrario del de {@link ClienteHttpDelBuzonDeIdentidad}: alli el remedio va detras del cuerpo
 * literal porque el destino es un registro sin tope; aqui va <b>delante</b>, porque lo que se corta
 * es la cola y quien lee esto es un cajero que no puede cerrar su turno. El cuerpo viaja detras,
 * con lo que quepa, y el corte se ve ({@code …}) en vez de hacerse en silencio.
 */
@Component
public class ClienteHttpDelSistemaDeOrigen {

    private static final Duration ESPERA_DE_CONEXION = Duration.ofSeconds(5);
    private static final Duration ESPERA_DE_LECTURA = Duration.ofSeconds(30);

    /**
     * El ancho de {@code pago_evento.ultimo_error} ({@code V2__ordenes_de_cobro_y_outbox.sql}).
     *
     * <p>Es el mismo numero que {@code EntregarEventos.recortar} ya usaba para no desbordar la
     * columna, y sigue escrito dos veces a proposito: {@code EntregarEventos} esta en la capa
     * {@code aplicacion} y no puede importar de {@code infraestructura}. Aqui se declara porque
     * este es el sitio donde se decide QUE se pierde al recortar.
     */
    public static final int LARGO_DE_ULTIMO_ERROR = 400;

    private final HttpClient cliente;
    private final JsonMapper json;
    private final Map<String, String> origenes;
    private final CredencialDeServicio credencial;

    public ClienteHttpDelSistemaDeOrigen(
            JsonMapper json,
            @Value("#{${kamayuk.caja.origenes:{:}}}") Map<String, String> origenes,
            CredencialDeServicio credencial) {
        this.json = json;
        this.origenes = Map.copyOf(origenes);
        this.credencial = credencial;
        this.cliente = HttpClient.newBuilder().connectTimeout(ESPERA_DE_CONEXION).build();
    }

    /** La raiz configurada de ese sistema. */
    public String raizDe(SistemaDeOrigen sistema) {
        String raiz = origenes.get(sistema.nombre());
        if (raiz == null || raiz.isBlank()) {
            throw new BuzonDelSistemaDeOrigen.NoContesta(
                    "No hay direccion configurada para el sistema «"
                            + sistema
                            + "»: falta kamayuk.caja.origenes."
                            + sistema
                            + ". No es que no conteste, es que no se sabe a donde llamar — y por"
                            + " eso se reintenta: se arregla poniendo la linea, y entonces los"
                            + " pagos encolados salen solos");
        }
        return raiz.endsWith("/") ? raiz.substring(0, raiz.length() - 1) : raiz;
    }

    /** Manda un cuerpo JSON, y traduce lo que vuelva. */
    public void publicar(SistemaDeOrigen sistema, String ruta, String cuerpo) {
        HttpRequest.Builder peticion =
                HttpRequest.newBuilder(URI.create(raizDe(sistema) + ruta))
                        .timeout(ESPERA_DE_LECTURA)
                        .header("Content-Type", "application/json")
                        .header("Accept", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(cuerpo));
        String mandada = conCredencial(peticion);
        HttpResponse<String> respuesta = enviar(peticion, sistema, "publicar el pago");
        int estado = respuesta.statusCode();
        if (estado == 200 || estado == 201 || estado == 202 || estado == 409) {
            // El 409 es «ya lo tengo»: el receptor deduplico por pagoId. Es EXITO y no un fallo —
            // reintentar hasta que deje de decir 409 no acabaria nunca, y matar el evento por eso
            // dispararia una alerta por un pago que SI se registro.
            return;
        }
        if (esDeCredencial(estado)) {
            throw new BuzonDelSistemaDeOrigen.NoContesta(
                    laIdentidadDeServicio(
                            sistema, estado, mandada, respuesta.body(), "publicar el pago"));
        }
        if (estado >= 400 && estado < 500) {
            throw new BuzonDelSistemaDeOrigen.Rechazado(
                    cabe(
                            "«"
                                    + sistema
                                    + "» rechazo el pago con "
                                    + estado
                                    + ". Esto NO se reintenta: el motivo no va a cambiar solo."
                                    + " Contesto "
                                    + RespuestaAjena.de(json, respuesta.body()).comoTexto()));
        }
        throw new BuzonDelSistemaDeOrigen.NoContesta(
                "«" + sistema + "» contesto " + estado + " al publicar el pago");
    }

    /** Pide un JSON. */
    public JsonNode preguntar(SistemaDeOrigen sistema, String ruta, String que) {
        HttpRequest.Builder peticion =
                HttpRequest.newBuilder(URI.create(raizDe(sistema) + ruta))
                        .timeout(ESPERA_DE_LECTURA)
                        .header("Accept", "application/json")
                        .GET();
        String mandada = conCredencial(peticion);
        HttpResponse<String> respuesta = enviar(peticion, sistema, que);
        if (esDeCredencial(respuesta.statusCode())) {
            // Aqui el 401 ya se reintentaba —TODO lo que no es 200 es `NoContesta`—, asi que lo
            // que #21 anade no es el reintento sino el diagnostico: «contesto 401 al traer el
            // buzon» manda a mirar el buzon, y lo que falta es una credencial.
            //
            // Desde #96 el «al <que>» va DENTRO del mensaje y no pegado detras: pegado detras
            // quedaba al otro lado del recorte, o sea que era justo lo que se perdia.
            throw new BuzonDelSistemaDeOrigen.NoContesta(
                    laIdentidadDeServicio(
                            sistema, respuesta.statusCode(), mandada, respuesta.body(), que));
        }
        if (respuesta.statusCode() != 200) {
            throw new BuzonDelSistemaDeOrigen.NoContesta(
                    "«" + sistema + "» contesto " + respuesta.statusCode() + " al " + que);
        }
        try {
            return json.readTree(respuesta.body());
        } catch (JacksonException ilegible) {
            // Jackson 3 lanza `JacksonException`, que NO es comprobada (C-7). Se sigue capturando
            // a proposito: es la unica forma de que «contesto algo que no es JSON» se reintente
            // como un `NoContesta` en vez de matar el evento con una excepcion de libreria.
            throw new BuzonDelSistemaDeOrigen.NoContesta(
                    "«" + sistema + "» contesto algo que no es JSON al " + que, ilegible);
        }
    }

    /**
     * Pone la cabecera si la hay, y devuelve la que puso.
     *
     * <p>Devuelve, en vez de volver a preguntar mas abajo, porque preguntar dos veces es <b>pedir
     * el token dos veces</b>: la segunda llamada seria dentro del diagnostico de un 401, o sea en
     * el peor momento, y podria lanzar su propia excepcion tapando la que se estaba explicando.
     *
     * <p>Y se pide AQUI y no en el constructor: un token caduca, y uno pedido al arrancar el pod
     * estaria muerto a la primera tanda de la noche.
     */
    private String conCredencial(HttpRequest.Builder peticion) {
        String cabecera = credencial.cabecera();
        if (!cabecera.isBlank()) {
            peticion.header("Authorization", cabecera);
        }
        return cabecera;
    }

    private HttpResponse<String> enviar(
            HttpRequest.Builder peticion, SistemaDeOrigen sistema, String que) {
        try {
            return cliente.send(peticion.build(), HttpResponse.BodyHandlers.ofString());
        } catch (IOException noContesta) {
            throw new BuzonDelSistemaDeOrigen.NoContesta(
                    "No se pudo " + que + ": «" + sistema + "» no contesta", noContesta);
        } catch (InterruptedException interrumpido) {
            Thread.currentThread().interrupt();
            throw new BuzonDelSistemaDeOrigen.NoContesta("Se interrumpio al " + que, interrumpido);
        }
    }

    /**
     * Un 401 o un 403 no hablan de este pago: hablan de quien llama.
     *
     * <p>Se distinguen del resto por el codigo y no por el cuerpo a proposito: el cuerpo lo escribe
     * el otro sistema y cambiar de redaccion no puede cambiar si un pago se reintenta. <b>Esto
     * decide la CLASIFICACION y no el mensaje</b>: desde #96 los dos codigos entran aqui juntos y
     * salen con textos distintos, porque se arreglan en sitios distintos.
     */
    private static boolean esDeCredencial(int estado) {
        return estado == 401 || estado == 403;
    }

    /**
     * Lo que hay que mirar, dicho en el mensaje que acaba en {@code pago_evento.ultimo_error}.
     *
     * <p><b>Tres ramas y no una (#96)</b>, porque se arreglan en tres sitios: no hay credencial
     * (falta la configuracion), la credencial no vale (Keycloak), y la credencial vale pero falta
     * el permiso (la concesion en {@code identidad}). Las tres siguen siendo {@code NoContesta}.
     */
    private String laIdentidadDeServicio(
            SistemaDeOrigen sistema, int estado, String mandada, String cuerpo, String que) {
        String porque;
        if (estado == 403) {
            // Un 403 NO habla de la credencial: el destino la valido y luego dijo que no.
            porque =
                    "la credencial SI vale —lo dice el haberla validado— y lo que falta es un"
                            + " PERMISO sobre el acceso que exige. Se concede en `identidad`, NO"
                            + " en Keycloak";
        } else if (mandada.isBlank()) {
            porque =
                    "esta caja no manda ninguna credencial: falta la identidad de servicio"
                            + " (`kamayuk.caja.identidad.cliente`, `kamayuk.caja.credencial`)";
        } else {
            porque =
                    "la credencial que manda esta caja NO vale o caduco: se arregla en Keycloak"
                            + " (la cuenta «kamayuk-caja-servicio-<ubigeo>» y su secreto)";
        }
        return cabe(
                "«"
                        + sistema
                        + "» contesto "
                        + estado
                        + " al "
                        + que
                        + ": "
                        + porque
                        + ". NO es un rechazo del pago: se REINTENTA solo. Contesto "
                        + RespuestaAjena.de(json, cuerpo).comoTexto());
    }

    /**
     * Lo que cabe en {@code pago_evento.ultimo_error}, y por que se corta aqui y no alli.
     *
     * <p>La columna es {@code varchar(400)} y {@code EntregarEventos} ya recorta a 400 antes de
     * guardar — <b>sin decirlo</b>. Cortar aqui deja la marca del corte, y sobre todo garantiza que
     * lo que se pierda sea la <b>cola</b>: el diagnostico y su remedio van delante y no se los
     * lleva ningun cuerpo largo. Ver la cabecera de la clase.
     */
    private static String cabe(String mensaje) {
        Objects.requireNonNull(mensaje, "El mensaje es la cadena vacia, no nulo");
        return mensaje.length() <= LARGO_DE_ULTIMO_ERROR
                ? mensaje
                : mensaje.substring(0, LARGO_DE_ULTIMO_ERROR - 1) + "…";
    }
}
