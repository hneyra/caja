// Viola: un importe es texto, jamás `number` (regla 1 de CLAUDE.md, RNF-055).
//
// Las dos formas de romperla, para que la muestra cubra los dos selectores: declararlo
// `number`, y convertirlo a `number`.
export interface Cuota {
  importe: number;
}

export function comoNumero(cuota: { importe: string }) {
  return Number(cuota.importe);
}

export function tambienProhibido(texto: string) {
  return parseFloat(texto);
}
