package kamayuk.caja.verificaciones;

import kamayuk.comun.verificaciones.ArquitecturaTestBase;

/**
 * Las reglas de ARQ-04 §2 aplicadas al codigo de `caja`.
 *
 * <p>El cuerpo esta en {@code comun-verificaciones}; lo que cambia lo declara {@link
 * ConfiguracionDeCaja}, que encuentra {@code ServiceLoader}.
 *
 * <p>Esta clase tiene que existir: sin ella la barrera no corre en este build.
 */
class ArquitecturaTest extends ArquitecturaTestBase {}
