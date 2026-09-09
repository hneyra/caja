package kamayuk.caja.seguridad.aplicacion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import kamayuk.caja.compartido.TenantContext;
import kamayuk.caja.plataforma.RecorridoPorMunicipalidades;
import kamayuk.caja.seguridad.EventoDeIdentidadRecibido;
import kamayuk.caja.seguridad.FuenteDeEventosDeIdentidad;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/**
 * El runner: de que municipalidad es el buzon, cuantas vueltas da y con que contexto las da.
 *
 * <p>Sin base de datos: el registro de municipalidades es una subclase que contesta de memoria, y
 * el aplicador un doble que cuenta. Lo que esta clase mide es el proceso, no la copia.
 */
@DisplayName("Etapa 4 — el runner del consumidor de identidad")
class CorrerElConsumidorDeIdentidadTest {

    private static final long CATACAOS = 7L;

    @AfterEach
    void limpiar() {
        TenantContext.limpiar();
    }

    @Test
    @DisplayName(
            "la municipalidad sale de la cuenta de servicio, y se resuelve contra el registro local")
    void laMunicipalidadSaleDeLaCuentaDeServicio() {
        assertThat(
                        CorrerElConsumidorDeIdentidad.municipalidadDe(
                                "kamayuk-caja-servicio-200105", registroCon("200105", CATACAOS)))
                .isEqualTo(CATACAOS);
    }

    @Test
    @DisplayName("una cuenta que no tiene la forma se rechaza nombrando la propiedad")
    void unaCuentaSinLaForma() {
        assertThatThrownBy(
                        () ->
                                CorrerElConsumidorDeIdentidad.municipalidadDe(
                                        "caja", registroCon("200105", CATACAOS)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("kamayuk.identidad.cliente")
                .hasMessageContaining("kamayuk-caja-servicio-<ubigeo>");
    }

    @Test
    @DisplayName("y una municipalidad no implantada aqui tampoco tiene copia que escribir")
    void unaMunicipalidadNoImplantada() {
        assertThatThrownBy(
                        () ->
                                CorrerElConsumidorDeIdentidad.municipalidadDe(
                                        "kamayuk-caja-servicio-200101",
                                        registroCon("200105", CATACAOS)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("200101")
                .hasMessageContaining("no esta implantada");
    }

    @Test
    @DisplayName(
            "da vueltas hasta que una no progresa, con el contexto puesto, y lo limpia al salir")
    void daVueltasHastaQueNoProgresa() {
        BuzonDeMentira buzon = new BuzonDeMentira(3);
        AplicadorQueCuenta aplicador = new AplicadorQueCuenta();
        CorrerElConsumidorDeIdentidad runner =
                new CorrerElConsumidorDeIdentidad(
                        new ConsumirEventosDeIdentidad(buzon, aplicador, (e, m, a) -> {}),
                        registroCon("200105", CATACAOS),
                        "kamayuk-caja-servicio-200105");

        runner.run(new DefaultApplicationArguments());

        assertThat(buzon.lecturas)
                .as("tres paginas con un evento y una cuarta vacia, que es la que para")
                .isEqualTo(4);
        assertThat(aplicador.contextos)
                .as("cada evento se aplico con el contexto de la municipalidad del buzon")
                .containsOnly(CATACAOS);
        assertThat(TenantContext.actualSiHay())
                .as("un proceso de vida corta limpia lo que fijo")
                .isEmpty();
    }

    @Test
    @DisplayName("y un buzon que no contesta sube tal cual, dejando el contexto limpio")
    void unBuzonQueNoContestaSube() {
        FuenteDeEventosDeIdentidad caido =
                new FuenteDeEventosDeIdentidad() {
                    @Override
                    public Lote pendientes(int limite) {
                        throw new IdentidadNoContesta("`identidad` contesto 403 al leer el buzon");
                    }

                    @Override
                    public Acuse acusar(List<UUID> eventoIds) {
                        return new Acuse(0, 0, 0);
                    }
                };
        CorrerElConsumidorDeIdentidad runner =
                new CorrerElConsumidorDeIdentidad(
                        new ConsumirEventosDeIdentidad(
                                caido, new AplicadorQueCuenta(), (e, m, a) -> {}),
                        registroCon("200105", CATACAOS),
                        "kamayuk-caja-servicio-200105");

        assertThatThrownBy(() -> runner.run(new DefaultApplicationArguments()))
                .as("transitorio: la corrida acaba en rojo y la copia se queda como estaba")
                .isInstanceOf(FuenteDeEventosDeIdentidad.IdentidadNoContesta.class)
                .hasMessageContaining("403");
        assertThat(TenantContext.actualSiHay()).isEmpty();
    }

    // ------------------------------------------------------------------

    private static RecorridoPorMunicipalidades registroCon(String ubigeo, long id) {
        DriverManagerDataSource sinBase = new DriverManagerDataSource();
        return new RecorridoPorMunicipalidades(
                JdbcClient.create(sinBase), new DataSourceTransactionManager(sinBase)) {
            @Override
            public List<Municipalidad> activas() {
                return List.of(new Municipalidad(id, ubigeo, "Municipalidad de la prueba"));
            }
        };
    }

    /** Sirve N paginas de un evento cada una y despues nada. */
    private static final class BuzonDeMentira implements FuenteDeEventosDeIdentidad {
        private int paginas;
        private int lecturas;

        BuzonDeMentira(int paginas) {
            this.paginas = paginas;
        }

        @Override
        public Lote pendientes(int limite) {
            lecturas++;
            if (paginas == 0) {
                return new Lote(List.of(), 0);
            }
            paginas--;
            return new Lote(
                    List.of(
                            new EventoDeIdentidadRecibido(
                                    UUID.randomUUID(),
                                    lecturas,
                                    "GRUPO_DADO_DE_ALTA",
                                    1L,
                                    "{}",
                                    "a".repeat(64),
                                    java.time.Instant.EPOCH)),
                    paginas);
        }

        @Override
        public Acuse acusar(List<UUID> eventoIds) {
            return new Acuse(eventoIds.size(), eventoIds.size(), paginas);
        }
    }

    /** Un aplicador que no toca ninguna base: anota con que contexto lo llamaron. */
    private static final class AplicadorQueCuenta extends AplicarUnEventoDeIdentidad {
        private final List<Long> contextos = new ArrayList<>();

        AplicadorQueCuenta() {
            super(
                    JdbcClient.create(new DriverManagerDataSource()),
                    tools.jackson.databind.json.JsonMapper.builder().build(),
                    java.time.Clock.systemUTC());
        }

        @Override
        public Aplicacion aplicar(EventoDeIdentidadRecibido evento) {
            contextos.add(TenantContext.actual().valor());
            return Aplicacion.APLICADO;
        }
    }
}
