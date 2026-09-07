/**
 * El `frontend/nginx.conf` de este repositorio, **caracter a caracter**, para meterlo en un
 * `ConfigMap`.
 *
 * ## Por que hay una copia y no una lectura del archivo
 *
 * El monolito lo resuelve leyendo el archivo con `readFileSync` (`infra/componentes/fuentes.ts`),
 * y aqui no se puede: **un descriptor es una funcion pura que devuelve objetos planos**, y lo que
 * hace que `infrastructure` pueda auditarlo a traves de la frontera es justo que no lea nada del
 * disco ni del entorno (ADR-0031 §2, y la cabecera de `descriptor.ts`). Una lectura dependeria
 * ademas de donde quede este paquete cuando lo importa el repositorio hermano por su `link:`, y el
 * sintoma de equivocarse no seria un error de compilacion sino un `pulumi up` a medias.
 *
 * De modo que la copia es deliberada, y **lo que la hace segura es que su deriva se ve**:
 * `descriptor.test.ts` compara esta constante con el archivo, y `infraestructura.yml` corre esa
 * prueba tambien cuando lo que cambia es `frontend/nginx.conf` — sin esa linea en su `paths:`,
 * editar solo el archivo dejaria la copia vieja **en verde**, que es la clase de fallo silencioso
 * que este repositorio persigue.
 *
 * ## Y por que un `ConfigMap` existiendo la imagen
 *
 * La imagen ya lleva este archivo dentro (`COPY nginx.conf /etc/nginx/conf.d/default.conf`, #16).
 * El del clúster se monta encima para poder cambiar la configuracion **sin reconstruir ni
 * republicar la imagen**, que es el patron del monolito (`Aplicacion.ts`, `nginxDelCluster()`). La
 * diferencia con el suyo es que alli hay una linea que reescribir —el destino de su reenvio
 * interno— y aqui **ninguna**: esta interfaz no habla con nadie, asi que la copia es literal.
 *
 * Se monta con `subPath`, o sea que **no se actualiza sola**: un cambio del `ConfigMap` necesita
 * reiniciar el pod. Es como monta el suyo el monolito, y es preferible a montar el directorio
 * entero, que taparia el resto de `conf.d`.
 *
 * Y montarlo deja el archivo de solo lectura, cosa que el arranque de la imagen tolera: su
 * `10-listen-on-ipv6-by-default.sh` hace `touch /etc/nginx/conf.d/default.conf 2>/dev/null || {
 * entrypoint_log "... (read-only file system?)"; exit 0; }` — leido del guion de
 * `nginx:1.31.4-alpine`, no supuesto—, asi que informa y sigue. El que si escribe en cada arranque
 * es `30-tune-worker-processes.sh`, y lo hace sobre `/etc/nginx/nginx.conf`, que este montaje no
 * toca.
 */
export const NGINX_DE_LA_INTERFAZ = `# La interfaz de ventanilla, servida como archivos estaticos. Y nada mas.
#
# ## Lo que este archivo NO tiene, que es lo unico que lo distingue del monolito
#
# \`sgtm/frontend/nginx.conf\` —que \`infrastructure/frontend/nginx.conf\` replica byte a byte para
# meterlo en un \`ConfigMap\`— lleva un bloque \`location /api/v1/\` que **reenvia al backend**, y
# alli ese reenvio no es comodidad: es lo unico que hace que su interfaz alcance su API sin CORS.
#
# Aqui NO HAY NINGUNO, y esa ausencia es la afirmacion principal de este archivo. \`caja-web\` no
# habla con nadie: sus datos salen de \`frontend/src/datos/\` y una regla de ESLint prohibe \`fetch\`.
# Mientras eso sea cierto, un reenvio declarado «por si acaso» seria una puerta abierta a escribir
# la primera peticion sin que nadie lo decida — que es el mismo motivo por el que \`vite.config.ts\`
# tampoco declara \`server.proxy\`.
#
# Es verificable y no solo prometido: contar la directiva de reenvio en este archivo da **cero**.
# Y la cuenta se hace sobre el archivo entero A PROPOSITO, lo que obliga a que esta explicacion no
# escriba el nombre de la directiva ni una vez: nombrarla aqui daria un positivo que no es un
# reenvio, y una comprobacion que se dispara con la prosa que la explica es una comprobacion que
# alguien acaba apagando. Es la leccion del escaner del Panel (#10), aplicada del otro lado.
#
# ## El prefijo \`/caja\`: un solo camino de servicio y DOS entradas
#
# \`infrastructure/src/descriptor.ts\` enruta este sistema con
# \`Host(<dominio>) && PathPrefix(/caja)\`, asi que de puertas afuera la interfaz vive bajo \`/caja\`.
# Y desde #37 \`frontend/vite.config.ts\` declara \`base: "/caja/"\`, o sea que el \`index.html\` que
# \`vite build\` emite pide sus recursos **con el prefijo dentro**: \`/caja/assets/index-<huella>.js\`,
# \`/caja/assets/index-<huella>.css\` y \`/caja/escudo-catacaos.png\`, medido sobre \`dist/index.html\`.
#
# Delante de este nginx puede haber alguien que quite ese prefijo, o puede no haberlo, y las dos
# situaciones existen hoy:
#
#   - **En el cluster lo quita el ingreso**: el \`IngressRoute\` de #17 encamina \`/caja\` a esta
#     interfaz con un \`stripPrefix\`, asi que aqui llega \`/assets/index-<huella>.js\`, sin prefijo.
#   - **En \`despliegue/compose.yaml\` no hay nadie delante**: ese archivo publica el puerto de este
#     contenedor y se entra por el (ver su servicio \`caja-interfaz\`), asi que aqui llega
#     \`/caja/assets/index-<huella>.js\`, tal como lo escribio el \`index.html\`.
#
# Hasta #42 solo se servia la primera. La segunda no daba un error: caia en el \`try_files\` de mas
# abajo y contestaba **200 \`text/html\`** con el \`index.html\` dentro, donde el navegador esperaba un
# modulo. \`curl\` en verde y navegador en blanco — un 200 que miente, que es el modo de fallo que
# este repositorio persigue.
#
# De modo que este archivo **quita el prefijo cuando nadie lo ha quitado**, con un \`rewrite ...
# last\`, que es el equivalente exacto de lo que hace el ingreso: la peticion vuelve a la busqueda
# de \`location\` ya sin \`/caja\`. Eso deja **un solo camino de servicio y dos entradas**, y esa es la
# propiedad que importa: no hay una segunda copia del \`try_files\` ni de la cabecera de cache que
# pueda separarse de la primera; las dos entradas desembocan en los mismos tres \`location\` de
# abajo. Se mide levantando este nginx de verdad y pidiendo el paquete por las dos entradas:
# \`frontend/verificaciones/sin-traefik.mjs\`, con el tipo y el cuerpo y no con el codigo.
#
# Lo que esto NO hace es quitarle el trabajo al ingreso, y conviene decirlo con todas las letras:
# con las dos entradas servidas, el \`stripPrefix\` de #17 pasa a ser **redundante en efecto** —las
# dos URL acaban en el mismo sitio—. Se queda igualmente, y por dos motivos: la ruta del cluster no
# cambia ni un byte respecto de lo que #17 midio, que es lo que hace que este cambio no pueda
# regresionar el despliegue; y quitarlo seria tocar el ingreso, que es otra decision y de otro
# dueno. Lo que el ingreso decide y esto no toca es **quien contesta**: su \`priority\` es lo que
# manda \`/caja/api/v1\` al backend en vez de a este nginx.
#
# ## Un solo \`Cache-Control\` por respuesta, a proposito
#
# El monolito escribe \`expires 1y;\` **y** \`add_header Cache-Control "public, immutable";\` en el
# mismo \`location\`. Medido contra nginx 1.31.4: eso emite **dos** cabeceras \`Cache-Control\` en la
# misma respuesta —\`max-age=31536000\` de \`expires\` y \`public, immutable\` de \`add_header\`—, y quien
# lea la primera se queda sin \`immutable\` y quien lea la segunda, sin la duracion. Aqui va una
# sola cabecera con las tres cosas dentro.

server {
    listen 8080;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    # Comprimir lo que se repite. Las imagenes ya vienen comprimidas y volver a pasarlas por
    # gzip solo gasta CPU, asi que no entran en la lista.
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;

    # La entrada de quien llega SIN que nadie le haya quitado el prefijo (#42). El \`last\` devuelve
    # la peticion a la busqueda de \`location\` ya sin \`/caja\`, de modo que la sirven los tres
    # bloques de abajo y no una copia suya. Sin esto, \`/caja/assets/...\` cae en el \`try_files\` y
    # se va en 200 con el \`index.html\` dentro.
    location = /caja {
        return 301 /caja/;
    }

    location /caja/ {
        rewrite ^/caja/(.*)$ /$1 last;
    }

    # Las rutas de la aplicacion viven en el hash —\`#recibos\`, \`#cajas\`— pero el navegador no
    # es el unico que las escribe: recargar en una ruta que no existe como archivo tiene que
    # devolver la pantalla, no un 404 de nginx.
    location / {
        try_files $uri /index.html;
    }

    # Los recursos con huella en el nombre no cambian nunca; \`index.html\` si. Sin esta pareja el
    # navegador decide por su cuenta, y entonces unas veces vuelve a descargar activos con huella
    # que no cambian y otras se queda con un \`index.html\` viejo que apunta a activos que ya no
    # existen. El escudo NO entra aqui: esta en la raiz y su nombre no lleva huella.
    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable" always;
    }

    location = /index.html {
        add_header Cache-Control "no-cache" always;
    }
}
`;
