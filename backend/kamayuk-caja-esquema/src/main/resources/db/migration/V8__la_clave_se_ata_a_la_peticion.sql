-- ============================================================================
--  V8 — LA CLAVE DE IDEMPOTENCIA SE ATA A LA PETICION QUE LA TRAJO (#143)
--
--  Hasta aqui el recibo se buscaba SOLO por `clave_idempotencia`: la misma clave
--  mandada a `/cobros/tasas` y despues a `/cobros` con otras ordenes devolvia el
--  recibo de la tasa con un 201, y las ordenes se quedaban PENDIENTE sin que
--  nada lo dijera. Una clave nombra UN cobro; para saber si una peticion es el
--  reintento de ese cobro o otra cosa con la misma clave, la caja guarda al lado
--  de la clave la HUELLA de la peticion que la trajo: el SHA-256, en hexadecimal,
--  de su forma canonica —el acto (la ruta), la caja, el cajero del token, la
--  forma de pago y lo que se cobra: las ordenes, o los conceptos con su cantidad
--  y el pagador—. La define `ClaveDeIdempotencia`, y cada caso de uso dice que
--  entra en la suya (`CobrarOrdenes.claveDe`, `CobrarTasa.claveDe`).
--
--  UNA COLUMNA NULLABLE Y SIN RELLENO. Las filas que ya estaban quedan con la
--  huella en nulo, y un nulo se lee «no se sabe que peticion la trajo»: el
--  reintento se acepta como hasta ahora (`ClaveDeIdempotencia.reconoce`), con una
--  sola salvedad que el caso de uso SI puede comprobar sin huella —un recibo de
--  tasa no contesta a `/cobros` ni uno de ordenes a `/cobros/tasas`—. No se puede
--  rellenar: la huella lleva lo que la peticion dijo, y eso no esta en la fila;
--  y aunque estuviera, el migrador no escribe filas de una tabla de tenant, muere
--  bajo RLS (hallazgo 4). Tampoco hay a quien rellenarsela: no hay datos reales
--  en ningun ambiente (GOB-05 §7.1).
--
--  DOS `CHECK`, Y SOLO UNO `NOT VALID`:
--
--    `recibo_huella_ck`            una huella es un SHA-256 en hexadecimal y solo
--                                  acompania a una clave. Se VALIDA: con la
--                                  columna recien nacida en nulo ninguna fila lo
--                                  viola, y el escaneo de un CHECK no atraviesa
--                                  la politica (hallazgos, «Un `CHECK` no es una
--                                  clave foranea», #542).
--    `recibo_clave_con_huella_ck`  desde V8, una clave nueva viaja con su huella.
--                                  `NOT VALID` y a proposito: las filas de antes
--                                  tienen clave y no huella, y no se van a
--                                  reescribir (regla 4). Es lo que confina el
--                                  «nulo se acepta» a las filas anteriores a
--                                  esta migracion: un camino que emitiera un
--                                  recibo con clave y sin huella —y reabriera el
--                                  defecto— choca aqui y no en produccion.
--
--  Lo mide `LaClaveSeAtaALaPeticionV8Test`, migrando hasta V7, poniendo un recibo
--  con clave y terminando.
--
--  EL INDICE UNICO NO CAMBIA: sigue siendo `(municipalidad_id, clave_idempotencia)`.
--  Una clave es de un cobro, se reintente por donde se reintente; atarla a la
--  huella en el indice dejaria emitir dos recibos con la misma clave, que es
--  justo lo que la clave existe para impedir.
--
--  RLS Y PRIVILEGIOS NO CAMBIAN: politica de fila de V1, y el `GRANT INSERT,
--  SELECT ON recibo TO kamayuk_app` de V1 es de TABLA, asi que alcanza a la
--  columna nueva. Sigue sin `UPDATE` (V29) ni `DELETE` (regla 4): la huella se
--  escribe con el recibo y no se toca nunca mas.
-- ============================================================================

ALTER TABLE recibo ADD COLUMN huella_de_la_peticion character varying(64);

ALTER TABLE recibo ADD CONSTRAINT recibo_huella_ck CHECK (
    huella_de_la_peticion IS NULL
    OR (clave_idempotencia IS NOT NULL AND huella_de_la_peticion ~ '^[0-9a-f]{64}$'));

ALTER TABLE recibo ADD CONSTRAINT recibo_clave_con_huella_ck CHECK (
    clave_idempotencia IS NULL OR huella_de_la_peticion IS NOT NULL) NOT VALID;

COMMENT ON COLUMN recibo.huella_de_la_peticion IS
    'El SHA-256, en hexadecimal, de la forma canonica de la peticion que trajo la clave de '
    'idempotencia (#143): el acto, la caja, el cajero, la forma de pago y lo que se cobra. Un '
    'reintento con la misma clave y otra huella es otra peticion, y se contesta 422 en vez de '
    'devolverle el recibo de otra cosa. Nulo en las filas anteriores a V8, que no la guardaron: '
    'esas se reintentan como antes.';

COMMENT ON COLUMN recibo.clave_idempotencia IS
    'La clave que el cliente manda en la cabecera Idempotency-Key. Con su indice unico parcial, '
    'reenviar la misma cobranza devuelve el recibo de la primera y no emite otro; y desde V8 '
    '(#143) solo si la huella de la peticion es la misma: la misma clave con otra peticion no '
    'devuelve el recibo de otra cosa.';
