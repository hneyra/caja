import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Armazon, type AccionesDelSistema } from '@kamayuk/shell';
import { ProveedorDeTema, type ConfiguracionDeTema } from '@kamayuk/ui';

import escudo from '../recursos/escudo-catacaos.png';
import { MandoDeTema } from './preferencias/MandoDeTema.tsx';
import { useCatalogoPermitido } from './datos/useCatalogoPermitido.ts';
import { useCuentaDeLaSesion } from './datos/useCuentaDeLaSesion.ts';
import { traducirCatalogo } from './catalogo.ts';
import { PantallaDelSistema } from './pantallas/PantallaDelSistema.tsx';
import type { ClaveDeHoja } from './pantallas/arbol.ts';
import { pantallaDe } from './pantallas/definiciones/index.ts';
import { useDatosDeLaHoja } from './datos/useDatosDeLaHoja.ts';
import type { FallaDeLaPuerta } from './api/identidad.ts';
import { abrirLaCuenta, salir } from './api/identidad.ts';
import { fallaDeLaPuerta } from './arranque.ts';
import { useTextosDelMarco } from './i18n/textosDelMarco.ts';

/**
 * **`caja-web`: la costura de la ventanilla con las librerias comunes** (#74).
 *
 * Es el `aplicacion.tsx` de `rentas-web` (`rentas`@bb13f73) con las decisiones de este sistema, y la
 * forma se conserva a proposito: ADR-0030 §4 dice que la aplicacion de un sistema es una lista de
 * decisiones y no una interfaz, y se nota en que las dos se leen igual.
 *
 * <h2>Que hay aqui, y que NO</h2>
 *
 * Aqui hay el catalogo de la ventanilla, la entidad, la cuenta y que hace cada accion del pie. El
 * marco lo dibuja `@kamayuk/shell` y el cuerpo de cada pantalla el interprete de `@kamayuk/ui`.
 *
 * <h2>Donde difiere de `rentas`, y por que</h2>
 *
 * · **La cuenta y la entidad NO estan escritas.** `rentas` dibuja «J. Cardenas Vega» y el nombre de
 *   su municipalidad. `caja` retiro esa misma persona inventada en #44, y aqui salen de
 *   `GET /seguridad/sesion` y `GET /seguridad/sesion/municipalidad` de su propio backend
 *   (ADR-0042). Ver `datos/useCuentaDeLaSesion.ts`.
 * · **El catalogo se filtra hoja por hoja**, no por modulo: ver `permisos.ts`.
 * · **Seis pantallas leen** desde #84 (`datos/conectores.ts`) y la que solo escribe dice por que no
 *   tiene nada que leer (`porQueNoHayDato.ts`). Y **ninguna escribe**, por ADR-0040: el pie solo
 *   ofrece exportar e imprimir, e imprimir imprime.
 *
 * <h2>El menu de sesion: las cuatro opciones hacen algo, y dos de ellas se van de aqui</h2>
 *
 * Es el mismo criterio de la linea de arriba, aplicado al otro sitio donde habia botones mudos
 * (#115). Hasta este issue tres de las cuatro eran `al: () => {}`; hoy no queda ninguna, y lo
 * vigila `verificaciones/ninguna-opcion-del-menu-se-queda-muda.test.ts`.
 *
 *     Mi perfil               -> la consola de cuenta del EMISOR, en otra pestana
 *     Cambiar la contrasena   -> la misma consola, en su pagina de credenciales
 *     Preferencias            -> el cajon de los temas (#111)
 *     Cerrar sesion           -> `salir()`
 *
 * Las dos primeras **no se resuelven aqui a proposito**, y no por falta de backend: la
 * autorizacion es de `identidad` desde ADR-0039 y la contrasena la guarda Keycloak, que ya publica
 * su propia pagina de cuenta. Dibujar aqui esos dos formularios seria prometer una escritura que
 * ningun backend de este repositorio puede atender — y por eso el issue lo deja fuera por escrito.
 * A donde llevan, y con que se midio, esta en `api/identidad.ts`.
 */

/**
 * **El tema de este servicio** (#111).
 *
 * Dos decisiones y ninguna mas; las seis paletas son de `@kamayuk/ui` y valen para los cuatro
 * sistemas.
 *
 * · `identidadPorOmision`: con que se ve la ventanilla para quien no ha elegido nada. `institucional` es
 *   la del artboard V8, o sea exactamente lo que se servia antes de este issue.
 * · `prefijoDeClaves`: lo mismo que pide `@kamayuk/sesion`, y por lo mismo. Las cuatro interfaces
 *   del producto se sirven **del mismo origen** —`/rentas/`, `/caja/`, `/catastro/`,
 *   `/normativa/`—, asi que comparten el almacenamiento del navegador: sin prefijo propio, cambiar
 *   el tema aqui se lo cambiaria a las otras tres.
 *
 * **Quien guarda es la libreria, no este archivo**, y eso es lo que hace que siga siendo cierto que
 * un solo archivo de produccion de este repositorio toca el almacenamiento del navegador: la
 * puerta. Lo comprueba `verificaciones/camino-a-la-api.test.ts`.
 *
 * **Y el modo no se declara**, que es la tercera decision y va por omision: ausente significa «el
 * del equipo». Traer aqui un `claro` de fabrica congelaria en claro a quien tenga la maquina en
 * oscuro, que es lo contrario de lo que pide quien la puso asi.
 */
const TEMA: ConfiguracionDeTema = {
  identidadPorOmision: 'institucional',
  prefijoDeClaves: 'kamayuk.caja',
};

/**
 * Que hace cada accion del pie.
 *
 * `imprimir` es la unica que puede hacer su trabajo entero sin backend, asi que lo hace. Las
 * otras tres dicen que les falta: ver `avisos.ts` para el texto que acompana a los botones.
 */
/**
 * El cliente de consultas, **creado una vez y fuera del componente**.
 *
 * Dentro se crearia uno nuevo en cada pintada, y con el se tiraria la cache entera: cada vuelta al
 * mismo destino volveria a pedir. Fuera, volver a una pantalla ya vista la ensena mientras
 * refresca.
 *
 * `retry` en falso tambien aqui, ademas de en el gancho: un 401 reintentado tres veces son tres
 * idas a un backend que ya dijo que no, y el usuario espera el triple para leer lo mismo.
 *
 * **Se exporta por las pruebas, y eso dice algo de el.** Al ser de modulo, su cache **sobrevive a
 * cada `render`**: en la aplicacion es justo lo que se quiere —volver a una pantalla ya vista la
 * ensena mientras refresca—, y en una suite significa que una prueba hereda lo que cacheo la
 * anterior. Medido: una prueba que cambiaba los permisos leia los de la prueba de antes y salia
 * verde sobre el catalogo equivocado. Quien monta la aplicacion en una prueba tiene que llamar a
 * `CONSULTAS.clear()`.
 */
export const CONSULTAS = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

const ACCIONES: AccionesDelSistema = {
  imprimir: () => {
    window.print();
  },
};

/** El cuerpo de una pantalla: su definicion, y lo que se sepa de sus datos. */
function CuerpoDeLaPantalla({ clave }: { readonly clave: ClaveDeHoja }) {
  // Un componente y no una funcion suelta: `useDatosDeLaHoja` es un gancho, y un gancho solo puede
  // llamarse desde un componente. Ademas esto es lo que hace que **solo se vuelva a pintar la
  // pantalla** cuando llega su respuesta, y no el armazon entero.
  return <PantallaDelSistema definicion={pantallaDe(clave)} datos={useDatosDeLaHoja(clave)} />;
}

/**
 * El armazon y lo que lo alimenta.
 *
 * Va **dentro** del proveedor y no fuera, y no es un detalle de orden: `useCatalogoPermitido` es un
 * gancho de consulta, y un gancho corre **antes** que el JSX del componente que lo llama. Con las
 * dos cosas en la misma funcion, el gancho se ejecutaba antes de que el proveedor existiera y
 * reventaba con «No QueryClient set, use QueryClientProvider to set one» — medido en `rentas`, en
 * todas las pruebas de su recorrido a la vez.
 */
function ArmazonDelSistema() {
  const { t } = useTranslation();
  // Las treinta y dos palabras que el marco dice por su cuenta, en el idioma de la sesion (`rentas`#133).
  // Sin esto el armazon usa las suyas por omision y la pantalla sale a medias: el cuerpo
  // traducido y el marco en castellano. Ver `i18n/textosDelMarco.ts`.
  const textos = useTextosDelMarco();
  const sesion = useCatalogoPermitido();
  // Quien esta en la ventanilla, de la copia de esta caja. Nunca un nombre escrito aqui (#44).
  const cuenta = useCuentaDeLaSesion();
  const catalogo = traducirCatalogo(sesion.catalogo, t);
  // El cajon de preferencias: lo abre la opcion del menu de sesion y nada mas. Vive aqui —y no
  // dentro del `<Armazon>`— porque el armazon no sabe que existe un tema: lo suyo es ofrecer la
  // opcion y avisar de que se pulso.
  const [preferencias, setPreferencias] = useState(false);

  /*
   * **No se monta el armazon hasta saber que puede abrir la cuenta.** Se queda, y por lo que se
   * midio al revisarlo (`rentas`#136) — no por lo que decia antes.
   *
   * **El defecto ajeno ya no lo sostiene.** Hasta `rentas`#136 aqui ponia que `@kamayuk/shell` revienta si
   * su catalogo cambia despues de montar —`useHoja() fuera de una pantalla del <Armazon>`— y que
   * por eso esto «hoy ademas es necesario». `kamayuk-lib`#20 esta **cerrado**: lo arreglan
   * `6e7aa0b` y `e13c5aa`, con sus pruebas en `paquetes/shell/armazon.test.tsx`. Y esta medido
   * desde aqui: con este rodeo retirado y el catalogo llegando tarde, el armazon **no revienta** y
   * la pantalla del enlace profundo abre.
   *
   * **Y el primer motivo, tal como estaba escrito, tampoco lo sostiene ya.** Decia que ofrecer «el
   * catalogo entero mientras llega» ensenaria un segundo lo que `rentas`#105 esconde. Eso no puede pasar,
   * y no es este rodeo quien lo impide: quien lo impide es `useCatalogoPermitido`, que mientras
   * pide devuelve el catalogo **vacio** — retirado el rodeo, el arbol no nombra ni un modulo.
   *
   * **Lo que si lo sostiene es la mentira contraria, y esa esta medida.** Montar el armazon con el
   * catalogo vacio hace que un enlace profundo —`#/cierre-caja`, con las tres de seguridad todavia en
   * vuelo— dibuje «Esa direccion no corresponde a ningun destino disponible para esta cuenta». Se
   * lo dice a una cuenta que SI puede abrirla, y una negativa de permisos no se lee como una
   * espera: se lee como un no. Con el rodeo, lo que se lee es «Averiguando que puede abrir esta
   * cuenta», que es exactamente lo que esta pasando.
   *
   * Y no hay que fiarse de esta nota: retirar el rodeo pone en rojo, en `rentas`, **45 pruebas** de
   * su recorrido de destinos y de `la-siembra-abre-los-destinos`, y el volcado del rojo es
   * literalmente ese `data-slot="destino-no-ofrecido"`.
   */
  if (sesion.estado !== 'compuesto') {
    return (
      <div className="grid min-h-screen place-items-center p-[30px] bg-fondo">
        <p className="m-0 max-w-[52ch] text-center text-[14px] leading-[1.6] text-tinta-2 text-pretty">
          {sesion.porQue}
        </p>
      </div>
    );
  }

  return (
    <>
      <Armazon
        textos={textos}
        titulo={t('Caja')}
        entidad={cuenta.nota ?? t('Municipalidad sin identificar')}
        escudo={<img src={escudo} alt="" width={28} height={28} />}
        catalogo={catalogo}
        cuenta={cuenta}
        opcionesDeSesion={[
          {
            rotulo: t('Mi perfil'),
            al: () => {
              abrirLaCuenta('perfil');
            },
          },
          {
            rotulo: t('Cambiar la contrasena'),
            al: () => {
              abrirLaCuenta('contrasena');
            },
          },
          {
            rotulo: t('Preferencias'),
            al: () => {
              setPreferencias(true);
            },
          },
          { rotulo: t('Cerrar sesion'), peligrosa: true, al: () => void salir() },
        ]}
        acciones={ACCIONES}
        // Cuando no hay arbol, el pie del carril dice POR QUE: sin eso, «pidiendo», «fallo» y «esta
        // cuenta no puede abrir nada» son la misma pantalla en blanco, y son tres cosas distintas.
        //
        // Con el rodeo de arriba puesto, la rama de `porQue` **no se alcanza**: aqui el estado es
        // siempre `compuesto` y `porQue` siempre vacio. Se deja escrita porque es la que recoge
        // los tres casos el dia que el rodeo se retire, y borrarla haria que retirarlo saliera en
        // blanco en vez de explicado.
        pieDelCarril={
          sesion.porQue === ''
            ? t('La ventanilla de Tesorería: lo que esta cuenta puede abrir en esta caja.')
            : sesion.porQue
        }
        pantalla={(hoja) => <CuerpoDeLaPantalla clave={hoja.destino.clave as ClaveDeHoja} />}
      />
      <MandoDeTema
        abierto={preferencias}
        alCerrar={() => {
          setPreferencias(false);
        }}
      />
    </>
  );
}

/**
 * **Cuando no se pudo ni llegar al emisor de identidad** (#112).
 *
 * <h2>Por que esto se dibuja ANTES que nada, y no como un estado mas del catalogo</h2>
 *
 * Porque con el emisor caido el backend suele estar caido tambien, y entonces
 * `useCatalogoPermitido` contesta su «No se pudo saber que modulos puede abrir esta cuenta». Es
 * cierto y es inutil: manda a mirar los permisos cuando lo que pasa es que la plataforma no esta.
 * La falla de la puerta es mas honda que la del catalogo, asi que gana.
 *
 * <h2>Y por que nombra la URL</h2>
 *
 * Porque las tres causas de que no se pueda llegar —la plataforma sin levantar, un `ConfigMap` con
 * la URL equivocada y un cortafuegos— se distinguen leyendo **que URL** se pidio. Sin ella las
 * tres son «no conecta», y las tres se arreglan en sitios distintos.
 */
function LaPuertaNoContesto({ falla }: { readonly falla: FallaDeLaPuerta }) {
  const { t } = useTranslation();

  return (
    <div className="grid min-h-screen place-items-center p-[30px] bg-fondo">
      <div className="max-w-[64ch] border border-mal-borde bg-mal-fondo p-[20px] text-[14px] leading-[1.6]">
        <p className="m-0 font-bold text-mal-tinta">
          {t('No se pudo llegar al emisor de identidad, asi que no se mando a nadie a identificarse.')}
        </p>
        <p className="mt-[10px] mb-0 break-all text-tinta-2">
          {t('El emisor es {{emisor}}, y la peticion a {{url}} no llego a completarse: {{motivo}}.', {
            emisor: falla.emisor,
            url: falla.url,
            motivo: falla.motivo,
          })}
        </p>
        <p className="mt-[10px] mb-0 text-tinta-2 text-pretty">
          {t(
            'Si esto es un puesto de desarrollo, levante la plataforma; si no, avise a quien la ' +
              'administra. Despues vuelva a cargar la pagina.',
          )}
        </p>
      </div>
    </div>
  );
}

/**
 * **El proveedor del tema envuelve TODO, incluida la pantalla de la puerta caida** (#111).
 *
 * Podria envolver solo al armazon y seria mas corto. Seria tambien un fallo visible: quien eligio
 * sepia u oscuro y se encuentra el emisor caido leeria ese aviso —el unico momento en que la
 * interfaz de verdad no esta— con la paleta de otro. La pantalla que explica una averia es
 * exactamente la que no debe parecer de otro programa.
 *
 * Y va por fuera del `QueryClientProvider` porque no depende de el: el tema se resuelve del
 * navegador, no de la red, y no tiene que esperar a nada.
 */
export function Aplicacion() {
  // Se lee aqui y no en `main.tsx` porque el montaje no lleva argumentos a proposito: ver
  // `arranque.ts`. Al llegar aqui la pasada de arranque ya termino, asi que el valor esta fijo.
  const falla = fallaDeLaPuerta();

  return (
    <ProveedorDeTema configuracion={TEMA}>
      {falla !== null ? (
        <LaPuertaNoContesto falla={falla} />
      ) : (
        <QueryClientProvider client={CONSULTAS}>
          <ArmazonDelSistema />
        </QueryClientProvider>
      )}
    </ProveedorDeTema>
  );
}
