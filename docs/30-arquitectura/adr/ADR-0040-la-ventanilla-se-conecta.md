# ADR-0040 — Si la ventanilla se conecta, y qué hace falta antes

| Campo | Valor |
|---|---|
| Estado | **Propuesto** |
| Fecha | 2026-09-12 |
| Decide | `caja` |
| Nace de | [`caja`#66](https://github.com/hneyra/caja/issues/66), sub-issue de [`infrastructure`#124](https://github.com/hneyra/infrastructure/issues/124) |

## Contexto

La interfaz de ventanilla existe, está construida y **se despliega**: imagen
`kamayuk-caja-interfaz`, `Deployment`, `Service` y el `ConfigMap` de su nginx, los tres en
`infrastructure/src/descriptor.ts`. Ocho pantallas reales sobre 52 archivos.

**Y no llega a nadie en `prod`, a propósito.** `descriptor.ts:610` declara
`AMBIENTE_SIN_INTERFAZ = "prod"`, y en `:981` la `IngressRoute` de la interfaz sólo se
emite cuando el ambiente no es ése. Por eso `https://<dominio>/caja` devuelve **404**
mientras `/caja/api/v1` sirve con normalidad.

Dos hechos más, los dos vigilados por construcción y medidos el 2026-09-12:

- **No habla con nadie.** `frontend/eslint.config.mjs:58` lo prohíbe con todas las letras
  —«Esta interfaz no habla con nadie: sin fetch y sin XMLHttpRequest»— con selectores AST
  para `fetch`, `XMLHttpRequest` y `sendBeacon`, y `frontend/verificaciones/cero-red.mjs`
  lo mide en un Chromium de verdad.
- **Lo que dibuja es inventado**: **1 965 líneas en 13 archivos** de `frontend/src/datos/`
  — números de recibo con forma real, nombres de contribuyentes e importes.

Y no autentica, también declarado en tres sitios del propio código: «aquí no hay OIDC, ni
Keycloak, ni token».

### Lo que ya estaba decidido, y lo que no

Cada mitad estaba decidida por separado y con su motivo: que la interfaz se construyera
sin red (#17) y que se desplegara para poder verla. **Lo que nadie había decidido es que
las dos ocurran a la vez en el dominio de producción**, y por eso `prod` no la ruta.

El descriptor dejó escrito el daño que evita: servida en `https://<dominio>/caja`, con el
escudo de la entidad y sin pedir credenciales, **esa pantalla no se distingue del
sistema**, y el primer daño es «una cifra plausible y falsa copiada a un informe». Ninguna
banda de maqueta lo evita si el dominio es el de producción.

También dejó escrita la condición que lo levanta: «el día que haya identidad, `prod`
vuelve a rutar». **Esa condición se ha leído mal una vez ya** —en esta misma sesión— y
conviene fijarla: **no se cumple porque exista el sistema `identidad`**, que existe y
funciona desde el 2026-09-12. Se cumple cuando **esta pantalla** autentique y hable con su
backend.

## Decisión

**PENDIENTE.** Este ADR no la toma: la plantea con su coste para que se tome.

Lo que sí decide —y esto sí es una decisión— es **el orden**, porque el daño no está en
ninguna de las piezas sino en su secuencia:

> **La `IngressRoute` de `prod` se retira la última, y sólo cuando la pantalla autentique y
> hable con su backend.** Retirarla antes, «para ir avanzando», reproduce exactamente el
> daño que la decisión original describe.

## Alternativas consideradas

### 1 · Conectarla entera

Levantar la prohibición de red, añadir identidad con el patrón de `rentas` —PKCE S256, el
token en memoria, la puerta delante—, conectar las ocho pantallas a su backend, y entonces
retirar `AMBIENTE_SIN_INTERFAZ`.

**Lo que cuesta**: es el trabajo más grande de los cuatro frontends, y toca la propiedad
que este sistema existe para tener. La ventanilla «no le pregunta nada a nadie para cobrar
[…] es lo que hace cierto que la ventanilla cobre con `rentas` apagado» — conectarla es
exactamente lo que ADR-0039 descartó al rechazar su salida 1, y hay que releer aquello
antes de escribir la primera línea, porque el riesgo no es de red: es de disponibilidad.

**Lo que compra**: la ventanilla deja de ser una maqueta.

### 2 · Sólo identidad, sin abrir la ruta

Añadir el módulo de identidad y la puerta, dejando la prohibición de red y el 404 en
`prod`. Queda lista para conectarse el día que se decida, sin exponer nada.

**Lo que cuesta**: una puerta que autentica delante de pantallas que siguen dibujando datos
inventados es **peor que la maqueta de hoy**, no mejor: pedir credenciales es lo que hace
que quien entra crea que lo que ve es real. Si se elige esta, la banda de maqueta y los
toast honestos dejan de ser opcionales.

### 3 · Dejarla como está

No tocar nada. La decisión no corre prisa: nadie la está usando y el 404 protege.

**Lo que cuesta**: la interfaz se sigue construyendo y desplegando en cada `pulumi up`
—sus sondas siguen diciendo si el artefacto está sano, que es el motivo por el que no se
retiró el `Deployment`— y cada mes que pasa es un mes más de pantallas que nadie ha
ejercido contra un backend de verdad.

## Consecuencias

**Si se elige la (1)**, lo que hay que hacer, en este orden y no en otro:

1. Un ADR que reabra ADR-0039 §salida 1 y diga **qué pasa cuando `rentas` no contesta**.
   Sin eso, conectar la ventanilla cambia su propiedad principal sin que nadie lo haya
   decidido.
2. Levantar la prohibición de red **en el lint**, no borrando la regla: su mensaje pide
   este ADR, así que la regla se retira citándolo.
3. La identidad, copiando el patrón de `rentas`. **Con la lección ya pagada**: el
   `redirect_uri` es la raíz **de la aplicación** (`/caja/`), no la del sitio, y
   `vitest.config.ts` tiene que compartir la `base` con `vite.config.ts` — si no, la prueba
   que lo fija afirma el valor equivocado siendo coherente ([`rentas`#71](https://github.com/hneyra/rentas/issues/71)).
4. Las pantallas, una a una, contra su backend. `frontend/src/datos/` se vacía a medida que
   se conectan, y **esa lista menguante es la medida del avance**.
5. Y sólo entonces, `AMBIENTE_SIN_INTERFAZ`.

**Si se elige la (2) o la (3)**, `AMBIENTE_SIN_INTERFAZ` se queda, y con él el 404. Lo que
no vale en ningún caso es retirarlo antes del paso 4.

## Lo que este ADR no decide

- **Qué pasa en la raíz del dominio**: es [`infrastructure`#125](https://github.com/hneyra/infrastructure/issues/125).
- **Los otros dos frontends** (`catastro`, `normativa`): cada uno tiene su sub-issue y su
  camino, que no es éste.
