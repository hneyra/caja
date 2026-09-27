package kamayuk.caja.verificaciones;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.lang.ArchRule;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Demuestra que {@link FronteraTributariaDelDominioTest} MUERDE (#118, ADR-0045): una regla que
 * nunca vio un rojo protege lo mismo que ninguna. Es el mismo argumento que sostiene {@code
 * ReglasDeArquitecturaMuerdenTest} en {@code comun-verificaciones}, aplicado a una regla que —por
 * ser de este repositorio y no de la libreria compartida— no viaja con ese arnes.
 *
 * <p>La muestra vive en {@code kamayuk.caja.verificaciones.muestras}, fuera del arbol de
 * produccion: {@link kamayuk.caja.verificaciones.muestras.ConceptoTributarioNuevoDeMuestra} declara
 * a proposito un campo {@link kamayuk.caja.dominio.Ejercicio} — exactamente el tipo que ADR-0045
 * prohibe fuera de la lista blanca—, y aqui se comprueba la regla SIN lista blanca, para que no
 * tenga donde esconderse.
 */
@DisplayName("ADR-0045 — la regla de la frontera tributaria MUERDE sobre su muestra (#118)")
class FronteraTributariaMuerdeSobreLaMuestraTest {

    private static final String PAQUETE_DE_MUESTRAS = "kamayuk.caja.verificaciones.muestras";

    @Test
    @DisplayName("una clase nueva con un campo Ejercicio rompe la regla, nombrandola")
    void laMuestraViolaLaRegla() {
        JavaClasses clases = new ClassFileImporter().importPackages(PAQUETE_DE_MUESTRAS);
        ArchRule regla = FronteraTributariaDelDominioTest.regla(PAQUETE_DE_MUESTRAS, Set.of());

        assertThatThrownBy(() -> regla.check(clases))
                .as("una regla sin una muestra que la viole pasa en verde para siempre")
                .isInstanceOf(AssertionError.class)
                .hasMessageContaining("ConceptoTributarioNuevoDeMuestra")
                .hasMessageContaining("Ejercicio");
    }
}
