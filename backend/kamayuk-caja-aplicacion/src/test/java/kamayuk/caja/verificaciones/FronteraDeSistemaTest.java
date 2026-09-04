package kamayuk.caja.verificaciones;

import kamayuk.comun.verificaciones.FronteraDeSistemaTestBase;

/**
 * NINGUN_SQL_CRUZA_LA_FRONTERA_DE_SISTEMA, aplicada a {@code caja} ya separada.
 *
 * <p>En el monolito esta prueba delataba los cruces <b>antes</b> del corte, con las 132 tablas
 * todavia en la misma base. Aqui el corte ya paso y lo que mide es lo contrario: que no vuelva a
 * aparecer ninguno. El reparto de {@link ConfiguracionDeCaja} solo nombra las tablas de este
 * esquema, asi que una consulta a una tabla ajena no es un cruce consentido — es un {@code SELECT}
 * contra una tabla que esta base <b>no tiene</b>, y aqui se ve antes de fallar en ejecucion.
 *
 * <p>Por eso {@link CrucesConsentidosDelSgtm} esta vacia, y su javadoc dice que cerro el ultimo que
 * este sistema heredaba.
 */
class FronteraDeSistemaTest extends FronteraDeSistemaTestBase {}
