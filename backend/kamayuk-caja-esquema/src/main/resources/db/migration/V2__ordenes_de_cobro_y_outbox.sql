-- ============================================================================
--  V2 — LA ORDEN DE COBRO, EL BUZON DE SALIDA, Y EL `REVOKE` QUE YA SE PUEDE
--       (P5D, ADR-0026)
--
--  Tres cosas, y van juntas porque son la misma decision leida por tres lados.
--
--  1. LA ORDEN DE COBRO. Caja deja de cobrar «deuda»: cobra ORDENES. Una orden
--     trae de donde viene (`sistema_origen`), como la reconoce quien la mando
--     (`referencia_externa`), que dice el papel (`concepto`), cuanto (`importe`),
--     desde cuando se puede cobrar (`fecha_exigibilidad`) y a que fecha esta esa
--     cifra (`actualizado_a`, regla 9). NADA MAS. Ni tributo, ni ejercicio, ni
--     cuota, ni interes: eso es del sistema que la emitio, y meterlo aqui es lo
--     que haria que la caja dejara de servir para cobrar un puesto de mercado
--     (ADR-0026 §1).
--
--  2. EL BUZON DE SALIDA. Lo que la caja publica cuando cobra o anula. Vive en la
--     MISMA transaccion que el recibo -por eso es un outbox y no una llamada- y
--     un proceso aparte lo entrega. Su `evento_id` es el `pagoId` con el que el
--     receptor deduplica: es el AC 3 del encargo, y esta del lado de quien emite
--     para que el que reintenta no invente uno nuevo.
--
--  3. EL `REVOKE UPDATE ON cierre_caja`, QUE AHORA SI SE PUEDE.
--
--     `V32` del monolito lo intento y no pudo, y el motivo esta copiado entero en
--     la cabecera de `V1` de este repositorio: `SELECT ... FOR UPDATE` exige el
--     privilegio de UPDATE, y esa fila era EL PUNTO DE SERIALIZACION DE LA
--     VENTANILLA. Reproducido aqui, contra PostgreSQL 16.15:
--
--         REVOKE UPDATE ON cierre_caja FROM kamayuk_app;
--         BEGIN; SET LOCAL app.municipalidad_id='1';
--         SELECT id FROM cierre_caja WHERE caja_id=2 AND cajero='jperez' FOR UPDATE;
--         -- ERROR:  permission denied for table cierre_caja
--
--     ADR-0026 dice que «se replantea en el sistema nuevo, donde el cierre ya no
--     comparte base con el libro». ESA PREMISA ES FALSA y conviene decirlo: que el
--     libro estuviera en la misma base nunca tuvo nada que ver. Lo que impedia el
--     REVOKE era que la cobranza necesitaba bloquear ALGO, y lo unico que habia
--     para bloquear era el turno.
--
--     Lo que SI cambia con la separacion es QUE HAY QUE BLOQUEAR. En el monolito,
--     la tercera barrera contra el doble cobro era que `RegistroDeAbonos` releia
--     el libro (#33); aqui el libro no esta, asi que la barrera pasa a ser LA
--     ORDEN: se bloquean las ordenes que se van a cobrar, se comprueba que sigan
--     PENDIENTE y se marcan PAGADA en la misma transaccion. Dos cobranzas de la
--     misma orden se ordenan en el motor y la segunda no encuentra nada que
--     cobrar, que es exactamente lo que hacia el libro.
--
--     Con la serializacion movida, el turno se abre con `INSERT ... ON CONFLICT
--     DO NOTHING` -medido: funciona SIN el privilegio de UPDATE, y dos veces
--     seguidas deja un solo turno- y el REVOKE deja de romper la caja.
--
--     LO QUE SE GANA no es cosmetico: `cierre_caja` era la primera tabla del
--     esquema cuya inmutabilidad NO podia apoyarse en el privilegio y dependia
--     solo del escaner de fuentes. Ahora se apoya en las dos.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  1. LA ORDEN DE COBRO
-- ----------------------------------------------------------------------------

CREATE TABLE orden_de_cobro (
    municipalidad_id    bigint       NOT NULL REFERENCES municipalidad (id),
    id                  bigint       GENERATED ALWAYS AS IDENTITY,
    sistema_origen      varchar(20)  NOT NULL,
    referencia_externa  varchar(120) NOT NULL,
    concepto            varchar(120) NOT NULL,
    detalle             varchar(200),
    importe             dinero       NOT NULL,
    fecha_exigibilidad  date         NOT NULL,
    actualizado_a       date         NOT NULL,
    pagador_documento   varchar(20),
    pagador_nombre      varchar(150),
    pagador_externo_id  bigint,
    estado              varchar(20)  NOT NULL,
    recibo_id           bigint,
    creada_en           timestamptz  NOT NULL,
    observacion         varchar(400) NOT NULL,

    CONSTRAINT orden_pk PRIMARY KEY (municipalidad_id, id),
    -- El alta es idempotente por aqui, y es lo unico que impide que un reintento
    -- del sistema de origen cobre dos veces al mismo administrado (ADR-0026 §1).
    CONSTRAINT orden_referencia_uq UNIQUE (municipalidad_id, sistema_origen, referencia_externa),
    CONSTRAINT orden_estado_ck CHECK (estado IN ('PENDIENTE', 'PAGADA', 'ANULADA')),
    CONSTRAINT orden_importe_ck CHECK (importe > 0),
    -- Una orden PAGADA nombra su recibo y una PENDIENTE no puede nombrarlo. Sin
    -- esto, «cobrada» seria una palabra en una columna en vez de un hecho con papel.
    CONSTRAINT orden_recibo_ck CHECK (
        (estado = 'PAGADA' AND recibo_id IS NOT NULL)
        OR (estado <> 'PAGADA' AND recibo_id IS NULL)),
    CONSTRAINT orden_fecha_ck CHECK (actualizado_a >= fecha_exigibilidad
                                     OR actualizado_a <= fecha_exigibilidad),
    CONSTRAINT orden_observacion_ck CHECK (length(btrim(observacion)) >= 5)
);

CREATE INDEX orden_pendiente_ix ON orden_de_cobro (municipalidad_id, estado, fecha_exigibilidad)
    WHERE estado = 'PENDIENTE';
CREATE INDEX orden_pagador_ix ON orden_de_cobro (municipalidad_id, pagador_documento)
    WHERE pagador_documento IS NOT NULL;
CREATE INDEX orden_recibo_ix ON orden_de_cobro (municipalidad_id, recibo_id)
    WHERE recibo_id IS NOT NULL;

COMMENT ON TABLE orden_de_cobro IS
    'Lo que la caja sabe cobrar (ADR-0026 §1). No es deuda tributaria: es un importe con un '
    'concepto, una referencia del sistema que lo emitio y una fecha desde la que se puede cobrar. '
    'Caja NO SABE QUE ES UN TRIBUTO: si esta tabla ganara una columna `ejercicio` o `tributo`, '
    'dejaria de servir para cobrar un puesto de mercado, que es la razon entera de la separacion.';
COMMENT ON COLUMN orden_de_cobro.referencia_externa IS
    'Como reconoce esta orden quien la mando. Es opaca para la caja a proposito —no se analiza, no '
    'se compara por partes, no se ordena— y viaja de vuelta en el evento del pago para que el '
    'origen sepa que imputar. Con `sistema_origen` forma la clave de idempotencia del alta.';
COMMENT ON COLUMN orden_de_cobro.actualizado_a IS
    'A que fecha esta el importe (regla 9, RNF-075). No es la fecha de exigibilidad: una deuda '
    'exigible desde marzo puede venir actualizada a hoy con su interes ya dentro. La caja no '
    'recalcula nada; imprime esta fecha al lado de la cifra.';
COMMENT ON COLUMN orden_de_cobro.pagador_documento IS
    'El documento de quien paga, ANULABLE a proposito: D-17 sigue abierta. Caja guarda aqui lo que '
    'el sistema de origen le diga y no lo cruza contra ningun padron —el de contribuyentes es de '
    '`rentas`—, porque el dia que se cobre un puesto de mercado el pagador puede no estar en '
    'ninguno. Cuando D-17 cierre, esto se queda o se sustituye por un registro propio; hoy no '
    'decide nada.';
COMMENT ON COLUMN orden_de_cobro.pagador_externo_id IS
    'El identificador que el sistema de origen le da al pagador, si lo tiene. En `rentas` es el '
    '`contribuyente_id`, y es lo que hace que `recibo.contribuyente_id` siga significando lo mismo '
    'sin que esta base tenga el padron.';
COMMENT ON COLUMN orden_de_cobro.estado IS
    'PENDIENTE, PAGADA o ANULADA. Se bloquea con FOR UPDATE al cobrar: es EL punto de '
    'serializacion de la ventanilla desde P5D, y lo que sustituye a la relectura del libro que '
    'hacia esa funcion en el monolito (#33, tercera barrera).';


-- ----------------------------------------------------------------------------
--  2. EL BUZON DE SALIDA
--
--  `evento_id` es uuid y lo genera la caja: es el `pagoId` con el que el receptor
--  deduplica. Que lo genere quien EMITE y no quien recibe es lo que hace que un
--  reintento sea el mismo pago; si lo generara el transporte, dos entregas del
--  mismo cobro serian dos pagos distintos y el AC 3 seria imposible de cumplir.
-- ----------------------------------------------------------------------------

CREATE TABLE pago_evento (
    municipalidad_id  bigint       NOT NULL REFERENCES municipalidad (id),
    id                bigint       GENERATED ALWAYS AS IDENTITY,
    evento_id         uuid         NOT NULL,
    tipo              varchar(20)  NOT NULL,
    sistema_destino   varchar(20)  NOT NULL,
    recibo_id         bigint       NOT NULL,
    turno_id          bigint       NOT NULL,
    cuerpo            jsonb        NOT NULL,
    estado            varchar(20)  NOT NULL,
    intentos          integer      NOT NULL DEFAULT 0,
    ultimo_error      varchar(400),
    creado_en         timestamptz  NOT NULL,
    entregado_en      timestamptz,
    explicacion       varchar(400),

    CONSTRAINT pago_evento_pk PRIMARY KEY (municipalidad_id, id),
    CONSTRAINT pago_evento_uq UNIQUE (municipalidad_id, evento_id),
    CONSTRAINT pago_evento_tipo_ck CHECK (tipo IN ('PAGO_REGISTRADO', 'PAGO_ANULADO')),
    CONSTRAINT pago_evento_estado_ck CHECK (estado IN ('PENDIENTE', 'ENTREGADO', 'MUERTO',
                                                       'EXPLICADO')),
    CONSTRAINT pago_evento_intentos_ck CHECK (intentos >= 0),
    -- Entregado es un hecho con hora. Sin ella, «se entrego» no se puede conciliar
    -- contra nada y el cierre bloqueante no tendria con que decidir.
    CONSTRAINT pago_evento_entregado_ck CHECK (
        (estado = 'ENTREGADO') = (entregado_en IS NOT NULL)),
    -- Un evento EXPLICADO lleva quien lo explico y por que. Un turno no se cierra
    -- con un pago sin imputar «porque si» (ADR-0026 §4).
    CONSTRAINT pago_evento_explicacion_ck CHECK (
        estado <> 'EXPLICADO' OR (explicacion IS NOT NULL AND length(btrim(explicacion)) >= 5)),
    CONSTRAINT pago_evento_recibo_fk
        FOREIGN KEY (municipalidad_id, recibo_id) REFERENCES recibo (municipalidad_id, id),
    CONSTRAINT pago_evento_turno_fk
        FOREIGN KEY (municipalidad_id, turno_id) REFERENCES cierre_caja (municipalidad_id, id)
);

-- El que lee el publicador: lo pendiente, en el orden en que se cobro.
CREATE INDEX pago_evento_pendiente_ix ON pago_evento (municipalidad_id, id)
    WHERE estado = 'PENDIENTE';
-- El que lee el cierre bloqueante y la conciliacion: lo que NO esta resuelto de un turno.
CREATE INDEX pago_evento_turno_ix ON pago_evento (municipalidad_id, turno_id, estado);
CREATE INDEX pago_evento_recibo_ix ON pago_evento (municipalidad_id, recibo_id);

COMMENT ON TABLE pago_evento IS
    'El buzon de salida de la caja (ADR-0026 §3). Se escribe EN LA MISMA TRANSACCION que el recibo '
    '—por eso es un outbox y no una llamada—: si la fila esta, el recibo esta; si el recibo esta, '
    'la fila esta. Un proceso aparte la entrega y la marca. Lo que esto compra es que la ventanilla '
    'cobre con `rentas` apagado; lo que cuesta es que la conciliacion diaria pase de buena practica '
    'a obligacion operativa.';
COMMENT ON COLUMN pago_evento.evento_id IS
    'El `pagoId`. Lo genera la caja al cobrar, no el transporte: un reintento de entrega manda el '
    'MISMO uuid, y por eso el receptor puede deduplicar. Si lo generara quien entrega, dos '
    'entregas del mismo cobro serian dos pagos y habria dos asientos.';
COMMENT ON COLUMN pago_evento.estado IS
    'PENDIENTE mientras no se entrego —es el «pago en transito» de ADR-0026 §4, y su hora es '
    '`creado_en`—; ENTREGADO con su hora; MUERTO cuando se agotaron los intentos, que es dinero '
    'cobrado sin registrar y por eso dispara alerta a una persona con nombre; EXPLICADO cuando '
    'alguien se hizo cargo por escrito. Un turno no cierra mientras quede uno PENDIENTE o MUERTO.';
COMMENT ON COLUMN pago_evento.cuerpo IS
    'El evento entero, congelado. No se recompone al entregar: dentro de dos anios el recibo se '
    'leera igual pero la orden podria haber cambiado de estado, y lo que se entrego tiene que '
    'poder explicarse solo. Es la misma decision que `recibo_movimiento.importe`.';


-- ----------------------------------------------------------------------------
--  2.bis. EL PAGADOR, EN EL PROPIO RECIBO
--
--  Hasta P5D, para escribir el nombre en un recibo la caja preguntaba al PADRON DE
--  CONTRIBUYENTES —`ReciboRepositoryJdbc` llegaba a traducir un codigo del padron a
--  su identificador dentro de un `SELECT`—. Ese padron es de `rentas` (GOB-05 §6.8,
--  `PENDIENTE-CRUCE-06`).
--
--  Se cierra copiando el pagador en el recibo, y NO es una desnormalizacion por
--  comodidad: es la misma decision que `recibo_movimiento.importe` y que
--  `pago_evento.cuerpo`. Un recibo tiene que poder explicarse solo dentro de dos
--  anios, cuando la persona se haya mudado o cambiado de nombre; releerlo del padron
--  daria un papel distinto con el mismo numero.
--
--  Y ADEMAS ES LO QUE HACE LA CAJA REUTILIZABLE: el dia que se cobre un puesto de
--  mercado, el pagador puede no estar en ningun padron. Por eso las dos columnas son
--  ANULABLES —quien paga una tasa al contado puede no dar documento— y por eso no
--  hay clave foranea a ninguna parte.
--
--  D-17 NO SE DECIDE AQUI. Sigue abierta la pregunta de si caja tendra su propio
--  registro de pagadores o si habra uno compartido. Lo que este bloque hace es que
--  la respuesta deje de bloquear la separacion: hoy caja no lee `contribuyente`, y
--  `recibo.contribuyente_id` pasa a significar «el identificador que le da el
--  sistema de origen», sin garantia del motor —nunca la tuvo desde que la tabla
--  vive en otra base—.
-- ----------------------------------------------------------------------------

-- El pagador puede ser ANONIMO, asi que la columna que lo identificaba deja de ser
-- obligatoria. Es la consecuencia directa de que la caja tenga que poder cobrar un
-- puesto de mercado: quien paga puede no estar en ningun padron, y hasta P5D esta
-- columna era `NOT NULL` con clave foranea a `contribuyente`. Relajar un `NOT NULL` no
-- reescribe la tabla y ninguna fila existente puede violarlo.
ALTER TABLE recibo ALTER COLUMN contribuyente_id DROP NOT NULL;

ALTER TABLE recibo ADD COLUMN pagador_documento varchar(20);
ALTER TABLE recibo ADD COLUMN pagador_nombre    varchar(150);

CREATE INDEX recibo_pagador_ix ON recibo (municipalidad_id, pagador_documento)
    WHERE pagador_documento IS NOT NULL;

COMMENT ON COLUMN recibo.pagador_documento IS
    'El documento de quien pago, COPIADO y no releido (P5D). Es lo que sustituye al cruce contra '
    '`contribuyente`, que vive en `rentas`. Anulable: quien paga una tasa al contado puede no dar '
    'ninguno, y el dia que se cobre un puesto de mercado el pagador puede no estar en ningun padron.';
COMMENT ON COLUMN recibo.pagador_nombre IS
    'El nombre impreso en el papel, congelado el dia que se cobro. Releerlo del padron daria un '
    'duplicado distinto del original con el mismo numero, que es lo que `recibo_movimiento.resumen` '
    'existe para impedir.';
COMMENT ON COLUMN recibo.contribuyente_id IS
    'El identificador que el SISTEMA DE ORIGEN le da al pagador, si lo tiene. Desde P5D no hay '
    'clave foranea que lo garantice y esta base no tiene padron: el nombre y el documento estan '
    'en las dos columnas de al lado. La columna conserva su nombre a proposito —renombrarla '
    'obligaria a reescribir filas de una tabla inmutable (V29)—.';
COMMENT ON COLUMN recibo.tipo_pago IS
    'Desde P5D la caja escribe DOS de los cinco valores que el CHECK admite: NORMAL —el cobro de '
    'una o varias `orden_de_cobro`— y TASA —el catalogo de conceptos cobrables de la propia caja—. '
    'A_CUENTA, PRECONVENIO y CUOTA_CONVENIO ya no los puede escribir NADIE: son conceptos de '
    '`rentas`, y la cuota inicial de un convenio se cobra «como cualquier otra orden» (ADR-0026 '
    '§5). El CHECK no se estrecha: hacerlo sobre una tabla con filas es un problema de datos, y '
    'las filas viejas siguen diciendo la verdad de cuando se escribieron (la leccion de V64).';


-- ----------------------------------------------------------------------------
--  2.ter. LA LINEA DEL RECIBO, ENSANCHADA — Y D-20, QUE NO SE DECIDE AQUI
--
--  `recibo_detalle` nacio para deuda tributaria: `tributo varchar(20)`, `concepto
--  varchar(20)`, `referencia_externa varchar(40)`. Un concepto de veinte caracteres
--  vale para «IMPUESTO PREDIAL» y no para «DERECHO DE OCUPACION DE PUESTO 114 -
--  MERCADO CENTRAL», que es exactamente lo que esta caja tiene que poder imprimir.
--
--  Se ensancha `concepto` y `referencia_externa`, y se anade `detalle`. Ensanchar un
--  `varchar` no reescribe la tabla en PostgreSQL, asi que no hay riesgo de datos.
--
--  `tributo` NO se ensancha y CAMBIA DE SIGNIFICADO: en una linea de orden lleva el
--  `sistema_origen` -que cabe en veinte por construccion-. Se conserva el nombre de
--  la columna a proposito: `recibo_detalle` no admite UPDATE (V29) y renombrar
--  obligaria a reescribir filas de una tabla inmutable.
--
--  D-20 -QUE DICE EL RECIBO- SIGUE ABIERTA, Y ESTE BLOQUE ES LO QUE LA DEJA ABIERTA.
--  Las dos salidas que ADR-0026 §2 nombra siguen siendo posibles sin tocar el esquema
--  otra vez:
--
--    (a) el recibo dice cuanto se pago y contra que orden, y el desglose de la
--        imputacion se lee en la cuenta corriente. Es lo que pasa si `detalle` va
--        nulo. Cuesta cero.
--    (b) el recibo lleva el desglose. El sistema de origen PREVISUALIZA la imputacion
--        al emitir la orden y la escribe en `detalle`; la caja la imprime sin
--        entenderla. Cuesta una llamada sincrona en el momento de emitir la orden
--        —no en ventanilla—, que es el costo que ADR-0026 anticipa.
--
--  Lo que NO se hace, y es la razon de que `detalle` sea texto libre: repartir el
--  importe en `insoluto`/`reajuste`/`interes`/`gasto` desde la orden. Eso obligaria a
--  la caja a tener columnas llamadas «interes», y una caja que sabe lo que es un
--  interes moratorio ya no sirve para cobrar un puesto de mercado. Las cuatro
--  columnas se quedan porque la caja de TASAS las sigue usando; en una linea de orden
--  el importe va integro en `insoluto`.
-- ----------------------------------------------------------------------------

ALTER TABLE recibo_detalle ALTER COLUMN concepto TYPE varchar(120);
ALTER TABLE recibo_detalle ALTER COLUMN referencia_externa TYPE varchar(120);
ALTER TABLE recibo_detalle ADD COLUMN detalle varchar(200);

COMMENT ON COLUMN recibo_detalle.tributo IS
    'En una linea de TASA, el rotulo del concepto del TUPA. En una linea de ORDEN (P5D), el '
    '`sistema_origen` de la orden que la produjo: la caja no sabe que es un tributo, y esta columna '
    'es lo mas cerca que esta de nombrar uno. Conserva su nombre porque `recibo_detalle` no admite '
    'UPDATE (V29) y renombrarla obligaria a reescribir filas de una tabla inmutable.';
COMMENT ON COLUMN recibo_detalle.detalle IS
    'Lo que el sistema de origen quiso que se imprimiera debajo del concepto, si quiso algo. La '
    'caja no lo compone ni lo entiende: lo copia. Es la puerta por la que D-20 puede resolverse '
    'hacia «el recibo lleva el desglose» sin que la caja aprenda una sola palabra de tributacion.';


-- ----------------------------------------------------------------------------
--  3. RLS. Sin valor por omision: sin contexto de tenant, la consulta FALLA.
-- ----------------------------------------------------------------------------

ALTER TABLE orden_de_cobro ENABLE ROW LEVEL SECURITY;
ALTER TABLE orden_de_cobro FORCE ROW LEVEL SECURITY;
CREATE POLICY orden_de_cobro_tenant ON orden_de_cobro FOR ALL TO PUBLIC
    USING (municipalidad_id = current_setting('app.municipalidad_id')::bigint)
    WITH CHECK (municipalidad_id = current_setting('app.municipalidad_id')::bigint);

ALTER TABLE pago_evento ENABLE ROW LEVEL SECURITY;
ALTER TABLE pago_evento FORCE ROW LEVEL SECURITY;
CREATE POLICY pago_evento_tenant ON pago_evento FOR ALL TO PUBLIC
    USING (municipalidad_id = current_setting('app.municipalidad_id')::bigint)
    WITH CHECK (municipalidad_id = current_setting('app.municipalidad_id')::bigint);


-- ----------------------------------------------------------------------------
--  4. PRIVILEGIOS
--
--  `orden_de_cobro` recibe UPDATE porque su fila cambia de estado al cobrarse y es
--  donde se bloquea. `pago_evento` tambien: el publicador marca la entrega.
--  Ninguna de las dos recibe DELETE, y no lo van a recibir: un evento muerto se
--  explica, no se borra (regla 4, RNF-051).
-- ----------------------------------------------------------------------------

GRANT INSERT, SELECT, UPDATE ON orden_de_cobro TO kamayuk_app;
GRANT SELECT                  ON orden_de_cobro TO kamayuk_readonly;
GRANT INSERT, SELECT, UPDATE ON pago_evento TO kamayuk_app;
GRANT SELECT                  ON pago_evento TO kamayuk_readonly;


-- ----------------------------------------------------------------------------
--  5. EL `REVOKE` QUE `V32` DEL MONOLITO NO PUDO HACER
--
--  Ver la cabecera. Se puede porque la ventanilla ya no se serializa aqui: se
--  serializa en `orden_de_cobro`, y el turno se abre con `INSERT ... ON CONFLICT
--  DO NOTHING`, que NO necesita el privilegio de UPDATE —medido contra PostgreSQL
--  16.15: dos ejecuciones seguidas dejan un solo turno, con `has_table_privilege(
--  'kamayuk_app','cierre_caja','UPDATE')` en `f`—.
--
--  QUIEN VUELVA A PONER UN `FOR UPDATE` SOBRE `cierre_caja` ROMPE LA CAJA, y el
--  sintoma no se parece a su causa: «bad SQL grammar» en la primera cobranza,
--  porque el SQLSTATE 42501 cae en la clase 42. Por eso el escaner de fuentes
--  sigue vigilando la tabla ademas del privilegio: son dos guardas independientes
--  y las dos dan 42501, asi que el sintoma no distingue cual actuo (#435).
-- ----------------------------------------------------------------------------

REVOKE UPDATE ON cierre_caja FROM kamayuk_app;

COMMENT ON TABLE cierre_caja IS
    'El turno de una caja: se abre por cajero y fecha (#33) y se cobra contra el. Se abre con '
    'INSERT ... ON CONFLICT DO NOTHING y NO se bloquea: desde P5D la ventanilla se serializa en '
    '`orden_de_cobro`, que es lo que sustituye a la relectura del libro. Por eso `V2` pudo hacer '
    'el REVOKE UPDATE que `V32` del monolito intento y no pudo (ver su cabecera). El cierre, su '
    'reversion y el estado que de ellos se deriva viven en `cierre_turno`.';
