package kamayuk.caja.verificaciones.muestras;

import kamayuk.caja.dominio.Ejercicio;

/**
 * Viola a proposito la regla de {@code FronteraTributariaDelDominioTest} (ADR-0045, #118): una
 * clase NUEVA de dominio que suma un concepto tributario que no estaba heredado del recibo del
 * monolito. Existe solo para que {@code FronteraTributariaMuerdeSobreLaMuestraTest} pueda demostrar
 * que la regla muerde: una regla sin una muestra que la viole pasa en verde para siempre y no
 * protege nada.
 *
 * <p>No vive en {@code kamayuk.caja.nucleo.dominio} —el paquete real que la regla vigila en
 * produccion— porque una muestra que violara produccion de verdad rompería {@code
 * verificarArquitectura} para todo el mundo; vive en su propio paquete de muestras, y la prueba que
 * la ejercita construye la MISMA regla apuntando a este paquete, no al arbol real.
 */
public final class ConceptoTributarioNuevoDeMuestra {

    private final Ejercicio ejercicio;

    public ConceptoTributarioNuevoDeMuestra(Ejercicio ejercicio) {
        this.ejercicio = ejercicio;
    }

    public Ejercicio ejercicio() {
        return ejercicio;
    }
}
