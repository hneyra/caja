package kamayuk.caja.nucleo.dobles;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import kamayuk.caja.dominio.Observacion;
import kamayuk.caja.nucleo.dominio.EstadoDeTurno;
import kamayuk.caja.nucleo.dominio.TurnoConSuCaja;
import kamayuk.caja.nucleo.dominio.TurnoDeCaja;
import kamayuk.caja.nucleo.dominio.TurnoDeCajaRepository;

/**
 * Los turnos, en memoria.
 *
 * <p>Sirve para probar las decisiones del caso de uso: que abrir dos veces no duplique y que un
 * turno cerrado se rechace.
 *
 * <p><b>Desde P5D ya no hay nada que simular del bloqueo.</b> El puerto pasa de {@code bloquear} a
 * {@link #abierto}, sin {@code FOR UPDATE}: quien serializa la ventanilla es la orden de cobro
 * ({@code OrdenDeCobroRepository#bloquear}), y por eso `V2` pudo hacer el {@code REVOKE UPDATE ON
 * cierre_caja} que el monolito intento y no pudo. La serializacion de verdad sigue probandose
 * contra PostgreSQL con hilos, pero sobre otra tabla.
 */
public final class TurnosEnMemoria implements TurnoDeCajaRepository {

    private final Map<String, TurnoDeCaja> turnos = new LinkedHashMap<>();

    /** Como se rotula cada ventanilla, para {@link #delCajeroEn}. Ver {@link #conVentanilla}. */
    private final Map<Long, String[]> ventanillas = new LinkedHashMap<>();

    private long siguienteId = 1;

    /**
     * Da nombre a una ventanilla, para que {@link #delCajeroEn} pueda rotularla.
     *
     * <p>Sin registrarla, ese metodo devuelve el codigo entre interrogantes en vez de inventarse
     * uno: una prueba que lea «C-01» donde nadie sembro una caja estaria midiendo el doble.
     */
    public TurnosEnMemoria conVentanilla(long cajaId, String codigo, String nombre) {
        ventanillas.put(cajaId, new String[] {codigo, nombre});
        return this;
    }

    /** Deja sembrado un turno ya cerrado, para probar que la cobranza lo rechaza. */
    public TurnosEnMemoria conTurnoCerrado(long cajaId, String cajero, LocalDate fecha) {
        long id = siguienteId++;
        turnos.put(
                clave(cajaId, cajero, fecha),
                new TurnoDeCaja(id, cajaId, cajero, fecha, EstadoDeTurno.CERRADO));
        return this;
    }

    /** Deja sembrado un turno abierto con identificador conocido, para partir de un recibo. */
    public TurnosEnMemoria conTurnoAbierto(long id, long cajaId, String cajero, LocalDate fecha) {
        turnos.put(
                clave(cajaId, cajero, fecha),
                new TurnoDeCaja(id, cajaId, cajero, fecha, EstadoDeTurno.ABIERTO));
        siguienteId = Math.max(siguienteId, id + 1);
        return this;
    }

    /**
     * Cierra el turno con ese identificador, conservandolo.
     *
     * <p>Distinto de {@link #conTurnoCerrado}: aquel siembra uno nuevo, y este cierra el que ya
     * existe. Quien parte de un recibo lo busca por su identificador, y sembrar otro con uno
     * distinto haria que el recibo apuntara a un turno que no esta.
     */
    public TurnosEnMemoria cerrar(long id) {
        turnos.replaceAll(
                (clave, turno) ->
                        turno.id() != null && turno.id() == id
                                ? new TurnoDeCaja(
                                        turno.id(),
                                        turno.cajaId(),
                                        turno.cajero(),
                                        turno.fecha(),
                                        EstadoDeTurno.CERRADO)
                                : turno);
        return this;
    }

    /** Cuantos turnos se han abierto: lo que delata una apertura duplicada. */
    public int cuantos() {
        return turnos.size();
    }

    @Override
    public TurnoDeCaja abrir(
            long cajaId,
            String cajero,
            LocalDate fecha,
            Instant apertura,
            Observacion observacion) {
        return turnos.computeIfAbsent(
                clave(cajaId, cajero, fecha),
                k -> new TurnoDeCaja(siguienteId++, cajaId, cajero, fecha, EstadoDeTurno.ABIERTO));
    }

    @Override
    public Optional<TurnoDeCaja> abierto(long cajaId, String cajero, LocalDate fecha) {
        return Optional.ofNullable(turnos.get(clave(cajaId, cajero, fecha)));
    }

    @Override
    public List<TurnoConSuCaja> delCajeroEn(String cajero, LocalDate fecha) {
        List<TurnoConSuCaja> suyos = new ArrayList<>();
        for (TurnoDeCaja turno : turnos.values()) {
            if (turno.cajero().equals(cajero) && turno.fecha().equals(fecha)) {
                String[] rotulo =
                        ventanillas.getOrDefault(
                                turno.cajaId(),
                                new String[] {"?" + turno.cajaId(), "?" + turno.cajaId()});
                suyos.add(new TurnoConSuCaja(turno, rotulo[0], rotulo[1]));
            }
        }
        suyos.sort(java.util.Comparator.comparing(TurnoConSuCaja::cajaCodigo));
        return List.copyOf(suyos);
    }

    @Override
    public Optional<TurnoDeCaja> porId(long id) {
        return turnos.values().stream()
                .filter(turno -> turno.id() != null && turno.id() == id)
                .findFirst();
    }

    private static String clave(long cajaId, String cajero, LocalDate fecha) {
        return cajaId + "|" + cajero + "|" + fecha;
    }
}
