package kamayuk.caja.nucleo.aplicacion;

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
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.IntSupplier;
import java.util.function.Supplier;
import kamayuk.caja.nucleo.dobles.BuzonEnMemoria;
import kamayuk.caja.nucleo.dominio.BuzonDelSistemaDeOrigen;
import kamayuk.caja.nucleo.dominio.EstadoDelEvento;
import kamayuk.caja.nucleo.dominio.EventoDePago;
import kamayuk.caja.nucleo.dominio.SistemaDeOrigen;
import kamayuk.caja.nucleo.dominio.TipoDeEventoDePago;
import kamayuk.caja.nucleo.infraestructura.BuzonHttpDelSistemaDeOrigen;
import kamayuk.caja.nucleo.infraestructura.ClienteHttpDelSistemaDeOrigen;
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
 */
@DisplayName("#21 AC-3 — un 401 se reintenta; un rechazo de negocio, no")
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
                null);
    }

    @Nested
    @DisplayName("lo que el cliente decide con la respuesta que llega")
    class ElCliente {

        @Test
        @DisplayName("un 401 es `NoContesta`, y el mensaje dice que falta la credencial")
        void unCuatrocientosUnoSeReintenta() {
            estado = 401;
            cuerpoDeRespuesta = "{\"codigo\":\"NO_AUTENTICADO\"}";

            assertThatThrownBy(() -> destino("").entregar(unPagoPorEntregar()))
                    .isInstanceOf(BuzonDelSistemaDeOrigen.NoContesta.class)
                    // El mensaje acaba en `pago_evento.ultimo_error`, que es lo unico que ve quien
                    // atiende la alerta: tiene que decir DONDE se arregla, no solo que fallo.
                    .hasMessageContaining("401")
                    .hasMessageContaining("kamayuk.caja.credencial")
                    .hasMessageContaining("NO es un rechazo del pago")
                    .hasMessageContaining("se REINTENTA");
        }

        @Test
        @DisplayName("un 403 tambien: se le concede el acceso y los pagos encolados salen solos")
        void unCuatrocientosTresSeReintenta() {
            estado = 403;

            assertThatThrownBy(() -> destino("Bearer el-token").entregar(unPagoPorEntregar()))
                    .isInstanceOf(BuzonDelSistemaDeOrigen.NoContesta.class)
                    // Con credencial puesta el diagnostico es el OTRO, y por eso se distinguen: no
                    // es «pon la linea» sino «la que mandas no vale».
                    .hasMessageContaining("la que esta caja manda no vale");
        }

        @Test
        @DisplayName("EL CONTRASTE: un 422 de negocio sigue siendo `Rechazado`")
        void unRechazoDeNegocioNoSeReintenta() {
            estado = 422;
            cuerpoDeRespuesta = "{\"codigo\":\"VALIDACION\",\"mensaje\":\"la orden no existe\"}";

            assertThatThrownBy(() -> destino("Bearer el-token").entregar(unPagoPorEntregar()))
                    .isInstanceOf(BuzonDelSistemaDeOrigen.Rechazado.class)
                    .hasMessageContaining("NO se reintenta");
        }
    }

    @Nested
    @DisplayName("y lo que eso le hace al evento, que es lo que cuesta dinero")
    class ElEvento {

        private BuzonEnMemoria buzon;
        private EntregarEventos entrega;

        private void conDestino(BuzonDelSistemaDeOrigen destino) {
            buzon = new BuzonEnMemoria();
            entrega =
                    new EntregarEventos(
                            buzon, destino, muertos -> {}, 8, Clock.fixed(AHORA, ZoneOffset.UTC));
        }

        private EventoDePago encolado() {
            return buzon.encolar(unPagoPorEntregar());
        }

        @Test
        @DisplayName("con 401 queda REINTENTABLE y PENDIENTE, con UN intento gastado de ocho")
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
}
