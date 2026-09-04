package kamayuk.caja.caja.aplicacion;

import java.util.Objects;
import kamayuk.caja.caja.dominio.CriterioDeRecibos;
import kamayuk.caja.caja.dominio.ReciboEnConsulta;
import kamayuk.caja.caja.dominio.ReciboRepository;
import kamayuk.caja.compartido.Pagina;
import kamayuk.caja.compartido.Paginacion;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * El listado de recibos emitidos (#548, RF-082): la grilla «Recibos localizados» de {@code
 * duplicado_recibo}.
 *
 * <h2>El hueco que cierra</h2>
 *
 * <p>Hasta #548 el unico camino a un recibo era {@code GET /tesoreria/recibos/{nro}/duplicado}, o
 * sea <b>saber el numero impreso</b>. Quien pierde el papel —que es la persona que se acerca a
 * ventanilla a pedir un duplicado— no tenia forma de encontrarlo, y la pantalla del manual dibuja
 * una grilla de busqueda por contribuyente, fecha y caja que nadie podia llenar.
 *
 * <h2>Por que es un caso de uso y no una llamada suelta al repositorio</h2>
 *
 * <p>Por lo mismo que {@link ConsultaDeConvenios}: sin transaccion no hay {@code SET LOCAL}, y sin
 * el la politica RLS de {@code recibo} no devuelve vacio sino que <b>revienta</b> —{@code
 * current_setting('app.municipalidad_id')::bigint} sobre la cadena vacia no se puede evaluar
 * (#486)—. El {@code @Transactional(readOnly = true)} de aqui es lo que garantiza el contexto de
 * tenant.
 *
 * <h2>El nombre YA NO se resuelve: viene en la fila (P5D)</h2>
 *
 * <p>Hasta P5D esta consulta preguntaba al padron de contribuyentes —una lectura por pagina, no una
 * por fila— para poner el nombre en la grilla. Ese padron es de `rentas` y esta base no lo tiene
 * (GOB-05 §6.8, `PENDIENTE-CRUCE-06`), asi que el nombre viaja <b>congelado en el propio
 * recibo</b>.
 *
 * <p>No es solo que ahora no se pueda preguntar: <b>tampoco se debia</b>. El nombre del padron es
 * el de hoy y el recibo es de marzo; releerlo hacia que la grilla y el papel que el administrado
 * tiene en la mano pudieran decir cosas distintas. Es la misma decision que {@code
 * recibo_movimiento.resumen} sostiene para el duplicado (#34).
 *
 * <h2>Ninguna cifra se recalcula</h2>
 *
 * <p>El importe de cada fila es el que el recibo congelo, con la fecha a la que estaba actualizado
 * (regla 9). Este caso de uso <b>no tiene reloj</b> y no lo necesita: aqui no hay nada que dependa
 * de que dia es hoy.
 */
@Service
public class ConsultaDeRecibos {

    private final ReciboRepository recibos;

    public ConsultaDeRecibos(ReciboRepository recibos) {
        this.recibos = recibos;
    }

    /**
     * La pagina de recibos que pide el criterio.
     *
     * <p>Un criterio sin resultados devuelve una pagina vacia con {@code totalElementos = 0}, nunca
     * un 404: un contribuyente sin recibos no es un error, es una busqueda sin resultados —el mismo
     * criterio de {@code consulta_deuda} y de {@code valores_busqueda}—.
     */
    @Transactional(readOnly = true)
    public Pagina<FilaDeRecibo> listar(CriterioDeRecibos criterio, Paginacion paginacion) {
        Objects.requireNonNull(criterio, "La consulta necesita su criterio");
        Objects.requireNonNull(paginacion, "Sin paginacion no hay orden garantizado");

        return recibos.buscar(criterio, paginacion).mapear(FilaDeRecibo::new);
    }

    /**
     * Una fila de la grilla.
     *
     * <p>Es un envoltorio de una sola cosa, y se conserva a proposito: hasta P5D llevaba tambien el
     * contribuyente resuelto del padron, y quitarlo cambiaria la firma que el borde HTTP consume.
     * Con el envoltorio, el dia que la fila vuelva a llevar algo mas —el estado del pago, por
     * ejemplo— no hay que tocar la firma otra vez.
     */
    public record FilaDeRecibo(ReciboEnConsulta recibo) {}
}
