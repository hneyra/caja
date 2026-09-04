package kamayuk.caja.seguridad.aplicacion;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import kamayuk.caja.auditoria.Auditoria;
import kamayuk.caja.auditoria.Operacion;
import kamayuk.caja.auditoria.RegistroDeAuditoria;
import kamayuk.caja.autorizacion.Privilegio;
import kamayuk.caja.dominio.Observacion;
import kamayuk.caja.persistencia.RepositorioJdbc;
import kamayuk.caja.seguridad.dominio.CatalogoDelSistema;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Escribe la copia local de seguridad de este sistema: modulos, accesos, el grupo de
 * administracion, el primer administrador y sus permisos (D-N5, RF-122).
 *
 * <h2>Por que aqui hay SQL y en {@code rentas} hay un contexto entero</h2>
 *
 * <p>{@code rentas} tiene las nueve escrituras de administracion de seguridad —altas, bajas,
 * vigencias, excepciones por usuario— y con ellas su dominio, sus repositorios y sus pantallas.
 * Aqui <b>no hay ninguna</b>, y no es una simplificacion: ADR-0030 §3 deja esas pantallas en {@code
 * rentas}, y copiarlas seria tener dos sitios donde se administra lo mismo. Lo que este sistema
 * necesita es exactamente dos cosas —leer para autorizar, y sembrar al implantar—, asi que lo que
 * hay es un lector ({@code ComprobadorDeAccesoJdbc}) y este sembrador.
 *
 * <p><b>Idempotente y solo agrega.</b> Se puede ejecutar en cada despliegue: lo que ya existe se
 * queda como esta —con los permisos que alguien haya configurado despues— y lo que falta se crea.
 * Lo que <b>no</b> hace es borrar: los permisos que cuelgan de un acceso retirado son constancia de
 * quien pudo hacer que, y eso no se borra (RNF-051, regla 4).
 */
@Service
public class SembradorDeLaCopiaLocal extends RepositorioJdbc {

    /** El grupo del que cuelgan los permisos del primer administrador. */
    public static final String GRUPO_DE_ADMINISTRACION = "Administracion del sistema";

    private final Auditoria auditoria;
    private final Clock reloj;

    public SembradorDeLaCopiaLocal(JdbcClient jdbc, Auditoria auditoria, Clock reloj) {
        super(jdbc);
        this.auditoria = auditoria;
        this.reloj = reloj;
    }

    /**
     * Deja la copia local lista para la municipalidad del contexto.
     *
     * <p><b>Una sola transaccion para todo</b>, y por dos motivos distintos. El primero es de
     * negocio: una municipalidad implantada a medias —con accesos y sin administrador— es peor que
     * ninguna, porque parece lista. El segundo es tecnico y se paga en cuanto se olvida: las cinco
     * tablas llevan RLS con {@code FORCE} y sus politicas leen {@code app.municipalidad_id}, que el
     * gestor de transacciones fija con {@code SET LOCAL} <b>al abrir la transaccion</b>; leerlas
     * fuera de una no devuelve vacio, revienta (DAT-01 §0, #486).
     *
     * @return cuantos accesos se crearon; 0 en un despliegue donde no cambio el catalogo
     */
    @Transactional
    public int sembrar(String cuenta, String nombreDelAdministrador, Observacion porQue) {
        List<CatalogoDelSistema.Opcion> opciones = CatalogoDelSistema.opciones();
        if (opciones.isEmpty()) {
            throw new IllegalStateException(
                    "El catalogo de este sistema vino vacio. Sembrar cero accesos dejaria el"
                            + " sistema sin ninguna opcion configurable, y en silencio");
        }

        int creados = 0;
        for (CatalogoDelSistema.Opcion opcion : opciones) {
            creados += crearAccesoSiFalta(opcion, moduloId(opcion));
        }

        long grupoId = grupoDeAdministracion();
        long usuarioId = administrador(cuenta, nombreDelAdministrador);
        afiliar(grupoId, usuarioId, cuenta);
        for (CatalogoDelSistema.Opcion opcion : opciones) {
            otorgarLosSiete(grupoId, opcion.codigo(), cuenta);
        }

        // Solo si se creo algo. Un despliegue que no cambia el catalogo no tiene nada que
        // asentar, y una fila de auditoria por despliegue convierte la bitacora en un registro de
        // reinicios — que es lo contrario de lo que ADR-0008 quiere que se pueda leer ahi.
        if (creados == 0) {
            return 0;
        }
        auditoria.registrar(
                RegistroDeAuditoria.enLaFechaDe(
                                LocalDate.now(reloj), "acceso", "catalogo", Operacion.ALTA, porQue)
                        .con(
                                null,
                                "{\"accesosCreados\":"
                                        + creados
                                        + ",\"opcionesDelSistema\":"
                                        + opciones.size()
                                        + "}"));
        return creados;
    }

    /** Crea el modulo si falta y devuelve su identificador. */
    private long moduloId(CatalogoDelSistema.Opcion opcion) {
        jdbc().sql(
                        "INSERT INTO modulo_sistema (municipalidad_id, codigo, nombre)"
                                + " VALUES ("
                                + MUNICIPALIDAD_ACTUAL
                                + ", :codigo, :nombre)"
                                + " ON CONFLICT (municipalidad_id, codigo) DO NOTHING")
                .param("codigo", opcion.moduloCodigo())
                .param("nombre", opcion.moduloNombre())
                .update();

        return jdbc().sql("SELECT id FROM modulo_sistema WHERE codigo = :codigo")
                .param("codigo", opcion.moduloCodigo())
                .query(Long.class)
                .single();
    }

    private int crearAccesoSiFalta(CatalogoDelSistema.Opcion opcion, long moduloId) {
        return jdbc().sql(
                        "INSERT INTO acceso (municipalidad_id, modulo_id, tipo, codigo, nombre)"
                                + " VALUES ("
                                + MUNICIPALIDAD_ACTUAL
                                + ", :modulo, 'OPCION_MENU', :codigo, :nombre)"
                                + " ON CONFLICT (municipalidad_id, codigo) DO NOTHING")
                .param("modulo", moduloId)
                .param("codigo", opcion.codigo())
                .param("nombre", opcion.nombre())
                .update();
    }

    private long grupoDeAdministracion() {
        jdbc().sql(
                        "INSERT INTO grupo (municipalidad_id, nombre, descripcion)"
                                + " VALUES ("
                                + MUNICIPALIDAD_ACTUAL
                                + ", :nombre, :descripcion)"
                                + " ON CONFLICT (municipalidad_id, nombre) DO NOTHING")
                .param("nombre", GRUPO_DE_ADMINISTRACION)
                .param("descripcion", "Creado por la implantacion: administra este sistema entero")
                .update();
        return jdbc().sql("SELECT id FROM grupo WHERE nombre = :nombre")
                .param("nombre", GRUPO_DE_ADMINISTRACION)
                .query(Long.class)
                .single();
    }

    /**
     * El primer administrador, como fila.
     *
     * <p>{@code cuenta} tiene que coincidir con el {@code preferred_username} del token: es lo
     * unico que une esta fila con la identidad de Keycloak, y si no coinciden el usuario entra y no
     * es nadie. <b>No se crea ninguna clave</b>: el sistema no guarda contrasenas ni las transporta
     * (ADR-0005).
     */
    private long administrador(String cuenta, String nombre) {
        jdbc().sql(
                        "INSERT INTO usuario (municipalidad_id, cuenta, nombre)"
                                + " VALUES ("
                                + MUNICIPALIDAD_ACTUAL
                                + ", :cuenta, :nombre)"
                                + " ON CONFLICT (municipalidad_id, cuenta) DO NOTHING")
                .param("cuenta", cuenta)
                .param("nombre", nombre)
                .update();
        return jdbc().sql("SELECT id FROM usuario WHERE cuenta = :cuenta")
                .param("cuenta", cuenta)
                .query(Long.class)
                .single();
    }

    private void afiliar(long grupoId, long usuarioId, String quien) {
        jdbc().sql(
                        "INSERT INTO miembro (municipalidad_id, grupo_id, usuario_id, usuario_alta)"
                                + " VALUES ("
                                + MUNICIPALIDAD_ACTUAL
                                + ", :grupo, :usuario, :quien)"
                                + " ON CONFLICT (municipalidad_id, grupo_id, usuario_id)"
                                + " DO NOTHING")
                .param("grupo", grupoId)
                .param("usuario", usuarioId)
                .param("quien", quien)
                .update();
    }

    /**
     * Los siete privilegios sobre una opcion, para el grupo de administracion.
     *
     * <p>Las siete columnas se nombran desde {@link Privilegio#columna()} y no a mano: son las
     * mismas que lee {@code ComprobadorDeAccesoJdbc}, y escribir aqui una lista paralela seria dos
     * verdades sobre lo mismo — un privilegio nuevo quedaria otorgado en un sitio y sin leer en el
     * otro.
     */
    private void otorgarLosSiete(long grupoId, String acceso, String quien) {
        StringBuilder columnas = new StringBuilder();
        StringBuilder valores = new StringBuilder();
        for (Privilegio privilegio : Privilegio.values()) {
            columnas.append(", ").append(privilegio.columna());
            valores.append(", true");
        }
        jdbc().sql(
                        "INSERT INTO permiso (municipalidad_id, acceso_id, grupo_id,"
                                + " usuario_registro"
                                + columnas
                                + ") SELECT "
                                + MUNICIPALIDAD_ACTUAL
                                + ", a.id, :grupo, :quien"
                                + valores
                                + "   FROM acceso a"
                                + "  WHERE a.codigo = :acceso"
                                + "    AND NOT EXISTS ("
                                + "      SELECT 1 FROM permiso p"
                                + "       WHERE p.acceso_id = a.id AND p.grupo_id = :grupo)")
                .param("grupo", grupoId)
                .param("acceso", acceso)
                .param("quien", quien)
                .update();
    }
}
