import { MI_MODULO, RECIBOS } from "@/datos";
import type { Destino } from "@/marco/destino";
import { COBRO_NUEVO } from "@/marco/destino";
import { MENSAJE_DE_COBRO_NUEVO } from "@/marco/rotulos";

/**
 * Lo que la paleta busca: los recibos del turno y las diez acciones del modulo.
 *
 * Portado de `TesoreriaV6.dc.html` — las diez acciones de las lineas 1466-1477, el filtrado de
 * las 1478-1484 y el pie de la 1727. Son funciones puras sobre una consulta, y por eso viven
 * aparte del componente: lo que la paleta encuentra se puede comprobar sin dibujar nada.
 *
 * <h2>Por que esto no vive en `src/datos/`</h2>
 *
 * Mismo criterio que `rotulos.ts`: `src/datos/` guarda **lo que las pantallas ensenan** —las
 * filas, las cifras, los iconos—, y estas diez son comandos del propio marco, con su destino
 * pegado. Lo que si sale de `src/datos/` es lo que se busca: `RECIBOS`.
 *
 * <h2>El tope de nueve, y por que el issue dice otra cosa</h2>
 *
 * El artboard corta en **nueve** (`slice(0, 9)`, linea 1484), asi que con la consulta vacia se
 * ven **nueve de las diez acciones** y «Recibos anulados» queda fuera hasta que se teclea algo.
 * El criterio 2 del issue pide ver «las 10 acciones» y a la vez cita el tope de 9 de esa misma
 * linea: las dos cosas no pueden ser ciertas. Medido ejecutando el artboard con un `DCLogic` de
 * mentira: con `pq: ''`, `palRes.length` es **9** y `palPie` dice «9 resultados». Manda el
 * diseno, asi que el tope es 9 — y {@link ACCIONES} sigue teniendo las diez, que es lo que hace
 * que la decima sea alcanzable escribiendo.
 */

/** La pastilla de la izquierda de cada resultado (`r.tipo`, lineas 1481-1483). */
export type TipoDeResultado = "Recibo" | "Acción" | "Ir a" | "Filtro";

/** Una de las diez acciones: su rotulo, su pastilla y a donde lleva. */
export interface AccionDeLaPaleta {
  readonly label: string;
  /** Nunca `Recibo`: esa pastilla es de lo que se busca, no de lo que se hace. */
  readonly tipo: Exclude<TipoDeResultado, "Recibo">;
  /** La clave de la seccion que abre. Son las de `SECCIONES`. */
  readonly seccion: string;
  /** Con que estado la abre. Es lo que distingue cuatro acciones que van a la misma seccion. */
  readonly destino: Destino;
  /** El toast que ademas saca, si saca alguno. Solo «Cobrar» lo tiene (linea 2077). */
  readonly aviso?: string;
}

/**
 * Las diez acciones, en el orden del artboard (lineas 1466-1477).
 *
 * Los indices de `nodo` y `valTab` **no se eligieron aqui**: son los del artboard, y
 * `verificaciones/paleta.test.tsx` comprueba que cada uno apunta a lo que su rotulo promete
 * —`NODOS[4]` es «Anulaciones del día»— porque un indice que baila no rompe nada visible: abre
 * otro panel.
 */
export const ACCIONES: readonly AccionDeLaPaleta[] = [
  { label: "Cobrar", tipo: "Acción", seccion: "predios", destino: { recibo: COBRO_NUEVO }, aviso: MENSAJE_DE_COBRO_NUEVO },
  { label: "Ver el panel del módulo", tipo: "Ir a", seccion: "panel", destino: {} },
  { label: "Ver los recibos del turno", tipo: "Ir a", seccion: "predios", destino: {} },
  { label: "Arqueo de mi caja", tipo: "Ir a", seccion: "territorio", destino: { nodo: 0 } },
  { label: "Cajas cerradas sin arquear", tipo: "Ir a", seccion: "territorio", destino: { nodo: 2 } },
  { label: "Anulaciones del día", tipo: "Ir a", seccion: "territorio", destino: { nodo: 4 } },
  { label: "Pendientes de conciliar", tipo: "Ir a", seccion: "territorio", destino: { nodo: 5 } },
  { label: "Tarifario del TUPA", tipo: "Ir a", seccion: "valores", destino: { valTab: 0 } },
  { label: "Cierre y depósito", tipo: "Ir a", seccion: "valores", destino: { valTab: 2 } },
  { label: "Recibos anulados", tipo: "Filtro", seccion: "predios", destino: { chip: "Anulado" } },
];

/**
 * Lo gris de la derecha de cada accion: de que modulo es (linea 1483).
 *
 * El artboard lo escribe literal; aqui sale de {@link MI_MODULO}, que es el mismo sitio del que
 * el lanzador saca cual esta marcado. Escribir el nombre del modulo a mano en dos ficheros es
 * exactamente como el artboard acabo con un `modulos` que decia Tránsito y otro que decia
 * Tesorería.
 */
export const NOTA_DE_LAS_ACCIONES = MI_MODULO;

/** El nombre accesible del campo de busqueda. Dice **donde** se busca, que es lo que acota. */
export const ROTULO_DEL_CAMPO = `Buscar en ${MI_MODULO}`;

/** Cuantos resultados caben, como maximo. Artboard, linea 1484. */
export const TOPE_DE_RESULTADOS = 9;

/** El texto del campo mientras esta vacio (linea 80). */
export const PISTA_DE_LA_PALETA = "Un recibo, un contribuyente, una acción…";

/** Una fila de la lista, ya resuelta para dibujarla. */
export interface ResultadoDeLaPaleta {
  /** Identificador estable de la fila: lo usan `key` y `aria-activedescendant`. */
  readonly clave: string;
  readonly tipo: TipoDeResultado;
  readonly label: string;
  /** Lo gris de la derecha: el estado del recibo, o «Tesorería» en una accion. */
  readonly nota: string;
  readonly seccion: string;
  readonly destino: Destino;
  readonly aviso?: string;
}

/**
 * Lo que la paleta encuentra para `consulta`: primero los recibos, luego las acciones.
 *
 * Los **recibos solo salen con consulta no vacia** (linea 1479): con el campo en blanco la
 * paleta es el menu de comandos del modulo, no un listado de los cinco recibos de muestra. Casan
 * por codigo, por titulo y por titular, que son las tres columnas que el artboard mira.
 */
export function resultadosDe(consulta: string): readonly ResultadoDeLaPaleta[] {
  const q = consulta.trim().toLowerCase();

  const recibos: ResultadoDeLaPaleta[] =
    q === ""
      ? []
      : RECIBOS.filter(
          (r) =>
            r.cod.toLowerCase().includes(q) ||
            r.titulo.toLowerCase().includes(q) ||
            r.titular.toLowerCase().includes(q),
        ).map((r) => ({
          clave: `recibo:${r.cod}`,
          tipo: "Recibo" as const,
          label: `${r.cod} — ${r.titulo}`,
          nota: r.estado,
          seccion: "predios",
          destino: { recibo: r.cod },
        }));

  const acciones: ResultadoDeLaPaleta[] = ACCIONES.filter(
    (a) => q === "" || a.label.toLowerCase().includes(q),
  ).map((a) => ({
    clave: `accion:${a.label}`,
    tipo: a.tipo,
    label: a.label,
    nota: NOTA_DE_LAS_ACCIONES,
    seccion: a.seccion,
    destino: a.destino,
    aviso: a.aviso,
  }));

  return [...recibos, ...acciones].slice(0, TOPE_DE_RESULTADOS);
}

/** El pie de la izquierda, con su singular (linea 1727). */
export const pieDe = (cuantos: number) =>
  `${cuantos} ${cuantos === 1 ? "resultado" : "resultados"}`;
