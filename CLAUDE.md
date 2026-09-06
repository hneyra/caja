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
| `frontend/` — `caja-web` | **El andamio, desde #3**: React 19 + Vite 6, un solo paquete y cero dependencias de red. `yarn verificar` encadena ESLint —con sus tres reglas propias y una muestra por regla—, `tsc` y Vitest; `yarn build` produce `frontend/dist/`. Desde #4 los **tokens de V6** en `src/ds/`, y desde #5 **todo lo que las pantallas van a enseñar** en `src/datos/`, tipado y copiado del artboard. Desde #6 lo primero que se dibuja: la **barra global** de 52 px en `src/barra/`, con su aviso de servicio y su toast. **Ninguna pantalla todavía**: el árbol de módulos, las pestañas y las cuatro pantallas se portan desde `TesoreriaV6.dc.html` en los issues siguientes |
| La imagen de `caja-web` | **NO existe.** El andamio no trae `Dockerfile` ni `nginx.conf`, y `infrastructure` todavía no la nombra |

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
frontend/                       caja-web: la interfaz de ventanilla. React 19 + Vite, sin backend
  src/                              lo que se despliega. Es la ruta que vigila la guarda del registro
    ds/                               los tokens de V6 y los estilos globales (#4)
    datos/                            todo lo que las pantallas ensenan, copiado del artboard (#5)
    barra/                            la barra global, el aviso de servicio y el toast (#6)
  verificaciones/                   la prueba de que las reglas de ESLint muerden, y sus muestras
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

cd ../frontend
yarn install && yarn verificar    # caja-web: ESLint (con sus muestras), tipos y Vitest
yarn build                        # el artefacto de produccion, en frontend/dist/
yarn dev                          # el servidor de desarrollo. No necesita backend: no habla con nadie

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
| **T-0 — `frente_predio` entra en el reparto de tablas, aunque este sistema no la tenga** (la undecima regla: ningun SQL cruza la frontera de sistema) | La medida es la de R-N, y no hizo falta repetirla: el reparto se consulta con `getOrDefault(tabla, SISTEMA_REPLICADO)`, y «replicado» significa «no esta a ningun lado de la frontera» | Una tabla que **falta** en el mapa no pone nada rojo: **deja de revisarse**, en verde. Por eso la tabla nueva de `catastro` se nombra aqui el mismo dia que nace y no el dia que alguien la consulte por error — que es el dia en que ya seria tarde. Nombrar de mas una tabla que este sistema no tiene **no cuesta nada** (ningun archivo suyo la menciona) y es lo que hace que el cruce, si llega, se vea. `./gradlew build` en verde **Cifras, con la linea base medida en el mismo entorno**: `catastro` **999 -> 1 011**, `rentas` **3 150 -> 3 161**, `normativa` **623 -> 634** y `caja` **693 -> 704**, 0 fallos los cuatro contra PostgreSQL 16.13 + PostGIS 3.4.2 real. Los **+11** son los mismos en los cuatro y salen de la libreria compartida —nueve pruebas nuevas del escaner mas las dos reglas de ArchUnit, que `ReglasDeArquitecturaMuerdenTest` cuenta una por regla—; el **+12** de `catastro` es esa docena mas el caso del marco en la prueba de aislamiento. `yarn verificar` no se mueve: 38 rojas antes y 38 despues, las mismas una a una. |
| **#3 — el andamio de `caja-web`** (`frontend/`: React 19 + Vite 6 en un solo paquete, `yarn verificar` = ESLint con **tres reglas propias** + `tsc` + Vitest, `yarn build`, el escudo y `.github/workflows/frontend.yml`) | Dos roturas, cada una sola y restaurada por copia comparada con `cmp`: (1) quitarle a la muestra `identificador-con-tilde.ts` la infracción —`alícuota` → `alicuota`, `añoDeEmision` → `anioDeEmision`—; (2) quitarle a `eslint.config.mjs` la **regla**, que es lo que de verdad se protege | **1 de 8 en rojo** la primera: «Se esperaba un mensaje que casara con /Sin tildes ni eñe en identificadores/. Se obtuvo: (ninguno)», nombrando la prohibición por su nombre. La segunda **no llegó a la prueba**: `yarn verificar` encadena lint antes que test y `eslint .` se puso rojo primero con «'LETRAS_ACENTUADAS' is assigned a value but never used», o sea que una regla borrada a medias la caza el lint sin que la prueba tenga que opinar; borrando también la constante sale el mismo 1 de 8. **Y ejecutar destapó un defecto que ni el lint ni las pruebas podían ver**: `vitest@3.2.7` colgó su propio `vite@7` bajo `node_modules/vitest/`, y con dos copias de los tipos de Vite el `typecheck` murió en `vite.config.ts` con «TS2769 … Type 'Plugin<any>[]' is not assignable to type 'PluginOption'»; se fija con `resolutions` a `vite@^6.0.11` —el `tsc` de la cadena es lo único que mira la coherencia de las tres etapas—. Medido además con un navegador de verdad, no con jsdom: `yarn dev` (5181) y `vite preview` sobre `dist/` (5182) dan los dos `<h1>caja-web</h1>`, título «Tesorería · caja-web», el escudo con tamaño natural **350×420** y **cero errores de consola**; `eslint . --format json` linta **7 archivos** e ignora las **3 muestras**, que es la propiedad que hace que el andamio no nazca en rojo por su propio material de prueba |
| **#4 — los tokens de V6** (`frontend/src/ds/`: `tokens/{colores,tipografia,formas}.css` como *custom properties*, `global.css` con el bloque `<style>` del artboard portado entero, las cuatro insignias en `ds/tokens.ts` y la carga de Source Sans 3 en `index.html`) | Dos roturas, cada una sola y restaurada por copia comparada con `cmp`: (1) `--azul: #005284` → `#005285`, la que pide el issue; (2) borrar de `global.css` la **regla** `input:focus …`, que es lo que de verdad se protege | **3 en rojo** la primera, desde tres ángulos que no se solapan: la tabla de tokens («expected '#005285' to be '#005284'»), el inventario que exige que **ningún** hexadecimal declarado en `tokens/` esté fuera de la lista —lo que caza un color *nuevo*, cosa que la tabla no puede— y el `borderColor` de un `<input>` **enfocado de verdad**, que dice que el token no sólo está declarado sino que llega al elemento. **3 en rojo** la segunda: «expected '' to be '0 0 0 3px #D3EBFA'». **Pero lo que este issue deja de verdad es una afirmación falsa que estuvo escrita aquí y hubo que retirar.** La primera versión sostenía que «el `getComputedStyle` de jsdom ignora toda regla con pseudo-clase». **Es falso**: con la regla en hexadecimal literal, jsdom devuelve el `box-shadow` entero. Lo que jsdom **no** hace es resolver `var()` —le sale `0 0 0 3px var(--anillo-campo)`—, y como este diseño está escrito con tokens, ésa es toda la diferencia que justifica happy-dom: el motivo era otro, no el que se había escrito. Lo que engañó fue el **orden de la medición**: el entorno memoriza el estilo calculado de cada elemento y `focus()` no invalida esa memoria, así que la sonda leyó antes de enfocar, vio `""` y se lo achacó a la pseudo-clase. **La memorización tampoco es de happy-dom: jsdom hace lo mismo**, medido, y estaba mal atribuida. **Y había algo peor que la redacción**: la aserción fuerte pasaba **por el orden en que caían las pruebas**. Dentro de `tokens.test.ts`, leer el estilo de un input sin foco envenenaba la sustitución de `var()` para todo lo que viniera después —comprobado por eliminación: quitando esa prueba, la aserción volvía a pasar—, de modo que el campo enfocado sólo salía bien porque corría antes. La corrección no es un `beforeAll` sino **separar las pruebas de foco a `foco.test.ts`**, porque Vitest aísla el entorno por archivo y allí el efecto desaparece; y va acompañada de una prueba que **afirma esa independencia del orden**, para que si algún día vuelven a compartir archivo salga roja ahí y no en una pantalla. Verificado además con `--sequence.shuffle`, tres corridas, 75 de 75. Con ello se fue una prueba que **no podía fallar por el motivo que decía comprobar** —afirmaba que `navigator.userAgent` contenía «HappyDOM»—, sustituida por dos que miden sobre un jsdom levantado en el propio archivo: que `:focus` **sí** aplica y que `var()` **no** se resuelve. El día que jsdom lo resuelva, salen rojas solas y la excepción sobra. **Y queda dicho lo que esto NO prueba**: lo que un navegador *pinta*. Eso es el arnés de Playwright del issue de accesibilidad; esto es lo más fuerte que un emulador de DOM puede afirmar. **El criterio 2 del issue está mal planteado y ya salía rojo sobre `main` antes de este PR**: su `grep -ri` busca «Inter» como subcadena y «interfaz» la contiene, así que casa con un comentario de #3 que no tiene nada de la paleta descartada. Se comprueba de verdad con `\bInter\b`, que deja `frontend/src` limpio. La contorsión que se había hecho para esquivarlo —declarar `ColoresDeInsignia` con `type` en vez de `interface`— **se revirtió**: deformar el código para que pase una comprobación mal escrita es peor que la comprobación. **Un último modo de fallo, visto al pasar**: con dos archivos de prueba que no cargaban, Vitest imprimió «`Test Files 2 passed (4)`» — «2 de 4» y aun así la palabra *passed*. El recuento entre paréntesis es el que hay que leer. Las pruebas quedan en **75** y `yarn build` emite por primera vez una hoja de estilos: `dist/assets/index-*.css`, **2,59 kB** (gzip 1,16), con la cadena de tres `@import` ya aplanada. |
| **#5 — los datos de proxy y los vocabularios** (`frontend/src/datos/`: `tabla.ts`, `navegacion.ts`, `cajas.ts`, `recibo.ts`, `recibos-del-turno.ts`, `arqueo.ts` y `tarifario.ts`, copiados de las líneas 942-1215 de `TesoreriaV6.dc.html`, más el escáner de importes de `src/` y **21 pruebas nuevas**) | Cuatro roturas, cada una sola y restaurada por copia comparada con `cmp`: (A) la que pide el criterio 4, `deudaTotal: 3455.24`, **con su campo declarado `number`**; (B) la misma cifra **sin declarar el campo**, que es el descuido de verdad; (C) quitar el `eslint-disable` de la única excepción; (D) transponer dos dígitos de una celda, `2,055.04` → `2,055.40` | **(A)** `yarn lint` en rojo —`src/datos/recibos-del-turno.ts:82:25`, «Un importe es texto y jamás number: como number pierde céntimos»—, `tsc` **verde**, y el escáner rojo nombrando **las dos formas**: `:82 deudaTotal (declaracion)` y `:98 deudaTotal (literal)`. **(B) `yarn lint` en verde**, y ésa es toda la razón de que el escáner exista: la regla de ESLint mira **tipos**, y en `{ cod: "0003-0041184", deudaTotal: 3455.24 }` no hay ni un tipo escrito —el `number` lo infiere TypeScript—. `tsc` sí cae ahí, pero por otra cosa («TS2353: Object literal may only specify known properties, and 'deudaTotal' does not exist in type 'Recibo'») y esa red **desaparece en cuanto el campo existe**, que es el caso A; el escáner es el único que dice lo que pasa: `:96 deudaTotal (literal)`. **(C)** rojo por los dos lados —`lint` en `:79:19`, y la prueba con «declara `valor: number` sin la directiva de ESLint con su motivo en la linea de arriba: expected 0 to be greater than 20»—, que es lo que hace que la excepción sea una excepción y no un hueco: `valor` **entra** en `CAMPOS_DE_DINERO` sabiendo que hay uno declarado, en vez de dejarse fuera del selector. **(D) 2 en rojo desde dos ángulos que no se solapan**: la transcripción literal («expected ['2,055.40', …] to deeply equal ['2,055.04', …]») y la aritmética de la propia fila («la cuota 2024 · Impuesto predial · 1 a 4 …: expected 205504 to be 205540», en céntimos enteros porque `0.1 + 0.2` no es `0.3`). **Las cuentas del diseño cuadran de verdad**, y por eso valen como comprobación de la copia: las tres cuotas suman `2,511.94`, que es el importe del primer recibo, y los cuatro arqueos cuadran solos. **Y contarlos destapó una trampa del artboard**: la línea «Cobrado con tarjeta» lleva `+` y **no entra en la suma** —C-4 es `200.00 + 2,884.20 = 3,084.20` con sus `612.00` de tarjeta fuera—; está bien que esté fuera (ese dinero no está en el cajón) y en C-3 el detalle lo dice, pero en las otras tres **sólo lo dice la aritmética**, así que la prueba lo fija. **Los tres desajustes con el contrato se midieron contra el backend de este repositorio, no se copiaron del issue**: `NumeroDeRecibo` compone `"%s-%07d"`, o sea que el correlativo **sí** coincide con el diseño y lo que no coincide es el ancho de la serie, que **no lo fija nadie** (`serie varchar(5)`, de 1 a 5 caracteres: `0003` cabe y `1` también, luego una pantalla que reserve cuatro dígitos se rompe); y del **fondo inicial del turno** lo grave no es que `ArqueoResource` no lo publique, sino que su `diferencia` sale de `ArqueoDelTurno` como `declarado − neto`, de modo que **el fondo no está ni sumado por dentro** y un cajero que empiece con 200,00 en el cajón declarará +200,00 de diferencia contra un backend que no sabe de dónde salen — de los tres es el único que no se arregla con un rótulo. Las pruebas pasan de **75 a 96**, «`Test Files 6 passed (6)`» con el paréntesis leído, y **3 corridas con `--sequence.shuffle`, 96 de 96**. `yarn build` en verde, 30 módulos: **`src/datos/` todavía no llega al *bundle*** y es correcto —ninguna pantalla lo importa—, medido con `grep -c "0003-0041184" dist/assets/index-*.js` → **0**. **Y la copia no se dio por buena leyéndola**: se extrajeron las líneas 942-1215 a un módulo, se cargaron en Node y se compararon las **catorce constantes del artboard** contra `src/datos/`, una a una —**12 de 12 en verde**, incluidos los 48 pares de `HOJAS` y los trazos SVG—; para saber que esa comparación muerde, **un solo carácter** cambiado en un trazo (`12.8 0` → `12.8 1`) la pone en **2 rojos**, `MODULOS` e `ICO_MOD`. Esa prueba **no se versiona** y es correcto que no: el artboard no está en el repositorio, y una prueba que necesita un archivo que nadie tiene sale roja en CI por un motivo que no es el suyo |
| **#6 — la barra global** (`frontend/src/barra/`: `BarraGlobal.tsx` de 52 px con hamburguesa, escudo, entidad, campana, ejercicio, lupa, lanzador de nueve puntos y ficha de sesión; `AvisoDelSistema.tsx`, `Toast.tsx` con su reloj de 3 400 ms, los datos en `src/datos/barra.ts`, el estado en `App.tsx` y **28 pruebas nuevas** en dos archivos) | Tres roturas, cada una sola y restaurada por copia comparada con `cmp`: **(A)** quitarle al `useEffect` del toast su `return () => clearTimeout(reloj)`; **(B)** quitarle al subtítulo de la entidad su `data-sm-hide="1"`; **(C)** sacar `public/escudo-catacaos.png` de su sitio | **(A) 1 en rojo**: «expected 1 to be +0» en `expect(vi.getTimerCount()).toBe(0)` tras el `unmount()`. **(B) 3 en rojo desde tres ángulos**: «expected 'block' to be 'none'» a 700 px, a 760 px justos y en la sonda que afirma que happy-dom sí evalúa la consulta. **(C) 1 en rojo, y en el archivo que hace la petición de verdad**: «expected 'text/html' to contain 'image/png'» —mientras la aserción que lee el `src` del JSX **seguía verde**, 27 de 28—, que es exactamente por qué el criterio 3 exige no leer el JSX. **Y ejecutar el artboard en vez de leerlo destapó un hueco del diseño**: `seccionesStyle`, el estilo que su plantilla pide en la línea 106 para la hamburguesa, **no existe** — se extrajo su `<script type="text/x-dc">` a un módulo, se cargó en Node con un `DCLogic` de mentira y `renderVals()` devuelve `undefined` para esa clave, con `hasOwnProperty` en `false`. Qué pinta entonces el prototipo **no se ha medido** (haría falta su `support.js`, que no viaja con el archivo) y por eso no se afirma; la hamburguesa toma `lanzadorStyle`, que es el único estilo que el artboard define para un botón de esta barra que **alterna** algo. **Se retiró una aserción que no podía fallar por el motivo que decía comprobar**: el criterio 7 pide que tras el desmontaje no haya «aviso de React», y con la rotura (A) puesta el espía de `console.error` **siguió en verde** — React 18 retiró aquel «Can't perform a React state update on an unmounted component» y React 19 tampoco lo emite: la actualización sobre un componente desmontado se ignora en silencio. Contar los temporizadores es lo único que distingue el caso bueno del malo, así que es lo único que se afirma. **Tres medidas más que cambiaron cómo está escrita la prueba**, todas por ejecutar: jsdom **no evalúa** `@media (max-width: 760px)` —a 700 px devuelve `block`— mientras happy-dom sí, que es la segunda razón (junto a `var()`) de la excepción de entorno, y las dos están escritas como sondas que se pondrán rojas el día que sobren; la memoización del estilo calculado **no la invalida `setViewport`**, sólo tocar el DOM, así que cada prueba de ancho fija el ancho **antes** de dibujar; y `vi.advanceTimersByTime` **sin `act()`** dispara el `setState` pero no redibuja, de modo que la prueba del toast afirmaba «sigue ahí» sobre un DOM viejo — así escrita salía roja con el toast entero delante. **El servidor de desarrollo de Vite responde 200 con el `index.html` a cualquier ruta desconocida** —medido, la primera versión de esa prueba afirmaba lo contrario y salió roja—, así que el 200 no prueba nada: lo que prueba son el `content-type`, la firma PNG y el tamaño exacto, y por eso están los tres. **Un matiz del criterio 5**: dice «al descartarla desaparecen la banda y la campana», y la campana ya no está — el artboard la retira al **abrir** el aviso (`aviso: s.aviso && !s.avisoAbierto`, línea 1807), no al descartarlo; el final es el que pide el criterio y el camino es el del diseño. **El árbol arranca cerrado a propósito** aunque el artboard arranque con `secOpen: true`: hasta el issue del árbol, `aria-expanded="true"` sobre una región que no existe es algo que un lector de pantalla anuncia. Las pruebas pasan de **96 a 124**, «`Test Files 8 passed (8)`» con el paréntesis leído, y **3 corridas con `--sequence.shuffle`, 124 de 124**. `yarn build` en verde, 41 módulos. **Y se miró la pantalla en un Chromium de verdad, no en un emulador**: alto **52 px** exactos, fondo `rgb(0, 54, 90)`, escudo `/escudo-catacaos.png` a 36 px con tamaño natural **350×420**, el toast con `rgb(22, 35, 44)`, radio 7 px y su sombra, retirándose solo; a 700 px los **tres** `data-sm-hide` en `none`; **cero errores de consola y cero peticiones fallidas**. La copia se cotejó además contra el artboard **ejecutado**: 11 comprobaciones —entidad, los cuatro ejercicios, el contador y el rótulo de la campana, los dos títulos de la hamburguesa, los nueve puntos, el texto del toast para los cuatro años, los 3 400 ms de la línea 1275, el aviso de la 431 y la ficha de sesión de las 164-170— **11 de 11 en verde**, y muerde: cambiando **un dígito** del aviso (`534` → `543`) sale 1 rojo. Ese cotejo **no se versiona**, por lo mismo que en #5 |
