package kamayuk.caja.verificaciones;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import kamayuk.caja.SgtmAplicacion;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;

/**
 * Limites entre modulos (ADR-0003, ARQ-01 §4). Bloqueante.
 *
 * <p>Sin esto, "monolito modular" degrada a monolito en pocos meses: nada impide que un contexto
 * llame a las clases internas de otro, y cuando se nota ya hay cincuenta llamadas que desenredar.
 */
@DisplayName("ADR-0003 — Limites entre modulos")
class ModulosTest {

    private static final ApplicationModules MODULOS = ApplicationModules.of(SgtmAplicacion.class);

    @Test
    @DisplayName("los modulos esperados estan detectados")
    void losModulosEsperadosEstanDetectados() {
        List<String> detectados =
                MODULOS.stream().map(m -> m.getIdentifier().toString()).sorted().toList();

        // Si Modulith no detectara ningun modulo, verify() pasaria sin comprobar nada.
        //
        // Heredado del SRTM y verificado alli: un paquete con solo package-info.java
        // NO es un modulo para Modulith, hace falta al menos un tipo.
        //
        // La lista es la de ESTE sistema tras P5D. De los doce contextos del monolito aqui
        // queda UNO —`caja`— y NINGUN puerto de entrada hacia otro sistema: la caja no le
        // pregunta nada a nadie para cobrar (ADR-0026 §1). Que esta lista sea la mas corta de
        // los cuatro repositorios ES la propiedad, no una carencia.
        assertThat(detectados)
                .as("los modulos que ya tienen codigo")
                .contains(
                        // La plataforma y lo compartido, que viajan enteros con el sistema.
                        "dominio",
                        "compartido",
                        "plataforma",
                        "persistencia",
                        "auditoria",
                        "autorizacion",
                        // La copia local de usuarios, grupos y permisos (C-7, D-N5): el
                        // `ComprobadorDeAcceso` que el guardia pide y la implantacion que la
                        // siembra. Sin el, el contexto no levanta.
                        "seguridad",
                        "carga",
                        "documentos",
                        "web",
                        // El unico contexto acotado de este sistema, y el unico que va a haber. Se
                        // llama `nucleo` desde R-N: «kamayuk-caja-caja» repetia el nombre del
                        // sistema y la direccion pidio quitarlo. El identificador que Modulith
                        // detecta es el ULTIMO segmento del paquete, asi que renombrar el paquete
                        // lo renombra aqui — y esta lista es lo que lo puso en rojo al hacerlo.
                        "nucleo");
    }

    @Test
    @DisplayName("no hay dependencias no declaradas ni ciclos entre modulos")
    void noHayDependenciasNoDeclaradasNiCiclos() {
        MODULOS.verify();
    }
}
