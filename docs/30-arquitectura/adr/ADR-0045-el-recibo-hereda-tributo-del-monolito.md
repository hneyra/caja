# ADR-0045 — El recibo hereda tributo del monolito; la frontera se cumple en la orden

| Campo | Valor |
|---|---|
| Estado | **Aceptado** |
| Fecha | 2026-09-27 |
| Decide | `caja`, por decisión del usuario en [`caja`#118](https://github.com/hneyra/caja/issues/118) |
| Nace de | [`caja`#118](https://github.com/hneyra/caja/issues/118): el diagnóstico del 2026-09-23 midió que la orden cumple la frontera y el recibo no |
| No toca | La frontera de `OrdenDeCobro` y `PeticionDeOrdenDeCobro` que CLAUDE.md ya declara: siguen sin `ejercicio` ni `tributo`, y siguen siendo la definición práctica de dónde termina esta caja |
| No toca | [ADR-0026](https://github.com/hneyra/rentas/blob/main/docs/30-arquitectura/adr/ADR-0026-el-camino-del-dinero.md): la caja sigue sin imputar y sigue sin determinar; lo que aquí se declara legado es el **papel**, no una regla nueva |
| Deja abierta | D-17 (registro en [GOB-02](https://github.com/hneyra/sgtm/blob/migracion-a-microservicios/docs/00-gobierno/decisiones-abiertas.md)): el día que la caja cobre algo que no es tributo con un recibo propio, este ADR se reconsidera |

## Contexto

CLAUDE.md fija la frontera con una frase medible: «`OrdenDeCobro` no tiene un campo `ejercicio` ni
`tributo`, y `PeticionDeOrdenDeCobro` tampoco. Ésa es la definición práctica de la frontera». Es
cierto para la orden. **No lo es para el recibo**, y el diagnóstico del 2026-09-23 lo midió con
`grep`, archivo por línea:

### 1 · `LineaDeRecibo` lleva el desglose tributario del monolito

`backend/kamayuk-caja-nucleo/src/main/java/kamayuk/caja/nucleo/dominio/LineaDeRecibo.java:37-52`,
el registro entero:

```java
public record LineaDeRecibo(
        String tributo,
        String concepto,
        @Nullable Ejercicio ejercicio,
        @Nullable Integer periodo,
        @Nullable Long tasaId,
        @Nullable Long predioId,
        @Nullable Long vehiculoId,
        @Nullable String referenciaExterna,
        @Nullable String detalle,
        @Nullable Integer cantidad,
        @Nullable Dinero precioUnitario,
        Dinero insoluto,
        Dinero reajuste,
        Dinero interes,
        Dinero gasto) {
```

Quince parámetros, y siete de ellos —`tributo`, `ejercicio` (que importa
`kamayuk.caja.dominio.Ejercicio` de `kamayuk-caja-dominio-compartido`, línea 6), `periodo`,
`predioId`, `vehiculoId`, y el desglose en cuatro partes `insoluto`/`reajuste`/`interes`/`gasto`—
no describen «lo que se cobró y a quién se le imprime»: describen **cómo el monolito partía una
deuda tributaria**. `Ejercicio` es además la única dependencia real de un tipo tributario de
`dominio-compartido` que `kamayuk.caja.nucleo.dominio` importa hoy — medido con `grep` sobre el
paquete entero, es la única de las tres clases que este ADR declara legado que trae un TIPO ajeno;
`TipoDePago` y `RecaudacionDeTributo` cargan el mismo concepto en un `String`/enum, sin un tipo que
lo delate.

### 2 · Quien rellena `tributo` es la propia orden, con el sistema de origen

`backend/kamayuk-caja-nucleo/src/main/java/kamayuk/caja/nucleo/dominio/OrdenDeCobro.java:164-181`:

```java
public LineaDeRecibo comoLineaDeRecibo() {
    return new LineaDeRecibo(
            sistemaOrigen.nombre().toUpperCase(java.util.Locale.ROOT),
            concepto,
            null, null, null, null, null,
            referenciaExterna,
            detalle,
            null, null,
            importe,
            Dinero.CERO, Dinero.CERO, Dinero.CERO);
}
```

`tributo` no es un tributo: es el nombre del sistema de origen en mayúsculas (`RENTAS`, o el que
mande la siguiente municipalidad-cliente). Los otros seis parámetros tributarios llegan `null` para
toda orden que hoy existe. La columna se llama como se llamaba en el monolito; lo que guarda ya no
es lo que el nombre dice.

### 3 · `TipoDePago` lleva tres valores que sólo tienen sentido con tributos

`backend/kamayuk-caja-nucleo/src/main/java/kamayuk/caja/nucleo/dominio/TipoDePago.java:29-34`:

```java
public enum TipoDePago {
    NORMAL,
    A_CUENTA,
    PRECONVENIO,
    CUOTA_CONVENIO,
    TASA;
```

`A_CUENTA` (pago parcial de deuda ordinaria), `PRECONVENIO` (cuota inicial de un convenio de
fraccionamiento) y `CUOTA_CONVENIO` (cuota de un convenio ya acogido) son vocabulario del Código
Tributario. Medido con `grep -rn "TipoDePago\.\(PRECONVENIO\|A_CUENTA\|CUOTA_CONVENIO\)"` sobre
`src/main`: **cero** ocurrencias fuera del propio enum. Ningún caso de uso construye hoy un recibo
con esos tres valores — `CobrarOrdenes` sólo emite `NORMAL` y `CobrarTasa` sólo emite `TASA`—, así
que son estados alcanzables por el esquema (`recibo_tipo_pago_check`, V3) y no por el código Java
de este repositorio.

### 4 · `RecaudacionDeTributo` responde el avance de recaudación por tributo

`backend/kamayuk-caja-nucleo/src/main/java/kamayuk/caja/nucleo/dominio/RecaudacionDeTributo.java:22`:

```java
public record RecaudacionDeTributo(String tributo, Dinero cobrado, Dinero anulado) {
```

Es la respuesta de `GET /recaudacion/por-area` (RF-088): «cuánto entró por RENTAS, cuánto por el
siguiente sistema-cliente». El campo se llama `tributo` por el mismo motivo que en `LineaDeRecibo`:
heredó el nombre del reporte del manual, y hoy agrupa por sistema de origen, no por tributo.

### Lo que la orden SÍ cumple

`OrdenDeCobro` y `PeticionDeOrdenDeCobro` no tienen ninguno de estos campos. Lo único que la orden
declara es `sistemaOrigen`, `referenciaExterna` (opaca), `concepto` (lo que se imprime), `importe`
y `actualizadoA` (regla 9) — exactamente la forma genérica que este ADR describe como alternativa
en la sección siguiente, y que ya existe. La frontera se rompió al construir el **recibo**, no al
recibir el pedido de cobro.

## Decisión

**El recibo es legado congelado. No se migra.**

1. `LineaDeRecibo`, `recibo_detalle` (el esquema), `TipoDePago` y `RecaudacionDeTributo` siguen
   llevando `tributo`, `ejercicio`, `periodo`, `predioId`, `vehiculoId`, el desglose en
   `insoluto`/`reajuste`/`interes`/`gasto`, y los tres valores tributarios de `TipoDePago`
   (`PRECONVENIO`/`CUOTA_CONVENIO`/`A_CUENTA`). Es una **excepción declarada y congelada** de la
   frontera que CLAUDE.md fija para el dominio: no se retira ningún campo, no se migra a una línea
   genérica, y no se le agrega ninguno nuevo.
2. **La orden de cobro sigue siendo la definición práctica de la frontera.** `OrdenDeCobro` y
   `PeticionDeOrdenDeCobro` no ganan ningún campo tributario por este ADR, y la regla de CLAUDE.md
   —«el día que uno de los dos gane ese campo, la caja habrá dejado de servir para cobrar un puesto
   de mercado»— sigue vigente sobre ellas, sin excepción.
3. **Nada tributario nuevo entra en `kamayuk.caja.nucleo.dominio`.** Las tres clases nombradas en
   el punto 1 quedan como la lista cerrada de lo heredado; ninguna clase nueva puede sumarse por su
   cuenta. Lo vigila la regla de ArchUnit de la sección siguiente.
4. **Cuándo se reconsidera.** El día que D-17 se decida y la caja empiece a cobrar algo que no es
   tributo con un recibo propio —no con la orden de otro sistema—, este ADR se reconsidera: puede
   que ese día `LineaDeRecibo` necesite de verdad la línea genérica que la alternativa 1 describe
   abajo, con el desglose tributario como un bloque opcional y no como la única forma.

### Por qué congelar y no migrar ahora

Migrar a una línea genérica —origen, referencia, concepto, importe y un bloque opcional de
tasa— es technically posible hoy mismo: la orden ya tiene esa forma. Pero migrar el recibo **sin
que D-17 esté decidida** cambiaría una columna que ya tiene datos (`recibo_detalle` es una tabla
protegida, regla 4: sin `DELETE`, sin migración que reescriba filas existentes salvo con su propia
migración `Vn`) a cambio de nada que la caja use hoy: ningún caso de uso llena
`predioId`/`vehiculoId`/`ejercicio`/`periodo` con un valor real, y el desglose en cuatro partes es
exactamente lo que exige `recibo_detalle_desglose_ck` desde V3 — tocarlo es tocar una restricción
de base ya aplicada, por una ganancia que nadie puede nombrar todavía.

## Consecuencias

- **El nombre de una columna no es su significado**, y eso queda escrito aquí para que no haga
  falta releer el histórico de `sgtm` cada vez: `tributo` guarda el sistema de origen,
  `ejercicio`/`periodo`/`predioId`/`vehiculoId` van `null` en todo recibo que existe, y el desglose
  en cuatro partes es aritmética, no una regla tributaria (`insoluto` lleva el importe entero de una
  orden o de una tasa).
- **La regla 5** (ningún literal numérico tributario en el código) sigue intacta: nada de esto es
  un literal, es la forma de una fila.
- **`RecaudacionDeTributo` sigue respondiendo por sistema de origen**, y el nombre del campo no
  cambia: renombrarlo sin renombrar la columna del esquema exigiría una migración nueva que no
  compra nada hasta D-17.
- **La ADR no bloquea nada de lo que ya funciona**: `CobrarOrdenes`, `CobrarTasa` y `AnularRecibo`
  cobran, emiten y anulan exactamente igual. **El arqueo de un turno con datos heredados sí
  cambia** —ver la sección siguiente—, y es una corrección, no una regresión: un recibo `A_CUENTA` o
  `CUOTA_CONVENIO` deja de contarse como si tuviera un evento pendiente de entregar cuando nunca lo
  tuvo.

## Una sola definición de «recibo que produce evento»

El diagnóstico también midió que la pregunta «¿este recibo produce un evento que hay que entregar
al sistema de origen?» se contestaba tres veces, por separado:

1. `TipoDePago.abonaEnElLibro()` — pensada para el arqueo contra el libro (#36), no para el buzón.
2. `AnularRecibo.publicarLaAnulacion` — un `if (recibo.tipoDePago() == TipoDePago.TASA) return null;`
   escrito a mano.
3. `ArqueoDeTurno.cuadrar` — usaba `recibo.abonaEnElLibro()` como si dijera lo mismo que «produjo
   un evento», para partir lo recaudado entre `conEvento` y `sinEvento`.

**La primera versión de este ADR decía que `PRECONVENIO` era donde `abonaEnElLibro()` y «produce
evento» diferían de verdad —que la cuota inicial no abona pero sí avisa, «para formalizar el
convenio»—. Es falsa, y la revisión independiente la contrastó contra el código y contra `rentas`,
no contra el nombre del valor:**

- El comentario de la columna `recibo.tipo_pago` en `V2__ordenes_de_cobro_y_outbox.sql` dice, con
  esas letras: «`A_CUENTA`, `PRECONVENIO` y `CUOTA_CONVENIO` ya no los puede escribir NADIE: son
  conceptos de `rentas`, y la cuota inicial de un convenio se cobra "como cualquier otra orden"».
- [ADR-0026 §5](https://github.com/hneyra/rentas/blob/main/docs/30-arquitectura/adr/ADR-0026-el-camino-del-dinero.md)
  —de `rentas`, sobre el camino del dinero— lo confirma: «la ventanilla no cambia: Caja cobra la
  cuota del convenio como cualquier otra orden», es decir como `NORMAL`.
- Y en el código: `CobrarOrdenes` (línea 178) sólo emite `NORMAL`; `CobrarTasa` (línea 150) sólo
  emite `TASA`. Ningún camino actual escribe `A_CUENTA`, `PRECONVENIO` ni `CUOTA_CONVENIO`, así que
  ninguno de los tres encoló jamás un evento — ni antes del buzón, porque el buzón no existía, ni
  después, porque nadie los construye.

**La definición correcta, medida y no supuesta: `produceEvento()` es `this == NORMAL`.** Es lo
único que el código de hoy encola. `TASA` no produce evento por lo de siempre —el concepto lo cobra
la propia caja y nunca vino de una orden (#33)—, y `A_CUENTA`, `PRECONVENIO` y `CUOTA_CONVENIO`
tampoco, porque son **legado de antes del buzón** (`sgtm`, previo a P5D): ninguna fila con esos tres
valores tiene un evento en `pago_evento`, porque esa tabla no existía cuando se escribieron.

**El defecto real, y qué cambia para un turno con datos heredados.** `ArqueoDeTurno.cuadrar` usaba
`abonaEnElLibro()` —`this != TASA && this != PRECONVENIO`— para decidir `conEvento`/`sinEvento`.
Eso da `TRUE` para `A_CUENTA` y `CUOTA_CONVENIO`. Con `produceEvento()`, un turno que incluya un
recibo heredado de esos dos tipos —o del cierre ya firmado que `GET /turnos/{id}/cierre`
(`EstadoDelCierreController`) sigue devolviendo— pasa de contarlo como `conEvento` a contarlo como
`sinEvento`. `PRECONVENIO` seguía `sinEvento` antes (`abonaEnElLibro()` ya daba `false` para él) y
sigue `sinEvento` ahora: no cambia. **El total no cambia en ningún caso** —`Cuadre.total()` es la
suma de las dos mitades, y el neto del recibo se suma igual a un lado o al otro—; lo único que
cambia es a qué mitad va. Y es lo correcto: ninguno de los tres tiene una fila en el buzón que
entregar, así que contarlos contra `conEvento` afirmaba un destinatario que no existe.

**La unificación**: `TipoDePago.produceEvento()` (`this == NORMAL`) es ahora la única definición.
`AnularRecibo.publicarLaAnulacion` la usa en vez de su comparación a mano —y con ella, anular un
recibo heredado tampoco publica nada; es además **hoy inalcanzable de otra forma**, porque
`AnularRecibo.anular` exige que el turno sea el de hoy (`FueraDelDiaDePago`), y un recibo heredado
es siempre de antes de la migración—. `ArqueoDeTurno.cuadrar` la usa en vez de `abonaEnElLibro()`,
que se retira del código —`TipoDePago.abonaEnElLibro()` y `ReciboDelTurno.abonaEnElLibro()` no
tenían más llamador en `src/main`—. `CobrarOrdenes`, que sólo emite `NORMAL`, no necesita ninguna
comprobación: `NORMAL` es exactamente y únicamente el valor que `produceEvento()` acepta.

## Regla de arquitectura

**Ninguna clase nueva de `kamayuk.caja.nucleo.dominio` puede depender de un tipo de
`kamayuk.caja.dominio` (`kamayuk-caja-dominio-compartido`) que no sea uno de los dos genéricos que
este contexto ya usa.** La primera versión de esta regla vigilaba sólo `Ejercicio` por nombre, y una
regla así no impide nada nuevo: una clase que sumara `Alicuota`, `CodigoContribuyente` o `Placa`
—tipos tributarios/catastrales de `dominio-compartido` que este contexto no usa— pasaría en verde,
porque la lista no los nombraba.

**La versión de esta ronda falla cerrado.** En vez de enumerar cada tipo prohibido, enumera los DOS
tipos permitidos —medidos con `grep` sobre `kamayuk.caja.nucleo.dominio` entero: `Dinero` (todo
importe) y `Observacion` (la regla 10) son los únicos que ese paquete usa hoy fuera de
`Ejercicio`— y prohíbe todo el resto de `kamayuk.caja.dominio` por omisión. Un tipo tributario nuevo
que ese paquete gane mañana queda vigilado sin tocar la regla.

La lista blanca **por clase** baja a una sola: `LineaDeRecibo`, la única que depende de un tipo
fuera de los dos genéricos (`Ejercicio`). `TipoDePago` y `RecaudacionDeTributo` —que este ADR
también declara legado— no están en esa lista porque no la necesitan: ninguna de las dos depende de
un tipo tributario, cargan el concepto en un enum y en un `String`. Siguen declaradas como legado
aquí, en la Decisión; la lista de la regla es sólo lo que la dependencia de TIPOS obliga a eximir.

La regla vive en `FronteraTributariaDelDominioTest` (`kamayuk-caja-aplicacion`, junto a
`ArquitecturaTest`), con su propia clase de muestra que la viola,
`kamayuk-caja-aplicacion/src/test/java/kamayuk/caja/verificaciones/muestras/ConceptoTributarioNuevoDeMuestra.java`
—declara a propósito un campo `Alicuota`, **no** `Ejercicio`, para probar que la regla prohíbe por
omisión y no por una lista que alguien tendría que acordarse de ampliar—, siguiendo el patrón de
`ReglasDeArquitecturaMuerdenTest` (comprobado que muerde, contra la muestra y contra producción real:
ver la fila de este issue en `docs/agent/HISTORY.md`).

Es una regla **local** a este repositorio, no una regla compartida en `comun-verificaciones`: las
otras cuatro caras del producto no heredan un recibo del monolito con esta forma, así que la regla
no tiene nada que vigilar allí.

## Alternativas consideradas

### 1 · Migrar `LineaDeRecibo` a una línea genérica ahora

Origen, referencia, concepto, importe y un bloque opcional de tasa —la forma que `OrdenDeCobro` ya
tiene—. Es la salida "correcta" a largo plazo.

**Lo que cuesta**: una migración sobre `recibo_detalle`, una tabla protegida con datos reales desde
P5D, para una ganancia que hoy nadie puede nombrar —ningún caso de uso llena los campos
tributarios con nada distinto de `null`—. Y D-17 sigue abierta: migrar la forma del recibo antes de
saber qué necesita cobrar la caja cuando no es tributo es adivinar el diseño dos veces.

### 2 · No decidir nada y dejar la ambigüedad

Dejar que `LineaDeRecibo` siga pareciendo tributaria sin decir en ningún sitio que no lo es.

**Lo que cuesta**: es exactamente el estado que #118 midió. La próxima persona que lea `tributo`
en una fila de `recibo_detalle` y no encuentre este ADR va a asumir que ahí hay un tributo de
verdad, y va a escribir código que cruza la frontera pensando que ya estaba cruzada.

### 3 · Prohibir con ArchUnit cualquier campo tributario, incluidos los heredados

Una regla sin lista blanca, que rompería `LineaDeRecibo` hoy mismo.

**Lo que cuesta**: convertiría este ADR en un trabajo de migración disfrazado de regla de
arquitectura, exactamente lo que el punto 1 de la Decisión descarta. Una regla que rompe el build
al aceptarla no protege nada: solo demuestra que hay que escribir la lista blanca, que es lo que
esta versión ya hace.

## Lo que este ADR no decide

- **No decide D-17.** Sigue abierta, con su registro en GOB-02. Este ADR describe lo heredado y
  dice cuándo reconsiderarlo; no dice qué cobra la caja el día que exista un puesto de mercado.
- **No migra `recibo_detalle`, ni agrega una migración nueva.** El esquema queda exactamente como
  estaba.
- **No cambia el comportamiento de ningún caso de uso que cobra o anula.** `CobrarOrdenes`,
  `CobrarTasa` y `AnularRecibo` cobran, emiten y anulan exactamente igual que antes.
- **Sí cambia el arqueo de un turno con datos heredados.** Un recibo `A_CUENTA` o
  `CUOTA_CONVENIO` pasa de contarse `conEvento` a contarse `sinEvento` en `ArqueoDeTurno.cuadrar`
  (cierre y `GET /turnos/{id}/cierre`); `PRECONVENIO` no cambia, ya contaba `sinEvento`. El total
  del arqueo es el mismo en los dos casos: sólo cambia a qué mitad va el neto del recibo.
