#!/usr/bin/env bash
# Demo "Póliza en vivo" (Ridery): 2 conductores con viajes urbanos / extra urbanos y pagos, con pausas
# para ver cómo se llena sola la pestaña Flota por uso → Póliza en vivo.
#
# Uso (en el 120, con la pantalla abierta en http://192.168.8.120:3096/):
#   bash scripts/demo-poliza-en-vivo.sh
# Variables opcionales:
#   BASE=http://127.0.0.1:3096/api   API de servidor-viajes
#   API_KEY=...                      X-Api-Key de la flota (si no, usa el acceso directo FLOTA_ACCESO_DIRECTO=1)
#   PAUSA=3                          segundos entre eventos
#   CERT1=1 DOC1=V-12345678 PLACA1=AB123CD NOMBRE1="José Pérez"      conductor 1 → certificado 1
#   CERT2=2 DOC2=V-20123456 PLACA2=CD456EF NOMBRE2="María González"  conductor 2 → certificado 2
#
# Recibos propios de Nexus (RDY-<póliza>-<cert>-<seq>, Fase 1). Si backend/.env tiene FLOTA_RECIBO_REAL=1 se detiene
# (generaría recibos reales en Sis2000).
set -euo pipefail

BASE="${BASE:-http://127.0.0.1:3096/api}"
PAUSA="${PAUSA:-3}"
CERT1="${CERT1:-1}"; DOC1="${DOC1:-V-12345678}"; PLACA1="${PLACA1:-AB123CD}"; NOMBRE1="${NOMBRE1:-José Pérez}"
CERT2="${CERT2:-2}"; DOC2="${DOC2:-V-20123456}"; PLACA2="${PLACA2:-CD456EF}"; NOMBRE2="${NOMBRE2:-María González}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ -f "$ROOT/backend/.env" ] && grep -qE '^FLOTA_RECIBO_REAL=1' "$ROOT/backend/.env"; then
  echo "✖ FLOTA_RECIBO_REAL=1: esta demo generaría recibos REALES en Sis2000. Apáguelo o no la corra aquí."
  exit 1
fi

# JSON → campo (node siempre está en los servidores; no depende de jq).
campo() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);const v=process.argv[1].split(".").reduce((a,k)=>a==null?a:a[k],o);console.log(v==null?"":typeof v==="object"?JSON.stringify(v):v)}catch{console.log("")}})' "$1"; }

if [ -n "${API_KEY:-}" ]; then
  AUTH=(-H "X-Api-Key: $API_KEY")
else
  TOKEN=$(curl -fsS -X POST "$BASE/auth/directo" -H 'Content-Type: application/json' -d '{}' | campo sessionToken)
  [ -n "$TOKEN" ] || { echo "✖ Sin API_KEY y el acceso directo no respondió (¿FLOTA_ACCESO_DIRECTO=1?)."; exit 1; }
  AUTH=(-H "X-Session-Token: $TOKEN")
fi

# Pasajero de demostración: cada INICIO exige la lista de personas que viajan.
PAS_DEMO='[{"tipoDoc":"V","documento":"11222333","nombres":"Pasajero","apellidos":"Demo","telefono":"+584120000000","correo":"pasajero.demo@example.com"}]'
api() { # método ruta [json]
  curl -sS -X "$1" "$BASE$2" "${AUTH[@]}" -H 'Content-Type: application/json' ${3:+-d "$3"}
}

echo "▶ Certificados de prueba (asociación local conductor → certificado; no toca Sis2000)"
api PUT /flota/certificados "{\"ccerti\":$CERT1,\"placa\":\"$PLACA1\",\"conductorDoc\":\"$DOC1\",\"conductorNombre\":\"$NOMBRE1\",\"activo\":true}" > /dev/null
api PUT /flota/certificados "{\"ccerti\":$CERT2,\"placa\":\"$PLACA2\",\"conductorDoc\":\"$DOC2\",\"conductorNombre\":\"$NOMBRE2\",\"activo\":true}" > /dev/null
echo "  cert $CERT1 = $NOMBRE1 ($DOC1 / $PLACA1) · cert $CERT2 = $NOMBRE2 ($DOC2 / $PLACA2)"

PREF="DEMO-$(date +%m%d%H%M%S)"
N=0

# viaje <conductor 1|2> <km> <clasificacion|""> <pagar si|no>
viaje() {
  local c="$1" km="$2" clas="$3" pagar="$4" doc placa nombre id ini fin monto ref clasJson=""
  if [ "$c" = 1 ]; then doc=$DOC1; placa=$PLACA1; nombre=$NOMBRE1; else doc=$DOC2; placa=$PLACA2; nombre=$NOMBRE2; fi
  N=$((N + 1)); id="$PREF-$N"
  [ -n "$clas" ] && clasJson=",\"clasificacion\":\"$clas\""
  ini=$(date -u -d "-$((km / 2 + 5)) min" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)
  api POST /flota/viajes/evento "{\"idViaje\":\"$id\",\"tipo\":\"INICIO\",\"pasajeros\":$PAS_DEMO,\"fecha\":\"$ini\",\"placa\":\"$placa\",\"conductorDoc\":\"$doc\",\"conductorNombre\":\"$nombre\",\"kmEstimados\":$km$clasJson}" > /dev/null
  echo "  $id INICIO  $nombre  ~$km km  (EN CURSO)"
  sleep "$PAUSA"
  fin=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  local r; r=$(api POST /flota/viajes/evento "{\"idViaje\":\"$id\",\"tipo\":\"FIN\",\"fecha\":\"$fin\",\"km\":$km$clasJson}")
  monto=$(echo "$r" | campo monto)
  echo "  $id FIN     $(echo "$r" | campo clasificacion) $km km → $monto USD (POR COBRAR)"
  [ -n "$monto" ] || { echo "    respuesta: $r"; return; }
  sleep "$PAUSA"
  if [ "$pagar" = si ]; then
    ref="PAY-$id"
    r=$(api POST /flota/viajes/pago "{\"idViaje\":\"$id\",\"monto\":$monto,\"moneda\":\"USD\",\"referencia\":\"$ref\",\"metodo\":\"WALLET\"}")
    echo "  $id PAGO    $monto USD ref $ref → recibo $(echo "$r" | campo pago.recibo.cnrecibo) ($(echo "$r" | campo pago.recibo.estado))"
    sleep "$PAUSA"
  fi
}

echo "▶ Viajes ($PREF-*). Abra Flota por uso → Póliza en vivo."
viaje 1 9 "" si            # urbano 9 km  → mínimo / km
viaje 2 35 "" si           # extra urbano 35 km
viaje 1 14 URBANO si
viaje 2 6 "" si
viaje 1 42 EXTRA_URBANO si
viaje 2 12 "" no           # queda POR COBRAR (sin pago)

# Un viaje cancelado (no genera recibo)
N=$((N + 1)); id="$PREF-$N"
api POST /flota/viajes/evento "{\"idViaje\":\"$id\",\"tipo\":\"INICIO\",\"pasajeros\":$PAS_DEMO,\"placa\":\"$PLACA1\",\"conductorDoc\":\"$DOC1\",\"conductorNombre\":\"$NOMBRE1\"}" > /dev/null
sleep "$PAUSA"
api POST /flota/viajes/evento "{\"idViaje\":\"$id\",\"tipo\":\"CANCELACION\",\"motivo\":\"Pasajero canceló (demo)\"}" > /dev/null
echo "  $id CANCELADO"

# Un viaje que queda EN CURSO (se ve con la marca EN VIAJE)
N=$((N + 1)); id="$PREF-$N"
api POST /flota/viajes/evento "{\"idViaje\":\"$id\",\"tipo\":\"INICIO\",\"pasajeros\":$PAS_DEMO,\"placa\":\"$PLACA2\",\"conductorDoc\":\"$DOC2\",\"conductorNombre\":\"$NOMBRE2\",\"kmEstimados\":8}" > /dev/null
echo "  $id INICIO (queda EN CURSO)"

echo "▶ Resumen de la póliza en vivo:"
api GET /flota/poliza-en-vivo | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);console.log("  fuente:",o.fuente,"· recibos reales:",o.reciboReal);console.log("  totales:",JSON.stringify(o.totales));for(const c of o.certificados)console.log(`  cert ${c.ccerti??"—"} ${c.conductorNombre??""} ${c.placa??""}: ${c.totales.viajes} viajes, ${c.totales.km} km, cobrado ${c.totales.primasCobradas}, por cobrar ${c.totales.primasPendientes}`)})'

echo "▶ Recibos propios (Nexus) de la póliza — GET /flota/recibos:"
api GET "/flota/recibos?limit=20" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);console.log("  póliza",o.cnpoliza,"· totales:",JSON.stringify(o.totales));for(const r of o.recibos.slice(0,10))console.log(`  ${r.numero} ${r.idExterno} ${r.monto} ${r.moneda} ${r.estado} ref ${r.referenciaPago??"—"} sync ${r.syncSis2000}`)})'
echo "▶ CSV para La Mundial: GET /flota/recibos/csv → $(api GET /flota/recibos/csv | wc -l) líneas (con cabecera)"
