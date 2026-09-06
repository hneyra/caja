/**
 * Lo que la barra global ensena: los ejercicios, quien esta en la ventanilla y el aviso.
 *
 * Origen: `TesoreriaV6.dc.html`. A diferencia del resto de este directorio —que sale de las
 * constantes de las lineas 942-1215— esto vive en el `renderVals()` del artboard y en su
 * plantilla, asi que se cita linea a linea:
 *
 * | Aqui | En el artboard | Lineas |
 * |---|---|---|
 * | `EJERCICIOS` | `anios` | 1495 |
 * | `SESION` | la ficha de sesion de la barra | 168-175 |
 * | `AVISO` | `avisosN`, `avisoAria` y el texto de la banda | 1681-1682 y 431 |
 *
 * Esta aqui y no dentro del componente por el mismo motivo que lo demas: **una pantalla no
 * inventa un dato ni lo escribe en linea**. Ademas es lo que permite que la prueba compare
 * contra la misma cadena que se dibuja, en vez de contra una copia escrita al lado que puede
 * derivar sin que nadie lo note.
 */

/**
 * Los cuatro ejercicios que ofrece el selector de la barra.
 *
 * Son **texto y no numeros**, igual que en el artboard: el ejercicio es la etiqueta de un
 * periodo, no una cantidad con la que se opere. El valor de un `<option>` es texto de todos
 * modos, asi que convertirlo a numero solo anadiria una conversion de vuelta.
 */
export const EJERCICIOS: readonly string[] = ["2026", "2025", "2024", "2023"];

/** Quien tiene la ventanilla abierta: lo que la ficha de sesion de la barra muestra. */
export interface Sesion {
  /** Las dos letras del avatar. */
  readonly iniciales: string;
  readonly nombre: string;
  /** El puesto y la caja, tal como el artboard los junta en una sola linea. */
  readonly puesto: string;
}

/**
 * La sesion del artboard.
 *
 * Es un dato del despliegue —vendra del token, como la municipalidad—, y hasta entonces esta
 * aqui la del diseno. Que este en `datos/` y no dentro de la barra es lo que hara que el dia
 * de conectarlo haya **un** sitio que cambiar.
 */
export const SESION: Sesion = {
  iniciales: "JC",
  nombre: "J. Cárdenas Vega",
  puesto: "Cajero · caja C-3",
};

/** Una entrada del menu que despliega la ficha de sesion. */
export interface OpcionDeSesion {
  readonly label: string;
  /** Los atributos `d` de su icono, copiados letra a letra del artboard. */
  readonly icono: readonly string[];
  /**
   * Si es **la salida**.
   *
   * El artboard lo guarda como el tercer elemento de la tripleta (`o[2]`, lineas 1695-1697) y de
   * el cuelgan tres cosas a la vez: la tinta `#8F2A17`, el peso 600 y que su toast diga
   * «Cerraría la sesión.» en vez de «Abriría …». Va como un campo y no como tres, que es lo que
   * impide que un dia una de las tres se quede atras.
   */
  readonly salida: boolean;
}

/**
 * Las tres opciones del menu de sesion (lineas 1694-1698).
 *
 * Ninguna hace nada de verdad, y es lo que el issue exige: **aqui no hay autenticacion** —ni
 * OIDC, ni Keycloak, ni token—, asi que la sesion es decorativa y las tres sacan su toast. El
 * dia que la haya, lo que cambia es lo que hacen; los rotulos y los iconos ya estan.
 */
export const OPCIONES_DE_SESION: readonly OpcionDeSesion[] = [
  {
    label: "Mi perfil",
    icono: ["M12 7.4a3 3 0 1 1-6 0 3 3 0 0 1 6 0", "M3.6 20c0-3 2.4-4.6 5.4-4.6s5.4 1.6 5.4 4.6"],
    salida: false,
  },
  {
    label: "Cambiar contraseña",
    icono: ["M7 11V8a5 5 0 0 1 10 0v3", "M5.5 11h13v9.5h-13z"],
    salida: false,
  },
  {
    label: "Cerrar sesión",
    icono: [
      "M9.5 20H6A1.5 1.5 0 0 1 4.5 18.5v-13A1.5 1.5 0 0 1 6 4h3.5",
      "M14 8l4 4-4 4",
      "M18 12H9",
    ],
    salida: true,
  },
];

/** El aviso de servicio que la campana anuncia y la banda despliega. */
export interface AvisoDelSistema {
  /** Lo que dice la pastilla roja de la campana. Es texto: el artboard escribe `'1'`. */
  readonly cuantos: string;
  /** El `aria-label` y el `title` de la campana. */
  readonly rotulo: string;
  /** El cuerpo de la banda, copiado letra a letra de la linea 431. */
  readonly texto: string;
}

/**
 * El unico aviso que el artboard trae.
 *
 * Habla de una inconsistencia de `rentas` —una emision masiva que dejo contribuyentes sin
 * cuponera—, y la caja se limita a **mostrarlo**: no lo consulta, no lo cuenta y no lo
 * resuelve. Es exactamente la frontera que CLAUDE.md describe, y por eso el aviso puede ser
 * un dato de esta interfaz sin que eso implique preguntarle nada a nadie.
 */
export const AVISO: AvisoDelSistema = {
  cuantos: "1",
  rotulo: "1 aviso del sistema",
  texto:
    "La emisión masiva del predial 2026 dejó 534 contribuyentes observados sin cuponera. " +
    "Hasta que se corrija la inconsistencia no se les puede cobrar el ejercicio.",
};
