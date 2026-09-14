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
| `infrastructure/` — el descriptor (ADR-0031 §2) | **Existe y verifica**: `yarn verificar` en verde —`Tests 31 passed (31)`—, sin Pulumi, sin token y sin cluster. Desde #17 declara tambien el `Deployment`, el `Service` y las **dos** rutas del `IngressRoute` de la interfaz; desde #74 su `ConfigMap` ya no copia el `nginx.conf`: monta `configuracion.js` con las senias del ambiente |
| `.github/workflows/` — su CI | **Existe**, con seis flujos: el descriptor, el frontend, las **dos barreras bloqueantes** del backend, la publicacion de imagenes, la guarda del registro y —desde #39— el compose |
| `docs/30-arquitectura/adr/` | **Existe**, con 0 ADR propio(s) y su indice ⚠ ver la nota de abajo |
| `backend/` — seis modulos, con el negocio dentro | **Existe desde P5D**: `kamayuk-caja-nucleo` es el contexto acotado entero, y a su lado el esquema, la plataforma, el dominio compartido, la seguridad (C-7) y la aplicacion que ensambla |
| `backend/kamayuk-caja-esquema` — su esquema | **Esta aqui desde P5D**, con `V1__baseline.sql` (23 tablas, **cero extensiones**) y `V2__ordenes_de_cobro_y_outbox.sql` |
| Su frontend (`caja-web`, ADR-0030 §1) | **Rehecho en #74 con el stack de `rentas-web`** sobre `../kamayuk-lib`: puerta PKCE, catalogo filtrado por lo que la sesion puede abrir **segun la copia local de esta caja** (ADR-0042) y las siete hojas de Tesoreria. **Solo lee** (ADR-0040): cobrar, cerrar y anular estan declarados y no se llaman. La maqueta V6 sin red se retiro entera |
| La imagen `ghcr.io/hneyra/kamayuk-caja-interfaz` | **Existe y se publica** desde #16, junto a `kamayuk-caja` y `kamayuk-caja-migrador`, etiquetadas con el `sha` de este repositorio |
| `despliegue/compose.yaml` | **Cuatro servicios** desde #18: el migrador, la implantacion, el backend y `caja-interfaz`. Desde #39 **lo verifica alguien de este repositorio**: `node despliegue/verificar-el-compose.mjs`, con Compose de verdad y sin demonio |
| Que la interfaz sea alcanzable bajo `/caja` | **Si**, desde #37. Desde #74 el prefijo lo quita Traefik tambien en el compose, y el nginx de la imagen sirve en la raiz |
| Lo que falta y vive en `infrastructure` | **Declarado, no descubierto tarde**: [`docs/00-gobierno/huecos-en-infrastructure.md`](docs/00-gobierno/huecos-en-infrastructure.md) |

## Por donde entrar

- **Montar el entorno y ejecutarlo**: [`docs/D0-desarrollo/README.md`](docs/D0-desarrollo/README.md).
- **Contexto para agentes**, con las diez reglas y lo que este repositorio no hace:
  [`CLAUDE.md`](CLAUDE.md).

## La interfaz de ventanilla, `caja-web`

```bash
cd frontend
yarn install
yarn dev                  # http://localhost:5181/caja/, sin nada levantado: siembra el catalogo
yarn dev:con-plataforma   # contra Keycloak (8180) y Traefik (8080), con login de verdad
yarn verificar            # ESLint (con sus muestras), tipos y Vitest
yarn build                # el artefacto de produccion, en frontend/dist/
yarn e2e                  # Playwright contra el `dist/` servido
```

> **Esta seccion describia una maqueta que «no habla con nadie», y desde #74 es falso.** La interfaz
> se rehizo con **el mismo stack y el mismo metodo que `rentas-web`** —React 19, Vite 7, Tailwind 4,
> TanStack Query, i18next y Playwright— y consume `@kamayuk/{api,formato,sesion,shell,ui}` por
> `link:` desde **`../kamayuk-lib`, que tiene que estar clonado al lado**. La maqueta V6, sus datos
> copiados del artboard y sus siete arneses se retiraron enteros.

**Que habla, y con quien.** Con `/caja/api/v1` y con el emisor de Keycloak, y con nadie mas
(ADR-0042): con `rentas` apagado la ventanilla sigue abriendo. Lo que la sesion puede abrir sale de
cinco `GET` del backend de esta caja —`/seguridad/{modulos,accesos}` y
`/seguridad/sesion{,/permisos,/municipalidad}`—, que leen la copia local de ADR-0039. **Solo lee**
(ADR-0040): no hay un camino para escribir en `src/api/cliente.ts`, y lo vigilan
`verificaciones/solo-lee.test.ts` y una barrera de `tsc`.

**De donde sale el arbol.** Caja no tiene artboard, asi que las siete hojas salen de **sus accesos y
sus controladores**: `verificaciones/el-arbol-cuadra-con-el-backend.test.ts` lee
`CatalogoDelSistema.java` y los `*Controller.java` y exige que cada hoja sea un acceso, cada acceso
una hoja, y cada operacion declarada exista con ese acceso y ese verbo. Las pantallas no piden datos
todavia: dicen por que no los tienen.

**La cuenta no se inventa.** El nombre y la municipalidad de la barra los contesta el backend; con la
cuenta desconocida para esta copia, la barra lo dice. Es lo que retiro #44, y ahora lo vigila
`verificaciones/la-cuenta-no-se-inventa.test.tsx`.

### Levantarla como se despliega

```bash
cd ../infrastructure/despliegue && ./levantar-todo.sh identidad caja
curl -sf http://localhost:8080/caja/     # por Traefik, que quita el prefijo
```

`caja-interfaz` construye `frontend/Dockerfile` con **`kamayuk-lib` como contexto con nombre**
(`additional_contexts` en el compose, `--build-context` en CI) y sirve `dist/` con nginx **sin root**
(uid 101) **en la raiz del contenedor**. Pedirle `/caja/` directamente contesta un 404 que nombra el
`stripPrefix`: hay un solo camino, el del ingreso, igual en el compose que en el cluster. Las senias
del ambiente —emisor, cliente y alcance— van en `configuracion.js`, servido con `no-store` y montado
encima por el `ConfigMap` del descriptor. **No declara `depends_on` del backend**: el motivo esta en
el propio [`despliegue/compose.yaml`](despliegue/compose.yaml).

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
