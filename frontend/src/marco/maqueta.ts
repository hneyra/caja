/**
 * Lo que esta interfaz dice de si misma mientras no hable con nadie (#44).
 *
 * <h2>De que va este archivo</h2>
 *
 * `caja-web` no tiene backend: `eslint.config.mjs` prohibe `fetch` y `XMLHttpRequest`,
 * `nginx.conf` no reenvia a ningun sitio y `cero-red.mjs` mide **0 peticiones de conexion** en un
 * Chromium de verdad. Eso esta decidido y argumentado (ADR-0010) y no cambia aqui. Lo que cambia
 * es que **la pantalla lo diga**, en vez de dejar que quien la mira lo deduzca.
 *
 * Todo lo que hay aqui es de ESTE repositorio y **no del artboard**: por eso vive en `marco/` y no
 * en `datos/`, que es «lo que las pantallas ensenan, copiado del artboard». Los recibos, los
 * importes y el Panel siguen siendo los del diseno; lo que se anade es la banda que declara que lo
 * son, los toast que dicen lo que de verdad paso, y una sesion que no inventa a nadie.
 *
 * <h2>Las tres cosas, y por que son tres y no una</h2>
 *
 *   1. **La banda** ({@link TITULO_DE_LA_BANDA} y {@link TEXTO_DE_LA_BANDA}): permanente, en las
 *      cuatro secciones y **en el papel**. Sale en una captura de pantalla y en una impresion.
 *   2. **Los toast** ({@link nadaSeRegistro}): una accion que en el sistema de verdad escribiria
 *      —cobrar, anular, guardar— dice que **no escribio nada**. «Recibo 0003-0041193 emitido. La
 *      cuota ya esta descontada de la cuenta corriente» afirmaba dos hechos falsos sobre el dinero
 *      de un contribuyente.
 *   3. **La sesion** ({@link SIN_SESION}): aqui no hay OIDC, ni Keycloak, ni token. Un nombre
 *      propio en la barra es una identidad afirmada sin nadie detras.
 *
 * Son tres porque los tres danos son distintos: la banda no evita que un toast afirme un hecho
 * falso, y ninguna de las dos evita que la barra diga que en la ventanilla hay una persona que no
 * existe.
 */

/**
 * El motivo, escrito **una sola vez**, del que cuelgan la banda y los toast.
 *
 * Que sea uno y no tres copias es lo que hace que el dia que haya backend se retire de un sitio;
 * y es ademas lo que `maqueta.test.tsx` busca en cada toast que la aplicacion es capaz de sacar,
 * en vez de comparar contra una lista de frases copiada al lado —que es la prueba que se compara
 * consigo misma y no puede fallar—.
 */
export const NO_ESTA_CONECTADA = "esta interfaz no está conectada a ningún sistema";

/** El rotulo corto de la banda: lo primero que se lee en una captura. */
export const TITULO_DE_LA_BANDA = "Maqueta sin conexión";

/**
 * El cuerpo de la banda. Dice **las dos cosas** que AC-2 pide, y hacen falta las dos.
 *
 * «No esta conectada» sola dejaria pensar que los datos son reales y estan cacheados; «los datos
 * son de diseno» sola dejaria pensar que se conecta y hoy trae datos de prueba. Lo que hace dano
 * es cualquiera de las dos lecturas: una cifra copiada a un informe, o un cobro que alguien cree
 * haber registrado.
 */
export const TEXTO_DE_LA_BANDA =
  "Los datos son de diseño y nada de lo que se haga aquí se registra en ninguna parte.";

/**
 * Lo que dice un toast de una accion que en el sistema de verdad habria escrito algo.
 *
 * La regla que sigue —y que `maqueta.test.tsx` comprueba sobre los toast **que la aplicacion
 * saca**, no sobre una lista— es: un toast puede decir lo que la pantalla hizo (abrir una
 * pestana, tirar un borrador, poner el foco); no puede decir que algo paso **fuera** de la
 * pantalla: en una base, en una cuenta corriente, en un turno o en una caja.
 *
 * El condicional no necesita coletilla y por eso no la lleva: «Abriría el módulo Catastro» no
 * afirma ningun hecho, y anadirle el motivo solo haria mas largo un toast que ya es honesto.
 */
export const nadaSeRegistro = (que: string) => `${que}: ${NO_ESTA_CONECTADA}.`;

/** Quien tiene la ventanilla abierta: lo que la ficha de sesion de la barra muestra. */
export interface Sesion {
  /** Las dos letras del avatar. */
  readonly iniciales: string;
  readonly nombre: string;
  /** El puesto y la caja, tal como el artboard los junta en una sola linea. */
  readonly puesto: string;
}

/**
 * La sesion que esta interfaz puede afirmar hoy: **ninguna**.
 *
 * Hasta #44 aqui habia `SESION`, en `src/datos/barra.ts`, con `iniciales: "JC"`, `nombre: "J.
 * Cárdenas Vega"` y `puesto: "Cajero · caja C-3"` — la persona que el artboard dibuja. Servida en
 * un dominio publico y sin pedir credenciales, esa ficha **afirma que en la ventanilla hay
 * alguien**, y no lo hay: no hay OIDC, no hay *client* de Keycloak (declarado en
 * `docs/00-gobierno/huecos-en-infrastructure.md`) y no hay token del que sacar un nombre.
 *
 * Es la misma decision que `rentas` tomo en I-1 (su #24), donde el `dist` llevaba «Cárdenas» tres
 * veces y paso a **cero**. Y el nombre no se sustituye por otro nombre: se sustituye por lo unico
 * que se puede afirmar sin respaldo, que es que no hay sesion.
 *
 * <h2>Por que ademas la prop es obligatoria</h2>
 *
 * `BarraGlobal` y `MenuDeSesion` reciben la sesion **sin valor por omision**. Con un valor por
 * omision, el dia que alguien monte la barra sin pasarsela volveria a salir una identidad de la
 * nada — que es exactamente como llego la de hoy. Sin el, no compila.
 */
export const SIN_SESION: Sesion = {
  // Ni dos iniciales ni una silueta: las dos se leerian como «alguien». Un signo de
  // interrogacion es lo unico que no se confunde con una persona.
  iniciales: "?",
  nombre: "Sin sesión",
  puesto: "Nadie se ha identificado",
};
