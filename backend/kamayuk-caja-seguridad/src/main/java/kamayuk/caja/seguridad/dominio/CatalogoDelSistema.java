package kamayuk.caja.seguridad.dominio;

import java.util.List;

/**
 * Las opciones del menu que sirve <b>este</b> sistema (NEG-03, RF-122).
 *
 * <h2>Por que aqui hay una lista y en {@code rentas} se lee un documento</h2>
 *
 * <p>{@code rentas} lee {@code docs/10-negocio/catalogo-de-opciones.md} —las 134 opciones del
 * manual— porque ese documento vive en su repositorio. Aqui no vive: leerlo obligaria a que el
 * build de {@code caja} dependiera del clon de {@code rentas} <b>en produccion</b>, y no solo en
 * las pruebas. Lo que se hace en su lugar es lo que el inventario del corte ya decia: «cada sistema
 * siembra <b>su parte</b>».
 *
 * <p>Cual es su parte no se elige a ojo: es <b>el conjunto de {@code acceso} que sus propios
 * endpoints declaran</b> con {@code @RequiereAcceso}. Y eso no se deja a la buena memoria — {@code
 * CatalogoDelSistemaTest} recorre {@code src/main}, junta los valores de la anotacion y exige que
 * sean exactamente estos. Una opcion de mas seria un permiso que nadie puede usar; una de menos,
 * una pantalla a la que no se le puede dar permiso, que es el defecto que RF-122 existe para
 * impedir.
 *
 * <p>El nombre y el modulo estan transcritos de {@code
 * rentas/docs/10-negocio/catalogo-de-opciones.md}, que sigue siendo la fuente del manual. Se copian
 * y no se derivan por lo dicho arriba, y por eso la prueba compara <b>codigos</b>: es lo unico que
 * este sistema puede comprobar por si mismo.
 *
 * <p>Es una clase de dominio: sin Spring, sin base de datos y sin reloj (regla 7).
 */
public final class CatalogoDelSistema {

    private CatalogoDelSistema() {}

    /** Una opcion del menu, con el modulo al que pertenece. */
    public record Opcion(String moduloCodigo, String moduloNombre, String codigo, String nombre) {}

    private static final List<Opcion> OPCIONES =
            List.of(
                    new Opcion("TESORERIA", "Tesoreria", "caja_tributaria", "Caja tributaria"),
                    new Opcion(
                            "TESORERIA",
                            "Tesoreria",
                            "caja_tasas",
                            "Caja de tasas y derechos administrativos"),
                    new Opcion("TESORERIA", "Tesoreria", "cierre_caja", "Cierre y arqueo de caja"));

    /** Las opciones de este sistema, en el orden del catalogo del manual. */
    public static List<Opcion> opciones() {
        return OPCIONES;
    }
}
