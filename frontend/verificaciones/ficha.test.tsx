// @vitest-environment happy-dom
//
// La ficha de un recibo existente y el renderizador de campos, medidos.
//
// POR QUE happy-dom Y NO EL jsdom DEL RESTO DE LA SUITE
// Por lo mismo que `recibos.test.tsx`, `panel.test.tsx` y `marco.test.tsx`: los criterios 2, 3 y
// 5 hablan de **estilo calculado** —el borde discontinuo de un `ro`, el `grid-column: 1 / -1` que
// pone `global.css` y la alineacion de las columnas de cifras—, y jsdom no resuelve `var()`: alli
// lo unico afirmable seria que la pantalla escribe `var(--borde-campo)`, que es justo lo que la
// prueba NO quiere dar por bueno.
//
// UNA MEDIDA DEL ENTORNO QUE DECIDE COMO SE COMPRUEBA EL `ro`
// happy-dom **rompe el atributo `style`** de un `border: 1px dashed var(--borde-campo)`: lo
// serializa como `border: 1px dashed` y le anade tres declaraciones sin sentido
// —`border-width: var(--borde-campo)`, `border-style: var(--borde-campo)` y
// `border-color: var(--borde-campo)`—. Medido con una sonda antes de escribir esta prueba. Lo que
// SI sale entero es el estilo **calculado**: `borderStyle: 'dashed'`, `borderColor: '#C3CFD9'`,
// `borderWidth: '1px'`. Por eso el criterio 2 se comprueba sobre `getComputedStyle` y no sobre el
// atributo. Los mismos tres valores se midieron en un Chromium de verdad y estan en el PR.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App";
import { PASOS, RECIBOS, VALORES_DEL_RECIBO } from "../src/datos";
import { INSIGNIAS } from "../src/ds/tokens";
import { COBRO_NUEVO } from "../src/marco/destino";
import {
  ESTILO_DE_CAMPO,
  ESTILO_DE_CAMPO_MAL,
  esObligatorio,
  estiloDeCampo,
  faltan,
  OPCIONAL,
} from "../src/pantallas/CampoDeFicha";
import {
  ANTERIOR,
  ANULAR_EL_RECIBO,
  AVISO_DE_LA_ANULACION,
  AVISO_DE_LA_CUENTA_CORRIENTE,
  CAMBIOS_GUARDADOS,
  CAMBIOS_GUARDADOS_EN_EL_RECIBO,
  CONTINUAR,
  contextoDe,
  GUARDAR_LOS_CAMBIOS,
  mensajeDeAccion,
  NOTA_DEL_PASO,
  NOTA_DEL_ULTIMO_PASO,
  PASO_DE_LA_ANULACION,
  REIMPRIMIR,
  VER_LA_CUENTA_CORRIENTE,
} from "../src/pantallas/FichaDelRecibo";
import { COBRAR, ELIJA_UN_RECIBO } from "../src/pantallas/Recibos";
import "../src/ds/global.css";

afterEach(cleanup);

/** El hash es global del documento y `App` lo escribe al montarse. Ver `marco.test.tsx`. */
beforeEach(() => window.history.replaceState(null, "", window.location.pathname));

/** El recibo con el que trabajan los criterios: el primero del turno, `0003-0041184`. */
const EL_RECIBO = RECIBOS[0]!;

const pantalla = () => document.querySelector("[data-seccion='predios']") as HTMLElement;
const barraDePestanas = () => document.querySelector("[data-pestanas]") as HTMLElement;
const pestanaDelMarco = (clave: string) =>
  barraDePestanas().querySelector(`[data-pestana="${clave}"]`) as HTMLElement;
const arbol = () => screen.getByRole("complementary", { name: "Módulos y submódulos" });

const abrirRecibos = () => {
  render(<App />);
  fireEvent.click(document.querySelector('[data-submodulo="predios"]') as HTMLElement);
};

/** Deja la ficha de un recibo a la vista, que es lo que hace casi toda prueba de este archivo. */
const abrirFicha = (cod: string = EL_RECIBO.cod) => {
  abrirRecibos();
  fireEvent.click(pantalla().querySelector(`[data-recibo="${cod}"]`) as HTMLElement);
};

const ficha = () => pantalla().querySelector("[data-ficha]") as HTMLElement;
const codigo = () => pantalla().querySelector("[data-codigo]") as HTMLElement;
const acciones = () => [...pantalla().querySelectorAll("[data-accion]")] as HTMLElement[];
const accion = (label: string) =>
  pantalla().querySelector(`[data-accion="${label}"]`) as HTMLElement;

const secciones = () => [...pantalla().querySelectorAll("[data-paso]")] as HTMLElement[];
const seccion = (id: string) => pantalla().querySelector(`[data-paso="${id}"]`) as HTMLElement;
const irA = (id: string) => fireEvent.click(seccion(id));
const seccionActiva = () =>
  secciones()
    .filter((s) => s.getAttribute("aria-current") === "true")
    .map((s) => s.getAttribute("data-paso"));

const campos = () => [...pantalla().querySelectorAll("[data-campo]")] as HTMLElement[];
const claves = () => campos().map((c) => c.getAttribute("data-campo"));
const campo = (clave: string) =>
  pantalla().querySelector(`[data-campo="${clave}"]`) as HTMLElement;
/** El control de un campo: el segundo hijo del `<label>`, tras la fila del rotulo (linea 672). */
const controlDe = (clave: string) => campo(clave).children[1] as HTMLElement;
const ayudaDe = (clave: string) => campo(clave).querySelector("[data-ayuda]");

const tabla = () => pantalla().querySelector('[data-tabla="cuotas"]') as HTMLElement;
const cabeceras = () => [...tabla().querySelectorAll("thead th")] as HTMLElement[];
const filasDeLaTabla = () => [...tabla().querySelectorAll("tbody tr")] as HTMLElement[];
const celdasDe = (fila: HTMLElement) => [...fila.querySelectorAll("td")] as HTMLElement[];

const botonDeLaBarra = (rotulo: string) =>
  [...pantalla().querySelectorAll("button")].find((b) => b.textContent === rotulo) as HTMLElement;

const toast = () => screen.queryByRole("status")?.textContent ?? "";

/** El valor de un campo tal como la ficha lo resuelve: lo tocado, o lo que trae el recibo. */
const valorDelRecibo = (clave: string) => VALORES_DEL_RECIBO[clave] ?? "";

describe("criterio 1 · abrir el recibo enseña las cinco pestanas y su cabecera", () => {
  it("las cinco secciones, en el orden del artboard y solo la primera activa", () => {
    abrirFicha();
    expect(secciones()).toHaveLength(5);
    expect(secciones().map((s) => s.textContent)).toEqual([
      "Operación",
      "Deuda a cobrar",
      "Medio de pago",
      "Recibo",
      "Anulación",
    ]);
    expect(seccionActiva()).toEqual(["operacion"]);
  });

  it("la cabecera trae el codigo, en 14 px/700 azul y con cifras tabulares", () => {
    abrirFicha();
    expect(ficha().getAttribute("data-ficha")).toBe(EL_RECIBO.cod);
    expect(codigo().textContent).toBe(EL_RECIBO.cod);
    const estilo = getComputedStyle(codigo());
    expect(estilo.fontSize).toBe("14px");
    expect(estilo.fontWeight).toBe("700");
    expect(estilo.color).toBe("#005284");
    expect(estilo.fontVariantNumeric).toBe("tabular-nums");
  });

  it("la insignia dice «Aplicado» y lleva los colores del tono `ok`", () => {
    abrirFicha();
    const insignia = [...ficha().querySelectorAll("span")].find(
      (s) => s.textContent === EL_RECIBO.estado,
    ) as HTMLElement;
    expect(insignia).toBeDefined();
    expect(insignia.textContent).toBe("Aplicado");
    expect(getComputedStyle(insignia).backgroundColor).toBe(INSIGNIAS.ok.fondo);
    expect(getComputedStyle(insignia).color).toBe(INSIGNIAS.ok.tinta);
  });

  it("y las tres acciones, con «Anular el recibo» de primaria", () => {
    abrirFicha();
    expect(acciones().map((a) => a.textContent)).toEqual([
      VER_LA_CUENTA_CORRIENTE,
      REIMPRIMIR,
      ANULAR_EL_RECIBO,
    ]);
    // La primaria se distingue **por color**, que es lo que un `aria-` no dice: fondo azul y
    // tinta blanca contra fondo blanco y borde gris.
    expect(getComputedStyle(accion(ANULAR_EL_RECIBO)).backgroundColor).toBe("#005284");
    expect(getComputedStyle(accion(ANULAR_EL_RECIBO)).color).toBe("#fff");
    expect(getComputedStyle(accion(REIMPRIMIR)).backgroundColor).toBe("#fff");
    expect(getComputedStyle(accion(REIMPRIMIR)).borderColor).toBe("#D6DEE4");
  });

  it("el titulo y el contexto son los del recibo, y el contexto se compone de dos campos", () => {
    abrirFicha();
    // Se busca **dentro de la ficha**: el titulo del recibo esta tambien en su fila de la
    // lista, y un `getByText` sin acotar revienta con «Found multiple elements». Es del
    // artboard —los dos lo escriben— y por eso se acota en vez de cambiarlo.
    expect(within(ficha()).getByText(EL_RECIBO.titulo)).toBeDefined();
    expect(within(ficha()).getByText(contextoDe(EL_RECIBO))).toBeDefined();
    // La mitad que lo hace comprobable: es `titular · contexto`, no uno de los dos.
    expect(contextoDe(EL_RECIBO)).toContain(EL_RECIBO.titular);
    expect(contextoDe(EL_RECIBO)).toContain(EL_RECIBO.contexto);
  });

  it("y sin nada elegido no hay ficha: es el estado vacio de #11", () => {
    // Sin esta mitad, dibujar la ficha **siempre** pasaria todo lo de arriba.
    abrirRecibos();
    expect(pantalla().querySelector("[data-ficha]")).toBeNull();
    expect(screen.getByText(ELIJA_UN_RECIBO)).toBeDefined();
  });

  it("y en un cobro nuevo hay ficha, pero **no la de un recibo**: eso es #13", () => {
    // Desde #13 el cobro nuevo dibuja la misma plantilla, asi que «no hay ficha» dejaria de ser
    // cierto. Lo que sigue separandolos es el `data-nuevo` y las acciones de la cabecera: un
    // borrador no se puede anular ni reimprimir, porque todavia no existe.
    abrirRecibos();
    fireEvent.click(screen.getAllByRole("button", { name: COBRAR })[0] as HTMLElement);
    expect(ficha().getAttribute("data-nuevo")).toBe("1");
    expect(pantalla().querySelector("[data-ir-recibo]")).toBeNull();
    expect(accion(ANULAR_EL_RECIBO)).toBeNull();
    expect(accion(REIMPRIMIR)).toBeNull();
    expect(document.querySelector("[data-ir-recibo]")?.getAttribute("data-ir-recibo")).toBe(
      COBRO_NUEVO,
    );
  });
});

describe("criterio 2 · «Operación» tiene nueve campos y cinco son de solo lectura", () => {
  /** Los cinco que el criterio nombra, transcritos a mano y no leidos de `PASOS`. */
  const DE_SOLO_LECTURA = ["caja", "cajero", "turno", "contrib", "docContrib"];
  /** Los otros cuatro, tambien a mano: son los que hacen que el criterio pueda fallar. */
  const LOS_DEMAS = ["fechaOp", "horaOp", "quienPaga", "obsOp"];

  it("son nueve, y son estos nueve", () => {
    abrirFicha();
    expect(campos()).toHaveLength(9);
    expect(claves()).toEqual([
      "caja",
      "cajero",
      "turno",
      "fechaOp",
      "horaOp",
      "contrib",
      "docContrib",
      "quienPaga",
      "obsOp",
    ]);
  });

  it.each(DE_SOLO_LECTURA)("`%s` se pinta con borde discontinuo, medido sobre el estilo", (clave) => {
    abrirFicha();
    const estilo = getComputedStyle(controlDe(clave));
    expect(estilo.borderStyle).toBe("dashed");
    expect(estilo.borderWidth).toBe("1px");
    expect(estilo.borderColor).toBe("#C3CFD9");
    expect(estilo.backgroundColor).toBe("#F7FBFE");
    expect(estilo.fontVariantNumeric).toBe("tabular-nums");
  });

  it.each(LOS_DEMAS)("y `%s` NO: su borde es continuo", (clave) => {
    // Es la mitad que hace que el criterio pueda fallar. Un `border: 1px dashed` puesto a todos
    // los campos pasaria la prueba de arriba entera, y la ficha se veria mal en las cuatro
    // secciones restantes sin que nada lo dijera.
    abrirFicha();
    expect(getComputedStyle(controlDe(clave)).borderStyle).toBe("solid");
  });

  it("los cinco enseñan el valor del recibo, y no una casilla vacia", () => {
    abrirFicha();
    for (const clave of DE_SOLO_LECTURA) {
      expect(controlDe(clave).textContent).toBe(valorDelRecibo(clave));
      expect(controlDe(clave).textContent).not.toBe("");
    }
  });

  it("un `ro` no es editable: no hay `input` ni `select` dentro", () => {
    abrirFicha();
    for (const clave of DE_SOLO_LECTURA) {
      expect(campo(clave).querySelector("input, select, textarea")).toBeNull();
    }
  });
});

describe("criterio 3 · «Observaciones» y «Contribuyente» ocupan la fila entera", () => {
  it("los dos llevan `grid-column: 1 / -1`, que pone `global.css` desde `data-ancho`", () => {
    abrirFicha();
    expect(campo("contrib").getAttribute("data-ancho")).toBe("1");
    expect(campo("obsOp").getAttribute("data-ancho")).toBe("1");
    expect(getComputedStyle(campo("contrib")).gridColumn).toBe("1 / -1");
    expect(getComputedStyle(campo("obsOp")).gridColumn).toBe("1 / -1");
  });

  it("y los otros siete de «Operación» no", () => {
    abrirFicha();
    const anchos = campos()
      .filter((c) => getComputedStyle(c).gridColumn === "1 / -1")
      .map((c) => c.getAttribute("data-campo"));
    expect(anchos).toEqual(["contrib", "obsOp"]);
  });

  it("la rejilla es la del artboard: `auto-fit` de 212 px con su `gap`", () => {
    abrirFicha();
    const rejilla = getComputedStyle(pantalla().querySelector("[data-campos]") as HTMLElement);
    expect(rejilla.display).toBe("grid");
    expect(rejilla.gridTemplateColumns).toBe("repeat(auto-fit,minmax(212px,1fr))");
    expect(rejilla.gap).toBe("14px 16px");
  });

  it("en las otras secciones tambien hay anchos, y son los del artboard", () => {
    // Sin esta mitad, un `data-ancho` puesto solo a los dos de «Operación» pasaria por bueno.
    abrirFicha();
    irA("pago");
    expect(getComputedStyle(campo("medio")).gridColumn).toBe("1 / -1");
    expect(getComputedStyle(campo("recibido")).gridColumn).not.toBe("1 / -1");
    irA("recibo");
    expect(getComputedStyle(campo("obsRecibo")).gridColumn).toBe("1 / -1");
    irA("anulacion");
    expect(getComputedStyle(campo("motivoAnul")).gridColumn).toBe("1 / -1");
    expect(getComputedStyle(campo("fundamentoAnul")).gridColumn).toBe("1 / -1");
    expect(getComputedStyle(campo("autoriza")).gridColumn).not.toBe("1 / -1");
  });
});

describe("criterio 4 · los opcionales lo dicen, y «Vuelto (S/)» trae su ayuda", () => {
  /** Los ocho opcionales de las cinco secciones, transcritos a mano de las lineas 978-1043. */
  const OPCIONALES: readonly (readonly [string, string])[] = [
    ["operacion", "obsOp"],
    ["pago", "operacionBanco"],
    ["pago", "banco"],
    ["pago", "ultimos4"],
    ["recibo", "obsRecibo"],
    ["anulacion", "fechaAnul"],
    ["anulacion", "resAnul"],
    ["anulacion", "fundamentoAnul"],
  ];

  const palabraOpcionalEn = (clave: string) =>
    [...campo(clave).querySelectorAll("span")].some((s) => s.textContent === OPCIONAL);

  it.each(OPCIONALES)("en «%s», `%s` lleva la palabra «opcional»", (id, clave) => {
    abrirFicha();
    irA(id);
    expect(palabraOpcionalEn(clave)).toBe(true);
    expect(getComputedStyle(
      [...campo(clave).querySelectorAll("span")].find((s) => s.textContent === OPCIONAL)!,
    ).fontSize).toBe("11.5px");
  });

  it("y los obligatorios NO la llevan", () => {
    // La mitad que hace que el criterio pueda fallar: pintar «opcional» en todos pasaria la
    // prueba de arriba y dejaria la ficha diciendo que nada hace falta.
    abrirFicha();
    for (const clave of ["fechaOp", "horaOp", "quienPaga", "contrib"]) {
      expect(palabraOpcionalEn(clave), clave).toBe(false);
    }
    irA("anulacion");
    for (const clave of ["motivoAnul", "autoriza"]) {
      expect(palabraOpcionalEn(clave), clave).toBe(false);
    }
  });

  it("«Vuelto (S/)» lleva la ayuda «Solo en efectivo», debajo y en 12 px", () => {
    abrirFicha();
    irA("pago");
    const ayuda = ayudaDe("vuelto") as HTMLElement;
    expect(ayuda).not.toBeNull();
    expect(ayuda.textContent).toBe("Solo en efectivo");
    expect(getComputedStyle(ayuda).fontSize).toBe("12px");
  });

  it("y sus vecinos de la misma seccion no llevan ninguna", () => {
    abrirFicha();
    irA("pago");
    for (const clave of ["medio", "recibido", "operacionBanco", "banco", "ultimos4", "conciliado"]) {
      expect(ayudaDe(clave), clave).toBeNull();
    }
  });

  it("la otra ayuda del artboard tambien esta: la de «Devuelve la deuda»", () => {
    abrirFicha();
    irA("anulacion");
    expect(ayudaDe("devuelveDeuda")?.textContent).toBe(
      "La cuota vuelve a estar pendiente y el interés se recalcula",
    );
  });
});

describe("criterio 5 · la tabla de cuotas: tres filas, seis columnas y sus cifras", () => {
  /** Las tres filas, transcritas a mano del artboard (linea 1009) y no leidas de `PASOS`. */
  const CUOTAS: readonly (readonly string[])[] = [
    ["2024", "Impuesto predial", "1 a 4", "1,842.60", "212.44", "2,055.04"],
    ["2026", "Arbitrios municipales", "1 a 8", "291.60", "18.44", "310.04"],
    ["2026", "Impuesto predial", "3", "146.86", "0.00", "146.86"],
  ];

  it("solo esta en «Deuda a cobrar», y en ninguna de las otras cuatro", () => {
    abrirFicha();
    expect(pantalla().querySelector('[data-tabla="cuotas"]')).toBeNull();
    irA("deuda");
    expect(tabla()).not.toBeNull();
    for (const id of ["pago", "recibo", "anulacion", "operacion"]) {
      irA(id);
      expect(pantalla().querySelector('[data-tabla="cuotas"]'), id).toBeNull();
    }
  });

  it("seis columnas, con los rotulos del artboard", () => {
    abrirFicha();
    irA("deuda");
    expect(cabeceras()).toHaveLength(6);
    expect(cabeceras().map((c) => c.textContent)).toEqual([
      "Año",
      "Concepto",
      "Cuota",
      "Insoluto S/",
      "Interés S/",
      "Total S/",
    ]);
  });

  it("tres filas, con sus cifras enteras y sin redondear", () => {
    abrirFicha();
    irA("deuda");
    expect(filasDeLaTabla()).toHaveLength(3);
    expect(filasDeLaTabla().map((f) => celdasDe(f).map((c) => c.textContent))).toEqual(
      CUOTAS.map((fila) => [...fila]),
    );
  });

  it("las tres ultimas columnas van a la derecha y con cifras tabulares; las tres primeras no", () => {
    abrirFicha();
    irA("deuda");
    const primera = celdasDe(filasDeLaTabla()[0]!);
    const alineacion = primera.map((c) => getComputedStyle(c).textAlign);
    expect(alineacion.slice(3)).toEqual(["right", "right", "right"]);
    // La mitad que separa «las tres ultimas» de «todas»: las tres primeras no van a la derecha.
    expect(alineacion.slice(0, 3).filter((a) => a === "right")).toEqual([]);
    expect(primera.slice(3).map((c) => getComputedStyle(c).fontVariantNumeric)).toEqual([
      "tabular-nums",
      "tabular-nums",
      "tabular-nums",
    ]);
    expect(getComputedStyle(primera[0]!).fontVariantNumeric).not.toBe("tabular-nums");
    // Y la cabecera va con su columna: `THN` es `TH + '; text-align:right'` (linea 930), o sea
    // que el rotulo se alinea con la cifra que tiene debajo. Sin esto, alinear solo las celdas
    // dejaria «INSOLUTO S/» a la izquierda de su columna de numeros.
    const titulos = cabeceras().map((c) => getComputedStyle(c).textAlign);
    expect(titulos.slice(3)).toEqual(["right", "right", "right"]);
    expect(titulos.slice(0, 3).filter((a) => a === "right")).toEqual([]);
  });

  it("la primera columna va en peso 600 y las de en medio no", () => {
    abrirFicha();
    irA("deuda");
    const primera = celdasDe(filasDeLaTabla()[0]!);
    expect(getComputedStyle(primera[0]!).fontWeight).toBe("600");
    expect(getComputedStyle(primera[1]!).fontWeight).not.toBe("600");
  });

  it("desplaza en horizontal a partir de 780 px, y trae su boton y su nota", () => {
    abrirFicha();
    irA("deuda");
    const rejilla = tabla().querySelector("table") as HTMLElement;
    expect(getComputedStyle(rejilla).minWidth).toBe("780px");
    expect(getComputedStyle(rejilla.parentElement as HTMLElement).overflowX).toBe("auto");
    expect(screen.getByRole("button", { name: "Cambiar selección" })).toBeDefined();
    expect(
      screen.getByText(
        "La imputación es de lo más antiguo a lo más nuevo, y dentro del año primero el " +
          "interés y luego el insoluto. No es opcional: lo manda el Código Tributario.",
      ),
    ).toBeDefined();
  });
});

describe("criterio 6 · escribir en «Observaciones» ensucia la pestana", () => {
  const escribirObservacion = (texto: string) =>
    fireEvent.change(controlDe("obsOp"), { target: { value: texto } });

  it("el ` *` sale en la pestana **y** en el arbol", () => {
    abrirFicha();
    expect(pestanaDelMarco("predios").textContent).toBe("Recibos");
    escribirObservacion("El contribuyente pidió copia adicional.");
    expect(pestanaDelMarco("predios").textContent).toBe("Recibos *");
    expect(
      (arbol().querySelector('[data-submodulo="predios"]') as HTMLElement).textContent,
    ).toBe("Recibos *");
  });

  it("y lo escrito se lee de vuelta, tambien tras cambiar de seccion y volver", () => {
    abrirFicha();
    escribirObservacion("Atendido en ventanilla 2.");
    expect((controlDe("obsOp") as HTMLTextAreaElement).value).toBe("Atendido en ventanilla 2.");
    irA("recibo");
    irA("operacion");
    expect((controlDe("obsOp") as HTMLTextAreaElement).value).toBe("Atendido en ventanilla 2.");
  });

  it("solo mirar la ficha NO la ensucia", () => {
    // Sin esta mitad, ensuciar al dibujar pasaria la prueba de arriba.
    abrirFicha();
    irA("deuda");
    irA("anulacion");
    fireEvent.click(accion(REIMPRIMIR));
    expect(pestanaDelMarco("predios").textContent).toBe("Recibos");
  });

  it("marcar una casilla tambien ensucia, que es la otra forma de editar", () => {
    abrirFicha();
    irA("recibo");
    const casilla = campo("conciliado");
    expect(casilla).toBeNull();
    irA("pago");
    fireEvent.click(campo("conciliado").querySelector("input") as HTMLElement);
    expect(pestanaDelMarco("predios").textContent).toBe("Recibos *");
    expect((campo("conciliado").querySelector("input") as HTMLInputElement).checked).toBe(true);
  });
});

describe("criterio 7 · «Anular el recibo» salta a la seccion 5 y saca su toast", () => {
  it("lleva a «Anulación» y avisa con el texto exacto de la linea 1916", () => {
    abrirFicha();
    expect(seccionActiva()).toEqual(["operacion"]);
    fireEvent.click(accion(ANULAR_EL_RECIBO));
    expect(seccionActiva()).toEqual(["anulacion"]);
    expect(toast()).toBe(AVISO_DE_LA_ANULACION);
    expect(toast()).toBe(
      "Anular devuelve la deuda a la cuenta corriente. Indique el motivo y quién autoriza.",
    );
  });

  it("y la seccion 5 es la ultima: `PASO_DE_LA_ANULACION` vale 4", () => {
    // El artboard escribe `paso: 4` a mano. Que ese 4 sea «Anulación» es lo que hay que afirmar.
    expect(PASO_DE_LA_ANULACION).toBe(4);
    expect(PASOS[PASO_DE_LA_ANULACION]?.id).toBe("anulacion");
    expect(PASOS[PASO_DE_LA_ANULACION]?.label).toBe("Anulación");
  });

  it("«Ver la cuenta corriente» avisa y **no navega**: eso es otro sistema", () => {
    abrirFicha();
    fireEvent.click(accion(VER_LA_CUENTA_CORRIENTE));
    expect(toast()).toBe(AVISO_DE_LA_CUENTA_CORRIENTE);
    expect(toast()).toBe("Abriría la cuenta corriente del contribuyente en Rentas.");
    // Ni cambia de seccion de la ficha, ni cambia de pestana, ni toca el hash.
    expect(seccionActiva()).toEqual(["operacion"]);
    expect(pestanaDelMarco("predios").getAttribute("aria-current")).toBe("true");
    expect(window.location.hash).toBe("#recibos");
  });

  it("«Reimprimir» nombra el recibo, que es la rama por descarte de la linea 1917", () => {
    abrirFicha();
    fireEvent.click(accion(REIMPRIMIR));
    expect(toast()).toBe(mensajeDeAccion(REIMPRIMIR, EL_RECIBO.cod));
    expect(toast()).toBe("Reimprimir: 0003-0041184.");
    expect(seccionActiva()).toEqual(["operacion"]);
  });

  it("las pestanas de la ficha tambien llevan a su seccion, una a una", () => {
    abrirFicha();
    for (const paso of PASOS) {
      irA(paso.id);
      expect(seccionActiva()).toEqual([paso.id]);
      expect(screen.getByText(paso.nota)).toBeDefined();
    }
  });
});

describe("criterio 8 · la barra inferior", () => {
  it("en la primera seccion «Anterior» esta apagado, y en la segunda no", () => {
    abrirFicha();
    expect(botonDeLaBarra(ANTERIOR).getAttribute("aria-disabled")).toBe("true");
    // La mitad que hace que el criterio pueda fallar: un `aria-disabled="true"` fijo pasaria.
    irA("deuda");
    expect(botonDeLaBarra(ANTERIOR).getAttribute("aria-disabled")).toBe("false");
  });

  it("y apagado se ve apagado: tinta gris y borde de linea, contra azul y azul", () => {
    abrirFicha();
    expect(getComputedStyle(botonDeLaBarra(ANTERIOR)).color).toBe("#93A3AF");
    expect(getComputedStyle(botonDeLaBarra(ANTERIOR)).borderColor).toBe("#D6DEE4");
    irA("deuda");
    expect(getComputedStyle(botonDeLaBarra(ANTERIOR)).color).toBe("#005284");
    expect(getComputedStyle(botonDeLaBarra(ANTERIOR)).borderColor).toBe("#005284");
  });

  it("en la ultima seccion el boton derecho dice «Guardar los cambios», y antes «Continuar»", () => {
    abrirFicha();
    expect(botonDeLaBarra(CONTINUAR)).toBeDefined();
    expect(botonDeLaBarra(GUARDAR_LOS_CAMBIOS)).toBeUndefined();
    irA("anulacion");
    expect(botonDeLaBarra(GUARDAR_LOS_CAMBIOS)).toBeDefined();
    expect(botonDeLaBarra(CONTINUAR)).toBeUndefined();
  });

  it("avanzar cambia de seccion y saca «Cambios guardados.»", () => {
    abrirFicha();
    fireEvent.click(botonDeLaBarra(CONTINUAR));
    expect(seccionActiva()).toEqual(["deuda"]);
    expect(toast()).toBe(CAMBIOS_GUARDADOS);
    expect(toast()).toBe("Cambios guardados.");
  });

  it("«Anterior» retrocede, y en la primera no mueve nada", () => {
    abrirFicha();
    irA("pago");
    fireEvent.click(botonDeLaBarra(ANTERIOR));
    expect(seccionActiva()).toEqual(["deuda"]);
    fireEvent.click(botonDeLaBarra(ANTERIOR));
    expect(seccionActiva()).toEqual(["operacion"]);
    fireEvent.click(botonDeLaBarra(ANTERIOR));
    expect(seccionActiva()).toEqual(["operacion"]);
  });

  it("guardar en la ultima avisa distinto, y no salta a ninguna parte", () => {
    abrirFicha();
    irA("anulacion");
    fireEvent.click(botonDeLaBarra(GUARDAR_LOS_CAMBIOS));
    expect(toast()).toBe(CAMBIOS_GUARDADOS_EN_EL_RECIBO);
    expect(toast()).toBe("Cambios guardados en el recibo.");
    expect(seccionActiva()).toEqual(["anulacion"]);
  });

  it("la nota del paso cambia en la ultima seccion", () => {
    abrirFicha();
    expect(screen.getByText(NOTA_DEL_PASO)).toBeDefined();
    expect(screen.queryByText(NOTA_DEL_ULTIMO_PASO)).toBeNull();
    irA("anulacion");
    expect(screen.getByText(NOTA_DEL_ULTIMO_PASO)).toBeDefined();
    expect(screen.queryByText(NOTA_DEL_PASO)).toBeNull();
  });
});

describe("criterio 9 · en un recibo existente no hay contadores de pendientes", () => {
  it("ninguna de las cinco pestanas trae mas que su rotulo", () => {
    abrirFicha();
    for (const paso of PASOS) {
      expect(seccion(paso.id).children).toHaveLength(1);
      expect(seccion(paso.id).textContent).toBe(paso.label);
    }
  });

  it("y NO es porque la cuenta de cero: en «Anulación» faltan dos", () => {
    // Este es el caso que separa las dos implementaciones. El contador del artboard es
    // `nuevo && f > 0` (linea 1948): quien se dejara el `nuevo &&` veria un «2» en la quinta
    // pestana. Sin esta afirmacion, la prueba de arriba pasaria igual con la implementacion
    // equivocada, porque las otras cuatro secciones estan completas.
    const valorDe = (clave: string) => VALORES_DEL_RECIBO[clave] ?? "";
    expect(PASOS.map((p) => faltan(p, valorDe))).toEqual([0, 0, 0, 0, 2]);

    abrirFicha();
    irA("anulacion");
    expect(seccion("anulacion").textContent).toBe("Anulación");
    expect(seccion("anulacion").textContent).not.toContain("2");
  });

  it("los dos que faltan son «Motivo» y «Autorizado por», y estan vacios en la pantalla", () => {
    abrirFicha();
    irA("anulacion");
    expect((controlDe("motivoAnul") as HTMLSelectElement).value).toBe("");
    expect((controlDe("autoriza") as HTMLSelectElement).value).toBe("");
    expect(esObligatorio(PASOS[4]!.campos.find((c) => c.clave === "motivoAnul")!)).toBe(true);
    expect(esObligatorio(PASOS[4]!.campos.find((c) => c.clave === "autoriza")!)).toBe(true);
  });
});

describe("las seis clases de campo, cada una con su control", () => {
  it("texto, fecha, seleccion, area, casilla y solo lectura", () => {
    abrirFicha();
    expect(controlDe("horaOp").tagName).toBe("INPUT");
    expect((controlDe("horaOp") as HTMLInputElement).type).toBe("text");
    expect((controlDe("fechaOp") as HTMLInputElement).type).toBe("date");
    expect(controlDe("quienPaga").tagName).toBe("SELECT");
    expect(controlDe("obsOp").tagName).toBe("TEXTAREA");
    expect(controlDe("obsOp").getAttribute("rows")).toBe("3");
    expect(controlDe("caja").tagName).toBe("SPAN");
    irA("pago");
    expect(controlDe("conciliado").querySelector("input")?.getAttribute("type")).toBe("checkbox");
  });

  it("un `sel` ofrece sus opciones, con la vacia delante", () => {
    abrirFicha();
    const opciones = [...controlDe("quienPaga").querySelectorAll("option")].map((o) => o.value);
    expect(opciones).toEqual([
      "",
      "El propio contribuyente",
      "Un tercero autorizado",
      "Un tercero sin autorización",
    ]);
    expect((controlDe("quienPaga") as HTMLSelectElement).value).toBe("Un tercero autorizado");
  });

  it("el `area` lleva su marcador de posicion y crece en vertical", () => {
    abrirFicha();
    expect((controlDe("obsOp") as HTMLTextAreaElement).placeholder).toBe(
      "Lo que haya que anotar de la atención",
    );
    expect(getComputedStyle(controlDe("obsOp")).resize).toBe("vertical");
  });

  it("la casilla lleva el color de la marca y mide 17 px", () => {
    abrirFicha();
    irA("pago");
    const casilla = campo("conciliado").querySelector("input") as HTMLElement;
    expect(getComputedStyle(casilla).accentColor).toBe("#005284");
    expect(getComputedStyle(casilla).width).toBe("17px");
    expect(getComputedStyle(casilla).height).toBe("17px");
    expect(campo("conciliado").textContent).toContain("Aparece en el extracto del día");
  });

  it("las dos casillas del recibo llegan marcadas, y la de conciliado no", () => {
    // Es lo que dice `VALORES_DEL_RECIBO`, y lo que separa `'1'` de «cualquier cosa marca».
    abrirFicha();
    irA("recibo");
    expect((campo("aplicado").querySelector("input") as HTMLInputElement).checked).toBe(true);
    expect((campo("impreso").querySelector("input") as HTMLInputElement).checked).toBe(true);
    irA("pago");
    expect((campo("conciliado").querySelector("input") as HTMLInputElement).checked).toBe(false);
  });
});

describe("el estilo de error se aplica con las tres condiciones, y solo con las tres", () => {
  const motivo = PASOS[4]!.campos.find((c) => c.clave === "motivoAnul")!;
  const opcional = PASOS[4]!.campos.find((c) => c.clave === "fundamentoAnul")!;
  const soloLectura = PASOS[4]!.campos.find((c) => c.clave === "devuelveDeuda")!;
  const casilla = PASOS[4]!.campos.find((c) => c.clave === "anulado")!;

  it("obligatorio, vacio y con intento: sale el estilo malo", () => {
    expect(estiloDeCampo(motivo, "", true)).toBe(ESTILO_DE_CAMPO_MAL);
  });

  it("sin intento, no", () => {
    expect(estiloDeCampo(motivo, "", false)).toBe(ESTILO_DE_CAMPO);
  });

  it("con valor, no", () => {
    expect(estiloDeCampo(motivo, "Error en el importe", true)).toBe(ESTILO_DE_CAMPO);
  });

  it("un opcional vacio, no", () => {
    expect(estiloDeCampo(opcional, "", true)).toBe(ESTILO_DE_CAMPO);
  });

  it("un `ro` y un `chk` **nunca** son obligatorios, asi que nunca salen mal", () => {
    expect(esObligatorio(soloLectura)).toBe(false);
    expect(esObligatorio(casilla)).toBe(false);
    expect(estiloDeCampo(soloLectura, "", true)).toBe(ESTILO_DE_CAMPO);
    expect(estiloDeCampo(casilla, "", true)).toBe(ESTILO_DE_CAMPO);
  });

  it("el estilo malo es el `IN_MAL` de la linea 927, y difiere del bueno en dos valores", () => {
    expect(ESTILO_DE_CAMPO_MAL.border).toBe("1px solid #A8321E");
    expect(ESTILO_DE_CAMPO_MAL.background).toBe("#FFF9F8");
    expect(ESTILO_DE_CAMPO.border).toBe("1px solid var(--borde-campo)");
    expect(ESTILO_DE_CAMPO.background).toBe("#fff");
    // Lo demas es identico, que es lo que el artboard escribe: mismo alto, mismo radio.
    expect(ESTILO_DE_CAMPO_MAL.padding).toBe(ESTILO_DE_CAMPO.padding);
    expect(ESTILO_DE_CAMPO_MAL.fontSize).toBe(ESTILO_DE_CAMPO.fontSize);
  });

  it("y en esta pantalla NO se puede alcanzar: nadie enciende el intento", () => {
    // `state.intento` lo enciende la emision del cobro nuevo (linea 2021), que es #13. Aqui se
    // recorren las cinco secciones pulsando todo lo que hay y ningun campo se pinta mal.
    abrirFicha();
    for (const paso of PASOS) {
      irA(paso.id);
      fireEvent.click(botonDeLaBarra(paso.id === "anulacion" ? GUARDAR_LOS_CAMBIOS : CONTINUAR));
    }
    irA("anulacion");
    expect(getComputedStyle(controlDe("motivoAnul")).borderColor).toBe("#C3CFD9");
    expect(getComputedStyle(controlDe("motivoAnul")).backgroundColor).toBe("#fff");
  });
});

describe("los valores de la ficha salen de `src/datos/`, y estan completos", () => {
  it("todo campo de las cinco secciones tiene su valor declarado", () => {
    // Un campo sin entrada se dibujaria vacio sin que nada lo dijera, y en «Deuda total a hoy»
    // eso es una casilla en blanco donde deberia haber una cifra.
    const sinValor = PASOS.flatMap((p) => p.campos)
      .map((c) => c.clave)
      .filter((clave) => VALORES_DEL_RECIBO[clave] === undefined);
    expect(sinValor).toEqual([]);
  });

  it("son treinta y cinco, tantos como campos hay", () => {
    expect(PASOS.flatMap((p) => p.campos)).toHaveLength(35);
    expect(Object.keys(VALORES_DEL_RECIBO)).toHaveLength(35);
  });

  it("y ninguna cifra de la ficha esta escrita en la pantalla", () => {
    abrirFicha();
    irA("deuda");
    expect(controlDe("deudaTotal").textContent).toBe("3,455.24");
    expect(controlDe("aCobrar").textContent).toBe("2,281.06");
    expect(valorDelRecibo("deudaTotal")).toBe("3,455.24");
  });

  it("el cuerpo de la ficha es el mismo para los cinco recibos, y la cabecera no", () => {
    // Es lo que hace el artboard: `datos()` no recibe el recibo elegido (linea 1367), asi que
    // lo unico que cambia al elegir otro es la cabecera. Medido ejecutando su logica en Node, y
    // se declara aqui para que no se descubra como un defecto de este port.
    abrirFicha("0003-0041180");
    expect(codigo().textContent).toBe("0003-0041180");
    expect(within(ficha()).getByText("Zapata Rivas, Óscar")).toBeDefined();
    expect(controlDe("contrib").textContent).toBe(valorDelRecibo("contrib"));
    expect(campo("numRecibo")).toBeNull();
    irA("recibo");
    expect(controlDe("numRecibo").textContent).toBe("0041184");
  });
});

describe("abrir otro recibo devuelve la ficha a «Operación», como el artboard", () => {
  // ESTE `describe` SUSTITUYE A UNO QUE AFIRMABA LO CONTRARIO, Y ES #13 QUIEN LO CAMBIA.
  //
  // #12 escribio aqui «la seccion elegida sobrevive a cambiar de recibo, como en el artboard»,
  // con este comentario: «El `paso` del artboard vive en su estado global (linea 1221) y nadie lo
  // reinicia al cambiar de recibo». **Es falso, y se mide**: su `abrir(cod)` (linea 2081) hace
  // `this.setState({ dest: 'predios', predio: cod, paso: 0, vals: {}, intento: false, … })`, y
  // ejecutando esa logica en Node el estado que deja es
  // `{"predio":"0003-0041180","paso":0,"vals":{},"intento":false}`. O sea que lo reinicia.
  //
  // Se retira entera en vez de corregirle el comentario porque lo que estaba mal no era la prosa:
  // era la asercion, que defendia como comportamiento del diseno justo lo que el diseno evita
  // —abrir un recibo y aterrizar en «Anulación» porque es donde te dejo el anterior—.

  it("ir a «Anulación» y abrir otro recibo deja la ficha en «Operación»", () => {
    abrirFicha();
    irA("anulacion");
    expect(seccionActiva()).toEqual(["anulacion"]);
    fireEvent.click(pantalla().querySelector('[data-recibo="0003-0041182"]') as HTMLElement);
    expect(codigo().textContent).toBe("0003-0041182");
    expect(seccionActiva()).toEqual(["operacion"]);
  });

  it("y cambiar de seccion **dentro** del mismo recibo sigue funcionando", () => {
    // La pareja que separa las hipotesis: un `paso: 0` fijo —o un reinicio en cada dibujado—
    // pasaria la prueba de arriba y dejaria la ficha clavada en «Operación», sin poder recorrer
    // las otras cuatro secciones.
    abrirFicha();
    irA("pago");
    expect(seccionActiva()).toEqual(["pago"]);
    irA("anulacion");
    expect(seccionActiva()).toEqual(["anulacion"]);
    fireEvent.click(botonDeLaBarra(ANTERIOR));
    expect(seccionActiva()).toEqual(["recibo"]);
  });

  it("y abrir otro recibo tampoco hereda lo escrito en el anterior", () => {
    // La otra mitad de la linea 2081, `vals: {}`. Va aqui al lado porque las dos se portaron a la
    // vez y las dos se rompen igual de callado: la ficha se dibuja entera y con datos ajenos.
    abrirFicha();
    fireEvent.change(controlDe("obsOp"), { target: { value: "Atendido en ventanilla 2." } });
    expect((controlDe("obsOp") as HTMLTextAreaElement).value).toBe("Atendido en ventanilla 2.");
    fireEvent.click(pantalla().querySelector('[data-recibo="0003-0041182"]') as HTMLElement);
    expect((controlDe("obsOp") as HTMLTextAreaElement).value).toBe("");
  });
});
