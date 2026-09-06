/**
 * Todo lo que las pantallas de `caja-web` van a ensenar, tipado y tomado del artboard.
 *
 * A partir de aqui **ninguna pantalla inventa un dato ni lo escribe en linea**: si algo no esta en
 * `TesoreriaV6.dc.html`, no esta aqui, y si no esta aqui no se dibuja. Es la misma regla que en el
 * backend impide un literal tributario en el codigo (regla 5 de CLAUDE.md), por el mismo motivo:
 * una cifra escrita dentro de una pantalla no se puede revisar, ni cambiar, ni siquiera encontrar.
 *
 * <h2>De donde sale cada cosa</h2>
 *
 * | Aqui | En el artboard | Lineas |
 * |---|---|---|
 * | `navegacion.ts` | `MODULOS`, `ICO_SEC`, `MI_MODULO`, `ARBOL`, `HOJAS`, `SECS` | 942-962, 1171-1215 |
 * | `cajas.ts` | `PROGRAMAS`, `CAJAS_CERRADAS` | 967-973 |
 * | `recibo.ts` | `PASOS` | 978-1043 |
 * | `recibos-del-turno.ts` | `PREDIOS`, y los `chips`, `ordenes` y el «de 52» de la lista | 1047-1063, 1869-1878 |
 * | `arqueo.ts` | `NODOS`, `DETERMINACIONES` | 1066-1137 |
 * | `tarifario.ts` | `VAL` | 1139-1168 |
 * | `barra.ts` | `anios`, la ficha de sesion y el aviso de servicio | 1495, 168-175, 431 y 1681-1682 |
 * | `cola.ts` | `cola`, la del pie del arbol de modulos | 1823-1830 |
 * | `panel.ts` | `cifras`, `bandeja`, `cobertura` y `actividad` | 1813-1860 |
 *
 * <h2>Los importes son texto</h2>
 *
 * Regla 1 de CLAUDE.md (RNF-055), y ademas la forma real del contrato: el backend emite
 * `{ "importe": "482.50", "actualizadoA": "2026-09-06" }` y su `ConfiguracionDeJson` deja escrito
 * que lo que no se hace nunca es *emitir* un numero. Aqui se respeta: **ningun importe se declara
 * `number` y esta interfaz no hace aritmetica con importes**. La unica excepcion es
 * `Recibo.valor`, que existe solo para ordenar la lista, esta anotada donde se declara y esta
 * declarada en `verificaciones/importes-de-datos.test.ts`, que sale rojo con cualquier otra.
 *
 * <h2>Las tres cosas que el diseno pide y el contrato del backend no da</h2>
 *
 * Van anotadas **donde vive el dato**, con su motivo y nombrando el enumerado o el recurso concreto:
 *
 * <ul>
 *   <li>Los **medios de pago** —cinco rotulos contra las cinco constantes de `FormaDePago`, y no son
 *       las mismas—, en la cabecera de `recibo.ts`.</li>
 *   <li>El **numero de recibo** —serie de cuatro contra el `001-0000123` de `ReciboResource`—, en la
 *       cabecera de `recibos-del-turno.ts`.</li>
 *   <li>El **fondo inicial del turno**, que `ArqueoResource` no modela, en la cabecera de
 *       `arqueo.ts`.</li>
 * </ul>
 *
 * No se corrige el diseno ni se conecta nada: queda escrito para que el dia de conectar no se
 * descubra tarde.
 */

export type { Columna, Fila } from "./tabla";

export type {
  ClaveDeSeccion,
  Hoja,
  Modulo,
  RamaDelArbol,
  Seccion,
  Submodulo,
} from "./navegacion";
export {
  ARBOL,
  HOJAS,
  ICONOS_DE_SECCION,
  ICONOS_POR_MODULO,
  MI_MODULO,
  MODULOS,
  SECCION_DE_CAJAS,
  SECCION_DE_RECIBOS,
  SECCIONES,
} from "./navegacion";

export type { Caja } from "./cajas";
export { CAJAS, CAJAS_CERRADAS } from "./cajas";

export type { Campo, Paso, TablaDeCuotas, TipoDeCampo } from "./recibo";
export { PASOS } from "./recibo";

export type { OrdenDeLaLista, Recibo } from "./recibos-del-turno";
export {
  CHIP_DE_TODOS,
  CHIPS,
  ORDEN_NATURAL,
  ORDENES,
  RECIBOS,
  TOTAL_DEL_TURNO,
} from "./recibos-del-turno";

export type { Nodo, TablaDeNodo } from "./arqueo";
export { DETERMINACIONES, NODOS } from "./arqueo";

export type { PestanaDeTarifario } from "./tarifario";
export { TARIFARIO } from "./tarifario";

export type { AvisoDelSistema, OpcionDeSesion, Sesion } from "./barra";
export { AVISO, EJERCICIOS, OPCIONES_DE_SESION, SESION } from "./barra";

export type { EntradaDeCola, TonoDeCola } from "./cola";
export { COLA } from "./cola";

export type {
  ActividadDelPanel,
  CifraDelPanel,
  EsperaDelPanel,
  LineaDeArqueo,
} from "./panel";
export {
  ACTIVIDAD,
  BANDEJA,
  CIFRAS,
  COBERTURA,
  CUADRA,
  DESDE_DONDE_CUADRA,
  NODO_DE_MI_CAJA,
} from "./panel";
