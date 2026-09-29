# Las huérfanas que un sujeto nuevo ya adoptó

> **De [#137](https://github.com/hneyra/caja/issues/137).** Las filas de `usuario` y `grupo` que
> **ya llevan** `identidad_sujeto_id` y que lo ganaron sobre la fila de otro sujeto: qué son, qué se
> puede saber de ellas desde aquí, con qué criterio se listan, qué se le escapa a ese criterio y
> cómo se resuelven. Las medidas de `identidad` son de `identidad@6c5e433`. Es la otra mitad de
> [#125](https://github.com/hneyra/caja/issues/125): aquel mira las filas **sin** sujeto; éste, las
> que lo tienen y no deberían tener lo que conceden.

## 1. Qué son, y por qué nadie las veía

Un alta de `identidad` fue a parar a una fila que ya era de otro sujeto en dos ventanas:

1. **Antes de V5.** El aplicador de la etapa 4 (`5eacae1`) escribía un alta con
   `ON CONFLICT (municipalidad_id, cuenta) DO UPDATE`. «jperez» (sujeto 100) renombrado en
   `identidad` dejaba aquí su fila vieja con la clave «jperez» —el defecto de #111—, y el alta de
   un «jperez» nuevo (sujeto 200) se fundía en ella **con los miembros y los permisos del 100
   dentro**. Ese alta quedó en `identidad_evento_aplicado`, no en `identidad_evento_muerto`, así que
   el primer evento del 200 después de V5 le estampa su id: `exigirQueSuAltaNoSeHayaApartado` sólo
   niega el alta **apartada**, y a propósito (lo mide
   `AplicarUnEventoDeIdentidadJdbcTest.laFilaDeAntesDeV5ConSuAltaAplicadaSeAdopta`: contar la
   aplicada dejaría sin remedio a toda fila legítima de antes de V5). **Esta ventana no está
   cerrada**: la adopción ocurre el día en que el 200 recibe su primer evento, que puede ser mañana.
2. **Entre #111 y la ronda 1 de #125 (#130).** Un alta todavía adoptaba por la clave una fila sin
   sujeto; lo que adoptó ya lleva sujeto.

En los dos casos la fila **lleva sujeto**, así que ni `filasSinSujeto` —que mira
`identidad_sujeto_id IS NULL`— ni el plazo de
[`PlazoDeAdopcion`](../../backend/kamayuk-caja-seguridad/src/main/java/kamayuk/caja/seguridad/dominio/PlazoDeAdopcion.java)
la ven, y concede para siempre lo del sujeto anterior a quien entra con esa clave.

**¿Puede haber alguna?** Con `identidad@6c5e433`, no nacen: `Usuario` y `Grupo` sólo se
inhabilitan, se habilitan o cambian de vigencia —el `UPDATE usuario SET cuenta` de su
`AdministracionRepositoryJdbc` reescribe la clave que ya tenía—, `usuario_cuenta_uq` y
`grupo_nombre_uq` impiden reutilizar una clave viva y no hay borrados. Así que una clave reasignada
sólo puede venir de **versiones anteriores de `identidad`** (su historia anterior a `6c5e433` no
se midió), de **datos cargados por fuera de su API** —una importación, SQL directo sobre su base— o
de un emisor que use lo que el contrato del evento permite: un `*_MODIFICADO` puede traer otra
clave. En una base implantada después de la etapa 5 y alimentada sólo por `identidad@6c5e433` no
hay ninguna, y está medido (`HuerfanasYaAdoptadasJdbcTest.unaImplantacionDeCeroNoDejaNinguna`, con
la corriente de eventos de verdad de una implantación).

## 2. Lo que desde aquí no se puede saber

«¿Era esta fila de otro sujeto antes de que la adoptara el que la tiene?» no tiene respuesta exacta
en esta copia:

- `identidad_evento_aplicado` guarda `tipo`, `sujeto_id`, `secuencia`, `huella` y `aplicado_en`;
  **ni la clave ni el cuerpo** (V3).
- `miembro` y `permiso` no dicen qué evento —ni qué sujeto— los escribió.
- `identidad` no publica más que su buzón (`GET /eventos/pendientes`, `POST /eventos/acuses`): no
  hay consulta por clave ni historia de claves.

## 3. El criterio: lo que concede es anterior al alta de quien la tiene

[`HuerfanasYaAdoptadas`](../../backend/kamayuk-caja-seguridad/src/main/java/kamayuk/caja/seguridad/aplicacion/HuerfanasYaAdoptadas.java)
—sólo lee, como `kamayuk_app` y bajo la política— lista una fila si:

- está **habilitada**;
- su sujeto tiene su **alta** en `identidad_evento_aplicado` —`USUARIO_DADO_DE_ALTA` o
  `GRUPO_DADO_DE_ALTA` según la tabla, la primera—, aplicada en el instante *A*;
- y **concede algo que entró en esta copia antes de *A* − 1 min**: para una cuenta, una afiliación
  activa (`miembro.fecha_alta`) o una excepción propia con algún privilegio
  (`permiso.fecha_registro`); para un grupo, un miembro activo o un permiso con algún privilegio;
- **salvo** que eso sea anterior al **primer evento aplicado en la municipalidad** + 1 min (§3.2).

### 3.1 Por qué funciona

Una fila que nace de su propia alta no puede tener nada anterior a ella: el aplicador **pospone**
(`TodaviaNo`) toda afiliación o permiso que nombre a quien esta copia todavía no tiene. Y las dos
fechas las pone **esta copia** —el alta, con el `Clock` del aplicador; lo demás, con el `now()` de
su transacción—, así que no dependen de lo que tarde el buzón. Lo que concede y es anterior al alta
sólo pudo ponerlo otro sujeto, o algo que no es el aplicador.

**Se mira lo que concede y no la fila**, por tres motivos: `grupo` no tiene fecha propia; una fila
que no concede nada heredado no es un riesgo aunque fuera de otro —el alta le sobrescribió nombre,
habilitado y vigencias—; y es lo único que se puede deshacer desde `identidad`, de modo que
retirarlo saca la fila de la lista (§4).

**Un minuto** no es un plazo de negocio ni el retraso del buzón: es cuánto pueden discrepar el reloj
de la aplicación (que fecha el acuse) y el de la base (que fecha la fila con el comienzo de su
transacción). Con NTP discrepan en milisegundos.

### 3.2 Lo que no cuenta: lo sembrado antes de la primera corrida

Hasta la etapa 5 la implantación de esta caja sembraba al administrador, «Administracion del
sistema», su afiliación y sus permisos, y el alta del **mismo** administrador en `identidad` se
fundía después en esa fila —lo exige `kamayuk.implantacion.administrador`—, a segundos si la
primera pasada corría en el mismo Job, o días después si `identidad` no contestaba. Lo sembrado es
anterior al alta, y la fila es de esa misma persona. Antes del primer evento aplicado en la
municipalidad **ningún sujeto de `identidad` pudo escribir nada aquí**, así que no pudo dejar nada
que heredar: eso no cuenta. Sin esta exclusión, toda instalación sembrada antes de la etapa 5
gritaría por su administrador cada cinco minutos, para siempre (lo mide
`loSembradoAntesDeLaPrimeraCorridaNoCuenta`).

### 3.3 Lo que se le escapa, y lo que lista de más

| | Caso | Por qué |
|---|---|---|
| **No la ve** | La historia entera aplicada en menos de un minuto —un buzón atrasado que entra en una sola corrida— | Las fechas son de esta copia: todo queda a milisegundos |
| **No la ve** | Lo que concede, heredado de una fila **sembrada** que quedó huérfana | Es anterior a la primera corrida (§3.2) |
| **No la ve** | Un sujeto cuya alta no pasó por esta copia —adoptado por un `*_MODIFICADO`, una afiliación o un permiso— | Sin alta no hay con qué comparar |
| **No la ve** mientras dure | Una fila inhabilitada, o lo heredado que hoy no concede —una afiliación dada de baja, una excepción que niega— | No es un riesgo hoy; si se vuelve a activar para el sujeto nuevo, conserva su fecha vieja y vuelve a salir |
| **La lista de más** | Lo heredado que `identidad` **volvió a confirmar** para el sujeto nuevo: afiliarlo al mismo grupo, fijarle el mismo permiso | Es la misma fila con su fecha original —`ON CONFLICT … DO UPDATE` no toca `fecha_alta` ni `fecha_registro`—: «heredado» y «heredado y aceptado» no se distinguen, y no hay dónde anotar lo segundo sin un segundo escritor (regla 12). Remedio: §4, camino B |
| **La lista de más** | Un permiso que la implantación de la etapa 4 sembró en un redespliegue **posterior** a la primera corrida, si el alta de ese grupo entró aún más tarde | Raro, y el mismo remedio |
| **La lista de más** | Dos relojes que discrepen más de un minuto | Sería otro defecto, y más grave |

## 4. La decisión: avisar cada corrida y resolver en `identidad`; ninguna escritura aquí

**El aviso.** [`AvisarDeLasHuerfanasYaAdoptadas`](../../backend/kamayuk-caja-seguridad/src/main/java/kamayuk/caja/seguridad/aplicacion/AvisarDeLasHuerfanasYaAdoptadas.java)
es un `ApplicationRunner` del perfil `batch`, ordenado **justo detrás** del consumidor: corre en el
`CronJob` cada cinco minutos y en el Job de implantación, con la municipalidad de la cuenta de
servicio —la misma regla que el consumidor—, y no corre si la pasada murió porque `identidad` no
contestó. Si hay candidatas, **una** línea de ERROR al responsable
(`KAMAYUK_CAJA_RESPONSABLE`, `KAMAYUK_CAJA_CANAL`) nombra cada fila —tabla, clave, id aquí, sujeto,
cuándo entró su alta— y cada cosa heredada con su fecha. No falla la corrida. No hay endpoint: el
registro es donde ya miran los otros avisos del consumidor. Es un runner aparte, y no una línea más
de `CorrerElConsumidorDeIdentidad`, para no tocar el consumidor ni el aplicador mientras #125 y sus
seguimientos los cambian; el efecto es el mismo.

**Por qué ninguna escritura automática.** La regla 12 deja un solo escritor de estas tablas,
`AplicarUnEventoDeIdentidad`, que escribe lo que `identidad` publica y **no decide nada**. Y aquí
no hay una certeza con la que decidir: quitarle a la fila lo que parece heredado dejaría a la copia
en desacuerdo con `identidad` sobre lo que ésta **sí** concedió al sujeto nuevo —el defecto
contrario, igual de silencioso—. El seguimiento de #125 (PR #145) retira una fila, pero una
**sin** sujeto y en la misma transacción de un alta que choca con su clave, que es la prueba de que
otro sujeto la reclama; aquí no hay ninguna prueba así.

**El procedimiento**, por cada fila que liste el aviso:

1. **Comprobar en `identidad`** la auditoría de esa clave: quién la tuvo, cuándo cambió de manos y
   cuándo se creó el sujeto que la tiene hoy. Si nunca cambió de manos, es un falso positivo de
   §3.3: se resuelve por el camino B o se acepta que siga saliendo.
2. **Camino A — retirar lo heredado.** En `identidad`, un acto por cada cosa que el aviso lista,
   cada uno con su observación (regla 10):
   - cuenta, «miembro «G»»: desafiliarla, `POST /seguridad/grupos/{G}/miembros` con
     `"activo": false`. `identidad` lo acepta aunque ese sujeto nunca estuviera en «G» allí —guarda
     un miembro inactivo y publica `MIEMBRO_DESAFILIADO` (`AdministrarSeguridad.desafiliar`)—, y aquí
     da de baja la afiliación heredada;
   - cuenta, «permiso «acceso»»: `PUT /seguridad/usuarios/{id}/permisos` con ese acceso de `caja` y
     `privilegios: []`. **Ojo**: en `identidad` eso es una **negación** que sustituye a lo que sus
     grupos le den en ese acceso, y una excepción no se puede quitar
     (`PermisosDeUsuarioController`). Si la persona debe tener ese acceso por sus grupos, va el
     camino B;
   - grupo, «miembro «cuenta»»: desafiliar esa cuenta del grupo, igual que arriba;
   - grupo, «permiso «acceso»»: `PUT /seguridad/grupos/{id}/permisos` con `privilegios: []` —«este
     grupo no otorga nada aquí»—.

   La corrida siguiente ya no la lista (`retirarLoHeredadoLaSacaDeLaLista`).
3. **Camino B — retirar la fila.** Inhabilitar el sujeto en `identidad`
   (`POST /seguridad/usuarios/{id}/baja` o `/grupos/{id}/baja`) y darle a la persona o al grupo
   **otra clave**: su alta nace aquí como una fila nueva y limpia. La corrida siguiente ya no la
   lista (`inhabilitarLaSacaDeLaLista`). Es el único camino cuando algo heredado debe **quedarse**
   con el sujeto nuevo: volver a confirmarlo en `identidad` conserva aquí su fecha vieja y la fila
   sigue saliendo (§3.3).

## 5. Lo que haría falta para dejar de adivinar

Lo que falta aquí es **la historia de las claves**: qué sujetos tuvieron una clave y desde cuándo.
`identidad` la tiene en su auditoría, y con ella esta copia sabría exactamente qué filas tuvieron
otro dueño antes del sujeto que las tiene —sin el falso positivo de lo sembrado ni el ciego del
buzón atrasado— y podría negarse a adoptarlas en vez de avisar después.

**Decisión: no se pide todavía, y la petición queda escrita.** Con `identidad@6c5e433` esa historia
está vacía —ninguna clave cambia de manos—, así que un endpoint nuevo devolvería nada en toda
instalación alimentada por la API de hoy. Se abre en `identidad` el día que una instalación real
liste una candidata que resulte verdadera, con este texto:

> *Publicar, para las cuentas de servicio de los consumidores, la historia de cada clave de
> `usuario` y `grupo`: `GET /seguridad/claves/{usuario|grupo}/{clave}/historia` →
> `[{sujetoId, desde, hasta}]`, sacada de la auditoría. Sin ella, un consumidor que heredó una fila
> por la clave antes de casar por el id no puede saber de quién era (`caja`#137).*

## 6. Lo que queda sin cerrar

- **Impedir la adopción en vez de avisar de ella.** La ventana 1 sigue abierta (§1): el aplicador
  podría negarse a adoptar una fila sin sujeto que ya concede algo anterior al alta **aplicada** de
  quien la reclama —con la misma exclusión de lo sembrado—, y apartar el evento como hace #125 con
  el alta apartada. Toca `AplicarUnEventoDeIdentidad`, que #125 y sus seguimientos están cambiando;
  va aparte.
- **Lo aceptado no se puede anotar** (§3.3): sin un segundo escritor ni una tabla nueva, una
  herencia que `identidad` confirmó sigue saliendo hasta el camino B.
