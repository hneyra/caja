package kamayuk.caja.autorizacion;

import java.time.LocalDate;

/**
 * Responde si un usuario puede hacer algo. El puerto; la implementacion vive en {@code seguridad}.
 *
 * <p>La fecha entra como argumento y no se lee del reloj: la autorizacion tiene vigencia (RF-123) y
 * una prueba tiene que poder situarse antes o despues de ella sin cambiar la hora de la maquina.
 */
public interface ComprobadorDeAcceso {

    /**
     * @param usuario la cuenta del usuario, tal como llega del token
     * @param acceso id de la opcion en el catalogo (NEG-03)
     * @param privilegio cual de los siete se exige
     * @param fecha dia para el que se comprueba la vigencia
     */
    boolean autoriza(String usuario, String acceso, Privilegio privilegio, LocalDate fecha);

    /**
     * Si este sistema conoce a la cuenta: si hay una fila en {@code usuario} con ella (#29 §8).
     *
     * <p><b>Existe para que la ausencia deje de ser silenciosa.</b> {@link #autoriza} devuelve
     * {@code false} tanto cuando el usuario esta dado de alta y no tiene el privilegio como cuando
     * no esta dado de alta en absoluto, y las dos cosas llegaban al funcionario como el mismo 403.
     * No son la misma cosa ni se arreglan igual: la primera la arregla un administrador concediendo
     * un permiso; la segunda <b>no se puede arreglar desde este sistema</b>, porque aqui no hay
     * ninguna escritura de administracion de seguridad — viven en {@code identidad} desde la etapa
     * 4 de ADR-0039, desde la etapa 5 ni la implantacion siembra la copia, y su unico escritor
     * local es {@code AplicarUnEventoDeIdentidad} (regla 12), que aplica lo que publica el buzon de
     * alli. Hasta #140 aqui decia {@code rentas} y «el sembrador».
     *
     * <p>Es el mismo reparto que #21 hizo en {@code caja} con el 401: separar lo que se arregla
     * dando un permiso de lo que se arregla del lado del despliegue, y <b>decirlo en el
     * mensaje</b>.
     *
     * @param usuario la cuenta del usuario, tal como llega del token
     */
    boolean conoceAlUsuario(String usuario);
}
