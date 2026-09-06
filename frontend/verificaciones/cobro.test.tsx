// @vitest-environment happy-dom
//
// El cobro nuevo: la barra de caja y contribuyente, la validacion que bloquea y la emision.
//
// POR QUE happy-dom Y NO EL jsdom DEL RESTO DE LA SUITE
// Por lo mismo que `ficha.test.tsx`: los criterios 4 y 7 hablan de **estilo calculado** —el aviso
// sobre `#FBE4E0` con su borde izquierdo `#A8321E`, y los campos obligatorios vacios en `#A8321E`
// sobre `#FFF9F8`— y jsdom no resuelve `var()`, asi que alli lo unico afirmable seria que la
// pantalla escribe el nombre del token.
//
// UNA MEDIDA QUE DECIDE DONDE SE COMPRUEBAN LOS CRITERIOS 3 Y 4
// El issue dice «el boton esta bloqueado» y «`aria-disabled="true"` en el boton». El artboard
// bloquea con **tres** condiciones a la vez (linea 2014): `nuevo && paso >= PASOS.length - 1 &&
// !puede`. Ejecutando su logica en Node, con la caja `C-1` cerrada y ocho digitos, `bloqueado` da
// `"false"` en las secciones 0 a 3 y `"true"` en la 4. O sea que **el bloqueo solo existe en la
// ultima seccion**, que es donde esta el boton que cobra: en las anteriores el boton dice
// «Continuar» y avanzar de seccion no cobra nada. Los dos criterios se comprueban por tanto en la
// ultima seccion, y ademas se afirma que antes NO bloquea, porque un `aria-disabled="true"` fijo
// cumpliria el criterio tal como esta escrito y dejaria el borrador sin poder recorrerse.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App";
import { CAJAS, CAJAS_CERRADAS, PASOS, valoresDelCobroNuevo } from "../src/datos";
import { INSIGNIAS } from "../src/ds/tokens";
import { COBRO_NUEVO } from "../src/marco/destino";
import { MENSAJE_DE_COBRO_NUEVO } from "../src/marco/rotulos";
import { faltan } from "../src/pantallas/CampoDeFicha";
import {
  AVISO_DE_CAJA_CERRADA,
  AVISO_DEL_DOCUMENTO,
  BORRADOR,
  BORRADOR_DESCARTADO,
  CAJA_CERRADA,
  CAJA_CERRADA_NO_EMITE,
  CAJA_EN_LA_QUE_SE_COBRA,
  COBRAR_Y_EMITIR,
  codigoDe,
  codigoEmitido,
  CONTRIBUYENTE_LOCALIZADO,
  datosSinLlenar,
  DESCARTAR,
  digitosQueFaltan,
  DNI_O_RUC,
  DOCUMENTO_DEL_CONTRIBUYENTE,
  DOCUMENTO_MAXIMO,
  EL_EFECTIVO_AL_ARQUEO,
  FALTA_EL_DOCUMENTO,
  GUARDAR_BORRADOR,
  LO_QUE_SE_VA_A_REGISTRAR,
  motivoDe,
  noEntraAlArqueo,
  noSePuedeTodavia,
  puedeCobrar,
  reciboEmitido,
  SIN_CODIGO,
  SIN_MEDIO_DE_PAGO,
  soloDigitos,
  TODO_LISTO,
} from "../src/pantallas/CobroNuevo";
import { ANTERIOR, CONTINUAR } from "../src/pantallas/FichaDelRecibo";
import { COBRAR, ELIJA_UN_RECIBO } from "../src/pantallas/Recibos";
import "../src/ds/global.css";

afterEach(cleanup);
beforeEach(() => window.history.replaceState(null, "", window.location.pathname));

const pantalla = () => document.querySelector("[data-seccion='predios']") as HTMLElement;
const raiz = () => document.querySelector("[data-ir-recibo]") as HTMLElement;
const toast = () => screen.queryByRole("status")?.textContent ?? "";

const barra = () => pantalla().querySelector("[data-barra-de-caja]") as HTMLElement;
const insigniaDelCodigo = () =>
  pantalla().querySelector("[data-estado-del-codigo]") as HTMLElement;
const avisoDelCodigo = () => pantalla().querySelector("[data-aviso-del-codigo]");
const codigoQueSeEmitira = () =>
  pantalla().querySelector("[data-codigo-que-se-emitira]") as HTMLElement;
const selectorDeCaja = () => screen.getByLabelText(CAJA_EN_LA_QUE_SE_COBRA) as HTMLSelectElement;
const campoDelDocumento = () =>
  screen.getByLabelText(DOCUMENTO_DEL_CONTRIBUYENTE) as HTMLInputElement;

const secciones = () => [...pantalla().querySelectorAll("[data-paso]")] as HTMLElement[];
const seccion = (id: string) => pantalla().querySelector(`[data-paso="${id}"]`) as HTMLElement;
const irA = (id: string) => fireEvent.click(seccion(id));
const seccionActiva = () =>
  secciones()
    .filter((s) => s.getAttribute("aria-current") === "true")
    .map((s) => s.getAttribute("data-paso"));
const contadores = () =>
  secciones().map((s) => s.querySelector("[data-pendientes]")?.textContent ?? "");

const campo = (clave: string) =>
  pantalla().querySelector(`[data-campo="${clave}"]`) as HTMLElement;
/** El control de un campo: el segundo hijo del `<label>`, tras la fila del rotulo (linea 672). */
const controlDe = (clave: string) => campo(clave).children[1] as HTMLElement;

const resumen = () => pantalla().querySelector("[data-resumen]") as HTMLElement;
const lineasDelResumen = () =>
  [...resumen().querySelectorAll("[data-linea-del-resumen]")] as HTMLElement[];
const pieDelResumen = () => pantalla().querySelector("[data-pie-del-resumen]") as HTMLElement;

const botonDeLaBarra = (rotulo: string) =>
  [...pantalla().querySelectorAll("button")].find((b) => b.textContent === rotulo) as HTMLElement;
/** El boton de la derecha de la barra inferior, se llame como se llame en esa seccion. */
const botonDerecho = () => {
  const botones = [...pantalla().querySelectorAll("button")];
  return botones[botones.length - 1] as HTMLElement;
};
const accion = (label: string) =>
  pantalla().querySelector(`[data-accion="${label}"]`) as HTMLElement;

const abrirRecibos = () => {
  render(<App />);
  fireEvent.click(document.querySelector('[data-submodulo="predios"]') as HTMLElement);
};

/**
 * El «Cobrar» de la fila del titulo, que es el `nuevo()` de la linea 2073.
 *
 * Se busca por su rotulo y se toma **el primero**: con la lista vacia hay dos botones «Cobrar»
 * —el de la fila del titulo (410) y el del vacio (579)—, los dos del artboard, y un `getByRole`
 * sin acotar revienta con «Found multiple elements». Lo dejo escrito #11.
 */
const cobrar = () =>
  fireEvent.click(screen.getAllByRole("button", { name: COBRAR })[0] as HTMLElement);

/** Deja un cobro nuevo empezado, que es el punto de partida de casi toda prueba de este archivo. */
const empezarCobro = () => {
  abrirRecibos();
  cobrar();
};

const escribirDocumento = (texto: string) =>
  fireEvent.change(campoDelDocumento(), { target: { value: texto } });
const elegirCaja = (nombre: string) =>
  fireEvent.change(selectorDeCaja(), { target: { value: nombre } });
const elegir = (clave: string, valor: string) =>
  fireEvent.change(controlDe(clave), { target: { value: valor } });

/** La caja abierta con la que se empieza y una de las dos cerradas, transcritas a mano. */
const C3 = "C-3 — abierta · turno mañana";
const C1 = "C-1 — cerrada ayer";

/**
 * Rellena los **nueve** obligatorios que un cobro nuevo trae vacios, seccion a seccion.
 *
 * Los nueve, y no «los que falten»: son los que `faltan` cuenta con los valores de partida, y
 * estan escritos a mano aqui para que anadir un obligatorio a `PASOS` sin tocar esto deje esta
 * prueba en rojo en vez de rellenarlo sola.
 */
const completarElBorrador = () => {
  irA("operacion");
  elegir("fechaOp", "2026-09-06");
  elegir("horaOp", "10:15");
  elegir("quienPaga", "El propio contribuyente");
  irA("deuda");
  elegir("descuento", "No aplica");
  irA("pago");
  elegir("medio", "Efectivo");
  elegir("recibido", "100.00");
  irA("recibo");
  elegir("copias", "2");
  irA("anulacion");
  elegir("motivoAnul", "Error en el importe");
  elegir("autoriza", "Jefe de Tesorería");
};

describe("criterio 1 · «Cobrar» abre un cobro nuevo, en borrador y vacio", () => {
  it("deja `#recibos` activo, el destino en el centinela y el toast del artboard", () => {
    empezarCobro();
    expect(window.location.hash).toBe("#recibos");
    expect(raiz().getAttribute("data-ir-recibo")).toBe(COBRO_NUEVO);
    expect(toast()).toBe(MENSAJE_DE_COBRO_NUEVO);
    expect(toast()).toBe("Cobro nuevo: elija la caja abierta y el contribuyente.");
  });

  it("la insignia de la cabecera dice «Borrador» y va en los colores del tono `warn`", () => {
    empezarCobro();
    const insignia = pantalla().querySelector(
      `[data-estado-de-la-ficha="${BORRADOR}"]`,
    ) as HTMLElement;
    expect(insignia.textContent).toBe("Borrador");
    expect(getComputedStyle(insignia).backgroundColor).toBe(INSIGNIAS.warn.fondo);
    expect(getComputedStyle(insignia).color).toBe(INSIGNIAS.warn.tinta);
  });

  it("las cinco secciones estan, y **vacias**: faltan 3, 1, 2, 1 y 2", () => {
    empezarCobro();
    expect(secciones().map((s) => s.getAttribute("data-paso"))).toEqual([
      "operacion",
      "deuda",
      "pago",
      "recibo",
      "anulacion",
    ]);
    expect(seccionActiva()).toEqual(["operacion"]);
    // La cuenta, hecha sobre los valores de partida y no sobre la pantalla: es la que el artboard
    // hace, y da 9 en total. Los nueve son los que `completarElBorrador` llena.
    const deOmision = valoresDelCobroNuevo(C3, "");
    expect(PASOS.map((p) => faltan(p, (clave) => deOmision[clave] ?? ""))).toEqual([3, 1, 2, 1, 2]);
    // Y en la pantalla: los tres de «Operación» se ven vacios.
    for (const clave of ["fechaOp", "horaOp", "quienPaga"]) {
      expect((controlDe(clave) as HTMLInputElement).value, clave).toBe("");
    }
  });

  it("el titulo, el contexto y el codigo son los del borrador sin documento", () => {
    empezarCobro();
    expect(within(pantalla()).getByText("Cobro nuevo")).toBeDefined();
    expect(
      within(pantalla()).getByText("Sin contribuyente · nada se cobra hasta la última sección"),
    ).toBeDefined();
    expect(codigoQueSeEmitira().textContent).toBe(SIN_CODIGO);
  });

  it("y la barra de caja **no** sale en un recibo existente: es del cobro nuevo", () => {
    // Sin esta mitad, dibujar la barra siempre pasaria todo lo de arriba y ademas le ofreceria al
    // cajero cambiar la caja de un recibo ya emitido.
    abrirRecibos();
    fireEvent.click(pantalla().querySelector('[data-recibo="0003-0041184"]') as HTMLElement);
    expect(pantalla().querySelector("[data-barra-de-caja]")).toBeNull();
    expect(pantalla().querySelector("[data-resumen]")).toBeNull();
  });

  it("las tres puertas de «Cobrar» hacen lo mismo: la fila del titulo, la paleta y el vacio", () => {
    // El artboard tiene un solo `nuevo()` (2073-2079) y tres sitios que lo llaman. Si una de las
    // tres no tirara lo escrito o no avisara, empezar un cobro significaria una cosa distinta
    // segun por donde se entre.
    empezarCobro();
    expect(toast()).toBe(MENSAJE_DE_COBRO_NUEVO);
    cleanup();

    // (2) La paleta de comandos.
    abrirRecibos();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    fireEvent.click(screen.getByRole("option", { name: /Cobrar/ }));
    expect(raiz().getAttribute("data-ir-recibo")).toBe(COBRO_NUEVO);
    expect(toast()).toBe(MENSAJE_DE_COBRO_NUEVO);
    cleanup();

    // (3) El «Cobrar» del vacio de la lista, que en #11 se quedo **sin toast** por no haber con
    // que avisar. Aqui ya lo hay, y avisa.
    abrirRecibos();
    fireEvent.change(within(pantalla()).getByPlaceholderText(/Recibo, contribuyente/), {
      target: { value: "zzz" },
    });
    expect(within(pantalla()).getByText("Ningún recibo coincide")).toBeDefined();
    fireEvent.click(within(pantalla()).getByRole("button", { name: COBRAR }));
    expect(raiz().getAttribute("data-ir-recibo")).toBe(COBRO_NUEVO);
    expect(toast()).toBe(MENSAJE_DE_COBRO_NUEVO);
  });
});

describe("criterio 2 · el documento solo admite digitos, y como mucho once", () => {
  it("«abc123def» deja «123»: las letras no entran", () => {
    empezarCobro();
    escribirDocumento("abc123def");
    expect(campoDelDocumento().value).toBe("123");
  });

  it("pegar quince digitos deja once", () => {
    empezarCobro();
    escribirDocumento("123456789012345");
    expect(campoDelDocumento().value).toBe("12345678901");
    expect(campoDelDocumento().value).toHaveLength(11);
  });

  it("el `maxlength` del campo es once, que es un RUC", () => {
    empezarCobro();
    expect(campoDelDocumento().getAttribute("maxlength")).toBe(String(DOCUMENTO_MAXIMO));
    expect(DOCUMENTO_MAXIMO).toBe(11);
    expect(campoDelDocumento().getAttribute("placeholder")).toBe(DNI_O_RUC);
  });

  it("y el filtro es una funcion pura, medida con los tres casos que la separan", () => {
    // El `maxlength` no protege de un pegado por programa, y el filtro no protege de un teclado
    // que solo escriba letras: hacen falta los dos, y por eso se miden aparte.
    expect(soloDigitos("abc123def")).toBe("123");
    expect(soloDigitos("123456789012345")).toBe("12345678901");
    expect(soloDigitos("12.345.678")).toBe("12345678");
    expect(soloDigitos("  87 65 43 21 ")).toBe("87654321");
    expect(soloDigitos("")).toBe("");
  });

  it("el campo va centrado y con cifras tabulares, y mide lo que mide el documento", () => {
    empezarCobro();
    const estilo = getComputedStyle(campoDelDocumento());
    expect(estilo.textAlign).toBe("center");
    expect(estilo.fontVariantNumeric).toBe("tabular-nums");
    // El artboard pide `.06em` y el calculado sale en pixeles: `14.5px * .06` = `0.87px`. Es la
    // misma declaracion, resuelta; el cotejo contra el artboard compara la cadena `.06em`.
    expect(estilo.letterSpacing).toBe("0.87px");
    // 8 * 13 + 26, la cuenta de la linea 1930.
    expect(estilo.width).toBe("130px");
  });
});

describe("criterio 3 · siete digitos avisan y ocho localizan", () => {
  it("con siete: insignia `warn` «7 de 8 dígitos mínimo» y el codigo sigue en «—»", () => {
    empezarCobro();
    escribirDocumento("1234567");
    expect(insigniaDelCodigo().textContent).toBe("7 de 8 dígitos mínimo");
    expect(insigniaDelCodigo().textContent).toBe(digitosQueFaltan(7, 8));
    expect(getComputedStyle(insigniaDelCodigo()).backgroundColor).toBe(INSIGNIAS.warn.fondo);
    expect(codigoQueSeEmitira().textContent).toBe(SIN_CODIGO);
  });

  it("con ocho: insignia `ok` «Contribuyente localizado» y el codigo deja de ser «—»", () => {
    empezarCobro();
    escribirDocumento("12345678");
    expect(insigniaDelCodigo().textContent).toBe(CONTRIBUYENTE_LOCALIZADO);
    expect(insigniaDelCodigo().textContent).toBe("Contribuyente localizado");
    expect(getComputedStyle(insigniaDelCodigo()).backgroundColor).toBe(INSIGNIAS.ok.fondo);
    expect(codigoQueSeEmitira().textContent).not.toBe(SIN_CODIGO);
    expect(codigoQueSeEmitira().textContent).toBe(codigoEmitido("12345678"));
    expect(codigoQueSeEmitira().textContent).toBe("0003-0041193");
  });

  it("con siete, el boton de la ultima seccion esta bloqueado y dice por que", () => {
    empezarCobro();
    escribirDocumento("1234567");
    irA("anulacion");
    expect(botonDerecho().textContent).toBe(COBRAR_Y_EMITIR);
    expect(botonDerecho().getAttribute("aria-disabled")).toBe("true");
    expect(botonDerecho().getAttribute("title")).toBe(FALTA_EL_DOCUMENTO);
    expect(botonDerecho().getAttribute("title")).toBe("Falta el documento del contribuyente.");
  });

  it("y **antes de la ultima seccion no bloquea**, que es lo que el artboard hace", () => {
    // Medido ejecutando su logica: con siete digitos, `bloqueado` da `"false"` en las secciones
    // 0 a 3 y `"true"` en la 4. Sin esta mitad, un `aria-disabled="true"` fijo cumpliria el
    // criterio de arriba y dejaria el borrador sin poder recorrerse.
    empezarCobro();
    escribirDocumento("1234567");
    for (const id of ["operacion", "deuda", "pago", "recibo"]) {
      irA(id);
      expect(botonDerecho().textContent, id).toBe(CONTINUAR);
      expect(botonDerecho().getAttribute("aria-disabled"), id).toBe("false");
      expect(botonDerecho().getAttribute("title"), id).toBe("");
    }
  });

  it("el aviso de debajo explica los ocho y los once, y va sobre la superficie elevada", () => {
    empezarCobro();
    escribirDocumento("1234567");
    const aviso = avisoDelCodigo() as HTMLElement;
    expect(aviso.textContent).toBe(AVISO_DEL_DOCUMENTO);
    expect(getComputedStyle(aviso).backgroundColor).toBe("#F7FBFE");
    expect(getComputedStyle(aviso).borderLeftColor).toBe("#52BDEF");
  });

  it("con ocho el aviso desaparece: no hay problema que contar", () => {
    empezarCobro();
    escribirDocumento("12345678");
    expect(avisoDelCodigo()).toBeNull();
  });

  it("el minimo sale de la caja y el maximo del campo: son ocho y once, y no el mismo numero", () => {
    // Es lo que el issue llama «admite 11 pero desbloquea a los 8». Con las dos cifras iguales el
    // campo no dejaria escribir un RUC entero; con el minimo puesto en 11 no se podria cobrar a
    // nadie con DNI.
    expect(CAJAS.map((c) => c.largoDeDocumento)).toEqual([8, 8, 8, 8]);
    expect(DOCUMENTO_MAXIMO).toBe(11);
    expect(codigoDe(C3, "12345678").listo).toBe(true);
    expect(codigoDe(C3, "1234567").listo).toBe(false);
    expect(codigoDe(C3, "12345678901").listo).toBe(true);
  });
});

describe("criterio 4 · una caja cerrada BLOQUEA — el criterio central", () => {
  it("con `C-1 — cerrada ayer` y ocho digitos: insignia `bad` «Caja cerrada»", () => {
    empezarCobro();
    elegirCaja(C1);
    escribirDocumento("12345678");
    expect(insigniaDelCodigo().textContent).toBe(CAJA_CERRADA);
    expect(insigniaDelCodigo().textContent).toBe("Caja cerrada");
    expect(getComputedStyle(insigniaDelCodigo()).backgroundColor).toBe(INSIGNIAS.bad.fondo);
    expect(getComputedStyle(insigniaDelCodigo()).color).toBe(INSIGNIAS.bad.tinta);
  });

  it("y su aviso va sobre `#FBE4E0` con el borde izquierdo de 3 px en `#A8321E`", () => {
    empezarCobro();
    elegirCaja(C1);
    escribirDocumento("12345678");
    const aviso = avisoDelCodigo() as HTMLElement;
    expect(aviso.textContent).toBe(AVISO_DE_CAJA_CERRADA);
    const estilo = getComputedStyle(aviso);
    expect(estilo.backgroundColor).toBe("#FBE4E0");
    expect(estilo.borderLeftColor).toBe("#A8321E");
    expect(estilo.borderLeftWidth).toBe("3px");
    expect(estilo.borderLeftStyle).toBe("solid");
    expect(estilo.color).toBe("#8F2A17");
  });

  it("el boton de la ultima seccion queda `aria-disabled=\"true\"` con su motivo en el `title`", () => {
    empezarCobro();
    elegirCaja(C1);
    escribirDocumento("12345678");
    irA("anulacion");
    expect(botonDerecho().getAttribute("aria-disabled")).toBe("true");
    expect(botonDerecho().getAttribute("title")).toBe(
      "La caja elegida está cerrada: no se puede emitir en ella.",
    );
    expect(botonDerecho().getAttribute("title")).toBe(CAJA_CERRADA_NO_EMITE);
    expect(getComputedStyle(botonDerecho()).opacity).toBe(".55");
  });

  it("y **no emite**: pulsarlo deja el borrador donde estaba y saca el motivo", () => {
    empezarCobro();
    elegirCaja(C1);
    escribirDocumento("12345678");
    completarElBorrador();
    // Todo lleno y el documento entero: lo unico que queda es la caja cerrada. **Esta es la
    // asercion que separa de verdad las dos implementaciones**, y esta aqui porque la mutacion
    // que quita `!cajaCerrada` de `puede` deja la de mas arriba en verde: alli faltan ademas
    // nueve datos, asi que el boton se bloquea igual y por otro motivo.
    expect(contadores()).toEqual(["", "", "", "", ""]);
    expect(botonDerecho().getAttribute("aria-disabled")).toBe("true");
    expect(botonDerecho().getAttribute("title")).toBe(CAJA_CERRADA_NO_EMITE);
    expect(getComputedStyle(botonDerecho()).opacity).toBe(".55");
    expect(pieDelResumen().textContent).toBe(noSePuedeTodavia(CAJA_CERRADA_NO_EMITE));
    fireEvent.click(botonDerecho());
    expect(toast()).toBe(CAJA_CERRADA_NO_EMITE);
    expect(raiz().getAttribute("data-ir-recibo")).toBe(COBRO_NUEVO);
    expect(barra()).not.toBeNull();
  });

  it("con la misma caja **abierta** si emite: es lo que separa el bloqueo de un adorno", () => {
    empezarCobro();
    escribirDocumento("12345678");
    completarElBorrador();
    fireEvent.click(botonDerecho());
    expect(toast()).toBe(reciboEmitido("0003-0041193"));
    expect(raiz().getAttribute("data-ir-recibo")).toBe("0003-0041193");
  });

  it("las dos cerradas **se ofrecen** en la lista, que es mas honesto que esconderlas", () => {
    empezarCobro();
    const opciones = [...selectorDeCaja().querySelectorAll("option")].map((o) => o.value);
    expect(opciones).toEqual(CAJAS.map((c) => c.nombre));
    expect(opciones).toHaveLength(4);
    for (const cerrada of CAJAS_CERRADAS) expect(opciones).toContain(cerrada);
    expect(CAJAS_CERRADAS).toEqual([C1, "C-2 — cerrada ayer"]);
  });

  it("la prioridad del motivo es caja cerrada → documento → datos, y en ese orden", () => {
    // Es lo que decide que se lee cuando fallan dos cosas a la vez, y por eso se mide sobre la
    // funcion pura: con la caja cerrada **y** el documento corto, las dos pantallas se ven igual.
    expect(motivoDe(codigoDe(C1, ""), 9)).toBe(CAJA_CERRADA_NO_EMITE);
    expect(motivoDe(codigoDe(C1, "12345678"), 0)).toBe(CAJA_CERRADA_NO_EMITE);
    expect(motivoDe(codigoDe(C3, "123"), 9)).toBe(FALTA_EL_DOCUMENTO);
    expect(motivoDe(codigoDe(C3, "12345678"), 9)).toBe(datosSinLlenar(9));
    expect(motivoDe(codigoDe(C3, "12345678"), 9)).toBe(
      "Quedan 9 datos obligatorios sin llenar.",
    );
    expect(motivoDe(codigoDe(C3, "12345678"), 0)).toBe("");
  });

  it("y `puede` exige las tres, tambien medido aparte", () => {
    expect(puedeCobrar(codigoDe(C3, "12345678"), 0)).toBe(true);
    expect(puedeCobrar(codigoDe(C1, "12345678"), 0)).toBe(false);
    expect(puedeCobrar(codigoDe(C3, "1234567"), 0)).toBe(false);
    expect(puedeCobrar(codigoDe(C3, "12345678"), 1)).toBe(false);
  });
});

describe("criterio 5 · las pestanas cuentan lo que falta, y la cuenta baja", () => {
  it("son 3, 1, 2, 1 y 2 al empezar, y van en ambar", () => {
    empezarCobro();
    expect(contadores()).toEqual(["3", "1", "2", "1", "2"]);
    const pastilla = seccion("operacion").querySelector("[data-pendientes]") as HTMLElement;
    expect(getComputedStyle(pastilla).backgroundColor).toBe(INSIGNIAS.warn.fondo);
    expect(getComputedStyle(pastilla).color).toBe(INSIGNIAS.warn.tinta);
  });

  it("baja al ir rellenando, uno a uno, y desaparece al llegar a cero", () => {
    empezarCobro();
    elegir("fechaOp", "2026-09-06");
    expect(contadores()).toEqual(["2", "1", "2", "1", "2"]);
    elegir("horaOp", "10:15");
    expect(contadores()).toEqual(["1", "1", "2", "1", "2"]);
    elegir("quienPaga", "El propio contribuyente");
    expect(contadores()).toEqual(["", "1", "2", "1", "2"]);
    expect(seccion("operacion").querySelector("[data-pendientes]")).toBeNull();
    expect(seccion("operacion").textContent).toBe("Operación");
  });

  it("y con el borrador entero no queda ninguno", () => {
    empezarCobro();
    completarElBorrador();
    expect(contadores()).toEqual(["", "", "", "", ""]);
    for (const paso of PASOS) expect(seccion(paso.id).children).toHaveLength(1);
  });

  it("borrar lo escrito lo vuelve a subir: la cuenta no es de una sola direccion", () => {
    empezarCobro();
    elegir("horaOp", "10:15");
    expect(contadores()[0]).toBe("2");
    elegir("horaOp", "");
    expect(contadores()[0]).toBe("3");
  });
});

describe("criterio 6 · «Lo que se va a registrar», y su tercera linea", () => {
  it("sale **solo** en la ultima seccion, con sus cuatro lineas", () => {
    empezarCobro();
    for (const id of ["operacion", "deuda", "pago", "recibo"]) {
      irA(id);
      expect(pantalla().querySelector("[data-resumen]"), id).toBeNull();
    }
    irA("anulacion");
    expect(within(resumen()).getByText(LO_QUE_SE_VA_A_REGISTRAR)).toBeDefined();
    expect(lineasDelResumen()).toHaveLength(4);
  });

  it("sin medio de pago, la tercera dice «Sin medio de pago elegido» con icono de aviso", () => {
    empezarCobro();
    irA("anulacion");
    const tercera = lineasDelResumen()[2] as HTMLElement;
    expect(tercera.getAttribute("data-linea-del-resumen")).toBe(SIN_MEDIO_DE_PAGO);
    expect(tercera.textContent).toContain("Sin medio de pago elegido");
    const icono = tercera.querySelector("[data-bien]") as HTMLElement;
    expect(icono.getAttribute("data-bien")).toBe("0");
    expect(getComputedStyle(icono).backgroundColor).toBe(INSIGNIAS.warn.fondo);
    expect(tercera.textContent).toContain("Falta");
  });

  it("con `Efectivo`, «El efectivo entra al arqueo de la caja» con ✓ verde", () => {
    empezarCobro();
    irA("pago");
    elegir("medio", "Efectivo");
    irA("anulacion");
    const tercera = lineasDelResumen()[2] as HTMLElement;
    expect(tercera.getAttribute("data-linea-del-resumen")).toBe(EL_EFECTIVO_AL_ARQUEO);
    expect(tercera.textContent).toContain("El efectivo entra al arqueo de la caja");
    const icono = tercera.querySelector("[data-bien]") as HTMLElement;
    expect(icono.getAttribute("data-bien")).toBe("1");
    expect(getComputedStyle(icono).backgroundColor).toBe(INSIGNIAS.ok.fondo);
    expect(tercera.textContent).toContain("Al arqueo");
  });

  it("y con otro medio, la **tercera** redaccion: «<medio>: no entra al arqueo»", () => {
    // Es la que separa tres redacciones de dos. Fundir «sin elegir» con «no es efectivo» diria
    // que el dinero se concilia contra el banco antes de que nadie lo haya decidido.
    empezarCobro();
    irA("pago");
    elegir("medio", "Tarjeta de débito");
    irA("anulacion");
    const tercera = lineasDelResumen()[2] as HTMLElement;
    expect(tercera.getAttribute("data-linea-del-resumen")).toBe(
      noEntraAlArqueo("Tarjeta de débito"),
    );
    expect(tercera.textContent).toContain("Tarjeta de débito: no entra al arqueo");
    expect(tercera.textContent).toContain("A conciliar");
    expect((tercera.querySelector("[data-bien]") as HTMLElement).getAttribute("data-bien")).toBe(
      "1",
    );
  });

  it("la primera linea nombra el recibo que se emitiria, o dice que no hay numero", () => {
    empezarCobro();
    irA("anulacion");
    expect((lineasDelResumen()[0] as HTMLElement).textContent).toContain(
      "Se emite el recibo sin número",
    );
    escribirDocumento("12345678");
    expect((lineasDelResumen()[0] as HTMLElement).textContent).toContain(
      "Se emite el recibo 0003-0041193",
    );
    expect((lineasDelResumen()[0] as HTMLElement).textContent).toContain(
      "Imputado a la caja C-3, turno de mañana.",
    );
  });

  it("el pie va en verde si se puede y en rojo con el motivo si no", () => {
    empezarCobro();
    irA("anulacion");
    expect(pieDelResumen().textContent).toBe(noSePuedeTodavia(FALTA_EL_DOCUMENTO));
    expect(getComputedStyle(pieDelResumen()).backgroundColor).toBe("#FBE4E0");
    expect(getComputedStyle(pieDelResumen()).borderLeftColor).toBe("#A8321E");

    escribirDocumento("12345678");
    completarElBorrador();
    expect(pieDelResumen().textContent).toBe(TODO_LISTO);
    expect(getComputedStyle(pieDelResumen()).backgroundColor).toBe(INSIGNIAS.ok.fondo);
    expect(getComputedStyle(pieDelResumen()).borderLeftColor).toBe(INSIGNIAS.ok.tinta);
  });

  it("y el resumen **no** sale en un recibo existente, ni siquiera en su ultima seccion", () => {
    abrirRecibos();
    fireEvent.click(pantalla().querySelector('[data-recibo="0003-0041184"]') as HTMLElement);
    irA("anulacion");
    expect(pantalla().querySelector("[data-resumen]")).toBeNull();
  });
});

describe("criterio 7 · intentar cobrar sin completar no emite, y pinta lo que falta", () => {
  it("no emite, saca el motivo y deja el borrador a la vista", () => {
    empezarCobro();
    escribirDocumento("12345678");
    irA("anulacion");
    fireEvent.click(botonDerecho());
    expect(toast()).toBe(datosSinLlenar(9));
    expect(toast()).toBe("Quedan 9 datos obligatorios sin llenar.");
    expect(raiz().getAttribute("data-ir-recibo")).toBe(COBRO_NUEVO);
    expect(barra()).not.toBeNull();
  });

  it("antes de intentarlo ninguno esta en rojo: borde `#C3CFD9` sobre blanco", () => {
    // Es la mitad que separa «se enciende al intentar» de «esta siempre encendido», y es la deuda
    // que #12 dejo declarada: hasta este issue `IN_MAL` no se podia alcanzar desde ninguna
    // pantalla, porque nadie encendia `state.intento`.
    empezarCobro();
    escribirDocumento("12345678");
    irA("anulacion");
    for (const clave of ["motivoAnul", "autoriza"]) {
      expect(getComputedStyle(controlDe(clave)).borderColor, clave).toBe("#C3CFD9");
      expect(getComputedStyle(controlDe(clave)).backgroundColor, clave).toBe("#fff");
      expect(controlDe(clave).getAttribute("style"), clave).not.toContain("#A8321E");
    }
  });

  it("y **entonces** los obligatorios vacios pasan a `#A8321E` sobre `#FFF9F8`", () => {
    empezarCobro();
    escribirDocumento("12345678");
    irA("anulacion");
    fireEvent.click(botonDerecho());
    for (const clave of ["motivoAnul", "autoriza"]) {
      // EL BORDE SE COMPRUEBA SOBRE EL ATRIBUTO, Y NO SOBRE EL CALCULADO. MEDIDO CON UNA SONDA:
      // happy-dom, al serializar `border: 1px solid var(--borde-campo)`, **le anade tres
      // declaraciones longhand** —`border-width`, `border-style` y `border-color`, las tres con
      // el `var()` dentro— y esas tres **sobreviven** cuando React reescribe el `border` a
      // `1px solid #A8321E`. Como van detras, ganan: el atributo dice `#A8321E` y el calculado
      // sigue diciendo `#C3CFD9`. El `background` no tiene shorthand con el que chocar y sale
      // bien. En un Chromium de verdad los dos salen bien, y esta medido en el PR.
      expect(controlDe(clave).getAttribute("style"), clave).toContain("border: 1px solid #A8321E");
      expect(getComputedStyle(controlDe(clave)).backgroundColor, clave).toBe("#FFF9F8");
    }
  });

  it("los opcionales, los de solo lectura y las casillas **no** se pintan", () => {
    // Sin esta mitad, pintar todo lo vacio pasaria la prueba de arriba y dejaria la ficha
    // pidiendo que se rellene lo que no se puede rellenar.
    empezarCobro();
    escribirDocumento("12345678");
    irA("anulacion");
    fireEvent.click(botonDerecho());
    for (const clave of ["resAnul", "fundamentoAnul", "fechaAnul"]) {
      expect(controlDe(clave).getAttribute("style"), clave).not.toContain("#A8321E");
      expect(getComputedStyle(controlDe(clave)).backgroundColor, clave).toBe("#fff");
    }
    expect(getComputedStyle(controlDe("devuelveDeuda")).borderStyle).toBe("dashed");
  });

  it("el rojo alcanza a las otras secciones, no solo a la que estaba a la vista", () => {
    empezarCobro();
    escribirDocumento("12345678");
    irA("anulacion");
    fireEvent.click(botonDerecho());
    irA("operacion");
    for (const clave of ["fechaOp", "horaOp", "quienPaga"]) {
      expect(getComputedStyle(controlDe(clave)).backgroundColor, clave).toBe("#FFF9F8");
    }
    // Y «Observaciones», que es opcional, no.
    expect(getComputedStyle(controlDe("obsOp")).backgroundColor).toBe("#fff");
  });

  it("rellenar un campo le quita el rojo, sin apagar el de los demas", () => {
    empezarCobro();
    escribirDocumento("12345678");
    irA("anulacion");
    fireEvent.click(botonDerecho());
    elegir("motivoAnul", "Error en el importe");
    expect(getComputedStyle(controlDe("motivoAnul")).backgroundColor).toBe("#fff");
    expect(getComputedStyle(controlDe("autoriza")).backgroundColor).toBe("#FFF9F8");
  });

  it("empezar otro cobro apaga el intento: el borrador nuevo no nace en rojo", () => {
    empezarCobro();
    escribirDocumento("12345678");
    irA("anulacion");
    fireEvent.click(botonDerecho());
    expect(getComputedStyle(controlDe("autoriza")).backgroundColor).toBe("#FFF9F8");
    cobrar();
    expect(seccionActiva()).toEqual(["operacion"]);
    expect(getComputedStyle(controlDe("quienPaga")).backgroundColor).toBe("#fff");
    // Y ademas vuelve vacio: `nuevo()` tira lo escrito (linea 2075).
    expect(campoDelDocumento().value).toBe("");
    expect(contadores()).toEqual(["3", "1", "2", "1", "2"]);
  });
});

describe("criterio 8 · con todo completo y la caja abierta, emite", () => {
  it("saca el toast con el codigo y deja ese codigo elegido", () => {
    empezarCobro();
    escribirDocumento("12345678");
    completarElBorrador();
    expect(botonDerecho().getAttribute("aria-disabled")).toBe("false");
    expect(botonDerecho().getAttribute("title")).toBe("");
    fireEvent.click(botonDerecho());
    expect(toast()).toBe(
      "Recibo 0003-0041193 emitido. La cuota ya está descontada de la cuenta corriente.",
    );
    expect(toast()).toBe(reciboEmitido("0003-0041193"));
    expect(raiz().getAttribute("data-ir-recibo")).toBe("0003-0041193");
  });

  it("y el borrador desaparece: el codigo emitido no es ninguno de los cinco del turno", () => {
    // Es lo que hace el artboard (linea 2022) y se porta tal cual: `predio` pasa a valer un
    // codigo que `PREDIOS` no tiene, asi que `sel` queda `undefined` y la mitad derecha vuelve al
    // vacio. Medido ejecutando su logica: `hayFicha` pasa a `false` y `sinSeleccion` a `true`.
    empezarCobro();
    escribirDocumento("12345678");
    completarElBorrador();
    fireEvent.click(botonDerecho());
    expect(pantalla().querySelector("[data-barra-de-caja]")).toBeNull();
    expect(pantalla().querySelector("[data-ficha]")).toBeNull();
    expect(within(pantalla()).getByText(ELIJA_UN_RECIBO)).toBeDefined();
  });

  it("el codigo emitido es el que la barra venia enseñando, y no otro", () => {
    empezarCobro();
    escribirDocumento("123456789");
    completarElBorrador();
    expect(codigoQueSeEmitira().textContent).toBe("0003-0041185");
    fireEvent.click(botonDerecho());
    expect(toast()).toBe(reciboEmitido("0003-0041185"));
  });

  it("avanzar de seccion en un borrador avisa distinto que en un recibo", () => {
    empezarCobro();
    fireEvent.click(botonDerecho());
    expect(seccionActiva()).toEqual(["deuda"]);
    expect(toast()).toBe("Guardado en el borrador.");
  });

  it("«Anterior» sigue apagado en la primera seccion, y encendido en la segunda", () => {
    empezarCobro();
    expect(botonDeLaBarra(ANTERIOR).getAttribute("aria-disabled")).toBe("true");
    irA("deuda");
    expect(botonDeLaBarra(ANTERIOR).getAttribute("aria-disabled")).toBe("false");
  });
});

describe("criterio 9 · en un cobro nuevo la tabla de cuotas sale vacia", () => {
  it("sin ninguna fila, y con el texto del artboard", () => {
    empezarCobro();
    irA("deuda");
    const tabla = pantalla().querySelector('[data-tabla="cuotas"]') as HTMLElement;
    expect(tabla.querySelectorAll("tbody tr")).toHaveLength(0);
    expect((tabla.querySelector("[data-cuotas-vacias]") as HTMLElement).textContent).toBe(
      "Sin cuotas seleccionadas. Elija qué se cobra: el sistema imputa siempre de lo más " +
        "antiguo a lo más nuevo.",
    );
  });

  it("y la cabecera y el pie siguen ahi: seis columnas y la regla de la imputacion", () => {
    empezarCobro();
    irA("deuda");
    const tabla = pantalla().querySelector('[data-tabla="cuotas"]') as HTMLElement;
    expect(tabla.querySelectorAll("thead th")).toHaveLength(6);
    expect(tabla.textContent).toContain("lo manda el Código Tributario");
    expect(within(tabla).getByRole("button", { name: "Cambiar selección" })).toBeDefined();
  });

  it("en un recibo existente hay tres filas y NO hay texto de vacio", () => {
    // La mitad que separa «vacia en un cobro nuevo» de «vacia siempre».
    abrirRecibos();
    fireEvent.click(pantalla().querySelector('[data-recibo="0003-0041184"]') as HTMLElement);
    irA("deuda");
    const tabla = pantalla().querySelector('[data-tabla="cuotas"]') as HTMLElement;
    expect(tabla.querySelectorAll("tbody tr")).toHaveLength(3);
    expect(tabla.querySelector("[data-cuotas-vacias]")).toBeNull();
  });

  it("«Cambiar selección» no abre nada ni avisa, como en el diseno", () => {
    empezarCobro();
    irA("deuda");
    // Lo que se afirma es que **no cambia nada**: el toast sigue siendo el de empezar el cobro,
    // que todavia no ha caducado. Comprobar que esta vacio seria comprobar el reloj del toast.
    expect(toast()).toBe(MENSAJE_DE_COBRO_NUEVO);
    fireEvent.click(screen.getByRole("button", { name: "Cambiar selección" }));
    expect(toast()).toBe(MENSAJE_DE_COBRO_NUEVO);
    expect(seccionActiva()).toEqual(["deuda"]);
  });
});

describe("criterio 10 · «Descartar» limpia el borrador", () => {
  it("suelta la ficha, tira lo escrito y saca «Borrador descartado.»", () => {
    empezarCobro();
    escribirDocumento("12345678");
    elegir("horaOp", "10:15");
    expect(contadores()[0]).toBe("2");
    fireEvent.click(accion(DESCARTAR));
    expect(toast()).toBe(BORRADOR_DESCARTADO);
    expect(toast()).toBe("Borrador descartado.");
    expect(raiz().getAttribute("data-ir-recibo")).toBe("");
    expect(within(pantalla()).getByText(ELIJA_UN_RECIBO)).toBeDefined();
  });

  it("y lo tirado no reaparece en el cobro siguiente", () => {
    // OJO CON LO QUE ESTA PRUEBA CUBRE, Y CON LO QUE NO. Aqui hay **dos** limpiezas seguidas —la
    // de «Descartar» y la de `nuevo()`— y esta prueba pasa mientras quede una: medido, quitar la
    // de «Descartar» deja las 2 769 en verde y quitar la de `nuevo()` tambien deja esta en verde
    // (falla otra, la del criterio 7). Lo que se afirma aqui es que **el cobro siguiente sale
    // limpio**, que es el criterio; que cada limpieza haga falta por separado no lo dice esto.
    empezarCobro();
    escribirDocumento("12345678");
    elegir("horaOp", "10:15");
    fireEvent.click(accion(DESCARTAR));
    cobrar();
    expect(campoDelDocumento().value).toBe("");
    expect((controlDe("horaOp") as HTMLInputElement).value).toBe("");
    expect(contadores()).toEqual(["3", "1", "2", "1", "2"]);
  });

  it("«Guardar borrador» avisa y **no** suelta la ficha: es la otra accion de la cabecera", () => {
    empezarCobro();
    escribirDocumento("12345678");
    fireEvent.click(accion(GUARDAR_BORRADOR));
    expect(toast()).toBe("Guardar borrador: el recibo.");
    expect(raiz().getAttribute("data-ir-recibo")).toBe(COBRO_NUEVO);
    expect(campoDelDocumento().value).toBe("12345678");
  });

  it("un borrador no ofrece «Anular el recibo»: todavia no hay recibo que anular", () => {
    empezarCobro();
    expect([...pantalla().querySelectorAll("[data-accion]")].map((a) => a.textContent)).toEqual([
      DESCARTAR,
      GUARDAR_BORRADOR,
    ]);
  });
});

describe("la caja y el documento van al mismo mapa de campos que la seccion «Operación»", () => {
  it("elegir la caja cambia «Turno», que es lo que esa caja implica", () => {
    empezarCobro();
    expect(controlDe("turno").textContent).toBe("Mañana");
    elegirCaja("C-4 — abierta · turno tarde");
    expect(controlDe("turno").textContent).toBe("Tarde");
  });

  it("y escribir el documento lo enseña en «Documento», que antes decia «—»", () => {
    empezarCobro();
    expect(controlDe("docContrib").textContent).toBe("—");
    escribirDocumento("12345678");
    expect(controlDe("docContrib").textContent).toBe("12345678");
  });

  it("el campo «Caja» pasa a decir el nombre entero, que es lo que el artboard hace", () => {
    // Medido ejecutando su logica: `campo('caja', d)` lee `val('caja', 'C-3')`, y lo que la barra
    // guardo es el rotulo completo. Se porta tal cual; corregirlo aqui seria decidir por el
    // diseno que ese campo enseñe otra cosa que lo que se eligio.
    empezarCobro();
    expect(controlDe("caja").textContent).toBe("C-3");
    elegirCaja("C-4 — abierta · turno tarde");
    expect(controlDe("caja").textContent).toBe("C-4 — abierta · turno tarde");
  });

  it("escribir en la barra ensucia la pestana, igual que escribir en un campo", () => {
    empezarCobro();
    const pestana = document.querySelector('[data-pestana="predios"]') as HTMLElement;
    expect(pestana.textContent).toBe("Recibos");
    escribirDocumento("1");
    expect(pestana.textContent).toBe("Recibos *");
  });

  it("y abrir un recibo despues de un cobro **no** hereda su caja ni su documento", () => {
    // La mitad de `abrir(cod)` que #12 no porto (`vals: {}`, linea 2081). Sin ella, el recibo que
    // se abre despues de un cobro enseñaria en «Caja» y en «Documento» los del cobro.
    empezarCobro();
    elegirCaja("C-4 — abierta · turno tarde");
    escribirDocumento("12345678");
    fireEvent.click(pantalla().querySelector('[data-recibo="0003-0041184"]') as HTMLElement);
    expect(controlDe("caja").textContent).toBe("C-3");
    expect(controlDe("docContrib").textContent).toBe("DNI 03593174");
  });
});
