# Los huecos que `caja-web` deja en `infrastructure`

| Campo | Valor |
|---|---|
| Estado | Vigente |
| Abierto por | #18, el último del lote de dieciséis de `caja-web`; ampliado en #79 con el §4 |
| Medido en | `infrastructure` en `main`, clonado en `../infrastructure`, con vitest 3.2.7 y `docker compose v5.5.1` |

Este repositorio ya declara su interfaz entera: la imagen (#16), el `Deployment`, el `Service`, el
`ConfigMap` y las dos rutas del `IngressRoute` (#17) y el servicio de compose (#18). **Lo que falta
está al otro lado de la frontera**, en el repositorio `infrastructure`, y aquí no se puede tocar:
se declara, no se hace a medias.

Se escribe por la costumbre de esta casa. El responsable de la conciliación estuvo declarado como
hueco desde P5D hasta C-7, **y por eso se cerró en vez de descubrirse en un despliegue**. Un hueco
que nadie escribió no se distingue de un descuido, y un rojo que nadie predijo se lee como un
fallo.

> **Nada de lo de abajo es opinión.** Cada afirmación lleva el comando que la produjo. Y **las tres
> que se encargó escribir tenían algo que no cuadraba al medirlas**: la primera es directamente
> falsa —lo que rompe no es lo que decía—, la segunda nombra dos archivos donde son tres y da por
> nuevos dos rojos que ya estaban vivos desde #17, y la tercera nombra el archivo que *lee* los
> clientes en vez del que los *declara*. Las tres quedan corregidas abajo, con la medida delante.

---

## 0 · El impedimento de entorno: `yarn verificar` de `infrastructure` no corre aquí

**Antes que los tres huecos, porque es lo que impide comprobarlos.**

`infra/descriptor/sistemas.ts` importa los cuatro descriptores hermanos, y **`normativa` no está
clonado**. Cualquier prueba que llegue a ese módulo falla al cargarlo — no al comparar: al
*cargarlo*, así que no se pone roja diciendo qué falta, se cae antes de mirar nada.

```
$ cd ../infrastructure/infra
$ ./node_modules/.bin/vitest run \
    verificaciones/compose-de-los-sistemas.test.ts \
    verificaciones/despliegue-de-los-sistemas.test.ts

 RUN  v3.2.7 /home/…/infrastructure/infra

⎯⎯⎯⎯⎯⎯ Failed Suites 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  verificaciones/compose-de-los-sistemas.test.ts   [ … ]
 FAIL  verificaciones/despliegue-de-los-sistemas.test.ts [ … ]
Error: Cannot find module '../../../normativa/infrastructure/src/descriptor'
       imported from '/home/…/infrastructure/infra/descriptor/sistemas.ts'
 ❯ descriptor/sistemas.ts:21:1
     19| import { caja } from "../../../caja/infrastructure/src/descriptor";
     20| import { catastro } from "../../../catastro/infrastructure/src/descrip…
     21| import { normativa } from "../../../normativa/infrastructure/src/descr…
       | ^
     22| import { rentas } from "../../../rentas/infrastructure/src/descriptor";

 Test Files  2 failed (2)
      Tests  no tests
```

Es el modo de fallo de `C-20 — los catorce sin sus hermanos`, y **la salida es clonarlo**:

```bash
cd ..                 # el directorio que contiene a caja/ e infrastructure/
git clone https://github.com/hneyra/normativa
```

**Lo que sí corre aquí** es `cd infrastructure && yarn verificar` de **este** repositorio —el
descriptor de `caja`, 31 pruebas—, y eso es lo que su CI exige. Lo de arriba es la guarda
*compuesta*, que vive en el otro lado por construcción: sólo existe al comparar las dos mitades.

> **Y hay una trampa de espacio de trabajo encima**, medida al escribir esto. En un `git worktree`,
> `infrastructure/node_modules/@kamayuk/infra-contrato` es un enlace relativo
> (`../../../../infrastructure/infra/contrato`) que se resuelve **desde el directorio del árbol de
> trabajo**, no desde el clon: apunta a `<…>/.claude/worktrees/infrastructure/…`, que no existe.
> Medido: `yarn typecheck` saca **48 `error TS7006: Parameter '…' implicitly has an 'any' type`**
> y **2 `error TS2307: Cannot find module '@kamayuk/infra-contrato'`**. La causa la nombra el
> `TS2307`, que además sale el primero — y aun así el hallazgo es el reparto: son dos líneas que
> dicen la verdad enterradas bajo cuarenta y ocho que hablan de parámetros sin tipo, y cualquiera
> lee las últimas. Se arregla rehaciendo el enlace a la ruta **absoluta** del clon —y la ruta
> relativa no sirve precisamente porque el árbol de trabajo no está donde el clon:
>
> ```bash
> # <CLON> es el directorio del clon de `caja`, no el del arbol de trabajo
> ln -sfn "$(cd <CLON>/../infrastructure/infra/contrato && pwd)" \
>         infrastructure/node_modules/@kamayuk/infra-contrato
> ```

---

## 1 · `infra/descriptor/sistemas.ts` — la `version` del descriptor fijado

**Ruta exacta:** `infrastructure/infra/descriptor/sistemas.ts`, línea 28.

```ts
{ version: "0.1.0", descriptor: caja },
```

### Lo que se me encargó escribir, y por qué no lo escribo

El encargo decía: *«hay que subir la `version` del descriptor fijado de `caja`, o compone los
manifiestos con la versión vieja y **la interfaz no aparece en el clúster** aunque este repositorio
la declare»*.

**Medido, eso es falso, y por dos motivos independientes.** Los dos se comprueban ejecutando el
código de `infrastructure` contra el descriptor de `caja` de esta rama:

| Medida | Resultado |
|---|---|
| `manifiestosDe(caja, ENTORNO).map(m => m.metadata.name)` | **12 manifiestos, y `kamayuk-caja-interfaz` está entre ellos** — sin tocar ninguna versión |
| El cuerpo de `componerDescriptores` en `infra/descriptor/index.ts` | **no contiene la palabra `version` ni una vez**: desestructura `for (const { descriptor } of fijados)` y el campo se queda sin leer |

Y hay una tercera razón, escrita en la cabecera del propio `sistemas.ts`: la dependencia es
`link:`, no `file:`, o sea **un enlace al árbol de fuentes del clon hermano**, no una copia
publicada. La línea 19 dice `import { caja } from "../../../caja/infrastructure/src/descriptor"`:
lo que se compone es el archivo que hay en el disco, no una versión.

Para saber que esa medida muerde y no pasa por vacía, se cambió el nombre buscado por uno
inventado:

```
× `manifiestosDe` ya emite el Deployment de la interfaz, sin tocar ninguna version
  → expected [ …(12) ] to include 'kamayuk-caja-inexistente'
```

### Lo que sí es cierto, y sigue siendo un hueco

Esa `version` es hoy **documentación**: dice qué versión del paquete `@kamayuk/infra-caja` se creyó
fijar. `caja/infrastructure/package.json` también declara `0.1.0`, así que las dos coinciden **por
casualidad de no haberse movido ninguna**. La interfaz entera —tres imágenes, dos `Deployment`, dos
rutas— entró bajo el mismo número.

Lo que hace falta es subir las **dos** a la vez, o retirar el campo:

- `caja/infrastructure/package.json` → `version`
- `infrastructure/infra/descriptor/sistemas.ts:28` → `version`

**Qué se rompe si no se hace:** nada, hoy — y ése es exactamente el problema. Un número que no
gobierna nada y que nadie compara es el que se queda viejo sin ponerse rojo, que es el defecto
contra el que este proyecto lleva doscientos issues escribiendo guardas. El día que
`ADR-0031 §Consecuencias` se cumpla —que los descriptores se publiquen en un registro en vez de
enlazarse— ese campo pasará a decidir de verdad qué se despliega, y lo hará arrastrando un valor
que ya era mentira.

---

## 2 · Las guardas que cuentan — tres archivos, y dos de los tres rojos son de #17

**Rutas exactas:**

- `infrastructure/infra/verificaciones/compose-de-los-sistemas.ts`
- `infrastructure/infra/verificaciones/compose-de-los-sistemas.test.ts`
- `infrastructure/infra/verificaciones/despliegue-de-los-sistemas.test.ts`

*(El encargo nombraba dos archivos. Son tres: el desajuste que este PR provoca en la primera
guarda no está en su `.test.ts` sino en el módulo que ese test importa, y no es una aserción sino
una excepción. Se explica abajo.)*

### Los tres rojos, reproducidos

No se pudieron **ejecutar** —lo impide el hueco 0—, así que se reprodujeron con **el código de
`infrastructure`**: las mismas funciones importadas de
`infra/verificaciones/compose-de-los-sistemas.ts`, el mismo descriptor de `caja` que `sistemas.ts`
importaría, y el compose de esta rama.

```
 ❯ rojos.test.ts (3 tests | 3 failed)
   × 1 · las imagenes de `caja` ya no son dos
     → expected [ 'caja', 'caja-migrador', …(1) ] to deeply equal [ 'caja', 'caja-migrador' ]
   × 2 · `loQueElDescriptorDice(caja)` ya no puede emparejar un solo contenedor
     → expected [Function] to not throw an error but 'Error: «caja: despliegue» no tiene ex…'
   × 3 · el compose de `caja` ya no trae tres servicios
     → expected [ 'caja', 'caja-implantacion', …(2) ] to deeply equal
                [ 'caja', 'caja-implantacion', …(1) ]
```

| # | Dónde | Qué afirma | Desde |
|---|---|---|---|
| 1 | `despliegue-de-los-sistemas.test.ts:186` — ««%s» declara las dos imagenes, y solo esas» | `descriptor.imagenes` es `[sistema, sistema-migrador]` | **#17**, no este PR: `caja.imagenes` es `["caja","caja-migrador","caja-interfaz"]` |
| 2 | `compose-de-los-sistemas.ts`, `principalDe()` | El despliegue de un sistema tiene **un** contenedor principal | **#17**: `caja.despliegue(e)` trae dos, el backend y la interfaz |
| 3 | `compose-de-los-sistemas.test.ts:83` — ««%s» trae los tres procesos y ninguno mas» | Los servicios del compose son exactamente los tres del descriptor | **#18**, este PR: el cuarto es `caja-interfaz` |

### El rojo 2 es el que hay que arreglar primero, y no por ser el segundo

Los rojos 1 y 3 son aserciones: se ponen rojas **diciendo qué sobra**. El 2 **lanza**:

> «caja: despliegue» no tiene exactamente un contenedor principal (tiene 2). Esta comprobacion
> empareja UN proceso del descriptor con UN servicio del compose; si un sistema pasa a tener dos,
> hay que decidir con que servicio se compara cada uno en vez de dejar que la comparacion elija.

Una excepción tira el archivo entero, así que **tapa los demás hallazgos de esa guarda para los
cuatro sistemas**, no sólo para `caja`. Y su propio mensaje ya dice el remedio: la guarda empareja
procesos del descriptor con servicios del compose, y ahora hay un cuarto par —
`despliegueDeLaInterfaz(e)` ↔ `caja-interfaz`— que nadie le ha enseñado. `servicioDe()`
(`compose-de-los-sistemas.ts:105`) es donde vive ese emparejamiento.

**Qué se rompe si no se toca nada:** `yarn verificar` de `infrastructure` queda en rojo, y el rojo
**no dice la verdad**: parece que `caja` está mal cuando lo que pasa es que la guarda no conoce
todavía una pieza legítima. Un rojo que miente se acaba silenciando, y con él se van las
comprobaciones que sí protegían algo — que es el hallazgo del `paths:` mudo de #17 por el otro
lado.

### Y lo que esto significa hoy: `despliegue/compose.yaml` no lo vigila nadie

Es la consecuencia incómoda de los dos apartados anteriores, y conviene decirla entera.

**Ningún flujo de CI de este repositorio lee `despliegue/compose.yaml`.** Comprobado con un `grep`
sobre `.github/workflows/`, `infrastructure/verificaciones/`, `frontend/verificaciones/` y los
guiones de `docs/00-gobierno/`: las dos únicas apariciones son **comentarios** de
`descriptor.test.ts` que hablan del nombre del motor. `infraestructura.yml` no lo nombra en su
`paths:` —y haría poco, porque su suite verifica el descriptor, no el compose— y `frontend.yml`
tampoco.

La guarda que sí lo lee vive en `infrastructure`, es
`infra/verificaciones/compose-de-los-sistemas.test.ts`, **y hoy no puede correr** por el hueco 0.
De modo que este archivo, que es configuración de despliegue, está ahora mismo **sin ninguna
verificación automática viva**: lo único que lo mide es `docker compose config`, ejecutado a mano.

No se arregla aquí —duplicar esa guarda en los cuatro repositorios es exactamente lo que su
cabecera argumenta que no hay que hacer: «una guarda repetida cuatro veces se corrige tres»—, pero
queda escrito, porque un archivo sin guarda que **parece** tenerla es peor que uno que se sabe
desnudo.

> Al lado de esto hay un hueco pequeño y de este repositorio: `RUTAS_DE_CODIGO` de
> `docs/00-gobierno/verificar-fila-del-registro.mjs` son `backend/*/src/main/`,
> `infrastructure/src/` y `frontend/src/`, así que un PR que **sólo** toque el compose no necesita
> fila en el registro. Medido sobre este mismo PR: «Cierra #18 y no toca codigo de produccion: la
> fila no se exige». La de #18 se escribió igual.

### Y un cuarto sitio, que NO se rompe: comprobado

`infra/verificaciones/imagenes-publicadas.test.ts:154` compara `SISTEMAS_CON_IMAGEN`
(`infra/config.ts:408`) con los sistemas de `SISTEMAS`. Son cuatro **sistemas**, no cuatro
imágenes: la tercera imagen de `caja` no lo altera. Se dice porque el que no se rompe también hay
que haberlo mirado.

---

## 3 · `Identidad.ts` — el *client* público de esta interfaz

> **Este apartado decía que la interfaz no autentica y que un cliente de OIDC sería una credencial
> sin uso, y desde #74 es falso.** La interfaz hace la puerta PKCE con el cliente público
> **`kamayuk-backoffice`** —el mismo de `rentas-web`, porque el realm es uno (ADR-0031 §1)— y lee lo
> que su sesión puede abrir de `/caja/api/v1` (ADR-0042). El día que el apartado anunciaba —«el día
> que esta interfaz lea un solo dato real»— llegó, y el cliente estaba **antes**.

Lo que hizo falta en `infrastructure`, y ya está:

- **[`infrastructure`#185](https://github.com/hneyra/infrastructure/pull/185)**: `kamayuk-backoffice`
  admite `http://localhost:5181/*`, el `yarn dev` de esta interfaz, en `realm-kamayuk.json` y en el
  realm derivado. El dominio público ya estaba admitido con `https://vmd205066.contaboserver.net/*`, y `/caja/` cuelga de él.
- **Las señas no se hornean**: el emisor, el cliente y el alcance llegan en `configuracion.js`, que el
  descriptor de este repositorio monta con un `ConfigMap` (`window.__KAMAYUK_CAJA__`). Una misma
  imagen sirve a `stg` y a `prod`.

**Lo que queda**, y es de allí: el censo de
`infra/verificaciones/{sondas-contra-la-cadena,upstream-de-la-interfaz}.test.ts` sigue diciendo que el
`nginx.conf` de caja llega por `configmap`; desde #74 viaja **en la imagen**. Sale rojo al integrar
este cambio, y se corrige en el PR siguiente de `infrastructure`.

---

## 4 · Los censos que cuentan procesos, y el nodo de `prod` — de #79

**#79 despliega un proceso más**: `kamayuk-caja-publicador`, el `Deployment` del perfil
`publicador` que saca el buzón de pagos (ADR-0026 §3). Hasta ahora no lo sacaba nadie — medido en
`stg` el 2026-09-14, `pago_evento` = 0 en la base de `rentas` —, y `KAMAYUK_CAJA_ORIGENES` apuntaba
a `http://rentas:8080/...`, un nombre de compose que en el clúster no existe.

Nada de esto se puede arreglar aquí: son censos de `infrastructure`, y uno de los rojos **no es un
censo sino el nodo**. Medido en `/home/jorge/ws/infrastructure/infra` con Node 22 y vitest 3.2.7,
con este árbol montado como `../caja` (`yarn vitest run`): **7 archivos en rojo, 47 pruebas**, de
las que 3 (`el-pr-ve-el-rojo-de-stg`) y las 22 de `deriva-de-migraciones` son del entorno de la
medida —falta `jq` en la imagen de Node, y el árbol montado es un *worktree* sin `origin/main`— y
no de este cambio. Los que sí:

| # | Dónde | Rojo exacto |
|---|---|---|
| 1 | `capacidad.test.ts` — ««prod» cabe» | «El stack no cabe en el nodo por memoria: pide **9824Mi** en el pico del arranque y solo hay **9747Mi** disponibles. Faltan **77Mi**» |
| 2 | `despliegue-de-los-sistemas.test.ts` — «en prod cabe el pico del arranque, y por memoria con 307Mi» | `expected 9824 to be less than or equal to 9747` |
| 3 | `despliegue-de-los-sistemas.test.ts` — «en «stg»/«prod» no crece en silencio» | `expected 1550 to be less than or equal to 1500` (CPU del pico, en milicores) |
| 4 | `despliegue-de-los-sistemas.test.ts` — «C-17 §5 · ningun `Deployment` de un sistema corre un perfil que termina» | `["kamayuk-caja-publicador/caja → publicador"]` — la guarda exige `SPRING_PROFILES_ACTIVE === "web"` |
| 5 | `compose-de-los-sistemas.ts`, `principalDe()` | «`caja: despliegue` no tiene exactamente un contenedor que corra el jar (tiene 2)» — **lanza**, así que tumba el archivo entero |
| 6 | `compose-de-los-sistemas.test.ts` — ««caja» trae sus procesos y ninguno mas» | sobra `caja-publicador` |
| 7 | `imagenes-publicadas.test.ts` — «las VEINTICINCO cargas…» | `expected … to have a length of 25 but got 26` |
| 8 | `perfil-del-ambiente.test.ts` — C-19 | `{ cpuEnMili: 1690, memoriaEnMi: 5920 }` frente a `{ cpuEnMili: 1640, memoriaEnMi: 5664 }` |

Los rojos 3, 4, 6, 7 y 8 son **cifras y listas que se actualizan**: un proceso más. El 5 es el
mismo caso que el rojo 2 de §2 —una excepción que tapa los hallazgos de los cinco sistemas— y hay
que enseñarle a `servicioDe()` el par `publicador` ↔ `caja-publicador`. Los rojos 1 y 2 **no se
arreglan con una cifra**: `prod` no tiene sitio para el pico del arranque, y lo dice su propio
mensaje —«se decide si el nodo crece (INF-01 §2, D-25) o si baja la demanda con volumetría
detrás»—. Este descriptor ya pide lo menos que puede sin mentir: el publicador lleva los
`requests` de `RECURSOS_DE_ARRANQUE` (50m / 256Mi), los mismos que el `CronJob` y los dos `Job`
que corren este mismo jar, y los `limits` de siempre.

Queda declarado en [`infrastructure`#198](https://github.com/hneyra/infrastructure/issues/198).

---

## Lo que este documento NO es

- **No es una lista de tareas de este repositorio.** Lo que queda vive en `infrastructure` y lo decide
  quien lo mantiene.
