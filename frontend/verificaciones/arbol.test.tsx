// @vitest-environment happy-dom
//
// El arbol de modulos, medido.
//
// POR QUE happy-dom Y NO EL jsdom DEL RESTO DE LA SUITE
// Por lo mismo que `barra.test.tsx`, y aqui pesa mas todavia: **el arbol se pinta entero con
// `var(--token)`**. El realce del modulo desplegado es `var(--azul-suave)` y la linea de la
// sangria es `var(--linea-2)`; jsdom devuelve el texto del token en vez del color, asi que «el
// modulo desplegado esta realzado» seria incomprobable — lo unico afirmable seria que pone
// `var(--azul-suave)`, que es justo lo que la prueba NO quiere dar por bueno.
//
// LO QUE SE MIRA POR EL NOMBRE ACCESIBLE Y LO QUE POR `data-`
// La pastilla de pestanas abiertas se comprueba **por el nombre accesible del boton**
// —«Tesorería 2» frente a «Tesorería»—, que es la unica forma de afirmar a la vez que la cifra
// esta y que alguien que no ve la pantalla la oye. Para el resto se usan `data-modulo` y
// `data-submodulo`, porque un boton cuyo nombre cambia con el estado no sirve para encontrarlo.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { ArbolDeModulos, recuentoDelFiltro } from "../src/arbol/ArbolDeModulos";
import { ARBOL, COLA, MI_MODULO, NODOS } from "../src/datos";
import "../src/ds/global.css";

afterEach(cleanup);

const arbol = () => screen.getByRole("complementary", { name: "Módulos y submódulos" });

const modulo = (nombre: string) =>
  arbol().querySelector(`[data-modulo="${nombre}"]`) as HTMLElement;

const modulosVisibles = () => [...arbol().querySelectorAll("[data-modulo]")] as HTMLElement[];

const submodulosVisibles = () =>
  [...arbol().querySelectorAll("[data-submodulo]")] as HTMLElement[];

const campoDeFiltro = () => screen.getByLabelText("Filtrar módulos y submódulos");

const filtrar = (texto: string) => fireEvent.change(campoDeFiltro(), { target: { value: texto } });

/** El chevron es el ultimo hijo del boton del modulo: es lo que gira. */
const chevron = (nombre: string) => modulo(nombre).lastElementChild as HTMLElement;

/** Deja el modulo desplegado, venga como venga. Tesoreria arranca abierto y los demas cerrados. */
function desplegar(nombre: string) {
  const boton = modulo(nombre);
  if (boton.getAttribute("aria-expanded") === "false") fireEvent.click(boton);
}

describe("criterio 1 · el panel mide 252 px y trae los doce modulos con sus cuatro submodulos", () => {
  it("252 px de ancho", () => {
    render(<App />);
    expect(getComputedStyle(arbol()).width).toBe("252px");
  });

  it("son doce modulos, y en el orden del artboard", () => {
    render(<App />);
    expect(modulosVisibles().map((b) => b.getAttribute("data-modulo"))).toEqual(
      ARBOL.map((rama) => rama.modulo),
    );
  });

  it("y cada uno de los doce ensena cuatro submodulos, los suyos", () => {
    // Se despliegan los doce uno a uno en vez de contar `ARBOL`: contar el dato diria que el
    // dato esta bien, no que la pantalla lo dibuje. Lo que aqui se mide son los botones.
    render(<App />);
    for (const rama of ARBOL) {
      desplegar(rama.modulo);
      expect(submodulosVisibles().map((b) => b.getAttribute("data-submodulo"))).toEqual(
        rama.submodulos.map((h) => h.clave),
      );
    }
  });
});

describe("criterio 2 · solo uno desplegado a la vez, y al arrancar el propio", () => {
  it("al arrancar esta desplegado Tesorería y los otros once cerrados", () => {
    render(<App />);
    expect(MI_MODULO).toBe("Tesorería");
    const desplegados = modulosVisibles().filter(
      (b) => b.getAttribute("aria-expanded") === "true",
    );
    expect(desplegados.map((b) => b.getAttribute("data-modulo"))).toEqual(["Tesorería"]);
  });

  it("pulsar el desplegado lo cierra, y no deja ningun submodulo", () => {
    render(<App />);
    fireEvent.click(modulo("Tesorería"));
    expect(modulo("Tesorería").getAttribute("aria-expanded")).toBe("false");
    expect(submodulosVisibles()).toHaveLength(0);
  });

  it("pulsar Catastro cierra Tesorería y abre Catastro", () => {
    render(<App />);
    fireEvent.click(modulo("Catastro"));
    expect(modulo("Tesorería").getAttribute("aria-expanded")).toBe("false");
    expect(modulo("Catastro").getAttribute("aria-expanded")).toBe("true");
    expect(submodulosVisibles().map((b) => b.getAttribute("data-submodulo"))).toEqual([
      "cat-panel",
      "cat-pred",
      "cat-terr",
      "cat-val",
    ]);
  });

  it("el desplegado va realzado con `--azul-suave` y los cerrados sin fondo", () => {
    // Que el token llegue al elemento, y no solo que este escrito: `#E4F4FD` sale de resolver
    // `var(--azul-suave)` contra `tokens/colores.css`.
    render(<App />);
    expect(getComputedStyle(modulo("Tesorería")).backgroundColor).toBe("#E4F4FD");
    expect(getComputedStyle(modulo("Catastro")).backgroundColor).toBe("transparent");
  });
});

describe("criterio 3 · el chevron dice si esta abierto", () => {
  it("180 grados el desplegado, 0 los cerrados", () => {
    render(<App />);
    expect(chevron("Tesorería").style.transform).toBe("rotate(180deg)");
    expect(chevron("Catastro").style.transform).toBe("rotate(0deg)");

    fireEvent.click(modulo("Catastro"));
    expect(chevron("Tesorería").style.transform).toBe("rotate(0deg)");
    expect(chevron("Catastro").style.transform).toBe("rotate(180deg)");
  });
});

describe("criterio 4 · el filtro casa contra el modulo y contra sus submodulos", () => {
  it("«recibo» deja un modulo con un submodulo, y el recuento va en singular", () => {
    render(<App />);
    filtrar("recibo");
    expect(modulosVisibles().map((b) => b.getAttribute("data-modulo"))).toEqual(["Tesorería"]);
    expect(submodulosVisibles().map((b) => b.getAttribute("data-submodulo"))).toEqual(["predios"]);
    expect(within(arbol()).getByText("1 módulo · 1 submódulo")).not.toBeNull();
  });

  it("«panel» deja doce modulos y doce submodulos: uno de cada", () => {
    render(<App />);
    filtrar("panel");
    expect(modulosVisibles()).toHaveLength(12);
    expect(submodulosVisibles()).toHaveLength(12);
    expect(within(arbol()).getByText("12 módulos · 12 submódulos")).not.toBeNull();
  });

  it("si casa el nombre del modulo se ven sus CUATRO submodulos, no solo los que casan", () => {
    // Es la regla de las lineas 1578-1580, y es la que hace que el recuento sume `4` en vez de
    // `casan`. «tesor» no casa con ningun submodulo y aun asi salen los cuatro.
    render(<App />);
    filtrar("tesor");
    expect(modulosVisibles().map((b) => b.getAttribute("data-modulo"))).toEqual(["Tesorería"]);
    expect(submodulosVisibles()).toHaveLength(4);
    expect(within(arbol()).getByText("1 módulo · 4 submódulos")).not.toBeNull();
  });

  it("con filtro puesto quedan desplegados TODOS los que casan, no solo el que estaba", () => {
    render(<App />);
    filtrar("panel");
    expect(
      modulosVisibles().every((b) => b.getAttribute("aria-expanded") === "true"),
    ).toBe(true);
  });

  it("el filtro no distingue mayusculas ni espacios de sobra", () => {
    render(<App />);
    filtrar("  RECIBO  ");
    expect(modulosVisibles()).toHaveLength(1);
    expect(within(arbol()).getByText("1 módulo · 1 submódulo")).not.toBeNull();
  });

  it("y sin filtro no hay recuento ninguno", () => {
    render(<App />);
    expect(within(arbol()).queryByText(/submódulos?$/)).toBeNull();
    expect(recuentoDelFiltro("")).toBe("");
  });
});

describe("criterio 5 · sin coincidencias no hay arbol, hay una frase", () => {
  const FRASE =
    "Ningún módulo ni submódulo se llama así. " +
    "Pruebe con «papeleta», «acta», «recibo» o «expediente».";

  it("«zzz» esconde el arbol y ensena el texto de la linea 310, literal", () => {
    // El texto se transcribe aqui a mano desde el diseno y no se importa del componente:
    // importandolo, la prueba diria «el mensaje dice lo que el componente dice que dice».
    render(<App />);
    filtrar("zzz");
    expect(modulosVisibles()).toHaveLength(0);
    expect(submodulosVisibles()).toHaveLength(0);
    expect(within(arbol()).getByText(FRASE)).not.toBeNull();
  });

  it("y el recuento de arriba dice «Sin coincidencias»", () => {
    render(<App />);
    filtrar("zzz");
    expect(within(arbol()).getByText("Sin coincidencias")).not.toBeNull();
  });

  it("la cola de trabajo sigue estando: no depende del filtro", () => {
    render(<App />);
    filtrar("zzz");
    expect(within(arbol()).getByText("Cola de trabajo")).not.toBeNull();
  });
});

describe("criterio 6 · el aspa de limpiar", () => {
  const aspa = () => screen.queryByRole("button", { name: "Quitar el filtro" });

  it("no esta sin filtro, y aparece en cuanto se teclea", () => {
    render(<App />);
    expect(aspa()).toBeNull();
    filtrar("recibo");
    expect(aspa()).not.toBeNull();
  });

  it("pulsarla devuelve el arbol entero y vacia el campo", () => {
    render(<App />);
    filtrar("recibo");
    fireEvent.click(aspa() as HTMLElement);
    expect((campoDeFiltro() as HTMLInputElement).value).toBe("");
    expect(aspa()).toBeNull();
    expect(modulosVisibles()).toHaveLength(12);
    // Y vuelve el estado de antes del filtro: solo Tesoreria desplegado.
    expect(
      modulosVisibles()
        .filter((b) => b.getAttribute("aria-expanded") === "true")
        .map((b) => b.getAttribute("data-modulo")),
    ).toEqual(["Tesorería"]);
  });

  it("un campo con solo espacios no cuenta como filtro", () => {
    render(<App />);
    filtrar("   ");
    expect(aspa()).toBeNull();
    expect(modulosVisibles()).toHaveLength(12);
  });
});

describe("criterio 7 · la pastilla cuenta las pestanas abiertas del modulo", () => {
  const arbolCon = (abiertas: readonly string[]) =>
    render(<ArbolDeModulos abiertas={abiertas} activa={null} alIr={() => {}} />);

  it("con dos submodulos de Tesorería abiertos, su boton se llama «Tesorería 2»", () => {
    // Por el nombre accesible: la cifra tiene que estar DENTRO del boton para que quien no ve
    // la pantalla se entere de que ese modulo tiene dos cosas abiertas.
    arbolCon(["panel", "predios"]);
    expect(screen.getByRole("button", { name: "Tesorería 2" })).not.toBeNull();
  });

  it("con ninguno abierto no hay pastilla: el boton se llama «Tesorería» a secas", () => {
    // Un `0` en una pastilla se lee como una cifra que importa. El artboard no lo dibuja.
    arbolCon([]);
    expect(screen.getByRole("button", { name: "Tesorería" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: /^Tesorería \d/ })).toBeNull();
  });

  it("cuenta las suyas y no las de otro modulo", () => {
    // `cat-panel` es de Catastro. Si la cuenta fuera sobre `abiertas` sin mirar de quien son,
    // Tesoreria diria 2 y Catastro 0, que es exactamente al reves de lo que pasa.
    arbolCon(["panel", "cat-panel"]);
    expect(screen.getByRole("button", { name: "Tesorería 1" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Catastro 1" })).not.toBeNull();
  });
});

describe("criterio 8 · el conmutador del experimento no se porto", () => {
  const AQUI = dirname(fileURLToPath(import.meta.url));

  it("`panelVar`, `esB` y `esC` no aparecen en `src/`", () => {
    // El criterio lo pide como un `grep -rn` sobre `frontend/src`. Aqui se hace igual —por
    // subcadena y sin limites de palabra, como el grep—, sobre el arbol de archivos de verdad,
    // para que el dia que alguien porte la segunda variante salga rojo.
    const pendientes = [join(AQUI, "..", "src")];
    const encontrados: string[] = [];
    while (pendientes.length > 0) {
      const dir = pendientes.pop() as string;
      for (const entrada of readdirSync(dir, { withFileTypes: true })) {
        const ruta = join(dir, entrada.name);
        if (entrada.isDirectory()) pendientes.push(ruta);
        else if (/\.(ts|tsx|css)$/.test(entrada.name)) {
          const texto = readFileSync(ruta, "utf8");
          for (const prohibido of ["panelVar", "esB", "esC"]) {
            if (texto.includes(prohibido)) encontrados.push(`${ruta}: ${prohibido}`);
          }
        }
      }
    }
    expect(encontrados).toEqual([]);
  });
});

describe("la sangria de los submodulos", () => {
  it("va con su linea a la izquierda, resuelta desde `--linea-2`", () => {
    // AQUI NO SE PUEDE MEDIR EL GROSOR, Y ESTA MEDIDO POR QUE.
    // happy-dom **rompe** la abreviatura `border-left: 1px solid var(--linea-2)`: al guardarla
    // reparte el `var()` por las tres propiedades largas y tira el `1px solid`, de modo que el
    // atributo `style` acaba diciendo «border-left-width: var(--linea-2); border-left-style:
    // var(--linea-2); border-left-color: var(--linea-2)». El calculado, en consecuencia, da el
    // color bien y deja `borderLeftWidth` y `borderLeftStyle` vacios. Es un defecto del
    // emulador y no del port: el grosor se comprobo en un Chromium de verdad, y esta en la
    // fila del registro. Aqui se afirma lo que si es cierto, que es que el token llega.
    render(<App />);
    const bloque = submodulosVisibles()[0]?.parentElement as HTMLElement;
    const estilo = getComputedStyle(bloque);
    expect(estilo.borderLeftColor).toBe("#E3E9EE");
    expect(estilo.marginLeft).toBe("16px");
    expect(estilo.paddingLeft).toBe("15px");
  });
});

describe("el estado de cada submodulo", () => {
  it("el activo va marcado con `aria-current` y realzado", () => {
    render(
      <ArbolDeModulos abiertas={["panel", "predios"]} activa="panel" alIr={() => {}} />,
    );
    const activo = arbol().querySelector('[data-submodulo="panel"]') as HTMLElement;
    const otro = arbol().querySelector('[data-submodulo="predios"]') as HTMLElement;
    expect(activo.getAttribute("aria-current")).toBe("true");
    expect(otro.getAttribute("aria-current")).toBe("false");
    expect(getComputedStyle(activo).backgroundColor).toBe("#E4F4FD");
    expect(getComputedStyle(activo).fontWeight).toBe("700");
  });

  it("el abierto que no es el activo lleva la marca «abierta», y el activo no", () => {
    render(
      <ArbolDeModulos abiertas={["panel", "predios"]} activa="panel" alIr={() => {}} />,
    );
    const predios = arbol().querySelector('[data-submodulo="predios"]') as HTMLElement;
    const panel = arbol().querySelector('[data-submodulo="panel"]') as HTMLElement;
    expect(within(predios).getByText("abierta")).not.toBeNull();
    expect(within(panel).queryByText("abierta")).toBeNull();
  });

  it("el sucio lleva un ` *` pegado al rotulo, y solo el", () => {
    render(
      <ArbolDeModulos
        abiertas={["panel"]}
        activa="panel"
        sucias={{ predios: true }}
        alIr={() => {}}
      />,
    );
    const predios = arbol().querySelector('[data-submodulo="predios"]') as HTMLElement;
    const panel = arbol().querySelector('[data-submodulo="panel"]') as HTMLElement;
    expect(predios.textContent).toBe("Recibos *");
    expect(panel.textContent).toBe("Panel");
  });
});

describe("pulsar un submodulo llama al `alIr` inyectado, y nada mas", () => {
  it("con su clave, sin nodo", () => {
    const alIr = vi.fn();
    render(<ArbolDeModulos abiertas={[]} activa={null} alIr={alIr} />);
    fireEvent.click(arbol().querySelector('[data-submodulo="predios"]') as HTMLElement);
    expect(alIr.mock.calls).toEqual([["predios"]]);
  });

  it("y en la aplicacion no abre ninguna pestana: solo queda anotado el destino", () => {
    // El limite del issue: la barra de pestanas y el enrutado por hash son del siguiente.
    const { container } = render(<App />);
    const raiz = container.firstElementChild as HTMLElement;
    expect(raiz.getAttribute("data-ir")).toBe("");

    fireEvent.click(arbol().querySelector('[data-submodulo="territorio"]') as HTMLElement);
    expect(raiz.getAttribute("data-ir")).toBe("territorio");
    expect(raiz.getAttribute("data-ir-nodo")).toBe("");
    expect(window.location.hash).toBe("");
  });
});

describe("la cola de trabajo", () => {
  it("son las tres del artboard, con sus cifras y en su orden", () => {
    render(<App />);
    const cola = within(arbol()).getByText("Cola de trabajo").parentElement as HTMLElement;
    const botones = [...cola.querySelectorAll("button")];
    expect(botones.map((b) => b.textContent)).toEqual([
      "Cajas sin arquear2",
      "Sin conciliar11",
      "Anulaciones del día3",
    ]);
  });

  it("«Cajas sin arquear» lleva punto rojo y las otras dos ambar", () => {
    render(<App />);
    const cola = within(arbol()).getByText("Cola de trabajo").parentElement as HTMLElement;
    const puntos = [...cola.querySelectorAll("button > span:first-child")];
    expect(puntos.map((p) => getComputedStyle(p as HTMLElement).backgroundColor)).toEqual([
      "#C0492F",
      "#C08A00",
      "#C08A00",
    ]);
  });

  it("cada una lleva a su nodo de «Cajas y arqueo»", () => {
    const { container } = render(<App />);
    const raiz = container.firstElementChild as HTMLElement;
    const cola = within(arbol()).getByText("Cola de trabajo").parentElement as HTMLElement;
    const botones = [...cola.querySelectorAll("button")];

    for (const [i, entrada] of COLA.entries()) {
      fireEvent.click(botones[i] as HTMLElement);
      expect(raiz.getAttribute("data-ir")).toBe("territorio");
      expect(raiz.getAttribute("data-ir-nodo")).toBe(String(entrada.nodo));
    }
  });

  it("y ese nodo es el que su rotulo promete", () => {
    // Un indice que baila no rompe nada: abre otro panel. Por eso se comprueba contra `NODOS`.
    expect(NODOS[COLA[0]?.nodo ?? -1]?.titulo).toBe("C-1 — cerrada ayer sin arquear");
    expect(NODOS[COLA[1]?.nodo ?? -1]?.titulo).toBe("Pendientes de conciliar");
    expect(NODOS[COLA[2]?.nodo ?? -1]?.titulo).toBe("Anulaciones del día");
  });

  it("las cifras de la cola son las que el resumen de esos nodos dice", () => {
    // «Sin conciliar 11» contra «11 operaciones», y «Anulaciones del día 3» contra «3 recibos».
    // Si una de las dos se copio mal, la pantalla se contradice a si misma.
    expect(NODOS[COLA[1]?.nodo ?? -1]?.resumen).toBe(`${COLA[1]?.cuantos} operaciones`);
    expect(NODOS[COLA[2]?.nodo ?? -1]?.resumen).toBe(`${COLA[2]?.cuantos} recibos`);
  });
});

describe("el arbol arranca desplegado, que es la deuda que dejo la barra global", () => {
  it("la hamburguesa lo dice y la region existe", () => {
    render(<App />);
    const hamburguesa = screen.getByRole("button", { name: "Mostrar u ocultar los módulos" });
    expect(hamburguesa.getAttribute("aria-expanded")).toBe("true");
    expect(hamburguesa.getAttribute("title")).toBe("Ocultar los módulos");
    expect(arbol()).not.toBeNull();
  });

  it("y la hamburguesa lo esconde y lo devuelve", () => {
    render(<App />);
    const hamburguesa = screen.getByRole("button", { name: "Mostrar u ocultar los módulos" });
    fireEvent.click(hamburguesa);
    expect(screen.queryByRole("complementary", { name: "Módulos y submódulos" })).toBeNull();

    fireEvent.click(hamburguesa);
    expect(arbol()).not.toBeNull();
  });

  it("el arbol empuja el contenido en vez de taparlo", () => {
    // Lo dice el issue de la barra global. Lo que se puede medir aqui es la **estructura**: el
    // `<main>` y el `<aside>` son hermanos dentro de la misma caja flexible, y el arbol ocupa
    // en ella una pista propia de 252 px, o sea que le quita ancho al contenido en vez de
    // ponerse encima. Que ninguno sea `position: absolute` se afirma sobre la declaracion en
    // linea: happy-dom devuelve **cadena vacia** para `position` cuando nadie la declara
    // —medido con una sonda—, asi que compararlo con `'static'` seria una asercion que no
    // puede fallar por el motivo que dice comprobar.
    render(<App />);
    const principal = screen.getByRole("main");
    const fila = arbol().parentElement as HTMLElement;
    expect(principal.parentElement).toBe(fila);
    expect(getComputedStyle(fila).display).toBe("flex");
    expect(getComputedStyle(arbol()).flex).toBe("0 0 252px");
    expect(arbol().style.position).toBe("");
    expect(principal.style.position).toBe("");
  });
});

describe("el recuento del filtro, por si solo", () => {
  it.each([
    ["recibo", "1 módulo · 1 submódulo"],
    ["panel", "12 módulos · 12 submódulos"],
    ["tesor", "1 módulo · 4 submódulos"],
    ["zzz", "Sin coincidencias"],
    ["", ""],
  ])("«%s» → «%s»", (q, esperado) => {
    expect(recuentoDelFiltro(q)).toBe(esperado);
  });
});
