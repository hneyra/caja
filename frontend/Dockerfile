# syntax=docker/dockerfile:1
#
# `kamayuk-caja-interfaz`: la interfaz de ventanilla, compilada y servida como archivos estaticos.
#
# ## Por que no se llama `caja-web`
#
# `kamayuk-caja-web` YA EXISTE, y es otra cosa: el `Deployment` y el `Service` del BACKEND con el
# perfil `web` de Spring (`infrastructure/src/descriptor.ts`, `despliegueDelPerfil(e, "web", true)`).
# Darle ese nombre a esta imagen colisionaria con un recurso vivo, y la colision no seria un error
# de despliegue sino un `Service` que reparte entre dos cosas distintas. `interfaz` es ademas el
# vocabulario que `infrastructure` ya usa para la del monolito (`sgtm-interfaz`).
#
# ## Por que NO se reutiliza `backend/Dockerfile`
#
# Aquel compila con Gradle y su contexto es la RAIZ del repositorio, porque tiene `COPY` que salen
# de `backend/`. Este no necesita nada de fuera de `frontend/`, asi que su contexto es `frontend/`
# y su `.dockerignore` es `frontend/.dockerignore`. Son dos decisiones que van juntas: un
# `.dockerignore` solo se aplica desde la raiz del contexto, de modo que el de la raiz —que ademas
# excluye `frontend/` entero— no dice nada de esta imagen.
#
# ## Las dos etapas se tratan distinto a proposito
#
# `construccion` se tira: nada de ella se publica, y por eso su base es la etiqueta movil
# `node:22-alpine`. Fijar ahi un numero exacto crearia un segundo numero al lado de
# `frontend/.nvmrc` que nadie compara —el mismo defecto silencioso contra el que `frontend.yml`
# argumenta al leer la version de ese archivo en vez de escribirla— y no compraria
# reproducibilidad: lo que fija que se instale es `yarn.lock` con `--frozen-lockfile`.
#
# `interfaz` SI se publica, asi que su base va clavada: `nginx:1.31.4-alpine`, no `stable-alpine`
# ni `1.31`. Es lo que permite que un escaneo de imagenes diga de que version habla, y actualizar
# el numero es la correccion cuando el escaneo encuentre algo, no ignorar el hallazgo.

# ---------------------------------------------------------------------------
FROM node:22-alpine AS construccion

WORKDIR /origen

# Primero el manifiesto y el candado, y nada mas: asi la capa de dependencias se reutiliza
# mientras esos dos archivos no cambien, que es lo que hace barato reconstruir tras tocar una
# pantalla. `--frozen-lockfile` es lo mismo que exige `frontend.yml`: si `package.json` y
# `yarn.lock` no cuadran, esto falla aqui en vez de instalar en silencio una version distinta
# de la que se verifico.
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .

# `yarn build` es `tsc -b && vite build`. Las dos mitades hacen falta y no fallan por lo mismo:
# `tsc -b` compila lo que declara `tsconfig.json` —`src`, `verificaciones` y `vite.config.ts`—,
# de modo que `verificaciones/` NO se puede excluir del contexto aunque no se despliegue.
#
# Sin `ARG` ni `ENV` de compilacion, y eso es una afirmacion: `vite` resuelve las variables
# `VITE_*` AL COMPILAR, y el monolito necesita cuatro (la URL de su API y las tres de su puerta
# de sesion). Aqui no hay ninguna porque no hay nada que configurar: esta interfaz no habla con
# nadie y sus datos salen de `src/datos/`.
RUN yarn build

# ---------------------------------------------------------------------------
FROM nginx:1.31.4-alpine AS interfaz

# La base trae su propio `index.html` de bienvenida y un `50x.html`. Se vacia el directorio antes
# de copiar para que lo que la imagen sirve sea EXACTAMENTE `dist/` y nada mas — que es lo que
# hace legible un `ls /usr/share/nginx/html` como comprobacion, en vez de dejar dos archivos
# ajenos que hay que aprenderse para saber que sobran.
RUN rm -rf /usr/share/nginx/html/*

COPY --from=construccion /origen/dist/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Sin root, y esto es lo unico que lo consigue: la configuracion de `nginx:1.31.4-alpine` trae
# `User` VACIO —medido sobre el JSON de configuracion de la imagen—, o sea que sin este `USER`
# la interfaz correria como root. El usuario `nginx` ya existe en la base, uid 101, creado con
# `adduser -S -D -H -u 101 -h /var/cache/nginx -s /sbin/nologin`.
#
# Ponerle `USER` a secas no basta, y hay tres cosas que arreglar. Las tres, medidas sobre la
# imagen de verdad:
#
#   1. `/var/cache/nginx` — el maestro crea ahi sus directorios temporales al arrancar. Sin
#      permiso de escritura no es un aviso: es `[emerg] mkdir() ... failed (13: Permission
#      denied)` y el contenedor no levanta.
#   2. `/etc/nginx` — `nginx.conf` y `conf.d/default.conf` vienen `uid=0 gid=0 mode 644`, y dos
#      guiones del entrypoint escriben ahi en CADA arranque:
#      `30-tune-worker-processes.sh` hace `sed -i.bak` sobre `nginx.conf`, y
#      `10-listen-on-ipv6-by-default.sh` empieza por un `touch` de `default.conf`. Sin permiso
#      los dos abortan con un mensaje de error por consola en cada arranque. (Ese segundo guion
#      no llega a tocar nuestro archivo aunque pueda: compara su sha1 con el que `apk manifest`
#      declara para el `default.conf` DEL PAQUETE —`565a608f…`— y sale en cuanto ve que difiere.
#      El nuestro no se escribe aqui a proposito: cambia con cada edicion de `nginx.conf`, y una
#      cifra que se queda vieja sola es peor que ninguna. Lo que no cambia es que difiera.)
#   3. El pid, que por omision va a `/run/nginx.pid`. Se manda a `/tmp`, escribible por cualquiera.
#
# El `chown` es a `nginx:0` y el `chmod` a `g=u` —por GRUPO y no por usuario— para que siga
# funcionando si el orquestador decide correrlo con un uid arbitrario del grupo 0, que es como
# despliega OpenShift.
#
# Y se borra `user nginx;` del conf principal porque nginx no puede cambiar de usuario cuando ya
# no es root: la directiva queda muerta y el arranque la anuncia. Un aviso que sale siempre es un
# aviso que nadie lee.
RUN sed -i \
        -e '/^user  *nginx;/d' \
        -e 's#^pid .*#pid /tmp/nginx.pid;#' \
        /etc/nginx/nginx.conf \
    && chown -R nginx:0 /var/cache/nginx /etc/nginx \
    && chmod -R g=u /var/cache/nginx /etc/nginx

# El uid EN NUMERO, no `USER nginx`, y esto no es estilo. `infrastructure/src/descriptor.ts`
# endurece todo contenedor con `runAsNonRoot: true` («el endurecimiento que no admite excepcion»,
# issue #157). Con un `USER` no numerico el kubelet **no puede comprobar** que el usuario no es
# root y se niega a arrancar el contenedor, con un `CreateContainerConfigError` que solo aparece
# al desplegar. Por eso las dos imagenes del backend ya usan `USER 10001` y `USER 10002`.
#
# El 101 es el del usuario `nginx` de la base —`adduser -S -D -H -u 101`, y su fila de
# `/etc/passwd` dice `nginx:x:101:101:...`—, asi que el `chown` de arriba, que resuelve el nombre
# en tiempo de construccion cuando todavia se es root, sigue apuntando a este mismo uid.
USER 101
EXPOSE 8080

# La sonda se ejecuta DENTRO del contenedor, y aqui —al reves que en `backend/Dockerfile`— no hay
# que instalar ningun cliente: el `wget` de busybox viene en la base. Pide `/`, que con el
# `try_files` de `nginx.conf` es lo mismo que pedir la pantalla; comprobar solo que el puerto
# acepta conexiones daria por sano un nginx levantado sobre un directorio vacio.
#
# En forma JSON, o sea sin shell de por medio: `wget --spider` ya sale con codigo 1 cuando no
# puede conectar —medido contra el busybox de esta misma base—, de modo que el `|| exit 1` que
# la forma de shell obliga a escribir no anade nada y se lleva por delante un proceso mas.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD ["wget", "--spider", "-q", "http://127.0.0.1:8080/"]
