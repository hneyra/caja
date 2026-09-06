// @vitest-environment happy-dom
//
// La paleta de comandos, medida.
//
// POR QUE happy-dom Y NO EL jsdom DEL RESTO DE LA SUITE
// Por lo mismo que `barra.test.tsx`, `arbol.test.tsx` y `marco.test.tsx`: la fila enfocada se
// distingue de las demas **por color**, y las pastillas de tipo se pintan con `var(--tinta-3)`,
// `var(--sup)` y `var(--linea)`. jsdom devuelve el texto del token en vez del color, asi que
// «la fila enfocada se ve enfocada» seria incomprobable alli.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App";
import { MI_MODULO, NODOS, TARIFARIO } from "../src/datos";
import {
  ACCIONES,
  NOTA_DE_LAS_ACCIONES,
  PISTA_DE_LA_PALETA,
  pieDe,
  resultadosDe,
  ROTULO_DEL_CAMPO,
  TOPE_DE_RESULTADOS,
} from "../src/paleta/acciones";
import "../src/ds/global.css";

afterEach(cleanup);

/** El hash es global del documento y `App` lo escribe al montarse. Ver `marco.test.tsx`. */
beforeEach(() => window.history.replaceState(null, "", window.location.pathname));

const raiz = () => document.querySelector("[data-ir]") as HTMLElement;
const dialogo = () => screen.queryByRole("dialog", { name: "Buscar" });
const campo = () => screen.getByRole("combobox", { name: ROTULO_DEL_CAMPO });
const lista = () => screen.getByRole("listbox", { name: "Resultados" });
const filas = () => within(lista()).getAllByRole("option");
const rotulos = () => filas().map((f) => f.textContent);
const enfocada = () => filas().find((f) => f.getAttribute("aria-selected") === "true") ?? null;
/**
 * El **indice** de la fila enfocada, no la fila.
 *
 * Se afirma sobre el indice a proposito: comparar dos nodos deja un rojo que dice «expected
 * <button …> to be <button …>», que no dice cual ni por que. Con el indice, la rotura del foco
 * sale como «expected 3 to be 0», que es la frase que hace falta leer.
 */
const indiceEnfocado = () => filas().findIndex((f) => f.getAttribute("aria-selected") === "true");
const pie = () => document.querySelector("[data-paleta-pie]")?.textContent ?? "";

/** El rotulo de una fila sin su pastilla ni su nota: el `<span>` del medio. */
const soloElRotulo = (fila: HTMLElement | null) =>
  fila === null ? null : (fila.children[1]?.textContent ?? null);

const teclear = (texto: string) => fireEvent.change(campo(), { target: { value: texto } });
const tecla = (key: string) => fireEvent.keyDown(campo(), { key });

/** `Ctrl + K` sobre `window`, que es donde el marco lo escucha. */
const ctrlK = () => fireEvent.keyDown(window, { key: "k", ctrlKey: true });
/** Lo mismo con la tecla de comando, y con la `K` en mayuscula: es lo que manda un Mac. */
const cmdK = () => fireEvent.keyDown(window, { key: "K", metaKey: true });
const escape = () => fireEvent.keyDown(window, { key: "Escape" });

const lupa = () => screen.getByRole("button", { name: "Buscar" });
const botonDelLanzador = () => screen.getByRole("button", { name: "Ver todos los módulos" });

describe("criterio 1 · el atajo la abre, la vuelve a cerrar, y `Esc` tambien", () => {
  it("`Ctrl+K` abre y `Ctrl+K` cierra", () => {
    render(<App />);
    expect(dialogo()).toBeNull();

    ctrlK();
    expect(dialogo()).not.toBeNull();
    expect(raiz().getAttribute("data-paleta")).toBe("abierta");

    ctrlK();
    expect(dialogo()).toBeNull();
    expect(raiz().getAttribute("data-paleta")).toBe("cerrada");
  });

  it("`Cmd+K` hace lo mismo, y con la `K` en mayuscula", () => {
    // El artboard compara `e.key.toLowerCase()` (linea 1247): con Mayus o con Bloq Mayus, `key`
    // llega como `'K'`. Sin el `toLowerCase`, el atajo se pierde justo cuando alguien escribe en
    // mayusculas, que es un caso que nadie prueba a mano.
    render(<App />);
    cmdK();
    expect(dialogo()).not.toBeNull();
    cmdK();
    expect(dialogo()).toBeNull();
  });

  it("`Esc` la cierra", () => {
    render(<App />);
    ctrlK();
    escape();
    expect(dialogo()).toBeNull();
  });

  it("`Esc` cierra tambien el lanzador y el menu de sesion", () => {
    render(<App />);
    fireEvent.click(botonDelLanzador());
    expect(screen.queryByRole("dialog", { name: "Módulos del sistema" })).not.toBeNull();
    escape();
    expect(screen.queryByRole("dialog", { name: "Módulos del sistema" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^Sesión de/ }));
    expect(screen.queryByRole("menu", { name: "Sesión" })).not.toBeNull();
    escape();
    expect(screen.queryByRole("menu", { name: "Sesión" })).toBeNull();
  });

  it("la lupa la abre, y `Ctrl+K` la cierra desde ahi", () => {
    render(<App />);
    fireEvent.click(lupa());
    expect(dialogo()).not.toBeNull();
    ctrlK();
    expect(dialogo()).toBeNull();
  });

  it("abrir el lanzador la cierra, y abrirla cierra el lanzador", () => {
    // Las dos mitades son del artboard: `abrirLanzador` apaga `pal` (linea 1710) y `abrirPal`
    // apaga `lanzador` (1729). Sin una de las dos, dos capas se dibujan a la vez.
    render(<App />);
    ctrlK();
    fireEvent.click(botonDelLanzador());
    expect(dialogo()).toBeNull();

    ctrlK();
    expect(screen.queryByRole("dialog", { name: "Módulos del sistema" })).toBeNull();
  });

  it("cerrarla y volver a abrirla deja la consulta vacia", () => {
    // `pq: ''` del artboard (linea 1249). Aqui no hace falta escribirlo: la consulta vive dentro
    // de la paleta y cerrarla la desmonta. Esto lo afirma, que es lo que impide que un dia
    // alguien la suba a `App` y se pierda sin que nada lo diga.
    render(<App />);
    ctrlK();
    teclear("arqueo");
    expect(filas()).toHaveLength(1);

    ctrlK();
    ctrlK();
    expect((campo() as HTMLInputElement).value).toBe("");
    expect(filas()).toHaveLength(TOPE_DE_RESULTADOS);
  });

  it("el fondo oscuro la cierra sin elegir", () => {
    render(<App />);
    ctrlK();
    const fondo = (dialogo() as HTMLElement).previousElementSibling as HTMLElement;
    fireEvent.click(fondo);
    expect(dialogo()).toBeNull();
    expect(raiz().getAttribute("data-ir")).toBe("panel");
  });
});

describe("criterio 2 · lo que se ve con la consulta vacia y lo que se ve al escribir", () => {
  /**
   * **El criterio 2 del issue esta mal planteado, y la medida lo dice.**
   *
   * Pide ver «las 10 acciones» con la consulta vacia, y en la misma seccion cita el tope de
   * **9** de la linea 1484 del artboard. Las dos cosas no pueden ser ciertas. Ejecutando el
   * artboard con un `DCLogic` de mentira, con `pq: ''` su `palRes` tiene **9** elementos y su
   * `palPie` dice «9 resultados»: la decima, «Recibos anulados», queda fuera. Manda el diseno.
   */
  it("las acciones son diez y el tope es nueve, asi que se ven nueve", () => {
    expect(ACCIONES).toHaveLength(10);
    expect(TOPE_DE_RESULTADOS).toBe(9);

    render(<App />);
    ctrlK();
    expect(filas()).toHaveLength(9);
    expect(filas().map((f) => soloElRotulo(f))).toEqual(
      ACCIONES.slice(0, 9).map((a) => a.label),
    );
    expect(pie()).toBe("9 resultados");
  });

  it("y la decima se alcanza escribiendo, que es lo que la hace no perdida", () => {
    render(<App />);
    ctrlK();
    expect(rotulos().some((r) => r?.includes("Recibos anulados"))).toBe(false);

    teclear("anulados");
    expect(filas()).toHaveLength(1);
    expect(soloElRotulo(filas()[0] ?? null)).toBe("Recibos anulados");
    expect(filas()[0]?.children[0]?.textContent).toBe("Filtro");
  });

  it("con la consulta vacia no sale ningun recibo: la paleta es el menu de comandos", () => {
    render(<App />);
    ctrlK();
    expect(rotulos().some((r) => r?.includes("Recibo"))).toBe(false);
  });

  it("`0041184` deja UN resultado de tipo Recibo, y el pie va en singular", () => {
    render(<App />);
    ctrlK();
    teclear("0041184");
    expect(filas()).toHaveLength(1);
    expect(filas()[0]?.children[0]?.textContent).toBe("Recibo");
    expect(soloElRotulo(filas()[0] ?? null)).toBe("0003-0041184 — Suc. Rufina Medina Medina");
    // La nota de un recibo es su estado (linea 1481); la de una accion, «Tesorería».
    expect(filas()[0]?.children[2]?.textContent).toBe("Aplicado");
    expect(pie()).toBe("1 resultado");
  });

  it("la nota de una accion es el modulo, y sale de `MI_MODULO`", () => {
    render(<App />);
    ctrlK();
    expect(filas().map((f) => f.children[2]?.textContent)).toEqual(Array(9).fill("Tesorería"));
    expect(NOTA_DE_LAS_ACCIONES).toBe(MI_MODULO);
  });

  it("el pie dice «1 resultado» y «9 resultados», no «1 resultados»", () => {
    // La funcion aparte, porque el singular es lo unico que un `+ ' resultados'` se salta.
    expect(pieDe(0)).toBe("0 resultados");
    expect(pieDe(1)).toBe("1 resultado");
    expect(pieDe(2)).toBe("2 resultados");
  });

  it("casa contra el codigo, el titulo y el titular del recibo", () => {
    // Las tres columnas de la linea 1479-1480. Con solo el codigo, buscar por el nombre de quien
    // pago —que es como se busca en una ventanilla— no encontraria nada.
    expect(resultadosDe("Rufina").map((r) => r.tipo)).toEqual(["Recibo"]);
    expect(resultadosDe("tarjeta de débito").map((r) => r.tipo)).toEqual(["Recibo"]);
    expect(resultadosDe("0003-0041180").map((r) => r.nota)).toEqual(["Anulado"]);
  });

  it("no encontrar nada deja la lista vacia y el pie en cero", () => {
    render(<App />);
    ctrlK();
    teclear("zzz");
    expect(within(lista()).queryAllByRole("option")).toHaveLength(0);
    expect(pie()).toBe("0 resultados");
  });

  it("el campo lleva la pista del artboard y el pie de la derecha dice «Ctrl K»", () => {
    render(<App />);
    ctrlK();
    expect(campo().getAttribute("placeholder")).toBe(PISTA_DE_LA_PALETA);
    expect(PISTA_DE_LA_PALETA).toBe("Un recibo, un contribuyente, una acción…");
    expect((dialogo() as HTMLElement).textContent).toContain("Ctrl K");
  });
});

describe("criterio 3 · la paleta se opera SOLO con el teclado", () => {
  it("el campo se lleva el foco al abrirse", () => {
    render(<App />);
    ctrlK();
    expect(document.activeElement).toBe(campo());
  });

  it("es un combobox con lista, y lo dice como los lectores de pantalla lo entienden", () => {
    render(<App />);
    ctrlK();
    expect(campo().getAttribute("aria-expanded")).toBe("true");
    expect(campo().getAttribute("aria-controls")).toBe(lista().id);
    expect(campo().getAttribute("aria-activedescendant")).toBe(filas()[0]?.id);
    expect(filas()[0]?.getAttribute("aria-selected")).toBe("true");
    expect(filas()[1]?.getAttribute("aria-selected")).toBe("false");
  });

  it("`↓ ↓` y `Intro` abren la TERCERA entrada, no la primera, y cierran la paleta", () => {
    // La tercera es «Ver los recibos del turno» y la primera es «Cobrar»: **las dos van a
    // `predios`**, asi que la seccion sola NO distingue una implementacion de la otra. Lo que
    // las separa es que «Cobrar» empieza un cobro (`data-ir-recibo`) y saca su toast. Por eso
    // se afirman los tres.
    render(<App />);
    ctrlK();
    tecla("ArrowDown");
    tecla("ArrowDown");
    expect(soloElRotulo(enfocada())).toBe("Ver los recibos del turno");

    tecla("Enter");
    expect(dialogo()).toBeNull();
    expect(raiz().getAttribute("data-ir")).toBe("predios");
    expect(raiz().getAttribute("data-ir-recibo")).toBe("");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("y con tres flechas abre «Arqueo de mi caja», que no se confunde con ninguna", () => {
    render(<App />);
    ctrlK();
    tecla("ArrowDown");
    tecla("ArrowDown");
    tecla("ArrowDown");
    tecla("Enter");
    expect(raiz().getAttribute("data-ir")).toBe("territorio");
    expect(raiz().getAttribute("data-ir-nodo")).toBe("0");
  });

  it("`↑` desde la primera lleva a la ultima", () => {
    render(<App />);
    ctrlK();
    tecla("ArrowUp");
    expect(indiceEnfocado()).toBe(8);
    expect(soloElRotulo(enfocada())).toBe("Cierre y depósito");
  });

  it("y `↓` desde la ultima vuelve a la primera", () => {
    render(<App />);
    ctrlK();
    for (let i = 0; i < 9; i++) tecla("ArrowDown");
    expect(indiceEnfocado()).toBe(0);
  });

  it("`Intro` abre la ENFOCADA, no la primera de la lista", () => {
    // Con «caja» quedan dos: «Arqueo de mi caja» (nodo 0) y «Cajas cerradas sin arquear»
    // (nodo 2). Una implementacion que abriera siempre la primera dejaria nodo 0.
    render(<App />);
    ctrlK();
    teclear("caja");
    expect(filas()).toHaveLength(2);
    tecla("ArrowDown");
    tecla("Enter");
    expect(raiz().getAttribute("data-ir")).toBe("territorio");
    expect(raiz().getAttribute("data-ir-nodo")).toBe("2");
  });

  it("con la lista vacia, `Intro` no hace nada y la paleta sigue abierta", () => {
    render(<App />);
    ctrlK();
    teclear("zzz");
    tecla("Enter");
    expect(dialogo()).not.toBeNull();
    expect(raiz().getAttribute("data-ir")).toBe("panel");
  });

  it("pulsar una fila con el raton hace lo mismo que `Intro`", () => {
    render(<App />);
    ctrlK();
    teclear("Tarifario");
    fireEvent.click(filas()[0] as HTMLElement);
    expect(dialogo()).toBeNull();
    expect(raiz().getAttribute("data-ir")).toBe("valores");
    expect(raiz().getAttribute("data-ir-valtab")).toBe("0");
  });

  it("«Cobrar» abre un cobro nuevo y saca el toast del artboard", () => {
    render(<App />);
    ctrlK();
    tecla("Enter");
    expect(raiz().getAttribute("data-ir")).toBe("predios");
    expect(raiz().getAttribute("data-ir-recibo")).toBe("nuevo");
    expect(screen.getByRole("status").textContent).toBe(
      "Cobro nuevo: elija la caja abierta y el contribuyente.",
    );
  });

  it("elegir un recibo abre Recibos con ese recibo", () => {
    render(<App />);
    ctrlK();
    teclear("Rufina");
    tecla("Enter");
    expect(raiz().getAttribute("data-ir")).toBe("predios");
    expect(raiz().getAttribute("data-ir-recibo")).toBe("0003-0041184");
  });

  it("y navegar desde la paleta abre pestana, como cualquier otra puerta de entrada", () => {
    // Lo que exige el issue: la paleta pasa por `usarPestanas`, no por un camino nuevo.
    render(<App />);
    ctrlK();
    teclear("Arqueo");
    tecla("Enter");
    expect(window.location.hash).toBe("#cajas");
    expect(
      [...document.querySelectorAll("[data-pestana]")].map((p) => p.getAttribute("data-pestana")),
    ).toEqual(["panel", "territorio"]);
  });
});

describe("criterio 4 · al filtrar, el foco vuelve al primero", () => {
  /**
   * **Esta prueba se mide con VARIOS resultados a proposito.**
   *
   * Es la advertencia literal de `verificaciones/paleta.mjs`: con un solo resultado, acotar el
   * indice al ultimo ya salva la situacion, de modo que la comprobacion pasaria con la guarda
   * quitada. Con nueve resultados y el foco en el cuarto, una implementacion sin guarda deja el
   * foco en la cuarta fila de la lista nueva, que es una que nadie eligio.
   */
  it("con nueve a la vista y el foco en el cuarto, teclear devuelve el foco al primero", () => {
    render(<App />);
    ctrlK();
    tecla("ArrowDown");
    tecla("ArrowDown");
    tecla("ArrowDown");
    expect(indiceEnfocado()).toBe(3);

    teclear("a");
    expect(filas().length).toBeGreaterThanOrEqual(3);
    expect(indiceEnfocado()).toBe(0);
    expect(campo().getAttribute("aria-activedescendant")).toBe(filas()[0]?.id);
  });

  it("y borrar una letra tambien lo devuelve al primero", () => {
    render(<App />);
    ctrlK();
    teclear("ca");
    tecla("ArrowDown");
    tecla("ArrowDown");
    expect(indiceEnfocado()).toBe(2);

    teclear("c");
    expect(filas().length).toBeGreaterThanOrEqual(3);
    expect(indiceEnfocado()).toBe(0);
  });
});

describe("criterio 5 · el oyente de `keydown` se retira al desmontar", () => {
  /**
   * Se mide con `defaultPrevented`, y no con un espia de `console.error`.
   *
   * El manejador llama a `evento.preventDefault()`, asi que un evento cancelable disparado sobre
   * `window` sale marcado si —y solo si— alguien lo escucho. Eso distingue el caso bueno del
   * malo por los dos lados: antes de desmontar tiene que salir marcado, y despues no.
   *
   * Un `expect(console.error).not.toHaveBeenCalled()` **no serviria**, y no es una suposicion:
   * el issue #6 lo midio en este mismo repositorio con la limpieza del reloj del toast quitada
   * —el temporizador vivo salio rojo y el espia siguio en verde—, porque React 19 ignora en
   * silencio una actualizacion sobre un componente desmontado. Una asercion sobre un aviso que
   * ya no existe es un comentario disfrazado de verificacion.
   */
  const ctrlKCancelable = () => {
    const evento = new KeyboardEvent("keydown", {
      key: "k",
      ctrlKey: true,
      cancelable: true,
      bubbles: true,
    });
    act(() => {
      window.dispatchEvent(evento);
    });
    return evento;
  };

  it("antes de desmontar alguien lo escucha; despues, nadie", () => {
    const { unmount } = render(<App />);
    expect(ctrlKCancelable().defaultPrevented).toBe(true);

    unmount();
    expect(ctrlKCancelable().defaultPrevented).toBe(false);
  });

  it("y tras desmontar no queda ninguna paleta en el documento", () => {
    const { unmount } = render(<App />);
    ctrlK();
    expect(dialogo()).not.toBeNull();
    unmount();
    ctrlKCancelable();
    expect(document.querySelector("[data-paleta-dialogo]")).toBeNull();
  });
});

describe("los destinos de las diez acciones apuntan a lo que su rotulo promete", () => {
  /**
   * Un indice que baila no rompe nada visible: abre otro panel. Por eso no se comprueba que el
   * numero sea el del artboard —eso solo diria que la copia es la copia— sino que la fila a la
   * que lleva **se llama como la accion**.
   */
  it("los cuatro nodos de «Cajas y arqueo»", () => {
    const nodoDe = (label: string) => ACCIONES.find((a) => a.label === label)?.destino.nodo ?? -1;
    expect(NODOS[nodoDe("Arqueo de mi caja")]?.titulo).toBe("C-3 — su caja, abierta");
    expect(NODOS[nodoDe("Cajas cerradas sin arquear")]?.titulo).toBe(
      "C-1 — cerrada ayer sin arquear",
    );
    expect(NODOS[nodoDe("Anulaciones del día")]?.titulo).toBe("Anulaciones del día");
    expect(NODOS[nodoDe("Pendientes de conciliar")]?.titulo).toBe("Pendientes de conciliar");
  });

  it("las dos pestanas del tarifario", () => {
    const tabDe = (label: string) => ACCIONES.find((a) => a.label === label)?.destino.valTab ?? -1;
    expect(TARIFARIO[tabDe("Tarifario del TUPA")]?.label).toBe("Tarifario del TUPA");
    expect(TARIFARIO[tabDe("Cierre y depósito")]?.label).toBe("Cierre y depósito");
  });

  it("y las diez llevan a una seccion que existe", () => {
    const propias = ["panel", "predios", "territorio", "valores"];
    expect(ACCIONES.every((a) => propias.includes(a.seccion))).toBe(true);
  });
});

describe("la paleta se ve como el artboard la dibuja", () => {
  it("la fila enfocada va en `#EFF7FC` y las demas transparentes", () => {
    render(<App />);
    ctrlK();
    expect(getComputedStyle(filas()[0] as HTMLElement).backgroundColor).toBe("#EFF7FC");
    expect(getComputedStyle(filas()[1] as HTMLElement).backgroundColor).toBe("transparent");

    tecla("ArrowDown");
    expect(getComputedStyle(filas()[0] as HTMLElement).backgroundColor).toBe("transparent");
    expect(getComputedStyle(filas()[1] as HTMLElement).backgroundColor).toBe("#EFF7FC");
  });

  it("la pastilla del tipo resuelve sus tres tokens", () => {
    render(<App />);
    ctrlK();
    const pastilla = filas()[0]?.children[0] as HTMLElement;
    const estilo = getComputedStyle(pastilla);
    expect(estilo.color).toBe("#5A6B78");
    expect(estilo.backgroundColor).toBe("#F7FBFE");
    expect(estilo.textTransform).toBe("uppercase");
    expect(estilo.fontWeight).toBe("700");
  });

  it("el dialogo arranca a 12vh, con su radio y su sombra de token", () => {
    // El ancho —`min(620px,92vw)`— NO se afirma aqui, y no por descuido: happy-dom lo pierde por
    // el camino que React usa. Ver la sonda de abajo. Se midio en Chromium: `x: 410`, `width:
    // 620` sobre 1 440 px.
    render(<App />);
    ctrlK();
    const nodo = dialogo() as HTMLElement;
    expect(nodo.style.top).toBe("12vh");
    expect(nodo.style.borderRadius).toBe("var(--radio-10)");
    expect(nodo.style.boxShadow).toBe("var(--sombra-cajon)");
    expect(lista().style.maxHeight).toBe("54vh");
  });
});

describe("una cosa que happy-dom no sabe hacer, medida y no supuesta", () => {
  /**
   * **happy-dom tira `min()` de un estilo en linea, y por el camino de React lo tira del todo.**
   *
   * Las dos mitades se midieron, y la diferencia entre ellas es justo la que engana: por
   * `setAttribute` la funcion **sobrevive en el atributo** aunque `style.width` quede vacio; por
   * asignacion de propiedad —que es lo que hace React con un `style={{}}`— no queda ni rastro,
   * ni en la propiedad ni en el atributo. La primera version de esta prueba media la via de
   * `setAttribute`, dio por buena una asercion sobre el atributo, y salio roja contra el
   * componente de verdad.
   *
   * `12vh` y `54vh`, que no llevan funcion, se guardan bien por las dos vias.
   *
   * El dia que happy-dom soporte `min()`, esta prueba se pondra roja sola y el hueco del ancho
   * se podra tapar: eso es exactamente lo que se quiere que pase, y por eso no es un comentario.
   */
  it("por `setAttribute` sobrevive en el atributo, pero no en la propiedad", () => {
    const caja = document.createElement("div");
    caja.setAttribute("style", "width:min(620px,92vw); top:12vh");
    expect(caja.style.width).toBe("");
    expect(caja.getAttribute("style")).toContain("min(620px,92vw)");
    expect(caja.style.top).toBe("12vh");
  });

  it("y por asignacion de propiedad —la via de React— no queda ni rastro", () => {
    const caja = document.createElement("div");
    caja.style.width = "min(620px,92vw)";
    caja.style.top = "12vh";
    expect(caja.style.width).toBe("");
    expect(caja.getAttribute("style")).not.toContain("min(");
    expect(caja.style.top).toBe("12vh");
  });
});
