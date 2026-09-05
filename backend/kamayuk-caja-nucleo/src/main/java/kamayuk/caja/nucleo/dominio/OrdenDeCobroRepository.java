package kamayuk.caja.nucleo.dominio;

import java.util.List;
import java.util.Optional;
import kamayuk.caja.compartido.Pagina;
import kamayuk.caja.compartido.Paginacion;

/** Las ordenes de cobro. */
public interface OrdenDeCobroRepository {

    /**
     * Da de alta una orden, o devuelve la que ya estaba.
     *
     * <p><b>Es idempotente por {@code (sistemaOrigen, referenciaExterna)}</b> y lo sostiene {@code
     * orden_referencia_uq}, no un {@code if}: un reintento del sistema de origen —o dos peticiones
     * simultaneas suyas— no pueden producir dos ordenes. Que la garantia sea del motor y no de una
     * comprobacion previa es lo que #188 dejo escrito: una comprobacion en Java se cuela por la
     * carrera, y aqui colarse significa cobrarle dos veces al mismo administrado.
     *
     * @return la orden guardada, y si ya estaba, LA QUE YA ESTABA — con su estado, que puede ser
     *     {@code PAGADA}. Quien llama tiene que mirarlo: reintentar el alta de algo ya cobrado no
     *     es un error, pero tampoco es un alta.
     */
    Alta registrar(OrdenDeCobro orden);

    /** Lo que devuelve un alta: la orden y si fue nueva. */
    record Alta(OrdenDeCobro orden, boolean nueva) {}

    Optional<OrdenDeCobro> porId(long id);

    Optional<OrdenDeCobro> porReferencia(SistemaDeOrigen sistema, String referenciaExterna);

    /**
     * Las ordenes que se van a cobrar, BLOQUEADAS.
     *
     * <p>Es el punto de serializacion de la ventanilla desde P5D, y sustituye a la relectura del
     * libro que hacia esa funcion en el monolito (#33, tercera barrera). Dos cobranzas de la misma
     * orden se ordenan en el motor: la segunda encuentra la fila ya {@code PAGADA} y no cobra.
     *
     * <p><b>Ordenadas por identificador</b>, y no es cosmetico: dos cajeros marcando el mismo par
     * de ordenes en distinto orden se bloquearian cruzados y uno de los dos moriria por
     * interbloqueo — que es un fallo intermitente en la ventanilla y el peor sitio para tenerlo.
     *
     * @throws OrdenInexistente si alguno de los identificadores no esta
     */
    List<OrdenDeCobro> bloquear(List<Long> ids);

    /** Marca las ordenes como cobradas por ese recibo. */
    void marcarPagadas(List<Long> ids, long reciboId);

    /**
     * Devuelve las ordenes a {@code PENDIENTE} al anularse su recibo.
     *
     * <p>No es lo mismo que {@link EstadoDeOrden#ANULADA}: el dinero volvio y la deuda sigue, asi
     * que la orden tiene que poder volver a cobrarse. Anularla aqui la dejaria sin cobrar para
     * siempre sin que nadie lo hubiera decidido.
     */
    void devolverAPendiente(long reciboId);

    /** Las ordenes que un recibo cobro. */
    List<OrdenDeCobro> delRecibo(long reciboId);

    Pagina<OrdenDeCobro> buscar(
            SistemaDeOrigen sistema, EstadoDeOrden estado, Paginacion paginacion);

    /** El identificador no esta en esta base. */
    final class OrdenInexistente extends RuntimeException {

        @java.io.Serial private static final long serialVersionUID = 1L;

        public OrdenInexistente(long id) {
            super(
                    "La orden de cobro "
                            + id
                            + " no existe en esta municipalidad. No es «ya se cobro» ni «no se"
                            + " puede cobrar todavia»: es que ese identificador no apunta a nada,"
                            + " y las tres se arreglan de maneras distintas");
        }
    }
}
