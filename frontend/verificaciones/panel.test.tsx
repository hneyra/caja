// @vitest-environment happy-dom
//
// El Panel de Tesoreria, medido.
//
// POR QUE happy-dom Y NO EL jsdom DEL RESTO DE LA SUITE
// Por lo mismo que `capas.test.tsx`: lo que este panel afirma son **colores que salen de un
// token**. Las dos ultimas lineas del arqueo se distinguen de las tres primeras porque van en
// `var(--ins-ok-tinta)` y su barra en ese mismo verde, y el criterio 4 esta escrito como
// ««cuadra» en #1F5B39». En jsdom lo unico afirmable seria que pone `var(--ins-ok-tinta)`, que
// es justo lo que la prueba NO quiere dar por bueno.
//
// LO QUE NO SE PUDO AFIRMAR AQUI, Y DONDE SE MIDIO
// El ancho de la barra se lee del atributo `style`, no del calculado: un `<span>` dentro de un
// `<button>` que nadie dispone no tiene ancho en pixeles en ningun emulador. Que `2.7%` se
// convierta de verdad en 6,8 px y `97.6%` en 245 px se midio en Chromium sobre la pagina
// servida, y esta anotado en el PR.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App";
import {
  ACTIVIDAD,
  BANDEJA,
  CIFRAS,
  COBERTURA,
  COLA,
  CUADRA,
  DESDE_DONDE_CUADRA,
  DETERMINACIONES,
  NODO_DE_MI_CAJA,
  NODOS,
  RECIBOS,
  SECCIONES,
} from "../src/datos";
import {
  anchoDeArqueo,
  CUANDO_DE_LA_BANDEJA,
  opacidadDeArqueo,
  PIE_DEL_ARQUEO,
  rotuloDeArqueo,
  TITULO_DE_LA_ACTIVIDAD,
  TITULO_DE_LA_BANDEJA,
  TITULO_DEL_ARQUEO,
  TURNO_DEL_ARQUEO,
  VER_LOS_RECIBOS,
} from "../src/pantallas/Panel";
import { textoDelMarcador } from "../src/marco/MarcadorDeSeccion";
import "../src/ds/global.css";

afterEach(cleanup);

/**
 * El hash es global del documento y `App` lo escribe al montarse: sin limpiarlo, una prueba que
 * deje «Cajas y arqueo» abierta hace que la siguiente arranque alli. Es lo que permite que
 * `--sequence.shuffle` no cambie el resultado.
 */
beforeEach(() => window.history.replaceState(null, "", window.location.pathname));

const AQUI = dirname(fileURLToPath(import.meta.url));
const PANTALLAS = join(AQUI, "..", "src", "pantallas");

const panel = () => document.querySelector("[data-seccion='panel']") as HTMLElement;
const raiz = () => document.querySelector("[data-ir]") as HTMLElement;
const dato = (nombre: string) => raiz().getAttribute(nombre) ?? "";

const cifra = (etiqueta: string) =>
  panel().querySelector(`[data-cifra="${etiqueta}"]`) as HTMLElement;
const pastilla = (etiqueta: string) => panel().querySelector(`[data-delta="${etiqueta}"]`);
const espera = (etiqueta: string) =>
  panel().querySelector(`[data-espera="${etiqueta}"]`) as HTMLElement;
const linea = (label: string) =>
  panel().querySelector(`[data-arqueo="${label}"]`) as HTMLElement;
const barra = (label: string) => panel().querySelector(`[data-barra="${label}"]`) as HTMLElement;
const rotulo = (label: string) => panel().querySelector(`[data-pct="${label}"]`) as HTMLElement;
const fila = (codigo: string) =>
  panel().querySelector(`[data-actividad="${codigo}"]`) as HTMLElement;

/** Abre una seccion propia desde el arbol, que es una de las cuatro puertas del marco. */
const abrirSeccion = (clave: string) =>
  fireEvent.click(document.querySelector(`[data-submodulo="${clave}"]`) as HTMLElement);

/**
 * Lo que las cuatro tarjetas dicen, escrito aqui a mano.
 *
 * Es una copia deliberada de `src/datos/panel.ts`: si fuera un bucle sobre `CIFRAS` la prueba
 * diria «las cifras son las cifras» y cambiar `27,693` por `27,690` seguiria en verde, que es
 * exactamente el criterio 1. Estas cuatro filas son la tabla del issue, transcritas.
 */
const LO_QUE_DICEN_LAS_CIFRAS = [
  ["Recaudado hoy", "S/ 27,693", "", "148 recibos entre las cuatro cajas del día."],
  ["Su caja — C-3", "S/ 9,419", "52 recibos", "Desde las 08:00. Turno mañana, sin cerrar."],
  ["Diferencia de arqueo", "S/ 0.00", "cuadra", "Lo contado coincide con lo registrado."],
  ["Cajas sin arquear", "2", "", "C-1 y C-2, de ayer. El cierre del día espera por ellas."],
] as const;

describe("criterio 1 · las cuatro cifras, una a una", () => {
  it("son cuatro y no una mas", () => {
    render(<App />);
    expect(panel().querySelectorAll("[data-cifra]")).toHaveLength(4);
    expect(CIFRAS).toHaveLength(4);
  });

  it.each(LO_QUE_DICEN_LAS_CIFRAS)(
    "«%s» vale %s, con delta «%s»",
    (etiqueta, valor, delta, nota) => {
      const dicha = CIFRAS.find((c) => c.etiqueta === etiqueta);
      expect(dicha, `no hay ninguna cifra «${etiqueta}»`).toBeDefined();
      expect(dicha?.valor).toBe(valor);
      expect(dicha?.delta).toBe(delta);
      expect(dicha?.nota).toBe(nota);

      // Y lo que se dibuja es eso mismo: un dato correcto que la pantalla no pinta no sirve.
      render(<App />);
      const texto = cifra(etiqueta).textContent ?? "";
      expect(texto).toContain(valor);
      expect(texto).toContain(nota);
    },
  );

  it("el orden es el del artboard", () => {
    render(<App />);
    const dibujadas = [...panel().querySelectorAll("[data-cifra]")].map((c) =>
      c.getAttribute("data-cifra"),
    );
    expect(dibujadas).toEqual(LO_QUE_DICEN_LAS_CIFRAS.map(([etiqueta]) => etiqueta));
  });
});

describe("criterio 2 · la pastilla del delta va solo donde la hay", () => {
  it("«Su caja — C-3» y «Diferencia de arqueo» la llevan; las otras dos no", () => {
    render(<App />);
    expect(pastilla("Su caja — C-3")?.textContent).toBe("52 recibos");
    expect(pastilla("Diferencia de arqueo")?.textContent).toBe(CUADRA);
    expect(pastilla("Recaudado hoy")).toBeNull();
    expect(pastilla("Cajas sin arquear")).toBeNull();
    // Dos de cuatro: sin este recuento, dibujarlas las cuatro pasaria las dos primeras lineas.
    expect(panel().querySelectorAll("[data-delta]")).toHaveLength(2);
  });

  it("va en el verde de la insignia `ok`, que es lo que la hace legible como «esto va bien»", () => {
    render(<App />);
    const verde = getComputedStyle(pastilla("Diferencia de arqueo") as HTMLElement);
    expect(verde.backgroundColor).toBe("#DCEFE3");
    expect(verde.color).toBe("#1F5B39");
  });
});

describe("criterio 3 · cada fila de «Lo que espera» abre su nodo de #cajas", () => {
  it("son tres, con su insignia, su titulo, su detalle y su cifra", () => {
    render(<App />);
    expect(panel().querySelectorAll("[data-espera]")).toHaveLength(3);
    for (const fila of BANDEJA) {
      const texto = espera(fila.etiqueta).textContent ?? "";
      expect(texto).toContain(fila.etiqueta);
      expect(texto).toContain(fila.titulo);
      expect(texto).toContain(fila.detalle);
      expect(texto).toContain(fila.cuantos);
    }
    expect(panel().textContent).toContain(TITULO_DE_LA_BANDEJA);
    expect(panel().textContent).toContain(CUANDO_DE_LA_BANDEJA);
  });

  /**
   * El criterio nombra el **titulo del nodo**, no su indice, y por eso se afirma asi.
   *
   * Las tres filas van a la misma seccion, de modo que comprobar solo que llevan a `#cajas`
   * dejaria pasar las tres permutaciones del indice: es la leccion 8 —elegir el caso que
   * separa las hipotesis— aplicada aqui.
   */
  it.each([
    ["Sin arquear", "C-1 — cerrada ayer sin arquear"],
    ["Sin conciliar", "Pendientes de conciliar"],
    ["Anulados", "Anulaciones del día"],
  ])("«%s» deja #cajas abierto en «%s»", (etiqueta, titulo) => {
    render(<App />);
    fireEvent.click(espera(etiqueta));

    expect(dato("data-ir")).toBe("territorio");
    expect(window.location.hash).toBe("#cajas");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Cajas y arqueo");

    const nodo = Number(dato("data-ir-nodo"));
    expect(NODOS[nodo]?.titulo).toBe(titulo);
  });

  it("las tres cifras son las mismas que la cola del arbol, y los tres nodos tambien", () => {
    // La bandeja y la cola son dos listas distintas del artboard con los mismos tres numeros.
    // Que se separen no rompe nada: solo hace que la misma pantalla diga dos cosas.
    expect(BANDEJA.map((b) => [b.cuantos, b.nodo])).toEqual(COLA.map((c) => [c.cuantos, c.nodo]));
  });
});

describe("criterio 4 · el arqueo en vivo se lee como una cuenta", () => {
  it("son cinco lineas, en el orden del artboard, y con su pie", () => {
    render(<App />);
    const dibujadas = [...panel().querySelectorAll("[data-arqueo]")].map((f) =>
      f.getAttribute("data-arqueo"),
    );
    expect(dibujadas).toEqual([
      "Fondo inicial",
      "Cobrado en efectivo",
      "Anulaciones",
      "Debe haber en caja",
      "Contado en el arqueo",
    ]);
    expect(panel().textContent).toContain(TITULO_DEL_ARQUEO);
    expect(panel().textContent).toContain(TURNO_DEL_ARQUEO);
    expect(panel().textContent).toContain(PIE_DEL_ARQUEO);
  });

  it.each([
    ["Fondo inicial", "3 %", "S/ 200.00"],
    ["Cobrado en efectivo", "98 %", "S/ 7,238.60"],
    ["Anulaciones", "0 %", "− S/ 18.19"],
  ])("«%s» dice %s, redondeado a entero, en gris", (label, pct, detalle) => {
    render(<App />);
    expect(rotulo(label).textContent).toBe(pct);
    expect(getComputedStyle(rotulo(label)).color).toBe("#5A6B78");
    expect(linea(label).textContent).toContain(detalle);
  });

  it.each(["Debe haber en caja", "Contado en el arqueo"])(
    "«%s» dice «cuadra» en #1F5B39, y NO un porcentaje",
    (label) => {
      render(<App />);
      expect(rotulo(label).textContent).toBe(CUADRA);
      expect(rotulo(label).textContent).not.toContain("%");
      expect(getComputedStyle(rotulo(label)).color).toBe("#1F5B39");
    },
  );

  it("`0,2 %` se redondea a `0 %` y no desaparece de la lista", () => {
    // El caso que separa «redondear» de «esconder lo pequeño»: la linea sigue estando, con su
    // importe, y lo que se redondea es solo el rotulo.
    expect(rotuloDeArqueo({ label: "x", porcentaje: 0.2, detalle: "" }, 0)).toBe("0 %");
    expect(anchoDeArqueo({ label: "x", porcentaje: 0.2, detalle: "" })).toBe("0.2%");
  });
});

describe("criterio 5 · la barra lleva un decimal, y el rotulo ninguno", () => {
  it("«Fondo inicial» mide 2.7% y «Cobrado en efectivo» 97.6%", () => {
    render(<App />);
    expect(barra("Fondo inicial").style.width).toBe("2.7%");
    expect(barra("Cobrado en efectivo").style.width).toBe("97.6%");
    // Y son dos formatos del mismo numero: el rotulo de esas mismas dos lineas va a entero.
    expect(rotulo("Fondo inicial").textContent).toBe("3 %");
    expect(rotulo("Cobrado en efectivo").textContent).toBe("98 %");
  });

  it("las tres primeras van en azul con opacidad creciente; las dos que cuadran, en verde", () => {
    render(<App />);
    for (const [i, c] of COBERTURA.entries()) {
      const pintada = getComputedStyle(barra(c.label));
      const cuadra = i >= DESDE_DONDE_CUADRA;
      expect(pintada.backgroundColor, c.label).toBe(cuadra ? "#1F5B39" : "#005284");
      expect(pintada.opacity, c.label).toBe(String(cuadra ? 1 : 0.5 + i * 0.2));
    }
    expect([0, 1, 2].map(opacidadDeArqueo)).toEqual([0.5, 0.7, 0.9]);
    expect([3, 4].map(opacidadDeArqueo)).toEqual([1, 1]);
  });

  it("cualquier linea abre la caja propia, que es de la que el arqueo habla", () => {
    render(<App />);
    fireEvent.click(linea("Anulaciones"));
    expect(dato("data-ir")).toBe("territorio");
    expect(dato("data-ir-nodo")).toBe(String(NODO_DE_MI_CAJA));
    expect(NODOS[NODO_DE_MI_CAJA]?.titulo).toBe("C-3 — su caja, abierta");
  });

  it("los cuatro importes son los de la tabla de C-3, que es la misma caja", () => {
    // El panel y `#cajas` cuentan el mismo arqueo. Si uno de los dos cambia una cifra, la
    // ventanilla ensena dos totales distintos del mismo cajon.
    const filas = DETERMINACIONES[0]?.filas ?? [];
    const importeDe = (concepto: string) => filas.find((f) => f[1] === concepto)?.[3];
    expect(COBERTURA[0]?.detalle).toContain(importeDe("Fondo inicial del turno") ?? "");
    expect(COBERTURA[1]?.detalle).toContain(importeDe("Cobrado en efectivo") ?? "");
    expect(COBERTURA[2]?.detalle).toContain(importeDe("Anulaciones del turno") ?? "");
    expect(COBERTURA[3]?.detalle).toContain(importeDe("Debe haber en caja") ?? "");
    expect(COBERTURA[4]?.detalle).toContain(importeDe("Contado en caja") ?? "");
  });
});

describe("criterio 6 · «Actividad reciente» abre el recibo pulsado", () => {
  it("son cuatro filas, con su insignia, su codigo, su detalle y su hora", () => {
    render(<App />);
    expect(panel().querySelectorAll("[data-actividad]")).toHaveLength(4);
    for (const entrada of ACTIVIDAD) {
      const texto = fila(entrada.codigo).textContent ?? "";
      expect(texto).toContain(entrada.tipo);
      expect(texto).toContain(entrada.codigo);
      expect(texto).toContain(entrada.detalle);
      expect(texto).toContain(entrada.cuando);
    }
    expect(panel().textContent).toContain(TITULO_DE_LA_ACTIVIDAD);
  });

  /**
   * Las cuatro filas van a `#recibos`, asi que afirmar la seccion no distingue ninguna de las
   * otras tres: lo que se afirma es **el recibo concreto**. Es la leccion que dejo la paleta,
   * donde la 1ª y la 3ª entrada iban las dos a `predios`.
   */
  it.each(ACTIVIDAD.map((a) => [a.codigo] as const))(
    "pulsar %s deja #recibos con ese recibo elegido",
    (codigo) => {
      render(<App />);
      fireEvent.click(fila(codigo));
      expect(dato("data-ir")).toBe("predios");
      expect(window.location.hash).toBe("#recibos");
      expect(dato("data-ir-recibo")).toBe(codigo);
    },
  );

  it("los cuatro codigos son recibos que existen, con el estado que la fila anuncia", () => {
    // Lo que hace util al destino: el dia que `#recibos` dibuje la ficha, los cuatro la
    // encuentran. Un codigo que no estuviera en `RECIBOS` abriria una ficha vacia.
    for (const entrada of ACTIVIDAD) {
      const recibo = RECIBOS.find((r) => r.cod === entrada.codigo);
      expect(recibo, `${entrada.codigo} no esta en RECIBOS`).toBeDefined();
      expect(recibo?.estado).toBe(entrada.tipo);
      expect(recibo?.tono).toBe(entrada.tono);
    }
  });

  it("«Ver los recibos del turno» abre la lista SIN ninguna seleccion", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: VER_LOS_RECIBOS }));
    expect(dato("data-ir")).toBe("predios");
    expect(dato("data-ir-recibo")).toBe("");
    expect(dato("data-ir-chip")).toBe("");
  });

  it("y despues de abrir un recibo, ese boton lo deselecciona", () => {
    // El caso que separa «abre la lista» de «no toca nada»: sin esto, un boton que no hiciera
    // nada pasaria la prueba de arriba, porque el destino ya nace vacio.
    render(<App />);
    fireEvent.click(fila("0003-0041180"));
    expect(dato("data-ir-recibo")).toBe("0003-0041180");
    abrirSeccion("panel");
    fireEvent.click(screen.getByRole("button", { name: VER_LOS_RECIBOS }));
    expect(dato("data-ir-recibo")).toBe("");
  });
});

describe("criterio 7 · ninguna cifra esta escrita en la pantalla", () => {
  const fuentes = readdirSync(PANTALLAS)
    .filter((n) => /\.tsx?$/.test(n))
    .map((n) => [n, readFileSync(join(PANTALLAS, n), "utf8")] as const);

  it("hay algo que escanear", () => {
    // Sin esto, borrar `src/pantallas` dejaria las dos pruebas de abajo en verde sobre nada.
    expect(fuentes.map(([n]) => n)).toContain("Panel.tsx");
  });

  it("`27,693` y `7,420.41` no aparecen en `src/pantallas`, y si en `src/datos`", () => {
    for (const [nombre, codigo] of fuentes) {
      expect(codigo, nombre).not.toContain("27,693");
      expect(codigo, nombre).not.toContain("7,420.41");
    }
    // La otra mitad del criterio: que no esten alli porque estan **en los datos**, no porque
    // hayan dejado de existir. Se afirma sobre los valores y no sobre el texto de `panel.ts`:
    // ese archivo nombra las dos cifras en sus comentarios, asi que un `toContain` sobre su
    // fuente seguiria en verde con la tarjeta borrada.
    expect(CIFRAS.map((c) => c.valor)).toContain("S/ 27,693");
    expect(COBERTURA.map((c) => c.detalle)).toContain("S/ 7,420.41");
  });

  /**
   * Lo que se busca, y las dos veces que hubo que acotarlo **porque salio rojo por su cuenta**.
   *
   * El criterio nombra dos cifras; la regla es que no haya ninguna. Se busca sobre el codigo
   * **sin comentarios** y no sobre el archivo entero: la primera version encontro
   * «Anulaciones» dentro de un comentario que explica por que la barra no se redondea, y una
   * prueba que prohibe nombrar en prosa lo que el codigo hace es una prueba que se acaba
   * apagando.
   *
   * Y se miran los textos con **un digito o un espacio** dentro. Sin eso, «cuadra» casa con la
   * variable local `cuadra` de cada linea del arqueo —un identificador, no un dato pintado— y
   * `'2'` casaria con cualquier `padding: 2px`. Lo que queda es lo que de verdad delataria una
   * cifra escrita a mano: `S/ 27,693`, `0003-0041184`, `hace 12 min`, `Fondo inicial`.
   */
  const sinComentarios = (codigo: string) =>
    codigo.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("ni ninguna otra cifra ni ningun otro texto de los datos del panel", () => {
    const literales = [
      ...CIFRAS.flatMap((c) => [c.valor, c.nota, c.delta]),
      ...BANDEJA.flatMap((b) => [b.titulo, b.detalle, b.cuantos]),
      ...COBERTURA.flatMap((c) => [c.label, c.detalle]),
      ...ACTIVIDAD.flatMap((a) => [a.codigo, a.detalle, a.cuando]),
    ].filter((texto) => texto.length >= 3 && /[\d ]/.test(texto));

    // Que la lista no se quede vacia es parte de lo que se afirma: con cero literales, este
    // escaner recorreria `src/pantallas` sin poder senalar nada, en verde.
    expect(literales.length).toBeGreaterThan(20);

    const colados = fuentes.flatMap(([nombre, codigo]) =>
      literales
        .filter((texto) => sinComentarios(codigo).includes(texto))
        .map((texto) => `${nombre}: ${texto}`),
    );
    expect(colados).toEqual([]);
  });
});

describe("el panel es lo que `#panel` dibuja, y solo `#panel`", () => {
  it("al arrancar, sin pasarle ninguna pantalla a `App`", () => {
    render(<App />);
    expect(panel()).not.toBeNull();
    expect(panel().textContent).toContain(TITULO_DE_LA_BANDEJA);
  });

  it.each(SECCIONES.filter((s) => s.clave !== "panel").map((s) => [s.clave, s.label] as const))(
    "y `%s` sigue en el marcador, sin nada del panel",
    (clave, label) => {
      render(<App />);
      abrirSeccion(clave);
      expect(panel()).toBeNull();
      expect(screen.getByText(textoDelMarcador(label))).toBeDefined();
    },
  );

  it("las doce filas llevan la clase del `style-hover`, y la regla existe", () => {
    // El `style-hover` del artboard, que `PORTAR.md` traduce a una clase porque un estilo en
    // linea no puede expresar `:hover`. Aqui se afirman **las dos mitades**: que la clase esta
    // puesta en las doce filas y que la regla que la pinta existe; con una sola, la otra mitad
    // se puede borrar sin que nada se ponga rojo.
    //
    // Lo que esto NO afirma es que el navegador la aplique: ningun emulador de DOM evalua
    // `:hover`. Eso se midio en Chromium sobre la pagina servida —el fondo pasa de
    // `rgba(0, 0, 0, 0)` a `rgb(247, 251, 254)` al poner el raton encima— y esta en el PR.
    render(<App />);
    const filas = panel().querySelectorAll("[data-espera], [data-arqueo], [data-actividad]");
    expect(filas).toHaveLength(12);
    for (const f of filas) expect(f.className, f.textContent ?? "").toBe("hov-fila");

    const css = readFileSync(join(AQUI, "..", "src", "ds", "global.css"), "utf8");
    expect(css).toContain(".hov-fila:hover { background: var(--sup) !important }");
  });
});
