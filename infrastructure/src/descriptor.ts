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
 * Su egreso hacia `rentas` **no es para preguntar**: es el `PagoRegistrado` que publica al cobrar,
 * porque **la imputacion es de rentas** (`ADR-0026` §2). Lo saca del buzon un proceso aparte, el
 * `Deployment` del perfil `publicador` (#79), y no la peticion que cobra. Si Caja imputara, la regla del Codigo
 * Tributario estaria escrita dos veces. Y desde la etapa 4 de ADR-0039 tiene un segundo egreso,
 * hacia `identidad` —el sistema, no Keycloak—, que tampoco es para cobrar: es el consumidor del
 * buzon de la autorizacion, corre en un `CronJob` del perfil `batch` y la ventanilla sigue
 * cobrando con `identidad` apagado, con la copia local que tenga.
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
  CronJob,
  DescriptorDeSistema,
  EntornoDelDescriptor,
  Manifiesto,
  NetworkPolicy,
  PanelDeclarado,
  ReglaDeAlerta,
  VariableDeEntorno,
} from "@kamayuk/infra-contrato";


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
 * El cliente publico de Keycloak con el que la interfaz entra (#74, ADR-0042).
 *
 * El mismo que `rentas`: `kamayuk-backoffice`, publico y con PKCE S256. **Se escribe aqui porque
 * `EntornoDelDescriptor` no lo publica**: el realm lo describe `infrastructure`, y este contrato
 * entrega el emisor (`plataforma.emisor`) pero no el cliente.
 *
 * **El `redirect_uri` es de `infrastructure`.** La interfaz lo compone como `origin + /caja/` —la
 * raiz DE LA APLICACION, la leccion de `rentas`#71—; en el cluster `Identidad.ts` lleva toda
 * redireccion del realm al dominio (`https://<dominio>/*`), y en local el cliente admite
 * `http://localhost:5181/*` desde `infrastructure`#184. Si un dia no lo admitiera, el rebote acaba
 * en «Invalid parameter: redirect_uri» y no entra nadie: se nombra aqui para que quien despliegue
 * sepa donde mirar.
 */
const CLIENTE_OIDC_DE_LA_INTERFAZ = "kamayuk-backoffice";

/**
 * Las senias del ambiente que la interfaz lee al arrancar (#74): el guion `configuracion.js`.
 *
 * La interfaz no puede hornear la URL del emisor —la imagen se etiqueta con el `sha` y es la misma
 * en todos los ambientes—, asi que la lee de `window.__KAMAYUK_CAJA__`, que deja ese guion. La
 * imagen trae uno vacio en `frontend/public/`, y aqui se monta encima con las de este ambiente. La
 * razon entera esta en `frontend/src/api/configuracion.ts`.
 */
function senasDelAmbiente(e: EntornoDelDescriptor): Record<string, string> {
  return {
    // El emisor PUBLICO, el que el navegador alcanza. `plataforma.jwks` NO vale aqui: es una
    // direccion de la red interna del cluster.
    oidcRealm: e.plataforma.emisor,
    oidcCliente: CLIENTE_OIDC_DE_LA_INTERFAZ,
    // Sin `offline_access`: el token de esta interfaz muere con la pestana (ADR-0030 §3).
    oidcAlcance: "openid profile",
  };
}

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

/**
 * Cada cinco minutos: la ventana de inconsistencia de la copia local de la autorizacion
 * (ADR-0039 §«Lo que cuesta», punto 2). Ver `lotes()`.
 */
const VENTANA_DEL_CONSUMIDOR = "*/5 * * * *";

/** El periodo de `VENTANA_DEL_CONSUMIDOR` en segundos: lo que tarda un tick en volver. */
const PERIODO_DEL_CONSUMIDOR_SEGUNDOS = 5 * 60;

/**
 * `startingDeadlineSeconds` del `CronJob` del consumidor (#116): si el controlador se atrasa mas
 * de un minuto en arrancar el pod —una caida breve del plano de control—, este tick se cuenta
 * como perdido en vez de arrancar tan tarde que casi no le quede ventana antes del siguiente. Ver
 * la seccion «Los dos plazos» de `lotes()`.
 */
const PLAZO_DE_ARRANQUE_DEL_CONSUMIDOR_SEGUNDOS = 60;

/**
 * `activeDeadlineSeconds` del `CronJob` del consumidor (#116), por DEBAJO del periodo de cinco
 * minutos y no en cualquier punto por debajo: `PLAZO_DE_ARRANQUE_DEL_CONSUMIDOR_SEGUNDOS` (60) +
 * `PLAZO_ACTIVO_DEL_CONSUMIDOR_SEGUNDOS` (240) suman exactamente los 300 s del periodo, asi que un
 * job que arranca en el ultimo instante que el plazo de arranque admite y corre hasta su limite
 * termina justo cuando toca el siguiente tick: nunca se come la ventana ajena. Ver la seccion «Los
 * dos plazos» de `lotes()` para lo que tarda una corrida y por que morir a medias a los 240 s es
 * seguro —no «sobra»: una corrida sana con mucho atraso puede llegar a este limite y cortarse ahi—.
 */
const PLAZO_ACTIVO_DEL_CONSUMIDOR_SEGUNDOS = 240;

/**
 * `startingDeadlineSeconds` (en `spec`) y `activeDeadlineSeconds` (en `spec.jobTemplate.spec`)
 * son campos de Kubernetes que el `CronJob` de `@kamayuk/infra-contrato` todavia no declara —
 * #116 es el primero de los cinco repositorios que los necesita—. Se extienden aqui, LOCALMENTE,
 * en vez de tocar `infrastructure`: son datos planos que Kubernetes entiende igual sin que el
 * contrato compartido los conozca, y la auditoria de `infrastructure` los recorre como cualquier
 * otro campo del objeto que recibe.
 */
export type CronJobConPlazos = CronJob & {
  spec: CronJob["spec"] & {
    startingDeadlineSeconds: number;
    jobTemplate: {
      spec: CronJob["spec"]["jobTemplate"]["spec"] & { activeDeadlineSeconds: number };
    };
  };
};

// La propiedad de seguridad es <=, no ===: un job que arranca en el ultimo instante admitido y
// corre hasta su propio limite no puede terminar DESPUES del siguiente tick —eso si se comeria la
// ventana ajena—, pero terminar ANTES no rompe nada, es solo mas margen. Con === bajar uno solo de
// los dos numeros en el futuro (mas margen, menos plazo activo) reventaria el modulo sin motivo;
// con <= sigue vigilando lo unico que de verdad hace falta. Los 60 + 240 = 300 de hoy son ademas el
// caso exacto (ver los dos docblocks de arriba), y por eso la prueba del descriptor los pide tal
// cual: esta aserción es el limite de la propiedad, no el valor concreto.
if (
  PLAZO_DE_ARRANQUE_DEL_CONSUMIDOR_SEGUNDOS + PLAZO_ACTIVO_DEL_CONSUMIDOR_SEGUNDOS >
  PERIODO_DEL_CONSUMIDOR_SEGUNDOS
) {
  throw new Error(
    "PLAZO_DE_ARRANQUE_DEL_CONSUMIDOR_SEGUNDOS + PLAZO_ACTIVO_DEL_CONSUMIDOR_SEGUNDOS no puede " +
      "superar PERIODO_DEL_CONSUMIDOR_SEGUNDOS: un job que arranca al final del plazo de arranque " +
      "y corre hasta su plazo activo terminaria despues del siguiente tick",
  );
}

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

/**
 * Con que lee esta caja el buzon de `identidad` (ADR-0039, etapa 4): las cuatro de
 * `kamayuk.identidad.*`, que `ConfiguracionDelBuzonDeIdentidad` y `CorrerElConsumidorDeIdentidad`
 * leen SOLO en el perfil `batch`. Ninguna tiene valor por omision en el `application.yaml`, a
 * proposito: `@ConditionalOnProperty("kamayuk.identidad.url")` es lo que decide si el consumidor
 * existe, y un valor vacio por omision lo satisfaria con una URL que no es de nadie.
 *
 * Las lleva el `CronJob` y las lleva TAMBIEN el Job de implantacion, y desde la etapa 5 de ADR-0039
 * ese Job **no arranca sin ellas**: la implantacion ya no siembra ni un usuario, ni un grupo, ni un
 * permiso —eso es de `identidad`— y lo unico que escribe por su cuenta es el catalogo de este
 * sistema. Sin `KAMAYUK_IDENTIDAD_URL` no existe el bean del consumidor, no hay de donde traer la
 * autorizacion, y la implantacion falla nombrandolo en vez de dejar la municipalidad dada de alta y
 * sin nadie que pueda entrar.
 *
 * (Hasta la etapa 4 este comentario decia «los dos grupos que siembra `SembradorDeLaCopiaLocal`», y
 * era falso por partida doble: aquel sembrador creaba UNO —su propio javadoc lo argumentaba en un
 * epigrafe titulado «Un grupo, no dos»— y desde la etapa 5 no crea ninguno.)
 *
 * La URL se compone con `namespaceDe` y no a mano, y el `Service` se llama `kamayuk-identidad-web`
 * —es lo que `despliegueDelPerfil` de `identidad` publica— y **no** `kamayuk-<amb>-identidad`, que
 * es Keycloak (la colision de nombre que ADR-0039 §AC-7 deja escrita). Aqui la raiz de la API va
 * ENTERA, con su prefijo: `Api.RAIZ` de `identidad` es `/identidad/api/v1` y de ahi cuelga
 * `EventosController`.
 *
 * El token se pide con el MISMO cliente confidencial que el publicador hacia `rentas`
 * —`kamayuk-caja-servicio-<ubigeo>`, uno por municipalidad (ADR-0028 §2)— y con OTRA clave:
 * `e.secretoDe("identidad")`, el espejo de la que el Job de identidad le fija a Keycloak para el
 * par (caja, identidad). No se copia el proveedor del token: se construye con la otra clave.
 */
function variablesDelConsumidorDeIdentidad(e: EntornoDelDescriptor): VariableDeEntorno[] {
  return [
    {
      name: "KAMAYUK_IDENTIDAD_URL",
      value: `http://kamayuk-identidad-web.${e.namespaceDe("identidad")}/identidad/api/v1`,
    },
    { name: "KAMAYUK_IDENTIDAD_TOKEN", value: e.plataforma.token },
    {
      name: "KAMAYUK_IDENTIDAD_CLIENTE",
      value: `kamayuk-${SISTEMA}-servicio-${e.implantacion.ubigeo}`,
    },
    {
      name: "KAMAYUK_IDENTIDAD_CREDENCIAL",
      valueFrom: { secretKeyRef: { name: e.secretoDe("identidad"), key: "clave" } },
    },
  ];
}

/**
 * Las propiedades de `DatosDeImplantacion`, tal como Spring las lee del entorno. Y desde la etapa
 * 4 de ADR-0039, las del consumidor de `identidad`: la implantacion termina con una pasada suya.
 */
function variablesDeImplantacion(e: EntornoDelDescriptor): VariableDeEntorno[] {
  const i = e.implantacion;
  return [
    { name: "SPRING_PROFILES_ACTIVE", value: "batch" },
    ...credencialesDeLaAplicacion(e),
    ...operacionDeLaCaja(e),
    ...variablesDelConsumidorDeIdentidad(e),
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

/**
 * El perfil del publicador del buzon de pagos (#79): `PublicadorDelBuzon.PERFIL` en el backend, y
 * `descriptor.test.ts` lee de alli que digan lo mismo.
 */
const PERFIL_DEL_PUBLICADOR = "publicador";

/**
 * A donde se le entrega el evento de cada pago, y de donde se lee la conciliacion (ADR-0026 §3 y
 * §4): `KAMAYUK_CAJA_ORIGENES`, un MAPA por nombre de sistema y no una direccion unica —la caja no
 * sabe cuantos sistemas hay, y el dia que aparezca `mercados` tiene que ser una linea aqui y no un
 * despliegue de la caja—.
 *
 * ## El anfitrion se compone con `namespaceDe`, y hasta #79 no se componia
 *
 * Esta linea decia `{rentas: 'http://rentas:8080/rentas/api/v1'}`: el nombre del SERVICIO del
 * compose de `rentas`, que en el cluster no existe. Medido en `stg` el 2026-09-14 sobre
 * `deployment/kamayuk-caja-web`: no hay ningun `Service` llamado `rentas`, y el de ese sistema es
 * `kamayuk-rentas-web`, en SU namespace. La conciliacion habria muerto en la resolucion del nombre,
 * antes de autenticar; y el publicador, que entonces no estaba desplegado, habria gastado sus
 * intentos contra la nada. Es el punto 1 de C-17 —`postgres:5432` en vez del motor de la
 * plataforma— repetido en la otra arista, y por eso la guarda de `descriptor.test.ts` es la misma
 * para las dos: ningun anfitrion entre sistemas sin punto.
 *
 * `kamayuk-rentas-web` es lo que `despliegueDelPerfil(e, "web", true)` de `rentas` publica, igual
 * que `kamayuk-identidad-web` en `variablesDelConsumidorDeIdentidad`. Al puerto 80 del `Service`,
 * que es el que reparte al 8080 del pod —el que la regla de egreso abre—, y con la raiz ENTERA: el
 * `Api.RAIZ` de `rentas` es `/rentas/api/v1`.
 */
function origenesDeLosPagos(e: EntornoDelDescriptor): VariableDeEntorno {
  return {
    name: "KAMAYUK_CAJA_ORIGENES",
    value: `{rentas: 'http://kamayuk-rentas-web.${e.namespaceDe("rentas")}/rentas/api/v1'}`,
  };
}

/**
 * Un `Deployment` del artefacto en un perfil, y su `Service` si atiende HTTP.
 *
 * Son DOS desde #79: `web`, que atiende la API, y `publicador`, que saca el buzon de pagos. Lo que
 * cambia con `atiendeHttp` no es un adorno, es lo que cada proceso ES:
 *
 *   - **Puertos, `Service` y sondas, solo si atiende.** El publicador no abre puerto —su perfil lleva
 *     `web-application-type: none`—, asi que no hay `/actuator/health` que pedirle, y una sonda
 *     `exec` no tendria que preguntar: lo mismo que el `CronJob` y los `Job` de este archivo, que
 *     tampoco llevan ninguna. Lo que Kubernetes SI ve de el es que el proceso muera, y lo recrea.
 *     Lo que no ve es un publicador colgado; eso queda escrito como hueco en el PR de #79, no
 *     tapado con una sonda que mediria otra cosa.
 *   - **El emisor y su JWKS, solo si atiende.** Son de `spring.security.oauth2.resourceserver`, que
 *     vive en el bloque `web` del `application.yaml`: un proceso sin peticiones no valida tokens.
 *     El token que el publicador PIDE sale de `KAMAYUK_CAJA_IDENTIDAD_TOKEN`, que va en los dos.
 *   - **La prioridad.** `servicio` para quien atiende a la ventanilla y `lote` para quien no: bajo
 *     presion de memoria, antes se desaloja al publicador —el buzon espera, es para eso— que a la
 *     API con la que se cobra.
 *
 * `maxSurge: 0` vale doble en el publicador: ademas del nodo sin holgura, es lo que impide que el
 * pod viejo y el nuevo saquen el mismo buzon a la vez durante un despliegue.
 */
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
            priorityClassName: e.prioridadDe(atiendeHttp ? "servicio" : "lote"),
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
                  ...(atiendeHttp
                    ? [
                        // Sin el emisor la aplicacion se niega a arrancar, y es deliberado: un
                        // backend que atiende sin poder validar un token responde a la sonda, se
                        // declara sano y no atiende a nadie (ADR-0005).
                        { name: "KAMAYUK_OIDC_EMISOR", value: e.plataforma.emisor },
                        // El JWKS por la red INTERNA, cruzando el namespace de la plataforma
                        // (C-14). Hasta aqui este descriptor apuntaba las dos al nombre publico:
                        // el backend habria salido al ingreso para volver a entrar, y con la
                        // politica de egreso declarada —que nombra el pod de identidad, no
                        // internet— no habria salido en absoluto. Todo token invalido, por un
                        // motivo que no se parece a su causa.
                        { name: "KAMAYUK_OIDC_JWKS", value: e.plataforma.jwks },
                      ]
                    : []),
                  // Y el punto de EMISION, tambien por la red interna y por lo mismo (#21 AC-2).
                  // El publicador del buzon corre sin usuario delante —lo despierta un reloj, no
                  // una peticion—, asi que no tiene ningun `Authorization` del que tirar: pide el
                  // suyo con `client_credentials`.
                  { name: "KAMAYUK_CAJA_IDENTIDAD_TOKEN", value: e.plataforma.token },
                  // Con QUE cliente lo pide: uno por municipalidad, porque la cuenta de servicio
                  // de ese cliente es la que lleva `municipalidad_id` y ADR-0028 §2 dice que «no
                  // hay un proceso con permiso sobre todas». El nombre lo fija
                  // `clienteDeServicio()` de `infrastructure`, y su guarda `identidad-de-servicio`
                  // compara esta cadena con la suya: dos sitios que no pueden discrepar en
                  // silencio.
                  {
                    name: "KAMAYUK_CAJA_IDENTIDAD_CLIENTE",
                    value: `kamayuk-${SISTEMA}-servicio-${e.implantacion.ubigeo}`,
                  },
                  // Y la CLAVE de ese cliente. Es lo unico de los tres que es un secreto, y por
                  // eso es lo unico que sale de un `secretKeyRef`.
                  {
                    name: "KAMAYUK_CAJA_CREDENCIAL",
                    valueFrom: {
                      secretKeyRef: { name: e.secretoDe("rentas"), key: "clave" },
                    },
                  },
                  // A donde se le entrega el evento de cada pago (ADR-0026 §3), y de donde lee la
                  // conciliacion el perfil `web`. Ver `origenesDeLosPagos`: hasta #79 era un
                  // nombre de compose.
                  origenesDeLosPagos(e),
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
                // Los mismos `limits` para los dos y `requests` mas bajos para el que no atiende,
                // que es el reparto de `RECURSOS_DE_ARRANQUE` y el que ya llevan el `CronJob` y los
                // dos `Job` de este descriptor, que corren ESTE MISMO jar. El `request` es lo que
                // el planificador reserva y bloquea: reservarle a un proceso de fondo lo mismo que
                // a la ventanilla es quitarle sitio a la ventanilla en un nodo que va justo
                // (`capacidad.ts`, issue #252).
                resources: atiendeHttp ? RECURSOS : RECURSOS_DE_ARRANQUE,
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
 * La interfaz de ventanilla: su `ConfigMap`, su `Deployment` y su `Service` (#16, #17; #74).
 *
 * ## Que corre aqui, y que NO
 *
 * Un `nginx:1.31.5-alpine` sirviendo el `dist/` de `caja-web`. **Sin una sola variable de entorno,
 * y sin un solo `secretKeyRef`**. Desde #74 la interfaz autentica y lee su API, pero lo hace **el
 * navegador**: lo unico que este proceso necesita saber del ambiente son las senias del emisor, que
 * no son secretas —el cliente es publico y su URL la ve cualquiera que abra el navegador— y viajan
 * en el `ConfigMap`. Un `Secret` montado aqui seria una credencial regalada a un proceso que no la
 * usa.
 *
 * ## El `ConfigMap` lleva `configuracion.js`, y ya no el `nginx.conf` (#74)
 *
 * Hasta #74 este `ConfigMap` era una copia byte a byte de `frontend/nginx.conf`, montada sobre el
 * `default.conf` de la imagen. Era una segunda fuente de la misma configuracion, y `rentas` nunca la
 * tuvo: su `nginx.conf` va dentro de la imagen, y lo que el ambiente cambia —el emisor— va en un
 * guion que se sirve. La interfaz de `caja` se rehizo con la forma de `rentas`, y su despliegue
 * tambien: el `nginx.conf` es el de la imagen, y aqui se monta `configuracion.js`.
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
 * ## Las sondas van a `/index.html`, por su nombre
 *
 * Y no a `/`, que era lo de antes de #74: con el `try_files` de `nginx.conf`, `/` contesta aunque
 * el `dist/` no se hubiera copiado. Pedir el archivo **por su nombre** es lo unico que distingue
 * «nginx levantado» de «nginx levantado sobre el `dist/` que se copio» — el mismo argumento del
 * `HEALTHCHECK` de la imagen.
 */
function despliegueDeLaInterfaz(e: EntornoDelDescriptor): Manifiesto[] {
  const etiquetas = { ...e.etiquetas, componente: COMPONENTE_DE_LA_INTERFAZ };
  const configuracion = `${NOMBRE_DE_LA_INTERFAZ}-configuracion`;
  return [
    {
      apiVersion: "v1",
      kind: "ConfigMap",
      metadata: { name: configuracion, namespace: e.namespace, labels: etiquetas },
      data: {
        "configuracion.js": `window.__KAMAYUK_CAJA__ = ${JSON.stringify(senasDelAmbiente(e), null, 2)};\n`,
      },
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
                  httpGet: { path: "/index.html", port: 8080 },
                  periodSeconds: 10,
                },
                livenessProbe: {
                  timeoutSeconds: 3,
                  httpGet: { path: "/index.html", port: 8080 },
                  periodSeconds: 20,
                },
                volumeMounts: [
                  {
                    name: "configuracion",
                    mountPath: "/usr/share/nginx/html/configuracion.js",
                    // `subPath`, o el montaje taparia el directorio entero y con el el `dist/`. El
                    // coste: un cambio del `ConfigMap` no llega al pod hasta que se reinicia.
                    subPath: "configuracion.js",
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
 * El ambiente en el que la interfaz de ventanilla **no se ruta** (#44, AC-1).
 *
 * ## La decision, escrita donde se aplica y no solo en un PR
 *
 * Desde #17 el ingreso ruta `PathPrefix(/caja)` a `kamayuk-caja-interfaz` en todos los
 * ambientes, y esa interfaz **no hablaba con su backend**: `frontend/eslint.config.mjs` prohibia
 * `fetch` y `XMLHttpRequest`, `frontend/nginx.conf` no reenviaba a ningun sitio y
 * `frontend/verificaciones/cero-red.mjs` media **0 peticiones de conexion** en un Chromium de
 * verdad. Los datos que dibujaba salian de `frontend/src/datos/`, copiados del artboard: numeros de
 * recibo con forma real, nombres de contribuyentes e importes.
 *
 * ## Y desde #74 esa interfaz ya no existe, y la constante SIGUE AQUI
 *
 * La maqueta V6 se retiro y la interfaz se rehizo con la forma de `rentas`: puerta PKCE, catalogo
 * filtrado por lo que la sesion puede abrir y ni una cifra de ejemplo —cada hoja dice por que no
 * tiene dato—. **Y la ruta de `prod` no vuelve todavia**, a proposito: ADR-0040 fija que se retira
 * **la ultima**, solo cuando la pantalla autentique y hable con su backend medido en `stg` con un
 * login de verdad. Esa es la fila C5 de #74, y borrar esta constante antes reproduce el dano que la
 * decision original describe.
 *
 * Cada mitad esta decidida y argumentada por separado (ADR-0010, #17). Lo que nadie habia
 * decidido es **que las dos ocurran a la vez**: servida en `https://<dominio>/caja`, con el
 * escudo de la entidad y sin pedir credenciales, esa pantalla no se distingue del sistema.
 *
 * Las tres salidas defendibles, con su coste:
 *
 *   1. **No desplegarla hasta que tenga identidad.** Coste: se pierde poder verla en cualquier
 *      sitio que no sea el puesto de quien la escribe, y con ella la unica forma de que alguien
 *      la juzgue antes de conectarla.
 *   2. **`stg` si, `prod` no la ruta.** Coste: hay que decidir dos veces —hoy y el dia que haya
 *      identidad—, y el descriptor deja de ser el mismo para los dos ambientes.
 *   3. **Los dos, haciendola inconfundible** (banda permanente, toast honestos, sesion sin
 *      nombre). Coste: eso no evita el dano de «un tercero desde fuera ve la maqueta de la
 *      recaudacion municipal», porque el dominio es el mismo y el escudo tambien.
 *
 * **Se elige la (2), y ademas se hace la (3).** El motivo de la (2) es que el primer dano —una
 * cifra plausible y falsa copiada a un informe— **no lo evita ninguna banda si el dominio es el
 * de produccion**. El motivo de hacer tambien la (3) es que no depende del ambiente: una
 * pantalla que dice «la cuota ya esta descontada de la cuenta corriente» sin haber hablado con
 * nadie afirma un hecho falso sobre el dinero de un contribuyente, y eso no mejora por estar en
 * `stg`. La (3) vive en `frontend/src/marco/maqueta.ts`.
 *
 * Es ademas la mas barata de revertir: el dia que haya identidad, `prod` vuelve a rutar
 * borrando esta constante y su uso, y la banda y los toast se retiran con la prueba que los fija
 * en rojo delante.
 *
 * ## Lo que esto NO hace
 *
 * **No retira el `Deployment` ni el `Service`.** La imagen se sigue construyendo y publicando
 * —`publicar-imagenes.yml` publica las tres sin filtro `paths:`—, el pod sigue arrancando en
 * `prod` y sus sondas siguen diciendo si el artefacto esta sano. Lo unico que desaparece alli es
 * **la ruta publica**: nadie de fuera del clúster llega a ella. Retirar el despliegue seria dejar
 * de ejercitar en `prod` justo lo que hay que tener listo para el dia que se conecte.
 *
 * ## Por que este archivo ramifica por el ambiente, que es lo que no suele hacer
 *
 * `EntornoDelDescriptor.ambiente` lleva escrito «un descriptor **no** ramifica por esto: recibe
 * lo que cambia», y es una buena regla: lo que cambia entre ambientes —el dominio, el
 * namespace, la etiqueta de la imagen, a quien se avisa— entra como dato, y asi los dos
 * ambientes se componen con el mismo codigo.
 *
 * Aqui no se puede cumplir, y conviene decir por que en vez de disimularlo. Lo que cambia no es
 * un valor: es **si un manifiesto existe o no**, y el tipo no tiene ningun campo con el que
 * `infrastructure` pueda decirlo —anadirselo es cambiar el repositorio hermano, que este issue
 * declara fuera—. La asimetria queda entonces escrita aqui, con su motivo, para que no se lea
 * como un descuido; y `verificaciones/descriptor.test.ts` la fija **por los dos lados**, porque
 * una sola de las dos afirmaciones no separa las hipotesis: un descriptor que no declarara nunca
 * la ruta de la interfaz pasaria «en prod no esta» igual de bien.
 */
const AMBIENTE_SIN_INTERFAZ = "prod";

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
 * **Salida**: DNS y nada mas. Y hay que decir lo que eso significa hoy: **este nginx no resuelve
 * ni un nombre** — `frontend/nginx.conf` no tiene ningun reenvio ni ningun `resolver`—, asi que la
 * regla de DNS es el suelo comun de todo pod del clúster y no una necesidad medida de este. Desde
 * #74 la interfaz SI habla con su API, pero desde el navegador y por el ingreso: este pod no. Lo que **no** se declara es lo que
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

  /**
   * TRES piezas desde #79: la API (`web`), el publicador del buzon de pagos (`publicador`) y la
   * interfaz de ventanilla.
   *
   * El publicador es un `Deployment` y no un `CronJob`, al reves que el consumidor de `identidad`,
   * y la diferencia es de que proceso se trata. El consumidor es un `ApplicationRunner` que hace
   * una pasada y TERMINA; el publicador es un `@Scheduled` que saca el buzon cada pocos segundos
   * —`kamayuk.caja.entrega.intervalo`, `PT10S`— y cuya espera es la que la ventanilla le promete al
   * sistema de origen. Un `CronJob` no baja de un minuto y arrancaria una JVM por vuelta.
   *
   * Y va en SU perfil y no en `batch`, que es donde estaba: ver `PublicadorDelBuzon` en el backend.
   * `batch` termina —y el `CronJob` del consumidor depende de que termine—, asi que un `Deployment`
   * en `batch` es el `CrashLoopBackOff` que la guarda C-17 §5 de `infrastructure` existe para ver.
   */
  despliegue: (e) => [
    ...despliegueDelPerfil(e, "web", true),
    ...despliegueDelPerfil(e, PERFIL_DEL_PUBLICADOR, false),
    ...despliegueDeLaInterfaz(e),
  ],

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
          // `6` y no `3`, y es `infrastructure`#65. Son los reintentos que este `Job` aguanta
          // esperando a que `identidad` implante su municipalidad, y de eso depende que su copia
          // local nazca poblada en vez de vacia.
          //
          // Medido en `infrastructure/infra/verificaciones/orden-de-implantacion.ts`: con el
          // retroceso exponencial de Kubernetes —10 s, 20 s, 40 s…, con tope de 360 s por intento—
          // `3` da **70 s** y `6` da **630 s**, contra el `MARGEN_MINIMO_SEGUNDOS = 600` que ese
          // archivo declara. Las dos cifras estan congeladas en su prueba, asi que no son una
          // estimacion. En un ambiente de cero 70 s no alcanzan: `identidad` tiene que esperar al
          // motor (hasta 120 s de `espera-al-motor`), migrar su esquema e implantar su municipalidad
          // antes de que su buzon publique nada.
          //
          // Y NO se arregla solo: un `Job` que agota su limite no reintenta nunca, y su nombre lleva
          // el `sha`, asi que `pulumi up` tampoco lo recrea — el ambiente se queda atascado hasta
          // que alguien lo borra a mano. Es el atasco de #44, y su cuarta repeticion fue
          // `infrastructure`#69.
          backoffLimit: 6,
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
   * Sus procesos por lotes con ventana: **uno**, el consumidor del buzon de `identidad`
   * (ADR-0039, etapa 4).
   *
   * **El publicador de pagos no esta aqui, y desde #79 tampoco «sigue sin desplegar».** Este
   * parrafo decia que era «un `@Scheduled` sin `@EnableScheduling` (P6 §4.4)», y las dos mitades
   * eran falsas a la vez: `spring-modulith-starter-core` trae `MomentsAutoConfiguration`, que declara
   * `@EnableScheduling` en todos los perfiles —medido en `ArranqueDeLaAplicacionTest`—, asi que el
   * publicador SI se planificaba… dentro de este `CronJob` y del Job de implantacion, los segundos
   * que viven, sin `KAMAYUK_CAJA_ORIGENES` ni credencial: al menos una vuelta contra `rentas:8080`
   * cada cinco minutos, y por el codigo un intento gastado por pago pendiente en cada una (no medido
   * en `stg`, donde no habia pagos). Desde #79 corre en su propio perfil y en su propio `Deployment`
   * —ver `despliegue`—, y aqui ya no se planifica.
   *
   * ## Que corre, y que NO toca
   *
   * `CorrerElConsumidorDeIdentidad` —un `ApplicationRunner` del perfil `batch`— lee
   * `GET /eventos/pendientes` del buzon de `identidad`, aplica cada evento a la copia local de
   * usuarios, grupos, miembros y permisos, y acusa lo aplicado. Corre **fuera del camino del
   * cobro**: `CajaController` no inyecta ningun puerto hacia otro sistema, y la ventanilla sigue
   * cobrando con `identidad` apagado, con la copia que tenga. Es lo que conserva la propiedad por
   * la que este sistema existe —«no le pregunta nada a nadie para cobrar»— y el motivo por el que
   * ADR-0039 descarto que cada sistema pidiera la autorizacion por HTTP.
   *
   * ## La ventana, y lo que cuesta
   *
   * Cada cinco minutos: es la ventana de inconsistencia de la copia local, la que ADR-0039 §«Lo
   * que cuesta» punto 2 exige que este medida y escrita. Un permiso retirado en `identidad` sigue
   * valiendo aqui hasta cinco minutos, y eso se sabe. `concurrencyPolicy: Forbid`, porque dos
   * consumidores a la vez sobre la misma copia se pisarian en el acuse; `backoffLimit: 1`, porque
   * un fallo transitorio se arregla solo y la vuelta siguiente llega en cinco minutos —reintentar
   * seis veces en ese hueco es pedirle seis tokens al emisor por lo mismo—.
   *
   * ## Los dos plazos, y por que un job colgado no congela todas las vueltas siguientes (#116)
   *
   * Hasta #116 este `CronJob` no llevaba ni `activeDeadlineSeconds` ni `startingDeadlineSeconds`:
   * un job colgado —un HTTP a `identidad` que no vuelve, o una fila bloqueada en la base— se
   * quedaba corriendo, y con `concurrencyPolicy: Forbid` eso le impide a todas las corridas
   * siguientes empezar, sin que nada lo avise.
   *
   * `activeDeadlineSeconds: 240` NO es un margen que «sobre» frente a lo que tarda una corrida:
   * **una corrida sana con mucho atraso puede superarlo y morir a medias**, y eso es a proposito,
   * no un accidente que este numero tenga que evitar. `CorrerElConsumidorDeIdentidad.VUELTAS_MAXIMAS`
   * topa una corrida en 50 vueltas, `ConsumirEventosDeIdentidad.POR_VUELTA` pide hasta 200 eventos
   * por vuelta, y cada evento se aplica en su propia transaccion `REQUIRES_NEW`
   * (`AplicarUnEventoDeIdentidad.aplicar`): hasta 10 000 transacciones pequenas en el peor
   * backlog, y con eso 240 s puede no bastar para vaciarlo entero. Una peticion HTTP que de verdad
   * se cuelga es mas barata de acotar: los plazos de `ClienteHttpDelBuzonDeIdentidad` —5 s de
   * conexion y 30 s de lectura— hacen que lance su excepcion en unos 35 s como mucho, y esa
   * excepcion termina la corrida entera ahi mismo —no hay reintento por vuelta dentro del proceso;
   * `backoffLimit: 1` es del `Job`, que arranca un pod nuevo, no del cliente HTTP—. Lo que ningun
   * timeout de aplicacion cubre —ni el HTTP, ni el tope de vueltas— es una fila bloqueada en la
   * base, la otra mitad del hallazgo que abrio este issue: para eso `activeDeadlineSeconds` es el
   * UNICO limite que hay.
   *
   * **Y que Kubernetes mate el pod a medio vaciar el backlog es seguro, no solo tolerable.** Cada
   * evento se confirma en su propia transaccion ANTES del acuse al emisor —el javadoc de
   * `ConsumirEventosDeIdentidad` lo dice explicito: el acuse va despues de TODAS las transacciones
   * de la pagina, una vez por vuelta—, asi que un pod matado a media vuelta deja lo ya aplicado
   * COMMITEADO y sin acusar: el emisor lo vuelve a servir, y `AplicarUnEventoDeIdentidad.aplicar`
   * devuelve `YA_APLICADO` sin volver a escribir nada —lo decide el `INSERT … ON CONFLICT DO
   * NOTHING` sobre `identidad_evento_aplicado`, que es barato—. La corrida siguiente retoma donde
   * el emisor todavia ve pendiente: nada se pierde y nada se aplica dos veces. Y si este patron se
   * repite lo bastante como para que un evento quede sin resolver mas de
   * `ConsumirEventosDeIdentidad.MINUTOS_QUE_SE_ADMITEN` (15 min), la alerta de pospuestos que ya
   * existe —`avisarDeLosPospuestosQueLlevanDemasiado`— es quien avisa al responsable; este plazo no
   * tiene que resolver ese caso por su cuenta, solo no impedir que la siguiente corrida arranque.
   *
   * Y 240 s queda por DEBAJO del periodo de cinco minutos (300 s) a proposito, y no en cualquier
   * punto por debajo: ver `PLAZO_ACTIVO_DEL_CONSUMIDOR_SEGUNDOS` y
   * `PLAZO_DE_ARRANQUE_DEL_CONSUMIDOR_SEGUNDOS`. La propiedad que de verdad hace falta es que su
   * suma NO SUPERE el periodo —la aserción de mas arriba lo vigila con `<=`, no con `===`, porque
   * mas margen nunca es un fallo— y hoy da exactamente 300: un job que arranca en el ultimo
   * instante que el plazo de arranque admite y corre hasta su propio limite termina justo cuando
   * toca el siguiente tick. Los dos campos no estan en el `CronJob` de `@kamayuk/infra-contrato`
   * todavia —ver `CronJobConPlazos`—.
   *
   * ## Lo que este CronJob NO es
   *
   * No nace con `suspend: true`. Hasta #21 el ingestor de `rentas` nacia suspendido por falta de
   * identidad de servicio y dos guardas lo DEMANDABAN; lo que sujeta a este es una guarda que se
   * pone roja —la de `identidad-de-servicio` de `infrastructure`, que exige la cuenta
   * `{"sistema":"caja","llamaA":"identidad"}` en cada municipalidad— y no un interruptor que se lee
   * igual que «esto todavia no toca».
   */
  lotes(e): Manifiesto[] {
    const nombre = `kamayuk-${SISTEMA}-consumidor-de-identidad`;
    const etiquetas = { ...e.etiquetas, componente: SISTEMA };
    const consumidor: CronJobConPlazos = {
      apiVersion: "batch/v1",
      kind: "CronJob",
      metadata: { name: nombre, namespace: e.namespace, labels: etiquetas },
      spec: {
        schedule: VENTANA_DEL_CONSUMIDOR,
        // Ver "Los dos plazos" arriba: 60 + 240 = 300 = el periodo, a proposito.
        startingDeadlineSeconds: PLAZO_DE_ARRANQUE_DEL_CONSUMIDOR_SEGUNDOS,
        concurrencyPolicy: "Forbid",
        successfulJobsHistoryLimit: 3,
        failedJobsHistoryLimit: 3,
        jobTemplate: {
          spec: {
            backoffLimit: 1,
            activeDeadlineSeconds: PLAZO_ACTIVO_DEL_CONSUMIDOR_SEGUNDOS,
            template: {
              metadata: { labels: { ...etiquetas, app: nombre } },
              spec: {
                restartPolicy: "Never",
                priorityClassName: e.prioridadDe("lote"),
                containers: [
                  {
                    name: "consumidor",
                    // La MISMA imagen que la aplicacion, con el perfil `batch` (ADR-0003).
                    image: e.imagenDe(SISTEMA),
                    env: [
                      { name: "SPRING_PROFILES_ACTIVE", value: "batch" },
                      ...credencialesDeLaAplicacion(e),
                      // Las dos de ADR-0026 §4: van en el bloque comun y las necesita todo
                      // proceso. Y aqui ademas es quien recibe el aviso de un evento apartado.
                      ...operacionDeLaCaja(e),
                      ...variablesDelConsumidorDeIdentidad(e),
                    ],
                    resources: RECURSOS_DE_ARRANQUE,
                    securityContext: SEGURIDAD,
                  },
                ],
              },
            },
          },
        },
      },
    };
    return [consumidor];
  },

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
   * ## Que quita el prefijo, y por que este middleware se queda
   *
   * Las tres piezas estan medidas contra el nginx real de `nginx:1.31.4-alpine` con el
   * `nginx.conf` de este repositorio y el `dist/` que `yarn build` produce:
   *
   *   1. `frontend/vite.config.ts` declara `base: "/caja/"` desde #37, asi que el `index.html`
   *      pide sus recursos **con el prefijo dentro**: `/caja/assets/index-<huella>.js`. Sin eso,
   *      el navegador los pediria a la raiz del dominio, que `PathPrefix(/caja)` ya no casa y que
   *      este descriptor **no puede reclamar** —es la prohibicion (a) de `infrastructure`—.
   *   2. Este middleware quita `/caja`, de modo que a nginx le llega `/assets/index-<huella>.js`.
   *   3. Y desde #42 `frontend/nginx.conf` sirve **las dos entradas**: la raiz —lo que llega con
   *      el prefijo ya quitado— y `/caja/`, que reescribe a la raiz con un `rewrite ... last`. Sin
   *      esa segunda, quien no tenga un ingreso delante —`despliegue/compose.yaml`, que publica el
   *      puerto del contenedor— recibe `200 text/html` de 1 383 B donde pidio un modulo: el
   *      `index.html` colandose por el `try_files`, y la pantalla en blanco sin un solo error.
   *      **Otro 200 que miente**, el mismo modo de fallo que la precedencia de arriba.
   *
   * O sea que con #42 este middleware pasa a ser **redundante en efecto**: las dos URL acaban en
   * el mismo sitio. Se queda, y por dos motivos que no son inercia. El primero es que la ruta del
   * cluster no cambia ni un byte respecto de lo que #17 midio, que es lo que hace que aquel cambio
   * no pueda regresionar este despliegue. El segundo es que lo que este ingreso decide **no es
   * como sirve nginx sino quien contesta**: su `priority` es lo que manda `/caja/api/v1` al
   * backend, y eso ningun `nginx.conf` lo puede arreglar.
   *
   * La coherencia entre las tres la vigila `descriptor.test.ts`, en los dos sentidos.
   */
  ingreso(e): Manifiesto[] {
    const quitarElPrefijo = `kamayuk-${SISTEMA}-quitar-prefijo`;
    // Ver `AMBIENTE_SIN_INTERFAZ`: en `prod` la ruta de la interfaz **no se declara**, y con
    // ella se va su `Middleware` —un `Middleware` que nadie referencia es una declaracion
    // muerta, y una declaracion muerta es lo que manana alguien vuelve a enganchar sin leer por
    // que estaba—. El `Deployment` y el `Service` de la interfaz siguen en su sitio: el pod
    // arranca y sus sondas contestan; lo que no existe alli es la ruta publica.
    const laRutaDeLaInterfaz = e.ambiente !== AMBIENTE_SIN_INTERFAZ;
    return [
      ...(laRutaDeLaInterfaz
        ? [
            {
              apiVersion: "traefik.io/v1alpha1" as const,
              kind: "Middleware" as const,
              metadata: { name: quitarElPrefijo, namespace: e.namespace, labels: e.etiquetas },
              // Traefik reenvia lo que queda y anade `X-Forwarded-Prefix`, asi que quien quiera
              // reconstruir la URL publica puede; nginx no lo necesita para servir un archivo.
              spec: { stripPrefix: { prefixes: [`/${SISTEMA}`] } },
            },
          ]
        : []),
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
            ...(laRutaDeLaInterfaz
              ? [
                  {
                    match: `Host(\`${e.dominio}\`) && PathPrefix(\`/${SISTEMA}\`)`,
                    kind: "Rule" as const,
                    priority: PRIORIDAD_DE_LA_INTERFAZ,
                    services: [{ name: NOMBRE_DE_LA_INTERFAZ, port: 80 }],
                    middlewares: [{ name: quitarElPrefijo }],
                  },
                ]
              : []),
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
   * - **`rentas`**: el `PagoRegistrado` que publica al cobrar, para que rentas impute (ADR-0026 §3).
   *   Lo manda el `Deployment` del `publicador` (#79), y la conciliacion la lee el de `web`: la regla
   *   selecciona por `componente: caja`, que llevan los dos, y no por `perfil`.
   * - **`identidad`** (el sistema, no Keycloak): el consumidor del buzon de la autorizacion, que
   *   corre en el `CronJob` del perfil `batch` y nunca en el camino del cobro (ADR-0039, etapa 4).
   *   Se selecciona por `componente: identidad-sistema`, porque `componente: identidad` es Keycloak
   *   en la plataforma y con ese nombre el grafo de egreso lo descartaria como infraestructura.
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
            // identidad, EL SISTEMA: el buzon de la autorizacion, que el consumidor lee cada
            // cinco minutos (ADR-0039, etapa 4). En SU namespace y por SU etiqueta,
            // `identidad-sistema`: `componente: identidad` en `kamayuk-<amb>` es Keycloak, y es la
            // regla de arriba. Son dos aristas distintas a dos destinos distintos que comparten
            // la palabra, y por eso ninguna de las dos se escribe con una variable.
            {
              to: [
                {
                  namespaceSelector: {
                    matchLabels: { "kubernetes.io/metadata.name": e.namespaceDe("identidad") },
                  },
                  podSelector: { matchLabels: { componente: "identidad-sistema" } },
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
    {
      // El destino va en el NOMBRE, y de ahi lo deriva `credencialesDeServicio()` de
      // `infrastructure`: el cliente confidencial se pide por PAR (origen, destino), y declarar
      // «a quien se llama» aparte seria el sitio que se quedaria viejo.
      nombre: e.secretoDe("rentas"),
      clave: "clave",
      // `emisor: "keycloak"` es lo que la separa de una clave de PostgreSQL (#21). Su valor NO lo
      // genera `bootstrap-secretos.sh` por su cuenta: es la clave del cliente confidencial
      // `kamayuk-caja-servicio-<ubigeo>`, que el Job de identidad le FIJA a Keycloak, y llega aqui
      // como espejo del `Secret` de la plataforma. Sin declararlo, «un valor aleatorio con nombre
      // de credencial» y «la credencial con la que se pide un token» son la misma linea del
      // inventario — y la segunda existe, arranca el pod y recibe 401.
      emisor: "keycloak",
      rotacion: "trimestral",
      proposito:
        "pedir el token con el que se le entrega a `rentas` el evento de cada pago (ADR-0026 §3)." +
        " No es el token: es la clave del cliente confidencial con la que se pide",
    },
    {
      // La SEGUNDA credencial de servicio: el mismo cliente confidencial —uno por municipalidad—
      // y la clave del par (caja, identidad). `credencialesDeServicio()` de `infrastructure`
      // deriva `llamaA` del nombre, y su guarda exige que cada municipalidad declare la cuenta
      // `{"sistema":"caja","llamaA":"identidad"}` en su bloque `servicios`: sin ella, esto es un
      // 401 en la primera vuelta del consumidor, y la copia local se queda como esta.
      nombre: e.secretoDe("identidad"),
      clave: "clave",
      emisor: "keycloak",
      rotacion: "trimestral",
      proposito:
        "pedir el token con el que el consumidor del perfil `batch` lee y acusa el buzon de" +
        " `identidad` (ADR-0039, etapa 4). No es el token: es la clave con la que se pide",
    },
  ],
};

export default caja;
