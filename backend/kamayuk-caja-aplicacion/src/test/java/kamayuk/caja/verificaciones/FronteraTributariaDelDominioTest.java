package kamayuk.caja.verificaciones;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.lang.ArchRule;
import java.util.Set;
import kamayuk.caja.dominio.Ejercicio;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * ADR-0045 / #118 — ninguna clase NUEVA de {@code kamayuk.caja.nucleo.dominio} depende de un tipo
 * tributario de {@code kamayuk-caja-dominio-compartido}.
 *
 * <h2>Por que esta regla es LOCAL, y no vive en {@code comun-verificaciones}</h2>
 *
 * <p>Es la unica de las cinco caras del producto que heredo un recibo del monolito con conceptos
 * tributarios adentro —medido y escrito en ADR-0045—: `rentas`, `catastro` y `normativa` SI conocen
 * tributos, y no tienen nada que congelar; a `identidad` no le llega ni la pregunta. Una regla que
 * solo este arbol necesita no se sube a la libreria compartida por la misma razon que
 * `ArqueoDeTurno` no vive en `comun-verificaciones`: anadir una prohibicion alli exige su clase de
 * muestra y toca los seis builds para vigilar, en cinco de ellos, el conjunto vacio.
 *
 * <h2>Que vigila, y que NO</h2>
 *
 * <p>Vigila DEPENDENCIAS DE TIPO: que ninguna clase nueva de {@code kamayuk.caja.nucleo.dominio}
 * importe un tipo tributario de {@code kamayuk-caja-dominio-compartido}. Hoy ese tipo es uno solo,
 * {@link Ejercicio} —medido con {@code grep} sobre el paquete entero (#118): es el UNICO tipo de
 * {@code kamayuk.caja.dominio} que el contexto acotado importa, y solo lo importa {@code
 * LineaDeRecibo}—. La lista de tipos vigilados no se amplia con tipos que nadie importa todavia:
 * eso vigilaria una suposicion, y CLAUDE.md pide "medido, no supuesto".
 *
 * <p><b>No vigila</b> que {@code TipoDePago} lleve valores tributarios (`PRECONVENIO`,
 * `CUOTA_CONVENIO`, `A_CUENTA`) ni que {@code RecaudacionDeTributo} se llame como se llama: ninguno
 * de los dos depende de un TIPO ajeno —cargan el concepto en un enum y en un {@code String}—, asi
 * que ArchUnit no tiene una dependencia que morder. Esas dos quedan declaradas como legado en
 * ADR-0045 y vigiladas por la revision, no por esta regla.
 *
 * <h2>La lista blanca, y por que no crece</h2>
 *
 * <p>{@link #CLASES_HEREDADAS_DEL_ADR_0045} es exactamente el inventario que ADR-0045 declaro
 * legado congelado. Ninguna clase nueva se agrega: si la caja alguna vez necesita un concepto
 * tributario nuevo en su dominio, eso es D-17 decidiendose, no una importacion suelta que esta
 * regla deje pasar porque el archivo ya estaba en la lista.
 *
 * <h2>Como se demuestra que muerde</h2>
 *
 * <p>{@code FronteraTributariaMuerdeSobreLaMuestraTest} aplica la MISMA regla —con {@link #regla} —
 * sobre {@link kamayuk.caja.verificaciones.muestras.ConceptoTributarioNuevoDeMuestra}, una clase
 * que vive fuera de produccion y declara a proposito un campo {@link Ejercicio} sin estar en
 * ninguna lista blanca. Sin esa prueba, esta regla podria estar mal escrita —una condicion
 * invertida, un paquete que no resuelve nada— y pasar en verde para siempre sin haber protegido
 * nunca nada, que es el argumento entero de {@code ReglasDeArquitecturaMuerdenTest}.
 */
@DisplayName("ADR-0045 — la frontera tributaria del dominio, hacia adelante (#118)")
class FronteraTributariaDelDominioTest {

    /** El contexto acotado entero, sin sus subpaquetes (no tiene ninguno hoy). */
    static final String PAQUETE_DOMINIO = "kamayuk.caja.nucleo.dominio";

    /**
     * Las tres clases que ADR-0045 declara legado congelado: heredaron un concepto tributario del
     * recibo del monolito y no se retiran ni se amplian. Ninguna clase nueva se suma a esta lista.
     */
    static final Set<String> CLASES_HEREDADAS_DEL_ADR_0045 =
            Set.of(
                    PAQUETE_DOMINIO + ".LineaDeRecibo",
                    PAQUETE_DOMINIO + ".TipoDePago",
                    PAQUETE_DOMINIO + ".RecaudacionDeTributo");

    /**
     * Los tipos tributarios de {@code kamayuk-caja-dominio-compartido} que esta regla vigila. Ver
     * el javadoc de la clase: la lista nace de lo medido, no de lo que podria importarse algun dia.
     */
    static final Class<?>[] TIPOS_TRIBUTARIOS_VIGILADOS = {Ejercicio.class};

    @Test
    @DisplayName("ninguna clase nueva de kamayuk.caja.nucleo.dominio depende de un tipo tributario")
    void ningunaClaseNuevaDependeDeConceptosTributarios() {
        JavaClasses clases = new ClassFileImporter().importPackages(PAQUETE_DOMINIO);
        regla(PAQUETE_DOMINIO, CLASES_HEREDADAS_DEL_ADR_0045).check(clases);
    }

    /**
     * La regla, parametrizada por paquete y lista blanca: la misma construccion la usa esta prueba
     * sobre produccion y {@code FronteraTributariaMuerdeSobreLaMuestraTest} sobre la muestra que la
     * viola a proposito, sin lista blanca.
     */
    static ArchRule regla(String paquete, Set<String> clasesHeredadas) {
        DescribedPredicate<JavaClass> noEsHeredada =
                DescribedPredicate.describe(
                        "no es una clase heredada del ADR-0045",
                        javaClass -> !clasesHeredadas.contains(javaClass.getFullName()));
        return noClasses()
                .that()
                .resideInAPackage(paquete)
                .and(noEsHeredada)
                .should()
                .dependOnClassesThat()
                .belongToAnyOf(TIPOS_TRIBUTARIOS_VIGILADOS)
                .because(
                        "ADR-0045 (#118): el recibo hereda tributo del monolito y ese legado esta"
                                + " congelado en LineaDeRecibo, TipoDePago y RecaudacionDeTributo;"
                                + " ninguna OTRA clase de kamayuk.caja.nucleo.dominio puede"
                                + " sumarse. Si la caja necesita un concepto tributario nuevo, D-17"
                                + " decide antes, no una importacion suelta");
    }
}
