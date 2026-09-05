package kamayuk.caja.nucleo.dominio;

/** Que le paso al dinero. Los dos valores de {@code pago_evento_tipo_ck} (V2). */
public enum TipoDeEventoDePago {
    /** Se cobro. El sistema de origen tiene que imputarlo. */
    PAGO_REGISTRADO,
    /**
     * Se anulo el mismo dia.
     *
     * <p>El sistema de origen tiene que <b>reversar</b>, nunca borrar: su libro es inmutable
     * (ADR-0006) y {@code recibo} esta en las tablas protegidas. Que el evento se llame «anulado» y
     * no «borrado» es la mitad del criterio 4 del encargo.
     */
    PAGO_ANULADO
}
