# Los huecos que `caja-web` deja en `infrastructure`

| Campo | Valor |
|---|---|
| Estado | Vigente |
| Abierto por | #18, el último del lote de dieciséis de `caja-web` |
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

## 2 · Las dos guardas que cuentan — y ya están rojas, dos de ellas desde #17

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

### El rojo 2 es el que hay que arreglar primero, y no por ser el primero

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

### Y un cuarto sitio, que NO se rompe: comprobado

`infra/verificaciones/imagenes-publicadas.test.ts:154` compara `SISTEMAS_CON_IMAGEN`
(`infra/config.ts:408`) con los sistemas de `SISTEMAS`. Son cuatro **sistemas**, no cuatro
imágenes: la tercera imagen de `caja` no lo altera. Se dice porque el que no se rompe también hay
que haberlo mirado.

---

## 3 · `Identidad.ts` — el *client* público que esta interfaz no tiene

**Rutas exactas:**

- `infrastructure/infra/componentes/Identidad.ts`, línea 116 (`CLIENTE_DEL_BACKOFFICE`)
- `infrastructure/despliegue/identidad/realm-sgtm.json` — **donde vive de verdad el cliente**

*(El encargo nombraba sólo el primero. `Identidad.ts` no declara ningún cliente: los lee del realm
versionado —`realmSgtmJson()`, línea 196— y sólo nombra dos constantes. El archivo que hay que
tocar para que exista un cliente son los dos.)*

### Lo que hay hoy, contado

```
$ python3 -c "…json.load(open('despliegue/identidad/realm-sgtm.json'))…"
sgtm-backoffice   | publicClient=True | pkce=S256 | redirect=['http://localhost:5173/*',
                                                              'http://localhost:8081/*',
                                                              'https://vmd205066.contaboserver.net/*']
sgtm-verificacion | publicClient=True | pkce=None  | redirect=[]
```

**Dos clientes, y ninguno es de esta interfaz.** `sgtm-backoffice` es el del monolito: sus
redirecciones son `:5173` (su `vite dev`) y `:8081` (su `interfaz` de compose,
`infrastructure/despliegue/compose.yaml:252`). Ni `:8082` —el puerto que publica el servicio
`caja-interfaz` de este repositorio— ni `<dominio>/caja/*` están.

Falta, según ADR-0030 §3 y ADR-0031 §1 (*«los clients de los cuatro frontends también, porque el
realm es uno»*), un cliente público con PKCE `S256` para `caja-web`, con sus redirecciones.

### Y hoy eso es correcto, hasta un día concreto

**Esta interfaz no autentica.** No es un olvido y no está a medias: la ficha de sesión del diseño
—el nombre, el rol, «Cerrar sesión»— es **decorativa**, no hay token, no hay `redirect` a Keycloak
y no puede haberlo, porque esta interfaz **no hace ni una petición de red**: sus datos salen de
`frontend/src/datos/`, `eslint.config.mjs` prohíbe `fetch` en el código y
`frontend/verificaciones/cero-red.mjs` lo comprueba en un navegador de verdad.

Un cliente de OIDC para una pantalla que no llama a nadie sería una credencial declarada sin uso, y
eso es peor que no tenerla: aparece en el inventario, alguien la da por buena y nadie mide si sus
redirecciones siguen siendo las que son.

**Qué se rompe, y cuándo:** el día que esta interfaz lea **un solo dato real**. Ese día el backend
—que exige `KAMAYUK_OIDC_EMISOR` y **se niega a arrancar sin él**— contestará `401` a todo, y el
síntoma será una pantalla vacía sin un solo mensaje que nombre a Keycloak. Ese día el cliente tiene
que existir **antes**, no después, y con él tendrán que entrar el `proxy_pass` de
`frontend/nginx.conf` —que hoy no existe, y contarlo da cero— y la variable de compilación de Vite
con la URL de la API.

---

## Lo que este documento NO es

- **No es una lista de tareas de este repositorio.** Las tres cosas viven en `infrastructure` y
  las decide quien lo mantiene.
- **No incluye el `/caja`.** Que la interfaz todavía no sea alcanzable bajo su prefijo —falta
  declarar `base` en `vite.config.ts` **y** arreglar el literal `src="/escudo-catacaos.png"` de
  `BarraGlobal.tsx`, las dos a la vez— es un hueco de **este** repositorio y tiene su propio
  issue, el **#37**, con la tabla de medición dentro. Mientras siga abierto, la única forma de
  mirar esta pantalla desplegada es el puerto que publica el servicio `caja-interfaz`.
