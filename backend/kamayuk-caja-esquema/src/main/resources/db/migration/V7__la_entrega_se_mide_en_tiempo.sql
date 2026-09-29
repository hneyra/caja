-- ============================================================================
--  V7 — LA ENTREGA DE UN PAGO SE MIDE EN TIEMPO, NO EN VUELTAS (#131)
--
--  Hasta aqui el publicador intentaba TODO lo pendiente en cada vuelta —cada diez
--  segundos, sin espera propia por evento— y mataba el pago al octavo fallo: con
--  el sistema de origen caido, un pago cobrado moria sin entregarse a los ~80 s,
--  que es menos que el despliegue de dos minutos que `application.yaml` decia
--  cubrir. Y MUERTO era terminal: ninguna fila volvia a PENDIENTE.
--
--  Dos columnas, las dos NULLABLE y sin valor por omision:
--
--    `no_antes_de`    cuando se puede volver a intentar un evento que fallo. Nulo
--                     es «en la vuelta que toque»: lo que un evento recien cobrado
--                     y uno que nunca fallo han sido siempre. Solo lo lleva un
--                     PENDIENTE (`pago_evento_no_antes_de_ck`): un evento
--                     entregado o muerto no tiene intento siguiente.
--    `fallando_desde` el primer fallo de la racha en curso. De aqui se mide el
--                     plazo (`ReintentosDeLaEntrega`): el pago muere en el primer
--                     fallo que llega cuando ya lleva ese plazo sin llegar. Se
--                     vacia al entregarse y al volver a ponerlo en camino
--                     (`ReintentarPagoMuerto`), que empieza una racha nueva.
--
--  POR QUE NO SE RELLENA NADA. Las filas que ya estaban quedan con las dos en nulo,
--  y es lo correcto: un PENDIENTE sin `no_antes_de` se intenta en la vuelta
--  siguiente —como hasta ahora— y su primer fallo abre la racha. Tampoco se podria:
--  el migrador no escribe filas de una tabla de tenant, muere bajo RLS (hallazgo
--  4). Un `ADD COLUMN` sin `DEFAULT` no toca ninguna fila.
--
--  EL CHECK SE VALIDA, sin `NOT VALID`: su escaneo no atraviesa la politica
--  (hallazgos, «Un `CHECK` no es una clave foranea», #542), y con las dos columnas
--  recien nacidas en nulo ninguna fila lo viola. Lo mide `LaEntregaSeMideEnTiempoV7Test`,
--  migrando hasta V6, poniendo filas y terminando.
--
--  NINGUN INSTANTE SE ESCRIBE CON `now()` DE LA BASE: los dos los pone Java con el
--  reloj inyectado (regla 6), que es lo que deja probar el plazo con un reloj fijo.
--
--  RLS Y PRIVILEGIOS NO CAMBIAN: politica de fila de V2, y el `GRANT INSERT,
--  SELECT, UPDATE ON pago_evento TO kamayuk_app` de V2 es de TABLA, asi que alcanza
--  a las columnas nuevas. Sigue sin `DELETE` (regla 4): un pago muerto se vuelve a
--  poner en camino o se explica, no se borra.
-- ============================================================================

ALTER TABLE pago_evento ADD COLUMN no_antes_de    timestamptz;
ALTER TABLE pago_evento ADD COLUMN fallando_desde timestamptz;

ALTER TABLE pago_evento ADD CONSTRAINT pago_evento_no_antes_de_ck
    CHECK (no_antes_de IS NULL OR estado = 'PENDIENTE');

COMMENT ON COLUMN pago_evento.no_antes_de IS
    'Cuando se puede volver a intentar este evento (#131). Nulo: en la vuelta que toque. Lo pone '
    'el publicador tras un fallo que no lo mata: la espera crece con lo que el pago lleva fallando, '
    'con un tope (`kamayuk.caja.entrega.espera-maxima`). Solo un PENDIENTE lo lleva.';
COMMENT ON COLUMN pago_evento.fallando_desde IS
    'El primer fallo de la racha en curso (#131). El pago muere en el primer fallo que llega '
    'cuando ya lleva `kamayuk.caja.entrega.plazo` sin llegar desde aqui. Nulo al entregarse, y al '
    'volver a ponerlo en camino (`POST /pagos/{pagoId}/reintento`), que abre una racha nueva.';
