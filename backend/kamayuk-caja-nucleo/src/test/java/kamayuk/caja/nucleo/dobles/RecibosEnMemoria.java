package kamayuk.caja.nucleo.dobles;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import kamayuk.caja.compartido.Pagina;
import kamayuk.caja.compartido.Paginacion;
import kamayuk.caja.nucleo.dominio.Caja;
import kamayuk.caja.nucleo.dominio.ClaveDeIdempotencia;
import kamayuk.caja.nucleo.dominio.CriterioDeRecibos;
import kamayuk.caja.nucleo.dominio.NumeroDeRecibo;
import kamayuk.caja.nucleo.dominio.Recibo;
import kamayuk.caja.nucleo.dominio.ReciboEnConsulta;
import kamayuk.caja.nucleo.dominio.ReciboRepository;
import org.jspecify.annotations.Nullable;

/** Los recibos, en memoria. Solo agrega: no hay forma de editar uno, igual que en la base. */
public final class RecibosEnMemoria implements ReciboRepository {

    private final List<Recibo> emitidos = new ArrayList<>();
    private final Map<String, EmitidoConClave> porClave = new LinkedHashMap<>();
    private final Map<String, Long> correlativos = new LinkedHashMap<>();
    private long siguienteId = 1;

    private @Nullable CriterioDeRecibos ultimoCriterio;
    private @Nullable Paginacion ultimaPaginacion;

    public List<Recibo> emitidos() {
        return List.copyOf(emitidos);
    }

    /** El criterio con que se pidio el ultimo listado: es lo que la capa web compone. */
    public @Nullable CriterioDeRecibos ultimoCriterio() {
        return ultimoCriterio;
    }

    /** Y con que paginacion. */
    public @Nullable Paginacion ultimaPaginacion() {
        return ultimaPaginacion;
    }

    @Override
    public NumeroDeRecibo siguienteNumero(Caja caja) {
        long ultimo = correlativos.merge(caja.serie(), 1L, Long::sum);
        return caja.numero(ultimo);
    }

    /**
     * Le pone a un recibo ya emitido una clave <b>sin huella</b>, como las filas anteriores a V8
     * (#143).
     *
     * <p>Contra PostgreSQL no se puede sembrar una fila asi despues de V8 —{@code
     * recibo_clave_con_huella_ck} la rechaza, y es lo que confina la indulgencia a las viejas—, asi
     * que lo que el caso de uso hace con una fila vieja se prueba aqui.
     */
    public RecibosEnMemoria conClaveSinHuella(String clave, Recibo emitido) {
        porClave.put(clave, new EmitidoConClave(emitido, null));
        return this;
    }

    @Override
    public Recibo emitir(Recibo recibo, @Nullable ClaveDeIdempotencia clave) {
        if (clave != null && porClave.containsKey(clave.valor())) {
            // Lo que hace `recibo_idempotencia_uq`: la clave es unica, se atienda por donde se
            // atienda. Sin esto el doble guardaria dos recibos con la misma clave y una prueba
            // que se olvidara de mirar antes de emitir pasaria en verde.
            throw new ClaveEnUso(
                    clave.valor(), new IllegalStateException("recibo_idempotencia_uq"));
        }
        Recibo guardado =
                new Recibo(
                        siguienteId++,
                        recibo.numero(),
                        recibo.cajaId(),
                        recibo.turnoId(),
                        recibo.cajero(),
                        recibo.pagador(),
                        recibo.emitidoEn(),
                        recibo.formaDePago(),
                        recibo.tipoDePago(),
                        recibo.campaniaBeneficio(),
                        recibo.actualizadoA(),
                        recibo.observacion(),
                        recibo.lineas());
        emitidos.add(guardado);
        if (clave != null) {
            porClave.put(clave.valor(), new EmitidoConClave(guardado, clave.huella()));
        }
        return guardado;
    }

    @Override
    public Optional<EmitidoConClave> porClaveDeIdempotencia(String clave) {
        return Optional.ofNullable(porClave.get(clave));
    }

    @Override
    public Optional<Recibo> porNumero(NumeroDeRecibo numero) {
        return emitidos.stream().filter(r -> r.numero().equals(numero)).findFirst();
    }

    /**
     * Guarda lo que se pidio y devuelve una pagina vacia, igual que {@code ConveniosEnMemoria} y
     * por lo mismo: el filtrado —y el estado, que se DERIVA de {@code recibo_movimiento} (V30)— se
     * prueba contra PostgreSQL, y filtrar aqui en Java compararia dos derivaciones distintas sin
     * probar ninguna.
     *
     * <p>Lo que si conserva es el criterio, que es lo unico que la capa web decide: que los seis
     * filtros de la consulta lleguen al dominio, y que la pagina vacia salga como pagina vacia y no
     * como un 404.
     */
    @Override
    public Pagina<ReciboEnConsulta> buscar(CriterioDeRecibos criterio, Paginacion paginacion) {
        ultimoCriterio = criterio;
        ultimaPaginacion = paginacion;
        return Pagina.vacia(paginacion);
    }
}
