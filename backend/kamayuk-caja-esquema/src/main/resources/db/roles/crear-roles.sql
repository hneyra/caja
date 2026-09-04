-- ============================================================================
--  CAJA — Roles de base de datos (ARQ-03 §4)
--
--  NO es una migracion de Flyway. Se ejecuta ANTES de la primera migracion, con
--  una conexion de superusuario, porque:
--    - las politicas RLS del baseline nombran roles y estos deben existir;
--    - sgtm_owner necesita CREATE sobre el esquema para poder migrar;
--    - un rol no puede crearse a si mismo.
--
--  Idempotente: se puede volver a ejecutar sobre una base ya provisionada.
--
--  Las CLAVES NO ESTAN AQUI. Los roles se crean sin LOGIN; quien provisiona el
--  ambiente asigna la clave con `ALTER ROLE ... LOGIN PASSWORD ...` desde su
--  gestor de secretos. La prueba de aislamiento hace lo mismo con claves
--  generadas al vuelo.
--
--  NOSUPERUSER y NOBYPASSRLS son explicitos y no decorativos: un superusuario
--  omite RLS incluso con FORCE ROW LEVEL SECURITY (DAT-01 §0, hallazgo 1).
--
--  ----------------------------------------------------------------------------
--  SON TRES ROLES Y NO CUATRO, Y CERO EXTENSIONES (P5D)
--  ----------------------------------------------------------------------------
--
--  El archivo que P3 copio del monolito declaraba `rol_carga_parametros` y cuatro
--  extensiones. Ninguno de los cinco lo usa este sistema, y se comprobo mirando el
--  baseline entero:
--
--    rol_carga_parametros  no recibe UN SOLO `GRANT` en las 23 tablas. Es el rol
--                          con que `normativa` publica valores normativos a doble
--                          firma, y caja no publica ninguno: no sabe que es un
--                          tributo (ADR-0026 §1). Un rol que existe y no puede
--                          hacer nada es peor que uno que no existe: el dia que
--                          alguien le de una clave, tendra credencial sobre la base
--                          del dinero para nada.
--    pg_trgm, unaccent     busqueda por aproximacion del PADRON de contribuyentes
--                          (RF-014). El padron es de `rentas`.
--    postgis               la geometria del predio (ADR-0021). Es de `catastro`, y
--                          ademas NO es trusted: exige superusuario en cada
--                          ambiente donde se despliegue esta base.
--    btree_gist            `EXCLUDE USING gist` de las vigencias del predio (#669).
--                          De `catastro`.
--
--  Lo que las obligaba era la funcion `nombre_normalizado(text)`, que el generador
--  del baseline arrastro de otro sistema y P5D retiro: su cuerpo llama a
--  `unaccent(...)`, asi que sin la extension el `CREATE FUNCTION` mata la migracion.
--  Medido: con el baseline corregido, `V1` aplica entera sobre una base SIN NINGUNA
--  extension instalada.
--
--  Esto no es una preferencia de limpieza: es que la caja tiene que poder correr en
--  el motor mas simple que exista. Es lo unico que hace creible «con `rentas`
--  apagado la ventanilla sigue cobrando» — una ventanilla cuya base necesita PostGIS
--  no se levanta en cualquier sitio.
-- ============================================================================

DO $roles$
DECLARE
    r text;
BEGIN
    FOREACH r IN ARRAY ARRAY['sgtm_owner', 'sgtm_app', 'sgtm_readonly']
    LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            EXECUTE format('CREATE ROLE %I NOLOGIN', r);
        END IF;
        EXECUTE format(
            'ALTER ROLE %I NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION', r);
    END LOOP;
END
$roles$;

-- Solo sgtm_owner hace DDL. La aplicacion nunca.
GRANT USAGE, CREATE ON SCHEMA public TO sgtm_owner;
GRANT USAGE           ON SCHEMA public TO sgtm_app, sgtm_readonly;

-- Sin GRANT de pertenencia entre roles: sgtm_owner concede privilegios sobre sus
-- propias tablas sin necesitarla, y ser miembro de sgtm_app le permitiria un
-- SET ROLE que borra la separacion.
