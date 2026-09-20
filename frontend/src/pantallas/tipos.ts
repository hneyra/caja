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
 *
 * <h2>Y desde #100, una hoja puede servir MAS DE UN acceso</h2>
 *
 * La correspondencia dejo de ser una a una: `anulacion_recibo` no tiene hoja propia —no podia pedir
 * nada, y quien solo lo tenia no veia ni un recibo— y lo sirve una **accion** dentro de
 * `duplicado-recibo`, donde el recibo ya esta elegido y a la vista (ADR-0044). Ver `AccionDeLaHoja`.
 */

import type { DefinicionDeActo, DefinicionDeBloque, DefinicionDePantalla } from '@kamayuk/ui';

export type {
  CampoDeCasilla,
  CampoDeEntrada,
  CampoDeLista,
  CampoDeSoloLectura,
  ColumnaDeTabla as Columna,
  DefinicionDeAccion as Accion,
  DefinicionDeActo as Acto,
  DefinicionDeBloque as Bloque,
  DefinicionDeCampo as Campo,
  DefinicionDeTabla as Tabla,
  Texto,
} from '@kamayuk/ui';

/**
 * Una pantalla de la ventanilla: **bloques, y desde #100 tambien actos**.
 *
 * Hasta ADR-0044 era `DefinicionDePantalla` a secas —solo bloques—, porque ninguna pantalla
 * escribia. La anulacion de un cobro es un acto: un formulario con su observacion obligatoria
 * (regla 10) que **solo existe abierto**, y que abre una accion del bloque donde ya esta el recibo.
 *
 * **Se ensancha a dos piezas y no a las siete** que `PiezaDeLaPantalla` admite, a proposito: lo que
 * esta ventanilla dibuja hoy es esto, y un tipo mas ancho haria compilar un aviso o unas pestanas
 * que ninguna guarda de este arbol sabe recorrer —`bloquesDe()` las dejaria fuera en silencio—. El
 * dia que entre una tercera, entra aqui y en quien las recorre, a la vez.
 */
export type Pantalla = DefinicionDePantalla<DefinicionDeBloque | DefinicionDeActo>;

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

/**
 * **Una accion de una hoja que sirve OTRO acceso del catalogo** (#100, ADR-0044).
 *
 * Hasta aqui la correspondencia era una a una: un acceso, una hoja. `anulacion_recibo` la rompio, y
 * no por casualidad: su unica operacion es una escritura sobre un recibo, de modo que su hoja no
 * podia pedir nada y quien solo la tenia no veia ni un recibo que anular ([#100](https://github.com/hneyra/caja/issues/100)).
 *
 * Asi que un acceso se puede servir **desde una accion dentro de la hoja donde ya esta su sujeto**.
 * Lo que la accion declara es lo mismo que declara una hoja —que acceso sirve y que operacion
 * llama—, y `verificaciones/el-arbol-cuadra-con-el-backend.test.ts` lo ata igual: ningun acceso del
 * catalogo se queda sin quien lo sirva, y ninguna operacion declarada deja de existir.
 */
export interface AccionDeLaHoja {
  /** La `clave` del acto que abre, en la definicion de la pantalla de esta misma hoja. */
  readonly clave: string;
  /** El codigo de acceso de `CatalogoDelSistema` que esta accion sirve. **No** es el de la hoja. */
  readonly acceso: string;
  /**
   * La operacion que llama. **Siempre una escritura**: lo que se lee es de la hoja, y una lectura
   * declarada aqui se le escaparia a `lecturasDe()`. Lo comprueba la guarda del arbol.
   */
  readonly operacion: Operacion;
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
   * Las acciones de esta hoja que sirven **otro** acceso del catalogo (#100). Ver `AccionDeLaHoja`.
   *
   * Solo la declara `duplicado-recibo`, con la anulacion: las otras cinco no ofrecen ninguna.
   */
  readonly acciones?: readonly AccionDeLaHoja[];
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
