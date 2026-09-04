package kamayuk.caja.seguridad.dominio;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * El catalogo de este sistema es <b>exactamente</b> lo que sus endpoints exigen.
 *
 * <p>{@link CatalogoDelSistema} es una lista escrita, y una lista escrita se desincroniza. Lo que
 * la ata a la realidad es esta prueba: recorre {@code src/main} de todo el repositorio, junta los
 * valores de {@code @RequiereAcceso(acceso = "...")} y exige que sean los mismos codigos.
 *
 * <p>Los dos sentidos importan, y por motivos distintos:
 *
 * <ul>
 *   <li><b>Un acceso que el catalogo no tiene</b> es una pantalla a la que nadie puede dar permiso
 *       —el guardia niega lo que no encuentra en {@code acceso}—, que es el defecto que RF-122
 *       existe para impedir.
 *   <li><b>Un acceso que sobra</b> es una fila que la implantacion siembra y un permiso que se
 *       otorga sobre algo que no existe: ruido en la pantalla de permisos y una promesa falsa.
 * </ul>
 */
@DisplayName("C-7 — el catalogo de este sistema es el de sus endpoints")
class CatalogoDelSistemaTest {

    /**
     * {@code @RequiereAcceso(acceso = "...")}, con la arroba de verdad.
     *
     * <p>Anclado a la arroba a proposito: el javadoc de la propia anotacion trae un ejemplo escrito
     * con la entidad HTML, y contarlo pondria esta prueba roja por una frase.
     */
    private static final Pattern DECLARADO =
            Pattern.compile("@RequiereAcceso\\s*\\(\\s*acceso\\s*=\\s*\"([a-z0-9_]+)\"");

    @Test
    @DisplayName("los mismos codigos, en los dos sentidos")
    void losMismosCodigos() throws IOException {
        Set<String> deLosEndpoints = new TreeSet<>();
        try (Stream<Path> fuentes = Files.walk(raizDelRepositorio())) {
            for (Path fuente :
                    fuentes.filter(p -> p.toString().endsWith(".java"))
                            .filter(p -> p.toString().contains("/src/main/"))
                            .filter(p -> !p.toString().contains("/build/"))
                            .toList()) {
                Matcher hallazgos =
                        DECLARADO.matcher(Files.readString(fuente, StandardCharsets.UTF_8));
                while (hallazgos.find()) {
                    deLosEndpoints.add(hallazgos.group(1));
                }
            }
        }

        assertThat(deLosEndpoints)
                .as(
                        "ningun endpoint declara acceso. O el patron dejo de reconocer la anotacion"
                                + " o este repositorio se quedo sin capa web: en los dos casos la"
                                + " comparacion de abajo pasaria sin comprobar nada")
                .isNotEmpty();

        List<String> delCatalogo =
                CatalogoDelSistema.opciones().stream()
                        .map(CatalogoDelSistema.Opcion::codigo)
                        .sorted()
                        .toList();

        assertThat(delCatalogo)
                .as(
                        "el catalogo que siembra la implantacion y los accesos que los endpoints"
                                + " exigen tienen que ser el mismo conjunto. Un acceso sin fila es una"
                                + " pantalla a la que nadie puede dar permiso (RF-122); una fila sin"
                                + " acceso es un permiso sobre algo que no existe")
                .containsExactlyElementsOf(deLosEndpoints);
    }

    @Test
    @DisplayName("y ninguna opcion se declara dos veces")
    void ningunaDosVeces() {
        List<String> codigos =
                CatalogoDelSistema.opciones().stream()
                        .map(CatalogoDelSistema.Opcion::codigo)
                        .toList();
        assertThat(codigos).doesNotHaveDuplicates();
    }

    private static Path raizDelRepositorio() {
        Path candidato = Path.of("").toAbsolutePath();
        while (candidato != null && !Files.isDirectory(candidato.resolve(".git"))) {
            candidato = candidato.getParent();
        }
        if (candidato == null) {
            throw new IllegalStateException(
                    "No se encontro la raiz del repositorio subiendo desde "
                            + Path.of("").toAbsolutePath()
                            + ". Sin ella esta prueba no puede leer ningun endpoint, y «no se pudo"
                            + " comprobar» no es «esta bien»");
        }
        return candidato;
    }
}
