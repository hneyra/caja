package kamayuk.caja.caja.infraestructura.web;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import kamayuk.caja.auditoria.Origen;
import kamayuk.caja.auditoria.OrigenContext;
import kamayuk.caja.auditoria.RegistroDeAuditoria;
import kamayuk.caja.autorizacion.ComprobadorDeAcceso;
import kamayuk.caja.autorizacion.Privilegio;
import kamayuk.caja.caja.aplicacion.AbrirCaja;
import kamayuk.caja.caja.aplicacion.AnularRecibo;
import kamayuk.caja.caja.aplicacion.CobrarOrdenes;
import kamayuk.caja.caja.aplicacion.ConsultaDeRecibos;
import kamayuk.caja.caja.aplicacion.DuplicadoDeRecibo;
import kamayuk.caja.caja.dobles.BuzonEnMemoria;
import kamayuk.caja.caja.dobles.CajasEnMemoria;
import kamayuk.caja.caja.dobles.MovimientosEnMemoria;
import kamayuk.caja.caja.dobles.OrdenesEnMemoria;
import kamayuk.caja.caja.dobles.RecibosEnMemoria;
import kamayuk.caja.caja.dobles.TurnosEnMemoria;
import kamayuk.caja.caja.dominio.Caja;
import kamayuk.caja.caja.dominio.EstadoDeRecibo;
import kamayuk.caja.caja.dominio.FormaDePago;
import kamayuk.caja.caja.dominio.OrdenDeCobro;
import kamayuk.caja.caja.dominio.Pagador;
import kamayuk.caja.caja.dominio.Recibo;
import kamayuk.caja.caja.dominio.SistemaDeOrigen;
import kamayuk.caja.caja.infraestructura.ComponedorDeEventosJson;
import kamayuk.caja.documentos.GeneradorDeDocumentos;
import kamayuk.caja.documentos.RegimenDeLaInstalacion;
import kamayuk.caja.documentos.RenderizadorPdf;
import kamayuk.caja.documentos.RenderizadorRtf;
import kamayuk.caja.documentos.RenderizadorXls;
import kamayuk.caja.dominio.Dinero;
import kamayuk.caja.dominio.Observacion;
import kamayuk.caja.web.ConfiguracionDeJson;
import kamayuk.caja.web.ManejadorDeErrores;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.http.converter.ByteArrayHttpMessageConverter;
import org.springframework.http.converter.json.JacksonJsonHttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import tools.jackson.databind.json.JsonMapper;

/**
 * #34 — Capa web: se prueba el transporte y los codigos de respuesta, no la persistencia —eso lo
 * verifica {@code ReciboJdbcTest} contra PostgreSQL real—.
 */
@DisplayName("Capa web — /caja/api/v1/recibos")
class ReciboControllerTest {

    private static final LocalDate HOY = LocalDate.of(2026, 3, 15);
    private static final Clock RELOJ =
            Clock.fixed(HOY.atStartOfDay(ZoneOffset.UTC).toInstant(), ZoneOffset.UTC);

    private static final String CAJERO = "cajero.prueba";

    /** La raiz cambio con P5D: esta base ya no se sirve bajo `/rentas`. */
    private static final String RECIBOS = "/caja/api/v1/recibos";

    /**
     * Y la anulacion se mudo de recurso: cuelga de {@code /cobros}, no de {@code /recibos}.
     *
     * <p>Lo que se anula es el COBRO —el acto— y no el papel; el numero impreso es lo unico que la
     * ventanilla conoce para nombrarlo (ADR-0026 §4). Se escribe entera y no como sufijo de {@link
     * #RECIBOS} para que se vea que son dos rutas distintas.
     */
    private static final String COBROS = "/caja/api/v1/cobros";

    private static final SistemaDeOrigen RENTAS = SistemaDeOrigen.de("rentas");
    private static final Pagador PAGADOR = new Pagador("12345678", "TITULAR, PRUEBA", 7L);

    private final CajasEnMemoria cajas =
            new CajasEnMemoria().con(new Caja(1L, "C-01", "Caja tributaria", "001", null, true));
    private final TurnosEnMemoria turnos = new TurnosEnMemoria();
    private final RecibosEnMemoria recibos = new RecibosEnMemoria();
    private final MovimientosEnMemoria movimientos = new MovimientosEnMemoria().comoUsuario(CAJERO);
    private final OrdenesEnMemoria ordenes = new OrdenesEnMemoria();
    private final BuzonEnMemoria buzon = new BuzonEnMemoria();

    /** Quien tiene que privilegio. Una prueba le quita {@code ESPECIAL} para negar lo ajeno. */
    private final Set<Privilegio> privilegios =
            EnumSet.of(
                    Privilegio.LECTURA,
                    Privilegio.IMPRESION,
                    Privilegio.ELIMINACION,
                    Privilegio.ESPECIAL);

    private final ComprobadorDeAcceso comprobador =
            (usuario, acceso, privilegio, fecha) -> privilegios.contains(privilegio);

    private final DuplicadoDeRecibo duplicados =
            new DuplicadoDeRecibo(
                    recibos,
                    movimientos,
                    new GeneradorDeDocumentos(
                            List.of(
                                    new RenderizadorPdf(),
                                    new RenderizadorXls(),
                                    new RenderizadorRtf()),
                            RegimenDeLaInstalacion.REAL),
                    (RegistroDeAuditoria registro) -> {},
                    RELOJ);

    private final MockMvc mvc =
            MockMvcBuilders.standaloneSetup(
                            new ReciboController(
                                    duplicados,
                                    new AnularRecibo(
                                            recibos,
                                            movimientos,
                                            turnos,
                                            ordenes,
                                            buzon,
                                            new ComponedorDeEventosJson(new ObjectMapper()),
                                            (RegistroDeAuditoria registro) -> {},
                                            RELOJ),
                                    new ConsultaDeRecibos(recibos),
                                    comprobador,
                                    RELOJ))
                    .setControllerAdvice(new ManejadorDeErrores())
                    .setMessageConverters(
                            // El de bytes ademas del de JSON: el duplicado sale como documento,
                            // y el montaje autonomo de MockMvc reemplaza la lista entera.
                            new ByteArrayHttpMessageConverter(),
                            new JacksonJsonHttpMessageConverter(
                                    JsonMapper.builder()
                                            .addModule(
                                                    new ConfiguracionDeJson()
                                                            .moduloDeObjetosDeValor())
                                            .build()))
                    .build();

    /** El origen lo fija el borde de la aplicacion; aqui no hay borde, asi que se fija a mano. */
    @BeforeEach
    void fijarOrigen() {
        OrigenContext.fijar(new Origen(CAJERO, "PC-CAJA-01", "10.1.1.9"));
    }

    @AfterEach
    void limpiarOrigen() {
        OrigenContext.limpiar();
    }

    // ------------------------------------------------------------------

    @Test
    @DisplayName("#548 — sin recibos, 200 con una pagina vacia y totalElementos 0, nunca 404")
    void elListadoVacioEs200ConTotalCero() throws Exception {
        MvcResult resultado =
                mvc.perform(
                                MockMvcRequestBuilders.get(RECIBOS)
                                        .param("codContribuyente", "NO-EXISTE"))
                        .andReturn();

        assertThat(resultado.getResponse().getStatus()).isEqualTo(200);
        assertThat(resultado.getResponse().getContentAsString())
                .as("buscar y no encontrar es una respuesta, no un fallo")
                .contains("\"totalElementos\":0");
    }

    @Test
    @DisplayName("#548 — los seis filtros de la consulta llegan al criterio del dominio")
    void losSeisFiltrosLleganAlCriterio() throws Exception {
        mvc.perform(
                        MockMvcRequestBuilders.get(RECIBOS)
                                .param("codContribuyente", "C-0007")
                                .param("caja", "c-01")
                                .param("cajero", "cajero.prueba")
                                .param("desde", "2026-03-01")
                                .param("hasta", "2026-03-31")
                                .param("estado", "anulado")
                                .param("tamano", "5"))
                .andReturn();

        assertThat(recibos.ultimoCriterio()).isNotNull();
        assertThat(recibos.ultimoCriterio().codigoContribuyente()).isEqualTo("C-0007");
        assertThat(recibos.ultimoCriterio().caja())
                .as("el codigo de la caja se normaliza a mayusculas, como en el padron")
                .isEqualTo("C-01");
        assertThat(recibos.ultimoCriterio().cajero())
                .as("la cuenta NO: `recibo.cajero` guarda lo que traia el token, en minusculas")
                .isEqualTo("cajero.prueba");
        assertThat(recibos.ultimoCriterio().desde()).isEqualTo(LocalDate.of(2026, 3, 1));
        assertThat(recibos.ultimoCriterio().hasta()).isEqualTo(LocalDate.of(2026, 3, 31));
        assertThat(recibos.ultimoCriterio().estado()).isEqualTo(EstadoDeRecibo.ANULADO);
        assertThat(recibos.ultimaPaginacion()).isNotNull();
        assertThat(recibos.ultimaPaginacion().tamano()).isEqualTo(5);
        assertThat(recibos.ultimaPaginacion().ordenarPor()).isEqualTo("fecha");
    }

    @Test
    @DisplayName("#548 — un estado que no es del enumerado se rechaza; no se lee como «todos»")
    void unEstadoDesconocidoSeRechaza() throws Exception {
        MvcResult resultado =
                mvc.perform(MockMvcRequestBuilders.get(RECIBOS).param("estado", "Emitido y pagado"))
                        .andReturn();

        assertThat(resultado.getResponse().getStatus())
                .as("un filtro que no se entiende y devuelve el listado entero es #544 otra vez")
                .isEqualTo(422);
        assertThat(resultado.getResponse().getContentAsString()).contains("EMITIDO o ANULADO");
    }

    @Test
    @DisplayName("#548 — un rango al reves se rechaza con 422, no con un listado vacio")
    void unRangoAlRevesSeRechaza() throws Exception {
        MvcResult resultado =
                mvc.perform(
                                MockMvcRequestBuilders.get(RECIBOS)
                                        .param("desde", "2026-03-31")
                                        .param("hasta", "2026-03-01"))
                        .andReturn();

        assertThat(resultado.getResponse().getStatus()).isEqualTo(422);
        assertThat(resultado.getResponse().getContentAsString()).contains("al reves");
    }

    @Test
    @DisplayName("#548 — el listado declara LECTURA sobre duplicado_recibo, no IMPRESION")
    void elListadoDeclaraLecturaSobreDuplicadoRecibo() throws Exception {
        // Se lee la anotacion del METODO y no la de la clase, que es lo que la regla de
        // ArchUnit no puede: exige la anotacion «en la clase o en cada endpoint», asi que
        // un listado que la perdiera heredaria la que hubiera y nadie lo diria hasta
        // integrar (#431, #489). Y el privilegio importa: mirar la lista no emite ningun
        // papel, imprimir el duplicado si.
        kamayuk.caja.autorizacion.RequiereAcceso requisito =
                ReciboController.class
                        .getMethod(
                                "listar",
                                String.class,
                                String.class,
                                String.class,
                                String.class,
                                String.class,
                                String.class,
                                kamayuk.caja.web.ParametrosDePaginacion.class)
                        .getAnnotation(kamayuk.caja.autorizacion.RequiereAcceso.class);

        assertThat(requisito).isNotNull();
        assertThat(requisito.acceso()).isEqualTo("duplicado_recibo");
        assertThat(requisito.privilegio()).isEqualTo(Privilegio.LECTURA);
    }

    @Test
    @DisplayName("anula y devuelve 201 con el estado y lo que deja de estar cobrado, con su fecha")
    void anulaYDevuelve201() throws Exception {
        Recibo cobrado = cobrar(Dinero.de("100.00"));

        MvcResult resultado = anular(cobrado, cuerpo("ERROR EN EL IMPORTE", "Se cobro de mas"));

        assertThat(resultado.getResponse().getStatus()).isEqualTo(201);
        String cuerpo = resultado.getResponse().getContentAsString();
        assertThat(cuerpo).contains("\"estado\":\"ANULADO\"");
        assertThat(cuerpo)
                .as("toda cifra sale con su fecha (RNF-075, regla 9)")
                .contains("\"actualizadoA\":\"2026-03-15\"");
        assertThat(cuerpo).contains("\"numero\":\"001-0000001\"");
    }

    @Test
    @DisplayName("sin observacion, 422: no se anula")
    void sinObservacionRechaza() throws Exception {
        Recibo cobrado = cobrar(Dinero.de("100.00"));

        MvcResult resultado = anular(cobrado, cuerpo("ERROR EN EL IMPORTE", ""));

        assertThat(resultado.getResponse().getStatus()).isEqualTo(422);
        assertThat(movimientos.registrados()).isEmpty();
    }

    @Test
    @DisplayName("sin motivo, 422: el acto se queda sin sustento")
    void sinMotivoRechaza() throws Exception {
        Recibo cobrado = cobrar(Dinero.de("100.00"));

        MvcResult resultado = anular(cobrado, cuerpo("", "Se cobro de mas"));

        assertThat(resultado.getResponse().getStatus()).isEqualTo(422);
        assertThat(movimientos.registrados()).isEmpty();
    }

    @Test
    @DisplayName("anular dos veces, 409: el estado ya no admite la operacion")
    void laSegundaAnulacionDevuelve409() throws Exception {
        Recibo cobrado = cobrar(Dinero.de("100.00"));
        anular(cobrado, cuerpo("ERROR EN EL IMPORTE", "Se cobro de mas"));

        MvcResult resultado = anular(cobrado, cuerpo("ERROR EN EL IMPORTE", "Otra vez"));

        assertThat(resultado.getResponse().getStatus()).isEqualTo(409);
    }

    @Test
    @DisplayName("un recibo que no existe, 404")
    void elReciboInexistenteDevuelve404() throws Exception {
        MvcResult resultado =
                mvc.perform(
                                MockMvcRequestBuilders.post(COBROS + "/001-9999999/anulacion")
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(cuerpo("ERROR EN EL IMPORTE", "Se cobro de mas")))
                        .andReturn();

        assertThat(resultado.getResponse().getStatus()).isEqualTo(404);
    }

    @Test
    @DisplayName("un numero que no tiene la forma del papel, 422")
    void elNumeroMalFormadoDevuelve422() throws Exception {
        MvcResult resultado =
                mvc.perform(
                                MockMvcRequestBuilders.post(COBROS + "/no-es-un-numero/anulacion")
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(cuerpo("ERROR EN EL IMPORTE", "Se cobro de mas")))
                        .andReturn();

        assertThat(resultado.getResponse().getStatus()).isEqualTo(422);
    }

    @Test
    @DisplayName("sin ESPECIAL, anular el recibo de OTRO cajero se niega con 403")
    void sinEspecialNoSeAnulaElAjeno() throws Exception {
        Recibo cobrado = cobrar(Dinero.de("100.00"));
        privilegios.remove(Privilegio.ESPECIAL);
        OrigenContext.fijar(new Origen("otro.cajero", "PC-CAJA-02", "10.1.1.10"));

        MvcResult resultado = anular(cobrado, cuerpo("ERROR EN EL IMPORTE", "Se cobro de mas"));

        assertThat(resultado.getResponse().getStatus())
                .as("«anular un recibo ajeno» es lo que ESPECIAL gobierna, y aqui se nota")
                .isEqualTo(403);
        assertThat(movimientos.registrados()).isEmpty();
    }

    @Test
    @DisplayName("sin ESPECIAL, anular EL PROPIO sigue pasando")
    void sinEspecialElPropioSigueAnulandose() throws Exception {
        Recibo cobrado = cobrar(Dinero.de("100.00"));
        privilegios.remove(Privilegio.ESPECIAL);

        MvcResult resultado = anular(cobrado, cuerpo("ERROR EN EL IMPORTE", "Se cobro de mas"));

        assertThat(resultado.getResponse().getStatus())
                .as("un cajero puede deshacer su propio error de la ultima hora")
                .isEqualTo(201);
    }

    @Test
    @DisplayName("la vista previa devuelve el recibo con su estado y sus duplicados")
    void laVistaPreviaDevuelveElEstado() throws Exception {
        Recibo cobrado = cobrar(Dinero.de("100.00"));

        MvcResult resultado =
                mvc.perform(
                                MockMvcRequestBuilders.get(
                                        RECIBOS + "/" + cobrado.numero().impreso() + "/duplicado"))
                        .andReturn();

        assertThat(resultado.getResponse().getStatus()).isEqualTo(200);
        assertThat(resultado.getResponse().getContentAsString())
                .contains("\"estado\":\"EMITIDO\"")
                .contains("\"duplicados\":0");
        assertThat(movimientos.registrados())
                .as("mirar no es reimprimir: la vista previa no emite nada")
                .isEmpty();
    }

    @Test
    @DisplayName("con formato devuelve el documento, con su nombre de archivo")
    void conFormatoDevuelveElDocumento() throws Exception {
        Recibo cobrado = cobrar(Dinero.de("100.00"));

        MvcResult resultado = duplicado(cobrado, "PDF", "Duplicado pedido en ventanilla");

        assertThat(resultado.getResponse().getStatus()).isEqualTo(200);
        assertThat(resultado.getResponse().getContentType()).isEqualTo("application/pdf");
        assertThat(resultado.getResponse().getHeader("Content-Disposition"))
                .contains("recibo-001-0000001.pdf");
        assertThat(movimientos.registrados())
                .as("y queda registrado con quien lo genero")
                .hasSize(1);
    }

    @Test
    @DisplayName("un duplicado sin observacion, 422: es una escritura")
    void elDuplicadoSinObservacionRechaza() throws Exception {
        Recibo cobrado = cobrar(Dinero.de("100.00"));

        MvcResult resultado = duplicado(cobrado, "PDF", null);

        assertThat(resultado.getResponse().getStatus()).isEqualTo(422);
        assertThat(movimientos.registrados()).isEmpty();
    }

    @Test
    @DisplayName("un formato que no existe, 422")
    void elFormatoDesconocidoRechaza() throws Exception {
        Recibo cobrado = cobrar(Dinero.de("100.00"));

        MvcResult resultado = duplicado(cobrado, "DOCX", "Duplicado pedido en ventanilla");

        assertThat(resultado.getResponse().getStatus()).isEqualTo(422);
    }

    // ------------------------------------------------------------------

    private Recibo cobrar(Dinero monto) {
        OrdenDeCobro orden =
                ordenes.con(
                        OrdenDeCobro.nueva(
                                RENTAS,
                                "REF-" + siguienteReferencia++,
                                "IMPUESTO PREDIAL 2026",
                                null,
                                monto,
                                HOY,
                                HOY,
                                PAGADOR,
                                HOY.atStartOfDay(ZoneOffset.UTC).toInstant(),
                                Observacion.de("Orden emitida por el sistema de origen")));
        return new CobrarOrdenes(
                        new AbrirCaja(cajas, turnos, (RegistroDeAuditoria registro) -> {}, RELOJ),
                        ordenes,
                        recibos,
                        buzon,
                        new ComponedorDeEventosJson(new ObjectMapper()),
                        (RegistroDeAuditoria registro) -> {},
                        RELOJ)
                .cobrar(
                        new CobrarOrdenes.Cobranza(
                                "C-01",
                                CAJERO,
                                List.of(orden.idGuardado()),
                                FormaDePago.EFECTIVO,
                                HOY,
                                null),
                        Observacion.de("Cobranza en ventanilla, prueba de #34"))
                .recibo();
    }

    /** Para que dos cobros de la misma prueba no choquen con {@code orden_referencia_uq}. */
    private int siguienteReferencia = 1;

    private MvcResult anular(Recibo recibo, String cuerpo) throws Exception {
        return mvc.perform(
                        MockMvcRequestBuilders.post(
                                        COBROS + "/" + recibo.numero().impreso() + "/anulacion")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(cuerpo))
                .andReturn();
    }

    private MvcResult duplicado(Recibo recibo, String formato, String observacion)
            throws Exception {
        var peticion =
                MockMvcRequestBuilders.get(RECIBOS + "/" + recibo.numero().impreso() + "/duplicado")
                        .param("formato", formato);
        if (observacion != null) {
            peticion = peticion.param("observacion", observacion);
        }
        return mvc.perform(peticion).andReturn();
    }

    private static String cuerpo(String motivo, String observacion) {
        return """
               {"motivo":"%s","autorizadoPor":"RESPONSABLE DE TESORERIA",
                "nDeMemorando":"MEMO-2026-034","observacion":"%s"}
               """
                .formatted(motivo, observacion);
    }
}
