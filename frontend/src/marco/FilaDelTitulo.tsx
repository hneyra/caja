import { ACCION_PRIMARIA } from "@/marco/rotulos";

/**
 * La fila blanca de 52 px con el titulo, el subtitulo y la accion primaria.
 *
 * `TesoreriaV6.dc.html`, lineas 403-416. `titulo` y `subtitulo` los calcula `rotulos.ts`.
 *
 * <h2>El boton solo esta cuando la pestana es propia</h2>
 *
 * Es `hayAccion` (linea 1677), y el artboard escribe el motivo al lado: «el rótulo es el de este
 * módulo, y solo se ofrece cuando la pestaña activa es suya: en una ajena no hay nada que crear
 * aquí». Medido: `hayAccion` es `true` en las cuatro secciones propias y `false` en `tra-pap`.
 *
 * <h2>Lo que «Cobrar» hace hoy, y lo que hara</h2>
 *
 * El `nuevo()` del artboard (lineas 2073-2079) hace tres cosas: va a Recibos, lanza el toast y
 * **abre el asistente de cobro** (`predio: 'nuevo'`, `paso: 0`, `vals: {}`). Las dos primeras
 * son del marco y estan; la tercera es de la pantalla de Recibos y llega con ella. Un boton que
 * navega y avisa es lo que `PORTAR.md` pide para una accion cuya pantalla todavia no existe;
 * dejarlo fuera seria la mitad del trabajo (regla 5).
 */

export interface FilaDelTituloProps {
  readonly titulo: string;
  readonly subtitulo: string;
  readonly hayAccion: boolean;
  readonly alCobrar: () => void;
}

export function FilaDelTitulo({ titulo, subtitulo, hayAccion, alCobrar }: FilaDelTituloProps) {
  return (
    <div
      style={{
        flex: "0 0 auto",
        display: "flex",
        alignItems: "center",
        gap: 14,
        flexWrap: "wrap",
        padding: "0 16px",
        minHeight: 52,
        background: "#fff",
        borderBottom: "1px solid var(--linea)",
      }}
    >
      <span
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "baseline",
          gap: 9,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 16.5,
            fontWeight: "var(--peso-fuerte)",
            letterSpacing: "-.01em",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {titulo}
        </h1>
        {/* Bajo 760 px el subtitulo se retira, como los otros tres `data-sm-hide` de la barra. */}
        <span
          data-sm-hide="1"
          style={{
            fontSize: 13,
            color: "var(--tinta-3)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {subtitulo}
        </span>
      </span>

      {hayAccion && (
        <button
          type="button"
          className="hov-primario"
          onClick={alCobrar}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            border: 0,
            borderRadius: "var(--radio-6)",
            padding: "9px 15px",
            background: "var(--azul)",
            color: "#fff",
            fontSize: 13.5,
            fontWeight: "var(--peso-medio)",
            cursor: "pointer",
            flex: "0 0 auto",
          }}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          {ACCION_PRIMARIA}
        </button>
      )}
    </div>
  );
}
