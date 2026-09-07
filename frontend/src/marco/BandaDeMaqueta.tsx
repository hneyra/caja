import { TEXTO_DE_LA_BANDA, TITULO_DE_LA_BANDA } from "@/marco/maqueta";

/**
 * La banda que declara que esto es una maqueta (#44, AC-2).
 *
 * <h2>Donde va, y por que arriba del todo</h2>
 *
 * Es el **primer hijo de la raiz**, por encima de la barra global: asi sale en las cuatro
 * secciones sin que ninguna tenga que acordarse de dibujarla, y sale en la primera hoja de
 * cualquier impresion. AC-2 pide expresamente que **no sea un pie de pagina**: «algo que salga en
 * una captura de pantalla y en una impresion».
 *
 * <h2>Por que NO lleva `data-cromo`, y es una decision y no un descuido</h2>
 *
 * #15 puso `[data-cromo] { display: none !important }` dentro de `@media print` y marco con el las
 * cuatro piezas del marco —barra global, arbol, pestanas y barra de acciones—, porque en papel
 * ninguna lleva a ninguna parte. Esta banda **no es marco**: es lo unico del documento que dice
 * que el papel que alguien tiene en la mano no vale nada. Retirarla al imprimir seria dejar
 * exactamente el artefacto que este issue existe para impedir — una hoja con numero de recibo,
 * titular e importe, con la forma de un recibo de verdad y sin una sola marca.
 *
 * No basta con **no** marcarla: `global.css` la fija ademas con un `display: block !important`
 * dentro de `@media print` y con `print-color-adjust: exact` para que el fondo se imprima. Sin lo
 * segundo, Chromium imprime los fondos en blanco por omision y la banda queda en un texto rojo
 * suelto; con ello, `mirar.mjs` puede afirmarlo sobre el medio `print` de un navegador de verdad.
 *
 * <h2>Sus colores son literales, y no los del aviso de servicio</h2>
 *
 * Por lo mismo que `AvisoDelSistema` escribe los suyos: `--ins-bad-fondo` y `--ins-bad-tinta` son
 * tokens de una **insignia**, y ponerle a un componente el nombre de otro se lee peor que el
 * literal. Y son rojos y no ambar **a proposito**: el ambar ya es el aviso de servicio, que se
 * descarta con un aspa; esta no se descarta, y las dos bandas tienen que distinguirse de un
 * vistazo.
 */
export function BandaDeMaqueta() {
  return (
    <div
      // Lo que el arnes busca en las cuatro secciones y en el papel. No es `data-cromo`: ver
      // arriba.
      data-banda-de-maqueta="1"
      role="note"
      aria-label={TITULO_DE_LA_BANDA}
      style={{
        flex: "0 0 auto",
        display: "flex",
        alignItems: "baseline",
        flexWrap: "wrap",
        gap: "4px 10px",
        padding: "6px 14px",
        background: "#FBE4E0",
        borderBottom: "3px solid #8F2A17",
        color: "#8F2A17",
        fontSize: 12.5,
        lineHeight: 1.45,
        // Que el fondo llegue al papel. Chromium no imprime fondos por omision.
        printColorAdjust: "exact",
        WebkitPrintColorAdjust: "exact",
      }}
    >
      <strong
        style={{
          fontWeight: "var(--peso-fuerte)",
          letterSpacing: ".04em",
          textTransform: "uppercase",
          flex: "0 0 auto",
        }}
      >
        {TITULO_DE_LA_BANDA}
      </strong>
      {/* `minWidth: 0` para que el texto pueda partirse en el ancho de un A4 en vez de
          sobresalir: lo que sobresale del area imprimible se recorta y no avisa (#15). */}
      <span style={{ flex: "1 1 auto", minWidth: 0 }}>{TEXTO_DE_LA_BANDA}</span>
    </div>
  );
}
