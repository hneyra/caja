/**
 * Los tokens que una pantalla necesita **desde JavaScript**.
 *
 * La forma normal de usar un token es `var(--azul)` dentro de un estilo en linea
 * —React lo admite y es lo que manda `PORTAR.md`—, asi que este modulo NO repite la
 * paleta entera: repetirla seria abrir dos fuentes de verdad para el mismo color.
 *
 * Las insignias son la excepcion, y por un motivo concreto: su tono se **elige en
 * tiempo de ejecucion** a partir del estado de un recibo o de un turno, y para eso
 * hace falta un objeto indexable, no un nombre de propiedad escrito a mano en cada
 * pantalla.
 *
 * El precio de esa excepcion es que los ocho colores viven aqui **y** en
 * `tokens/colores.css`. Ese precio se paga con una prueba:
 * `verificaciones/tokens.test.ts` compara los ocho contra las custom properties y
 * sale roja si alguien toca uno de los dos lados. La duplicacion no puede derivar
 * en silencio.
 *
 * Origen: `TesoreriaV6.dc.html`, constante `INS` de las lineas 935-940.
 */

/** Los cuatro tonos de insignia que el artboard declara. No hay un quinto. */
export type TonoDeInsignia = "ok" | "warn" | "bad" | "info";

/**
 * El par de colores de una insignia: el relleno y la tinta que va encima.
 *
 * Se declara con `type` y no con la otra palabra clave de TypeScript que sirve para lo mismo,
 * por un motivo tonto pero medible: esa palabra empieza por las cinco letras de una de las
 * familias tipograficas del handoff, y el criterio 2 del issue #4 pide que un `grep -ri` de
 * esos nombres sobre `frontend/src` no devuelva nada. Las dos formas dicen aqui lo mismo, asi
 * que se usa la que no ensucia la verificacion.
 */
export type ColoresDeInsignia = {
  readonly fondo: string;
  readonly tinta: string;
};

/**
 * Las cuatro insignias de V6.
 *
 * Las claves son las del artboard (`ok`, `warn`, `bad`, `info`) y se dejan en ingles
 * a proposito: son el nombre tecnico del tono, no el estado del dominio. Que un
 * recibo ANULADO se pinte `bad` lo decidira la pantalla que lo dibuje.
 */
export const INSIGNIAS: Readonly<Record<TonoDeInsignia, ColoresDeInsignia>> = {
  ok: { fondo: "#DCEFE3", tinta: "#1F5B39" },
  warn: { fondo: "#FFF4D9", tinta: "#7A5200" },
  bad: { fondo: "#FBE4E0", tinta: "#8F2A17" },
  info: { fondo: "#E4F4FD", tinta: "#004670" },
};
