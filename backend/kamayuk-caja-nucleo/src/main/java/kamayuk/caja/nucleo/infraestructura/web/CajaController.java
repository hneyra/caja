package kamayuk.caja.nucleo.infraestructura.web;

import java.time.Clock;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import kamayuk.caja.autorizacion.Privilegio;
import kamayuk.caja.autorizacion.RequiereAcceso;
import kamayuk.caja.dominio.Observacion;
import kamayuk.caja.nucleo.aplicacion.AbrirCaja;
import kamayuk.caja.nucleo.aplicacion.CobrarOrdenes;
import kamayuk.caja.nucleo.aplicacion.CobrarTasa;
import kamayuk.caja.nucleo.dominio.FormaDePago;
import kamayuk.caja.nucleo.dominio.LineaDeTasaPedida;
import kamayuk.caja.nucleo.dominio.OrdenDeCobroRepository;
import kamayuk.caja.nucleo.dominio.Pagador;
import kamayuk.caja.nucleo.dominio.Recibo;
import kamayuk.caja.web.Api;
import kamayuk.caja.web.CodigoDeError;
import kamayuk.caja.web.ProblemaDeNegocio;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * El acto de ventanilla por HTTP: {@code POST /caja/api/v1/cobros} (ADR-0026 §3, COMMIT 1).
 *
 * <p>Solo {@code POST}. No hay ningun {@code PUT} ni {@code PATCH}, y no por estilo: un recibo no
 * se corrige (regla 4, V29). Lo que le pasa despues llega como un recurso nuevo —una anulacion, un
 * duplicado—.
 *
 * <h2>Lo que este borde ya no hace</h2>
 *
 * <p>Hasta P5D resolvia el codigo de contribuyente contra el padron de {@code rentas} antes de
 * cobrar. <b>Ya no pregunta nada a nadie</b>: quien paga viene dentro de la orden, congelado. Es lo
 * que hace cierto el criterio 2 del encargo —con {@code rentas} apagado la ventanilla sigue
 * cobrando—, y se puede leer en la lista de campos inyectados de esta clase: no hay ni un puerto
 * hacia otro sistema.
 *
 * <h2>La cabecera {@code idempotency-key}</h2>
 *
 * <p>Reenviar el mismo intento —el doble clic, el reintento del navegador tras un tiempo de espera—
 * devuelve el recibo que se emitio la primera vez, con su mismo numero <b>y con el mismo {@code
 * pagoId}</b>. La garantia ultima es {@code recibo_idempotencia_uq} (V29), no esta lectura.
 */
@RestController
@RequestMapping(Api.RAIZ + "/cobros")
public class CajaController {

    private final CobrarOrdenes cobrarOrdenes;
    private final CobrarTasa cobrarTasa;
    private final Clock reloj;

    public CajaController(CobrarOrdenes cobrarOrdenes, CobrarTasa cobrarTasa, Clock reloj) {
        this.cobrarOrdenes = cobrarOrdenes;
        this.cobrarTasa = cobrarTasa;
        this.reloj = reloj;
    }

    /** Cobra las ordenes marcadas y emite el recibo. */
    @PostMapping
    @RequiereAcceso(acceso = "caja_tributaria", privilegio = Privilegio.REGISTRO)
    public ResponseEntity<CobroResource> cobrar(
            @RequestBody PeticionDeCobranza peticion,
            @RequestHeader(name = "Idempotency-Key", required = false) @Nullable String clave) {

        LocalDate fechaDePago = fechaDe(peticion.fechaDePago(), "fechaDePago");
        Observacion observacion = observacionDe(peticion.observacion());

        CobrarOrdenes.Cobranza cobranza;
        try {
            cobranza =
                    new CobrarOrdenes.Cobranza(
                            exigir(peticion.caja(), "caja"),
                            exigir(peticion.cajero(), "cajero"),
                            ordenesDe(peticion.ordenes()),
                            FormaDePago.porNombre(exigir(peticion.formaDePago(), "formaDePago")),
                            fechaDePago,
                            vacioAnulo(clave));
        } catch (IllegalArgumentException invalido) {
            throw new ProblemaDeNegocio(CodigoDeError.VALIDACION, mensajeDe(invalido));
        }

        try {
            CobrarOrdenes.Cobrado cobrado = cobrarOrdenes.cobrar(cobranza, observacion);
            return ResponseEntity.status(HttpStatus.CREATED).body(CobroResource.de(cobrado));
        } catch (OrdenDeCobroRepository.OrdenInexistente noExiste) {
            throw new ProblemaDeNegocio(CodigoDeError.NO_ENCONTRADO, mensajeDe(noExiste));
        } catch (AbrirCaja.CajaInexistente noExisteCaja) {
            throw new ProblemaDeNegocio(CodigoDeError.NO_ENCONTRADO, mensajeDe(noExisteCaja));
        } catch (CobrarOrdenes.OrdenNoCobrable noCobrable) {
            // 409 y no 422: la peticion esta bien formada. Lo que pasa es que el estado actual
            // no admite la operacion, porque esa orden ya se cobro o todavia no es exigible.
            throw new ProblemaDeNegocio(CodigoDeError.CONFLICTO, mensajeDe(noCobrable));
        } catch (AbrirCaja.TurnoCerrado cerrado) {
            throw new ProblemaDeNegocio(CodigoDeError.CONFLICTO, mensajeDe(cerrado));
        } catch (AbrirCaja.CajaDeBaja
                | CobrarOrdenes.OrdenesDeVariosSistemas
                | IllegalArgumentException invalido) {
            throw new ProblemaDeNegocio(CodigoDeError.VALIDACION, mensajeDe(invalido));
        }
    }

    /**
     * Caja de tasas: cobra derechos del TUPA y emite el recibo (RF-081).
     *
     * <p>Es la <b>otra</b> mitad de la ventanilla y no produce ningun evento: el concepto es de la
     * propia caja —la tabla {@code tasa}—, no hubo orden y no hay a quien avisarle. Por eso vive en
     * la misma ruta con un sufijo y no en otra: el dinero entra por la misma ventanilla, la
     * numeracion del recibo es la misma y el turno tambien.
     */
    @PostMapping("/tasas")
    @RequiereAcceso(acceso = "caja_tasas", privilegio = Privilegio.REGISTRO)
    public ResponseEntity<ReciboResource> tasas(
            @RequestBody PeticionDeCobroDeTasas peticion,
            @RequestHeader(name = "Idempotency-Key", required = false) @Nullable String clave) {

        LocalDate fechaDeCobro = fechaDe(peticion.fechaDeCobro(), "fechaDeCobro");
        Observacion observacion = observacionDe(peticion.observacion());

        CobrarTasa.CobroDeTasas cobro;
        try {
            cobro =
                    new CobrarTasa.CobroDeTasas(
                            exigir(peticion.caja(), "caja"),
                            exigir(peticion.cajero(), "cajero"),
                            new Pagador(
                                    vacioAnulo(peticion.pagadorDocumento()),
                                    vacioAnulo(peticion.pagadorNombre()),
                                    peticion.pagadorIdExterno()),
                            conceptosDe(peticion.conceptos()),
                            FormaDePago.porNombre(exigir(peticion.formaDePago(), "formaDePago")),
                            fechaDeCobro,
                            vacioAnulo(clave));
        } catch (IllegalArgumentException invalido) {
            throw new ProblemaDeNegocio(CodigoDeError.VALIDACION, mensajeDe(invalido));
        }

        try {
            Recibo emitido = cobrarTasa.cobrar(cobro, observacion);
            return ResponseEntity.status(HttpStatus.CREATED).body(ReciboResource.de(emitido));
        } catch (AbrirCaja.TurnoCerrado cerrado) {
            throw new ProblemaDeNegocio(CodigoDeError.CONFLICTO, mensajeDe(cerrado));
        } catch (AbrirCaja.CajaInexistente noExiste) {
            throw new ProblemaDeNegocio(CodigoDeError.NO_ENCONTRADO, mensajeDe(noExiste));
        } catch (CobrarTasa.TasaSinTarifaVigente sinTarifa) {
            throw new ProblemaDeNegocio(CodigoDeError.NO_ENCONTRADO, mensajeDe(sinTarifa));
        } catch (AbrirCaja.CajaDeBaja
                | CobrarTasa.TarifaEnCero
                | IllegalArgumentException invalido) {
            throw new ProblemaDeNegocio(CodigoDeError.VALIDACION, mensajeDe(invalido));
        }
    }

    // ------------------------------------------------------------------

    private static List<Long> ordenesDe(@Nullable List<Long> marcadas) {
        if (marcadas == null || marcadas.isEmpty()) {
            throw new ProblemaDeNegocio(
                    CodigoDeError.VALIDACION,
                    "Falta el campo 'ordenes': un recibo sin lineas no documenta nada");
        }
        List<Long> ordenes = new ArrayList<>(marcadas.size());
        for (Long orden : marcadas) {
            if (orden == null || orden <= 0) {
                throw new ProblemaDeNegocio(
                        CodigoDeError.VALIDACION,
                        "'ordenes[]' lleva identificadores de orden de cobro, y '"
                                + orden
                                + "' no lo es");
            }
            ordenes.add(orden);
        }
        return ordenes;
    }

    private static List<LineaDeTasaPedida> conceptosDe(
            @Nullable List<PeticionDeCobroDeTasas.PeticionDeConcepto> marcados) {
        if (marcados == null || marcados.isEmpty()) {
            throw new ProblemaDeNegocio(
                    CodigoDeError.VALIDACION,
                    "Falta el campo 'conceptos': un cobro de tasas cobra al menos un concepto del"
                            + " TUPA");
        }
        List<LineaDeTasaPedida> conceptos = new ArrayList<>(marcados.size());
        for (PeticionDeCobroDeTasas.PeticionDeConcepto marcado : marcados) {
            Integer cantidad = marcado.cantidad();
            try {
                conceptos.add(
                        new LineaDeTasaPedida(
                                exigir(marcado.conceptoTupa(), "conceptos[].conceptoTupa"),
                                cantidad == null ? 1 : cantidad));
            } catch (IllegalArgumentException invalido) {
                throw new ProblemaDeNegocio(CodigoDeError.VALIDACION, mensajeDe(invalido));
            }
        }
        return conceptos;
    }

    private LocalDate fechaDe(@Nullable String texto, String campo) {
        if (texto == null || texto.isBlank()) {
            return LocalDate.now(reloj);
        }
        try {
            return LocalDate.parse(texto.strip());
        } catch (DateTimeParseException malEscrita) {
            throw new ProblemaDeNegocio(
                    CodigoDeError.VALIDACION,
                    "El campo '" + campo + "' no es una fecha ISO: '" + texto + "'");
        }
    }

    private static Observacion observacionDe(@Nullable String texto) {
        try {
            return Observacion.de(exigir(texto, "observacion"));
        } catch (IllegalArgumentException invalido) {
            throw new ProblemaDeNegocio(CodigoDeError.VALIDACION, mensajeDe(invalido));
        }
    }

    static String exigir(@Nullable String valor, String campo) {
        if (valor == null || valor.isBlank()) {
            throw new ProblemaDeNegocio(CodigoDeError.VALIDACION, "Falta el campo '" + campo + "'");
        }
        return valor.strip();
    }

    static @Nullable String vacioAnulo(@Nullable String valor) {
        return valor == null || valor.isBlank() ? null : valor.strip();
    }

    static String mensajeDe(RuntimeException problema) {
        String mensaje = problema.getMessage();
        return mensaje == null ? problema.getClass().getSimpleName() : mensaje;
    }
}
