/**
 * Lo que la ficha de un recibo **existente** trae escrito en sus campos.
 *
 * Origen: `TesoreriaV6.dc.html`, la rama `else` de `datos()`, lineas 1379-1392. La otra rama
 * —la del cobro nuevo, 1368-1378— es de #13 y no se porta aqui.
 *
 * <h2>Son los valores de UN recibo, y el artboard los da para los cinco</h2>
 *
 * `datos()` **no recibe el recibo elegido**: devuelve el mismo objeto sea cual sea. Se comprueba
 * leyendo su firma —`datos()`, sin argumentos, y sin un solo `sel.` dentro— y se ve al abrir
 * cualquiera de los otros cuatro: la cabecera cambia (codigo, titulo, insignia y contexto salen
 * de `sel`, lineas 1894-1907) y el cuerpo **no**. Abrir el recibo anulado de Zapata Rivas enseña
 * en «Contribuyente» a la sucesion de Rufina Medina y en «Número» el correlativo del otro.
 *
 * Se porta tal cual, y queda dicho aqui en vez de arreglarse por dos motivos:
 *
 * <ul>
 *   <li>**El diseño manda** (`PORTAR.md`, reglas 1 a 3): estos treinta y tres valores son datos
 *       de muestra del artboard, no una cifra derivada que el port deba recalcular.</li>
 *   <li>Repartirlos por recibo seria **inventar cuatro juegos de datos** que el diseño no trae:
 *       cuanto debia Zapata Rivas, con que descuento se cobro y quien autorizo su anulacion no
 *       estan escritos en ninguna parte. Un dato inventado en una pantalla de cobro es peor que
 *       un dato repetido, porque no se distingue del real.</li>
 * </ul>
 *
 * El dia que haya backend cada recibo traera los suyos, y esta constante desaparece.
 *
 * <h2>Los importes son texto, tambien aqui</h2>
 *
 * `deudaTotal`, `montoDesc`, `aCobrar`, `recibido`, `vuelto` e `importe` se copian **enteros y
 * sin recomponer**, con su separador de millares y sus dos decimales. Regla 1 de CLAUDE.md
 * (RNF-055): ninguno pasa por `number`.
 */

/**
 * Lo que una casilla guarda cuando esta marcada.
 *
 * El artboard guarda un `true` (`conciliado: false`, `aplicado: true`, lineas 1387-1389) y su
 * `campo()` lo lee con `marcado: valor === true`. Aqui el mapa de valores del marco es
 * `Record<string, string>` —lo fijo #8 al portar el `set(k, v)` de la linea 1352— y ensancharlo
 * a `string | boolean` por un solo tipo de campo meteria esa union en `valorDeCampo`, en
 * `fijarCampo` y en cada pantalla que los use.
 *
 * Asi que una casilla marcada guarda `'1'` y una sin marcar la cadena vacia. La equivalencia es
 * exacta para lo que la ficha hace con ese valor, y ademas encaja con el `vacio` del artboard
 * (linea 1397): una casilla **nunca es obligatoria** (linea 1398), de modo que guardar `''`
 * donde el artboard guarda `false` no puede encender el estilo de error de ningun campo.
 */
export const MARCADO = "1";

/** Lo que guarda una casilla sin marcar. Es la cadena vacia, y por eso tiene nombre. */
export const SIN_MARCAR = "";

/**
 * Los treinta y tres valores de la ficha, con la clave de campo que los nombra.
 *
 * Las claves son las de {@link import("./recibo").PASOS}: `verificaciones/ficha.test.tsx`
 * comprueba que **todo campo de las cinco secciones tiene aqui su valor**, porque un campo sin
 * valor no se dibujaria vacio por decision de nadie, sino por un descuido que nada delata.
 */
export const VALORES_DEL_RECIBO: Readonly<Record<string, string>> = {
  // —— Operación ——
  caja: "C-3",
  cajero: "Cárdenas Vega, José",
  turno: "Mañana",
  fechaOp: "2026-09-05",
  horaOp: "09:41",
  contrib: "00000025673 — Suc. Rufina Medina Medina",
  docContrib: "DNI 03593174",
  quienPaga: "Un tercero autorizado",
  obsOp: "",

  // —— Deuda a cobrar ——
  deudaTotal: "3,455.24",
  seleccionado: "2,511.94",
  descuento: "Amnistía — 100 % del interés",
  montoDesc: "230.88",
  aCobrar: "2,281.06",

  // —— Medio de pago ——
  medio: "Efectivo",
  recibido: "2,300.00",
  vuelto: "18.94",
  operacionBanco: "",
  banco: "",
  ultimos4: "",
  conciliado: SIN_MARCAR,

  // —— Recibo ——
  serie: "0003",
  numRecibo: "0041184",
  importe: "2,281.06",
  aplicado: MARCADO,
  impreso: MARCADO,
  copias: "2",
  obsRecibo: "",

  // —— Anulación ——
  anulado: SIN_MARCAR,
  fechaAnul: "",
  motivoAnul: "",
  autoriza: "",
  resAnul: "",
  devuelveDeuda: "Sí, con el interés recalculado a la fecha",
  fundamentoAnul: "",
};
