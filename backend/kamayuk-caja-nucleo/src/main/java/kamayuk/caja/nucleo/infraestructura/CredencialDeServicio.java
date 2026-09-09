package kamayuk.caja.nucleo.infraestructura;

/**
 * De donde sale el {@code Authorization} con el que la caja llama a otro sistema (#21 AC-2).
 *
 * <p>Existe para que {@link ClienteHttpDelSistemaDeOrigen} no sepa <b>como</b> se consigue. Hasta
 * #21 lo que mandaba era una cadena configurada —lo que {@code bootstrap-secretos.sh} genera: un
 * valor aleatorio que ningun emisor firmo— y el destino contestaba 401. Ahora lo que se configura
 * es la <b>clave con la que se pide el token</b>, y quien lo pide es {@link
 * TokenDeServicioDeKeycloak}.
 *
 * <p><b>Devuelve la cabecera entera, con su esquema.</b> Devolver solo el token dejaria el {@code
 * "Bearer "} escrito en el cliente HTTP, y entonces una implementacion que no fuera portadora —o un
 * dia una que firmara— no cabria sin tocarlo.
 *
 * <p>Puede lanzar {@link kamayuk.caja.nucleo.dominio.BuzonDelSistemaDeOrigen.NoContesta}: no poder
 * pedir el token es un fallo que <b>se arregla del lado del despliegue y cambia solo</b>, que es
 * literalmente la definicion de esa excepcion. Marcarlo como rechazo mataria el pago al primer
 * intento, que es el defecto que AC-3 cerro por su otro lado.
 */
@FunctionalInterface
public interface CredencialDeServicio {

    /** La cabecera {@code Authorization}, o cadena vacia si este despliegue no tiene ninguna. */
    String cabecera();

    /**
     * Una credencial fija, para las pruebas y para el compose sin identidad.
     *
     * <p>No es un atajo de produccion: existe para que una prueba pueda decir «con esta cabecera»
     * sin levantar un emisor, igual que {@code CobrarConElOrigenApagadoTest} usa un puerto que
     * nadie escucha en vez de un doble que lanza.
     */
    static CredencialDeServicio fija(String cabecera) {
        return () -> cabecera;
    }
}
