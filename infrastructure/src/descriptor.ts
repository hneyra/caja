/**
 * El descriptor de infraestructura de `caja` (`ADR-0031` §2).
 *
 * Ordenes de cobro, recibo, turno, arqueo, cierre y medios de pago.
 *
 * ## Que es esto, y por que son funciones puras
 *
 * `infrastructure` lo importa, **fija su version**, lo compone y **lo audita con las mismas
 * reglas que audita los suyos**. Eso solo es posible porque lo que hay aqui son **funciones
 * puras que devuelven objetos planos de Kubernetes**: `infrastructure` recibe datos, puede
 * leerlos y puede negarse a aplicarlos. Si este archivo creara recursos —un `pulumi.Input`, una
 * conexion, una lectura de `process.env`—, la auditoria no tendria nada que leer y la unica
 * garantia seria la confianza en quien lo escribio.
 *
 * ## Lo que este archivo NO puede hacer
 *
 * Cinco cosas, y `infrastructure` las rechaza: una ruta fuera de su prefijo, **la etiqueta de la
 * imagen** —la pone `infrastructure`, o cada liberacion vuelve a ser un `pulumi up`—, privilegios
 * sobre la base de otro sistema, un `Deployment` sin limites ni sondas, y un `Secret` en claro.
 *
 * ## Caja no sabe que es un tributo
 *
 * Recibe **ordenes de cobro** —`sistemaOrigen`, `referenciaExterna`, concepto, importe— y devuelve
 * pagos con su recibo. Nada mas (`ADR-0026` §1). Es lo que la hace reutilizable para un mercado o
 * un nicho sin arrastrar el Codigo Tributario.
 *
 * Su unico egreso es a `rentas`, y **no es para preguntar**: es el `PagoRegistrado` que publica
 * al cobrar, porque **la imputacion es de rentas** (`ADR-0026` §2). Si Caja imputara, la regla del
 * Codigo Tributario estaria escrita dos veces.
 *
 * ## Las tres imagenes existen, y eso ya no es una promesa
 *
 * Este parrafo decia «los `Deployment` apuntan a imagenes que **aun no existen**», y **es falso
 * desde el flujo D**: `publicar-imagenes.yml` publica las tres etiquetadas con el `sha` de este
 * repositorio, sin filtro `paths:`, de modo que todo commit de `main` tiene las suyas. Medido
 * contra `ghcr.io` con el mismo bucle del trabajo `comprobar` y el `sha` de `main`
 * (`11e5a51c`): `kamayuk-caja` **200**, `kamayuk-caja-migrador` **200**, `kamayuk-caja-interfaz`
 * **200**. Y el negocio esta dentro desde P5D. Lo que sigue faltando es el `pulumi up`, que es de
 * `infrastructure`.
 */

import type {
  BaseDeDatosDeclarada,
  ClaveDeclarada,
  Contenedor,
  DescriptorDeSistema,
  EntornoDelDescriptor,
  Manifiesto,
  NetworkPolicy,
  PanelDeclarado,
  ReglaDeAlerta,
  VariableDeEntorno,
} from "@kamayuk/infra-contrato";

import { NGINX_DE_LA_INTERFAZ } from "./nginx-de-la-interfaz";

const SISTEMA = "caja";

/** La imagen del migrador: el otro objetivo del mismo `Dockerfile` (C-14, punto 1). */
const MIGRADOR = `${SISTEMA}-migrador`;

/**
 * La imagen de la interfaz de ventanilla (#16): `frontend/Dockerfile`, nginx sirviendo `dist/`.
 *
 * **Nunca `caja-web`.** Ese nombre YA ES otra cosa: el `Deployment` y el `Service` del BACKEND con
 * el perfil `web` de Spring, que este mismo archivo produce en `despliegueDelPerfil(e, "web", true)`.
 * Reutilizarlo no daria un error de despliegue sino un `Service` repartiendo entre dos cosas
 * distintas — la mitad de las peticiones de la API contestadas por un nginx de archivos estaticos—.
 */
const INTERFAZ = `${SISTEMA}-interfaz`;

/** El nombre de sus dos recursos y de su `ConfigMap`. Sale una vez y se usa en cinco sitios. */
const NOMBRE_DE_LA_INTERFAZ = `kamayuk-${SISTEMA}-interfaz`;

/**
 * Su etiqueta `componente`, **distinta de la del backend**, y no es cosmetica.
 *
 * `egreso()` selecciona por `componente: caja` los pods que pueden hablar con el motor, con la
 * identidad y con `rentas`. Si la interfaz llevara esa misma etiqueta heredaria las tres, y un
 * nginx de archivos estaticos con salida a la base de datos es superficie que nadie pidio.
 * Con etiqueta propia, sus dos politicas se escriben aparte y dicen lo que de verdad necesita:
 * que Traefik le entre, y DNS.
 */
const COMPONENTE_DE_LA_INTERFAZ = INTERFAZ;

/**
 * Su base, en el motor de la plataforma. Una por sistema (ADR-0029, ADR-0032).
 *
 * **El anfitrion lo pide, no lo escribe** (C-17, punto 1). Hasta aqui esta linea decia
 * `jdbc:postgresql://postgres:5432/...`, y en Kubernetes **no hay ningun `Service` llamado
 * `postgres`**: ese nombre viene del `compose.yaml` local. El servicio real es
 * `kamayuk-<ambiente>-postgres` y vive en el namespace de la PLATAFORMA, asi que ni siquiera un
 * nombre corto correcto resolveria desde aqui. Lo medido fue `UnknownHostException` en los ocho
 * Jobs y en los `Deployment` de los cuatro: nada del producto podia arrancar.
 *
 * Componerlo aqui seria repetir dos convenciones que son de `infrastructure` —como se nombra un
 * recurso del ambiente y como se llama su namespace—, y dos copias de una convencion se separan.
 * Lo que si es de este sistema, y por eso se escribe aqui, es el nombre de su base.
 */
function urlDeLaBase(e: EntornoDelDescriptor): string {
  return `jdbc:postgresql://${e.plataforma.motor}/${SISTEMA}`;
}

/**
 * Lo que piden los Jobs de un solo uso —migrar e implantar— y los procesos por lotes.
 *
 * Mismos `limits` que el perfil web y `requests` mas bajos, que es el reparto que
 * `RECURSOS.arranque` del monolito documenta desde el 2026-08-26: el `request` es lo que el
 * planificador **reserva y bloquea**, y estos Jobs corren a la vez que todos los `Deployment`
 * durante un `pulumi up`. Con el nodo justo, un `request` alto no es lentitud: es que no entran,
 * y como llevan la clase `lote` —la mas baja del cluster— no pueden desalojar a nadie para
 * hacerlo. Nadie cede y el despliegue se cuelga (`capacidad.ts`, issue #252).
 */
const RECURSOS_DE_ARRANQUE = {
  requests: { cpu: "50m", memory: "256Mi" },
  limits: { cpu: "1", memory: "1Gi" },
};

/** La conexion de la aplicacion: `kamayuk_app` y solo `kamayuk_app` (ARQ-03 §4). */
function credencialesDeLaAplicacion(e: EntornoDelDescriptor): VariableDeEntorno[] {
  return [
    { name: "KAMAYUK_DB_URL", value: urlDeLaBase(e) },
    { name: "KAMAYUK_DB_USUARIO", value: "kamayuk_app" },
    {
      name: "KAMAYUK_DB_CLAVE",
      valueFrom: { secretKeyRef: { name: e.secretoDe("app"), key: "clave" } },
    },
  ];
}

/**
 * El contenedor del migrador: **la imagen del migrador, no la de la aplicacion** (C-14, punto 1).
 *
 * Lee `KAMAYUK_DB_OWNER_USUARIO` y `KAMAYUK_DB_OWNER_CLAVE` —lo dice el `main` de
 * `kamayuk.caja.esquema.Migrador`, que rechaza argumentos a proposito para que una
 * clave no quede en el historial del proceso—, y **no** `KAMAYUK_DB_USUARIO`, que es lo que este
 * descriptor ponia hasta C-14 sobre la imagen de la aplicacion: aquello arrancaba el proceso web
 * con las credenciales de `kamayuk_owner` y con `spring.flyway.enabled: false`, o sea DDL al alcance
 * de un servidor HTTP y ninguna migracion aplicada.
 */
function contenedorDelMigrador(e: EntornoDelDescriptor): Contenedor {
  return {
    name: "migrador",
    image: e.imagenDe(MIGRADOR),
    env: [
      { name: "KAMAYUK_DB_URL", value: urlDeLaBase(e) },
      // Migrar es lo unico que corre como `kamayuk_owner`: es el unico rol con DDL.
      { name: "KAMAYUK_DB_OWNER_USUARIO", value: "kamayuk_owner" },
      {
        name: "KAMAYUK_DB_OWNER_CLAVE",
        valueFrom: { secretKeyRef: { name: e.secretoDe("owner"), key: "clave" } },
      },
    ],
    resources: RECURSOS_DE_ARRANQUE,
    securityContext: SEGURIDAD,
  };
}

/**
 * Las dos de ADR-0026 §4, que en `caja` van en el bloque COMUN del `application.yaml`.
 *
 * Y por eso las necesita **todo** proceso de este sistema, no solo el perfil `web`: sin ellas
 * Spring no puede resolver el marcador y el contexto muere antes de hacer nada. Lo destapo C-14
 * al extender `variables-sin-omision` del `Deployment` a todo pod que corra la imagen de la
 * aplicacion: el Job de implantacion de `caja` **no habria levantado**, y el sintoma habria sido
 * un despliegue colgado esperando una municipalidad que nadie implanto.
 */
function operacionDeLaCaja(e: EntornoDelDescriptor): VariableDeEntorno[] {
  return [
    { name: "KAMAYUK_CAJA_RESPONSABLE", value: e.operacion.responsable },
    { name: "KAMAYUK_CAJA_CANAL", value: e.operacion.canal },
  ];
}

/** Las propiedades de `DatosDeImplantacion`, tal como Spring las lee del entorno. */
function variablesDeImplantacion(e: EntornoDelDescriptor): VariableDeEntorno[] {
  const i = e.implantacion;
  return [
    { name: "SPRING_PROFILES_ACTIVE", value: "batch" },
    ...credencialesDeLaAplicacion(e),
    ...operacionDeLaCaja(e),
    { name: "KAMAYUK_IMPLANTACION_UBIGEO", value: i.ubigeo },
    { name: "KAMAYUK_IMPLANTACION_NOMBRE", value: i.nombre },
    { name: "KAMAYUK_IMPLANTACION_TIPO", value: i.tipo },
    // No crea ninguna contrasena: la credencial vive en Keycloak, y esta cuenta tiene que ser
    // la misma que exista alli.
    { name: "KAMAYUK_IMPLANTACION_ADMINISTRADOR", value: i.administrador },
    { name: "KAMAYUK_IMPLANTACION_NOMBREDELADMINISTRADOR", value: i.nombreDelAdministrador },
    { name: "KAMAYUK_IMPLANTACION_ESDEMOSTRACION", value: String(i.esDemostracion) },
    { name: "KAMAYUK_IMPLANTACION_URL", value: urlDeLaBase(e) },
    // OWNERCLAVE sin guion bajo: en una variable de entorno el `_` se traduce a punto, asi que
    // `KAMAYUK_IMPLANTACION_OWNER_CLAVE` seria `kamayuk.implantacion.owner.clave` y no
    // `owner-clave`. Es la misma nota que lleva el Job del monolito, y por el mismo motivo.
    {
      name: "KAMAYUK_IMPLANTACION_OWNERCLAVE",
      valueFrom: { secretKeyRef: { name: e.secretoDe("owner"), key: "clave" } },
    },
  ];
}

/** Lo que pide y lo que puede gastar. Sin esto, el planificador no reserva nada. */
const RECURSOS = {
  requests: { cpu: "100m", memory: "512Mi" },
  limits: { cpu: "1", memory: "1Gi" },
};

/**
 * Lo de la interfaz, y es **mucho menos que lo del backend**: nginx sirviendo archivos estaticos
 * no necesita 1 CPU ni 1 Gi.
 *
 * No son numeros inventados: son los mismos que `convenciones.recursos.interfaz` de
 * `infrastructure` le da al nginx del monolito, que hace exactamente esto mismo. Calibrarlos otra
 * vez desde cero seria una segunda opinion sobre la misma carga, y con un solo nodo lo que se
 * reparte es el `request`: 50m frente a los 100m del backend es la diferencia entre que este pod
 * quepa al lado de todo lo demas o no.
 */
const RECURSOS_DE_LA_INTERFAZ = {
  requests: { cpu: "50m", memory: "64Mi" },
  limits: { cpu: "200m", memory: "128Mi" },
};

/**
 * `timeoutSeconds` entre 3 y 5, y no es decorativo: el valor por omision del kubelet es **1 s**,
 * y en un nodo ocupado un contenedor sano pero atareado no contesta en 1 s. Tres fallos de la
 * sonda de vida y lo mata con codigo 143, que se parece a un OOM sin serlo.
 */
function sondas() {
  return {
    startupProbe: {
      timeoutSeconds: 3,
      httpGet: { path: "/actuator/health", port: 8080 },
      failureThreshold: 30,
      periodSeconds: 5,
    },
    readinessProbe: {
      timeoutSeconds: 3,
      httpGet: { path: "/actuator/health/readiness", port: 8080 },
      periodSeconds: 10,
    },
    livenessProbe: {
      timeoutSeconds: 5,
      httpGet: { path: "/actuator/health/liveness", port: 8080 },
      periodSeconds: 20,
    },
  };
}

/** El endurecimiento que no admite excepcion (issue #157). */
const SEGURIDAD = {
  runAsNonRoot: true,
  allowPrivilegeEscalation: false as const,
  capabilities: { drop: ["ALL"] as ["ALL"] },
};

function despliegueDelPerfil(e: EntornoDelDescriptor, perfil: string, atiendeHttp: boolean): Manifiesto[] {
  const nombre = `kamayuk-${SISTEMA}-${perfil}`;
  const etiquetas = { ...e.etiquetas, componente: SISTEMA, perfil };
  const manifiestos: Manifiesto[] = [
    {
      apiVersion: "apps/v1",
      kind: "Deployment",
      metadata: { name: nombre, namespace: e.namespace, labels: etiquetas },
      spec: {
        replicas: 1,
        // `maxSurge: 0` obliga a matar el pod viejo antes de crear el nuevo: en un nodo sin
        // holgura, un pod extra durante el despliegue no agenda y el rollout se cuelga.
        strategy: { type: "RollingUpdate", rollingUpdate: { maxSurge: 0, maxUnavailable: 1 } },
        selector: { matchLabels: { app: nombre } },
        template: {
          metadata: { labels: { ...etiquetas, app: nombre } },
          spec: {
            priorityClassName: e.prioridadDe(perfil === "batch" ? "lote" : "servicio"),
            containers: [
              {
                name: SISTEMA,
                // La etiqueta la pone `infrastructure`. Ver la cabecera.
                image: e.imagenDe(SISTEMA),
                env: [
                  { name: "SPRING_PROFILES_ACTIVE", value: perfil },
                  { name: "KAMAYUK_DB_URL", value: urlDeLaBase(e) },
                  { name: "KAMAYUK_DB_USUARIO", value: "kamayuk_app" },
                  {
                    name: "KAMAYUK_DB_CLAVE",
                    valueFrom: { secretKeyRef: { name: e.secretoDe("app"), key: "clave" } },
                  },
                  // Sin el emisor la aplicacion se niega a arrancar, y es deliberado: un backend
                  // que atiende sin poder validar un token responde a la sonda, se declara sano y
                  // no atiende a nadie (ADR-0005).
                  { name: "KAMAYUK_OIDC_EMISOR", value: e.plataforma.emisor },
                  // El JWKS por la red INTERNA, cruzando el namespace de la plataforma (C-14).
                  // Hasta aqui este descriptor apuntaba las dos al nombre publico: el backend
                  // habria salido al ingreso para volver a entrar, y con la politica de egreso
                  // declarada —que nombra el pod de identidad, no internet— no habria salido en
                  // absoluto. Todo token invalido, por un motivo que no se parece a su causa.
                  { name: "KAMAYUK_OIDC_JWKS", value: e.plataforma.jwks },
                  // A donde se le entrega el evento de cada pago (ADR-0026 §3). Es un MAPA por
                  // nombre de sistema y no una direccion unica: la caja no sabe cuantos sistemas
                  // hay, y el dia que aparezca `mercados` tiene que ser una linea aqui y no un
                  // despliegue de la caja.
                  {
                    name: "KAMAYUK_CAJA_ORIGENES",
                    value: `{rentas: 'http://rentas:8080/rentas/api/v1'}`,
                  },
                  // QUIEN recibe el aviso cuando hay dinero cobrado sin registrar
                  // (ADR-0026 §4). La aplicacion NO ARRANCA sin las dos —lo comprueba
                  // `ResponsableDeLaConciliacion` al construirse, y el propio
                  // `application.yaml` no les da valor por omision—, y eso es deliberado:
                  // una alerta sin destinatario acaba en un panel que nadie mira.
                  //
                  // Salen del AMBIENTE y no de este descriptor (C-7, punto 4). Hasta C-7
                  // `EntornoDelDescriptor` no tenia campo para ellas y el hueco no se podia
                  // cerrar desde aqui: cerrarlo era cambiar `infrastructure`, que es otro
                  // repositorio. Con `e.operacion` el dato viaja como cualquier otro, y
                  // `checkInvariants` rechaza ademas el relleno —«pendiente», «TBD»—, que
                  // satisfaria la guarda de la aplicacion y la vaciaria de sentido.
                  ...operacionDeLaCaja(e),
                ],
                ...(atiendeHttp ? { ports: [{ name: "http", containerPort: 8080 }] } : {}),
                resources: RECURSOS,
                ...(atiendeHttp ? sondas() : {}),
                securityContext: SEGURIDAD,
              },
            ],
          },
        },
      },
    },
  ];
  if (atiendeHttp) {
    manifiestos.push({
      apiVersion: "v1",
      kind: "Service",
      metadata: { name: nombre, namespace: e.namespace, labels: etiquetas },
      spec: {
        type: "ClusterIP",
        selector: { app: nombre },
        ports: [{ name: "http", port: 80, targetPort: 8080 }],
      },
    });
  }
  return manifiestos;
}

/**
 * La interfaz de ventanilla: su `ConfigMap`, su `Deployment` y su `Service` (#16, #17).
 *
 * ## Que corre aqui, y que NO
 *
 * Un `nginx:1.31.4-alpine` sirviendo el `dist/` de `caja-web`. **Sin una sola variable de entorno,
 * y sin un solo `secretKeyRef`**: esta interfaz no tiene credenciales que manejar ni backend al que
 * llamar —sus datos salen de `frontend/src/datos/` y una regla de ESLint le prohibe `fetch`—, asi
 * que un `Secret` montado aqui no seria una comodidad sino una credencial regalada a un proceso
 * que no la usa.
 *
 * ## `runAsNonRoot` sin `runAsUser`
 *
 * `SEGURIDAD` fija `runAsNonRoot: true`, que es «el endurecimiento que no admite excepcion»
 * (#157). El monolito tiene que anadirle ademas `runAsUser: 101` porque su `Dockerfile` dice
 * `USER nginx` —un NOMBRE— y el kubelet no puede comprobar que un nombre no sea root: se niega a
 * arrancar el contenedor con un `CreateContainerConfigError` que solo aparece al desplegar. El de
 * #16 dice **`USER 101`**, en numero y por este motivo, asi que aqui no hace falta repetirlo; y si
 * alguien lo devolviera a un nombre, este `Deployment` dejaria de arrancar y el descriptor no
 * tendria por que enterarse. Por eso `descriptor.test.ts` lee el `Dockerfile` y lo comprueba.
 *
 * ## Las sondas van a `/`
 *
 * Y no a un `/healthz` inventado: lo que hay que saber es que **la pantalla se sirve**, y con el
 * `try_files` de `nginx.conf` pedir `/` es pedir la pantalla. Comprobar solo que el puerto acepta
 * conexiones daria por sano un nginx levantado sobre un directorio vacio — el mismo argumento con
 * el que el `HEALTHCHECK` de la imagen pide `/` en vez de abrir un socket.
 */
function despliegueDeLaInterfaz(e: EntornoDelDescriptor): Manifiesto[] {
  const etiquetas = { ...e.etiquetas, componente: COMPONENTE_DE_LA_INTERFAZ };
  const configuracion = `${NOMBRE_DE_LA_INTERFAZ}-nginx`;
  return [
    {
      apiVersion: "v1",
      kind: "ConfigMap",
      metadata: { name: configuracion, namespace: e.namespace, labels: etiquetas },
      // `default.conf` y no `nginx.conf`: es el nombre con el que el `include conf.d/*.conf` de
      // la imagen lo recoge, y el mismo sitio en el que el `Dockerfile` lo copia.
      data: { "default.conf": NGINX_DE_LA_INTERFAZ },
    },
    {
      apiVersion: "apps/v1",
      kind: "Deployment",
      metadata: { name: NOMBRE_DE_LA_INTERFAZ, namespace: e.namespace, labels: etiquetas },
      spec: {
        replicas: 1,
        // El mismo `maxSurge: 0` que el backend, y por el mismo motivo: en un nodo sin holgura un
        // pod extra durante el despliegue no agenda y el rollout se cuelga.
        strategy: { type: "RollingUpdate", rollingUpdate: { maxSurge: 0, maxUnavailable: 1 } },
        selector: { matchLabels: { app: NOMBRE_DE_LA_INTERFAZ } },
        template: {
          metadata: { labels: { ...etiquetas, app: NOMBRE_DE_LA_INTERFAZ } },
          spec: {
            priorityClassName: e.prioridadDe("servicio"),
            containers: [
              {
                name: "interfaz",
                // La etiqueta la pone `infrastructure`. Ver la cabecera.
                image: e.imagenDe(INTERFAZ),
                ports: [{ name: "http", containerPort: 8080 }],
                resources: RECURSOS_DE_LA_INTERFAZ,
                readinessProbe: {
                  timeoutSeconds: 3,
                  httpGet: { path: "/", port: 8080 },
                  periodSeconds: 10,
                },
                livenessProbe: {
                  timeoutSeconds: 3,
                  httpGet: { path: "/", port: 8080 },
                  periodSeconds: 20,
                },
                volumeMounts: [
                  {
                    name: "configuracion",
                    mountPath: "/etc/nginx/conf.d/default.conf",
                    // `subPath`, o el montaje taparia el directorio entero de `conf.d`.
                    subPath: "default.conf",
                    readOnly: true,
                  },
                ],
                securityContext: SEGURIDAD,
              },
            ],
            volumes: [{ name: "configuracion", configMap: { name: configuracion } }],
          },
        },
      },
    },
    {
      apiVersion: "v1",
      kind: "Service",
      metadata: { name: NOMBRE_DE_LA_INTERFAZ, namespace: e.namespace, labels: etiquetas },
      spec: {
        type: "ClusterIP",
        selector: { app: NOMBRE_DE_LA_INTERFAZ },
        // 80 hacia fuera y 8080 dentro, como el `Service` del backend de este mismo archivo: el
        // contenedor no corre como root y no puede abrir un puerto privilegiado.
        ports: [{ name: "http", port: 80, targetPort: 8080 }],
      },
    },
  ];
}

/**
 * Las dos prioridades del ingreso, **explicitas y no heredadas de la longitud de la regla**.
 *
 * Traefik v3 ordena las rutas por longitud de su `match` cuando nadie declara `priority`, y
 * `PathPrefix(\`/caja/api/v1\`)` es mas larga que `PathPrefix(\`/caja\`)`, asi que hoy saldria bien
 * **por accidente**. No se deja implicito, y el motivo es que el fallo no grita: con la
 * precedencia al reves, `/caja/api/v1/recibos` lo atenderia el nginx de la interfaz, cuyo
 * `try_files $uri /index.html` devuelve el `index.html` con un **200**. El cliente recibe HTML
 * donde espera JSON y el error aparece lejos de su causa — no hay 404, no hay 502, no hay una
 * linea roja en ningun sitio.
 *
 * Medido, no supuesto: sobre el nginx de verdad de `nginx:1.31.4-alpine` con este mismo
 * `nginx.conf`, una ruta que no existe como archivo devuelve `200 text/html` con el cuerpo del
 * `index.html`.
 */
const PRIORIDAD_DE_LA_API = 20;
const PRIORIDAD_DE_LA_INTERFAZ = 10;

/**
 * DNS, y va primero en toda politica de egreso porque todo lo demas depende de el.
 *
 * Una politica de egreso convierte a los pods que selecciona en «solo lo declarado», y `postgres`,
 * `identidad` y los sistemas hermanos se nombran por su `Service`: resolver ese nombre es una
 * consulta a CoreDNS, que vive en `kube-system`, y ninguna otra regla la permite. El sintoma
 * medido es `UnknownHostException`, y es **intermitente** —la resolucion se cachea, asi que a
 * veces sale y a veces no—, que es peor que fallar siempre. Con esta regla anadida a mano sobre el
 * clúster, las OCHO tareas de los cuatro sistemas pasaron de `Failed` a `Complete` (C-17, punto 3).
 *
 * Es la misma politica que `Red.ts` le da al namespace de la plataforma desde que existe
 * (`permitir-dns`): lo que fallo aqui no fue la idea, fue que estas politicas se escribieron de
 * cero y esa parte no se copio. Va **en el descriptor** y no en `infrastructure` porque quien
 * decide que pods restringe cada politica es este archivo —`podSelector` es suyo—; lo que si es de
 * `infrastructure` es la guarda que comprueba que ningun sistema se la deje.
 *
 * Sin `podSelector` en el destino, a proposito: lo que se abre es el PUERTO 53 hacia el namespace
 * del sistema, no un pod concreto. Nombrar `k8s-app: kube-dns` ataria esta politica a como
 * etiqueta sus pods una distribucion de Kubernetes.
 *
 * **Sale a una funcion en #17** porque desde entonces hay dos politicas de egreso —la del backend
 * y la de la interfaz— y dos copias de esta regla se separan; que las DOS la lleven lo comprueba
 * `descriptor.test.ts`, recorriendo todas.
 */
function reglaDeDns() {
  return {
    to: [
      {
        namespaceSelector: {
          matchLabels: { "kubernetes.io/metadata.name": "kube-system" },
        },
      },
    ],
    ports: [
      { protocol: "UDP" as const, port: 53 },
      // TCP tambien: una respuesta que no cabe en un datagrama se reintenta por TCP, y una
      // politica que solo abriera UDP funcionaria hasta el dia que dejara de hacerlo, por el
      // tamano de una respuesta.
      { protocol: "TCP" as const, port: 53 },
    ],
  };
}

/**
 * Las dos politicas de red de la interfaz, y son las dos puntas de un solo flujo (#157).
 *
 * **Entrada**: Traefik y nadie mas. `infrastructure` deniega por omision en el namespace, asi que
 * sin esta regla el ingreso enruta y el paquete no llega — la ruta existe, el pod esta sano y el
 * navegador se queda esperando. Es la contraparte de `permitir-ingreso-interfaz` de `Red.ts`, que
 * hace exactamente esto para la interfaz del monolito. Traefik lo despliega k3s en `kube-system`,
 * que es tambien de donde sale el DNS.
 *
 * El puerto es el **8080 del pod**, no el 80 del `Service`: una `NetworkPolicy` filtra sobre el
 * puerto del contenedor, y el mapeo 80 → 8080 lo deshace el `Service` antes. Escribir 80 aqui
 * seria una politica que no admite nada.
 *
 * **Salida**: DNS y nada mas. Y hay que decir lo que eso significa hoy: **esta interfaz no
 * resuelve ni un nombre** — `frontend/nginx.conf` no tiene ningun reenvio ni ningun `resolver`,
 * que es la afirmacion principal de ese archivo—, asi que la regla de DNS es el suelo comun de
 * todo pod del clúster y no una necesidad medida de este. Lo que **no** se declara es lo que
 * importa: sin una regla hacia el backend, un reenvio escrito aqui manana no funcionaria en el
 * clúster aunque funcionara en el compose, y eso se ve en el PR que lo escriba en vez de en
 * produccion.
 */
function politicasDeLaInterfaz(e: EntornoDelDescriptor): NetworkPolicy[] {
  const seleccion = { matchLabels: { componente: COMPONENTE_DE_LA_INTERFAZ } };
  return [
    {
      apiVersion: "networking.k8s.io/v1",
      kind: "NetworkPolicy",
      metadata: {
        name: `${NOMBRE_DE_LA_INTERFAZ}-ingreso`,
        namespace: e.namespace,
        labels: e.etiquetas,
      },
      spec: {
        podSelector: seleccion,
        policyTypes: ["Ingress"],
        ingress: [
          {
            from: [
              {
                namespaceSelector: {
                  matchLabels: { "kubernetes.io/metadata.name": "kube-system" },
                },
              },
            ],
            ports: [{ protocol: "TCP", port: 8080 }],
          },
        ],
      },
    },
    {
      apiVersion: "networking.k8s.io/v1",
      kind: "NetworkPolicy",
      metadata: {
        name: `${NOMBRE_DE_LA_INTERFAZ}-egreso`,
        namespace: e.namespace,
        labels: e.etiquetas,
      },
      spec: {
        podSelector: seleccion,
        policyTypes: ["Egress"],
        egress: [reglaDeDns()],
      },
    },
  ];
}

export const caja: DescriptorDeSistema = {
  sistema: SISTEMA,
  prefijo: SISTEMA,
  // TRES imagenes. Las dos primeras son dos objetivos del MISMO `Dockerfile` (C-14, punto 1):
  // las credenciales de `kamayuk_owner` existen durante la migracion y desaparecen con ella. La
  // tercera es de OTRO —`frontend/Dockerfile`, con contexto `frontend/` (#16)— y no comparte una
  // sola capa con ellas: no lleva JVM, ni Node, ni codigo fuente; solo `dist/` y nginx.
  imagenes: [SISTEMA, MIGRADOR, INTERFAZ],

  /**
   * Su base y sus roles. **Solo la suya**: pedir privilegios sobre la de otro sistema es una
   * base compartida disfrazada, y deja el aislamiento entre municipalidades en una promesa.
   *
   * `superusuario: false` no es una formalidad: un superusuario OMITE RLS incluso con
   * `FORCE ROW LEVEL SECURITY` (DAT-01 §0, hallazgo 1).
   */
  baseDeDatos(): BaseDeDatosDeclarada {
    return {
      nombre: SISTEMA,
      roles: [
        { nombre: "kamayuk_owner", sobre: [SISTEMA], privilegios: ["ALL"], superusuario: false },
        {
          nombre: "kamayuk_app",
          sobre: [SISTEMA],
          privilegios: ["SELECT", "INSERT", "UPDATE"],
          superusuario: false,
        },
        { nombre: "kamayuk_readonly", sobre: [SISTEMA], privilegios: ["SELECT"], superusuario: false },
      ],
    };
  },

  despliegue: (e) => [...despliegueDelPerfil(e, "web", true), ...despliegueDeLaInterfaz(e)],

  /**
   * Su Job de migracion. Cada base tiene sus migraciones y su prueba de aislamiento.
   *
   * **El nombre lleva la version**, y no es cosmetico: un `Job` de Kubernetes es INMUTABLE —su
   * plantilla de pod no se puede modificar—, asi que un nombre fijo hace fallar el `pulumi up` de
   * la version siguiente al intentar actualizarlo, porque la imagen lleva la etiqueta dentro. El
   * monolito lo resolvio asi desde el issue #150; este descriptor nacio sin ello.
   */
  migracion(e): Manifiesto[] {
    const nombre = e.nombreConVersion(`kamayuk-${SISTEMA}-migracion`);
    const etiquetas = { ...e.etiquetas, componente: SISTEMA };
    return [
      {
        apiVersion: "batch/v1",
        kind: "Job",
        metadata: { name: nombre, namespace: e.namespace, labels: etiquetas },
        spec: {
          backoffLimit: 3,
          ttlSecondsAfterFinished: 86400,
          template: {
            metadata: { labels: { ...etiquetas, app: nombre } },
            spec: {
              restartPolicy: "Never",
              priorityClassName: e.prioridadDe("lote"),
              containers: [contenedorDelMigrador(e)],
            },
          },
        },
      },
    ];
  },

  /**
   * Su Job de implantacion: la fila de `municipalidad` en SU base, y la copia local de usuarios,
   * grupos y accesos (C-7 §2.3, C-14 punto 4).
   *
   * ## Por que el migrador va de contenedor de inicializacion
   *
   * Un `Deployment` no sabe esperar a un `Job` y Kubernetes no tiene `dependsOn`. El monolito lo
   * resuelve con un contenedor que consulta la base con `psql` hasta ver `flyway_schema_history`;
   * aqui esa salida no existe, porque un descriptor solo puede nombrar SUS imagenes —la
   * prohibicion (b)— y la del motor no es suya.
   *
   * Lo que se hace es mas fuerte que esperar: se **asegura** que el esquema esta, corriendo el
   * migrador, que es idempotente y devuelve cero cuando no falta nada. Si el Job de migracion aun
   * no termino, Flyway toma su propio candado y uno de los dos espera al otro; cuando este
   * contenedor sale con exito **el esquema ESTA**, que es lo que la espera del monolito solo
   * puede suponer.
   */
  implantacion(e): Manifiesto[] {
    const nombre = e.nombreConVersion(`kamayuk-${SISTEMA}-implantacion`);
    const etiquetas = { ...e.etiquetas, componente: SISTEMA };
    return [
      {
        apiVersion: "batch/v1",
        kind: "Job",
        metadata: { name: nombre, namespace: e.namespace, labels: etiquetas },
        spec: {
          backoffLimit: 3,
          ttlSecondsAfterFinished: 86400,
          template: {
            metadata: { labels: { ...etiquetas, app: nombre } },
            spec: {
              restartPolicy: "Never",
              priorityClassName: e.prioridadDe("lote"),
              initContainers: [contenedorDelMigrador(e)],
              containers: [
                {
                  name: "implantacion",
                  // La MISMA imagen que la aplicacion, con el perfil `batch` (ADR-0003: un
                  // artefacto, dos perfiles). No abre puerto ninguno.
                  image: e.imagenDe(SISTEMA),
                  env: variablesDeImplantacion(e),
                  resources: RECURSOS_DE_ARRANQUE,
                  securityContext: SEGURIDAD,
                },
              ],
            },
          },
        },
      },
    ];
  },

  /**
   * Sus procesos por lotes con ventana. **Ninguno**, y es una afirmacion, no una casilla.
   *
   * El unico proceso periodico que `caja` tiene escrito es el publicador de su buzon, y es un
   * `@Scheduled` que **no se registra**: en los cuatro backends no hay ni un
   * `@EnableScheduling` (P6 §4.4). Declararle aqui un `CronJob` seria decir que corre algo
   * que no existe todavia como proceso invocable; lo que hace falta primero es convertirlo
   * en un `ApplicationRunner` del perfil `batch`, como hizo C-8 con el emisor de `catastro`.
   *
   * Una lista vacia no es lo mismo que un `CronJob` suspendido: lo primero dice «este sistema no
   * corre nada de madrugada» y lo segundo «corre esto, y hoy no puede».
   */
  lotes: (): Manifiesto[] => [],

  /**
   * Sus rutas, **bajo su prefijo**. Reclamar el de otro no falla: se lo queda.
   *
   * Son DOS desde #17, y el reparto es el que decide quien contesta:
   *
   *   - `/caja/api/v1` → `kamayuk-caja-web`, el backend. Su raiz de API es esa ruta ENTERA:
   *     `Api.RAIZ = "/caja/api/v1"` en `kamayuk-caja-plataforma`, y de ahi cuelgan los once
   *     `@RequestMapping` del nucleo. Por eso esta ruta **no lleva el middleware que quita el
   *     prefijo**: quitarselo dejaria a Spring buscando `/pagos` y contestando 404 a todo.
   *   - `/caja` → `kamayuk-caja-interfaz`, el nginx de la ventanilla, **con el prefijo quitado**.
   *
   * ## La precedencia, escrita y no heredada
   *
   * Ver `PRIORIDAD_DE_LA_API`: el fallo que esto impide devuelve **200** y por eso no grita.
   *
   * ## Por que el middleware quita `/caja`, medido contra el nginx de verdad
   *
   * `frontend/nginx.conf` sirve en la raiz (`root /usr/share/nginx/html; location / { try_files
   * $uri /index.html; }`), asi que lo que le llegue tiene que venir **sin** el prefijo. Levantando
   * el nginx de `nginx:1.31.4-alpine` con ese archivo y el `dist/` real:
   *
   *   - con el prefijo quitado, `/assets/index-<huella>.js` sale `200 application/javascript`
   *     (292 327 B) y `/escudo-catacaos.png` sale `200 image/png`;
   *   - **sin quitarlo**, `/caja/assets/index-<huella>.js` sale `200 text/html` de 1 383 B — el
   *     `index.html` otra vez, por el `try_files`. El navegador rechaza el modulo por su tipo y la
   *     pantalla queda en blanco: **otro 200 que miente**, el mismo modo de fallo que la
   *     precedencia de arriba.
   *
   * ## Lo que este middleware NO arregla, y esta medido
   *
   * `frontend/vite.config.ts` **no declara `base`**, asi que el `index.html` que `vite build` emite
   * fija sus recursos en absoluto: `src="/assets/index-<huella>.js"`. Servida bajo `/caja/`, la
   * pantalla carga y el navegador pide despues `/assets/...` **a la raiz del dominio**, que es una
   * ruta que `PathPrefix(/caja)` ya no casa — y que este descriptor **no puede reclamar**: es la
   * prohibicion (a) de `infrastructure`.
   *
   * O sea que las dos salidas que se planteaban —quitar el prefijo aqui, o declarar `base` alli—
   * **no son alternativas: hacen falta las dos**, y ninguna basta sola. Se hace aqui la que es de
   * este repositorio y de este issue.
   *
   * Y aun con las dos faltaria una tercera, tambien medida: `src/barra/BarraGlobal.tsx` escribe
   * `src="/escudo-catacaos.png"` en el JSX, y **Vite no reescribe un literal de cadena de
   * JavaScript** — con `base: "/caja/"`, `dist/index.html` pasa a decir `/caja/escudo-catacaos.png`
   * y el paquete sigue diciendo `/escudo-catacaos.png`, comprobado sobre el `dist/`. Bajo cualquier
   * prefijo, esa peticion se va a la raiz del dominio y no llega. La coherencia entre las tres la
   * vigila `descriptor.test.ts`; cerrarla es trabajo de `frontend/`, no de un descriptor.
   */
  ingreso(e): Manifiesto[] {
    const quitarElPrefijo = `kamayuk-${SISTEMA}-quitar-prefijo`;
    return [
      {
        apiVersion: "traefik.io/v1alpha1",
        kind: "Middleware",
        metadata: { name: quitarElPrefijo, namespace: e.namespace, labels: e.etiquetas },
        // Traefik reenvia lo que queda y anade `X-Forwarded-Prefix`, asi que quien quiera
        // reconstruir la URL publica puede; nginx no lo necesita para servir un archivo.
        spec: { stripPrefix: { prefixes: [`/${SISTEMA}`] } },
      },
      {
        apiVersion: "traefik.io/v1alpha1",
        kind: "IngressRoute",
        metadata: { name: `kamayuk-${SISTEMA}`, namespace: e.namespace, labels: e.etiquetas },
        spec: {
          // Solo `websecure`: 80 redirige, no coexiste. Un formulario de acceso servido por
          // HTTP es una credencial regalada.
          entryPoints: ["websecure"],
          routes: [
            {
              match: `Host(\`${e.dominio}\`) && PathPrefix(\`/${SISTEMA}/api/v1\`)`,
              kind: "Rule",
              priority: PRIORIDAD_DE_LA_API,
              services: [{ name: `kamayuk-${SISTEMA}-web`, port: 80 }],
            },
            {
              match: `Host(\`${e.dominio}\`) && PathPrefix(\`/${SISTEMA}\`)`,
              kind: "Rule",
              priority: PRIORIDAD_DE_LA_INTERFAZ,
              services: [{ name: NOMBRE_DE_LA_INTERFAZ, port: 80 }],
              middlewares: [{ name: quitarElPrefijo }],
            },
          ],
          tls: { certResolver: "letsencrypt" },
        },
      },
    ];
  },

  /**
   * A quien puede llamar. **El egreso declarado ES el grafo de dependencias** (ADR-0029), y
   * tiene que coincidir con ARQ-01 reducido a cuatro nodos. Cada arista, con su motivo:
   *
   * - **`rentas`**: el `PagoRegistrado` que publica al cobrar, para que rentas impute (ADR-0026 §3)
   *
   * Devuelve `NetworkPolicy[]`, y desde #17 no todas son de egreso: la interfaz necesita ademas
   * **que Traefik le entre**, y este es el unico miembro del contrato por el que un descriptor
   * puede declarar una `NetworkPolicy`. Que la entrada la ponga `infrastructure` vale para sus
   * propios componentes (`Red.ts`, `permitir-ingreso-interfaz`); un pod que nace en el descriptor
   * de un sistema no lo conoce nadie mas, asi que su regla de entrada tiene que nacer con el o el
   * `deny` por omision lo deja inalcanzable con la ruta publicada y el pod sano.
   */
  egreso(e): NetworkPolicy[] {
    return [
      {
        apiVersion: "networking.k8s.io/v1",
        kind: "NetworkPolicy",
        metadata: {
          name: `kamayuk-${SISTEMA}-egreso`,
          namespace: e.namespace,
          labels: e.etiquetas,
        },
        spec: {
          podSelector: { matchLabels: { componente: SISTEMA } },
          policyTypes: ["Egress"],
          egress: [
            // DNS, y va primero porque las tres que siguen NO SIRVEN DE NADA sin el. Ver
            // `reglaDeDns()`, que desde #17 la comparten esta politica y la de la interfaz.
            reglaDeDns(),
            // Su motor. Los cuatro lo necesitan; cada uno a SU base.
            {
              to: [
                {
                  // El `namespaceSelector` NO es un adorno: desde ADR-0031 cada sistema tiene su
                  // namespace, y un `podSelector` a secas selecciona pods del MISMO. Sin el, esta
                  // regla no abre nada y el sintoma es trafico denegado con una politica que dice
                  // permitirlo (C-14, punto 3).
                  namespaceSelector: {
                    matchLabels: { "kubernetes.io/metadata.name": e.plataforma.namespace },
                  },
                  podSelector: { matchLabels: { componente: "postgres" } },
                },
              ],
              ports: [{ protocol: "TCP", port: 5432 }],
            },
            // La identidad: valida los tokens que recibe.
            {
              to: [
                {
                  // El `namespaceSelector` NO es un adorno: desde ADR-0031 cada sistema tiene su
                  // namespace, y un `podSelector` a secas selecciona pods del MISMO. Sin el, esta
                  // regla no abre nada y el sintoma es trafico denegado con una politica que dice
                  // permitirlo (C-14, punto 3).
                  namespaceSelector: {
                    matchLabels: { "kubernetes.io/metadata.name": e.plataforma.namespace },
                  },
                  podSelector: { matchLabels: { componente: "identidad" } },
                },
              ],
              ports: [{ protocol: "TCP", port: 8080 }],
            },
            // rentas: el `PagoRegistrado` que publica al cobrar, para que rentas impute (ADR-0026 §3)
            {
              to: [
                {
                  namespaceSelector: {
                    matchLabels: { "kubernetes.io/metadata.name": e.namespaceDe("rentas") },
                  },
                  podSelector: { matchLabels: { componente: "rentas" } },
                },
              ],
              ports: [{ protocol: "TCP", port: 8080 }],
            },
          ],
        },
      },
      // La interfaz, que **no comparte** ninguna de las tres aristas de arriba: su `componente` es
      // otro a proposito, y lo unico que declara es que Traefik le entre y que pueda resolver un
      // nombre. Ver `politicasDeLaInterfaz`.
      ...politicasDeLaInterfaz(e),
    ];
  },

  alertas: (): ReglaDeAlerta[] => [
    {
      alert: `${SISTEMA}SinResponder`,
      expr: `up{job="kamayuk-${SISTEMA}"} == 0`,
      for: "5m",
      labels: { severity: "critical", sistema: SISTEMA },
      annotations: {
        summary: `${SISTEMA} lleva 5 minutos sin responder`,
        description: "Con un solo nodo no hay a donde mover la carga: hay que mirar el pod.",
      },
    },
  ],

  panel: (): PanelDeclarado => ({
    nombre: `kamayuk-${SISTEMA}`,
    // Vacio a proposito: un panel se llena con las metricas que el sistema publica, y todavia
    // no publica ninguna. Inventarle paneles ahora seria dibujar cifras que nadie emite.
    json: { title: `Kamayuk · ${SISTEMA}`, panels: [] },
  }),

  /**
   * Su inventario de claves: metadatos, **nunca un valor** (INF-06, ADR-0011 §3).
   *
   * **El nombre sale de `e.secretoDe(...)`, el mismo que usan los manifiestos** (C-17, punto 4).
   * Hasta aqui esta lista decia `kamayuk-<sistema>-app` —sin el ambiente— mientras los
   * `secretKeyRef` de arriba pedian `kamayuk-<sistema>-<ambiente>-app`: el inventario nombraba
   * un `Secret` que nadie monta, y los que se montan no estaban en ningun inventario. La
   * interseccion entre lo declarado y lo referenciado era **cero**, y el sintoma no es un error
   * sino un pod en `Pending` esperando un `Secret` que nadie genera.
   */
  claves: (e): ClaveDeclarada[] => [
    {
      nombre: e.secretoDe("app"),
      clave: "clave",
      rol: "kamayuk_app",
      rotacion: "trimestral",
      proposito: `la conexion de ${SISTEMA} a su base`,
    },
    {
      nombre: e.secretoDe("owner"),
      clave: "clave",
      rol: "kamayuk_owner",
      rotacion: "anual",
      proposito: `migrar la base de ${SISTEMA}; es el unico rol con DDL`,
    },
  ],
};

export default caja;
