# ADR-0042 — La ventanilla compone su sesión desde su propia copia, y no habla con nadie más

| Campo | Valor |
|---|---|
| Estado | **Aceptado** |
| Fecha | 2026-09-13 |
| Decide | `caja`, por decisión de la dirección en [`caja`#74](https://github.com/hneyra/caja/issues/74) |
| Nace de | [`caja`#75](https://github.com/hneyra/caja/issues/75), paso 1 de las consecuencias de [ADR-0040](ADR-0040-la-ventanilla-se-conecta.md) |
| Matiza | [ADR-0030](https://github.com/hneyra/infrastructure/blob/main/docs/30-arquitectura/adr/ADR-0030-cuatro-interfaces-una-sesion.md) §3, en la línea «los cuatro frontends leen `rentas/api/v1/sesion/permisos`» |
| Contesta | La pregunta que [ADR-0039](https://github.com/hneyra/infrastructure/blob/main/docs/30-arquitectura/adr/ADR-0039-la-identidad-es-un-sistema.md) §Consecuencias deja abierta: quién compone el catálogo de accesos de la sesión |
| Conserva | [ADR-0013](https://github.com/hneyra/rentas/blob/main/docs/30-arquitectura/adr/ADR-0013-permisos-de-la-sesion.md) sin cambio: los permisos se piden al servidor, no se leen del token |

## Contexto

ADR-0040 dejó la decisión de conectar la ventanilla sin tomar, y fijó que antes de la primera línea
hacía falta un ADR que dijera **qué pasa cuando `rentas` no contesta**. La dirección ya decidió
conectarla (#74), con el mismo método que `rentas-web`: una puerta PKCE, un catálogo filtrado por
los permisos de la sesión y pantallas que leen.

Ese método trae una llamada que no se ve en ninguna pantalla y que es la que importa aquí: **antes de
dibujar el árbol, la interfaz pregunta qué puede abrir la cuenta**. En `rentas-web` son tres lecturas
—`/seguridad/modulos`, `/seguridad/accesos` y `/seguridad/sesion/permisos`— contra su propio backend.
Y ADR-0030 §3 dice que las cuatro interfaces leen **ésa**, la de `rentas`.

Medido el 2026-09-13, esa frase ya no se puede cumplir, y por dos motivos distintos:

1. **Contestaría la matriz equivocada.** Desde la etapa 4 de ADR-0039 cada sistema aplica los eventos
   de `identidad` a **su** copia, y el consumidor de `rentas` ignora —y acusa— los `PERMISO_FIJADO` con
   `sistema=caja`. La copia de `rentas` no sabe quién puede cobrar.
2. **Pondría a `rentas` delante de la ventanilla.** Es exactamente la salida 1 que ADR-0039 rechazó:
   «convierte "`rentas` caído" en "la ventanilla cerrada"».

Y el backend de `caja` **no publica ninguna de las tres**: su `GuardiaDeAcceso` autoriza contra su copia
local, pero nada la lee hacia fuera. El centinela `RequiereAcceso.SESION_PROPIA` existe y ningún
endpoint lo usa.

## Decisión

**La interfaz de `caja` habla con dos sitios y con ninguno más: su propio backend, bajo
`/caja/api/v1`, y el emisor de identidad.** No llama a `/rentas/api/v1`, ni a ningún otro sistema,
para nada: ni para los permisos, ni para una consulta de deuda, ni para resolver un nombre.

**Los permisos de la sesión salen de la copia local de `caja`.** El backend de `caja` publica, con la
misma forma que `rentas` y bajo su prefijo:

| Ruta | Qué contesta |
|---|---|
| `GET /seguridad/modulos` | Los módulos de este sistema, paginados |
| `GET /seguridad/accesos` | Sus accesos, paginados, con el módulo al que cuelgan |
| `GET /seguridad/sesion/permisos` | `{codigoDeAcceso: [privilegios]}` de la cuenta del token; `{}` si no tiene ninguno |
| `GET /seguridad/sesion` | La cuenta del token tal como la conoce **esta** copia |
| `GET /seguridad/sesion/municipalidad` | La municipalidad del token |

Las cinco declaran `SESION_PROPIA`: basta un token válido. Pedir un acceso para leer el árbol haría que
una cuenta sin permisos recibiera un 403 donde tiene que leer «esta cuenta no puede abrir nada», que
son dos cosas distintas.

La matriz de `sesion/permisos` se calcula **con la misma precedencia que `ComprobadorDeAccesoJdbc`**, y
eso es parte de la decisión, no un detalle de implementación: una interfaz que ofrece lo que el guardia
luego niega —o esconde lo que el guardia permite— es peor que no filtrar.

**Así se contesta la pregunta abierta de ADR-0039**: el catálogo de accesos de la sesión lo compone
**cada sistema, desde su copia**. `identidad` es el dueño de a quién se concede qué; cada sistema es el
dueño de lo que se ofrece en su pantalla.

**Y en esta entrega la interfaz sólo lee** (#74). Cobrar, cerrar el turno y anular quedan declaradas en
el árbol y no se llaman.

## Qué pasa cuando otro no contesta

| Si está apagado… | La interfaz de `caja` |
|---|---|
| `rentas` | **Nada.** No lo llama. La única lectura que lo toca es la conciliación, y la hace **el backend** de `caja`, que ya contesta con su `porQueNoSeSabe` en vez de un cero |
| `identidad` (el sistema) | **Nada** mientras la copia local tenga lo que tenga. Un permiso concedido durante la caída entra cuando el consumidor vuelva a correr, que es la ventana que ADR-0039 ya declara |
| El emisor (Keycloak) | **No se abre sesión.** La puerta comprueba antes de mandar a nadie que el emisor contesta y, si no, lo dice nombrando la URL — no deja una página en blanco |

La última fila **no es una dependencia nueva**, y conviene no leerla así: `/caja/api/v1/**` ya exige un
token válido y el backend ya valida su firma contra las claves del emisor. Lo que la interfaz añade es
el momento del login. Cuánto sigue sirviendo un token ya emitido con el emisor caído depende de la
caché de claves del backend, y **se mide al conectar la primera pantalla, no se supone aquí**.

## Consecuencias

- **ADR-0030 §3 se matiza en una línea, no se reemplaza.** Sigue valiendo lo que protegía: un login
  para los cuatro y los permisos pedidos al servidor. Lo que cambia es **qué** servidor: el del
  sistema que dibuja la pantalla.
- **El backend de `caja` gana cinco lecturas** en `kamayuk-caja-seguridad`, y ninguna escritura.
  `CajaController` sigue sin inyectar un solo puerto hacia otro sistema.
- **El catálogo tiene que estar completo antes de filtrar con él.** Medido: los controladores exigen
  siete accesos y `CatalogoDelSistema` siembra tres. Filtrar hoy escondería cuatro hojas a todo el
  mundo, y lo haría con razón — nadie puede abrirlas, porque el guardia tampoco. Se arregla primero
  (#74, fila B1), en `caja` y en el `caja.json` de `identidad`.
- **La frontera se vigila en la interfaz.** Una guarda de `frontend/` prohíbe cualquier prefijo de otro
  sistema en el código servido, y una prueba de navegador cuenta **cero** peticiones a `/rentas`.
- **Si la ventanilla necesita algún día un dato de `rentas`** —la deuda de un contribuyente, por
  ejemplo—, ese día hace falta otro ADR. Éste no deja la puerta entornada.

## Alternativas consideradas

### Leer los permisos de `rentas`, como dice ADR-0030 §3

Rechazada por los dos motivos del contexto: contestaría la matriz de otra copia, y pondría a `rentas`
delante de la ventanilla, que es la salida que ADR-0039 ya descartó.

### Leer los permisos del token

Rechazada por ADR-0013, y por lo mismo que ADR-0039 rechazó su salida 2: una revocación no entra hasta
que el token caduca.

### Pedir un acceso para leer el catálogo, como `rentas`

`rentas` protege `/seguridad/modulos` y `/seguridad/accesos` con accesos propios. Aquí obligaría a
añadirlos a `identidad` y a concedérselos a cada cajero sólo para ver el árbol, y convertiría «no
puede abrir nada» en un 403. Y `SESION_PROPIA` ya se usa así, para lecturas que sólo piden estar
identificado: `EjercicioParametrizadoController` en `catastro` y `ParametrosController` en `normativa`.
