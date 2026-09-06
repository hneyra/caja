import { useCallback, useEffect, useRef, useState } from "react";
import { destinoDelHash, marcarHash } from "@/marco/hash";

/**
 * Lo que hay abierto, cual esta activa, cuales estan sucias y cual se pregunta si cerrar.
 *
 * Portado de `TesoreriaV6.dc.html` — el estado de la linea 1219, `ir` (1343-1349), `pedirCierre`
 * y `cerrarPestana` (1314-1333), `set` (1352-1357) y el `componentDidMount` de 1228-1237.
 *
 * <h2>`ir` esta escrita tres veces, y no se leyo cual gana: se ejecuto</h2>
 *
 * Las lineas 1299, 1334 y 1343 declaran `ir` en la misma clase, y en JavaScript la ultima
 * sustituye a las anteriores. Cargando el `<script type="text/x-dc">` del artboard en Node,
 * `Component.prototype.ir.toString()` **no contiene** el comentario «Abrir un submódulo…» de la
 * 1299: la que queda es la de la 1343. Las tres tienen el mismo cuerpo, asi que el duplicado es
 * inerte — pero eso tambien es una medida, no una lectura.
 *
 * <h2>La unica desviacion, y por que</h2>
 *
 * El artboard, al arrancar con un hash valido, hace `setState({ dest: inicial })` **sin tocar
 * `abiertas`**. Medido: con `#cajas` en la URL queda `abiertas: ['panel']` y `dest:
 * 'territorio'`, o sea **una seccion activa que ninguna pestana representa** — la barra dibuja
 * «Panel» con `aria-current="false"` y el titulo dice «Cajas y arqueo». Lo mismo con un
 * `hashchange` externo. Aqui las dos entradas pasan por {@link abrirEn}, de modo que **la
 * activa siempre esta abierta**: sin esa invariante, «la vecina de la izquierda» al cerrar
 * —que se calcula sobre `abiertas`— no significa nada.
 */

/** El estado del marco, entero. Va junto porque las transiciones lo mueven junto. */
export interface EstadoDePestanas {
  /** Las claves abiertas, en el orden en que se abrieron. */
  readonly abiertas: readonly string[];
  /** La clave activa, o `null` cuando no queda ninguna. */
  readonly activa: string | null;
  /** Las que tienen cambios sin guardar. */
  readonly sucias: Readonly<Record<string, boolean>>;
  /** La que se ha pedido cerrar y esta esperando respuesta en el dialogo. */
  readonly porCerrar: string | null;
  /** Lo que se lleva escrito en los campos. Lo llenaran las pantallas. */
  readonly vals: Readonly<Record<string, string>>;
}

/** Como arranca: con el Panel abierto y activo, igual que el artboard (linea 1219). */
export const AL_ARRANCAR: EstadoDePestanas = {
  abiertas: ["panel"],
  activa: "panel",
  sucias: {},
  porCerrar: null,
  vals: {},
};

/**
 * Abre `destino` si no estaba y lo activa.
 *
 * Devuelve **el mismo objeto** cuando no cambia nada —pulsar la pestana que ya esta activa—,
 * que es lo que evita un redibujo y, con el, una escritura mas en el historial.
 */
export function abrirEn(estado: EstadoDePestanas, destino: string): EstadoDePestanas {
  const yaEstaba = estado.abiertas.includes(destino);
  if (yaEstaba && estado.activa === destino) return estado;
  return {
    ...estado,
    activa: destino,
    abiertas: yaEstaba ? estado.abiertas : [...estado.abiertas, destino],
  };
}

/**
 * Cierra `destino` y activa **la vecina de la izquierda**; si no hay, la de la derecha.
 *
 * `quedan[Math.max(i - 1, 0)]` hace las dos cosas con una sola expresion: `i - 1` es la de la
 * izquierda, y cuando se cierra la primera (`i === 0`) el `max` deja el indice 0, que tras el
 * filtrado es la que estaba a su derecha. Cerrar la ultima deja `activa` en `null` y el espacio
 * vacio, que es honesto: no hay nada abierto.
 */
export function cerrarEn(estado: EstadoDePestanas, destino: string): EstadoDePestanas {
  const i = estado.abiertas.indexOf(destino);
  if (i < 0) return estado;
  const quedan = estado.abiertas.filter((x) => x !== destino);
  const activa =
    estado.activa === destino
      ? quedan.length === 0
        ? null
        : (quedan[Math.max(i - 1, 0)] ?? null)
      : estado.activa;
  const sucias = { ...estado.sucias };
  delete sucias[destino];
  return { ...estado, abiertas: quedan, activa, sucias, porCerrar: null };
}

/** Lo que el marco ofrece a quien lo dibuja. */
export interface Pestanas extends EstadoDePestanas {
  /** Abre un submodulo —o lo activa si ya estaba— y escribe su hash. */
  readonly ir: (destino: string) => void;
  /** Pide cerrar: si esta sucia, pregunta; si no, cierra. */
  readonly pedirCierre: (destino: string) => void;
  /** Cierra sin preguntar. Es lo que hacen «Descartar y cerrar» y «Guardar y cerrar». */
  readonly cerrarPestana: (destino: string) => void;
  /** «Seguir editando»: retira la pregunta y deja la pestana como estaba. */
  readonly cancelarCierre: () => void;
  /**
   * Lo que una pantalla llama al editar un campo: guarda el valor y **marca sucia la activa**.
   *
   * Es el `set(k, v)` del artboard (lineas 1352-1357), y es la unica forma de ensuciar una
   * pestana. Hoy no lo llama nadie porque las cuatro pantallas todavia no tienen campos; lo
   * llamaran tal cual cuando los tengan, que es por lo que esta escrito asi y no como un
   * interruptor de prueba.
   */
  readonly fijarCampo: (clave: string, valor: string) => void;
  /** El valor de un campo, o `porOmision` si nadie lo ha tocado. Es el `val(k, d)` de la 1358. */
  readonly valorDeCampo: (clave: string, porOmision: string) => string;
}

export function usarPestanas(): Pestanas {
  const [estado, fijar] = useState<EstadoDePestanas>(AL_ARRANCAR);

  const ir = useCallback((destino: string) => fijar((s) => abrirEn(s, destino)), []);

  const cerrarPestana = useCallback((destino: string) => fijar((s) => cerrarEn(s, destino)), []);

  const pedirCierre = useCallback(
    (destino: string) =>
      fijar((s) => (s.sucias[destino] === true ? { ...s, porCerrar: destino } : cerrarEn(s, destino))),
    [],
  );

  const cancelarCierre = useCallback(() => fijar((s) => ({ ...s, porCerrar: null })), []);

  const fijarCampo = useCallback(
    (clave: string, valor: string) =>
      fijar((s) => ({
        ...s,
        vals: { ...s.vals, [clave]: valor },
        sucias: s.activa === null ? s.sucias : { ...s.sucias, [s.activa]: true },
      })),
    [],
  );

  const valorDeCampo = useCallback(
    (clave: string, porOmision: string) => estado.vals[clave] ?? porOmision,
    [estado.vals],
  );

  /**
   * El hash, en un solo efecto: **se lee al arrancar y se escribe despues**.
   *
   * En dos efectos separados el orden de montaje los enfrenta —el que escribe correria con la
   * seccion vieja antes de que el que lee la cambiara, dejando un `#panel` escrito de mas en
   * una carga con `#cajas`—, asi que el primer pase lee y los siguientes escriben. Si el hash
   * no nombra ninguna seccion valida (`#zzz`, o ninguno) se marca la que hay, que es lo que
   * hace el artboard en la linea 1232.
   */
  const primerPase = useRef(true);
  useEffect(() => {
    if (primerPase.current) {
      primerPase.current = false;
      const inicial = destinoDelHash(window.location.hash);
      if (inicial !== null && inicial !== estado.activa) {
        ir(inicial);
        return;
      }
    }
    if (estado.activa !== null) marcarHash(estado.activa);
  }, [estado.activa, ir]);

  /**
   * Un `hashchange` de fuera —el boton de atras, un enlace pegado— cambia la seccion.
   *
   * Solo escucha el que **viene de fuera**: `marcarHash` usa `replaceState`, que no dispara
   * `hashchange`, de modo que este oyente no puede realimentarse solo.
   */
  useEffect(() => {
    const alCambiarElHash = () => {
      const destino = destinoDelHash(window.location.hash);
      if (destino === null) return;
      fijar((s) => abrirEn(s, destino));
    };
    window.addEventListener("hashchange", alCambiarElHash);
    return () => window.removeEventListener("hashchange", alCambiarElHash);
  }, []);

  return {
    ...estado,
    ir,
    pedirCierre,
    cerrarPestana,
    cancelarCierre,
    fijarCampo,
    valorDeCampo,
  };
}
