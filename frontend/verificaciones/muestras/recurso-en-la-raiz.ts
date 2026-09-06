// Viola: un recurso pedido a la raíz del dominio.
//
// La interfaz se sirve bajo `/caja`, y Vite reescribe el `base` en el `index.html` y en los
// recursos importados — pero **no dentro de un literal de JavaScript**. Un `src` escrito así se
// va a `https://dominio/escudo-catacaos.png`, que es una ruta que `PathPrefix(/caja)` no casa:
// 404, y la barra sale sin escudo. Se cuelga de `import.meta.env.BASE_URL`, que ya termina en
// barra.
export const ESCUDO = "/escudo-catacaos.png";

// Y escribir el prefijo a mano tampoco vale: es la misma ruta absoluta, y ademas se separaria
// del `base` el dia que el prefijo cambie.
export const OTRO_ESCUDO = "/caja/escudo-catacaos.png";

// Un modulo o una hoja pedidos igual: el mismo error con otra extension.
export const HOJA = "/assets/impresion.css";
