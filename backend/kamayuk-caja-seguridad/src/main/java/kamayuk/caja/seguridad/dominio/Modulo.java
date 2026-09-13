package kamayuk.caja.seguridad.dominio;

/**
 * Un modulo del menu de este sistema, tal como esta en {@code modulo_sistema}.
 *
 * <p>Lo siembra {@code SembradorDelCatalogo} desde {@link CatalogoDelSistema}; aqui solo se lee.
 * Sin validaciones en el constructor a proposito: lo que llega es la fila que ya paso los {@code
 * CHECK} y los anchos de la tabla, y un record de lectura que rechazara una fila existente dejaria
 * a la interfaz sin arbol por un motivo que no se arregla desde ella.
 *
 * @param orden posicion en el menu
 * @param activo un modulo retirado se desactiva; no se borra (RNF-051)
 */
public record Modulo(long id, String codigo, String nombre, int orden, boolean activo) {}
