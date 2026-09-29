package kamayuk.caja.nucleo.aplicacion;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import kamayuk.caja.auditoria.Auditoria;
import kamayuk.caja.auditoria.Operacion;
import kamayuk.caja.auditoria.RegistroDeAuditoria;
import kamayuk.caja.dominio.Dinero;
import kamayuk.caja.dominio.Observacion;
import kamayuk.caja.nucleo.dominio.ClaveDeIdempotencia;
import kamayuk.caja.nucleo.dominio.FormaDePago;
import kamayuk.caja.nucleo.dominio.LineaDeRecibo;
import kamayuk.caja.nucleo.dominio.LineaDeTasaPedida;
import kamayuk.caja.nucleo.dominio.NumeroDeRecibo;
import kamayuk.caja.nucleo.dominio.Pagador;
import kamayuk.caja.nucleo.dominio.Recibo;
import kamayuk.caja.nucleo.dominio.ReciboRepository;
import kamayuk.caja.nucleo.dominio.Tasa;
import kamayuk.caja.nucleo.dominio.TasaRepository;
import kamayuk.caja.nucleo.dominio.TipoDePago;
import kamayuk.caja.nucleo.dominio.TurnoDeCaja;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Caja de tasas: cobra derechos del TUPA y emite su recibo (#33, RF-081, RF-133).
 *
 * <p><b>No toca la cuenta corriente</b>, y es la diferencia esencial con {@link CobrarDeuda}: un
 * derecho de tramite no es deuda tributaria —no se determina, no devenga interes, no prescribe—,
 * asi que no hay cargo que abonar. Lo que hay es un servicio que se presta y se cobra en el acto.
 * Por eso este caso de uso no depende de {@code cuentacorriente} para nada.
 *
 * <p><b>El precio sale de la tabla {@code tasa}</b>, vigente a la fecha del cobro, nunca de la
 * peticion ni de una constante (regla 5, ADR-0007). Que venga de la peticion seria dejar que el
 * cliente ponga la tarifa; que venga compilada seria una tarifa que solo se cambia desplegando, y
 * las que no se cambian son las que se acaban cobrando mal.
 *
 * <p>La multiplicacion cantidad x precio la comprueba ademas la base, en {@code
 * recibo_detalle_tasa_ck} (V29).
 */
@Service
public class CobrarTasa {

    /** El acto, en la huella de la peticion: lo que separa esta ruta de la de ordenes (#143). */
    private static final String ACTO = "cobrar-tasas";

    /** El concepto con el que se rotula una linea de tasa en {@code recibo_detalle}. */
    private static final String CONCEPTO_TASA = "TASA";

    private final AbrirCaja abrirCaja;
    private final TasaRepository tasas;
    private final ReciboRepository recibos;
    private final Auditoria auditoria;
    private final Clock reloj;

    public CobrarTasa(
            AbrirCaja abrirCaja,
            TasaRepository tasas,
            ReciboRepository recibos,
            Auditoria auditoria,
            Clock reloj) {
        this.abrirCaja = abrirCaja;
        this.tasas = tasas;
        this.recibos = recibos;
        this.auditoria = auditoria;
        this.reloj = reloj;
    }

    /**
     * Cobra los conceptos marcados y emite.
     *
     * <p>La {@link Observacion} va en la firma y no dentro de {@link CobroDeTasas}: la regla 10
     * exige que se vea en el punto donde se escribe, y ArchUnit la comprueba mirando los parametros
     * del metodo transaccional.
     *
     * <p>El reenvio del mismo intento se mira <b>antes</b> de abrir el turno y otra vez con su
     * candado puesto, igual que en {@link CobrarOrdenes#cobrar} y por lo mismo (#143): un reintento
     * no abre ni audita el turno de un dia en el que no cobra, ni choca con el suyo ya cerrado; y
     * dos reintentos simultaneos los ordena la segunda mirada, no la primera.
     *
     * @param peticion lo que el cajero marco
     * @param observacion por que se cobra (regla 10, RNF-052)
     * @return el recibo, y si se emitio ahora o era el de un intento anterior
     * @throws TasaSinTarifaVigente si algun concepto no tiene tarifa vigente a esa fecha
     * @throws TarifaEnCero si la tarifa vigente es cero: un recibo por cero no documenta un cobro
     * @throws ClaveDeIdempotencia.UsadaConOtraPeticion si la clave ya emitio otra cosa
     */
    @Transactional
    public Cobrada cobrar(CobroDeTasas peticion, Observacion observacion) {
        Objects.requireNonNull(peticion, "No se cobra sin peticion");
        Objects.requireNonNull(observacion, "Sin observacion no se guarda (regla 10, RNF-052)");

        ClaveDeIdempotencia clave = peticion.clave();
        if (clave != null) {
            Optional<Cobrada> reenvio = reenvioDe(clave);
            if (reenvio.isPresent()) {
                return reenvio.get();
            }
        }

        AbrirCaja.Abierta abierta =
                abrirCaja.enLaCaja(
                        peticion.codigoDeCaja(),
                        peticion.cajero(),
                        peticion.fechaDeCobro(),
                        observacion);
        if (clave != null) {
            Optional<Cobrada> reenvio = reenvioDe(clave);
            if (reenvio.isPresent()) {
                return reenvio.get();
            }
        }

        List<LineaDeRecibo> lineas = new ArrayList<>(peticion.conceptos().size());
        for (LineaDeTasaPedida pedida : peticion.conceptos()) {
            Tasa tasa =
                    tasas.vigenteA(pedida.codigoDeTasa(), peticion.fechaDeCobro())
                            .orElseThrow(
                                    () ->
                                            new TasaSinTarifaVigente(
                                                    pedida.codigoDeTasa(),
                                                    peticion.fechaDeCobro()));
            if (!tasa.importe().esPositivo()) {
                throw new TarifaEnCero(tasa);
            }
            lineas.add(
                    new LineaDeRecibo(
                            tasa.codigo(),
                            CONCEPTO_TASA,
                            null,
                            null,
                            tasa.idGuardado(),
                            null,
                            null,
                            null,
                            // Sin detalle: el detalle es lo que el SISTEMA DE ORIGEN quiso
                            // imprimir bajo el concepto (P5D), y una tasa del TUPA no tiene
                            // sistema de origen: la emitio esta misma caja.
                            null,
                            pedida.cantidad(),
                            tasa.importe(),
                            // Un derecho de tramite no tiene reajuste, ni interes moratorio, ni
                            // gastos de cobranza: su importe integro es la parte de insoluto.
                            tasa.por(pedida.cantidad()),
                            Dinero.CERO,
                            Dinero.CERO,
                            Dinero.CERO));
        }

        NumeroDeRecibo numero = recibos.siguienteNumero(abierta.caja());
        TurnoDeCaja turno = abierta.turno();
        Recibo recibo =
                new Recibo(
                        null,
                        numero,
                        Objects.requireNonNull(abierta.caja().id()),
                        turno.idGuardado(),
                        peticion.cajero(),
                        peticion.pagador(),
                        reloj.instant(),
                        peticion.formaDePago(),
                        TipoDePago.TASA,
                        null,
                        // La fecha a la que la tarifa estaba vigente: es lo que hace que el
                        // duplicado pueda explicar su cifra el dia que la ordenanza la suba.
                        peticion.fechaDeCobro(),
                        observacion,
                        lineas);

        Recibo emitido = recibos.emitir(recibo, clave);
        auditoria.registrar(
                RegistroDeAuditoria.enLaFechaDe(
                                peticion.fechaDeCobro(),
                                "recibo",
                                String.valueOf(emitido.id()),
                                Operacion.ALTA,
                                observacion)
                        .con(null, descripcion(emitido)));
        return new Cobrada(emitido, true);
    }

    /**
     * El recibo que esa clave ya emitio, si la peticion es la misma; sin abrir ni bloquear nada. Es
     * lo que el borde HTTP pregunta antes de mirar la fecha: ver {@link CobrarOrdenes#yaCobrada}.
     *
     * @throws ClaveDeIdempotencia.UsadaConOtraPeticion si la clave ya emitio otra cosa
     */
    @Transactional(readOnly = true)
    public Optional<Cobrada> yaCobrada(ClaveDeIdempotencia clave) {
        return reenvioDe(Objects.requireNonNull(clave, "Sin clave no hay reintento que buscar"));
    }

    /**
     * La clave de un cobro de tasas, atada a lo que lo define (#143); nula si no vino cabecera.
     *
     * <p>Entran el acto, la caja, el cajero, la forma de pago, el pagador —el papel sale a su
     * nombre— y los conceptos con su cantidad, <b>ordenados</b>. No entran la fecha ni la
     * observacion, por lo mismo que en {@link CobrarOrdenes#claveDe}.
     *
     * @throws IllegalArgumentException si la cabecera no cabe en la columna
     */
    public static @Nullable ClaveDeIdempotencia claveDe(
            @Nullable String cabecera,
            String codigoDeCaja,
            String cajero,
            Pagador pagador,
            List<LineaDeTasaPedida> conceptos,
            FormaDePago formaDePago) {
        if (cabecera == null) {
            return null;
        }
        List<String> partes = new ArrayList<>();
        partes.add(ClaveDeIdempotencia.parte("acto", ACTO));
        partes.add(ClaveDeIdempotencia.parte("caja", codigoDeCaja));
        partes.add(ClaveDeIdempotencia.parte("cajero", cajero));
        partes.add(ClaveDeIdempotencia.parte("formaDePago", formaDePago.name()));
        partes.add(ClaveDeIdempotencia.parte("pagador.documento", pagador.documento()));
        partes.add(ClaveDeIdempotencia.parte("pagador.nombre", pagador.nombre()));
        partes.add(ClaveDeIdempotencia.parte("pagador.idExterno", pagador.idExterno()));
        conceptos.stream()
                .sorted(
                        Comparator.comparing(LineaDeTasaPedida::codigoDeTasa)
                                .thenComparingInt(LineaDeTasaPedida::cantidad))
                .forEach(
                        concepto -> {
                            partes.add(
                                    ClaveDeIdempotencia.parte("concepto", concepto.codigoDeTasa()));
                            partes.add(ClaveDeIdempotencia.parte("cantidad", concepto.cantidad()));
                        });
        return ClaveDeIdempotencia.de(cabecera, partes);
    }

    /**
     * El reenvio: el recibo de esa clave, si la peticion es la misma. Una huella distinta es otra
     * peticion; un recibo de antes de V8 no tiene huella y se reconoce si al menos es de tasa. Ver
     * {@link ClaveDeIdempotencia#reconoce}.
     */
    private Optional<Cobrada> reenvioDe(ClaveDeIdempotencia clave) {
        return recibos.porClaveDeIdempotencia(clave.valor())
                .map(
                        guardado -> {
                            if (!clave.reconoce(guardado.huella())
                                    || guardado.recibo().tipoDePago() != TipoDePago.TASA) {
                                throw new ClaveDeIdempotencia.UsadaConOtraPeticion(clave);
                            }
                            return new Cobrada(guardado.recibo(), false);
                        });
    }

    /** Sin datos personales: esto acaba en la columna JSON de la auditoria. */
    private static String descripcion(Recibo recibo) {
        return "{\"numero\":\""
                + recibo.numero().impreso()
                + "\",\"tipoDePago\":\"TASA\",\"conceptos\":"
                + recibo.lineas().size()
                + ",\"total\":"
                + recibo.total().valor().toPlainString()
                + ",\"actualizadoA\":\""
                + recibo.actualizadoA()
                + "\"}";
    }

    /**
     * Lo que el cajero marco en caja de tasas.
     *
     * @param codigoDeCaja la ventanilla
     * @param cajero quien cobra
     * @param pagador a quien se le cobra, tal como la caja lo conoce (P5D). Puede ser ANONIMO:
     *     quien paga una tasa al contado no siempre da documento, y exigirselo para poder cobrarle
     *     seria inventar un requisito que ninguna norma pide. Hasta P5D esto era un identificador
     *     del padron de `rentas`, que esta base ya no tiene
     * @param conceptos los del TUPA, con su cantidad
     * @param formaDePago con que se paga
     * @param fechaDeCobro la fecha a la que se resuelve la tarifa vigente (regla 6)
     * @param claveDeIdempotencia la cabecera {@code idempotency-key}, si vino; se ata a este cobro
     *     con {@link #clave()} (#143)
     */
    public record CobroDeTasas(
            String codigoDeCaja,
            String cajero,
            Pagador pagador,
            List<LineaDeTasaPedida> conceptos,
            FormaDePago formaDePago,
            LocalDate fechaDeCobro,
            @Nullable String claveDeIdempotencia) {

        public CobroDeTasas {
            Objects.requireNonNull(codigoDeCaja, "El cobro es de una caja");
            Objects.requireNonNull(cajero, "El cobro lo hace un cajero con nombre");
            Objects.requireNonNull(conceptos, "La lista es vacia, no nula");
            Objects.requireNonNull(pagador, "El pagador es anonimo, no nulo");
            Objects.requireNonNull(formaDePago, "Hay que decir con que se paga");
            Objects.requireNonNull(fechaDeCobro, "La fecha entra como argumento (regla 6)");
            conceptos = List.copyOf(conceptos);
            if (conceptos.isEmpty()) {
                throw new IllegalArgumentException("Hay que marcar al menos un concepto del TUPA");
            }
            if (claveDeIdempotencia != null) {
                ClaveDeIdempotencia.exigirValida(claveDeIdempotencia);
            }
        }

        /** La clave de este cobro con la huella de lo que pide (#143); nula si no vino. */
        public @Nullable ClaveDeIdempotencia clave() {
            return claveDe(
                    claveDeIdempotencia, codigoDeCaja, cajero, pagador, conceptos, formaDePago);
        }
    }

    /**
     * Lo que sale de cobrar tasas.
     *
     * @param recibo el papel
     * @param emitido si se emitio ahora, o se devolvio el de un intento anterior. El borde HTTP
     *     contesta 201 al primero y 200 al segundo (#143)
     */
    public record Cobrada(Recibo recibo, boolean emitido) {}

    /** Ese concepto no tiene tarifa vigente a esa fecha. */
    public static final class TasaSinTarifaVigente extends RuntimeException {

        @java.io.Serial private static final long serialVersionUID = 1L;

        TasaSinTarifaVigente(String codigo, LocalDate fecha) {
            super(
                    "El concepto '"
                            + codigo
                            + "' no tiene tarifa vigente al "
                            + fecha
                            + ". La tarifa es dato registrado con su ordenanza y su vigencia"
                            + " (regla 5): sin una vigente no hay nada que cobrar");
        }
    }

    /** La tarifa vigente es cero: no hay cobro que documentar. */
    public static final class TarifaEnCero extends RuntimeException {

        @java.io.Serial private static final long serialVersionUID = 1L;

        TarifaEnCero(Tasa tasa) {
            super(
                    "La tarifa vigente del concepto '"
                            + tasa.codigo()
                            + "' es cero: un recibo por cero no documenta un cobro, y la base lo"
                            + " rechaza igual");
        }
    }
}
