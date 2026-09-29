package kamayuk.caja.seguridad.infraestructura;

import java.util.List;
import java.util.StringJoiner;
import kamayuk.caja.seguridad.AlertaDeHuerfanasYaAdoptadas;
import kamayuk.caja.seguridad.HuerfanaYaAdoptada;
import kamayuk.caja.seguridad.aplicacion.HuerfanasYaAdoptadas;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * El aviso de las filas que un sujeto nuevo ya adopto sobre la de otro (#137), al mismo responsable
 * y por el mismo canal que {@link AlertaDeIdentidadEnElRegistro}: una linea de ERROR con {@code
 * KAMAYUK_CAJA_RESPONSABLE} y {@code KAMAYUK_CAJA_CANAL} dentro, que quien opere la instalacion
 * encamina.
 *
 * <p>Una clase aparte y no un metodo mas de aquella para no tocarla mientras #125 y sus
 * seguimientos la cambian; las dos variables son las mismas y se exigen igual, sin valor por
 * omision.
 */
@Component
@Profile("batch")
@ConditionalOnProperty("kamayuk.identidad.url")
public class AlertaDeHuerfanasYaAdoptadasEnElRegistro implements AlertaDeHuerfanasYaAdoptadas {

    private static final Logger REGISTRO =
            LoggerFactory.getLogger(AlertaDeHuerfanasYaAdoptadasEnElRegistro.class);

    private final String responsable;
    private final String canal;

    public AlertaDeHuerfanasYaAdoptadasEnElRegistro(
            @Value("${kamayuk.caja.conciliacion.responsable}") String responsable,
            @Value("${kamayuk.caja.conciliacion.canal}") String canal) {
        if (responsable.isBlank() || canal.isBlank()) {
            throw new IllegalStateException(
                    "El aviso de las huerfanas ya adoptadas necesita a quien avisar:"
                            + " KAMAYUK_CAJA_RESPONSABLE y KAMAYUK_CAJA_CANAL (ADR-0026 §4). Sin"
                            + " ellos una fila que concede lo de otra persona no lo sabria nadie");
        }
        this.responsable = responsable;
        this.canal = canal;
    }

    @Override
    public void hayHuerfanasYaAdoptadas(List<HuerfanaYaAdoptada> candidatas) {
        StringJoiner lista = new StringJoiner("; ");
        for (HuerfanaYaAdoptada fila : candidatas) {
            StringJoiner heredado = new StringJoiner(", ");
            for (HuerfanaYaAdoptada.Herencia herencia : fila.heredado()) {
                heredado.add(herencia.que() + " «" + herencia.de() + "» desde " + herencia.desde());
            }
            lista.add(
                    fila.tabla()
                            + " «"
                            + fila.clave()
                            + "» (id "
                            + fila.id()
                            + " aqui, sujeto "
                            + fila.sujeto()
                            + " de `identidad`, cuya alta entro aqui el "
                            + fila.altaAplicadaEn()
                            + ") concede lo anterior a esa alta: "
                            + heredado);
        }
        REGISTRO.error(
                "LA COPIA LOCAL DE LA AUTORIZACION TIENE {} FILA(S) QUE UN SUJETO DE `identidad`"
                        + " PROBABLEMENTE ADOPTO SOBRE LA DE OTRO (#137): {}. Cada una concede algo"
                        + " que entro en esta copia mas de {} min antes que el alta de quien la tiene hoy"
                        + " —y despues de la primera corrida del consumidor, asi que no es lo que"
                        + " sembraba la implantacion—: una afiliacion o un permiso que su propia alta"
                        + " no pudo preceder. Lo mas probable es una clave renombrada y reutilizada"
                        + " antes de V5, o un alta que #111 dejo adoptar por la clave. Es un"
                        + " candidato, no una certeza: comprueba en `identidad` la auditoria de esa"
                        + " clave. Si heredo, retira en `identidad` lo heredado para ese sujeto"
                        + " —desafiliarlo del grupo, fijar ese permiso sin privilegios— o inhabilitalo"
                        + " y dale a la persona otra cuenta; el evento lo aplica aqui y la corrida"
                        + " siguiente deja de listarla. Esta caja no edita estas filas por su cuenta:"
                        + " su unico escritor es el consumidor del buzon (regla 12)"
                        + " (docs/40-datos/huerfanas-ya-adoptadas.md). Responsable: {} <{}>",
                candidatas.size(),
                lista,
                HuerfanasYaAdoptadas.MARGEN.toMinutes(),
                responsable,
                canal);
    }
}
