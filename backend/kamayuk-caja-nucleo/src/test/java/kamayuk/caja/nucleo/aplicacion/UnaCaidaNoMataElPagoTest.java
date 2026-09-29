package kamayuk.caja.nucleo.aplicacion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import kamayuk.caja.auditoria.Operacion;
import kamayuk.caja.auditoria.RegistroDeAuditoria;
import kamayuk.caja.dominio.Observacion;
import kamayuk.caja.nucleo.dobles.BuzonEnMemoria;
import kamayuk.caja.nucleo.dobles.RelojQueAvanza;
import kamayuk.caja.nucleo.dominio.BuzonDelSistemaDeOrigen;
import kamayuk.caja.nucleo.dominio.EstadoDelEvento;
import kamayuk.caja.nucleo.dominio.EventoDePago;
import kamayuk.caja.nucleo.dominio.ReintentosDeLaEntrega;
import kamayuk.caja.nucleo.dominio.SistemaDeOrigen;
import kamayuk.caja.nucleo.dominio.TipoDeEventoDePago;
import kamayuk.caja.nucleo.infraestructura.ConfiguracionDeLaEntrega;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * #131 — <b>una caida del sistema de origen no mata un pago, y un pago muerto tiene vuelta.</b>
 *
 * <h2>El defecto</h2>
 *
 * <p>{@code application.yaml} decia que los ocho intentos existian para que «un despliegue de dos
 * minutos del sistema de origen» no despertara a nadie. Pero el publicador intentaba todo lo
 * pendiente en cada vuelta —cada diez segundos, sin espera propia— y mataba el pago al octavo
 * fallo: MUERTO a los 70 s de caida, con alerta a una persona, y para siempre.
 *
 * <h2>Como se mide</h2>
 *
 * <p>Se recorre el tiempo <b>vuelta a vuelta</b>, cada diez segundos como el publicador, con un
 * {@link RelojQueAvanza}: una caida de un dia se recorre en milisegundos y el instante de cada
 * llamada al origen se puede escribir en la prueba. Y con los reintentos <b>de produccion</b>
 * ({@link ConfiguracionDeLaEntrega#porOmision()}): lo que tiene que cubrir el despliegue de dos
 * minutos es lo que se despliega, no una configuracion de prueba.
 *
 * <p>El buzon es el de memoria: el filtro por {@code no_antes_de} y la racha de {@code
 * fallando_desde} contra PostgreSQL los mide {@code CadaEventoEnSuTransaccionTest}.
 */
@DisplayName("#131 — una caida del origen no mata un pago, y un pago muerto tiene vuelta")
class UnaCaidaNoMataElPagoTest {

    private static final Instant COBRO = Instant.parse("2026-09-29T14:00:00Z");

    /** La vuelta del publicador: {@code kamayuk.caja.entrega.intervalo} por omision. */
    private static final Duration VUELTA = Duration.ofSeconds(10);

    private static final ReintentosDeLaEntrega DE_PRODUCCION =
            ConfiguracionDeLaEntrega.porOmision();

    private final RelojQueAvanza reloj = new RelojQueAvanza(COBRO, ZoneOffset.UTC);
    private final BuzonEnMemoria buzon = new BuzonEnMemoria();
    private final OrigenQueSeCae origen = new OrigenQueSeCae(reloj);
    private final List<List<UUID>> avisos = new ArrayList<>();
    private final EntregarEventos entrega =
            new EntregarEventos(
                    new AnotarLaEntrega(buzon, reloj),
                    origen,
                    muertos -> avisos.add(muertos.stream().map(EventoDePago::eventoId).toList()),
                    DE_PRODUCCION,
                    reloj);

    @Test
    @DisplayName("los reintentos de produccion son 10 min de tope y un dia de plazo")
    void losDeProduccion() {
        // Sin esto, todo lo de abajo podria estar midiendo otra configuracion sin decirlo.
        assertThat(DE_PRODUCCION)
                .isEqualTo(new ReintentosDeLaEntrega(Duration.ofMinutes(10), Duration.ofHours(24)));
    }

    @Nested
    @DisplayName("el plazo es un tiempo, y cubre la caida")
    class ElPlazo {

        /**
         * <b>El defecto de #131, tal cual lo nombra el comentario de {@code application.yaml}.</b>
         * Hasta #131 este pago moria a los 70 s, en el octavo fallo.
         */
        @Test
        @DisplayName(
                "el despliegue de dos minutos: seis llamadas, la ultima a los 160 s, y el pago"
                        + " llega sin morir ni avisar")
        void elDespliegueDeDosMinutos() {
            EventoDePago pago = cobrar();
            origen.caidoDurante(Duration.ofSeconds(120));

            recorrer(Duration.ofMinutes(5));

            assertThat(origen.segundosDeCadaLlamada(pago))
                    .as(
                            "[cada intento espera lo que el pago lleva fallando: 0, 10, 20, 40, 80;"
                                    + " el origen vuelve a los 120 y el de los 160 entra]")
                    .containsExactly(0L, 10L, 20L, 40L, 80L, 160L);
            EventoDePago despues = buzon.porId(pago.idGuardado()).orElseThrow();
            assertThat(despues.estado()).isEqualTo(EstadoDelEvento.ENTREGADO);
            assertThat(despues.entregadoEn()).isEqualTo(COBRO.plusSeconds(160));
            assertThat(avisos).as("nadie se despierta por un despliegue").isEmpty();
        }

        @Test
        @DisplayName(
                "una hora de caida: no muere, y sale a menos de diez minutos de que el origen"
                        + " vuelva")
        void unaHoraDeCaida() {
            EventoDePago pago = cobrar();
            origen.caidoDurante(Duration.ofHours(1));

            recorrer(Duration.ofHours(2));

            EventoDePago despues = buzon.porId(pago.idGuardado()).orElseThrow();
            assertThat(despues.estado()).isEqualTo(EstadoDelEvento.ENTREGADO);
            assertThat(despues.entregadoEn())
                    .as(
                            "[el tope de la espera: sin el, la espera seguiria doblandose y el"
                                    + " pago saldria media hora despues de que el origen vuelva]")
                    .isBefore(COBRO.plus(Duration.ofHours(1)).plus(DE_PRODUCCION.esperaMaxima()))
                    .isAfterOrEqualTo(COBRO.plus(Duration.ofHours(1)));
            assertThat(origen.segundosDeCadaLlamada(pago))
                    .as("[y sin martillear: una llamada cada diez minutos, no una por vuelta]")
                    .hasSizeLessThan(20);
            assertThat(avisos).isEmpty();
        }

        @Test
        @DisplayName(
                "caido para siempre: sigue PENDIENTE un minuto antes del dia, MUERE en el primer"
                        + " fallo pasado el dia, y avisa UNA vez")
        void caidoParaSiempre() {
            EventoDePago pago = cobrar();
            origen.caidoDurante(Duration.ofDays(3650));

            recorrer(DE_PRODUCCION.plazo().minusMinutes(1));
            assertThat(buzon.porId(pago.idGuardado()).orElseThrow().estado())
                    .as("[un dia menos un minuto despues del primer fallo, sigue en camino]")
                    .isEqualTo(EstadoDelEvento.PENDIENTE);
            assertThat(avisos).isEmpty();

            recorrer(DE_PRODUCCION.esperaMaxima().plus(VUELTA).plusMinutes(1));

            EventoDePago muerto = buzon.porId(pago.idGuardado()).orElseThrow();
            assertThat(muerto.estado()).isEqualTo(EstadoDelEvento.MUERTO);
            Instant ultima = origen.llamadas(pago).get(origen.llamadas(pago).size() - 1);
            assertThat(ultima)
                    .as("[muere en el primer fallo que llega con el plazo cumplido, no antes]")
                    .isAfterOrEqualTo(COBRO.plus(DE_PRODUCCION.plazo()))
                    .isBefore(
                            COBRO.plus(DE_PRODUCCION.plazo())
                                    .plus(DE_PRODUCCION.esperaMaxima())
                                    .plus(VUELTA));
            assertThat(muerto.intentos())
                    .as(
                            "[unos ciento cincuenta en un dia —seis por hora pasados los diez"
                                    + " minutos—, no los 8.640 de una llamada por vuelta]")
                    .isBetween(140, 160);
            assertThat(avisos).containsExactly(List.of(pago.eventoId()));
        }

        @Test
        @DisplayName("un rechazo del receptor no espera a nada: muere en el acto")
        void unRechazoMuereEnElActo() {
            EventoDePago pago = cobrar();
            origen.rechaza = true;

            recorrer(VUELTA);

            assertThat(buzon.porId(pago.idGuardado()).orElseThrow().estado())
                    .isEqualTo(EstadoDelEvento.MUERTO);
            assertThat(origen.llamadas(pago)).hasSize(1);
        }
    }

    @Nested
    @DisplayName("y un MUERTO se vuelve a poner en camino, con su observacion")
    class ElReintento {

        private final List<RegistroDeAuditoria> auditados = new ArrayList<>();
        private final ReintentarPagoMuerto reintentar =
                new ReintentarPagoMuerto(buzon, auditados::add, reloj);

        @Test
        @DisplayName("la vuelta siguiente lo entrega con el MISMO pagoId, y el acto queda auditado")
        void vuelveAlCaminoConElMismoPagoId() {
            EventoDePago pago = cobrar();
            origen.rechaza = true;
            recorrer(VUELTA);
            assertThat(buzon.porId(pago.idGuardado()).orElseThrow().estado())
                    .isEqualTo(EstadoDelEvento.MUERTO);

            origen.rechaza = false;
            EventoDePago enCamino =
                    reintentar.reintentar(
                            pago.eventoId(),
                            Observacion.de("rentas corrigio la orden; se vuelve a mandar"));

            assertThat(enCamino.estado()).isEqualTo(EstadoDelEvento.PENDIENTE);
            assertThat(enCamino.eventoId()).isEqualTo(pago.eventoId());
            assertThat(enCamino.intentos())
                    .as("[los intentos cuentan llamadas de verdad: no se ponen a cero]")
                    .isEqualTo(1);
            assertThat(enCamino.fallandoDesde()).as("[el plazo empieza de nuevo]").isNull();
            assertThat(enCamino.noAntesDe()).isNull();
            assertThat(auditados)
                    .singleElement()
                    .satisfies(
                            registro -> {
                                assertThat(registro.tabla()).isEqualTo("pago_evento");
                                assertThat(registro.clave())
                                        .isEqualTo(String.valueOf(pago.idGuardado()));
                                assertThat(registro.operacion()).isEqualTo(Operacion.MODIFICACION);
                                assertThat(registro.observacion().texto())
                                        .isEqualTo("rentas corrigio la orden; se vuelve a mandar");
                                assertThat(registro.datosAnteriores()).contains("\"MUERTO\"");
                                assertThat(registro.datosNuevos()).contains("\"PENDIENTE\"");
                            });

            recorrer(VUELTA);

            EventoDePago entregado = buzon.porId(pago.idGuardado()).orElseThrow();
            assertThat(entregado.estado()).isEqualTo(EstadoDelEvento.ENTREGADO);
            assertThat(origen.pagoIds())
                    .as(
                            "[el receptor deduplica por pagoId (ADR-0026 §3): uno nuevo seria un"
                                    + " segundo pago]")
                    .containsExactly(pago.eventoId(), pago.eventoId());
        }

        @Test
        @DisplayName("muerto por el plazo y puesto en camino, el fallo siguiente NO lo remata")
        void elPlazoEmpiezaDeNuevo() {
            EventoDePago pago = cobrar();
            origen.caidoDurante(Duration.ofDays(3650));
            recorrer(DE_PRODUCCION.plazo().plus(DE_PRODUCCION.esperaMaxima()).plus(VUELTA));
            assertThat(buzon.porId(pago.idGuardado()).orElseThrow().estado())
                    .isEqualTo(EstadoDelEvento.MUERTO);

            reintentar.reintentar(pago.eventoId(), Observacion.de("se probo de nuevo la ruta"));
            recorrer(VUELTA);

            assertThat(buzon.porId(pago.idGuardado()).orElseThrow().estado())
                    .as(
                            "[si la racha vieja siguiera, el primer fallo tras ponerlo en camino lo"
                                    + " mataria otra vez sin haberlo intentado de verdad]")
                    .isEqualTo(EstadoDelEvento.PENDIENTE);
        }

        @Test
        @DisplayName("solo desde MUERTO: ni el PENDIENTE, ni el ENTREGADO, ni el EXPLICADO")
        void soloDesdeMuerto() {
            EventoDePago pendiente = cobrar();
            assertThatThrownBy(
                            () ->
                                    reintentar.reintentar(
                                            pendiente.eventoId(), Observacion.de("por si acaso")))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("MUERTO");

            recorrer(VUELTA);
            assertThat(buzon.porId(pendiente.idGuardado()).orElseThrow().estado())
                    .isEqualTo(EstadoDelEvento.ENTREGADO);
            assertThatThrownBy(
                            () ->
                                    reintentar.reintentar(
                                            pendiente.eventoId(), Observacion.de("otra vez")))
                    .isInstanceOf(IllegalStateException.class);

            EventoDePago explicado = cobrar();
            origen.rechaza = true;
            recorrer(VUELTA);
            buzon.explicar(explicado.idGuardado(), "Se registro a mano en rentas, memorando 9");
            assertThatThrownBy(
                            () ->
                                    reintentar.reintentar(
                                            explicado.eventoId(),
                                            Observacion.de("mejor que llegue solo")))
                    .as(
                            "[un EXPLICADO pudo registrarse a mano en el origen con otro"
                                    + " identificador: entregarlo seria el segundo asiento]")
                    .isInstanceOf(IllegalStateException.class);

            assertThat(auditados).as("y lo que no se hizo no se audita").isEmpty();
        }

        @Test
        @DisplayName("un pagoId que no existe es PagoInexistente, y no se audita nada")
        void unPagoQueNoExiste() {
            assertThatThrownBy(
                            () ->
                                    reintentar.reintentar(
                                            UUID.fromString("00000000-0000-4000-8000-000000000131"),
                                            Observacion.de("no deberia estar")))
                    .isInstanceOf(ExplicarPagoSinEntregar.PagoInexistente.class);
            assertThat(auditados).isEmpty();
        }
    }

    // ------------------------------------------------------------------

    /** Encola un pago cobrado AHORA, como lo dejaria la transaccion del cobro. */
    private EventoDePago cobrar() {
        UUID pagoId = UUID.randomUUID();
        return buzon.encolar(
                EventoDePago.nuevo(
                        pagoId,
                        TipoDeEventoDePago.PAGO_REGISTRADO,
                        SistemaDeOrigen.de("rentas"),
                        42L,
                        7L,
                        "{\"pagoId\":\"" + pagoId + "\"}",
                        reloj.instant()));
    }

    /** Vueltas del publicador, una cada {@link #VUELTA}, durante {@code cuanto}. */
    private void recorrer(Duration cuanto) {
        Instant hasta = reloj.instant().plus(cuanto);
        while (reloj.instant().isBefore(hasta)) {
            entrega.entregarPendientes();
            reloj.avanzar(VUELTA);
        }
    }

    /**
     * El sistema de origen: caido hasta un instante, o rechazando; anota cada llamada con su hora.
     */
    private static final class OrigenQueSeCae implements BuzonDelSistemaDeOrigen {

        private final RelojQueAvanza reloj;
        private final List<UUID> pagoIds = new ArrayList<>();
        private final List<Instant> instantes = new ArrayList<>();
        private Instant caidoHasta = Instant.MIN;
        private boolean rechaza;

        OrigenQueSeCae(RelojQueAvanza reloj) {
            this.reloj = reloj;
        }

        void caidoDurante(Duration cuanto) {
            caidoHasta = reloj.instant().plus(cuanto);
        }

        @Override
        public void entregar(EventoDePago evento) {
            pagoIds.add(evento.eventoId());
            instantes.add(reloj.instant());
            if (rechaza) {
                throw new BuzonDelSistemaDeOrigen.Rechazado("«rentas» rechazo el pago con 422");
            }
            if (reloj.instant().isBefore(caidoHasta)) {
                throw new BuzonDelSistemaDeOrigen.NoContesta("«rentas» no contesta");
            }
        }

        List<UUID> pagoIds() {
            return List.copyOf(pagoIds);
        }

        List<Instant> llamadas(EventoDePago pago) {
            List<Instant> suyas = new ArrayList<>();
            for (int i = 0; i < pagoIds.size(); i++) {
                if (pagoIds.get(i).equals(pago.eventoId())) {
                    suyas.add(instantes.get(i));
                }
            }
            return suyas;
        }

        /** Los segundos desde el cobro de cada llamada por ese pago. */
        List<Long> segundosDeCadaLlamada(EventoDePago pago) {
            return llamadas(pago).stream()
                    .map(instante -> Duration.between(pago.creadoEn(), instante).toSeconds())
                    .toList();
        }
    }
}
