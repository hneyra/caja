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
 * <p>No hay pantallas de administracion de seguridad. Las nueve escrituras de grupos, usuarios,
 * miembros y permisos viven <b>solo en {@code rentas}</b> (ADR-0030 §3: los cuatro frontends leen
 * {@code rentas/api/v1/sesion/permisos}). Aqui hay dos cosas: quien <b>lee</b> la copia para
 * autorizar, y quien la <b>siembra</b> al implantar la municipalidad.
 *
 * <p><b>HUECO DECLARADO:</b> como se sincroniza la copia cuando alguien cambia un permiso en {@code
 * rentas} — y que pasa mientras esta desatrasada — <b>no esta construido</b>. Es literalmente lo
 * que D-19 enunciaba y lo que la propia decision D-N5 dejo sin fijar («el detalle lo escribe la
 * fase 1»). Hoy la copia la escribe la implantacion y nadie mas, asi que lo que hay es correcto y
 * estatico: los dos grupos que crea la implantacion. Un permiso otorgado en {@code rentas} despues
 * de eso <b>no llega</b>, y eso se dice aqui en vez de descubrirse cuando alguien no pueda abrir
 * una pantalla.
 */
@org.jspecify.annotations.NullMarked
package kamayuk.caja.seguridad;
