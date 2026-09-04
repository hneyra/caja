package kamayuk.caja.caja.infraestructura;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import java.util.Objects;
import kamayuk.caja.caja.dominio.BuzonDelSistemaDeOrigen;
import kamayuk.caja.caja.dominio.SistemaDeOrigen;
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
 * <h2>El token</h2>
 *
 * <p>El publicador corre <b>sin usuario delante</b>: no hay peticion en curso de la que sacar un
 * {@code Authorization}. Asi que se manda una credencial de servicio configurada, y si no la hay la
 * llamada sale sin credencial y el destino la rechaza — que es deliberado. ADR-0028 §2 dice como se
 * cierra esto de verdad, con un token delegado; <b>no esta construido</b>, y queda declarado.
 */
@Component
public class ClienteHttpDelSistemaDeOrigen {

    private static final Duration ESPERA_DE_CONEXION = Duration.ofSeconds(5);
    private static final Duration ESPERA_DE_LECTURA = Duration.ofSeconds(30);

    private final HttpClient cliente;
    private final JsonMapper json;
    private final Map<String, String> origenes;
    private final String credencial;

    public ClienteHttpDelSistemaDeOrigen(
            JsonMapper json,
            @Value("#{${kamayuk.caja.origenes:{:}}}") Map<String, String> origenes,
            @Value("${kamayuk.caja.credencial:}") String credencial) {
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
        conCredencial(peticion);
        HttpResponse<String> respuesta = enviar(peticion, sistema, "publicar el pago");
        int estado = respuesta.statusCode();
        if (estado == 200 || estado == 201 || estado == 202 || estado == 409) {
            // El 409 es «ya lo tengo»: el receptor deduplico por pagoId. Es EXITO y no un fallo —
            // reintentar hasta que deje de decir 409 no acabaria nunca, y matar el evento por eso
            // dispararia una alerta por un pago que SI se registro.
            return;
        }
        if (estado >= 400 && estado < 500) {
            throw new BuzonDelSistemaDeOrigen.Rechazado(
                    "«"
                            + sistema
                            + "» rechazo el pago con "
                            + estado
                            + ": "
                            + recorte(respuesta.body())
                            + ". Esto NO se reintenta: el motivo no va a cambiar solo");
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
        conCredencial(peticion);
        HttpResponse<String> respuesta = enviar(peticion, sistema, que);
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

    private void conCredencial(HttpRequest.Builder peticion) {
        if (!credencial.isBlank()) {
            peticion.header("Authorization", credencial);
        }
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

    private static String recorte(String cuerpo) {
        Objects.requireNonNull(cuerpo, "El cuerpo es la cadena vacia, no nulo");
        return cuerpo.length() <= 200 ? cuerpo : cuerpo.substring(0, 200);
    }
}
