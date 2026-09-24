# ADR-0044 — La ventanilla anula donde está el recibo, y ésa es su primera escritura

| Campo | Valor |
|---|---|
| Estado | **Aceptado** |
| Fecha | 2026-09-20 |
| Decide | `caja`, por decisión del usuario en [`caja`#100](https://github.com/hneyra/caja/issues/100) |
| Nace de | [`caja`#100](https://github.com/hneyra/caja/issues/100): la séptima hoja del árbol no llevaba a ninguna parte |
| Amplía | [ADR-0040](ADR-0040-la-ventanilla-se-conecta.md), que aceptó conectar la ventanilla **sólo para leer** |
| Conserva | [ADR-0042](ADR-0042-la-ventanilla-lee-su-propia-copia.md) sin cambio: se sigue hablando con `/caja/api/v1` y con el emisor, y con nadie más |
| No toca | [ADR-0026](https://github.com/hneyra/rentas/blob/main/docs/30-arquitectura/adr/ADR-0026-el-camino-del-dinero.md): la caja publica el `PagoAnulado`; quien reversa la deuda es el sistema que emitió la orden |

## Contexto

El árbol de la ventanilla se dibujó en #74 con una regla sencilla: **una hoja por acceso del
catálogo**. Siete accesos, siete hojas, y una guarda que lo ata contra los `.java`
(`el-arbol-cuadra-con-el-backend`).

La regla se rompió en el séptimo, y no por casualidad. Lo medido en #100:

- **`anulacion-recibo` no podía pedir nada.** Su única operación es `POST /cobros/{nro}/anulacion`,
  así que su pantalla tenía un título, una nota, un aviso y **cero campos**. La hoja caía en
  `SOLO_ESCRIBE` y lo decía; era cierto y era inútil.
- **Y hay una cuenta para la que esa hoja era TODO lo que veía.** Está escrito como prueba y pasaba:
  con `anulacion_recibo: [eliminacion]` y nada más, el catálogo filtrado tenía **una** entrada, y era
  ésa. El filtrado por permisos está bien —basta un privilegio, y anular no exige leer—; lo que no
  había era nada detrás.
- **Y para anular hace falta ver el recibo, que lo sirve otro acceso.** `GET /recibos` y
  `GET /recibos/{nro}/duplicado` los abría sólo `duplicado_recibo`. De modo que esa cuenta no podía
  ver ni un recibo, y anular un número escrito a ciegas —sobre un cobro cuyo importe y cuyo pagador
  no se han visto— es exactamente lo que ADR-0026 §4 y la regla 10 tratan de impedir.

El issue planteaba tres salidas: darle a la hoja su propia búsqueda y su propia ficha, exigirle
además `duplicado_recibo`, o **que anular deje de ser una hoja y pase a ser una acción dentro de
`duplicado-recibo`**, donde el recibo ya está elegido y a la vista (#99).

Y por encima estaba ADR-0040, que aceptó conectar la ventanilla **para leer** y dejó cobrar, cerrar
y anular declaradas y sin llamarse.

## Decisión

**Anular se ofrece donde está el recibo, como acción, y esa acción escribe.**

Tres partes, y las tres son la decisión:

### 1 · La hoja suelta desaparece

`anulacion-recibo` sale del árbol. El árbol pasa de siete hojas a seis.

**Un acceso del catálogo puede servirse desde una acción dentro de otra hoja.** Es lo único que
cambia de la regla de #74, y se escribe en el árbol: cada hoja puede declarar `acciones`, y cada
acción declara **qué acceso sirve** y **qué operación llama**. La correspondencia sigue siendo
exacta —ningún acceso sin quien lo sirva, ninguno servido dos veces—, y lo sigue atando la misma
guarda contra los `.java`.

### 2 · La acción escribe, y es la primera escritura de esta interfaz

Llama a `POST /cobros/{nro}/anulacion` con el número que ya está en la ruta de la hoja, nunca con
uno tecleado. **ADR-0040 se amplía aquí y sólo aquí**: cobrar, cobrar tasas, cerrar el turno y
explicar un pago siguen declaradas y sin llamarse, y una guarda lo comprueba buscando sus rutas en
el código servido.

La escritura vive en **un solo archivo** (`datos/laAnulacion.ts`), y eso no es una convención: el
barrido de `verificaciones/solo-lee.test.ts` recorre `src/` entero y cualquier otro archivo que
componga una petición que escriba sale en rojo con su ruta. La guarda cambió **en el mismo PR que
este ADR**, y se apretó en vez de aflojarse: ahora nombra cuál es la escritura que se llama y desde
dónde.

**La regla 10 va dentro de la decisión.** La anulación se pide con un *acto*: motivo —el sustento
del acto administrativo, que queda en el recibo y se imprime en su duplicado—, quién la autoriza, el
memorando que la respalda, y la **observación**, que es otra cosa y va siempre. Sus límites son los
de `Observacion` del dominio, leídos de allí y no escritos a ojo. Y como no se deshace, se confirma
antes de enviar — nunca con un `confirm()` del navegador.

### 3 · El acceso que se quedó sin hoja no se queda sin lista

`GET /recibos` y `GET /recibos/{nro}/duplicado` pasan a declarar `oTambien = {"anulacion_recibo"}`,
con el mismo `LECTURA`. Es el precedente exacto de `CatalogoDeCajasController`: una lectura que dos
opciones del catálogo necesitan por igual, y que sin esto obliga a otorgar la opción ajena entera
**en cada implantación**.

El `?formato=` **no** entra: reimprimir un papel no es parte de anular, y exige `IMPRESION`.

### 4 · Lo tecleado sobrevive a un 401, guardado en la pestaña — y no es una segunda escritura

El token dura quince minutos y esta interfaz no lo renueva (la renovación silenciosa de
`@kamayuk/sesion` sigue pendiente). Un 401 a mitad del acto no puede perder motivo, quién autoriza,
el memorando y la observación: volver a entrar es una página nueva, y sin nada que lo retenga la
vuelta borra el formulario. Por eso, desde #117, `datos/borradorDeLaAnulacion.ts` copia lo tecleado
a `sessionStorage`, bajo la clave `kamayuk.caja.borrador-de-la-anulacion`.

**Qué guarda.** Exactamente lo que la persona escribió en los campos del acto — nunca lo que el
backend contestó, nunca el token ni nada que se le parezca. Se guarda con la cuenta de
`GET /seguridad/sesion` y sólo se devuelve a esa misma cuenta: en una PC de ventanilla que varios
turnos comparten, el borrador de otra cuenta se descarta en vez de ofrecerse a quien entra después.

**Dónde.** `sessionStorage`, no el almacenamiento que persiste: es de esta pestaña y este turno.
Sobrevive a la ida y vuelta al emisor —que es la misma pestaña— y muere con ella.

**Cuándo se borra.** Al anular con éxito, al cerrar el acto —que es cancelarlo— y al cerrar la
sesión, antes de irse al emisor. La única excepción es cerrar el acto que sigue a un rechazo 401:
ahí cerrar no es cancelar, es el paso que el propio remedio pide —cerrar, recargar, volver a
entrar—, y el borrador tiene que seguir ahí para encontrarse al volver.

**Por qué no es una segunda escritura.** No manda nada a ningún backend, no representa un estado del
recibo ni de la sesión, y desaparece sola con la pestaña o con la cuenta que la dejó. La única
escritura de esta ventanilla sigue siendo el `POST` de la sección 2, y `verificaciones/solo-lee.test.ts`
lo sigue vigilando sobre `src/` entero sin una excepción nueva. El borrador es memoria del
formulario, no un segundo camino hacia el backend, y `verificaciones/camino-a-la-api.test.ts`
mantiene la lista exacta de lo que ese único archivo puede importar — para que no gane, ni por
accidente, un camino hacia la puerta o hacia el cliente que sí escribe.

## Lo que ve quien sólo puede anular

Es la pregunta que #100 exigía contestar por escrito, y la respuesta no es «una pantalla vacía».

| Lo que tiene la cuenta | Lo que ve |
|---|---|
| `anulacion_recibo: [lectura, eliminacion]` | La hoja «Duplicado de recibo», su lista, la ficha del recibo que elija, y el botón de anular **pulsable**. Sin `duplicado_recibo` |
| `anulacion_recibo: [eliminacion]` | La misma hoja. La lista contesta 403 y la pantalla lo dice en el hueco; el botón de anular sale **impedido con su motivo**, y el motivo nombra qué pedir: lectura sobre «Anulación de recibo» o sobre «Duplicado de recibo» |
| `duplicado_recibo: [lectura]` y nada más | La hoja entera, y el botón de anular impedido con su motivo, que nombra la opción del catálogo que le falta |
| Ninguno de los dos | La hoja no se ofrece. Es lo que el filtro por permisos ya hacía |

**La segunda fila es el límite de la decisión, y se escribe en vez de esconderse.** `oTambien`
conserva el privilegio —`LECTURA` sobre la propia **o** `LECTURA` sobre la alternativa, medido en
`GuardiaDeAccesoTest`—, así que una cuenta con sólo `ELIMINACION` sigue recibiendo un 403 en la
lista. Relajarlo a «cualquier privilegio sobre la alternativa» convertiría `oTambien` en el modo
permisivo que su propio javadoc dice que no es, y eso sería un mecanismo nuevo con su propia
decisión. Lo que corresponde con esa cuenta es otorgarle además `LECTURA` sobre su propia opción — y
la ventanilla se lo dice, en el motivo del botón, en vez de dejarla mirando una pantalla que no
explica nada.

## Consecuencias

- **La ventanilla deja de ser de sólo lectura**, y esa frase no se puede volver a decir sin
  matizarla. Lo que se puede decir, y lo que las guardas sostienen, es: **lee siempre y escribe en un
  sitio**.
- **Una entrada de menú que no lleva a ninguna parte es un defecto**, no un hueco. El árbol de esta
  ventanilla ya no tiene ninguna: las seis hojas leen.
- **`AMBIENTE_SIN_INTERFAZ` sigue donde está.** Esto no adelanta el paso 5 de ADR-0040: la ruta de
  `prod` se retira la última, y sigue sin retirarse.
- **La conciliación y el cierre siguen sin escribirse.** Que exista un camino para escribir no abre
  los demás: cada uno llega con su decisión, y el barrido de `solo-lee` los mantiene declarados y sin
  llamarse hasta entonces.
- **La cuenta de hojas cambió en ocho sitios** —guardas, arneses y centinelas—, y eso es lo que
  costaba tener esa cuenta escrita. Se deja así: un centinela que no cuenta nada no avisa de nada.

## Alternativas consideradas

### 1 · Darle a la hoja su propia búsqueda y su propia ficha

Duplicar dentro de `anulacion-recibo` lo que `duplicado-recibo` ya hace: el filtro, la lista, la
selección de fila y la ficha del recibo.

**Lo que cuesta**: dos pantallas que hacen lo mismo y divergen a la tercera semana, y dos sitios
donde arreglar el día que el listado cambie. Y no resuelve el fondo: seguirían siendo **dos**
caminos hasta el mismo recibo, y quien lo tiene delante en una tendría que buscarlo otra vez en la
otra para anularlo.

### 2 · Que la hoja exija además `duplicado_recibo`

Dejar la hoja donde está y ofrecerla sólo a quien tenga los dos accesos.

**Lo que cuesta**: decide en la interfaz quién puede anular, que es justo lo que ADR-0042 dice que
no se hace aquí. Y deja la hoja igual de muda: seguiría sin poder pedir nada.

### 3 · No conectar la escritura todavía

Escribir la decisión de forma y dejar el `POST` para otro issue, como ADR-0040 fijó para #74.

**Lo que cuesta**: la acción se ofrecería y no haría nada, que es el mismo botón mudo con otro
aspecto. Si anular pasa a ser una acción **dentro de una pantalla que sí funciona**, una acción que
no escribe se lee como una avería de esa pantalla y no como una entrega a medias.

## Lo que este ADR no decide

- **Ni cobrar, ni cerrar el turno, ni explicar un pago.** Siguen declaradas y sin llamarse, y cada
  una llega con su decisión.
- **Ni el reintento seguro de una escritura.** Este backend no lee `Idempotency-Key` en esta ruta;
  un segundo envío del mismo recibo contesta 409, que es una respuesta cierta y legible. Mandar una
  clave que nadie lee daría la ilusión contraria.
- **Ni el saco de palabras de las piezas de `@kamayuk/ui`.** Las que el intérprete dice por su cuenta
  —«Esto no se deshace», «Sí, confirmar», «Falta rellenar…»— siguen llegando en su castellano por
  omisión, como ya pasaba con las de las tablas de #99. Es un hueco anterior a esta decisión y
  uniforme; traducir sólo las del acto dejaría el saco a medias, que es peor.
