import { ENTIDAD, MODULO, NOMBRE_DE_LA_APLICACION } from "@/aplicacion";

/**
 * El andamio, y nada mas.
 *
 * Aqui NO hay ninguna pantalla de Tesoreria: las pantallas se portan desde
 * `TesoreriaV6.dc.html` en los issues siguientes, y esta pagina existe para que `yarn dev`,
 * `yarn build` y la prueba tengan algo que mirar. Los estilos van en linea y con valores
 * literales a proposito —es la doctrina de `sgtm/frontend/PORTAR.md`—, pero **no son todavia
 * los tokens del diseno**: esos llegan en el issue siguiente.
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
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <img src="/escudo-catacaos.png" alt={`Escudo de la ${ENTIDAD}`} height={84} />
      <h1 style={{ margin: 0, fontSize: 26 }}>{NOMBRE_DE_LA_APLICACION}</h1>
      <p style={{ margin: 0 }}>
        {MODULO} · {ENTIDAD}
      </p>
      <p style={{ margin: 0, maxWidth: 440, textAlign: "center" }}>
        El andamio del frontend. Todavía no hay ninguna pantalla: llegan en los issues
        siguientes, portadas desde el diseño.
      </p>
    </main>
  );
}
