# DEV-02 — Pruebas

## 1. Qué verifica qué

| Tarea | Qué mide | Necesita | Hoy |
|---|---|---|---|
| `./gradlew verificarArquitectura` | 18 reglas de ArchUnit, tres escáneres de fuentes y la frontera de sistema, todas contra sus muestras | nada | **79 pruebas** |
| `./gradlew verificarAislamiento` | Los cuatro roles, `FORCE ROW LEVEL SECURITY`, el `WITH CHECK`, que sin contexto la consulta **reviente en vez de devolver vacío**, y la trampa del superusuario | PostgreSQL 16 | **9 pruebas** |
| `./gradlew build` | Lo anterior más Spotless | PostgreSQL 16 | |
| `yarn verificar` (en `infrastructure/`) | El descriptor de despliegue: lint, tipos y pruebas | nada | **31 pruebas** |
| `yarn verificar` (en `frontend/`) | `caja-web`: ESLint con sus muestras, `tsc` y Vitest | `../kamayuk-lib` | **35 archivos** (#84) |
| `yarn build` (en `frontend/`) | Que el artefacto que se despliega se construye | `../kamayuk-lib` | |
| `yarn e2e` (en `frontend/`) | Lo que un emulador de DOM **no puede decir**, sobre el `dist/` servido | Chromium de Playwright | **39 caminos** (#84) |
| `node docs/00-gobierno/verificar-las-muestras-del-registro.mjs` | Que la guarda de #711 muerde y no muerde de más: que la **fila** se exija, y —desde [`infrastructure`#165](https://github.com/hneyra/infrastructure/issues/165)— que el cierre declarado sea uno que **GitHub entienda** | nada | **13 muestras** desde [`infrastructure`#165](https://github.com/hneyra/infrastructure/issues/165) |
| `node despliegue/verificar-el-compose.mjs` | Que `despliegue/compose.yaml` declara los cuatro servicios, el grafo de arranque entero y las siete variables que exige del `.env` | **Compose** (no un demonio) | **27 afirmaciones** |

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

## 7. La pantalla: `yarn verificar` y `yarn e2e`

> **Este apartado describía `yarn verificar` de la maqueta V6 y sus cinco arneses (`paleta`,
> `pegajosa`, `mirar`, `cero-red`, `prefijo`), y desde #74 no existe ninguno.** La interfaz se rehizo
> con el stack de `rentas-web`, y con ella viajaron su forma de verificar y su arnés de Playwright.
> Lo que se midió con los arneses retirados —la tipografía que movía la cabecera pegajosa, el
> prefijo que el paquete no llevaba— está en el historial de este archivo y en `docs/agent/HISTORY.md`.

```bash
cd frontend
yarn install
yarn verificar     # ESLint con sus muestras, tsc y Vitest
yarn e2e:navegador # una vez: el Chromium de Playwright
yarn e2e           # construye, sirve el dist/ en un puerto derivado del arbol, y recorre
```

**`yarn verificar` necesita `../kamayuk-lib` y nada más**: ni Docker, ni base, ni red. Varias guardas
leen el backend de este mismo repositorio —`Api.java`, los controladores, `CatalogoDelSistema.java`
y los `Resource` de sesión—, así que un cambio allí puede poner roja la pantalla, y por eso
`frontend.yml` los nombra en su `paths:`.

**Medir con Node 24**, que es el de CI y el de la imagen desde #93. Hasta entonces era 22, y el
motivo escrito era que con 24 salía `RequestInit: Expected signal … to be an instance of
AbortSignal`. No era un defecto de este código —sale de `undici`, que compara la señal con el
`instanceof` ordinario contra el `AbortSignal` que existía al arrancar Node, y bajo Vitest el
`AbortController` global es el de jsdom, o sea de otro realm— pero tampoco era ruido: quien
construye ese `Request` es `react-router` en cada navegación. El arreglo vive en
`frontend/vitest.setup.ts`, que le da al arnés un `Request` que acepta la señal del documento; la
medición entera está en `kamayuk-lib`#90.

Las guardas que ocupan el lugar del artboard que caja no tiene:

| Guarda | Qué sostiene |
|---|---|
| `el-arbol-cuadra-con-el-backend.test.ts` | Hoja ↔ acceso del catálogo en los dos sentidos, y cada operación declarada existe en su controlador con ese acceso y ese verbo |
| `la-frontera-de-caja.test.ts` | Ni la API de otro sistema, ni sus señas, ni su código, ni el vocabulario de `rentas` en lo que se sirve (ADR-0042) |
| `solo-lee.test.ts` | El cliente sólo publica `leer`; nada compone un `metodo:`; ningún destino ofrece Guardar (ADR-0040) |
| `la-cuenta-no-se-inventa.test.tsx` | La barra dice la cuenta que contesta el backend, o que no la conoce; ningún nombre de persona en `src/` (#44) |
| `camino-a-la-api.test.ts` | Proxy de Vite, `PREFIJO` y `Api.RAIZ` dicen lo mismo; las lecturas de sesión y las cinco de datos existen con los campos que se leen (#84) |
| `src/datos/conectores.test.ts` | Cada hoja que lee reparte a su definición: todo campo de sólo lectura con dato **o** con su palabra, filas del ancho de su tabla, su ruta entre las lecturas de su hoja, la hora de Lima y ningún total sumado en el cliente (#84) |
| `imagen-y-despliegue.test.ts` | El `Dockerfile`, el `nginx.conf` y `configuracion.js` tienen la forma que el descriptor y el compose esperan |

**Lee el paréntesis.** Vitest imprime `Test Files 35 passed (35)`: el número de fuera es lo que pasó
y el de dentro, lo que había. Con dos archivos que no cargan, escribe `33 passed (35)`.

## 8. Medir las capturas contra un backend de verdad (#89)

Las tres capturas de `frontend/src/datos/*Medida.ts` están **derivadas** del contrato, y su
`ORIGEN_DE_LA_CAPTURA` lo dice. Medirlas es **una orden**: `frontend/desarrollo/medir-las-capturas.mjs`
pide el token de la cuenta de medición, pide las **catorce** lecturas de `RUTAS`
(`src/datos/lecturas.ts`: cinco de sesión y nueve de Tesorería), guarda cada respuesta **cruda** con
su estado, su fecha y la orden `curl` exacta, y compara su **forma** —campos que sobran o faltan,
nulos, formato de `Instant` y de fecha, decimales, tipos— con la de la captura. Sólo lee: un `POST`,
el del token, y lo demás `GET`.

**Contra `stg`.** La cuenta es `medicion-de-interfaces` y el cliente `kamayuk-verificacion`
(público, `grant_type=password`). La clave vive en el `Secret` `kamayuk-stg-keycloak`, clave
`clave-de-medicion`, y se lee con el `KUBECONFIG` de `stg`: todo en el runbook de `infrastructure`,
[`docs/B0-operacion/runbooks/medir-una-interfaz-con-login-real.md`](https://github.com/hneyra/infrastructure/blob/main/docs/B0-operacion/runbooks/medir-una-interfaz-con-login-real.md).
El dominio es `kamayuk:domain` de `infra/Pulumi.stg.yaml` —**compruébalo ahí antes**: ya se mudó una
vez (`infrastructure`#145)— y el emisor cuelga de `/keycloak` (`RUTA_DE_IDENTIDAD`,
`infra/componentes/Identidad.ts`).

```bash
cd frontend     # con Node 24
PRIVADO=$(mktemp -d); chmod 700 "$PRIVADO"; trap 'rm -rf "$PRIVADO"' EXIT
kubectl -n kamayuk-stg get secret kamayuk-stg-keycloak \
  -o jsonpath='{.data.clave-de-medicion}' | base64 -d > "$PRIVADO/clave"
DOMINIO=vmd205066.contaboserver.net
KAMAYUK_CLAVE_DE_MEDICION="$(cat "$PRIVADO/clave")" node desarrollo/medir-las-capturas.mjs \
  --base "https://$DOMINIO" --emisor "https://$DOMINIO/keycloak/realms/kamayuk"
```

**Contra la plataforma local.** Allí la cuenta de medición **no existe** —la siembra `infrastructure`
sólo donde hay usuarios de prueba—, así que se mide con el administrador que deja
`preparar-identidades.sh` (`KAMAYUK_ADMINISTRADOR` del `.env`) y la clave que ese guion imprime. Su
matriz de permisos tiene los siete privilegios y no sólo `lectura`: la forma es la misma.

```bash
KAMAYUK_CLAVE_DE_MEDICION="$(cat <archivo con la clave>)" node desarrollo/medir-las-capturas.mjs \
  --base http://localhost:8080 --emisor http://localhost:8180/realms/kamayuk --cuenta jperez
```

**Tres variables se encadenan**, o se dan: el recibo del duplicado sale del primero de `/recibos`
(`--recibo`), el día de la conciliación de la `fecha` de `/turnos/del-dia` (`--fecha`), y el turno del
arqueo del turno ABIERTO de `/turnos/del-dia` (`--turno`). La cuenta de medición no cobra, así que en
`stg` lo normal es `SIN_ABRIR`: sin `--turno <id>` de un turno real el arqueo sale **OMITIDO** y lo
dice.

Sale con `0` si todo llegó en 200 con la forma de su captura, `1` si algo difiere o falló, y `2` si no
se pudo medir. **La clave sólo se admite en la variable** —`--clave` es un error— y ni ella ni el token
llegan a la consola ni a un archivo (lo prueba `verificaciones/el-guion-de-medicion.test.ts`).

**Lo medido lleva datos de personas** —los pagadores de los recibos— y va por omisión a un directorio
temporal con permisos `700` (`--salida` para otro). **No se versiona**: a la captura se lleva la
forma, con valores elegidos, y el `ORIGEN_DE_LA_CAPTURA` pasa a decir la orden y la fecha de la
medición, conservando la marca `captura-medida-de-caja` que busca el `Dockerfile`.
