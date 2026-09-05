# P5D — `caja` extraída: el `COMMIT` que se parte en dos

**Fecha:** 2026-09-04. **Origen:** `rentas@93b40d7` (que viene de `sgtm@0d33ad7b` por P5A, P5B y P5C).
**Repositorios tocados:** `caja` (destino) y `rentas` (origen de la resta).
**`sgtm` no se tocó:** `git status` queda limpio, sin un solo archivo modificado.
**Corridas:** `build verificarArquitectura verificarAislamiento` en verde en los dos repositorios,
contra PostgreSQL 16.15 real (`127.0.0.1:55444`) y **no por Testcontainers** (§10, hueco 9).
`rentas` **3 076** pruebas · 0 fallos; `caja` **667** · 0 fallos. El recuento método a método,
en §6.bis.

Es la tercera extracción de verdad y la única que **convierte un `COMMIT` en dos**. ADR-0003 la
nombró como su mejor argumento para no separar —«transacciones distribuidas en el camino del
dinero»— y tenía razón: lo que aquí se pierde no se recupera con ningún mecanismo, se sustituye por
una conciliación diaria que pasa de buena práctica a obligación operativa.

---

## 1. Los cuatro criterios, con su medida

| # | Criterio | Estado | Medida |
|---|---|---|---|
| **1** | **Treinta días** consecutivos de conciliación a cero, con el camino viejo encendido | **NO SE CUMPLE, y no se puede cumplir aquí.** §2 | La conciliación está construida y medida sobre **ocho días simulados**; los treinta son tiempo de calendario. §2 |
| **2** | Con `rentas` apagado, la ventanilla **sigue cobrando** y emitiendo recibo | **Cumplido**, contra un puerto muerto de verdad | §3 |
| **3** | Un pago inyectado dos veces con el mismo `pagoId` produce **UN solo asiento** | **Cumplido**, y con diez hilos | §4 |
| **4** | Una anulación produce un **asiento de reversión** y **ningún `DELETE`** | **Cumplido**; el `DELETE` lo comprueba el escáner de fuentes, no una lectura del código | §5 |

---

## 2. Criterio 1 — por qué no se cumple, y qué sí se midió

**«Treinta días consecutivos» es tiempo de calendario.** No cabe en una corrida de pruebas y no hay
forma honesta de simularlo: treinta días de operación real son treinta días de ventanilla real, con
sus cortes de red, sus despliegues y sus cajeros. Inventar una métrica que se le parezca —«treinta
conciliaciones seguidas en un bucle»— diría que se cumplió algo que no se cumplió.

**Lo que sí está construido y medido** es la conciliación entera y su prueba:
`ConciliacionDeNDiasTest` levanta un sistema de origen de verdad —un `ServerSocket` que habla
HTTP—, cobra **ocho días de caja** con su turno cada uno, entrega los ocho eventos y comprueba que
los ocho cuadran. Y sobre todo comprueba que **deja de cuadrar** en cuanto falta algo, que es la
mitad que importa:

| Rotura | Resultado |
|---|---|
| El origen dice haber aplicado 40,00 donde la caja cobró 100,00 | La línea trae `diferencia = 60,00` y el día no cuadra |
| El origen dice que rechazó uno, con la cifra coincidiendo | **No cuadra igual.** Un día con la diferencia en cero y un pago rechazado cuadra *por casualidad* |
| Un evento se devuelve a `PENDIENTE` —que es como está entre los dos `COMMIT`— | No cuadra: hay un pago en tránsito |

**Y hay una segunda distancia que también hay que decir:** esto corre contra **datos de
demostración**, no contra la operación de una municipalidad. Un día de caja de verdad tiene cobros
que la prueba no imagina.

### El camino viejo detrás de una bandera: **no está, y por qué**

ADR-0026 §4 lo pide, y **no se construyó**. El motivo es que **el camino viejo ya no existe**:
`V7__baja_de_caja.sql` retiró de la base de `rentas` las diez tablas de la caja, y `CobrarDeuda`
—la clase que hacía el `COMMIT` único— se borró. Una bandera que eligiera entre dos caminos
necesitaría los dos, y mantener el viejo habría significado **no hacer la resta**: dejar las tablas
de caja duplicadas en las dos bases, con dos recibos posibles para el mismo cobro.

Lo honesto es decirlo así: **la bandera no se puede ejercitar porque no hay dos caminos**, y por
tanto el criterio 1 tal como está enunciado —treinta días *en paralelo*— no es alcanzable desde
esta etapa. Lo que sí queda es la conciliación, que es el instrumento con el que esos treinta días
se medirían el día que la instalación exista.

### El camino nuevo, en cambio, sí está entero (corregido tras la primera entrega)

La primera versión de este documento declaraba como hueco 1 que **nadie emitía una orden de cobro
tributaria**, y eso no era un hueco: era una **regresión funcional que esta etapa introdujo**.
`CobrarDeuda` leía el libro y cobraba en un solo acto; la resta lo borró y se reescribió sólo la
mitad de cobrar, de modo que la ventanilla podía cobrar una tasa de punta a punta y una deuda
tributaria **no**. Los siete métodos huérfanos de `CobrarEnVentanillaTest` (§6.bis) eran la prueba
exacta de eso: no es que se hubieran movido, es que el camino no existía.

Se cerró escribiendo la mitad que faltaba —`EmitirOrdenDeCobro` y `POST
/rentas/api/v1/ordenes-de-cobro`, en `rentas`— y reponiendo con ella la cobertura. Lo que se puede
ejercitar hoy de punta a punta es: **la ventanilla marca deuda → `rentas` emite las órdenes contra
el libro → `caja` cobra e imprime → `caja` publica el pago → `rentas` lo imputa**. Lo que sigue sin
poder ejercitarse son los treinta días de calendario, que es otra cosa y sigue declarado arriba.

---

## 3. Criterio 2 — la ventanilla cobra con el origen apagado

`CobrarConElOrigenApagadoTest`, contra PostgreSQL real y como `sgtm_app`.

**El apagado no se simula con un doble que lance**: el cliente HTTP se apunta a **un puerto que
nadie escucha**, abriendo un `ServerSocket(0)` y cerrándolo. Un doble que lanza prueba que el
código maneja una excepción; un puerto muerto prueba que la excepción **ocurre** por donde se cree.
Es el mecanismo de `SinNormativaFronteraTest` (P5B).

Lo medido, con el origen caído:

- la cobranza **emite recibo** con su total correcto y marca la orden `PAGADA`, en la misma
  transacción;
- el pago queda **`PENDIENTE` con su hora** —el «pago en tránsito» de ADR-0026 §4—;
- el cuerpo del evento lleva la referencia externa y el importe **como cadena** (RNF-055), y **no
  lleva imputación**: la prueba exige que no aparezcan las palabras `insoluto` ni `interes`, porque
  si aparecieran la regla del art. 31 estaría escrita en dos sitios;
- el publicador **reintenta** contando el intento y **no pierde** el pago;
- agotados los intentos el evento **muere y dispara la alerta**;
- y la conciliación de ese día **no trae ceros**: trae `porQueNoSeSabe` con el motivo. Un cero se
  leería como «no aplicaron nada», indistinguible de un día sin cobros, y la conciliación diría que
  cuadra — el criterio de #48 con la licencia que salía con «valor de obra 0,00».

**Lo que hace cierto el criterio se lee en la lista de dependencias del módulo**: `kamayuk-caja-caja`
no declara `implementation(project(...))` de ningún otro contexto, y `CajaController` no inyecta un
solo puerto hacia otro sistema. No es que la ventanilla tolere que `rentas` esté caído: es que **no
le pregunta nada**.

> **R-N (2026-09-05) renombró los tres.** `kamayuk-rentas-rentas`, `kamayuk-catastro-catastro` y `kamayuk-caja-caja` son hoy `kamayuk-<sistema>-nucleo`, con su paquete `kamayuk.<sistema>.nucleo`. Lo de arriba se deja como se escribió —es lo que se decidió entonces— y el porqué del cambio está en `infrastructure/docs/00-gobierno/R-N-los-tres-modulos-repetidos.md`.

---

## 4. Criterio 3 — un pago inyectado dos veces, un solo asiento

`PagoInyectadoDosVecesTest`, en `rentas`, contra PostgreSQL real.

La garantía es **`pago_recibido_uq` sobre el `pagoId` que generó la caja**, no una comprobación
previa en Java. Que el identificador lo genere **quien emite** y no el transporte es lo que hace
posible el criterio: un reintento de entrega manda el mismo `uuid`.

| Qué se midió | Resultado |
|---|---|
| Dos entregas secuenciales del mismo `pagoId` | **1 asiento**, y el segundo intento devuelve el pago que ya estaba |
| **Diez hilos** entregando el mismo `pagoId` a la vez | **1 asiento y 1 fila de buzón** |
| Un pago que el libro no admite | Queda `RECHAZADO` **con su motivo**, sin ningún asiento, y **la fila sigue**: es dinero cobrado que alguien tiene que mirar |

### Los TRES defectos que encontró escribir esta prueba

**1. `jsonb` no devuelve el texto que se guardó.** El cuerpo del evento entra como
`"referenciaExterna":"PREDIAL|2026||"` y PostgreSQL lo devuelve reserializado, **con un espacio
detrás de los dos puntos**. Una búsqueda de subcadena escrita contra el texto original no encuentra
nada, y el síntoma no se parece a la causa: el pago se rechaza diciendo «no trae ninguna
obligación» sobre un cuerpo que las trae todas. Es el mismo hallazgo que #653 midió en
`auditoria.datos_nuevos`. Se lee con un patrón que tolera el espacio, y queda escrito en el javadoc
del repositorio.

**2. Atrapar la excepción del libro no sirve de nada, y hubo que descubrirlo dos veces.**
`RegistroDeAbonos.abonarPagoIntegro` es `@Transactional`; cuando rechaza, deja la transacción de
fuera marcada como *rollback-only*. Atraparla no la desmarca: el `commit` muere con
`UnexpectedRollbackException` y se lleva por delante **la marca del rechazo**. Es el defecto que
#328, #54, #72 y #430 midieron cuatro veces con otras formas.

La primera corrección —marcar el rechazo en una transacción nueva— **siguió fallando**, y por un
motivo distinto: la fila que iba a marcar **tampoco estaba**, se había ido con la transacción
deshecha. Por eso el rechazo **se inserta y no se marca**.

La tercera vuelta fue la del proxy: `recibir` y `recibirEImputar` estaban en la **misma clase**, así
que `@Transactional` no se aplicaba por auto-invocación y salía `unrecognized configuration
parameter "app.municipalidad_id"` — sin transacción no hay `SET LOCAL` y RLS **revienta** (#486). Es
la lección de #536 y #430 aprendida por tercera vez, y por eso son **tres beans**: `RecibirPago` (sin
transacción), `ImputacionDelPago` (`@Transactional`) y `RechazoDelPago` (`REQUIRES_NEW`).

**3. Y un INTERBLOQUEO, que se colgó sin decir nada.** Con `recibir` llamado **dentro** de una
transacción ajena, la de fuera se queda abierta con la fila del buzón ya insertada y marcada
*rollback-only*, y `RechazoDelPago` abre una nueva que intenta insertar **el mismo `pago_id`**: el
índice único la hace esperar a que la primera termine, y la primera espera a que la segunda vuelva.
La corrida se colgó sin un solo mensaje, y lo que lo dijo fue el catálogo del motor:

```
 47018 | idle in transaction | Client | ClientRead    | SELECT a.id, a.ejercicio, …
 47019 | active              | Lock   | transactionid | INSERT INTO pago_recibido (…)
```

Un cuelgue sin mensaje en el camino del dinero es lo peor que puede pasar, así que **la guarda está
en el código**: `RecibirPago.recibir` se niega a correr con una transacción activa y dice
exactamente qué hacer. En producción no puede pasar hoy —`PagoController.recibir` no lleva
`@Transactional`— y ahora tampoco puede empezar a pasar sin que alguien lo vea.

---

## 5. Criterio 4 — la anulación reversa, y no borra

Las dos mitades se miden por caminos distintos, y eso es deliberado.

**Que reversa** lo mide `PagoInyectadoDosVecesTest`: tras la anulación, los asientos del cobro
**siguen ahí**, el libro tiene **más filas que antes** —no menos— y los nuevos van marcados con
`ANULACION RECIBO …` para poder encontrarlos. Y una anulación inyectada dos veces **no reversa dos
veces**: reversar dos veces dejaría al contribuyente debiendo el doble de lo que pagó, que es el
defecto que #34 midió con cuatro anulaciones donde debe haber una.

**Que no borra lo comprueba el escáner de fuentes**, que es lo que el encargo pide —«compruébalo
con el escáner, no leyendo el código»—:

- en `rentas`, `cuenta_corriente_asiento` está en `TABLAS_PROTEGIDAS` desde el monolito;
- en `caja`, `TablasDelSgtm.PROTEGIDAS` se reescribió para este sistema y son **siete**: `recibo`,
  `recibo_detalle`, `recibo_movimiento`, `cierre_turno`, `cierre_turno_detalle`, y las dos que
  estrena P5D — **`orden_de_cobro`** y **`pago_evento`**.

`pago_evento` entra ahí por el mismo motivo que las demás: **es la constancia de que un cobro se le
comunicó al sistema que lo emitió, o de que no se pudo**. Si esa fila se pudiera borrar, un pago
perdido dejaría de existir y el turno cerraría.

---

## 6. Cómo quedó partido `tesoreria`

El módulo **no se movió entero: se partió por dentro**, que es lo que lo distingue de P5B y P5C.

| | A `caja` | Se queda en `rentas` |
|---|---|---|
| Clases de `src/main` | **76** borradas de `rentas` y reescritas aquí | **33** del convenio y el fraccionamiento coactivo, **más la mitad de `CobrarDeuda` que pide** (`EmitirOrdenDeCobro`) |
| Tablas | 10 (`V7` las retira de `rentas`) | `convenio`, `convenio_cuota`, `convenio_deuda`, `convenio_movimiento`, `convenio_correlativo` |

**El convenio se queda porque es deuda reprogramada** (ADR-0026 §5): tiene interés, tiene quiebre y
tiene consecuencias coactivas. Si viajara a la caja, la caja adquiriría reglas tributarias y dejaría
de servir para cobrar un puesto de mercado — que es la razón entera de la separación.

**`CobrarDeuda` es la única clase que se partió por dentro**, y no en dos módulos sino en dos
sistemas: leía el libro y cobraba en un solo acto. Lo que lee el libro y compone la orden se quedó
aquí como `EmitirOrdenDeCobro`; lo que cobra se fue como `CobrarOrdenes`. **La primera entrega de
esta etapa sólo reescribió la segunda mitad**, y el resultado era que la ventanilla podía cobrar una
tasa de punta a punta y una deuda tributaria no: está contado en §2 y en §6.bis, y se cerró.

**Y la ventanilla no cambia:** la cuota inicial de un convenio se cobra «como cualquier otra
orden». `TipoDePago` pierde de hecho tres de sus cinco valores —`A_CUENTA`, `PRECONVENIO` y
`CUOTA_CONVENIO` ya no los puede escribir nadie— y el `CHECK` de la base **no se estrecha**:
hacerlo sobre una tabla con filas es un problema de datos, y las filas viejas siguen diciendo la
verdad de cuando se escribieron (la lección de `V64`).

### Los tres puertos que `rentas` conserva, intactos

`RecibosDeTramite`, `AvanceDeCaja` y `CobrosDeTasas` **no se tocaron**. Por eso `licencias`,
`sanciones`, `coactiva` e `indicadores` **no cambiaron ni una línea de `src/main`** — la propiedad
que ARQ-01 §4 compró y que aquí se cobró por tercera vez. Lo único que cambia es quién los
implementa: un cliente HTTP contra las rutas que `caja` publica.

### Y un cuarto puerto que hizo falta inventar

`CerrarConvenio` leía `recibo_movimiento` directamente para exigir que el recibo de la cuota inicial
esté anulado antes de anular el convenio. Esa comprobación **no se puede hacer con
`RecibosDeTramite`**: ese puerto pregunta por el **número impreso** y `convenio_movimiento` guarda
el **id interno**. Devolver `false` haría imposible anular cualquier convenio formalizado; devolver
`true` dejaría anular uno con su inicial cobrada y viva —dinero cobrado por un acto que ya no
existe, y ningún arqueo lo detecta—.

Se resolvió con un puerto nuevo, `AnulacionesDeRecibo`, y **`caja` publica la ruta que lo sirve**:
`GET /caja/api/v1/recibos/por-id/{reciboId}`. Es la única ruta de esta frontera que expone un id
interno de la base de la caja, y se hace a propósito: la alternativa era cambiarle una columna a una
tabla viva de `rentas` por comodidad de la frontera.

---

## 6.bis El recuento de pruebas, contado una a una

Ninguna prueba puede desaparecer sin estar en otro sitio. Lo medido, contra PostgreSQL 16.15 real
y con los dos `build verificarArquitectura verificarAislamiento` en verde:

| | Antes (`rentas`) | Después |
|---|---|---|
| `rentas` | **3 246** | **3 076** · 0 fallos |
| `caja` | — | **667** · 0 fallos |

### Las 186 que `rentas` perdió, y dónde están

`rentas` baja exactamente 186, y la cuenta cierra al método:

- **−191**: los métodos anotados de las **14 clases de prueba borradas** de
  `kamayuk-rentas-tesoreria` (`AnularYDuplicarTest` 14, `CerrarYArquearTest` 11,
  `CobrarEnVentanillaTest` 15, `ArqueoDelTurnoTest` 15, `ReciboYSuNumeroTest` 11, `TasaTest` 5,
  `AltaDeCajasJdbcTest` 11, `CajaJdbcTest` 17, `CierreDeCajaJdbcTest` 14, `ReciboJdbcTest` 26,
  `CajaControllerTest` 11, `CatalogoDeCajasFronteraTest` 11, `CierreYRecaudacionControllerTest` 13,
  `ReciboControllerTest` 17).
- **+5**: `PagoInyectadoDosVecesTest`, la prueba nueva del buzón de entrada (criterios 3 y 4).
- **+16**: `EmitirOrdenDeCobroTest` (11) y `OrdenDeCobroControllerTest` (5), la mitad que la resta
  se había dejado sin reescribir. Once de esas dieciséis son la reposición de los cinco métodos
  huérfanos que sí tenían contraparte, más nueve afirmaciones que el camino viejo no podía tener
  porque no había dos sistemas (§6.bis).

−191 + 5 + 16 = **−170**. 3 246 − 170 = **3 076**, que es lo que la corrida mide.

### El desglose de `rentas`, por módulo

| Módulo | Pruebas | | Módulo | Pruebas |
|---|---|---|---|---|
| `rentas-rentas` | 595 | | `rentas-seguridad` | 180 |
| `rentas-fiscalizacion` | 298 | | `rentas-plataforma` | 177 |
| `rentas-licencias` | 285 | | `rentas-dominio-compartido` | 154 |
| `rentas-cuentacorriente` | 273 | | `rentas-tesoreria` | **134** |
| `rentas-sanciones` | 240 | | `rentas-aplicacion` | 130 |
| `rentas-coactiva` | 197 | | `rentas-contribuyentes` | 80 |
| `rentas-valores` | 181 | | `rentas-parametros` | 54 |
| `rentas-indicadores` | 57 | | `rentas-esquema` | 41 |
| `rentas-catastro` | 0 (adaptador cliente desde P5C) | | | |

### Las 667 de `caja`, por módulo

| Módulo | Pruebas |
|---|---|
| `kamayuk-caja-caja` | **216** |
| `kamayuk-caja-plataforma` | 177 |
| `kamayuk-caja-dominio-compartido` | 154 |
| `kamayuk-caja-aplicacion` | 84 |
| `kamayuk-caja-esquema` | 36 |

Las **451** de los cuatro módulos que no son el contexto son la barrera y el andamio que cada
sistema tiene por su cuenta desde P5B —la prueba de aislamiento, el filtro del token, las reglas de
ArchUnit, los objetos de valor—: **no son pruebas migradas ni pruebas duplicadas de negocio**, son
la misma barrera aplicada a otro esquema, y por eso `rentas` conserva las suyas.

Las **216** de `kamayuk-caja-caja` se descomponen así:

- **203** en las 14 clases herederas (`AnularYDuplicarTest` 15, `CerrarYArquearTest` 12,
  `CobrarTasasEnVentanillaTest` 13, `ArqueoDelTurnoTest` 15, `ReciboYSuNumeroTest` 11, `TasaTest` 5,
  `AltaDeCajasJdbcTest` **11**, `CajaJdbcTest` 23, `CierreDeCajaJdbcTest` 17, `ReciboJdbcTest` 27,
  `CajaControllerTest` 14, `CatalogoDeCajasFronteraTest` 11, `CierreYRecaudacionControllerTest` 13,
  `ReciboControllerTest` 17), es decir **doce más** que las 191 que salieron de `rentas`.
- **+13** nuevas: `CobrarConElOrigenApagadoTest` (6, criterio 2) y `ConciliacionDeNDiasTest`
  (6, criterio 1 parcial), más la que se recuperó (abajo).

### Los siete métodos huérfanos, uno por uno

`CobrarEnVentanillaTest` era una sola clase para dos cobros —el de una deuda tributaria y el de una
tasa— y **sólo su mitad de tasas viajó**, como `CobrarTasasEnVentanillaTest`. Los otros siete
medían `CobrarDeuda`, que leía el libro y cobraba en un solo acto: esa clase no existe en ningún
repositorio, así que cada uno se rehizo contra el camino nuevo o se retiró diciendo por qué.
**Ninguno se queda sin sitio.**

| Método original | Dónde acabó |
|---|---|
| `elImporteSaleDelLibro` | **Reescrito**, mismo nombre, en `EmitirOrdenDeCobroTest` (`rentas`): el importe de la orden es la suma de las cuatro partes que devuelve `ConsultaDeDeudaPublica`, y la petición **no tiene componente donde poner uno** |
| `elReciboLlevaLaFechaDeLaDeuda` | **Reescrito** como `laOrdenLlevaLaFechaConLaQueSeLeyoElLibro`: la fecha va **dentro de la referencia** (`PREDIAL\|2026\|71\|\|2026-03-16`), que es la regla 9 aplicada a la identidad de la orden |
| `cobrarDosVecesNoEncuentraNada` | **Reescrito** como `emitirDosVecesNoEncuentraNada`: imputado el pago, el libro ya no tiene esa deuda y la segunda emisión falla con `NadaQueCobrar` |
| `elBeneficioNoDescuenta` | **Reescrito** como `noHayDondeDeclararUnBeneficio`, y ahora es **estructural**: en el monolito la campaña se guardaba en el recibo *como constancia y sin efecto* (D-02b); aquí no viaja siquiera, ni en la petición de la pantalla ni en la del puerto |
| `laMismaObligacionDosVecesSeRechaza` | **Reescrito**, mismo nombre: en la caja las dos líneas compartirían referencia, la segunda sería un reintento de la primera y se cobraría **la mitad de lo que la pantalla enseñó** |
| `elLibroSabeQueReciboLoOrigino` | **RETIRADO con su motivo.** Lo que medía —que el abono lleve `documento_origen = "RECIBO <n>"`— lo mide hoy `PagoInyectadoDosVecesTest` **contra PostgreSQL real**, leyendo la fila. Rehacerlo aquí sería una segunda copia de la misma afirmación, y la de allá es más fuerte |
| `unTipoDePagoNoImplementadoSeRechaza` | **RETIRADO con su motivo.** `TipoDePago` ya no cruza esta frontera: con qué se paga es de la caja y se elige **al cobrar**, no al emitir. Los tres valores que rechazaba —`A_CUENTA`, `PRECONVENIO`, `CUOTA_CONVENIO`— quedaron sin escritor posible, y eso está en §6 |

Y con ellos entraron **nueve** que el camino viejo no podía tener, porque no había dos sistemas:
que la petición no lleve importe ni beneficio (dos afirmaciones estructurales sobre los
componentes del `record`), que el mismo día la misma obligación sea la **misma** orden y otro día
**otra**, que una fila marcada sin deuda **salga nombrada** en vez de desaparecer del total, que el
libro se lea **una vez por petición** y no una por obligación, y que si la caja no contesta no se
devuelva una orden inventada.

#### Que las nuevas pueden fallar

Cinco roturas sobre `src/main`, cada una aplicada sola y restaurada **por copia comprobada con
`cmp`**:

| Rotura | Rojas |
|---|---|
| La referencia pierde su fecha (`texto()` sin `actualizadoA`) | **2** — la de la fecha y `otroDiaEsOtraOrden`, que pasa a devolver la misma orden con el importe de la semana pasada |
| Sin la guarda de la obligación repetida | 1 |
| Sin `NadaQueCobrar`: se devuelve una emisión vacía | 1 |
| El importe se toma del `insoluto` y no del total | 1 — «expected 340.00» |
| El libro se relee dentro del bucle, una vez por obligación | 1 |

### Y una que sí se recuperó al hacer la cuenta

`AltaDeCajasJdbcTest.elArchivoDeEjemploSeCargaEntero` se había quedado atrás: leía el archivo real
`infra/carga-de-datos/ejemplos/cajas.csv`, y ese archivo estaba en `rentas` mientras el importador
que lo carga viajaba aquí. El síntoma no era un rojo, era un **10 donde el original decía 11**, y
solo apareció contando método a método. Se trajo el archivo con su README a
`caja/infra/carga-de-datos/` —`caja` es quien tiene ahora `area` y `caja`— y el método volvió: la
clase mide 11 otra vez.

---

## 7. El `REVOKE` sobre `cierre_caja`, replanteado — y una premisa de ADR-0026 que es falsa

ADR-0026 dice que el `REVOKE UPDATE ON cierre_caja` que `V32` del monolito no pudo hacer «se
replantea en el sistema nuevo, **donde el cierre ya no comparte base con el libro**».

**Esa premisa es falsa, y conviene decirlo.** Que el libro estuviera en la misma base nunca tuvo
nada que ver. Lo que impedía el `REVOKE` es que `SELECT … FOR UPDATE` **exige el privilegio de
UPDATE**, y la fila del turno era el punto de serialización de la ventanilla. Reproducido aquí,
contra PostgreSQL 16.15:

```
REVOKE UPDATE ON cierre_caja FROM sgtm_app;
BEGIN; SET LOCAL app.municipalidad_id='1';
SELECT id FROM cierre_caja WHERE caja_id=2 AND cajero='jperez' FOR UPDATE;
-- ERROR:  permission denied for table cierre_caja
```

**Lo que sí cambia con la separación es QUÉ hay que bloquear.** En el monolito, la tercera barrera
contra el doble cobro era que `RegistroDeAbonos` **relee el libro** (#33). Aquí el libro no está,
así que la barrera pasa a ser **la orden**: se bloquean las órdenes que se van a cobrar, se
comprueba que sigan `PENDIENTE` y se marcan `PAGADA` en la misma transacción. Dos cobranzas de la
misma orden se ordenan en el motor y la segunda no encuentra nada que cobrar — exactamente lo que
hacía el libro.

Con la serialización movida, el turno se abre con `INSERT … ON CONFLICT DO NOTHING`, y eso **no
necesita el privilegio de UPDATE**. Medido: dos ejecuciones seguidas dejan un solo turno, con
`has_table_privilege('sgtm_app','cierre_caja','UPDATE')` en `f`.

**`V2` de `caja` hace el `REVOKE`.** Lo que se gana no es cosmético: `cierre_caja` era la primera
tabla del esquema cuya inmutabilidad no podía apoyarse en el privilegio y dependía sólo del escáner
de fuentes. Ahora se apoya en las dos — y las dos siguen, porque dan el mismo `42501` y el síntoma
no distingue cuál actuó (#435).

**Y las 33 líneas de razonamiento de `V32` §1.bis se copian enteras en la cabecera de `V1`**, por lo
mismo que los cinco hallazgos de RLS: en este repositorio no hay `git log` donde encontrarlas.

---

## 8. El baseline: lo que le sobraba, con su diff

El generador de ADR-0032 restringe el esquema a las tablas del sistema pero arrastra **toda**
función y **todo** dominio del esquema original. P5B encontró cuatro funciones de más y P5C cinco.
**Aquí son ocho funciones y cinco dominios**, y ninguno lo delata el comparador de
`baselines/verificar/`: ese mide **fidelidad al monolito** —que sí las tiene— y no **pertenencia** a
este sistema.

| Función retirada | De quién es | Por qué sobra |
|---|---|---|
| `conjunto_sellado_es_inmutable()` | `normativa` | Disparador de `conjunto_parametros`, que aquí no está |
| `detalle_de_conjunto_sellado_es_inmutable()` | `normativa` | Su cuerpo consulta `conjunto_parametros` |
| `valuacion_de_conjunto_sellado_es_inmutable()` | `normativa`/`catastro` | Ídem |
| `valuacion_de_publicacion_sellada_es_inmutable()` | `normativa` | Consulta `parametro_tributario` |
| `declaracion_jurada_estado_es_terminal()` | `rentas` | Sin disparador aquí |
| `verificar_participacion_no_excede()` | `catastro` | Consulta `participacion_comun` |
| `verificar_titularidad_no_excede()` | `catastro` | Consulta `titularidad` |
| **`nombre_normalizado(text)`** | `catastro` y `rentas` | **Caja no tiene ni una columna generada**, así que nadie la llamaba — y arrastraba la extensión `unaccent` |

**La última es la que más dice, y se midió ejecutando:** el baseline original **muere en su línea
204** sobre una base sin `unaccent`:

```
psql:V1__baseline.sql:204: ERROR:  text search dictionary "unaccent" does not exist
```

El corregido aplica entero **sobre una base con CERO extensiones**, 23 tablas. Y eso permitió
recortar `crear-roles.sql`: **tres roles en vez de cuatro** —`rol_carga_parametros` no recibe un
solo `GRANT` en las 23 tablas— y **ninguna extensión**. No es limpieza: es que la caja tiene que
poder correr en el motor más simple que exista, y una ventanilla cuya base necesita PostGIS no se
levanta en cualquier sitio.

**Los cinco dominios retirados** —`alicuota`, `area_m2`, `cod_catastral`, `monto_calc`,
`porcentaje`— no los usa ninguna de las 23 tablas. **Es una diferencia con P5B y P5C**, que no
retiraron dominios: allí no sobraba ninguno. Un dominio muerto es inerte, y aun así se va: declarar
`alicuota` en el esquema de la caja afirma que aquí se guarda un porcentaje tributario, y la primera
regla de este sistema es que no sabe qué es un tributo.

**Y un defecto de sintaxis del generador**, corregido: `recibo_turno_fk` se emitía con `NOT VALID
NOT VALID`. PostgreSQL lo acepta, pero el archivo deja de ser estable en ida y vuelta, y con
checksum de Flyway eso importa. **El mismo defecto está 37 veces en el baseline de `rentas`.**

`sgtm/docs/40-datos/baselines/caja/V1__baseline.sql` **no se tocó**.

---

## 9. El contrato, y las dos operaciones que ninguna pantalla llama

El contrato de `rentas` se **deriva** del prototipo del manual (#312) y `--comprobar` exige en CI que
siga siendo lo que el generador produce. Tres operaciones nuevas entran por
`OPERACIONES_ADICIONALES`, todas bajo el acceso de `caja_tributaria`, y el contrato pasa de **225
operaciones en 202 rutas a 228 en 205**:

| Operación | Quién la llama |
|---|---|
| `POST /rentas/api/v1/ordenes-de-cobro` | **La ventanilla**, al marcar deuda. Es la primera mitad de lo que era un solo cobro |
| `POST /rentas/api/v1/pagos` | El publicador de `caja`, después de su `COMMIT` |
| `GET /rentas/api/v1/pagos/conciliacion` | `caja`, para cuadrar su cierre |

Las dos del buzón son **las dos únicas del contrato que ninguna pantalla llama**. Están ahí igual
porque el contrato es lo que este backend publica, y `ContratoDeApiTest` compara las dos direcciones.

**El cuerpo de la emisión no tiene dónde poner un importe**, y eso lo comprueba una prueba sobre los
componentes del `record` y no un comentario: si lo tuviera, la pantalla podría mandar el que leyó
hace cinco minutos y `caja` lo imprimiría sin discutir, porque no recalcula por diseño. Tampoco
tiene dónde declarar una campaña de beneficio —en el monolito se guardaba *como constancia y sin
efecto* (D-02b); aquí no viaja siquiera—.

**Y la respuesta distingue cuatro cosas que se arreglan de cuatro maneras**: `404` «ese código no
está en el padrón» (#622), `422` «no debe nada a esa fecha» —una orden de cero soles se cobraría,
imprimiría un recibo y no abonaría nada—, `422` nombrando el campo que falta, y **`503` cuando
`caja` no contesta**. El 503 estrena `CodigoDeError.SERVICIO_NO_DISPONIBLE`, y es un código propio
porque la respuesta correcta del cliente es la contraria a la de un 500: ante un fallo del servidor
reintentar no cambia nada, y ante esto **sí**.

**Y el generador tiene una guarda que se disparó**: declarar un segundo `caja_tributaria:` en
`OPERACIONES_ADICIONALES` produce «Clave declarada dos veces, y la segunda se come a la primera sin
avisar». Es exactamente el defecto que #488 encontró y cerró — un objeto literal de JavaScript se
queda con la última clave sin decir nada, y el síntoma de «lo declaré y no salió» es idéntico al de
«no lo declaré». Aquí funcionó a la primera.

### Y una regla de arquitectura que cambió el diseño

`ParametrosDeLaConsultaTest` exige que **todo cuerpo publicado sea un `record`**, porque los campos
de un cuerpo sólo se pueden enumerar si lo es —un cuerpo leído como texto deja la comprobación
pasando en verde sin mirar nada—. La primera versión de `PagoController` leía el cuerpo como
`String` para **congelarlo tal como llegó**: si un pago no cuadra, lo que hay que poder mirar es lo
que el otro sistema dijo y no lo que éste entendió.

**Gana la lista blanca**, y lo que se pierde queda dicho en el javadoc de `PeticionDePago`: el byte
exacto del emisor. Lo que se conserva —y es lo que la conciliación necesita— es cada campo que este
sistema usa, con su valor; un campo que la caja mandara y el `record` no declarara se perdería en
silencio, y por eso la forma del evento se comprueba **del otro lado**, en las pruebas de la caja.

---

## 10. Huecos declarados

1. **La emisión de la orden ya existe; lo que falta es la cuota inicial de un convenio.** La
   primera versión de este documento declaraba aquí que nadie emitía una orden de cobro tributaria,
   y eso no era un hueco sino una regresión de esta etapa: **se cerró** (§2). Hoy `rentas` publica
   `POST /rentas/api/v1/ordenes-de-cobro`, `EmitirOrdenDeCobro` lee el libro y compone una orden
   por obligación, y los siete métodos huérfanos volvieron o se retiraron con su motivo (§6.bis).
   Lo que sigue faltando de verdad, y es más pequeño y más concreto:
   - **la cuota inicial de un preconvenio no se puede cobrar por este camino.** `EmitirOrdenDeCobro`
     lee obligaciones del libro, y una cuota inicial no está en el libro: la dice el cronograma
     congelado (`FormalizarConvenio.cuotaInicialDe`). Hace falta una segunda forma de componer la
     orden, y con ella vuelve `FormalizarConvenio` (hueco 5);
   - **una orden pendiente no caduca sola.** Dos órdenes de la misma obligación a fechas distintas
     pueden coexistir —es lo que permite cobrar el interés devengado—, y cobrar las dos produce un
     segundo pago que `rentas` rechaza a la cola de muertos: **visible, pero después de haber
     cobrado**. Caducar órdenes es trabajo de `caja` y no está hecho;
   - **la pantalla no lo llama todavía.** El endpoint existe y está probado en su borde, pero
     `caja_tributaria` sigue mandando el cuerpo de antes: conectar la interfaz es otra etapa, y aquí
     no hay interfaz que conectar.
2. **Los treinta días del criterio 1 no se pueden medir aquí**, y el camino viejo **no existe**
   detrás de ninguna bandera porque la resta lo eliminó. §2.
3. **La alerta escribe en el registro, no manda un correo.** ADR-0026 §4 dice «no se queda en un
   log» y `AlertaEnElRegistro` es exactamente un log. Lo que sí cumple: sale con nivel ERROR, nombra
   al responsable y su canal, y la observabilidad del proyecto (INF-11) alerta sobre ERROR con
   receptor ya comprobado. Lo que **no**: nada aquí comprueba que llegue —
   `observabilidad/verificar-alertas.sh` vive en `infrastructure` y **no se extendió a esta regla**.
   Está construido y **no está medido**.
4. **El descriptor de despliegue de `caja` no puede nombrar al responsable.** `ResponsableDeLaConciliacion`
   impide arrancar sin `KAMAYUK_CAJA_RESPONSABLE` y `KAMAYUK_CAJA_CANAL`, y eso está medido; pero
   `Ambiente` de `infrastructure` no tiene campo para ellas y añadírselo es otro repositorio.
   **Consecuencia: con el descriptor tal cual, el pod de `caja` no levanta.** Es el estado correcto
   —mejor eso que una caja cobrando sin responsable— y está escrito en el propio descriptor.
5. **`FormalizarConvenio` sigue sin quien lo llame en producción.** Su único invocador era
   `CobrarDeuda`. Volverá por el evento `PagoRegistrado`: hoy `RecibirPago` imputa al libro y **no
   formaliza convenios**, porque una cuota inicial llega como una orden más y nada le dice a
   `rentas` que esa orden formaliza un convenio. Cerrarlo es darle a la orden un `detalle` que
   `rentas` sepa leer, y eso es la misma decisión que D-20.
6. **D-20 sigue abierta, y el esquema la deja abierta a propósito.** Las dos salidas de ADR-0026 §2
   siguen siendo posibles sin volver a migrar: `recibo_detalle.detalle` va nulo (el recibo dice
   cuánto y contra qué orden) o lo llena el sistema de origen con la imputación previsualizada. Lo
   que **no** se hizo es repartir el importe en `insoluto`/`reajuste`/`interes`/`gasto` desde la
   orden: eso obligaría a la caja a tener columnas llamadas «interés».
7. **D-17 sigue abierta.** `PENDIENTE-CRUCE-06` se cerró copiando el pagador en el recibo
   (`recibo.pagador_documento`, `pagador_nombre`), que es lo que hace que la caja no lea
   `contribuyente`. Lo que **no** decide es si la caja tendrá registro propio de pagadores; lo que
   hizo P5D es que esa pregunta **deje de bloquear la separación**.
8. **No hay intercambio de token (RFC 8693).** Los dos clientes reenvían el `Authorization` de la
   petición en curso, y el publicador —que corre sin usuario delante— manda una credencial de
   servicio configurada. Mismo hueco que P5B y P5C declararon.
9. **Testcontainers no se usó.** Todo corrió contra un PostgreSQL 16.15 real en `127.0.0.1:55444`,
   con RLS, `FORCE ROW LEVEL SECURITY` y los roles de verdad — pero **no por el camino de
   Testcontainers**, que es el que corre en CI. Es el mismo hueco de P3, P4, P5A, P5B y P5C.
10. **`caja` no tiene contrato de API derivado.** Tercer repositorio con el mismo hueco y el mismo
   argumento: el generador de `rentas` deriva del prototipo del manual (#312) y aquí no hay
   prototipo del que derivar.
11. **`infra/carga-de-datos/` quedó a medio mover.** El archivo del paso 4 —`ejemplos/cajas.csv`—
    **sí** viajó, con su README, porque `caja` es quien tiene ahora `area` y `caja`, y sin él la
    prueba que lo lee medía 10 donde el original decía 11 (§6.bis). Lo que **no** viajó es el guion
    `cargar-cajas.sh` ni el resto de la secuencia de siembra, que sigue en `rentas` describiendo
    nueve pasos de los que el cuarto ya no es suyo. Hay que decidirlo con los dos repositorios
    delante y probablemente con `infrastructure` también.
