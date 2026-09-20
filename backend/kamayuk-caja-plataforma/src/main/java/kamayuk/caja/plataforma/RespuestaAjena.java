package kamayuk.caja.plataforma;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Lo que contesto el OTRO sistema cuando no contesto 200: su {@code codigo}, su {@code detail}, y
 * el cuerpo entero —en una linea, sin credenciales y recortado— para el mensaje del error.
 *
 * <h2>De que defecto viene, para que nadie la «simplifique»</h2>
 *
 * <p>Los dos clientes HTTP de esta caja comprobaban el codigo de estado, lo nombraban y <b>tiraban
 * el cuerpo</b>, que es justo donde el otro sistema explica por que rechaza:
 *
 * <ul>
 *   <li>{@code ClienteHttpDelBuzonDeIdentidad} mapeaba <b>cualquier</b> 403 a «falta afiliarla al
 *       grupo «Consumidores del buzon»» (issue #95). `identidad` distingue <b>tres</b> 403 y los
 *       tres se arreglan en sitios distintos.
 *   <li>{@code ClienteHttpDelSistemaDeOrigen} fundia el 401 y el 403 en un solo mensaje que
 *       afirmaba la causa del 401 —«la que esta caja manda no vale»— y tiraba el cuerpo igual
 *       (issue #96). Con un 403 decia lo contrario de lo que pasa, y ese texto acaba en {@code
 *       pago_evento.ultimo_error}, que <b>lo lee un cajero</b>.
 * </ul>
 *
 * <p>No es un defecto de esta caja sola: es el ejemplar de aqui de <a
 * href="https://github.com/hneyra/rentas/issues/66">`rentas`#66</a>, <b>medido en el cluster de
 * `stg` el 2026-09-11</b> —alli el mensaje mandaba a mirar la afiliacion al grupo, que estaba
 * perfectamente bien, y lo que `identidad` contestaba de verdad era la rama contraria— y de
 * `rentas`#166. Esta clase es <b>la misma</b> que aquel issue dejo en {@code
 * kamayuk.rentas.plataforma}, con el paquete renombrado: el vocabulario con que los cuatro
 * satelites cuentan lo que el otro lado dijo tiene que ser uno, no cuatro. Unificar los clientes
 * enteros es otra cosa, y es {@code infrastructure}#23.
 *
 * <p>Vive en {@code plataforma} y no dentro de uno de los dos clientes porque son <b>dos</b> los
 * que la usan, y porque el dia que aparezca un tercer destino —la caja no sabe cuantos sistemas
 * hay, y por eso {@code kamayuk.caja.origenes} es un mapa— tiene que encontrarla hecha.
 *
 * <h2>Lo que NO puede pasar: que un secreto acabe en un registro</h2>
 *
 * <p>Meter el cuerpo de una respuesta en un mensaje de error es meterlo en un log, y en {@code
 * pago_evento.ultimo_error} lo lee un cajero. El cuerpo de un {@code problem+json} de este producto
 * no lleva secretos, pero <b>no es lo unico que puede contestar</b>: delante hay un Traefik, y un
 * proxy o una pagina de error puede devolver un eco de la peticion con su cabecera {@code
 * Authorization} dentro — que es el token de servicio de esta municipalidad. Por eso {@link
 * #limpiar} tacha primero y recorta despues, que es el orden defensivo — aunque, medido, <b>hoy no
 * es el que sostiene la limpieza</b>: las tres expresiones de abajo casan de forma abierta ({@code
 * [^\r\n}]+}, {@code [A-Za-z0-9._~+/=-]+}), asi que un fragmento recortado las casa igual y el
 * orden inverso tampoco deja escapar nada. <b>Se comprobo aqui, invirtiendolo</b>: recortar primero
 * y tachar despues deja las <b>siete</b> pruebas de {@code RespuestaAjenaTest} en verde. Se deja
 * asi porque es el orden que seguiria siendo correcto si alguna expresion pasara a exigir el cierre
 * de las comillas — pero <b>no hay guarda que lo vigile</b>, y no se escribio una que no pudiera
 * fallar.
 *
 * @param codigo el {@code codigo} del {@code problem+json}, o vacio si no lo dijo
 * @param detalle el {@code detail} del {@code problem+json}, o vacio si no lo dijo
 * @param cuerpo lo que contesto, tachado y recortado. Vacio si contesto con el cuerpo vacio
 */
public record RespuestaAjena(String codigo, String detalle, String cuerpo) {

    /**
     * Cuanto cuerpo cabe en el mensaje.
     *
     * <p>400 caracteres, que es <b>el ancho de {@code pago_evento.ultimo_error}</b> ({@code
     * V2__ordenes_de_cobro_y_outbox.sql}, {@code varchar(400)}) y el tope con el que {@code
     * EntregarEventos.recortar} ya corta lo que va a esa columna: entra un {@code problem+json}
     * entero de los que emiten los cuatro sistemas, y no entra una pagina de error de un proxy. Un
     * tope es lo que impide que un HTML de 60 kB se lleve por delante el registro de la corrida.
     *
     * <p>Quien escribe en esa columna necesita ademas que el <b>mensaje entero</b> quepa, no solo
     * el cuerpo; eso lo resuelve su cliente, que sabe cuanto ocupa su propio remedio. Ver {@code
     * ClienteHttpDelSistemaDeOrigen}.
     */
    public static final int TOPE = 400;

    /** Lo que se deja en el sitio de un secreto. */
    private static final String TACHADO = "«…»";

    /**
     * La cabecera de autorizacion, hasta el final de su linea o de su campo.
     *
     * <p>Va la primera y llega hasta el final a proposito: un esquema que no sea {@code Bearer}
     * —{@code Digest}, el que sea— tiene que quedar tachado igual, y con el patron de abajo, que
     * corta en el primer espacio, «Authorization: Digest abc» dejaria el {@code abc} fuera.
     */
    private static final Pattern AUTORIZACION =
            Pattern.compile("(?i)(\"?authorization\"?\\s*[:=]\\s*)(\"[^\"]*\"|[^\\r\\n}]+)");

    /** Un token portador suelto, dentro de un texto cualquiera. */
    private static final Pattern PORTADOR =
            Pattern.compile("(?i)\\b(bearer|basic)\\s+[A-Za-z0-9._~+/=-]+");

    /** Y lo demas que se parece a una credencial, con su valor detras. */
    private static final Pattern CON_VALOR =
            Pattern.compile(
                    "(?i)(\"?(?:client[_-]?secret|secret|access[_-]?token|refresh[_-]?token"
                            + "|id[_-]?token|token|password|passwd|clave|credencial)\"?\\s*[:=]\\s*)"
                            + "(\"[^\"]*\"|[^\\s,;&}\\]]+)");

    /** Lo que contesto el otro sistema, leido una vez y ya sin secretos. */
    public static RespuestaAjena de(JsonMapper json, String cuerpo) {
        String crudo = cuerpo == null ? "" : cuerpo;
        String limpio = limpiar(crudo);
        if (crudo.isBlank()) {
            return new RespuestaAjena("", "", "");
        }
        JsonNode arbol;
        try {
            arbol = json.readTree(crudo);
        } catch (JacksonException noEsJson) {
            // No es un problem+json: puede ser el HTML de un proxy. No hay codigo que leer, pero
            // el cuerpo sigue siendo lo unico que dice que paso, asi que viaja igual.
            return new RespuestaAjena("", "", limpio);
        }
        return new RespuestaAjena(texto(arbol, "codigo"), texto(arbol, "detail"), limpio);
    }

    /** No dijo ningun codigo ni ningun detalle: aqui no se elige una rama por el. */
    public boolean sinDecirPorQue() {
        return codigo.isBlank() && detalle.isBlank();
    }

    /**
     * Si lo que contesto nombra esto, sin mirar mayusculas.
     *
     * <p>Busca en el {@code codigo} y en el {@code detail}, y no en el cuerpo entero: el cuerpo
     * puede traer el eco de la peticion, y una peticion que lleve la palabra dentro haria decir al
     * mensaje una rama que el emisor no dijo.
     */
    public boolean dice(String fragmento) {
        String buscado = fragmento.toLowerCase(Locale.ROOT);
        return codigo.toLowerCase(Locale.ROOT).contains(buscado)
                || detalle.toLowerCase(Locale.ROOT).contains(buscado);
    }

    /**
     * Lo que contesto, en una frase que se pega detras de «contesto 403 al …».
     *
     * <p>Cuando no dijo nada <b>lo dice</b>, en vez de dejar la frase a medias: «y no dijo por que»
     * es una respuesta util —manda a mirar quien contesto, que a lo mejor no es el otro sistema
     * sino un proxy— y «…» no lo es.
     */
    public String comoTexto() {
        if (sinDecirPorQue()) {
            return cuerpo.isBlank()
                    ? "con el cuerpo VACIO, sin decir por que"
                    : "sin «codigo», y lo que mando fue: «" + cuerpo + "»";
        }
        StringBuilder frase = new StringBuilder();
        if (!codigo.isBlank()) {
            frase.append("codigo «").append(codigo).append("»");
        }
        if (!detalle.isBlank()) {
            if (!frase.isEmpty()) {
                frase.append(" — ");
            }
            frase.append("«").append(detalle).append("»");
        }
        return frase.toString();
    }

    private static String texto(JsonNode cuerpo, String campo) {
        JsonNode nodo = cuerpo.path(campo);
        return nodo.isValueNode() ? limpiar(nodo.asString("")) : "";
    }

    /**
     * Tacha, aplana y recorta, <b>en ese orden</b>.
     *
     * <p>Tacha primero y recorta despues. <b>Medido, el orden no cambia el resultado hoy</b>: las
     * tres expresiones casan hasta el final de la linea o del texto, asi que la mitad de un token
     * que sobreviva al corte tambien queda tachada. Se mantiene porque es el orden que sigue siendo
     * correcto si alguna expresion pasara a exigir un cierre, y porque tachar sobre el texto entero
     * no cuesta nada. Lo que NO hay es una prueba que lo distinga, y se intento escribir.
     */
    private static String limpiar(String cuerpo) {
        String tachado = AUTORIZACION.matcher(cuerpo).replaceAll("$1" + reemplazo());
        tachado = PORTADOR.matcher(tachado).replaceAll("$1 " + reemplazo());
        tachado = CON_VALOR.matcher(tachado).replaceAll("$1" + reemplazo());
        String enUnaLinea = tachado.replaceAll("\\s+", " ").trim();
        return enUnaLinea.length() <= TOPE ? enUnaLinea : enUnaLinea.substring(0, TOPE) + "…";
    }

    private static String reemplazo() {
        return Matcher.quoteReplacement(TACHADO);
    }
}
