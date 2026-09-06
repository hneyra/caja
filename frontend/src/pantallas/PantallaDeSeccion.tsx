import { MarcadorDeSeccion, type PropsDePantalla } from "@/marco/MarcadorDeSeccion";
import { Panel } from "@/pantallas/Panel";

/**
 * Quien dibuja la seccion activa: **una de cuatro portada, tres por portar**.
 *
 * Es lo que `App` recibe por omision en su ranura `Pantalla`. El marco —pestanas, titulo, hash
 * y cierre— no distingue entre las cuatro secciones propias, asi que el reparto vive aqui y no
 * alli: cuando se porte `#recibos`, `#cajas` o `#tarifario`, se anade su linea a este `switch` y
 * `App` no se entera.
 *
 * Las tres que faltan siguen cayendo en {@link MarcadorDeSeccion}, que dice en pantalla que
 * llegan despues. Un `default` que las dibujara en blanco seria la forma silenciosa de fallar
 * que `PORTAR.md` avisa: una pantalla a medio portar que compila y no da ningun error.
 */
export function PantallaDeSeccion(props: PropsDePantalla) {
  switch (props.seccion) {
    case "panel":
      return <Panel {...props} />;
    default:
      return <MarcadorDeSeccion {...props} />;
  }
}
