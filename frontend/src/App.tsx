import { useState } from "react";
import { ArbolDeModulos } from "@/arbol/ArbolDeModulos";
import { AvisoDelSistema } from "@/barra/AvisoDelSistema";
import { BarraGlobal } from "@/barra/BarraGlobal";
import { LanzadorDeModulos } from "@/barra/LanzadorDeModulos";
import { Toast, usarToast } from "@/barra/Toast";
import { EJERCICIOS, HOJAS } from "@/datos";
import { BarraDePestanas } from "@/marco/BarraDePestanas";
import type { Destino } from "@/marco/destino";
import { COBRO_NUEVO, SIN_EXTRAS } from "@/marco/destino";
import { DialogoDeCambios } from "@/marco/DialogoDeCambios";
import { FilaDelTitulo } from "@/marco/FilaDelTitulo";
import type { Pantalla } from "@/marco/MarcadorDeSeccion";
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
import { usarAtajos } from "@/marco/usarAtajos";
import { usarPestanas } from "@/marco/usarPestanas";
import { PaletaDeComandos } from "@/paleta/PaletaDeComandos";
import { PantallaDeSeccion } from "@/pantallas/PantallaDeSeccion";

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
 * <h2>La ranura por la que entran las cuatro pantallas</h2>
 *
 * `Pantalla` es el componente que dibuja la seccion activa, y por omision es
 * {@link PantallaDeSeccion}: el reparto de las cuatro secciones propias, con el Panel portado
 * y las otras tres todavia en el marcador. El marco no sabe cual es cual —lo unico que cambia
 * con la seccion es el titulo, y eso lo calcula `rotulos.ts`—, asi que portar una pantalla mas
 * no toca este archivo.
 *
 * Es tambien la ranura por la que las pruebas del marco enchufan una pantalla que edita un
 * campo, que es lo unico que hace observable `fijarCampo` y la unica forma de ensuciar una
 * pestana.
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
  /** La paleta de comandos. */
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

export function App({ Pantalla = PantallaDeSeccion }: AppProps = {}) {
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
   * Con que estado se abre la seccion activa: el `extra` del `ir(dest, extra)` del artboard.
   *
   * Se le pasa entero a la pantalla que se dibuja, y ademas se expone en los `data-` de la
   * raiz. Los `data-` siguen valiendo la pena mientras tres de las cuatro pantallas sean el
   * marcador: son lo unico que hace observable el destino de una navegacion cuyo destino nadie
   * dibuja todavia. Lo que hay dentro y por que se reemplaza entero, en
   * {@link import("@/marco/destino").Destino}.
   */
  const [destino, fijarDestino] = useState<Destino>(SIN_EXTRAS);

  /**
   * Ir a un destino: lo abre si no estaba, lo activa y **cierra el lanzador y la paleta**.
   *
   * Los dos cierres son del artboard (`ir`, linea 1345) y valen para las cuatro puertas de
   * entrada —el arbol, la barra de pestanas, el boton «Cobrar» y la paleta—, que es por lo que
   * estan aqui y no en cada una: olvidar uno no rompe nada visible hasta que dos capas se
   * dibujan a la vez.
   */
  const irA = (clave: string, extra: Destino = SIN_EXTRAS) => {
    fijarAbierto((x) => ({ ...x, lanzador: false, paleta: false }));
    fijarDestino(extra);
    pestanas.ir(clave);
  };

  const visibles = pestanasDe(pestanas.abiertas, pestanas.activa, pestanas.sucias);
  const activa = pestanas.activa;
  const hayPestanas = pestanas.abiertas.length > 0 && activa !== null;
  const ajena = activa !== null && !esSeccionPropia(activa);
  const porCerrar = pestanas.porCerrar;
  const rotuloPorCerrar =
    porCerrar === null ? "" : (HOJAS[porCerrar]?.label ?? porCerrar);

  /**
   * Cuantas pestanas tienen cambios sin guardar: lo que el menu de sesion avisa.
   *
   * Se cuentan las que valen `true` y no las claves del objeto, que es lo que hace el artboard
   * (`Object.keys(s.sucias).length`, linea 1691): una clave con `false` dentro contaria igual, y
   * el aviso diria que hay cambios que perder donde no los hay.
   */
  const cuantasSucias = Object.values(pestanas.sucias).filter((x) => x).length;

  /** Cierra las tres capas flotantes. Es la mitad `Escape` del `_tecla` del artboard (1257). */
  const cerrarCapas = () =>
    fijarAbierto((x) => ({ ...x, paleta: false, lanzador: false, sesion: false }));

  /**
   * `Ctrl/Cmd + K` alterna la paleta **y limpia la consulta** (linea 1249).
   *
   * Lo de limpiarla no hace falta escribirlo: la paleta guarda su consulta dentro, y cerrarla la
   * desmonta. Reabrirla monta una nueva, con el campo vacio y el foco en el primer resultado.
   */
  usarAtajos({
    alAlternarPaleta: () =>
      fijarAbierto((x) => ({ ...x, paleta: !x.paleta, lanzador: false })),
    alCerrarCapas: cerrarCapas,
  });

  return (
    <div
      // El estado de la paleta se expone tambien aqui, y sigue valiendo la pena: desde este
      // issue hay dialogo que mirar, pero `barra.test.tsx` mide con este atributo que abrir el
      // lanzador la cierra sin tener que abrirla antes.
      data-paleta={abierto.paleta ? "abierta" : "cerrada"}
      // `data-ir` es **la seccion activa**, que desde el issue del marco ya se ve en la barra de
      // pestanas y en el titulo; sigue estando porque `arbol.test.tsx` mide con ella que
      // pulsar un submodulo llega hasta aqui. Los cuatro `data-ir-*` son el `extra` del
      // destino, que todavia no dibuja ninguna pantalla.
      data-ir={activa ?? ""}
      data-ir-nodo={destino.nodo === undefined ? "" : String(destino.nodo)}
      data-ir-valtab={destino.valTab === undefined ? "" : String(destino.valTab)}
      data-ir-chip={destino.chip ?? ""}
      data-ir-recibo={destino.recibo ?? ""}
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
        alCerrarSesion={() => fijarAbierto((x) => ({ ...x, sesion: false }))}
        cuantasSucias={cuantasSucias}
        alAvisar={avisar}
      />

      {/* Las dos capas flotantes del documento. El menu de sesion NO esta aqui: cuelga de la
          ficha que lo abre (`position:absolute`, linea 176) y lo dibuja `BarraGlobal`. */}
      {abierto.lanzador && (
        <LanzadorDeModulos
          alCerrar={() => fijarAbierto((x) => ({ ...x, lanzador: false }))}
          alAvisar={avisar}
        />
      )}

      {abierto.paleta && (
        <PaletaDeComandos
          alCerrar={() => fijarAbierto((x) => ({ ...x, paleta: false }))}
          alElegir={(resultado) => {
            irA(resultado.seccion, resultado.destino);
            if (resultado.aviso !== undefined) avisar(resultado.aviso);
          }}
        />
      )}

      {/* La fila de la linea 204 del artboard: el arbol a la izquierda y el resto a la derecha.
          El arbol **empuja** el contenido en vez de taparlo, que es lo que dice el issue de la
          barra global, y por eso es una fila y no una capa flotante. */}
      <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>
        {abierto.modulos && (
          <ArbolDeModulos
            abiertas={pestanas.abiertas}
            activa={activa}
            sucias={pestanas.sucias}
            alIr={irA}
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
            alIr={irA}
            alCerrar={(clave) => pestanas.pedirCierre(clave)}
          />

          {hayPestanas && (
            <FilaDelTitulo
              titulo={tituloDe(activa)}
              subtitulo={subtituloDe(activa)}
              hayAccion={activa !== null && esSeccionPropia(activa)}
              // El `nuevo()` del artboard (linea 2073): abre Recibos **con un cobro empezado**,
              // que es lo mismo que hace la accion «Cobrar» de la paleta. Los dos pasan por
              // aqui con el mismo destino para que no puedan separarse.
              alCobrar={() => {
                irA("predios", { recibo: COBRO_NUEVO });
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
              destino={destino}
              irA={irA}
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
