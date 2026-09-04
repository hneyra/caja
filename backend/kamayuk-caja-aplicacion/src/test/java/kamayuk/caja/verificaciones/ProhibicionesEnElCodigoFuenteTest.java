package kamayuk.caja.verificaciones;

import static org.assertj.core.api.Assertions.assertThat;

import kamayuk.comun.verificaciones.ProhibicionesEnElCodigoFuenteTestBase;
import kamayuk.comun.verificaciones.RevisorDeCodigoFuente;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Las prohibiciones de texto de ARQ-04 §2, sobre el codigo de {@code caja}.
 *
 * <p>Hereda de {@code comun-verificaciones} el escaner y las pruebas que lo demuestran, y añade la
 * que es <b>de este repositorio</b>: que la lista de clases que componen un area a mano este VACIA,
 * y que el escaner siga mordiendo igual.
 */
@DisplayName("ARQ-04 §2 — Prohibiciones en el codigo fuente")
class ProhibicionesEnElCodigoFuenteTest extends ProhibicionesEnElCodigoFuenteTestBase {

    @Test
    @DisplayName("la lista de clases que componen el area a mano esta vacia, y no puede no estarlo")
    void ningunaClaseCompneElAreaAMano() {
        // #607 midio que un `area_m2` no se convierte a texto a mano: va tipada y la escribe el
        // serializador. La lista de excepciones existe para los sitios donde el papel no tiene
        // serializador, y en el monolito tenia seis entradas.
        //
        // AQUI ESTA VACIA, Y ESO NO ES UN OLVIDO: un `area_m2` es una medida del predio y vive en
        // `catastro`. Lo unico que este sistema llama «area» es la OFICINA generadora de la
        // recaudacion —`area.codigo`, `area.nombre`—, que es una unidad organica y no una
        // superficie. Por eso el dominio de tipo `area_m2` tampoco esta en el baseline de este
        // sistema (P5D): se retiro con los otros cuatro que ninguna columna usa.
        //
        // La distincion la anticipa el propio #607, que la nombra: «en castellano `area` tambien
        // es una unidad organica».
        assertThat(new ConfiguracionDeCaja().componenElAreaAManoConMotivo())
                .as(
                        "una entrada aqui afirmaria que este sistema guarda una superficie, y no"
                                + " guarda ninguna: el area de un predio es de `catastro`")
                .isEmpty();
    }

    @Test
    @DisplayName("y el escaner sigue mordiendo: con la lista vacia, cualquier clase es un hallazgo")
    void conLaListaVaciaCualquierClaseEsUnHallazgo() {
        // La otra mitad, y la que importa: una lista vacia podria significar «no hay excepciones»
        // o «el escaner no mira nada». Se demuestra que es lo primero.
        String fuente =
                """
                final class Modelo {
                    static Tabla de(Fue fue) {
                        return Campo.de("Area del terreno (m2)",
                                fue.areaTerreno().valor().toPlainString());
                    }
                }
                """;

        assertThat(RevisorDeCodigoFuente.revisarAreas("UnRecursoCualquiera.java", fuente))
                .as(
                        "sin ninguna entrada en la lista, la linea es un hallazgo la escriba quien la escriba")
                .hasSize(1);
        assertThat(
                        RevisorDeCodigoFuente.revisarAreas(
                                "ModeloDeLaFichaDelContribuyente.java", fuente))
                .as(
                        "y tampoco la exime el nombre que SI la eximia en `catastro`: la lista es"
                                + " la de ESTE sistema, no la del monolito")
                .hasSize(1);
    }
}
