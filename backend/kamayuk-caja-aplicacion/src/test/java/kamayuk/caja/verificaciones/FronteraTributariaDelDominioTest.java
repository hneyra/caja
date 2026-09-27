package kamayuk.caja.verificaciones;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.lang.ArchRule;
import java.util.Set;
import kamayuk.caja.dominio.Dinero;
import kamayuk.caja.dominio.Observacion;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * ADR-0045 / #118 — ninguna clase NUEVA de {@code kamayuk.caja.nucleo.dominio} depende de un tipo
 * de {@code kamayuk-caja-dominio-compartido} (el paquete {@code kamayuk.caja.dominio}) que no sea
 * uno de los dos genericos que este contexto acotado ya usa.
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
 * <h2>FALLA CERRADO, y esa es la ronda 1 de #118</h2>
 *
 * <p>La primera version de esta regla (antes de la revision) solo vigilaba {@code Ejercicio}, el
 * unico tipo tributario que {@code kamayuk.caja.nucleo.dominio} importa <b>hoy</b>. Eso no impide
 * nada NUEVO: una clase que sumara {@code Alicuota}, {@code CodigoContribuyente} o {@code Placa} —
 * los tres, tipos tributarios/catastrales de {@code dominio-compartido} que este contexto no usa—
 * pasaria en verde, porque la lista no los nombraba. La version de esta ronda invierte el criterio:
 * en vez de enumerar cada tipo PROHIBIDO, enumera los DOS tipos PERMITIDOS —{@link
 * #TIPOS_GENERICOS_PERMITIDOS}— y prohibe todo el resto de {@code kamayuk.caja.dominio} por
 * omision. Un tipo tributario nuevo que ese paquete gane manana queda vigilado sin tocar esta
 * clase.
 *
 * <p>{@link #TIPOS_GENERICOS_PERMITIDOS} nace de lo medido con {@code grep} sobre {@code
 * kamayuk.caja.nucleo.dominio} entero (#118): de todo {@code kamayuk.caja.dominio}, solo {@link
 * Dinero} (todo importe) y {@link Observacion} (la regla 10) se usan hoy, y ninguno de los dos es
 * tributario —son los mismos que usa cualquier contexto del producto—. {@code Ejercicio} deja de
 * estar permitido en general: solo sigue entrando por la excepcion de clase de {@link
 * #CLASES_HEREDADAS_DEL_ADR_0045}.
 *
 * <h2>La lista blanca por CLASE, y por que baja a una sola</h2>
 *
 * <p>{@link #CLASES_HEREDADAS_DEL_ADR_0045} solo trae {@code LineaDeRecibo}: es la UNICA clase de
 * {@code kamayuk.caja.nucleo.dominio} que depende de un tipo de {@code kamayuk.caja.dominio} fuera
 * de los dos genericos —importa {@code Ejercicio}—. {@code TipoDePago} y {@code
 * RecaudacionDeTributo}, que ADR-0045 tambien declara legado, NO estan aqui: ninguna de las dos
 * depende de un tipo tributario —cargan el concepto en un enum y en un {@code String}—, asi que
 * bajo esta regla no necesitan excepcion. Siguen declaradas como legado en el ADR, que es donde se
 * lee el porque; esta lista es solo lo que la dependencia de TIPOS obliga a eximir.
 *
 * <h2>Como se demuestra que muerde</h2>
 *
 * <p>{@code FronteraTributariaMuerdeSobreLaMuestraTest} aplica la MISMA regla —con {@link #regla} —
 * sobre {@link kamayuk.caja.verificaciones.muestras.ConceptoTributarioNuevoDeMuestra}, una clase
 * que vive fuera de produccion y declara a proposito un campo {@code Alicuota} —deliberadamente NO
 * {@code Ejercicio}, para probar que la regla prohibe por omision y no por una lista de tipos
 * prohibidos que alguien tendria que acordarse de ampliar—, sin estar en ninguna lista blanca. Sin
 * esa prueba, esta regla podria estar mal escrita —una condicion invertida, un paquete que no
 * resuelve nada— y pasar en verde para siempre sin haber protegido nunca nada, que es el argumento
 * entero de {@code ReglasDeArquitecturaMuerdenTest}.
 */
@DisplayName("ADR-0045 — la frontera tributaria del dominio, hacia adelante (#118)")
class FronteraTributariaDelDominioTest {

    /** El contexto acotado entero, sin sus subpaquetes (no tiene ninguno hoy). */
    static final String PAQUETE_DOMINIO = "kamayuk.caja.nucleo.dominio";

    /** El paquete de {@code dominio-compartido} que carga los tipos tributarios y los genericos. */
    static final String PAQUETE_COMPARTIDO = "kamayuk.caja.dominio";

    /**
     * La UNICA clase de {@code kamayuk.caja.nucleo.dominio} que depende de un tipo de {@link
     * #PAQUETE_COMPARTIDO} fuera de {@link #TIPOS_GENERICOS_PERMITIDOS}: hereda {@code Ejercicio}
     * del recibo del monolito (ADR-0045). Ninguna clase nueva se suma a esta lista: si la caja
     * alguna vez necesita un concepto tributario nuevo en su dominio, eso es D-17 decidiendose, no
     * una importacion suelta que esta regla deje pasar porque el archivo ya estaba en la lista.
     */
    static final Set<String> CLASES_HEREDADAS_DEL_ADR_0045 =
            Set.of(PAQUETE_DOMINIO + ".LineaDeRecibo");

    /**
     * Los dos tipos de {@link #PAQUETE_COMPARTIDO} que CUALQUIER clase de {@code
     * kamayuk.caja.nucleo.dominio} puede usar, heredada o no: ninguno es tributario, y los dos son
     * de uso general en todo el producto. Medido con {@code grep}: son los DOS unicos que ese
     * paquete importa hoy fuera de {@code Ejercicio}. Ampliar esta lista es una decision de
     * arquitectura, no un descuido —cada tipo nuevo que entre aqui deja de estar vigilado para
     * SIEMPRE, en toda clase futura—.
     */
    static final Class<?>[] TIPOS_GENERICOS_PERMITIDOS = {Dinero.class, Observacion.class};

    @Test
    @DisplayName(
            "ninguna clase nueva de kamayuk.caja.nucleo.dominio depende de un tipo de"
                    + " kamayuk.caja.dominio que no sea generico")
    void ningunaClaseNuevaDependeDeUnTipoDeDominioCompartidoQueNoSeaGenerico() {
        JavaClasses clases =
                new ClassFileImporter().importPackages(PAQUETE_DOMINIO, PAQUETE_COMPARTIDO);
        regla(PAQUETE_DOMINIO, CLASES_HEREDADAS_DEL_ADR_0045).check(clases);
    }

    /**
     * La regla, parametrizada por paquete y lista blanca de clases: la misma construccion la usa
     * esta prueba sobre produccion y {@code FronteraTributariaMuerdeSobreLaMuestraTest} sobre la
     * muestra que la viola a proposito, sin lista blanca.
     */
    static ArchRule regla(String paquete, Set<String> clasesHeredadas) {
        DescribedPredicate<JavaClass> noEsHeredada =
                DescribedPredicate.describe(
                        "no es una clase heredada del ADR-0045",
                        javaClass -> !clasesHeredadas.contains(javaClass.getFullName()));
        DescribedPredicate<JavaClass> esDeDominioCompartidoYNoEsGenerico =
                DescribedPredicate.describe(
                        "reside en "
                                + PAQUETE_COMPARTIDO
                                + " y no es uno de los tipos genericos"
                                + " permitidos",
                        javaClass ->
                                javaClass.getPackageName().equals(PAQUETE_COMPARTIDO)
                                        && noEsGenericoPermitido(javaClass));
        return noClasses()
                .that()
                .resideInAPackage(paquete)
                .and(noEsHeredada)
                .should()
                .dependOnClassesThat(esDeDominioCompartidoYNoEsGenerico)
                .because(
                        "ADR-0045 (#118): el recibo hereda tributo del monolito y ese legado esta"
                                + " congelado en LineaDeRecibo -la unica excepcion de tipo-, TipoDePago"
                                + " y RecaudacionDeTributo -que no dependen de ningun tipo tributario-;"
                                + " ninguna OTRA clase de kamayuk.caja.nucleo.dominio puede depender de"
                                + " un tipo de kamayuk.caja.dominio que no sea Dinero u Observacion. Si"
                                + " la caja necesita un concepto tributario nuevo, D-17 decide antes,"
                                + " no una importacion suelta");
    }

    private static boolean noEsGenericoPermitido(JavaClass javaClass) {
        for (Class<?> permitido : TIPOS_GENERICOS_PERMITIDOS) {
            if (javaClass.isEquivalentTo(permitido)) {
                return false;
            }
        }
        return true;
    }
}
