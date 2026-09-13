package kamayuk.caja.seguridad.aplicacion;

import java.time.Clock;
import java.time.LocalDate;
import java.util.Map;
import java.util.Set;
import kamayuk.caja.auditoria.OrigenContext;
import kamayuk.caja.autorizacion.Privilegio;
import kamayuk.caja.seguridad.dominio.LecturaDeLaCopiaLocal;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Que puede abrir la cuenta del token en esta caja: la matriz con la que la interfaz decide que
 * dibuja (ADR-0042, ADR-0013).
 *
 * <p>La cuenta sale de {@link OrigenContext} —{@code preferred_username}, el mismo dato que usa el
 * guardia— y no de un argumento: tenerla en la firma invitaria a que dos sitios dijeran cosas
 * distintas sobre quien pregunta, y convertiria la lectura de la sesion propia en la matriz de
 * cualquiera. La fecha sale del reloj inyectado, que es el mismo contra el que el guardia evalua
 * las vigencias: con otro reloj, el arbol y el 403 podrian discrepar justo el dia que vence un
 * grupo.
 *
 * <p><b>La {@code @Transactional(readOnly = true)} no es cosmetica.</b> La consulta lee cinco
 * tablas con RLS {@code FORCE}, y sus politicas leen {@code app.municipalidad_id}, que {@code
 * TenantTransactionManager} fija con {@code SET LOCAL} <b>al abrir la transaccion</b>. Sin ella no
 * sale un {@code {}}: sale un 500 con «unrecognized configuration parameter» (#486). Ni el
 * repositorio ni el controlador la abren por este caso de uso, a proposito.
 */
@Service
public class PermisosDeLaSesion {

    private final LecturaDeLaCopiaLocal copiaLocal;
    private final Clock reloj;

    public PermisosDeLaSesion(LecturaDeLaCopiaLocal copiaLocal, Clock reloj) {
        this.copiaLocal = copiaLocal;
        this.reloj = reloj;
    }

    /** Por codigo de acceso, los privilegios de hoy. Vacio si la cuenta no puede abrir nada. */
    @Transactional(readOnly = true)
    public Map<String, Set<Privilegio>> efectivos() {
        return copiaLocal.permisosEfectivosDe(
                OrigenContext.actual().usuario(), LocalDate.now(reloj));
    }
}
