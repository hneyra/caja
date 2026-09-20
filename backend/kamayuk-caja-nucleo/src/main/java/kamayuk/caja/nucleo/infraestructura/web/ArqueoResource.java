package kamayuk.caja.nucleo.infraestructura.web;

import java.util.List;
import kamayuk.caja.nucleo.dominio.ArqueoDelTurno;
import kamayuk.caja.nucleo.dominio.LineaDeArqueo;
import kamayuk.caja.web.ImporteActualizado;
import org.jspecify.annotations.Nullable;

/**
 * El arqueo de un turno, tal como sale por HTTP (#36, RF-087).
 *
 * <p>Todo importe viaja como {@link ImporteActualizado}: la cifra y la fecha a la que corresponde,
 * juntas y sin poder separarse (regla 9, RNF-075). Un arqueo sin su fecha no se puede conciliar con
 * el deposito del dia siguiente.
 *
 * <p><b>Las cifras no se recomponen aqui.</b> {@code neto} y {@code diferencia} salen de {@link
 * ArqueoDelTurno}, que las calcula de sus lineas; la interfaz no resta nada. Es la misma regla que
 * el resto de la cola: una cifra recompuesta en el cliente es una cifra que puede discrepar de la
 * que se archivo.
 *
 * <h2>El arqueo EN VIVO no declara nada, y desde #97 lo dice en vez de decir cero</h2>
 *
 * <p>Hay dos momentos de este mismo recurso y no dicen lo mismo:
 *
 * <ul>
 *   <li>el <b>acta</b> ({@link #de}), que congela lo que el cajero conto en el cajon al cerrar;
 *   <li>el <b>avance</b> ({@link #enVivo}), que se mira mientras se cobra y donde <b>todavia no hay
 *       nada declarado</b> —un {@code GET} no lleva el recuento del cajon, y {@code ArqueoDeTurno}
 *       lo pide con el mapa vacio a proposito—.
 * </ul>
 *
 * <p>Hasta #97 los dos publicaban las mismas tres cifras, asi que el avance contestaba siempre
 * {@code declarado} 0,00, {@code diferencia} igual al neto en negativo y {@code cuadra} false. No
 * era un dato: era el mapa vacio disfrazado de recuento, y la pantalla lo pintaba en tres de sus
 * diez campos y en dos de las seis columnas del desglose. En una ventanilla, una cifra de ejemplo
 * se lee como real. Ahora el avance las manda <b>nulas</b> —el hueco, que es lo que hay— y quien
 * dibuja pone su palabra; el acta las manda con su valor, que ahi si lo tienen.
 *
 * <h2>Lo que el prototipo dibuja y aqui no esta</h2>
 *
 * <p><b>{@code turno} (MAÑANA / TARDE / CONTINUO)</b>: no existe como dato. {@code cierre_uq} (V3)
 * hace unico el turno por (caja, cajero, fecha) y no hay columna que lo parta en dos, asi que un
 * cajero tiene un turno al dia por ventanilla. Publicar «CONTINUO» fijo seria inventar un campo que
 * despues alguien filtraria.
 *
 * <p><b>{@code horaDeApertura} y {@code horaDeCierre}</b>: la apertura consta —{@code
 * cierre_caja.fecha_apertura} (V29)— pero {@code TurnoDeCaja} no la lleva y este recurso tampoco;
 * la hora de cierre es {@code registradoEn} del acta. Queda anotado.
 *
 * @param turnoId el turno arqueado
 * @param fecha el dia del turno, en ISO
 * @param recibosEmitidos cuantos recibos emitio
 * @param recibosAnulados cuantos de ellos se anularon
 * @param cobrado lo que entro, con su fecha
 * @param anulado lo que las anulaciones sacaron, con su fecha
 * @param neto lo cobrado menos lo anulado
 * @param declarado lo que el cajero conto en el cajon. <b>Nulo en el avance</b>: nadie ha contado
 *     nada todavia
 * @param diferencia lo declarado menos el neto; negativo si falta dinero. Nulo si no hay declarado
 * @param cuadra si la diferencia es cero. Nulo si no hay declarado: no se sabe, y no es «no»
 * @param lineas el arqueo medio de pago por medio de pago
 */
public record ArqueoResource(
        long turnoId,
        String fecha,
        int recibosEmitidos,
        int recibosAnulados,
        ImporteActualizado cobrado,
        ImporteActualizado anulado,
        ImporteActualizado neto,
        @Nullable ImporteActualizado declarado,
        @Nullable ImporteActualizado diferencia,
        @Nullable Boolean cuadra,
        List<LineaResource> lineas) {

    /** El acta: lo declarado se conto de verdad y viaja con su cifra. */
    public static ArqueoResource de(ArqueoDelTurno arqueo) {
        return armar(arqueo, true);
    }

    /**
     * El avance en vivo: lo declarado no existe todavia y viaja nulo.
     *
     * <p><b>No es lo mismo que declarar cero.</b> Cero es «conte el cajon y no habia nada»; nulo es
     * «nadie lo ha contado». Lo primero descuadra el turno; lo segundo no dice nada del turno.
     */
    public static ArqueoResource enVivo(ArqueoDelTurno arqueo) {
        return armar(arqueo, false);
    }

    private static ArqueoResource armar(ArqueoDelTurno arqueo, boolean conDeclaracion) {
        List<LineaResource> lineas =
                arqueo.lineas().stream()
                        .map(linea -> LineaResource.de(linea, arqueo, conDeclaracion))
                        .toList();
        return new ArqueoResource(
                arqueo.turnoId(),
                arqueo.aLaFecha().toString(),
                arqueo.recibosEmitidos(),
                arqueo.recibosAnulados(),
                new ImporteActualizado(arqueo.totalCobrado(), arqueo.aLaFecha()),
                new ImporteActualizado(arqueo.totalAnulado(), arqueo.aLaFecha()),
                new ImporteActualizado(arqueo.neto(), arqueo.aLaFecha()),
                conDeclaracion
                        ? new ImporteActualizado(arqueo.totalDeclarado(), arqueo.aLaFecha())
                        : null,
                conDeclaracion
                        ? new ImporteActualizado(arqueo.diferencia(), arqueo.aLaFecha())
                        : null,
                conDeclaracion ? arqueo.cuadra() : null,
                lineas);
    }

    /**
     * Una fila del arqueo.
     *
     * <p>Las cifras van cada una con su fecha. Es repetitivo a proposito: la alternativa —«la fecha
     * esta arriba»— es exactamente como una cifra acaba impresa sin ella el dia que alguien
     * reutiliza esta fila en otra pantalla.
     *
     * @param formaDePago con que se pago
     * @param cobrado lo que ese medio movio
     * @param anulado lo que sus anulaciones devolvieron
     * @param neto la resta de los dos
     * @param declarado lo que el cajero conto de ese medio; nulo en el avance
     * @param diferencia lo declarado menos el neto; nulo en el avance
     */
    public record LineaResource(
            String formaDePago,
            ImporteActualizado cobrado,
            ImporteActualizado anulado,
            ImporteActualizado neto,
            @Nullable ImporteActualizado declarado,
            @Nullable ImporteActualizado diferencia) {

        static LineaResource de(
                LineaDeArqueo linea, ArqueoDelTurno arqueo, boolean conDeclaracion) {
            return new LineaResource(
                    linea.formaDePago().name(),
                    new ImporteActualizado(linea.cobrado(), arqueo.aLaFecha()),
                    new ImporteActualizado(linea.anulado(), arqueo.aLaFecha()),
                    new ImporteActualizado(linea.neto(), arqueo.aLaFecha()),
                    conDeclaracion
                            ? new ImporteActualizado(linea.declarado(), arqueo.aLaFecha())
                            : null,
                    conDeclaracion
                            ? new ImporteActualizado(linea.diferencia(), arqueo.aLaFecha())
                            : null);
        }
    }
}
