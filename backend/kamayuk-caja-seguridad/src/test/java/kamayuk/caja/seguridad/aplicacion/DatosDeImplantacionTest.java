package kamayuk.caja.seguridad.aplicacion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * Sin {@code municipalidad-id} declarado no hay implantacion (#132).
 *
 * <p>Spring enlaza un {@code long} que nadie puso como {@code 0}. Si el record lo aceptara, la
 * implantacion escribiria la fila con el id 0 —o, antes de #132, dejaria que la secuencia eligiera—
 * y el claim de los tokens, que lleva el numero que el ambiente declara, apuntaria a otro
 * inquilino. El {@code 0} y el negativo se tratan igual porque se arreglan igual: declarandolo.
 */
@DisplayName("#132 — el id de la municipalidad se declara, o no se implanta")
class DatosDeImplantacionTest {

    @ParameterizedTest(name = "municipalidad-id = {0}")
    @ValueSource(longs = {0L, -1L})
    void sinUnIdPositivoNoSeConstruye(long municipalidadId) {
        Throwable salio =
                catchThrowable(
                        () ->
                                new DatosDeImplantacion(
                                        "200105",
                                        municipalidadId,
                                        "Municipalidad Distrital de Catacaos",
                                        "DISTRITAL",
                                        "administrador",
                                        "Administrador del sistema",
                                        false,
                                        null));

        assertThat(salio)
                .as(
                        "un id que no es positivo paso: sin declararlo, el Job escribe una fila que"
                                + " ningun claim nombra y cada cajero recibe 403 con la fila delante")
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(salio.getMessage())
                .as(
                        "el rojo nombra la propiedad Y la variable que la pone, que es lo que se arregla")
                .contains("kamayuk.implantacion.municipalidad-id")
                .contains("KAMAYUK_IMPLANTACION_MUNICIPALIDADID");
    }

    @ParameterizedTest(name = "municipalidad-id = {0}")
    @ValueSource(longs = {1L, 42L})
    void conUnIdPositivoLoConserva(long municipalidadId) {
        DatosDeImplantacion datos =
                new DatosDeImplantacion(
                        "200105",
                        municipalidadId,
                        "Municipalidad Distrital de Catacaos",
                        "DISTRITAL",
                        "administrador",
                        "Administrador del sistema",
                        false,
                        null);

        assertThat(datos.municipalidadId()).isEqualTo(municipalidadId);
    }
}
