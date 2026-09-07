// La maqueta se declara: la banda, los toast que no afirman lo que no paso y la sesion que no
// inventa a nadie (#44).
//
// QUE SE MIDE AQUI, Y QUE NO
// Esto es lo que un emulador de DOM puede afirmar en cada `yarn verificar`: que la banda se
// dibuja en las cuatro secciones y no lleva la marca del cromo, que los toast que la aplicacion
// **saca de verdad** llevan el motivo, y que ni el codigo ni la ficha de sesion nombran a una
// persona. Lo que **no** se puede medir aqui es el papel —jsdom no emula el medio `print`— ni el
// `dist/` que la imagen sirve: eso es `verificaciones/mirar.mjs` y `verificaciones/maqueta.mjs`,
// que corren contra Chromium y contra el artefacto construido.
//
// POR QUE LOS TOAST SE RECOGEN Y NO SE ENUMERAN
// La tentacion es escribir la lista de textos esperados al lado y compararla. Eso es la prueba
// que se compara consigo misma: pasa con cualquier redaccion, incluida la de antes de este
// issue. Lo que se hace es **recorrer las acciones** y quedarse con lo que el toast dice, y
// despues aplicarle una regla — un toast que usa un participio de escritura tiene que decir por
// que no escribio nada—. Asi, devolver un toast a su texto de hoy sale rojo sin que nadie tenga
// que acordarse de actualizar ninguna lista.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App";
import { EJERCICIOS, MODULOS, SECCIONES } from "../src/datos";
import { abriria, CERRARIA_LA_SESION } from "../src/barra/MenuDeSesion";
import { BandaDeMaqueta } from "../src/marco/BandaDeMaqueta";
import {
  NO_ESTA_CONECTADA,
  nadaSeRegistro,
  SIN_SESION,
  TEXTO_DE_LA_BANDA,
  TITULO_DE_LA_BANDA,
} from "../src/marco/maqueta";
import type { PropsDePantalla } from "../src/marco/pantalla";
import { ANULAR_EL_RECIBO, CONTINUAR, GUARDAR_LOS_CAMBIOS } from "../src/pantallas/FichaDelRecibo";
import { COBRAR_Y_EMITIR, DESCARTAR } from "../src/pantallas/CobroNuevo";

afterEach(cleanup);
beforeEach(() => {
  window.location.hash = "";
  window.history.replaceState(null, "", window.location.pathname);
});

const AQUI = dirname(fileURLToPath(import.meta.url));
const SRC = join(AQUI, "..", "src");

const banda = () => document.querySelector("[data-banda-de-maqueta]");
const toast = () => screen.queryByRole("status")?.textContent ?? "";
const pantalla = () => document.querySelector("[data-seccion='predios']") as HTMLElement;
const botonDeLaBarra = (rotulo: string) =>
  [...pantalla().querySelectorAll("button")].find((b) => b.textContent === rotulo) as HTMLElement;

/** Todos los `.ts`/`.tsx` de `src/`, con su ruta relativa. Los recorre mas de un escaner. */
function fuentes(dir: string = SRC, prefijo = ""): { archivo: string; texto: string }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) return fuentes(ruta, `${prefijo}${e.name}/`);
    if (!/\.tsx?$/.test(e.name)) return [];
    return [{ archivo: prefijo + e.name, texto: readFileSync(ruta, "utf8") }];
  });
}

/**
 * El codigo **sin comentarios**, que es lo unico sobre lo que un escaner de texto puede afirmar.
 *
 * Cinco veces en este repositorio un escaner tropezo con la prosa que documentaba justo la
 * ausencia que buscaba —`grep -c proxy_pass` en #16, los rotulos del panel en #10, el escudo en
 * #37—. Aqui el riesgo es el mismo y mayor: este issue **nombra** las frases que retira y **el
 * nombre que quita**, para que no vuelvan, asi que un escaner que mirase el archivo entero se
 * cazaria a si mismo en cada uno de los archivos que arregla.
 */
const sinComentarios = (texto: string) =>
  texto.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

// ══════════════════════════════════════════════════════════════════════════
describe("AC-2 · la banda dice que esto no esta conectado, y no se va con el cromo", () => {
  it("dice las dos cosas: que no hay conexion y que los datos son de diseno", () => {
    render(<BandaDeMaqueta />);
    const texto = banda()!.textContent ?? "";
    expect(texto).toContain(TITULO_DE_LA_BANDA);
    expect(texto).toContain(TEXTO_DE_LA_BANDA);

    // Los dos literales, ademas de las constantes: comparar solo contra ellas seria comparar la
    // banda consigo misma, y una banda que dijera «bienvenido» pasaria igual.
    expect(texto).toContain("Maqueta sin conexión");
    expect(texto).toContain("Los datos son de diseño");
    expect(texto).toContain("nada de lo que se haga aquí se registra");
  });

  /**
   * Las cuatro secciones, y la que no tiene ninguna abierta.
   *
   * Se recorre `SECCIONES` en vez de escribir cuatro casos: el dia que haya una quinta, esta
   * prueba la mide sola. Y el hueco de «no hay ningun submodulo abierto» entra tambien, porque
   * es un estado que se alcanza cerrando la ultima pestana y es donde una banda colgada de la
   * pantalla activa desapareceria.
   */
  it("se dibuja en las cuatro secciones", () => {
    for (const seccion of SECCIONES) {
      window.location.hash = `#${seccion.clave}`;
      render(<App />);
      expect(banda(), `#${seccion.clave} no dibuja la banda`).not.toBeNull();
      expect(document.querySelector(`[data-seccion]`), `#${seccion.clave} no dibujo su pantalla`)
        .not.toBeNull();
      cleanup();
    }
  });

  it("y tambien sin ninguna pestana abierta", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar Panel" }));
    expect(document.querySelector("[data-seccion]")).toBeNull();
    expect(banda()).not.toBeNull();
  });

  /**
   * La mitad del criterio que se puede afirmar aqui: la banda **no es cromo**.
   *
   * #15 retira `[data-cromo]` en `@media print`, asi que llevar esa marca la borraria del papel
   * — que es justo donde mas falta hace: una hoja con numero de recibo, titular e importe, con
   * la forma de un recibo de verdad y sin una sola marca. Que ademas **se dibuje** en el medio
   * `print` no se puede medir sin navegador (jsdom no emula ese medio, #15), y lo hace
   * `mirar.mjs`.
   */
  it("no lleva `data-cromo`, que es lo que la impresion retira", () => {
    render(<App />);
    expect(banda()!.hasAttribute("data-cromo")).toBe(false);
    // Y la lista de piezas que si son cromo sigue completa, para que esto no se lea como que la
    // marca ya no la lleva nadie.
    expect(
      [...document.querySelectorAll("[data-cromo]")].map((e) => e.getAttribute("data-cromo")),
    ).toEqual(["barra", "arbol", "pestanas"]);
  });

  /**
   * Y el papel la conserva por una regla **escrita**, no por omision.
   *
   * No basta con no marcarla: sin nada escrito, mañana alguien le pone `data-cromo` «por
   * coherencia» y la banda desaparece del papel sin que nada lo diga. La regla la nombra y la
   * fija, y quitarla es un cambio visible en el diff de `global.css`.
   */
  it("y `@media print` la fija por su nombre, con su `print-color-adjust`", () => {
    const css = readFileSync(join(SRC, "ds", "global.css"), "utf8");
    const impresion = /@media print \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    expect(impresion, "no se encontro el bloque `@media print`").not.toBe("");
    expect(impresion).toContain("[data-banda-de-maqueta]");
    expect(impresion).toMatch(/\[data-banda-de-maqueta\][\s\S]*display:\s*flex\s*!important/);
    expect(impresion).toMatch(/\[data-banda-de-maqueta\][\s\S]*print-color-adjust:\s*exact/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
/**
 * Los participios de escritura: lo que un toast **no puede afirmar** sin decir que no paso.
 *
 * La regla es la de `maqueta.ts`: un toast puede decir lo que la pantalla hizo; no puede decir
 * que algo paso **fuera** de la pantalla —en una base, en una cuenta corriente, en un turno, en
 * una caja—. Un participio de estos es la forma en que un toast afirma eso, y por tanto quien lo
 * use tiene que decir ademas por que no ocurrio.
 *
 * Se prohiben las FORMAS AFIRMADAS y no los verbos: «No se guardó ningún cambio» no casa —es un
 * preterito negado— y no necesita casar, porque ya dice lo contrario de lo que la regla teme.
 */
const PARTICIPIOS_DE_ESCRITURA =
  /\b(emitid|guardad|registrad|anulad|descontad|cobrad|aplicad|imputad)[oa]s?\b/i;

describe("AC-3 · ningun toast afirma un hecho que no ocurrio", () => {
  /**
   * Los toast que la aplicacion saca **de verdad**, recogidos recorriendo las acciones.
   *
   * Cada entrada es `[que se hizo, lo que dijo]`. La lista de acciones esta escrita a mano —hay
   * que pulsar cosas— pero **los textos no**: salen de la pantalla. Que esten los que estan y no
   * mas lo vigila la cuenta de abajo.
   */
  const recogidos: [string, string][] = [];
  const recoger = (que: string) => recogidos.push([que, toast()]);

  const abrirRecibos = () => {
    render(<App />);
    fireEvent.click(document.querySelector('[data-submodulo="predios"]') as HTMLElement);
  };
  const seccion = (id: string) =>
    fireEvent.click(pantalla().querySelector(`[data-paso="${id}"]`) as HTMLElement);

  /**
   * El recorrido va en un `beforeAll` y no en el primer `it`, y eso NO es cosmetico.
   *
   * Cuatro pruebas leen `recogidos`, y escrito como un `it` que lo llena, las otras tres
   * dependerian de que ese `it` corra antes — o sea del orden, que es justo lo que
   * `--sequence.shuffle` cambia. Escrito asi, el recorrido corre una vez y las cuatro miden lo
   * mismo caiga quien caiga primero. Es la leccion de #4 con los archivos de foco. Verificado con
   * tres corridas de `--sequence.shuffle`.
   */
  beforeAll(() => {
    // 1. El cambio de ejercicio, en la barra.
    render(<App />);
    fireEvent.change(screen.getByLabelText("Ejercicio de trabajo"), {
      target: { value: EJERCICIOS[1] },
    });
    recoger("cambiar de ejercicio");
    cleanup();

    // 2. Las tres opciones del menu de sesion.
    for (const opcion of ["Mi perfil", "Cambiar contraseña", "Cerrar sesión"]) {
      render(<App />);
      fireEvent.click(screen.getByRole("button", { name: `Sesión — ${SIN_SESION.nombre}` }));
      fireEvent.click(screen.getByRole("menuitem", { name: opcion }));
      recoger(`sesion · ${opcion}`);
      cleanup();
    }

    // 3. El lanzador: un modulo ajeno y el propio.
    for (const modulo of [MODULOS[1]!.nombre, MODULOS[0]!.nombre]) {
      render(<App />);
      fireEvent.click(screen.getByRole("button", { name: "Ver todos los módulos" }));
      // Acotado al lanzador: el arbol de la izquierda tiene un boton con el mismo nombre, y un
      // `getByRole` sin acotar revienta con «Found multiple elements».
      const lanzador = within(screen.getByRole("dialog", { name: "Módulos del sistema" }));
      fireEvent.click(lanzador.getByRole("button", { name: new RegExp(`^${modulo}`) }));
      recoger(`lanzador · ${modulo}`);
      cleanup();
    }

    // 4. Las tres acciones de la ficha de un recibo existente.
    for (const accion of ["Reimprimir", "Ver la cuenta corriente", ANULAR_EL_RECIBO]) {
      abrirRecibos();
      fireEvent.click(pantalla().querySelector("[data-recibo]") as HTMLElement);
      fireEvent.click(pantalla().querySelector(`[data-accion="${accion}"]`) as HTMLElement);
      recoger(`ficha · ${accion}`);
      cleanup();
    }

    // 5. Avanzar de seccion en un recibo existente, y guardar en la ultima —que es la que
    //    cierra la anulacion: «Anular el recibo» salta ahi y el boton de la derecha es este—.
    abrirRecibos();
    fireEvent.click(pantalla().querySelector("[data-recibo]") as HTMLElement);
    fireEvent.click(botonDeLaBarra(CONTINUAR));
    recoger("ficha · avanzar de seccion");
    seccion("anulacion");
    fireEvent.click(botonDeLaBarra(GUARDAR_LOS_CAMBIOS));
    recoger("ficha · guardar en la anulacion");
    cleanup();

    // 6. El cobro nuevo: descartar el borrador y emitir.
    abrirRecibos();
    fireEvent.click(screen.getAllByRole("button", { name: "Cobrar" })[0] as HTMLElement);
    recoger("cobro · empezar");
    // Avanzar de seccion en un borrador saca un toast **distinto** al de un recibo existente
    // (`nuevo ? … : …`, la linea 2026 del artboard). Este paso entro por medir la cobertura y no
    // por escribir la lista: sin el, la regla de abajo no llegaba a ver ese texto — y ahi habia
    // un «Guardado en el borrador.» afirmando una escritura, con la suite entera en verde.
    fireEvent.click(botonDeLaBarra(CONTINUAR));
    recoger("cobro · avanzar en el borrador");
    fireEvent.click(pantalla().querySelector(`[data-accion="${DESCARTAR}"]`) as HTMLElement);
    recoger("cobro · descartar el borrador");
    cleanup();

    abrirRecibos();
    fireEvent.click(screen.getAllByRole("button", { name: "Cobrar" })[0] as HTMLElement);
    fireEvent.change(
      pantalla().querySelector("[data-barra-de-caja] input") as HTMLElement,
      { target: { value: "12345678" } },
    );
    for (const [id, campo, valor] of [
      ["operacion", "fechaOp", "2026-09-06"],
      ["operacion", "horaOp", "10:15"],
      ["operacion", "quienPaga", "El propio contribuyente"],
      ["deuda", "descuento", "No aplica"],
      ["pago", "medio", "Efectivo"],
      ["pago", "recibido", "100.00"],
      ["recibo", "copias", "2"],
      ["anulacion", "motivoAnul", "Error en el importe"],
      ["anulacion", "autoriza", "Jefe de Tesorería"],
    ] as const) {
      seccion(id);
      fireEvent.change(
        (pantalla().querySelector(`[data-campo="${campo}"]`) as HTMLElement)
          .children[1] as HTMLElement,
        { target: { value: valor } },
      );
    }
    fireEvent.click(botonDeLaBarra(COBRAR_Y_EMITIR));
    recoger("cobro · emitir el recibo");
    cleanup();

    // 7. «Guardar y cerrar» del dialogo de cambios sin guardar. Necesita una pestana sucia, y
    //    para eso una pantalla con un campo: es la ranura `Pantalla` que #8 dejo abierta.
    function PantallaQueEdita({ seccion: s, fijarCampo, valorDeCampo }: PropsDePantalla) {
      return (
        <div data-seccion={s}>
          <label>
            Caja
            <input
              value={valorDeCampo("caja", "")}
              onChange={(evento) => fijarCampo("caja", evento.target.value)}
            />
          </label>
        </div>
      );
    }
    // El hash lo dejo en `#recibos` el bloque anterior, y `App` lo lee al montarse: sin esto la
    // pestana que se ensucia seria la de Recibos y «Cerrar Panel» no abriria ningun dialogo.
    window.location.hash = "";
    window.history.replaceState(null, "", window.location.pathname);
    render(<App Pantalla={PantallaQueEdita} />);
    fireEvent.change(screen.getByLabelText("Caja"), { target: { value: "C-4" } });
    fireEvent.click(screen.getByRole("button", { name: /^Cerrar Panel/ }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar y cerrar" }));
    recoger("marco · guardar y cerrar la pestana");

  });

  /**
   * Que se haya recogido algo, con su cuenta.
   *
   * Un recorrido que dejara de sacar toasts —porque un boton cambia de nombre y el `fireEvent`
   * cae en el vacio— dejaria las tres reglas de abajo mirando una lista vacia: verdes, y sin
   * haber visto nada. Es el mismo suelo que `cero-red.mjs` se puso en #15.
   */
  it("el recorrido saca dieciseis toasts, y ninguno vacio", () => {
    expect(recogidos.map(([que]) => que)).toHaveLength(16);
    expect(recogidos.filter(([, texto]) => texto === "").map(([que]) => que)).toEqual([]);
  });

  /**
   * La regla, aplicada a lo recogido.
   *
   * Devolver cualquiera de los cuatro toast a su texto de hoy —«Recibo 0003-0041193 emitido. La
   * cuota ya está descontada de la cuenta corriente.», «Cambios guardados.», «Cambios guardados
   * en el recibo.», «Cambios guardados en Panel.»— pone esta prueba en rojo nombrando la accion.
   */
  it("y ninguno afirma una escritura sin decir que no la hubo", () => {
    const mentirosos = recogidos
      .filter(([, texto]) => PARTICIPIOS_DE_ESCRITURA.test(texto))
      .filter(([, texto]) => !texto.includes(NO_ESTA_CONECTADA))
      .map(([que, texto]) => `${que}: «${texto}»`);
    expect(mentirosos).toEqual([]);
  });

  /**
   * Y la mitad contraria, que es la que impide que la de arriba pase por vacio.
   *
   * Si ningun toast llevara el motivo, la regla de arriba saldria verde —no hay participios que
   * casar— y la aplicacion habria dejado de decir que no registra nada. Los cinco que lo llevan
   * son las cinco acciones que en el sistema de verdad escribirian: avanzar y guardar en un
   * recibo existente, avanzar en un borrador, emitir, y guardar al cerrar una pestana.
   */
  it("y los cinco que escribirian de verdad SI lo dicen", () => {
    const conMotivo = recogidos
      .filter(([, texto]) => texto.includes(NO_ESTA_CONECTADA))
      .map(([que]) => que);
    expect(conMotivo).toEqual([
      "ficha · avanzar de seccion",
      "ficha · guardar en la anulacion",
      "cobro · avanzar en el borrador",
      "cobro · emitir el recibo",
      "marco · guardar y cerrar la pestana",
    ]);
  });

  /**
   * Los que NO llevan el motivo, y por que esta bien que no lo lleven.
   *
   * Es la otra mitad de la decision de AC-3: «decide cuáles afirman un hecho y cuáles no». Un
   * condicional —«Abriría el módulo Catastro.», «Cerraría la sesión.»— no afirma nada; una
   * instruccion tampoco; y «Borrador descartado.» es cierto, porque el borrador vivia en la
   * pantalla y la pantalla lo tiro. Ponerles la coletilla haria mas largo un toast ya honesto y,
   * peor, gastaria el aviso: si todo lo lleva, deja de leerse.
   *
   * La linea que los separa es la de `maqueta.ts`: lo que la pantalla hizo, o lo que paso fuera
   * de ella. «Descartar» tira lo que estaba dentro y por eso es cierto; «Guardado en el
   * borrador.» sonaba a fuera aunque tampoco saliera de la pantalla, y por eso ese si cambio —lo
   * que un cajero lee no es donde vive el dato—.
   */
  it("y los condicionales y los ciertos siguen sin coletilla, que es lo correcto", () => {
    const sinMotivo = Object.fromEntries(
      recogidos.filter(([, texto]) => !texto.includes(NO_ESTA_CONECTADA)),
    );
    expect(sinMotivo["sesion · Mi perfil"]).toBe(abriria("Mi perfil"));
    expect(sinMotivo["sesion · Cerrar sesión"]).toBe(CERRARIA_LA_SESION);
    expect(sinMotivo["cobro · descartar el borrador"]).toBe("Borrador descartado.");
    // Y ninguno de ellos usa un participio de escritura, que es lo que los hace inocentes.
    for (const [que, texto] of Object.entries(sinMotivo)) {
      expect(PARTICIPIOS_DE_ESCRITURA.test(texto), `${que}: «${texto}»`).toBe(false);
    }
  });

  /**
   * Y la frase que este issue existe para quitar no esta en ninguna parte de `src/`.
   *
   * Es complementaria de lo de arriba y no redundante: el recorrido mide lo que las acciones que
   * se pulsan dicen; esto mide que la frase no se haya quedado escrita en una rama que el
   * recorrido no alcanza. Sobre el codigo **sin comentarios**, porque `CobroNuevo.tsx` la cita
   * entera para explicar por que se fue.
   */
  it("y «La cuota ya está descontada de la cuenta corriente» no queda escrita en `src/`", () => {
    const leidas = fuentes();
    expect(leidas.length, "el escaner no leyo ningun archivo: su cero no significa nada")
      .toBeGreaterThan(30);
    expect(
      leidas
        .filter(({ texto }) => sinComentarios(texto).includes("ya está descontada"))
        .map(({ archivo }) => archivo),
    ).toEqual([]);
    // Y la sonda que dice que el escaner no esta ciego: con los comentarios dentro SI aparece,
    // porque el port la cita para que no vuelva. El dia que deje de citarse, esto sale rojo y
    // sobra el quitado de comentarios.
    expect(
      leidas.filter(({ texto }) => texto.includes("ya está descontada")).map((f) => f.archivo),
    ).toEqual(["pantallas/CobroNuevo.tsx"]);
  });

  it("y `nadaSeRegistro` compone el motivo una sola vez", () => {
    expect(nadaSeRegistro("No se guardó nada de Panel")).toBe(
      "No se guardó nada de Panel: esta interfaz no está conectada a ningún sistema.",
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe("AC-4 · la ficha de sesion no inventa a nadie", () => {
  it("la barra dice que no hay sesion, y no un nombre propio", () => {
    render(<App />);
    const ficha = screen.getByRole("button", { name: `Sesión — ${SIN_SESION.nombre}` });
    expect(ficha.textContent).toBe("?Sin sesiónNadie se ha identificado");
  });

  it("y el menu que la repite, tambien", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: `Sesión — ${SIN_SESION.nombre}` }));
    const menu = screen.getByRole("menu", { name: "Sesión" });
    expect(menu.textContent).toContain("Sin sesión");
    expect(menu.textContent).toContain("Nadie se ha identificado");
  });

  /**
   * El nombre que se retira, buscado por su apellido sobre `src/` **sin comentarios**.
   *
   * Los titulares de los recibos —«Zapata Rivas, Óscar», «Castillo Pascuala, María Elena»— se
   * quedan: son casos de ejemplo del artboard, y la banda de AC-2 los declara como tales. Este
   * apellido no era un caso: era **quien opera la pantalla**, en la barra, en el menu y en el
   * campo «Cajero» de los dos formularios, que ademas se imprime en el recibo. O sale del token,
   * o dice que no hay sesion.
   *
   * Que el `dist/` tampoco lo lleve —que es la forma en que `rentas` lo midio en I-1— no se
   * puede afirmar aqui: `yarn verificar` no construye. Lo mide `verificaciones/maqueta.mjs`.
   */
  it("y «Cárdenas» no queda escrito en el codigo de `src/`", () => {
    const leidas = fuentes();
    expect(leidas.length).toBeGreaterThan(30);
    expect(
      leidas
        .filter(({ texto }) => sinComentarios(texto).includes("Cárdenas"))
        .map(({ archivo }) => archivo),
    ).toEqual([]);
    // La sonda de que el escaner ve: con los comentarios dentro aparece en los tres archivos que
    // explican por que se fue.
    expect(
      leidas.filter(({ texto }) => texto.includes("Cárdenas")).map((f) => f.archivo).sort(),
    ).toEqual([
      "barra/BarraGlobal.tsx",
      "datos/barra.ts",
      "datos/cobro-nuevo.ts",
      "datos/valores-del-recibo.ts",
      "marco/maqueta.ts",
    ]);
  });

  /**
   * Y la sesion entra por una prop **sin valor por omision**.
   *
   * Es la mitad estructural, y es la que impide que esto se deshaga solo: con un valor por
   * omision, montar la barra sin pasarla volveria a sacar una identidad de la nada — que es como
   * llego la de ayer, desde `src/datos/`. Se afirma leyendo el codigo porque `tsc` ya impide lo
   * contrario y una prueba no puede afirmar que algo no compila.
   */
  it("y la barra la exige: `sesion` no tiene valor por omision ni sale de `datos/`", () => {
    for (const archivo of ["barra/BarraGlobal.tsx", "barra/MenuDeSesion.tsx"]) {
      const codigo = sinComentarios(readFileSync(join(SRC, archivo), "utf8"));
      expect(codigo, `${archivo} no declara la prop`).toContain("readonly sesion: Sesion;");
      // Un valor por omision se escribe `sesion = X` en la desestructuracion. El `sesion={sesion}`
      // con el que la barra se la pasa al menu lleva `{` detras del igual y no casa; y el
      // `data-menu-de-sesion="1"` tampoco, por el guion de delante — que es lo que la primera
      // version de este escaner SI cazaba, un rojo sobre un archivo correcto.
      expect(codigo, `${archivo} le da un valor por omision`).not.toMatch(
        /(?<![-\w])sesion\s*=\s*[^{]/,
      );
      expect(codigo, `${archivo} declara la sesion opcional`).not.toContain("sesion?:");
      expect(codigo, `${archivo} vuelve a sacar la sesion de datos/`).not.toContain("SIN_SESION");
    }
    // Y quien la pone es el marco, una sola vez.
    expect(
      fuentes()
        .filter(({ texto }) => sinComentarios(texto).includes("SIN_SESION"))
        .map(({ archivo }) => archivo)
        .sort(),
    ).toEqual([
      "App.tsx",
      "datos/cobro-nuevo.ts",
      "datos/valores-del-recibo.ts",
      "marco/maqueta.ts",
    ]);
  });

  it("y `src/datos/` ya no exporta ninguna sesion", () => {
    const indice = readFileSync(join(SRC, "datos", "index.ts"), "utf8");
    expect(sinComentarios(indice)).not.toMatch(/\bSESION\b(?!.*OPCIONES)/);
    expect(indice).toContain("OPCIONES_DE_SESION");
  });
});
