import type { PropsDePantalla } from "@/marco/pantalla";
import { Cajas } from "@/pantallas/Cajas";
import { Panel } from "@/pantallas/Panel";
import { Recibos } from "@/pantallas/Recibos";
import { Tarifario } from "@/pantallas/Tarifario";

/**
 * Quien dibuja la seccion activa: **las cuatro, desde #14**.
 *
 * Es lo que `App` recibe por omision en su ranura `Pantalla`. El marco —pestanas, titulo, hash
 * y cierre— no distingue entre las cuatro secciones propias, asi que el reparto vive aqui y no
 * alli: portar una pantalla mas nunca toco `App`.
 *
 * Ya no hay `default`, y esa es la diferencia que este issue deja: con las cuatro portadas,
 * `ClaveDeSeccion` tiene exactamente cuatro valores y el `switch` los cubre todos, de modo que
 * TypeScript se pone rojo solo el dia que aparezca una quinta seccion sin pantalla. Mientras
 * quedaban huecos, el `default` los mandaba a `MarcadorDeSeccion` —que decia en pantalla que
 * llegaban despues— y hacia falta: un `default` que las dibujara en blanco es la forma
 * silenciosa de fallar que `PORTAR.md` avisa.
 */
export function PantallaDeSeccion(props: PropsDePantalla) {
  switch (props.seccion) {
    case "panel":
      return <Panel {...props} />;
    case "predios":
      return <Recibos {...props} />;
    case "territorio":
      return <Cajas {...props} />;
    case "valores":
      return <Tarifario {...props} />;
  }
}
