package kamayuk.caja.nucleo.infraestructura.web;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import kamayuk.caja.nucleo.dominio.SituacionDelCajero;
import kamayuk.caja.nucleo.dominio.TurnoConSuCaja;

/**
 * El turno de la ventanilla de quien pregunta, tal como sale por HTTP (#97).
 *
 * <h2>«No hay turno abierto» es un dato, no un 404</h2>
 *
 * <p>Esta lectura contesta <b>200 siempre</b>. Un cajero que no ha abierto hoy, uno que ya cerro y
 * uno que tiene turno abierto son tres respuestas distintas de la misma pregunta bien hecha, y las
 * tres llevan a sitios distintos —cobrar, reversar el cierre, arquear—. Un 404 las juntaria con la
 * cuarta, que si es un error: preguntar por un turno que no existe. Es la diferencia que {@code
 * /recaudacion/avance} <b>no</b> puede hacer, porque alli el turno es un filtro del informe y no la
 * pregunta.
 *
 * <p>Lo que distingue las tres lo dice {@code situacion} ({@link SituacionDelCajero}), calculado
 * <b>aqui</b> y no en la pantalla: es la misma regla que el resto de esta cola —lo que el cliente
 * recompone es lo que puede acabar discrepando de lo que el servidor diria—.
 *
 * <h2>Lo que no lleva, y por que</h2>
 *
 * <p><b>Ninguna cifra.</b> Ni cobrado, ni neto, ni recibos: eso es el arqueo, y lo publica {@code
 * GET /turnos/&#123;turnoId&#125;/cierre} con la fecha de cada importe pegada (regla 9). Repetir
 * aqui un total seria tener dos sitios donde mirar el mismo dinero.
 *
 * <h2>La hora de apertura, desde #104</h2>
 *
 * <p>Cada turno lleva {@code abiertoEn}: {@code cierre_caja.fecha_apertura}, la que escribio la
 * apertura con el reloj de la caja. Hasta #104 no viajaba porque {@link
 * kamayuk.caja.nucleo.dominio.TurnoDeCaja} no la llevaba. Viaja <b>aqui</b> y no en el arqueo: es
 * la lectura con la que la pantalla de cierre ya encadena el arqueo por su {@code turnoId}, y el
 * arqueo no conoce el turno, sino sus recibos.
 *
 * @param cajero de quien es esta respuesta; sale del token, nunca de un parametro (ADR-0028)
 * @param fecha el dia de trabajo al que corresponde, en ISO: el del reloj de esta caja
 * @param situacion SIN_ABRIR, ABIERTO, CERRADO o VARIOS_ABIERTOS
 * @param turnos sus turnos de ese dia, uno por ventanilla, ordenados por el codigo de la caja
 */
public record TurnoDelDiaResource(
        String cajero, String fecha, String situacion, List<TurnoResource> turnos) {

    public static TurnoDelDiaResource de(
            String cajero, LocalDate fecha, List<TurnoConSuCaja> delDia) {
        List<TurnoResource> filas = new ArrayList<>(delDia.size());
        for (TurnoConSuCaja uno : delDia) {
            filas.add(TurnoResource.de(uno));
        }
        return new TurnoDelDiaResource(
                cajero, fecha.toString(), SituacionDelCajero.de(delDia).name(), List.copyOf(filas));
    }

    /**
     * Un turno suyo en una ventanilla.
     *
     * @param turnoId el identificador con el que se pide su arqueo
     * @param caja el codigo de la ventanilla, que es como se la rotula
     * @param cajaNombre como se llama
     * @param cajero de quien es el turno; el mismo de la respuesta, repetido para que una fila
     *     copiada a otra pantalla no pierda el sujeto
     * @param fecha el dia del turno, en ISO
     * @param abiertoEn el instante en que se abrio, en ISO UTC; la pantalla lo dice en su zona
     * @param estadoDelTurno ABIERTO o CERRADO, derivado de sus movimientos (V32)
     */
    public record TurnoResource(
            long turnoId,
            String caja,
            String cajaNombre,
            String cajero,
            String fecha,
            String abiertoEn,
            String estadoDelTurno) {

        static TurnoResource de(TurnoConSuCaja uno) {
            return new TurnoResource(
                    uno.turnoId(),
                    uno.cajaCodigo(),
                    uno.cajaNombre(),
                    uno.turno().cajero(),
                    uno.turno().fecha().toString(),
                    uno.turno().abiertoEn().toString(),
                    uno.turno().estado().name());
        }
    }
}
