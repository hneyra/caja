// @vitest-environment happy-dom
//
// **La regla de foco de los campos, en su propio archivo.** Vitest aisla el entorno por
// archivo, y esta comprobacion necesita las dos cosas que ese aislamiento le da.
//
// POR QUE happy-dom Y NO EL jsdom DEL RESTO DE LA SUITE
// No es porque jsdom no aplique pseudo-clases: **si las aplica**. Una version anterior de este
// trabajo lo afirmo por escrito, y era falso; el ultimo `describe` de este archivo lo mide en
// vez de repetirlo. Lo que jsdom no hace es **resolver `var()`** en una propiedad calculada, y
// como este diseno esta escrito con tokens le sale `0 0 0 3px var(--anillo-campo)` en lugar
// del color. Esa —y solo esa— es la diferencia que decide el entorno.
//
// LO QUE ENGANO A LA PRIMERA MEDICION
// El entorno **memoriza el estilo calculado de cada elemento** la primera vez que se le pide, y
// `focus()` no invalida esa memoria: leer antes de enfocar devuelve "" para siempre. La sonda
// original leyo antes de enfocar, vio "" y se lo atribuyo a la pseudo-clase. **No es cosa de
// happy-dom**: jsdom se comporta igual, medido. Por eso `campoEnfocado()` enfoca antes de leer.
//
// LO QUE ESTO NO PRUEBA
// No prueba lo que un navegador **pinta**. Un emulador de DOM no dibuja; afirma lo que su
// cascada calcula. Ver la regla de foco de verdad es trabajo del arnes de Playwright contra
// Chromium: desde #15 existe y es `verificaciones/mirar.mjs`, que recorre la aplicacion con
// `Tab` y lee el anillo de **cada** parada. Y esa espera valio la pena: lo primero que encontro
// fue que el anillo del acento no llegaba a ningun campo, cosa que este archivo daba por buena
// —ver la prueba que cambio de signo—. Lo de aqui es lo mas fuerte que se puede afirmar sin
// navegador, y conviene no confundirlo con mas.
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
// Lo importa Vite con `css: true`, o sea resolviendo la cadena real de `@import`: lo que esta
// prueba mide es el mismo CSS que se despliega, no una copia escrita aqui al lado.
import "../src/ds/global.css";

/** Lo que el artboard escribe en su linea 25. Se compara contra esto, literal. */
const ANILLO = "0 0 0 3px #D3EBFA";

/** Un campo recien creado, enfocado ANTES de leerle el estilo. Ver la nota de arriba. */
function campoEnfocado(): HTMLInputElement {
  const campo = document.createElement("input");
  document.body.appendChild(campo);
  campo.focus();
  return campo;
}

describe("la regla de foco de los campos llega al elemento", () => {
  it(`un input enfocado recibe el anillo \`${ANILLO}\``, () => {
    expect(getComputedStyle(campoEnfocado()).boxShadow).toBe(ANILLO);
  });

  it("y ademas tine el borde de azul", () => {
    expect(getComputedStyle(campoEnfocado()).borderColor).toBe("#005284");
  });

  /**
   * **Esta asercion cambio de signo con #15, y es el cambio lo que hay que leer.**
   *
   * Decia `expect(estilo.outlineStyle).toBe("none")`, porque la linea 25 del artboard le quita
   * al campo enfocado el `outline` del navegador. Lo que no se habia medido es que ese `outline:
   * none` **tambien apagaba el anillo del acento**: `input:focus` vale (0,1,1) y `:focus-visible`
   * a secas (0,1,0), asi que ganaba tambien con el foco del teclado — que es justo cuando el
   * anillo tiene que verse. Medido en Chromium por `verificaciones/mirar.mjs`, que es el arnes
   * que la cabecera de este archivo anunciaba «con el issue de accesibilidad».
   *
   * `global.css` le pone `!important` al anillo por eso, y con el la regla llega tambien aqui:
   * happy-dom **si** aplica `:focus-visible` a un campo enfocado con `focus()` —medido, es lo
   * que puso esta prueba en rojo—. El anillo propio del campo no se va: los dos conviven, que es
   * lo que afirma la prueba de arriba.
   */
  it("y con el foco visible recibe ADEMAS el anillo del acento", () => {
    const estilo = getComputedStyle(campoEnfocado());
    expect(estilo.outlineStyle).toBe("solid");
    expect(estilo.outlineColor).toBe("#52BDEF");
  });

  it("un input SIN foco no recibe nada", () => {
    // Es la mitad que hace falta: sin ella, un `box-shadow` puesto a todos los campos
    // —enfocados o no— pasaria la primera prueba.
    const suelto = document.createElement("input");
    document.body.appendChild(suelto);
    expect(getComputedStyle(suelto).boxShadow).toBe("");
  });
});

describe("y la afirmacion no depende del orden de las pruebas", () => {
  /**
   * Por que existe esta prueba.
   *
   * Mientras las de foco vivian dentro de `tokens.test.ts`, la asercion fuerte pasaba **por el
   * orden en que caian**: alli, leer el estilo de un input sin foco envenenaba la sustitucion
   * de `var()` para todo lo que viniera despues, y la prueba del campo enfocado solo salia
   * bien porque corria antes. Una verificacion que depende de eso no mide lo que dice medir.
   *
   * Separar el archivo es lo que lo arregla. Esta prueba lo fija: hace primero la lectura que
   * envenenaba y comprueba que aqui **ya no** envenena. Si algun dia estas pruebas vuelven a
   * compartir archivo con otras, se pone roja aqui — que es donde se entiende— y no en una
   * pantalla.
   */
  it("un campo enfocado leido DESPUES de uno sin foco sigue resolviendo el token", () => {
    const suelto = document.createElement("input");
    document.body.appendChild(suelto);
    expect(getComputedStyle(suelto).boxShadow).toBe("");

    expect(getComputedStyle(campoEnfocado()).boxShadow).toBe(ANILLO);
  });
});

describe("por que este archivo no usa el jsdom del resto de la suite", () => {
  /**
   * Las dos mitades, medidas y no afirmadas.
   *
   * Aqui habia antes una prueba que comprobaba que `navigator.userAgent` dijera «HappyDOM».
   * Eso **no podia fallar por el motivo que decia comprobar**: era un comentario disfrazado de
   * verificacion. Esta si mide, sobre un jsdom levantado con el mismo documento, y se pondra
   * roja sola el dia que jsdom resuelva `var()` — que es el dia en que la excepcion sobra.
   */
  const sombraConJsdom = (id: string) => {
    const hoja = `
      :root { --anillo-campo: #D3EBFA }
      input:focus { box-shadow: 0 0 0 3px var(--anillo-campo) }
      .literal:focus { box-shadow: 0 0 0 3px #D3EBFA }
    `;
    const { window: v } = new JSDOM(
      `<!doctype html><html><head><style>${hoja}</style></head>` +
        `<body><input id="conToken"><input id="conLiteral" class="literal"></body></html>`,
      { pretendToBeVisual: true },
    );
    const campo = v.document.getElementById(id) as HTMLInputElement;
    campo.focus();
    return v.getComputedStyle(campo).boxShadow;
  };

  it("jsdom SI aplica la pseudo-clase `:focus`", () => {
    // Lo que la primera version de este trabajo negaba por escrito, y era falso.
    expect(sombraConJsdom("conLiteral")).toBe(ANILLO);
  });

  it("pero NO resuelve `var()`: devuelve el nombre del token", () => {
    // Y esta es la unica razon real del cambio de entorno.
    expect(sombraConJsdom("conToken")).toBe("0 0 0 3px var(--anillo-campo)");
  });
});
