import type { ClaveDeSeccion } from "@/datos";
import { HOJAS, ICONOS_DE_SECCION, ICONOS_POR_MODULO, MI_MODULO, SECCIONES } from "@/datos";

/**
 * Como se rotula lo que hay abierto: la barra de pestanas, el titulo y el subtitulo.
 *
 * Portado de `TesoreriaV6.dc.html` — `pestanas` (1655-1673), `titulo` (1800-1804) y `subtitulo`
 * (1487-1491). Son funciones puras sobre el estado, y por eso viven aparte de los componentes:
 * lo que dice el marco se puede comprobar sin dibujar nada.
 *
 * <h2>Por que los rotulos estan aqui y no en `src/datos/`</h2>
 *
 * Mismo criterio que `SIN_COINCIDENCIAS` en `ArbolDeModulos`: `src/datos/` guarda **lo que las
 * pantallas ensenan** —las filas, las cifras, los iconos—, y estos son los rotulos del propio
 * marco, que no son un dato del municipio sino prosa del diseno. Lo que si sale de `src/datos/`
 * es todo lo indexable: `SECCIONES`, `HOJAS` y los dos juegos de iconos.
 */

/** El titulo cuando no hay ninguna pestana abierta (linea 1800). */
export const TITULO_SIN_PESTANAS = "Sin pestañas abiertas";

/** El titulo del Panel: el artboard lo escribe entero y no lo compone (linea 1803). */
export const TITULO_DEL_PANEL = "Panel de Tesorería";

/**
 * Los cuatro subtitulos de las secciones propias (lineas 1488-1491).
 *
 * **Del de Recibos se porta solo una de sus tres formas**, y es una decision con motivo: el
 * artboard lo cambia a «Cobrando en la caja C-3» durante un cobro nuevo y al codigo del recibo
 * cuando hay uno seleccionado, y aqui no hay todavia ni cobro ni seleccion. Cuando la pantalla
 * de Recibos llegue, las otras dos formas entran con ella.
 *
 * El «52» no se deriva de `RECIBOS` —que trae seis filas de muestra— porque el artboard lo
 * escribe literal: es el turno del diseno, no el recuento de la lista.
 */
export const SUBTITULOS: Readonly<Record<ClaveDeSeccion, string>> = {
  panel: "Caja C-3 · turno mañana",
  predios: "52 recibos del turno",
  territorio: "Arqueo, anulaciones y conciliación",
  valores: "Tasas, medios de pago y cierre",
};

/** El rotulo del boton primario de la fila del titulo (linea 1676). */
export const ACCION_PRIMARIA = "Cobrar";

/** Si `clave` es una de las cuatro secciones propias de Tesoreria. */
export function esSeccionPropia(clave: string): clave is ClaveDeSeccion {
  return SECCIONES.some((x) => x.clave === clave);
}

/**
 * El titulo de la fila blanca.
 *
 * `Panel` tiene el suyo escrito aparte —«Panel de Tesorería» y no «Panel»— porque es la unica
 * seccion cuyo rotulo del arbol seria ambiguo: los doce modulos tienen un submodulo «Panel».
 */
export function tituloDe(activa: string | null): string {
  if (activa === null) return TITULO_SIN_PESTANAS;
  const hoja = HOJAS[activa];
  if (!esSeccionPropia(activa)) return hoja === undefined ? MI_MODULO : hoja.label;
  if (activa === "panel") return TITULO_DEL_PANEL;
  return SECCIONES.find((x) => x.clave === activa)?.label ?? MI_MODULO;
}

/**
 * El subtitulo gris que va al lado del titulo.
 *
 * En una pestana ajena es **el nombre del modulo del que viene**, que es lo que contesta a
 * «¿por que estoy viendo esto aqui?».
 */
export function subtituloDe(activa: string | null): string {
  if (activa === null) return "";
  if (!esSeccionPropia(activa)) return HOJAS[activa]?.modulo ?? "";
  return SUBTITULOS[activa];
}

/** Una pestana, ya resuelta para dibujarla. */
export interface PestanaVisible {
  readonly clave: string;
  /** El rotulo con su ` *` si esta sucia, que es lo que se ve (linea 1660). */
  readonly label: string;
  /** El rotulo **sin** el asterisco: es el que va en el `aria-label` de cerrar y en el dialogo. */
  readonly rotulo: string;
  readonly actual: boolean;
  readonly sucia: boolean;
  /** El `aria-label` y el `title` del boton de cerrar (linea 1663). */
  readonly cerrarAria: string;
  /** Los trazos del icono: el de la seccion si es propia, el del modulo si es ajena. */
  readonly icono: readonly string[];
}

/**
 * La lista de pestanas que la barra dibuja, en el orden en que se abrieron.
 *
 * El orden es el de `abiertas` y no uno alfabetico ni el del arbol: es el unico que hace
 * predecible cual es «la vecina de la izquierda» al cerrar.
 */
export function pestanasDe(
  abiertas: readonly string[],
  activa: string | null,
  sucias: Readonly<Record<string, boolean>>,
): readonly PestanaVisible[] {
  return abiertas.map((clave) => {
    const hoja = HOJAS[clave];
    const rotulo = hoja === undefined ? clave : hoja.label;
    const sucia = sucias[clave] === true;
    const propia = esSeccionPropia(clave);
    return {
      clave,
      rotulo,
      label: rotulo + (sucia ? " *" : ""),
      actual: activa === clave,
      sucia,
      cerrarAria: sucia ? `Cerrar ${rotulo} — tiene cambios sin guardar` : `Cerrar ${rotulo}`,
      icono: propia
        ? ICONOS_DE_SECCION[clave]
        : (ICONOS_POR_MODULO[hoja === undefined ? MI_MODULO : hoja.modulo] ?? []),
    };
  });
}

/** El texto del toast al guardar y cerrar (linea 1650). */
export const mensajeDeGuardado = (rotulo: string) => `Cambios guardados en ${rotulo}.`;

/** El toast del boton «Cobrar» (linea 2077). */
export const MENSAJE_DE_COBRO_NUEVO = "Cobro nuevo: elija la caja abierta y el contribuyente.";
