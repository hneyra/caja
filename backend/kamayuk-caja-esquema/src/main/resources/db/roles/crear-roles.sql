-- ============================================================================
--  CAJA — Roles de base de datos (ARQ-03 §4)
--
--  NO es una migracion de Flyway. Se ejecuta ANTES de la primera migracion, con
--  una conexion de superusuario, porque:
--    - las politicas RLS del baseline nombran roles y estos deben existir;
--    - kamayuk_owner necesita CREATE sobre el esquema para poder migrar;
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
    FOREACH r IN ARRAY ARRAY['kamayuk_owner', 'kamayuk_app', 'kamayuk_readonly']
    LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            EXECUTE format('CREATE ROLE %I NOLOGIN', r);
        END IF;
        EXECUTE format(
            'ALTER ROLE %I NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION', r);
    END LOOP;
END
$roles$;

-- Solo kamayuk_owner hace DDL. La aplicacion nunca.
GRANT USAGE, CREATE ON SCHEMA public TO kamayuk_owner;
GRANT USAGE           ON SCHEMA public TO kamayuk_app, kamayuk_readonly;

-- Sin GRANT de pertenencia entre roles: kamayuk_owner concede privilegios sobre sus
-- propias tablas sin necesitarla, y ser miembro de kamayuk_app le permitiria un
-- SET ROLE que borra la separacion.

-- ---------- CONNECT sobre esta base ----------
--  PostgreSQL concede `CONNECT` a PUBLIC al crear una base, asi que TODO rol del cluster puede
--  conectarse a la de cualquier sistema sin que nadie se lo haya dado. Se midio (C-7 §6): sobre
--  una base recien creada, `has_database_privilege('<un rol cualquiera>', '<esa base>', 'CONNECT')`
--  devuelve `true`; tras el `REVOKE ... FROM PUBLIC`, `false`.
--
--  Los roles son del CLUSTER y los cuatro sistemas lo comparten, de modo que sin esto la
--  credencial de carga de valores normativos —y la de la aplicacion de cualquier otro sistema—
--  puede abrir una sesion contra esta base. No veria filas —RLS esta forzada— pero seria una
--  credencial de mas apuntando a un padron, que es exactamente lo que #155 midio con el rol del
--  respaldo y lo que `30-base-de-keycloak.sh` ya hace con la base del monolito.
--
--  Los tres, y ninguno mas. `caja` no sabe que es un tributo, asi que no hay ningun rol
--  de carga de valores normativos que tenga nada que hacer aqui.
--
--  Va aqui y no en una migracion porque `REVOKE ... ON DATABASE` solo lo puede hacer quien la
--  posee, y `kamayuk_owner` —que es quien migra— a proposito NO es dueno de la base (#722 lo midio:
--  «permission denied for database»). Este guion corre como superusuario.
DO $connect$
DECLARE
    base text := current_database();
BEGIN
    EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', base);
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO kamayuk_owner, kamayuk_app, kamayuk_readonly', base);
END
$connect$;
