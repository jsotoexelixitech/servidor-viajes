/**
 * stress-test-lifecycle.js — Prueba de ciclo completo de vida de viaje
 *
 * Simula el flujo real de producción para cada solicitud:
 *   1. POST /viaje/iniciar  → guarda en BD, intenta emitir póliza
 *   2. POST /viaje/finalizar → elimina el registro de BD
 *
 * Cada ciclo = 1 viaje completo = 2 operaciones de BD (INSERT + DELETE)
 * 30,000 ciclos = 60,000 operaciones de BD
 *
 * Resultados guardados en: stress-results.json (para el informe acumulado)
 *
 * Uso: node stress-test-lifecycle.js
 */

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const { performance } = require('perf_hooks');

http.globalAgent  = new http.Agent({ keepAlive: true, maxSockets: Infinity, maxFreeSockets: 512 });
https.globalAgent = new https.Agent({ keepAlive: true, maxSockets: Infinity, maxFreeSockets: 512 });

const BASE_URL = 'http://localhost:3000/api';
const RESULTS_FILE = path.join(__dirname, 'stress-results.json');

const STAGES = [
  { name: 'Calentamiento',   concurrency:  50, total:    500 },
  { name: 'Carga media',     concurrency: 100, total:  2_500 },
  { name: 'Carga alta',      concurrency: 200, total:  5_000 },
  { name: 'Carga muy alta',  concurrency: 300, total: 12_000 },
  { name: 'Carga pico 60k',  concurrency: 500, total: 40_000 },
];
// Total: 60,000 ciclos = 120,000 operaciones de BD

// ── Colores ───────────────────────────────────────────────────────────────────
const C = { reset:'\x1b[0m', bold:'\x1b[1m', green:'\x1b[32m', yellow:'\x1b[33m',
            red:'\x1b[31m', cyan:'\x1b[36m', gray:'\x1b[90m', blue:'\x1b[34m' };
const col = (c, s) => `${C[c]}${s}${C.reset}`;

// ── HTTP helper ───────────────────────────────────────────────────────────────
function request(method, path, body, headers = {}) {
  return new Promise((resolve) => {
    const t0   = performance.now();
    const url  = new URL(BASE_URL + path);
    const lib  = url.protocol === 'https:' ? https : http;
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: url.hostname, port: url.port || 80,
      path: url.pathname + url.search, method,
      headers: { 'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}), ...headers },
      timeout: 15000,
    };
    const req = lib.request(opts, (res) => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        const ms = performance.now() - t0;
        let json; try { json = JSON.parse(raw); } catch { json = raw; }
        resolve({ ok: res.statusCode < 500, status: res.statusCode, ms, body: json });
      });
    });
    req.on('error',   () => resolve({ ok: false, status: 0,   ms: performance.now() - t0, body: null }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 408, ms: 15000, body: null }); });
    if (data) req.write(data);
    req.end();
  });
}

// ── Un ciclo completo: iniciar → finalizar ────────────────────────────────────
async function runCycle(apiKey, cycleId) {
  const plate = `LC${String(cycleId % 99999).padStart(5,'0')}${Math.random().toString(36).slice(2,5).toUpperCase()}`;
  const iKey  = `lc-${Date.now()}-${cycleId}-${Math.random().toString(36).slice(2,10)}`;
  const auth  = { 'x-api-key': apiKey, 'x-idempotency-key': iKey };

  // ── INICIAR ────────────────────────────────────────────────────────────────
  const t0 = performance.now();
  const ini = await request('POST', '/viaje/iniciar', {
    placa:               plate,
    nombre_tomador:      'Conductor Prueba LC',
    apellido_tomador:    'Test',
    rif_tomador:         '25221952',
    tipo_cedula_tomador: 'V',
    fnac_tomador:        '1990-06-15',
    telefono_tomador:    '+584141234567',
    correo_tomador:      'lifecycle@stress.ridery',
    estado_tomador:      1,
    ciudad_tomador:      128,
    direccion_tomador:   'Av Libertador, Torre Central',
    marca:               '013',
    modelo:              '096',
    version:             '31',
    fano:                2020,
    color:               'Blanco',
    serial_carroceria:   `SC${Date.now()}${cycleId}`,
    ccategoria_uso:      6,
    latInicio:           10.4880,
    lngInicio:           -66.8792,
    latDestino:          10.5100,
    lngDestino:          -66.8900,
  }, auth);
  const msIniciar = performance.now() - t0;

  if (!ini.ok || !ini.body?.id) {
    return { ok: false, msIniciar, msFinalizar: 0, msTotal: msIniciar,
             failStep: 'iniciar', status: ini.status };
  }

  // ── FINALIZAR ─────────────────────────────────────────────────────────────
  const t1 = performance.now();
  const fin = await request('POST', '/viaje/finalizar',
    { idViaje: ini.body.id },
    { 'x-api-key': apiKey },
  );
  const msFinalizar = performance.now() - t1;
  const msTotal     = performance.now() - t0;

  return {
    ok:          fin.ok,
    msIniciar,
    msFinalizar,
    msTotal,
    failStep:    fin.ok ? null : 'finalizar',
    status:      fin.status,
    viajeId:     ini.body.id,
  };
}

// ── Estadísticas ──────────────────────────────────────────────────────────────
function stats(arr) {
  if (!arr.length) return { avg: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0 };
  const s = [...arr].sort((a, b) => a - b);
  const avg = arr.reduce((acc, v) => acc + v, 0) / arr.length;
  return {
    avg: +avg.toFixed(1),
    min: +s[0].toFixed(1),
    max: +s[s.length - 1].toFixed(1),
    p50: +s[Math.floor(s.length * 0.50)].toFixed(1),
    p95: +s[Math.floor(s.length * 0.95)].toFixed(1),
    p99: +s[Math.floor(s.length * 0.99)].toFixed(1),
  };
}

// ── Ejecutar lote con concurrencia controlada ─────────────────────────────────
async function runPool(tasks, concurrency) {
  const results = [];
  let i = 0;
  while (i < tasks.length) {
    const batch = tasks.slice(i, i + concurrency);
    results.push(...await Promise.all(batch.map(fn => fn())));
    i += concurrency;
    if (i % 2000 === 0) process.stdout.write(col('gray', `.`));
  }
  return results;
}

// ── Barra de progreso ─────────────────────────────────────────────────────────
function bar(pct) {
  const filled = Math.round(pct / 5);
  return '[' + '█'.repeat(filled) + '░'.repeat(20 - filled) + '] ' + pct.toFixed(0) + '%';
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(col('bold', '\n═══════════════════════════════════════════════════════════════'));
  console.log(col('bold',   '  RIDERY — PRUEBA CICLO COMPLETO: GUARDAR + ELIMINAR'));
  console.log(col('bold',   '  30,000 ciclos · 60,000 operaciones de BD'));
  console.log(col('bold',   '═══════════════════════════════════════════════════════════════'));
  console.log(`  Base URL : ${BASE_URL}`);
  console.log(`  Fecha    : ${new Date().toLocaleString('es-VE')}\n`);

  // ── Verificar servidor ────────────────────────────────────────────────────
  process.stdout.write('  Verificando servidor... ');
  const health = await request('GET', '/health');
  if (!health.ok) { console.log(col('red', 'SERVIDOR NO DISPONIBLE')); process.exit(1); }
  console.log(col('green', `OK (${health.ms.toFixed(0)}ms) | BD: ${health.body?.info?.database?.status}`));

  // Contar registros existentes en BD antes del test
  process.stdout.write('  Registros en BD antes del test... ');
  const listaAntes = await request('GET', '/viaje?page=1&limit=1', null, {});
  // No podemos saber el total sin auth, registramos lo que podemos
  console.log(col('gray', 'verificado'));

  // ── Crear tenant ──────────────────────────────────────────────────────────
  process.stdout.write('  Creando tenant de prueba... ');
  const tr = await request('POST', '/admin/tenants', {
    nombre:     `LC-Stress-${Date.now()}`,
    email:      `lc${Date.now()}@stress.ridery`,
    webhookUrl: 'https://webhook.site/lifecycle-test',
  });
  const apiKey = tr.body?.apiKey;
  if (!apiKey) { console.log(col('red', 'Sin API key. Abortando.')); process.exit(1); }
  console.log(col('green', `OK — apiKey: ${apiKey.substring(0, 16)}...`));

  // ── Verificar BD antes ────────────────────────────────────────────────────
  const bdAntes = await request('GET', '/viaje?page=1&limit=1', null, { 'x-api-key': apiKey });
  const totalAntes = bdAntes.body?.total ?? '?';
  console.log(`  Viajes en BD del tenant antes del test: ${col('cyan', String(totalAntes))}\n`);

  const allStageResults = [];
  let cycleCount = 0;

  // ── Etapas ─────────────────────────────────────────────────────────────────
  for (const stage of STAGES) {
    console.log(col('bold', `\n─── ${stage.name}  (concurrencia: ${stage.concurrency}  ciclos: ${stage.total.toLocaleString()}) ────`));
    process.stdout.write('  ');

    const tasks = Array.from({ length: stage.total }, (_, i) => {
      const id = cycleCount + i;
      return () => runCycle(apiKey, id);
    });

    const t0      = performance.now();
    const results = await runPool(tasks, stage.concurrency);
    const elapsed = (performance.now() - t0) / 1000;
    cycleCount   += stage.total;
    console.log(); // nueva línea tras los puntos

    const ok       = results.filter(r => r.ok);
    const fail     = results.filter(r => !r.ok);
    const rate     = (ok.length / results.length * 100);
    const cyclesPs = (results.length / elapsed).toFixed(1);
    const dbOpsPs  = (results.length * 2 / elapsed).toFixed(1);  // 2 ops por ciclo

    const sIniciar    = stats(ok.map(r => r.msIniciar));
    const sFinalizar  = stats(ok.map(r => r.msFinalizar));
    const sTotal      = stats(ok.map(r => r.msTotal));

    const rateIcon = rate >= 99 ? col('green', '✓') : rate >= 90 ? col('yellow', '⚠') : col('red', '✗');
    console.log(`  ${rateIcon} ${col('bold', stage.name)}`);
    console.log(`     Ciclos: ${results.length.toLocaleString().padStart(6)}  |  Completos: ${col('green', ok.length.toLocaleString().padStart(6))}  |  Fallidos: ${fail.length > 0 ? col('red', fail.length.toString()) : '0'}  |  Tasa: ${rate >= 99 ? col('green', rate.toFixed(1) + '%') : col('yellow', rate.toFixed(1) + '%')}`);
    console.log(`     Throughput ciclos: ${col('cyan', cyclesPs + '/s')}  |  Ops BD: ${col('cyan', dbOpsPs + ' ops/s')}  |  Tiempo: ${elapsed.toFixed(2)}s`);
    console.log(`     Iniciar  → avg: ${col('cyan', sIniciar.avg  + 'ms')}  p95: ${sIniciar.p95}ms   p99: ${sIniciar.p99}ms`);
    console.log(`     Finalizar→ avg: ${col('cyan', sFinalizar.avg + 'ms')}  p95: ${sFinalizar.p95}ms   p99: ${sFinalizar.p99}ms`);
    console.log(`     Ciclo total→ avg: ${col('cyan', sTotal.avg + 'ms')}  p95: ${sTotal.p95}ms   p99: ${sTotal.p99}ms   max: ${sTotal.max}ms`);

    if (fail.length > 0) {
      const byStep = fail.reduce((acc, r) => { acc[r.failStep] = (acc[r.failStep] || 0) + 1; return acc; }, {});
      console.log(`     ${col('yellow', 'Fallos por paso:')} ${JSON.stringify(byStep)}`);
    }

    allStageResults.push({
      name: stage.name, concurrency: stage.concurrency, ciclos: stage.total,
      ok: ok.length, fail: fail.length, rate: +rate.toFixed(2),
      elapsed: +elapsed.toFixed(2), cyclesPs: +cyclesPs, dbOpsPs: +dbOpsPs,
      statIniciar:   sIniciar,
      statFinalizar: sFinalizar,
      statCiclo:     sTotal,
    });

    if (stage !== STAGES[STAGES.length - 1]) {
      process.stdout.write(col('gray', '  Pausa 2s...'));
      await new Promise(r => setTimeout(r, 2000));
      process.stdout.write('\r              \r');
    }
  }

  // ── Verificar BD después ──────────────────────────────────────────────────
  console.log(col('bold', '\n─── Estado final del servidor y BD ─────────────────────────────────'));
  const healthFinal = await request('GET', '/health');
  const bdDespues   = await request('GET', '/viaje?page=1&limit=1', null, { 'x-api-key': apiKey });
  const totalDespues = bdDespues.body?.total ?? '?';
  const lm = healthFinal.body?.laMundial;

  console.log(`  Servidor responde  : ${healthFinal.ok ? col('green', 'OK') : col('red', 'NO')}`);
  console.log(`  BD                 : ${healthFinal.body?.info?.database?.status === 'up' ? col('green', 'up') : col('yellow', 'revisar')}`);
  console.log(`  Memoria heap       : ${healthFinal.body?.info?.memory_heap?.status === 'up' ? col('green', 'ok') : col('yellow', 'alta')}`);
  if (lm) console.log(`  Circuit La Mundial : ${col(lm.circuitBreaker === 'CLOSED' ? 'green' : 'yellow', lm.circuitBreaker)} (fallos: ${lm.failures})`);
  console.log(`  Viajes del tenant en BD después: ${col('cyan', String(totalDespues))}`);
  console.log(`  ${col('bold', 'Variación registros:')} antes=${totalAntes} → después=${totalDespues} (diferencia: ${typeof totalDespues === 'number' && typeof totalAntes === 'number' ? totalDespues - totalAntes : '?'})`);

  // ── Resumen ────────────────────────────────────────────────────────────────
  console.log(col('bold', '\n═══════════════════════════════════════════════════════════════'));
  console.log(col('bold', '  RESUMEN FINAL'));
  console.log(col('bold', '═══════════════════════════════════════════════════════════════'));
  console.log(`  ${'Etapa'.padEnd(18)} ${'Ciclos'.padStart(7)} ${'OK%'.padStart(7)} ${'cyc/s'.padStart(7)} ${'ops BD/s'.padStart(9)} ${'avg ini'.padStart(8)} ${'avg fin'.padStart(8)} ${'avg tot'.padStart(8)}`);
  console.log(`  ${'-'.repeat(75)}`);

  for (const r of allStageResults) {
    const rateStr = r.rate >= 99 ? col('green', r.rate.toFixed(1).padStart(6) + '%') : col('yellow', r.rate.toFixed(1).padStart(6) + '%');
    console.log(`  ${r.name.padEnd(18)} ${r.ciclos.toLocaleString().padStart(7)} ${rateStr} ${r.cyclesPs.toString().padStart(7)} ${r.dbOpsPs.toString().padStart(9)} ${(r.statIniciar.avg + 'ms').padStart(8)} ${(r.statFinalizar.avg + 'ms').padStart(8)} ${(r.statCiclo.avg + 'ms').padStart(8)}`);
  }

  const totCycles = allStageResults.reduce((s, r) => s + r.ciclos, 0);
  const totOk     = allStageResults.reduce((s, r) => s + r.ok, 0);
  const totFail   = totCycles - totOk;
  const globRate  = (totOk / totCycles * 100).toFixed(2);
  const maxOps    = Math.max(...allStageResults.map(r => r.dbOpsPs));

  console.log(`\n  Total ciclos      : ${totCycles.toLocaleString()}`);
  console.log(`  Total ops BD      : ${(totCycles * 2).toLocaleString()} (INSERT + DELETE)`);
  console.log(`  Exitosos          : ${col('green', totOk.toLocaleString())}`);
  console.log(`  Fallidos          : ${totFail > 0 ? col('red', totFail.toString()) : col('green', '0')}`);
  console.log(`  Tasa global éxito : ${parseFloat(globRate) >= 99 ? col('green', globRate + '%') : col('yellow', globRate + '%')}`);
  console.log(`  Pico ops BD/s     : ${col('cyan', maxOps.toLocaleString())}`);

  const verdict = parseFloat(globRate) >= 99 ? col('green', '✓ BD ESTABLE — GUARDAR Y ELIMINAR FUNCIONAN') :
                  parseFloat(globRate) >= 90 ? col('yellow', '⚠ DEGRADACIÓN DETECTADA') :
                                               col('red', '✗ PROBLEMAS CRÍTICOS');
  console.log(`\n  Veredicto: ${verdict}`);
  console.log(col('bold', '═══════════════════════════════════════════════════════════════\n'));

  // ── Guardar JSON para el informe acumulado ────────────────────────────────
  const resultado = {
    id:      3,
    nombre:  'Ciclo Completo: Guardar + Eliminar (60k ciclos)',
    fecha:   new Date().toISOString(),
    tipo:    'lifecycle',
    stages:  allStageResults.map(r => ({
      name: r.name, concurrency: r.concurrency, ciclos: r.ciclos,
      ok: r.ok, fail: r.fail, rate: r.rate,
      elapsed: r.elapsed, cyclesPs: r.cyclesPs, dbOpsPs: r.dbOpsPs,
      iniciar:   r.statIniciar,
      finalizar: r.statFinalizar,
      cicloTotal: r.statCiclo,
    })),
    totales: {
      ciclos: totCycles,
      opsDB:  totCycles * 2,
      ok:     totOk,
      fail:   totFail,
      rate:   parseFloat(globRate),
      maxOpsPS: maxOps,
    },
    servidorFinal: {
      responde:       healthFinal.ok,
      bd:             healthFinal.body?.info?.database?.status,
      memoriaHeap:    healthFinal.body?.info?.memory_heap?.status,
      circuitMundial: lm?.circuitBreaker,
      fallosMundial:  lm?.failures,
      registrosBDAntes:   totalAntes,
      registrosBDDespues: totalDespues,
    },
  };

  // Cargar resultados previos y agregar éste
  let historial = [];
  try { historial = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8')); } catch {}
  // Reemplazar si ya existe el id 3
  historial = historial.filter(r => r.id !== 3);
  historial.push(resultado);
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(historial, null, 2));
  console.log(`  Resultados guardados en ${col('cyan', 'stress-results.json')}\n`);
}

main().catch(err => { console.error('\nError:', err.message); process.exit(1); });
