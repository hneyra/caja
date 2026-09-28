# Las filas de la copia sin sujeto de `identidad`

> **De [#125](https://github.com/hneyra/caja/issues/125) y su seguimiento.** Qué se decidió con las
> filas de `usuario` y `grupo` que no llevan `identidad_sujeto_id`, a quién alcanza, qué hay que
> hacer antes y después de desplegarlo, y lo que queda sin cerrar. Las medidas de `identidad` son de
> `identidad@6c5e433`; las de `rentas`, de `rentas@f768c79`.

## 1. La decisión: un plazo, un aviso y ninguna escritura

Desde V5 (#111) la copia casa por el id estable de `identidad`, y toda fila que el aplicador
inserta lo lleva. Una fila **sin** él sólo puede ser de antes de V5, y desde aquí no se distingue la
legítima que espera su primer evento de la huérfana que no lo recibirá nunca: `identidad` no publica
más que su buzón.

Lo decidido vive en [`PlazoDeAdopcion`](../../backend/kamayuk-caja-seguridad/src/main/java/kamayuk/caja/seguridad/dominio/PlazoDeAdopcion.java):

- **El guardia y la matriz de la sesión** dejan de conceder por una fila sin sujeto pasados
  **7 días** de su `sin_sujeto_desde`, que V6 puso al migrar
  ([`ComprobadorDeAccesoJdbc`](../../backend/kamayuk-caja-seguridad/src/main/java/kamayuk/caja/seguridad/infraestructura/ComprobadorDeAccesoJdbc.java#L103),
  y la misma condición en
  [`LecturaDeLaCopiaLocalJdbc`](../../backend/kamayuk-caja-seguridad/src/main/java/kamayuk/caja/seguridad/infraestructura/LecturaDeLaCopiaLocalJdbc.java#L169)).
  El límite es inclusivo y en Lima: una fila fechada el día *D* concede hasta el día *D*+7 incluido
  y deja de conceder el *D*+8. Sin sujeto y **sin** fecha no concede nunca.
- **Mientras corre el plazo**, cada corrida del consumidor —cada cinco minutos— manda un ERROR al
  responsable con la lista de las que todavía conceden y el día en que dejan de hacerlo; y en cada
  corrida del día en que una cruza el plazo, un WARN la nombra (ninguna corrida del día siguiente).
- **No se escribe nada para aplicar el plazo.** La regla 12 deja un solo escritor de estas tablas,
  `AplicarUnEventoDeIdentidad`, que escribe lo que llega por el buzón; y un `UPDATE` desde el
  migrador muere bajo RLS ([hallazgo 4](hallazgos-de-rls.md)). Además, no hay valor por fila que
  calcular: el id de `identidad` de una fila vieja no se sabe aquí.
- **Una constante y no una propiedad**, porque la leen el guardia y la matriz en `web` y el aviso en
  `batch`: con una propiedad por proceso, el aviso podría prometer un día que el guardia ya niega.

**Con una excepción, que es el seguimiento de #125: la fila cuya clave choca con un alta deja de
conceder en el acto.** Un `*_DADO_DE_ALTA` cuya clave ya tiene una fila sin sujeto es de un sujeto
cuya alta no entró aquí y que entra con esa clave (`preferred_username`); el guardia casa por
`u.cuenta`, así que dentro del plazo la fila le concedería lo que tenga, sin saber si era suya. El
aplicador aparta ese alta y, **en la misma transacción**, le quita a la fila su `sin_sujeto_desde`
([`apartar`](../../backend/kamayuk-caja-seguridad/src/main/java/kamayuk/caja/seguridad/aplicacion/AplicarUnEventoDeIdentidad.java#L254)),
sólo si sigue sin sujeto. Lo mismo con cualquier evento de un sujeto cuya alta ya está apartada que
caiga sobre una fila sin sujeto
([`exigirQueSuAltaNoSeHayaApartado`](../../backend/kamayuk-caja-seguridad/src/main/java/kamayuk/caja/seguridad/aplicacion/AplicarUnEventoDeIdentidad.java#L795)).
El motivo del apartado lo dice delante —«La fila N de usuario DEJA DE CONCEDER DESDE YA»—, para que
no lo corte el tope de 400 de `identidad_evento_muerto.motivo`. Lo escribe el único escritor de la
regla 12; la tabla sale de su enumerado, nunca del texto del evento. Falla cerrado: si la fila era
de esa misma persona —un alta que llegó tarde—, no tiene remedio hoy (§4).

## 2. A quién alcanza: a toda fila de antes de V5 que nadie tocó

El plazo no distingue huérfanas de legítimas, así que **toda** fila de antes de V5 que ningún evento
adoptó deja de conceder al octavo día. En una base implantada después de #111 no hay ninguna (lo
mide `ImplantacionDeCeroJdbcTest`); en una instalación anterior, entran:

- **El administrador.** Además de perder el acceso, la implantación de esta caja —que corre en cada
  despliegue y comprueba al administrador con el mismo comprobador
  ([`comprobarQueLaCopiaLlego`](../../backend/kamayuk-caja-seguridad/src/main/java/kamayuk/caja/seguridad/aplicacion/ImplantarMunicipalidad.java#L227))—
  **falla** en el primer despliegue después del plazo, con un mensaje que habla de que su matriz de
  permisos no llegó y no del plazo.
- **Las personas que llegan por `rentas`.** `rentas` llama a esta caja reenviando el `Authorization`
  de quien atiende
  ([`ClienteHttpDeCaja`](https://github.com/hneyra/rentas/blob/main/backend/kamayuk-rentas-tesoreria/src/main/java/kamayuk/rentas/tesoreria/infraestructura/ClienteHttpDeCaja.java#L248)),
  no con una cuenta de servicio, así que `POST /ordenes-de-cobro` —que exige `caja_tributaria` con
  `REGISTRO`
  ([`OrdenDeCobroController`](../../backend/kamayuk-caja-nucleo/src/main/java/kamayuk/caja/nucleo/infraestructura/web/OrdenDeCobroController.java#L51))—
  se autoriza contra la fila de **esa persona** en esta copia: si no se adoptó, la emisión de
  órdenes desde `rentas` se le para con un 403.
- **Las cuatro cuentas de servicio.** Son filas de esta copia —las da de alta y las afilia a
  «Consumidores del buzon» la implantación de `identidad`— y caen igual. Medido en `rentas`, ninguna
  llamada suya a esta caja va con su token de servicio; `catastro` y `normativa` no se midieron.
- **Los grupos.** Un grupo sin adoptar deja de conceder lo suyo a **todos** sus miembros, adoptados
  o no —les queda sólo lo que tengan como excepción propia—: el comprobador exige el sujeto (o el
  plazo) del grupo en el `JOIN`
  ([línea 87](../../backend/kamayuk-caja-seguridad/src/main/java/kamayuk/caja/seguridad/infraestructura/ComprobadorDeAccesoJdbc.java#L87)).

## 3. Qué hacer en una instalación anterior a #111 (por ejemplo, `stg`)

**Antes de desplegar**:

1. **Dejar vacío el buzón.** El `CronJob` corre cada cinco minutos; la última vuelta tiene que decir
   «quedan 0 en el buzon de `identidad`». Un `*_DADO_DE_ALTA` todavía pendiente cuya clave ya tenga
   una fila sin sujeto —por ejemplo, una de las que sembraba aquí la implantación antes de la etapa
   5— se apartaría con esta versión y su fila **dejaría de conceder en el acto**, sin remedio dentro
   de las reglas (§4). Con la versión anterior, ese mismo alta la adopta.
2. **Conviene redesplegar antes la implantación de `identidad`**: en cada corrida vuelve a afiliar
   al administrador a su grupo y a las cuatro cuentas de servicio al suyo, y vuelve a fijar los
   permisos del grupo de administración
   ([`ImplantarMunicipalidad`](https://github.com/hneyra/identidad/blob/6c5e433/backend/kamayuk-identidad-nucleo/src/main/java/kamayuk/identidad/nucleo/aplicacion/ImplantarMunicipalidad.java#L360),
   líneas 360–489). Esos eventos adoptan aquí esas filas y sus grupos.

**Después de desplegar, dentro del plazo**, por cada fila que liste el ERROR «LA COPIA LOCAL DE LA
AUTORIZACION TIENE N FILA(S) SIN SUJETO…»:

3. Comprobar en `identidad` que es **el mismo sujeto** —su id, su fecha de alta anterior a V5, y en
   su auditoría que la clave no cambió de manos—.
4. Si lo es, hacer en `identidad` un acto que publique un evento que la nombre **por esa misma
   clave** sin cambiar lo que concede. En `identidad@6c5e433` son: volver a habilitarla
   (`POST /seguridad/usuarios/{id}/reactivacion` o `/grupos/{id}/reactivacion`, que no exigen que
   estuviera inhabilitada), fijarle la vigencia que ya tiene (`PUT …/{id}/vigencia`), volver a
   afiliar una cuenta a un grupo **en el que ya está** (`POST /seguridad/grupos/{grupo}/miembros`,
   que adopta a la cuenta **y** al grupo) o volver a fijar, con la misma matriz, un permiso que ya
   tiene sobre una opción **de `caja`** (`PUT …/{id}/permisos`). Cada uno lleva su observación
   (regla 10). **No** sirven: inhabilitarla —la adoptaría inhabilitada—, fijarle a una cuenta un
   permiso que no tenía —crea una excepción que sustituye a sus grupos en ese acceso— ni un permiso
   de otro sistema, que aquí se ignora antes de casar
   ([línea 536](../../backend/kamayuk-caja-seguridad/src/main/java/kamayuk/caja/seguridad/aplicacion/AplicarUnEventoDeIdentidad.java#L536)).
   La corrida siguiente la adopta y deja de listarla.
5. Si no lo es, no tocarla: deja de conceder sola el día que dice el aviso.

## 4. El alta que choca: falla cerrado, y hoy no tiene remedio

Cuando un `*_DADO_DE_ALTA` choca con una fila sin sujeto, el alta se aparta, la fila deja de
conceder, y **todo evento siguiente de ese sujeto se aparta también**. Dentro de las reglas de hoy
no hay salida:

- `identidad` no vuelve a publicar un alta: sólo la emite con un id nuevo
  ([`AdministrarSeguridad`](https://github.com/hneyra/identidad/blob/6c5e433/backend/kamayuk-identidad-nucleo/src/main/java/kamayuk/identidad/nucleo/aplicacion/AdministrarSeguridad.java#L255),
  `registrarUsuario` y `registrarGrupo`).
- Un `*_MODIFICADO` con una clave **libre** insertaría su fila
  ([`casarParaEscribir`](../../backend/kamayuk-caja-seguridad/src/main/java/kamayuk/caja/seguridad/aplicacion/AplicarUnEventoDeIdentidad.java#L765),
  la rama «ninguna de las dos»), pero `identidad@6c5e433` **no tiene ninguna operación que cambie una
  clave**: `Usuario` y `Grupo` sólo se inhabilitan, se habilitan o cambian de vigencia, y los únicos
  `PUT` de su API son la vigencia y los permisos.
- `kamayuk_app` no tiene `UPDATE` ni `DELETE` sobre `identidad_evento_muerto` (V3), y la regla 12 no
  deja escribir las cuatro tablas fuera del aplicador.

**Hay que decidirlo**; mientras tanto, esa persona no entra en esta caja. Con la API de hoy, un
sujeto nuevo no puede reutilizar una clave que `identidad` ya tiene (`usuario_cuenta_uq`, sin
borrados ni cambios de clave), así que el choque sólo nace de datos que preceden a esa API —las
filas que sembraba aquí la implantación antes de la etapa 5, por ejemplo— o de SQL directo sobre
`identidad`. Los renombrados de los que se defienden #111 y #125 vienen del **contrato** del evento
—un `*_MODIFICADO` puede traer otra clave—, no de ningún camino de la API actual. Por eso el paso 1
de §3 importa.

## 5. Lo que queda sin cerrar, dicho

- **La herencia de antes de V5.** Si el aplicador anterior a #111 fundió por
  `ON CONFLICT … DO UPDATE` el alta de un sujeto en una fila que ya tenía esa clave, ese alta está en
  `identidad_evento_aplicado` y no en `identidad_evento_muerto`: su primer evento adopta la fila con
  todo lo que tenía. Si la fila era de otro, lo hereda. Con la API de `identidad@6c5e433` eso sólo
  pasa con filas que preceden a esa API —y la que sembraba aquí la implantación antes de la etapa 5
  era de esa misma persona—.
- **Las huérfanas adoptadas entre el despliegue de #111 y éste.** Con #111 un alta todavía adoptaba
  por la clave; lo que adoptó ya lleva sujeto, así que ni el plazo ni `filasSinSujeto` la ven. Es
  [#137](https://github.com/hneyra/caja/issues/137).
- **`GET /seguridad/sesion` sigue enseñando el nombre de la fila**: `usuarioPorCuenta` busca por la
  cuenta sin mirar sujeto ni plazo
  ([`LecturaDeLaCopiaLocalJdbc`](../../backend/kamayuk-caja-seguridad/src/main/java/kamayuk/caja/seguridad/infraestructura/LecturaDeLaCopiaLocalJdbc.java#L112)),
  así que a quien entra con una clave reasignada le saluda con el nombre del anterior, con la matriz
  vacía.
- **Una fila retirada vuelve a conceder sólo si la adopta un evento** de un sujeto cuya alta no se
  apartó aquí; su clave queda tomada en esta copia mientras tanto.
- **Los textos de V6 no dicen lo de la retirada.** Su comentario de cabecera dice que una fila sin
  sujeto y sin fecha «la escribio alguien por fuera» del aplicador, y que la adopta «cualquier
  modificacion, afiliacion o permiso»; desde este seguimiento también puede ser una fila que el
  aplicador retiró, y la adopta un evento que la nombre por su clave (§3, paso 4). Una migración
  aplicada no se edita —Flyway valida su suma—, y corregir sólo un comentario no justifica una V7.
- **El mensaje de la implantación** cuando el administrador perdió el acceso por el plazo no nombra
  #125 (§2).
