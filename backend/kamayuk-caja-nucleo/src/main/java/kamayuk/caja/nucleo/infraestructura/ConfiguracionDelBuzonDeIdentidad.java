package kamayuk.caja.nucleo.infraestructura;

import java.time.Clock;
import kamayuk.caja.seguridad.FuenteDeEventosDeIdentidad;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import tools.jackson.databind.json.JsonMapper;

/**
 * Registra el cliente del buzon de {@code identidad} para el consumidor del modulo {@code
 * seguridad}, solo en el perfil {@code batch} y solo si hay buzon ({@code KAMAYUK_IDENTIDAD_URL}).
 *
 * <p>Vive en {@code nucleo} y no en {@code seguridad} porque el cliente reusa {@link
 * TokenDeServicioDeKeycloak}, que es de aqui —y que no se mueve ni se copia (AC-5 de {@code
 * identidad#3})—. La segunda credencial se construye <b>a mano</b> y no como {@code @Component}: el
 * proveedor ya es un bean para el camino de {@code rentas}, y un segundo bean del mismo tipo
 * dejaria a los dos clientes sin saber cual inyectar. Aqui el proveedor no es un bean: es un
 * colaborador del cliente, con SU clave.
 *
 * <p><b>Las cuatro propiedades no tienen valor por omision en {@code application.yaml}</b>, y es a
 * proposito: {@code @ConditionalOnProperty("kamayuk.identidad.url")} tiene que poder NO cumplirse,
 * y un {@code ${KAMAYUK_IDENTIDAD_URL:}} lo cumpliria con la cadena vacia. Entran por el entorno
 * ({@code KAMAYUK_IDENTIDAD_URL}, {@code _TOKEN}, {@code _CLIENTE}, {@code _CREDENCIAL}), como
 * {@code kamayuk.catastro.url} en {@code rentas}.
 */
@Configuration(proxyBeanMethods = false)
@Profile("batch")
@ConditionalOnProperty("kamayuk.identidad.url")
public class ConfiguracionDelBuzonDeIdentidad {

    @Bean
    FuenteDeEventosDeIdentidad fuenteDeEventosDeIdentidad(
            JsonMapper json,
            Clock reloj,
            @Value("${kamayuk.identidad.url}") String raiz,
            @Value("${kamayuk.identidad.token:}") String punto,
            @Value("${kamayuk.identidad.cliente:}") String clienteDeServicio,
            @Value("${kamayuk.identidad.credencial:}") String clave) {
        TokenDeServicioDeKeycloak credencial =
                new TokenDeServicioDeKeycloak(json, reloj, punto, clienteDeServicio, clave);
        return new ClienteHttpDelBuzonDeIdentidad(json, raiz, credencial);
    }
}
