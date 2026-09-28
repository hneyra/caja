-- ============================================================================
--  V6 — DESDE CUANDO UNA FILA DE LA COPIA ESPERA SU SUJETO DE `identidad` (#125)
--
--  V5 (#111) hizo que la copia case usuario y grupo por el id estable de
--  `identidad`, y dejo NULLABLE y sin relleno `identidad_sujeto_id` en las filas
--  que ya habia: las adopta el aplicador con el primer evento que las nombra.
--  Dos clases de fila no van a recibir ese evento NUNCA, y siguen concediendo:
--
--    1. la que el defecto de #111 ya dejo HUERFANA —la clave vieja de un
--       renombrado—, que `identidad` ya no publica porque su sujeto casa con la
--       fila nueva;
--    2. la de antes de V5 cuyo PRIMER evento fue un renombrado: el evento trae la
--       clave nueva, no la encuentra, inserta otra fila, y la vieja se queda.
--
--  Desde esta migracion el guardia (`ComprobadorDeAccesoJdbc`) y la matriz de la
--  sesion (`LecturaDeLaCopiaLocalJdbc`) dejan de conceder por una fila SIN sujeto
--  cuando pasa `PlazoDeAdopcion.DIAS` desde esta columna, y el consumidor avisa
--  cada corrida de las que todavia conceden. Una fila legitima que solo espera su
--  primer evento se adopta en cuanto `identidad` la toque —cualquier modificacion,
--  afiliacion o permiso que la nombre—, y entonces el plazo deja de importarle.
--
--  POR QUE UNA COLUMNA Y NO LA FECHA DE `flyway_schema_history`: el guardia la
--  leeria en cada peticion, `kamayuk_app` no tiene privilegio sobre la tabla de
--  Flyway, y atar la autorizacion a la bitacora interna del migrador es atarla a
--  algo que nadie mira como dato.
--
--  COMO SE FECHA SIN UN SOLO `UPDATE`. El migrador no puede escribir filas de una
--  tabla de tenant: muere bajo RLS (hallazgo 4). Un `ADD COLUMN ... DEFAULT` con
--  una expresion NO volatil no escribe filas: PostgreSQL evalua la expresion UNA
--  vez, guarda el valor en el catalogo (`attmissingval`) y las filas que ya
--  estaban lo leen de ahi. El `DROP DEFAULT` inmediato quita el valor por omision
--  para lo que se inserte despues, SIN tocar el que ya recibieron las de antes.
--  Lo mide `SinSujetoDesdeTest`, migrando hasta V5, poniendo filas y terminando.
--
--  Y POR ESO UNA FILA POSTERIOR NO SE FECHA NUNCA. El unico escritor de estas
--  tablas (regla 12) es `AplicarUnEventoDeIdentidad`, que siempre inserta con
--  `identidad_sujeto_id`; una fila sin sujeto y sin fecha la escribio alguien por
--  fuera de el, y el guardia no la deja conceder ni un dia (falla cerrado).
--
--  Las que YA tenian sujeto al migrar tambien reciben la marca: la migracion no
--  puede elegir filas sin consultarlas, y a una fila con sujeto no le cambia nada.
--
--  UN INSTANTE Y NO UN DIA. Guardar `date` obligaba a decir aqui de que zona es
--  el dia, y la zona del producto se escribe en UN sitio (`ZonaHoraria`, y
--  `NingunRelojSinLaZonaDelProductoTest` lo vigila sobre todo `src/main`, SQL
--  incluido); `CURRENT_DATE` seria el dia de la sesion del migrador, que no tiene
--  por que ser el de Lima. Con el instante, el dia lo pone Java con la zona de
--  siempre: el guardia compara con el comienzo, en Lima, del primer dia que
--  todavia concede (`PlazoDeAdopcion.primerInstanteQueConcede`).
--
--  RLS Y PRIVILEGIOS NO CAMBIAN: politica de fila y `GRANT` de tabla (V1).
-- ============================================================================

ALTER TABLE usuario ADD COLUMN sin_sujeto_desde timestamp with time zone DEFAULT now();
ALTER TABLE usuario ALTER COLUMN sin_sujeto_desde DROP DEFAULT;

ALTER TABLE grupo ADD COLUMN sin_sujeto_desde timestamp with time zone DEFAULT now();
ALTER TABLE grupo ALTER COLUMN sin_sujeto_desde DROP DEFAULT;

COMMENT ON COLUMN usuario.sin_sujeto_desde IS
    'El instante en que V6 encontro esta fila (#125). Solo importa mientras '
    '`identidad_sujeto_id` es nulo: pasados `PlazoDeAdopcion.DIAS` dias de Lima desde aqui, una '
    'fila sin sujeto deja de conceder. Nulo en toda fila insertada despues de V6, que el aplicador '
    'escribe siempre con sujeto: sin sujeto y sin fecha no concede nunca.';
COMMENT ON COLUMN grupo.sin_sujeto_desde IS
    'El instante en que V6 encontro este grupo (#125). Solo importa mientras '
    '`identidad_sujeto_id` es nulo: pasados `PlazoDeAdopcion.DIAS` dias de Lima desde aqui, un '
    'grupo sin sujeto deja de conceder. Nulo en todo grupo insertado despues de V6, que el '
    'aplicador escribe siempre con sujeto: sin sujeto y sin fecha no concede nunca.';
