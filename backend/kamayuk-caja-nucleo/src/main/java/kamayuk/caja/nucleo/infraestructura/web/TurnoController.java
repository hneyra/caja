package kamayuk.caja.nucleo.infraestructura.web;

import java.time.Clock;
import java.time.LocalDate;
import kamayuk.caja.auditoria.OrigenContext;
import kamayuk.caja.autorizacion.Privilegio;
import kamayuk.caja.autorizacion.RequiereAcceso;
import kamayuk.caja.nucleo.aplicacion.ConsultaDelTurno;
import kamayuk.caja.web.Api;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code GET /caja/api/v1/turnos/del-dia}: cual es la ventanilla de quien pregunta, hoy (#97).
 *
 * <h2>Por que hace falta una ruta y no bastaba con las que habia</h2>
 *
 * <p>{@link EstadoDelCierreController} sabe arquear un turno, pero pide su identificador por la
 * ruta, y <b>ninguna lectura lo publicaba</b>. Las dos unicas formas de tenerlo eran indirectas y
 * ninguna sirve para abrir la pantalla de cierre: el {@code turnoId} de un pago sin entregar, que
 * solo existe cuando algo fue mal, y {@code /recaudacion/avance?caja=&cajero=}, que exige otro
 * acceso ({@code avance_recaudacion}) y ademas saber de antemano en que caja se esta.
 *
 * <h2>Sin un solo parametro, y eso es la decision</h2>
 *
 * <p>Ni {@code cajero} ni {@code caja} ni {@code fecha}:
 *
 * <ul>
 *   <li><b>el cajero</b> sale del {@code OrigenContext} que el filtro fijo desde el token. Un
 *       {@code ?cajero=} convertiria esta lectura en «el turno de quien yo diga» y dejaria que
 *       cualquiera mirara el arqueo de otro con solo escribir su nombre;
 *   <li><b>la municipalidad</b> jamas viaja por HTTP (regla 2, ADR-0028): la pone el {@code SET
 *       LOCAL} de la transaccion del caso de uso, y la politica RLS filtra las dos tablas;
 *   <li><b>el dia</b> es el del reloj de esta caja. Lo que esta lectura contesta es «donde estoy
 *       ahora», que es la pregunta con la que se abre la pantalla. Desde #114 las escrituras dicen
 *       lo mismo: {@code POST /cobros} y {@code POST /turnos/cierre} toman el cajero del token y
 *       solo admiten el dia de hoy ({@link QuienYCuando}); el turno de ayer se consulta por {@code
 *       /recaudacion/avance} con su rango.
 * </ul>
 *
 * <p>Desde #539 un parametro declarado que ningun argumento reclama se contesta con 422
 * nombrandolo, asi que esta firma sin argumentos <b>rechaza</b> los tres en vez de ignorarlos.
 *
 * <h2>Y no escribe nada</h2>
 *
 * <p>Preguntar por el turno no lo abre. Quien no ha cobrado todavia recibe {@code SIN_ABRIR} y no
 * una apertura silenciosa: la apertura la hace la primera cobranza ({@code AbrirCaja}), que es un
 * acto con su observacion y su asiento de auditoria (regla 10). Una lectura que abriera turnos
 * llenaria {@code cierre_caja} de aperturas de cajeros que solo miraron la pantalla.
 */
@RestController
@RequestMapping(Api.RAIZ + "/turnos")
public class TurnoController {

    /** La opcion del catalogo (NEG-03) de la que es la lectura: la misma que su arqueo. */
    static final String ACCESO = "cierre_caja";

    private final ConsultaDelTurno turnos;
    private final Clock reloj;

    public TurnoController(ConsultaDelTurno turnos, Clock reloj) {
        this.turnos = turnos;
        this.reloj = reloj;
    }

    /**
     * Los turnos de hoy de quien pregunta, con su situacion.
     *
     * <p><b>200 siempre</b>, tambien sin ninguno: ver {@link TurnoDelDiaResource}.
     */
    @GetMapping("/del-dia")
    @RequiereAcceso(acceso = ACCESO, privilegio = Privilegio.LECTURA)
    public TurnoDelDiaResource delDia() {
        String cajero = OrigenContext.actual().usuario();
        LocalDate hoy = LocalDate.now(reloj);
        return TurnoDelDiaResource.de(cajero, hoy, turnos.delCajeroEn(cajero, hoy));
    }
}
