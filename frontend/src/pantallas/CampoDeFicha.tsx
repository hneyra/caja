import type { CSSProperties } from "react";
import type { Campo, Paso } from "@/datos";
import { MARCADO, SIN_MARCAR } from "@/datos";

/**
 * El renderizador de campos de la ficha: **las seis clases que el artboard dibuja**.
 *
 * Portado de `TesoreriaV6.dc.html`: la plantilla de las lineas 671-706 —el `<label>` con sus
 * seis `sc-if`— y la logica de `campo(f, d)` (1395-1409) y `faltan(p, d)` (1411-1417). Los
 * estilos van **en linea y con los valores del artboard**, que es la doctrina de `PORTAR.md`.
 *
 * <h2>Que decide que se dibuja</h2>
 *
 * El tipo `t` del campo, y nada mas: sin `t` es un `<input>` de texto (linea 1405). Las seis
 * ramas son excluyentes y estan escritas como un `switch` sobre {@link TipoDeCampo}, de modo que
 * un tipo nuevo no puede colarse dibujando la rama de texto por descarte: TypeScript exige la
 * rama, y `noFallthroughCasesInSwitch` la vigila.
 *
 * <h2>El estilo de error, y por que aqui no se puede ver</h2>
 *
 * `IN_MAL` (linea 927) pide **tres** cosas a la vez: que el campo sea obligatorio, que este
 * vacio, y que **ya se haya intentado cobrar** (`state.intento`). Ese tercero lo enciende un
 * solo sitio del artboard —la emision del cobro nuevo, linea 2021—, que es de #13. En un recibo
 * existente nadie lo enciende, de modo que **desde esta pantalla el estilo de error no se puede
 * alcanzar**. Por eso {@link estiloDeCampo} es una funcion pura con `intento` como argumento y
 * se mide como tal: una prueba que solo pulsara botones no podria distinguirla de una que
 * devolviera siempre `IN`.
 */

/** La palabra que llevan los campos que se pueden dejar vacios (linea 675). */
export const OPCIONAL = "opcional";

/**
 * `IN`, el estilo normal de un campo (linea 926).
 *
 * `#C3CFD9` es la constante `BORDE_CAMPO` del artboard (linea 920), asi que va por su token.
 */
export const ESTILO_DE_CAMPO: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid var(--borde-campo)",
  borderRadius: "var(--radio-6)",
  padding: "9px 10px",
  background: "#fff",
  fontSize: 14,
};

/**
 * `IN_MAL`, el estilo de un obligatorio vacio despues de intentar cobrar (linea 927).
 *
 * Se escribe entero y no como una copia de {@link ESTILO_DE_CAMPO} con dos cambios: asi las dos
 * declaraciones se leen una al lado de la otra, que es como estan en el artboard. `#A8321E` y
 * `#FFF9F8` **no** son constantes suyas —no aparecen en las lineas 914-924—, asi que van
 * literales por lo mismo que `#7E96A8` en `global.css`: darles un token seria ampliar la paleta
 * del diseno desde el port.
 */
export const ESTILO_DE_CAMPO_MAL: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #A8321E",
  borderRadius: "var(--radio-6)",
  padding: "9px 10px",
  background: "#FFF9F8",
  fontSize: 14,
};

/** El valor de solo lectura (linea 701): borde **discontinuo**, fondo elevado y cifras tabulares. */
export const ESTILO_DE_SOLO_LECTURA: CSSProperties = {
  display: "block",
  border: "1px dashed var(--borde-campo)",
  borderRadius: "var(--radio-6)",
  padding: "9px 10px",
  background: "var(--sup)",
  fontSize: 13.5,
  color: "var(--tinta-2)",
  fontVariantNumeric: "tabular-nums",
};

/**
 * Si un campo hay que llenarlo: **ni opcional, ni de solo lectura, ni una casilla** (linea 1398).
 *
 * Los dos ultimos no son una cortesia: un `ro` no lo escribe nadie —lo trae el sistema— y una
 * casilla sin marcar es una respuesta, no un hueco. Marcarlos obligatorios dejaria la ficha
 * pidiendo que se rellene lo que no se puede rellenar.
 */
export const esObligatorio = (campo: Campo) =>
  campo.opcional !== true && campo.t !== "ro" && campo.t !== "chk";

/**
 * Cuantos obligatorios quedan vacios en una seccion. Es el `faltan(p, d)` de la linea 1411.
 *
 * Se exporta aunque **la ficha de un recibo existente no lo enseñe**: el contador de las
 * pestanas es del cobro nuevo (`nuevo && f > 0`, linea 1948). Que aqui no se vea es una
 * afirmacion comprobable justamente porque esta cuenta se puede hacer aparte y da 2 en
 * «Anulación»; sin ella, «no hay contadores» seria indistinguible de «la cuenta da cero».
 */
export const faltan = (paso: Paso, valorDe: (clave: string) => string) =>
  paso.campos.filter((campo) => esObligatorio(campo) && valorDe(campo.clave) === "").length;

/**
 * El estilo del control: el de error solo si se cumplen las **tres** condiciones de la 1404.
 *
 * El `valor === undefined` del `vacio` del artboard (linea 1397) no tiene equivalente aqui: el
 * valor llega ya resuelto contra `VALORES_DEL_RECIBO`, y un campo sin entrada llega como `''`,
 * que es el otro miembro de ese mismo `||`.
 */
export const estiloDeCampo = (campo: Campo, valor: string, intento: boolean): CSSProperties =>
  esObligatorio(campo) && valor === "" && intento ? ESTILO_DE_CAMPO_MAL : ESTILO_DE_CAMPO;

export interface CampoDeFichaProps {
  readonly campo: Campo;
  /** Lo que el campo lleva escrito, ya resuelto contra lo que el cajero haya tocado. */
  readonly valor: string;
  /** Si ya se intento cobrar. Lo enciende la emision del cobro nuevo (#13), nunca esta ficha. */
  readonly intento: boolean;
  /** Guarda el valor nuevo. Es lo que ademas **ensucia la pestana** (`set`, linea 1352). */
  readonly alCambiar: (valor: string) => void;
}

export function CampoDeFicha({ campo, valor, intento, alCambiar }: CampoDeFichaProps) {
  const estilo = estiloDeCampo(campo, valor, intento);
  const tipo = campo.t ?? "text";

  /** El `f.on` de la linea 1407 para todo lo que no es una casilla. */
  const alEscribir = (e: { target: { value: string } }) => alCambiar(e.target.value);

  const control = () => {
    switch (tipo) {
      case "text":
        return <input value={valor} onChange={alEscribir} placeholder={campo.ph} style={estilo} />;
      case "date":
        return <input type="date" value={valor} onChange={alEscribir} style={estilo} />;
      case "sel":
        return (
          <select value={valor} onChange={alEscribir} style={estilo}>
            {(campo.o ?? []).map((opcion) => (
              <option key={opcion} value={opcion}>
                {opcion}
              </option>
            ))}
          </select>
        );
      case "area":
        return (
          <textarea
            value={valor}
            onChange={alEscribir}
            rows={3}
            placeholder={campo.ph}
            style={{
              width: "100%",
              boxSizing: "border-box",
              border: "1px solid var(--borde-campo)",
              borderRadius: "var(--radio-6)",
              padding: "9px 10px",
              background: "#fff",
              // El artboard repite aqui la familia (linea 692) porque su `<textarea>` no la
              // hereda; `global.css` la reparte con `font: inherit`, y el token es la misma.
              fontFamily: "var(--familia)",
              fontSize: 14,
              resize: "vertical",
            }}
          />
        );
      case "chk":
        return (
          <span
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 9,
              border: "1px solid var(--borde-campo)",
              borderRadius: "var(--radio-6)",
              padding: "9px 10px",
              background: "#fff",
            }}
          >
            <input
              type="checkbox"
              checked={valor === MARCADO}
              onChange={(e) => alCambiar(e.target.checked ? MARCADO : SIN_MARCAR)}
              style={{
                accentColor: "var(--azul)",
                width: 17,
                height: 17,
                flex: "0 0 auto",
                marginTop: 1,
              }}
            />
            <span style={{ fontSize: 13.5, lineHeight: 1.4, color: "var(--tinta-2)" }}>
              {campo.ph}
            </span>
          </span>
        );
      case "ro":
        return <span style={ESTILO_DE_SOLO_LECTURA}>{valor}</span>;
    }
  };

  return (
    <label
      // `data-ancho="1"` es lo que `global.css` traduce a `grid-column: 1 / -1`. Va como el
      // artboard lo escribe —`'1'` o `'0'`, linea 1401— y no como un atributo que aparece y
      // desaparece: asi la ausencia de la regla se distingue de la ausencia del campo.
      data-ancho={campo.ancho === true ? "1" : "0"}
      data-campo={campo.clave}
      data-tipo={tipo}
      style={{ display: "block", minWidth: 0 }}
    >
      <span style={{ display: "flex", alignItems: "baseline", gap: 7, marginBottom: 5 }}>
        <span
          style={{ fontSize: 12.5, fontWeight: "var(--peso-medio)", color: "var(--tinta-2)" }}
        >
          {campo.label}
        </span>
        {campo.opcional === true && (
          <span style={{ fontSize: 11.5, color: "var(--tenue)" }}>{OPCIONAL}</span>
        )}
      </span>

      {control()}

      {campo.ayuda !== undefined && (
        <span
          data-ayuda="1"
          style={{
            display: "block",
            fontSize: 12,
            lineHeight: 1.45,
            color: "var(--tinta-3)",
            marginTop: 5,
            textWrap: "pretty",
          }}
        >
          {campo.ayuda}
        </span>
      )}
    </label>
  );
}
