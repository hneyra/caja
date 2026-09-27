package kamayuk.caja.verificaciones.muestras;

import kamayuk.caja.dominio.Alicuota;

/**
 * Viola a proposito la regla de {@code FronteraTributariaDelDominioTest} (ADR-0045, #118): una
 * clase NUEVA de dominio que suma un concepto tributario que no estaba heredado del recibo del
 * monolito. Existe solo para que {@code FronteraTributariaMuerdeSobreLaMuestraTest} pueda demostrar
 * que la regla muerde: una regla sin una muestra que la viole pasa en verde para siempre y no
 * protege nada.
 *
 * <p>Lleva a proposito un campo {@link Alicuota} y NO {@code Ejercicio}: la primera version de la
 * regla (antes de la ronda 1 de #118) solo vigilaba {@code Ejercicio} por nombre, y una muestra con
 * {@code Alicuota} la habria dejado pasar en VERDE —el mismo hueco que un tipo tributario nuevo de
 * verdad habria encontrado—. La version que falla cerrado prohibe cualquier tipo de {@code
 * kamayuk.caja.dominio} que no sea uno de los dos genericos permitidos, y por eso {@code Alicuota}
 * tambien muerde, sin que nadie tuviera que acordarse de nombrarla.
 *
 * <p>No vive en {@code kamayuk.caja.nucleo.dominio} —el paquete real que la regla vigila en
 * produccion— porque una muestra que violara produccion de verdad rompería {@code
 * verificarArquitectura} para todo el mundo; vive en su propio paquete de muestras, y la prueba que
 * la ejercita construye la MISMA regla apuntando a este paquete, no al arbol real.
 */
public final class ConceptoTributarioNuevoDeMuestra {

    private final Alicuota alicuota;

    public ConceptoTributarioNuevoDeMuestra(Alicuota alicuota) {
        this.alicuota = alicuota;
    }

    public Alicuota alicuota() {
        return alicuota;
    }
}
