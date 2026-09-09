package kamayuk.caja.verificaciones;

import static kamayuk.caja.verificaciones.ContratoQueConsumeDeRentas.ordenados;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import kamayuk.comun.verificaciones.contrato.ContratoDelConsumidor;
import kamayuk.comun.verificaciones.contrato.ContratoQueSePublicaTestBase;
import org.junit.jupiter.api.DisplayName;

/**
 * Lo que {@code caja} le pide y le lee al buzon de {@code identidad} (ADR-0039 etapa 4), publicado
 * para que el CI de {@code identidad} lo compruebe: {@code ContratoConCajaTest} de aquel
 * repositorio nacio en su etapa 3 con {@code @Disabled} y con una guarda que afirma que este
 * archivo <b>todavia no existe</b>; en cuanto exista, esa guarda sale roja alli y hay que quitarle
 * el {@code @Disabled}. Es la forma en que las dos mitades se encuentran sin que ninguna dependa de
 * la otra para compilar.
 *
 * <h2>Las dos operaciones, y de donde salen los campos</h2>
 *
 * <p>Son exactamente los que {@code ClienteHttpDelBuzonDeIdentidad} pide y lee, y no uno mas: un
 * campo declarado es un campo que {@code identidad} no puede retirar sin poner rojo su build, asi
 * que declarar de mas es atarle las manos por nada (la disciplina de {@code rentas}#9).
 *
 * <ul>
 *   <li>{@code GET /eventos/pendientes?limite=}: se leen los siete campos de cada evento —el {@code
 *       cuerpo} como TEXTO, que es la fila entera tal como quedo en {@code identidad}, y se abre
 *       despues con el lector de esta copia— y {@code quedan}, que es el retraso.
 *   <li>{@code POST /eventos/acuses}: se manda {@code {"eventos":[…]}} —la forma de {@code
 *       EventosController.PeticionDeAcuse}— y se leen las tres cifras de la respuesta, que el
 *       consumidor escribe en su registro.
 * </ul>
 */
@DisplayName("Contrato que caja consume de identidad")
public class ContratoQueConsumeDeIdentidad extends ContratoQueSePublicaTestBase {

    /** Un evento tal como viaja: la forma de `EventosController.EventoResource`. */
    public static final Map<String, Object> EVENTO =
            ordenados(
                    Map.entry("eventoId", "texto"),
                    Map.entry("secuencia", "entero"),
                    Map.entry("tipo", "texto"),
                    Map.entry("sujetoId", "entero"),
                    Map.entry("cuerpo", "texto"),
                    Map.entry("huella", "texto"),
                    Map.entry("creadoEn", "texto"));

    @Override
    protected ContratoDelConsumidor contrato() {
        Map<String, ContratoDelConsumidor.OperacionEsperada> operaciones = new LinkedHashMap<>();
        operaciones.put(
                "GET /eventos/pendientes",
                ContratoDelConsumidor.OperacionEsperada.lectura(
                        Set.of("limite"),
                        ordenados(
                                Map.entry("eventos", List.of(EVENTO)),
                                Map.entry("quedan", "entero"))));
        operaciones.put(
                "POST /eventos/acuses",
                new ContratoDelConsumidor.OperacionEsperada(
                        Set.of(),
                        ordenados(
                                Map.entry("recibidos", "entero"),
                                Map.entry("escritos", "entero"),
                                Map.entry("quedan", "entero")),
                        ordenados(Map.entry("eventos", List.of("texto")))));
        return new ContratoDelConsumidor("caja", "identidad", "/identidad/api/v1", operaciones);
    }
}
