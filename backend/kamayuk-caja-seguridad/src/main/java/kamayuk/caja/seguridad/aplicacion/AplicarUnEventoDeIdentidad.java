package kamayuk.caja.seguridad.aplicacion;

import java.time.Clock;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.List;
import kamayuk.caja.autorizacion.Privilegio;
import kamayuk.caja.persistencia.RepositorioJdbc;
import kamayuk.caja.seguridad.EventoDeIdentidadRecibido;
import kamayuk.caja.seguridad.TipoDeEventoDeIdentidad;
import org.jspecify.annotations.Nullable;
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
 * el sobre con el mismo valor). Se lee del cuerpo, igual que las claves naturales.
 *
 * <p>Asi que un alta o una modificacion casan primero por ese id —y si la fila lo lleva, se le
 * escribe la clave nueva: es el renombrado— y, si ninguna fila lo lleva, por la clave natural
 * <b>entre las filas que no llevan ninguno</b>, que se adoptan estampandoles el id: son las de
 * antes de V5, que no tienen de donde saber de que sujeto son. Una afiliacion o un permiso casan
 * igual, sin estampar nada (la adopcion la hace el evento del propio sujeto, que trae la fila
 * entera). Los dos choques posibles —la clave nueva ya es de otra fila, o es de otro sujeto— no se
 * aplican nunca: ver {@code casarParaEscribir}. El acceso sigue casando por su {@code codigo},
 * porque cada sistema siembra su catalogo por su cuenta.
 *
 * <h2>Los tres desenlaces, y por que hacen falta los tres</h2>
 *
 * <ul>
 *   <li><b>Se aplico</b> (o ya estaba): la fila entro y el acuse local quedo escrito <b>en la misma
 *       transaccion</b>. Un evento que se vuelva a servir se descarta por {@code
 *       identidad_evento_aplicado} sin tocar nada.
 *   <li><b>No se podra aplicar NUNCA</b> ({@link NoSePuedeAplicar}): un tipo que esta copia no
 *       conoce, un cuerpo que no es JSON, un cuerpo al que le falta la clave con la que se casa, o
 *       un renombrado que choca con otra fila de esta copia (#111). Mandarlo otra vez da lo mismo;
 *       quien lo llama lo aparta y avisa.
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
public class AplicarUnEventoDeIdentidad extends RepositorioJdbc {

    /** El sistema cuyos permisos rigen en esta copia. */
    public static final String ESTE_SISTEMA = "caja";

    /** Con que se marca el alta de un miembro que llega ya dado de baja. */
    private static final String SIN_QUIEN_LO_DIO_DE_ALTA = "—";

    private final JsonMapper json;
    private final Clock reloj;

    public AplicarUnEventoDeIdentidad(JdbcClient jdbc, JsonMapper json, Clock reloj) {
        super(jdbc);
        this.json = json;
        this.reloj = reloj;
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

        if (!marcarComoAplicado(evento)) {
            return Aplicacion.YA_APLICADO;
        }
        return switch (tipo) {
            case USUARIO_DADO_DE_ALTA, USUARIO_MODIFICADO -> usuario(cuerpo);
            case GRUPO_DADO_DE_ALTA, GRUPO_MODIFICADO -> grupo(cuerpo);
            case MIEMBRO_AFILIADO, MIEMBRO_DESAFILIADO -> miembro(cuerpo);
            case PERMISO_FIJADO -> permiso(cuerpo);
        };
    }

    /**
     * Aparta un evento que no se podra aplicar nunca, en SU PROPIA transaccion.
     *
     * <p>Aparte porque la transaccion en la que fallo esta deshecha: marcar algo dentro de ella no
     * sirve de nada, el {@code commit} muere igual y se lleva la marca por delante (la leccion de
     * {@code RechazoDelPago}, P5D). Se guarda el <b>cuerpo entero</b>: lo que se aparta tiene que
     * poder aplicarse a mano el dia que alguien decida que hacer con el.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void apartar(EventoDeIdentidadRecibido evento, String motivo) {
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
    }

    /** Cuantos eventos hay apartados en la municipalidad del contexto. */
    @Transactional(readOnly = true)
    public long apartados() {
        return jdbc().sql("SELECT count(*) FROM identidad_evento_muerto")
                .query(Long.class)
                .single();
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

    private Aplicacion usuario(JsonNode cuerpo) {
        long identidadId = exigirId(cuerpo, Sujeto.USUARIO.campoId);
        String cuenta = exigir(cuerpo, "cuenta");
        @Nullable Long local = casarParaEscribir(Sujeto.USUARIO, identidadId, cuenta);
        String sql =
                local == null
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
                .param("cuenta", cuenta)
                .param("nombre", exigir(cuerpo, "nombre"))
                .param("correo", textoONulo(cuerpo, "correo"))
                .param("habilitado", cuerpo.path("habilitado").asBoolean(true))
                .param("desde", fechaONula(cuerpo, "vigenciaDesde"))
                .param("hasta", fechaONula(cuerpo, "vigenciaHasta"))
                .param("local", local)
                .update();
        return Aplicacion.APLICADO;
    }

    private Aplicacion grupo(JsonNode cuerpo) {
        long identidadId = exigirId(cuerpo, Sujeto.GRUPO.campoId);
        String nombre = exigir(cuerpo, "nombre");
        @Nullable Long local = casarParaEscribir(Sujeto.GRUPO, identidadId, nombre);
        String sql =
                local == null
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
                .param("nombre", nombre)
                .param("descripcion", textoONulo(cuerpo, "descripcion"))
                .param("habilitado", cuerpo.path("habilitado").asBoolean(true))
                .param("desde", fechaONula(cuerpo, "vigenciaDesde"))
                .param("hasta", fechaONula(cuerpo, "vigenciaHasta"))
                .param("local", local)
                .update();
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
        USUARIO("usuario", "cuenta", "usuarioId", "la cuenta"),
        GRUPO("grupo", "nombre", "grupoId", "el grupo");

        final String tabla;
        final String clave;
        final String campoId;
        final String articulado;

        Sujeto(String tabla, String clave, String campoId, String articulado) {
            this.tabla = tabla;
            this.clave = clave;
            this.campoId = campoId;
            this.articulado = articulado;
        }
    }

    /** Una fila local candidata: su id de aqui, el sujeto de {@code identidad} y su clave. */
    private record Candidata(long id, @Nullable Long identidadId, String clave) {}

    /**
     * La fila que un alta o una modificacion tiene que escribir, o {@code null} si es nueva.
     *
     * <ol>
     *   <li>La que ya lleva ese sujeto de {@code identidad}: es ella aunque la clave haya cambiado
     *       —eso es un renombrado, y se le escribe la clave nueva—.
     *   <li>Si ninguna lo lleva, la que tiene esa clave natural <b>y ningun sujeto</b>: una fila de
     *       antes de V5, que se adopta estampandole el id.
     *   <li>Si ninguna de las dos, es nueva.
     * </ol>
     *
     * <p>Y dos choques que no se aplican nunca ({@link NoSePuedeAplicar}): la clave nueva ya la
     * tiene OTRA fila, o la tiene una fila que es de otro sujeto. En los dos esta copia tendria que
     * decidir cual de las dos filas vale y mover miembros y permisos de una a otra, y esta clase
     * <b>no decide nada</b>: se aparta con su motivo y se avisa, que es lo que permite resolverlo a
     * mano sin que se pierda el evento.
     */
    private @Nullable Long casarParaEscribir(Sujeto sujeto, long identidadId, String clave) {
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
                throw new NoSePuedeAplicar(
                        "`identidad` dice que "
                                + sujeto.articulado
                                + " "
                                + identidadId
                                + " se llama ahora «"
                                + clave
                                + "», y en esta copia ese nombre ya lo tiene otra fila, "
                                + deQuien(porClave)
                                + ". Esta copia no decide cual de las dos vale ni mueve miembros"
                                + " ni permisos de una a otra: hay que resolverlo a mano y volver"
                                + " a aplicar este evento");
            }
            return porId.id();
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
            return porClave.id();
        }
        return null;
    }

    private static String deQuien(Candidata fila) {
        return fila.identidadId() == null
                ? "sin sujeto de `identidad` (una huerfana: de antes de V5, o la que dejo un"
                        + " renombrado antes de #111)"
                : "del sujeto " + fila.identidadId() + " de `identidad`";
    }

    /**
     * La fila de aqui a la que se refiere una afiliacion o un permiso, o {@code null} si todavia no
     * esta: la que lleva ese sujeto de {@code identidad} y, si ninguna, la que tiene esa clave
     * natural y ningun sujeto (una de antes de V5, que se adoptara con su propio evento). Una fila
     * con esa clave pero de OTRO sujeto no vale: el que se nombra no ha llegado.
     */
    private @Nullable Long casarParaNombrar(Sujeto sujeto, long identidadId, String clave) {
        return jdbc().sql(
                        "SELECT id FROM "
                                + sujeto.tabla
                                + " WHERE municipalidad_id = "
                                + MUNICIPALIDAD_ACTUAL
                                + " AND (identidad_sujeto_id = :identidadId OR"
                                + " (identidad_sujeto_id IS NULL AND "
                                + sujeto.clave
                                + " = :clave))"
                                + " ORDER BY identidad_sujeto_id IS NULL LIMIT 1")
                .param("identidadId", identidadId)
                .param("clave", clave)
                .query(Long.class)
                .optional()
                .orElse(null);
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

    /** Ciertamente irrecuperable: mandarlo otra vez da lo mismo. Se aparta y se avisa. */
    public static final class NoSePuedeAplicar extends RuntimeException {
        @java.io.Serial private static final long serialVersionUID = 1L;

        public NoSePuedeAplicar(String mensaje) {
            super(mensaje);
        }

        public NoSePuedeAplicar(String mensaje, Throwable causa) {
            super(mensaje, causa);
        }
    }

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
