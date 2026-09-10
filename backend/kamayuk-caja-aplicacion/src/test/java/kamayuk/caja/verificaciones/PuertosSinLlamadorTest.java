package kamayuk.caja.verificaciones;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import kamayuk.comun.verificaciones.ConfiguracionDeLasVerificaciones;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Los puertos de la API publica de {@code nucleo} que no tiene quien los llame (#45, AC-5).
 *
 * <h2>Que mide, y por que ninguna guarda anterior podia medirlo</h2>
 *
 * <p>El paquete raiz {@code kamayuk.caja.nucleo} es <b>exactamente lo que otro sistema puede ver de
 * la caja</b>: Spring Modulith trata como interno todo lo que vive en un subpaquete, asi que lo que
 * se declara ahi se declara para que alguien lo llame. {@code ModulosTest} comprueba que nadie
 * cruce el limite por debajo; el contrato con {@code rentas} comprueba que esta caja no retire lo
 * que su consumidor lee. Ninguno de los dos mira lo contrario: que un puerto <b>tenga quien lo
 * llame</b>.
 *
 * <p>Un puerto sin llamadores pasa {@code verificarArquitectura}, pasa {@code ModulosTest}, pasa el
 * contrato y pasa las setecientas pruebas — se declara, se implementa con su {@code @Service}, y de
 * su modulo no sale por ninguna ruta. Y lo que cuesta no es codigo muerto: es que la decision que
 * ese puerto existia para sostener se sigue tomando <b>sin el</b>. {@code AvanceDeCaja} llevaba
 * desde P5D implementado y sin llamador, y el panel de recaudacion de {@code rentas} —lo unico que
 * lo iba a usar— contestaba <b>500</b> con esta caja levantada, autorizada y sana.
 *
 * <h2>La lista solo baja</h2>
 *
 * <p>Es el patron de {@code componenElAreaAManoConMotivo()}: quien queda dentro esta con su motivo
 * escrito y con la dependencia que lo bloquea <b>nombrada</b>, no con un «pendiente». Nace vacia
 * porque #45 no aparco {@code AvanceDeCaja}: lo <b>retiro</b>. Una entrada nueva pone el build rojo
 * el mismo dia, y una que ya no ocurre tambien.
 *
 * <h2>Como se cuenta un llamador, y las dos cosas que NO cuentan</h2>
 *
 * <p>Por el <b>fuente sin comentarios</b>, y las dos mitades hacen falta:
 *
 * <ul>
 *   <li><b>Sin comentarios</b>, y esta medido por que: este repositorio explica sus decisiones
 *       donde las toma, y en cuanto un javadoc cruza dos tipos el par «menciona el tipo» + «{@code
 *       .metodo(}» casa <b>por accidente</b>. Medido con una linea de las que aqui se escriben a
 *       diario —«No confundir con {@code AvanceDeCaja}» en {@code ConciliacionDelDia}, que llama a
 *       {@code origen.delDia(} sobre OTRO tipo—: contando comentarios el censo pasa en VERDE con el
 *       puerto huerfano delante, y quitandolos sale rojo nombrandolo. Es la leccion del {@code grep
 *       -c proxy_pass} de #16 y la del escaner de rotulos de #10, por tercera vez.
 *   <li><b>Su implementacion no cuenta</b>, y esto no es una formalidad: {@code
 *       AvanceDeCajaTesoreria} nombra el puerto en su {@code implements} y ademas escribe {@code
 *       CriterioDeRecaudacion.delDia(dia)}, que contiene {@code .delDia(} — o sea que sin esta
 *       exclusion el puerto se contaba a si mismo como llamado, en verde, con el defecto exacto que
 *       esta guarda existe para atrapar. Un adaptador que implementa un puerto que nadie pide esta
 *       igual de muerto que el puerto.
 * </ul>
 *
 * <p>Y no basta con nombrar el tipo: hay que <b>llamar a alguno de sus metodos</b>. Es la leccion
 * de C-1 por este eje —el colaborador viaja, se inyecta y se descarta en silencio—, y la que
 * `rentas`#43 midio: un puerto que se recibe en el constructor y no se usa parece cableado. Los
 * nombres de los metodos se leen del <b>propio tipo por reflexion</b> y no de una lista escrita
 * aqui: una lista se queda vieja el dia que el puerto gane una operacion, y entonces un llamador
 * que solo usara la nueva contaria como ninguno.
 *
 * <h2>Sin entrada de Gradle, y esta medido por que</h2>
 *
 * <p>Esta guarda lee del <b>disco</b> el {@code src/main} de todos los modulos, y de esos modulos
 * esta tarea tiene los JARS y no las fuentes — que es la forma de #192 punto 2 que este mismo
 * {@code build.gradle.kts} ya cerro dos veces, para {@code src/test} y para el contrato del clon
 * hermano. Aqui <b>no hace falta</b>, y no por descuido: un puerto que nace, un llamador que
 * desaparece o un {@code implements} que se quita cambian el bytecode, o sea el jar, que si es
 * entrada; y lo unico que no lo cambia —un comentario— no puede mover el veredicto, porque los
 * llamadores se cuentan sobre el fuente <b>sin comentarios</b>. Medido de todas formas, que es lo
 * que separa esto de una suposicion: cambiando SOLO un javadoc de {@code src/main} y sin declarar
 * ninguna entrada, {@code :kamayuk-caja-aplicacion:test} <b>volvio a correr</b> —no UP-TO-DATE—,
 * porque el jar del modulo se rehace.
 *
 * <h2>Lo que NO distingue, dicho en vez de descubierto</h2>
 *
 * <p>El par «nombra el tipo» + «invoca {@code .metodo(}» no comprueba que la invocacion sea
 * <b>sobre ese tipo</b>: un archivo que declarara el puerto y llamara a un {@code .recaudado(} de
 * otro objeto contaria como llamador. Se acepta a proposito y por dos medidas: cerrarlo exige
 * resolver tipos —o sea ArchUnit sobre el bytecode, que no ve el paquete raiz como algo distinto de
 * lo demas—, y el error solo puede ir en la direccion de <b>callar</b>, nunca en la de gritar sobre
 * un puerto sano; una guarda que grita en lo correcto se acaba apagando (#437). Lo que esta guarda
 * promete es que un puerto que nadie nombra, o que se inyecta y se descarta, sale nombrado — que es
 * la forma en que este defecto ha aparecido las dos veces (#45 aqui, `rentas`#43 alli).
 */
@DisplayName("#45 AC-5 — ningun puerto de la API publica se queda sin llamador")
class PuertosSinLlamadorTest {

    /** El modulo cuyo paquete raiz es la API publica de este sistema (ARQ-01 §3.8). */
    private static final String MODULO = "kamayuk-caja-nucleo";

    private static final String PAQUETE = "kamayuk.caja.nucleo";

    /**
     * Los puertos que hoy no tiene quien los llame, con su motivo y lo que los bloquea.
     *
     * <p><b>Vacia, y esa es la afirmacion.</b> Se deja declarada en vez de borrar el mapa por lo
     * mismo que {@code desajustesVivos()} de {@code ContratoConRentasTest}: lo que permite es una
     * excepcion temporal y <b>con nombre</b>, y a cero un puerto huerfano nuevo no tiene donde
     * esconderse.
     */
    private static final Map<String, String> SIN_LLAMADOR_CON_MOTIVO = new LinkedHashMap<>();

    @Test
    @DisplayName("todo puerto tiene llamador, o esta en la lista con su motivo")
    void todoPuertoTieneLlamadorOMotivo() {
        Map<String, List<String>> censo = puertosConSusLlamadores();

        assertThat(censo)
                .as(
                        "sin sujeto esta guarda se cumpliria sola: si el recorrido no encuentra ni"
                                + " un puerto, «todos tienen llamador» es cierto sobre el conjunto"
                                + " vacio. Falla diciendo que no midio, que no es «esta bien»")
                .isNotEmpty();
        assertThat(fuentesDeProduccion())
                .as(
                        "ni un archivo de `build/`: son copias del fuente que Spotless deja, y un"
                                + " puerto quedaria «llamado» por su propio adaptador copiado")
                .noneMatch(ruta -> ruta.toString().contains("/build/"));

        List<String> huerfanos = new ArrayList<>();
        for (Map.Entry<String, List<String>> puerto : censo.entrySet()) {
            if (puerto.getValue().isEmpty()
                    && !SIN_LLAMADOR_CON_MOTIVO.containsKey(puerto.getKey())) {
                huerfanos.add(puerto.getKey());
            }
        }

        assertThat(huerfanos)
                .as(
                        "un puerto sin llamadores pasa verificarArquitectura, pasa ModulosTest y"
                                + " pasa el contrato con `rentas` — y la decision que existia para"
                                + " sostener se sigue tomando sin el (#45)")
                .isEmpty();
    }

    @Test
    @DisplayName("y la lista de exentos no tiene entradas que sobren: la lista solo baja")
    void laListaDeExentosNoTieneEntradasQueSobren() {
        Map<String, List<String>> censo = puertosConSusLlamadores();

        List<String> yaLlamados = new ArrayList<>();
        List<String> queYaNoExisten = new ArrayList<>();
        for (String exento : SIN_LLAMADOR_CON_MOTIVO.keySet()) {
            if (!censo.containsKey(exento)) {
                queYaNoExisten.add(exento);
            } else if (!censo.get(exento).isEmpty()) {
                yaLlamados.add(exento);
            }
        }

        assertThat(queYaNoExisten)
                .as("un exento que ya no es un puerto deja la lista hablando de lo que no hay")
                .isEmpty();
        assertThat(yaLlamados)
                .as(
                        "este ya tiene llamador: la exencion sobra, y dejarla convierte el censo en"
                                + " una puerta abierta")
                .isEmpty();
    }

    @Test
    @DisplayName("el censo mira la API publica del modulo, y ese directorio esta en el disco")
    void elCensoMiraLaApiPublicaDelModulo() {
        assertThat(Files.isDirectory(raizDeLaApiPublica()))
                .as(
                        "si este directorio se mueve, el censo deja de encontrar puertos y pasa en"
                                + " verde sin haber mirado nada: "
                                + raizDeLaApiPublica())
                .isTrue();
    }

    // ------------------------------------------------------------------

    /** Cada puerto de la API publica, con los archivos de {@code src/main} que lo llaman. */
    private static Map<String, List<String>> puertosConSusLlamadores() {
        Path raiz = raizDeLaApiPublica();
        if (!Files.isDirectory(raiz)) {
            // Y no un `NoSuchFileException` pelado: ese dice DONDE revento, no que falta el
            // sujeto, y manda a mirar al sitio equivocado. Es la leccion de `rentas`#51 R9.
            throw new IllegalStateException(
                    "No esta «"
                            + raiz
                            + "», que es la API publica de este modulo: sin ella el censo no"
                            + " encuentra ni un puerto y «todos tienen llamador» seria cierto sobre"
                            + " el conjunto vacio. Esto NO midio nada");
        }
        Set<String> puertos = new LinkedHashSet<>();
        try (Stream<Path> archivos = Files.list(raiz)) {
            archivos.filter(archivo -> archivo.toString().endsWith(".java"))
                    .sorted()
                    .forEach(
                            archivo -> {
                                String nombre =
                                        archivo.getFileName().toString().replace(".java", "");
                                if (sinComentarios(leer(archivo))
                                        .contains("public interface " + nombre)) {
                                    puertos.add(nombre);
                                }
                            });
        } catch (IOException fallo) {
            throw new UncheckedIOException(fallo);
        }

        Map<String, List<String>> llamadores = new LinkedHashMap<>();
        for (String puerto : puertos) {
            llamadores.put(puerto, new ArrayList<>());
        }
        for (Path fuente : fuentesDeProduccion()) {
            String codigo = sinComentarios(leer(fuente));
            for (String puerto : puertos) {
                if (fuente.getFileName().toString().equals(puerto + ".java")) {
                    continue;
                }
                if (loImplementa(codigo, puerto)) {
                    continue;
                }
                if (loLlama(codigo, puerto)) {
                    llamadores.get(puerto).add(fuente.getFileName().toString());
                }
            }
        }
        return llamadores;
    }

    /**
     * Implementar un puerto no es llamarlo.
     *
     * <p>Medido: sin esta exclusion, {@code AvanceDeCajaTesoreria} —el adaptador del puerto
     * huerfano— se contaba como su llamador, porque nombra el tipo en el {@code implements} y
     * escribe {@code CriterioDeRecaudacion.delDia(dia)}, que casa con {@code .delDia(}. La guarda
     * pasaba en VERDE con el defecto exacto que existe para atrapar.
     */
    private static boolean loImplementa(String codigo, String puerto) {
        return Pattern.compile("implements\\s+[^{]*\\b" + Pattern.quote(puerto) + "\\b")
                .matcher(codigo)
                .find();
    }

    /** Lo llama quien nombra el tipo <b>y ademas</b> invoca alguno de sus metodos. */
    private static boolean loLlama(String codigo, String puerto) {
        if (!Pattern.compile("\\b" + Pattern.quote(puerto) + "\\b").matcher(codigo).find()) {
            return false;
        }
        for (String metodo : metodosDe(puerto)) {
            if (codigo.contains("." + metodo + "(")) {
                return true;
            }
        }
        return false;
    }

    /** Los metodos que el puerto declara, leidos del tipo COMPILADO y no de una lista. */
    private static Set<String> metodosDe(String puerto) {
        Set<String> nombres = new LinkedHashSet<>();
        try {
            for (Method metodo : Class.forName(PAQUETE + "." + puerto).getDeclaredMethods()) {
                nombres.add(metodo.getName());
            }
        } catch (ClassNotFoundException noEstaEnElClasspath) {
            throw new IllegalStateException(
                    "No se pudo cargar el puerto «"
                            + puerto
                            + "»: sin sus metodos, este censo no puede distinguir «lo llama» de «lo"
                            + " nombra», y pasaria en verde con un puerto inyectado y sin usar",
                    noEstaEnElClasspath);
        }
        if (nombres.isEmpty()) {
            throw new IllegalStateException(
                    "El puerto «"
                            + puerto
                            + "» no declara ni un metodo: con la lista vacia, «nadie lo llama» seria"
                            + " cierto pase lo que pase");
        }
        return nombres;
    }

    private static Path raizDeLaApiPublica() {
        return ConfiguracionDeLasVerificaciones.actual()
                .raizDelCodigo()
                .resolve(MODULO)
                .resolve("src/main/java")
                .resolve(PAQUETE.replace('.', '/'));
    }

    private static Set<Path> fuentesDeProduccion() {
        Set<Path> fuentes = new LinkedHashSet<>();
        try (Stream<Path> recorrido =
                Files.walk(ConfiguracionDeLasVerificaciones.actual().raizDelCodigo())) {
            recorrido
                    .filter(ruta -> ruta.toString().endsWith(".java"))
                    .filter(ruta -> ruta.toString().contains("/src/main/java/"))
                    // Y NO lo que Gradle deja en `build/`: son COPIAS del fuente
                    // (`build/spotless-clean/...`), asi que un puerto quedaria «llamado» por su
                    // propio adaptador duplicado. Es la medida que `rentas`#43 dejo escrita.
                    .filter(ruta -> !ruta.toString().contains("/build/"))
                    .forEach(fuentes::add);
        } catch (IOException fallo) {
            throw new UncheckedIOException(fallo);
        }
        return fuentes;
    }

    /**
     * El codigo sin sus comentarios, y con sus cadenas intactas.
     *
     * <p><b>No es una expresion regular</b>, y el motivo se midio: {@code
     * "https://kamayuk.gob.pe/errores/"} vive en {@code src/main} de este sistema, y un {@code
     * replaceAll("//.*")} se comeria el resto de esa linea. Aqui una llamada perdida seria un rojo
     * sobre codigo correcto —la forma de fallo que se acaba apagando (#437)—, asi que el recorrido
     * lleva la cuenta de si esta dentro de una cadena, de un caracter o de un bloque de texto.
     */
    private static String sinComentarios(String fuente) {
        StringBuilder codigo = new StringBuilder(fuente.length());
        int i = 0;
        while (i < fuente.length()) {
            char c = fuente.charAt(i);
            if (c == '/' && i + 1 < fuente.length() && fuente.charAt(i + 1) == '/') {
                while (i < fuente.length() && fuente.charAt(i) != '\n') {
                    i++;
                }
            } else if (c == '/' && i + 1 < fuente.length() && fuente.charAt(i + 1) == '*') {
                int fin = fuente.indexOf("*/", i + 2);
                i = fin < 0 ? fuente.length() : fin + 2;
            } else if (fuente.startsWith("\"\"\"", i)) {
                int fin = fuente.indexOf("\"\"\"", i + 3);
                int hasta = fin < 0 ? fuente.length() : fin + 3;
                codigo.append(fuente, i, hasta);
                i = hasta;
            } else if (c == '"' || c == '\'') {
                int j = i + 1;
                while (j < fuente.length() && fuente.charAt(j) != c) {
                    j += fuente.charAt(j) == '\\' ? 2 : 1;
                }
                int hasta = Math.min(j + 1, fuente.length());
                codigo.append(fuente, i, hasta);
                i = hasta;
            } else {
                codigo.append(c);
                i++;
            }
        }
        return codigo.toString();
    }

    private static String leer(Path archivo) {
        try {
            return Files.readString(archivo, StandardCharsets.UTF_8);
        } catch (IOException fallo) {
            throw new UncheckedIOException(fallo);
        }
    }
}
