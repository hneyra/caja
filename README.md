# `caja`

Ordenes de cobro, recibo, turno, arqueo, cierre y medios de pago. **No sabe que es un
tributo**, y por eso sirve para cobrar un puesto de mercado o un nicho.

> **Este parrafo decia «todavia no hay una sola linea de codigo de negocio», y desde P5D es falso.**
> El contexto acotado entero vive en `backend/kamayuk-caja-nucleo` —122 clases de `src/main`, de 229
> en todo el backend— y su esquema, en `backend/kamayuk-caja-esquema` con `V1__baseline.sql` y
> `V2__ordenes_de_cobro_y_outbox.sql`. La etapa 5 de
> [ADR-0029](https://github.com/hneyra/infrastructure/blob/main/docs/30-arquitectura/adr/ADR-0029-cuatro-sistemas-separados.md)
> ya paso. Lo que hay medido, pieza a pieza, esta en
> [`CLAUDE.md`](CLAUDE.md#que-hay-hoy-medido-y-no-supuesto) y en
> [`docs/00-gobierno/P5D-extraccion.md`](docs/00-gobierno/P5D-extraccion.md).

## Que hay hoy, y que falta

| Pieza | Estado |
|---|---|
| `infrastructure/` — el descriptor (ADR-0031 §2) | **Existe y verifica**: `yarn verificar` en verde —`Tests 31 passed (31)`—, sin Pulumi, sin token y sin cluster. Desde #17 declara tambien el `Deployment`, el `Service`, el `ConfigMap` de nginx y las **dos** rutas del `IngressRoute` de la interfaz |
| `.github/workflows/` — su CI | **Existe**, con seis flujos: el descriptor, el frontend, las **dos barreras bloqueantes** del backend, la publicacion de imagenes, la guarda del registro y —desde #39— el compose |
| `docs/30-arquitectura/adr/` | **Existe**, con 0 ADR propio(s) y su indice ⚠ ver la nota de abajo |
| `backend/` — seis modulos, con el negocio dentro | **Existe desde P5D**: `kamayuk-caja-nucleo` es el contexto acotado entero, y a su lado el esquema, la plataforma, el dominio compartido, la seguridad (C-7) y la aplicacion que ensambla |
| `backend/kamayuk-caja-esquema` — su esquema | **Esta aqui desde P5D**, con `V1__baseline.sql` (23 tablas, **cero extensiones**) y `V2__ordenes_de_cobro_y_outbox.sql` |
| Su frontend (`caja-web`, ADR-0030 §1) | **Existe, y esta entero**: las cuatro pantallas, `Tests 634 passed (634)` en 20 archivos. **No se conecta al backend** — ver la seccion de abajo, que es la mitad importante |
| La imagen `ghcr.io/hneyra/kamayuk-caja-interfaz` | **Existe y se publica** desde #16, junto a `kamayuk-caja` y `kamayuk-caja-migrador`, etiquetadas con el `sha` de este repositorio |
| `despliegue/compose.yaml` | **Cuatro servicios** desde #18: el migrador, la implantacion, el backend y `caja-interfaz`. Desde #39 **lo verifica alguien de este repositorio**: `node despliegue/verificar-el-compose.mjs`, con Compose de verdad y sin demonio |
| Que la interfaz sea alcanzable bajo `/caja` | **Todavia NO.** Falta declarar `base` en Vite **y** arreglar un literal de `BarraGlobal.tsx`, las dos a la vez. Es el **#37**, y hasta entonces se mira por el puerto que publica el compose |
| Lo que falta y vive en `infrastructure` | **Declarado, no descubierto tarde**: [`docs/00-gobierno/huecos-en-infrastructure.md`](docs/00-gobierno/huecos-en-infrastructure.md) |

## Por donde entrar

- **Montar el entorno y ejecutarlo**: [`docs/D0-desarrollo/README.md`](docs/D0-desarrollo/README.md).
- **Contexto para agentes**, con las diez reglas y lo que este repositorio no hace:
  [`CLAUDE.md`](CLAUDE.md).

## La interfaz de ventanilla, `caja-web`

```bash
cd frontend
yarn install
yarn dev          # el servidor de desarrollo, en http://localhost:5181/caja/
yarn verificar    # ESLint (con sus muestras), tipos y Vitest
yarn build        # el artefacto de produccion, en frontend/dist/
```

**`yarn dev` no necesita backend, ni base de datos, ni Keycloak, ni la plataforma levantada.** Y no
es que no le hagan falta *todavia*: es que **esta interfaz no habla con nadie**. Sus datos salen de
`frontend/src/datos/`, copiados del artboard del diseño; `eslint.config.mjs` prohibe `fetch` en el
codigo; `frontend/nginx.conf` no reenvia a ningun sitio —contar la directiva de reenvio en ese
archivo da **cero**—; y el arnes `yarn cero-red` lo comprueba en un navegador de verdad. Es lo que
hace cierto que la pantalla se dibuje en un municipio sin salida a internet, y es tambien lo que
hay que cambiar el dia que lea un dato real (ver
[`docs/00-gobierno/huecos-en-infrastructure.md`](docs/00-gobierno/huecos-en-infrastructure.md) §3).

La salida real de `yarn verificar`, ejecutado en este repositorio:

```
$ yarn verificar
$ yarn lint && yarn typecheck && yarn test
$ eslint .
$ tsc --noEmit
$ vitest run
…
 Test Files  21 passed (21)
      Tests  648 passed (648)
   Duration  81.23s
```

Y la de `yarn build`:

```
$ yarn build
$ tsc -b && vite build
vite v6.4.3 building for production...
✓ 70 modules transformed.
dist/index.html                   1.38 kB │ gzip:  0.76 kB
dist/assets/index-FJrOTcaG.css    3.42 kB │ gzip:  1.39 kB
dist/assets/index-DGWPq6eb.js   292.34 kB │ gzip: 85.80 kB
✓ built in 2.25s
```

**La interfaz se sirve bajo `/caja`**, y no en la raiz: `vite.config.ts` declara
`base: "/caja/"` (#37), asi que `yarn dev` y `vite preview` contestan `302` a `/caja/` para
cualquier peticion a `/`. Es la mitad que le toca a Vite; la otra es el `stripPrefix` del
`IngressRoute` (#17), y **ninguna de las dos basta sola**.

**Los cinco arneses de navegador** miden lo que un emulador de DOM no puede decir —disposicion,
foco real, impresion y peticiones de red—, y no entran en `yarn verificar` porque necesitan un
servidor levantado (y los cuatro primeros, un Chromium). Se lanzan contra `yarn dev` o contra el
`dist/` servido con `vite preview`, con `CAJA_BASE` apuntando al puerto **y al prefijo**
(`CAJA_BASE=http://localhost:5182/caja`), y su detalle esta en
[DEV-02 §7](docs/D0-desarrollo/pruebas.md).

| Comando | Que mide |
|---|---|
| `yarn paleta` | La paleta de comandos con solo el teclado: abre, mueve, filtra, elige y cierra |
| `yarn pegajosa` | Que la cabecera de las tablas de consulta se queda quieta **y pegada al borde** al desplazar, con la medida hecha en el marco del contenedor para que moverse la pagina no la descuadre (#35) |
| `yarn mirar` | Las cuatro secciones: cortes, arbol, teclado y papel, con capturas y PDF |
| `yarn cero-red` | Que no hay ni una peticion fuera de sus propios recursos y la tipografia declarada, y que **todas cuelgan de `/caja`** |
| `yarn prefijo` | Que el `dist/` no pide nada a la raiz del dominio y que `/caja/` y `/caja/recibos` sirven la aplicacion **con su tipo**. No necesita Chromium, y **solo vale contra el `dist/` servido**: apuntado a `yarn dev` lo dice y sale |

### Levantarla como se despliega

```bash
# La red `kamayuk-plataforma` tiene que EXISTIR antes: este compose la declara
# `external: true` para no crear una segunda con el mismo nombre, asi que sin ella
# Compose se niega. Es lo unico que `caja-interfaz` necesita de fuera.
docker compose -f ../infrastructure/despliegue/plataforma.compose.yaml up -d --wait

docker compose -f despliegue/compose.yaml up -d --build caja-interfaz --wait
curl -sf http://localhost:${KAMAYUK_PUERTO_INTERFAZ_CAJA:-8082}/
```

Ese servicio construye `frontend/Dockerfile` y sirve `dist/` con nginx **sin root** (uid 101). **No
declara `depends_on` del backend**, y esa ausencia es una afirmacion, no un descuido: el motivo
largo esta escrito en el propio [`despliegue/compose.yaml`](despliegue/compose.yaml). Levantarlo
**no arranca** el migrador, ni la implantacion, ni el backend, ni necesita la base ni Keycloak.

> **Esos dos comandos no se ejecutaron**, y por una razon que no se disimula: la maquina donde se
> escribio esto **no tiene Docker** —ni `podman`, ni `nerdctl`—. Lo que si se ejecuto es
> `docker compose config` con el binario oficial, que no necesita demonio, y el nginx real de
> `nginx:1.31.4-alpine` sirviendo este mismo `dist/` con este mismo `nginx.conf`. Está en el PR
> de #18, con sus cifras.

> **Desde #37 esto se ha dado la vuelta, y hay que leerlo entero.** `vite.config.ts` declara
> `base: "/caja/"`, asi que el `index.html` pide sus recursos bajo el prefijo y **la interfaz es
> alcanzable bajo `/caja`** — que es lo que faltaba. Pero este `nginx.conf` sigue sirviendo en `/`
> a proposito, porque quien quita el prefijo es Traefik; y **el puerto publicado de este compose no
> tiene ningun Traefik delante**. Medido aplicando a mano el `try_files $uri /index.html` de este
> archivo sobre el `dist/` de hoy: `GET /` devuelve el `index.html` (200 `text/html`, 1 383 B) y ese
> HTML pide `/caja/assets/index-<huella>.js`, que **contesta 200 `text/html` de 1 383 B** — el
> `index.html` otra vez, el 200 que miente — mientras `/assets/index-<huella>.js`, o sea lo que
> nginx recibe **con el prefijo quitado**, contesta `200 text/javascript` de 292 338 B.
>
> O sea: `curl -sf http://localhost:8082/` sigue devolviendo 200, y **un navegador ve una pantalla
> en blanco**. Es la fila C de la tabla de #37, y la unica salida es un Traefik —o cualquier proxy—
> que quite `/caja` antes de este nginx. Queda **declarado y sin cerrar**: cerrarlo obliga a tocar
> `frontend/nginx.conf`, y con el su copia byte a byte del `ConfigMap`.

## El descriptor

```bash
cd infrastructure
yarn install
yarn verificar          # lint, tipos y pruebas. Sin Pulumi, sin token y sin cluster
```

Declara **su base y sus roles**, **su Deployment**, **su Job de migracion**, **sus
rutas bajo su prefijo `caja/`**, **su egreso**, sus alertas, su panel y su inventario de claves.
No declara la etiqueta de su imagen: la pone `infrastructure`, y es lo que hace que una
liberacion normal no sea un `pulumi up` (ADR-0011 §5).

**Su egreso, que es su grafo de dependencias:**

```
caja  ──▶  rentas
```

Su unico egreso es a `rentas`, y **no es para preguntar**: es el `PagoRegistrado` que publica al
cobrar, porque **la imputacion es de rentas** (ADR-0026 §2). Si Caja imputara, la regla del
Codigo Tributario estaria escrita dos veces, y la que decidiera de verdad acabaria siendo la que
nadie recuerda que existe.

**Ningun ADR propio todavia**, y es correcto que se vea asi: lo que la caja hace lo deciden dos
que no son suyos. El primero propio llegara con **D-17** —a quien se le cobra lo que no es
tributo—.

## Lo que este repositorio NO decide

- **La etiqueta de su imagen.** La fija `infrastructure` al componer.
- **Su namespace ni sus `PriorityClass`.** Son de alcance de cluster.
- **Como se sella un valor normativo.** Eso es de `normativa`; aqui se consume un conjunto ya
  sellado.
- **Si su descriptor se aplica.** `infrastructure` lo audita con las mismas reglas que audita los
  suyos y **se niega** si incumple: una ruta fuera del prefijo, un `Deployment` sin limites, un
  `Secret` en claro o privilegios sobre la base de otro sistema.

## De donde viene

Extraido de [`sgtm`](https://github.com/hneyra/sgtm/tree/migracion-a-microservicios), que **no se borra**: es el archivo historico y la unica copia con
`git log`. El inventario del corte —que tabla va a que repositorio, y por que— esta en
[GOB-05](https://github.com/hneyra/sgtm/blob/migracion-a-microservicios/docs/00-gobierno/inventario-del-corte.md).
