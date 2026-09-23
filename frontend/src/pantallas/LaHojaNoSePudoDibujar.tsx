import { Alerta, Boton } from '@kamayuk/ui';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * **La red de cada pantalla: lo que lance al dibujarse se queda en ella** (#117).
 *
 * <h2>Por que hace falta, si el reparto ya no lanza en el render</h2>
 *
 * Porque el reparto no es lo unico que corre al dibujar. Desde #117 el de los conectores corre en
 * el `select` de TanStack Query, y un dato malformado deja la hoja en su estado de fallo con su
 * frase (`useDatosDeLaHoja.ts`). Pero el interprete de `@kamayuk/ui` compone la definicion con los
 * datos en el render, y cualquier excepcion ahi —un dato que ninguna prueba planto, un defecto de la
 * libreria— **la recoge el enrutador** y pinta su «Unexpected Application Error!» en lugar del
 * armazon entero: se van el menu, la barra y la sesion, y quien estaba en la ventanilla no puede ni
 * irse a otra hoja. Medido en `verificaciones/una-hoja-que-revienta-no-tumba-la-raiz.test.tsx`.
 *
 * Las dos cosas y no una sola: el `select` es lo que hace que el caso conocido —un importe con otra
 * forma— se diga **como lo que es**, en la hoja y con los campos marcados; esta red es para lo que
 * nadie ha previsto, y sin ella lo imprevisto vuelve a llevarse la raiz.
 *
 * <h2>Por que una por pantalla, y no una en la raiz</h2>
 *
 * Una en la raiz cambiaria el «Unexpected Application Error!» por otra pagina en blanco con mejor
 * letra: el menu se iria igual. Por pantalla, lo que se cae es la hoja, y el carril sigue para
 * elegir otra. `aplicacion.tsx` la monta con `key` por destino, asi que cambiar de hoja empieza
 * limpio.
 *
 * <h2>Por que nombra lo que lanzo</h2>
 *
 * Porque es lo que soporte necesita para encontrarlo, y porque `formatearImporte` —el caso mas
 * probable— lanza nombrando el valor. No pasa por el catalogo de traducciones: es el dato del
 * fallo, no una frase de la interfaz.
 *
 * Un componente de clase porque React no ofrece otra forma de recoger lo que lanza un render.
 */
interface Props {
  readonly children: ReactNode;
}

interface Estado {
  readonly error: Error | null;
}

export class LaHojaNoSePudoDibujar extends Component<Props, Estado> {
  override state: Estado = { error: null };

  static getDerivedStateFromError(error: unknown): Estado {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    // A la consola, con la pila de componentes: es donde lo busca quien depura.
    console.error('Una pantalla de la ventanilla no se pudo dibujar', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error === null) return this.props.children;
    return (
      <AvisoDeLaHojaRota
        error={this.state.error}
        alReintentar={() => {
          this.setState({ error: null });
        }}
      />
    );
  }
}

function AvisoDeLaHojaRota({ error, alReintentar }: { readonly error: Error; readonly alReintentar: () => void }) {
  const { t } = useTranslation();
  return (
    <div data-hoja-rota="" className="p-[15px]">
      <Alerta tono="mal" titulo={t('Esta pantalla no se pudo dibujar')}>
        <p className="m-0">
          {t(
            'El resto de la ventanilla sigue en pie: puede elegir otra opción del menú. Si vuelve a pasar, avise a soporte con el nombre de esta pantalla y lo que dice abajo.',
          )}
        </p>
        <p className="mt-[6px] mb-0 break-words font-mono text-[12.5px]">{error.message}</p>
        <div className="mt-[10px]">
          <Boton type="button" tamano="menudo" onClick={alReintentar}>
            {t('Volver a dibujarla')}
          </Boton>
        </div>
      </Alerta>
    </div>
  );
}
