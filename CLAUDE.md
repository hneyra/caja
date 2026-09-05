# `caja` — Contexto para agentes

Órdenes de cobro, recibo, turno, arqueo, cierre y medios de pago. **No sabe qué es un tributo**, y
por eso sirve para cobrar un puesto de mercado o un nicho.

Uno de los cinco repositorios de **Kamayuk**, el producto multi-municipal que reimplementa el
sistema documentado en el manual de usuario del SGTM de la Municipalidad Provincial de Sullana.
El reparto lo decide
[ADR-0029](https://github.com/hneyra/infrastructure/blob/main/docs/30-arquitectura/adr/ADR-0029-cuatro-sistemas-separados.md);
qué tabla fue a qué repositorio y por qué, [GOB-05](https://github.com/hneyra/sgtm/blob/migracion-a-microservicios/docs/00-gobierno/inventario-del-corte.md).

## Qué hay hoy, medido y no supuesto

Desde **P5D** (2026-09-04) este repositorio tiene su negocio dentro. Lo que cada pieza vale está
medido en [`docs/00-gobierno/P5D-extraccion.md`](docs/00-gobierno/P5D-extraccion.md); esta tabla es
el resumen.

| Pieza | Estado |
|---|---|
| `backend/kamayuk-caja-esquema` | **`V1__baseline.sql`** (23 tablas) y **`V2__ordenes_de_cobro_y_outbox.sql`**. El baseline se corrigió al traerlo: le sobraban **ocho funciones y cinco dominios** de otros sistemas, y una de las ocho hacía morir la migración sobre una base sin `unaccent` |
| `backend/kamayuk-caja-nucleo` | El contexto acotado entero: orden de cobro, ventanilla, recibo, turno, cierre, arqueo, tasas y **el buzón de salida** |
| `backend/kamayuk-caja-{dominio-compartido, plataforma}` | Copias de las de `rentas`, con el paquete renombrado. Ver el hueco de las cuatro copias |
| `backend/kamayuk-caja-aplicacion` | Ensambla y aloja las barreras |
| `infrastructure/` — el descriptor | `yarn verificar` en verde. **Le falta nombrar al responsable de la conciliación**, y con eso el pod no levanta: es un hueco declarado, no un olvido |
| `docs/30-arquitectura/adr/` | Sin ningún ADR propio, y sigue siendo correcto: lo que la caja hace lo deciden ADR-0026 y ADR-0029 |
| Su frontend (`caja-web`) e imagen | **NO existen** |

**Tres roles y cero extensiones.** `crear-roles.sql` declara `kamayuk_owner`, `kamayuk_app` y
`kamayuk_readonly` — `rol_carga_parametros` es de `normativa` y aquí no recibe un solo `GRANT`— y
**ninguna extensión de PostgreSQL**. No es limpieza: una ventanilla cuya base necesita PostGIS no se
levanta en cualquier sitio, y la caja tiene que poder correr en el motor más simple que exista.

## Lo que este repositorio NO hace

- **No imputa el abono a la deuda.** Eso es `rentas` (ADR-0026 §2): aquí se cobra contra una orden y
  se publica el pago; qué parte de la deuda extingue lo decide el libro. Si la caja imputara, la
  regla del art. 31 del Código Tributario estaría escrita dos veces.
- **No conoce tributos, ni fases, ni conceptos.** `OrdenDeCobro` no tiene un campo `ejercicio` ni
  `tributo`, y `PeticionDeOrdenDeCobro` tampoco. **Ésa es la definición práctica de la frontera**: el
  día que uno de los dos gane ese campo, la caja habrá dejado de servir para cobrar un puesto de
  mercado.
- **No le pregunta nada a nadie para cobrar.** `kamayuk-caja-nucleo` no declara
  `implementation(project(...))` de ningún otro contexto y `CajaController` no inyecta un solo puerto
  hacia otro sistema. Es lo que hace cierto que la ventanilla cobre con `rentas` apagado.
- **No decide D-17 ni D-20.** Ver abajo.
- **No decide la etiqueta de su imagen, ni su namespace, ni sus `PriorityClass`.** Las pone `infrastructure`.
- **No tiene `git log` de su historia.** La tiene `sgtm`, que no se borra.

## Estructura

```
backend/                        Gradle. Java 25, Spring Boot 4
  kamayuk-caja-dominio-compartido/  objetos de valor y contexto de tenant
  kamayuk-caja-esquema/             el baseline, V2, el migrador y la prueba de aislamiento
  kamayuk-caja-plataforma/          del token al SET LOCAL, auditoría, documentos, borde HTTP
  kamayuk-caja-nucleo/              EL contexto acotado. Se llamaba `caja` (R-N)
  kamayuk-caja-aplicacion/          ensambla y aloja las barreras
infrastructure/                 el descriptor de despliegue en TypeScript, con yarn
docs/                           los ADR que enlaza, hallazgos de RLS, P5D y la guía de desarrollo
```

El backend **no compila sin `infrastructure` clonado al lado**: las barreras se consumen como
*composite build* desde `../../infrastructure/librerias-backend`. `settings.gradle.kts` lo
comprueba antes y falla diciendo qué `git clone` falta.

Los paquetes son `kamayuk.caja.*` y el contexto acotado es `kamayuk.caja.nucleo.*`. **Se llamaba
`kamayuk.caja.caja` hasta R-N (2026-09-05)**: el patrón `kamayuk-<sistema>-<contexto>` produce el
nombre repetido allí donde el sistema tiene un solo contexto y se llama igual que él —pasaba en
`caja`, en `catastro` y en `rentas`—, y la dirección pidió quitarlo. El contexto pasa a llamarse
`nucleo` y el patrón queda intacto; `normativa` no cambia porque su contexto ya se llama
`parametros`. El porqué y lo que costó están en
`infrastructure/docs/00-gobierno/R-N-los-tres-modulos-repetidos.md`. Los **roles de base de datos son
`kamayuk_owner`, `kamayuk_app` y `kamayuk_readonly`** (etapa C del renombrado): son del **clúster**,
que los cuatro sistemas comparten, así que se renombran en los cuatro a la vez o en ninguno.

## Las dos piezas que hay que entender antes de tocar nada

**La orden de cobro.** Es lo único que esta caja sabe cobrar: de dónde viene, cómo la llama quien la
mandó, qué dice el papel, cuánto, desde cuándo y **a qué fecha está esa cifra**. La caja no
recalcula: imprime lo que le dieron. Y su `referenciaExterna` es **opaca** — no se analiza, no se
compara por partes, no se ordena—, que es lo que permite que el día de mañana sea el contrato de un
puesto de mercado.

**El buzón de salida.** Se escribe **en la misma transacción que el recibo**. Si la fila está, el
recibo está. Un proceso aparte lo entrega y lo marca. Lo que compra es que la ventanilla cobre con
el sistema de origen apagado; lo que cuesta es que **la conciliación diaria deje de ser buena
práctica**. El `pagoId` lo genera **la caja** al cobrar, no el transporte: un reintento manda el
mismo, y por eso el receptor puede deduplicar.

## Antes de escribir código, leer

| Si vas a tocar… | Lee |
|---|---|
| Cualquier cosa | [ADR-0002 — Estrategia multi-tenant](https://github.com/hneyra/infrastructure/blob/main/docs/30-arquitectura/adr/ADR-0002-estrategia-multi-tenant.md) — es el riesgo número uno |
| Base de datos | [Los cinco hallazgos de RLS](docs/40-datos/hallazgos-de-rls.md) **primero** |
| El camino del dinero | [ADR-0026](https://github.com/hneyra/rentas/blob/main/docs/30-arquitectura/adr/ADR-0026-el-camino-del-dinero.md) — dos transacciones, un *outbox*, y la imputación en `rentas` |
| El contexto de municipalidad | [ADR-0028](https://github.com/hneyra/infrastructure/blob/main/docs/30-arquitectura/adr/ADR-0028-el-tenant-no-cruza-por-http.md) — token delegado, jamás una cabecera |
| Backend | [ARQ-04 — Estándares de código](https://github.com/hneyra/infrastructure/blob/main/docs/30-arquitectura/estandares-de-codigo-backend.md) |
| Montar el entorno | [D0 — Desarrollo](docs/D0-desarrollo/README.md) |

Índice de decisiones: [`docs/30-arquitectura/adr/README.md`](docs/30-arquitectura/adr/README.md).

## Decisiones abiertas que bloquean

Registro completo en [GOB-02](https://github.com/hneyra/sgtm/blob/migracion-a-microservicios/docs/00-gobierno/decisiones-abiertas.md).

| # | Decisión | Bloquea |
|---|---|---|
| D-17 | **El padrón de administrados cuando la caja cobre lo que no es tributo** | Su primer ADR, y su frontera con `rentas` |
| D-20 | **Qué dice el recibo cuando la imputación es asíncrona** | El papel que se entrega en ventanilla |
| D-14 | Regla de imputación de un pago parcial | La conciliación con el libro |
| D-03d | Redondeo del importe a pagar en el cierre, que puede no ser el del cálculo | El arqueo |
## Reglas que no se negocian

Son las mismas en los cinco repositorios, y las verifica **el mismo artefacto**:
[`comun-verificaciones`](https://github.com/hneyra/infrastructure/tree/main/librerias-backend/comun-verificaciones),
que vive en `infrastructure` y se consume como *composite build*.

| # | Regla | Motivo |
|---|---|---|
| 1 | **Importes en `BigDecimal`/`NUMERIC`.** Prohibidos `double` y `float` | Precisión monetaria (RNF-055) |
| 2 | **Ningún método de dominio recibe `municipalidadId`.** Sale del token, se fija una vez con `SET LOCAL` | Si el desarrollador no lo maneja, no puede olvidarlo |
| 3 | **`SET LOCAL`, jamás `SET SESSION`** | `SET SESSION` sobrevive al retorno de la conexión al pool y contamina la petición de otra municipalidad |
| 4 | **Sin `DELETE`** en deuda, pagos, recibos, valores, valuaciones, asientos ni auditoría. Se anula, se da de baja o se reversa | RNF-051, y el manual §Auditoría |
| 5 | **Ningún literal numérico tributario en el código.** UIT, tramos, alícuotas, valores unitarios, aranceles y tablas de depreciación viven en datos versionados | Reproducibilidad y cambio sin despliegue (RNF-053) |
| 6 | **Las reglas tributarias son funciones puras.** Sin base de datos, sin reloj, sin configuración global; la fecha entra como argumento | Recalcular 2027 en 2037 debe dar el mismo céntimo |
| 7 | **Nada de Spring ni JPA en la capa `dominio`** | Las reglas deben probarse sin levantar el contexto |
| 8 | **`alicuota`, nunca `tasa`**, para un porcentaje | `tasa` es un tipo de tributo |
| 9 | **No existe «la deuda»:** es `deudaActualizadaA(fecha)`, y toda cifra mostrada indica su fecha | RNF-075 |
| 10 | **Toda modificación de datos exige observación del usuario.** Sin observación no se guarda | Manual §Auditoría; RNF-052 |

Las reglas 1, 2, 6, 7 y las fechas están escritas como pruebas de ArchUnit; `SET SESSION` y
`DELETE` sobre tabla protegida, como escáner del código fuente. Se añade una **undécima**, que
sólo existe desde que hay cinco repositorios: **ningún SQL cruza la frontera de sistema** —un
`JOIN` contra una tabla de otro sistema no deja huella en el bytecode, así que la vigila un
escáner de texto y no ArchUnit—.

> **Y hasta P5E esa undécima regla estaba MUDA aquí, medido.** `ConfiguracionDeCaja` sólo repartía
> las tablas de este esquema, y el escáner distingue a propósito tres casos —lo propio, lo replicado
> y **lo que nadie repartió**—, de los que el tercero **no es un cruce**: uno que marcara toda tabla
> desconocida gritaría en cada archivo y dejaría de leerse (#437). De modo que un
> `SELECT … FROM contribuyente JOIN predio` en `src/main` pasaba en **verde**.
>
> El reparto nombra ahora también las 88 tablas de `rentas`, las 15 de `catastro` y las 6 de
> `normativa`, como ya hacían esos dos repositorios. No están en esta base y **justamente por eso
> hay que nombrarlas**. En cuanto pudo ver, la regla encontró un cruce vivo: `ReciboRepositoryJdbc`
> resolvía el filtro del listado con una subconsulta a `contribuyente`, o sea la mitad de
> `PENDIENTE-CRUCE-06` que P5D no cerró —cerró la **emisión** copiando el pagador, no la
> **búsqueda**—. Hoy el listado se filtra por `?documento=`, contra `recibo.pagador_documento` y su
> índice. Todo en [P5E §2](https://github.com/hneyra/rentas/blob/main/docs/00-gobierno/P5E-cierre.md).

**Si agregas una regla, agrega también la clase de muestra que la viola**, en las `muestras/` de
`comun-verificaciones`: una regla que no puede fallar no protege nada. Y lo exige por
construcción `ReglasDeArquitecturaMuerdenTest`, un `@TestFactory` sobre todas las reglas: una
regla sin muestra sale roja sola.

Lista completa con su justificación:
[ARQ-04 — Estándares de código del backend](https://github.com/hneyra/infrastructure/blob/main/docs/30-arquitectura/estandares-de-codigo-backend.md).

## Idioma

Español en el dominio, inglés en lo técnico. **Sin tildes en identificadores**: Checkstyle lo
revisa en el backend, ESLint en el descriptor.

```java
public final class Papeleta { … }                  // dominio: español
public interface PapeletaRepository { … }          // patrón: inglés
autovaluo.calcularTotal();                         // comportamiento: español
repository.findById(id);                           // infraestructura: inglés
```

Tablas y columnas en español `snake_case`. Campos de la API JSON en español `camelCase`.
Comentarios, pruebas y mensajes de commit en español.
## Comandos

```bash
cd backend
./gradlew verificarArquitectura   # ArchUnit, escaner de fuentes, aserciones y frontera de sistema
./gradlew verificarArranque       # el artefacto levanta en los dos perfiles (C-7). Requiere PostgreSQL 16
./gradlew verificarAislamiento    # aislamiento multi-tenant. BLOQUEANTE. Requiere PostgreSQL 16
./gradlew build                   # lo anterior mas Spotless
./gradlew spotlessApply           # arregla el formato en vez de solo reprocharlo

cd ../infrastructure
yarn install && yarn verificar    # el descriptor: lint, tipos y pruebas. Sin Pulumi ni cluster

# La plataforma: PostgreSQL con las cuatro bases, Keycloak con sus dos realms, Traefik y el buzon
cd ../../infrastructure
docker compose -f despliegue/plataforma.compose.yaml up -d --wait

# La guarda del registro (#711) y su autoprueba
node docs/00-gobierno/verificar-fila-del-registro.mjs
node docs/00-gobierno/verificar-las-muestras-del-registro.mjs
```

**`verificarAislamiento` no se omite sin Docker: falla.** Una prueba bloqueante que se salta a sí
misma deja el build en verde sin haber verificado nada. La salida documentada es apuntar a un
PostgreSQL 16 que ya exista, y **ninguna que omita la prueba**:

```bash
./gradlew verificarAislamiento \
  -Dkamayuk.pruebas.postgres.url=jdbc:postgresql://localhost:5432/postgres \
  -Dkamayuk.pruebas.postgres.usuario=postgres \
  -Dkamayuk.pruebas.postgres.clave=…
```

Tiene que ser **PostgreSQL 16** —el esquema no corre en 18 (`V11` falla con «text search
dictionary "unaccent" does not exist»)— y superusuario, porque la prueba crea los cuatro roles.
Cómo montarlo desde cero: [D0 — Desarrollo](docs/D0-desarrollo/README.md).
## Verificar antes de afirmar

**Ejecutar la prueba vale más que razonar sobre ella.** Y no basta con que la verificación esté
escrita: **tiene que demostrarse que puede fallar** — se rompe a propósito el código que protege,
se ejecuta, y se anota el rojo exacto que sale.

Cada issue deja aquí una fila con qué se implementó, **con qué rotura se demostró que la
verificación muerde** y qué rojo produjo. Es lo que impide volver a descubrir el mismo hallazgo
por tercera vez.

> **La tabla nace vacía, y es correcto que se vea así.** El registro anterior —288 filas, issue a
> issue— es historia de `sgtm` y **no viaja**: en un repositorio sin ese `git log` sería el
> registro de un trabajo que aquí no se hizo. Vive en
> [`sgtm/CLAUDE.md`](https://github.com/hneyra/sgtm/blob/migracion-a-microservicios/CLAUDE.md),
> que no se borra. Se consulta; no se copia.

Que la fila **exista** lo comprueba `docs/00-gobierno/verificar-fila-del-registro.mjs` en cada PR
que cierre un issue y toque código de producción. Lo que la fila **diga** —que la mutación sea
real y las cifras cuadren— no lo puede leer una máquina: eso lo lee la revisión.

| Verificación | Cómo se demostró que puede fallar | Resultado |
|---|---|---|
| El baseline aplica sobre una base **sin ninguna extensión** (P5D) | Ejecutando el baseline **original** de `sgtm/docs/40-datos/baselines/caja/` sobre la misma base | **Muere en su línea 204**: «ERROR: text search dictionary "unaccent" does not exist», dentro de `nombre_normalizado(text)` — una función de `catastro` y `rentas` que el generador arrastró y que **ninguna columna de esta caja usa**, porque aquí no hay una sola columna generada. Con las ocho funciones ajenas y los cinco dominios muertos fuera, `V1` aplica entera: 23 tablas, `0 extensiones no-plpgsql`. Y eso permitió recortar `crear-roles.sql` a **tres roles y cero extensiones** — que es lo único que hace creíble «con `rentas` apagado la ventanilla sigue cobrando»: una ventanilla cuya base necesita PostGIS no se levanta en cualquier sitio |
| El `REVOKE UPDATE ON cierre_caja` que `V32` del monolito no pudo hacer (P5D, `V2`) | Reproduciéndolo contra PostgreSQL 16.15 real, y midiendo después la alternativa | Con el `REVOKE` puesto, `SELECT … FOR UPDATE` da **«permission denied for table cierre_caja»** — el hallazgo de `V32` §1.bis, reproducido tal cual. **Y la premisa de ADR-0026 es falsa**: dice que se replantea «donde el cierre ya no comparte base con el libro», y que el libro estuviera al lado nunca tuvo nada que ver. Lo que impedía el REVOKE es que la ventanilla se serializaba **ahí**; movida a `orden_de_cobro`, el turno se abre con `INSERT … ON CONFLICT DO NOTHING`, que **no necesita el privilegio** —medido: dos ejecuciones seguidas dejan un solo turno con `has_table_privilege(…,'UPDATE')` en `f`— y el REVOKE se puede hacer |
| Con el sistema de origen apagado, la ventanilla **sigue cobrando** (P5D AC 2) | Apuntando el cliente HTTP a **un puerto que nadie escucha** —`ServerSocket(0)` abierto y cerrado—, no a un doble que lanza | Cobra, emite recibo, marca la orden `PAGADA` y deja el pago `PENDIENTE` **con su hora**; el publicador reintenta sin perderlo y, agotados los intentos, **muere y dispara la alerta**. Y la conciliación de ese día **no trae ceros**: trae su motivo. Un cero se leería como «no aplicaron nada» —indistinguible de un día sin cobros— y la conciliación diría que cuadra, que es el criterio de #48 con la licencia de «valor de obra 0,00» |
| La conciliación del día cuadra, **y deja de cuadrar** (P5D AC 1, parcial) | Tres roturas sobre ocho días simulados con un sistema de origen levantado de verdad | El origen aplicando 40,00 donde se cobraron 100,00 → `diferencia = 60,00`; **el origen rechazando uno con la cifra coincidiendo → tampoco cuadra**, porque cuadrar con un pago sin imputar es cuadrar por casualidad; y un evento devuelto a `PENDIENTE` —que es como está entre los dos `COMMIT`— tampoco. **Los treinta días del criterio NO se cumplen y no se pueden cumplir aquí**: son tiempo de calendario. Está declarado en P5D §2 |
| Un pago inyectado dos veces produce **un solo asiento** (P5D AC 3, en `rentas`) | Diez hilos de verdad entregando el mismo `pagoId` a la vez | **1 asiento y 1 fila de buzón.** La garantía es `pago_recibido_uq` sobre el `pagoId` **que generó la caja**, no un `if`. Y escribir la prueba encontró **dos defectos vivos**: `jsonb` no devuelve el texto que se guardó —lo reserializa con un espacio detrás de los dos puntos, así que la referencia de la orden no se encontraba y el pago se rechazaba diciendo «no trae ninguna obligación» sobre un cuerpo que las trae todas (#653 otra vez)—; y **atrapar la excepción del libro no sirve de nada**, porque sale de un `@Transactional` anidado y deja la de fuera *rollback-only*. La primera corrección —marcar el rechazo en transacción nueva— **siguió fallando**: la fila que iba a marcar tampoco estaba. Por eso el rechazo **se inserta y no se marca** |
| Una anulación **reversa y no borra** (P5D AC 4) | Contando filas del libro antes y después, y con el escáner de fuentes | Tras la anulación los asientos del cobro **siguen ahí** y el libro tiene **más filas que antes**, marcadas con `ANULACION RECIBO …`. Una anulación inyectada dos veces **no reversa dos veces** —lo haría dejar al contribuyente debiendo el doble de lo que pagó (#34)—. Y que no borra **no lo dice una lectura del código**: `cuenta_corriente_asiento` está en `TABLAS_PROTEGIDAS` de `rentas`, y en `caja` la lista se reescribió para este sistema con **siete** tablas, incluidas `orden_de_cobro` y `pago_evento` |
| El listado de recibos, con al menos una fila (P5D) | **No hubo que provocarla: la escribió el agente que adaptó las pruebas y salió roja.** Lo que sí se midió es qué la esconde | `ReciboRepositoryJdbc.buscar` seleccionaba `contribuyente_id` y **no** `pagador_documento` ni `pagador_nombre`, que es lo que su mapeador lee desde P5D: toda página con una fila reventaba con «Der Spaltenname pagador_documento wurde in diesem ResultSet nicht gefunden». **Y una página vacía no lo destapa** —el mapeador no llega a correr—, así que `unaBusquedaSinResultadosDaPaginaVacia` pasaba en verde con el listado entero roto: la prueba más barata de escribir es justo la que no puede verlo. De paso salió un segundo defecto: `pagadorDe` leía `wasNull()` **de la columna equivocada** —los argumentos se evalúan de izquierda a derecha—, así que un recibo con documento y sin nombre perdía su `idExterno`, que es el dato con el que el evento le dice al origen a quién imputar |
| El interbloqueo del rechazo de un pago (P5D, en `rentas`) | **No hubo que provocarlo: la corrida se colgó.** Y lo que lo dijo no fue ninguna prueba | `pg_stat_activity` con la primera conexión en `idle in transaction` y la segunda en `Lock / transactionid` sobre el `INSERT INTO pago_recibido`. Llamar a `RecibirPago.recibir` **dentro** de una transacción deja a la de fuera abierta con la fila del buzón insertada y marcada *rollback-only*, y el rechazo abre una nueva que intenta insertar el mismo `pago_id`: el índice único la hace esperar a la primera, y la primera espera a la segunda. **Un cuelgue sin mensaje en el camino del dinero**, que es lo peor que puede pasar. La guarda vive ahora en el código y dice qué hacer; en producción no puede ocurrir porque `PagoController.recibir` no lleva `@Transactional`, y ahora tampoco puede empezar a ocurrir sin que alguien lo vea |
| La regla 10 sobre el publicador del buzón | **Tampoco hubo que provocarla: ArchUnit la encontró.** P5D había afirmado por escrito que la lista de exenciones quedaría vacía | Rojo nombrando `EntregarEventos.entregarUno`. La regla mira la **firma** de un método transaccional que escribe, no la naturaleza de lo que escribe — y ésa es la propiedad que la hace útil: «esto no es un dato de verdad» es lo que cualquiera puede escribir sobre cualquier escritura. Entra en la lista con su motivo real (no hay ningún usuario delante), y al lado queda `ExplicarPagoSinEntregar`, que **sí** exige observación porque ahí hay alguien decidiendo que ese dinero no se registra |
| El recuento de pruebas, contado una a una (P5D) | **Contando los métodos anotados de cada clase borrada contra los de su heredera**, no comparando totales | 3 246 − 191 (las 14 clases que salieron de `rentas`) + 5 (`PagoInyectadoDosVecesTest`) = **3 060**, que es lo que la corrida mide. Y el conteo destapó **dos cosas que un total nunca habría enseñado**: `AltaDeCajasJdbcTest` medía **10 donde el original decía 11** —el método que lee el archivo real `ejemplos/cajas.csv` se había quedado atrás porque el archivo estaba en `rentas` y el importador viajó aquí; se trajo el archivo con su README y volvió—, y **siete métodos de `CobrarEnVentanillaTest` no tenían contraparte en ningún repositorio**, los siete de la mitad de deuda. Ésos no eran un descuido ni un hueco: eran una **regresión que la propia extracción introdujo** — medían `CobrarDeuda`, que leía el libro y cobraba en un solo acto, y de sus dos mitades **sólo se había reescrito la de cobrar**, de modo que la ventanilla podía cobrar una tasa de punta a punta y una deuda tributaria **no**, porque `OrdenesDeCobro` era un puerto con adaptador HTTP y **cero invocadores**. Se cerró escribiendo la mitad que faltaba (`EmitirOrdenDeCobro` y `POST /rentas/api/v1/ordenes-de-cobro`, en `rentas`) y reponiendo la cobertura: cinco métodos volvieron reescritos contra el camino nuevo, dos se retiraron **con su motivo** —uno porque lo que medía lo mide hoy `PagoInyectadoDosVecesTest` contra PostgreSQL real, otro porque `TipoDePago` ya no cruza esta frontera—, y con ellos entraron nueve afirmaciones que el camino viejo no podía tener. **Ninguna prueba se quedó sin sitio, y el conteo es lo único que lo delató** |
| **C-6 — `cargar-cajas.sh` vive donde vive `CargarCajas`** (el paso 4 de la siembra, hueco 11 de P5D) | Del lado de `infrastructure`, devolver el guion a donde estaba y medir el censo que cruza cada guion con los `@ConditionalOnProperty` de su repositorio | 2 en rojo en `siembra-de-la-demostracion.test.ts`. **El guion estaba en `infrastructure` y el cargador aqui**, y un guion lanzado contra la imagen equivocada arranca la aplicacion, no carga nada y sale con codigo 0 — medido con `cargar-transferencias-demo.sh`, que estaba en `catastro` y su proceso en `rentas`. Sembrado de verdad contra PostgreSQL 16.15: **5 ventanillas y 3 areas**, y esas dos cifras no estan escritas en ninguna parte —salen de `cajas.csv`, sus filas y sus `codigoArea` distintos—. Sigue sin exigir `es_demostracion`, que es lo correcto: una ventanilla no es un dato inventado (#430). Las 673 pruebas siguen en 673, 0 fallos, con `--rerun-tasks` contra el motor real. **Y ejecutar destapo que esta aplicacion no arranca**: no tiene ninguna implementacion de `ComprobadorDeAcceso` y le falta el `ObjectMapper` de Jackson 2 que inyecta `ComponedorDeEventosJson`; declarado, no arreglado, en [C-6](https://github.com/hneyra/infrastructure/blob/main/docs/00-gobierno/C-6-la-siembra-orquestada.md) §6 |
| **C-7 — `caja` arranca por primera vez** ([C-7](https://github.com/hneyra/infrastructure/blob/main/docs/00-gobierno/C-7-que-arranquen.md): el módulo `kamayuk-caja-seguridad`, las dos variables de ADR-0026 §4 en el descriptor, la prueba de arranque y `verificarArranque`) | Tres roturas, cada una sola y restaurada por copia comparada con `cmp`: quitarle el `@Component` a `ComprobadorDeAccesoJdbc`; quitar del descriptor las dos variables de conciliación; y volver la precedencia del comprobador una unión | **4 de 4** la primera —«required a bean of type `kamayuk.caja.autorizacion.ComprobadorDeAcceso`»—; 2 la segunda, en `infrastructure`, nombrando las dos variables y el pod que no levanta; 2 la tercera. **`caja` no se había arrancado nunca**, y este trabajo es donde se ve por qué importaba: además del comprobador que faltaba, su `application.yaml` exige `KAMAYUK_CAJA_RESPONSABLE` y `KAMAYUK_CAJA_CANAL` **sin valor por omisión** —ADR-0026 §4 pide una alerta a una persona con nombre—, y `EntornoDelDescriptor` no tenía campo para ellas: el hueco estaba escrito en el propio descriptor de `caja` y no se podía cerrar desde aquí. **Y el cuerpo de los eventos de pago no cambió un byte** al pasar `ComponedorDeEventosJson` a Jackson 3: se midió serializando el mismo árbol con las dos versiones, y `ContratoQueConsumeDeRentas` sigue en verde. La implantación se ejecutó contra una base creada de cero: «Municipalidad 200105 lista en caja (DEMOSTRACION): id 1, 3 accesos nuevos» |
| **D — quien publica las dos imagenes de `caja`** (`publicar-imagenes.yml`: `kamayuk-caja` y `kamayuk-caja-migrador`, etiquetadas con el `sha` de este repositorio, mas el trabajo que le pregunta al registro si la etiqueta se puede pedir) | La rotura no hubo que provocarla: **el estado de partida era el defecto**. Medido contra `ghcr.io` el 2026-09-05 con un token emitido por `https://ghcr.io/token`, las dos etiquetas que el manifiesto de `infrastructure` pide contestaban `404 MANIFEST_UNKNOWN` | Ninguno de los cinco repositorios publicaba una sola imagen —`publicar-imagenes.yml` se quedo en `sgtm`, el archivo historico, y lo que los cinco tienen se llama `registro.yml` y es la guarda de #711—, asi que un `pulumi up` habria dejado los pods en `ImagePullBackOff` **sin que nada lo predijera**: el manifiesto es valido y el planificador ubica el pod. **Dos decisiones con su motivo.** (1) La etiqueta es el `sha` de ESTE repositorio y no `applicationBootstrapVersion` —que es un `sha` de `sgtm`, una revision que ni siquiera existe en este clon—: una etiqueta que no resuelve contra ningun `git log` no identifica nada, y entonces «que corre en la municipalidad» deja de tener respuesta. (2) **Sin filtro `paths`**, al reves que el flujo del monolito, para que valga la equivalencia que la guarda de `infrastructure` necesita: *todo commit de `main` tiene sus dos imagenes*. Con filtro, un merge de solo documentacion deja un `sha` de `main` sin imagenes y «esta en la historia de main» deja de implicar «se puede desplegar», en silencio. **Y el trabajo `comprobar` no sobra**: un `build-push-action` en verde dice que el `push` no dio error; que la etiqueta se pueda PEDIR es otra afirmacion, y es la que decide si el pod arranca. Distingue los tres desenlaces a proposito, porque el tercero engaña: `200` existe, `404` no existe, y `403 DENIED` —lo que recibe un PAT de escritorio sin `read:packages`, comprobado— **no permite concluir nada** y por eso tambien falla, en vez de dar por buena cualquier respuesta que no sea 404 |
