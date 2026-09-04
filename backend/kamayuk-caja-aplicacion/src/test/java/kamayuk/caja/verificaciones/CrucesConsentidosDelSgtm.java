package kamayuk.caja.verificaciones;

import java.util.List;
import kamayuk.comun.verificaciones.ConfiguracionDeLasVerificaciones.CruceConsentido;

/**
 * Los cruces de SQL que atraviesan una frontera de sistema y todavia no se pueden cerrar.
 *
 * <p><b>Esta lista esta VACIA, y tiene que estarlo.</b> `caja` no lee ni una tabla de otro sistema
 * y no puede: no las tiene en su base. Lo unico que sale de aqui es el buzon —por HTTP, despues del
 * {@code COMMIT}— y lo unico que entra es una orden de cobro.
 *
 * <p>El cruce que este sistema heredaba era {@code PENDIENTE-CRUCE-06} de GOB-05 §6.8: {@code
 * ReciboRepositoryJdbc} traducia un codigo del padron de contribuyentes a su identificador dentro
 * de un {@code SELECT}, para poder filtrar recibos por contribuyente. <b>Se cerro en P5D</b>, y no
 * publicando una lectura ni pidiendosela a `rentas`: <b>copiando el pagador en el propio recibo</b>
 * (`V2` §2.bis, {@code recibo.pagador_documento} y {@code pagador_nombre}).
 *
 * <p>Que se cerrara asi y no de otra manera importa, porque es lo unico que no decide <b>D-17</b>:
 * sigue abierto si la caja tendra su propio registro de pagadores o si habra uno compartido. Lo que
 * P5D hizo fue que esa pregunta <b>deje de bloquear la separacion</b> — y de paso arreglo un
 * defecto que estaba ahi antes: releer el nombre del padron daba un duplicado distinto del original
 * con el mismo numero, que es lo que {@code recibo_movimiento.resumen} existe para impedir (#34).
 *
 * <p>Se conserva la clase con la lista vacia en vez de borrarla: {@code FronteraDeSistemaTest}
 * comprueba que cada entrada siga eximiendo un cruce de verdad, y una lista vacia es la unica forma
 * de que el dia que alguien anada una se vea en el diff con su motivo al lado.
 */
final class CrucesConsentidosDelSgtm {

    private CrucesConsentidosDelSgtm() {}

    static final List<CruceConsentido> LISTA = List.of();
}
