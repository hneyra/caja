-- ============================================================================
--  V4 — LAS PARTICIONES DE `auditoria` QUE FALTABAN, DE 2028 A 2035 (#113)
--
--  `V1__baseline.sql:487-488` creo solo `auditoria_2026` y `auditoria_2027`
--  -las unicas que existian el dia de la extraccion (P5D)-, sin particion
--  `DEFAULT`, y ninguna migracion ni proceso creaba las que seguian. Desde el
--  1-ene-2028 -desde el 31-dic-2027 a las 19:00 de Lima, con el reloj en UTC,
--  issue aparte- toda escritura auditada -anular, cerrar, implantar, sembrar
--  el catalogo- habria fallado con «no partition of relation "auditoria"
--  found».
--
--  SIN PARTICION `DEFAULT`, A PROPOSITO. Una `DEFAULT` esconderia el hueco: un
--  ejercicio sin particion propia caeria ahi sin ruido, mezclando filas de
--  anios distintos en la misma particion -y la unica clave de particion es
--  justamente `ejercicio`-. Que la escritura falle, y falle con un mensaje
--  que nombra la relacion, es la senal correcta de que hace falta la
--  migracion siguiente; `CoberturaFuturaDeParticionesDeAuditoriaTest` -en
--  `verificarAislamiento`- adelanta esa senal dos anios para que nunca sea el
--  1-ene quien lo descubra.
--
--  OCHO PARTICIONES DE UNA VEZ, y no una: dejan cobertura hasta 2035 -hoy,
--  2026-09-24, mas nueve anios-, que es margen de sobra para que la guarda de
--  cobertura avise con antelacion en vez de que cada anio exija su propia
--  migracion.
--
--  RLS y politica IDENTICAS a las de `auditoria_2026`/`auditoria_2027` (V1,
--  lineas 670-680): una particion NO HEREDA `relrowsecurity` del padre
--  (DAT-01 §0, hallazgo 2), asi que cada una la declara por su cuenta.
--
--  SIN `GRANT` NUEVO. `kamayuk_app` no recibe privilegios sobre ninguna
--  particion -se los da el padre, V1 §7-, y eso ya alcanza para estas ocho:
--  lo comprueba AislamientoMultiTenantTest$Particiones, generico sobre todo
--  lo que el catalogo marque como particion.
-- ============================================================================

CREATE TABLE auditoria_2028 PARTITION OF auditoria FOR VALUES IN ('2028');
CREATE TABLE auditoria_2029 PARTITION OF auditoria FOR VALUES IN ('2029');
CREATE TABLE auditoria_2030 PARTITION OF auditoria FOR VALUES IN ('2030');
CREATE TABLE auditoria_2031 PARTITION OF auditoria FOR VALUES IN ('2031');
CREATE TABLE auditoria_2032 PARTITION OF auditoria FOR VALUES IN ('2032');
CREATE TABLE auditoria_2033 PARTITION OF auditoria FOR VALUES IN ('2033');
CREATE TABLE auditoria_2034 PARTITION OF auditoria FOR VALUES IN ('2034');
CREATE TABLE auditoria_2035 PARTITION OF auditoria FOR VALUES IN ('2035');

ALTER TABLE auditoria_2028 ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria_2028 FORCE ROW LEVEL SECURITY;
CREATE POLICY auditoria_2028_tenant ON auditoria_2028 FOR ALL TO PUBLIC
    USING ((municipalidad_id = (current_setting('app.municipalidad_id'::text))::bigint))
    WITH CHECK ((municipalidad_id = (current_setting('app.municipalidad_id'::text))::bigint));
ALTER TABLE auditoria_2029 ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria_2029 FORCE ROW LEVEL SECURITY;
CREATE POLICY auditoria_2029_tenant ON auditoria_2029 FOR ALL TO PUBLIC
    USING ((municipalidad_id = (current_setting('app.municipalidad_id'::text))::bigint))
    WITH CHECK ((municipalidad_id = (current_setting('app.municipalidad_id'::text))::bigint));
ALTER TABLE auditoria_2030 ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria_2030 FORCE ROW LEVEL SECURITY;
CREATE POLICY auditoria_2030_tenant ON auditoria_2030 FOR ALL TO PUBLIC
    USING ((municipalidad_id = (current_setting('app.municipalidad_id'::text))::bigint))
    WITH CHECK ((municipalidad_id = (current_setting('app.municipalidad_id'::text))::bigint));
ALTER TABLE auditoria_2031 ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria_2031 FORCE ROW LEVEL SECURITY;
CREATE POLICY auditoria_2031_tenant ON auditoria_2031 FOR ALL TO PUBLIC
    USING ((municipalidad_id = (current_setting('app.municipalidad_id'::text))::bigint))
    WITH CHECK ((municipalidad_id = (current_setting('app.municipalidad_id'::text))::bigint));
ALTER TABLE auditoria_2032 ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria_2032 FORCE ROW LEVEL SECURITY;
CREATE POLICY auditoria_2032_tenant ON auditoria_2032 FOR ALL TO PUBLIC
    USING ((municipalidad_id = (current_setting('app.municipalidad_id'::text))::bigint))
    WITH CHECK ((municipalidad_id = (current_setting('app.municipalidad_id'::text))::bigint));
ALTER TABLE auditoria_2033 ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria_2033 FORCE ROW LEVEL SECURITY;
CREATE POLICY auditoria_2033_tenant ON auditoria_2033 FOR ALL TO PUBLIC
    USING ((municipalidad_id = (current_setting('app.municipalidad_id'::text))::bigint))
    WITH CHECK ((municipalidad_id = (current_setting('app.municipalidad_id'::text))::bigint));
ALTER TABLE auditoria_2034 ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria_2034 FORCE ROW LEVEL SECURITY;
CREATE POLICY auditoria_2034_tenant ON auditoria_2034 FOR ALL TO PUBLIC
    USING ((municipalidad_id = (current_setting('app.municipalidad_id'::text))::bigint))
    WITH CHECK ((municipalidad_id = (current_setting('app.municipalidad_id'::text))::bigint));
ALTER TABLE auditoria_2035 ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria_2035 FORCE ROW LEVEL SECURITY;
CREATE POLICY auditoria_2035_tenant ON auditoria_2035 FOR ALL TO PUBLIC
    USING ((municipalidad_id = (current_setting('app.municipalidad_id'::text))::bigint))
    WITH CHECK ((municipalidad_id = (current_setting('app.municipalidad_id'::text))::bigint));
