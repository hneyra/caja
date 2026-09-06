// @vitest-environment happy-dom
//
// `#cajas` — «Cajas y arqueo», medida.
//
// POR QUE happy-dom Y NO EL jsdom DEL RESTO DE LA SUITE
// Por lo mismo que `panel.test.tsx` y `recibos.test.tsx`: el criterio 2 se afirma sobre el nodo
// elegido, y lo que lo distingue —ademas de su `aria-current`— son **colores que salen de un
// token**: `#005284` en el borde izquierdo y `#E4F4FD` en el fondo. En jsdom lo unico afirmable
// seria que la pantalla escribe `var(--azul)`, que es justo lo que la prueba NO quiere dar por
// bueno.
//
// LO QUE NO SE PUDO AFIRMAR AQUI, Y DONDE SE MIDIO
// El **grosor** del borde izquierdo del nodo elegido. El boton declara `border: 0`,
// `border-bottom` y `border-left` en el mismo estilo en linea, y happy-dom funde las tres en un
// `border-width` sin sentido: `borderLeftWidth` sale cadena vacia. Es el mismo hallazgo de #11,
// y hay abajo una sonda que lo afirma para que el dia que happy-dom lo arregle se vea. Lo que si
// llega entero es `borderLeftColor`. Los `3px` se midieron en un Chromium de verdad, y estan en
// el PR.
//
// Y LO QUE ESTE ARCHIVO NO PUEDE MEDIR
// Que la cabecera **se quede quieta al desplazar**. Aqui se afirma que el `<th>` calcula
// `position: sticky` y `top: 0px` —que es lo que el criterio 5 nombra, y happy-dom y jsdom lo
// dan los dos: medido con una sonda antes de escribir la prueba—, pero un emulador de DOM no
// hace disposicion ni desplaza nada. El desplazamiento de verdad es
// `verificaciones/pegajosa.mjs`, que corre en Chromium y esta enganchado a `frontend.yml`.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App";
import { DETERMINACIONES, NODOS, SECCIONES, TARIFARIO } from "../src/datos";
import { ACCIONES } from "../src/paleta/acciones";
import { acotar, TITULO_DE_LA_LISTA } from "../src/pantallas/Cajas";
import "../src/ds/global.css";

afterEach(cleanup);

/** El hash es global del documento y `App` lo escribe al montarse. Ver `marco.test.tsx`. */
beforeEach(() => window.history.replaceState(null, "", window.location.pathname));

const AQUI = dirname(fileURLToPath(import.meta.url));
const PANTALLAS = join(AQUI, "..", "src", "pantallas");

const raiz = () => document.querySelector("[data-ir]") as HTMLElement;
const pantalla = () => document.querySelector("[data-seccion='territorio']") as HTMLElement;
const nodos = () => [...pantalla().querySelectorAll("[data-nodo]")] as HTMLElement[];
const elegidos = () =>
  nodos()
    .filter((n) => n.getAttribute("aria-current") === "true")
    .map((n) => n.getAttribute("data-nodo"));
const nodo = (titulo: string) =>
  pantalla().querySelector(`[data-nodo="${titulo}"]`) as HTMLElement;
const tituloDelNodo = () =>
  pantalla().querySelector("[data-titulo-del-nodo]")?.textContent ?? "";
const tabla = () => pantalla().querySelector("[data-tabla='arqueo']") as HTMLElement;
const cabeceras = () => [...tabla().querySelectorAll("thead th")] as HTMLElement[];
const filas = () => [...tabla().querySelectorAll("tbody tr")] as HTMLElement[];
const celdasDe = (i: number) =>
  [...(filas()[i]?.querySelectorAll("td") ?? [])] as HTMLElement[];
const textosDe = (i: number) => celdasDe(i).map((c) => c.textContent);

/** Abre una seccion desde el arbol, que es una de las cuatro puertas del marco. */
const abrirSeccion = (clave: string) =>
  fireEvent.click(document.querySelector(`[data-submodulo="${clave}"]`) as HTMLElement);

/** Deja `#cajas` a la vista sin pedir ningun nodo: es como se entra desde el arbol. */
const abrirCajas = () => {
  render(<App />);
  abrirSeccion("territorio");
};

/** Una fila de la bandeja del Panel, que es la puerta con nodo del issue #10. */
const espera = (etiqueta: string) =>
  document.querySelector(`[data-espera="${etiqueta}"]`) as HTMLElement;

/** Abre la paleta y elige la accion que se llama `label`: la otra puerta con nodo, de #9. */
const elegirEnLaPaleta = (label: string) => {
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  const lista = screen.getByRole("listbox", { name: "Resultados" });
  const fila = within(lista)
    .getAllByRole("option")
    .find((o) => o.textContent?.includes(label));
  fireEvent.click(fila as HTMLElement);
};

describe("criterio 1 · los seis nodos con sus seis recuentos", () => {
  /**
   * Transcritos **a mano** y no en un bucle sobre `NODOS`: un bucle compararia los datos
   * consigo mismos y saldria verde con los seis rotulos cambiados a la vez.
   */
  it("son seis, en el orden del artboard y con su recuento", () => {
    abrirCajas();
    expect(nodos().map((n) => n.textContent)).toEqual([
      "C-3 — su caja, abierta52 recibos",
      "C-4 — abierta, turno tarde18 recibos",
      "C-1 — cerrada ayer sin arquear84 recibos",
      "C-2 — cerrada ayer sin arquear68 recibos",
      "Anulaciones del día3 recibos",
      "Pendientes de conciliar11 operaciones",
    ]);
  });

  it("y son seis, ni cinco ni siete", () => {
    abrirCajas();
    expect(nodos()).toHaveLength(6);
    expect(NODOS).toHaveLength(6);
  });

  it("la cabecera de la lista dice «Cajas y movimientos»", () => {
    abrirCajas();
    expect(TITULO_DE_LA_LISTA).toBe("Cajas y movimientos");
    expect(pantalla().textContent).toContain(TITULO_DE_LA_LISTA);
  });

  /**
   * El recuento va en su propio `<span>`, en `#5A6B78` y 12 px: es informacion secundaria y el
   * artboard lo separa del rotulo (linea 786). Sin esta asercion, «52 recibos» podria estar
   * pegado al titulo con el mismo peso y el criterio 1 seguiria verde.
   */
  it("el recuento va aparte del rotulo, en gris y mas pequeno", () => {
    abrirCajas();
    const recuento = nodo("C-3 — su caja, abierta").children[1] as HTMLElement;
    expect(recuento.textContent).toBe("52 recibos");
    expect(getComputedStyle(recuento).color).toBe("#5A6B78");
    expect(getComputedStyle(recuento).fontSize).toBe("12px");
  });
});

describe("criterio 2 · al entrar esta elegido el primero", () => {
  it("«C-3 — su caja, abierta» con `aria-current=\"true\"`, y es exactamente uno", () => {
    abrirCajas();
    expect(elegidos()).toEqual(["C-3 — su caja, abierta"]);
  });

  it("y lo que se dibuja a la derecha es su tabla", () => {
    abrirCajas();
    expect(tituloDelNodo()).toBe("C-3 — su caja, abierta");
    expect(pantalla().textContent).toContain(DETERMINACIONES[0]!.nota);
  });

  /**
   * El elegido se ve elegido: borde izquierdo azul, fondo `#E4F4FD` y peso 700 — y **el de al
   * lado no**. Las dos mitades cuentan: pintarlos todos pasaria la primera.
   */
  it("va en `#005284`, `#E4F4FD` y peso 700; su vecino no", () => {
    abrirCajas();
    const primero = getComputedStyle(nodo("C-3 — su caja, abierta"));
    expect(primero.borderLeftColor).toBe("#005284");
    expect(primero.backgroundColor).toBe("#E4F4FD");
    expect(primero.fontWeight).toBe("700");

    const segundo = getComputedStyle(nodo("C-4 — abierta, turno tarde"));
    expect(segundo.borderLeftColor).toBe("transparent");
    expect(segundo.backgroundColor).toBe("transparent");
    expect(segundo.fontWeight).toBe("400");
  });

  /**
   * SONDA DEL ENTORNO. El `3px` del borde izquierdo **no se puede medir aqui**, por lo que dice
   * la cabecera del archivo. Se afirma que no se puede, para que el dia que happy-dom lo
   * arregle esta prueba salga roja y la excepcion sobre.
   */
  it("y su grosor no se puede medir en happy-dom, que es por lo que se midio en Chromium", () => {
    abrirCajas();
    expect(getComputedStyle(nodo("C-3 — su caja, abierta")).borderLeftWidth).toBe("");
  });

  it("pulsar otro nodo lo elige, y suelta el anterior", () => {
    abrirCajas();
    fireEvent.click(nodo("Anulaciones del día"));
    expect(elegidos()).toEqual(["Anulaciones del día"]);
    expect(tituloDelNodo()).toBe("Anulaciones del día");
  });
});

describe("criterio 3 · la tabla de C-3 se lee como una cuenta", () => {
  it("tiene 7 filas y 4 columnas", () => {
    abrirCajas();
    expect(filas()).toHaveLength(7);
    expect(cabeceras()).toHaveLength(4);
  });

  it("las cuatro cabeceras son «», «Concepto», «Detalle» y «S/»", () => {
    abrirCajas();
    expect(cabeceras().map((c) => c.textContent)).toEqual(["", "Concepto", "Detalle", "S/"]);
  });

  /**
   * La ultima fila, transcrita a mano. El criterio la nombra entera —`= · Diferencia · Cuadra ·
   * 0.00`— y es la que cierra la cuenta: sin ella el arqueo no dice si cuadra.
   */
  it("su ultima fila dice `= · Diferencia · Cuadra · 0.00`", () => {
    abrirCajas();
    expect(textosDe(6)).toEqual(["=", "Diferencia", "Cuadra", "0.00"]);
  });

  /**
   * La primera columna lleva los signos con los que cada fila entra en la cuenta, **y va vacia
   * donde solo se declara**. Las dos mitades: una implementacion que pusiera el signo en las
   * siete, o ninguno, pasaria una comprobacion que solo mirara «hay signos».
   */
  it("su primera columna son los signos, con dos celdas vacias a proposito", () => {
    abrirCajas();
    expect(filas().map((_f, i) => textosDe(i)[0])).toEqual(["", "+", "+", "−", "=", "", "="]);
  });

  it("y esa primera columna va en peso 600, que es `TD1`", () => {
    abrirCajas();
    for (const i of [0, 1, 4, 6]) {
      expect(getComputedStyle(celdasDe(i)[0] as HTMLElement).fontWeight).toBe("600");
    }
    // Y la segunda **no**, que es lo que hace que el peso signifique algo.
    expect(getComputedStyle(celdasDe(1)[1] as HTMLElement).fontWeight).not.toBe("600");
  });

  /**
   * La ultima columna a la derecha y con cifras tabulares, **y las otras tres no**: es la
   * distincion que `cols()` hace con su `0|1` (lineas 1077 y 1360).
   */
  it("la ultima columna va a la derecha y con `tabular-nums`; las otras tres no", () => {
    abrirCajas();
    const importe = getComputedStyle(celdasDe(1)[3] as HTMLElement);
    expect(importe.textAlign).toBe("right");
    expect(importe.fontVariantNumeric).toBe("tabular-nums");

    for (const j of [0, 1, 2]) {
      const otra = getComputedStyle(celdasDe(1)[j] as HTMLElement);
      expect(otra.textAlign).not.toBe("right");
      expect(otra.fontVariantNumeric).not.toBe("tabular-nums");
    }
  });

  /**
   * Y la cabecera va con su columna. Es la asercion que #12 tuvo que anadir porque alinear mal
   * las celdas dejaba la cabecera desalineada **sin poner nada rojo**.
   */
  it("y la cabecera de esa columna tambien va a la derecha; las otras tres a la izquierda", () => {
    abrirCajas();
    expect(cabeceras().map((c) => getComputedStyle(c).textAlign)).toEqual([
      "left",
      "left",
      "left",
      "right",
    ]);
  });

  it("y las cuentas del arqueo cuadran: 200.00 + 7,238.60 − 18.19 = 7,420.41", () => {
    // En centimos enteros, porque `0.1 + 0.2` no es `0.3`. Es la misma comprobacion que #5 hace
    // sobre los datos, aqui sobre lo que la pantalla **dibuja**.
    abrirCajas();
    const centimos = (texto: string) => Math.round(Number(texto.replace(/,/g, "")) * 100);
    const fondo = centimos(textosDe(0)[3] ?? "");
    const efectivo = centimos(textosDe(1)[3] ?? "");
    const anulado = centimos(textosDe(3)[3] ?? "");
    expect(fondo + efectivo - anulado).toBe(centimos(textosDe(4)[3] ?? ""));
    expect(centimos(textosDe(5)[3] ?? "")).toBe(centimos(textosDe(4)[3] ?? ""));
  });
});

describe("criterio 4 · las dos tablas que son listados", () => {
  it("«Anulaciones del día» tiene 3 filas y 6 columnas", () => {
    abrirCajas();
    fireEvent.click(nodo("Anulaciones del día"));
    expect(filas()).toHaveLength(3);
    expect(cabeceras()).toHaveLength(6);
  });

  it("y su primera fila es la anulacion de las 08:32", () => {
    abrirCajas();
    fireEvent.click(nodo("Anulaciones del día"));
    expect(textosDe(0)).toEqual([
      "0003-0041180",
      "Zapata Rivas, Óscar",
      "18.19",
      "Error en la cuota imputada",
      "Jefe de Tesorería",
      "08:32",
    ]);
  });

  it("«Pendientes de conciliar» tiene 4 filas y 6 columnas", () => {
    abrirCajas();
    fireEvent.click(nodo("Pendientes de conciliar"));
    expect(filas()).toHaveLength(4);
    expect(cabeceras()).toHaveLength(6);
  });

  /**
   * En estos dos listados la columna numerica **no es la ultima**: es «Importe S/», la tercera
   * en anulaciones y la quinta en pendientes. Una implementacion que alineara «la ultima» en vez
   * de «la numerica» pasaria el criterio 3 entero y fallaria aqui.
   */
  it("y en los dos la columna de la derecha es «Importe S/», que no es la ultima", () => {
    abrirCajas();
    fireEvent.click(nodo("Anulaciones del día"));
    expect(cabeceras().map((c) => getComputedStyle(c).textAlign)).toEqual([
      "left",
      "left",
      "right",
      "left",
      "left",
      "left",
    ]);
    expect(getComputedStyle(celdasDe(0)[2] as HTMLElement).fontVariantNumeric).toBe(
      "tabular-nums",
    );
    expect(getComputedStyle(celdasDe(0)[5] as HTMLElement).fontVariantNumeric).not.toBe(
      "tabular-nums",
    );
  });

  it("las seis tablas tienen tantas columnas como cabeceras dibuja cada fila", () => {
    // Una fila con mas o menos celdas que columnas se sale de la rejilla sin dar ningun error.
    abrirCajas();
    for (const definicion of DETERMINACIONES) {
      fireEvent.click(nodo(definicion.titulo));
      const cuantas = cabeceras().length;
      expect(cuantas).toBe(definicion.columnas.length);
      for (const [i] of filas().entries()) expect(celdasDe(i)).toHaveLength(cuantas);
    }
  });
});

describe("criterio 5 · la cabecera de la tabla es pegajosa", () => {
  it("los `<th>` calculan `position: sticky` y `top: 0px`", () => {
    abrirCajas();
    for (const th of cabeceras()) {
      const estilo = getComputedStyle(th);
      expect(estilo.position).toBe("sticky");
      expect(estilo.top).toBe("0px");
    }
  });

  /**
   * Y `z-index: 2`, que no es adorno: sin el, las celdas de la primera fila se dibujan encima de
   * la cabecera al desplazar y lo que se ve es una cabecera que parpadea.
   */
  it("y `z-index: 2`, que es lo que impide que la primera fila se dibuje encima", () => {
    abrirCajas();
    expect(getComputedStyle(cabeceras()[0] as HTMLElement).zIndex).toBe("2");
  });

  /**
   * Las **dos mitades** del mecanismo, porque ninguna cubre a la otra: la regla la pone
   * `global.css` sobre `[data-sticky] th`, y el atributo lo pone la tabla. Sin el atributo, la
   * regla existe y no pega nada; sin la regla, el atributo no significa nada.
   */
  it("la tabla lleva `data-sticky`, y la regla que lo pinta existe en `global.css`", () => {
    abrirCajas();
    expect(tabla().getAttribute("data-sticky")).toBe("1");
    const css = readFileSync(join(AQUI, "..", "src", "ds", "global.css"), "utf8");
    expect(css).toContain("[data-sticky] th { position: sticky; top: 0; z-index: 2 }");
  });

  /**
   * Y el contenedor con desplazamiento, que es respecto de quien se queda quieta. Sin un
   * antepasado que desplace, `position: sticky` no hace nada y **nadie lo notaria**: la cabecera
   * no se mueve porque tampoco se mueve la tabla.
   */
  it("y la tabla vive dentro de un contenedor con `overflow: auto`", () => {
    abrirCajas();
    const contenedor = tabla().parentElement as HTMLElement;
    expect(contenedor.getAttribute("data-desplazable")).toBe("arqueo");
    expect(getComputedStyle(contenedor).overflow).toBe("auto");
  });
});

describe("la deuda de #9 y #10: el nodo llega en el destino y esta pantalla lo recoge", () => {
  /**
   * Lo que se afirma es **el titulo del nodo elegido**, no su indice: los seis van a la misma
   * seccion, asi que «lleva a `#cajas`» no distingue el 2 del 5. Es la leccion del panel.
   */
  it.each([
    ["Sin arquear", "C-1 — cerrada ayer sin arquear"],
    ["Sin conciliar", "Pendientes de conciliar"],
    ["Anulados", "Anulaciones del día"],
  ])("«%s» del panel deja elegido «%s»", (etiqueta, titulo) => {
    render(<App />);
    fireEvent.click(espera(etiqueta));
    expect(elegidos()).toEqual([titulo]);
    expect(tituloDelNodo()).toBe(titulo);
  });

  it.each([
    ["Arqueo de mi caja", "C-3 — su caja, abierta"],
    ["Cajas cerradas sin arquear", "C-1 — cerrada ayer sin arquear"],
    ["Anulaciones del día", "Anulaciones del día"],
    ["Pendientes de conciliar", "Pendientes de conciliar"],
  ])("«%s» de la paleta deja elegido «%s»", (label, titulo) => {
    render(<App />);
    elegirEnLaPaleta(label);
    expect(elegidos()).toEqual([titulo]);
    expect(tituloDelNodo()).toBe(titulo);
  });

  /**
   * Y **estando ya en `#cajas`**, que es donde la pantalla no se vuelve a montar y donde un
   * `useState` sin sincronizar no haria nada. Es el mismo caso que el chip de #11.
   */
  it("y estando ya en `#cajas`, la paleta cambia el nodo elegido", () => {
    render(<App />);
    fireEvent.click(espera("Sin arquear"));
    expect(elegidos()).toEqual(["C-1 — cerrada ayer sin arquear"]);

    elegirEnLaPaleta("Pendientes de conciliar");
    expect(elegidos()).toEqual(["Pendientes de conciliar"]);
    expect(tituloDelNodo()).toBe("Pendientes de conciliar");
  });

  /**
   * La otra mitad: un destino **sin** nodo no deshace el que el cajero acaba de elegir. Es lo
   * que hace que la sincronizacion sea una sincronizacion y no un reinicio.
   */
  it("pero una navegacion sin nodo NO deshace el elegido a mano", () => {
    abrirCajas();
    fireEvent.click(nodo("C-2 — cerrada ayer sin arquear"));
    expect(elegidos()).toEqual(["C-2 — cerrada ayer sin arquear"]);

    // El arbol navega a la misma seccion sin extras: `data-ir-nodo` queda vacio.
    abrirSeccion("territorio");
    expect(raiz().getAttribute("data-ir-nodo")).toBe("");
    expect(elegidos()).toEqual(["C-2 — cerrada ayer sin arquear"]);
  });

  it("y desde el arbol, sin nodo, se entra por el primero", () => {
    abrirCajas();
    expect(raiz().getAttribute("data-ir-nodo")).toBe("");
    expect(elegidos()).toEqual(["C-3 — su caja, abierta"]);
  });
});

describe("el indice se acota una sola vez, que es la desviacion declarada del artboard", () => {
  it("`acotar` deja pasar los que existen", () => {
    expect(acotar(0, 6)).toBe(0);
    expect(acotar(5, 6)).toBe(5);
  });

  /**
   * Las **dos** cotas, y las dos hacen falta: `Math.min` es del artboard (linea 1460) y
   * `Math.max` lo anade el port. Sin la de abajo, un indice negativo deja `DETERMINACIONES[-1]`
   * —`undefined`— y con el la mitad derecha en blanco, sin ningun error.
   */
  it("y acota por arriba y por abajo", () => {
    expect(acotar(9, 6)).toBe(5);
    expect(acotar(-1, 6)).toBe(0);
  });

  /**
   * Y en la pantalla: fuera de rango, la tabla y el nodo marcado **no se separan**. El artboard
   * si los separa —medido ejecutando su logica: con `nodo: 9` ensena «Pendientes de conciliar»
   * y no marca ninguno de los seis—, y el cotejo lo afirma.
   */
  it("la tabla que se dibuja es siempre la del nodo marcado", () => {
    abrirCajas();
    for (const definicion of DETERMINACIONES) {
      fireEvent.click(nodo(definicion.titulo));
      expect(elegidos()).toEqual([tituloDelNodo()]);
    }
  });
});

describe("`#cajas` es de lectura, y `#cajas` es lo que dibuja solo `territorio`", () => {
  it("no tiene ni un campo, ni un `<select>`, ni nada que exportar", () => {
    abrirCajas();
    expect(pantalla().querySelectorAll("input, textarea, select")).toHaveLength(0);
    expect(pantalla().querySelectorAll("[contenteditable]")).toHaveLength(0);
    // Sus unicos botones son los seis nodos: nada de exportar, filtrar ni buscar.
    expect(pantalla().querySelectorAll("button")).toHaveLength(6);
  });

  it.each(SECCIONES.filter((s) => s.clave !== "territorio").map((s) => [s.clave] as const))(
    "y `%s` no dibuja nada de esta pantalla",
    (clave) => {
      render(<App />);
      abrirSeccion(clave);
      expect(document.querySelector("[data-seccion='territorio']")).toBeNull();
    },
  );
});

/**
 * CRITERIO 10 · ni una cifra ni un rotulo de los datos escrito en el JSX.
 *
 * Mismo escaner que el del Panel, y por los mismos motivos: sobre el codigo **sin comentarios**
 * —el port habla de las tablas en su prosa, que es como se explica lo que hace— y solo sobre los
 * textos con un digito o un espacio dentro, para que «Concepto» o «Paso» no casen con cualquier
 * identificador.
 */
describe("criterio 10 · lo que las dos pantallas ensenan sale de `src/datos`", () => {
  const fuentes = readdirSync(PANTALLAS)
    .filter((n) => n.endsWith(".tsx"))
    .map((n) => [n, readFileSync(join(PANTALLAS, n), "utf8")] as const);

  const sinComentarios = (codigo: string) =>
    codigo.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

  /**
   * Si el texto esta escrito **entero** en el codigo: entre comillas o como texto de JSX.
   *
   * Y esta acotacion **no se decidio: la puso el escaner al salir rojo por su cuenta**, igual que
   * las dos del Panel. Con un `includes` pelado encontraba «Se conciliaba» dentro de
   * `CobroNuevo.tsx`, y **no era una fuga**: es el `COMO_SE_CONCILIA` que #13 copio del artboard
   * —«Se conciliaba contra el extracto del banco. Hasta entonces el recibo esta emitido…»—, cuyos
   * trece primeros caracteres coinciden con el titulo de una columna del tarifario. Lo que el
   * criterio prohibe es una celda o un rotulo **escrito literal**, y una celda escrita literal es
   * una cadena completa, no el principio de una frase mas larga.
   */
  const escritoEntero = (codigo: string, texto: string) =>
    ['"', "'", "`"].some((comilla) => codigo.includes(comilla + texto + comilla)) ||
    codigo.includes(`>${texto}<`);

  it("hay algo que escanear", () => {
    // Sin esto, borrar `src/pantallas` dejaria las pruebas de abajo en verde sobre nada.
    expect(fuentes.map(([n]) => n)).toContain("Cajas.tsx");
    expect(fuentes.map(([n]) => n)).toContain("Tarifario.tsx");
  });

  it("`7,420.41` y `T-001` no aparecen en `src/pantallas`, y si en `src/datos`", () => {
    for (const [nombre, codigo] of fuentes) {
      expect(codigo, nombre).not.toContain("7,420.41");
      expect(codigo, nombre).not.toContain("T-001");
    }
    // La otra mitad: no estan alli porque estan **en los datos**. Se afirma sobre los valores y
    // no sobre el texto del archivo, que los nombra en sus comentarios.
    expect(DETERMINACIONES[0]!.filas.flat()).toContain("7,420.41");
    expect(TARIFARIO[0]!.filas.flat()).toContain("T-001");
  });

  it("ni ninguna otra cifra ni ningun otro texto de las dos pantallas", () => {
    const literales = [
      ...NODOS.flatMap((n) => [n.titulo, n.resumen]),
      ...DETERMINACIONES.flatMap((d) => [
        d.titulo,
        d.nota,
        ...d.columnas.map((c) => c.titulo),
        ...d.filas.flat(),
      ]),
      ...TARIFARIO.flatMap((t) => [
        t.label,
        t.nota,
        t.pie,
        ...t.columnas.map((c) => c.titulo),
        ...t.filas.flat(),
      ]),
    ].filter((texto) => texto.length >= 3 && /[\d ]/.test(texto));

    // Que la lista no se quede vacia es parte de lo que se afirma.
    expect(literales.length).toBeGreaterThan(100);

    const colados = fuentes.flatMap(([nombre, codigo]) =>
      literales
        .filter((texto) => escritoEntero(sinComentarios(codigo), texto))
        .map((texto) => `${nombre}: ${texto}`),
    );
    expect(colados).toEqual([]);
  });

  /**
   * Y los dos rotulos que **si** estan escritos en el JSX, con su motivo: son de la plantilla y
   * no de los datos —«Cajas y movimientos» es la cabecera de la lista (linea 781) y «Solo
   * lectura» la pildora (832)—, como «Elija un recibo de la lista» en `Recibos`. Estan como
   * constantes exportadas para que se puedan nombrar desde aqui en vez de repetirlos.
   */
  it("los dos rotulos de la plantilla estan declarados, y no salen de `src/datos`", () => {
    const todos = [
      ...NODOS.map((n) => n.titulo),
      ...DETERMINACIONES.map((d) => d.titulo),
      ...TARIFARIO.map((t) => t.label),
    ];
    expect(todos).not.toContain(TITULO_DE_LA_LISTA);
    expect(ACCIONES.map((a) => a.label)).not.toContain(TITULO_DE_LA_LISTA);
  });
});
