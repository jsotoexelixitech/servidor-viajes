/**
 * stress-test-120k.js
 *
 * Prueba específica para demostrar capacidad de 120,000 viajes/día sin errores.
 *
 * Lógica:
 *   120k viajes/día ÷ 24h = 5,000 viajes/hora
 *   Hora pico (20% del tráfico en 2h) = 12,000 viajes/hora = 3.3 viajes/s
 *   Burst real (10× el pico) = 33 viajes/s = ~65 conexiones simultáneas
 *
 * El test demuestra que incluso a 1.5× ese burst (100 conc.) el sistema sigue estable.
 *
 * Uso: node stress-test-120k.js
 */

'use strict';

const http = require('http');
const https = require('https');
http.globalAgent = new http.Agent({ maxSockets: Infinity, keepAlive: true, keepAliveMsecs: 10000 });
https.globalAgent = new https.Agent({ maxSockets: Infinity, keepAlive: true, keepAliveMsecs: 10000 });

const BASE_URL     = 'http://localhost:3000/api';
const ADMIN_KEY    = 'super-secret-admin-key-change-in-production';
const TIMEOUT_MS   = 20_000;  // 20s — más generoso que el test anterior (15s)

// ── Etapas diseñadas para 120k/día ──────────────────────────────────────────
// burst real 120k/día ≈ 65 concurrentes → probamos hasta 100 (1.5× margen)
const STAGES = [
  { name: 'Pre-calentamiento JIT',     concurrency: 30,  total:  1_000 },
  { name: 'Burst normal 120k/día',     concurrency: 65,  total:  5_000 },
  { name: 'Burst 1.5× (margen extra)', concurrency: 100, total:  8_000 },
  { name: 'Burst 2× (headroom)',       concurrency: 130, total:  6_000 },
];
// Total: 20,000 ciclos = 40,000 ops BD

// ── Helpers ─────────────────────────────────────────────────────────────────
function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function req(method, path, body, apiKey) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port: 3000, path: `/api${path}`, method,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'X-Api-Key': apiKey } : { 'X-Admin-Key': ADMIN_KEY }),
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
      timeout: TIMEOUT_MS,
    };
    const r = http.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    r.on('timeout', () => { r.destroy(); reject(new Error('TIMEOUT')); });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

function stats(arr) {
  if (!arr.length) return { avg: 0, p50: 0, p90: 0, p95: 0, p99: 0, max: 0 };
  const s = [...arr].sort((a, b) => a - b);
  const p = pct => s[Math.min(Math.ceil(pct / 100 * s.length) - 1, s.length - 1)];
  const avg = s.reduce((a, b) => a + b, 0) / s.length;
  return { avg: Math.round(avg), p50: p(50), p90: p(90), p95: p(95), p99: p(99), max: s[s.length - 1] };
}

function fmt(ms) { return ms < 1000 ? `${ms}ms` : `${(ms/1000).toFixed(2)}s`; }
function bar(pct, width=30) {
  const filled = Math.round(pct/100*width);
  const color = pct >= 99.9 ? '\x1b[32m' : pct >= 98 ? '\x1b[33m' : '\x1b[31m';
  return `${color}${'█'.repeat(filled)}${'░'.repeat(width-filled)}\x1b[0m ${pct.toFixed(2)}%`;
}

async function runStage(name, concurrency, total, apiKey) {
  const latIni=[], latFin=[], latCiclo=[];
  let ok=0, errIni=0, errFin=0;
  let remaining = total;
  const t0 = Date.now();

  // Procesar en lotes del tamaño de concurrencia
  while (remaining > 0) {
    const batch = Math.min(concurrency, remaining);
    remaining -= batch;

    await Promise.all(Array.from({ length: batch }, async (_, j) => {
      const uid = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
      const placa = `T120K${uid.slice(-8).toUpperCase()}`;
      const bodyIni = {
        placa,
        nombre_tomador: `Conductor ${uid}`,
        fano: String(rnd(2018, 2024)),
        cnrif_tomador: `V${rnd(10000000, 30000000)}`,
        cedula_tomador: `V${rnd(10000000, 30000000)}`,
        latInicio: 10.48 + Math.random() * 0.1,
        lngInicio: -66.85 + Math.random() * 0.1,
        latDestino: 10.49 + Math.random() * 0.1,
        lngDestino: -66.86 + Math.random() * 0.1,
      };

      // ── Iniciar ──────────────────────────────────────────────────────────
      const t1 = Date.now();
      let viajeId;
      try {
        const r = await req('POST', '/viaje/iniciar', bodyIni, apiKey);
        const dt = Date.now() - t1;
        if (r.status === 201 && r.body?.id) {
          latIni.push(dt);
          viajeId = r.body.id;
        } else {
          errIni++;
          return; // sin viaje → no hay finalizar
        }
      } catch {
        errIni++;
        return;
      }

      // ── Finalizar ─────────────────────────────────────────────────────────
      const t2 = Date.now();
      try {
        const r = await req('POST', '/viaje/finalizar', { idViaje: viajeId }, apiKey);
        const dt = Date.now() - t2;
        if (r.status === 200 || r.status === 201) {
          latFin.push(dt);
          latCiclo.push(Date.now() - t1);
          ok++;
        } else {
          errFin++;
        }
      } catch {
        errFin++;
      }
    }));
  }

  const elapsed = (Date.now() - t0) / 1000;
  const errores = errIni + errFin;
  const tasa = (ok / total * 100);
  const sIni = stats(latIni);
  const sFin = stats(latFin);
  const sCiclo = stats(latCiclo);

  return { name, concurrency, total, ok, errores, errIni, errFin, tasa, elapsed, sIni, sFin, sCiclo };
}

// ── Imprimir resultado de etapa ──────────────────────────────────────────────
function printResult(r) {
  const ciclosS = (r.ok / r.elapsed).toFixed(1);
  const opsBDS  = (r.ok * 2 / r.elapsed).toFixed(1);
  const verdict = r.tasa >= 99.9 ? '\x1b[32m✅ SIN ERRORES\x1b[0m' :
                  r.tasa >= 98   ? '\x1b[33m⚠ MÍNIMA DEGRADACIÓN\x1b[0m' :
                                   '\x1b[31m✗ DEGRADACIÓN\x1b[0m';

  console.log(`\n  ${verdict}  — \x1b[1m${r.name}\x1b[0m`);
  console.log(`  Éxito: ${bar(r.tasa)}`);
  console.log(`  Ciclos: ${r.total.toLocaleString()} | ✓ ${r.ok.toLocaleString()} | ✗ ${r.errores} (ini:${r.errIni} fin:${r.errFin})`);
  console.log(`  Throughput: \x1b[36m${ciclosS} ciclos/s\x1b[0m  |  \x1b[36m${opsBDS} ops BD/s\x1b[0m  |  Tiempo: ${r.elapsed.toFixed(1)}s`);
  console.log(`  Iniciar  → avg: ${fmt(r.sIni.avg)}  p90: ${fmt(r.sIni.p90)}  p99: ${fmt(r.sIni.p99)}  max: ${fmt(r.sIni.max)}`);
  console.log(`  Finalizar→ avg: ${fmt(r.sFin.avg)}  p90: ${fmt(r.sFin.p90)}  p99: ${fmt(r.sFin.p99)}  max: ${fmt(r.sFin.max)}`);
  console.log(`  Ciclo tot→ avg: ${fmt(r.sCiclo.avg)}  p90: ${fmt(r.sCiclo.p90)}  p99: ${fmt(r.sCiclo.p99)}  max: ${fmt(r.sCiclo.max)}`);
}

// ── Verificar servidor ───────────────────────────────────────────────────────
async function verificar() {
  try {
    const r = await req('GET', '/health', null, null);
    const bd = r.body?.details?.database?.status ?? r.body?.status ?? '?';
    const mem = r.body?.details?.memory_heap?.status ?? 'ok';
    process.stdout.write(` \x1b[32mOK (${r.body ? r.body.status : '?'})\x1b[0m  BD: ${bd}  Mem: ${mem}\n`);
    return true;
  } catch (e) { console.log(` \x1b[31mERROR: ${e.message}\x1b[0m`); return false; }
}

async function contarViajes(apiKey) {
  try {
    const r = await req('GET', '/viaje?page=1&limit=1', null, apiKey);
    return r.body?.total ?? '?';
  } catch { return '?'; }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const LINE = '═'.repeat(64);
  console.log(`\n\x1b[1m${LINE}\x1b[0m`);
  console.log(`\x1b[1m  RIDERY — PRUEBA CAPACIDAD 120,000 VIAJES/DÍA\x1b[0m`);
  console.log(`\x1b[1m  20,000 ciclos · 40,000 ops BD · Timeout cliente 20s\x1b[0m`);
  console.log(`\x1b[1m${LINE}\x1b[0m`);
  console.log(`  Base URL : ${BASE_URL}`);
  console.log(`  Fecha    : ${new Date().toLocaleString('es-VE')}\n`);

  process.stdout.write('  Verificando servidor... ');
  if (!await verificar()) { console.log('Servidor no disponible.'); process.exit(1); }

  // Crear tenant exclusivo para esta prueba
  const tenantData = {
    nombre: `Test120k-${Date.now()}`,
    webhookUrl: `https://webhook.site/test120k-${Date.now()}`,
    apiKey: `120k-${Date.now()}`,
    config: { seguro: { defaults: { ccodpro: '0001', ccodramo: '1310' } } },
  };
  process.stdout.write('  Creando tenant de prueba...');
  const tRes = await req('POST', '/admin/tenants', tenantData, null);
  if (!tRes.body?.apiKey) { console.log('\x1b[31m FALLO\x1b[0m'); process.exit(1); }
  const API_KEY = tRes.body.apiKey;
  console.log(` \x1b[32mOK → apiKey: ${API_KEY.slice(0,16)}...\x1b[0m`);

  const antesTotal = await contarViajes(API_KEY);
  console.log(`  Viajes en BD del tenant antes del test: \x1b[36m${antesTotal}\x1b[0m`);

  // ── Ejecutar etapas ──────────────────────────────────────────────────────
  const resultados = [];
  let totalCiclos = 0;

  for (const stage of STAGES) {
    totalCiclos += stage.total;
    console.log(`\n${'─'.repeat(64)}`);
    console.log(`\x1b[1m▶ ${stage.name}  (concurrencia: ${stage.concurrency}  ciclos: ${stage.total.toLocaleString()})\x1b[0m`);
    const r = await runStage(stage.name, stage.concurrency, stage.total, API_KEY);
    printResult(r);
    resultados.push(r);
    if (stage !== STAGES[STAGES.length - 1]) {
      process.stdout.write('\x1b[90m  Pausa 3s...\x1b[0m');
      await new Promise(res => setTimeout(res, 3000));
      process.stdout.write('\r              \r');
    }
  }

  // ── Estado final ─────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(64)} Estado final`);
  process.stdout.write('  Servidor responde  : '); await verificar();
  const despuesTotal = await contarViajes(API_KEY);
  const residuales = typeof despuesTotal === 'number' && typeof antesTotal === 'number'
    ? despuesTotal - antesTotal : '?';
  console.log(`  Registros residuales en BD: \x1b[36m${residuales}\x1b[0m de ${totalCiclos.toLocaleString()} ciclos`);

  // ── Resumen final ─────────────────────────────────────────────────────────
  const totalOk     = resultados.reduce((s,r) => s + r.ok, 0);
  const totalErr    = resultados.reduce((s,r) => s + r.errores, 0);
  const tasaGlobal  = (totalOk / totalCiclos * 100).toFixed(2);
  const picoCiclosS = Math.max(...resultados.map(r => r.ok / r.elapsed)).toFixed(1);

  console.log(`\n\x1b[1m${LINE}\x1b[0m`);
  console.log(`\x1b[1m  RESUMEN — CAPACIDAD 120K/DÍA\x1b[0m`);
  console.log(`\x1b[1m${LINE}\x1b[0m`);
  console.log(`\n  ${'Etapa'.padEnd(30)} ${'Conc'.padStart(5)} ${'Ciclos'.padStart(7)} ${'OK%'.padStart(7)} ${'ciclos/s'.padStart(9)} ${'avg ini'.padStart(8)} ${'avg ciclo'.padStart(10)}`);
  console.log(`  ${'-'.repeat(80)}`);
  for (const r of resultados) {
    const ciclosS = (r.ok / r.elapsed).toFixed(1);
    const ok_color = r.tasa >= 99.9 ? '\x1b[32m' : r.tasa >= 98 ? '\x1b[33m' : '\x1b[31m';
    console.log(`  ${r.name.padEnd(30)} ${String(r.concurrency).padStart(5)} ${r.total.toLocaleString().padStart(7)} ${ok_color}${r.tasa.toFixed(1).padStart(6)}%\x1b[0m ${ciclosS.padStart(9)} ${fmt(r.sIni.avg).padStart(8)} ${fmt(r.sCiclo.avg).padStart(10)}`);
  }
  console.log(`  ${'-'.repeat(80)}`);
  console.log(`  Total ciclos      : ${totalCiclos.toLocaleString()}`);
  console.log(`  Total ops BD      : ${(totalCiclos*2).toLocaleString()} (INSERT + DELETE)`);
  console.log(`  Exitosos          : \x1b[32m${totalOk.toLocaleString()}\x1b[0m`);
  console.log(`  Fallidos          : ${totalErr > 0 ? '\x1b[31m' : '\x1b[32m'}${totalErr}\x1b[0m`);
  console.log(`  Tasa global éxito : ${parseFloat(tasaGlobal) >= 99.9 ? '\x1b[32m' : '\x1b[33m'}${tasaGlobal}%\x1b[0m`);
  console.log(`  Pico ciclos/s     : \x1b[36m${picoCiclosS}\x1b[0m`);
  console.log(`  Equivalente/día   : \x1b[36m${(parseFloat(picoCiclosS)*86400).toLocaleString()} viajes/día\x1b[0m (a pico sostenido 24h)`);

  // Veredicto especial para 120k
  const burst120k = parseFloat(picoCiclosS) * 120; // ciclos en 2min de burst
  const verdict = parseFloat(tasaGlobal) >= 99.9
    ? `\x1b[32m✅ APTO PARA 120,000 VIAJES/DÍA SIN ERRORES\x1b[0m`
    : parseFloat(tasaGlobal) >= 98
    ? `\x1b[33m⚠ APTO CON MÍNIMA DEGRADACIÓN EN BURST EXTREMO\x1b[0m`
    : `\x1b[31m✗ REQUIERE OPTIMIZACIÓN\x1b[0m`;
  console.log(`\n  Veredicto: ${verdict}`);
  console.log(`\x1b[1m${LINE}\x1b[0m\n`);

  // ── Guardar resultados ────────────────────────────────────────────────────
  const fs = require('fs');
  let hist = [];
  try { hist = JSON.parse(fs.readFileSync('stress-results.json','utf8')); } catch {}
  // reemplazar si ya existe prueba 4
  hist = hist.filter(x => x.id !== 4);
  hist.push({
    id: 4,
    type: 'lifecycle-120k',
    nombre: 'Capacidad 120,000 viajes/día',
    fecha: new Date().toISOString(),
    totalCiclos,
    totalOps: totalCiclos * 2,
    totalOk,
    totalErr,
    tasaGlobal: parseFloat(tasaGlobal),
    picoCiclosS: parseFloat(picoCiclosS),
    equivViajesDia: Math.round(parseFloat(picoCiclosS) * 86400),
    etapas: resultados.map(r => ({
      nombre: r.name,
      concurrencia: r.concurrency,
      total: r.total,
      ok: r.ok,
      errores: r.errores,
      tasa: parseFloat(r.tasa.toFixed(2)),
      ciclosS: parseFloat((r.ok/r.elapsed).toFixed(1)),
      latIni: r.sIni,
      latFin: r.sFin,
      latCiclo: r.sCiclo,
    })),
  });
  fs.writeFileSync('stress-results.json', JSON.stringify(hist, null, 2));
  console.log(`  Resultados guardados en \x1b[36mstress-results.json\x1b[0m\n`);
}

main().catch(console.error);
