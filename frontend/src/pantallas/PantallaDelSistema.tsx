import {
  Pantalla,
  type DatosDeLaPantalla,
  type DefinicionDePantalla,
  type HojaDelMarco,
  type NavegacionDeLaPantalla,
  type PiezaDeLaPantalla,
} from '@kamayuk/ui';
import { useTranslation } from 'react-i18next';

import { useTextosDelInterprete } from '../i18n/textosDelMarco.ts';
import { tonoDe } from './tono.ts';

/**
 * **El interprete de `@kamayuk/ui`, con lo que la ventanilla le pone** (#74).
 *
 * El interprete no sabe que sistema lo monta y pide tres cosas por `props`: con que traducir las
 * palabras de la definicion, sus tres palabras propias en el idioma de la sesion, y el reparto de
 * tonos de las insignias. Las tres son de este sistema y se ponen aqui, una vez, para que ninguna
 * pantalla pueda olvidarse de una.
 *
 * <h2>Y desde #99, lo que la hoja necesita para elegir</h2>
 *
 * `hoja` y `navegacion` las da el marco (`useHoja()` y `useNavegacion()` de `@kamayuk/shell`), y
 * son **las dos mitades de que lo elegido viva en la ruta**: la accion de una fila pide ir a su
 * hoja con el numero en el sujeto, y la pantalla lee ese sujeto de la ruta. Las dos son opcionales
 * porque las guardas montan la pantalla **fuera del armazon**, donde no hay ni catalogo ni ruta; sin
 * ellas el boton de la fila sale impedido con su motivo, que es lo que la libreria hace y no un
 * boton mudo.
 */
export interface PantallaDelSistemaProps {
  readonly definicion: DefinicionDePantalla<PiezaDeLaPantalla>;
  readonly datos: DatosDeLaPantalla;
  readonly alEnsuciar?: () => void;
  readonly hoja?: HojaDelMarco;
  readonly navegacion?: NavegacionDeLaPantalla;
}

export function PantallaDelSistema({
  definicion,
  datos,
  alEnsuciar,
  hoja,
  navegacion,
}: PantallaDelSistemaProps) {
  const { t } = useTranslation();
  const textos = useTextosDelInterprete();
  return (
    <Pantalla
      definicion={definicion}
      datos={datos}
      traducir={(texto) => t(texto)}
      textos={textos}
      tonoDeLaInsignia={tonoDe}
      {...(alEnsuciar === undefined ? {} : { alEnsuciar })}
      {...(hoja === undefined ? {} : { hoja })}
      {...(navegacion === undefined ? {} : { navegacion })}
    />
  );
}
