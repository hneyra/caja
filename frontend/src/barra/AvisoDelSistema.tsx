import { AVISO } from "@/datos";

/**
 * La banda del aviso de servicio, desplegada bajo la barra.
 *
 * `TesoreriaV6.dc.html`, lineas 428-436. Va **debajo de la barra de pestanas** en el artboard;
 * mientras las pestanas no existan queda justo bajo la barra global, que es su sitio relativo
 * a lo que hay hoy.
 *
 * <h2>Por que sus colores son literales y no tokens</h2>
 *
 * `#FFF4D9` si tiene token —`--ins-warn-fondo`—, pero es el de una **insignia**, y esta banda
 * no lo es: usarlo aqui le pondria a un componente el nombre de otro. Y sus otros tres colores
 * —`#E8C86A` (1 uso en todo el artboard), `#8A5B00` y `#4A3200`— no tienen ninguno, ni pueden
 * tenerlo: `verificaciones/tokens.test.ts` exige que `tokens/` no declare un color que el
 * artboard no declare como constante. Media banda con token y media con literal seria peor que
 * la banda entera literal, que es lo que el artboard escribe.
 */
export interface AvisoDelSistemaProps {
  readonly alDescartar: () => void;
}

export function AvisoDelSistema({ alDescartar }: AvisoDelSistemaProps) {
  return (
    <div
      role="status"
      style={{
        flex: "0 0 auto",
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "11px 16px",
        background: "#FFF4D9",
        borderBottom: "1px solid #E8C86A",
      }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#8A5B00"
        strokeWidth="2"
        strokeLinecap="round"
        style={{ flex: "0 0 auto", marginTop: 1 }}
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.6V13M12 16.4h.02" />
      </svg>
      <p
        style={{
          margin: 0,
          flex: 1,
          fontSize: 13.5,
          lineHeight: 1.5,
          color: "#4A3200",
          textWrap: "pretty",
        }}
      >
        {AVISO.texto}
      </p>
      <button
        type="button"
        onClick={alDescartar}
        aria-label="Descartar el aviso"
        style={{
          border: 0,
          background: "transparent",
          padding: 2,
          cursor: "pointer",
          color: "#8A5B00",
          flex: "0 0 auto",
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
