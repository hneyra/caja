-- ============================================================================
--  V5 — LA COPIA DE LA AUTORIZACION CASA POR EL SUJETO DE `identidad` (#111)
--
--  `identidad` RENOMBRA cuentas y grupos (`UPDATE usuario SET cuenta`,
--  `UPDATE grupo SET nombre`) y publica el `*_MODIFICADO` con la clave NUEVA.
--  El aplicador de la etapa 4 casaba solo por la clave natural
--  —`(municipalidad_id, cuenta)`, `(municipalidad_id, nombre)`—, asi que no
--  encontraba la fila, INSERTABA UNA NUEVA y la vieja se quedaba habilitada con
--  sus miembros y sus permisos: «Cajeros» renombrado a «Cajeros-baja» e
--  inhabilitado seguia concediendo aqui, y una cuenta renombrada y reasignada le
--  dejaba al siguiente los permisos del anterior, porque el guardia casa por
--  `u.cuenta`.
--
--  Lo que no cambia con un renombrado es el IDENTIFICADOR de la fila en
--  `identidad` (`id bigint GENERATED ALWAYS AS IDENTITY`, que ningun `UPDATE`
--  toca), y el cuerpo del evento lo trae (`usuarioId`, `grupoId`). Esta columna
--  lo guarda. NO es el `id` de aqui ni lo sustituye: las filas de esta copia
--  siguen naciendo con identidad propia, y `miembro` y `permiso` siguen
--  apuntando a ella.
--
--  NULLABLE Y SIN RELLENO, A PROPOSITO. Las filas que ya hay no saben de que
--  sujeto de `identidad` son, y esta migracion no tiene de donde sacarlo —ni
--  podria escribirlo: un `UPDATE` sobre una tabla de tenant desde el migrador
--  muere con «unrecognized configuration parameter "app.municipalidad_id"»
--  (hallazgo 4 de RLS)—. Las adopta el aplicador en su primer evento: si no hay
--  fila con ese id, casa por la clave natural UNA FILA SIN ID y se lo estampa.
--
--  UNICO POR MUNICIPALIDAD Y PARCIAL. `WHERE ... IS NOT NULL` porque las
--  filas sin adoptar son muchas y todas nulas; y el `CREATE UNIQUE INDEX` si
--  corre sin contexto de tenant (hallazgo 4, #588): construir un indice lee el
--  monton y no pasa por la politica. Sobre una columna recien creada, entera
--  nula, no puede haber duplicados.
--
--  RLS Y PRIVILEGIOS NO CAMBIAN: las dos tablas ya la tienen `ENABLE` + `FORCE`
--  y la politica es de fila, y los `GRANT` de `V1` son de tabla y alcanzan a la
--  columna nueva. `AislamientoMultiTenantTest` las sigue midiendo como a
--  cualquier tabla de tenant.
-- ============================================================================

ALTER TABLE usuario ADD COLUMN identidad_sujeto_id bigint;
ALTER TABLE grupo   ADD COLUMN identidad_sujeto_id bigint;

CREATE UNIQUE INDEX usuario_identidad_sujeto_uq
    ON usuario (municipalidad_id, identidad_sujeto_id)
    WHERE identidad_sujeto_id IS NOT NULL;
CREATE UNIQUE INDEX grupo_identidad_sujeto_uq
    ON grupo (municipalidad_id, identidad_sujeto_id)
    WHERE identidad_sujeto_id IS NOT NULL;

COMMENT ON COLUMN usuario.identidad_sujeto_id IS
    'El `usuario.id` de la base de `identidad` (el `usuarioId` del evento), que no cambia cuando '
    '`identidad` renombra la cuenta (#111). Es con lo que casa el aplicador del buzon; NO es el '
    '`id` de esta fila. Nulo en una fila que ningun evento adopto todavia.';
COMMENT ON COLUMN grupo.identidad_sujeto_id IS
    'El `grupo.id` de la base de `identidad` (el `grupoId` del evento), que no cambia cuando '
    '`identidad` renombra el grupo (#111). Es con lo que casa el aplicador del buzon; NO es el '
    '`id` de esta fila. Nulo en una fila que ningun evento adopto todavia.';
