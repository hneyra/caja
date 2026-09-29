package kamayuk.caja.nucleo.infraestructura.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import kamayuk.caja.auditoria.RegistroDeAuditoria;
import kamayuk.caja.nucleo.aplicacion.ExplicarPagoSinEntregar;
import kamayuk.caja.nucleo.aplicacion.ReintentarPagoMuerto;
import kamayuk.caja.nucleo.dobles.BuzonEnMemoria;
import kamayuk.caja.nucleo.dominio.EventoDePago;
import kamayuk.caja.nucleo.dominio.SistemaDeOrigen;
import kamayuk.caja.nucleo.dominio.TipoDeEventoDePago;
import kamayuk.caja.web.ConfiguracionDeJson;
import kamayuk.caja.web.ManejadorDeErrores;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.JacksonJsonHttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import tools.jackson.databind.json.JsonMapper;

/**
 * #131 — {@code POST /pagos/{pagoId}/reintento}: el transporte. Que el reintento entregue de verdad
 * lo miden {@code UnaCaidaNoMataElPagoTest} y, contra PostgreSQL, {@code
 * CadaEventoEnSuTransaccionTest}.
 */
@DisplayName("#131 — Capa web: volver a poner en camino un pago muerto")
class PagoControllerTest {

    private static final Instant COBRO = Instant.parse("2026-09-29T14:00:00Z");
    private static final Clock RELOJ = Clock.fixed(COBRO, ZoneOffset.UTC);

    private final BuzonEnMemoria buzon = new BuzonEnMemoria();
    private final List<RegistroDeAuditoria> auditados = new ArrayList<>();

    private final MockMvc mvc =
            MockMvcBuilders.standaloneSetup(
                            new PagoController(
                                    buzon,
                                    new ExplicarPagoSinEntregar(buzon, auditados::add, RELOJ),
                                    new ReintentarPagoMuerto(buzon, auditados::add, RELOJ)))
                    .setControllerAdvice(new ManejadorDeErrores())
                    .setMessageConverters(
                            new JacksonJsonHttpMessageConverter(
                                    JsonMapper.builder()
                                            .addModule(
                                                    new ConfiguracionDeJson()
                                                            .moduloDeObjetosDeValor())
                                            .build()))
                    .build();

    @Test
    @DisplayName("un MUERTO vuelve a PENDIENTE con el mismo pagoId: 200 y el pago")
    void unMuertoVuelve() throws Exception {
        EventoDePago muerto = muerto();

        MvcResult resultado =
                reintento(
                        muerto.eventoId().toString(),
                        "{\"observacion\":\"se corrigio la ruta de rentas\"}");

        assertThat(resultado.getResponse().getStatus()).isEqualTo(200);
        assertThat(resultado.getResponse().getContentAsString())
                .contains("\"pagoId\":\"" + muerto.eventoId() + "\"")
                .contains("\"estado\":\"PENDIENTE\"");
        assertThat(auditados).hasSize(1);
    }

    @Test
    @DisplayName("sin observacion, 422, y el pago sigue MUERTO (regla 10)")
    void sinObservacion() throws Exception {
        EventoDePago muerto = muerto();

        MvcResult resultado = reintento(muerto.eventoId().toString(), "{}");

        assertThat(resultado.getResponse().getStatus()).isEqualTo(422);
        assertThat(buzon.porId(muerto.idGuardado()).orElseThrow().estado().name())
                .isEqualTo("MUERTO");
        assertThat(auditados).isEmpty();
    }

    @Test
    @DisplayName("uno que sigue en camino, 409: la peticion esta bien, el estado no la admite")
    void unPendienteEsConflicto() throws Exception {
        EventoDePago pendiente = buzon.encolar(nuevo());

        MvcResult resultado =
                reintento(pendiente.eventoId().toString(), "{\"observacion\":\"por si acaso\"}");

        assertThat(resultado.getResponse().getStatus()).isEqualTo(409);
    }

    @Test
    @DisplayName("un pagoId que no existe, 404; uno mal escrito, 422")
    void noExisteOMalEscrito() throws Exception {
        assertThat(
                        reintento(UUID.randomUUID().toString(), "{\"observacion\":\"no existe\"}")
                                .getResponse()
                                .getStatus())
                .isEqualTo(404);
        assertThat(
                        reintento("no-es-un-uuid", "{\"observacion\":\"mal escrito\"}")
                                .getResponse()
                                .getStatus())
                .isEqualTo(422);
    }

    private MvcResult reintento(String pagoId, String cuerpo) throws Exception {
        return mvc.perform(
                        MockMvcRequestBuilders.post("/caja/api/v1/pagos/" + pagoId + "/reintento")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(cuerpo))
                .andReturn();
    }

    private EventoDePago muerto() {
        EventoDePago evento = buzon.encolar(nuevo());
        buzon.marcarFallido(
                evento.idGuardado(), 0, "«rentas» rechazo el pago con 422", COBRO, null);
        return buzon.porId(evento.idGuardado()).orElseThrow();
    }

    private static EventoDePago nuevo() {
        return EventoDePago.nuevo(
                UUID.randomUUID(),
                TipoDeEventoDePago.PAGO_REGISTRADO,
                SistemaDeOrigen.de("rentas"),
                42L,
                7L,
                "{}",
                COBRO);
    }
}
