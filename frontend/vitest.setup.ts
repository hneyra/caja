import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * Testing Library limpia el DOM entre pruebas por su cuenta solo cuando Vitest corre con
 * `globals: true`. Aqui corre sin globales —los importes explicitos dicen de donde sale
 * cada cosa— asi que la limpieza se enchufa a mano; sin ella, la segunda prueba encuentra
 * dos aplicaciones montadas y `getByRole` falla por ambiguo, que es un rojo que no habla
 * de lo que se estaba probando.
 */
afterEach(cleanup);

/**
 * **La instancia de i18next, para TODAS las pruebas** (#103).
 *
 * `react-i18next` sin proveedor usa la instancia global de `i18next`, que solo existe si alguien
 * la inicializo. En la aplicacion lo hace `main.tsx`; en las pruebas no lo hacia nadie, y el
 * sintoma era pequeno y confuso: `t('{{count}} registro', { count: 2 })` devolvia **«2 registro»**
 * —la clave, interpolada, sin elegir forma plural— porque el recurso que trae `_one` y `_other` no
 * estaba cargado.
 *
 * Importarlo aqui es lo que hace que una prueba de componente vea **lo mismo que la pantalla**.
 * Ponerlo en cada archivo que lo necesite seria lo contrario: la que se olvidara pasaria en verde
 * comprobando texto sin traducir.
 */
import './src/i18n/i18n.ts';

/**
 * **EL `Request` DEL ARNES ACEPTA LA SENAL QUE CREA EL DOCUMENTO** (#93). Dos realms, y solo aqui.
 *
 * En un navegador hay UN realm: el `AbortSignal` que fabrica `new AbortController()` y el `Request`
 * que lo recibe son del mismo sitio. Bajo Vitest no: el `Request` es el de `undici`, que viene
 * dentro de Node, y el `AbortController`/`AbortSignal` globales son los que instala jsdom al montar
 * el documento. Desde **Node 24** eso revienta con
 * `TypeError: RequestInit: Expected signal ("AbortSignal {}") to be an instance of AbortSignal`,
 * porque `undici` compara con el `instanceof` ORDINARIO contra el `AbortSignal` que existia al
 * arrancar Node —antes de que existiera jsdom—, y eso recorre la cadena de prototipos: no se puede
 * enganar con un `Symbol.hasInstance` propio. La medicion entera, con la fuente de `undici`
 * delante, esta en `kamayuk-lib`#90; aqui vale el resumen y el mismo arreglo.
 *
 * **No es ruido**: quien construye ese `Request` es `createClientSideRequest` de `react-router`, en
 * CADA navegacion del enrutador de datos que monta `@kamayuk/shell`. Con Node 24 y sin esto salian
 * **249 rechazos sin atender** en las cuatro guardas que montan el Armazon —`la-siembra-abre-los-
 * destinos`, `los-destinos-se-recorren`, `la-cuenta-no-se-inventa` y `todo-el-texto-se-traduce`—,
 * que pasaban igual: un error que se traga alguien es justo lo que hay que quitar de en medio.
 *
 * Se arregla donde esta la costura —el `Request` del arnes— y no tocando los globales del
 * documento: el nativo de Node ya no es alcanzable desde aqui, y ponerle a jsdom otro
 * `AbortController` haria que su propio `addEventListener(…, { signal })` rechazara la senal por el
 * mismo motivo, al reves. La senal entra **tal cual**, porque `react-router` lee `request.signal`
 * para cortar sus cargadores.
 */
const RequestDelEntorno = globalThis.Request;

class RequestQueAceptaLaSenalDelDocumento extends RequestDelEntorno {
  constructor(entrada: RequestInfo | URL, init?: RequestInit) {
    if (init?.signal) {
      const { signal, ...sinLaSenal } = init;
      super(entrada, sinLaSenal);
      Object.defineProperty(this, 'signal', { value: signal, configurable: true });
    } else {
      super(entrada, init);
    }
  }
}

globalThis.Request = RequestQueAceptaLaSenalDelDocumento;
