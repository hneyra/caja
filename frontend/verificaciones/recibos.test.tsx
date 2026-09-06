// @vitest-environment happy-dom
//
// La lista de `#recibos`, medida.
//
// POR QUE happy-dom Y NO EL jsdom DEL RESTO DE LA SUITE
// Por lo mismo que `panel.test.tsx` y `paleta.test.tsx`: lo que los criterios 4 y 7 afirman son
// **colores que salen de un token**. El chip activo se distingue por `#005284`, `#E4F4FD` y
// `#004670`, y la fila elegida por su borde izquierdo `#005284`. En jsdom lo unico afirmable
// seria que la pantalla escribe `var(--azul)`, que es justo lo que la prueba NO quiere dar por
// bueno.
//
// LO QUE NO SE PUDO AFIRMAR AQUI, Y DONDE SE MIDIO
// El **grosor** del borde izquierdo. La fila declara `border: 0`, `border-bottom` y
// `border-left` en el mismo estilo en linea, y happy-dom funde las tres en un `border-width:
// 0px 0px var(--linea-2) var(--azul)` sin sentido: `borderLeftWidth` sale cadena vacia — medido,
// esta escrito en la prueba que lo dice—. Lo que si llega entero es `borderLeftColor`, que es lo
// que el criterio nombra. Los `3px` se midieron en un Chromium de verdad y estan en el PR.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App";
import {
  ACTIVIDAD,
  CHIP_DE_TODOS,
  CHIPS,
  CIFRAS,
  ORDEN_NATURAL,
  ORDENES,
  RECIBOS,
  TOTAL_DEL_TURNO,
} from "../src/datos";
import type { Recibo } from "../src/datos";
import { COBRO_NUEVO } from "../src/marco/destino";
import {
  BUSQUEDA,
  casaElChip,
  COBRAR,
  conteoDe,
  DONDE_MIRAR,
  DONDE_SE_ABRE,
  ELIJA_UN_RECIBO,
  filtrar,
  LIMPIAR_LA_BUSQUEDA,
  NINGUNO_COINCIDE,
  ordenar,
  ORDENAR_LA_LISTA,
} from "../src/pantallas/Recibos";
import { VER_LOS_RECIBOS } from "../src/pantallas/Panel";
import { ROTULO_DEL_CAMPO } from "../src/paleta/acciones";
import "../src/ds/global.css";

afterEach(cleanup);

/** El hash es global del documento y `App` lo escribe al montarse. Ver `marco.test.tsx`. */
beforeEach(() => window.history.replaceState(null, "", window.location.pathname));

const AQUI = dirname(fileURLToPath(import.meta.url));
const PANTALLAS = join(AQUI, "..", "src", "pantallas");

const raiz = () => document.querySelector("[data-ir]") as HTMLElement;
const pantalla = () => document.querySelector("[data-seccion='predios']") as HTMLElement;
const filas = () => [...pantalla().querySelectorAll("[data-recibo]")] as HTMLElement[];
const codigos = () => filas().map((f) => f.getAttribute("data-recibo"));
const titulos = () => filas().map((f) => f.firstElementChild?.firstElementChild?.textContent);
const conteo = () => pantalla().querySelector("[data-conteo]")?.textContent ?? "";
const chip = (label: string) =>
  pantalla().querySelector(`[data-chip="${label}"]`) as HTMLElement;
const fila = (cod: string) => pantalla().querySelector(`[data-recibo="${cod}"]`) as HTMLElement;
const elegidas = () =>
  filas()
    .filter((f) => f.getAttribute("aria-current") === "true")
    .map((f) => f.getAttribute("data-recibo"));

/** Abre una seccion desde el arbol, que es una de las cuatro puertas del marco. */
const abrirSeccion = (clave: string) =>
  fireEvent.click(document.querySelector(`[data-submodulo="${clave}"]`) as HTMLElement);

/** Deja `#recibos` a la vista, que es lo que hace toda prueba de este archivo. */
const abrirRecibos = () => {
  render(<App />);
  abrirSeccion("predios");
};

const buscar = (texto: string) =>
  fireEvent.change(screen.getByPlaceholderText(BUSQUEDA), { target: { value: texto } });

const ordenarPor = (orden: string) =>
  fireEvent.change(screen.getByRole("combobox", { name: ORDENAR_LA_LISTA }), {
    target: { value: orden },
  });

/**
 * Un recibo inventado, para los casos que **ningun dato real puede separar**.
 *
 * Los cinco del turno traen el mismo texto en `estado` y en `uso`, y sus titulos no se ordenan
 * distinto con `localeCompare` que con `<`. Sin recibos de mentira, las dos mitades del criterio
 * 4 y la del 6 que dice «con `localeCompare` en español, no con `<`» serian incomprobables: la
 * implementacion mala daria exactamente la misma lista.
 */
const inventado = (cambios: Partial<Recibo>): Recibo => ({
  cod: "0000-0000000",
  titulo: "Sin nombre",
  titular: "Sin detalle",
  uso: "Aplicado",
  autovaluo: "S/ 0.00",
  estado: "Aplicado",
  tono: "ok",
  valor: 0,
  contexto: "",
  ...cambios,
});

describe("criterio 1 · sin filtro hay cinco filas y el conteo dice «5 de 52»", () => {
  it("las cinco, en el orden de los datos", () => {
    abrirRecibos();
    expect(filas()).toHaveLength(5);
    expect(codigos()).toEqual(RECIBOS.map((r) => r.cod));
  });

  it("y el conteo dice exactamente «5 de 52»", () => {
    abrirRecibos();
    expect(conteo()).toBe("5 de 52");
  });

  /**
   * Lo que hace que el criterio 2 pueda cumplirse: **los dos numeros son de origen distinto**.
   *
   * El de la izquierda se cuenta; el de la derecha es un dato del turno. Si `TOTAL_DEL_TURNO`
   * fuera `RECIBOS.length`, «5 de 52» saldria «5 de 5» y ademas el criterio 2 seria imposible.
   */
  it("el «52» es el total del turno, y NO el numero de recibos que la lista ensena", () => {
    expect(TOTAL_DEL_TURNO).toBe("52");
    expect(TOTAL_DEL_TURNO).not.toBe(String(RECIBOS.length));
    expect(conteoDe(RECIBOS.length)).toBe("5 de 52");
  });

  it("y es la misma cifra que la tarjeta «Su caja — C-3» del panel", () => {
    // Las dos pantallas cuentan el mismo turno. El artboard las escribe por separado y aqui se
    // copian por separado; que se separen no rompe nada, solo hace que la ventanilla diga dos
    // numeros distintos de la misma caja.
    const suCaja = CIFRAS.find((c) => c.delta.includes("recibo"));
    expect(suCaja?.delta).toBe(`${TOTAL_DEL_TURNO} recibos`);
  });
});

describe("criterio 2 · «zapata» deja una fila, y el conteo dice «1 de 52»", () => {
  it("una sola fila, la de Zapata Rivas", () => {
    abrirRecibos();
    buscar("zapata");
    expect(codigos()).toEqual(["0003-0041180"]);
  });

  it("y el conteo dice «1 de 52», **no** «1 de 1»", () => {
    // El error facil, y el que la leccion 7 avisa: un conteo que se calcula sobre lo filtrado
    // por los dos lados cuadra siempre consigo mismo y no informa de nada.
    abrirRecibos();
    buscar("zapata");
    expect(conteo()).toBe("1 de 52");
    expect(conteo()).not.toBe("1 de 1");
  });

  it.each([
    ["0041182", "0003-0041182", "el codigo"],
    ["zapata", "0003-0041180", "el titulo"],
    ["licencia", "0003-0041181", "el titular"],
  ])("«%s» casa por %s y deja %s", (texto, cod) => {
    // Tres consultas elegidas para que **cada una case por un campo distinto**: si la busqueda
    // mirara solo el titulo, dos de las tres saldrian vacias.
    abrirRecibos();
    buscar(texto);
    expect(codigos()).toEqual([cod]);
  });

  it("no distingue mayusculas ni le estorban los espacios de los lados", () => {
    abrirRecibos();
    buscar("  ZAPATA  ");
    expect(codigos()).toEqual(["0003-0041180"]);
  });

  it("el aspa de limpiar solo existe con algo escrito, y devuelve las cinco", () => {
    abrirRecibos();
    expect(screen.queryByRole("button", { name: LIMPIAR_LA_BUSQUEDA })).toBeNull();
    buscar("zapata");
    fireEvent.click(screen.getByRole("button", { name: LIMPIAR_LA_BUSQUEDA }));
    expect(filas()).toHaveLength(5);
    expect(conteo()).toBe("5 de 52");
    expect(screen.queryByRole("button", { name: LIMPIAR_LA_BUSQUEDA })).toBeNull();
  });
});

describe("criterio 3 · «zzz» no deja ninguna, y lo dice", () => {
  /**
   * El «Cobrar» se busca **dentro de la pantalla**, y no en el documento entero.
   *
   * La fila del titulo del marco tiene otro boton que se llama igual (linea 410), asi que hay
   * dos con el mismo nombre accesible en cuanto la lista se queda vacia. Es del artboard —los
   * dos estan en el, y hacen lo mismo—, y queda dicho aqui porque un `getByRole` sin acotar
   * revienta con «Found multiple elements», que fue lo que paso al escribir esta prueba.
   */
  const cobrarDeLaLista = () => within(pantalla()).getByRole("button", { name: COBRAR });

  it("cero filas, el mensaje del artboard y su boton «Cobrar»", () => {
    abrirRecibos();
    buscar("zzz");
    expect(filas()).toHaveLength(0);
    expect(conteo()).toBe("0 de 52");
    expect(screen.getByText(NINGUNO_COINCIDE)).toBeDefined();
    expect(screen.getByText(DONDE_MIRAR)).toBeDefined();
    expect(cobrarDeLaLista()).toBeDefined();
  });

  it("y con filas ese bloque NO esta, que es lo que lo hace un estado y no un adorno", () => {
    // Sin esta mitad, dibujar el vacio **siempre** pasaria la prueba de arriba.
    abrirRecibos();
    expect(screen.queryByText(NINGUNO_COINCIDE)).toBeNull();
    expect(pantalla().querySelector("[data-vacio]")).toBeNull();
  });

  it("su «Cobrar» deja el destino de un cobro nuevo, y no abre ningun formulario", () => {
    // Lo que hace hoy es lo mismo que el «Cobrar» de la fila del titulo: dejar el destino
    // puesto. El formulario es de #13, y por eso la lista sigue siendo lo unico que se dibuja.
    abrirRecibos();
    buscar("zzz");
    fireEvent.click(cobrarDeLaLista());
    expect(raiz().getAttribute("data-ir-recibo")).toBe(COBRO_NUEVO);
    expect(pantalla()).not.toBeNull();
  });
});

describe("criterio 4 · los chips filtran, y solo uno esta pulsado", () => {
  it("son los cuatro del artboard, y arranca en «Todos»", () => {
    abrirRecibos();
    expect([...pantalla().querySelectorAll("[data-chip]")].map((c) => c.textContent)).toEqual([
      ...CHIPS,
    ]);
    expect(chip(CHIP_DE_TODOS).getAttribute("aria-pressed")).toBe("true");
  });

  it.each([
    ["Anulado", ["0003-0041180"]],
    ["Sin conciliar", ["0003-0041183"]],
    ["Aplicado", ["0003-0041184", "0003-0041182", "0003-0041181"]],
    ["Todos", RECIBOS.map((r) => r.cod)],
  ])("«%s» deja %j", (etiqueta, esperados) => {
    abrirRecibos();
    fireEvent.click(chip(etiqueta));
    expect(codigos()).toEqual(esperados);
    expect(conteo()).toBe(`${esperados.length} de ${TOTAL_DEL_TURNO}`);
  });

  it.each(CHIPS)("con «%s» pulsado, los otros tres dicen `aria-pressed=false`", (etiqueta) => {
    abrirRecibos();
    fireEvent.click(chip(etiqueta));
    const pulsados = [...pantalla().querySelectorAll("[data-chip]")]
      .filter((c) => c.getAttribute("aria-pressed") === "true")
      .map((c) => c.textContent);
    expect(pulsados).toEqual([etiqueta]);
  });

  it("el activo va con borde #005284, fondo #E4F4FD, tinta #004670 y peso 600", () => {
    abrirRecibos();
    fireEvent.click(chip("Anulado"));
    const encendido = getComputedStyle(chip("Anulado"));
    expect(encendido.borderColor).toBe("#005284");
    expect(encendido.backgroundColor).toBe("#E4F4FD");
    expect(encendido.color).toBe("#004670");
    expect(encendido.fontWeight).toBe("600");

    const apagado = getComputedStyle(chip("Aplicado"));
    expect(apagado.borderColor).toBe("#D6DEE4");
    expect(apagado.backgroundColor).toBe("#fff");
    expect(apagado.color).toBe("#5A6B78");
    expect(apagado.fontWeight).toBe("400");
  });

  /**
   * La mitad del criterio que **ningun recibo real puede comprobar**.
   *
   * Los cinco traen `estado` y `uso` con el mismo texto, de modo que una implementacion que
   * mirara solo `estado` daria hoy exactamente la misma lista en los cuatro chips. El caso que
   * las separa es un recibo con los dos campos distintos, y es este.
   */
  it("un chip casa contra `estado` O contra `uso`, y no solo contra uno", () => {
    const raro = inventado({ estado: "Aplicado", uso: "Anulado" });
    expect(casaElChip(raro, "Aplicado")).toBe(true);
    expect(casaElChip(raro, "Anulado")).toBe(true);
    expect(casaElChip(raro, "Sin conciliar")).toBe(false);
    expect(casaElChip(raro, CHIP_DE_TODOS)).toBe(true);
  });

  it("y los tres chips que filtran casan con algun recibo del turno", () => {
    // Un chip que no casara con ninguno vaciaria la lista sin decir por que, y el escaneo de
    // arriba no lo veria: mide los cuatro que hay, no que los cuatro sirvan.
    for (const etiqueta of CHIPS.filter((c) => c !== CHIP_DE_TODOS)) {
      expect(filtrar(RECIBOS, "", etiqueta).length, etiqueta).toBeGreaterThan(0);
    }
  });
});

describe("criterio 5 · el chip y la busqueda se combinan", () => {
  it("«Aplicado» + «inversiones» deja una fila", () => {
    abrirRecibos();
    fireEvent.click(chip("Aplicado"));
    buscar("inversiones");
    expect(codigos()).toEqual(["0003-0041181"]);
    expect(conteo()).toBe("1 de 52");
  });

  it("y «Anulado» + «inversiones» no deja ninguna: se suman, no se eligen", () => {
    // El caso que separa el `&&` del `||`. Con un `||` esta consulta daria **dos** filas —el
    // anulado y el de Inversiones—, y la prueba de arriba seguiria verde.
    abrirRecibos();
    fireEvent.click(chip("Anulado"));
    buscar("inversiones");
    expect(filas()).toHaveLength(0);
    expect(conteo()).toBe("0 de 52");
  });

  it("y limpiar la busqueda deja el chip puesto", () => {
    abrirRecibos();
    fireEvent.click(chip("Aplicado"));
    buscar("inversiones");
    fireEvent.click(screen.getByRole("button", { name: LIMPIAR_LA_BUSQUEDA }));
    expect(codigos()).toEqual(["0003-0041184", "0003-0041182", "0003-0041181"]);
    expect(chip("Aplicado").getAttribute("aria-pressed")).toBe("true");
  });
});

describe("criterio 6 · los tres ordenes", () => {
  it("son los tres del artboard y la lista arranca en el natural", () => {
    abrirRecibos();
    expect(ORDENES).toEqual(["Recibo", "Importe", "Contribuyente"]);
    expect((screen.getByRole("combobox", { name: ORDENAR_LA_LISTA }) as HTMLSelectElement).value).toBe(
      ORDEN_NATURAL,
    );
  });

  it("«Importe» pone 0003-0041181 la primera y 0003-0041180 la ultima", () => {
    abrirRecibos();
    ordenarPor("Importe");
    expect(codigos()).toEqual([
      "0003-0041181",
      "0003-0041184",
      "0003-0041182",
      "0003-0041183",
      "0003-0041180",
    ]);
    expect(fila("0003-0041181").textContent).toContain("S/ 6,365.63");
    expect(fila("0003-0041180").textContent).toContain("S/ 18.19");
  });

  it("«Contribuyente» pone a Castillo la primera y a Zapata la ultima", () => {
    abrirRecibos();
    ordenarPor("Contribuyente");
    expect(titulos()).toEqual([
      "Castillo Pascuala, María Elena",
      "Díaz Madrid, Julio César",
      "Inversiones del Norte S.A.C.",
      "Suc. Rufina Medina Medina",
      "Zapata Rivas, Óscar",
    ]);
  });

  /**
   * La mitad del criterio que **los cinco recibos reales no pueden comprobar**.
   *
   * Sus titulos empiezan por C, D, I, S y Z, asi que ordenarlos con `<` da exactamente la misma
   * lista que con `localeCompare(…, 'es')`: la prueba de arriba pasa con las dos
   * implementaciones. Lo que las separa es una eñe al principio, que por unidades de codigo
   * (U+00D1) cae **detras de la Z**.
   */
  it("«Contribuyente» ordena con `localeCompare(…, 'es')`, que NO es `<`", () => {
    const sinOrdenar = [
      inventado({ cod: "1", titulo: "Zapata Rivas, Óscar" }),
      inventado({ cod: "2", titulo: "Ñañez Alva, Rosa" }),
      inventado({ cod: "3", titulo: "Núñez Bravo, Ana" }),
    ];
    const enEspanol = ordenar(sinOrdenar, "Contribuyente").map((r) => r.titulo);
    expect(enEspanol).toEqual([
      "Núñez Bravo, Ana",
      "Ñañez Alva, Rosa",
      "Zapata Rivas, Óscar",
    ]);

    // Y con `<` sale otra cosa: la eñe al final. Se afirma para que se vea que el caso separa
    // de verdad las dos implementaciones, y no solo que una da lo que se esperaba.
    const porUnidadesDeCodigo = [...sinOrdenar]
      .sort((a, b) => (a.titulo < b.titulo ? -1 : 1))
      .map((r) => r.titulo);
    expect(porUnidadesDeCodigo).toEqual([
      "Núñez Bravo, Ana",
      "Zapata Rivas, Óscar",
      "Ñañez Alva, Rosa",
    ]);
    expect(enEspanol).not.toEqual(porUnidadesDeCodigo);
  });

  /**
   * «Recibo» es el natural: **no ordena**.
   *
   * Que hoy los cinco vengan de mayor a menor codigo hace que ordenar por `cod` descendente de
   * la misma lista, asi que la lista real no separa una implementacion de la otra. El caso que
   * si las separa es una lista desordenada: el orden natural la devuelve tal cual.
   */
  it("«Recibo» devuelve la lista tal como llego, sin ordenarla", () => {
    const desordenados = [
      inventado({ cod: "0003-0041180", valor: 18.19 }),
      inventado({ cod: "0003-0041184", valor: 2511.94 }),
      inventado({ cod: "0003-0041182", valor: 2006.25 }),
    ];
    expect(ordenar(desordenados, ORDEN_NATURAL).map((r) => r.cod)).toEqual([
      "0003-0041180",
      "0003-0041184",
      "0003-0041182",
    ]);
  });

  it("y ordenar no toca la lista de datos: devuelve una copia", () => {
    // `sort` ordena en el sitio. Sin la copia, elegir «Importe» reordenaria `RECIBOS` para
    // todas las pantallas y el orden natural dejaria de existir.
    const antes = RECIBOS.map((r) => r.cod);
    ordenar(RECIBOS, "Importe");
    ordenar(RECIBOS, "Contribuyente");
    expect(RECIBOS.map((r) => r.cod)).toEqual(antes);
  });

  it("el orden se mantiene al filtrar", () => {
    abrirRecibos();
    ordenarPor("Importe");
    fireEvent.click(chip("Aplicado"));
    expect(codigos()).toEqual(["0003-0041181", "0003-0041184", "0003-0041182"]);
  });
});

describe("criterio 7 · pulsar una fila la marca y desmarca la anterior", () => {
  it("la pulsada queda con `aria-current=true` y es la unica", () => {
    abrirRecibos();
    fireEvent.click(fila("0003-0041182"));
    expect(elegidas()).toEqual(["0003-0041182"]);
  });

  it("le pone el borde izquierdo #005284 y el fondo #E4F4FD", () => {
    abrirRecibos();
    fireEvent.click(fila("0003-0041182"));
    const marcada = getComputedStyle(fila("0003-0041182"));
    expect(marcada.borderLeftColor).toBe("#005284");
    expect(marcada.backgroundColor).toBe("#E4F4FD");

    const otra = getComputedStyle(fila("0003-0041184"));
    expect(otra.borderLeftColor).toBe("transparent");
    expect(otra.backgroundColor).toBe("transparent");
  });

  it("y pulsar otra quita la marca de la primera", () => {
    abrirRecibos();
    fireEvent.click(fila("0003-0041182"));
    fireEvent.click(fila("0003-0041184"));
    expect(elegidas()).toEqual(["0003-0041184"]);
    expect(fila("0003-0041182").getAttribute("aria-current")).toBe("false");
    expect(getComputedStyle(fila("0003-0041182")).borderLeftColor).toBe("transparent");
  });

  it("y el recibo elegido viaja por el marco, como cualquier otra navegacion", () => {
    // No es estado privado de la pantalla: es el destino del `ir(dest, extra)` del artboard, y
    // por eso el hash y las pestanas siguen siendo del marco.
    abrirRecibos();
    fireEvent.click(fila("0003-0041182"));
    expect(raiz().getAttribute("data-ir")).toBe("predios");
    expect(raiz().getAttribute("data-ir-recibo")).toBe("0003-0041182");
    expect(window.location.hash).toBe("#recibos");
  });

  it("una fila elegida que el filtro esconde deja la lista sin ninguna marcada", () => {
    // El caso raro, y el que dice que la marca se lee de los datos y no de un `useState` que
    // nadie vuelve a mirar: filtrar no cambia lo elegido, cambia lo que se ve.
    abrirRecibos();
    fireEvent.click(fila("0003-0041180"));
    fireEvent.click(chip("Aplicado"));
    expect(elegidas()).toEqual([]);
    expect(raiz().getAttribute("data-ir-recibo")).toBe("0003-0041180");
  });
});

describe("criterio 8 · sin nada elegido, la derecha dice «Elija un recibo de la lista»", () => {
  it("con su texto de la linea 604", () => {
    abrirRecibos();
    expect(screen.getByText(ELIJA_UN_RECIBO)).toBeDefined();
    expect(screen.getByText(DONDE_SE_ABRE)).toBeDefined();
  });

  it("y con un recibo elegido ese bloque desaparece", () => {
    // Sin esta mitad, dibujarlo **siempre** pasaria la prueba de arriba.
    abrirRecibos();
    fireEvent.click(fila("0003-0041184"));
    expect(screen.queryByText(ELIJA_UN_RECIBO)).toBeNull();
    // Desde #12 lo que ocupa ese sitio es la ficha, y `data-ficha` dice de que recibo es.
    expect(pantalla().querySelector("[data-ficha]")?.getAttribute("data-ficha")).toBe(
      "0003-0041184",
    );
  });

  it("un recibo que no existe se lee como «no hay ninguno elegido»", () => {
    // Es el `sel === undefined` de la linea 1891, medido contra el artboard: un codigo que no
    // esta en `RECIBOS` no abre una ficha vacia, deja el estado vacio.
    abrirRecibos();
    fireEvent.click(fila("0003-0041184"));
    abrirSeccion("panel");
    fireEvent.click(screen.getByRole("button", { name: VER_LOS_RECIBOS }));
    expect(screen.getByText(ELIJA_UN_RECIBO)).toBeDefined();
    expect(elegidas()).toEqual([]);
  });
});

describe("la deuda de #10: la actividad del panel deja ESE recibo elegido", () => {
  it.each(ACTIVIDAD.map((a) => [a.codigo] as const))(
    "pulsar %s en el panel abre la lista con esa fila marcada",
    (codigo) => {
      render(<App />);
      fireEvent.click(document.querySelector(`[data-actividad="${codigo}"]`) as HTMLElement);
      expect(pantalla()).not.toBeNull();
      expect(elegidas()).toEqual([codigo]);
      expect(screen.queryByText(ELIJA_UN_RECIBO)).toBeNull();
    },
  );

  it("y «Ver los recibos del turno» abre la lista sin ninguna marcada", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: VER_LOS_RECIBOS }));
    expect(elegidas()).toEqual([]);
    expect(screen.getByText(ELIJA_UN_RECIBO)).toBeDefined();
  });
});

describe("el chip que llega en el destino: «Recibos anulados» de la paleta", () => {
  const campo = () => screen.getByRole("combobox", { name: ROTULO_DEL_CAMPO });
  const elegirRecibosAnulados = () => {
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    fireEvent.change(campo(), { target: { value: "anulados" } });
    fireEvent.keyDown(campo(), { key: "Enter" });
  };

  it("desde el panel, la lista se abre ya filtrada por «Anulado»", () => {
    render(<App />);
    elegirRecibosAnulados();
    expect(chip("Anulado").getAttribute("aria-pressed")).toBe("true");
    expect(codigos()).toEqual(["0003-0041180"]);
  });

  it("y estando YA en la lista, tambien: la pantalla no se vuelve a montar", () => {
    // El caso que separa «lo lee al montarse» de «lo obedece siempre». Sin la sincronizacion,
    // esta accion de la paleta no haria nada visible estando en `#recibos`.
    abrirRecibos();
    expect(chip(CHIP_DE_TODOS).getAttribute("aria-pressed")).toBe("true");
    elegirRecibosAnulados();
    expect(chip("Anulado").getAttribute("aria-pressed")).toBe("true");
    expect(codigos()).toEqual(["0003-0041180"]);
  });

  it("pero pulsar una fila NO deshace el chip que el cajero puso", () => {
    // Navegar a un recibo manda `{ recibo: … }` y ningun chip. Un destino sin chip no es «pon
    // Todos»: es «esto no habla del chip».
    abrirRecibos();
    fireEvent.click(chip("Aplicado"));
    fireEvent.click(fila("0003-0041184"));
    expect(chip("Aplicado").getAttribute("aria-pressed")).toBe("true");
    expect(codigos()).toEqual(["0003-0041184", "0003-0041182", "0003-0041181"]);
  });
});

describe("ninguna cifra ni ningun texto de los recibos esta escrito en la pantalla", () => {
  const fuentes = readdirSync(PANTALLAS)
    .filter((n) => /\.tsx?$/.test(n))
    .map((n) => [n, readFileSync(join(PANTALLAS, n), "utf8")] as const);

  /** El codigo sin comentarios. Ver el mismo escaner en `panel.test.tsx`. */
  const sinComentarios = (codigo: string) =>
    codigo.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("hay algo que escanear", () => {
    expect(fuentes.map(([n]) => n)).toContain("Recibos.tsx");
  });

  it("ni un codigo, ni un titular, ni un importe de `RECIBOS`", () => {
    const literales = RECIBOS.flatMap((r) => [r.cod, r.titulo, r.titular, r.autovaluo]);
    expect(literales.length).toBeGreaterThan(15);

    const colados = fuentes.flatMap(([nombre, codigo]) =>
      literales
        .filter((texto) => sinComentarios(codigo).includes(texto))
        .map((texto) => `${nombre}: ${texto}`),
    );
    expect(colados).toEqual([]);
  });

  it("ni el «52» del conteo, que sale de `TOTAL_DEL_TURNO`", () => {
    // Se busca con limites de palabra y sobre el codigo sin comentarios: las tres veces que
    // `52` aparece en `Recibos.tsx` estan dentro de comentarios que citan lineas del artboard
    // y explican el conteo, y una prueba que prohibiera nombrarlo en prosa se acabaria apagando.
    const colados = fuentes
      .filter(([, codigo]) => new RegExp(`\\b${TOTAL_DEL_TURNO}\\b`).test(sinComentarios(codigo)))
      .map(([nombre]) => nombre);
    expect(colados).toEqual([]);
  });
});
