import { escribir } from '../api/cliente.ts';
import type { ImporteActualizado, PermisosDeLaSesion, ReciboEmitido } from './lecturas.ts';

/**
 * **La única escritura de esta interfaz: anular un cobro** (#100, ADR-0044).
 *
 * <h2>Por qué está sola en su archivo</h2>
 *
 * Porque «se escribe aquí y sólo aquí» tiene que poder comprobarse leyendo el disco, y no
 * confiando en que nadie más lo haga. `verificaciones/solo-lee.test.ts` barre `src/` entero y
 * exige que **este** sea el único archivo que nombre `escribir(`: repartida entre los conectores,
 * la segunda escritura entraría sin que el diff la señalara.
 *
 * ADR-0040 aceptó conectar la ventanilla para leer; ADR-0044 amplía aquello con esta escritura y
 * con ninguna otra. Cobrar, cerrar el turno y explicar un pago siguen declarados en el árbol y sin
 * llamarse.
 *
 * <h2>Lo que viaja, y por qué son cuatro campos y no tres</h2>
 *
 * Los de `PeticionDeAnulacion` del backend, con su misma obligatoriedad: `motivo` es el sustento
 * del acto administrativo —queda en el recibo y se imprime en su duplicado—, `autorizadoPor` y
 * `nDeMemorando` constan si constan, y la `observacion` va **siempre**, porque sin ella no se
 * guarda (regla 10, ADR-0008). El motivo y la observación no son lo mismo y por eso son dos
 * campos: uno lo lee quien tenga el papel, el otro quien lea la bitácora.
 *
 * <h2>Lo que NO se hace aquí</h2>
 *
 * **No se imputa nada, y no se reversa ninguna deuda.** La caja publica el `PagoAnulado` en su
 * buzón, en la misma transacción que el acta, y quien reversa es el sistema que emitió la orden
 * (ADR-0026 §2). Aquí sólo se pide y se lee lo que contestó.
 */

/**
 * `POST /cobros/{nro}/anulacion`, con la variable entre llaves como la escribe su `@PostMapping`.
 *
 * Vive aquí y no en `RUTAS` —que es «las rutas que la ventanilla **lee**»— a propósito: con la
 * escritura metida ahí, el centinela de `camino-a-la-api.test.ts` que exige que toda entrada de
 * `RUTAS` sea un `GET` dejaría de decir eso, y perderíamos la frase que hace que una escritura
 * nueva se vea.
 */
export const RUTA_DE_LA_ANULACION = '/cobros/{nro}/anulacion';

/**
 * **Los accesos cuya `LECTURA` abre la lista de recibos y la ficha de uno**, en este orden.
 *
 * Es la copia de lo que el backend declara: `@RequiereAcceso(acceso = "duplicado_recibo",
 * oTambien = {"anulacion_recibo"}, privilegio = LECTURA)` en `ReciboController.listar` y en
 * `vistaPrevia` (#100). Se escribe aquí para poder decirle a quien mira la pantalla **qué pedir**
 * cuando el backend le niegue la lista, y `verificaciones/el-arbol-cuadra-con-el-backend.test.ts`
 * la compara con el `.java`: si allí se quitara el `oTambien`, esta lista quedaría prometiendo un
 * permiso que ya no abre nada.
 *
 * **Y lo que no alcanza, dicho aquí**: `oTambien` conserva el privilegio —`LECTURA` sobre la propia
 * **o** `LECTURA` sobre la alternativa—, así que una cuenta con `anulacion_recibo: [eliminacion]` y
 * nada más sigue sin poder ver la lista. No es un olvido: es lo que `oTambien` significa, y
 * relajarlo sería inventar un mecanismo nuevo. Lo que hace esta interfaz con esa cuenta es decirlo
 * —ver el segundo impedimento de la acción en `definiciones/tesoreria.ts`— en vez de dejarla
 * mirando una pantalla vacía.
 */
export const ACCESOS_QUE_LEEN_RECIBOS: readonly string[] = ['duplicado_recibo', 'anulacion_recibo'];

/** El acceso del catálogo que abre la anulación, y el privilegio con que su controlador la exige. */
export const ACCESO_DE_LA_ANULACION = 'anulacion_recibo';
export const PRIVILEGIO_DE_LA_ANULACION = 'eliminacion';

/** `PeticionDeAnulacion`: el cuerpo de la escritura, con los nombres del backend. */
export interface PeticionDeAnulacion {
  /** El sustento del acto. Obligatorio. */
  readonly motivo: string;
  /** Quien la autorizó, si consta. */
  readonly autorizadoPor?: string;
  /** El memorando o la resolución que la respalda, si consta. */
  readonly nDeMemorando?: string;
  /** Por qué se anula, para la bitácora (regla 10). Obligatorio. */
  readonly observacion: string;
}

/**
 * `AnulacionResource`: el acta, tal como sale por HTTP.
 *
 * `pagoAnuladoId` es el identificador del evento con el que el sistema de origen reversará, y llega
 * **nulo en caja de tasas**: ahí no hay orden, no hay origen y no hay a quien avisarle.
 */
export interface ActaDeAnulacion {
  readonly numero: string;
  readonly estado: string;
  readonly fecha: string;
  readonly motivo: string;
  readonly autorizadoPor: string | null;
  readonly documentoAutorizacion: string | null;
  readonly usuario: string | null;
  readonly importe: ImporteActualizado;
  readonly pagoAnuladoId: string | null;
  readonly recibo: ReciboEmitido;
}

/**
 * La ruta de la anulación de un cobro, con su número puesto.
 *
 * El número se codifica por lo mismo que en `rutaDelDuplicado`: la serie la pone cada instalación, y
 * uno con una barra dentro partiría la ruta en dos.
 */
export function rutaDeLaAnulacion(numero: string): string {
  return RUTA_DE_LA_ANULACION.replace('{nro}', encodeURIComponent(numero));
}

/**
 * Anula el cobro del recibo `numero` y devuelve el acta que el backend levantó.
 *
 * **No atrapa nada**: un 404 —ese número no existe—, un 409 —ya anulado, o el turno ya cerrado—, un
 * 422 —fuera del día de pago— y un 403 —es de otro cajero y falta `ESPECIAL`— son respuestas
 * distintas que se arreglan en sitios distintos, y quien las convierte en una frase es quien dibuja
 * (`useLaAnulacion.ts`). Tragárselas aquí las haría todas «no se pudo».
 */
export function anularElCobro(numero: string, peticion: PeticionDeAnulacion): Promise<ActaDeAnulacion> {
  return escribir<ActaDeAnulacion>(rutaDeLaAnulacion(numero), peticion);
}

/** Lo que la sesión puede hacer con los recibos, sacado de la matriz que contestó el backend. */
export interface LoQuePuedeLaSesion {
  /** Si tiene el privilegio con que `POST /cobros/{nro}/anulacion` se exige. */
  readonly puedeAnular: boolean;
  /** Si alguno de los accesos con que `GET /recibos` se abre le da `lectura`. */
  readonly puedeLeerRecibos: boolean;
}

/**
 * Lo que esta cuenta puede, **con la misma regla que el guardia del backend** y no con una parecida.
 *
 * Anular exige `eliminacion` sobre `anulacion_recibo`, ni más ni menos: `GuardiaDeAcceso` pregunta
 * por ese privilegio exacto y no conoce ninguna jerarquía entre los siete. Y leer recibos exige
 * `lectura` sobre uno de los dos accesos que el controlador declara.
 *
 * Una interfaz que ofrece lo que el guardia luego niega —o que esconde lo que el guardia permite—
 * es peor que no filtrar (ADR-0042).
 */
export function loQuePuedeLaSesion(permisos: PermisosDeLaSesion): LoQuePuedeLaSesion {
  const tiene = (acceso: string, privilegio: string) => {
    const suyos = permisos[acceso];
    return Array.isArray(suyos) && suyos.includes(privilegio);
  };
  return {
    puedeAnular: tiene(ACCESO_DE_LA_ANULACION, PRIVILEGIO_DE_LA_ANULACION),
    puedeLeerRecibos: ACCESOS_QUE_LEEN_RECIBOS.some((acceso) => tiene(acceso, 'lectura')),
  };
}
