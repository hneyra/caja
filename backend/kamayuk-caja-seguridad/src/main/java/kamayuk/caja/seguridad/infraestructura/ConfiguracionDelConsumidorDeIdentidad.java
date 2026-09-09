package kamayuk.caja.seguridad.infraestructura;

import kamayuk.caja.seguridad.AlertaDeEventosSinAplicar;
import kamayuk.caja.seguridad.FuenteDeEventosDeIdentidad;
import kamayuk.caja.seguridad.aplicacion.AplicarUnEventoDeIdentidad;
import kamayuk.caja.seguridad.aplicacion.ConsumirEventosDeIdentidad;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

/**
 * Arma el consumidor del buzon de {@code identidad} en el perfil {@code batch}, solo si hay un
 * buzon al que ir ({@code KAMAYUK_IDENTIDAD_URL}).
 *
 * <p>Lo que este modulo no aporta es la {@link FuenteDeEventosDeIdentidad}: el cliente HTTP vive en
 * {@code nucleo.infraestructura}, junto al otro cliente de esta caja y a {@code
 * TokenDeServicioDeKeycloak}, que reusa con una segunda credencial. Este modulo declara el puerto y
 * quien lo consume; el que lo implementa lo registra desde alli. Es la unica arista entre los dos
 * modulos y va de {@code nucleo} hacia aqui, no al reves.
 *
 * <p>Sin la propiedad, ninguno de estos beans existe y la implantacion lo dice al terminar.
 */
@Configuration(proxyBeanMethods = false)
@Profile("batch")
@ConditionalOnProperty("kamayuk.identidad.url")
public class ConfiguracionDelConsumidorDeIdentidad {

    @Bean
    ConsumirEventosDeIdentidad consumirEventosDeIdentidad(
            FuenteDeEventosDeIdentidad fuente,
            AplicarUnEventoDeIdentidad aplicador,
            AlertaDeEventosSinAplicar alerta) {
        return new ConsumirEventosDeIdentidad(fuente, aplicador, alerta);
    }
}
