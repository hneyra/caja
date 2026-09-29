package kamayuk.caja.seguridad.aplicacion;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import kamayuk.caja.autorizacion.Privilegio;
import kamayuk.caja.seguridad.EventoDeIdentidadRecibido;
import kamayuk.caja.seguridad.FuenteDeEventosDeIdentidad;
import org.jspecify.annotations.Nullable;

/**
 * El buzon de {@code identidad} de mentira, sirviendo <b>la corriente de eventos de verdad</b>: la
 * que deja una implantacion de {@code identidad}, en su orden y con sus cuerpos.
 *
 * <h2>Por que la corriente se copia y no se inventa</h2>
 *
 * <p>Lo que la etapa 5 afirma es que el administrador llega <b>por el buzon</b>, y esa afirmacion
 * vale exactamente lo que valga el doble: un doble que sirviera lo que a esta copia le viene bien
 * mediria que el aplicador sabe leer lo que el aplicador espera. Los cuerpos de aqui estan copiados
 * campo a campo de {@code HechoDeIdentidad} del clon de {@code identidad} —{@code deUsuario},
 * {@code deGrupo}, {@code deMiembro} y {@code dePermiso}, en el orden en que ese archivo declara
 * sus campos—, y el orden de los hechos, de su {@code ImplantarMunicipalidad}: grupo de
 * administracion, administrador, su afiliacion, <b>primero</b> el permiso sobre la opcion que
 * gobierna esa misma pantalla y despues el resto del catalogo unido, y por ultimo el grupo del
 * buzon con sus cuatro cuentas de servicio.
 *
 * <h2>Y {@code quedan} se cuenta como lo cuenta el emisor</h2>
 *
 * <p><b>Con la pagina dentro</b>: {@code EventosController} de {@code identidad} contesta «cuantos
 * le faltan en total, contando los de esta pagina». Es la trampa que la etapa 4 encontro en tres de
 * los cuatro consumidores —sus dobles restaban la pagina, o sea mentian justo sobre el campo que el
 * registro de la vuelta publica— y por eso aqui se copia y se afirma en una prueba propia.
 *
 * <p>Un evento acusado no se vuelve a servir; uno que no se acusa vuelve en cada vuelta. Es el
 * contrato del buzon: al menos una vez, y quien deduplica es el receptor.
 */
final class CorrienteDeIdentidad implements FuenteDeEventosDeIdentidad {

    /** Los cuatro que consumen el buzon; {@code identidad} no se consume a si mismo. */
    static final List<String> CONSUMIDORES = List.of("caja", "catastro", "normativa", "rentas");

    static final String GRUPO_DE_ADMINISTRACION = "Administracion del sistema";
    static final String GRUPO_DE_CONSUMIDORES = "Consumidores del buzon";
    static final String QUIEN = "implantacion";

    /**
     * Los ids de {@code identidad} del administrador y de su grupo en {@link #deUnaImplantacion}.
     * Un evento posterior que hable de ellos tiene que llevar ESTOS: la copia casa por el sujeto
     * (#111), y con otro id seria otra cuenta que se llama igual.
     */
    static final long ADMINISTRADOR_ID = 1;

    static final long GRUPO_DE_ADMINISTRACION_ID = 1;

    private final List<EventoDeIdentidadRecibido> corriente;
    private final Set<UUID> acusados = new HashSet<>();

    /** Cuantas veces se pidio una pagina. Una vuelta que no progresa se ve en esta cuenta. */
    int lecturas;

    /** Cuantas veces se acuso. */
    int acuses;

    private CorrienteDeIdentidad(List<EventoDeIdentidadRecibido> corriente) {
        this.corriente = List.copyOf(corriente);
    }

    /**
     * La corriente vacia: es lo que sirve {@code identidad} a una municipalidad que no implanto.
     */
    static CorrienteDeIdentidad sinNada() {
        return new CorrienteDeIdentidad(List.of());
    }

    /** Solo el alta del administrador y su grupo: llego su ficha y no su matriz de permisos. */
    static CorrienteDeIdentidad soloElAlta(String administrador, Instant creadoEn) {
        List<EventoDeIdentidadRecibido> eventos = new ArrayList<>();
        eventos.add(grupo(1, 1, GRUPO_DE_ADMINISTRACION, creadoEn));
        eventos.add(usuario(2, 1, administrador, "Administrador del Sistema", creadoEn));
        eventos.add(miembro(3, 1, GRUPO_DE_ADMINISTRACION, 1, administrador, creadoEn));
        return new CorrienteDeIdentidad(eventos);
    }

    /**
     * Lo que una implantacion de {@code identidad} deja en el buzon de esta caja.
     *
     * @param opcionesDeCaja los codigos del catalogo de ESTE sistema, que el administrador tiene
     *     que acabar pudiendo abrir
     */
    static CorrienteDeIdentidad deUnaImplantacion(
            String ubigeo, String administrador, List<String> opcionesDeCaja, Instant creadoEn) {
        List<EventoDeIdentidadRecibido> eventos = new ArrayList<>();
        long secuencia = 0;

        // 1. El grupo de administracion, el administrador y su afiliacion.
        eventos.add(grupo(++secuencia, 1, GRUPO_DE_ADMINISTRACION, creadoEn));
        eventos.add(usuario(++secuencia, 1, administrador, "Administrador del Sistema", creadoEn));
        eventos.add(miembro(++secuencia, 1, GRUPO_DE_ADMINISTRACION, 1, administrador, creadoEn));

        // 2. Los permisos del grupo, y PRIMERO el de la pantalla que los gobierna, que es de
        //    `identidad` y aqui es ajeno.
        eventos.add(
                permiso(
                        ++secuencia,
                        1,
                        GRUPO_DE_ADMINISTRACION,
                        "identidad",
                        "permisos",
                        creadoEn));
        for (String codigo : opcionesDeCaja) {
            eventos.add(permiso(++secuencia, 1, GRUPO_DE_ADMINISTRACION, "caja", codigo, creadoEn));
        }
        // 3. Y los del resto del catalogo unido, que son de otros sistemas: en una implantacion de
        //    verdad son la inmensa mayoria —154 de las 161 opciones no son de esta caja—.
        eventos.add(
                permiso(
                        ++secuencia,
                        1,
                        GRUPO_DE_ADMINISTRACION,
                        "catastro",
                        "consulta_fichas",
                        creadoEn));
        eventos.add(
                permiso(
                        ++secuencia,
                        1,
                        GRUPO_DE_ADMINISTRACION,
                        "normativa",
                        "parametros",
                        creadoEn));
        eventos.add(
                permiso(
                        ++secuencia,
                        1,
                        GRUPO_DE_ADMINISTRACION,
                        "rentas",
                        "contribuyentes",
                        creadoEn));

        // 4. El grupo del buzon, su unica opcion —de `identidad`, tambien ajena— y las cuatro
        //    cuentas de servicio con sus cuatro afiliaciones (etapa 4 de `identidad`).
        eventos.add(grupo(++secuencia, 2, GRUPO_DE_CONSUMIDORES, creadoEn));
        eventos.add(
                permiso(++secuencia, 2, GRUPO_DE_CONSUMIDORES, "identidad", "eventos", creadoEn));
        long usuarioId = 1;
        for (String sistema : CONSUMIDORES) {
            String cuenta = "service-account-kamayuk-" + sistema + "-servicio-" + ubigeo;
            eventos.add(
                    usuario(
                            ++secuencia,
                            ++usuarioId,
                            cuenta,
                            "Cuenta de servicio de " + sistema,
                            creadoEn));
        }
        usuarioId = 1;
        for (String sistema : CONSUMIDORES) {
            String cuenta = "service-account-kamayuk-" + sistema + "-servicio-" + ubigeo;
            eventos.add(
                    miembro(++secuencia, 2, GRUPO_DE_CONSUMIDORES, ++usuarioId, cuenta, creadoEn));
        }
        return new CorrienteDeIdentidad(eventos);
    }

    /**
     * Lo que la municipalidad hace DESPUES en {@code identidad} con su administracion (#138):
     * inhabilitar una cuenta, dejarla vencer, darle una excepcion, desafiliarla o dar de alta a
     * otra. Son los mismos cuerpos que {@code HechoDeIdentidad} compone para esos actos.
     *
     * <p>Se sirven en una corriente <b>aparte</b>, como los sirve el emisor: lo de la implantacion
     * ya esta acusado y no vuelve.
     */
    static Despues despues(Instant cuando) {
        return new Despues(cuando);
    }

    /** Los actos de la administracion de {@code identidad}, en el orden en que se hacen. */
    static final class Despues {

        private final List<EventoDeIdentidadRecibido> eventos = new ArrayList<>();
        private final Instant cuando;

        /** Por encima de cualquier corriente de implantacion, como en el emisor. */
        private long secuencia = 1000;

        private Despues(Instant cuando) {
            this.cuando = cuando;
        }

        /** {@code inhabilitarUsuario}: la cuenta sigue en la copia, y el guardia le niega todo. */
        Despues inhabilita(long usuarioId, String cuenta) {
            eventos.add(
                    usuario(
                            ++secuencia,
                            "USUARIO_MODIFICADO",
                            usuarioId,
                            cuenta,
                            "Administrador del Sistema",
                            false,
                            null,
                            cuando));
            return this;
        }

        /** {@code PUT …/vigencia}: la cuenta concede hasta {@code hasta}, inclusive. */
        Despues leVence(long usuarioId, String cuenta, LocalDate hasta) {
            eventos.add(
                    usuario(
                            ++secuencia,
                            "USUARIO_MODIFICADO",
                            usuarioId,
                            cuenta,
                            "Administrador del Sistema",
                            true,
                            hasta,
                            cuando));
            return this;
        }

        /** Una cuenta nueva, afiliada a un grupo que la copia ya tiene. */
        Despues daDeAltaYAfilia(long usuarioId, String cuenta, long grupoId, String grupo) {
            daDeAlta(usuarioId, cuenta);
            eventos.add(miembro(++secuencia, grupoId, grupo, usuarioId, cuenta, true, cuando));
            return this;
        }

        /** Una cuenta nueva, sin grupo: lo que pueda se lo daran sus excepciones. */
        Despues daDeAlta(long usuarioId, String cuenta) {
            eventos.add(
                    usuario(
                            ++secuencia,
                            "USUARIO_DADO_DE_ALTA",
                            usuarioId,
                            cuenta,
                            "Cuenta nominal " + cuenta,
                            true,
                            null,
                            cuando));
            return this;
        }

        /**
         * Una excepcion de la cuenta sobre una opcion de {@code caja}: concede los siete
         * privilegios MENOS {@code niega}. Por la precedencia del guardia, en esa opcion sustituye
         * a sus grupos — que es como se separan funciones sin sacar a nadie del grupo.
         */
        Despues fijaUnaExcepcion(long usuarioId, String cuenta, String codigo, Privilegio niega) {
            eventos.add(
                    permiso(
                            ++secuencia,
                            "USUARIO",
                            usuarioId,
                            cuenta,
                            "caja",
                            codigo,
                            niega,
                            cuando));
            return this;
        }

        /** {@code MIEMBRO_DESAFILIADO}: la pertenencia queda, inactiva. */
        Despues desafilia(long grupoId, String grupo, long usuarioId, String cuenta) {
            eventos.add(miembro(++secuencia, grupoId, grupo, usuarioId, cuenta, false, cuando));
            return this;
        }

        CorrienteDeIdentidad corriente() {
            return new CorrienteDeIdentidad(eventos);
        }
    }

    /** Cuantos eventos trae la corriente entera. */
    int total() {
        return corriente.size();
    }

    @Override
    public Lote pendientes(int limite) {
        lecturas++;
        List<EventoDeIdentidadRecibido> pendientes = new ArrayList<>();
        for (EventoDeIdentidadRecibido evento : corriente) {
            if (!acusados.contains(evento.eventoId())) {
                pendientes.add(evento);
            }
        }
        List<EventoDeIdentidadRecibido> pagina =
                pendientes.subList(0, Math.min(limite, pendientes.size()));
        // `quedan` CON la pagina dentro, que es lo que el emisor publica.
        return new Lote(List.copyOf(pagina), pendientes.size());
    }

    @Override
    public Acuse acusar(List<UUID> eventoIds) {
        acuses++;
        int escritos = 0;
        for (UUID id : eventoIds) {
            if (acusados.add(id)) {
                escritos++;
            }
        }
        long quedan = corriente.stream().filter(e -> !acusados.contains(e.eventoId())).count();
        return new Acuse(eventoIds.size(), escritos, quedan);
    }

    // ------------------------------------------------------------------
    //  Los cuerpos, campo a campo como los compone `HechoDeIdentidad`.
    // ------------------------------------------------------------------

    private static EventoDeIdentidadRecibido grupo(
            long secuencia, long grupoId, String nombre, Instant creadoEn) {
        String cuerpo =
                "{\"grupoId\":"
                        + grupoId
                        + ",\"nombre\":\""
                        + nombre
                        + "\",\"descripcion\":\"Creado por la implantacion\",\"habilitado\":true,"
                        + "\"vigenciaDesde\":null,\"vigenciaHasta\":null}";
        return evento(secuencia, "GRUPO_DADO_DE_ALTA", grupoId, cuerpo, creadoEn);
    }

    private static EventoDeIdentidadRecibido usuario(
            long secuencia, long usuarioId, String cuenta, String nombre, Instant creadoEn) {
        return usuario(
                secuencia, "USUARIO_DADO_DE_ALTA", usuarioId, cuenta, nombre, true, null, creadoEn);
    }

    private static EventoDeIdentidadRecibido usuario(
            long secuencia,
            String tipo,
            long usuarioId,
            String cuenta,
            String nombre,
            boolean habilitado,
            @Nullable LocalDate vigenciaHasta,
            Instant creadoEn) {
        String cuerpo =
                "{\"usuarioId\":"
                        + usuarioId
                        + ",\"cuenta\":\""
                        + cuenta
                        + "\",\"nombre\":\""
                        + nombre
                        + "\",\"correo\":null,\"habilitado\":"
                        + habilitado
                        + ",\"vigenciaDesde\":null,\"vigenciaHasta\":"
                        + (vigenciaHasta == null ? "null" : "\"" + vigenciaHasta + "\"")
                        + "}";
        return evento(secuencia, tipo, usuarioId, cuerpo, creadoEn);
    }

    private static EventoDeIdentidadRecibido miembro(
            long secuencia,
            long grupoId,
            String grupoNombre,
            long usuarioId,
            String cuenta,
            Instant creadoEn) {
        return miembro(secuencia, grupoId, grupoNombre, usuarioId, cuenta, true, creadoEn);
    }

    private static EventoDeIdentidadRecibido miembro(
            long secuencia,
            long grupoId,
            String grupoNombre,
            long usuarioId,
            String cuenta,
            boolean activo,
            Instant creadoEn) {
        // `usuarioAlta` o `usuarioBaja`, el que corresponda y el otro nulo: como el emisor.
        String quien = "\"" + QUIEN + "\"";
        String cuerpo =
                "{\"grupoId\":"
                        + grupoId
                        + ",\"grupoNombre\":\""
                        + grupoNombre
                        + "\",\"usuarioId\":"
                        + usuarioId
                        + ",\"usuarioCuenta\":\""
                        + cuenta
                        + "\",\"activo\":"
                        + activo
                        + ",\"usuarioAlta\":"
                        + (activo ? quien : "null")
                        + ",\"usuarioBaja\":"
                        + (activo ? "null" : quien)
                        + "}";
        // El sujeto de una afiliacion es el GRUPO, como en el emisor.
        return evento(
                secuencia,
                activo ? "MIEMBRO_AFILIADO" : "MIEMBRO_DESAFILIADO",
                grupoId,
                cuerpo,
                creadoEn);
    }

    private static EventoDeIdentidadRecibido permiso(
            long secuencia,
            long grupoId,
            String grupoNombre,
            String sistema,
            String codigo,
            Instant creadoEn) {
        return permiso(secuencia, "GRUPO", grupoId, grupoNombre, sistema, codigo, null, creadoEn);
    }

    /** La matriz ENTERA, como la publica el emisor: los siete, y {@code niega} en falso. */
    private static EventoDeIdentidadRecibido permiso(
            long secuencia,
            String sujeto,
            long sujetoId,
            String sujetoNombre,
            String sistema,
            String codigo,
            @Nullable Privilegio niega,
            Instant creadoEn) {
        StringBuilder privilegios = new StringBuilder("{");
        boolean primero = true;
        for (Privilegio privilegio : Privilegio.values()) {
            if (!primero) {
                privilegios.append(',');
            }
            primero = false;
            privilegios
                    .append('"')
                    .append(privilegio.columna())
                    .append("\":")
                    .append(privilegio != niega);
        }
        privilegios.append('}');
        String cuerpo =
                "{\"sujeto\":\""
                        + sujeto
                        + "\",\"sujetoId\":"
                        + sujetoId
                        + ",\"sujetoNombre\":\""
                        + sujetoNombre
                        + "\",\"sistema\":\""
                        + sistema
                        + "\",\"codigo\":\""
                        + codigo
                        + "\",\"privilegios\":"
                        + privilegios
                        + ",\"usuarioRegistro\":\""
                        + QUIEN
                        + "\"}";
        return evento(secuencia, "PERMISO_FIJADO", sujetoId, cuerpo, creadoEn);
    }

    private static EventoDeIdentidadRecibido evento(
            long secuencia, String tipo, long sujetoId, String cuerpo, Instant creadoEn) {
        return new EventoDeIdentidadRecibido(
                UUID.randomUUID(), secuencia, tipo, sujetoId, cuerpo, "d".repeat(64), creadoEn);
    }
}
