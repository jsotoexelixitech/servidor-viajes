'use strict';
/**
 * test-emision-real.js
 * 
 * Prueba REAL de emisión de póliza RCV con La Mundial de Seguros.
 * Ejecutar SOLO cuando tengas el token de autenticación.
 * 
 * Uso:
 *   LAMUNDIAL_TOKEN=tu_token_aqui node test-emision-real.js
 *   
 * O configura primero el tenant desde el frontend y luego ejecuta:
 *   node test-emision-real.js
 */

const http  = require('http');
const https = require('https');

const BASE_API    = 'http://localhost:3000/api';
const ADMIN_KEY   = 'super-secret-admin-key-change-in-production';
const LAMUNDIAL_URL = 'https://qaapisys2000.lamundialdeseguros.com'; // QA
// const LAMUNDIAL_URL = 'https://apisys2000.lamundialdeseguros.com'; // PROD (cuando esté disponible)

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️  REEMPLAZA ESTOS VALORES CUANDO TENGAS LAS CREDENCIALES DE LA MUNDIAL
// ─────────────────────────────────────────────────────────────────────────────
const LAMUNDIAL_TOKEN    = process.env.LAMUNDIAL_TOKEN    || 'PENDIENTE_TOKEN_QA';
const CODIGO_PRODUCTOR   = parseInt(process.env.LAMUNDIAL_PRODUCTOR || '0', 10);
// ─────────────────────────────────────────────────────────────────────────────

// Datos de prueba — vehículo de ejemplo para QA
const VIAJE_PRUEBA = {
  // Datos del vehículo
  placa:             'TEST0001',
  fano:              2023,
  cmarca:            '013',          // CHEVROLET (código La Mundial)
  cmodelo:           '096',          // AVEO
  cversion:          '10',           // A/A - Automatico
  color:             'NEGRO',
  serial_carroceria: 'SC1SC5JC5KH001',
  serial_motor:      'TEST001',
  ccategoria_uso:    1,

  // Tomador (persona que contrata el seguro)
  nombre_tomador:    'JUAN CARLOS',
  apellido_tomador:  'PEREZ GARCIA',
  rif_tomador:       'V25221952',
  tipo_cedula_tomador: 'V',
  fnac_tomador:      '1990-10-13',
  telefono_tomador:  '04241829583',
  correo_tomador:    'juan.perez@ridery-test.com',
  estado_tomador:    1,              // Distrito Capital
  ciudad_tomador:    1,
  direccion_tomador: 'AV LIBERTADOR, CARACAS',

  // Coordenadas del viaje
  latInicio:   10.48801,
  lngInicio:  -66.87919,
  latDestino:  10.50123,
  lngDestino: -66.91234,
};

// ── HTTP helper ───────────────────────────────────────────────────────────────

function request(method, url, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const opts = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('TIMEOUT')));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

const G = '\x1b[32m✓\x1b[0m';
const R = '\x1b[31m✗\x1b[0m';
const B = '\x1b[36m→\x1b[0m';
const results = [];

function rec(name, ok, detail = '') {
  results.push({ name, ok, detail: String(detail), ts: new Date().toISOString() });
  console.log(`  ${ok ? G : R} ${name}${detail ? ' — ' + detail : ''}`);
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═'.repeat(65));
  console.log(' PRUEBA REAL DE EMISIÓN RCV — LA MUNDIAL DE SEGUROS');
  console.log(`  Servidor Ridery: ${BASE_API}`);
  console.log(`  La Mundial QA:   ${LAMUNDIAL_URL}`);
  console.log(`  Token:           ${LAMUNDIAL_TOKEN !== 'PENDIENTE_TOKEN_QA' ? '✓ Configurado' : '✗ FALTA configurar'}`);
  console.log(`  Productor:       ${CODIGO_PRODUCTOR || 'FALTA configurar'}`);
  console.log('═'.repeat(65));

  if (LAMUNDIAL_TOKEN === 'PENDIENTE_TOKEN_QA') {
    console.log('\n\x1b[33m⚠️  PENDIENTE: Configura el token antes de ejecutar:\x1b[0m');
    console.log('   LAMUNDIAL_TOKEN=tu_token node test-emision-real.js\n');
    console.log('  O desde el frontend: PUT /api/tenant/me/seguro → authToken\n');
    process.exit(0);
  }

  // ── 1. Crear tenant y configurar seguro ──────────────────────────────────────

  console.log('\n\x1b[1m[ 1 ] Preparar tenant de prueba\x1b[0m');

  const tenantR = await request('POST', `${BASE_API}/admin/tenants`, {
    nombre: `emision-real-test-${Date.now()}`,
    webhookUrl: 'https://webhook.site/ridery-emision-test',
  }, { 'X-Admin-Key': ADMIN_KEY });

  if (tenantR.status !== 201) {
    console.log(`\x1b[31m✗ No se pudo crear tenant: ${JSON.stringify(tenantR.body)}\x1b[0m`);
    process.exit(1);
  }

  const apiKey = tenantR.body.apiKey;
  rec('Tenant creado', true, `id=${tenantR.body.id?.slice(0, 8)}...`);

  const seguroR = await request('PUT', `${BASE_API}/tenant/me/seguro`, {
    seguroConfig: {
      baseUrl:    LAMUNDIAL_URL,
      authToken:  LAMUNDIAL_TOKEN,
      plan:       '2',
      cramo:      1310,
      frecuencia: 'A',
      productor:  CODIGO_PRODUCTOR || undefined,
    },
    fieldMappings: {
      placa: 'placa', fano: 'fano', cmarca: 'cmarca', cmodelo: 'cmodelo',
      cversion: 'cversion', color: 'color',
      serial_carroceria: 'serial_carroceria',
      nombre_tomador: 'nombre_tomador', apellido_tomador: 'apellido_tomador',
      rif_tomador: 'rif_tomador', tipo_cedula_tomador: 'tipo_cedula_tomador',
      fnac_tomador: 'fnac_tomador', telefono_tomador: 'telefono_tomador',
      correo_tomador: 'correo_tomador',
    },
    defaultValues: {
      ccategoria_uso: 1,
      dec_persona_politica: 0,
      dec_term_y_cod: 1,
      estado_tomador: 1,
      ciudad_tomador: 1,
      direccion_tomador: 'CARACAS, VENEZUELA',
    },
  }, { 'X-Api-Key': apiKey });

  rec('Seguro configurado', seguroR.status === 200, `baseUrl=${LAMUNDIAL_URL}`);

  // ── 2. Prueba cotización directa ──────────────────────────────────────────────

  console.log('\n\x1b[1m[ 2 ] Cotización directa a La Mundial\x1b[0m');
  const cotR = await request('POST', `${LAMUNDIAL_URL}/api/v1/external/getCotizacionAuto`, {
    fano: VIAJE_PRUEBA.fano,
    cmarca: VIAJE_PRUEBA.cmarca,
    cmodelo: VIAJE_PRUEBA.cmodelo,
    cversion: VIAJE_PRUEBA.cversion,
    cplan: '2',
    ccategoria_uso: VIAJE_PRUEBA.ccategoria_uso,
  });
  rec('Cotización RCV', cotR.status === 200 && cotR.body?.status !== false,
    cotR.status === 200 ? `prima=${JSON.stringify(cotR.body?.result)?.slice(0, 100)}` : `HTTP ${cotR.status}: ${JSON.stringify(cotR.body)?.slice(0, 120)}`
  );

  // ── 3. Iniciar viaje → emite póliza real ──────────────────────────────────────

  console.log('\n\x1b[1m[ 3 ] Iniciar viaje (emisión RCV real)\x1b[0m');
  console.log(`  ${B} Placa: ${VIAJE_PRUEBA.placa} | Vehículo: CHEVROLET AVEO ${VIAJE_PRUEBA.fano}`);

  const iKey = `emision-real-${Date.now()}`;
  const iniciarR = await request('POST', `${BASE_API}/viaje/iniciar`, VIAJE_PRUEBA, {
    'X-Api-Key': apiKey,
    'X-Idempotency-Key': iKey,
  });

  const ok = iniciarR.status === 201;
  rec('POST /viaje/iniciar', ok,
    ok ? `id=${iniciarR.body?.id?.slice(0, 8)}... estadoPoliza=${iniciarR.body?.estadoPoliza}`
       : `HTTP ${iniciarR.status}: ${JSON.stringify(iniciarR.body)?.slice(0, 120)}`
  );

  if (!ok) {
    console.log('\n\x1b[31m✗ No se pudo iniciar el viaje. Abortando.\x1b[0m');
    printSummary();
    return;
  }

  const viajeId = iniciarR.body?.id;
  const estadoPoliza = iniciarR.body?.estadoPoliza;

  if (estadoPoliza === 'ACTIVA') {
    rec('🎉 Póliza RCV emitida exitosamente', true, `cnpoliza=${iniciarR.body?.cnpoliza} | recibo=${iniciarR.body?.cnrecibo}`);
    if (iniciarR.body?.urlPolizaPDF) {
      rec('PDF de póliza disponible', true, iniciarR.body.urlPolizaPDF);
    }
  } else if (estadoPoliza === 'ERROR') {
    rec('Estado póliza ERROR', false,
      `Error: ${iniciarR.body?.polizaError?.slice(0, 120)} | El sistema reintentará automáticamente`
    );
  } else {
    rec(`Estado póliza: ${estadoPoliza}`, estadoPoliza !== 'ERROR', estadoPoliza);
  }

  // ── 4. Esperar y verificar estado de póliza ──────────────────────────────────

  if (estadoPoliza === 'EMITIENDO' || estadoPoliza === 'ERROR') {
    console.log(`\n  ${B} Esperando 5s para que la póliza se procese...`);
    await new Promise(r => setTimeout(r, 5000));

    const viajeR = await request('GET', `${BASE_API}/viaje/${viajeId}`, null, { 'X-Api-Key': apiKey });
    if (viajeR.status === 200) {
      const v = viajeR.body;
      rec('Estado póliza (post-wait)', v.estadoPoliza === 'ACTIVA',
        `estadoPoliza=${v.estadoPoliza} cnpoliza=${v.cnpoliza ?? 'N/A'}`
      );
      if (v.cnpoliza) rec('Número de póliza', true, v.cnpoliza);
      if (v.urlPolizaPDF) rec('PDF de póliza', true, v.urlPolizaPDF);
    }
  }

  // ── 5. Finalizar viaje → cancela póliza ──────────────────────────────────────

  console.log('\n\x1b[1m[ 4 ] Finalizar viaje (cancelar póliza)\x1b[0m');
  await new Promise(r => setTimeout(r, 1000));

  const finR = await request('POST', `${BASE_API}/viaje/finalizar`, { idViaje: viajeId }, {
    'X-Api-Key': apiKey,
  });

  rec('POST /viaje/finalizar', finR.status === 200,
    finR.status === 200
      ? `Viaje finalizado. cnpoliza=${finR.body?.cnpoliza ?? 'N/A'}`
      : `HTTP ${finR.status}`
  );

  // ── 6. Verificar que el viaje fue eliminado ───────────────────────────────────

  console.log('\n\x1b[1m[ 5 ] Verificar limpieza de datos\x1b[0m');
  const checkR = await request('GET', `${BASE_API}/viaje/${viajeId}`, null, { 'X-Api-Key': apiKey });
  rec('Viaje eliminado de BD', checkR.status === 404, `HTTP ${checkR.status} (esperado 404)`);

  // ── Resumen ───────────────────────────────────────────────────────────────────

  printSummary();
}

function printSummary() {
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  const pct = results.length ? Math.round((passed / results.length) * 100) : 0;

  console.log('\n' + '═'.repeat(65));
  console.log('\x1b[1m RESUMEN PRUEBA REAL DE EMISIÓN \x1b[0m');
  console.log('═'.repeat(65));
  console.log(`  Total:  ${results.length} | OK: \x1b[32m${passed}\x1b[0m | Fail: \x1b[31m${failed}\x1b[0m | Tasa: ${pct}%`);

  if (failed > 0) {
    console.log('\n  Fallaron:');
    results.filter(r => !r.ok).forEach(r => {
      console.log(`    \x1b[31m✗\x1b[0m ${r.name}: ${r.detail}`);
    });
  }

  console.log('\n  Checklist pendiente La Mundial:');
  console.log('    □ Token de autenticación (authToken)');
  console.log('    □ Código de productor (ccodpro)');
  console.log('    □ Endpoint de cancelación de póliza');
  console.log('    □ Confirmar campo: fano vs año');
  console.log('    □ Confirmar planos de producción (no QA)');
  console.log('\n' + '═'.repeat(65));

  require('fs').writeFileSync(
    'test-emision-real-results.json',
    JSON.stringify({ fecha: new Date().toISOString(), passed, failed, pct, results }, null, 2)
  );
  console.log('  Resultados guardados en test-emision-real-results.json');
}

main().catch(err => {
  console.error('\x1b[31mError fatal:', err.message, '\x1b[0m');
  process.exit(1);
});
