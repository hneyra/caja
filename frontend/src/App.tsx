import { useState } from "react";
import { ENTIDAD, MODULO, NOMBRE_DE_LA_APLICACION } from "@/aplicacion";
import { ArbolDeModulos, type DestinoDelArbol } from "@/arbol/ArbolDeModulos";
import { AvisoDelSistema } from "@/barra/AvisoDelSistema";
import { BarraGlobal } from "@/barra/BarraGlobal";
import { Toast, usarToast } from "@/barra/Toast";
import { EJERCICIOS } from "@/datos";

/**
 * El armazon de `caja-web`: la barra global, el aviso de servicio, el arbol de modulos y el toast.
 *
 * A la derecha del arbol todavia no hay ninguna pantalla —llegan en los issues siguientes,
 * portadas desde `TesoreriaV6.dc.html`—, y por eso el cuerpo es un marcador de posicion que lo
 * dice.
 *
 * <h2>Donde vive el estado</h2>
 *
 * Aqui, como en el artboard: un solo componente con un solo `state`. Lo que la barra hace es
 * **alternarlo**, no interpretarlo, que es lo que permite que el arbol de modulos, las
 * pestanas y la paleta se enchufen despues sin tocar la barra.
 */

/** El texto del toast al cambiar de ejercicio. Artboard, linea 1496. */
export const mensajeDeEjercicio = (ejercicio: string) =>
  `Ejercicio ${ejercicio}: la multa se calcula con la UIT de ese año.`;

/**
 * Lo que la barra abre y cierra.
 *
 * Van juntos en un solo objeto porque **se excluyen entre si**, y esa exclusion es del
 * artboard, no un invento: abrir el arbol o la ficha de sesion cierra el lanzador y la paleta
 * (lineas 1508 y 1685), abrir el lanzador cierra la paleta (1710) y abrir la paleta cierra el
 * lanzador (1729). Con cuatro `useState` sueltos, olvidarse de una de esas cuatro reglas no
 * rompe nada visible hasta que dos capas se dibujan a la vez.
 */
interface LoQueEstaAbierto {
  /** El arbol de modulos de la izquierda. Lo dibuja el issue del arbol. */
  readonly modulos: boolean;
  /** La paleta de comandos. Su contenido es del issue de la paleta. */
  readonly paleta: boolean;
  readonly lanzador: boolean;
  readonly sesion: boolean;
}

/**
 * El arbol arranca **desplegado**, como el artboard (`secOpen: true`, linea 1219).
 *
 * Hasta el issue del arbol arrancaba cerrado, y con su motivo escrito aqui: un
 * `aria-expanded="true"` sobre una region que no existe lo anuncia un lector de pantalla. Ahora
 * la region existe —el `<aside aria-label="Módulos y submódulos">`—, asi que la deuda se paga.
 */
const AL_ARRANCAR: LoQueEstaAbierto = {
  modulos: true,
  paleta: false,
  lanzador: false,
  sesion: false,
};

/**
 * Las pestanas abiertas al arrancar y cual es la activa: `abiertas: ['panel']` y `dest: 'panel'`
 * del artboard (linea 1219).
 *
 * Son **constantes y no estado**, y eso es el limite de este issue: el arbol las dibuja —la
 * pastilla de cuantas hay abiertas por modulo, el realce de la activa y la marca «abierta»— pero
 * abrirlas y cerrarlas es la barra de pestanas, que llega en el issue siguiente. Un `useState`
 * aqui seria empezar a escribir `ir()` sin la mitad que lo usa.
 */
const ABIERTAS_AL_ARRANCAR: readonly string[] = ["panel"];
const ACTIVA_AL_ARRANCAR = "panel";

export function App() {
  const [abierto, fijarAbierto] = useState<LoQueEstaAbierto>(AL_ARRANCAR);

  /**
   * El ultimo destino que el arbol pidio.
   *
   * No abre nada: aqui no hay pestanas ni enrutado por hash todavia. Se guarda por el mismo
   * motivo que `data-paleta` —un estado que nadie puede observar no se puede verificar—, de modo
   * que la prueba pueda afirmar que pulsar un submodulo llama al `alIr` inyectado con su clave, y
   * que la cola de trabajo llama con el nodo de «Cajas y arqueo» que le toca.
   */
  const [destino, fijarDestino] = useState<{ clave: string; nodo?: number } | null>(null);

  /**
   * Los dos booleanos del aviso, como en el artboard (linea 1225): `aviso` es si sigue vivo y
   * `avisoAbierto` si esta desplegado. La campana se ofrece solo mientras vive **y** no esta
   * desplegado (linea 1807), de modo que abrirlo ya la retira; descartarlo apaga los dos.
   */
  const [aviso, fijarAviso] = useState(true);
  const [avisoAbierto, fijarAvisoAbierto] = useState(false);

  const [ejercicio, fijarEjercicio] = useState(EJERCICIOS[0] ?? "");

  const { toast, avisar } = usarToast();

  /** Lo que el arbol llama al pulsar un submodulo o una entrada de la cola. */
  const alIr = (clave: string, extra?: DestinoDelArbol) =>
    fijarDestino({ clave, ...(extra?.nodo === undefined ? {} : { nodo: extra.nodo }) });

  return (
    <div
      // El estado de la paleta no se ve todavia —su dialogo es de otro issue—, asi que se
      // expone aqui: un estado que nadie puede observar no se puede verificar, y este si.
      data-paleta={abierto.paleta ? "abierta" : "cerrada"}
      data-ir={destino?.clave ?? ""}
      data-ir-nodo={destino?.nodo === undefined ? "" : String(destino.nodo)}
      style={{ display: "flex", flexDirection: "column", height: "100vh" }}
    >
      <BarraGlobal
        modulosVisibles={abierto.modulos}
        alAlternarModulos={() =>
          fijarAbierto((x) => ({ ...x, modulos: !x.modulos, lanzador: false, paleta: false }))
        }
        hayAviso={aviso && !avisoAbierto}
        alVerAviso={() => fijarAvisoAbierto(true)}
        ejercicio={ejercicio}
        alCambiarEjercicio={(nuevo) => {
          fijarEjercicio(nuevo);
          avisar(mensajeDeEjercicio(nuevo));
        }}
        alAbrirPaleta={() => fijarAbierto((x) => ({ ...x, paleta: true, lanzador: false }))}
        lanzadorAbierto={abierto.lanzador}
        alAlternarLanzador={() =>
          fijarAbierto((x) => ({ ...x, lanzador: !x.lanzador, paleta: false }))
        }
        sesionAbierta={abierto.sesion}
        alAlternarSesion={() =>
          fijarAbierto((x) => ({ ...x, sesion: !x.sesion, lanzador: false, paleta: false }))
        }
      />

      {aviso && avisoAbierto && (
        <AvisoDelSistema
          alDescartar={() => {
            fijarAviso(false);
            fijarAvisoAbierto(false);
          }}
        />
      )}

      {/* La fila de la linea 204 del artboard: el arbol a la izquierda y el resto a la derecha.
          El arbol **empuja** el contenido en vez de taparlo, que es lo que dice el issue de la
          barra global, y por eso es una fila y no una capa flotante. */}
      <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>
        {abierto.modulos && (
          <ArbolDeModulos
            abiertas={ABIERTAS_AL_ARRANCAR}
            activa={ACTIVA_AL_ARRANCAR}
            alIr={alIr}
          />
        )}

        <main
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            overflow: "auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            padding: 24,
          }}
        >
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: "var(--peso-fuerte)" }}>
            {NOMBRE_DE_LA_APLICACION}
          </h1>
          <p style={{ margin: 0, color: "var(--tinta-2)" }}>
            {MODULO} · {ENTIDAD}
          </p>
          <p style={{ margin: 0, maxWidth: 440, textAlign: "center", color: "var(--tinta-3)" }}>
            A la izquierda está el árbol de módulos y arriba la barra global. Aquí todavía no hay
            ninguna pantalla: las pestañas y las cuatro pantallas llegan en los issues siguientes.
          </p>
        </main>
      </div>

      {toast !== "" && <Toast texto={toast} />}
    </div>
  );
}
