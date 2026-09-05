package kamayuk.caja.nucleo.infraestructura.web;

import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * El cuerpo de {@code POST /caja/api/v1/cobros} (ADR-0026 §3). <b>Lista blanca</b>: lo que no esta
 * aqui no entra.
 *
 * <p><b>No hay ningun importe.</b> Ni total, ni por linea, ni un descuento. El cuanto lo trae la
 * orden de cobro que el sistema de origen dio de alta, y admitir aqui una cifra seria admitir que
 * el cliente decida cuanto se cobra.
 *
 * <p><b>Y tampoco hay ningun tributo, ni ejercicio, ni cuota</b> — que es lo que cambio con P5D.
 * Hasta la separacion este cuerpo llevaba una lista de obligaciones con su tributo y su ano; ahora
 * lleva identificadores de orden. La caja no sabe que es un tributo (ADR-0026 §1), y este record es
 * el sitio donde eso se ve antes que en ningun otro: es la frontera por la que entraria.
 *
 * <p><b>El beneficio declarado se fue con ellos.</b> Era la campana que el cajero invocaba, y una
 * campana de beneficio es una decision tributaria: si la caja la sigue guardando, el papel afirma
 * que se aplico algo que la caja no puede aplicar. El descuento, cuando D-02b cierre, lo aplica
 * quien emite la orden — y llega aqui como un importe ya rebajado con su motivo en {@code detalle}.
 *
 * @param caja el codigo de la ventanilla
 * @param cajero quien cobra
 * @param formaDePago EFECTIVO, CHEQUE, DEPOSITO, TARJETA o TRANSFERENCIA
 * @param fechaDePago la fecha del cobro, en ISO; si falta, hoy
 * @param ordenes las ordenes marcadas en la grilla, por su identificador en esta base
 * @param observacion por que se cobra (regla 10)
 */
public record PeticionDeCobranza(
        @Nullable String caja,
        @Nullable String cajero,
        @Nullable String formaDePago,
        @Nullable String fechaDePago,
        @Nullable List<Long> ordenes,
        @Nullable String observacion) {}
