package kamayuk.caja.verificaciones;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import kamayuk.comun.verificaciones.AsercionesQueNoPuedenFallarTestBase;
import kamayuk.comun.verificaciones.RevisorDeAserciones.Censo;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * #724: ninguna asercion de AssertJ compara un {@code Optional} con algo que no lo es.
 *
 * <p>Recorre {@code src/test} de todos los modulos de <b>este</b> repositorio; el escaner y su
 * muestra viven en {@code comun-verificaciones}.
 */
@DisplayName("#724 — Aserciones que no pueden fallar")
class AsercionesQueNoPuedenFallarTest extends AsercionesQueNoPuedenFallarTestBase {

    @Test
    @DisplayName("aqui `llave` no existe, y por eso el censo no la nombra")
    void aquiLlaveNoExiste() throws IOException {
        // #724 decidio censar por CLASE y no por nombre porque `llave` era ambiguo: diecinueve
        // clases lo declaraban `Optional<String>` y cuatro no. Esa premisa se afirma contra el
        // arbol de cada repositorio, y ya cambio dos veces de ejemplo —#723 y P5C—.
        //
        // EN ESTE ARBOL LA PREMISA NO SE PUEDE AFIRMAR, y hay que decirlo en vez de copiar la
        // asercion de otro repositorio y dejarla verde por casualidad: `llave` es el nombre del
        // discriminador de un parametro tributario que falta publicar, y `caja` no lee ni un
        // parametro. Lo que si se comprueba es que el censo lo sabe —no nombra la clase— y que
        // por tanto una asercion sobre `llave` aqui no puede pasar en verde por «estar en la
        // lista».
        //
        // Lo que sigue mordiendo es el escaner entero, que corre sobre `src/test` de los cinco
        // modulos: eso lo prueba la clase base, con su muestra.
        Censo censo = censarDelDisco(fuentesJava(raizDelBackend()));

        assertThat(censo.clasesConOptional("llave"))
                .as(
                        "`llave` es de `normativa` y de quien lee sus parametros; esta caja no lee"
                                + " ninguno (ADR-0026 §1), asi que aqui no hay ninguna clase que"
                                + " lo declare")
                .isEmpty();
        assertThat(censo.nombresInequivocos())
                .as("y no aparece como nombre inequivoco: sencillamente no esta")
                .doesNotContain("llave");
    }
}
