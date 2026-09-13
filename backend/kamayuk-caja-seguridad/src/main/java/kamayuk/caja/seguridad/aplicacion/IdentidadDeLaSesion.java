package kamayuk.caja.seguridad.aplicacion;

import kamayuk.caja.auditoria.OrigenContext;
import kamayuk.caja.seguridad.dominio.Identidad;
import kamayuk.caja.seguridad.dominio.LecturaDeLaCopiaLocal;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Quien es la sesion, tal como la conoce <b>esta</b> copia (ADR-0042).
 *
 * <p>Sin ningun argumento: la cuenta sale del token ({@link OrigenContext}) y se resuelve contra
 * {@code usuario} dentro del contexto de tenant. Con un identificador, esta lectura seria el padron
 * de usuarios sin su permiso.
 *
 * <p><b>La transaccion no es cosmetica</b>: {@code usuario} lleva RLS {@code FORCE} y su politica
 * lee {@code app.municipalidad_id}, que solo existe dentro de la transaccion que lo fijo con {@code
 * SET LOCAL}.
 */
@Service
public class IdentidadDeLaSesion {

    private final LecturaDeLaCopiaLocal copiaLocal;

    public IdentidadDeLaSesion(LecturaDeLaCopiaLocal copiaLocal) {
        this.copiaLocal = copiaLocal;
    }

    /**
     * La cuenta autenticada, resuelta a su fila de esta municipalidad.
     *
     * @throws CuentaSinFicha si la copia no tiene esa cuenta. Sale dicho en vez de devolver un
     *     {@code usuarioId} inventado: un cero ahi se leeria como un usuario que existe. Es la
     *     misma situacion que el guardia distingue con {@code conoceAlUsuario} —«este sistema no te
     *     conoce»—, y su remedio esta en {@code identidad}, no aqui
     */
    @Transactional(readOnly = true)
    public Identidad actual() {
        String cuenta = OrigenContext.actual().usuario();
        return copiaLocal.usuarioPorCuenta(cuenta).orElseThrow(() -> new CuentaSinFicha(cuenta));
    }

    /** El token trae una cuenta que la copia local de esta municipalidad no tiene. */
    public static final class CuentaSinFicha extends RuntimeException {

        @java.io.Serial private static final long serialVersionUID = 1L;

        CuentaSinFicha(String cuenta) {
            super(
                    "La cuenta «"
                            + cuenta
                            + "» no esta en la copia local de esta caja: el alta se hace en"
                            + " identidad y llega por su buzon");
        }
    }
}
