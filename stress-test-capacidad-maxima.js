'use strict';
/**
 * stress-test-capacidad-maxima.js
 *
 * Encuentra el límite real de solicitudes por segundo del servidor.
 * Escala desde 120k/día hasta el punto de quiebre, midiendo:
 *  - Solicitudes por segundo sostenidas
 *  - Latencia P50 / P95 / P99
 *  - Tasa de error real
 *  - Operaciones de BD por segundo
 */

const http  = require('http');
const https = require('https');

http.globalAgent  = new http.Agent({ maxSockets: Infinity, keepAlive: true, keepAliveMsecs: 5000 });
https.globalAgent = new https.Agent({ maxSockets: Infinity, keepAlive: true, keepAliveMsecs: 5000 });

const BASE      = 'http://localhost:3000/api';
const ADMIN_KEY = 'super-secret-admin-key-change-in-production';
const TIMEOUT   = 20_000;

// ── HTTP helper ────────────────────────────────────────────────────────────────
function request(method, url, body, headers = {}) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname, port: u.port || 80, path: u.pathname + u.search,
      method, headers: { 'Content-Type': 'application/json', ...headers },
    };
    const req = http.request(opts, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    req.on('error', () => resolve({ status: 0, body: null }));
    req.setTimeout(TIMEOUT, () => { req.destroy(); resolve({ status: 0, body: null }); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── Percentil ──────────────────────────────────────────────────────────────────
function pct(arr, p) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length * p / 100)] ?? 0;
}

// ── Setup: crear tenant ────────────────────────────────────────────────────────
let API_KEY = null;

async function setup() {
  const r = await request('POST', `${BASE}/admin/tenants`,
    { nombre: `cap-max-${Date.now()}`, webhookUrl: 'https://webhook.site/cap-max' },
    { 'X-Admin-Key': ADMIN_KEY });
  if (r.status !== 201) throw new Error(`Setup failed: ${r.status}`);
  API_KEY = r.body.apiKey;
  console.log(`  Tenant listo: ${r.body.id?.slice(0, 8)}...\n`);
}

// ── Un ciclo completo: iniciar + finalizar ─────────────────────────────────────
async function ciclo(n) {
  const placa  = `CAP${String(n).padStart(6, '0')}`;
  const iKey   = `capmax-${Date.now()}-${n}`;
  const t0     = Date.now();

  const ri = await request('POST', `${BASE}/viaje/iniciar`,
    { placa, fano: 2022, nombre_tomador: 'Test' },
    { 'X-Api-Key': API_KEY, 'X-Idempotency-Key': iKey });

  const tInicio = Date.now() - t0;

  if (ri.status !== 201 || !ri.body?.id) {
    return { ok: false, tInicio, tFin: 0, tTotal: Date.now() - t0 };
  }

  const t1 = Date.now();
  const rf = await request('POST', `${BASE}/viaje/finalizar`,
    { idViaje: ri.body.id },
    { 'X-Api-Key': API_KEY });

  const tFin   = Date.now() - t1;
  const tTotal = Date.now() - t0;

  return { ok: rf.status === 200, tInicio, tFin, tTotal };
}

// ── Ejecutar escenario ─────────────────────────────────────────────────────────
async function escenario(nombre, concurrencia, totalCiclos) {
  console.log(`  ▶ ${nombre} | concurrencia=${concurrencia} ciclos=${totalCiclos.toLocaleString()}`);

  const latInicio = [], latFin = [], latTotal = [];
  let ok = 0, err = 0;
  let idx = 0;
  const t0 = Date.now();

  async function worker() {
    while (true) {
      const n = ++idx;
      if (n > totalCiclos) break;
      const res = await ciclo(n);
      if (res.ok) {
        ok++;
        latInicio.push(res.tInicio);
        latFin.push(res.tFin);
        latTotal.push(res.tTotal);
      } else {
        err++;
      }
    }
  }

  await Promise.all(Array.from({ length: concurrencia }, worker));

  const elapsed = (Date.now() - t0) / 1000;
  const ciclosPorSeg = totalCiclos / elapsed;
  const opsBDPorSeg  = (totalCiclos * 2) / elapsed; // 2 ops BD por ciclo
  const tasaError    = ((err / totalCiclos) * 100).toFixed(2);

  // Proyección diaria
  const ciclosAlDia  = Math.round(ciclosPorSeg * 86400);

  console.log(`     OK: ${ok.toLocaleString()} | Err: ${err} | Error: ${tasaError}%`);
  console.log(`     Ciclos/s: ${ciclosPorSeg.toFixed(1)} | Ops BD/s: ${opsBDPorSeg.toFixed(1)}`);
  console.log(`     Latencia — P50: ${pct(latTotal, 50)}ms | P95: ${pct(latTotal, 95)}ms | P99: ${pct(latTotal, 99)}ms`);
  console.log(`     → Proyección diaria: ${ciclosAlDia.toLocaleString()} viajes/día\n`);

  return {
    nombre, concurrencia, totalCiclos, ok, err, tasaError,
    elapsed: elapsed.toFixed(1), ciclosPorSeg: ciclosPorSeg.toFixed(1),
    opsBDPorSeg: opsBDPorSeg.toFixed(1), ciclosAlDia,
    p50: pct(latTotal, 50), p95: pct(latTotal, 95), p99: pct(latTotal, 99),
  };
}

// ── Main ───────────────────────────────────────────────────────────────────────
(async () => {
  console.log('═'.repeat(65));
  console.log(' PRUEBA DE CAPACIDAD MÁXIMA — ¿Hasta dónde escala el servidor?');
  console.log(`  Hardware: Intel i7-6700 4 núcleos · 8 GB RAM`);
  console.log(`  Servidor: ${BASE}`);
  console.log(`  Fecha:    ${new Date().toLocaleString('es-VE')}`);
  console.log('═'.repeat(65) + '\n');

  console.log('[ Setup ]');
  await setup();

  const resultados = [];

  // Escalar progresivamente: 120k/día → 500k → 1M → 2M → tope
  // Cada escenario mide el ciclo completo (iniciar + finalizar = 2 ops BD)
  const escenarios = [
    // Referencia base (ya probada al 100%)
    { nombre: 'Base (120k/día — referencia)',  concurrencia: 65,  ciclos: 2_000  },
    // 500k/día
    { nombre: '500k/día',                       concurrencia: 150, ciclos: 4_000  },
    // 1 millón/día
    { nombre: '1,000,000/día (1M)',             concurrencia: 250, ciclos: 6_000  },
    // 2 millones/día
    { nombre: '2,000,000/día (2M)',             concurrencia: 400, ciclos: 8_000  },
    // Límite máximo — empujar hasta el tope
    { nombre: 'MÁXIMO — límite del servidor',   concurrencia: 600, ciclos: 8_000  },
  ];

  for (const e of escenarios) {
    const r = await escenario(e.nombre, e.concurrencia, e.ciclos);
    resultados.push(r);
    // Pausa entre etapas para que la BD libere conexiones
    await new Promise(r => setTimeout(r, 2000));
  }

  // ── Resumen final ──────────────────────────────────────────────────────────
  console.log('═'.repeat(65));
  console.log(' RESUMEN — CAPACIDAD MÁXIMA DEL SERVIDOR (I7-6700 · 4 CORES)');
  console.log('═'.repeat(65));
  console.log('');
  console.log('  Escenario                         Ciclos/s  Err%   P95    Diario');
  console.log('  ' + '─'.repeat(63));
  for (const r of resultados) {
    const nombre  = r.nombre.padEnd(36).slice(0, 36);
    const cps     = String(r.ciclosPorSeg).padStart(8);
    const err     = String(r.tasaError + '%').padStart(5);
    const p95     = String(r.p95 + 'ms').padStart(7);
    const diario  = r.ciclosAlDia.toLocaleString().padStart(12);
    const semaforo = parseFloat(r.tasaError) === 0 ? '✓' : parseFloat(r.tasaError) < 1 ? '⚠' : '✗';
    console.log(`  ${semaforo} ${nombre} ${cps}  ${err}  ${p95}  ${diario}`);
  }
  console.log('  ' + '─'.repeat(63));

  const sinError = resultados.filter(r => parseFloat(r.tasaError) === 0);
  const conError = resultados.filter(r => parseFloat(r.tasaError) > 0);

  if (sinError.length > 0) {
    const mejor = sinError[sinError.length - 1];
    console.log(`\n  ✓ Capacidad máxima sin errores: ${mejor.ciclosAlDia.toLocaleString()} viajes/día`);
    console.log(`    (${mejor.ciclosPorSeg} ciclos/s · ${mejor.opsBDPorSeg} ops BD/s · P95=${mejor.p95}ms)`);
  }
  if (conError.length > 0) {
    console.log(`\n  ⚠ Con errores (>0%) a partir de: ${conError[0].ciclosAlDia.toLocaleString()} viajes/día`);
  }

  console.log('\n  Para superar estos límites en producción:');
  console.log('    → MISMO servidor con más RAM/CPU: escala linealmente');
  console.log('    → 2 servidores detrás de Nginx: capacidad ×2');
  console.log('    → Kubernetes/Docker Swarm: escala ilimitada automática');
  console.log('═'.repeat(65));

  // Guardar para el documento
  require('fs').writeFileSync('stress-capacidad-maxima.json',
    JSON.stringify({ fecha: new Date().toISOString(), hardware: 'i7-6700 4c/8GB', resultados }, null, 2));
  console.log('\n  Guardado en: stress-capacidad-maxima.json');
})();
