package kamayuk.caja.seguridad.aplicacion;

import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import kamayuk.caja.seguridad.AlertaDeEventosSinAplicar;
import kamayuk.caja.seguridad.EventoDeIdentidadRecibido;
import kamayuk.caja.seguridad.FuenteDeEventosDeIdentidad;
import kamayuk.caja.seguridad.infraestructura.AlertaDeIdentidadEnElRegistro;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/**
 * Lo que una vuelta ESCRIBE, medido en el registro y no en la copia (hallazgos H6 y H7 de la medida
 * de AC-5 y AC-6 con las cinco aplicaciones levantadas).
 *
 * <h2>Por que esto se prueba, si no cambia ni una fila</h2>
 *
 * <p>El registro del pod es lo unico que un `CronJob` deja detras. Una implantacion entera producia
 * aqui <b>159 lineas</b> —una por cada permiso de otro sistema— y una linea de resumen que decia
 * «174 acusados; quedan 174», que se lee como que la corrida no avanzo justo cuando acababa de
 * vaciar el buzon. Las dos cosas son del registro y ninguna prueba de la copia las ve: por eso
 * estas leen el registro de verdad con un {@link ListAppender}.
 *
 * <p>Sin base de datos: el aplicador es un doble que decide por el tipo del evento. Lo que se mide
 * es lo que la vuelta CUENTA y DICE.
 */
@DisplayName("Etapa 4 — lo que una vuelta del consumidor escribe en el registro")
class ElRegistroDeUnaVueltaTest {

    private static final Instant AHORA = Instant.parse("2026-09-09T23:00:00Z");

    private ListAppender<ILoggingEvent> registro;
    private ch.qos.logback.classic.Logger logger;

    @BeforeEach
    void escuchar() {
        registro = new ListAppender<>();
        registro.start();
        logger =
                (ch.qos.logback.classic.Logger)
                        LoggerFactory.getLogger(ConsumirEventosDeIdentidad.class);
        logger.addAppender(registro);
    }

    @AfterEach
    void dejarDeEscuchar() {
        logger.detachAppender(registro);
    }

    private List<String> lineas() {
        List<String> textos = new ArrayList<>();
        for (ILoggingEvent linea : registro.list) {
            textos.add(linea.getFormattedMessage());
        }
        return textos;
    }

    @Nested
    @DisplayName("H6 — el ruido")
    class ElRuido {

        @Test
        @DisplayName("cinco permisos de otros sistemas dejan UNA linea de resumen, no cinco")
        void unaLineaDeResumen() {
            ConsumirEventosDeIdentidad.Vuelta vuelta =
                    consumidorCon(pagina(5, "PERMISO_FIJADO", AHORA), 5).consumir();

            assertThat(vuelta.ajenos()).isEqualTo(5);
            // Toda linea que hable de un sistema ajeno, en singular o en plural: lo que se mide es
            // CUANTAS lineas deja el mismo hecho, no como estan redactadas.
            List<String> deOtrosSistemas =
                    lineas().stream()
                            .filter((l) -> l.toLowerCase(java.util.Locale.ROOT).contains("sistema"))
                            .toList();
            assertThat(deOtrosSistemas)
                    .as(
                            "[H6: una linea por evento eran 159 en una implantacion entera de esta"
                                    + " caja —la mayoria de los 161 accesos del catalogo unido son de"
                                    + " otros sistemas—, asi que el registro de la corrida no decia"
                                    + " otra cosa. Una por vuelta, con la cuenta dentro]")
                    .hasSize(1);
            assertThat(deOtrosSistemas.getFirst()).contains("5 permiso(s) de otros sistemas");
        }

        @Test
        @DisplayName("CONTRASTE: una vuelta sin ninguno ajeno no dice nada de otros sistemas")
        void sinAjenosNoDiceNada() {
            consumidorCon(pagina(3, "GRUPO_DADO_DE_ALTA", AHORA), 3).consumir();

            assertThat(lineas().stream().filter((l) -> l.contains("otros sistemas")).toList())
                    .as("una guarda que grita en lo corriente se acaba apagando")
                    .isEmpty();
        }
    }

    @Nested
    @DisplayName("H6 — «quedan N» se cuenta DESPUES del acuse")
    class LoQueQueda {

        @Test
        @DisplayName("una vuelta que acusa la pagina entera deja el buzon en cero, y lo dice")
        void laPaginaEntera() {
            ConsumirEventosDeIdentidad.Vuelta vuelta =
                    consumidorCon(pagina(174, "GRUPO_DADO_DE_ALTA", AHORA), 174).consumir();

            assertThat(vuelta.acusados()).isEqualTo(174);
            assertThat(vuelta.quedanTrasElAcuse())
                    .as(
                            "[H6: `identidad` cuenta «quedan» al SERVIR la pagina y con la pagina"
                                    + " dentro, asi que publicarlo crudo daba «174 acusados; quedan"
                                    + " 174» — que se lee como que la corrida no avanzo cuando acababa"
                                    + " de vaciar el buzon]")
                    .isZero();
            assertThat(vuelta.toString()).contains("174 acusados y quedan 0");
        }

        @Test
        @DisplayName("y lo que se pospone SIGUE contando: no se acusa, asi que no baja")
        void loPospuestoSigueContando() {
            List<EventoDeIdentidadRecibido> pagina =
                    new ArrayList<>(pagina(9, "GRUPO_DADO_DE_ALTA", AHORA));
            pagina.add(evento(99, "MIEMBRO_AFILIADO", AHORA));

            ConsumirEventosDeIdentidad.Vuelta vuelta = consumidorCon(pagina, 10).consumir();

            assertThat(vuelta.acusados()).isEqualTo(9);
            assertThat(vuelta.pendientes()).isEqualTo(1);
            assertThat(vuelta.quedanTrasElAcuse()).isEqualTo(1);
        }

        @Test
        @DisplayName("CONTRASTE: con el acuse rechazado no se acuso nada, y el buzon no baja")
        void conElAcuseRechazado() {
            BuzonDeMentira buzon = new BuzonDeMentira(pagina(10, "GRUPO_DADO_DE_ALTA", AHORA), 10);
            buzon.rechaza = true;

            ConsumirEventosDeIdentidad.Vuelta vuelta = consumidorCon(buzon).consumir();

            assertThat(vuelta.acusados()).isZero();
            assertThat(vuelta.quedanTrasElAcuse())
                    .as("los diez siguen ahi: el emisor los volvera a servir")
                    .isEqualTo(10);
        }
    }

    @Nested
    @DisplayName("H7 — el aviso de los pospuestos")
    class ElAviso {

        @Test
        @DisplayName("avisa de los que pasan de quince minutos y solo de ellos, con un mismo ahora")
        void soloLosViejos() {
            AlertaQueAnota alerta = new AlertaQueAnota();
            EventoDeIdentidadRecibido viejo =
                    evento(41, "MIEMBRO_AFILIADO", AHORA.minus(Duration.ofMinutes(16)));
            EventoDeIdentidadRecibido reciente =
                    evento(42, "MIEMBRO_AFILIADO", AHORA.minus(Duration.ofMinutes(2)));

            int avisados =
                    consumidorCon(new BuzonDeMentira(List.of(), 0), alerta)
                            .avisarDeLosPospuestosQueLlevanDemasiado(List.of(viejo, reciente));

            assertThat(avisados).isEqualTo(1);
            assertThat(alerta.listas).hasSize(1);
            assertThat(alerta.listas.getFirst()).containsExactly(viejo);
            assertThat(alerta.umbrales.getFirst()).isEqualTo(Duration.ofMinutes(15));
            assertThat(alerta.instantes.getFirst())
                    .as("un solo instante para toda la lista, o las edades no cuadran entre si")
                    .isEqualTo(AHORA);
        }

        @Test
        @DisplayName("CONTRASTE: si ninguno pasa del umbral no se llama a la alerta")
        void ningunoPasa() {
            AlertaQueAnota alerta = new AlertaQueAnota();

            int avisados =
                    consumidorCon(new BuzonDeMentira(List.of(), 0), alerta)
                            .avisarDeLosPospuestosQueLlevanDemasiado(
                                    List.of(evento(1, "MIEMBRO_AFILIADO", AHORA.minusSeconds(60))));

            assertThat(avisados).isZero();
            assertThat(alerta.listas).isEmpty();
        }

        @Test
        @DisplayName("y el aviso nombra tipo, sujeto, secuencia y edad de cada uno")
        void loQueDiceElAviso() {
            ListAppender<ILoggingEvent> deLaAlerta = new ListAppender<>();
            deLaAlerta.start();
            ch.qos.logback.classic.Logger suLogger =
                    (ch.qos.logback.classic.Logger)
                            LoggerFactory.getLogger(AlertaDeIdentidadEnElRegistro.class);
            suLogger.addAppender(deLaAlerta);
            try {
                new AlertaDeIdentidadEnElRegistro("Jefe de rentas", "jefe@example.pe")
                        .hayEventosPospuestos(
                                List.of(
                                        evento(
                                                41,
                                                "MIEMBRO_AFILIADO",
                                                AHORA.minus(Duration.ofMinutes(23)))),
                                AHORA,
                                Duration.ofMinutes(15));

                assertThat(deLaAlerta.list).hasSize(1);
                assertThat(deLaAlerta.list.getFirst().getLevel()).isEqualTo(Level.ERROR);
                assertThat(deLaAlerta.list.getFirst().getFormattedMessage())
                        .as(
                                "sin el tipo, el sujeto y la secuencia, quien lo reciba no puede ir a mirarlo")
                        .contains("MIEMBRO_AFILIADO sujeto 7, secuencia 41, lleva 23 min")
                        .contains("mas de 15 min")
                        .contains("Jefe de rentas <jefe@example.pe>");
            } finally {
                suLogger.detachAppender(deLaAlerta);
            }
        }
    }

    // ------------------------------------------------------------------

    private static List<EventoDeIdentidadRecibido> pagina(
            int cuantos, String tipo, Instant creadoEn) {
        List<EventoDeIdentidadRecibido> eventos = new ArrayList<>();
        for (int i = 0; i < cuantos; i++) {
            eventos.add(evento(i + 1, tipo, creadoEn));
        }
        return List.copyOf(eventos);
    }

    private static EventoDeIdentidadRecibido evento(long secuencia, String tipo, Instant creadoEn) {
        return new EventoDeIdentidadRecibido(
                UUID.randomUUID(), secuencia, tipo, 7L, "{}", "a".repeat(64), creadoEn);
    }

    private static ConsumirEventosDeIdentidad consumidorCon(
            List<EventoDeIdentidadRecibido> pagina, long quedan) {
        return consumidorCon(new BuzonDeMentira(pagina, quedan));
    }

    private static ConsumirEventosDeIdentidad consumidorCon(FuenteDeEventosDeIdentidad buzon) {
        return consumidorCon(buzon, new AlertaQueAnota());
    }

    private static ConsumirEventosDeIdentidad consumidorCon(
            FuenteDeEventosDeIdentidad buzon, AlertaDeEventosSinAplicar alerta) {
        return new ConsumirEventosDeIdentidad(
                buzon,
                new AplicadorQueDecidePorElTipo(),
                alerta,
                Clock.fixed(AHORA, ZoneOffset.UTC));
    }

    /** Sirve UNA pagina y despues nada. `quedan` es lo que el emisor dice AL SERVIRLA. */
    private static final class BuzonDeMentira implements FuenteDeEventosDeIdentidad {
        private final List<EventoDeIdentidadRecibido> pagina;
        private final long quedan;
        private boolean rechaza;
        private boolean servida;

        BuzonDeMentira(List<EventoDeIdentidadRecibido> pagina, long quedan) {
            this.pagina = pagina;
            this.quedan = quedan;
        }

        @Override
        public Lote pendientes(int limite) {
            if (servida) {
                return new Lote(List.of(), 0);
            }
            servida = true;
            return new Lote(pagina, quedan);
        }

        @Override
        public Acuse acusar(List<UUID> eventoIds) {
            if (rechaza) {
                throw new AcuseRechazado(422, "{\"codigo\":\"VALIDACION\"}");
            }
            return new Acuse(eventoIds.size(), eventoIds.size(), 0);
        }
    }

    /** Sin base: un permiso es de otro sistema, una afiliacion se pospone, lo demas entra. */
    private static final class AplicadorQueDecidePorElTipo extends AplicarUnEventoDeIdentidad {
        AplicadorQueDecidePorElTipo() {
            super(
                    JdbcClient.create(new DriverManagerDataSource()),
                    tools.jackson.databind.json.JsonMapper.builder().build(),
                    Clock.systemUTC());
        }

        @Override
        public Aplicacion aplicar(EventoDeIdentidadRecibido evento) {
            return switch (evento.tipoPublicado()) {
                case "PERMISO_FIJADO" -> Aplicacion.IGNORADO_AJENO;
                case "MIEMBRO_AFILIADO" ->
                        throw new TodaviaNo("el grupo que nombra no esta en esta copia todavia");
                default -> Aplicacion.APLICADO;
            };
        }
    }

    /** Anota lo que se le pide avisar, sin componer prosa. */
    private static final class AlertaQueAnota implements AlertaDeEventosSinAplicar {
        private final List<List<EventoDeIdentidadRecibido>> listas = new ArrayList<>();
        private final List<Instant> instantes = new ArrayList<>();
        private final List<Duration> umbrales = new ArrayList<>();

        @Override
        public void hayUnEventoSinAplicar(
                EventoDeIdentidadRecibido evento, String motivo, long apartados) {
            throw new AssertionError("aqui no se aparta nada: " + motivo);
        }

        @Override
        public void hayEventosPospuestos(
                List<EventoDeIdentidadRecibido> pospuestos, Instant ahora, Duration umbral) {
            listas.add(List.copyOf(pospuestos));
            instantes.add(ahora);
            umbrales.add(umbral);
        }
    }
}
