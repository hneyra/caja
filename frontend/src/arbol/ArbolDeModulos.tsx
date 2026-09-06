import { useState, type CSSProperties } from "react";
import { ARBOL, COLA, ICONOS_POR_MODULO, MI_MODULO } from "@/datos";

/**
 * El arbol de modulos de la izquierda: el filtro, los doce modulos con sus cuatro submodulos y
 * la cola de trabajo.
 *
 * Portado de `TesoreriaV6.dc.html` — la **variante A** en la plantilla de las lineas 224-265, el
 * filtro en 209-222 y 308-312, y la cola en 362-373. La logica que lo alimenta: `arbolModulos`
 * (1574-1625), `filtroConteo` (1513-1525), `sinCoincidencias` (1526-1531) y `cola` (1823-1830).
 * Los estilos van **en linea y con los valores del artboard**, que es la doctrina de `PORTAR.md`.
 *
 * <h2>Solo la variante A</h2>
 *
 * El artboard trae tres panales y un conmutador para compararlos, y el propio artboard marca ese
 * conmutador como **«Conmutador del experimento: no es parte del producto»** (linea 354). Se porta
 * el acordeon con chevron —la variante que el artboard trae elegida de entrada— y no se porta la
 * segunda, ni la tercera, ni el selector, ni su corte de 1 180 px. El comentario de las lineas 224-227 explica la eleccion: el
 * chevron hacia abajo es el gesto convencional de «esto se abre», mientras que el «>» girando leia
 * como «entrar».
 *
 * <h2>Donde vive el estado, y por que aqui</h2>
 *
 * `desplegado` y `filtro` son estado **de este arbol**: nadie mas los lee. En el artboard viven en
 * el `state` unico del componente porque alli todo vive en el mismo sitio, no porque los comparta
 * nadie —lo unico que los mira fuera de este `aside` son las variantes B y C, que no se portan—.
 *
 * Lo que si viene de fuera son las pestanas: `abiertas`, `activa` y `sucias`. El arbol las
 * **dibuja** y no las gobierna, y por eso las recibe. Abrirlas y cerrarlas es del issue siguiente.
 *
 * <h2>Que colores son token y cuales no</h2>
 *
 * El mismo criterio que en `BarraGlobal`: donde `src/ds/tokens/` declara ese valor exacto se
 * escribe `var(--token)`; donde no, va el literal del artboard. `#004670`, `#C0492F`, `#C08A00` y
 * `#EFF7FC` **no son constantes del artboard** —solo lo son `AZUL`, `AZUL_OSC`, `AZUL_SUAVE`,
 * `ACENTO`, `LINEA`, `LINEA_2`, `BORDE_CAMPO`, `TINTA`, `TINTA_2`, `TINTA_3` y `SUP`, lineas
 * 914-924—, y `verificaciones/tokens.test.ts` exige que `tokens/` no declare ningun color fuera de
 * esa lista: inventarles un token aqui saldria rojo alli.
 */

/** Lo que un destino lleva ademas de su clave. Hoy solo la cola lo usa. */
export interface DestinoDelArbol {
  /** El indice del nodo de «Cajas y arqueo» que se abre. Es una posicion, no una cantidad. */
  readonly nodo?: number;
}

/**
 * La seccion a la que lleva la cola de trabajo: «Cajas y arqueo», cuyo hash es `#cajas`.
 *
 * La clave es `territorio` y no `cajas` porque es la del artboard, y renombrarla obligaria a
 * renombrarla tambien en `SECCIONES` y en el hash — esta explicado en `datos/navegacion.ts`.
 */
const SECCION_DE_CAJAS = "territorio";

export interface ArbolDeModulosProps {
  /** Las claves de los submodulos abiertos en pestanas. Es lo que cuenta la pastilla del modulo. */
  readonly abiertas: readonly string[];
  /** La clave del submodulo activo, o `null` si no hay ninguno. */
  readonly activa: string | null;
  /**
   * Los submodulos con cambios sin guardar, que llevan un ` *` pegado al rotulo.
   *
   * Hoy nadie los marca —ensuciar una pestana es editar un campo de una pantalla, y las pantallas
   * llegan despues—, pero el arbol los dibuja: un destino que el diseno lista y el port no pinta
   * es la mitad del trabajo (`PORTAR.md`, regla 5).
   */
  readonly sucias?: Readonly<Record<string, boolean>>;
  /** Que hacer al pulsar un submodulo o una entrada de la cola. El arbol no navega: avisa. */
  readonly alIr: (clave: string, extra?: DestinoDelArbol) => void;
}

/** El bloque de submodulos: sangria con linea, que es lo que dice de quien cuelgan (linea 250). */
const SANGRIA: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 1,
  padding: "2px 0 7px 15px",
  marginLeft: 16,
  borderLeft: "1px solid var(--linea-2)",
};

/** El rotulo de un submodulo que esta abierto en otra pestana (linea 1614). */
const MARCA_DE_ABIERTA: CSSProperties = {
  fontSize: 9.5,
  fontWeight: "var(--peso-fuerte)",
  textTransform: "uppercase",
  letterSpacing: ".06em",
  color: "var(--tinta-3)",
  flex: "0 0 auto",
};

/** El texto de la linea 310, literal. */
const SIN_COINCIDENCIAS =
  "Ningún módulo ni submódulo se llama así. " +
  "Pruebe con «papeleta», «acta», «recibo» o «expediente».";

/** El rotulo del campo de filtro, que es a la vez su `placeholder` y su `aria-label` (linea 212). */
const ROTULO_DEL_FILTRO = "Filtrar módulos y submódulos";

/** Casa `q` contra el rotulo, como el artboard: en minusculas y por subcadena. */
const casa = (texto: string, q: string) => texto.toLowerCase().indexOf(q) >= 0;

/**
 * El recuento que va debajo del campo (lineas 1513-1525).
 *
 * Cuenta **lo que se va a ver**: si casa el nombre del modulo se ven sus cuatro submodulos, y si
 * solo casan algunos se ven esos. Por eso suma `4` en un caso y `casan` en el otro, y por eso el
 * recuento no es «cuantos submodulos contienen el texto».
 */
export function recuentoDelFiltro(q: string): string {
  if (q === "") return "";
  let modulos = 0;
  let hojas = 0;
  for (const rama of ARBOL) {
    const casaModulo = casa(rama.modulo, q);
    const casan = rama.submodulos.filter((h) => casa(h.label, q)).length;
    if (casaModulo || casan > 0) modulos += 1;
    hojas += casaModulo ? rama.submodulos.length : casan;
  }
  if (modulos === 0) return "Sin coincidencias";
  return (
    `${modulos} ${modulos === 1 ? "módulo" : "módulos"} · ` +
    `${hojas} ${hojas === 1 ? "submódulo" : "submódulos"}`
  );
}

export function ArbolDeModulos({ abiertas, activa, sucias = {}, alIr }: ArbolDeModulosProps) {
  /**
   * Solo un modulo desplegado a la vez, y al arrancar el propio. `MI_MODULO` es «Tesorería», que
   * es con lo que el artboard arranca (`desplegado: 'Tesorería'`, linea 1219): se toma de ahi en
   * vez de escribir el rotulo otra vez, que seria una segunda fuente de verdad para el mismo dato.
   */
  const [desplegado, fijarDesplegado] = useState<string | null>(MI_MODULO);
  const [filtro, fijarFiltro] = useState("");

  const q = filtro.trim().toLowerCase();
  const hayFiltro = q !== "";

  const ramasVisibles = ARBOL.filter(
    (rama) => !hayFiltro || casa(rama.modulo, q) || rama.submodulos.some((h) => casa(h.label, q)),
  );

  /**
   * Sin coincidencias, en vez del arbol.
   *
   * En el artboard los dos bloques se dibujan a la vez —la variante A queda vacia y el mensaje va
   * debajo, cada uno con su `flex:1`, o sea el mensaje centrado en la mitad de abajo—. Aqui es un
   * `?:` porque los dos casos **son excluyentes por construccion**: `ramasVisibles` esta vacia
   * exactamente cuando no casa nada. Es la unica diferencia con la plantilla, y es de colocacion.
   */
  const sinCoincidencias = ramasVisibles.length === 0;

  return (
    <aside
      aria-label="Módulos y submódulos"
      style={{
        flex: "0 0 252px",
        width: 252,
        background: "#fff",
        borderRight: "1px solid var(--linea)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          flex: "0 0 auto",
          padding: "10px 11px",
          borderBottom: "1px solid var(--linea-2)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            border: "1px solid var(--linea)",
            borderRadius: "var(--radio-6)",
            padding: "6px 9px",
            background: "var(--sup)",
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--tinta-3)"
            strokeWidth="1.8"
            strokeLinecap="round"
            style={{ flex: "0 0 auto" }}
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-4.3-4.3" />
          </svg>
          <input
            value={filtro}
            onChange={(e) => fijarFiltro(e.target.value)}
            placeholder={ROTULO_DEL_FILTRO}
            aria-label={ROTULO_DEL_FILTRO}
            style={{
              flex: 1,
              minWidth: 0,
              border: 0,
              background: "transparent",
              fontSize: 12.5,
              outline: "none",
            }}
          />
          {/* El aspa solo esta cuando hay algo que quitar: un boton que no hace nada estorba. */}
          {hayFiltro && (
            <button
              type="button"
              onClick={() => fijarFiltro("")}
              aria-label="Quitar el filtro"
              style={{
                border: 0,
                background: "transparent",
                padding: 0,
                cursor: "pointer",
                color: "var(--tenue)",
                flex: "0 0 auto",
              }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          )}
        </div>
        {hayFiltro && (
          <p style={{ margin: "7px 2px 0", fontSize: 11, color: "var(--tinta-3)" }}>
            {recuentoDelFiltro(q)}
          </p>
        )}
      </div>

      {sinCoincidencias ? (
        <div style={{ flex: 1, display: "grid", placeItems: "center", padding: "24px 18px" }}>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              lineHeight: 1.55,
              color: "var(--tinta-3)",
              textAlign: "center",
              textWrap: "pretty",
            }}
          >
            {SIN_COINCIDENCIAS}
          </p>
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "auto",
          }}
        >
          <div
            style={{
              padding: "7px 7px 10px",
              display: "flex",
              flexDirection: "column",
              gap: 1,
            }}
          >
            {ramasVisibles.map((rama) => {
              const casaModulo = hayFiltro && casa(rama.modulo, q);
              // Si casa el nombre del modulo se ven sus cuatro submodulos; si no, solo los que casan.
              const hojas =
                !hayFiltro || casaModulo
                  ? rama.submodulos
                  : rama.submodulos.filter((h) => casa(h.label, q));
              // Con filtro puesto se despliega todo lo que casa: buscar es para ver, no para abrir.
              const abierto = hayFiltro || desplegado === rama.modulo;
              const cuantasAbiertas = rama.submodulos.filter((h) =>
                abiertas.includes(h.clave),
              ).length;

              return (
                <div key={rama.modulo}>
                  <button
                    type="button"
                    className="hov-arbol"
                    data-modulo={rama.modulo}
                    onClick={() =>
                      fijarDesplegado((actual) => (actual === rama.modulo ? null : rama.modulo))
                    }
                    aria-expanded={abierto}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      width: "100%",
                      border: 0,
                      borderRadius: "var(--radio-7)",
                      padding: "7px 8px",
                      cursor: "pointer",
                      background: abierto ? "var(--azul-suave)" : "transparent",
                      color: abierto ? "#004670" : "var(--tinta)",
                    }}
                  >
                    <span
                      style={{
                        display: "grid",
                        placeItems: "center",
                        width: 24,
                        height: 24,
                        borderRadius: "var(--radio-6)",
                        flex: "0 0 auto",
                        background: abierto ? "var(--azul)" : "var(--fondo)",
                        color: abierto ? "#fff" : "var(--tinta-3)",
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        {(ICONOS_POR_MODULO[rama.modulo] ?? []).map((trazo) => (
                          <path key={trazo} d={trazo} />
                        ))}
                      </svg>
                    </span>
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        textAlign: "left",
                        fontSize: 13.5,
                        fontWeight: "var(--peso-medio)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {rama.modulo}
                    </span>
                    {/* Cuantas pestanas suyas hay abiertas. Con cero no hay pastilla: un `0` en
                        una pastilla se lee como una cifra que importa, y no importa. */}
                    {cuantasAbiertas > 0 && (
                      <span
                        style={{
                          fontSize: 9.5,
                          fontWeight: "var(--peso-fuerte)",
                          borderRadius: "var(--radio-pastilla)",
                          padding: "1px 6px",
                          flex: "0 0 auto",
                          background: abierto ? "#fff" : "var(--azul-suave)",
                          color: "#004670",
                        }}
                      >
                        {String(cuantasAbiertas)}
                      </span>
                    )}
                    <span
                      style={{
                        display: "grid",
                        placeItems: "center",
                        width: 16,
                        height: 16,
                        flex: "0 0 auto",
                        color: "var(--tenue)",
                        transform: `rotate(${abierto ? "180" : "0"}deg)`,
                        transition: "transform .16s ease",
                      }}
                    >
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.1"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M6 9.5l6 6 6-6" />
                      </svg>
                    </span>
                  </button>

                  {abierto && (
                    <div style={SANGRIA}>
                      {hojas.map((hoja) => {
                        const esActiva = activa === hoja.clave;
                        const yaAbierta = abiertas.includes(hoja.clave);
                        return (
                          <button
                            key={hoja.clave}
                            type="button"
                            className="hov-arbol"
                            data-submodulo={hoja.clave}
                            onClick={() => alIr(hoja.clave)}
                            aria-current={esActiva ? "true" : "false"}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              width: "100%",
                              border: 0,
                              borderRadius: "var(--radio-6)",
                              padding: "7px 9px",
                              cursor: "pointer",
                              background: esActiva ? "var(--azul-suave)" : "transparent",
                              color: esActiva ? "#004670" : "var(--tinta-2)",
                              fontWeight: esActiva ? "var(--peso-fuerte)" : "var(--peso-normal)",
                            }}
                          >
                            <span
                              style={{ flex: 1, minWidth: 0, textAlign: "left", fontSize: 13 }}
                            >
                              {hoja.label + (sucias[hoja.clave] === true ? " *" : "")}
                            </span>
                            {yaAbierta && !esActiva && <span style={MARCA_DE_ABIERTA}>abierta</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ flex: "0 0 auto", padding: 11, borderTop: "1px solid var(--linea-2)" }}>
        <p
          style={{
            margin: "0 0 7px",
            fontSize: 10.5,
            fontWeight: "var(--peso-medio)",
            textTransform: "uppercase",
            letterSpacing: ".1em",
            color: "var(--tinta-3)",
          }}
        >
          Cola de trabajo
        </p>
        {COLA.map((entrada) => (
          <button
            key={entrada.label}
            type="button"
            className="hov-arbol"
            onClick={() => alIr(SECCION_DE_CAJAS, { nodo: entrada.nodo })}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              width: "100%",
              textAlign: "left",
              border: 0,
              borderRadius: "var(--radio-5)",
              padding: "6px 7px",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "var(--radio-circulo)",
                flex: "0 0 auto",
                background: entrada.tono === "bad" ? "#C0492F" : "#C08A00",
              }}
            />
            <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: "var(--tinta-2)" }}>
              {entrada.label}
            </span>
            <span
              style={{
                fontSize: 12.5,
                fontWeight: "var(--peso-medio)",
                color: "var(--tinta)",
              }}
            >
              {entrada.cuantos}
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}
