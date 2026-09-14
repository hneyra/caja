import { Pantalla, type DatosDeLaPantalla, type DefinicionDePantalla } from '@kamayuk/ui';
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
 */
export interface PantallaDelSistemaProps {
  readonly definicion: DefinicionDePantalla;
  readonly datos: DatosDeLaPantalla;
  readonly alEnsuciar?: () => void;
}

export function PantallaDelSistema({ definicion, datos, alEnsuciar }: PantallaDelSistemaProps) {
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
    />
  );
}
