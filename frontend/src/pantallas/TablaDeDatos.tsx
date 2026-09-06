import type { CSSProperties } from "react";
import type { Columna, Fila } from "@/datos";

/**
 * La tabla del artboard: sus dos estilos de celda y la tabla de cabecera pegajosa.
 *
 * Portado de `TesoreriaV6.dc.html`: los estilos `TH`, `THN`, `TD`, `TDN` y `TD1` (lineas
 * 929-933), los ayudantes `cols()` y `filas()` que los reparten (1360-1365) y la tabla que
 * `#cajas` (797-814) y `#tarifario` (836-853) dibujan **identica** salvo su `min-width`.
 *
 * <h2>Por que esto vive aparte y no dentro de una pantalla</h2>
 *
 * Porque en el artboard tambien esta aparte: `cols(defs)` y `filas(rows, defs)` son dos metodos
 * del componente y los llaman **tres** sitios —la tabla de cuotas de la ficha, el arqueo de cada
 * nodo y el tarifario—. Tres copias del mismo reparto son tres sitios donde la columna numerica
 * puede dejar de alinearse a la derecha por separado.
 *
 * Lo que **no** se comparte es la tabla de cuotas de {@link import("@/pantallas/FichaDelRecibo")}:
 * no lleva `data-sticky` y sus filas no llevan fondo blanco (linea 727 contra 807 y 846). Son dos
 * tablas distintas del diseno, asi que de alli solo se importan los dos estilos de celda.
 */

/**
 * `TH` y `THN` (lineas 929-930): la cabecera de la tabla, y la de una columna con cifras.
 *
 * `THN` es literalmente `TH + '; text-align:right'`, o sea la misma declaracion escrita dos
 * veces con la segunda ganando. Aqui es un `?:` sobre la misma propiedad, que es lo mismo.
 */
export const cabeceraDe = (columna: Columna): CSSProperties => ({
  padding: "9px 16px",
  textAlign: columna.numerica ? "right" : "left",
  fontSize: 11,
  fontWeight: "var(--peso-fuerte)",
  textTransform: "uppercase",
  letterSpacing: ".07em",
  color: "var(--tinta-3)",
  whiteSpace: "nowrap",
  background: "var(--sup)",
  borderBottom: "1px solid var(--linea)",
});

/**
 * `TD1`, `TDN` y `TD` (lineas 931-933), repartidos como en `filas()` (linea 1363).
 *
 * La primera columna va en peso 600 **por ser la primera**, no por su contenido; las demas
 * miran si su columna es numerica. Son dos criterios distintos y el artboard los escribe asi.
 *
 * Esa distincion es justo lo que hace legible la primera columna de las cuatro tablas de arqueo:
 * lleva los signos `+`, `−` y `=` con los que la fila entra en la cuenta, y va **vacia** en las
 * dos que solo se declaran («Fondo inicial del turno» y «Contado en caja»). Sin el peso 600 esos
 * tres caracteres no se distinguirian de la sangria.
 */
export const celdaDe = (columna: Columna | undefined, primera: boolean): CSSProperties => {
  if (primera)
    return {
      padding: "11px 16px",
      fontSize: 13.5,
      fontWeight: "var(--peso-medio)",
      color: "var(--tinta)",
      whiteSpace: "nowrap",
    };
  if (columna?.numerica === true)
    return {
      padding: "11px 16px",
      fontSize: 13.5,
      color: "var(--tinta)",
      textAlign: "right",
      whiteSpace: "nowrap",
      fontVariantNumeric: "tabular-nums",
    };
  return { padding: "11px 16px", fontSize: 13.5, color: "var(--tinta-2)" };
};

export interface PropsDeTabla {
  readonly columnas: readonly Columna[];
  readonly filas: readonly Fila[];
  /** El `min-width` del artboard: 620 px en `#cajas` (linea 797) y 660 en `#tarifario` (836). */
  readonly anchoMinimo: number;
  /** Lo que se pone en `data-tabla`, para poder nombrarla desde fuera. */
  readonly nombre: string;
}

/**
 * La tabla de las dos pantallas de consulta, con **la cabecera pegajosa**.
 *
 * `data-sticky="1"` es lo unico que hace falta: la regla vive en `ds/global.css` desde el issue
 * de los tokens —`[data-sticky] th { position: sticky; top: 0; z-index: 2 }`, linea 40 del
 * artboard— y por eso aqui no se repite en linea. Es la unica pieza de estas dos pantallas que
 * **no** puede ir en un estilo en linea: `position: sticky` necesita que el elemento tenga un
 * antepasado con desplazamiento, y quien lo aporta es el contenedor `overflow:auto` que la
 * pantalla pone alrededor. Sin ese contenedor la cabecera se pega y no se mueve nada, que es
 * exactamente lo mismo que no pegarla.
 *
 * El `z-index: 2` tampoco sobra: sin el, las celdas de la primera fila se dibujan **encima** de
 * la cabecera al desplazar, y el efecto es una cabecera que parpadea en vez de quedarse.
 */
export function TablaDeDatos({ columnas, filas, anchoMinimo, nombre }: PropsDeTabla) {
  return (
    <table
      data-sticky="1"
      data-tabla={nombre}
      style={{ width: "100%", borderCollapse: "collapse", minWidth: anchoMinimo }}
    >
      <thead>
        <tr>
          {columnas.map((columna, j) => (
            // La primera columna de las cuatro tablas de arqueo **no tiene rotulo**, asi que su
            // titulo no puede ser la clave: la posicion si es unica.
            <th key={`${j}-${columna.titulo}`} style={cabeceraDe(columna)}>
              {columna.titulo}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filas.map((fila, i) => (
          <tr
            key={`${fila[0] ?? ""}-${fila[1] ?? ""}-${i}`}
            className="hov-fila"
            style={{ borderTop: "1px solid var(--linea-2)", background: "#fff" }}
          >
            {fila.map((celda, j) => (
              <td key={`${j}-${celda}`} style={celdaDe(columnas[j], j === 0)}>
                {celda}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
