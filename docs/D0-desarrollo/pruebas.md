# DEV-02 — Pruebas

## 1. Qué verifica qué

| Tarea | Qué mide | Necesita | Hoy |
|---|---|---|---|
| `./gradlew verificarArquitectura` | 18 reglas de ArchUnit, tres escáneres de fuentes y la frontera de sistema, todas contra sus muestras | nada | **79 pruebas** |
| `./gradlew verificarAislamiento` | Los cuatro roles, `FORCE ROW LEVEL SECURITY`, el `WITH CHECK`, que sin contexto la consulta **reviente en vez de devolver vacío**, y la trampa del superusuario | PostgreSQL 16 | **9 pruebas** |
| `./gradlew build` | Lo anterior más Spotless | PostgreSQL 16 | |
| `yarn verificar` (en `infrastructure/`) | El descriptor de despliegue: lint, tipos y pruebas | nada | **31 pruebas** |
| `yarn verificar` (en `frontend/`) | `caja-web`: ESLint con sus muestras, `tsc` y Vitest | nada | **634 pruebas** en 20 archivos |
| `yarn build` (en `frontend/`) | Que el artefacto que se despliega se construye | nada | 70 módulos |
| `yarn paleta` · `yarn pegajosa` · `yarn mirar` · `yarn cero-red` | Lo que un emulador de DOM **no puede decir** | Chromium y un servidor levantado | §7 |
| `node docs/00-gobierno/verificar-las-muestras-del-registro.mjs` | Que la guarda de #711 muerde y no muerde de más | nada | **6 muestras** |

**`yarn verificar` son dos comandos distintos**, y los dos hacen falta antes de un PR: el de
`infrastructure/` verifica el descriptor de despliegue y el de `frontend/`, la pantalla. Sus CI son
flujos separados —`infraestructura.yml` y `frontend.yml`— con `paths:` distintos, así que un PR que
sólo toque uno **no ejecuta el otro**, que es lo correcto y también lo que hace fácil olvidarse.

**Las dos de Gradle son bloqueantes**, y van en pasos separados en CI a propósito: cuando algo se
rompe, el nombre del paso ya dice qué barrera cayó.

> **Las cifras de las dos filas de Gradle son de antes de P5D, y no se han vuelto a medir aquí.**
> Las tres del frontend y la del descriptor sí: salen de las corridas de #18, pegadas en §7 y en el
> `README.md`. Las de Gradle no se pueden medir en un `git worktree` —el *composite build* busca
> `../../infrastructure/librerias-backend` y allí no está— y **inventarlas sería peor que dejarlas
> viejas**: una cifra sin corrida detrás no se distingue de una medida. Lo mismo vale para el
> «cero clases de negocio» de §2 y el «hoy no hay ni una tabla» de §3: los dos son de antes de que
> P5D trajera el contexto acotado y sus 23 tablas, y su **argumento** sigue en pie —una batería que
> pasa por no encontrar nada— aunque su premisa ya no.

## 2. Que las 79 no son un verde vacío

Con cero clases de negocio, una batería de arquitectura podría estar pasando por no encontrar
nada que revisar. No es el caso, y el mecanismo es el que lo impide:

- **Las 40 clases de muestra viajan con las reglas**, dentro de `comun-verificaciones`. Cada regla
  se aplica a la muestra que la viola y se exige que falle.
- **`ReglasDeArquitecturaMuerdenTest` es un `@TestFactory` sobre todas las reglas**, así que una
  regla sin muestra sale roja sola. No hay dónde esconder una regla muda.
- **Que la configuración de este repositorio exista se descubre por `ServiceLoader`.** Si se pasara
  por constructor, un repositorio que no derivara las clases base no correría ninguna barrera y su
  CI seguiría en verde. Cero proveedores falla; dos, también.

Comprobado rompiendo: borrar una muestra **en `infrastructure`** pone en rojo el
`verificarArquitectura` de este repositorio, nombrando la regla.

## 3. Que las 9 tampoco

`verificarAislamiento` corre **sin una sola migración**, y sigue midiendo algo: crea su propia
tabla con el mismo bloque de RLS que el esquema le pone a toda tabla de tenant, y sobre ella
verifica los cuatro roles y las cuatro propiedades. La más importante es **la trampa del
superusuario**: un superusuario **omite RLS incluso con `FORCE ROW LEVEL SECURITY`**, así que una
prueba escrita sobre la conexión que Testcontainers entrega por omisión pasa en verde **sin
verificar nada**. Aquí se demuestra en vez de afirmarse: con el mismo contexto fijado, el
superusuario ve las dos municipalidades y el rol de la aplicación, una.

Y hay una segunda trampa, medida y que conviene tener escrita: **conectar como `kamayuk_owner` no
sirve para demostrar la fuga.** Con `FORCE ROW LEVEL SECURITY` el dueño de la tabla también queda
sujeto a la política, así que esa rotura pasa en **verde** y no demuestra nada. La que hay que
escribir es la del superusuario del clúster.

**El censo del esquema está eximido a propósito y caduca solo**: hoy no hay ni una tabla, y la
primera tabla de tenant pone la prueba en rojo pidiendo que se retire la exención.

## 4. Correr una sola

```bash
cd backend
./gradlew :kamayuk-verificaciones:test --tests '*Frontera*'
./gradlew :kamayuk-esquema:test --tests '*Aislamiento*'
```

**Cuidado con el verde rancio.** Gradle puede dar `UP-TO-DATE` o `FROM-CACHE` y no ejecutar nada;
una tarea que no corre no demuestra nada. Para medir de verdad:

```bash
./gradlew cleanTest verificarArquitectura --no-build-cache
```

Es la misma lección que costó una tarde en `sgtm`: una rotura pasó «en verde» porque el archivo
que se mutó vivía fuera del módulo y no era entrada declarada de `test`.

## 5. Cómo se cuenta lo que corrió

El número que se afirma en un PR sale de los informes, no de la memoria:

```bash
python3 - <<'PY'
import glob, xml.etree.ElementTree as ET
t = f = e = s = 0
for p in glob.glob('backend/**/build/test-results/test/*.xml', recursive=True):
    r = ET.parse(p).getroot()
    t += int(r.get('tests')); f += int(r.get('failures'))
    e += int(r.get('errors')); s += int(r.get('skipped'))
print(f'pruebas={t} fallos={f} errores={e} omitidas={s}')
PY
```

**`omitidas` tiene que ser 0.** Una prueba bloqueante que se salta a sí misma deja el build en
verde sin haber verificado nada.

## 6. Demostrar que una verificación puede fallar

Es la mitad del trabajo, y la que se anota en `CLAUDE.md`. La forma que funciona:

1. Se rompe **una sola cosa** en el código que la verificación protege.
2. Se ejecuta —de verdad, sin caché— y se anota **el rojo exacto**: cuántas pruebas, cuáles y qué
   dice el mensaje.
3. Se **restaura por copia** y se compara byte a byte con `cmp`. Un `sed` de vuelta puede pisar
   otra línea idéntica, y el único síntoma sería que algo deja de compilar más tarde.
4. Si la rotura pasa en **verde**, eso es el hallazgo: la verificación no medía lo que parecía.
   Se escribe, no se descarta.

## 7. La pantalla: `yarn verificar` y los cuatro arneses

```bash
cd frontend
yarn install
yarn verificar
```

**No necesita nada más**: ni Docker, ni base de datos, ni el clon hermano, ni red. La salida real,
ejecutada en este repositorio:

```
$ yarn verificar
$ yarn lint && yarn typecheck && yarn test
$ eslint .
$ tsc --noEmit
$ vitest run
…
 Test Files  20 passed (20)
      Tests  634 passed (634)
   Duration  86.76s
```

**Lee el paréntesis.** Vitest imprime `Test Files 20 passed (20)`: el número de fuera es lo que
pasó y el de dentro, lo que había. Con dos archivos que no cargan, escribe `2 passed (4)` —«2 de
4» y aun así la palabra *passed*—, y ese caso ya se vio en #4.

Y **`yarn verificar` en verde no implica que `yarn build` lo esté**: `tsc --noEmit` y Rollup no
fallan por lo mismo. Por eso `frontend.yml` ejecuta los dos.

### Los cuatro arneses, y por qué no están en `yarn verificar`

Miden lo que jsdom y happy-dom **no pueden decir**: esos dos calculan una cascada, no colocan nada.
Allí «la lista mide 320 px» es una declaración leída y no un ancho medido, y `@media print` no
existe. Así que hace falta un Chromium de verdad — y eso es lo que los deja fuera de la cadena que
corre en cada cambio.

```bash
# En una terminal
cd frontend && yarn dev

# En otra
cd frontend
yarn paleta      # la paleta de comandos con solo el teclado
yarn pegajosa    # la cabecera de las tablas se queda quieta al desplazar
yarn mirar       # las cuatro secciones: cortes, arbol, teclado y papel
yarn cero-red    # ni una peticion fuera de sus propios recursos
```

También valen contra el artefacto: `yarn build && yarn preview`, con `CAJA_BASE` apuntando a ese
puerto. Salidas reales:

```
$ yarn paleta
la paleta se opera sólo con el teclado: abre, mueve, filtra, elige y cierra

$ yarn cero-red
270 peticiones propias · 10 a la tipografia declarada · 5 de conexion · 0 a terceros sin declarar
  recorrido (10 pasos): #panel · #recibos · #cajas · #tarifario · la paleta con una consulta ·
    el lanzador de modulos · el menu de sesion · una ficha de recibo con sus cinco secciones ·
    escribir en un campo · un cobro nuevo con su documento
la aplicacion no habla con nadie: ni fetch, ni XHR, ni WebSocket, ni un tercero sin declarar

$ yarn mirar
las cuatro secciones, miradas · capturas y PDF en .capturas/
  · Tab recorre 42 controles y vuelve al documento; 38 con el anillo rgb(82, 189, 239) y
    4 campos con el suyo; 0 inalcanzables
  · #panel en papel: fuera [barra, arbol, pestanas], 1500 caracteres, 0 desbordes, 2 hoja(s) A4
la envoltura aguanta: los cortes, el arbol que empuja, el teclado y el papel
```

### `yarn pegajosa` puede salir rojo la PRIMERA vez, y no es del repositorio

Medido aquí, y conviene tenerlo escrito porque cuesta una tarde. En la **primera** corrida sobre
una caché de navegador fría:

```
#cajas: desplazado 62 px · cabecera y=240.84375→243.84375 · primera celda y=272.34375→215.34375
la cabecera no se queda:
  - #cajas: la cabecera se fue con la tabla — de y=240.84375 a y=243.84375 tras desplazar 62 px
  - #cajas: el cuerpo no se movió lo que se desplazó — la primera celda subió 57 px de 62
```

Las **tres siguientes**, sin tocar una línea, salen verdes y con otras cifras:

```
#cajas: desplazado 60 px · cabecera y=243.84375→243.84375 · primera celda y=277.34375→217.34375
la cabecera de las dos tablas se queda quieta al desplazar
```

**La causa es la tipografía.** `index.html` carga Source Sans 3 de Google Fonts, y el arnés navega
con `waitUntil: "domcontentloaded"` y mide el `boundingBox()` de la cabecera acto seguido: con la
red fría, la fuente llega **entre las dos medidas** y desplaza la maqueta 3 px. Lo que el arnés
anota entonces como «la cabecera se fue» es la diferencia entre dos maquetas distintas, no un
`position: sticky` que falle — comprobado dejando pasar un par de `await` antes de medir, con lo
que la Δ vuelve a `0.00` en los tres altos de ventana probados (420, 600 y 900 px).

No se arregla aquí porque el arnés es de otro issue, pero **queda dicho**: si sale rojo, repítelo
antes de creértelo.
