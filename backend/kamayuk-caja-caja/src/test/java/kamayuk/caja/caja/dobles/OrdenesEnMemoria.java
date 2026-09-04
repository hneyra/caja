package kamayuk.caja.caja.dobles;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import kamayuk.caja.caja.dominio.EstadoDeOrden;
import kamayuk.caja.caja.dominio.OrdenDeCobro;
import kamayuk.caja.caja.dominio.OrdenDeCobroRepository;
import kamayuk.caja.caja.dominio.SistemaDeOrigen;
import kamayuk.caja.compartido.Pagina;
import kamayuk.caja.compartido.Paginacion;

/**
 * Las ordenes de cobro, en memoria.
 *
 * <p>Reproduce la <b>idempotencia por {@code (sistemaOrigen, referenciaExterna)}</b> —que es lo que
 * el caso de uso tiene que poder dar por sentado— y que {@link #bloquear} se niegue ante un
 * identificador que no esta. Lo que <b>no</b> puede demostrar es que la idempotencia aguante bajo
 * concurrencia: eso lo sostiene {@code orden_referencia_uq} (V2), y se prueba contra PostgreSQL con
 * hilos de verdad. Un doble solo demuestra que el codigo hace lo que el doble deja hacer.
 *
 * <p>Tampoco simula el {@code FOR UPDATE}: el bloqueo de una fila no existe sin motor. Lo que si
 * reproduce es el <b>orden por identificador</b> que el puerto promete, porque de eso depende que
 * dos cajeros no se bloqueen cruzados y esa promesa se puede romper sin base de datos.
 */
public final class OrdenesEnMemoria implements OrdenDeCobroRepository {

    private final Map<Long, OrdenDeCobro> porId = new LinkedHashMap<>();
    private long siguienteId = 1;

    /** Cuantas veces se pidio bloquear: lo que delata una cobranza que lee dos veces. */
    private int bloqueos;

    /** Deja sembrada una orden y devuelve la guardada, con su identificador. */
    public OrdenDeCobro con(OrdenDeCobro orden) {
        return registrar(orden).orden();
    }

    /** Todas las ordenes, en el orden en que entraron. */
    public List<OrdenDeCobro> todas() {
        return List.copyOf(porId.values());
    }

    public int bloqueos() {
        return bloqueos;
    }

    @Override
    public Alta registrar(OrdenDeCobro orden) {
        Optional<OrdenDeCobro> yaEstaba =
                porReferencia(orden.sistemaOrigen(), orden.referenciaExterna());
        if (yaEstaba.isPresent()) {
            // La que ya estaba, CON SU ESTADO: puede ser PAGADA, y quien llama tiene que
            // poder mirarlo. Devolver una copia nueva escondería que el alta no fue un alta.
            return new Alta(yaEstaba.get(), false);
        }
        long id = siguienteId++;
        OrdenDeCobro guardada = conId(orden, id);
        porId.put(id, guardada);
        return new Alta(guardada, true);
    }

    @Override
    public Optional<OrdenDeCobro> porId(long id) {
        return Optional.ofNullable(porId.get(id));
    }

    @Override
    public Optional<OrdenDeCobro> porReferencia(SistemaDeOrigen sistema, String referenciaExterna) {
        return porId.values().stream()
                .filter(orden -> orden.sistemaOrigen().equals(sistema))
                .filter(orden -> orden.referenciaExterna().equals(referenciaExterna.strip()))
                .findFirst();
    }

    @Override
    public List<OrdenDeCobro> bloquear(List<Long> ids) {
        bloqueos++;
        List<OrdenDeCobro> marcadas = new ArrayList<>(ids.size());
        for (long id : ids.stream().sorted().toList()) {
            marcadas.add(
                    porId(id).orElseThrow(() -> new OrdenDeCobroRepository.OrdenInexistente(id)));
        }
        return marcadas;
    }

    @Override
    public void marcarPagadas(List<Long> ids, long reciboId) {
        for (long id : ids) {
            OrdenDeCobro orden =
                    porId(id).orElseThrow(() -> new OrdenDeCobroRepository.OrdenInexistente(id));
            porId.put(id, conEstado(orden, EstadoDeOrden.PAGADA, reciboId));
        }
    }

    @Override
    public void devolverAPendiente(long reciboId) {
        for (Map.Entry<Long, OrdenDeCobro> entrada : porId.entrySet()) {
            OrdenDeCobro orden = entrada.getValue();
            if (orden.reciboId() != null && orden.reciboId() == reciboId) {
                entrada.setValue(conEstado(orden, EstadoDeOrden.PENDIENTE, null));
            }
        }
    }

    @Override
    public List<OrdenDeCobro> delRecibo(long reciboId) {
        return porId.values().stream()
                .filter(orden -> orden.reciboId() != null && orden.reciboId() == reciboId)
                .toList();
    }

    /**
     * Filtra y pagina en memoria.
     *
     * <p>Aqui si se filtra —al contrario que {@code RecibosEnMemoria}— porque el criterio es un par
     * de igualdades sobre columnas propias, no una derivacion: no hay dos versiones de la misma
     * cuenta que puedan divergir.
     *
     * <p>Los dos criterios son obligatorios, igual que en {@code OrdenDeCobroRepositoryJdbc}, cuyo
     * {@code WHERE} los exige. Admitir aqui un nulo como «todas» haria al doble mas permisivo que
     * la consulta real, y una prueba escrita contra esa holgura pasaria en verde y reventaria en
     * produccion.
     */
    @Override
    public Pagina<OrdenDeCobro> buscar(
            SistemaDeOrigen sistema, EstadoDeOrden estado, Paginacion paginacion) {
        List<OrdenDeCobro> todas =
                porId.values().stream()
                        .filter(orden -> orden.sistemaOrigen().equals(sistema))
                        .filter(orden -> orden.estado() == estado)
                        .toList();
        int desde = Math.min(paginacion.desplazamiento(), todas.size());
        int hasta = Math.min(desde + paginacion.tamano(), todas.size());
        return Pagina.de(todas.subList(desde, hasta), paginacion, todas.size());
    }

    // ------------------------------------------------------------------

    private static OrdenDeCobro conId(OrdenDeCobro orden, long id) {
        return new OrdenDeCobro(
                id,
                orden.sistemaOrigen(),
                orden.referenciaExterna(),
                orden.concepto(),
                orden.detalle(),
                orden.importe(),
                orden.fechaExigibilidad(),
                orden.actualizadoA(),
                orden.pagador(),
                orden.estado(),
                orden.reciboId(),
                orden.creadaEn(),
                orden.observacion());
    }

    private static OrdenDeCobro conEstado(OrdenDeCobro orden, EstadoDeOrden estado, Long reciboId) {
        return new OrdenDeCobro(
                orden.id(),
                orden.sistemaOrigen(),
                orden.referenciaExterna(),
                orden.concepto(),
                orden.detalle(),
                orden.importe(),
                orden.fechaExigibilidad(),
                orden.actualizadoA(),
                orden.pagador(),
                estado,
                reciboId,
                orden.creadaEn(),
                orden.observacion());
    }
}
