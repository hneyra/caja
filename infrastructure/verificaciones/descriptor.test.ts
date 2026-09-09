import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Contenedor, EntornoDelDescriptor, Manifiesto } from "@kamayuk/infra-contrato";
import { caja } from "../src/descriptor";

/**
 * El descriptor de `caja`, verificado sobre lo que devuelve.
 *
 * Esto es lo que corre en la maquina de quien lo escribe y en el CI de este repositorio: **sin
 * Pulumi, sin token y sin cluster**. La auditoria completa —las convenciones de `INF-01` §4 y las
 * cinco prohibiciones— la hace `infrastructure` al componer; aqui se comprueba lo que este
 * repositorio decide y solo el.
 */

const ENTORNO: EntornoDelDescriptor = {
  ambiente: "stg",
  namespace: "kamayuk-caja-stg",
  dominio: "stg.kamayuk.example",
  etiquetas: { "app.kubernetes.io/part-of": "kamayuk", ambiente: "stg" },
  imagenDe: (c) => `ghcr.io/hneyra/kamayuk-${c}:0eee58e43e04b1c2d3f4a5b6c7d8e9f0a1b2c3d4`,
  secretoDe: (c) => `kamayuk-caja-stg-${c}`,
  prioridadDe: (clase) => `kamayuk-stg-prioridad-${clase}`,
  // Del AMBIENTE, no de este sistema (C-7): quien recibe el aviso cuando algo
  // se rompe aqui. `checkInvariants` de `infrastructure` rechaza el relleno.
  operacion: { responsable: "Guardia de plataforma", canal: "guardia@example.pe" },
  // La municipalidad que el AMBIENTE implanta (C-14, punto 4). Los cuatro sistemas implantan la
  // misma, cada uno en su base.
  implantacion: {
    ubigeo: "200105",
    nombre: "Municipalidad Distrital de Catacaos",
    tipo: "DISTRITAL",
    administrador: "administrador",
    nombreDelAdministrador: "Administrador del sistema",
    esDemostracion: true,
    // El `id` de la fila que crea el Job de implantacion. En una base recien creada vale 1.
    municipalidadId: 1,
  },
  namespaceDe: (otro) => `kamayuk-${otro}-stg`,
  // El nombre de un `Job` lleva la version: un `Job` de Kubernetes es INMUTABLE.
  nombreConVersion: (base) => `${base}-0eee58e43e04`,
  plataforma: {
    namespace: "kamayuk-stg",
    // El anfitrion del motor, ya cruzando el namespace (C-17, punto 1). Los cuatro descriptores
    // escribian `postgres:5432` a mano, que es el nombre del `compose.yaml` local: en Kubernetes
    // no existe ningun `Service` que se llame asi.
    motor: "kamayuk-stg-postgres.kamayuk-stg:5432",
    emisor: "https://stg.kamayuk.example/keycloak/realms/sgtm",
    jwks: "http://kamayuk-stg-identidad.kamayuk-stg:8080/keycloak/realms/sgtm/protocol/openid-connect/certs",
    token: "http://kamayuk-stg-identidad.kamayuk-stg:8080/keycloak/realms/sgtm/protocol/openid-connect/token",
  },
};

describe("el descriptor de caja", () => {
  it("declara su base, y SOLO la suya", () => {
    const base = caja.baseDeDatos(ENTORNO);
    expect(base.nombre).toBe("caja");
    for (const rol of base.roles) {
      expect(rol.sobre).toEqual(["caja"]);
      // Un superusuario OMITE RLS aunque haya FORCE (DAT-01 §0, hallazgo 1).
      expect(rol.superusuario).toBe(false);
    }
  });

  it("no fija la etiqueta de ninguna imagen: la pide", () => {
    // La prohibicion (b) de `infrastructure`, comprobada aqui tambien porque es la que sostiene
    // que una liberacion normal NO sea un `pulumi up` (ADR-0011 §5).
    const admisibles = caja.imagenes.map((n) => ENTORNO.imagenDe(n));
    const imagenes = [...caja.despliegue(ENTORNO), ...caja.migracion(ENTORNO)]
      .flatMap((m) =>
        m.kind === "Deployment"
          ? m.spec.template.spec.containers
          : m.kind === "Job"
            ? m.spec.template.spec.containers
            : [],
      )
      .map((c) => c.image);
    expect(imagenes.length).toBeGreaterThan(0);
    for (const i of imagenes) expect(admisibles).toContain(i);
  });

  it("todas sus rutas van bajo su prefijo", () => {
    for (const m of caja.ingreso(ENTORNO)) {
      if (m.kind !== "IngressRoute") continue;
      for (const r of m.spec.routes) {
        for (const encaje of r.match.matchAll(/PathPrefix\(`([^`]*)`\)/g)) {
          expect(encaje[1]).toMatch(/^\/caja(\/|$)/);
        }
      }
    }
  });

  it("no emite ningun Secret, y su inventario no trae valores", () => {
    const todos = [
      ...caja.despliegue(ENTORNO),
      ...caja.migracion(ENTORNO),
      ...caja.ingreso(ENTORNO),
    ];
    expect(todos.some((m) => (m as { kind: string }).kind === "Secret")).toBe(false);
    for (const c of caja.claves(ENTORNO)) {
      for (const campo of ["valor", "value", "data", "stringData", "password"]) {
        expect((c as unknown as Record<string, unknown>)[campo]).toBeUndefined();
      }
    }
  });

  it("todo contenedor declara limites de recursos", () => {
    const contenedores = [...caja.despliegue(ENTORNO), ...caja.migracion(ENTORNO)].flatMap((m) =>
      m.kind === "Deployment"
        ? m.spec.template.spec.containers
        : m.kind === "Job"
          ? m.spec.template.spec.containers
          : [],
    );
    for (const c of contenedores) {
      expect(c.resources.requests.cpu).toBeTruthy();
      expect(c.resources.limits.memory).toBeTruthy();
    }
  });

  it("su egreso es rentas, y solo rentas", () => {
    // Y no es para preguntar: es el `PagoRegistrado` que publica al cobrar, porque la
    // imputacion es de rentas (ADR-0026 §2).
    expect(destinosDeEgreso()).toEqual(["rentas"]);
  });
});

/** Los SISTEMAS a los que este descriptor declara egreso. El motor y la identidad no cuentan. */
function destinosDeEgreso(): string[] {
  const infra = ["postgres", "identidad"];
  return caja
    .egreso(ENTORNO)
    .flatMap((p) => p.spec.egress ?? [])
    .flatMap((r) => r.to ?? [])
    .map((s) => s.podSelector?.matchLabels?.["componente"])
    .filter((c): c is string => c !== undefined && !infra.includes(c))
    .sort();
}

describe("C-14 — que esto se pueda desplegar", () => {
  /**
   * El Job de migracion corre la imagen del MIGRADOR, no la de la aplicacion.
   *
   * Hasta C-14 corria la misma que el `Deployment` con `KAMAYUK_DB_USUARIO=kamayuk_owner` y sin perfil:
   * arrancaba el proceso web con las credenciales del unico rol con DDL, y la aplicacion tiene
   * `spring.flyway.enabled: false` a proposito (ARQ-03 §4). O sea que ese Job **no migraba**.
   */
  it("el Job de migracion corre el migrador, con las variables que el migrador lee", () => {
    const contenedores = contenedoresDe(caja.migracion(ENTORNO));
    expect(contenedores).toHaveLength(1);
    const c = contenedores[0]!;
    expect(c.image).toBe(ENTORNO.imagenDe(`${"caja"}-migrador`));
    expect(valorDe(c, "KAMAYUK_DB_OWNER_USUARIO")).toBe("kamayuk_owner");
    expect(declara(c, "KAMAYUK_DB_OWNER_CLAVE")).toBe(true);
    // La de la APLICACION. El migrador no la lee, y ponerla es lo que hacia que este Job
    // pareciera correcto sin migrar nada.
    expect(declara(c, "KAMAYUK_DB_USUARIO")).toBe(false);
  });

  /**
   * TRES desde #17, y no son tres objetivos del mismo `Dockerfile`.
   *
   * Las dos primeras si lo son (C-14, punto 1). La tercera sale de `frontend/Dockerfile`, con
   * contexto `frontend/`, y no comparte una capa con ellas. El nombre importa mas que el numero:
   * **`caja-interfaz`, nunca `caja-web`**, porque `kamayuk-caja-web` ya es el `Deployment` y el
   * `Service` del backend con el perfil `web` de Spring.
   */
  it("sus tres imagenes, y la de la interfaz no se llama como el backend", () => {
    expect(caja.imagenes).toEqual(["caja", `${"caja"}-migrador`, `${"caja"}-interfaz`]);
    expect(caja.imagenes).not.toContain(`${"caja"}-web`);
  });

  /**
   * El Job de implantacion (C-7 §2.3): la fila de `municipalidad` en SU base.
   *
   * Con el migrador de contenedor de inicializacion: un `Deployment` no sabe esperar a un `Job`,
   * y la salida del monolito —un contenedor con `psql`— no vale aqui, porque un descriptor solo
   * puede nombrar SUS imagenes (prohibicion (b)).
   */
  it("implanta la municipalidad del ambiente, detras del esquema", () => {
    const jobs = caja.implantacion(ENTORNO).filter((m) => m.kind === "Job");
    expect(jobs).toHaveLength(1);
    const job = jobs[0]!;
    expect(job.metadata.name).toContain("0eee58e43e04");
    const pod = job.spec.template.spec;
    expect((pod.initContainers ?? []).map((c) => c.image)).toEqual([
      ENTORNO.imagenDe(`${"caja"}-migrador`),
    ]);
    const c = pod.containers[0]!;
    expect(c.image).toBe(ENTORNO.imagenDe("caja"));
    expect(valorDe(c, "SPRING_PROFILES_ACTIVE")).toBe("batch");
    expect(valorDe(c, "KAMAYUK_IMPLANTACION_UBIGEO")).toBe("200105");
    expect(valorDe(c, "KAMAYUK_IMPLANTACION_ESDEMOSTRACION")).toBe("true");
  });

  /**
   * Un `podSelector` sin `namespaceSelector` selecciona pods **del mismo namespace**, y desde
   * ADR-0031 cada sistema tiene el suyo. Una regla escrita asi no abre nada: el sintoma es
   * trafico denegado con una politica que dice permitirlo.
   */
  it("toda regla de egreso nombra el namespace de su destino", () => {
    const destinos = caja.egreso(ENTORNO)
      .flatMap((p) => p.spec.egress ?? [])
      .flatMap((r) => r.to ?? []);
    expect(destinos.length).toBeGreaterThan(0);
    for (const destino of destinos) {
      expect(destino.namespaceSelector, JSON.stringify(destino)).toBeDefined();
    }
  });
});

/** Los contenedores de una lista de manifiestos, los de inicializacion aparte. */
function contenedoresDe(manifiestos: readonly Manifiesto[]) {
  return manifiestos.flatMap((m) =>
    m.kind === "Deployment"
      ? m.spec.template.spec.containers
      : m.kind === "Job"
        ? m.spec.template.spec.containers
        : m.kind === "CronJob"
          ? m.spec.jobTemplate.spec.template.spec.containers
          : [],
  );
}

function valorDe(c: Contenedor, nombre: string): string | undefined {
  return (c.env ?? []).find((e) => e.name === nombre)?.value;
}

function declara(c: Contenedor, nombre: string): boolean {
  return (c.env ?? []).some((e) => e.name === nombre);
}

describe("C-14 §3 — caja no declara ningun proceso por lotes todavia", () => {
  /**
   * El unico proceso periodico que `caja` tiene escrito es el publicador de su buzon, y es un
   * `@Scheduled` que **no se registra**: en los cuatro backends no hay ni un `@EnableScheduling`
   * (P6 §4.4). Declararle un `CronJob` seria decir que corre algo que no existe como proceso
   * invocable; lo que falta primero es convertirlo en un `ApplicationRunner` del perfil `batch`.
   */
  it("no declara ninguno, y el motivo esta escrito", () => {
    expect(caja.lotes(ENTORNO)).toEqual([]);
  });

  /**
   * Y las dos de ADR-0026 §4 van en el bloque COMUN de su `application.yaml`, asi que las
   * necesita TODO proceso de este sistema. Lo destapo C-14 al extender la guarda de
   * `infrastructure` del `Deployment` a todo pod que corra la imagen de la aplicacion: el Job
   * de implantacion no habria levantado, y el sintoma habria sido un despliegue colgado
   * esperando una municipalidad que nadie implanto.
   */
  it("y la implantacion tambien lleva el responsable y su canal", () => {
    const c = contenedoresDe(caja.implantacion(ENTORNO))[0]!;
    expect(valorDe(c, "KAMAYUK_CAJA_RESPONSABLE")).toBe("Guardia de plataforma");
    expect(valorDe(c, "KAMAYUK_CAJA_CANAL")).toBe("guardia@example.pe");
  });
});

describe("C-17 — que el despliegue pase de verdad", () => {
  /**
   * El anfitrion del motor **se pide**, y este descriptor no escribe ninguno.
   *
   * Es la mutacion que este criterio existe para cazar: hasta C-17 la constante decia
   * `jdbc:postgresql://postgres:5432/...`, y en Kubernetes no hay ningun `Service` llamado
   * `postgres` —ese nombre viene del `compose.yaml` local—. Medido en el clúster:
   * `UnknownHostException` en los ocho Jobs de los cuatro sistemas y en sus `Deployment`.
   */
  it("toda URL de base sale del anfitrion que entrega el entorno", () => {
    const urls = contenedoresDe([
      ...caja.despliegue(ENTORNO),
      ...caja.migracion(ENTORNO),
      ...caja.implantacion(ENTORNO),
      ...caja.lotes(ENTORNO),
    ]).flatMap((c) => (c.env ?? []).map((v) => v.value ?? ""))
      .filter((v) => v.startsWith("jdbc:"));

    expect(urls.length, "ninguna variable lleva una URL de base: ¿se dejo de leer?").toBeGreaterThan(0);
    for (const url of urls) {
      expect(url).toBe(`jdbc:postgresql://${ENTORNO.plataforma.motor}/caja`);
    }
  });

  /**
   * DNS, sin el cual las demas reglas de egreso no sirven de nada.
   *
   * Una politica de egreso convierte a los pods que selecciona en «solo lo declarado», y todo lo
   * que estas reglas nombran —el motor, la identidad, los sistemas hermanos— se alcanza por el
   * nombre de un `Service`. Resolverlo es una consulta a CoreDNS, en `kube-system`. Con la regla
   * anadida a mano sobre el clúster, las ocho tareas de los cuatro sistemas pasaron de `Failed` a
   * `Complete` (C-17, punto 3).
   */
  /**
   * Y **cada** politica de egreso la abre, no «alguna».
   *
   * Hasta #17 habia una sola politica de egreso y bastaba contarla. Con la de la interfaz al lado
   * son dos, y un `toHaveLength(1)` sobre el total no distingue «las dos la tienen» de «una la
   * tiene y la otra no» — que es justo el caso que deja un pod sin resolver un solo nombre, con la
   * politica de al lado en verde.
   */
  it("toda politica de egreso abre DNS hacia kube-system, en UDP y en TCP", () => {
    const politicas = caja.egreso(ENTORNO).filter((p) => p.spec.policyTypes.includes("Egress"));
    expect(politicas.length, "ninguna politica de egreso: ¿se dejo de leer?").toBeGreaterThan(1);

    for (const politica of politicas) {
      const dns = (politica.spec.egress ?? []).filter((r) =>
        (r.to ?? []).some(
          (d) => d.namespaceSelector?.matchLabels?.["kubernetes.io/metadata.name"] === "kube-system",
        ),
      );
      const donde = politica.metadata.name;
      expect(dns, `${donde}: sin DNS ninguna otra regla suya puede resolver un nombre`).toHaveLength(1);
      expect(
        (dns[0]?.ports ?? []).map((p) => `${p.protocol}/${p.port}`).sort(),
        `${donde}: TCP tambien, que una respuesta que no cabe en un datagrama se reintenta por TCP`,
      ).toEqual(["TCP/53", "UDP/53"]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// #17 — el despliegue de la interfaz de ventanilla
// ─────────────────────────────────────────────────────────────────────────────

const NOMBRE_DE_LA_INTERFAZ = "kamayuk-caja-interfaz";
const NOMBRE_DEL_BACKEND = "kamayuk-caja-web";

/** Un archivo del repositorio, por su ruta desde la raiz. */
function delRepositorio(ruta: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${ruta}`, import.meta.url)), "utf8");
}

/** Los manifiestos que `despliegue()` produce, de una clase. */
function delDespliegue<K extends Manifiesto["kind"]>(clase: K) {
  return caja
    .despliegue(ENTORNO)
    .filter((m): m is Extract<Manifiesto, { kind: K }> => m.kind === clase);
}

function deploymentDeLaInterfaz() {
  const d = delDespliegue("Deployment").find((m) => m.metadata.name === NOMBRE_DE_LA_INTERFAZ);
  expect(d, `no hay ningun Deployment «${NOMBRE_DE_LA_INTERFAZ}»`).toBeDefined();
  return d!;
}

function rutasDelIngreso(entorno: EntornoDelDescriptor = ENTORNO) {
  const todas = caja
    .ingreso(entorno)
    .filter((m) => m.kind === "IngressRoute")
    .flatMap((m) => m.spec.routes);
  return {
    api: todas.find((r) => r.match.includes("/caja/api/v1"))!,
    interfaz: todas.find((r) => !r.match.includes("/caja/api/v1"))!,
    todas,
  };
}

/**
 * El MISMO ambiente, con `ambiente` y lo que de el se deriva puestos en `prod` (#44).
 *
 * Se compone a partir de `ENTORNO` y no se escribe de cero a proposito: lo unico que estas
 * pruebas quieren variar es **el ambiente**, y un segundo objeto escrito a mano acabaria
 * separandose del primero en algun otro campo, con lo que un rojo dejaria de decir cual de las
 * dos diferencias lo produjo.
 */
const ENTORNO_DE_PRODUCCION: EntornoDelDescriptor = {
  ...ENTORNO,
  ambiente: "prod",
  namespace: "kamayuk-caja-prod",
  dominio: "kamayuk.example",
  etiquetas: { ...ENTORNO.etiquetas, ambiente: "prod" },
  secretoDe: (c) => `kamayuk-caja-prod-${c}`,
};

describe("#17 — la interfaz se despliega, y no se llama como el backend", () => {
  /**
   * Criterio 3. Lo que se afirma no es «hay cuatro manifiestos» sino **que ninguno de los dos de
   * la interfaz se llama como los del backend**: `kamayuk-caja-web` ya existe, y reutilizar ese
   * nombre no daria un error de despliegue sino un `Service` repartiendo entre un backend de
   * Spring y un nginx de archivos estaticos — la mitad de las peticiones de la API contestadas
   * con el `index.html`.
   */
  it("el Deployment y el Service de la interfaz van al lado de los del backend, con otro nombre", () => {
    const deployments = delDespliegue("Deployment").map((m) => m.metadata.name);
    const services = delDespliegue("Service").map((m) => m.metadata.name);

    expect(deployments).toEqual([NOMBRE_DEL_BACKEND, NOMBRE_DE_LA_INTERFAZ]);
    expect(services).toEqual([NOMBRE_DEL_BACKEND, NOMBRE_DE_LA_INTERFAZ]);

    // Los cuatro manifiestos, con dos nombres distintos: uno por pieza. Se afirma aparte porque
    // las dos listas de arriba se pueden cumplir por separado y aun asi chocar entre si.
    const nombres = [...deployments, ...services];
    expect(new Set(nombres).size, `nombres repetidos: ${nombres.join(", ")}`).toBe(2);
  });

  /**
   * Criterio 4. La auditoria de `infrastructure` rechaza un `Deployment` sin limites ni sondas
   * —prohibicion (d)— y `runAsNonRoot` es «el endurecimiento que no admite excepcion» (#157).
   */
  it("su Deployment declara limites, las dos sondas y el endurecimiento entero", () => {
    const c = deploymentDeLaInterfaz().spec.template.spec.containers[0]!;

    expect(c.resources.limits.cpu).toBeTruthy();
    expect(c.resources.limits.memory).toBeTruthy();
    expect(c.resources.requests.cpu).toBeTruthy();
    expect(c.resources.requests.memory).toBeTruthy();

    // Vida y disponibilidad. Y con `timeoutSeconds` entre 3 y 5: el valor por omision del kubelet
    // es 1 s, y tres fallos de la sonda de vida matan el contenedor con codigo 143, que se parece
    // a un OOM sin serlo.
    for (const sonda of [c.livenessProbe, c.readinessProbe]) {
      expect(sonda).toBeDefined();
      expect(sonda!.httpGet?.path, "la sonda pide la pantalla, no un puerto abierto").toBe("/");
      expect(sonda!.timeoutSeconds).toBeGreaterThanOrEqual(3);
      expect(sonda!.timeoutSeconds).toBeLessThanOrEqual(5);
    }

    expect(c.securityContext?.runAsNonRoot).toBe(true);
    expect(c.securityContext?.allowPrivilegeEscalation).toBe(false);
    expect(c.securityContext?.capabilities.drop).toEqual(["ALL"]);
  });

  /**
   * `runAsNonRoot: true` no lo puede comprobar el kubelet si el `USER` de la imagen es un NOMBRE:
   * se niega a arrancar el contenedor con un `CreateContainerConfigError` que solo aparece al
   * desplegar. Por eso `frontend/Dockerfile` dice `USER 101` en numero (#16), y por eso esta
   * prueba lo lee de alli: el descriptor exige una propiedad que se cumple en otro archivo.
   */
  it("y la imagen que endurece trae un `USER` numerico, que es lo unico que el kubelet comprueba", () => {
    const usuarios = [...delRepositorio("frontend/Dockerfile").matchAll(/^USER\s+(\S+)/gm)].map(
      (m) => m[1]!,
    );
    expect(
      usuarios,
      "`frontend/Dockerfile` no declara ningun USER: correria como root",
    ).not.toEqual([]);
    for (const u of usuarios) expect(u, `USER ${u} no es un numero`).toMatch(/^\d+$/);
    for (const u of usuarios) expect(Number(u), "USER 0 es root").not.toBe(0);
  });

  /**
   * Criterio 8. La prohibicion (e) es «un Secret en claro»; esto es mas fuerte: **la interfaz no
   * declara ni una variable de entorno**, ni con valor ni con `secretKeyRef`. No tiene backend al
   * que llamar ni credencial que manejar, asi que cualquiera de las dos seria superficie regalada.
   */
  it("no maneja ninguna credencial: ni `secretKeyRef`, ni variables de entorno", () => {
    const c = deploymentDeLaInterfaz().spec.template.spec.containers[0]!;
    expect(c.env ?? []).toEqual([]);
    expect(c.envFrom ?? []).toEqual([]);
    expect(JSON.stringify(deploymentDeLaInterfaz())).not.toContain("secretKeyRef");
  });
});

describe("#17 — el ingreso partido en dos, y la precedencia escrita", () => {
  /**
   * Criterio 5, y es **el fallo que este issue existe para impedir**.
   *
   * Con la precedencia al reves, `/caja/api/v1/...` lo atenderia el nginx de la interfaz, cuyo
   * `try_files $uri /index.html` devuelve el `index.html` con un **200**: el cliente recibe HTML
   * donde espera JSON y el error aparece lejos de su causa. Traefik v3 ordena por longitud de la
   * regla cuando nadie declara `priority`, asi que hoy saldria bien por accidente — y por eso las
   * dos rutas la declaran.
   */
  it("dos rutas, y la de la API gana a la de la interfaz", () => {
    const { api, interfaz, todas } = rutasDelIngreso();
    expect(todas).toHaveLength(2);

    expect(api.services.map((s) => s.name)).toEqual([NOMBRE_DEL_BACKEND]);
    expect(interfaz.services.map((s) => s.name)).toEqual([NOMBRE_DE_LA_INTERFAZ]);

    expect(
      api.priority,
      "la ruta de la API no declara prioridad: quedaria a merced de la longitud de la regla",
    ).toBeDefined();
    expect(interfaz.priority, "la ruta de la interfaz no declara prioridad").toBeDefined();
    expect(
      api.priority!,
      "al reves, la API la contesta el nginx de la interfaz con un 200 y el `index.html` dentro",
    ).toBeGreaterThan(interfaz.priority!);
  });

  /**
   * Criterio 6, ya cubierto por «todas sus rutas van bajo su prefijo», dicho aqui por el otro
   * lado: la ruta de la API es **mas especifica** que la de la interfaz y las dos cuelgan de
   * `/caja`.
   */
  it("las dos cuelgan de `/caja`, y la de la API es la de dentro", () => {
    const { api, interfaz } = rutasDelIngreso();
    expect(api.match).toContain("PathPrefix(`/caja/api/v1`)");
    expect(interfaz.match).toContain("PathPrefix(`/caja`)");
    expect(api.match).toContain(`Host(\`${ENTORNO.dominio}\`)`);
    expect(interfaz.match).toContain(`Host(\`${ENTORNO.dominio}\`)`);
  });

  /**
   * El middleware que quita el prefijo va **solo** en la ruta de la interfaz.
   *
   * La raiz de la API del backend es la ruta ENTERA —`Api.RAIZ = "/caja/api/v1"` en
   * `kamayuk-caja-plataforma`, de donde cuelgan los `@RequestMapping` del nucleo—, asi que
   * quitarsela dejaria a Spring buscando `/pagos` y contestando 404 a todo.
   */
  it("y el prefijo se lo quita a la interfaz, nunca a la API", () => {
    const middlewares = caja.ingreso(ENTORNO).filter((m) => m.kind === "Middleware");
    expect(middlewares, "no hay ningun Middleware que quite el prefijo").toHaveLength(1);
    const middleware = middlewares[0]!;
    expect(middleware.spec).toEqual({ stripPrefix: { prefixes: ["/caja"] } });
    expect(
      middleware.metadata.namespace,
      "un Middleware de otro namespace no se referencia por nombre a secas",
    ).toBe(ENTORNO.namespace);

    const { api, interfaz } = rutasDelIngreso();
    expect((interfaz.middlewares ?? []).map((m) => m.name)).toEqual([middleware.metadata.name]);
    expect(
      (api.middlewares ?? []).map((m) => m.name),
      "quitarle `/caja` a la API deja a Spring buscando `/pagos`: 404 en todos sus endpoints",
    ).toEqual([]);

    // Y `Api.RAIZ` es de verdad la ruta entera, leido del backend y no supuesto.
    expect(
      delRepositorio("backend/kamayuk-caja-plataforma/src/main/java/kamayuk/caja/web/Api.java"),
    ).toContain('RAIZ = "/caja/api/v1"');
  });
});

describe("#17 — la configuracion de nginx que se monta", () => {
  /**
   * El `ConfigMap` es **el archivo**, caracter a caracter.
   *
   * La copia vive en `src/nginx-de-la-interfaz.ts` y no se lee del disco porque un descriptor es
   * una funcion pura; lo que la hace segura es esta comparacion, que sale roja en cuanto los dos
   * se separen. Para que salga roja **tambien cuando lo unico que cambia es el archivo**,
   * `infraestructura.yml` lo nombra en su `paths:`.
   */
  it("el ConfigMap lleva `frontend/nginx.conf` sin una coma de diferencia", () => {
    const configMaps = delDespliegue("ConfigMap");
    expect(configMaps).toHaveLength(1);
    expect(configMaps[0]!.data["default.conf"]).toBe(delRepositorio("frontend/nginx.conf"));
  });

  /** Y se monta donde el `Dockerfile` copia el suyo, o el `include conf.d/*.conf` no lo recoge. */
  it("y se monta sobre el `default.conf` de la imagen, con `subPath`", () => {
    const pod = deploymentDeLaInterfaz().spec.template.spec;
    const configMap = delDespliegue("ConfigMap")[0]!.metadata.name;
    const montaje = (pod.containers[0]!.volumeMounts ?? [])[0];

    expect(montaje?.mountPath).toBe("/etc/nginx/conf.d/default.conf");
    expect(montaje?.subPath, "sin `subPath` el montaje tapa el directorio entero de conf.d").toBe(
      "default.conf",
    );
    expect(delRepositorio("frontend/Dockerfile")).toContain(
      "COPY nginx.conf /etc/nginx/conf.d/default.conf",
    );

    const volumen = (pod.volumes ?? []).find((v) => v.name === montaje?.name);
    expect(
      volumen?.configMap?.name,
      "el volumen no apunta al ConfigMap que este descriptor emite",
    ).toBe(configMap);
  });
});

describe("#17 — las dos politicas de red de la interfaz", () => {
  function politicaDeLaInterfaz(tipo: "Ingress" | "Egress") {
    const p = caja
      .egreso(ENTORNO)
      .find(
        (n) =>
          n.spec.podSelector.matchLabels?.["componente"] === "caja-interfaz" &&
          n.spec.policyTypes.includes(tipo),
      );
    expect(p, `no hay politica de ${tipo} para la interfaz`).toBeDefined();
    return p!;
  }

  /**
   * Criterio 9, primera mitad. `infrastructure` deniega por omision en el namespace: sin esta
   * regla el ingreso enruta y el paquete no llega — la ruta existe, el pod esta sano y el
   * navegador se queda esperando.
   */
  it("Traefik le entra, y al puerto del POD, no al del Service", () => {
    const reglas = politicaDeLaInterfaz("Ingress").spec.ingress ?? [];
    expect(reglas).toHaveLength(1);
    expect(
      (reglas[0]!.from ?? []).map(
        (f) => f.namespaceSelector?.matchLabels?.["kubernetes.io/metadata.name"],
      ),
    ).toEqual(["kube-system"]);
    // 8080 y no 80: una NetworkPolicy filtra sobre el puerto del CONTENEDOR, y el 80 → 8080 lo
    // deshace el `Service` antes. Con 80 aqui, la politica no admitiria nada.
    expect((reglas[0]!.ports ?? []).map((p) => `${p.protocol}/${p.port}`)).toEqual(["TCP/8080"]);
    const contenedor = deploymentDeLaInterfaz().spec.template.spec.containers[0]!;
    expect((contenedor.ports ?? []).map((p) => p.containerPort)).toEqual([8080]);
  });

  /**
   * Criterio 9, segunda mitad: su egreso es **solo** DNS. Y no es una casilla: la interfaz no
   * declara ninguna regla hacia el backend, asi que un reenvio escrito en `nginx.conf` manana no
   * funcionaria en el clúster —aunque funcionara en el compose— y se veria en el PR que lo
   * escriba, no en produccion.
   */
  it("y no sale a ningun otro sitio: solo DNS", () => {
    const reglas = politicaDeLaInterfaz("Egress").spec.egress ?? [];
    expect(reglas).toHaveLength(1);
    expect(reglas[0]!.ports?.map((p) => p.port)).toEqual([53, 53]);
    // La otra mitad de la afirmacion, y la que de verdad importa: nada apunta a ningun pod.
    expect(JSON.stringify(reglas)).not.toContain(NOMBRE_DEL_BACKEND);
    expect(JSON.stringify(reglas)).not.toContain("podSelector");
  });

  /**
   * Y la interfaz **no hereda** las tres aristas del backend, que es lo que compra tener su propia
   * etiqueta `componente`. Un nginx de archivos estaticos con salida a PostgreSQL es superficie
   * que nadie pidio.
   */
  it("y no hereda el egreso del backend: su `componente` es otro", () => {
    const delBackend = caja
      .egreso(ENTORNO)
      .filter((n) => n.spec.podSelector.matchLabels?.["componente"] === "caja");
    expect(delBackend).toHaveLength(1);

    const etiquetas = deploymentDeLaInterfaz().spec.template.metadata.labels;
    expect(etiquetas["componente"]).toBe("caja-interfaz");
    expect(etiquetas["componente"]).not.toBe("caja");
  });
});

/** El texto de un archivo sin sus comentarios: una prohibicion no puede cazar a su propia prosa. */
function sinComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Los `.ts` de `src/`, recursivamente. */
function fuentesDelDescriptor(): { nombre: string; texto: string }[] {
  const raiz = fileURLToPath(new URL("../src/", import.meta.url));
  return readdirSync(raiz, { recursive: true, encoding: "utf8" })
    .filter((n) => n.endsWith(".ts"))
    .map((n) => ({ nombre: n, texto: readFileSync(raiz + n, "utf8") }));
}

describe("#17 — criterio 7: ninguna etiqueta de imagen escrita a mano", () => {
  /**
   * La prohibicion (b), comprobada tambien sobre el TEXTO y no solo sobre lo que se devuelve.
   *
   * Se mira el codigo **sin comentarios**, y no es un detalle: este archivo habla de la imagen
   * base de la interfaz por su version exacta, que es informacion util y no una etiqueta que
   * nadie va a desplegar. Un escaner que se dispara con la prosa que lo explica es un escaner que
   * alguien acaba apagando — la leccion del criterio 5 de #16, donde `grep -c proxy_pass` daba 3
   * sobre un archivo con cero reenvios.
   */
  it("ni `:latest`, ni `:main`, ni `:stable` en el codigo del descriptor", () => {
    const culpables = fuentesDelDescriptor()
      .filter((f) => /:(latest|main|stable)\b/.test(sinComentarios(f.texto)))
      .map((f) => f.nombre);
    expect(culpables).toEqual([]);
  });

  it("y toda imagen sale de `e.imagenDe()`, incluida la de la interfaz", () => {
    const admisibles = caja.imagenes.map((n) => ENTORNO.imagenDe(n));
    const imagenes = [
      ...caja.despliegue(ENTORNO),
      ...caja.migracion(ENTORNO),
      ...caja.implantacion(ENTORNO),
    ].flatMap((m) =>
      m.kind === "Deployment"
        ? [...m.spec.template.spec.containers, ...(m.spec.template.spec.initContainers ?? [])]
        : m.kind === "Job"
          ? [...m.spec.template.spec.containers, ...(m.spec.template.spec.initContainers ?? [])]
          : [],
    );
    expect(imagenes.length).toBeGreaterThan(0);
    for (const c of imagenes) expect(admisibles, `contenedor «${c.name}»`).toContain(c.image);
    // Y la de la interfaz esta de verdad entre ellas: sin esto, la afirmacion la cumpliria un
    // despliegue en el que la interfaz no existe.
    expect(imagenes.map((c) => c.image)).toContain(ENTORNO.imagenDe("caja-interfaz"));
  });
});

/**
 * La coherencia entre lo que el ingreso quita y lo que la interfaz hornea. Es la guarda que este
 * issue deja para que la decision no se pueda deshacer a medias.
 *
 * Las tres piezas, medidas contra el nginx real de `nginx:1.31.4-alpine` con el `nginx.conf` de
 * este repositorio y el `dist/` que `yarn build` produce:
 *
 *   1. `frontend/nginx.conf` sirve en la RAIZ (`root …/html; location / { try_files … }`), que es
 *      lo que le llega cuando el ingreso ya quito el prefijo: `200 application/javascript` para el
 *      paquete y `200 image/png` para el escudo.
 *   2. Y desde #42 sirve **tambien** `/caja/`, con un `rewrite ... last` que devuelve la peticion
 *      a la busqueda de `location` sin el prefijo. Hasta entonces, quien llegaba sin ingreso
 *      delante —el puerto que publica `despliegue/compose.yaml`— pedia
 *      `/caja/assets/index-<huella>.js`, nginx no encontraba el archivo, caia en el `try_files` y
 *      contestaba **200 text/html de 1 383 B**: el `index.html` donde el navegador esperaba un
 *      modulo, y la pantalla en blanco sin un solo error en el servidor.
 *   3. Y el navegador solo pide bajo `/caja` lo que el `index.html` diga. Sin `base` declarado en
 *      `frontend/vite.config.ts`, `dist/index.html` diria `src="/assets/…"`, o sea la raiz del
 *      dominio: una ruta que `PathPrefix(/caja)` no casa y que este descriptor **no puede
 *      reclamar** (prohibicion (a)). Lo declara desde #37.
 *
 * De modo que **las dos salidas no eran alternativas**: el middleware era necesario y no
 * suficiente, y `base` es necesario y no suficiente. Con #42, la que dejo de ser necesaria es la
 * primera —nginx sirve las dos entradas, asi que el middleware es redundante en efecto—, y aun asi
 * se queda: ver el docblock de `ingreso()`. Y habia una tercera pieza, que es la que impidio cerrar
 * esto en #17: `frontend/src/` escribia una ruta absoluta a la raiz en un literal de JavaScript, y
 * **Vite no reescribe eso**. Medido entonces y vuelto a medir en #37: con `base: "/caja/"`,
 * `dist/index.html` decia `/caja/escudo-catacaos.png` y el paquete seguia diciendo
 * `/escudo-catacaos.png` (`grep -c` daba 1 y 0).
 *
 * Esta prueba fija que las dos que quedan **se muevan juntas**: mientras haya un literal absoluto
 * en `src/`, `base` tiene que estar sin declarar; el dia que no lo haya, `base` tiene que valer
 * `/caja/`. Cualquiera de las dos mitades sola pone esto rojo.
 *
 * **#37 la ha hecho cambiar de lado**, que es para lo que estaba escrita: el escudo se cuelga hoy
 * de `import.meta.env.BASE_URL`, `absolutasEnSrc()` devuelve la lista vacia y por tanto lo que se
 * exige ya no es que `base` este sin declarar, sino que valga `/caja/`. La rama de arriba no se
 * borra: el dia que alguien vuelva a escribir un literal absoluto, esto tiene que volver a
 * decirle que entonces `base` no puede quedarse.
 */
describe("#17 — el prefijo, la base de Vite y lo que nginx sirve, a la vez", () => {
  const nginx = () => delRepositorio("frontend/nginx.conf");

  /** El `base` que `vite.config.ts` declara. Sin declarar, Vite usa `/`. */
  function baseDeVite(): string {
    const encaje = /^\s*base:\s*"([^"]*)"/m.exec(sinComentarios(delRepositorio("frontend/vite.config.ts")));
    return encaje?.[1] ?? "/";
  }

  /** La raiz del codigo de la interfaz, que es lo que este escaner recorre. */
  const raizDeLaInterfaz = () => fileURLToPath(new URL("../../frontend/src/", import.meta.url));

  /** Los `.ts`/`.tsx` de `frontend/src/`: lo que este escaner llega a leer de verdad. */
  function cuantasFuentesDeLaInterfaz(): number {
    return readdirSync(raizDeLaInterfaz(), { recursive: true, encoding: "utf8" }).filter((n) =>
      /\.tsx?$/.test(n),
    ).length;
  }

  /** Rutas absolutas a la raiz, escritas como literal de cadena, en el codigo de `frontend/src`. */
  function absolutasEnSrc(): { archivo: string; ruta: string }[] {
    const raiz = raizDeLaInterfaz();
    const hallazgos: { archivo: string; ruta: string }[] = [];
    for (const nombre of readdirSync(raiz, { recursive: true, encoding: "utf8" })) {
      if (!/\.tsx?$/.test(nombre)) continue;
      const texto = sinComentarios(readFileSync(raiz + nombre, "utf8"));
      for (const m of texto.matchAll(
        /["'`](\/[A-Za-z0-9._/-]+\.(?:png|jpe?g|gif|svg|webp|avif|ico|woff2?|css|js|mjs|json))["'`]/g,
      )) {
        hallazgos.push({ archivo: nombre, ruta: m[1]! });
      }
    }
    return hallazgos;
  }

  it("nginx sirve las dos entradas: la raiz y `/caja/`, que reescribe a la raiz", () => {
    const conf = nginx();

    // La entrada del CLUSTER: aqui llega lo que el `stripPrefix` ya limpio.
    expect(conf).toContain("root /usr/share/nginx/html;");
    expect(conf).toContain("location / {");

    // La entrada de quien NO tiene un ingreso delante (#42). Se exige la forma exacta porque lo
    // que la hace valer es que reescriba **a la raiz**: un `location /caja/` que sirviera por su
    // cuenta seria un segundo camino, y dos caminos se separan.
    expect(
      conf,
      "sin esto, `/caja/assets/...` cae en el `try_files` y sale 200 `text/html`: la pantalla en " +
        "blanco del compose (#42)",
    ).toMatch(/location \/caja\/ \{\s*rewrite \^\/caja\/\(\.\*\)\$ \/\$1 last;\s*\}/);

    // Y la propiedad que ata las dos entradas a un solo camino de servicio: **una** directiva
    // `try_files` y **un** `location /assets/`. Es lo que impide el arreglo por copia, que es el
    // que envejece: duplicar los bloques bajo el prefijo dejaria las dos rutas sirviendo bien hoy
    // y con cabeceras distintas el dia que alguien toque una sola.
    //
    // Se cuentan DIRECTIVAS y no menciones —al principio de linea, que es donde nginx las lee—
    // porque la cabecera de ese archivo las nombra al explicar por que hay una sola: contarlas a
    // secas da 4 y la guarda se pondria roja por su propia prosa, que es la leccion del escaner
    // del Panel (#10) y la del conteo del reenvio en ese mismo archivo.
    expect(
      (conf.match(/^\s*try_files\s/gm) ?? []).length,
      "dos `try_files` son dos caminos de servicio que pueden separarse",
    ).toBe(1);
    expect((conf.match(/^\s*location \/assets\/ \{/gm) ?? []).length).toBe(1);

    // El middleware del ingreso NO se retira, aunque con lo de arriba sea redundante en efecto:
    // ver el docblock de `ingreso()`.
    const { interfaz } = rutasDelIngreso();
    expect((interfaz.middlewares ?? []).length).toBe(1);
  });

  it("y `base` de Vite y las rutas absolutas de `src/` se mueven juntas", () => {
    const absolutas = absolutasEnSrc();
    const base = baseDeVite();

    if (absolutas.length > 0) {
      expect(
        base,
        `«${absolutas.map((a) => `${a.archivo}: ${a.ruta}`).join(", ")}» apunta a la raiz del ` +
          "dominio y Vite no reescribe un literal de JavaScript. Con `base` declarado, esa " +
          "peticion se va fuera de `/caja` y no llega: la pantalla sale sin escudo y `mirar.mjs` " +
          "cuenta un 404 por seccion. Se arregla en `frontend/`, y entonces `base` pasa a `/caja/`.",
      ).toBe("/");
    } else {
      expect(
        base,
        "ya no hay rutas absolutas en `src/`: toca declarar `base: \"/caja/\"` para que el " +
          "navegador pida sus recursos bajo el prefijo que el ingreso quita",
      ).toBe("/caja/");
    }
  });

  /**
   * Y el estado de hoy, dicho con nombre y apellido para que no se lea como una casilla: desde
   * #37 **no queda ninguna**, y el escudo —la unica que hubo— se cuelga de
   * `import.meta.env.BASE_URL`.
   *
   * Las dos aserciones hacen falta y no se solapan. La primera es la lista vacia. La segunda es
   * que el escaner **ha mirado algo**: `absolutasEnSrc()` recorre un directorio, y un
   * `readdirSync` sobre una ruta que se quede vieja devolveria cero archivos y por tanto cero
   * hallazgos — verde por vacio, que es el mismo modo de fallo que este archivo vigila en el
   * resto de sus escaneres. Un grep vacio no es prueba de ausencia si no se sabe que grepeo.
   */
  it("desde #37 no queda ninguna, y el escaner lo dice habiendo mirado", () => {
    expect(absolutasEnSrc().map((a) => `${a.archivo}: ${a.ruta}`)).toEqual([]);
    expect(cuantasFuentesDeLaInterfaz()).toBeGreaterThan(30);
  });
});

/**
 * #44 — la interfaz de ventanilla **no se ruta en `prod`**, y si en `stg`.
 *
 * <h2>Que decide esto, y por que se fija aqui</h2>
 *
 * `caja-web` no habla con su backend: sin `fetch`, sin reenvio en `nginx.conf` y con
 * `cero-red.mjs` midiendo 0 peticiones de conexion. Los datos que dibuja son los del artboard.
 * Servida en `https://<dominio>/caja` sin pedir credenciales, no se distingue del sistema — y el
 * primer dano que eso hace, una cifra plausible y falsa copiada a un informe, **no lo evita
 * ninguna banda si el dominio es el de produccion**. La decision entera, con las tres salidas y
 * su coste, vive en `AMBIENTE_SIN_INTERFAZ` del descriptor, que es donde se aplica.
 *
 * <h2>Las dos afirmaciones, y por que una sola no vale</h2>
 *
 * AC-5 pide que `manifiestosDe(caja, prod)` no traiga la ruta de la interfaz. Esa afirmacion
 * sola **no separa las hipotesis**: un descriptor que no la declarara en ningun ambiente —o al
 * que se le hubiera borrado la interfaz entera— la cumpliria igual de bien. Por eso al lado va
 * la contraria, que en `stg` **si** esta, con su `Middleware` y su prioridad.
 *
 * <h2>Lo que sigue existiendo en `prod`, y se afirma para que no se retire de paso</h2>
 *
 * El `Deployment` y el `Service` de la interfaz. La imagen se sigue construyendo y publicando, y
 * el pod sigue arrancando con sus sondas: lo unico que desaparece es la ruta publica. Sin esta
 * tercera asercion, «en prod no esta la ruta» lo cumpliria tambien un descriptor que hubiera
 * dejado de desplegar la interfaz, que es un cambio mucho mayor y no es el que este issue pide.
 */
describe("#44 — que se sirve en cada ambiente", () => {
  it("en `prod` el ingreso NO declara la ruta de la interfaz", () => {
    const { api, interfaz, todas } = rutasDelIngreso(ENTORNO_DE_PRODUCCION);

    expect(
      interfaz,
      "en `prod` hay una ruta que no es la de la API: la maqueta de ventanilla se esta " +
        "sirviendo en el dominio de produccion, sin autenticacion y con los datos del artboard",
    ).toBeUndefined();
    expect(todas).toHaveLength(1);
    expect(api.services.map((s) => s.name)).toEqual([NOMBRE_DEL_BACKEND]);

    // Y con la ruta se va su `Middleware`: uno que nadie referencia es una declaracion muerta,
    // y una declaracion muerta es lo que manana alguien vuelve a enganchar sin leer por que
    // estaba.
    expect(
      caja.ingreso(ENTORNO_DE_PRODUCCION).filter((m) => m.kind === "Middleware"),
    ).toHaveLength(0);

    // La otra mitad del criterio 3 de la lista de «lo que NO entra»: ningun manifiesto del
    // ingreso de `prod` nombra al servicio de la interfaz, ni siquiera de refilon.
    expect(JSON.stringify(caja.ingreso(ENTORNO_DE_PRODUCCION))).not.toContain(
      NOMBRE_DE_LA_INTERFAZ,
    );
  });

  it("y en `stg` SI, con su middleware y su prioridad", () => {
    const { api, interfaz, todas } = rutasDelIngreso(ENTORNO);

    expect(
      interfaz,
      "sin esta mitad, un descriptor que no declarara NUNCA la ruta de la interfaz pasaria la " +
        "prueba de arriba: las dos hacen falta para separar las hipotesis",
    ).toBeDefined();
    expect(todas).toHaveLength(2);
    expect(interfaz.services.map((s) => s.name)).toEqual([NOMBRE_DE_LA_INTERFAZ]);
    expect(interfaz.match).toContain("PathPrefix(`/caja`)");
    expect(interfaz.priority!).toBeLessThan(api.priority!);
    expect((interfaz.middlewares ?? []).map((m) => m.name)).toEqual([
      "kamayuk-caja-quitar-prefijo",
    ]);
  });

  it("el pod de la interfaz sigue desplegandose en `prod`: lo que se va es la ruta", () => {
    const enProduccion = caja.despliegue(ENTORNO_DE_PRODUCCION);
    // Por prefijo y no por igualdad: su `ConfigMap` se llama `…-interfaz-nginx`.
    const suyos = enProduccion.filter((m) => m.metadata.name.startsWith(NOMBRE_DE_LA_INTERFAZ));

    expect(
      suyos.map((m) => m.kind).sort(),
      "retirar el `Deployment` seria dejar de ejercitar en `prod` justo lo que hay que tener " +
        "listo el dia que la interfaz se conecte; #44 no lo pide y no se hace",
      ).toEqual(["ConfigMap", "Deployment", "Service"]);

    // Y sus dos politicas de red tambien: la que deja entrar a Traefik y la de DNS.
    expect(
      caja
        .egreso(ENTORNO_DE_PRODUCCION)
        .filter((p) => p.metadata.name.startsWith(NOMBRE_DE_LA_INTERFAZ)),
    ).toHaveLength(2);
  });

  /**
   * La decision escrita **donde se aplica**, que es lo que AC-1 pide con esas palabras.
   *
   * No es una prueba de estilo: un `if (e.ambiente === "prod")` sin explicacion se lee como un
   * descuido o como un apano temporal, y el dia que alguien lo borre para «unificar los dos
   * ambientes» habra deshecho una decision sin haberla leido. Lo que se exige es que el
   * descriptor nombre las tres salidas y diga cual se eligio; lo que la decision *dice* no lo
   * puede leer una maquina, y eso lo lee la revision.
   */
  it("y la decision esta escrita en el descriptor, no solo en el PR", () => {
    const fuente = delRepositorio("infrastructure/src/descriptor.ts");
    expect(fuente).toContain("AMBIENTE_SIN_INTERFAZ");
    for (const dice of [
      "no se ruta",
      "Se elige la (2)",
      "No retira el `Deployment` ni el `Service`",
    ]) {
      expect(fuente, `el descriptor no dice «${dice}»`).toContain(dice);
    }
  });
});

/**
 * #42 — los comentarios que decian quien quita el prefijo, y decian algo falso.
 *
 * Tres archivos vivos explicaban, **en presente y con esas palabras**, que
 * `frontend/vite.config.ts` no declara `base`: la seccion «El prefijo `/caja`» de
 * `frontend/nginx.conf`, el docblock de `ingreso()` en `infrastructure/src/descriptor.ts` y el
 * comentario del puerto publicado en `despliegue/compose.yaml`. Lo declara desde #37, asi que los
 * tres mandaban a quien fuera a entender el prefijo exactamente al reves de como funciona.
 *
 * No es cosmetica: los tres son los sitios donde alguien mira para decidir quien tiene que quitar
 * el prefijo, y de esa decision cuelga que la pantalla se vea o salga en blanco.
 *
 * <h2>Por que se busca ESA frase y no «base»</h2>
 *
 * La afirmacion falsa tiene una forma concreta —el sujeto `vite.config.ts` seguido de «no declara
 * `base`»— y solo esa se prohibe. Los mismos archivos escriben **condicionales** que son ciertas y
 * tienen que poder escribirse: «Sin `base` declarado, `dist/index.html` diria…», «mientras haya un
 * literal absoluto en `src/`, `base` tiene que estar sin declarar». Un escaner que buscara «base»
 * y «declara» cerca las pondria rojas todas, y una guarda que grita en lo correcto se acaba
 * apagando (#437). Por eso el detector se prueba **en las dos direcciones**, con una muestra que
 * tiene que disparar y una contramuestra que no.
 *
 * <h2>Y la otra mitad: que `base` siga declarado</h2>
 *
 * Sin ella, la prohibicion se cumpliria tambien quitando `base` de `vite.config.ts` —entonces la
 * frase seria cierta y bastaria con borrarla—. Que valga `/caja/` lo exige ademas la guarda
 * bidireccional de mas arriba; aqui se afirma porque es la premisa de esta.
 */
describe("#42 — ningun archivo vivo dice que `vite.config.ts` no declara `base`", () => {
  /**
   * La frase prohibida: el sujeto y, pegado a el, la negacion. Se normalizan antes los prefijos
   * de comentario (`#`, `*`, `//`) y los saltos de linea, porque la frase se parte en dos lineas
   * segun donde caiga el margen y una guarda que dependa de eso no vigila nada.
   */
  const LA_FRASE = /vite\.config\.ts`?\**\s*\**(?:no|tampoco)\s+declara\s+\**`?base`?/i;

  /** Tal como estaba escrita en `descriptor.ts` hasta #42. Si esto no dispara, no se mide nada. */
  const MUESTRA = "`frontend/vite.config.ts` **no declara `base`**, asi que el `index.html`";

  /** Cierta y necesaria: una condicional sobre lo que pasaria sin `base`. No puede disparar. */
  const CONTRAMUESTRA = "Sin `base` declarado en `frontend/vite.config.ts`, `dist/index.html` diria";

  /** Un archivo, sin prefijos de comentario y en una sola linea. */
  const aplanado = (ruta: string) =>
    delRepositorio(ruta)
      .split("\n")
      .map((l) => l.replace(/^\s*(?:#|\*|\/\/)\s?/, ""))
      .join(" ")
      .replace(/\s+/g, " ");

  /**
   * Los tres archivos vivos. `CLAUDE.md` **no entra a proposito**: sus filas son el registro de lo
   * que se midio el dia que se midio, y una fila historica no se reescribe —la de #37 dice esa
   * frase porque entonces era verdad, y decia ademas que quedaba pendiente—.
   */
  const ARCHIVOS = [
    "frontend/nginx.conf",
    "infrastructure/src/descriptor.ts",
    "infrastructure/src/nginx-de-la-interfaz.ts",
    "despliegue/compose.yaml",
  ];

  it("el detector dispara con la frase y no con la condicional", () => {
    expect(LA_FRASE.test(MUESTRA), "el detector no ve la frase que existio: no mide nada").toBe(
      true,
    );
    expect(
      LA_FRASE.test(CONTRAMUESTRA),
      "el detector dispara con una condicional cierta: gritaria en lo correcto y acabaria apagado",
    ).toBe(false);
  });

  it("y ninguno de los archivos vivos la escribe", () => {
    const culpables = ARCHIVOS.filter((r) => LA_FRASE.test(aplanado(r)));
    expect(
      culpables,
      "`vite.config.ts` declara `base: \"/caja/\"` desde #37, y de quien quita el prefijo cuelga " +
        "que la pantalla se vea o salga en blanco (#42)",
    ).toEqual([]);
    // Y que se ha leido algo: una ruta que se quede vieja devolveria un archivo vacio y la lista
    // saldria vacia por no haber mirado. Un grep vacio no es prueba de ausencia.
    for (const r of ARCHIVOS) expect(aplanado(r).length, `«${r}» esta vacio`).toBeGreaterThan(1000);
  });

  it("y `base` sigue declarado, que es la premisa de lo anterior", () => {
    expect(/^\s*base:\s*"\/caja\/"/m.test(delRepositorio("frontend/vite.config.ts"))).toBe(true);
  });
});
