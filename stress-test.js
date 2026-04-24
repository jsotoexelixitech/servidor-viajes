/**
 * stress-test.js — Prueba de estrés del servidor Ridery Backend
 *
 * Prueba los siguientes endpoints SIN tocar la API de La Mundial:
 *   - GET  /api/health
 *   - POST /api/admin/tenants        (crear tenant)
 *   - GET  /api/tenant/me            (info del tenant)
 *   - GET  /api/viaje                (listar viajes)
 *   - POST /api/viaje/iniciar        (inicia viaje → La Mundial falla rápido por circuit breaker, pero el servidor NO cae)
 *   - POST /api/viaje/finalizar      (finaliza viaje)
 *
 * Uso:  node stress-test.js
 */

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const { performance } = require('perf_hooks');

http.globalAgent  = new http.Agent({ keepAlive: true, maxSockets: Infinity, maxFreeSockets: 256 });
https.globalAgent = new https.Agent({ keepAlive: true, maxSockets: Infinity, maxFreeSockets: 256 });

const BASE_URL     = 'http://localhost:3000/api';
const RESULTS_FILE = path.join(__dirname, 'stress-results.json');

const ADMIN_SECRET = '';   // endpoint admin es abierto en desarrollo

const TESTS = [
  // nombre, solicitudes concurrentes, total solicitudes
  { name: 'Calentamiento',     concurrency:   50, total:    500 },
  { name: 'Carga media',       concurrency:  100, total:  2_500 },
  { name: 'Carga alta',        concurrency:  200, total:  5_000 },
  { name: 'Carga muy alta',    concurrency:  300, total:  7_500 },
  { name: 'Carga pico (30k)',  concurrency:  500, total: 14_500 },
  // Total acumulado = 30,000 solicitudes
];

// ── Colores ANSI ──────────────────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  cyan:   '\x1b[36m',
  gray:   '\x1b[90m',
};

function color(c, str) { return `${C[c]}${str}${C.reset}`; }

// ── HTTP Helper ───────────────────────────────────────────────────────────────
function request(method, path, body, headers = {}) {
  return new Promise((resolve) => {
    const start = performance.now();
    const url   = new URL(BASE_URL + path);
    const lib   = url.protocol === 'https:' ? https : http;
    const data  = body ? JSON.stringify(body) : null;

    const opts = {
      hostname: url.hostname,
      port:     url.port || (url.protocol === 'https:' ? 443 : 80),
      path:     url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...headers,
      },
      timeout: 10000,
    };

    const req = lib.request(opts, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        const ms = performance.now() - start;
        let json;
        try { json = JSON.parse(raw); } catch { json = raw; }
        resolve({ ok: res.statusCode < 500, status: res.statusCode, ms, body: json });
      });
    });

    req.on('error',   () => resolve({ ok: false, status: 0,   ms: performance.now() - start, body: null }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 408, ms: 10000, body: null }); });

    if (data) req.write(data);
    req.end();
  });
}

// ── Estadísticas ─────────────────────────────────────────────────────────────
function stats(times) {
  if (!times.length) return { p50: 0, p95: 0, p99: 0, avg: 0, min: 0, max: 0 };
  const sorted = [...times].sort((a, b) => a - b);
  const avg    = times.reduce((s, t) => s + t, 0) / times.length;
  const pct    = (p) => sorted[Math.floor(sorted.length * p / 100)];
  return {
    avg:  +avg.toFixed(1),
    min:  +sorted[0].toFixed(1),
    max:  +sorted[sorted.length - 1].toFixed(1),
    p50:  +pct(50).toFixed(1),
    p95:  +pct(95).toFixed(1),
    p99:  +pct(99).toFixed(1),
  };
}

// ── Ejecutar N requests concurrentes ─────────────────────────────────────────
async function runBatch(requests) {
  return Promise.all(requests.map(fn => fn()));
}

async function runWithConcurrency(fns, concurrency) {
  const results = [];
  let i = 0;
  while (i < fns.length) {
    const batch = fns.slice(i, i + concurrency);
    const res   = await runBatch(batch);
    results.push(...res);
    i += concurrency;
  }
  return results;
}

// ── Mostrar resultados de etapa ───────────────────────────────────────────────
function printStageResult(name, results) {
  const ok     = results.filter(r => r.ok).length;
  const fail   = results.length - ok;
  const rate   = ((ok / results.length) * 100).toFixed(1);
  const times  = results.filter(r => r.ok).map(r => r.ms);
  const s      = stats(times);
  const rps    = times.length > 0 ? (1000 / s.avg * 1).toFixed(0) : 0;

  const statusIcon = parseFloat(rate) >= 99 ? color('green', '✓') :
                     parseFloat(rate) >= 90 ? color('yellow', '⚠') :
                                              color('red', '✗');

  console.log(`\n  ${statusIcon} ${color('bold', name)}`);
  console.log(`     Total: ${results.length.toString().padStart(5)} req  |  OK: ${color('green', ok.toString().padStart(5))}  |  Error: ${fail > 0 ? color('red', fail.toString().padStart(4)) : '   0'}  |  Tasa éxito: ${parseFloat(rate) >= 99 ? color('green', rate + '%') : parseFloat(rate) >= 90 ? color('yellow', rate + '%') : color('red', rate + '%')}`);
  if (times.length > 0) {
    console.log(`     Latencia — avg: ${color('cyan', s.avg + 'ms')}  p50: ${s.p50}ms  p95: ${s.p95 > 500 ? color('yellow', s.p95 + 'ms') : s.p95 + 'ms'}  p99: ${s.p99 > 1000 ? color('red', s.p99 + 'ms') : s.p99 + 'ms'}  max: ${s.max > 2000 ? color('red', s.max + 'ms') : s.max + 'ms'}`);
  }

  return { name, total: results.length, ok, fail, rate: parseFloat(rate), ...s };
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(color('bold', '\n═══════════════════════════════════════════════════════════'));
  console.log(color('bold',   '  RIDERY BACKEND — PRUEBA DE ESTRÉS'));
  console.log(color('bold',   '═══════════════════════════════════════════════════════════'));
  console.log(`  Base URL : ${BASE_URL}`);
  console.log(`  Fecha    : ${new Date().toLocaleString('es-VE')}\n`);

  // ── 1. Verificar que el servidor está vivo ─────────────────────────────────
  process.stdout.write('  Verificando servidor... ');
  const health = await request('GET', '/health');
  if (!health.ok) {
    console.log(color('red', 'SERVIDOR NO DISPONIBLE'));
    console.log(color('red', `  Respuesta: ${JSON.stringify(health.body)}`));
    console.log(color('yellow', '\n  ¿Está corriendo el backend? npm run start:dev'));
    process.exit(1);
  }
  console.log(color('green', `OK (${health.ms.toFixed(0)}ms) — BD: ${health.body?.info?.database?.status ?? '?'} | Circuit La Mundial: ${health.body?.laMundial?.circuitBreaker ?? '?'}`));

  // ── 2. Crear tenant de prueba ──────────────────────────────────────────────
  process.stdout.write('  Creando tenant de prueba... ');
  const tenantResp = await request('POST', '/admin/tenants', {
    nombre:     'Tenant Stress Test',
    email:      'stress@test.ridery',
    webhookUrl: 'https://webhook.site/stress-test-dummy',
  }, { 'x-admin-key': ADMIN_SECRET });

  let apiKey;
  if (tenantResp.ok && tenantResp.body?.apiKey) {
    apiKey = tenantResp.body.apiKey;
    console.log(color('green', `OK — apiKey: ${apiKey.substring(0, 16)}...`));
  } else if (tenantResp.status === 409 || tenantResp.status === 201 || tenantResp.status === 200) {
    // Ya existe, intentar reusar
    apiKey = tenantResp.body?.apiKey;
    if (!apiKey) {
      console.log(color('yellow', 'Ya existía, intentando obtener key...'));
      // Crear con nombre distinto
      const r2 = await request('POST', '/admin/tenants', {
        nombre:     `Stress-${Date.now()}`,
        email:      `stress${Date.now()}@test.ridery`,
        webhookUrl: `https://webhook.site/stress-${Date.now()}`,
      }, { 'x-admin-key': ADMIN_SECRET });
      apiKey = r2.body?.apiKey;
      if (!apiKey) {
        console.log(color('red', 'No se pudo crear tenant. Revisa ADMIN_API_KEY en .env'));
        process.exit(1);
      }
      console.log(color('green', `OK (nuevo) — apiKey: ${apiKey.substring(0, 16)}...`));
    }
  } else {
    console.log(color('red', `FALLÓ (${tenantResp.status}): ${JSON.stringify(tenantResp.body)}`));
    console.log(color('yellow', '  Revisa que ADMIN_API_KEY en .env coincida con la constante ADMIN_SECRET en este script.'));
    process.exit(1);
  }

  const authHeader = { 'x-api-key': apiKey };

  // ── 3. Preparar funciones de request para cada escenario ──────────────────
  const plates = Array.from({ length: 500 }, (_, i) =>
    `ST${String(i).padStart(4, '0')}Z`);

  let plateIdx = 0;
  const getPlate = () => plates[plateIdx++ % plates.length];

  const scenarios = {
    health:     () => request('GET',  '/health'),
    tenantMe:   () => request('GET',  '/tenant/me', null, authHeader),
    listarViajes: () => request('GET', '/viaje?page=1&limit=10', null, authHeader),
    iniciarViaje: () => {
      const placa = `TS${Date.now() % 100000}${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
      return request('POST', '/viaje/iniciar', {
        placa,
        nombre_tomador:      'Conductor Prueba',
        apellido_tomador:    'Test',
        rif_tomador:         '25221952',
        tipo_cedula_tomador: 'V',
        fnac_tomador:        '1990-01-01',
        telefono_tomador:    '+584141234567',
        correo_tomador:      'test@stress.ridery',
        estado_tomador:      1,
        ciudad_tomador:      128,
        direccion_tomador:   'Av Principal 123',
        marca:               '013',
        modelo:              '096',
        version:             '31',
        fano:                2018,
        color:               'Blanco',
        serial_carroceria:   `SC${Date.now()}`,
        ccategoria_uso:      6,
        latInicio:           10.4880,
        lngInicio:           -66.8792,
        latDestino:          10.5010,
        lngDestino:          -66.8800,
      }, authHeader);
    },
  };

  // ── 4. Ejecutar etapas ─────────────────────────────────────────────────────
  const allResults = [];

  for (const stage of TESTS) {
    console.log(color('bold', `\n─── ${stage.name} (concurrencia: ${stage.concurrency}, total: ${stage.total}) ─────`));

    // Distribuir entre los escenarios
    const fns = Array.from({ length: stage.total }, (_, i) => {
      const bucket = i % 4;
      if (bucket === 0) return scenarios.health;
      if (bucket === 1) return scenarios.tenantMe;
      if (bucket === 2) return scenarios.listarViajes;
      return scenarios.iniciarViaje;
    });

    const startTotal = performance.now();
    const results    = await runWithConcurrency(fns, stage.concurrency);
    const elapsed    = ((performance.now() - startTotal) / 1000).toFixed(2);

    const stageResult = printStageResult(stage.name, results);
    const rpsTotal    = (stage.total / parseFloat(elapsed)).toFixed(1);
    console.log(`     Tiempo total: ${elapsed}s  |  Throughput: ${color('cyan', rpsTotal + ' req/s')}`);

    // Breakdown por tipo
    const byType = [
      { label: 'health',     items: results.filter((_, i) => i % 4 === 0) },
      { label: 'tenant/me',  items: results.filter((_, i) => i % 4 === 1) },
      { label: 'listar',     items: results.filter((_, i) => i % 4 === 2) },
      { label: 'iniciar',    items: results.filter((_, i) => i % 4 === 3) },
    ];
    console.log('');
    for (const { label, items } of byType) {
      const ok   = items.filter(r => r.ok).length;
      const rate = ((ok / items.length) * 100).toFixed(0);
      const avg  = items.length ? (items.reduce((s, r) => s + r.ms, 0) / items.length).toFixed(0) : 0;
      const icon = parseInt(rate) >= 99 ? color('green', '✓') :
                   parseInt(rate) >= 80 ? color('yellow', '~') : color('red', '✗');
      console.log(`     ${icon} ${label.padEnd(12)} OK: ${ok}/${items.length}  avg: ${avg}ms`);
    }

    allResults.push({ stage: stage.name, elapsed, rps: rpsTotal, ...stageResult });

    // Pausa entre etapas para que el servidor respire
    if (stage !== TESTS[TESTS.length - 1]) {
      process.stdout.write(color('gray', '  Pausa 2s...'));
      await new Promise(r => setTimeout(r, 2000));
      process.stdout.write('\r              \r');
    }
  }

  // ── 5. Salud final del servidor ────────────────────────────────────────────
  console.log(color('bold', '\n─── Estado final del servidor ─────────────────────────────'));
  const healthFinal = await request('GET', '/health');
  const lm = healthFinal.body?.laMundial;
  console.log(`  Servidor responde : ${healthFinal.ok ? color('green', 'OK') : color('red', 'NO RESPONDE')}`);
  console.log(`  BD                : ${healthFinal.body?.info?.database?.status === 'up' ? color('green', 'up') : color('red', 'down')}`);
  console.log(`  Memoria heap      : ${healthFinal.body?.info?.memory_heap?.status === 'up' ? color('green', 'ok') : color('yellow', 'alta')}`);
  if (lm) {
    const cbColor = lm.circuitBreaker === 'CLOSED' ? 'green' : lm.circuitBreaker === 'HALF_OPEN' ? 'yellow' : 'red';
    console.log(`  Circuit La Mundial: ${color(cbColor, lm.circuitBreaker)} (fallos: ${lm.failures})`);
  }

  // ── 6. Resumen final ───────────────────────────────────────────────────────
  console.log(color('bold', '\n═══════════════════════════════════════════════════════════'));
  console.log(color('bold', '  RESUMEN FINAL'));
  console.log(color('bold', '═══════════════════════════════════════════════════════════'));
  console.log(`  ${'Etapa'.padEnd(22)} ${'Total'.padStart(6)} ${'OK%'.padStart(6)} ${'avg'.padStart(7)} ${'p95'.padStart(7)} ${'p99'.padStart(7)} ${'RPS'.padStart(8)}`);
  console.log(`  ${'-'.repeat(65)}`);
  for (const r of allResults) {
    const rateStr  = r.rate >= 99 ? color('green', r.rate.toFixed(1).padStart(5) + '%') :
                     r.rate >= 90 ? color('yellow', r.rate.toFixed(1).padStart(5) + '%') :
                                    color('red', r.rate.toFixed(1).padStart(5) + '%');
    console.log(`  ${r.stage.padEnd(22)} ${r.total.toString().padStart(6)} ${rateStr} ${(r.avg + 'ms').padStart(7)} ${(r.p95 + 'ms').padStart(7)} ${(r.p99 + 'ms').padStart(7)} ${(r.rps + '/s').padStart(8)}`);
  }

  const totalOk   = allResults.reduce((s, r) => s + r.ok, 0);
  const totalReq  = allResults.reduce((s, r) => s + r.total, 0);
  const totalFail = totalReq - totalOk;
  const globalRate = ((totalOk / totalReq) * 100).toFixed(2);

  console.log(`\n  Total solicitudes : ${totalReq}`);
  console.log(`  Exitosas          : ${color('green', totalOk.toString())}`);
  console.log(`  Fallidas          : ${totalFail > 0 ? color('red', totalFail.toString()) : color('green', '0')}`);
  console.log(`  Tasa global éxito : ${parseFloat(globalRate) >= 99 ? color('green', globalRate + '%') : parseFloat(globalRate) >= 95 ? color('yellow', globalRate + '%') : color('red', globalRate + '%')}`);

  const verdict = parseFloat(globalRate) >= 99 ? color('green', '✓ SERVIDOR ESTABLE') :
                  parseFloat(globalRate) >= 90 ? color('yellow', '⚠ DEGRADACIÓN DETECTADA') :
                                                  color('red', '✗ PROBLEMAS CRÍTICOS');
  console.log(`\n  Veredicto: ${verdict}`);
  console.log(color('bold', '═══════════════════════════════════════════════════════════\n'));

  // ── Guardar JSON para informe acumulado ───────────────────────────────────
  const resultado = {
    id: 2, nombre: 'Carga pura API (30k solicitudes)', fecha: new Date().toISOString(), tipo: 'api-load',
    stages: allResults.map(r => ({
      name: r.name, concurrency: TESTS.find(t => t.name === r.name)?.concurrency ?? 0,
      total: r.total, ok: r.ok, fail: r.fail, rate: r.rate,
      avg: r.avg, p50: r.p50, p95: r.p95, p99: r.p99, rps: parseFloat(r.rps),
    })),
    totales: { solicitudes: totalReq, ok: totalOk, fail: totalFail, rate: parseFloat(globalRate) },
  };
  let hist = [];
  try { hist = JSON.parse(require('fs').readFileSync(RESULTS_FILE, 'utf8')); } catch {}
  hist = hist.filter(r => r.id !== 2);
  hist.push(resultado);
  require('fs').writeFileSync(RESULTS_FILE, JSON.stringify(hist, null, 2));
  console.log(`  Resultados guardados en ${color('cyan', 'stress-results.json')}\n`);
}

main().catch(err => {
  console.error(color('red', '\nError inesperado:'), err.message);
  process.exit(1);
});
