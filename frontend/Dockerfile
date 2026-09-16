# syntax=docker/dockerfile:1
#
# `kamayuk-caja-interfaz`: la interfaz de ventanilla, compilada y servida como archivos estaticos.
#
# **Es el `Dockerfile` de `rentas/frontend` (rentas@bb13f73) con los nombres de este sistema** (#74):
# la interfaz de `caja` se rehizo con el stack y el metodo de `rentas-web`, y su imagen tambien. La
# de antes —la maqueta V6, `nginx:1.31.4`, sin librerias comunes— se retiro con ella. Lo que sigue
# es el razonamiento de `rentas`, que vale igual aqui; donde `caja` difiere, se dice.
#
# ## POR QUE NO SE LLAMA `kamayuk-caja-web`
#
# Porque `kamayuk-caja-web` YA ES OTRA COSA, y una que esta viva: en
# `infrastructure/src/descriptor.ts` es el nombre del **`Deployment` y el `Service` del BACKEND**
# con el perfil `web` de Spring —lo compone `despliegueDelPerfil(e, "web", true)` como
# `kamayuk-${SISTEMA}-${perfil}`—, o sea un proceso que no tiene nada que ver con este.
#
# Un `Service` de Kubernetes y una imagen de un registro son espacios de nombres distintos, asi
# que la colision **no seria un error**: seria peor. Dos artefactos del mismo producto llamados
# igual, uno sirviendo la API y otro archivos estaticos, y a partir de ahi cualquier frase del
# tipo «desplega `kamayuk-caja-web`» tiene dos respuestas. Y el dia que alguien nombre mal un
# `Service` a partir de la imagen, lo que sale no es un fallo de despliegue —que se ve— sino un
# `Service` repartiendo entre las dos: una parte de las peticiones de la API contestadas por un
# `nginx` que solo sirve archivos.
#
# `interfaz` es ademas el vocabulario que `infrastructure` ya usa para la del monolito
# (`sgtm-interfaz`) y el que `caja` eligio, por escrito y por este mismo motivo, en su #16. Un
# nombre para una cosa.
#
# ## Por que NO se reutiliza `backend/Dockerfile`
#
# Aquel compila con Gradle y su contexto es la RAIZ del repositorio, porque tiene `COPY` que salen
# de `backend/`. Este tiene su contexto en `frontend/` y su `.dockerignore` es
# `frontend/.dockerignore`.
#
# Necesita los paquetes de `kamayuk-lib` (en `rentas` desde su #75, aqui desde #74), que entran por un CONTEXTO CON NOMBRE y no por el principal
# —ver la etapa `construccion`—. Las dos decisiones van juntas: un
# `.dockerignore` solo se aplica desde la raiz del contexto, de modo que el de la raiz —que ademas
# excluye `frontend/` entero— no dice nada de esta imagen.
#
# ## Las dos etapas se tratan distinto a proposito
#
# `construccion` se tira: nada de ella se publica, y por eso su base es la etiqueta movil
# `node:24-alpine` —la version mayor es la que `frontend.yml` declara (`node-version: "24"`) y lo
# que fija que se instale es `yarn.lock` con `--frozen-lockfile`—.
#
# `interfaz` SI se publica, asi que su base va clavada: `nginx:1.31.5-alpine`, no `stable-alpine`
# ni `1.31`. Es lo que permite que un escaneo de imagenes diga de que version habla, y actualizar
# el numero es la correccion cuando el escaneo encuentre algo, no ignorar el hallazgo.

# ---------------------------------------------------------------------------
FROM node:24-alpine AS construccion

# EL `WORKDIR` REPRODUCE LA DISPOSICION DE CLONES HERMANOS, Y NO ES COSMETICO (#75).
#
# `frontend/package.json` declara los `@kamayuk/*` como
# `link:../../kamayuk-lib/paquetes/*`, y yarn resuelve eso contra el DISCO. Para que la misma
# ruta relativa valga aqui dentro, el arbol de la imagen tiene que tener la misma forma que el
# de quien compila:
#
#     /obra/caja/frontend       <- aqui, o sea `../../` = /obra
#     /obra/kamayuk-lib         <- ahi cae el contexto con nombre
#
# Acortarlo a `/obra/frontend` —que es lo que apetece— hace que `../../kamayuk-lib` resuelva a
# `/kamayuk-lib` y el `yarn install` falle. **Y no fallaria hoy**: mientras nada de `src/`
# importe `@kamayuk/*`, la imagen se construye igual y el defecto espera. Por eso la profundidad
# no se deja a la vista de nadie: la deriva `imagen-y-despliegue.test.ts` del `link:` declarado.
WORKDIR /obra/caja/frontend

# EL CLON HERMANO, POR UN CONTEXTO CON NOMBRE DE BUILDKIT (#75).
#
# El contexto principal de esta imagen es `frontend/` y el hermano vive DOS niveles por encima,
# o sea fuera de lo que Docker puede copiar. Subir el contexto a la raiz del repositorio no vale
# por dos motivos medidos: el `.dockerignore` de la raiz excluye `frontend/` entero, y aun asi
# `kamayuk-lib` es OTRO repositorio y seguiria fuera. Y el arreglo del backend tampoco
# transfiere: `-Pkamayuk.sinLibreriasComunes` se pudo escribir porque su libreria es
# `testImplementation` y la imagen no corre pruebas; estas tres son dependencias de EJECUCION
# del bundle, asi que no existe un «construir el artefacto sin la libreria».
#
# Quien lo pasa: `--build-context kamayuk-lib=…` (buildx), `build-contexts:` en
# `publicar-imagenes.yml` y `additional_contexts:` en `despliegue/compose.yaml`. Los tres tienen
# que decir el mismo nombre, y eso lo ata una prueba.
#
# SE COPIA `paquetes/` Y NADA MAS, a proposito: un contexto con nombre entra por su propia raiz
# y **ningun `.dockerignore` lo acota** —el de `frontend/` solo filtra el contexto principal—.
# Medido el 2026-09-12: `kamayuk-lib` no trae `.dockerignore` y su `node_modules` pesa 160 MB;
# un `COPY --from=kamayuk-lib .` se lo llevaria dentro, con el `.git` y cualquier `.env`.
COPY --from=kamayuk-lib paquetes/ /obra/kamayuk-lib/paquetes/

# Primero el manifiesto y el candado, y nada mas: asi la capa de dependencias se reutiliza
# mientras esos dos archivos no cambien, que es lo que hace barato reconstruir tras tocar una
# pantalla. `--frozen-lockfile` es lo mismo que exige `frontend.yml`: si `package.json` y
# `yarn.lock` no cuadran, esto falla aqui en vez de instalar en silencio una version distinta de
# la que se verifico.
#
# Y ojo con lo que NO garantiza: un `link:` a un directorio que no existe se instala con codigo
# 0 y sin avisar (medido). Lo que lo detecta es `verificaciones/enlace-con-kamayuk-lib.test.ts`,
# que corre en `yarn verificar`, no aqui.
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .

# LA SIEMBRA DEL CATALOGO, APAGADA Y DICHA (AC-3 de #44, y AC2 de #114).
#
# Vite sustituye `import.meta.env.VITE_*` **al construir**, asi que con esta variable en `false`
# la condicion de `src/arranque.ts` se pliega y el `import()` dinamico de
# `desarrollo/sembrarElCatalogo.ts` —con el modulo, los accesos, la matriz de permisos y la sesion
# capturados de la instalacion— se cae del paquete. Es el mismo mecanismo que llevaba el
# proxy de datos de la V6 detras de `VITE_KAMAYUK_PROXY_DE_DATOS`, y esta medido por los dos
# lados: con la bandera leida al CONSTRUIR el modulo no viaja; leida en tiempo de EJECUCION,
# viaja entero.
#
# Es la PRIMERA de TRES vallas, y ninguna sobra. `vite build` no lee `.env.development` —solo se
# carga en modo desarrollo—, o sea que en teoria bastaria con no hacer nada; pero «el paquete sale
# limpio porque nadie se acordo de encenderlo» es una propiedad que se pierde el dia que alguien
# cree un `.env.production`. Escribirlo aqui lo hace una decision y no una casualidad. La segunda
# valla es `.dockerignore`, que deja fuera del contexto **todos** los `.env*`. Y la tercera, que
# #114 anadio delante de la bandera, es `import.meta.env.DEV`: en una construccion no hay modo
# desarrollo que valga, diga lo que diga el entorno.
ENV VITE_KAMAYUK_SIN_PLATAFORMA=false

RUN yarn build

# LOS MAPAS DE FUENTE NO SE PUBLICAN, y es una decision con dos motivos medidos.
#
# `vite.config.ts` declara `build.sourcemap: true` desde F-1, asi que `dist/` sale con un `.map`
# por trozo. No se toca esa opcion —`yarn build` tiene que seguir dando lo mismo para todo lo que
# ya se mide contra el— y se retiran **aqui**, que es donde importa:
#
#   1. Un `.map` lleva dentro **el codigo fuente entero**. Publicarlo en la interfaz de un sistema
#      de recaudacion se lo entrega a cualquiera que abra las herramientas del navegador.
#   2. Llevan las cifras del artboard. Esta medido en I-2: «Rufina Medina Medina» y «62,418»
#      aparecen en el `.map` y **cero** veces en el `.js`. O sea que sin este paso, el AC-3 —cero
#      apariciones sobre el `dist/` de la imagen— seria falso por los mapas, aunque el codigo que
#      se ejecuta estuviera limpio.
#
# Se quita tambien el comentario `sourceMappingURL` que quedaria apuntando a un archivo que ya no
# esta: dejarlo daria un 404 en la consola de cada navegador que abriera las herramientas, y un
# aviso que sale siempre es un aviso que nadie lee.
RUN find dist -name '*.map' -delete \
    && find dist -name '*.js' -exec sed -i '/^\/\/# sourceMappingURL=/d' {} + \
    && find dist -name '*.css' -exec sed -i '/^\/\*# sourceMappingURL=/d' {} +

# ---------------------------------------------------------------------------
FROM nginx:1.31.5-alpine AS interfaz

# La base trae su propio `index.html` de bienvenida y un `50x.html`. Se vacia el directorio antes
# de copiar para que lo que la imagen sirve sea EXACTAMENTE `dist/` y nada mas — que es lo que
# hace legible un `ls /usr/share/nginx/html` como comprobacion, en vez de dejar dos archivos
# ajenos que hay que aprenderse para saber que sobran.
RUN rm -rf /usr/share/nginx/html/*

COPY --from=construccion /obra/caja/frontend/dist/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf

# LO QUE SE SIRVE NO LLEVA CODIGO FUENTE, NI LA RUTA DE OTRO SISTEMA, NI LA CAPTURA SEMBRADA.
#
# ## Por que la comprobacion esta AQUI y no en la etapa de construccion
#
# Lo midio `rentas`#44: una comprobacion hecha dentro de `construccion` no ve un `COPY` de esta
# etapa, y con uno puesto la imagen servia `/src/api/identidad.ts` con 200 y el `docker build` en
# verde. Asi que se comprueba **lo que el contenedor va a servir**, despues del ultimo `COPY`.
#
# ## Lo que busca, y por que no es lo de `rentas`
#
#   · **Codigo fuente.** `vite build` no deberia emitir un `.ts`, pero «no deberia» no es una
#     comprobacion.
#   · **`/rentas/api`, ni ninguna otra API que no sea la suya.** Es la frontera de ADR-0042: la
#     ventanilla habla con `/caja/api/v1` y con el emisor, y con nadie mas. La vigila tambien
#     `verificaciones/la-frontera-de-caja.test.ts` sobre el codigo; aqui se mira el paquete, que es
#     lo que un navegador ejecuta.
#   · **La marca de la captura sembrada.** Las capturas de `src/datos/*Medida.ts` llevan una cadena
#     inconfundible —`ORIGEN_DE_LA_CAPTURA`— porque sus rotulos son los mismos que el arbol de
#     verdad y no distinguen nada. Si viaja, viaja la siembra.
#
# `rentas` busca aqui tres cifras de su artboard. `caja` no tiene artboard ni cifras de ejemplo: sus
# definiciones salen de los controladores y no traen ni un importe.
RUN set -eu; \
    servido=/usr/share/nginx/html; \
    if find "$servido" \( -name '*.ts' -o -name '*.tsx' \) | grep -q .; then \
        echo "Lo que se sirve lleva codigo fuente dentro:"; \
        find "$servido" \( -name '*.ts' -o -name '*.tsx' \); exit 1; \
    fi; \
    for cadena in '/rentas/api' '/catastro/api' '/normativa/api' '/identidad/api'; do \
        if grep -rqF "$cadena" "$servido"; then \
            echo "Lo que se sirve llama a otro sistema: «$cadena». Ver ADR-0042."; \
            grep -rlF "$cadena" "$servido"; exit 1; \
        fi; \
    done; \
    if grep -rqF 'captura-medida-de-caja' "$servido"; then \
        echo "Lo que se sirve lleva la captura sembrada. Ver src/arranque.ts."; \
        grep -rlF 'captura-medida-de-caja' "$servido"; exit 1; \
    fi; \
    echo "lo servido esta limpio: sin fuentes, sin la API de otro sistema y sin la captura sembrada"


# Sin root, y esto es lo unico que lo consigue: la configuracion de `nginx:*-alpine` trae `User`
# VACIO, o sea que sin este `USER` la interfaz correria como root. El usuario `nginx` ya existe en
# la base con uid 101.
#
# Ponerle `USER` a secas no basta, y hay tres cosas que arreglar:
#
#   1. `/var/cache/nginx` — el maestro crea ahi sus directorios temporales al arrancar. Sin
#      permiso de escritura no es un aviso: es `[emerg] mkdir() ... failed (13: Permission
#      denied)` y el contenedor no levanta.
#   2. `/etc/nginx` — dos guiones del entrypoint escriben ahi en CADA arranque
#      (`30-tune-worker-processes.sh` hace `sed -i.bak` sobre `nginx.conf`, y
#      `10-listen-on-ipv6-by-default.sh` empieza por un `touch` de `default.conf`). Sin permiso
#      los dos abortan con un error por consola en cada arranque.
#   3. El pid, que por omision va a `/run/nginx.pid`. Se manda a `/tmp`, escribible por cualquiera.
#
# El `chown` es a `nginx:0` y el `chmod` a `g=u` —por GRUPO y no por usuario— para que siga
# funcionando si el orquestador decide correrlo con un uid arbitrario del grupo 0, que es como
# despliega OpenShift.
#
# Y se borra `user nginx;` del conf principal porque nginx no puede cambiar de usuario cuando ya
# no es root: la directiva queda muerta y el arranque la anuncia en cada reinicio.
RUN sed -i \
        -e '/^user  *nginx;/d' \
        -e 's#^pid .*#pid /tmp/nginx.pid;#' \
        /etc/nginx/nginx.conf \
    && chown -R nginx:0 /var/cache/nginx /etc/nginx \
    && chmod -R g=u /var/cache/nginx /etc/nginx

# EL UID EN NUMERO, no `USER nginx`, y no es estilo (AC-2 de #44).
#
# `infrastructure/src/descriptor.ts` endurece todo contenedor con `runAsNonRoot: true` —«el
# endurecimiento que no admite excepcion», y aqui es `SEGURIDAD`—. Con un `USER` no numerico el
# kubelet **no puede comprobar** que el usuario no es root y se niega a arrancar el contenedor,
# con un `CreateContainerConfigError` que solo aparece al desplegar. Por eso las dos imagenes del
# backend ya usan `USER 10001` y `USER 10002`.
#
# El 101 es el del usuario `nginx` de la base, asi que el `chown` de arriba —que resuelve el
# nombre en tiempo de construccion, cuando todavia se es root— apunta a este mismo uid.
USER 101
EXPOSE 8080

# La sonda se ejecuta DENTRO del contenedor, y aqui —al reves que en `backend/Dockerfile`— no hay
# que instalar ningun cliente: el `wget` de busybox viene en la base.
#
# Pide `/index.html` y no `/`: con el `try_files` de `nginx.conf`, `/` devuelve la pantalla
# **aunque el directorio este vacio**, porque cualquier cosa cae al `index.html`... que tampoco
# estaria, pero la peticion de `/` con `index index.html` daria 403 y no 200. Pedir el archivo
# **por su nombre** es lo unico que distingue «nginx levantado» de «nginx levantado sobre el
# `dist/` que se copio»: si el `COPY` fallara, esto da 404 y el contenedor sale `unhealthy`.
#
# En forma JSON, o sea sin shell de por medio: `wget --spider` ya sale con codigo 1 cuando no
# puede conectar o recibe un 4xx, de modo que el `|| exit 1` que la forma de shell obliga a
# escribir no anade nada y se lleva por delante un proceso mas.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD ["wget", "--spider", "-q", "http://127.0.0.1:8080/index.html"]
