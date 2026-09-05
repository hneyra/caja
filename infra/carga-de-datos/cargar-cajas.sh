#!/usr/bin/env bash
# Da de alta las ventanillas (cajas) de una municipalidad contra un ambiente real (#430),
# corriendo el proceso batch CargarCajas (kamayuk-caja-nucleo) como un Job de
# un solo uso.
#
# No pasa por Pulumi a proposito: es una carga de datos puntual -una vez por
# municipalidad-, no un paso que corra en cada despliegue. Un ConfigMap efimero lleva
# el CSV al pod (backoffLimit: 0 y el ConfigMap se borra al salir, con exito o sin el);
# las credenciales son las mismas que ya usa el Deployment de la aplicacion
# (kamayuk_app: area y caja son tablas de tenant que ya escribe, desde V7).
#
# NO exige municipalidad.es_demostracion, a diferencia de los seis pasos que siembran
# personas y predios inventados: una ventanilla no es un dato inventado, es la
# configuracion con la que una municipalidad REAL abre su caja. Sin ninguna, la primera
# cobranza del dia falla con CajaInexistente (#430).
#
# El municipalidad-id se obtiene de municipalidad.id (lo deja implantacion en el log, o
# se consulta con "SELECT id FROM municipalidad WHERE ubigeo = ...").
#
#
# ESTE GUION VIVE EN EL REPOSITORIO DE SU PROCESO, y no es una preferencia (C-6): un guion
# lanzado contra la imagen de otro sistema arranca la aplicacion, NO CARGA NADA y sale con
# codigo 0 -medido, sin un solo aviso-. El orden de los diez pasos de la siembra, con su
# dueno, esta escrito una sola vez en
# `infrastructure/infra/carga-de-datos/siembra/pasos.tsv`, que es el unico sitio desde el
# que se ven los tres sistemas a la vez (ADR-0031).
#   uso: cargar-cajas.sh --ambiente stg|prod --municipalidad-id N --archivo cajas.csv
#        [--namespace kamayuk-stg] [--observacion "..."]
#
# Requiere: kubectl con el tunel al API del ambiente ya abierto (ver infra/README.md),
# y el mismo kubeconfig que usa pulumi up.
set -euo pipefail

AMBIENTE=""
MUNICIPALIDAD_ID=""
ARCHIVO=""
NAMESPACE=""
OBSERVACION="Alta de las ventanillas de la municipalidad (#430)"
while [ $# -gt 0 ]; do
    case "$1" in
        --ambiente) AMBIENTE=${2:?falta el valor de --ambiente}; shift 2 ;;
        --municipalidad-id) MUNICIPALIDAD_ID=${2:?falta el valor de --municipalidad-id}; shift 2 ;;
        --archivo) ARCHIVO=${2:?falta el valor de --archivo}; shift 2 ;;
        --namespace) NAMESPACE=${2:?falta el valor de --namespace}; shift 2 ;;
        --observacion) OBSERVACION=${2:?falta el valor de --observacion}; shift 2 ;;
        *) echo "Opcion desconocida: $1" >&2; exit 2 ;;
    esac
done
[ -n "$AMBIENTE" ] || { echo "Falta --ambiente (stg o prod)." >&2; exit 2; }
[ -n "$MUNICIPALIDAD_ID" ] || { echo "Falta --municipalidad-id." >&2; exit 2; }
[ -n "$ARCHIVO" ] || { echo "Falta --archivo (el CSV codigo,nombre,serie,codigoArea,nombreArea)." >&2; exit 2; }
[ -f "$ARCHIVO" ] || { echo "No existe el archivo: $ARCHIVO" >&2; exit 2; }
NAMESPACE=${NAMESPACE:-kamayuk-$AMBIENTE}

SUFIJO=$(date +%s)
RECURSO="kamayuk-${AMBIENTE}-carga-cajas-${SUFIJO}"

IMAGEN=$(kubectl -n "$NAMESPACE" get deployment "kamayuk-${AMBIENTE}-aplicacion" \
    -o jsonpath='{.spec.template.spec.containers[0].image}')
[ -n "$IMAGEN" ] || {
    echo "No se pudo leer la imagen de kamayuk-${AMBIENTE}-aplicacion en $NAMESPACE" >&2
    exit 1
}
echo "Imagen desplegada: $IMAGEN"

echo "Creando ConfigMap $RECURSO con $ARCHIVO..."
kubectl -n "$NAMESPACE" create configmap "$RECURSO" --from-file=cajas.csv="$ARCHIVO"

cleanup() {
    kubectl -n "$NAMESPACE" delete configmap "$RECURSO" --ignore-not-found >/dev/null
}
trap cleanup EXIT

cat <<EOF | kubectl -n "$NAMESPACE" apply -f -
apiVersion: batch/v1
kind: Job
metadata:
  name: $RECURSO
  labels:
    proyecto: sgtm
    ambiente: $AMBIENTE
    componente: carga-cajas
spec:
  backoffLimit: 0
  template:
    metadata:
      labels:
        proyecto: sgtm
        ambiente: $AMBIENTE
        componente: carga-cajas
        # NetworkPolicy "permitir-ingreso-postgres" (infra/componentes/Red.ts) solo deja
        # pasar al puerto 5432 a pods con app en {aplicacion, identidad, migracion,
        # implantacion, lote, respaldo}: "lote" es la etiqueta generica para un Job de
        # un solo uso que necesita hablar con la base. Con "carga-cajas" el pod arranca
        # pero la conexion cae con "Connection refused" -denegacion por omision
        # funcionando como se disenio, no un error de credenciales.
        app: lote
    spec:
      restartPolicy: Never
      priorityClassName: kamayuk-${AMBIENTE}-prioridad-lote
      containers:
        - name: carga-cajas
          image: $IMAGEN
          env:
            - name: SPRING_PROFILES_ACTIVE
              value: batch
            - name: KAMAYUK_DB_URL
              value: jdbc:postgresql://kamayuk-${AMBIENTE}-postgres:5432/sgtm
            - name: KAMAYUK_DB_USUARIO
              value: kamayuk_app
            - name: KAMAYUK_DB_CLAVE
              valueFrom:
                secretKeyRef:
                  name: kamayuk-${AMBIENTE}-postgres-app
                  key: clave-app
            - name: KAMAYUK_CARGACAJAS_MUNICIPALIDADID
              value: "$MUNICIPALIDAD_ID"
            - name: KAMAYUK_CARGACAJAS_ARCHIVO
              value: /datos/cajas.csv
            - name: KAMAYUK_CARGACAJAS_USUARIODELPROCESO
              value: carga-cajas
            - name: KAMAYUK_CARGACAJAS_OBSERVACION
              value: "$OBSERVACION"
          volumeMounts:
            - name: datos
              mountPath: /datos
              readOnly: true
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop: ["ALL"]
            runAsNonRoot: true
          resources:
            requests: { cpu: "250m", memory: "256Mi" }
            limits: { cpu: "1", memory: "512Mi" }
      volumes:
        - name: datos
          configMap:
            name: $RECURSO
EOF

echo "Esperando a que $RECURSO termine..."
LIMITE=$((SECONDS + 300))
while true; do
    completo=$(kubectl -n "$NAMESPACE" get job "$RECURSO" \
        -o jsonpath='{.status.conditions[?(@.type=="Complete")].status}')
    fallido=$(kubectl -n "$NAMESPACE" get job "$RECURSO" \
        -o jsonpath='{.status.conditions[?(@.type=="Failed")].status}')
    if [ "$completo" = "True" ]; then
        echo "Completado."
        break
    fi
    if [ "$fallido" = "True" ]; then
        echo "El Job fallo. Registro:" >&2
        kubectl -n "$NAMESPACE" logs "job/$RECURSO" --tail=500 >&2
        exit 1
    fi
    [ "$SECONDS" -lt "$LIMITE" ] || {
        echo "Se agoto el tiempo de espera (300s)." >&2
        exit 1
    }
    sleep 3
done

kubectl -n "$NAMESPACE" logs "job/$RECURSO" --tail=500
