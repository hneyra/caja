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
| `backend/kamayuk-caja-esquema` | **`V1__baseline.sql`** (23 tablas), **`V2__ordenes_de_cobro_y_outbox.sql`** y, desde la etapa 4 de ADR-0039, **`V3__consumidor_de_identidad.sql`**: `identidad_evento_aplicado` e `identidad_evento_muerto`, las dos con RLS `ENABLE`+`FORCE`, `INSERT, SELECT` para `kamayuk_app` y **sin `UPDATE` ni `DELETE`** —un acuse local no se edita—. El baseline se corrigió al traerlo: le sobraban **ocho funciones y cinco dominios** de otros sistemas, y una de las ocho hacía morir la migración sobre una base sin `unaccent` |
| `backend/kamayuk-caja-nucleo` | El contexto acotado entero: orden de cobro, ventanilla, recibo, turno, cierre, arqueo, tasas y **el buzón de salida**. Y desde la etapa 4, `ClienteHttpDelBuzonDeIdentidad`: el cliente HTTP del buzón de `identidad`, que reusa `TokenDeServicioDeKeycloak` con **el mismo cliente confidencial y una segunda clave** |
| `backend/kamayuk-caja-seguridad` — la copia local de la autorización | **Deja de ser estática** (ADR-0039, etapa 4; [`identidad`#4](https://github.com/hneyra/identidad/issues/4)): `CorrerElConsumidorDeIdentidad` —un `ApplicationRunner` del perfil `batch`, que un `CronJob` despierta **cada cinco minutos**— lee el buzón de `identidad`, `AplicarUnEventoDeIdentidad` aplica cada uno de los **siete** tipos a `usuario`/`grupo`/`miembro`/`permiso` **en su propia transacción con `SET LOCAL`**, y se acusa **después** del `commit`. Lo que no se podrá aplicar nunca va a `identidad_evento_muerto` con aviso al responsable; lo que no se puede aplicar *todavía* se deja en el buzón —y si lleva más de **15 minutos** ahí, al terminar la corrida se avisa **una** vez con la lista, sin que la corrida deje de acabar bien—; los `PERMISO_FIJADO` de otros sistemas se ignoran, se acusan y se cuentan en **una línea de resumen por vuelta**. **Corre fuera del camino del cobro**: `CajaController` sigue sin inyectar ningún puerto hacia otro sistema, y la ventanilla cobra con `identidad` apagado. **Y desde la etapa 5 ([`identidad`#5](https://github.com/hneyra/identidad/issues/5)) es la ÚNICA fuente de la copia local**: `ImplantarMunicipalidad` no siembra ni un usuario, ni un grupo, ni un permiso —el sembrador se quedó con el catálogo y se llama `SembradorDelCatalogo`, con `modulo_sistema` y `acceso`—, **llama a la pasada en línea** (y el runner del `CronJob` no la repite en esa misma invocación) y **comprueba su propia postcondición** con el `ComprobadorDeAcceso` de producción: si no hay consumidor, si el buzón no contesta, o si al terminar el administrador no puede abrir las **tres** opciones de este sistema con sus **siete** privilegios, la implantación **falla nombrando lo que falta y su remedio** — nunca `Complete` con cero usuarios. La regla 12 **SÍ se vigila aquí**, y desde la etapa 5 su **único** escritor declarado es `AplicarUnEventoDeIdentidad`, **sin fecha de fin** |
| `backend/kamayuk-caja-{dominio-compartido, plataforma}` | Copias de las de `rentas`, con el paquete renombrado. Ver el hueco de las cuatro copias |
| `backend/kamayuk-caja-aplicacion` | Ensambla y aloja las barreras |
| `infrastructure/` — el descriptor | `yarn verificar` en verde, **44 pruebas**. Declara **tres imágenes** y despliega **tres cosas**: el backend con el perfil `web`; desde la etapa 4 de ADR-0039 el `CronJob` `kamayuk-caja-consumidor-de-identidad` —`*/5 * * * *`, `Forbid`, `backoffLimit: 1`, la clase `lote`, **sin `suspend`**, con las cuatro `KAMAYUK_IDENTIDAD_*` y la segunda credencial de emisor `kamayuk-caja-<amb>-identidad`, y una arista de egreso a `identidad-sistema` en `kamayuk-identidad-<amb>`—; y, desde #17, `kamayuk-caja-interfaz` —su `ConfigMap` con el `nginx.conf` del repositorio, su `Deployment` sin una sola variable de entorno y su `Service`—. Su `IngressRoute` va **partido en dos rutas con `priority` explícita**: `/caja/api/v1` al backend y `/caja` a la interfaz, quitándole el prefijo con un `stripPrefix` — **y desde #44 esa segunda ruta sólo se declara fuera de `prod`** (`AMBIENTE_SIN_INTERFAZ`), que es la única asimetría entre ambientes de este archivo y lleva su decisión escrita al lado: la maqueta de ventanilla no se sirve en el dominio de producción, y el `Deployment` y el `Service` **siguen ahí**. **El responsable de la conciliación ya no falta**: C-7 le dio su campo a `EntornoDelDescriptor` y la línea 170 pone `KAMAYUK_CAJA_RESPONSABLE` desde `e.operacion.responsable` — este renglón decía lo contrario y era de antes de C-7. Lo que falta hoy vive en el otro repositorio, y está declarado en [`docs/00-gobierno/huecos-en-infrastructure.md`](docs/00-gobierno/huecos-en-infrastructure.md) |
| `docs/30-arquitectura/adr/` | Sin ningún ADR propio, y sigue siendo correcto: lo que la caja hace lo deciden ADR-0026 y ADR-0029 |
| `frontend/` — `caja-web` | **El andamio, desde #3**: React 19 + Vite 6, un solo paquete y cero dependencias de red. `yarn verificar` encadena ESLint —con sus **cuatro** reglas propias y una muestra por regla—, `tsc` y Vitest; `yarn build` produce `frontend/dist/`. Desde #4 los **tokens de V6** en `src/ds/`, y desde #5 **todo lo que las pantallas van a enseñar** en `src/datos/`, tipado y copiado del artboard. Desde #6 lo primero que se dibuja: la **barra global** de 52 px en `src/barra/`, con su aviso de servicio y su toast; desde #7 el **árbol de módulos** de 252 px en `src/arbol/`, con su filtro y su cola de trabajo; desde #8 el **marco** en `src/marco/`: pestañas, hash en la URL, el hueco de «No hay ningún submódulo abierto», la tarjeta de un submódulo ajeno y el diálogo de cambios sin guardar; y desde #9 la **paleta de comandos** en `src/paleta/`, con el lanzador y el menú de sesión. Desde **#10 hay la primera de las cuatro pantallas**: `#panel`, el Panel de Tesorería, en `src/pantallas/`; y desde **#11, #12 y #13, la segunda entera**: `#recibos`, con la lista de 376 px —búsqueda, chips, orden y vacío— y a su derecha la **ficha de un recibo existente** —cabecera, cinco secciones, el renderizador de las seis clases de campo y su tabla de cuotas— y el **cobro nuevo**: la barra de caja y contribuyente, el número que se emitirá, la validación que **bloquea** cuando la caja está cerrada, el contador de pendientes de cada pestaña, el resumen «Lo que se va a registrar» y la emisión. `#recibos` ya no tiene ningún marcador. Y desde **#14 están las cuatro**: `#cajas`, con los seis nodos de 300 px y el arqueo del elegido a su derecha —cabecera pegajosa incluida—, y `#tarifario`, con sus tres pestañas de consulta, su píldora «Solo lectura» y la nota de cabecera y la de pie de cada una. Con eso **el marcador de sección desaparece**: el `switch` de `PantallaDeSeccion` —que es lo que `App` recibe por omisión en su ranura `Pantalla`— cubre la unión entera sin `default`, y `src/marco/MarcadorDeSeccion.tsx` pasa a ser `src/marco/pantalla.ts`, sólo el contrato. Y desde **#15 está la envoltura**: la impresión en A4 vertical —`@media print` con su `@page`, y las cuatro piezas del marco marcadas `data-cromo`—, el anillo de foco que **no llegaba a ningún campo**, y los **cuatro arneses de navegador** en CI: `paleta.mjs` (#9), `pegajosa.mjs` (#14), `mirar.mjs` y `cero-red.mjs`. Desde **#37 se sirve bajo `/caja`**: `vite.config.ts` declara `base: "/caja/"`, el escudo cuelga de `import.meta.env.BASE_URL` y no queda **ninguna** ruta absoluta a la raíz del dominio en `src/` —lo vigilan una regla de ESLint, un escáner sobre el código sin comentarios y, desde el otro lado, la guarda bidireccional de `descriptor.test.ts`—; el quinto arnés, `prefijo.mjs`, mide el `dist/` y lo que el servidor contesta. Los cortes responsive no hubo que escribirlos: entraron con `global.css` en #4 y aquí se **miden**. Y desde **#44 la pantalla dice lo que es**: una **banda permanente** (`src/marco/BandaDeMaqueta.tsx`) arriba del todo —en las cuatro secciones **y en el papel**, que es una decisión escrita en `@media print` y no un descuido de marcado—, los toast de las **cinco** acciones que en el sistema de verdad escribirían diciendo que **no escribieron nada**, y una **ficha de sesión sin nombre propio**: `SESION` se fue de `src/datos/` y lo que hay es `SIN_SESION` en `src/marco/maqueta.ts`, que entra en la barra por una prop **obligatoria**; el sexto arnés, `maqueta.mjs`, lo mide sobre el `dist/`. Y desde **#42 hay un séptimo, `sin-traefik.mjs`**, que no mide la página sino **el nginx que se despliega**: levanta la imagen base que el `Dockerfile` nombra con este `dist/` y este `nginx.conf`, y pide el paquete por las **dos entradas** —la raíz, que es lo que llega con el prefijo ya quitado por el ingreso, y `/caja/`, que es lo que llega cuando no hay nadie delante—. **Está entero**, y `yarn verificar` da `Test Files 22 passed (22)` · `Tests 664 passed (664)`. **Y NO SE CONECTA AL BACKEND, que es la mitad que hay que leer.** No es que le falte: es que no lo tiene y no lo quiere todavía. Los datos salen de `src/datos/`, copiados del artboard; `eslint.config.mjs` prohíbe `fetch` y `XMLHttpRequest` en el código; `frontend/nginx.conf` **no reenvía a ningún sitio** —contar la directiva de reenvío da cero— y `vite.config.ts` tampoco declara `server.proxy`; y `verificaciones/cero-red.mjs` lo mide en un Chromium de verdad: **0 peticiones de conexión y 0 a terceros sin declarar**, con las 10 de Source Sans 3 nombradas como lo que son. Lo que compra es que la ventanilla dibuje su pantalla en un municipio sin salida a internet; lo que cuesta es que **no haya ninguna sesión que enseñar**: no hay token, y por eso esta interfaz tampoco tiene *client* en Keycloak (ver el documento de huecos). Hasta #44 ese coste se pagaba enseñando a una persona inventada —«J. Cárdenas Vega · Cajero · caja C-3», y el mismo nombre en el campo «Cajero» que se imprime en el recibo—; hoy el `dist/` no la nombra **ni una vez**, medido con `yarn maqueta` |
| La imagen de la interfaz | **`kamayuk-caja-interfaz`, desde #16.** `frontend/Dockerfile` en dos etapas —Node 22 que compila, `nginx:1.31.4-alpine` que sirve `dist/` con `USER 101` y `HEALTHCHECK`—, su `frontend/nginx.conf` **sin ningún reenvío al backend**, su `.dockerignore`, y la tercera entrada de la matriz de `publicar-imagenes.yml`, con su `file` y su `context` propios. **No se llama `caja-web`**: ese nombre ya es el `Deployment` y el `Service` del backend con el perfil `web` de Spring. **Desde #17 el descriptor la despliega y desde #18 el compose la levanta**, en el servicio `caja-interfaz`. **Y desde #37 la interfaz es alcanzable bajo `/caja`**: `vite.config.ts` declara `base: "/caja/"` y el escudo cuelga de `import.meta.env.BASE_URL`, que es la mitad que sólo `frontend/` podía hacer. La guarda bidireccional de `descriptor.test.ts` **ha cambiado de lado** y ahora exige el `base`. **Y desde #42 su nginx sirve las DOS entradas**: la raíz —lo que le llega cuando el ingreso ya quitó el prefijo, que es el clúster— y `/caja/`, que reescribe a la raíz con un `rewrite … last`. Hasta entonces pedirle `/caja/assets/index-<huella>.js` directamente contestaba `200 text/html` con el `index.html` dentro; medido contra nginx de verdad, hoy contesta `200 application/javascript` de 293 135 B con el mismo cuerpo y el mismo `Cache-Control` que por la otra entrada. **Hay un solo camino de servicio** —un `try_files`, un `location /assets/`— y dos entradas, y eso lo vigilan a la vez `descriptor.test.ts` y `yarn sin-traefik` |
| `despliegue/compose.yaml` | **Cuatro servicios desde #18**: `caja-migraciones`, `caja-implantacion`, `caja` y `caja-interfaz`. El cuarto construye `frontend/Dockerfile` con contexto `../frontend`, **no declara `depends_on`** —esta interfaz no necesita el backend, y una dependencia inventada haría que el compose mintiera sobre el grafo que la guarda de `infrastructure` compara— y es **el único que publica un puerto**, `${KAMAYUK_PUERTO_INTERFAZ_CAJA:-8082}`. **Desde #37 hasta #42 ese puerto no servía para mirar la pantalla**: sin un Traefik delante que quitara `/caja`, el `index.html` cargaba y sus recursos —que se piden bajo el prefijo— caían en el `try_files` y contestaban `200 text/html`; o sea `curl` en verde y navegador en blanco. **#42 lo cierra donde estaba el defecto**, en `frontend/nginx.conf` y su copia byte a byte del `ConfigMap`, sirviendo las dos entradas; la dirección que se abre es `http://localhost:8082/caja/`. **Y desde #39 lo lee alguien de este repositorio**: `despliegue/verificar-el-compose.mjs`, con `docker compose config` de verdad —que no necesita demonio— y el flujo `Despliegue` con su `paths:`; hasta entonces la unica guarda que lo miraba vivia en `infrastructure` y no corre sin `normativa` clonado |
| Lo que falta y vive en `infrastructure` | **Declarado, no descubierto tarde**: [`docs/00-gobierno/huecos-en-infrastructure.md`](docs/00-gobierno/huecos-en-infrastructure.md) — la `version` del descriptor fijado, las dos guardas que este lote deja en rojo y el *client* de Keycloak que esta interfaz no tiene |

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
- **No le pregunta nada a nadie para cobrar.** `CajaController` no inyecta un solo puerto hacia
  otro sistema, y el consumidor del buzón de `identidad` (etapa 4 de ADR-0039) corre en el perfil
  `batch`, fuera del camino del cobro: la ventanilla cobra con `rentas` apagado **y** con `identidad`
  apagado, con la copia local que tenga. Lo único que `kamayuk-caja-nucleo` declara de otro módulo
  es `kamayuk-caja-seguridad` —el puerto del buzón que su cliente HTTP implementa—, y nunca al revés.
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
    arbol/                            el arbol de modulos y su filtro (#7)
    marco/                            pestanas, hash, titulo y estados vacios (#8)
    paleta/                           la paleta de comandos y sus diez acciones (#9)
    pantallas/                        las cuatro propias: el Panel (#10), la lista de Recibos (#11),
                                      la ficha y sus campos (#12), el cobro nuevo (#13) y, con #14,
                                      Cajas y arqueo, Tarifario y cierre y su tabla compartida
  verificaciones/                   las pruebas de Vitest, las muestras de ESLint, los cuatro
                                    arneses de navegador —paleta, pegajosa, mirar y cero-red— y
                                    los dos que miden el `dist/` —prefijo (#37) y maqueta (#44)—
                                    y el que mide el nginx que se despliega: sin-traefik (#42)
infrastructure/                 el descriptor de despliegue en TypeScript, con yarn
despliegue/                     compose.yaml: los tres procesos del backend y `caja-interfaz` (#18),
                                y verificar-el-compose.mjs, que lo lee en CI desde #39. La implantacion
                                lleva las cuatro KAMAYUK_IDENTIDAD_* del consumidor (etapa 4)
docs/                           los ADR que enlaza, hallazgos de RLS, P5D y la guía de desarrollo
  00-gobierno/                    P5D, la guarda del registro y los huecos que quedan en
                                  `infrastructure` (#18)
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
## El monolito se llamaba `sgtm`, y en la prosa se sigue llamando asi

El producto es **Kamayuk**. El sistema del que sale —el monolito retirado— se llamaba `sgtm`, y
ese nombre **ya no esta en el codigo**: ni en un realm, ni en una imagen, ni en un identificador, ni
en un dato de configuracion.

**Pero sigue en los comentarios, en `docs/` y en el registro de «Verificar antes de afirmar», y eso
es deliberado.** No es limpieza pendiente:

- una fila del registro que dice «copiado de `sgtm@33f329a2`» **es la medicion que se hizo**;
  reescribirla la falsifica, y borrarla pierde con que rotura se demostro;
- un comentario que dice «hasta `E` la sonda apuntaba a `sgtm`» **es el motivo por el que el codigo
  de al lado es como es**; quitar el nombre lo deja sin sujeto y hay que volver a descubrirlo;
- y varias guardas explican en su docblock **de que defecto vienen**, que es lo que impide que
  alguien las «simplifique».

**Asi que NO se hace una pasada de limpieza sobre la prosa.** Si estas aqui por un `grep sgtm` que
devuelve cientos de lineas: casi todas son de este tipo y se quedan.

**Lo que si esta prohibido es que la cadena vuelva al codigo**, y lo vigila **una sola guarda para
los seis**: `sin-el-nombre-del-monolito.test.ts` de `infrastructure`, que barre este arbol y los
cinco clones hermanos. Barre **solo codigo de produccion** —ni `docs/`, ni `*.md`, ni pruebas— y
**omite comentarios**, por lo de arriba.

Esta en un sitio y no en `comun-verificaciones` porque, medido, **del lado Java no hay nada que
vigilar**: `backend/*/src/main` de los cinco solo nombra el monolito en comentarios y en dos
`COMMENT ON COLUMN`. Anadir una prohibicion a la libreria compartida exigiria su clase de muestra y
tocaria los seis builds para vigilar el conjunto vacio.

**Dos excepciones declaradas, y las dos con su motivo dentro de la guarda.** (1) Los buckets
`sgtm-{stg,prod}-respaldos` (`infra/Pulumi.{stg,prod}.yaml`): **son el nombre de cosas que
existen**, y renombrarlos en el codigo sin renombrar el bucket manda los respaldos a un sitio que no
existe — y eso no da error hasta el dia que hay que restaurar. (2) Dos `COMMENT ON COLUMN` dentro de
un `V1__baseline.sql` **ya aplicado**: Flyway valida la suma de comprobacion de cada migracion, asi
que editar una que ya corrio hace fallar el arranque de **toda base existente**. No es que no se
quiera cambiar: **no se puede** — se corregiria con una migracion nueva, si alguna vez importa.

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
yarn dev                          # el servidor de desarrollo, en http://localhost:5181/caja/
                                  # No necesita backend: no habla con nadie

# Los cuatro arneses de navegador. Necesitan la aplicacion servida y el Chromium de Playwright
# (`npx playwright-core install chromium`); `CAJA_BASE` dice donde **con su prefijo**, por
# omision `http://localhost:5181/caja` (#37).
yarn paleta                       # la paleta de comandos, solo con el teclado (#9)
yarn pegajosa                     # la cabecera se queda, y pegada al borde (#14, #35)
yarn mirar                        # las cuatro secciones, los cortes, el teclado y el papel (#15)
yarn cero-red                     # ni una peticion fuera de los recursos propios, y todas bajo /caja (#15, #37)

# El septimo, que mide el NGINX QUE SE DESPLIEGA por sus DOS entradas —la raiz, que es lo que le
# llega con el prefijo ya quitado por el ingreso, y `/caja/`, que es lo que le llega cuando no hay
# nadie delante (#42)—. Necesita `dist/` y Docker; sin Docker NO se omite, sale con codigo 2. La
# salida documentada es apuntarlo a un nginx que ya exista:
yarn build && yarn sin-traefik
CAJA_NGINX=http://127.0.0.1:8092 yarn sin-traefik

# Los otros dos, que no necesitan Chromium y SI el artefacto: miden el `dist/`. `prefijo`
# ademas le pregunta al servidor, y apuntado a `yarn dev` lo dice y sale en vez de acusarlo (#37);
# `maqueta` solo lee el paquete, asi que le basta `yarn build` (#44).
yarn build && npx vite preview --port 5182 --strictPort &
CAJA_BASE=http://localhost:5182/caja yarn prefijo
yarn maqueta                      # el `dist/` se declara maqueta, no nombra a nadie y no
                                  # afirma ninguna escritura que no ocurre (#44)

# La plataforma: PostgreSQL con las cuatro bases, Keycloak con sus dos realms, Traefik y el buzon
cd ../../infrastructure
docker compose -f despliegue/plataforma.compose.yaml up -d --wait

# Lo de ESTE sistema contra ella: sus tres procesos y su interfaz (#18). El `.env` es el de
# la plataforma, y la red `kamayuk-plataforma` tiene que existir ya (`external: true`).
# `caja-interfaz` se levanta SOLO: no arrastra migrador, implantacion ni backend.
cd ../caja
docker compose -f despliegue/compose.yaml up -d --build --wait
docker compose -f despliegue/compose.yaml up -d --build caja-interfaz --wait
# Bajo su prefijo (#42). La raiz tambien sirve —es lo que llega en el cluster, con el prefijo
# ya quitado por el ingreso— pero lo que el `index.html` pide es esto:
curl -sf http://localhost:${KAMAYUK_PUERTO_INTERFAZ_CAJA:-8082}/caja/

# La guarda del registro (#711) y su autoprueba
node docs/00-gobierno/verificar-fila-del-registro.mjs
node docs/00-gobierno/verificar-las-muestras-del-registro.mjs

# El compose de este sistema, leido con Compose de verdad (#39). NO necesita demonio, y no se
# omite sin Compose: falla. En una maquina sin Docker, con el binario suelto:
node despliegue/verificar-el-compose.mjs
KAMAYUK_COMPOSE=/tmp/docker-compose node despliegue/verificar-el-compose.mjs
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

**Las 44 filas viven en [`docs/agent/HISTORY.md`](docs/agent/HISTORY.md)**, y ahí es donde se
escribe la siguiente. Se mudaron el 2026-09-12: eran el **88 %** de este archivo, que se carga
entero en cada sesión ([#114](https://github.com/hneyra/infrastructure/issues/114)).

La tabla de arriba se deja **con su cabecera y vacía** a propósito: es la forma de la fila que hay
que escribir, y tenerla delante evita ir a buscarla.
