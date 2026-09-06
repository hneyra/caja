import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { INSIGNIAS } from "@/ds/tokens";
import {
  ARBOL,
  CAJAS,
  CAJAS_CERRADAS,
  DETERMINACIONES,
  HOJAS,
  ICONOS_DE_SECCION,
  ICONOS_POR_MODULO,
  MI_MODULO,
  MODULOS,
  NODOS,
  PASOS,
  RECIBOS,
  SECCIONES,
  TARIFARIO,
} from "@/datos";
import type { Columna, Fila } from "@/datos";

/**
 * Lo que `src/datos/` tiene que seguir diciendo.
 *
 * Son datos copiados a mano de un artboard de 2 088 lineas, y el modo de fallo de copiar a mano es
 * silencioso: una fila que se queda corta, un digito que baila, un submodulo con la clave de otro.
 * Nada de eso rompe la compilacion y **todo eso sale en la pantalla**.
 *
 * De ahi los tres tipos de comprobacion que hay aqui:
 *
 * <ul>
 *   <li><b>Los recuentos</b>, que son los del issue #5 y los que el artboard dibuja.</li>
 *   <li><b>Las cuentas que el propio diseno hace</b> —las tres cuotas suman el total del recibo, y
 *       las cuatro tablas de arqueo cuadran—. Se comprueban <b>sobre las cadenas</b>, convirtiendo
 *       solo aqui dentro: en el codigo de produccion no hay una sola conversion de importe.</li>
 *   <li><b>Los emparejamientos</b>: nodo con tabla, seccion con icono, modulo con dibujo. Un nodo
 *       sin tabla es un panel en blanco, y no lo dice ningun tipo.</li>
 * </ul>
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const DATOS = join(AQUI, "..", "src", "datos");

function requerir<T>(valor: T | undefined, que: string): T {
  if (valor === undefined) throw new Error(`Falta ${que}`);
  return valor;
}

/**
 * Un importe del artboard, en centimos enteros.
 *
 * Vive **solo aqui**: es la conversion que el codigo de produccion tiene prohibida (regla 1 de
 * CLAUDE.md). Y va a centimos y no a decimales porque `0.1 + 0.2` no es `0.3`, que es exactamente
 * el motivo de la regla.
 */
function centimos(importe: string): number {
  const limpio = importe.replace(/[^0-9.-]/g, "");
  if (limpio === "") throw new Error(`No es una cifra: '${importe}'`);
  return Math.round(Number(limpio) * 100);
}

/** El valor de una celda por el titulo de su columna. */
function celda(columnas: readonly Columna[], fila: Fila, titulo: string): string {
  const indice = columnas.findIndex((columna) => columna.titulo === titulo);
  if (indice < 0) throw new Error(`No hay columna '${titulo}'`);
  return requerir(fila[indice], `la celda '${titulo}'`);
}

describe("los recuentos del artboard", () => {
  it("son doce modulos y cuarenta y ocho submodulos", () => {
    expect(MODULOS).toHaveLength(12);
    expect(ARBOL).toHaveLength(12);
    expect(ARBOL.flatMap((rama) => rama.submodulos)).toHaveLength(48);
    // Y las 48 claves son distintas: si dos coincidieran, `HOJAS` perderia una sin decirlo.
    expect(Object.keys(HOJAS)).toHaveLength(48);
  });

  it("son cuatro secciones propias, y las cuatro tienen icono", () => {
    expect(SECCIONES).toHaveLength(4);
    expect(Object.keys(ICONOS_DE_SECCION)).toHaveLength(4);
    for (const seccion of SECCIONES) {
      expect(ICONOS_DE_SECCION[seccion.clave].length).toBeGreaterThan(0);
    }
  });

  it("son cuatro cajas, y dos de ellas estan cerradas", () => {
    expect(CAJAS).toHaveLength(4);
    expect(CAJAS_CERRADAS).toEqual(["C-1 — cerrada ayer", "C-2 — cerrada ayer"]);
  });

  it("son cinco secciones del recibo y cinco recibos en el turno", () => {
    expect(PASOS).toHaveLength(5);
    expect(PASOS.map((paso) => paso.id)).toEqual([
      "operacion",
      "deuda",
      "pago",
      "recibo",
      "anulacion",
    ]);
    expect(RECIBOS).toHaveLength(5);
  });

  it("son seis nodos de arqueo y tres pestanas de tarifario", () => {
    expect(NODOS).toHaveLength(6);
    expect(DETERMINACIONES).toHaveLength(6);
    expect(TARIFARIO).toHaveLength(3);
  });
});

describe("cada cosa esta emparejada con la suya", () => {
  it("cada nodo tiene su tabla, por titulo y en el mismo orden", () => {
    // Un nodo sin tabla es un panel en blanco; una tabla sin nodo, un dato inalcanzable.
    expect(DETERMINACIONES.map((tabla) => tabla.titulo)).toEqual(NODOS.map((nodo) => nodo.titulo));
  });

  it("las cuatro secciones propias son los cuatro submodulos de Tesoreria", () => {
    const mio = requerir(
      ARBOL.find((rama) => rama.modulo === MI_MODULO),
      `la rama de ${MI_MODULO}`,
    );
    expect(mio.submodulos.map((submodulo) => submodulo.clave)).toEqual(
      SECCIONES.map((seccion) => seccion.clave),
    );
    expect(mio.submodulos.map((submodulo) => submodulo.label)).toEqual(
      SECCIONES.map((seccion) => seccion.label),
    );
  });

  it("los doce modulos del arbol tienen dibujo", () => {
    // El artboard resuelve el icono con un `find` que cae en `[]`: un nombre que no case deja el
    // modulo sin dibujo y no rompe nada.
    const iconos = Object.entries(ICONOS_POR_MODULO);
    expect(iconos).toHaveLength(12);
    for (const [modulo, trazos] of iconos) {
      expect(trazos.length, `el modulo ${modulo} se quedo sin icono`).toBeGreaterThan(0);
    }
  });

  it("los tonos de los recibos son insignias que existen", () => {
    for (const recibo of RECIBOS) {
      expect(Object.keys(INSIGNIAS)).toContain(recibo.tono);
    }
  });

  it("toda fila tiene tantas celdas como columnas su tabla", () => {
    const tablas = [
      ...PASOS.flatMap((paso) => (paso.tabla ? [paso.tabla] : [])),
      ...DETERMINACIONES,
      ...TARIFARIO,
    ];
    const cortas = tablas.flatMap((tabla) =>
      tabla.filas
        .filter((fila) => fila.length !== tabla.columnas.length)
        .map((fila) => `${tabla.columnas.length} columnas y ${fila.length} celdas: ${fila[0]}`),
    );
    expect(cortas).toEqual([]);
    expect(tablas).toHaveLength(10);
  });
});

describe("las cuentas que el diseno hace, comprobadas sobre las cadenas", () => {
  const tabla = requerir(
    requerir(
      PASOS.find((paso) => paso.id === "deuda"),
      "el paso `deuda`",
    ).tabla,
    "la tabla de cuotas",
  );

  it("las tres cuotas suman el importe del primer recibo", () => {
    const totales = tabla.filas.map((fila) => celda(tabla.columnas, fila, "Total S/"));
    expect(totales).toEqual(["2,055.04", "310.04", "146.86"]);

    const suma = totales.reduce((acumulado, total) => acumulado + centimos(total), 0);
    const primero = requerir(RECIBOS[0], "el primer recibo");
    expect(suma).toBe(centimos("2,511.94"));
    expect(suma).toBe(centimos(primero.autovaluo));
  });

  it("en cada cuota, el insoluto mas el interes es el total", () => {
    for (const fila of tabla.filas) {
      const insoluto = centimos(celda(tabla.columnas, fila, "Insoluto S/"));
      const interes = centimos(celda(tabla.columnas, fila, "Interés S/"));
      const total = centimos(celda(tabla.columnas, fila, "Total S/"));
      expect(insoluto + interes, `la cuota ${fila.join(" · ")}`).toBe(total);
    }
  });

  it("las cuatro tablas de arqueo cuadran, y la tarjeta no entra en el cajon", () => {
    const arqueos = DETERMINACIONES.filter((determinacion) =>
      determinacion.filas.some((fila) => /^Fondo inicial/.test(String(fila[1]))),
    );
    expect(arqueos).toHaveLength(4);

    for (const arqueo of arqueos) {
      const importe = (patron: RegExp): number | null => {
        const fila = arqueo.filas.find((candidata) => patron.test(String(candidata[1])));
        if (fila === undefined) return null;
        const texto = celda(arqueo.columnas, fila, "S/");
        return texto === "—" ? null : centimos(texto);
      };

      const fondo = requerir(importe(/^Fondo inicial/) ?? undefined, "el fondo inicial");
      const efectivo = requerir(importe(/^Cobrado en efectivo/) ?? undefined, "lo cobrado");
      const tarjeta = requerir(importe(/^Cobrado con tarjeta/) ?? undefined, "la tarjeta");
      const anulado = importe(/^Anulaciones/) ?? 0;
      const debeHaber = requerir(importe(/^Debe haber/) ?? undefined, "el debe haber");

      // La tarjeta se cobra y se anota, pero no esta en el cajon: si entrara en esta suma, las
      // cuatro tablas fallarian por el importe de sus tarjetas. En C-3 el detalle lo dice con
      // todas las letras; en las otras tres solo lo dice la aritmetica.
      expect(fondo + efectivo - anulado, `«Debe haber» de ${arqueo.titulo}`).toBe(debeHaber);
      expect(tarjeta).toBeGreaterThan(0);

      const contado = importe(/^Contado en caja/);
      const diferencia = importe(/^Diferencia/);
      if (contado !== null) {
        expect(diferencia, `la diferencia de ${arqueo.titulo}`).toBe(contado - debeHaber);
      } else {
        // Sin arquear, la diferencia no es cero: es que nadie ha contado todavia. El artboard
        // escribe «—» en las dos celdas, y ese guion es el dato.
        expect(diferencia, `${arqueo.titulo} no ha arqueado: no puede tener diferencia`).toBeNull();
      }
    }
  });
});

describe("los tres desajustes con el contrato del backend estan escritos donde vive el dato", () => {
  const leer = (archivo: string) => readFileSync(join(DATOS, archivo), "utf8");

  it("los medios de pago, nombrando `FormaDePago`", () => {
    const texto = leer("recibo.ts");
    expect(texto).toContain("FormaDePago");
    for (const forma of ["EFECTIVO", "CHEQUE", "DEPOSITO", "TARJETA", "TRANSFERENCIA"]) {
      expect(texto).toContain(forma);
    }
    // Y el desajuste sigue siendo real: el artboard ofrece dos tarjetas.
    const medio = requerir(
      requerir(
        PASOS.find((paso) => paso.id === "pago"),
        "el paso `pago`",
      ).campos.find((campo) => campo.clave === "medio"),
      "el campo `medio`",
    );
    expect(medio.o).toEqual([
      "",
      "Efectivo",
      "Tarjeta de débito",
      "Tarjeta de crédito",
      "Depósito en cuenta",
      "Cheque de gerencia",
    ]);
  });

  it("el numero de recibo, nombrando `ReciboResource`", () => {
    const texto = leer("recibos-del-turno.ts");
    expect(texto).toContain("ReciboResource");
    expect(texto).toContain("001-0000123");
    // La serie del diseno mide cuatro; la del ejemplo del backend, tres.
    for (const recibo of RECIBOS) {
      expect(requerir(recibo.cod.split("-")[0], "la serie").length).toBe(4);
    }
  });

  it("el fondo inicial del turno, nombrando `ArqueoResource`", () => {
    const texto = leer("arqueo.ts");
    expect(texto).toContain("ArqueoResource");
    // Las cinco cifras que ese recurso si publica, por forma de pago.
    for (const cifra of ["cobrado", "anulado", "neto", "declarado", "diferencia"]) {
      expect(texto).toContain(cifra);
    }
  });
});
