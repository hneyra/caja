import { useState } from "react";
import { ENTIDAD, MODULO, NOMBRE_DE_LA_APLICACION } from "@/aplicacion";
import { AvisoDelSistema } from "@/barra/AvisoDelSistema";
import { BarraGlobal } from "@/barra/BarraGlobal";
import { Toast, usarToast } from "@/barra/Toast";
import { EJERCICIOS } from "@/datos";

/**
 * El armazon de `caja-web`: la barra global, el aviso de servicio y el toast.
 *
 * Debajo todavia no hay ninguna pantalla —llegan en los issues siguientes, portadas desde
 * `TesoreriaV6.dc.html`—, y por eso el cuerpo es un marcador de posicion que lo dice.
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
 * El arbol arranca cerrado, y a proposito.
 *
 * El artboard arranca con `secOpen: true` (linea 1219), pero el arbol llega en el issue
 * siguiente y un `aria-expanded="true"` sobre una region que no existe no es un detalle
 * cosmetico: un lector de pantalla lo anuncia. Cuando el arbol entre, esto vuelve a `true`.
 */
const NADA_ABIERTO: LoQueEstaAbierto = {
  modulos: false,
  paleta: false,
  lanzador: false,
  sesion: false,
};

export function App() {
  const [abierto, fijarAbierto] = useState<LoQueEstaAbierto>(NADA_ABIERTO);

  /**
   * Los dos booleanos del aviso, como en el artboard (linea 1225): `aviso` es si sigue vivo y
   * `avisoAbierto` si esta desplegado. La campana se ofrece solo mientras vive **y** no esta
   * desplegado (linea 1807), de modo que abrirlo ya la retira; descartarlo apaga los dos.
   */
  const [aviso, fijarAviso] = useState(true);
  const [avisoAbierto, fijarAvisoAbierto] = useState(false);

  const [ejercicio, fijarEjercicio] = useState(EJERCICIOS[0] ?? "");

  const { toast, avisar } = usarToast();

  return (
    <div
      // El estado de la paleta no se ve todavia —su dialogo es de otro issue—, asi que se
      // expone aqui: un estado que nadie puede observar no se puede verificar, y este si.
      data-paleta={abierto.paleta ? "abierta" : "cerrada"}
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

      <main
        style={{
          flex: 1,
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
          Arriba está la barra global. Debajo todavía no hay ninguna pantalla: el árbol de
          módulos, las pestañas y las cuatro pantallas llegan en los issues siguientes.
        </p>
      </main>

      {toast !== "" && <Toast texto={toast} />}
    </div>
  );
}
