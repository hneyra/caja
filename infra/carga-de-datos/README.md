# Carga de datos de `caja`

Aqui vive **lo que una municipalidad recien implantada necesita para poder cobrar**, y
hoy es una sola cosa: sus ventanillas.

## `ejemplos/cajas.csv`

Es el archivo del paso que `sgtm` numeraba como el cuarto de la siembra (#430). Su
motivo esta escrito alli y no ha cambiado con la separacion: **nada crea un `area` ni una
`caja` fuera de las fixtures de prueba**, asi que una instalacion con padron, predios y
deuda no puede abrir la ventanilla. Ninguna de las diez opciones de Tesoreria del manual
da de alta una caja, y publicar un endpoint que ninguna pantalla llama seria inventar
contrato: la configuracion de la municipalidad entra por aqui.

**No exige `es_demostracion`**, al reves que los seis pasos que siembran personas y
predios inventados: una ventanilla no es un dato inventado.

El archivo lo carga `ImportarCajas`, en el perfil `batch`, y
`AltaDeCajasJdbcTest.elArchivoDeEjemploSeCargaEntero` lo lee **de aqui** —el archivo
real, no una copia en el classpath— y exige que entre entero, sin una sola fila
rechazada. Una fila que nombre un area inexistente se rechaza sola y no revienta la
corrida.

## Lo que aqui NO entra

Ninguna cifra normativa —tarifas del TUPA incluidas—: esas se publican desde el corpus
verificado a doble firma de `normativa`, o no entran (ADR-0028).
