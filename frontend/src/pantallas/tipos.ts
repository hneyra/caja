import type { NombreDeIcono } from '@kamayuk/ui';

/**
 * Los tipos del **arbol de la ventanilla**: sus modulos, sus hojas y lo que cada hoja pide al backend (#74).
 *
 * <h2>Lo que NO esta aqui: la forma de una pantalla</h2>
 *
 * Campo, bloque, tabla y pantalla son del interprete, y el interprete es de `@kamayuk/ui` desde
 * `kamayuk-lib`#27. Se reexportan con los nombres cortos que usan las definiciones, igual que hace
 * `rentas`, y nada mas: una segunda declaracion aqui seria una copia que el dia que la libreria
 * cambie se queda vieja en verde.
 *
 * <h2>Lo que SI esta, y por que difiere de `rentas`</h2>
 *
 * El arbol de `rentas` sale de su artboard (`RentasV8.dc.html`), y cada hoja declara sus operaciones
 * con un verbo `BASE` para las que solo se leyo el `@RequestMapping` de la clase. **El de `caja` no
 * tiene artboard**: sale de sus accesos y de sus controladores, que es lo que se decidio en #74. De
 * ahi tres diferencias:
 *
 *   · **Cada hoja nombra su `acceso`**, el codigo de `CatalogoDelSistema`. En `rentas` el filtro es
 *     por modulo porque no hay correspondencia publicada entre hoja y acceso (`rentas`#120); aqui la
 *     correspondencia ES el arbol, y la vigila `verificaciones/el-arbol-cuadra-con-el-backend.test.ts`
 *     contra el catalogo y contra cada `@RequiereAcceso`.
 *   · **No hay `BASE`**: cada operacion se leyo en su metodo, con su verbo.
 *   · **El icono se nombra** en vez de deducirse de un trazo: no hay trazo de artboard del que
 *     deducirlo.
 */

export type {
  CampoDeCasilla,
  CampoDeEntrada,
  CampoDeLista,
  CampoDeSoloLectura,
  ColumnaDeTabla as Columna,
  DefinicionDeBloque as Bloque,
  DefinicionDeCampo as Campo,
  DefinicionDePantalla as Pantalla,
  DefinicionDeTabla as Tabla,
} from '@kamayuk/ui';

/** El verbo de una operacion. Solo los dos que este backend usa: no hay `PUT` ni `PATCH`. */
export type Verbo = 'GET' | 'POST';

/** Una operacion del backend que la hoja declara. */
export interface Operacion {
  readonly verbo: Verbo;
  /**
   * La ruta relativa a `/caja/api/v1`, con sus variables entre llaves —`/turnos/{turnoId}/cierre`—,
   * tal como la escribe el `@GetMapping` o el `@PostMapping`.
   */
  readonly ruta: string;
  /** El controlador que la publica. Es donde mirar cuando la guarda diga que no esta. */
  readonly controlador: string;
}

/** Una hoja del arbol: un acceso del catalogo, y la pantalla que abre. */
export interface Hoja {
  /** La clave que empareja la hoja con su pantalla, y la que viaja al hash: el acceso con guiones. */
  readonly clave: string;
  readonly rotulo: string;
  /** El codigo de acceso de `CatalogoDelSistema` que esta hoja representa. */
  readonly acceso: string;
  readonly operaciones: readonly Operacion[];
  /**
   * **Lo que la ruta de esta hoja guarda** (`kamayuk-lib`#67), y que `catalogo.ts` copia al destino.
   *
   * `#/<slug>/<sujeto>?<parametro>=<valor>`, y **solo lo declarado**: lo que no se nombre aqui, el
   * marco lo ignora con aviso aunque llegue escrito en la barra. Sin esto, una hoja que eligiera
   * algo lo perderia al recargar y el enlace compartido abriria otra cosa.
   */
  readonly enLaRuta?: {
    readonly sujeto?: boolean;
    readonly parametros?: readonly string[];
  };
}

/** Un modulo del arbol. */
export interface Modulo {
  readonly rotulo: string;
  /** La linea de debajo del rotulo: de que va el modulo. */
  readonly nota: string;
  /** El segmento del modulo en el hash. */
  readonly slug: string;
  /**
   * El codigo con que `GET /seguridad/modulos` publica este modulo. Es la llave del empalme con lo
   * que la instalacion publica: no se empalma por el rotulo, que cualquiera corrige.
   */
  readonly codigo: string;
  /** El icono, por su nombre en el catalogo de `@kamayuk/ui`. */
  readonly icono: NombreDeIcono;
  readonly hojas: readonly Hoja[];
}
