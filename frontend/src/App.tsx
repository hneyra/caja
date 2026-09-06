import { ENTIDAD, MODULO, NOMBRE_DE_LA_APLICACION } from "@/aplicacion";

/**
 * El andamio, y nada mas.
 *
 * Aqui NO hay ninguna pantalla de Tesoreria: las pantallas se portan desde
 * `TesoreriaV6.dc.html` en los issues siguientes, y esta pagina existe para que `yarn dev`,
 * `yarn build` y la prueba tengan algo que mirar.
 *
 * Desde #4 **si** usa los tokens, y no es adorno: son la unica prueba de que la cadena
 * `main.tsx` → `global.css` → `tokens/*.css` llega hasta el navegador. La familia y el color
 * del texto ya no se declaran aqui —los hereda de `html, body`—, y lo que queda en linea se
 * escribe como `var(--token)`, que es la forma en que las pantallas los consumiran.
 */
export function App() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        padding: 24,
      }}
    >
      <img src="/escudo-catacaos.png" alt={`Escudo de la ${ENTIDAD}`} height={84} />
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: "var(--peso-fuerte)" }}>
        {NOMBRE_DE_LA_APLICACION}
      </h1>
      <p style={{ margin: 0, color: "var(--tinta-2)" }}>
        {MODULO} · {ENTIDAD}
      </p>
      <p style={{ margin: 0, maxWidth: 440, textAlign: "center", color: "var(--tinta-3)" }}>
        El andamio del frontend. Todavía no hay ninguna pantalla: llegan en los issues
        siguientes, portadas desde el diseño.
      </p>
    </main>
  );
}
