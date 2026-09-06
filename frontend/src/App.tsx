import { useState } from "react";
import { ArbolDeModulos, type DestinoDelArbol } from "@/arbol/ArbolDeModulos";
import { AvisoDelSistema } from "@/barra/AvisoDelSistema";
import { BarraGlobal } from "@/barra/BarraGlobal";
import { Toast, usarToast } from "@/barra/Toast";
import { EJERCICIOS, HOJAS } from "@/datos";
import { BarraDePestanas } from "@/marco/BarraDePestanas";
import { DialogoDeCambios } from "@/marco/DialogoDeCambios";
import { FilaDelTitulo } from "@/marco/FilaDelTitulo";
import { MarcadorDeSeccion, type Pantalla } from "@/marco/MarcadorDeSeccion";
import { PestanaAjena } from "@/marco/PestanaAjena";
import {
  esSeccionPropia,
  MENSAJE_DE_COBRO_NUEVO,
  mensajeDeGuardado,
  pestanasDe,
  subtituloDe,
  tituloDe,
} from "@/marco/rotulos";
import { SinPestanas } from "@/marco/SinPestanas";
import { usarPestanas } from "@/marco/usarPestanas";

/**
 * El marco de `caja-web`: la barra global, el arbol de modulos, las pestanas y lo que hay
 * abierto en ellas.
 *
 * Portado de `TesoreriaV6.dc.html`: la fila de las lineas 204 y 378, la barra de pestanas
 * (380-401), la fila del titulo (403-416), el hueco sin pestanas (418-426), la banda del aviso
 * (428-436), la tarjeta de pestana ajena (438-464) y el dialogo de cambios sin guardar
 * (862-883).
 *
 * <h2>Donde vive el estado</h2>
 *
 * Aqui, como en el artboard: un solo componente con un solo `state`. Lo que la barra hace es
 * **alternarlo**, no interpretarlo. Lo que ya es demasiado para un `useState` suelto —lo
 * abierto, lo activo, lo sucio y lo que se pregunta cerrar— vive en `usarPestanas`, que es el
 * mismo objeto de estado del artboard con sus transiciones al lado.
 *
 * <h2>Las cuatro pantallas no estan, y la ranura por la que entraran si</h2>
 *
 * `Pantalla` es el componente que dibuja la seccion activa. Por omision es
 * `MarcadorDeSeccion`, que dice que la pantalla llega despues; cuando se porten, se sustituye
 * ahi y el marco no se entera. Es tambien lo que hace observable `fijarCampo`, la unica forma
 * de ensuciar una pestana.
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
  /** El arbol de modulos de la izquierda. */
  readonly modulos: boolean;
  /** La paleta de comandos. Su contenido es del issue de la paleta. */
  readonly paleta: boolean;
  readonly lanzador: boolean;
  readonly sesion: boolean;
}

/** El arbol arranca **desplegado**, como el artboard (`secOpen: true`, linea 1219). */
const AL_ARRANCAR: LoQueEstaAbierto = {
  modulos: true,
  paleta: false,
  lanzador: false,
  sesion: false,
};

export interface AppProps {
  /**
   * Quien dibuja la seccion propia que este activa.
   *
   * Se pasa entera y no seccion a seccion porque las cuatro pantallas comparten contrato
   * ({@link import("@/marco/MarcadorDeSeccion").PropsDePantalla}) y el marco no distingue entre
   * ellas: lo que cambia con la seccion es el titulo, y eso lo calcula `rotulos.ts`.
   */
  readonly Pantalla?: Pantalla;
}

export function App({ Pantalla = MarcadorDeSeccion }: AppProps = {}) {
  const [abierto, fijarAbierto] = useState<LoQueEstaAbierto>(AL_ARRANCAR);

  /**
   * Los dos booleanos del aviso, como en el artboard (linea 1225): `aviso` es si sigue vivo y
   * `avisoAbierto` si esta desplegado. La campana se ofrece solo mientras vive **y** no esta
   * desplegado (linea 1807), de modo que abrirlo ya la retira; descartarlo apaga los dos.
   */
  const [aviso, fijarAviso] = useState(true);
  const [avisoAbierto, fijarAvisoAbierto] = useState(false);

  const [ejercicio, fijarEjercicio] = useState(EJERCICIOS[0] ?? "");

  const { toast, avisar } = usarToast();

  const pestanas = usarPestanas();

  /**
   * Lo que el arbol llama al pulsar un submodulo o una entrada de la cola.
   *
   * El `nodo` de la cola de trabajo se recibe y **todavia no se usa**: es la fila de «Cajas y
   * arqueo» que hay que abrir, y quien la abre es esa pantalla, que llega despues. Se expone
   * en un `data-` para que la prueba del arbol pueda seguir midiendolo.
   */
  const [nodo, fijarNodo] = useState<number | null>(null);
  const alIr = (clave: string, extra?: DestinoDelArbol) => {
    fijarNodo(extra?.nodo ?? null);
    fijarAbierto((x) => ({ ...x, lanzador: false, paleta: false }));
    pestanas.ir(clave);
  };

  const visibles = pestanasDe(pestanas.abiertas, pestanas.activa, pestanas.sucias);
  const activa = pestanas.activa;
  const hayPestanas = pestanas.abiertas.length > 0 && activa !== null;
  const ajena = activa !== null && !esSeccionPropia(activa);
  const porCerrar = pestanas.porCerrar;
  const rotuloPorCerrar =
    porCerrar === null ? "" : (HOJAS[porCerrar]?.label ?? porCerrar);

  return (
    <div
      // El estado de la paleta no se ve todavia —su dialogo es de otro issue—, asi que se
      // expone aqui: un estado que nadie puede observar no se puede verificar, y este si.
      data-paleta={abierto.paleta ? "abierta" : "cerrada"}
      // `data-ir` es **la seccion activa**, que desde este issue ya se ve en la barra de
      // pestanas y en el titulo; sigue estando porque `arbol.test.tsx` mide con ella que
      // pulsar un submodulo llega hasta aqui. `data-ir-nodo` es lo unico que todavia no se
      // dibuja en ningun sitio.
      data-ir={activa ?? ""}
      data-ir-nodo={nodo === null ? "" : String(nodo)}
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

      {/* La fila de la linea 204 del artboard: el arbol a la izquierda y el resto a la derecha.
          El arbol **empuja** el contenido en vez de taparlo, que es lo que dice el issue de la
          barra global, y por eso es una fila y no una capa flotante. */}
      <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>
        {abierto.modulos && (
          <ArbolDeModulos
            abiertas={pestanas.abiertas}
            activa={activa}
            sucias={pestanas.sucias}
            alIr={alIr}
          />
        )}

        {/* La columna de la derecha, linea 378. Es un `<main>` y no un `<div>`: el artboard no
            marca landmarks y esta pantalla si los necesita. */}
        <main
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <BarraDePestanas
            pestanas={visibles}
            alIr={(clave) => pestanas.ir(clave)}
            alCerrar={(clave) => pestanas.pedirCierre(clave)}
          />

          {hayPestanas && (
            <FilaDelTitulo
              titulo={tituloDe(activa)}
              subtitulo={subtituloDe(activa)}
              hayAccion={activa !== null && esSeccionPropia(activa)}
              alCobrar={() => {
                pestanas.ir("predios");
                avisar(MENSAJE_DE_COBRO_NUEVO);
              }}
            />
          )}

          {!hayPestanas && <SinPestanas />}

          {/* La banda del aviso va **debajo de la barra de pestanas** (linea 428), que es donde
              el artboard la pone. Hasta este issue estaba bajo la barra global porque no habia
              pestanas debajo de las que ponerla. */}
          {aviso && avisoAbierto && (
            <AvisoDelSistema
              alDescartar={() => {
                fijarAviso(false);
                fijarAvisoAbierto(false);
              }}
            />
          )}

          {activa !== null && ajena && (
            <PestanaAjena clave={activa} alCerrar={() => pestanas.pedirCierre(activa)} />
          )}

          {activa !== null && esSeccionPropia(activa) && (
            <Pantalla
              seccion={activa}
              fijarCampo={pestanas.fijarCampo}
              valorDeCampo={pestanas.valorDeCampo}
            />
          )}
        </main>
      </div>

      {porCerrar !== null && (
        <DialogoDeCambios
          rotulo={rotuloPorCerrar}
          alDescartar={() => pestanas.cerrarPestana(porCerrar)}
          alSeguir={pestanas.cancelarCierre}
          alGuardar={() => {
            avisar(mensajeDeGuardado(rotuloPorCerrar));
            pestanas.cerrarPestana(porCerrar);
          }}
        />
      )}

      {toast !== "" && <Toast texto={toast} />}
    </div>
  );
}
