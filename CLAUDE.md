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
| `backend/kamayuk-caja-seguridad` — la copia local de la autorización | **Deja de ser estática** (ADR-0039, etapa 4; [`identidad`#4](https://github.com/hneyra/identidad/issues/4)): `CorrerElConsumidorDeIdentidad` —un `ApplicationRunner` del perfil `batch`, que un `CronJob` despierta **cada cinco minutos**— lee el buzón de `identidad`, `AplicarUnEventoDeIdentidad` aplica cada uno de los **siete** tipos a `usuario`/`grupo`/`miembro`/`permiso` **en su propia transacción con `SET LOCAL`**, y se acusa **después** del `commit`. Lo que no se podrá aplicar nunca va a `identidad_evento_muerto` con aviso al responsable; lo que no se puede aplicar *todavía* se deja en el buzón —y si lleva más de **15 minutos** ahí, al terminar la corrida se avisa **una** vez con la lista, sin que la corrida deje de acabar bien—; los `PERMISO_FIJADO` de otros sistemas se ignoran, se acusan y se cuentan en **una línea de resumen por vuelta**. **Corre fuera del camino del cobro**: `CajaController` sigue sin inyectar ningún puerto hacia otro sistema, y la ventanilla cobra con `identidad` apagado. **Y desde la etapa 5 ([`identidad`#5](https://github.com/hneyra/identidad/issues/5)) es la ÚNICA fuente de la copia local**: `ImplantarMunicipalidad` no siembra ni un usuario, ni un grupo, ni un permiso —el sembrador se quedó con el catálogo y se llama `SembradorDelCatalogo`, con `modulo_sistema` y `acceso`—, **llama a la pasada en línea** (y el runner del `CronJob` no la repite en esa misma invocación) y **comprueba su propia postcondición** con el `ComprobadorDeAcceso` de producción: si no hay consumidor, si el buzón no contesta, o si al terminar el administrador no puede abrir las **siete** opciones de este sistema con sus **siete** privilegios —eran **tres** hasta [#74](https://github.com/hneyra/caja/issues/74): los controladores ya exigían `duplicado_recibo`, `anulacion_recibo`, `avance_recaudacion` y `recaudacion_area`, escritos como constantes, y la prueba que leía el texto fuente no los veía; hoy `CatalogoDelSistemaTest` vive en `kamayuk-caja-aplicacion` y lee el bytecode—, la implantación **falla nombrando lo que falta y su remedio** — nunca `Complete` con cero usuarios. La regla 12 **SÍ se vigila aquí**, y desde la etapa 5 su **único** escritor declarado es `AplicarUnEventoDeIdentidad`, **sin fecha de fin**. **Y desde ADR-0042 además la publica**, para que la interfaz de esta caja componga su sesión sin preguntarle a `rentas`: cinco lecturas en `infraestructura/web` —`GET /seguridad/sesion`, `/sesion/permisos`, `/sesion/municipalidad`, `/modulos` y `/accesos`—, **todas `SESION_PROPIA`** y **ninguna escritura**, detrás de cuatro casos de uso `@Transactional(readOnly = true)`; la matriz de `/sesion/permisos` usa **la precedencia exacta de `ComprobadorDeAccesoJdbc`** —que exige `a.activo` sólo en la rama del grupo, al revés que la lectura de `rentas`— y `LecturaDeLaCopiaLocalJdbcTest` lo mide par a par contra el comprobador de producción |
| `backend/kamayuk-caja-{dominio-compartido, plataforma}` | Copias de las de `rentas`, con el paquete renombrado. Ver el hueco de las cuatro copias |
| `backend/kamayuk-caja-aplicacion` | Ensambla y aloja las barreras |
| `infrastructure/` — el descriptor | `yarn verificar` en verde, **45 pruebas** desde #74. Declara **tres imágenes** y despliega **tres cosas**: el backend con el perfil `web`; desde la etapa 4 de ADR-0039 el `CronJob` `kamayuk-caja-consumidor-de-identidad` —`*/5 * * * *`, `Forbid`, `backoffLimit: 1`, la clase `lote`, **sin `suspend`**, con las cuatro `KAMAYUK_IDENTIDAD_*` y la segunda credencial de emisor `kamayuk-caja-<amb>-identidad`, y una arista de egreso a `identidad-sistema` en `kamayuk-identidad-<amb>`—; y, desde #17, `kamayuk-caja-interfaz` —su `Deployment` sin una sola variable de entorno, su `Service` y, desde #74, un `ConfigMap` que ya no copia el `nginx.conf` sino que monta `configuracion.js` con las señas del ambiente (`window.__KAMAYUK_CAJA__`: emisor, cliente `kamayuk-backoffice` y alcance)—. Su `IngressRoute` va **partido en dos rutas con `priority` explícita**: `/caja/api/v1` al backend y `/caja` a la interfaz, quitándole el prefijo con un `stripPrefix` — **y desde #44 esa segunda ruta sólo se declara fuera de `prod`** (`AMBIENTE_SIN_INTERFAZ`), que es la única asimetría entre ambientes de este archivo y lleva su decisión escrita al lado: la maqueta de ventanilla no se sirve en el dominio de producción, y el `Deployment` y el `Service` **siguen ahí**. **El responsable de la conciliación ya no falta**: C-7 le dio su campo a `EntornoDelDescriptor` y la línea 170 pone `KAMAYUK_CAJA_RESPONSABLE` desde `e.operacion.responsable` — este renglón decía lo contrario y era de antes de C-7. Lo que falta hoy vive en el otro repositorio, y está declarado en [`docs/00-gobierno/huecos-en-infrastructure.md`](docs/00-gobierno/huecos-en-infrastructure.md) |
| `docs/30-arquitectura/adr/` | **Dos ADR propios, y los dos son de su interfaz**: [ADR-0040](docs/30-arquitectura/adr/ADR-0040-la-ventanilla-se-conecta.md) —la ventanilla se conecta, sólo para leer, y la ruta de `prod` se retira la última— y [ADR-0042](docs/30-arquitectura/adr/ADR-0042-la-ventanilla-lee-su-propia-copia.md) —habla sólo con `/caja/api/v1` y el emisor, y los permisos de la sesión salen de **su** copia, nunca de `rentas`—. Lo que la caja *hace* lo siguen decidiendo ADR-0026 y ADR-0029. La reconstrucción de la interfaz que los cumple es [#74](https://github.com/hneyra/caja/issues/74) |
| `frontend/` — `caja-web` | **Rehecha en #74 con el stack y el método de `rentas-web`**, y la maqueta V6 —sus datos copiados del artboard, su ESLint sin `fetch` y sus siete arneses— **se retiró entera**. React 19.3 + Vite 7 + Tailwind 4, TanStack Query, i18next y Playwright; `@kamayuk/{api,formato,sesion,shell,ui}` y `@kamayuk/verificaciones` por `link:` desde **`../kamayuk-lib`, que tiene que estar clonado al lado**. **Habla con `/caja/api/v1` y con Keycloak, y con nadie más** (ADR-0042): la puerta PKCE va con el cliente público `kamayuk-backoffice`, y lo que la sesión puede abrir sale de los cinco `GET` de `kamayuk-caja-seguridad` —`/seguridad/{modulos,accesos}` y `/seguridad/sesion{,/permisos,/municipalidad}`—, que leen la copia local de ADR-0039; con `rentas` apagado la ventanilla abre. **Sólo lee** (ADR-0040): `src/api/cliente.ts` exporta `leer` y nada con qué escribir, y cobrar, cerrar y anular están **declarados en el árbol y no se llaman**. **El árbol no sale de un artboard, que caja no tiene: sale de sus accesos y sus controladores** —siete hojas bajo Tesorería, una por acceso—, y lo ata `verificaciones/el-arbol-cuadra-con-el-backend.test.ts`, que lee `CatalogoDelSistema.java` y los `*Controller.java`. Las pantallas las dibuja el intérprete de `@kamayuk/ui` (`kamayuk-lib`#27), y **desde #84 seis de las siete leen**: `datos/conectores.ts` pide `GET /cajas`, `/recibos`, `/pagos/sin-entregar`, `/recaudacion/avance` y `/recaudacion/por-area`, formatea sin calcular —ningún total sale del cliente— y dice en el hueco lo que su lectura no trae (el arqueo espera al turno, la conciliación a la fecha, el recibo elegido a poder elegirlo); las horas se dicen en `America/Lima`, porque cortar un instante UTC fecharía un cobro nocturno al día siguiente. La anulación solo escribe y lo dice. **La cuenta de la barra la contesta el backend**, o la barra dice que esta copia no la conoce —lo que #44 quitó no vuelve, y lo vigila `la-cuenta-no-se-inventa.test.tsx`—. `yarn verificar` da `Test Files 35 passed (35)` y `yarn e2e` **39 caminos** (#84), medidos con Node 22 (con Node 24 fallan las pruebas del armazón por `AbortSignal`, y no es un defecto de aquí) |
| La imagen de la interfaz | **`kamayuk-caja-interfaz`, desde #16**, y **desde #74 con la forma de `rentas`**: `frontend/Dockerfile` compila con **`kamayuk-lib` como contexto con nombre** (`--build-context` en `publicar-imagenes.yml`, `additional_contexts` en el compose) y `nginx:1.31.4-alpine` sirve `dist/` con `USER 101` **en la raíz del contenedor**. Pedirle `/caja/` contesta un **404 que nombra el `stripPrefix`**: hasta #74 servía las dos entradas (#42), y eso dejaba un camino que el clúster no usa y el compose sí; hoy hay uno, igual en los dos. `configuracion.js` se sirve con `no-store` y el descriptor lo monta encima. La guarda del propio `Dockerfile` **no construye** un paquete que lleve `.ts`, la API de otro sistema o la marca de las capturas. **No se llama `caja-web`**: ese nombre ya es el `Deployment` y el `Service` del backend con el perfil `web` de Spring |
| `despliegue/compose.yaml` | **Cuatro servicios desde #18**: `caja-migraciones`, `caja-implantacion`, `caja` y `caja-interfaz`. El cuarto **no declara `depends_on`** —la interfaz arranca sin backend y lo dice en pantalla, y una dependencia inventada haría que el compose mintiera sobre el grafo que la guarda de `infrastructure` compara—. **Desde #74 el prefijo lo reparte Traefik, como en el clúster**: el backend va por `PathPrefix(/caja/api/v1)` con `priority` 20 y la interfaz por `PathPrefix(/caja)` con `priority` 10 y un `stripprefix`, así que se abre en `http://localhost:8080/caja/`; el `8082` que sigue publicando sirve la raíz, que es lo que llega detrás del ingreso. **Y desde #39 lo lee alguien de este repositorio**: `despliegue/verificar-el-compose.mjs`, con `docker compose config` de verdad —que no necesita demonio, **ni el clon de `kamayuk-lib`**, medido— y el flujo `Despliegue` con su `paths:` |
| Lo que falta y vive en `infrastructure` | **Declarado, no descubierto tarde**: [`docs/00-gobierno/huecos-en-infrastructure.md`](docs/00-gobierno/huecos-en-infrastructure.md) — la `version` del descriptor fijado, las dos guardas que este lote deja en rojo y, desde #74, el censo de la interfaz que pasa de `configmap` a `imagen` |

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
frontend/                       caja-web: la interfaz de ventanilla, con el stack de rentas-web (#74)
  src/                              lo que se despliega. Es la ruta que vigila la guarda del registro
    api/                              la puerta PKCE (@kamayuk/sesion) y el cliente que solo lee
    datos/                            las lecturas de sesion y catalogo, y sus capturas (solo pruebas)
    pantallas/                        el arbol de Tesoreria, sus definiciones y el tono de insignia
    i18n/                             i18next y el locale, extraido por i18next-cli
  desarrollo/                       la siembra de `yarn dev`, que no viaja al paquete
  e2e/                              los caminos de Playwright, sobre el `dist/` servido
  verificaciones/                   las guardas de Vitest, las muestras de ESLint y las de las guardas
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

cd ../frontend                    # necesita ../kamayuk-lib clonado al lado
yarn install && yarn verificar    # caja-web: ESLint (con sus muestras), tipos y Vitest. Node 22
yarn build                        # el artefacto de produccion, en frontend/dist/
yarn dev                          # http://localhost:5181/caja/, con el catalogo sembrado y sin plataforma
yarn dev:con-plataforma           # lo mismo contra Keycloak (8180) y Traefik (8080), con login real
yarn e2e:navegador && yarn e2e    # Playwright: construye, sirve el dist/ y recorre
docker buildx build --build-context kamayuk-lib=../kamayuk-lib --target interfaz -f frontend/Dockerfile frontend

# La plataforma: PostgreSQL con las cuatro bases, Keycloak con sus dos realms, Traefik y el buzon
cd ../../infrastructure
docker compose -f despliegue/plataforma.compose.yaml up -d --wait

# Lo de ESTE sistema contra ella: sus tres procesos y su interfaz (#18). El `.env` es el de
# la plataforma, y la red `kamayuk-plataforma` tiene que existir ya (`external: true`).
# `caja-interfaz` se levanta SOLO: no arrastra migrador, implantacion ni backend.
cd ../caja
docker compose -f despliegue/compose.yaml up -d --build --wait
docker compose -f despliegue/compose.yaml up -d --build caja-interfaz --wait
# Por Traefik, que quita el prefijo como el ingreso del cluster (#74). Pedirle `/caja/` al
# puerto propio de la interfaz contesta 404 a proposito: ese camino no existe en el cluster.
curl -sf http://localhost:8080/caja/

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

**Y el cuerpo del PR cierra su issue con `Closes #N`, en inglés y en el cuerpo —nunca en el
título—.** No es una excepción al idioma de la casa: es que **GitHub sólo auto-cierra con
`close(s|d)`, `fix(es|ed)` y `resolve(s|d)`**, y «Cierra #N» —que la guarda acepta, y va a seguir
aceptando— **no cierra nada**. Pasó en `rentas`#129: PR mezclado, CI verde, fila escrita e issue
abierto hasta la auditoría. Desde [`infrastructure`#165](https://github.com/hneyra/infrastructure/issues/165)
eso sale **rojo** también aquí, en `Registro`, nombrando el issue que se quedaría abierto. Si de
verdad no quieres auto-cierre, no lo declares: «Ref» o «Parte de» no disparan nada.

**Y ese guion no es sólo de este repositorio**: es el mismo archivo en los seis, byte a byte salvo
el bloque de `RUTAS_DE_CODIGO` —su comentario y la lista—, y lo vigila
`infra/verificaciones/las-seis-copias-de-la-guarda-del-registro.test.ts` en `infrastructure`
([#165](https://github.com/hneyra/infrastructure/issues/165)). Cambiarlo fuera de ese bloque es
cambiarlo en los seis, y `infrastructure` se mezcla el último. Lo que sí es de aquí es la
autoprueba, que ejerce la lista de este árbol.

| Verificación | Cómo se demostró que puede fallar | Resultado |
|---|---|---|

**Las filas viven en [`docs/agent/HISTORY.md`](docs/agent/HISTORY.md)**, y ahí es donde se
escribe la siguiente. Las 44 primeras se mudaron el 2026-09-12: eran el **88 %** de este archivo,
que se carga entero en cada sesión ([#114](https://github.com/hneyra/infrastructure/issues/114)).
Desde el tercer tiempo de esa mudanza, **una fila escrita aquí ya no cuenta**: la guarda sólo
mira `docs/agent/HISTORY.md`.

La tabla de arriba se deja **con su cabecera y vacía** a propósito: es la forma de la fila que hay
que escribir, y tenerla delante evita ir a buscarla.
