/**
 * La copia local de usuarios, grupos y permisos, y lo que la siembra.
 *
 * <h2>Por que este modulo existe en `caja` y no solo en {@code rentas}</h2>
 *
 * <p>Lo decidio <b>D-N5</b> (2026-09-03): «usuarios, grupos y permisos se definen en Keycloak; cada
 * sistema guarda una copia local en tabla y su guardia la consulta». Con eso <b>D-19</b> quedo
 * contestada — el {@link kamayuk.caja.autorizacion.ComprobadorDeAcceso} de cada sistema pregunta a
 * su propia tabla, <b>no a otro sistema por HTTP</b>.
 *
 * <p>La alternativa medida y descartada era preguntarle a {@code rentas} en cada peticion: el
 * guardia corre en un {@code preHandle}, asi que seria un viaje de red por peticion y, sobre todo,
 * {@code rentas} caido dejaria a {@code caja} sin poder autorizar nada. Una comprobacion de acceso
 * que depende de la disponibilidad de otro despliegue no es una comprobacion de acceso: es un
 * acoplamiento con forma de politica de seguridad.
 *
 * <h2>Lo que aqui NO hay, y es deliberado</h2>
 *
 * <p>No hay pantallas de administracion de seguridad. Las once escrituras de grupos, usuarios,
 * miembros y permisos viven en <b>{@code identidad}</b>, que es el dueño de la autorizacion desde
 * ADR-0039 (y hasta la etapa 4 de aquel ADR, tambien en {@code rentas}). Aqui hay tres cosas: quien
 * <b>lee</b> la copia para autorizar, quien la <b>siembra</b> al implantar la municipalidad, y
 * —desde la etapa 4— quien la <b>mantiene</b>: el consumidor del buzon de {@code identidad}.
 *
 * <h2>Como se sincroniza la copia, y que pasa mientras esta desatrasada (ADR-0039, etapa 4)</h2>
 *
 * <p>Este parrafo era el <b>HUECO DECLARADO</b> de D-19: «como se sincroniza la copia cuando
 * alguien cambia un permiso — y que pasa mientras esta desatrasada — no esta construido». Esta
 * construido. {@code identidad} escribe cada cambio en su buzon de salida, dentro de la misma
 * transaccion que la escritura (ADR-0028 §3), y {@link
 * kamayuk.caja.seguridad.aplicacion.CorrerElConsumidorDeIdentidad} —un {@code ApplicationRunner}
 * del perfil {@code batch}, que un {@code CronJob} despierta cada cinco minutos— lo lee con la
 * cuenta de servicio de esta caja, aplica cada evento a estas tablas con {@link
 * kamayuk.caja.seguridad.aplicacion.AplicarUnEventoDeIdentidad} —una transaccion por evento, con
 * {@code SET LOCAL} de la municipalidad— y acusa lo aplicado <b>despues</b> del {@code commit}.
 *
 * <p>Mientras esta desatrasada, la copia <b>vale</b>: el {@link
 * kamayuk.caja.autorizacion.ComprobadorDeAcceso} sigue leyendo su propia tabla y la ventanilla
 * sigue cobrando con {@code identidad} apagado, con lo que tenga. La ventana de inconsistencia es
 * la del {@code CronJob} —cinco minutos— mas lo que tarde la vuelta, y es lo que ADR-0039 §«Lo que
 * cuesta» punto 2 pide que este escrito y no supuesto: un permiso retirado en {@code identidad}
 * sigue valiendo aqui hasta que la vuelta siguiente lo aplique.
 *
 * <p>Lo que la copia NO puede aplicar —un octavo tipo de evento, un cuerpo que no es JSON— se
 * aparta a {@code identidad_evento_muerto}, se acusa para que no bloquee la cola, y se avisa al
 * responsable de operacion. Lo que no puede aplicar <b>todavia</b> —una afiliacion cuyo grupo no
 * llego— se deja pendiente sin acusar, y la vuelta siguiente lo encuentra con su dependencia
 * puesta. Y un {@code PERMISO_FIJADO} de otro sistema se ignora con aviso, porque aqui el catalogo
 * de accesos es solo el de {@code caja}.
 */
@org.jspecify.annotations.NullMarked
package kamayuk.caja.seguridad;
