/* Comprueba que un PR que cierra un issue deja su fila en «Verificar antes de afirmar».

   El registro de «Verificar antes de afirmar» es la memoria del proyecto: cada issue
   deja ahi que se implemento y **como se demostro que la verificacion puede fallar**.
   Es lo que impide volver a descubrir el mismo hallazgo de RLS por tercera vez.

   Y no la comprobaba nadie. Al integrar #585 y #618 la fila no se escribio y los dos
   PR pasaron todos sus checks en verde; el hueco se descubrio a mano, leyendo la
   tabla. El modo de fallo es silencioso: la fila que falta no se distingue de la que
   nadie tenia que escribir.

   ## Que exige, y que NO

   Exige que **exista** una fila que nombre el issue. No mira su contenido —que la
   mutacion descrita sea real, que las cifras cuadren— porque eso no lo puede leer una
   maquina, y es justo lo que la revision si puede.

   Y solo lo exige cuando las dos cosas son ciertas:

     1. el cuerpo del PR declara que cierra un issue (`Cierra #N`, `Closes #N`,
        `Fixes #N`, `Resuelve #N`), y
     2. el cambio toca el codigo de produccion del backend, del frontend, de infra o
        —desde #39— el compose de `despliegue/`.

   Un PR de solo documentacion, de solo pruebas o sin issue asociado pasa en verde. Sin
   ese contraste la guarda seria un peaje que todo el mundo aprende a esquivar — y una
   guarda esquivada no protege nada, que es de donde venimos.

   ## De donde viene, y que cambia aqui

   Copiada de `sgtm`, donde nacio con #711. Lo unico que cambia es QUE cuenta como
   codigo de produccion en ESTE repositorio —la lista `RUTAS_DE_CODIGO` de abajo— y el
   nombre de la variable de entorno, que aqui es `KAMAYUK_CUERPO_DEL_PR`. La tabla que
   protege es la de `docs/agent/HISTORY.md` —vivia en `CLAUDE.md` hasta el 2026-09-12
   (#114)—, que en este repositorio **nace vacia**: el registro anterior es historia de
   `sgtm` y no viaja.

   ## Uso

     node docs/00-gobierno/verificar-fila-del-registro.mjs [--base origin/main]

   El cuerpo del PR sale de `KAMAYUK_CUERPO_DEL_PR`; sin esa variable no hay nada que
   comprobar y la comprobacion pasa, porque fuera de un PR no existe el dato.

   Las tres entradas se pueden dar por archivo —`--cuerpo`, `--archivos`, `--anadido`—,
   y es lo que usa su autoprueba: sin poder alimentarlas, demostrar que muerde exigiria
   fabricar un repositorio, y una comprobacion que no se puede probar es la que este
   issue viene a impedir.
*/

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** Lo que hace de un cambio «codigo» a efectos de esta guarda.

    `despliegue/` entra con #39, y lo que lo justifica es una medida: el PR de #18 anadio
    un servicio al compose —o sea la interfaz entera de este sistema— y con la lista de
    tres esta guarda contestaba «Cierra #18 y no toca codigo de produccion: la fila no se
    exige». Sin fila y en verde. La fila se escribio igual, pero nadie la exigia, y ese
    es exactamente el modo de fallo silencioso que esta guarda existe para impedir: un
    compose es codigo de produccion — decide con que rol se conecta cada proceso, que
    imagen corre y en que orden arranca—, solo que no se compila.

    ## Si esto viaja a los otros cuatro repositorios (#39, criterio 5)

    **Deberia, y no se lleva desde aqui.** El motivo de que no desalinee nada es medido:
    esta lista **ya es distinta en cada repositorio y siempre lo fue**. El 2026-09-06,
    leidos de `main` de cada uno, `rentas` tiene `/^infra\//` donde `caja`, `catastro` y
    `normativa` tienen `/^infrastructure\/src\//`; y las seis muestras de la autoprueba
    nombran en cada uno sus propias rutas —`kamayuk-rentas-nucleo` alli, `kamayuk-caja`
    aqui—, asi que los cuatro archivos de muestras difieren ya entre si. Lo comun es el
    MECANISMO —los seis casos, `CIERRA`, «exige que la fila exista y no lo que diga»—; lo
    propio de cada repositorio es esta lista, y esta cabecera lo dice desde que se copio.

    Lo que si es comun es el DEFECTO: los cuatro sistemas tienen su `despliegue/compose.yaml`
    (comprobado con la API de GitHub el 2026-09-06: los tres hermanos lo tienen), y en los
    tres restantes la guarda sigue sin mirarlo. Que ese cambio se haga alli es trabajo de
    alli, con su propia muestra y su propia corrida — copiar cuatro archivos a ciegas es
    justo lo que produjo el `/^infra\//` de `rentas` sin que nadie lo notara. */
const RUTAS_DE_CODIGO = [
  /^backend\/[^/]+\/src\/main\//,
  /^infrastructure\/src\//,
  /^frontend\/src\//,
  // Un compose es configuracion de produccion: dice con que rol se conecta cada proceso,
  // que imagen corre y en que orden arranca. Ver la nota de arriba (#39).
  /^despliegue\//,
];

/**
 * Donde vive la fila. **Es uno, y ya no es una ventana de compatibilidad** (#114).
 *
 * Entre el 2026-09-11 y el 2026-09-12 fueron dos —`docs/agent/HISTORY.md` y `CLAUDE.md`—
 * porque el registro se mudaba de sitio y los seis repositorios no migran a la vez:
 * estrechar antes de que migrara el ultimo habria dejado rojos cruzados en los que todavia
 * escribian en el archivo viejo. **Los seis migraron el 2026-09-12**, asi que la ventana se
 * cierra y esta lista se estrecha en un cambio propio, que es lo que aquel comentario decia
 * que habria que hacer.
 *
 * Consecuencia, y es el punto: **una fila escrita en `CLAUDE.md` deja de contar**. Ese
 * archivo conserva la doctrina —que es una fila y que tiene que demostrar— y la cabecera de
 * la tabla vacia, pero la fila se escribe aqui. Si se admitieran los dos, el registro
 * volveria a partirse en dos sitios sin que nada lo dijera, que es de donde se sale.
 */
const DONDE_VIVE_LA_FILA = ['docs/agent/HISTORY.md'];

/** Como se declara que un PR cierra un issue. GitHub admite estas y alguna mas. */
const CIERRA = /\b(?:cierra|closes?|close|fixes?|fix|resuelve|resolves?)\s+#(\d+)/gi;

const opciones = leerOpciones(process.argv.slice(2));

const cuerpo = opciones.cuerpo
  ? readFileSync(opciones.cuerpo, 'utf8')
  : (process.env.KAMAYUK_CUERPO_DEL_PR ?? '');

const issues = [...cuerpo.matchAll(CIERRA)].map((coincidencia) => coincidencia[1]);
if (issues.length === 0) {
  console.log('El PR no declara que cierre ningun issue: no hay fila que exigir.');
  process.exit(0);
}

const archivos = opciones.archivos
  ? lineas(readFileSync(opciones.archivos, 'utf8'))
  : lineas(git(['diff', '--name-only', `${opciones.base}...HEAD`]));

const deCodigo = archivos.filter((ruta) => RUTAS_DE_CODIGO.some((patron) => patron.test(ruta)));
if (deCodigo.length === 0) {
  console.log(
    `Cierra #${issues.join(', #')} y no toca codigo de produccion: la fila no se exige.`,
  );
  process.exit(0);
}

const anadido = opciones.anadido
  ? readFileSync(opciones.anadido, 'utf8')
  : git(['diff', `${opciones.base}...HEAD`, '--', ...DONDE_VIVE_LA_FILA])
      .split('\n')
      .filter((linea) => linea.startsWith('+') && !linea.startsWith('+++'))
      .join('\n');

const sinFila = issues.filter((numero) => !nombra(anadido, numero));
if (sinFila.length > 0) {
  console.error('');
  console.error(`FALLO: falta la fila de «Verificar antes de afirmar» en ${DONDE_VIVE_LA_FILA[0]}.`);
  console.error('');
  for (const numero of sinFila) {
    console.error(
      `  · Este PR cierra #${numero} y no lo nombra ninguna linea nueva de ` +
        `${DONDE_VIVE_LA_FILA.join(' ni de ')}.`,
    );
  }
  console.error('');
  console.error('  Esa tabla es la memoria del proyecto: cada issue deja ahi que se');
  console.error('  implemento y COMO SE DEMOSTRO QUE LA VERIFICACION PUEDE FALLAR. Una fila');
  console.error('  que no se escribe es una leccion que el siguiente vuelve a descubrir');
  console.error('  ejecutando.');
  console.error('');
  console.error('  Lo que se comprueba aqui es solo que la fila EXISTA. Que diga la verdad');
  console.error('  —que la mutacion sea real y las cifras cuadren— lo lee la revision.');
  console.error('');
  console.error(`  Archivos de codigo en este cambio: ${deCodigo.length}`);
  console.error(`    ${deCodigo.slice(0, 5).join('\n    ')}`);
  process.exit(1);
}

console.log(`Cada issue que este PR cierra tiene su fila: #${issues.join(', #')}.`);

// ---------------------------------------------------------------------------

/**
 * Si alguna de esas lineas nuevas es **una fila** que nombra al issue —y no como parte de otro
 * numero—. Lo que se exige es una fila de la tabla, asi que la linea tiene que empezar por `|`.
 *
 * ## Por que no basta con buscar `#N` en cualquier linea anadida
 *
 * Hasta la mudanza del registro (#114) esto era un `test` sobre el texto entero, y **eso lo
 * satisface cualquier linea**: una cabecera, un parrafo introductorio, una nota al pie. Lo
 * destaparon **tres carriles a la vez** el mismo dia, y por el mismo camino: al mudar el
 * registro a `docs/agent/HISTORY.md`, la cabecera del archivo nuevo citaba su propio issue
 * —«se mudaron aqui por #114»—, asi que el diff contenia `#114` aunque no hubiera ni una fila.
 * La rotura de control —quitar la fila y comprobar que la guarda se pone roja— **salia VERDE**,
 * y una guarda que no puede fallar no protege nada: es exactamente el modo de fallo silencioso
 * que esta comprobacion existe para impedir.
 *
 * El arreglo es el minimo que distingue las dos cosas: la mencion tiene que estar **en una
 * linea que sea una fila**. Se acepta el `+` que el diff antepone y los espacios de sangria,
 * y nada mas — no se comprueba que la fila tenga tres columnas ni que diga la verdad, porque
 * eso es justo lo que lee la revision y no una maquina.
 */
function nombra(texto, numero) {
  const mencion = new RegExp(`#${numero}(?![0-9])`);
  return texto.split('\n').some((linea) => esFila(linea) && mencion.test(linea));
}

/** Si esa linea anadida es una fila de la tabla. El `+` es el del diff; la fila empieza por `|`. */
function esFila(linea) {
  return linea.replace(/^\+/, '').trimStart().startsWith('|');
}

function lineas(texto) {
  return texto
    .split('\n')
    .map((linea) => linea.trim())
    .filter((linea) => linea.length > 0);
}

function git(argumentos) {
  return execFileSync('git', argumentos, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function leerOpciones(argumentos) {
  const opciones = { base: 'origin/main' };
  for (let i = 0; i < argumentos.length; i += 2) {
    const nombre = argumentos[i];
    const valor = argumentos[i + 1];
    if (valor === undefined) {
      throw new Error(`Falta el valor de ${nombre}`);
    }
    if (!['--base', '--cuerpo', '--archivos', '--anadido'].includes(nombre)) {
      throw new Error(`Opcion desconocida: ${nombre}`);
    }
    opciones[nombre.slice(2)] = valor;
  }
  return opciones;
}
