/**
 * La navegacion de V6: los doce modulos, sus cuarenta y ocho submodulos y las cuatro secciones
 * propias de Tesoreria.
 *
 * Origen: `TesoreriaV6.dc.html` — `MODULOS` (lineas 942-955), `ICO_SEC` (957-962), `MI_MODULO`
 * (1175), `ARBOL` (1176-1205), `HOJAS` (1207-1208) y `SECS` (1210-1215).
 *
 * <h2>Por que los doce modulos estan aqui si este repositorio es solo la caja</h2>
 *
 * El artboard dibuja el arbol entero del sistema y abre en una pestana lo que no es suyo. Los once
 * modulos ajenos **no son datos de negocio**: son el rotulo y el trazo del icono con el que la
 * ventanilla dice «eso se ve en otro sitio». Ninguno trae una cifra, y ninguno se consulta a nadie.
 *
 * <h2>Lo que se deriva y lo que se copia</h2>
 *
 * `HOJAS` e `ICONOS_POR_MODULO` los **deriva el propio artboard** con un `forEach` (lineas 1201-1208):
 * aqui se derivan igual, y a proposito. Escribirlos a mano seria abrir una segunda fuente de verdad
 * para los mismos cuarenta y ocho pares, y la unica forma de que discrepe es en silencio.
 */

/** Un modulo del sistema: su nombre y los trazos SVG de su icono, tal como los declara el artboard. */
export interface Modulo {
  readonly nombre: string;
  /** Los atributos `d` de cada `<path>`. Se copian letra a letra: un trazo retocado es otro dibujo. */
  readonly icono: readonly string[];
}

/** Los doce modulos, en el orden del artboard. No hay un decimotercero. */
export const MODULOS: readonly Modulo[] = [
  {
    nombre: "Inicio",
    icono: ["M3 10.6 12 3.5l9 7.1", "M5.6 9.6V20.5h12.8V9.6", "M10 20.5v-5.4h4v5.4"],
  },
  {
    nombre: "Catastro",
    icono: [
      "M3.5 6.6 9 4.2l6 2.4 5.5-2.4v13.2L15 19.8l-6-2.4-5.5 2.4z",
      "M9 4.2v13.2",
      "M15 6.6v13.2",
    ],
  },
  {
    nombre: "Rentas · Registro",
    icono: ["M6.5 3.5h7.5l4 4v13h-11.5z", "M14 3.5v4h4", "M9.5 12.5h5", "M9.5 16.5h3.5"],
  },
  {
    nombre: "Fiscalización",
    icono: [
      "M9.5 4.5H8A1.5 1.5 0 0 0 6.5 6v13A1.5 1.5 0 0 0 8 20.5h8a1.5 1.5 0 0 0 1.5-1.5V6A1.5 1.5 0 0 0 16 4.5h-1.5",
      "M9.5 3.2h5v2.8h-5z",
      "M9.6 13.2l2 2 3.4-4",
    ],
  },
  {
    nombre: "Tránsito",
    icono: [
      "M5 15.8v-3.2l1.9-4.4h10.2l1.9 4.4v3.2",
      "M3.6 15.8h16.8",
      "M8.4 18.4a1.6 1.6 0 1 1-3.2 0 1.6 1.6 0 0 1 3.2 0",
      "M18.8 18.4a1.6 1.6 0 1 1-3.2 0 1.6 1.6 0 0 1 3.2 0",
    ],
  },
  {
    nombre: "Infracciones administrativas",
    icono: ["M12 4.2 20.8 19.6H3.2z", "M12 9.8v4.4", "M12 17.1h.02"],
  },
  {
    nombre: "Tesorería",
    icono: [
      "M3.2 7.4h17.6v9.2H3.2z",
      "M13.6 12a1.6 1.6 0 1 1-3.2 0 1.6 1.6 0 0 1 3.2 0",
      "M6.6 10.6v2.8",
      "M17.4 10.6v2.8",
    ],
  },
  {
    nombre: "Consultas",
    icono: ["M17.4 11a6.4 6.4 0 1 1-12.8 0 6.4 6.4 0 0 1 12.8 0", "M15.8 15.8 20.6 20.6"],
  },
  {
    nombre: "Valores",
    icono: [
      "M6.5 3.5h7.5l4 4v13h-11.5z",
      "M14 3.5v4h4",
      "M9.5 11.5h5",
      "M15.6 16.4a2.3 2.3 0 1 1-4.6 0 2.3 2.3 0 0 1 4.6 0",
    ],
  },
  {
    nombre: "Coactiva",
    icono: [
      "M12 4.4v3.2",
      "M5 8.6h14",
      "M5 8.6 2.8 14.4h4.4z",
      "M19 8.6 16.8 14.4h4.4z",
      "M8.4 20h7.2",
    ],
  },
  {
    nombre: "Autorizaciones y licencias",
    icono: ["M4.4 9.6V20h15.2V9.6", "M3.2 9.6 5.2 4.6h13.6l2 5z", "M9.6 20v-5.4h4.8V20"],
  },
  {
    nombre: "Seguridad",
    icono: [
      "M12 3.4 19 5.9v5.6c0 4.1-3 7.2-7 9.1-4-1.9-7-5-7-9.1V5.9z",
      "M9.4 12.1l1.9 1.9 3.5-3.6",
    ],
  },
];

/**
 * El modulo que esta pantalla **es**.
 *
 * Lo usa el arbol para saber cual de las doce ramas abre secciones de verdad y cuales abren la
 * pestana del sistema vecino. Es un rotulo, no una URL: aqui no se navega a ningun sitio.
 */
export const MI_MODULO = "Tesorería";

/** Las cuatro secciones propias, por su clave del artboard. No son cuatro rotulos: son cuatro pantallas. */
export type ClaveDeSeccion = "panel" | "predios" | "territorio" | "valores";

/**
 * El icono de cada seccion propia.
 *
 * Las claves son las del artboard y **no se traducen**: `predios` es la lista de recibos y
 * `territorio` es «Cajas y arqueo». Son el resto de la plantilla de Catastro sobre la que se dibujo
 * V6, y renombrarlas aqui obligaria a renombrarlas tambien en `SECCIONES` y en el hash de la URL,
 * que es lo unico que sobrevive a una recarga.
 */
export const ICONOS_DE_SECCION: Readonly<Record<ClaveDeSeccion, readonly string[]>> = {
  panel: ["M4 19.5h16", "M6.5 19.5V9", "M11 19.5V5.5", "M15.5 19.5v-7", "M20 19.5v-11"],
  predios: ["M3.5 6.6 9 4.2l6 2.4 5.5-2.4v13.2L15 19.8l-6-2.4-5.5 2.4z", "M9 4.2v13.2"],
  territorio: ["M4.5 4.5h6v6h-6z", "M13.5 4.5h6v6h-6z", "M4.5 13.5h6v6h-6z", "M13.5 13.5h6v6h-6z"],
  valores: ["M6.5 3.5h7.5l4 4v13h-11.5z", "M14 3.5v4h4", "M9.5 12.5h5"],
};

/** Una seccion de la barra izquierda: la clave con la que se navega y como se rotula. */
export interface Seccion {
  readonly clave: ClaveDeSeccion;
  readonly label: string;
  /**
   * La pastilla que va a la derecha del rotulo. **Vacia en las cuatro**, y se conserva vacia.
   *
   * El artboard la dibuja (`x[2]`, linea 1735) y no le pone nada. Rellenarla con un recuento seria
   * exactamente el dato inventado que este archivo existe para impedir.
   */
  readonly pastilla: string;
  /** Lo que se escribe en el hash de la URL. Es lo unico de la navegacion que sobrevive a una recarga. */
  readonly slug: string;
}

/** Las cuatro secciones propias, en el orden del artboard. */
export const SECCIONES: readonly Seccion[] = [
  { clave: "panel", label: "Panel", pastilla: "", slug: "panel" },
  { clave: "predios", label: "Recibos", pastilla: "", slug: "recibos" },
  { clave: "territorio", label: "Cajas y arqueo", pastilla: "", slug: "cajas" },
  { clave: "valores", label: "Tarifario y cierre", pastilla: "", slug: "tarifario" },
];

/** Un submodulo del arbol: la clave con la que se abre y su rotulo. */
export interface Submodulo {
  readonly clave: string;
  readonly label: string;
}

/** Una rama del arbol de la izquierda: un modulo con sus cuatro submodulos. */
export interface RamaDelArbol {
  readonly modulo: string;
  /** El subtitulo del modulo: «Caja y recaudación», «Predios y valuación»… */
  readonly nota: string;
  /** La clave corta del modulo. La usa el artboard para el icono de la pestana ajena. */
  readonly clave: string;
  readonly submodulos: readonly Submodulo[];
}

/**
 * Los doce modulos con sus cuatro submodulos cada uno: cuarenta y ocho hojas.
 *
 * Los de `MI_MODULO` abren la seccion real —sus cuatro claves son las de `SECCIONES`—; los de los
 * once restantes abren la pestana del sistema vecino.
 */
export const ARBOL: readonly RamaDelArbol[] = [
  {
    modulo: "Inicio",
    nota: "Panel de recaudación",
    clave: "inicio",
    submodulos: [
      { clave: "ini-panel", label: "Panel" },
      { clave: "ini-flujo", label: "Recaudación" },
      { clave: "ini-parado", label: "Trabajo parado" },
      { clave: "ini-cierre", label: "Cierre del día" },
    ],
  },
  {
    modulo: "Tesorería",
    nota: "Caja y recaudación",
    clave: "tesoreria",
    submodulos: [
      { clave: "panel", label: "Panel" },
      { clave: "predios", label: "Recibos" },
      { clave: "territorio", label: "Cajas y arqueo" },
      { clave: "valores", label: "Tarifario y cierre" },
    ],
  },
  {
    modulo: "Catastro",
    nota: "Predios y valuación",
    clave: "catastro",
    submodulos: [
      { clave: "cat-panel", label: "Panel" },
      { clave: "cat-pred", label: "Predios" },
      { clave: "cat-terr", label: "Territorio" },
      { clave: "cat-val", label: "Valores del ejercicio" },
    ],
  },
  {
    modulo: "Rentas · Registro",
    nota: "Predial y contribuyentes",
    clave: "rentas",
    submodulos: [
      { clave: "ren-panel", label: "Panel" },
      { clave: "ren-contrib", label: "Contribuyentes" },
      { clave: "ren-det", label: "Determinación" },
      { clave: "ren-val", label: "Valores" },
    ],
  },
  {
    modulo: "Fiscalización",
    nota: "Detección y actas",
    clave: "fisc",
    submodulos: [
      { clave: "fis-panel", label: "Panel" },
      { clave: "fis-actas", label: "Actas" },
      { clave: "fis-prog", label: "Programas y cruces" },
      { clave: "fis-res", label: "Resultados" },
    ],
  },
  {
    modulo: "Tránsito",
    nota: "Papeletas y vehículos",
    clave: "transito",
    submodulos: [
      { clave: "tra-panel", label: "Panel" },
      { clave: "tra-pap", label: "Papeletas" },
      { clave: "tra-veh", label: "Vehículos y depósito" },
      { clave: "tra-cua", label: "Cuadros y plazos" },
    ],
  },
  {
    modulo: "Infracciones administrativas",
    nota: "Sanciones administrativas",
    clave: "infra",
    submodulos: [
      { clave: "inf-panel", label: "Panel" },
      { clave: "inf-exp", label: "Expedientes" },
      { clave: "inf-cuis", label: "CUIS y reincidencia" },
      { clave: "inf-esc", label: "Escalas y plazos" },
    ],
  },
  {
    modulo: "Consultas",
    nota: "Ventanilla y constancias",
    clave: "consultas",
    submodulos: [
      { clave: "con-panel", label: "Panel" },
      { clave: "con-contrib", label: "Contribuyentes" },
      { clave: "con-obj", label: "Consultas por objeto" },
      { clave: "con-doc", label: "Documentos y beneficios" },
    ],
  },
  {
    modulo: "Valores",
    nota: "Emisión y notificación",
    clave: "valores-mod",
    submodulos: [
      { clave: "val-panel", label: "Panel" },
      { clave: "val-val", label: "Valores" },
      { clave: "val-cart", label: "Cartera y lotes" },
      { clave: "val-tip", label: "Tipos y prescripción" },
    ],
  },
  {
    modulo: "Coactiva",
    nota: "Expedientes y medidas",
    clave: "coactiva",
    submodulos: [
      { clave: "coa-panel", label: "Panel" },
      { clave: "coa-exp", label: "Expedientes" },
      { clave: "coa-cart", label: "Cartera y medidas" },
      { clave: "coa-cost", label: "Costas y plazos" },
    ],
  },
  {
    modulo: "Autorizaciones y licencias",
    nota: "Licencias y anuncios",
    clave: "autoriz",
    submodulos: [
      { clave: "aut-panel", label: "Panel" },
      { clave: "aut-sol", label: "Solicitudes" },
      { clave: "aut-cat", label: "Catálogos y padrones" },
      { clave: "aut-tram", label: "Trámites y plazos" },
    ],
  },
  {
    modulo: "Seguridad",
    nota: "Usuarios y permisos",
    clave: "seguridad",
    submodulos: [
      { clave: "seg-panel", label: "Panel" },
      { clave: "seg-acc", label: "Accesos" },
      { clave: "seg-aud", label: "Auditoría" },
      { clave: "seg-sis", label: "Sistema" },
    ],
  },
];

/** Una hoja del arbol, resuelta: a que modulo pertenece, con que subtitulo y como se rotula. */
export interface Hoja {
  readonly modulo: string;
  readonly nota: string;
  readonly label: string;
}

/**
 * Las cuarenta y ocho hojas indexadas por su clave, como hace el artboard en la linea 1208.
 *
 * Se deriva de `ARBOL` y no se escribe: si dos submodulos compartieran clave, uno taparia al otro
 * **en silencio**, y por eso `verificaciones/datos.test.ts` cuenta que salgan 48.
 */
export const HOJAS: Readonly<Record<string, Hoja>> = (() => {
  const hojas: Record<string, Hoja> = {};
  for (const rama of ARBOL) {
    for (const submodulo of rama.submodulos) {
      hojas[submodulo.clave] = {
        modulo: rama.modulo,
        nota: rama.nota,
        label: submodulo.label,
      };
    }
  }
  return hojas;
})();

/**
 * El icono de cada modulo, indexado por su nombre — el `ICO_MOD` del artboard (lineas 1171, 1201-1204).
 *
 * El artboard lo resuelve con un `find` sobre `MODULOS` y cae en `[]` si no encuentra el nombre.
 * Aqui se hace igual: un modulo del arbol que no estuviera en `MODULOS` se quedaria sin dibujo, y
 * es lo que la prueba de recuento vigila.
 */
export const ICONOS_POR_MODULO: Readonly<Record<string, readonly string[]>> = (() => {
  const iconos: Record<string, readonly string[]> = {};
  for (const rama of ARBOL) {
    iconos[rama.modulo] = MODULOS.find((modulo) => modulo.nombre === rama.modulo)?.icono ?? [];
  }
  return iconos;
})();
