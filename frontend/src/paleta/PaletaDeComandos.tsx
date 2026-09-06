import type { CSSProperties, KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import type { ResultadoDeLaPaleta } from "@/paleta/acciones";
import { PISTA_DE_LA_PALETA, pieDe, resultadosDe, ROTULO_DEL_CAMPO } from "@/paleta/acciones";

/**
 * La paleta de comandos: `Ctrl/Cmd + K`, se teclea, y se elige.
 *
 * Portada de `TesoreriaV6.dc.html` — plantilla de las lineas 74-97, resultados en 1478-1485 y
 * 1725-1730. Los estilos van **en linea y con los valores del artboard** (`PORTAR.md`), con
 * `var(--token)` donde `src/ds/tokens/` declara ese valor exacto.
 *
 * <h2>Aqui el port se va por delante del diseno, y no es una mejora opcional</h2>
 *
 * El artboard solo la deja pulsar con el raton: no hay flechas, ni Intro, ni `role`. Eso deja el
 * atajo en un callejon —se abre con el teclado, se teclea con el teclado y luego hay que buscar
 * el raton—, y es exactamente lo que ya se rompio una vez en `sgtm`, donde el arnes
 * `verificaciones/paleta.mjs` existe por eso. Aqui vive el mismo arnes, adaptado.
 *
 * Asi que la paleta es un **combobox con lista**, que es el patron que los lectores de pantalla
 * saben anunciar: `role="combobox"` en el campo con `aria-activedescendant` apuntando a la fila
 * enfocada, `role="listbox"` en la lista y `role="option"` con `aria-selected` en cada fila.
 * `↓` y `↑` mueven en circulo, `Intro` abre **la enfocada** —no la primera— y cierra.
 *
 * <h2>La guarda que hay que medir con varios resultados</h2>
 *
 * Al cambiar la consulta, el foco vuelve **al primero**: {@link cambiarConsulta} fija el indice a
 * 0 en el mismo acto que cambia el texto. No hay ninguna acotacion al ultimo detras, y es a
 * proposito: una acotacion salvaria la situacion con un solo resultado y dejaria pasar una
 * prueba escrita sobre ese caso, que es la advertencia literal de `paleta.mjs`. Con la guarda
 * quitada y tres resultados a la vista, el foco se queda en la fila que nadie eligio.
 */

/** La pastilla gris de la izquierda de cada fila (`tipoStyle`, linea 1485). */
const PASTILLA_DEL_TIPO: CSSProperties = {
  fontSize: 10.5,
  fontWeight: "var(--peso-fuerte)",
  textTransform: "uppercase",
  letterSpacing: ".07em",
  color: "var(--tinta-3)",
  background: "var(--sup)",
  border: "1px solid var(--linea)",
  borderRadius: "var(--radio-4)",
  padding: "2px 7px",
  flex: "0 0 auto",
};

/**
 * El fondo de la fila enfocada.
 *
 * Es `#EFF7FC`, el mismo `style-hover` que el artboard le pone a esta fila (linea 85): lo que el
 * diseno usa para decir «esta es la fila senalada». No se inventa un color para el teclado —eso
 * seria ampliar la paleta del diseno desde una pantalla—; se usa el que ya significa eso.
 */
const FONDO_ENFOCADA = "#EFF7FC";

/** El identificador de una fila. Lo apunta `aria-activedescendant`, asi que tiene que ser estable. */
const idDeOpcion = (indice: number) => `paleta-opcion-${indice}`;

export interface PaletaDeComandosProps {
  /** Cerrar sin elegir: el fondo, `Esc` y `Ctrl K` otra vez. */
  readonly alCerrar: () => void;
  /** Lo que hace elegir una fila. Navegar es cosa del marco, no de la paleta. */
  readonly alElegir: (resultado: ResultadoDeLaPaleta) => void;
}

export function PaletaDeComandos({ alCerrar, alElegir }: PaletaDeComandosProps) {
  const [consulta, fijarConsulta] = useState("");
  const [enfocada, fijarEnfocada] = useState(0);

  const campo = useRef<HTMLInputElement>(null);

  const resultados = resultadosDe(consulta);
  const cuantos = resultados.length;

  /**
   * Cambiar la consulta devuelve el foco al primero.
   *
   * Va en la misma funcion que fija el texto, y no en un efecto sobre `[consulta]`: en un efecto,
   * el dibujado intermedio muestra la lista nueva con el indice viejo, y `aria-activedescendant`
   * apunta durante ese instante a una fila que ya no dice lo mismo.
   */
  const cambiarConsulta = (texto: string) => {
    fijarConsulta(texto);
    fijarEnfocada(0);
  };

  /** El campo se lleva el foco al abrirse: es el `autofocus` de la linea 80. */
  useEffect(() => campo.current?.focus(), []);

  /**
   * La fila enfocada se trae a la vista.
   *
   * `scrollIntoView` **no esta implementado en jsdom**, asi que se llama con `?.()`: sin eso, la
   * suite entera se caeria por una comodidad visual.
   */
  useEffect(() => {
    document.getElementById(idDeOpcion(enfocada))?.scrollIntoView?.({ block: "nearest" });
  }, [enfocada]);

  const alPulsarTecla = (evento: KeyboardEvent<HTMLInputElement>) => {
    if (cuantos === 0) return;
    if (evento.key === "ArrowDown") {
      evento.preventDefault();
      fijarEnfocada((i) => (i + 1) % cuantos);
    } else if (evento.key === "ArrowUp") {
      // `+ cuantos` antes del modulo: en JavaScript `-1 % 9` es `-1`, no `8`. Es lo que hace que
      // subir desde el primero lleve al ultimo en vez de a ninguna parte.
      evento.preventDefault();
      fijarEnfocada((i) => (i - 1 + cuantos) % cuantos);
    } else if (evento.key === "Enter") {
      evento.preventDefault();
      const elegida = resultados[enfocada];
      if (elegida !== undefined) alElegir(elegida);
    }
  };

  return (
    <>
      {/* El fondo oscuro de la linea 75: cerrar pulsando fuera. */}
      <div
        onClick={alCerrar}
        aria-hidden="true"
        style={{ position: "fixed", inset: 0, zIndex: 82, background: "rgba(22,35,44,.38)" }}
      />

      <div
        role="dialog"
        aria-label="Buscar"
        aria-modal="true"
        data-paleta-dialogo="1"
        style={{
          position: "fixed",
          zIndex: 83,
          top: "12vh",
          left: "50%",
          transform: "translateX(-50%)",
          width: "min(620px,92vw)",
          background: "#fff",
          border: "1px solid var(--linea)",
          borderRadius: "var(--radio-10)",
          boxShadow: "var(--sombra-cajon)",
          overflow: "hidden",
          animation: "pop .14s ease",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 11,
            padding: "14px 16px",
            borderBottom: "1px solid var(--linea-2)",
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--tinta-3)"
            strokeWidth="1.8"
            strokeLinecap="round"
            style={{ flex: "0 0 auto" }}
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-4.3-4.3" />
          </svg>

          <input
            ref={campo}
            type="text"
            role="combobox"
            aria-label={ROTULO_DEL_CAMPO}
            aria-expanded="true"
            aria-controls="paleta-resultados"
            aria-autocomplete="list"
            aria-activedescendant={cuantos === 0 ? undefined : idDeOpcion(enfocada)}
            value={consulta}
            onChange={(evento) => cambiarConsulta(evento.target.value)}
            onKeyDown={alPulsarTecla}
            placeholder={PISTA_DE_LA_PALETA}
            style={{
              flex: 1,
              minWidth: 0,
              border: 0,
              background: "transparent",
              padding: "2px 0",
              fontSize: 16,
              outline: "none",
            }}
          />

          <kbd
            style={{
              fontSize: 11,
              color: "var(--tenue)",
              border: "1px solid var(--linea)",
              borderRadius: "var(--radio-4)",
              padding: "2px 6px",
            }}
          >
            Esc
          </kbd>
        </div>

        <div
          id="paleta-resultados"
          role="listbox"
          aria-label="Resultados"
          style={{ maxHeight: "54vh", overflow: "auto" }}
        >
          {resultados.map((resultado, indice) => (
            <button
              key={resultado.clave}
              type="button"
              id={idDeOpcion(indice)}
              role="option"
              aria-selected={indice === enfocada}
              className="hov-flotante"
              data-resultado={resultado.clave}
              // El raton mueve el foco donde el teclado lo movería: si no, pulsar con el raton
              // una fila y luego seguir con las flechas saltaría desde otro sitio.
              onMouseEnter={() => fijarEnfocada(indice)}
              onClick={() => alElegir(resultado)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                width: "100%",
                textAlign: "left",
                border: 0,
                borderBottom: "1px solid var(--linea-2)",
                background: indice === enfocada ? FONDO_ENFOCADA : "transparent",
                padding: "11px 16px",
                cursor: "pointer",
              }}
            >
              <span style={PASTILLA_DEL_TIPO}>{resultado.tipo}</span>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 14.5,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {resultado.label}
              </span>
              <span
                data-sm-hide="1"
                style={{ fontSize: 12.5, color: "var(--tinta-3)", flex: "0 0 auto" }}
              >
                {resultado.nota}
              </span>
            </button>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            padding: "9px 16px",
            background: "var(--sup)",
            fontSize: 12,
            color: "var(--tinta-3)",
          }}
        >
          <span data-paleta-pie="1">{pieDe(cuantos)}</span>
          <span>Ctrl K</span>
        </div>
      </div>
    </>
  );
}
