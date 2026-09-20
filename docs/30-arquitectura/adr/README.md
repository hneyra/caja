# Decisiones de arquitectura (ADR)

**Tres decisiones propias, y ninguna es la que este indice esperaba.** Lo que la caja hace lo siguen decidiendo dos ADR que no son suyos —el camino del dinero (0026), que decide `rentas` porque la imputacion es suya, y el contexto de municipalidad (0028), que es de la plataforma—. Las tres propias son de su interfaz.

| # | Decision | Estado |
|---|---|---|
| [0040](ADR-0040-la-ventanilla-se-conecta.md) | Si la ventanilla se conecta, y que hace falta antes | **Aceptado** — se conecta, solo para leer (#74) |
| [0042](ADR-0042-la-ventanilla-lee-su-propia-copia.md) | La ventanilla compone su sesion desde su propia copia, y no habla con nadie mas | **Aceptado** |
| [0044](ADR-0044-la-ventanilla-anula-donde-esta-el-recibo.md) | La ventanilla anula donde esta el recibo, y esa es su primera escritura | **Aceptado** — amplia la 0040 (#100) |

La **0041** no falta: es de `infrastructure` (Grafana detras del realm de operacion), y la **0043** es de `normativa`. La numeracion es del producto, no de cada repositorio.

> **Este indice predecia que la primera propia seria D-17** —a quien se le cobra lo que no es tributo—, y se equivoco: llego antes una que nadie habia planteado, porque el despliegue la hizo urgente. La prediccion se deja escrita en vez de borrarla; una tabla que solo contiene aciertos no dice nada sobre lo que cuesta prever.

D-17 sigue abierta.

Un ADR registra una decision con su contexto y sus consecuencias. **No se editan una vez
aceptados**: si una decision cambia, se escribe otro ADR que declare obsoleto al anterior. El
historial de por que se hizo algo vale mas que la coherencia del documento.

## Los que enlaza, y no copia

Viven en el repositorio de quien toma la decision. **Aqui solo esta el enlace**: una
copia seria un segundo ADR el dia que alguien edite uno de los dos.

| # | Decision | Vive en | Por que le importa a este repositorio |
|---|---|---|---|
| [0001](https://github.com/hneyra/infrastructure/blob/main/docs/30-arquitectura/adr/ADR-0001-plataforma-backend.md) | Plataforma del backend: Spring Boot 4 sobre Java 25 | `infrastructure` | la plataforma del backend que corre |
| [0002](https://github.com/hneyra/infrastructure/blob/main/docs/30-arquitectura/adr/ADR-0002-estrategia-multi-tenant.md) | Esquema compartido con Row Level Security | `infrastructure` | el aislamiento, que es el riesgo numero uno |
| [0004](https://github.com/hneyra/infrastructure/blob/main/docs/30-arquitectura/adr/ADR-0004-almacenamiento-de-datos.md) | PostgreSQL, con particionado por ejercicio | `infrastructure` | el motor |
| [0008](https://github.com/hneyra/infrastructure/blob/main/docs/30-arquitectura/adr/ADR-0008-auditoria-heredada-del-manual.md) | Auditoría con observación obligatoria, como en el sistema original | `infrastructure` | la observacion obligatoria (regla 10) |
| [0026](https://github.com/hneyra/rentas/blob/main/docs/30-arquitectura/adr/ADR-0026-el-camino-del-dinero.md) | El camino del dinero: dos transacciones, un outbox, y la imputación en rentas | `rentas` | **el camino del dinero**: lo decide rentas, y es lo que caja ejecuta |
| [0028](https://github.com/hneyra/infrastructure/blob/main/docs/30-arquitectura/adr/ADR-0028-el-tenant-no-cruza-por-http.md) | El contexto de municipalidad no cruza por HTTP: token delegado, jamás una cabecera | `infrastructure` | el tenant no cruza por HTTP |
| [0029](https://github.com/hneyra/infrastructure/blob/main/docs/30-arquitectura/adr/ADR-0029-cuatro-sistemas-separados.md) | Cuatro sistemas separados: `catastro`, `rentas`, `normativa` y `caja` | `infrastructure` | por que hay cuatro sistemas |
| [0030](https://github.com/hneyra/infrastructure/blob/main/docs/30-arquitectura/adr/ADR-0030-cuatro-interfaces-una-sesion.md) | Cuatro interfaces, una sesión, y las librerias comunes que impiden que sean cuatro productos | `infrastructure` | su frontend |
| [0032](https://github.com/hneyra/infrastructure/blob/main/docs/30-arquitectura/adr/ADR-0032-el-esquema-nace-en-baseline.md) | El esquema de cada sistema nace en un baseline; la historia se queda en `sgtm` | `infrastructure` | su baseline |

El reparto entero, con su criterio, esta en [GOB-05 §4](https://github.com/hneyra/sgtm/blob/migracion-a-microservicios/docs/00-gobierno/inventario-del-corte.md).

Decisiones **pendientes**: [GOB-02](https://github.com/hneyra/sgtm/blob/migracion-a-microservicios/docs/00-gobierno/decisiones-abiertas.md).

## Plantilla

```markdown
# ADR-000X — Titulo

**Estado:** Propuesto | Aceptado | Obsoleto (reemplazado por ADR-000Y)
**Fecha:** AAAA-MM-DD

## Contexto
## Decision
## Consecuencias
## Alternativas consideradas
```

El estado tambien puede ir como fila de una tabla de metadatos (`| Estado | Aceptado |`), que es
la forma de ADR-0017 en adelante; lo que no cambia es el vocabulario: **Propuesto**, **Aceptado**
u **Obsoleto**, siempre con esa letra.

## La numeracion NO se reinicia

El ADR nuevo de este repositorio es el **0033**, no el 0001. Los treinta y dos existen y estan
repartidos; empezar de nuevo daria dos `ADR-0001` distintos en el mismo producto, y el dia que
alguien cite «ADR-0004» habria que preguntar de cual habla.

**Y el siguiente se elige mirando los SEIS arboles, no este.** El 0044 salio de contar lo que habia
el 2026-09-20 en `infrastructure`, `rentas`, `catastro`, `normativa`, `identidad` y aqui: el mayor
era el 0043, de `normativa`. Un numero elegido leyendo solo este indice habria sido el 0043 otra
vez, y el choque no da ningun error — da dos documentos distintos con el mismo nombre.
