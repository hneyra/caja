package kamayuk.caja.verificaciones;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import kamayuk.comun.verificaciones.ConfiguracionDeLasVerificaciones;

/**
 * Lo que {@code caja} declara de si mismo a las barreras de {@code comun-verificaciones}.
 *
 * <p>La descubre {@link java.util.ServiceLoader}: el descriptor esta en {@code
 * src/test/resources/META-INF/services/}. Si se borra, las barreras no corren en silencio — fallan
 * nombrando lo que falta, que es lo que este mecanismo compra frente a pasar la configuracion por
 * constructor.
 *
 * <h2>Aqui el sistema NO depende del archivo, y eso es la mitad de la separacion</h2>
 *
 * <p>En el monolito hacia falta un reparto por modulo Gradle, porque los cuatro sistemas convivian
 * y sus 132 tablas estaban en la misma base. Aqui hay <b>un</b> sistema y <b>un</b> contexto
 * acotado: todo archivo de este repositorio es de {@code caja}, y por eso {@link
 * #sistemaDelArchivo(String)} no se sobrescribe.
 *
 * <p>La consecuencia practica es {@code NINGUN_SQL_CRUZA_LA_FRONTERA_DE_SISTEMA}, y <b>hasta P5E
 * esta clase afirmaba de si misma algo que no era cierto</b>: decia que «como el reparto de tablas
 * solo nombra las de este esquema, cualquier consulta a una tabla ajena se detecta». No se detecta.
 * El escaner distingue tres casos a proposito —lo propio, lo replicado y <b>lo que nadie
 * repartio</b>— y el tercero <b>no es un cruce</b>, porque un escaner que marcara toda tabla
 * desconocida gritaria en cada archivo y dejaria de leerse (#437). Con el reparto anterior, una
 * consulta {@code FROM contribuyente JOIN predio} en {@code src/main} pasaba en VERDE; se midio.
 *
 * <p>Por eso este reparto nombra tambien las tablas de los otros tres sistemas, como ya hacian
 * {@code catastro} y {@code normativa}. No son tablas de esta base —{@code caja} no las tiene— y
 * justamente por eso hay que nombrarlas: es la unica forma de que consultarlas se vea al construir
 * y no en produccion.
 */
public final class ConfiguracionDeCaja implements ConfiguracionDeLasVerificaciones {

    /**
     * Las diez tablas propias de la caja (GOB-05 §2.4), mas las dos que estreno P5D.
     *
     * <p>{@code orden_de_cobro} y {@code pago_evento} son de `V2` (ADR-0026 §1 y §3): lo que la
     * caja sabe cobrar y lo que publica cuando cobra. No estan en GOB-05 porque no existian cuando
     * se hizo el inventario del corte.
     */
    private static final Set<String> DE_CAJA =
            Set.of(
                    "area",
                    "caja",
                    "cierre_caja",
                    "cierre_turno",
                    "cierre_turno_detalle",
                    "recibo",
                    "recibo_correlativo",
                    "recibo_detalle",
                    "recibo_movimiento",
                    "tasa",
                    "orden_de_cobro",
                    "pago_evento");

    /**
     * Las tablas de los otros tres sistemas (P5E).
     *
     * <p>Copiadas del reparto de {@code catastro} y {@code normativa}, que ya las tenian. No estan
     * en esta base y no van a estarlo: se declaran para que una consulta a cualquiera de ellas se
     * vea al construir, en vez de fallar en ejecucion contra una tabla que no existe.
     */
    private static final Set<String> DE_RENTAS =
            Set.of(
                    "acta_fiscalizacion",
                    "acto_coactivo",
                    "anuncio",
                    "anuncio_correlativo",
                    "anuncio_movimiento",
                    "beneficio",
                    "certificado",
                    "certificado_correlativo",
                    "ciiu",
                    "codigo_infraccion",
                    "constancia_libre",
                    "contacto",
                    "contribuyente",
                    "convenio",
                    "convenio_correlativo",
                    "convenio_cuota",
                    "convenio_deuda",
                    "convenio_movimiento",
                    "corrida_predial",
                    "corrida_predial_observado",
                    "costa_obligacion",
                    "costa_procesal",
                    "cuenta_corriente_asiento",
                    "cuenta_corriente_asiento_2026",
                    "cuenta_corriente_asiento_2027",
                    "declaracion_jurada",
                    "descargo",
                    "determinacion",
                    "determinacion_2026",
                    "determinacion_2027",
                    "determinacion_arbitrio",
                    "determinacion_arbitrio_2026",
                    "determinacion_arbitrio_2027",
                    "determinacion_predio_detalle",
                    "determinacion_predio_detalle_2026",
                    "determinacion_predio_detalle_2027",
                    "dj_correlativo",
                    "domicilio",
                    "edificacion_correlativo",
                    "edificacion_estructura",
                    "edificacion_movimiento",
                    "edificacion_profesional",
                    "edificacion_proyecto",
                    "edificacion_requisito",
                    "edificacion_terreno",
                    "edificacion_vigencia",
                    "espectaculo",
                    "expediente_coactivo",
                    "expediente_correlativo",
                    "expediente_movimiento",
                    "expediente_valor",
                    "internamiento",
                    "internamiento_movimiento",
                    "licencia_correlativo",
                    "licencia_duplicado",
                    "licencia_edificacion",
                    "licencia_funcionamiento",
                    "licencia_giro",
                    "licencia_movimiento",
                    "liquidacion_correlativo",
                    "liquidacion_costas",
                    "liquidacion_costas_correlativo",
                    "liquidacion_detalle",
                    "liquidacion_fiscalizacion",
                    "liquidacion_movimiento",
                    "notificacion",
                    "notificacion_administrativa",
                    "papeleta",
                    "papeleta_cambio_numero",
                    "papeleta_masivo",
                    "papeleta_masivo_item",
                    "prescripcion",
                    "prescripcion_ejercicio",
                    "prescripcion_hecho",
                    "programa_fiscalizacion",
                    "programa_muestra",
                    "resolucion_determinacion",
                    "resolucion_gerencia",
                    "responsable_solidario",
                    "saldo_proyectado",
                    "transferencia",
                    "valor",
                    "valor_correlativo",
                    "valor_detalle",
                    "valor_masivo",
                    "valor_masivo_item",
                    "valor_movimiento",
                    "vehiculo");

    private static final Set<String> DE_CATASTRO =
            Set.of(
                    "actividad_economica",
                    "arancel",
                    "bien_comun",
                    "colindante_rural",
                    "construccion",
                    "ficha_catastral",
                    // V6: el frente del predio. Se nombra aunque este sistema no la tenga —y por
                    // eso
                    // mismo—: sin la entrada, el reparto la da por «replicada» y el escaner de la
                    // regla 11 DEJA DE MIRAR un cruce contra ella, en verde (la leccion de R-N).
                    "frente_predio",
                    "inquilino",
                    "manzana",
                    "otra_instalacion",
                    "participacion_comun",
                    "predio",
                    "sector",
                    "tierra_rural",
                    "titularidad",
                    "via",
                    // Las CATORCE que `catastro` ha creado desde T-0 y que aqui faltaban. Se
                    // nombran
                    // aunque este sistema no las tenga —y por eso mismo—: el reparto se consulta
                    // con `getOrDefault(tabla, SISTEMA_REPLICADO)` y «replicado» significa «no esta
                    // a ningun lado de la frontera», asi que una tabla que FALTA no da un cruce:
                    // DEJA DE REVISARSE, en verde (la leccion de R-N, y lo que el censo de
                    // `catastro#7` midio). Nombrar de mas no cuesta nada —ningun archivo de este
                    // repositorio las menciona— y es lo que hace que el cruce, si llega, se vea.
                    //
                    // V5 el buzon de salida; V7 (#4) la zonificacion; V8 (#5) la gestion del
                    // riesgo; V9 (#6, ADR-0035) el hallazgo catastral; V10 (#7) la derivacion de
                    // frentes. `acta` es la de CATASTRO —el acta del hallazgo—: la tributaria de
                    // `rentas` se llama `acta_fiscalizacion` y sigue siendo suya.
                    "acta",
                    "campania",
                    "candidato",
                    "catastro_evento",
                    "evidencia",
                    "faja_marginal",
                    "frente_derivacion",
                    "habilitacion_urbana",
                    "hallazgo",
                    "itse",
                    "parametro_urbanistico",
                    "seccion_via",
                    "zona_riesgo",
                    "zonificacion");

    private static final Set<String> DE_NORMATIVA =
            Set.of(
                    "conjunto_parametro_detalle",
                    "conjunto_parametros",
                    "depreciacion",
                    "parametro_tributario",
                    "valor_referencial_vehiculo",
                    "valor_unitario_edificacion");

    /** Transversales (§2.5) y las siete de seguridad (§2.6): se replican en los cuatro. */
    private static final Set<String> REPLICADAS =
            Set.of(
                    "acceso",
                    "auditoria",
                    "auditoria_2026",
                    "auditoria_2027",
                    "documento_emitido",
                    "grupo",
                    "miembro",
                    "modulo_sistema",
                    "municipalidad",
                    "permiso",
                    "respaldo",
                    "sesion",
                    "usuario");

    @Override
    public String paqueteRaiz() {
        return "kamayuk.caja";
    }

    @Override
    public String sistema() {
        return "caja";
    }

    /** La raiz de la API de este sistema (ADR-0030): {@link kamayuk.caja.web.Api#RAIZ}. */
    @Override
    public String raizDeLaApi() {
        return kamayuk.caja.web.Api.RAIZ;
    }

    @Override
    public Map<String, String> sistemaDeCadaTabla() {
        Map<String, String> reparto = new HashMap<>();
        DE_CAJA.forEach(t -> reparto.put(t, "caja"));
        DE_RENTAS.forEach(t -> reparto.put(t, "rentas"));
        DE_CATASTRO.forEach(t -> reparto.put(t, "catastro"));
        DE_NORMATIVA.forEach(t -> reparto.put(t, "normativa"));
        REPLICADAS.forEach(t -> reparto.put(t, SISTEMA_REPLICADO));
        return Map.copyOf(reparto);
    }

    @Override
    public List<CruceConsentido> crucesConsentidos() {
        return CrucesConsentidosDelSgtm.LISTA;
    }

    @Override
    public Set<String> tablasProtegidas() {
        return TablasDelSgtm.PROTEGIDAS;
    }

    @Override
    public Set<String> tablasInmutables() {
        return TablasDelSgtm.INMUTABLES;
    }

    /**
     * Ninguna clase compone un area a mano aqui, y no puede haberla.
     *
     * <p>Un {@code area_m2} es una medida del predio: vive en {@code catastro}. Lo unico que este
     * sistema llama «area» es la <b>oficina</b> generadora de la recaudacion —{@code area.codigo},
     * {@code area.nombre}—, que es una unidad organica y no una superficie. La distincion la midio
     * #607 y por eso el dominio de tipo {@code area_m2} tampoco esta en el baseline de este sistema
     * (P5D).
     */
    @Override
    public Set<String> componenElAreaAManoConMotivo() {
        return Set.of();
    }

    /**
     * Los ambitos de ADR-0024 sin una sola clase en este sistema.
     *
     * <p>{@code caja} tiene el ambito de la <b>ventanilla</b> y ninguno de los otros: no determina,
     * no fiscaliza, no sanciona y no lleva libro. Es la lista mas larga de los cuatro sistemas, y
     * eso <b>es</b> la propiedad que ADR-0026 §1 compra: una caja que no sabe que es un tributo.
     *
     * <p>{@code tesoreria} entra aqui aunque este repositorio SEA la tesoreria, y no es una
     * contradiccion: el ambito {@code tesoreria} de ADR-0024 nombra el paquete {@code
     * kamayuk.*.tesoreria}, y aqui el contexto se llama {@code caja}. Declararlo ausente es lo
     * cierto — no hay ninguna clase en ese paquete— y ademas evita que alguien cree uno.
     */
    @Override
    public Set<String> ambitosAusentes() {
        return Set.of(
                "catastro",
                "contribuyentes",
                "fiscalizacion",
                "indicadores",
                "cuentacorriente",
                "tesoreria",
                "sanciones",
                "coactiva",
                "valores",
                "licencias",
                "parametros",
                "seguridad",
                "rentas");
    }

    @Override
    public Set<String> paquetesQueTienenQueExistir() {
        return Set.of(
                "kamayuk.caja.compartido",
                "kamayuk.caja.plataforma.tenant",
                "kamayuk.caja.dominio",
                "kamayuk.caja.nucleo.dominio");
    }

    /**
     * Escrituras sin usuario que observe (regla 10).
     *
     * <p><b>UNA, y la encontro la regla, no una revision.</b> Al escribir P5D se afirmo en este
     * mismo javadoc que la lista quedaria vacia, con el argumento de que el publicador «escribe el
     * estado de la entrega, no un dato». ArchUnit lo puso en rojo nombrando el metodo — y tiene
     * razon: la regla mira la FIRMA de un metodo transaccional que escribe, no la naturaleza de lo
     * que escribe, y esa es exactamente la propiedad que la hace util. Un argumento sobre «esto no
     * es un dato de verdad» es lo que cualquiera puede escribir sobre cualquier escritura.
     *
     * <p>Asi que entra con su motivo, que es el mismo de las cuatro entradas de `rentas` y la de
     * `catastro`: <b>no hay ningun usuario delante</b>. El publicador corre en el perfil {@code
     * batch}, recorriendo municipalidades sin peticion HTTP, y lo que marca es que un evento se
     * entrego o que se agotaron sus intentos. Pedirle una observacion obligaria a inventarla —que
     * es la mutacion que #538 midio y rechazo—.
     *
     * <p><b>Y lo que si tiene usuario, lo pide.</b> {@code ExplicarPagoSinEntregar} —la unica forma
     * de sacar un evento del estado MUERTO— exige {@link kamayuk.caja.dominio.Observacion} y ademas
     * su propia explicacion, porque ahi si hay alguien decidiendo que ese dinero no se va a
     * registrar en el sistema de origen. La diferencia entre las dos es la que esta lista tiene que
     * conservar.
     */
    @Override
    public Set<String> escriturasSinUsuarioQueObserve() {
        return Set.of(
                ".nucleo.aplicacion.EntregarEventos.entregarUno("
                        + "kamayuk.caja.nucleo.dominio.EventoDePago)");
    }

    /**
     * Cuantos archivos de prueba tiene que encontrar el escaner de aserciones.
     *
     * <p>La cifra por omision de la libreria es 100, y es la del monolito. Aqui son menos, y la
     * cifra se declara MEDIDA en vez de bajarse a un numero comodo: lo que este minimo protege es
     * que el escaner encuentre las fuentes de todos los modulos, y un cero disfrazado de «es que
     * este repositorio es pequeño» lo dejaria pasando en verde sin leer nada.
     */
    @Override
    public int minimoDePruebas() {
        return 25;
    }
}
