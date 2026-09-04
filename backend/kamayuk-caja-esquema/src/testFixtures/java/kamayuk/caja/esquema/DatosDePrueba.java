package kamayuk.caja.esquema;

import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;

/**
 * El escenario de las pruebas del esquema de {@code caja}: dos municipalidades con todo su juego.
 *
 * <h2>Por que siembra TODAS las tablas de tenant y no unas cuantas</h2>
 *
 * <p>{@code AislamientoMultiTenantTest} censa el esquema entero y exige que cada tabla con {@code
 * municipalidad_id NOT NULL} tenga RLS <b>y que la politica funcione de verdad</b>: filas propias
 * si, ajenas no. Una tabla sembrada en una sola municipalidad pasaria la mitad de la comprobacion
 * —no habria filas ajenas que ver— y la prueba diria que aisla sin haberlo comprobado.
 *
 * <p>Por eso las dos municipalidades se siembran <b>iguales</b>, con el mismo juego de filas y
 * sufijos distintos. Es lo que hace que «expected 1 but was 2» signifique una fuga y no un dato de
 * mas.
 *
 * <h2>Quien escribe cada cosa</h2>
 *
 * <p>El alta de una municipalidad la hace {@code sgtm_owner}: es implantacion, y la politica de
 * {@code municipalidad} solo deja escribir al dueno (V6). Todo lo demas lo escribe {@code
 * sgtm_app}, con su contexto de tenant fijado — que es como lo escribe la aplicacion.
 */
public final class DatosDePrueba {

    /** El ejercicio de las particiones declaradas del baseline. */
    private static final short EJERCICIO = 2026;

    private static final BigDecimal CIEN = new BigDecimal("100.00");

    /** El modelo minimo que {@code documento_emitido.datos} admite. */
    private static final String MODELO_DE_DOCUMENTO =
            "{\"titulo\":\"Documento de prueba\",\"subtitulo\":null,\"aLaFecha\":\"2026-01-01\","
                    + "\"cabecera\":[],\"tablas\":[],\"pie\":[],\"duplicado\":null}";

    private DatosDePrueba() {}

    /** El alta de una municipalidad es una operacion de implantacion: la hace el owner. */
    public static long crearMunicipalidad(BaseDeDatosDePrueba base, String ubigeo, String nombre)
            throws SQLException {
        try (Connection owner = base.conexion(BaseDeDatosDePrueba.OWNER)) {
            long id =
                    insertar(
                            owner,
                            "INSERT INTO municipalidad (ubigeo, nombre, tipo)"
                                    + " VALUES (?, ?, 'DISTRITAL') RETURNING id",
                            ubigeo,
                            nombre);
            owner.commit();
            return id;
        }
    }

    /**
     * Todo el juego de una municipalidad, escrito como la aplicacion.
     *
     * @param sufijo lo que distingue las filas de una municipalidad de las de la otra
     */
    public static void sembrarTenant(BaseDeDatosDePrueba base, long muni, String sufijo)
            throws SQLException {
        try (Connection app = base.conexion(BaseDeDatosDePrueba.APP)) {
            ContextoDeTenant.fijar(app, muni);
            sembrarSeguridad(app, muni, sufijo);
            long turnoId = sembrarVentanilla(app, muni, sufijo);
            sembrarCobranza(app, muni, sufijo, turnoId);
            app.commit();
        }
    }

    /** El area, la tasa del TUPA, la caja y su turno abierto. */
    private static long sembrarVentanilla(Connection app, long muni, String sufijo)
            throws SQLException {
        long areaId =
                insertar(
                        app,
                        "INSERT INTO area (municipalidad_id, codigo, nombre)"
                                + " VALUES (?, ?, 'Rentas') RETURNING id",
                        muni,
                        "REN-" + sufijo);
        ejecutar(
                app,
                "INSERT INTO tasa (municipalidad_id, codigo, descripcion, importe, area_id,"
                        + " partida_presupuestal, documento_fuente, vigencia_desde)"
                        + " VALUES (?, ?, 'Derecho de tramite', ?, ?, '1.3.1.1',"
                        + "         'TUPA de la prueba', ?)",
                muni,
                "TUPA-" + sufijo,
                CIEN,
                areaId,
                LocalDate.of(2026, 1, 1));
        long cajaId =
                insertar(
                        app,
                        "INSERT INTO caja (municipalidad_id, codigo, nombre, serie, area_id,"
                                + " activa) VALUES (?, ?, 'Ventanilla', ?, ?, true) RETURNING id",
                        muni,
                        "C-" + sufijo,
                        serieDe(sufijo),
                        areaId);
        return insertar(
                app,
                "INSERT INTO cierre_caja (municipalidad_id, caja_id, cajero, usuario_apertura,"
                        + " observacion, fecha, fecha_apertura)"
                        + " VALUES (?, ?, ?, 'prueba', 'apertura del turno de la prueba', ?, ?)"
                        + " RETURNING id",
                muni,
                cajaId,
                "cajero-" + sufijo,
                LocalDate.of(2026, 3, 16),
                Timestamp.from(Instant.parse("2026-03-16T13:00:00Z")));
    }

    /**
     * La orden, su recibo, su detalle, su movimiento, el cierre del turno y el evento del buzon.
     *
     * <p>El cierre del turno se escribe con su detalle y su reversion NO: {@code
     * cierre_turno_reversion_uq} admite una sola por cierre y sembrar las dos formas obligaria a
     * dos turnos. Con uno alcanza para lo que esta prueba mide, que es la politica.
     */
    private static void sembrarCobranza(Connection app, long muni, String sufijo, long turnoId)
            throws SQLException {
        long cajaId = unico(app, "SELECT id FROM caja WHERE municipalidad_id = ?", muni);
        long ordenId =
                insertar(
                        app,
                        "INSERT INTO orden_de_cobro (municipalidad_id, sistema_origen,"
                                + " referencia_externa, concepto, importe, fecha_exigibilidad,"
                                + " actualizado_a, pagador_documento, pagador_nombre, estado,"
                                + " creada_en, observacion) VALUES (?, 'rentas', ?, 'Deuda de prueba',"
                                + " ?, ?, ?, ?, 'Fulano de Tal', 'PENDIENTE', ?, 'orden de la prueba')"
                                + " RETURNING id",
                        muni,
                        "REF-" + sufijo,
                        CIEN,
                        LocalDate.of(2026, 3, 1),
                        LocalDate.of(2026, 3, 16),
                        "DNI-" + sufijo,
                        Timestamp.from(Instant.parse("2026-03-16T13:00:00Z")));
        long reciboId =
                insertar(
                        app,
                        "INSERT INTO recibo (municipalidad_id, serie, numero, caja_id, turno_id,"
                                + " cajero, pagador_documento, pagador_nombre, fecha, forma_pago,"
                                + " tipo_pago, total, actualizado_a, usuario_registro, observacion)"
                                + " VALUES (?, ?, 1, ?, ?, ?, ?, 'Fulano de Tal', ?, 'EFECTIVO',"
                                + " 'NORMAL', ?, ?, 'prueba', 'cobranza de la prueba') RETURNING id",
                        muni,
                        serieDe(sufijo),
                        cajaId,
                        turnoId,
                        "cajero-" + sufijo,
                        "DNI-" + sufijo,
                        Timestamp.from(Instant.parse("2026-03-16T14:00:00Z")),
                        CIEN,
                        LocalDate.of(2026, 3, 16));
        ejecutar(
                app,
                "UPDATE orden_de_cobro SET estado = 'PAGADA', recibo_id = ? WHERE id = ?",
                reciboId,
                ordenId);
        ejecutar(
                app,
                "INSERT INTO recibo_correlativo (municipalidad_id, serie, ultimo)"
                        + " VALUES (?, ?, 1)",
                muni,
                serieDe(sufijo));
        ejecutar(
                app,
                "INSERT INTO recibo_detalle (municipalidad_id, recibo_id, tributo, concepto,"
                        + " referencia_externa, monto, insoluto)"
                        + " VALUES (?, ?, 'RENTAS', 'Deuda de prueba', ?, ?, ?)",
                muni,
                reciboId,
                "REF-" + sufijo,
                CIEN,
                CIEN);
        ejecutar(
                app,
                "INSERT INTO recibo_movimiento (municipalidad_id, recibo_id, caja_id, turno_id,"
                        + " tipo, fecha, resumen, usuario_registro, observacion)"
                        + " VALUES (?, ?, ?, ?, 'DUPLICADO', ?, ?, 'prueba',"
                        + "         'duplicado de la prueba')",
                muni,
                reciboId,
                cajaId,
                turnoId,
                LocalDate.of(2026, 3, 16),
                "sha-" + sufijo);
        ejecutar(
                app,
                "INSERT INTO pago_evento (municipalidad_id, evento_id, tipo, sistema_destino,"
                        + " recibo_id, turno_id, cuerpo, estado, intentos, creado_en)"
                        + " VALUES (?, gen_random_uuid(), 'PAGO_REGISTRADO', 'rentas', ?, ?,"
                        + "         CAST(? AS jsonb), 'PENDIENTE', 0, ?)",
                muni,
                reciboId,
                turnoId,
                "{\"pagoId\":\"prueba\",\"sufijo\":\"" + sufijo + "\"}",
                Timestamp.from(Instant.parse("2026-03-16T14:00:01Z")));
        long cierreId =
                insertar(
                        app,
                        "INSERT INTO cierre_turno (municipalidad_id, turno_id, secuencia, tipo,"
                                + " fecha, fecha_registro, usuario_registro, observacion,"
                                + " total_cobrado, total_anulado, neto, total_declarado, diferencia,"
                                + " recibos_emitidos, recibos_anulados) VALUES (?, ?, 1, 'CIERRE', ?,"
                                + " ?, 'prueba', 'cierre de la prueba', ?, 0.00, ?, ?, 0.00, 1, 0)"
                                + " RETURNING id",
                        muni,
                        turnoId,
                        LocalDate.of(2026, 3, 16),
                        Timestamp.from(Instant.parse("2026-03-16T19:00:00Z")),
                        CIEN,
                        CIEN,
                        CIEN);
        ejecutar(
                app,
                "INSERT INTO cierre_turno_detalle (municipalidad_id, cierre_id, forma_pago,"
                        + " cobrado, anulado, neto, declarado)"
                        + " VALUES (?, ?, 'EFECTIVO', ?, 0.00, ?, ?)",
                muni,
                cierreId,
                CIEN,
                CIEN,
                CIEN);
        ejecutar(
                app,
                "INSERT INTO documento_emitido (municipalidad_id, tipo, ejercicio, numero,"
                        + " referencia, formato, fecha_emision, resumen, datos, usuario_emision,"
                        + " observacion)"
                        + " VALUES (?, 'RECIBO', ?, ?, ?, 'PDF', ?, ?, CAST(? AS jsonb), 'prueba',"
                        + "         'emision de la prueba')",
                muni,
                EJERCICIO,
                "REC-" + sufijo,
                String.valueOf(reciboId),
                LocalDate.of(2026, 3, 16),
                "sha-doc-" + sufijo + "0".repeat(50 - sufijo.length()),
                MODELO_DE_DOCUMENTO);
    }

    private static void sembrarSeguridad(Connection app, long muni, String sufijo)
            throws SQLException {
        long moduloId =
                insertar(
                        app,
                        "INSERT INTO modulo_sistema (municipalidad_id, codigo, nombre)"
                                + " VALUES (?, ?, 'Tesoreria') RETURNING id",
                        muni,
                        "MOD-" + sufijo);
        long accesoId =
                insertar(
                        app,
                        "INSERT INTO acceso (municipalidad_id, modulo_id, tipo, codigo, nombre)"
                                + " VALUES (?, ?, 'OPCION_MENU', ?, 'Caja') RETURNING id",
                        muni,
                        moduloId,
                        "caja_tributaria-" + sufijo);
        long grupoId =
                insertar(
                        app,
                        "INSERT INTO grupo (municipalidad_id, nombre, descripcion)"
                                + " VALUES (?, ?, 'Grupo de prueba') RETURNING id",
                        muni,
                        "Cajeros " + sufijo);
        long usuarioId =
                insertar(
                        app,
                        "INSERT INTO usuario (municipalidad_id, cuenta, nombre)"
                                + " VALUES (?, ?, 'Usuario de prueba') RETURNING id",
                        muni,
                        "usuario-" + sufijo);
        ejecutar(
                app,
                "INSERT INTO miembro (municipalidad_id, grupo_id, usuario_id, usuario_alta)"
                        + " VALUES (?, ?, ?, 'prueba')",
                muni,
                grupoId,
                usuarioId);
        ejecutar(
                app,
                "INSERT INTO permiso (municipalidad_id, acceso_id, grupo_id, lectura, registro,"
                        + " usuario_registro) VALUES (?, ?, ?, true, true, 'prueba')",
                muni,
                accesoId,
                grupoId);
        ejecutar(
                app,
                "INSERT INTO sesion (municipalidad_id, usuario_id, origen_equipo, origen_ip,"
                        + " ejercicio_trabajo)"
                        + " VALUES (?, ?, 'PC-PRUEBA', CAST(? AS inet), ?)",
                muni,
                usuarioId,
                "10.0.0.1",
                EJERCICIO);
        ejecutar(
                app,
                "INSERT INTO auditoria (municipalidad_id, ejercicio, tabla, clave, operacion,"
                        + " usuario_id, origen_equipo, origen_ip, observacion)"
                        + " VALUES (?, ?, 'recibo', '1', 'ALTA', 'prueba', 'PC-PRUEBA',"
                        + "         CAST(? AS inet), 'alta inicial de la prueba de aislamiento')",
                muni,
                EJERCICIO,
                "10.0.0.1");
    }

    /**
     * Una fila de tenant cualquiera de este sistema, para probar el {@code UPDATE} ajeno.
     *
     * <p>Es {@code caja} —la ventanilla— y no {@code recibo}: el recibo no admite {@code UPDATE} ni
     * para su propio dueno (V29), asi que probar con el mediria el privilegio y no la politica.
     */
    public static long cajaDe(BaseDeDatosDePrueba base, long municipalidadId) throws SQLException {
        try (Connection admin = base.conexionAdmin();
                PreparedStatement sentencia =
                        admin.prepareStatement(
                                "SELECT id FROM caja WHERE municipalidad_id = ?"
                                        + " ORDER BY id LIMIT 1")) {
            sentencia.setLong(1, municipalidadId);
            return unicoLong(sentencia);
        }
    }

    /** La serie del recibo: tres digitos, unica por municipalidad. */
    private static String serieDe(String sufijo) {
        return "00" + (sufijo.equals("A") ? "1" : "2");
    }

    private static long unico(Connection conexion, String sql, Object... valores)
            throws SQLException {
        try (PreparedStatement sentencia = conexion.prepareStatement(sql)) {
            fijar(sentencia, valores);
            return unicoLong(sentencia);
        }
    }

    private static long insertar(Connection conexion, String sql, Object... valores)
            throws SQLException {
        try (PreparedStatement sentencia = conexion.prepareStatement(sql)) {
            fijar(sentencia, valores);
            return unicoLong(sentencia);
        }
    }

    private static void ejecutar(Connection conexion, String sql, Object... valores)
            throws SQLException {
        try (PreparedStatement sentencia = conexion.prepareStatement(sql)) {
            fijar(sentencia, valores);
            sentencia.executeUpdate();
        }
    }

    private static void fijar(PreparedStatement sentencia, Object... valores) throws SQLException {
        for (int i = 0; i < valores.length; i++) {
            sentencia.setObject(i + 1, valores[i]);
        }
    }

    private static long unicoLong(PreparedStatement sentencia) throws SQLException {
        try (ResultSet resultado = sentencia.executeQuery()) {
            if (!resultado.next()) {
                throw new IllegalStateException("La sentencia no devolvio ninguna fila");
            }
            return resultado.getLong(1);
        }
    }
}
