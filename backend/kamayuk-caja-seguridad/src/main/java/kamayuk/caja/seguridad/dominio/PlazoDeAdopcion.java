package kamayuk.caja.seguridad.dominio;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import kamayuk.caja.dominio.ZonaHoraria;

/**
 * Cuanto sigue concediendo una fila de {@code usuario} o de {@code grupo} que no lleva sujeto de
 * {@code identidad} (#125).
 *
 * <h2>De donde sale una fila sin sujeto, y por que no se puede arreglar desde aqui</h2>
 *
 * <p>Desde V5 (#111) la copia casa por {@code identidad_sujeto_id}, y toda fila que el aplicador
 * inserta lo lleva. Una fila SIN el solo puede ser de antes de V5, y de dos clases que desde aqui
 * NO se distinguen: la legitima que todavia no recibio su primer evento —se adopta en cuanto {@code
 * identidad} la nombre— y la <b>huerfana</b> —la clave vieja que el defecto de #111 dejo tras un
 * renombrado, o la fila de antes de V5 cuyo primer evento fue precisamente un renombrado—, que no
 * va a recibir ningun evento nunca porque su sujeto ya casa con otra fila. Distinguirlas exigiria
 * preguntarle a {@code identidad} si esa clave existe, y {@code identidad} no publica otra cosa que
 * su buzon. Y cerrarla escribiendola, sin un evento que la nombre, no se puede: la regla 12 deja un
 * solo escritor de estas tablas, {@code AplicarUnEventoDeIdentidad}, que escribe lo que llega por
 * el buzon, y un migrador que intentara el {@code UPDATE} moriria bajo RLS (hallazgo 4).
 *
 * <h2>Lo que se decidio: dejar de conceder pasado un plazo, y avisar mientras tanto</h2>
 *
 * <p>El guardia ({@code ComprobadorDeAccesoJdbc}) y la matriz de la sesion ({@code
 * LecturaDeLaCopiaLocalJdbc}) no conceden por una fila sin sujeto cuando pasaron {@value #DIAS}
 * dias desde {@code sin_sujeto_desde} (V6, el instante en que la migracion la encontro); y una fila
 * sin sujeto y SIN fecha —escrita por fuera del aplicador despues de V6, o RETIRADA por el— no
 * concede nunca. Mientras el plazo corre, cada corrida del consumidor avisa al responsable con la
 * lista y el dia en que cada una dejara de conceder. El plazo no escribe nada: falla cerrado sin un
 * segundo escritor.
 *
 * <p><b>Salvo cuando un alta choca con su clave</b> (seguimiento de #125). Un {@code
 * *_DADO_DE_ALTA} cuya clave ya es de una fila sin sujeto es de un sujeto cuya alta no entro aqui,
 * y esa persona entra con esa clave: dentro del plazo, la fila le concederia lo que tenga, sin
 * saber si era suya. El aplicador aparta ese alta y, en la misma transaccion, le quita a la fila su
 * {@code sin_sujeto_desde} ({@code AplicarUnEventoDeIdentidad.apartar}): deja de conceder en el
 * acto, sin esperar al plazo. Lo escribe el unico escritor de la regla 12. Falla cerrado: si era la
 * misma persona —un alta que llego tarde para una fila sembrada aqui antes de la etapa 5—, hoy no
 * tiene remedio dentro de las reglas, y por eso hay que vaciar el buzon antes de desplegarlo.
 *
 * <p><b>El precio, y por que se paga.</b> Una cuenta legitima que nadie toca en {@code identidad}
 * durante el plazo pierde el acceso aqui. Su remedio es un acto normal en {@code identidad} que
 * publique un evento que la nombre por su clave sin cambiar lo que concede —re-habilitar la cuenta
 * o el grupo, fijarle la vigencia que ya tiene, re-afiliarla a un grupo en el que ya esta o volver
 * a fijarle un permiso de {@code caja} que ya tiene—: el evento la adopta y vuelve a conceder en la
 * corrida siguiente. Un {@code *_MODIFICADO} que trajera OTRA clave no la adoptaria —buscaria la
 * nueva e insertaria otra fila—, aunque {@code identidad@6c5e433} no tiene ninguna operacion que
 * cambie una clave. Sin plazo (dejar de conceder desde el despliegue) cerraria de golpe la
 * ventanilla de toda instalacion anterior a #111; sin dejar de conceder nunca (solo avisar), una
 * huerfana concederia para siempre, que es el defecto.
 *
 * <p><b>El alcance, los procedimientos y lo que queda sin cerrar</b> —que el plazo alcanza a toda
 * fila de antes de V5 que nadie toco, administrador, cuentas de servicio y grupos incluidos; que
 * hacer antes y despues de desplegar en una instalacion anterior a #111; y por que el alta apartada
 * de un sujeto hoy no tiene remedio— estan en {@code docs/40-datos/filas-sin-sujeto.md}.
 *
 * <p><b>En una base implantada despues de #111 esto no cambia nada</b>: todas sus filas nacen de un
 * evento con sujeto (lo mide {@code ImplantacionDeCeroJdbcTest}), asi que el plazo solo corre en
 * las instalaciones que ya tenian filas al llegar V5.
 *
 * <p><b>Por que una constante y no una propiedad.</b> La leen tres procesos —el guardia en {@code
 * web}, la matriz en {@code web} y el aviso en {@code batch}—, y con una propiedad por proceso el
 * aviso podria decir «concede hasta el 12» mientras el guardia ya niega desde el 10.
 */
public final class PlazoDeAdopcion {

    /**
     * Una semana: caiga cuando caiga el despliegue, contiene cinco dias habiles, y con un aviso por
     * corrida (cada cinco minutos) es tiempo de sobra para tocar en {@code identidad} las cuentas
     * legitimas, sin alargar mas de lo necesario lo que una huerfana ya lleva concediendo.
     */
    public static final int DIAS = 7;

    private PlazoDeAdopcion() {}

    /**
     * El primer DIA de {@code sin_sujeto_desde} que todavia concede el dia {@code hoy}. El limite
     * es inclusivo, como las vigencias: la fila fechada hace exactamente {@value #DIAS} dias
     * concede hoy por ultima vez.
     */
    public static LocalDate corte(LocalDate hoy) {
        return hoy.minusDays(DIAS);
    }

    /**
     * Lo mismo, como el instante con que se compara la columna: una fila sin sujeto concede si
     * {@code sin_sujeto_desde >=} este instante, que es el comienzo, EN LIMA, del dia {@link
     * #corte}. {@code sin_sujeto_desde} es un {@code timestamptz} (V6) precisamente para que la
     * zona se ponga aqui, con {@link ZonaHoraria}, y no en el SQL. Con desfase UTC porque es la
     * forma en que el controlador de PostgreSQL enlaza un instante; el instante es el mismo.
     */
    public static OffsetDateTime primerInstanteQueConcede(LocalDate hoy) {
        return ZonaHoraria.comienzoDelDia(corte(hoy)).atOffset(ZoneOffset.UTC);
    }

    /** El ultimo dia en que concede una fila sin sujeto fechada {@code desde}. */
    public static LocalDate concedeHasta(LocalDate desde) {
        return desde.plusDays(DIAS);
    }
}
