import type { TonoDeInsignia } from '@kamayuk/ui';

/**
 * **De que color va una insignia de la ventanilla**, deducido de lo que dice la celda (#74).
 *
 * Es lo que `@kamayuk/ui` pide por `tonoDeLaInsignia` y no decide por su cuenta: el vocabulario de
 * los estados es de cada sistema. El de `rentas` habla de coactiva y de deuda; el de la ventanilla,
 * de recibos anulados, de pagos que no llegaron y de conciliaciones que no cuadran.
 *
 * Se enumeran los dos grupos que piden accion y lo demas esta conforme, por lo mismo que en
 * `rentas`: los estados buenos son muchos y una lista incompleta pintaria de rojo lo que no esta.
 * Las cadenas son las que publica el backend —`ANULADO`, `MUERTO`, `PENDIENTE`…— y las que la
 * pantalla escribe —«No cuadra»—, sin distinguir mayusculas.
 */

/** Lo que ya fue mal: hay que actuar hoy. */
const MAL = /anulad|muert|rechazad|no cuadra|inactiv/;

/** Lo que puede ir mal si nadie lo mira. */
const ATENCION = /pendiente|sin entregar|en transito|en tránsito|abiert/;

export function tonoDe(texto: string): TonoDeInsignia {
  const s = texto.toLowerCase();
  if (MAL.test(s)) return 'mal';
  if (ATENCION.test(s)) return 'atencion';
  return 'ok';
}
