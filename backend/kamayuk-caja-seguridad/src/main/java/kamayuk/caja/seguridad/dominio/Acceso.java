package kamayuk.caja.seguridad.dominio;

/**
 * Algo sobre lo que se otorgan privilegios en este sistema, tal como esta en {@code acceso}.
 *
 * <p>El {@code codigo} de una opcion de menu es el mismo que un controlador declara en {@code
 * RequiereAcceso} y el mismo que la matriz de la sesion usa como clave: que sea el mismo en los
 * tres sitios es lo que permite a la interfaz cruzar el arbol con los permisos sin traducir nada.
 *
 * <p>{@code tipo} va como texto y no como enumerado, a diferencia de {@code rentas}: la tabla ya lo
 * restringe con su {@code CHECK} ({@code OPCION_MENU} o {@code POLITICA}), este sistema no decide
 * nada segun el tipo y un enumerado solo anadiria una forma de que una fila valida no se pudiera
 * leer.
 *
 * @param activo un acceso retirado se desactiva; los permisos que cuelgan de el son constancia
 */
public record Acceso(
        long id, long moduloId, String tipo, String codigo, String nombre, boolean activo) {}
