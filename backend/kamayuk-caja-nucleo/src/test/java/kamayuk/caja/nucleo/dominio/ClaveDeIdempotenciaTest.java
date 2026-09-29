package kamayuk.caja.nucleo.dominio;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * #143 — La huella de una peticion: que dos peticiones distintas no puedan escribirse igual, y que
 * la misma de siempre lo sea.
 *
 * <p>Lo que decide que partes entran es de cada caso de uso, y se prueba con ellos ({@code
 * LaClaveSeAtaALaPeticionTest}). Aqui se prueba la forma canonica: el largo delante de cada parte,
 * el nulo que no es la cadena vacia y el SHA-256 en hexadecimal que admite {@code
 * recibo_huella_ck}.
 */
@DisplayName("#143 — La clave de idempotencia y la huella de su peticion")
class ClaveDeIdempotenciaTest {

    @Test
    @DisplayName("la misma peticion da la misma huella: un SHA-256 en hexadecimal y minusculas")
    void laMismaPeticionDaLaMismaHuella() {
        ClaveDeIdempotencia una = ClaveDeIdempotencia.de("k", List.of("acto=a", "caja=C-01"));
        ClaveDeIdempotencia otra = ClaveDeIdempotencia.de("k", List.of("acto=a", "caja=C-01"));

        assertThat(una.huella()).isEqualTo(otra.huella()).matches("[0-9a-f]{64}");
        assertThat(una.valor()).isEqualTo("k");
    }

    @Test
    @DisplayName("el largo delante de cada parte: [ab, c] y [a, bc] son peticiones distintas")
    void ningunaCombinacionSeEscribeComoOtra() {
        assertThat(ClaveDeIdempotencia.de("k", List.of("ab", "c")).huella())
                .as(
                        "[sin el largo delante, las dos se escribirian «abc» y un nombre de pagador"
                                + " con un separador dentro podria hacerse pasar por dos campos]")
                .isNotEqualTo(ClaveDeIdempotencia.de("k", List.of("a", "bc")).huella());
    }

    @Test
    @DisplayName("un campo ausente no es un campo vacio")
    void elNuloNoEsLaCadenaVacia() {
        assertThat(ClaveDeIdempotencia.parte("pagador.nombre", null)).isEqualTo("pagador.nombre");
        assertThat(ClaveDeIdempotencia.parte("pagador.nombre", "")).isEqualTo("pagador.nombre=");
        assertThat(ClaveDeIdempotencia.parte("orden", 7L)).isEqualTo("orden=7");
    }

    @Test
    @DisplayName("reconoce su huella, no otra; y una fila sin huella (antes de V8) como antes")
    void reconoce() {
        ClaveDeIdempotencia clave = ClaveDeIdempotencia.de("k", List.of("acto=a"));
        String otra = ClaveDeIdempotencia.de("k", List.of("acto=b")).huella();

        assertThat(clave.reconoce(clave.huella())).isTrue();
        assertThat(clave.reconoce(otra))
                .as("[la misma clave con otra peticion NO es el reintento de esta]")
                .isFalse();
        assertThat(clave.reconoce(null))
                .as("[un recibo anterior a V8 no guardo huella: no se sabe que lo trajo]")
                .isTrue();
    }

    @Test
    @DisplayName("la cabecera cabe en recibo.clave_idempotencia, o es 422 antes de cobrar nada")
    void laCabeceraCabeEnLaColumna() {
        String sesentaYCuatro = "k".repeat(ClaveDeIdempotencia.LARGO_MAXIMO);

        assertThat(ClaveDeIdempotencia.de(sesentaYCuatro, List.of("x")).valor())
                .isEqualTo(sesentaYCuatro);
        assertThatThrownBy(() -> ClaveDeIdempotencia.exigirValida(sesentaYCuatro + "k"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("hasta 64 caracteres, y trae 65");
        assertThatThrownBy(() -> ClaveDeIdempotencia.exigirValida("   "))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("vacia");
    }

    @Test
    @DisplayName("una huella que no es un SHA-256 en hexadecimal no se construye")
    void laHuellaTieneSuForma() {
        assertThatThrownBy(() -> new ClaveDeIdempotencia("k", "ABC"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("SHA-256");
    }
}
