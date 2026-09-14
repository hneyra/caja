# D0 — Desarrollo

Cómo montar el ambiente local de `caja`, arrancarlo, depurarlo y probarlo. Escrito para quien
acaba de clonar el repositorio y quiere ver algo funcionando **hoy**.

| Documento | Para qué |
|---|---|
| [DEV-01 — Entorno local](entorno-local.md) | Qué instalar, el clon hermano que **no es opcional**, y las tres formas de trabajar |
| [DEV-02 — Pruebas](pruebas.md) | Qué verifica qué, cómo correr una sola, y cómo probar sin Docker |
| [DEV-03 — Cuando algo no arranca](solucion-de-problemas.md) | Los errores que ya costaron una tarde, con su causa |

## Lo primero, y no es un detalle

**`infrastructure` tiene que estar clonado al lado.** Las barreras que este backend ejecuta viven
allí y se consumen como *composite build*; sin ese clon, Gradle no llega ni a configurar el
proyecto.

```bash
cd ..                                                   # el directorio que contiene a caja/
git clone https://github.com/hneyra/infrastructure
```

Queda así, y las rutas de este documento cuentan con ello:

```
IdeaProjects/
├── infrastructure/     la plataforma y las barreras comunes
├── caja/          este repositorio
└── sgtm/               el archivo historico (opcional, pero se consulta a diario)
```

## Lo mínimo para empezar

```bash
# 1 · Prerrequisitos. Docker sólo hace falta para la plataforma; hay salida sin él
java -version && node --version && yarn --version

# 2 · Las barreras de arquitectura. NO necesitan Docker, ni base de datos, ni red
cd backend && ./gradlew verificarArquitectura

# 3 · El descriptor de despliegue. Tampoco necesita Pulumi, ni token, ni cluster
cd ../infrastructure && yarn install && yarn verificar

# 4 · La pantalla. Necesita ../kamayuk-lib clonado al lado; la plataforma, no
cd ../frontend && yarn install && yarn dev      # http://localhost:5181/caja/
```

**Lo más rápido para ver algo funcionando es el punto 4**: ni Docker, ni PostgreSQL, ni Keycloak.
Sí necesita **`../kamayuk-lib`**, de donde salen sus paquetes por `link:`. `yarn dev` siembra el
catálogo y la cuenta con las capturas de `src/datos/` y no manda a nadie a Keycloak;
`yarn dev:con-plataforma` hace la puerta PKCE de verdad contra la plataforma de [DEV-01 §3](entorno-local.md).

> **Este párrafo decía que `caja-web` «no habla con nadie» y no necesita el clon hermano, y desde
> #74 es falso.** La interfaz se rehizo con el stack de `rentas-web`: lee lo que su sesión puede
> abrir de `/caja/api/v1` (ADR-0042) y sus paquetes vienen de `kamayuk-lib`.

> **Este párrafo decía «lo que todavía no hay es una aplicación que arrancar: no existe ni una
> clase de negocio», y es falso desde P5D.** El backend tiene su contexto acotado entero
> (`backend/kamayuk-caja-nucleo`) y desde C-7 arranca en sus dos perfiles —lo comprueba
> `./gradlew verificarArranque`—; y la pantalla existe desde el lote de `caja-web`.

Levantar la plataforma sirve para tener la base y la identidad esperando, y está en
[DEV-01 §3](entorno-local.md).

## Qué comando para qué tarea

| Quiero… | Comando | Dónde |
|---|---|---|
| Las reglas de arquitectura y los escáneres | `./gradlew verificarArquitectura` | `backend/` |
| El aislamiento multi-tenant | `./gradlew verificarAislamiento` | `backend/` |
| Que el artefacto levante en sus dos perfiles | `./gradlew verificarArranque` | `backend/` |
| Todo, más el formato | `./gradlew build` | `backend/` |
| Arreglar el formato | `./gradlew spotlessApply` | `backend/` |
| Verificar el descriptor | `yarn verificar` | `infrastructure/` |
| **Ver la pantalla** | `yarn dev` → <http://localhost:5181/caja/> | `frontend/` |
| **Ver la pantalla contra la plataforma** | `yarn dev:con-plataforma` → <http://localhost:5181/caja/> | `frontend/` |
| **Verificar la pantalla** | `yarn verificar` (ESLint, tipos y Vitest) | `frontend/` |
| **Construir el artefacto de la pantalla** | `yarn build` → `frontend/dist/` | `frontend/` |
| Los caminos en un navegador de verdad | `yarn e2e:navegador` una vez, y `yarn e2e` (construye y sirve el `dist/` solo) | `frontend/` |
| La imagen de la interfaz | `docker buildx build --build-context kamayuk-lib=../kamayuk-lib --target interfaz -f frontend/Dockerfile frontend` | la raíz |
| Levantar la plataforma | `docker compose -f despliegue/plataforma.compose.yaml up -d --wait` | `../infrastructure/` |
| Levantar **lo de este sistema** contra ella | `docker compose -f despliegue/compose.yaml --env-file ../infrastructure/despliegue/.env up -d --build --wait` | la raíz |
| Levantar **sólo la interfaz** (se abre por Traefik, `http://localhost:8080/caja/`; sin backend la puerta abre y el catálogo dice que no pudo leerse) | `docker compose -f despliegue/compose.yaml --env-file ../infrastructure/despliegue/.env up -d --build caja-interfaz --wait` | la raíz |
| Lo que hay que pasar antes de un PR | `./gradlew build verificarAislamiento verificarArquitectura` · `yarn verificar` (los **dos**: `infrastructure/` y `frontend/`) | los tres |

## Las dos frases que gobiernan todo lo demás

**Ejecutar la prueba vale más que razonar sobre ella**, y **una verificación tiene que demostrarse
capaz de fallar**. Por eso aquí no hay ningún comando que «debería funcionar»: los de estos
documentos **se ejecutaron**, y donde algo falla en una máquina concreta se dice en
[DEV-03](solucion-de-problemas.md) en vez de omitirlo.

**Una prueba bloqueante no se omite a sí misma.** Sin motor de base de datos, `verificarAislamiento`
**falla**; no se salta. Si alguna vez encuentras la forma de ponerla en verde sin PostgreSQL, has
encontrado un defecto, no un atajo.
