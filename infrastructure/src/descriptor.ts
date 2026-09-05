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
 * ## Todavia no hay codigo de negocio
 *
 * Los `Deployment` apuntan a imagenes que **aun no existen**. Es correcto en esta etapa: describe
 * como se desplegaria este sistema, y no se despliega nada.
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
} from "@sgtm/infra-contrato";

const SISTEMA = "caja";

/** La imagen del migrador: el otro objetivo del mismo `Dockerfile` (C-14, punto 1). */
const MIGRADOR = `${SISTEMA}-migrador`;

/**
 * Su base, en el motor de la plataforma. Una por sistema (ADR-0029, ADR-0032).
 *
 * **El anfitrion lo pide, no lo escribe** (C-17, punto 1). Hasta aqui esta linea decia
 * `jdbc:postgresql://postgres:5432/...`, y en Kubernetes **no hay ningun `Service` llamado
 * `postgres`**: ese nombre viene del `compose.yaml` local. El servicio real es
 * `sgtm-<ambiente>-postgres` y vive en el namespace de la PLATAFORMA, asi que ni siquiera un
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

/** La conexion de la aplicacion: `sgtm_app` y solo `sgtm_app` (ARQ-03 §4). */
function credencialesDeLaAplicacion(e: EntornoDelDescriptor): VariableDeEntorno[] {
  return [
    { name: "SGTM_DB_URL", value: urlDeLaBase(e) },
    { name: "SGTM_DB_USUARIO", value: "sgtm_app" },
    {
      name: "SGTM_DB_CLAVE",
      valueFrom: { secretKeyRef: { name: e.secretoDe("app"), key: "clave" } },
    },
  ];
}

/**
 * El contenedor del migrador: **la imagen del migrador, no la de la aplicacion** (C-14, punto 1).
 *
 * Lee `SGTM_DB_OWNER_USUARIO` y `SGTM_DB_OWNER_CLAVE` —lo dice el `main` de
 * `kamayuk.caja.esquema.Migrador`, que rechaza argumentos a proposito para que una
 * clave no quede en el historial del proceso—, y **no** `SGTM_DB_USUARIO`, que es lo que este
 * descriptor ponia hasta C-14 sobre la imagen de la aplicacion: aquello arrancaba el proceso web
 * con las credenciales de `sgtm_owner` y con `spring.flyway.enabled: false`, o sea DDL al alcance
 * de un servidor HTTP y ninguna migracion aplicada.
 */
function contenedorDelMigrador(e: EntornoDelDescriptor): Contenedor {
  return {
    name: "migrador",
    image: e.imagenDe(MIGRADOR),
    env: [
      { name: "SGTM_DB_URL", value: urlDeLaBase(e) },
      // Migrar es lo unico que corre como `sgtm_owner`: es el unico rol con DDL.
      { name: "SGTM_DB_OWNER_USUARIO", value: "sgtm_owner" },
      {
        name: "SGTM_DB_OWNER_CLAVE",
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
                  { name: "SGTM_DB_URL", value: urlDeLaBase(e) },
                  { name: "SGTM_DB_USUARIO", value: "sgtm_app" },
                  {
                    name: "SGTM_DB_CLAVE",
                    valueFrom: { secretKeyRef: { name: e.secretoDe("app"), key: "clave" } },
                  },
                  // Sin el emisor la aplicacion se niega a arrancar, y es deliberado: un backend
                  // que atiende sin poder validar un token responde a la sonda, se declara sano y
                  // no atiende a nadie (ADR-0005).
                  { name: "SGTM_OIDC_EMISOR", value: e.plataforma.emisor },
                  // El JWKS por la red INTERNA, cruzando el namespace de la plataforma (C-14).
                  // Hasta aqui este descriptor apuntaba las dos al nombre publico: el backend
                  // habria salido al ingreso para volver a entrar, y con la politica de egreso
                  // declarada —que nombra el pod de identidad, no internet— no habria salido en
                  // absoluto. Todo token invalido, por un motivo que no se parece a su causa.
                  { name: "SGTM_OIDC_JWKS", value: e.plataforma.jwks },
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

export const caja: DescriptorDeSistema = {
  sistema: SISTEMA,
  prefijo: SISTEMA,
  // DOS imagenes, y son dos objetivos del mismo `Dockerfile` (C-14, punto 1): las
  // credenciales de `sgtm_owner` existen durante la migracion y desaparecen con ella.
  imagenes: [SISTEMA, MIGRADOR],

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
        { nombre: "sgtm_owner", sobre: [SISTEMA], privilegios: ["ALL"], superusuario: false },
        {
          nombre: "sgtm_app",
          sobre: [SISTEMA],
          privilegios: ["SELECT", "INSERT", "UPDATE"],
          superusuario: false,
        },
        { nombre: "sgtm_readonly", sobre: [SISTEMA], privilegios: ["SELECT"], superusuario: false },
      ],
    };
  },

  despliegue: (e) => [...despliegueDelPerfil(e, "web", true)],

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

  /** Sus rutas, **bajo su prefijo**. Reclamar el de otro no falla: se lo queda. */
  ingreso(e): Manifiesto[] {
    return [
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
              match: `Host(\`${e.dominio}\`) && PathPrefix(\`/${SISTEMA}\`)`,
              kind: "Rule",
              services: [{ name: `kamayuk-${SISTEMA}-web`, port: 80 }],
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
            // ── DNS, y va primero porque todo lo demas depende de el ──────────────────
            //
            // Sin esta regla las cuatro que siguen NO SIRVEN DE NADA. Una politica de egreso
            // convierte a los pods que selecciona en «solo lo declarado», y `postgres`,
            // `identidad` y los sistemas hermanos se nombran por su `Service`: resolver ese
            // nombre es una consulta a CoreDNS, que vive en `kube-system`, y ninguna de las
            // reglas de abajo la permite. El sintoma medido es `UnknownHostException`, y es
            // **intermitente** —la resolucion se cachea, asi que a veces sale y a veces no—,
            // que es peor que fallar siempre.
            //
            // Con esta regla anadida a mano sobre el clúster, las OCHO tareas de los cuatro
            // sistemas pasaron de `Failed` a `Complete` (C-17, punto 3).
            //
            // Es la misma politica que `Red.ts` le da al namespace de la plataforma desde que
            // existe (`permitir-dns`): lo que fallo aqui no fue la idea, fue que estas politicas
            // se escribieron de cero y esa parte no se copio. Va **en el descriptor** y no en
            // `infrastructure` porque quien decide que pods restringe esta politica es este
            // archivo —`podSelector` es suyo—; lo que si es de `infrastructure` es la guarda que
            // comprueba que ningun sistema se la deje.
            //
            // Sin `podSelector` en el destino, a proposito: lo que se abre es el PUERTO 53 hacia
            // el namespace del sistema, no un pod concreto. Nombrar `k8s-app: kube-dns` ataria
            // esta politica a como etiqueta sus pods una distribucion de Kubernetes.
            {
              to: [
                {
                  namespaceSelector: {
                    matchLabels: { "kubernetes.io/metadata.name": "kube-system" },
                  },
                },
              ],
              ports: [
                { protocol: "UDP", port: 53 },
                // TCP tambien: una respuesta que no cabe en un datagrama se reintenta por TCP,
                // y una politica que solo abriera UDP funcionaria hasta el dia que dejara de
                // hacerlo, por el tamano de una respuesta.
                { protocol: "TCP", port: 53 },
              ],
            },
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
      rol: "sgtm_app",
      rotacion: "trimestral",
      proposito: `la conexion de ${SISTEMA} a su base`,
    },
    {
      nombre: e.secretoDe("owner"),
      clave: "clave",
      rol: "sgtm_owner",
      rotacion: "anual",
      proposito: `migrar la base de ${SISTEMA}; es el unico rol con DDL`,
    },
  ],
};

export default caja;
