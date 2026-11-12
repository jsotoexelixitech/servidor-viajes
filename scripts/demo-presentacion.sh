#!/usr/bin/env bash
# Demo de la PRESENTACIÓN (Ridery): con la póliza ACTIVA (la creada por Excel en "Crear flota"), hace 5 viajes
# con conductores de esa póliza — urbano, extra urbano e interurbano —, paga 4 y deja 1 POR COBRAR.
# Con FLOTA_RECIBO_REAL=1 cada pago genera su recibo REAL en Sis2000 sobre el certificado del conductor.
#
# Uso (en el 120, con la pantalla o el link público /poliza/<token> abiertos):
#   bash scripts/demo-presentacion.sh
# Variables opcionales:
#   BASE=http://127.0.0.1:3096/api   API de servidor-viajes
#   API_KEY=...                      X-Api-Key de la flota (si no, acceso directo FLOTA_ACCESO_DIRECTO=1)
#   PAUSA=3                          segundos entre eventos
#   TARIFAS_DEMO=auto                auto = configura tarifas de demo solo si falta INTERURBANO activo o están en 0;
#                                    si = siempre; no = nunca
set -euo pipefail

BASE="${BASE:-http://127.0.0.1:3096/api}"
PAUSA="${PAUSA:-3}"
TARIFAS_DEMO="${TARIFAS_DEMO:-auto}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

REAL=0
if [ -f "$ROOT/backend/.env" ] && grep -qE '^FLOTA_RECIBO_REAL=1' "$ROOT/backend/.env"; then REAL=1; fi

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
api() { curl -sS -X "$1" "$BASE$2" "${AUTH[@]}" -H 'Content-Type: application/json' ${3:+-d "$3"}; }

# ── 1. Póliza activa y sus conductores ───────────────────────────────────────
POL=$(api GET /flota/poliza)
CNPOLIZA=$(echo "$POL" | campo cnpoliza)
TOKEN_PUB=$(echo "$POL" | campo registro.tokenPublico)
ACTIVA=$(echo "$POL" | campo registro.activa)
echo "▶ Póliza activa: $CNPOLIZA  (registrada/activa en Nexus: ${ACTIVA:-no})"
[ "$ACTIVA" = "true" ] || { echo "✖ No hay póliza activa registrada. Cree la flota en la pestaña 'Crear flota' (o active una anterior)."; exit 1; }
[ -n "$TOKEN_PUB" ] && echo "  Vista web: http://192.168.8.120:3096/poliza/$TOKEN_PUB"

# Conductores activos de la póliza: "ccerti|placa|doc|nombre" (los primeros 5).
mapfile -t CONDS < <(api GET "/flota/certificados?cnpoliza=$CNPOLIZA" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const l=JSON.parse(s);for(const c of l.filter(c=>c.activo&&c.placa&&c.conductorDoc).slice(0,5))console.log([c.ccerti,c.placa,c.conductorDoc,c.conductorNombre||""].join("|"))})')
[ "${#CONDS[@]}" -gt 0 ] || { echo "✖ La póliza $CNPOLIZA no tiene conductores activos con placa y cédula."; exit 1; }
echo "  ${#CONDS[@]} conductores:"; for c in "${CONDS[@]}"; do IFS='|' read -r cc pl dc nm <<< "$c"; echo "    cert $cc · $nm · $dc · $pl"; done

# ── 2. Tarifas con INTERURBANO ───────────────────────────────────────────────
TAR=$(api GET /flota/tarifas-distancia)
NECESITA=$(echo "$TAR" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const l=JSON.parse(s);const a=l.filter(t=>t.activa);const inter=a.some(t=>t.clasificacion==="INTERURBANO");const cero=a.some(t=>Number(t.tarifaKm)<=0&&Number(t.minimo)<=0);console.log(!inter||cero?"si":"no")})')
if [ "$TARIFAS_DEMO" = "si" ] || { [ "$TARIFAS_DEMO" = "auto" ] && [ "$NECESITA" = "si" ]; }; then
  echo "▶ Tarifas de demo: Urbano 0–20 km 0,10/km (mín 1) · Extra urbano 20–80 km 0,08/km (mín 3) · Interurbano 80+ km 0,06/km (mín 6) USD"
  api PUT /flota/tarifas-distancia '{"tarifas":[
    {"clasificacion":"URBANO","nombre":"Urbano","kmDesde":0,"kmHasta":20,"tarifaKm":0.10,"minimo":1,"redondeo":"KM_ARRIBA","moneda":"USD","activa":true},
    {"clasificacion":"EXTRA_URBANO","nombre":"Extra urbano","kmDesde":20,"kmHasta":80,"tarifaKm":0.08,"minimo":3,"redondeo":"KM_ARRIBA","moneda":"USD","activa":true},
    {"clasificacion":"INTERURBANO","nombre":"Interurbano","kmDesde":80,"kmHasta":null,"tarifaKm":0.06,"minimo":6,"redondeo":"KM_ARRIBA","moneda":"USD","activa":true}]}' > /dev/null
else
  echo "▶ Tarifas: se usan las configuradas (INTERURBANO activo)."
fi

if [ "$REAL" = 1 ]; then
  echo "⚠ FLOTA_RECIBO_REAL=1: cada pago genera un recibo REAL en Sis2000 (póliza $CNPOLIZA). Ctrl+C en 5 s para cancelar."
  sleep 5
else
  echo "ℹ FLOTA_RECIBO_REAL=0: los recibos quedan en Nexus (RDY-…), sin Sis2000."
fi

# ── 3. Viajes ────────────────────────────────────────────────────────────────
PREF="PRES-$(date +%m%d%H%M%S)"
N=0
# viaje <índice conductor> <km> <clasificacion|""> <pagar si|no>
viaje() {
  local i="$1" km="$2" clas="$3" pagar="$4" cc placa doc nombre id ini fin monto r clasJson=""
  IFS='|' read -r cc placa doc nombre <<< "${CONDS[$(( i % ${#CONDS[@]} ))]}"
  N=$((N + 1)); id="$PREF-$N"
  [ -n "$clas" ] && clasJson=",\"clasificacion\":\"$clas\""
  ini=$(date -u -d "-$((km / 2 + 5)) min" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)
  api POST /flota/viajes/evento "{\"idViaje\":\"$id\",\"tipo\":\"INICIO\",\"pasajeros\":$PAS_DEMO,\"fecha\":\"$ini\",\"placa\":\"$placa\",\"conductorDoc\":\"$doc\",\"conductorNombre\":\"$nombre\",\"kmEstimados\":$km$clasJson}" > /dev/null
  echo "  $id INICIO  cert $cc $nombre  ~$km km  (EN CURSO)"
  sleep "$PAUSA"
  fin=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  r=$(api POST /flota/viajes/evento "{\"idViaje\":\"$id\",\"tipo\":\"FIN\",\"fecha\":\"$fin\",\"km\":$km$clasJson}")
  monto=$(echo "$r" | campo monto)
  echo "  $id FIN     $(echo "$r" | campo clasificacion) $km km → $monto USD (POR COBRAR)"
  [ -n "$monto" ] || { echo "    respuesta: $r"; return; }
  sleep "$PAUSA"
  if [ "$pagar" = si ]; then
    r=$(api POST /flota/viajes/pago "{\"idViaje\":\"$id\",\"monto\":$monto,\"moneda\":\"USD\",\"referencia\":\"PAY-$id\",\"metodo\":\"WALLET\"}")
    echo "  $id PAGO    $monto USD → recibo $(echo "$r" | campo pago.recibo.cnrecibo) ($(echo "$r" | campo pago.recibo.estado)) $(echo "$r" | campo pago.recibo.error)"
    sleep "$PAUSA"
  fi
}

echo "▶ Viajes ($PREF-*). Mire la pestaña Póliza en vivo o el link público."
viaje 0 9   ""            si   # urbano por rango
viaje 1 35  ""            si   # extra urbano por rango
viaje 2 120 INTERURBANO   si   # interurbano explícito
viaje 3 6   URBANO        si   # urbano explícito
viaje 4 45  ""            no   # extra urbano que queda POR COBRAR

echo "▶ Resumen de la póliza en vivo:"
api GET /flota/poliza-en-vivo | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);console.log("  póliza:",o.poliza&&o.poliza.cnpoliza,"· fuente:",o.fuente,"· recibos reales:",o.reciboReal);console.log("  totales:",JSON.stringify(o.totales));for(const c of o.certificados)if(c.recibos.length)console.log(`  cert ${c.ccerti??"—"} ${c.conductorNombre??""}: ${c.totales.viajes} viajes, cobrado ${c.totales.primasCobradas}, por cobrar ${c.totales.primasPendientes}`)})'
echo "▶ Recibos de la póliza (GET /flota/recibos):"
api GET "/flota/recibos?cnpoliza=$CNPOLIZA&limit=10" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);for(const r of o.recibos)console.log(`  ${r.numero} ${r.idExterno} ${r.monto} ${r.moneda} ${r.estado} sync ${r.syncSis2000} ${r.cnreciboSis2000??""}`)})'
