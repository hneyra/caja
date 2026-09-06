// @vitest-environment happy-dom
//
// La barra global, medida.
//
// POR QUE happy-dom Y NO EL jsdom DEL RESTO DE LA SUITE
// Por las dos cosas que esta barra necesita y jsdom no da, **medidas y no supuestas** (las dos
// sondas estan al final de este archivo, contra un jsdom levantado aqui mismo):
//
//   1. **`var()`**. La barra se pinta con los tokens de `src/ds/`, como manda el encargo. jsdom
//      devuelve el texto del token en vez del color, asi que «el fondo es #00365A» seria
//      incomprobable: lo unico que se podria afirmar es que pone `var(--azul-osc)`, que es
//      exactamente lo que la prueba NO quiere dar por bueno.
//   2. **`@media`**. jsdom no evalua `(max-width: 760px)`: a 700 px de ancho sigue devolviendo
//      `block` para `[data-sm-hide]`. Una prueba del criterio 6 escrita en jsdom saldria verde
//      con el corte responsive borrado.
//
// LA TRAMPA DE LA MEMOIZACION
// El entorno memoriza el estilo calculado de cada elemento, y `setViewport` **no** invalida esa
// memoria: leer a 1200 px y volver a leer el mismo elemento a 700 px devuelve lo de antes. Lo
// que si la invalida es tocar el DOM. Por eso cada prueba de ancho fija el ancho ANTES de
// dibujar, nunca despues, y `ancho()` no devuelve nada que se pueda leer antes de tiempo.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { AVISO, EJERCICIOS, SESION } from "../src/datos";
// Con `css: true` lo resuelve Vite siguiendo la cadena real de `@import`: lo que se mide es el
// mismo CSS que se despliega, no una copia escrita aqui al lado.
import "../src/ds/global.css";

declare global {
  interface Window {
    /** El mando del entorno. Si falta, las pruebas de ancho fallan en vez de saltarse. */
    readonly happyDOM: { setViewport(opciones: { width: number; height?: number }): void };
  }
}

/** El ancho de partida de cada prueba: por encima del corte de 760 px. */
const ANCHO = 1200;

/** Fija el ancho de la ventana. Se llama SIEMPRE antes de dibujar. Ver la nota de arriba. */
const ancho = (px: number) => window.happyDOM.setViewport({ width: px, height: 900 });

const barra = () => screen.getByRole("banner");
const hamburguesa = () => screen.getByRole("button", { name: "Mostrar u ocultar los módulos" });
const campana = () => screen.queryByRole("button", { name: AVISO.rotulo });
const selectorDeEjercicio = () => screen.getByRole("combobox", { name: "Ejercicio de trabajo" });

beforeEach(() => ancho(ANCHO));
afterEach(cleanup);

describe("la barra mide lo que el artboard dice", () => {
  it("52 px de alto", () => {
    render(<App />);
    expect(getComputedStyle(barra()).height).toBe("52px");
  });

  it("y el fondo es #00365A, resuelto desde el token y no escrito a mano", () => {
    // Esto es lo que hace que la prueba valga: si `--azul-osc` cambiara de valor en
    // `tokens/colores.css`, o si la cadena `global.css` → `tokens/` se rompiera, el color
    // llegaria aqui distinto o sin resolver, y la asercion lo dice.
    render(<App />);
    expect(getComputedStyle(barra()).backgroundColor).toBe("#00365A");
  });
});

describe("la hamburguesa", () => {
  /**
   * Desde el issue del arbol, la aplicacion arranca con los modulos **desplegados**, que es lo
   * que dice el artboard (`secOpen: true`, linea 1219). Estas dos pruebas afirmaban lo contrario
   * y cambiaron con el: mientras no hubo arbol, un `aria-expanded="true"` sobre una region que
   * no existe era algo que un lector de pantalla anunciaba. Que el arbol **este** cuando lo dice
   * lo comprueba `arbol.test.tsx`; aqui se mide el boton.
   */
  it("empieza desplegada, y lo dice", () => {
    render(<App />);
    expect(hamburguesa().getAttribute("aria-expanded")).toBe("true");
    expect(hamburguesa().getAttribute("title")).toBe("Ocultar los módulos");
  });

  it("alterna `aria-expanded` y el `title` a la vez", () => {
    render(<App />);
    fireEvent.click(hamburguesa());
    expect(hamburguesa().getAttribute("aria-expanded")).toBe("false");
    expect(hamburguesa().getAttribute("title")).toBe("Mostrar los módulos");

    fireEvent.click(hamburguesa());
    expect(hamburguesa().getAttribute("aria-expanded")).toBe("true");
    expect(hamburguesa().getAttribute("title")).toBe("Ocultar los módulos");
  });
});

describe("el escudo y la entidad", () => {
  it("el escudo cuelga del prefijo con el que la aplicacion esta servida", () => {
    // Que esa ruta la SIRVA alguien, y con un PNG de verdad, lo mide `escudo-servido.test.ts`
    // contra un servidor de Vite levantado en la prueba. Aqui solo se mira que se pida, y de
    // donde sale la parte de delante.
    render(<App />);
    const src = screen.getByAltText("Escudo de la municipalidad").getAttribute("src");

    // La mitad que dice de donde sale: del `base` de Vite y no de un literal. Vitest lee el
    // mismo `vite.config.ts` que se despliega, asi que `import.meta.env.BASE_URL` vale aqui lo
    // que valdra alli — medido: sin declarar `base` daba `"/"`, con `base: "/caja/"` da
    // `"/caja/"`.
    expect(src).toBe(`${import.meta.env.BASE_URL}escudo-catacaos.png`);

    // Y la mitad que la anterior no puede dar, porque se cumpliria sola con cualquier base: que
    // el prefijo es el del despliegue. Un `src="/caja/escudo-catacaos.png"` escrito a mano
    // pasaria las dos —y por eso existe el tercer angulo, el escaner de
    // `rutas-absolutas.test.ts`, que marca esa forma tambien—.
    expect(src).toBe("/caja/escudo-catacaos.png");
  });

  it("la entidad por omision es la del despliegue piloto", () => {
    render(<App />);
    expect(screen.getAllByText("Municipalidad Distrital de Catacaos").length).toBeGreaterThan(0);
  });
});

describe("el ejercicio y su toast", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("ofrece los cuatro anios del artboard, en su orden", () => {
    render(<App />);
    const opciones = screen.getAllByRole("option").map((o) => o.textContent);
    expect(opciones).toEqual([...EJERCICIOS]);
  });

  it("cambiarlo a 2025 saca el toast, y a los 3 400 ms el toast se va", () => {
    render(<App />);
    expect(screen.queryByRole("status")).toBeNull();

    fireEvent.change(selectorDeEjercicio(), { target: { value: "2025" } });

    // El texto se transcribe aqui a mano desde el diseno, no se importa de `App`: importandolo,
    // la prueba diria «el toast dice lo que App dice que dice», que no es una afirmacion.
    expect(screen.getByRole("status").textContent).toBe(
      "Ejercicio 2025: la multa se calcula con la UIT de ese año.",
    );

    // Un milisegundo antes sigue ahi: sin esta mitad, la prueba pasaria con el toast retirado
    // en cualquier momento anterior, incluido «nunca se llego a ver».
    //
    // El `act` no es adorno: sin el, mover el reloj dispara el `setState` pero React no vuelve
    // a dibujar antes de la asercion, y la prueba dice «sigue ahi» sobre un DOM viejo. Medido:
    // asi escrita, la ultima linea fallaba con el toast entero delante.
    act(() => vi.advanceTimersByTime(3399));
    expect(screen.queryByRole("status")).not.toBeNull();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("y el selector se queda en el ejercicio elegido", () => {
    render(<App />);
    fireEvent.change(selectorDeEjercicio(), { target: { value: "2023" } });
    expect((selectorDeEjercicio() as HTMLSelectElement).value).toBe("2023");
  });
});

describe("el aviso del sistema", () => {
  const banda = () => screen.queryByText(AVISO.texto);

  it("la campana lleva su contador y no hay banda desplegada", () => {
    render(<App />);
    expect(campana()?.textContent).toBe(AVISO.cuantos);
    expect(banda()).toBeNull();
  });

  it("pulsarla despliega la banda con el texto de la linea 431", () => {
    render(<App />);
    fireEvent.click(campana() as HTMLElement);
    expect(banda()).not.toBeNull();
    // El artboard retira la campana en cuanto el aviso se despliega (`aviso: s.aviso &&
    // !s.avisoAbierto`, linea 1807). No es un efecto de descartarlo: es de abrirlo.
    expect(campana()).toBeNull();
  });

  it("descartarla deja sin banda y sin campana", () => {
    render(<App />);
    fireEvent.click(campana() as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: "Descartar el aviso" }));
    expect(banda()).toBeNull();
    expect(campana()).toBeNull();
  });
});

describe("bajo 760 px se esconde lo que el artboard esconde", () => {
  const subtitulo = () => screen.getByText("Sistema de gestión tributaria municipal");
  const rotuloDeEjercicio = () => screen.getByText("Ejercicio");

  it("a 1200 px se ven los dos", () => {
    ancho(1200);
    render(<App />);
    expect(getComputedStyle(subtitulo()).display).toBe("block");
    expect(getComputedStyle(rotuloDeEjercicio()).display).not.toBe("none");
  });

  it("a 700 px no se ve ninguno", () => {
    ancho(700);
    render(<App />);
    expect(getComputedStyle(subtitulo()).display).toBe("none");
    expect(getComputedStyle(rotuloDeEjercicio()).display).toBe("none");
  });

  it("a 760 px justos tampoco: el corte es `max-width`, o sea inclusivo", () => {
    ancho(760);
    render(<App />);
    expect(getComputedStyle(subtitulo()).display).toBe("none");
  });

  it("y la entidad se sigue viendo: lo que desaparece es el subtitulo", () => {
    // Sin esto, esconder la cabecera entera pasaria las tres pruebas de arriba.
    ancho(700);
    render(<App />);
    // El nombre y el puesto del cajero cuelgan del mismo `data-sm-hide`, asi que lo que se
    // apaga es su envoltorio y no cada linea.
    const ficha = screen.getByText(SESION.nombre).parentElement as HTMLElement;
    expect(getComputedStyle(ficha).display).toBe("none");
    expect(getComputedStyle(screen.getByText("Municipalidad Distrital de Catacaos")).display).toBe(
      "block",
    );
  });
});

/** Muy por encima de los 3 400 ms del toast: si algo quedo vivo, aqui dispara. */
const MILISEGUNDOS_DE_SOBRA = 10_000;

describe("ningun temporizador sobrevive al desmontaje", () => {
  /**
   * Lo que se cuenta son los temporizadores, y no los avisos de React. Medido.
   *
   * El criterio 7 del issue pide que desmontar y mover el reloj «no produzca ninguna
   * actualizacion de estado **ni aviso de React**». Aqui hubo una asercion sobre `console.error`
   * y **se quito**, porque no podia fallar: con la limpieza del `useEffect` quitada a proposito,
   * el temporizador vivo salio rojo y el espia de `console.error` siguio en verde. React 18
   * retiro aquel «Can't perform a React state update on an unmounted component», y React 19
   * —el de este repositorio— tampoco lo emite: la actualizacion sobre un componente desmontado
   * se ignora en silencio. Una asercion sobre un aviso que ya no existe es un comentario
   * disfrazado de verificacion, y de esas ya hubo una en `foco.test.ts`.
   *
   * Contar el reloj es lo unico que distingue el caso bueno del malo, asi que es lo que se hace.
   */
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("desmontar cancela el reloj del toast", () => {
    const { unmount } = render(<App />);

    // Primero se comprueba que el reloj existe. Sin esta linea, un componente que no pusiera
    // ningun temporizador pasaria la prueba de abajo con las manos en los bolsillos.
    fireEvent.change(selectorDeEjercicio(), { target: { value: "2024" } });
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("y mover el reloj despues no vuelve a poner ninguno", () => {
    const { unmount } = render(<App />);
    fireEvent.change(selectorDeEjercicio(), { target: { value: "2024" } });
    unmount();
    act(() => vi.advanceTimersByTime(MILISEGUNDOS_DE_SOBRA));
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("los botones que abren lo que todavia no existe", () => {
  it("la lupa dice como se llama su atajo y enciende el estado de la paleta", () => {
    const { container } = render(<App />);
    const raiz = container.firstElementChild as HTMLElement;
    expect(raiz.getAttribute("data-paleta")).toBe("cerrada");

    const lupa = screen.getByRole("button", { name: "Buscar" });
    expect(lupa.getAttribute("title")).toBe("Buscar — Ctrl K");

    fireEvent.click(lupa);
    expect(raiz.getAttribute("data-paleta")).toBe("abierta");
  });

  it("el lanzador dibuja los nueve puntos en `6 + n*6` y alterna `aria-expanded`", () => {
    render(<App />);
    const lanzador = screen.getByRole("button", { name: "Ver todos los módulos" });
    const puntos = [...lanzador.querySelectorAll("circle")].map((c) => [
      c.getAttribute("cx"),
      c.getAttribute("cy"),
      c.getAttribute("r"),
    ]);
    expect(puntos).toEqual([
      ["6", "6", "1.9"],
      ["12", "6", "1.9"],
      ["18", "6", "1.9"],
      ["6", "12", "1.9"],
      ["12", "12", "1.9"],
      ["18", "12", "1.9"],
      ["6", "18", "1.9"],
      ["12", "18", "1.9"],
      ["18", "18", "1.9"],
    ]);

    expect(lanzador.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(lanzador);
    expect(lanzador.getAttribute("aria-expanded")).toBe("true");
  });

  it("la ficha de sesion gira su chevron 180 grados al abrirse", () => {
    render(<App />);
    const ficha = screen.getByRole("button", { name: `Sesión de ${SESION.nombre}` });
    const chevron = () => ficha.querySelector("svg")?.parentElement as HTMLElement;

    expect(ficha.getAttribute("aria-expanded")).toBe("false");
    expect(chevron().style.transform).toBe("rotate(0deg)");

    fireEvent.click(ficha);
    expect(ficha.getAttribute("aria-expanded")).toBe("true");
    expect(chevron().style.transform).toBe("rotate(180deg)");
  });

  it("abrir el lanzador cierra la paleta, como en el artboard", () => {
    // Linea 1710: `abrirLanzador` apaga `pal`. Sin ella, dos capas se dibujarian a la vez el
    // dia que la paleta tenga contenido, y eso no se descubre hasta ese dia.
    const { container } = render(<App />);
    const raiz = container.firstElementChild as HTMLElement;
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    expect(raiz.getAttribute("data-paleta")).toBe("abierta");

    fireEvent.click(screen.getByRole("button", { name: "Ver todos los módulos" }));
    expect(raiz.getAttribute("data-paleta")).toBe("cerrada");
  });
});

describe("por que este archivo no usa el jsdom del resto de la suite", () => {
  /**
   * Las dos diferencias, medidas sobre un jsdom levantado aqui mismo. El dia que jsdom haga las
   * dos cosas, estas pruebas se pondran rojas y la excepcion de entorno sobrara: eso es
   * exactamente lo que se quiere que pase, y por eso no son un comentario.
   */
  const conJsdom = (px: number) => {
    const hoja =
      ":root { --azul-osc: #00365A }" +
      " header { height: 52px; background: var(--azul-osc) }" +
      " [data-sm-hide] { display: block }" +
      " @media (max-width: 760px) { [data-sm-hide] { display: none !important } }";
    const { window: v } = new JSDOM(
      `<!doctype html><html><head><style>${hoja}</style></head>` +
        `<body><header><span data-sm-hide="1">x</span></header></body></html>`,
      { pretendToBeVisual: true },
    );
    Object.defineProperty(v, "innerWidth", { value: px, configurable: true });
    const cabecera = v.document.querySelector("header") as HTMLElement;
    const oculto = v.document.querySelector("[data-sm-hide]") as HTMLElement;
    return {
      fondo: v.getComputedStyle(cabecera).backgroundColor,
      subtitulo: v.getComputedStyle(oculto).display,
    };
  };

  it("jsdom NO resuelve `var()` en el fondo", () => {
    expect(conJsdom(1200).fondo).not.toBe("#00365A");
  });

  it("jsdom NO evalua `@media (max-width: 760px)`", () => {
    expect(conJsdom(700).subtitulo).toBe("block");
  });

  it("happy-dom si hace las dos", () => {
    ancho(700);
    render(<App />);
    expect(getComputedStyle(barra()).backgroundColor).toBe("#00365A");
    expect(
      getComputedStyle(screen.getByText("Sistema de gestión tributaria municipal")).display,
    ).toBe("none");
  });
});
