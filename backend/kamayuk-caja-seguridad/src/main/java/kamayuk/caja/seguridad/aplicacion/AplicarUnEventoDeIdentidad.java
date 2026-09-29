package kamayuk.caja.seguridad.aplicacion;

import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.List;
import kamayuk.caja.autorizacion.Privilegio;
import kamayuk.caja.dominio.ZonaHoraria;
import kamayuk.caja.persistencia.RepositorioJdbc;
import kamayuk.caja.seguridad.AlertaDeEventosSinAplicar;
import kamayuk.caja.seguridad.EventoDeIdentidadRecibido;
import kamayuk.caja.seguridad.FilaSinSujeto;
import kamayuk.caja.seguridad.TipoDeEventoDeIdentidad;
import kamayuk.caja.seguridad.dominio.PlazoDeAdopcion;
import org.jspecify.annotations.Nullable;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Aplica UN evento del buzon de {@code identidad} a la copia local de la autorizacion (ADR-0039,
 * etapa 4), en su propia transaccion.
 *
 * <h2>Solo existe donde existe el consumidor (ronda 3 de #111)</h2>
 *
 * <p>{@code @Profile("batch")} y {@code @ConditionalOnProperty("kamayuk.identidad.url")}, las
 * MISMAS dos condiciones que {@code ConfiguracionDelConsumidorDeIdentidad} —la unica que la usa— y
 * que {@link kamayuk.caja.seguridad.infraestructura.AlertaDeIdentidadEnElRegistro} —la unica
 * implementacion de {@link AlertaDeEventosSinAplicar} que esta clase recibe—. Hasta la ronda 1 de
 * #111 esta clase no dependia de nada mas que {@code JdbcClient}, {@code JsonMapper} y {@code
 * Clock}, y por eso un {@code @Service} sin perfil ni condicion —instanciado en CUALQUIER perfil—
 * no habia dado problema nunca: sobraba en {@code web} y en {@code publicador}, pero sobraba
 * <b>gratis</b>. Ganar la alerta como dependencia lo hizo dejar de ser gratis: en {@code web} y en
 * {@code publicador} —y en {@code batch} SIN {@code kamayuk.identidad.url}— no hay ninguna fila de
 * {@link AlertaDeEventosSinAplicar}, porque nadie mas la necesita alli, y el contexto entero
 * fallaba al arrancar (`UnsatisfiedDependencyException`, cazado por `ArranqueDeLaAplicacionTest` —
 * en CI, no en local: esa prueba corre contra PostgreSQL de verdad y no formaba parte de la ronda
 * de arreglos anterior). La alternativa —una alerta que exista en todos los perfiles, con una
 * implementacion muda donde no hay a quien avisar— se descarto: le daria un colaborador a una clase
 * que en {@code web} y {@code publicador} no tiene ningun evento que aplicar, y esta caja no
 * fabrica beans que no le sirven a nadie de ese proceso.
 *
 * <h2>Quien escribe usuario, grupo, miembro y permiso, y por que puede</h2>
 *
 * <p>Desde ADR-0039 la autorizacion es un sistema y su dueño es {@code identidad}; la regla 12
 * ({@code RevisorDeCodigoFuente.revisarAutorizacion}) prohibe que nadie mas escriba esas cuatro
 * tablas. Esta clase esta declarada en {@code
 * ConfiguracionDeCaja.escritoresDeLaAutorizacionConMotivo()} junto al sembrador, y es la que la
 * etapa 4 preve: <b>escribe lo que {@code identidad} decidio, y no decide nada</b>. No hay aqui una
 * regla de negocio —ni la del ultimo administrador, ni la de la vigencia—: eso ya paso en el
 * emisor, y lo que llega es la fila tal como quedo.
 *
 * <h2>Con que casa: el sujeto de {@code identidad}, guardado aparte, y la clave natural detras</h2>
 *
 * <p>Los identificadores de {@code identidad} son los de SU base: un {@code usuarioId} de alli no
 * es ningun {@code usuario.id} de aqui, donde las filas nacen con identidad propia, y {@code
 * miembro} y {@code permiso} siguen apuntando a esa identidad propia. Eso sigue siendo cierto, y
 * por eso el id de alli <b>no se reutiliza como id de aqui</b>: se guarda en su propia columna,
 * {@code identidad_sujeto_id} (V5), unica por municipalidad.
 *
 * <p>Hasta #111 se casaba SOLO por las claves que el esquema declara unicas —{@code
 * (municipalidad_id, cuenta)}, {@code (municipalidad_id, nombre)}—, y eso fallaba justo donde mas
 * duele: {@code identidad} <b>renombra</b> cuentas y grupos ({@code UPDATE usuario SET cuenta},
 * {@code UPDATE grupo SET nombre} en su {@code AdministracionRepositoryJdbc}) y publica el {@code
 * *_MODIFICADO} con la clave nueva. El {@code ON CONFLICT} no encontraba nada, insertaba otra fila
 * y la vieja se quedaba habilitada con sus miembros y sus permisos. Lo que no cambia con un
 * renombrado es el {@code id} de la fila alli, y el cuerpo lo trae ({@code usuarioId}, {@code
 * grupoId}, y en el permiso {@code sujetoId}: {@code HechoDeIdentidad} lo escribe en el cuerpo y en
 * el sobre con el mismo valor). Se lee del cuerpo, igual que las claves naturales, y desde la ronda
 * 2 de #111 se CONTRASTA con el sobre antes de hacer nada: si no coinciden, {@link
 * #exigirQueElSobreCoincidaConElCuerpo} lo aparta nombrando los dos numeros, en vez de confiar a
 * ciegas en que sean iguales.
 *
 * <p>Asi que un alta o una modificacion casan primero por ese id —y si la fila lo lleva, se le
 * escribe la clave nueva: es el renombrado— y, si ninguna fila lo lleva, por la clave natural
 * <b>entre las filas que no llevan ninguno</b>, que se adoptan estampandoles el id —salvo con un
 * alta, que no adopta nunca, y salvo que el sujeto tenga su alta APARTADA aqui (ronda 2 de #125:
 * ver {@code exigirQueSuAltaNoSeHayaApartado}), porque entonces es un sujeto nuevo que reutiliza la
 * clave de una huerfana—: son las de antes de V5, que no tienen de donde saber de que sujeto son.
 * <b>No se rellenan desde una migracion</b> —{@code V5} no sabe el id de {@code identidad} de una
 * fila existente, y ademas un {@code UPDATE} sobre una tabla de tenant desde el migrador muere bajo
 * RLS (hallazgo 4 de {@code docs/40-datos/hallazgos-de-rls.md}): esta clase es el UNICO lugar donde
 * una fila vieja puede ganar su {@code identidad_sujeto_id}, y lo gana con el primer evento que la
 * nombra, no antes. Una afiliacion o un permiso casan igual y, desde la ronda 1 de #111, TAMBIEN
 * adoptan cuando la fila que encuentran por su clave natural no lleva sujeto —no hace falta esperar
 * al evento del propio usuario o grupo—: ver {@code casarParaNombrar}. (Las filas que el defecto
 * <b>anterior</b> a #111 ya dejo huerfanas y habilitadas en una base desplegada no las toca ninguna
 * adopcion, porque ya NO reciben eventos; y una fila de antes de V5 cuya PRIMERA modificacion tras
 * la migracion sea precisamente un renombrado tampoco se adopta —se busca por la clave que el
 * evento trae, la NUEVA, y la huerfana todavia tiene la vieja— asi que se inserta una fila nueva y
 * la huerfana queda intacta, un duplicado distinto del de un choque. Las dos son <a
 * href="https://github.com/hneyra/caja/issues/125">#125</a>, y el plazo las cierra SIN escribirlas:
 * el guardia deja de conceder por una fila sin sujeto pasado {@link PlazoDeAdopcion#DIAS} dias
 * desde {@code sin_sujeto_desde} (V6), y mientras tanto {@link #filasSinSujeto} las lista para que
 * el consumidor avise al responsable en cada corrida. La unica escritura que #125 anade es la de
 * {@link #apartar}: cuando un alta —o el evento de un sujeto cuya alta ya se aparto— cae sobre una
 * fila sin sujeto, esa fila deja de conceder en el acto: quien entra con su clave es un sujeto cuya
 * alta no entro aqui, y no se sabe si la fila era suya. Esta clase sigue siendo el unico escritor:
 * la forma de «arreglar» una fila legitima es que {@code identidad} publique un evento que la
 * nombre por su clave y la adopte aqui; ver {@code docs/40-datos/filas-sin-sujeto.md}.) El acceso
 * sigue casando por su {@code codigo}, porque cada sistema siembra su catalogo por su cuenta.
 *
 * <p>Un choque —la clave nueva ya es de otra fila— tiene dos desenlaces distintos segun de que lado
 * este la fila que cambia: ver {@code casarParaEscribir} y {@code casarParaNombrar}, y la tabla de
 * abajo.
 *
 * <h2>Los tres desenlaces, y por que hacen falta los tres</h2>
 *
 * <ul>
 *   <li><b>Se aplico</b> (o ya estaba): la fila entro y el acuse local quedo escrito <b>en la misma
 *       transaccion</b>. Un evento que se vuelva a servir se descarta por {@code
 *       identidad_evento_aplicado} sin tocar nada. Desde la ronda 1 de #111 esto INCLUYE un
 *       renombrado que choco con la clave de otra fila: se aplica todo lo demas y se conserva la
 *       clave vieja (ver {@code casarParaEscribir}), en vez de apartarse, para que un choque no
 *       pueda impedir una inhabilitacion.
 *   <li><b>No se podra aplicar NUNCA</b> ({@link NoSePuedeAplicar}): un tipo que esta copia no
 *       conoce, un cuerpo que no es JSON, un cuerpo al que le falta la clave con la que se casa, un
 *       ALTA cuya clave ya es de otro sujeto (no hay fila propia que actualizar conservando su
 *       clave), o una afiliacion/permiso cuya clave ya es de otro sujeto. Mandarlo otra vez da lo
 *       mismo; quien lo llama lo aparta y avisa.
 *   <li><b>No se puede aplicar TODAVIA</b> ({@link TodaviaNo}): el evento nombra un grupo, una
 *       cuenta o un acceso que esta copia no tiene aun. Casi siempre es orden —la afiliacion que
 *       llego en la misma pagina que el alta del usuario, y en esta copia el alta fallo por otra
 *       cosa—, y a veces es un catalogo que la implantacion todavia no sembro. <b>No se aparta y no
 *       se acusa</b>: el buzon lo vuelve a servir y la siguiente vuelta lo encuentra con su
 *       dependencia puesta. Descartarlo en silencio fue el defecto que el instrumento de {@code
 *       identidad} (R1 de su etapa 2) tuvo que corregir: un {@code INSERT … SELECT} que no
 *       encuentra a quien nombra escribe cero filas sin protestar.
 * </ul>
 *
 * <h2>{@code PERMISO_FIJADO} de otro sistema</h2>
 *
 * <p>{@code identidad} publica los permisos de los CINCO catalogos por un solo buzon, y {@code
 * acceso} aqui no tiene columna {@code sistema}: sus codigos son los de {@code CatalogoDelSistema}
 * de esta caja. Un permiso sobre una opcion de {@code rentas} no es un fallo ni algo que espere: es
 * de otro sistema, se registra y se acusa. Aplicarlo «por el codigo» —{@code permisos} es una
 * opcion de {@code identidad} Y de {@code rentas}— seria conceder aqui lo que se concedio en otra
 * parte, que es exactamente lo que el {@code sistema} del evento existe para impedir.
 *
 * <h2>Sin auditoria propia, y se dice</h2>
 *
 * <p>La bitacora de cada uno de estos hechos —quien, cuando, por que— la escribio {@code identidad}
 * al decidirlo, con la observacion que la regla 10 exige alli. Volver a asentarlo aqui seria una
 * segunda bitacora del mismo acto con una observacion que nadie escribio. Lo que esta copia guarda
 * es lo suyo: que evento entro y cuando ({@code identidad_evento_aplicado}).
 */
@Service
@Profile("batch")
@ConditionalOnProperty("kamayuk.identidad.url")
public class AplicarUnEventoDeIdentidad extends RepositorioJdbc {

    /** El sistema cuyos permisos rigen en esta copia. */
    public static final String ESTE_SISTEMA = "caja";

    /** Con que se marca el alta de un miembro que llega ya dado de baja. */
    private static final String SIN_QUIEN_LO_DIO_DE_ALTA = "—";

    private final JsonMapper json;
    private final Clock reloj;
    private final AlertaDeEventosSinAplicar alerta;

    public AplicarUnEventoDeIdentidad(
            JdbcClient jdbc, JsonMapper json, Clock reloj, AlertaDeEventosSinAplicar alerta) {
        super(jdbc);
        this.json = json;
        this.reloj = reloj;
        this.alerta = alerta;
    }

    /** Lo que paso con un evento que si se resolvio. */
    public enum Aplicacion {
        /** La fila entro en la copia. */
        APLICADO,
        /** Ya habia entrado: el buzon lo sirvio otra vez y se descarto. */
        YA_APLICADO,
        /** Es un permiso de otro sistema: se toma nota y no rige aqui. */
        IGNORADO_AJENO
    }

    /**
     * Aplica el evento en SU PROPIA transaccion, con el acuse local dentro.
     *
     * <p>{@code REQUIRES_NEW} y no una transaccion para la vuelta entera, por dos motivos. El de la
     * municipalidad: el consumidor fija el contexto una vez por corrida y cada transaccion vuelve a
     * fijar {@code app.municipalidad_id} con {@code SET LOCAL} al abrirse, asi que dos eventos no
     * comparten nunca una conexion con un contexto viejo. Y el del acuse: acusar es «esto ya esta
     * confirmado», y solo es cierto de lo que ya hizo {@code commit}.
     *
     * @throws NoSePuedeAplicar si no se podra aplicar nunca
     * @throws TodaviaNo si nombra algo que esta copia no tiene aun
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Aplicacion aplicar(EventoDeIdentidadRecibido evento) {
        TipoDeEventoDeIdentidad tipo = evento.tipo();
        if (tipo == null) {
            throw new NoSePuedeAplicar(
                    "`identidad` publica un evento de tipo «"
                            + evento.tipoPublicado()
                            + "» y esta copia no lo conoce. Los que conoce son los siete de"
                            + " TipoDeEventoDeIdentidad; un octavo es un cambio del contrato del"
                            + " buzon, y esta copia no lo aplica a ciegas");
        }
        JsonNode cuerpo = leer(evento);
        exigirQueElSobreCoincidaConElCuerpo(evento, tipo, cuerpo);

        if (!marcarComoAplicado(evento)) {
            return Aplicacion.YA_APLICADO;
        }
        return switch (tipo) {
            case USUARIO_DADO_DE_ALTA, USUARIO_MODIFICADO -> usuario(evento, cuerpo);
            case GRUPO_DADO_DE_ALTA, GRUPO_MODIFICADO -> grupo(evento, cuerpo);
            case MIEMBRO_AFILIADO, MIEMBRO_DESAFILIADO -> miembro(cuerpo);
            case PERMISO_FIJADO -> permiso(cuerpo);
        };
    }

    /**
     * Aparta un evento que no se podra aplicar nunca, en SU PROPIA transaccion, y devuelve el
     * motivo tal como quedo escrito, para que el aviso diga lo mismo que la fila.
     *
     * <p>Aparte porque la transaccion en la que fallo esta deshecha: marcar algo dentro de ella no
     * sirve de nada, el {@code commit} muere igual y se lleva la marca por delante (la leccion de
     * {@code RechazoDelPago}, P5D). Se guarda el <b>cuerpo entero</b>: lo que se aparta tiene que
     * poder aplicarse a mano el dia que alguien decida que hacer con el.
     *
     * <p><b>Y si el rechazo dice que una clave la trae un sujeto que no tiene fila aqui, la fila
     * sin sujeto que la tiene deja de conceder AQUI MISMO</b> (seguimiento de #125). Un {@code
     * *_DADO_DE_ALTA} cuya clave ya es de una fila sin sujeto —o cualquier evento de un sujeto cuya
     * alta ya se aparto, que cae sobre una— dice que en {@code identidad} esa clave es de un sujeto
     * cuya alta no entro en esta copia, y desde aqui no se sabe si esa fila era suya. La persona
     * que entra con esa clave ({@code preferred_username}) es ese sujeto, y el guardia y la matriz
     * casan por {@code u.cuenta}: dentro del plazo de {@link PlazoDeAdopcion}, la fila le
     * concederia lo que tenga, sea de quien sea. Asi que en esta misma transaccion se le quita su
     * {@code sin_sujeto_desde} —sin sujeto y sin fecha no concede nunca— y el motivo lo dice
     * delante, para que no lo corte el tope de la columna. Falla cerrado: si la fila era de esa
     * misma persona —un alta que llego tarde—, hoy no tiene remedio dentro de las reglas, y por eso
     * el documento pide vaciar el buzon antes de desplegar esto. Solo si SIGUE sin sujeto: una fila
     * que lo gano entre el rechazo y este apartado ya no es la de nadie mas, y no se toca. Es la
     * unica escritura de {@code usuario} o {@code grupo} que no sale de un evento aplicado, y por
     * eso vive aqui, en el unico escritor de la regla 12: la tabla sale de {@link Sujeto}, nunca de
     * texto del evento. Lo razona {@code docs/40-datos/filas-sin-sujeto.md}.
     *
     * @return el motivo guardado en {@code identidad_evento_muerto}, entero (la columna lo recorta
     *     a 400)
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public String apartar(EventoDeIdentidadRecibido evento, NoSePuedeAplicar porQue) {
        String mensaje = porQue.getMessage();
        String motivo = mensaje == null ? porQue.getClass().getSimpleName() : mensaje;
        FilaARetirar retirar = porQue.retirar;
        if (retirar != null) {
            int retiradas =
                    jdbc().sql(
                                    "UPDATE "
                                            + retirar.sujeto().tabla
                                            + " SET sin_sujeto_desde = NULL WHERE municipalidad_id = "
                                            + MUNICIPALIDAD_ACTUAL
                                            + " AND id = :id AND identidad_sujeto_id IS NULL")
                            .param("id", retirar.id())
                            .update();
            motivo =
                    (retiradas == 1
                                    ? "La fila "
                                            + retirar.id()
                                            + " de "
                                            + retirar.sujeto().tabla
                                            + " DEJA DE CONCEDER DESDE YA (se le quito su"
                                            + " sin_sujeto_desde): su clave la trae un sujeto sin"
                                            + " fila aqui. "
                                    : "La fila "
                                            + retirar.id()
                                            + " de "
                                            + retirar.sujeto().tabla
                                            + " ya tenia sujeto al apartar este evento y no se"
                                            + " retiro. ")
                            + motivo;
        }
        jdbc().sql(
                        "INSERT INTO identidad_evento_muerto (municipalidad_id, evento_id,"
                                + " secuencia, tipo, sujeto_id, cuerpo, huella, motivo, apartado_en)"
                                + " VALUES ("
                                + MUNICIPALIDAD_ACTUAL
                                + ", :eventoId, :secuencia, :tipo, :sujetoId, :cuerpo, :huella,"
                                + " :motivo, :cuando)"
                                + " ON CONFLICT (municipalidad_id, evento_id) DO NOTHING")
                .param("eventoId", evento.eventoId())
                .param("secuencia", evento.secuencia())
                .param("tipo", recortar(evento.tipoPublicado(), 40))
                .param("sujetoId", evento.sujetoId())
                .param("cuerpo", evento.cuerpo())
                .param("huella", recortar(evento.huella(), 64))
                .param("motivo", recortar(motivo, 400))
                .param("cuando", reloj.instant().atOffset(java.time.ZoneOffset.UTC))
                .update();
        return motivo;
    }

    /** Cuantos eventos hay apartados en la municipalidad del contexto. */
    @Transactional(readOnly = true)
    public long apartados() {
        return jdbc().sql("SELECT count(*) FROM identidad_evento_muerto")
                .query(Long.class)
                .single();
    }

    /**
     * Las filas de {@code usuario} y {@code grupo} sin sujeto de {@code identidad}, partidas por si
     * todavia conceden el dia {@code hoy} (#125). Solo lee, y solo las habilitadas: una fila
     * deshabilitada no concede con sujeto ni sin el.
     *
     * <p>Vive aqui, junto a {@link #apartados()}, porque es la otra mitad de lo que esta copia no
     * consiguio aplicar: un apartado es un evento que no entro; una fila sin sujeto, una fila a la
     * que ningun evento llego. La condicion de «todavia concede» es la del guardia, letra por
     * letra: {@code sin_sujeto_desde >=} {@link PlazoDeAdopcion#primerInstanteQueConcede}. El dia
     * que se publica es el de Lima de ese instante.
     */
    @Transactional(readOnly = true)
    public FilasSinSujeto filasSinSujeto(LocalDate hoy) {
        OffsetDateTime corte = PlazoDeAdopcion.primerInstanteQueConcede(hoy);
        List<FilaSinSujeto> queConceden = sinSujetoEntre(corte, null);
        // Ayer concedian y hoy ya no: el corte de ayer es el comienzo de su ultimo dia.
        List<FilaSinSujeto> queDejaronDeConcederHoy =
                sinSujetoEntre(PlazoDeAdopcion.primerInstanteQueConcede(hoy.minusDays(1)), corte);
        long queYaNoConceden =
                jdbc().sql(
                                "SELECT (SELECT count(*) FROM usuario WHERE identidad_sujeto_id"
                                        + " IS NULL AND habilitado AND (sin_sujeto_desde IS NULL"
                                        + " OR sin_sujeto_desde < :corte))"
                                        + " + (SELECT count(*) FROM grupo WHERE identidad_sujeto_id"
                                        + " IS NULL AND habilitado AND (sin_sujeto_desde IS NULL"
                                        + " OR sin_sujeto_desde < :corte))")
                        .param("corte", corte)
                        .query(Long.class)
                        .single();
        return new FilasSinSujeto(queConceden, queDejaronDeConcederHoy, queYaNoConceden);
    }

    /**
     * Las habilitadas sin sujeto con {@code desde <= sin_sujeto_desde}, y {@code < hasta} si se da,
     * por tabla y clave. Sin tope son las que conceden hoy; con el corte de hoy como tope, las que
     * concedieron ayer por ultima vez.
     */
    private List<FilaSinSujeto> sinSujetoEntre(
            OffsetDateTime desde, @Nullable OffsetDateTime hasta) {
        String tope = hasta == null ? "" : " AND sin_sujeto_desde < :hasta";
        JdbcClient.StatementSpec consulta =
                jdbc().sql(
                                "SELECT 'usuario' AS tabla, id, cuenta AS clave, sin_sujeto_desde"
                                        + " FROM usuario WHERE identidad_sujeto_id IS NULL"
                                        + " AND habilitado AND sin_sujeto_desde >= :desde"
                                        + tope
                                        + " UNION ALL"
                                        + " SELECT 'grupo', id, nombre, sin_sujeto_desde"
                                        + " FROM grupo WHERE identidad_sujeto_id IS NULL"
                                        + " AND habilitado AND sin_sujeto_desde >= :desde"
                                        + tope
                                        + " ORDER BY tabla, clave")
                        .param("desde", desde);
        if (hasta != null) {
            consulta = consulta.param("hasta", hasta);
        }
        return consulta.query(
                        (fila, n) ->
                                new FilaSinSujeto(
                                        fila.getString("tabla"),
                                        fila.getLong("id"),
                                        fila.getString("clave"),
                                        ZonaHoraria.diaDe(
                                                fila.getObject(
                                                                "sin_sujeto_desde",
                                                                OffsetDateTime.class)
                                                        .toInstant())))
                .list();
    }

    /**
     * Las filas sin sujeto de una municipalidad, partidas por si todavia conceden (#125).
     *
     * @param queConceden las que conceden hoy, por tabla y clave
     * @param queDejaronDeConcederHoy las que concedieron ayer por ultima vez (ronda 2): el WARN las
     *     nombra en cada corrida del dia en que cruzan —cada cinco minutos, ese dia— y ningun otro,
     *     no en cada corrida para siempre
     * @param queYaNoConceden cuantas habilitadas ya no conceden, las de hoy incluidas y las que no
     *     tienen fecha tambien
     */
    public record FilasSinSujeto(
            List<FilaSinSujeto> queConceden,
            List<FilaSinSujeto> queDejaronDeConcederHoy,
            long queYaNoConceden) {
        public FilasSinSujeto {
            queConceden = List.copyOf(queConceden);
            queDejaronDeConcederHoy = List.copyOf(queDejaronDeConcederHoy);
        }
    }

    // ------------------------------------------------------------------

    /** El acuse local. {@code false} si ya estaba: el evento se sirvio dos veces. */
    private boolean marcarComoAplicado(EventoDeIdentidadRecibido evento) {
        int escritas =
                jdbc().sql(
                                "INSERT INTO identidad_evento_aplicado (municipalidad_id,"
                                        + " evento_id, secuencia, tipo, sujeto_id, huella,"
                                        + " aplicado_en) VALUES ("
                                        + MUNICIPALIDAD_ACTUAL
                                        + ", :eventoId, :secuencia, :tipo, :sujetoId, :huella,"
                                        + " :cuando)"
                                        + " ON CONFLICT (municipalidad_id, evento_id) DO NOTHING")
                        .param("eventoId", evento.eventoId())
                        .param("secuencia", evento.secuencia())
                        .param("tipo", recortar(evento.tipoPublicado(), 40))
                        .param("sujetoId", evento.sujetoId())
                        .param("huella", recortar(evento.huella(), 64))
                        .param("cuando", reloj.instant().atOffset(java.time.ZoneOffset.UTC))
                        .update();
        return escritas == 1;
    }

    private Aplicacion usuario(EventoDeIdentidadRecibido evento, JsonNode cuerpo) {
        long identidadId = exigirId(cuerpo, Sujeto.USUARIO.campoId);
        String cuenta = exigir(cuerpo, "cuenta");
        Casamiento casamiento =
                casarParaEscribir(Sujeto.USUARIO, identidadId, cuenta, esAlta(evento));
        String sql =
                casamiento.local() == null
                        ? "INSERT INTO usuario (municipalidad_id, identidad_sujeto_id, cuenta,"
                                + " nombre, correo, habilitado, vigencia_desde, vigencia_hasta)"
                                + " VALUES ("
                                + MUNICIPALIDAD_ACTUAL
                                + ", :identidadId, :cuenta, :nombre, :correo, :habilitado, :desde,"
                                + " :hasta)"
                        : "UPDATE usuario SET identidad_sujeto_id = :identidadId,"
                                + " cuenta = :cuenta, nombre = :nombre, correo = :correo,"
                                + " habilitado = :habilitado, vigencia_desde = :desde,"
                                + " vigencia_hasta = :hasta WHERE municipalidad_id = "
                                + MUNICIPALIDAD_ACTUAL
                                + " AND id = :local";
        jdbc().sql(sql)
                .param("identidadId", identidadId)
                .param("cuenta", casamiento.clave())
                .param("nombre", exigir(cuerpo, "nombre"))
                .param("correo", textoONulo(cuerpo, "correo"))
                .param("habilitado", cuerpo.path("habilitado").asBoolean(true))
                .param("desde", fechaONula(cuerpo, "vigenciaDesde"))
                .param("hasta", fechaONula(cuerpo, "vigenciaHasta"))
                .param("local", casamiento.local())
                .update();
        if (casamiento.choque() != null) {
            alerta.hayUnChoqueDeRenombrado(evento, casamiento.choque());
        }
        return Aplicacion.APLICADO;
    }

    private Aplicacion grupo(EventoDeIdentidadRecibido evento, JsonNode cuerpo) {
        long identidadId = exigirId(cuerpo, Sujeto.GRUPO.campoId);
        String nombre = exigir(cuerpo, "nombre");
        Casamiento casamiento =
                casarParaEscribir(Sujeto.GRUPO, identidadId, nombre, esAlta(evento));
        String sql =
                casamiento.local() == null
                        ? "INSERT INTO grupo (municipalidad_id, identidad_sujeto_id, nombre,"
                                + " descripcion, habilitado, vigencia_desde, vigencia_hasta)"
                                + " VALUES ("
                                + MUNICIPALIDAD_ACTUAL
                                + ", :identidadId, :nombre, :descripcion, :habilitado, :desde,"
                                + " :hasta)"
                        : "UPDATE grupo SET identidad_sujeto_id = :identidadId,"
                                + " nombre = :nombre, descripcion = :descripcion,"
                                + " habilitado = :habilitado, vigencia_desde = :desde,"
                                + " vigencia_hasta = :hasta WHERE municipalidad_id = "
                                + MUNICIPALIDAD_ACTUAL
                                + " AND id = :local";
        jdbc().sql(sql)
                .param("identidadId", identidadId)
                .param("nombre", casamiento.clave())
                .param("descripcion", textoONulo(cuerpo, "descripcion"))
                .param("habilitado", cuerpo.path("habilitado").asBoolean(true))
                .param("desde", fechaONula(cuerpo, "vigenciaDesde"))
                .param("hasta", fechaONula(cuerpo, "vigenciaHasta"))
                .param("local", casamiento.local())
                .update();
        if (casamiento.choque() != null) {
            alerta.hayUnChoqueDeRenombrado(evento, casamiento.choque());
        }
        return Aplicacion.APLICADO;
    }

    private Aplicacion miembro(JsonNode cuerpo) {
        String grupo = exigir(cuerpo, "grupoNombre");
        String cuenta = exigir(cuerpo, "usuarioCuenta");
        @Nullable Long grupoId = casarParaNombrar(Sujeto.GRUPO, exigirId(cuerpo, "grupoId"), grupo);
        @Nullable Long usuarioId =
                casarParaNombrar(Sujeto.USUARIO, exigirId(cuerpo, "usuarioId"), cuenta);
        if (grupoId == null || usuarioId == null) {
            throw todaviaNo(
                    "El evento de `miembro` nombra el grupo «"
                            + grupo
                            + "» y la cuenta «"
                            + cuenta
                            + "», y esta copia no conoce a los dos todavia");
        }
        boolean activo = cuerpo.path("activo").asBoolean(true);
        String usuarioAlta = textoONulo(cuerpo, "usuarioAlta");
        jdbc().sql(
                        "INSERT INTO miembro (municipalidad_id, grupo_id, usuario_id,"
                                + " usuario_alta, activo, fecha_baja, usuario_baja) VALUES ("
                                + MUNICIPALIDAD_ACTUAL
                                + ", :grupoId, :usuarioId, :usuarioAlta, :activo, :fechaBaja,"
                                + " :usuarioBaja)"
                                + " ON CONFLICT (municipalidad_id, grupo_id, usuario_id)"
                                + " DO UPDATE SET activo = EXCLUDED.activo,"
                                + " fecha_baja = EXCLUDED.fecha_baja,"
                                + " usuario_baja = EXCLUDED.usuario_baja")
                .param("grupoId", grupoId)
                .param("usuarioId", usuarioId)
                .param("usuarioAlta", usuarioAlta == null ? SIN_QUIEN_LO_DIO_DE_ALTA : usuarioAlta)
                .param("activo", activo)
                .param(
                        "fechaBaja",
                        activo ? null : reloj.instant().atOffset(java.time.ZoneOffset.UTC))
                .param("usuarioBaja", activo ? null : textoONulo(cuerpo, "usuarioBaja"))
                .update();
        return Aplicacion.APLICADO;
    }

    private Aplicacion permiso(JsonNode cuerpo) {
        String sistema = exigir(cuerpo, "sistema");
        if (!ESTE_SISTEMA.equals(sistema)) {
            return Aplicacion.IGNORADO_AJENO;
        }
        String codigo = exigir(cuerpo, "codigo");
        String sujetoNombre = exigir(cuerpo, "sujetoNombre");
        boolean deGrupo = "GRUPO".equals(exigir(cuerpo, "sujeto"));
        Sujeto sujeto = deGrupo ? Sujeto.GRUPO : Sujeto.USUARIO;
        @Nullable Long sujetoId =
                casarParaNombrar(sujeto, exigirId(cuerpo, "sujetoId"), sujetoNombre);
        String queFalta =
                "El evento de `permiso` nombra el acceso «"
                        + codigo
                        + "» de `caja` y el "
                        + sujeto.tabla
                        + " «"
                        + sujetoNombre
                        + "», y esta copia no conoce a los dos todavia";
        if (sujetoId == null) {
            throw todaviaNo(queFalta);
        }
        JsonNode privilegios = cuerpo.path("privilegios");
        StringBuilder columnas = new StringBuilder();
        StringBuilder valores = new StringBuilder();
        StringBuilder actualizacion = new StringBuilder();
        for (Privilegio privilegio : Privilegio.values()) {
            String columna = privilegio.columna();
            columnas.append(", ").append(columna);
            valores.append(", :").append(columna);
            actualizacion.append(", ").append(columna).append(" = EXCLUDED.").append(columna);
        }
        String sql =
                "INSERT INTO permiso (municipalidad_id, acceso_id, grupo_id, usuario_id,"
                        + " usuario_registro"
                        + columnas
                        + ") SELECT "
                        + MUNICIPALIDAD_ACTUAL
                        + ", a.id, "
                        + (deGrupo ? ":sujeto, NULL" : "NULL, :sujeto")
                        + ", :quien"
                        + valores
                        + " FROM acceso a WHERE a.municipalidad_id = "
                        + MUNICIPALIDAD_ACTUAL
                        + " AND a.codigo = :codigo"
                        + " ON CONFLICT (municipalidad_id, acceso_id, "
                        + (deGrupo ? "grupo_id) WHERE grupo_id" : "usuario_id) WHERE usuario_id")
                        + " IS NOT NULL DO UPDATE SET usuario_registro = EXCLUDED.usuario_registro"
                        + actualizacion;
        JdbcClient.StatementSpec sentencia =
                jdbc().sql(sql)
                        .param("quien", exigir(cuerpo, "usuarioRegistro"))
                        .param("codigo", codigo)
                        .param("sujeto", sujetoId);
        for (Privilegio privilegio : Privilegio.values()) {
            sentencia =
                    sentencia.param(
                            privilegio.columna(),
                            privilegios.path(privilegio.columna()).asBoolean(false));
        }
        exigirQueEscribiera(sentencia.update(), queFalta);
        return Aplicacion.APLICADO;
    }

    // ------------------------------------------------------------------
    //  Casar por el sujeto de `identidad` (#111)
    // ------------------------------------------------------------------

    /** Las dos tablas cuyas filas son sujetos de {@code identidad}, y con que se casan. */
    private enum Sujeto {
        USUARIO("usuario", "cuenta", "usuarioId", "la cuenta", "USUARIO_DADO_DE_ALTA"),
        GRUPO("grupo", "nombre", "grupoId", "el grupo", "GRUPO_DADO_DE_ALTA");

        final String tabla;
        final String clave;
        final String campoId;
        final String articulado;
        final String tipoDeSuAlta;

        Sujeto(String tabla, String clave, String campoId, String articulado, String tipoDeSuAlta) {
            this.tabla = tabla;
            this.clave = clave;
            this.campoId = campoId;
            this.articulado = articulado;
            this.tipoDeSuAlta = tipoDeSuAlta;
        }
    }

    /** Una fila local candidata: su id de aqui, el sujeto de {@code identidad} y su clave. */
    private record Candidata(long id, @Nullable Long identidadId, String clave) {}

    /**
     * Lo que un alta o una modificacion tiene que escribir.
     *
     * @param local la fila a actualizar, o {@code null} si es una fila nueva
     * @param clave la clave que hay que escribir: la del evento, salvo que {@code choque} no sea
     *     {@code null}, en cuyo caso es la que la fila YA tenia
     * @param choque el motivo del choque, si lo hubo (ronda 1 de #111); {@code null} si no
     */
    private record Casamiento(@Nullable Long local, String clave, @Nullable String choque) {}

    /**
     * Resuelve con que fila casa un alta o una modificacion, y con que clave hay que escribirla.
     *
     * <ol>
     *   <li>La que ya lleva ese sujeto de {@code identidad}: es ella aunque la clave haya cambiado
     *       —eso es un renombrado, y se le escribe la clave nueva—, <b>salvo que esa clave nueva ya
     *       sea de otra fila</b>: ver el choque, abajo.
     *   <li>Si ninguna lo lleva, la que tiene esa clave natural <b>y ningun sujeto</b>: una fila de
     *       antes de V5, que se adopta estampandole el id — <b>solo si el evento es un {@code
     *       *_MODIFICADO} y el alta de ese sujeto no esta apartada aqui</b> (ronda 2 de #125: si lo
     *       esta, el {@code *_MODIFICADO} del sujeto nuevo adoptaria lo que su alta no pudo). Un
     *       {@code *_DADO_DE_ALTA} no adopta nunca (ronda 1 de #125): la fila que ya esta en la
     *       copia ya tuvo su alta, asi que otra alta con su clave es OTRO sujeto —el caso es
     *       «jperez» renombrado en {@code identidad} y un «jperez» nuevo dado de alta despues:
     *       adoptar la huerfana le heredaria al nuevo los miembros y los permisos del anterior—. Se
     *       aparta con {@link NoSePuedeAplicar}, nombrando la fila y el sujeto nuevo, y el nuevo no
     *       recibe nada hasta que alguien lo resuelva: falla cerrado. <b>Y la huerfana deja de
     *       conceder en ese mismo apartado</b> (seguimiento de #125, ver {@link #apartar}): quien
     *       entra con su clave es el sujeto de ese alta, y no se sabe si la fila era suya.
     *   <li>Si ninguna de las dos, es nueva.
     * </ol>
     *
     * <p>Un alta del MISMO sujeto que ya esta —una fila que ya lleva ese id— sigue casando en el
     * paso 1, por id: no es una adopcion. {@code identidad} hoy no la emite ({@code
     * registrarUsuario} y {@code registrarGrupo} solo publican el alta cuando el id es nulo, y
     * volver a habilitar es un {@code *_MODIFICADO}; medido en {@code identidad@6c5e433}), pero si
     * algun dia lo hiciera, se aplica sobre su fila.
     *
     * <p><b>El choque de un renombrado (ronda 1 de #111) NO se aparta.</b> Hasta aqui, que la clave
     * nueva ya fuera de otra fila —huerfana o de otro sujeto— era {@link NoSePuedeAplicar} entero:
     * el evento se apartaba SIN escribir nada. El problema es que un choque puede llegar solo, y si
     * la fila que choca es la del cajero al que hay que inhabilitar, apartar el evento deja a ese
     * cajero habilitado hasta que alguien resuelva el choque a mano —un choque de nombres
     * bloqueando una baja es exactamente el defecto que #111 existe para cerrar, solo que con otra
     * forma—. Asi que un choque de renombrado se APLICA: la fila del {@code id} de {@code
     * identidad} recibe todo lo que el evento trae —habilitado, vigencias, y lo demas— <b>menos la
     * clave</b>, que conserva la que ya tenia, porque escribirsela se la quitaria a la fila con la
     * que choca. El evento cuenta como aplicado y se acusa; se avisa al responsable (ver {@link
     * AlertaDeEventosSinAplicar#hayUnChoqueDeRenombrado}) para que decida a mano cual de las dos
     * filas vale.
     *
     * <p>El OTRO choque —un ALTA (no una modificacion: {@code local} nace {@code null}) cuya clave
     * ya es de OTRO sujeto en esta copia— sigue siendo {@link NoSePuedeAplicar} entero: aqui no hay
     * fila propia que actualizar reteniendo su clave, asi que no hay nada seguro que escribir.
     */
    private Casamiento casarParaEscribir(
            Sujeto sujeto, long identidadId, String clave, boolean esAlta) {
        List<Candidata> candidatas =
                jdbc().sql(
                                "SELECT id, identidad_sujeto_id, "
                                        + sujeto.clave
                                        + " AS clave FROM "
                                        + sujeto.tabla
                                        + " WHERE municipalidad_id = "
                                        + MUNICIPALIDAD_ACTUAL
                                        + " AND (identidad_sujeto_id = :identidadId OR "
                                        + sujeto.clave
                                        + " = :clave)")
                        .param("identidadId", identidadId)
                        .param("clave", clave)
                        .query(
                                (fila, n) ->
                                        new Candidata(
                                                fila.getLong("id"),
                                                fila.getObject("identidad_sujeto_id", Long.class),
                                                fila.getString("clave")))
                        .list();
        @Nullable Candidata porId = null;
        @Nullable Candidata porClave = null;
        for (Candidata candidata : candidatas) {
            if (Long.valueOf(identidadId).equals(candidata.identidadId())) {
                porId = candidata;
            }
            if (clave.equals(candidata.clave())) {
                porClave = candidata;
            }
        }
        if (porId != null) {
            if (porClave != null && porClave.id() != porId.id()) {
                String motivo =
                        "`identidad` dice que "
                                + sujeto.articulado
                                + " "
                                + identidadId
                                + " se llama ahora «"
                                + clave
                                + "», y en esta copia ese nombre ya lo tiene otra fila, "
                                + deQuien(porClave)
                                + ". Para no dejar sin aplicar una inhabilitacion u otro cambio de"
                                + " esta fila, esta copia escribe todo lo demas y le conserva su"
                                + " clave anterior, «"
                                + porId.clave()
                                + "»; esta copia no decide cual de las dos filas vale ni mueve"
                                + " miembros ni permisos de una a otra: hay que resolverlo a mano";
                return new Casamiento(porId.id(), porId.clave(), motivo);
            }
            return new Casamiento(porId.id(), clave, null);
        }
        if (porClave != null) {
            if (porClave.identidadId() != null) {
                throw new NoSePuedeAplicar(
                        "`identidad` publica "
                                + sujeto.articulado
                                + " "
                                + identidadId
                                + " con el nombre «"
                                + clave
                                + "», y en esta copia ese nombre es "
                                + deQuien(porClave)
                                + ": a esta copia le falta el evento que lo renombro, y escribir"
                                + " este sobre esa fila se la daria a otro");
            }
            if (esAlta) {
                throw new NoSePuedeAplicar(
                        "`identidad` da de alta "
                                + sujeto.articulado
                                + " "
                                + identidadId
                                + " con el nombre «"
                                + clave
                                + "», y en esta copia ese nombre lo tiene la fila "
                                + porClave.id()
                                + " sin sujeto de `identidad`. Adoptarla por la clave le daria lo"
                                + " que esa fila tiene sin saber si era suya —un sujeto NUEVO con"
                                + " la clave de otro, o un alta que llego tarde—; no se aplica hasta"
                                + " resolverlo a mano (#125, docs/40-datos/filas-sin-sujeto.md)",
                        new FilaARetirar(sujeto, porClave.id()));
            }
            exigirQueSuAltaNoSeHayaApartado(sujeto, identidadId, clave, porClave);
            return new Casamiento(porClave.id(), clave, null);
        }
        return new Casamiento(null, clave, null);
    }

    /**
     * Niega la adopcion de una fila sin sujeto a un sujeto cuya ALTA esta apartada en {@code
     * identidad_evento_muerto} (ronda 2 de #125).
     *
     * <p>La ronda 1 aparto el alta que caia sobre una huerfana, pero eso se esquivaba con el evento
     * siguiente del mismo sujeto: la afiliacion, el permiso o la modificacion de «jperez» (el
     * nuevo, id 200) no encontraban ninguna fila con el id 200, encontraban la huerfana por la
     * cuenta y le estampaban el 200 —y con sujeto puesto, el plazo de {@link
     * kamayuk.caja.seguridad.dominio.PlazoDeAdopcion} ya no le aplicaba—. Un sujeto cuya alta esta
     * apartada aqui nunca tuvo fila en esta copia: no puede ser el dueno de una fila sin sujeto. Se
     * aparta con {@link NoSePuedeAplicar}, que avisa al responsable nombrando la huerfana y el
     * sujeto, y todos sus eventos siguientes se apartaran igual hasta que alguien lo resuelva:
     * falla cerrado. Y la huerfana deja de conceder en ese apartado, por lo mismo que con el alta
     * (ver {@link #apartar}): casi siempre ya lo hizo al apartarse el alta, pero si el alta se
     * aparto por otro motivo —un cuerpo roto, o una clave que era de otro sujeto— y el sujeto se
     * renombra despues a la clave de una huerfana, es este evento el que lo prueba.
     *
     * <p><b>Solo el alta APARTADA, no la APLICADA</b>, y esta medido. Antes de V5 este mismo
     * aplicador ya acusaba en {@code identidad_evento_aplicado} (V3, etapa 4), pero creaba la fila
     * SIN sujeto: el alta del dueno legitimo de toda fila de antes de V5 esta alli, y contarla
     * dejaria sin remedio exactamente a las filas que #111 quiere adoptar (lo mide {@code
     * laFilaDeAntesDeV5ConSuAltaAplicadaSeAdopta}). Y un alta aplicada DESPUES de V5 siempre deja
     * una fila con su id —inserta con el, o casa por el—, asi que su sujeto casa por id en el paso
     * 1 y nunca llega hasta aqui. Las dos tablas guardan {@code tipo} (tal como se publico) y
     * {@code sujeto_id} (el del sobre, que para un alta es el {@code usuarioId} o el {@code
     * grupoId}, contrastado con el cuerpo) en columnas propias: la consulta es directa.
     */
    private void exigirQueSuAltaNoSeHayaApartado(
            Sujeto sujeto, long identidadId, String clave, Candidata huerfana) {
        boolean apartada =
                Boolean.TRUE.equals(
                        jdbc().sql(
                                        "SELECT EXISTS (SELECT 1 FROM identidad_evento_muerto"
                                                + " WHERE sujeto_id = :identidadId AND tipo ="
                                                + " :tipo)")
                                .param("identidadId", identidadId)
                                .param("tipo", sujeto.tipoDeSuAlta)
                                .query(Boolean.class)
                                .single());
        if (apartada) {
            throw new NoSePuedeAplicar(
                    "`identidad` nombra "
                            + sujeto.articulado
                            + " "
                            + identidadId
                            + " con el nombre «"
                            + clave
                            + "», y en esta copia ese nombre lo tiene la fila "
                            + huerfana.id()
                            + " sin sujeto de `identidad`. El alta de "
                            + identidadId
                            + " se aparto aqui: nunca tuvo fila en esta copia y no es el dueno de"
                            + " esa huerfana; adoptarla le heredaria sus miembros y permisos. No se"
                            + " aplica hasta resolverlo a mano (#125,"
                            + " docs/40-datos/filas-sin-sujeto.md)",
                    new FilaARetirar(sujeto, huerfana.id()));
        }
    }

    /** Si el evento es un alta, que nunca adopta por la clave (ronda 1 de #125). */
    private static boolean esAlta(EventoDeIdentidadRecibido evento) {
        return evento.tipo() == TipoDeEventoDeIdentidad.USUARIO_DADO_DE_ALTA
                || evento.tipo() == TipoDeEventoDeIdentidad.GRUPO_DADO_DE_ALTA;
    }

    private static String deQuien(Candidata fila) {
        return fila.identidadId() == null
                ? "sin sujeto de `identidad` (una huerfana: de antes de V5, o la que dejo un"
                        + " renombrado antes de #111)"
                : "del sujeto " + fila.identidadId() + " de `identidad`";
    }

    /**
     * La fila de aqui a la que se refiere una afiliacion o un permiso, o {@code null} si todavia no
     * esta.
     *
     * <ol>
     *   <li>La que ya lleva ese sujeto de {@code identidad}: es ella.
     *   <li>Si ninguna lo lleva, la que tiene esa clave natural. Si esa fila no lleva NINGUN sujeto
     *       —una de antes de V5, o una que ni su propio alta/modificacion adopto todavia— se adopta
     *       AQUI MISMO, estampandole el id, salvo que el alta de ese sujeto este apartada (ronda 2
     *       de #125: {@code exigirQueSuAltaNoSeHayaApartado}): una afiliacion o un permiso no
     *       tienen por que esperar al evento del propio sujeto para cerrar esa ventana (ronda 1 de
     *       #111).
     *   <li>Pero si esa fila YA es de OTRO sujeto, no se adopta ni se usa: es un choque, no una
     *       ausencia. {@code identidad} nombra un sujeto por un id que en esta copia ya es de otro,
     *       y aplicar esto encima le pondria los permisos o la afiliacion de un sujeto a la fila de
     *       otro. Se aparta con {@link NoSePuedeAplicar} en vez de quedar TODAVIA NO: reintentarlo
     *       no lo resuelve, porque la fila que falta nunca va a llegar con ese nombre mientras la
     *       otra lo tenga.
     * </ol>
     */
    private @Nullable Long casarParaNombrar(Sujeto sujeto, long identidadId, String clave) {
        List<Candidata> candidatas =
                jdbc().sql(
                                "SELECT id, identidad_sujeto_id, "
                                        + sujeto.clave
                                        + " AS clave FROM "
                                        + sujeto.tabla
                                        + " WHERE municipalidad_id = "
                                        + MUNICIPALIDAD_ACTUAL
                                        + " AND (identidad_sujeto_id = :identidadId OR "
                                        + sujeto.clave
                                        + " = :clave)")
                        .param("identidadId", identidadId)
                        .param("clave", clave)
                        .query(
                                (fila, n) ->
                                        new Candidata(
                                                fila.getLong("id"),
                                                fila.getObject("identidad_sujeto_id", Long.class),
                                                fila.getString("clave")))
                        .list();
        @Nullable Candidata porId = null;
        @Nullable Candidata porClave = null;
        for (Candidata candidata : candidatas) {
            if (Long.valueOf(identidadId).equals(candidata.identidadId())) {
                porId = candidata;
            }
            if (clave.equals(candidata.clave())) {
                porClave = candidata;
            }
        }
        if (porId != null) {
            return porId.id();
        }
        if (porClave == null) {
            return null;
        }
        if (porClave.identidadId() != null) {
            throw new NoSePuedeAplicar(
                    "`identidad` nombra "
                            + sujeto.articulado
                            + " "
                            + identidadId
                            + " con el nombre «"
                            + clave
                            + "», y en esta copia ese nombre ya es "
                            + deQuien(porClave)
                            + ": a esta copia le falta el evento que lo puso al dia, y aplicar esto"
                            + " sobre esa fila se la daria a otro sujeto");
        }
        exigirQueSuAltaNoSeHayaApartado(sujeto, identidadId, clave, porClave);
        jdbc().sql(
                        "UPDATE "
                                + sujeto.tabla
                                + " SET identidad_sujeto_id = :identidadId WHERE municipalidad_id = "
                                + MUNICIPALIDAD_ACTUAL
                                + " AND id = :id")
                .param("identidadId", identidadId)
                .param("id", porClave.id())
                .update();
        return porClave.id();
    }

    // ------------------------------------------------------------------

    private JsonNode leer(EventoDeIdentidadRecibido evento) {
        try {
            JsonNode cuerpo = json.readTree(evento.cuerpo());
            if (!cuerpo.isObject()) {
                throw new NoSePuedeAplicar(
                        "El cuerpo del evento " + evento.eventoId() + " no es un objeto JSON");
            }
            return cuerpo;
        } catch (JacksonException ilegible) {
            throw new NoSePuedeAplicar(
                    "El cuerpo del evento "
                            + evento.eventoId()
                            + " no es JSON: "
                            + ilegible.getOriginalMessage(),
                    ilegible);
        }
    }

    /**
     * El sujeto del sobre ({@code evento.sujetoId()}) y el id del cuerpo tienen que ser el mismo
     * numero (ronda 2 de #111): {@code HechoDeIdentidad} los pone con el mismo valor —{@code
     * usuarioId} para un usuario, {@code grupoId} para un grupo o una afiliacion (el sujeto de una
     * afiliacion es el GRUPO, no el usuario: es la misma eleccion que hace la auditoria de
     * `identidad`), y el {@code sujetoId} del propio cuerpo para un permiso, que ya es el id del
     * grupo o del usuario segun el tipo de sujeto—. Hasta aqui esta copia leia el id SOLO del
     * cuerpo y confiaba en que el sobre dijera lo mismo, sin comprobarlo. Si algun dia no coincide
     * —un transporte que reordena campos, un cambio de contrato a medias— esta copia no decide cual
     * de los dos vale: se aparta con {@link NoSePuedeAplicar}, nombrando los dos numeros.
     */
    private static void exigirQueElSobreCoincidaConElCuerpo(
            EventoDeIdentidadRecibido evento, TipoDeEventoDeIdentidad tipo, JsonNode cuerpo) {
        String campo =
                switch (tipo) {
                    case USUARIO_DADO_DE_ALTA, USUARIO_MODIFICADO -> "usuarioId";
                    case GRUPO_DADO_DE_ALTA,
                            GRUPO_MODIFICADO,
                            MIEMBRO_AFILIADO,
                            MIEMBRO_DESAFILIADO ->
                            "grupoId";
                    case PERMISO_FIJADO -> "sujetoId";
                };
        long delCuerpo = exigirId(cuerpo, campo);
        if (evento.sujetoId() != delCuerpo) {
            throw new NoSePuedeAplicar(
                    "El sobre del evento "
                            + evento.eventoId()
                            + " dice que el sujeto es "
                            + evento.sujetoId()
                            + ", y su cuerpo dice «"
                            + campo
                            + "»="
                            + delCuerpo
                            + ": no coinciden, y esta copia no decide cual de los dos vale");
        }
    }

    /**
     * El {@code INSERT … SELECT} que no encuentra a quien nombra <b>no falla: escribe cero
     * filas</b>. Esa es la forma silenciosa, y aqui se convierte en {@link TodaviaNo}: el evento se
     * queda pendiente en el emisor y la siguiente vuelta lo encuentra con su dependencia puesta.
     */
    private static void exigirQueEscribiera(int escritas, String queFalta) {
        if (escritas == 0) {
            throw todaviaNo(queFalta + ": la sentencia escribio 0 filas");
        }
    }

    private static TodaviaNo todaviaNo(String queFalta) {
        return new TodaviaNo(
                queFalta
                        + ". Un evento que llega antes que aquel del que depende no se puede"
                        + " aplicar, y descartarlo en silencio dejaria la copia desatrasada sin que"
                        + " nada lo diga; se deja pendiente y se vuelve a intentar");
    }

    /**
     * El identificador del sujeto en {@code identidad} (#111): un entero positivo, porque alli es
     * un {@code GENERATED ALWAYS AS IDENTITY} y {@code HechoDeIdentidad} rechaza el cero.
     */
    private static long exigirId(JsonNode cuerpo, String campo) {
        JsonNode valor = cuerpo.path(campo);
        if (!valor.isIntegralNumber() || !valor.canConvertToLong() || valor.asLong() <= 0) {
            throw new NoSePuedeAplicar(
                    "El cuerpo del evento no trae «"
                            + campo
                            + "» como un entero positivo, y es el identificador del sujeto en"
                            + " `identidad`: sin el no hay forma de distinguir una fila nueva de"
                            + " una que se renombro (#111)");
        }
        return valor.asLong();
    }

    private static String exigir(JsonNode cuerpo, String campo) {
        JsonNode valor = cuerpo.path(campo);
        if (valor.isMissingNode() || valor.isNull() || valor.asString("").isBlank()) {
            throw new NoSePuedeAplicar(
                    "El cuerpo del evento no trae «"
                            + campo
                            + "», que es con lo que esta copia lo casa. Sin el no hay forma de"
                            + " saber de quien habla");
        }
        return valor.asString();
    }

    private static @Nullable String textoONulo(JsonNode cuerpo, String campo) {
        JsonNode valor = cuerpo.path(campo);
        return valor.isMissingNode() || valor.isNull() ? null : valor.asString();
    }

    private static @Nullable LocalDate fechaONula(JsonNode cuerpo, String campo) {
        String texto = textoONulo(cuerpo, campo);
        if (texto == null || texto.isBlank()) {
            return null;
        }
        try {
            return LocalDate.parse(texto);
        } catch (DateTimeParseException noEsFecha) {
            throw new NoSePuedeAplicar(
                    "El cuerpo trae «" + campo + "» = «" + texto + "», que no es una fecha",
                    noEsFecha);
        }
    }

    private static String recortar(String texto, int largo) {
        return texto.length() <= largo ? texto : texto.substring(0, largo);
    }

    /**
     * Ciertamente irrecuperable: mandarlo otra vez da lo mismo. Se aparta y se avisa.
     *
     * <p>Lleva, cuando el rechazo dice que una clave la trae un sujeto sin fila aqui, la fila sin
     * sujeto que {@link #apartar} tiene que dejar de hacer conceder en la misma transaccion
     * (seguimiento de #125). Solo la pone esta clase, con la tabla de {@link Sujeto}: el
     * constructor que la recibe es privado, y quien la atrapa no la puede leer ni cambiar, solo
     * entregarla a {@link #apartar}.
     */
    public static final class NoSePuedeAplicar extends RuntimeException {
        @java.io.Serial private static final long serialVersionUID = 2L;

        private final @Nullable FilaARetirar retirar;

        public NoSePuedeAplicar(String mensaje) {
            super(mensaje);
            this.retirar = null;
        }

        public NoSePuedeAplicar(String mensaje, Throwable causa) {
            super(mensaje, causa);
            this.retirar = null;
        }

        private NoSePuedeAplicar(String mensaje, FilaARetirar retirar) {
            super(mensaje);
            this.retirar = retirar;
        }
    }

    /**
     * La fila sin sujeto que un apartado deja de hacer conceder desde ya: su tabla —de {@link
     * Sujeto}, nunca de texto que llego en el evento— y su {@code id} en esta copia.
     */
    private record FilaARetirar(Sujeto sujeto, long id) implements java.io.Serializable {}

    /**
     * Nombra algo que esta copia no tiene AUN. No se aparta y no se acusa: se vuelve a intentar.
     */
    public static final class TodaviaNo extends RuntimeException {
        @java.io.Serial private static final long serialVersionUID = 1L;

        public TodaviaNo(String mensaje) {
            super(mensaje);
        }
    }
}
