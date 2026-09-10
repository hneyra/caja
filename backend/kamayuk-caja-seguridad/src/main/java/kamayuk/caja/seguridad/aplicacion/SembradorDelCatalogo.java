package kamayuk.caja.seguridad.aplicacion;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import kamayuk.caja.auditoria.Auditoria;
import kamayuk.caja.auditoria.Operacion;
import kamayuk.caja.auditoria.RegistroDeAuditoria;
import kamayuk.caja.dominio.Observacion;
import kamayuk.caja.persistencia.RepositorioJdbc;
import kamayuk.caja.seguridad.dominio.CatalogoDelSistema;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Siembra el <b>catalogo</b> de este sistema: sus modulos y sus opciones (NEG-03, RF-122).
 *
 * <h2>Que sembraba hasta la etapa 4, y por que ya no</h2>
 *
 * <p>Se llamaba {@code SembradorDeLaCopiaLocal} y escribia <b>seis</b> tablas: {@code
 * modulo_sistema}, {@code acceso}, {@code grupo}, {@code usuario}, {@code miembro} y {@code
 * permiso}. Las cuatro ultimas son <b>la autorizacion</b>, y desde ADR-0039 su dueño es {@code
 * identidad}: quien decide quien puede hacer que lo decide alli, y aqui llega por el buzon. Con el
 * sembrador escribiendolas habia <b>dos</b> sitios que fabricaban al primer administrador —uno por
 * cada despliegue— y ninguno de los dos sabia del otro; el sintoma no es un error sino una
 * discrepancia: una cuenta que {@code identidad} deshabilito y que aqui sigue entrando porque la
 * implantacion la volvio a sembrar. La etapa 5 de ADR-0039 cierra eso quitandole las cuatro.
 *
 * <p>Lo que queda son las <b>dos</b> que este sistema sigue siendo dueño de declarar: {@code
 * modulo_sistema} y {@code acceso}. No son la autorizacion —no dicen a quien se le concede nada—:
 * son el catalogo de lo que <b>hay</b>, y quien lo conoce es el sistema que sirve esas pantallas
 * ({@link CatalogoDelSistema}). Y hacen falta antes que el buzon: un {@code PERMISO_FIJADO} sobre
 * {@code caja_tributaria} no se puede aplicar si esta base no tiene esa fila de {@code acceso}
 * —{@code AplicarUnEventoDeIdentidad} lo deja pendiente con {@code TodaviaNo}—, asi que el catalogo
 * se siembra <b>antes</b> de la pasada del consumidor y en la misma invocacion.
 *
 * <p><b>Idempotente y solo agrega.</b> Se puede ejecutar en cada despliegue: lo que ya existe se
 * queda como esta y lo que falta se crea. Lo que <b>no</b> hace es borrar: los permisos que cuelgan
 * de un acceso retirado son constancia de quien pudo hacer que, y eso no se borra (RNF-051, regla
 * 4).
 */
@Service
public class SembradorDelCatalogo extends RepositorioJdbc {

    private final Auditoria auditoria;
    private final Clock reloj;

    public SembradorDelCatalogo(JdbcClient jdbc, Auditoria auditoria, Clock reloj) {
        super(jdbc);
        this.auditoria = auditoria;
        this.reloj = reloj;
    }

    /**
     * Deja el catalogo de este sistema sembrado para la municipalidad del contexto.
     *
     * <p><b>Una sola transaccion</b>, y por un motivo tecnico que se paga en cuanto se olvida: las
     * dos tablas llevan RLS con {@code FORCE} y sus politicas leen {@code app.municipalidad_id},
     * que el gestor de transacciones fija con {@code SET LOCAL} <b>al abrir la transaccion</b>;
     * leerlas fuera de una no devuelve vacio, revienta (DAT-01 §0, #486).
     *
     * @return cuantos accesos se crearon; 0 en un despliegue donde no cambio el catalogo
     */
    @Transactional
    public int sembrar(Observacion porQue) {
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
}
