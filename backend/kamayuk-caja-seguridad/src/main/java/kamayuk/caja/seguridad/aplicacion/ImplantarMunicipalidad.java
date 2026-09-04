package kamayuk.caja.seguridad.aplicacion;

import kamayuk.caja.auditoria.Origen;
import kamayuk.caja.auditoria.OrigenContext;
import kamayuk.caja.compartido.TenantContext;
import kamayuk.caja.dominio.MunicipalidadId;
import kamayuk.caja.dominio.Observacion;
import kamayuk.caja.seguridad.infraestructura.RegistroDeMunicipalidadesJdbc;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Pone la municipalidad dentro de la base de {@code caja}: sin esto no hay nada que administrar.
 *
 * <h2>El hueco que cierra (C-6, hueco 3)</h2>
 *
 * <p>Cada sistema tiene <b>su propia base</b> (ADR-0032) y en cada una hay una tabla {@code
 * municipalidad} con su {@code es_demostracion}. {@code SoloEnDemostracion} la consulta <b>en la
 * base de su propio sistema</b>, y las politicas RLS resuelven {@code app.municipalidad_id} contra
 * ella. Hasta C-7, el unico {@code INSERT INTO municipalidad} del arbol de este repositorio estaba
 * en fixtures de prueba: una instalacion real no tenia como escribir esa fila, y sin ella los pasos
 * de siembra se negaban a correr —correctamente— sin que nada dijera que era lo que faltaba.
 *
 * <p>Es el mismo hueco que #430 cerro para {@code area} y {@code caja}, y se cierra igual: <b>por
 * donde entra la configuracion de la municipalidad, no con una pantalla</b>.
 *
 * <h2>Por que un proceso y no un endpoint</h2>
 *
 * <p>Porque {@code municipalidad} solo la escribe {@code sgtm_owner}. Un endpoint que lo hiciera le
 * exigiria a {@code sgtm_app} un privilegio que se le quito a proposito, y seria el camino mas
 * corto de una pantalla de alta a una escalada entre municipalidades.
 *
 * <p>Corre en el perfil {@code batch}: sin servidor web, sin puerto expuesto y con vida corta. Las
 * credenciales de {@code sgtm_owner} entran <b>solo</b> en el paso 1, para <b>un</b> {@code
 * INSERT}, en una conexion que se abre y se cierra. Todo lo demas va por el camino normal de la
 * aplicacion, como {@code sgtm_app} y con su auditoria.
 *
 * <h2>Un grupo, no dos</h2>
 *
 * <p>{@code rentas} crea dos —administracion y {@code Seguridad}—; aqui solo el primero. El segundo
 * es la plantilla de quien administra <b>el acceso de los usuarios</b>, y esas pantallas viven en
 * {@code rentas} (ADR-0030 §3): crear aqui un grupo que no puede administrar nada seria decir que
 * existe una delegacion que no existe.
 *
 * <h2>Idempotente, entera</h2>
 *
 * <p>Se ejecuta en cada despliegue. Lo que ya existe se queda como esta —con los permisos que
 * alguien haya configurado despues—, y lo que falta se crea. Nunca borra.
 */
@Component
@Profile("batch")
@ConditionalOnProperty("kamayuk.implantacion.ubigeo")
@EnableConfigurationProperties(DatosDeImplantacion.class)
public class ImplantarMunicipalidad implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(ImplantarMunicipalidad.class);

    private final RegistroDeMunicipalidadesJdbc registro;
    private final SembradorDeLaCopiaLocal sembrador;
    private final DatosDeImplantacion datos;

    public ImplantarMunicipalidad(
            RegistroDeMunicipalidadesJdbc registro,
            SembradorDeLaCopiaLocal sembrador,
            DatosDeImplantacion datos) {
        this.registro = registro;
        this.sembrador = sembrador;
        this.datos = datos;
    }

    @Override
    public void run(ApplicationArguments argumentos) {
        long municipalidadId =
                registro.darDeAltaSiFalta(
                        datos.ubigeo(), datos.nombre(), datos.tipo(), datos.esDemostracion());

        // El perfil batch no tiene filtros HTTP, asi que los dos contextos que en una peticion
        // salen del token se fijan aqui a mano. `Origen.deProceso` existe para esto: una escritura
        // sin peticion detras, que aun asi tiene que decir quien.
        TenantContext.fijar(new MunicipalidadId(municipalidadId));
        OrigenContext.fijar(Origen.deProceso(datos.usuarioDelProceso()));
        try {
            int nuevos =
                    sembrador.sembrar(
                            datos.administrador(),
                            datos.nombreDelAdministrador(),
                            Observacion.de(
                                    "Implantacion de la municipalidad "
                                            + datos.ubigeo()
                                            + " en caja (despliegue)"));

            // El regimen se registra aunque sea una sola palabra: es lo unico del resultado que no
            // se puede comprobar mirando pantallas. Una instalacion que se creia de demostracion y
            // salio real emite papeles sin marca, y quien lo descubre es quien recibe uno (#122).
            log.info(
                    "Municipalidad {} lista en caja ({}): id {}, {} accesos nuevos,"
                            + " administrador '{}'",
                    datos.ubigeo(),
                    datos.esDemostracion() ? "DEMOSTRACION" : "instalacion real",
                    municipalidadId,
                    nuevos,
                    datos.administrador());
        } finally {
            OrigenContext.limpiar();
            TenantContext.limpiar();
        }
    }
}
