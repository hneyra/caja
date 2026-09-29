package kamayuk.caja.nucleo.aplicacion;

import static kamayuk.caja.nucleo.infraestructura.ClienteHttpDelSistemaDeOrigen.LARGO_DE_ULTIMO_ERROR;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.IntSupplier;
import java.util.function.Supplier;
import kamayuk.caja.nucleo.dobles.BuzonEnMemoria;
import kamayuk.caja.nucleo.dominio.BuzonDelSistemaDeOrigen;
import kamayuk.caja.nucleo.dominio.EstadoDelEvento;
import kamayuk.caja.nucleo.dominio.EventoDePago;
import kamayuk.caja.nucleo.dominio.ReintentosDeLaEntrega;
import kamayuk.caja.nucleo.dominio.SistemaDeOrigen;
import kamayuk.caja.nucleo.dominio.TipoDeEventoDePago;
import kamayuk.caja.nucleo.infraestructura.BuzonHttpDelSistemaDeOrigen;
import kamayuk.caja.nucleo.infraestructura.ClienteHttpDelSistemaDeOrigen;
import kamayuk.caja.nucleo.infraestructura.ClienteHttpDelSistemaDeOrigen.Veredicto;
import kamayuk.caja.nucleo.infraestructura.CredencialDeServicio;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

/**
 * #21 AC-3 — <b>un pago no muere al primer intento porque falte la credencial.</b>
 *
 * <h2>El defecto, y por que su sintoma no se parece a su causa</h2>
 *
 * <p>{@code publicar} clasificaba <b>todo</b> 4xx como {@link BuzonDelSistemaDeOrigen.Rechazado}, y
 * {@code EntregarEventos} marca un rechazo MUERTO <b>sin gastar ninguno de los ocho reintentos</b>.
 * Con la credencial ausente —que es el estado del que #21 sale, porque hasta este issue lo que se
 * mandaba era una cadena aleatoria que Keycloak no emitio— el destino contesta <b>401</b>: cobrado,
 * impreso, el libro sin enterarse, y una alerta a una persona diciendo que {@code rentas} «rechazo
 * el pago», que manda a mirar el pago cuando lo que falta es una cuenta de servicio.
 *
 * <h2>Que instrumento se usa, y por que no un doble</h2>
 *
 * <p>Se levanta un <b>servidor HTTP de verdad</b> que contesta el codigo que se le pide. Es la
 * misma doctrina que {@code CobrarConElOrigenApagadoTest} escribio para el apagado —alli un puerto
 * que nadie escucha, no un doble que lanza—: un doble que lanza {@code NoContesta} prueba que el
 * codigo maneja esa excepcion; un 401 de verdad prueba que el cliente <b>lo interpreta</b> asi, que
 * es lo unico que estaba mal.
 *
 * <p>Y se escribe sobre un {@link ServerSocket} a mano y no con {@code com.sun.net.httpserver}, por
 * lo que {@code SinNormativaFronteraTest} de `rentas` ya dejo escrito: Checkstyle prohibe importar
 * de {@code com.sun} —es un paquete de la implementacion, y una prueba que lo use ata el arbol a
 * una JDK concreta—. Lo <b>caza el checkstyle de las PRUEBAS</b>, que no corre con {@code :test}:
 * la primera version de este archivo lo importaba, las seis pruebas pasaban en verde y el rojo
 * habria salido en CI.
 *
 * <h2>El contraste no es decoracion</h2>
 *
 * <p>Sin el, «un 4xx se reintenta» se cumpliria reintentandolos todos, y entonces un 422 de negocio
 * gastaria los ocho intentos para acabar MUERTO por el mismo sitio y ocho veces mas tarde. Lo que
 * este issue cambia es <b>donde esta la raya</b>, asi que hay que medir los dos lados de la raya.
 *
 * <h2>Y desde #96, QUE se lee a cada lado</h2>
 *
 * <p>#21 dejo los dos codigos de credencial del lado correcto de la raya y con <b>un solo</b>
 * mensaje, que afirmaba la causa del 401: «la que esta caja manda no vale». Con un 403 eso es falso
 * —la credencial vale y lo que falta es un permiso— y manda a regenerar un secreto que esta bien.
 * Lo que #96 cambia no es la clasificacion, que sigue igual y se sigue midiendo aqui, sino el
 * texto: tres ramas, cada una a su sitio, con lo que el otro lado contesto dentro.
 */
@DisplayName("#21 AC-3 y #96 — un 401 se reintenta, un rechazo de negocio no, y los dos lo dicen")
class UnPagoNoMuereSinCredencialTest {

    private static final Instant AHORA = Instant.parse("2026-09-07T12:00:00Z");

    private RentasDeMentira servidor;
    private final AtomicInteger llamadas = new AtomicInteger();
    private volatile int estado = 200;
    private volatile String cuerpoDeRespuesta = "{}";

    @BeforeEach
    void levantarElServidor() throws IOException {
        servidor = RentasDeMentira.arranca(llamadas, () -> estado, () -> cuerpoDeRespuesta);
    }

    @AfterEach
    void apagarElServidor() throws IOException {
        servidor.close();
    }

    private BuzonHttpDelSistemaDeOrigen destino(String credencial) {
        return new BuzonHttpDelSistemaDeOrigen(
                new ClienteHttpDelSistemaDeOrigen(
                        JsonMapper.builder().build(),
                        Map.of("rentas", servidor.raiz()),
                        CredencialDeServicio.fija(credencial)));
    }

    /**
     * `rentas` fabricado: contesta el codigo que se le pida y cuenta las peticiones.
     *
     * <p>Contar es la mitad del valor de la ultima prueba: sin eso, «queda PENDIENTE» seria una
     * afirmacion sobre una fila y no una medida de que el pago vuelve a salir.
     */
    private static final class RentasDeMentira implements AutoCloseable {

        private final ServerSocket socket;
        private final Thread hilo;

        private RentasDeMentira(
                ServerSocket socket,
                AtomicInteger llamadas,
                IntSupplier estado,
                Supplier<String> cuerpo) {
            this.socket = socket;
            this.hilo =
                    new Thread(
                            () -> {
                                while (!socket.isClosed()) {
                                    try (Socket cliente = socket.accept()) {
                                        llamadas.incrementAndGet();
                                        leerPeticion(cliente);
                                        responder(cliente, estado.getAsInt(), cuerpo.get());
                                    } catch (IOException cerrado) {
                                        return;
                                    }
                                }
                            },
                            "rentas-de-mentira");
            this.hilo.setDaemon(true);
        }

        static RentasDeMentira arranca(
                AtomicInteger llamadas, IntSupplier estado, Supplier<String> cuerpo)
                throws IOException {
            ServerSocket socket = new ServerSocket(0, 0, InetAddress.getLoopbackAddress());
            RentasDeMentira servidor = new RentasDeMentira(socket, llamadas, estado, cuerpo);
            servidor.hilo.start();
            return servidor;
        }

        /**
         * Se consume la peticion entera, cabeceras y CUERPO.
         *
         * <p>Quedarse en la linea en blanco basta para un {@code GET} y no para el {@code POST} del
         * pago: el cuerpo sin leer deja bytes en el buffer y el cliente ve un RST en vez del 401
         * que esta prueba existe para medir.
         */
        private static void leerPeticion(Socket cliente) throws IOException {
            BufferedReader entrada =
                    new BufferedReader(
                            new InputStreamReader(
                                    cliente.getInputStream(), StandardCharsets.UTF_8));
            int largo = 0;
            String linea;
            while ((linea = entrada.readLine()) != null && !linea.isEmpty()) {
                if (linea.toLowerCase(java.util.Locale.ROOT).startsWith("content-length:")) {
                    largo = Integer.parseInt(linea.substring(linea.indexOf(':') + 1).trim());
                }
            }
            for (int leidos = 0; leidos < largo && entrada.read() >= 0; leidos++) {
                // El cuerpo no se mira: lo que se prueba es como se lee la RESPUESTA.
            }
        }

        private static void responder(Socket cliente, int estado, String cuerpo)
                throws IOException {
            byte[] bytes = cuerpo.getBytes(StandardCharsets.UTF_8);
            String cabeceras =
                    "HTTP/1.1 "
                            + estado
                            + " \r\n"
                            + "Content-Type: application/json\r\n"
                            + "Content-Length: "
                            + bytes.length
                            + "\r\n"
                            + "Connection: close\r\n\r\n";
            OutputStream salida = cliente.getOutputStream();
            salida.write(cabeceras.getBytes(StandardCharsets.UTF_8));
            salida.write(bytes);
            salida.flush();
        }

        String raiz() {
            return "http://127.0.0.1:" + socket.getLocalPort();
        }

        @Override
        public void close() throws IOException {
            socket.close();
        }
    }

    private static EventoDePago unPagoPorEntregar() {
        return new EventoDePago(
                7L,
                UUID.fromString("00000000-0000-4000-8000-000000000021"),
                TipoDeEventoDePago.PAGO_REGISTRADO,
                new SistemaDeOrigen("rentas"),
                42L,
                1L,
                "{\"pagoId\":\"00000000-0000-4000-8000-000000000021\"}",
                EstadoDelEvento.PENDIENTE,
                0,
                null,
                AHORA,
                null,
                null,
                null,
                null);
    }

    @Nested
    @DisplayName("lo que el cliente decide con la respuesta que llega")
    class ElCliente {

        @Test
        @DisplayName("un 401 SIN credencial: falta la configuracion, y lo dice")
        void unCuatrocientosUnoSinCredencial() {
            estado = 401;
            cuerpoDeRespuesta = "{\"codigo\":\"NO_AUTENTICADO\"}";

            assertThatThrownBy(() -> destino("").entregar(unPagoPorEntregar()))
                    .isInstanceOf(BuzonDelSistemaDeOrigen.NoContesta.class)
                    // El mensaje acaba en `pago_evento.ultimo_error`, que es lo unico que ve quien
                    // atiende la alerta: tiene que decir DONDE se arregla, no solo que fallo.
                    .hasMessageContaining("401")
                    .hasMessageContaining("kamayuk.caja.credencial")
                    .hasMessageContaining("NO es un rechazo del pago")
                    .hasMessageContaining("se REINTENTA")
                    .hasMessageContaining("NO_AUTENTICADO");
        }

        /**
         * <b>El defecto de #96</b>: el 401 y el 403 compartian un mensaje que afirmaba la causa del
         * 401 —«la que esta caja manda no vale»—, y con un 403 eso dice lo contrario de lo que
         * pasa. Los dos van en la misma prueba porque lo que hay que demostrar no es que cada uno
         * diga algo, sino que dicen cosas <b>distintas</b> y que mandan a sitios distintos: el 401
         * a Keycloak, el 403 a la concesion en `identidad`.
         *
         * <p>Y lo va a morder de verdad: {@code identidad}#25 mide que la cuenta de servicio de
         * esta caja esta dada de alta en `rentas` <b>sin ningun permiso</b> sobre {@code
         * caja_tributaria}, que es lo que su {@code PagoController} exige para {@code POST /pagos}.
         * Cuando pase, cada pago pendiente dejara escrito este texto.
         */
        @Test
        @DisplayName("un 401 CON credencial y un 403 dicen cosas DISTINTAS, y mandan a otro sitio")
        void elCuatrocientosUnoYElCuatrocientosTresNoSonLoMismo() {
            estado = 401;
            cuerpoDeRespuesta = "{\"codigo\":\"NO_AUTENTICADO\"}";
            assertThatThrownBy(() -> destino("Bearer el-token").entregar(unPagoPorEntregar()))
                    .as("[con credencial puesta, un 401 SI es «la que mandas no vale»]")
                    .isInstanceOf(BuzonDelSistemaDeOrigen.NoContesta.class)
                    .hasMessageContaining("401")
                    .hasMessageContaining("NO vale o caduco")
                    .hasMessageContaining("Keycloak")
                    .hasMessageNotContaining("PERMISO");

            estado = 403;
            cuerpoDeRespuesta =
                    "{\"codigo\":\"SIN_PRIVILEGIO\",\"detail\":\"No tiene el privilegio REGISTRO"
                            + " sobre caja_tributaria\"}";
            assertThatThrownBy(() -> destino("Bearer el-token").entregar(unPagoPorEntregar()))
                    .as(
                            "[un 403 dice que la credencial VALE: mandar a regenerar un secreto"
                                    + " que esta bien es el defecto de #96, y lo lee un cajero]")
                    .isInstanceOf(BuzonDelSistemaDeOrigen.NoContesta.class)
                    .hasMessageContaining("403")
                    .hasMessageContaining("la credencial SI vale")
                    .hasMessageContaining("PERMISO")
                    .hasMessageContaining("`identidad`")
                    // Y el cuerpo entero cabe: el acceso que falta se llama, y esa palabra es lo
                    // que hay que buscar en `identidad` — no vale que se la coma el recorte.
                    .hasMessageContaining("caja_tributaria")
                    .hasMessageNotContaining("NO vale o caduco");
        }

        @Test
        @DisplayName("el mensaje cabe en `pago_evento.ultimo_error`, y lo que se corta es la cola")
        void elMensajeCabeEnLaColumna() {
            estado = 403;
            // Una pagina de error de un proxy: ni problem+json ni corta.
            cuerpoDeRespuesta = "<html><body>" + "x".repeat(4000) + "</body></html>";

            assertThatThrownBy(() -> destino("Bearer el-token").entregar(unPagoPorEntregar()))
                    .as(
                            "[la columna es varchar(400) y no hay log detras: si el cuerpo se"
                                    + " come el presupuesto, el cajero se queda sin el remedio]")
                    .isInstanceOf(BuzonDelSistemaDeOrigen.NoContesta.class)
                    .hasMessageContaining("la credencial SI vale")
                    .hasMessageContaining("`identidad`")
                    .extracting(fallo -> fallo.getMessage().length())
                    .isEqualTo(LARGO_DE_ULTIMO_ERROR);
        }

        @Test
        @DisplayName(
                "el cuerpo viaja SIN el token: un eco de la peticion no se lleva la credencial")
        void elCuerpoNoSeLlevaElToken() {
            estado = 403;
            cuerpoDeRespuesta =
                    "{\"error\":\"forbidden\",\"peticion\":{\"Authorization\":\"Bearer"
                            + " el-token-de-servicio\"}}";

            assertThatThrownBy(() -> destino("Bearer el-token").entregar(unPagoPorEntregar()))
                    .as(
                            "[este texto se GUARDA en una columna y se pinta en la hoja de cierre:"
                                    + " un token ahi es un incidente, no una molestia]")
                    .isInstanceOf(BuzonDelSistemaDeOrigen.NoContesta.class)
                    .hasMessageContaining("forbidden")
                    .hasMessageNotContaining("el-token-de-servicio");
        }

        @Test
        @DisplayName("EL CONTRASTE: un 422 de negocio sigue siendo `Rechazado`, y tambien dice")
        void unRechazoDeNegocioNoSeReintenta() {
            estado = 422;
            cuerpoDeRespuesta = "{\"codigo\":\"VALIDACION\",\"detail\":\"la orden no existe\"}";

            assertThatThrownBy(() -> destino("Bearer el-token").entregar(unPagoPorEntregar()))
                    .isInstanceOf(BuzonDelSistemaDeOrigen.Rechazado.class)
                    .hasMessageContaining("NO se reintenta")
                    .hasMessageContaining("VALIDACION")
                    .hasMessageContaining("la orden no existe");
        }
    }

    @Nested
    @DisplayName("y lo que eso le hace al evento, que es lo que cuesta dinero")
    class ElEvento {

        private BuzonEnMemoria buzon;
        private EntregarEventos entrega;

        private void conDestino(BuzonDelSistemaDeOrigen destino) {
            buzon = new BuzonEnMemoria();
            Clock reloj = Clock.fixed(AHORA, ZoneOffset.UTC);
            entrega =
                    new EntregarEventos(
                            new AnotarLaEntrega(buzon, reloj),
                            destino,
                            muertos -> {},
                            new ReintentosDeLaEntrega(Duration.ofMinutes(10), Duration.ofHours(24)),
                            reloj);
        }

        private EventoDePago encolado() {
            return buzon.encolar(unPagoPorEntregar());
        }

        @Test
        @DisplayName("con 401 queda REINTENTABLE y PENDIENTE, con UN intento gastado")
        void conCuatrocientosUnoSigueVivo() {
            estado = 401;
            conDestino(destino(""));
            EventoDePago evento = encolado();

            assertThat(entrega.entregarUno(evento))
                    .isEqualTo(EntregarEventos.Resultado.REINTENTABLE);

            EventoDePago despues = buzon.porId(evento.idGuardado()).orElseThrow();
            assertThat(despues.estado()).isEqualTo(EstadoDelEvento.PENDIENTE);
            assertThat(despues.intentos()).isEqualTo(1);
        }

        @Test
        @DisplayName("EL CONTRASTE: con 422 muere al primer intento, que es lo correcto")
        void conCuatrocientosVeintidosMuere() {
            estado = 422;
            conDestino(destino("Bearer el-token"));
            EventoDePago evento = encolado();

            assertThat(entrega.entregarUno(evento)).isEqualTo(EntregarEventos.Resultado.MUERTO);
            assertThat(buzon.porId(evento.idGuardado()).orElseThrow().estado())
                    .isEqualTo(EstadoDelEvento.MUERTO);
        }

        @Test
        @DisplayName("y el 401 se REINTENTA de verdad: la segunda vuelta vuelve a llamar")
        void laSegundaVueltaVuelveALlamar() {
            estado = 401;
            conDestino(destino(""));
            EventoDePago evento = encolado();
            llamadas.set(0);

            entrega.entregarUno(evento);
            EventoDePago trasElPrimero = buzon.porId(evento.idGuardado()).orElseThrow();
            entrega.entregarUno(trasElPrimero);

            // Sin esto, «queda PENDIENTE» se cumpliria con un evento que nadie vuelve a coger: lo
            // que importa no es el estado de la fila sino que el pago llegue cuando la credencial
            // exista, y eso solo lo dice haber llamado dos veces.
            assertThat(llamadas.get()).isEqualTo(2);
            assertThat(buzon.porId(evento.idGuardado()).orElseThrow().intentos()).isEqualTo(2);
        }
    }

    /**
     * #131 — <b>la raya entera</b>: #21 saco de {@code Rechazado} al 401 y al 403, y los demas 4xx
     * seguian matando el pago al primer intento. Entre ellos, los que el HTTP define como pasajeros
     * —408, 425, 429— y los que dicen que la DIRECCION esta mal —un 404 con {@code
     * KAMAYUK_CAJA_ORIGENES} sin {@code /rentas/api/v1}—, que no rechazan un pago: rechazan todos.
     *
     * <p>La expectativa se escribe aqui, aparte de {@code veredictoDe}, y se recorre codigo a
     * codigo: una lista de «los que mueren» copiada del codigo que se prueba no podria fallar.
     */
    @Nested
    @DisplayName("#131 — que codigo mata un pago y cual no, y lo que cada uno dice")
    class LaRayaEntera {

        /** Los 4xx que NO matan un pago. Todos los demas 4xx —menos el 409— lo matan. */
        private static final Set<Integer> CUATROCIENTOS_QUE_SE_REINTENTAN =
                Set.of(401, 403, 404, 405, 408, 415, 421, 425, 429);

        private static final Set<Integer> ACUSES = Set.of(200, 201, 202, 409);

        @Test
        @DisplayName("del 100 al 599, codigo a codigo: solo muere un 4xx que habla del cuerpo")
        void codigoACodigo() {
            List<String> distintos = new ArrayList<>();
            for (int codigo = 100; codigo <= 599; codigo++) {
                Veredicto esperado;
                if (ACUSES.contains(codigo)) {
                    esperado = Veredicto.ENTREGADO;
                } else if (codigo >= 400
                        && codigo < 500
                        && !CUATROCIENTOS_QUE_SE_REINTENTAN.contains(codigo)) {
                    esperado = Veredicto.RECHAZADO;
                } else {
                    esperado = Veredicto.REINTENTAR;
                }
                Veredicto dado = ClienteHttpDelSistemaDeOrigen.veredictoDe(codigo);
                if (dado != esperado) {
                    distintos.add(codigo + ": " + dado + ", y tocaba " + esperado);
                }
            }
            assertThat(distintos)
                    .as(
                            "[matar un pago que se habria entregado solo le cuesta a una persona un"
                                    + " acto a mano; no matar un rechazo, un aviso un dia tarde]")
                    .isEmpty();
        }

        @Test
        @DisplayName("un 429 y un 408 se reintentan: el HTTP los define como «ahora no»")
        void losPasajerosSeReintentan() {
            estado = 429;
            cuerpoDeRespuesta = "{\"detail\":\"demasiadas peticiones\"}";
            assertThatThrownBy(() -> destino("Bearer el-token").entregar(unPagoPorEntregar()))
                    .isInstanceOf(BuzonDelSistemaDeOrigen.NoContesta.class)
                    .hasMessageContaining("429")
                    .hasMessageContaining("NO es un rechazo del pago")
                    .hasMessageContaining("demasiadas peticiones");

            estado = 408;
            assertThatThrownBy(() -> destino("Bearer el-token").entregar(unPagoPorEntregar()))
                    .isInstanceOf(BuzonDelSistemaDeOrigen.NoContesta.class)
                    .hasMessageContaining("408");
        }

        @Test
        @DisplayName(
                "un 404 y un 405 hablan de la direccion: se reintentan, y dicen que linea mirar")
        void laRutaSeReintentaYDiceDondeMirar() {
            for (int codigo : new int[] {404, 405}) {
                estado = codigo;
                cuerpoDeRespuesta = "<html>Not Found</html>";
                assertThatThrownBy(() -> destino("Bearer el-token").entregar(unPagoPorEntregar()))
                        .as("[%d: la ruta mal puesta rechaza TODOS los pagos, no este]", codigo)
                        .isInstanceOf(BuzonDelSistemaDeOrigen.NoContesta.class)
                        .hasMessageContaining(String.valueOf(codigo))
                        .hasMessageContaining("kamayuk.caja.origenes.rentas")
                        .hasMessageContaining("/rentas/api/v1")
                        .hasMessageContaining("NO es un rechazo del pago");
            }
        }

        @Test
        @DisplayName("un 5xx se reintenta, y dice lo que contesto el receptor")
        void unCincoCientosDiceLoQueContesto() {
            estado = 503;
            cuerpoDeRespuesta =
                    "{\"codigo\":\"SERVICIO_NO_DISPONIBLE\",\"detail\":\"la anulacion llego"
                            + " antes que su cobro\"}";
            assertThatThrownBy(() -> destino("Bearer el-token").entregar(unPagoPorEntregar()))
                    .isInstanceOf(BuzonDelSistemaDeOrigen.NoContesta.class)
                    .hasMessageContaining("503")
                    .hasMessageContaining("antes que su cobro");
        }

        @Test
        @DisplayName("un 400 SI es un rechazo, y dice como volver a ponerlo en camino")
        void unCuatrocientosEsUnRechazo() {
            estado = 400;
            cuerpoDeRespuesta = "{\"detail\":\"cuerpo ilegible\"}";
            assertThatThrownBy(() -> destino("Bearer el-token").entregar(unPagoPorEntregar()))
                    .isInstanceOf(BuzonDelSistemaDeOrigen.Rechazado.class)
                    .hasMessageContaining("NO se reintenta")
                    .hasMessageContaining("/pagos/{pagoId}/reintento")
                    .hasMessageContaining("cuerpo ilegible");
        }

        @Test
        @DisplayName("y en el evento: con 429 o 404 queda PENDIENTE y aplazado; con 400, MUERTO")
        void loQueLeHaceAlEvento() {
            Clock reloj = Clock.fixed(AHORA, ZoneOffset.UTC);
            for (int codigo : new int[] {429, 404, 400}) {
                estado = codigo;
                BuzonEnMemoria buzon = new BuzonEnMemoria();
                EntregarEventos entrega =
                        new EntregarEventos(
                                new AnotarLaEntrega(buzon, reloj),
                                destino("Bearer el-token"),
                                muertos -> {},
                                new ReintentosDeLaEntrega(
                                        Duration.ofMinutes(10), Duration.ofHours(24)),
                                reloj);
                EventoDePago evento = buzon.encolar(unPagoPorEntregar());

                EntregarEventos.Resultado resultado = entrega.entregarUno(evento);

                EventoDePago despues = buzon.porId(evento.idGuardado()).orElseThrow();
                if (codigo == 400) {
                    assertThat(resultado).isEqualTo(EntregarEventos.Resultado.MUERTO);
                    assertThat(despues.estado()).isEqualTo(EstadoDelEvento.MUERTO);
                } else {
                    assertThat(resultado)
                            .as("[%d]", codigo)
                            .isEqualTo(EntregarEventos.Resultado.REINTENTABLE);
                    assertThat(despues.estado()).isEqualTo(EstadoDelEvento.PENDIENTE);
                    assertThat(despues.fallandoDesde())
                            .as("[%d: el primer fallo abre la racha]", codigo)
                            .isEqualTo(AHORA);
                    assertThat(despues.noAntesDe()).isNotNull();
                }
            }
        }
    }
}
