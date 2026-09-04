# Carga de datos de `caja`

Aqui vive **lo que una municipalidad recien implantada necesita para poder cobrar**, y
hoy es una sola cosa: sus ventanillas.

## `cargar-cajas.sh` y `ejemplos/cajas.csv`

Es el paso **4** de los diez de la siembra de la demostracion (#430). Su motivo esta escrito
alli y no ha cambiado con la separacion: **nada crea un `area` ni una `caja` fuera de las
fixtures de prueba**, asi que una instalacion con padron, predios y deuda no puede abrir la
ventanilla. Ninguna de las diez opciones de Tesoreria del manual da de alta una caja, y
publicar un endpoint que ninguna pantalla llama seria inventar contrato: la configuracion de
la municipalidad entra por aqui.

**No exige `es_demostracion`**, al reves que los seis pasos que siembran personas y predios
inventados: una ventanilla no es un dato inventado, es la configuracion con la que una
municipalidad **real** abre su caja.

El archivo lo carga `ImportarCajas`, en el perfil `batch`, y
`AltaDeCajasJdbcTest.elArchivoDeEjemploSeCargaEntero` lo lee **de aqui** —el archivo real, no
una copia en el classpath— y exige que entre entero, sin una sola fila rechazada. Una fila que
nombre un area inexistente se rechaza sola y no revienta la corrida.

**El guion estaba en `infrastructure` y el cargador aqui** (hueco 11 de P5D). C-6 lo trajo:
un guion y el proceso que lo atiende tienen que estar en el mismo repositorio, porque un guion
lanzado contra la imagen equivocada arranca la aplicacion, no carga nada y sale con codigo 0.
Que sigan juntos lo comprueba `siembra-de-la-demostracion.test.ts` de `infrastructure`.

## El orden completo no esta aqui, y es a proposito

`cajas.csv` no depende de nada y nada depende de el, asi que dentro de `caja` no hay orden que
guardar. El de los diez pasos —cual va antes de cual, y de que repositorio es cada uno— vive en
[`infrastructure/infra/carga-de-datos/siembra/pasos.tsv`](https://github.com/hneyra/infrastructure/blob/main/infra/carga-de-datos/siembra/pasos.tsv),
que es el unico sitio desde el que se ven los tres sistemas a la vez (ADR-0031).

```bash
../../../infrastructure/infra/carga-de-datos/siembra/sembrar-demostracion.sh \
    --ambiente stg --municipalidad-id 4 \
    --url-catastro postgresql://… --url-rentas postgresql://… --url-caja postgresql://…
```

Lo que la siembra deja en esta base se comprueba contando: **5 ventanillas y 3 areas**, y esas
dos cifras no estan escritas en ninguna parte — salen de `cajas.csv` (sus filas, y sus
`codigoArea` distintos).

## Lo que aqui NO entra

Ninguna cifra normativa —tarifas del TUPA incluidas—: esas se publican desde el corpus
verificado a doble firma de `normativa`, o no entran (ADR-0028).
