# Decisiones de arquitectura (ADR)

**Ninguna decision propia todavia**, y es correcto que se vea asi en vez de inventarle una: lo que la caja hace lo deciden dos ADR que no son suyos —el camino del dinero (0026), que decide `rentas` porque la imputacion es suya, y el contexto de municipalidad (0028), que es de la plataforma—.

La primera decision propia llegara con **D-17**: a quien se le cobra lo que no es tributo, cuando la caja cobre un puesto de mercado o un nicho.

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
