/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  MODO DEMO — datos simulados para presentaciones                 ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║  Cuando está activo, intercepta TODAS las llamadas axios del     ║
 * ║  cliente y devuelve datos realistas sin tocar el backend.        ║
 * ║                                                                  ║
 * ║  Cuando está inactivo, las llamadas pasan tal cual al backend.   ║
 * ║                                                                  ║
 * ║  No modifica la lógica de los componentes — los componentes ven  ║
 * ║  exactamente las mismas respuestas que verían del backend real.  ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */
import { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

let DEMO_ACTIVE = false;
let onChange: ((active: boolean) => void) | null = null;

export const isDemoMode = () => DEMO_ACTIVE;
export const setDemoMode = (active: boolean) => {
  DEMO_ACTIVE = active;
  if (active) seedDemoData();
  if (onChange) onChange(active);
};
export const onDemoModeChange = (cb: (active: boolean) => void) => {
  onChange = cb;
};

// ─── Estado en memoria (reset al recargar) ────────────────────────────────────
type DemoConductor = {
  id: string;
  tenantId: string;
  nombre: string;
  apellido: string;
  cedula: string;
  telefono: string;
  email: string;
  porcentajeComision: number;
  estado: 'ACTIVO' | 'INACTIVO' | 'SUSPENDIDO';
  creadoEn: string;
};

type DemoViaje = {
  id: string; tenantId: string; numeroPlaca: string; nombreConductor: string;
  modeloVehiculo: string; anioVehiculo: string;
  latInicio: number; lngInicio: number; latDestino: number; lngDestino: number;
  estado: string;
  cnpoliza?: string; cnrecibo?: string; urlPolizaPDF?: string;
  estadoPoliza?: string; polizaError?: string;
  polizaIntentos?: number; polizaUltimoIntento?: string;
  webhookEnviado: boolean; webhookIntentos: number; creadoEn: string;
  metadata?: Record<string, unknown>;
  conductorId?: string | null;
  planPoliza?: string;
  prima?: number;
  primaExt?: number;
  comision?: number;
};

type DemoTenant = {
  id: string;
  nombre: string;
  apiKey?: string;
  activo: boolean;
  createdAt: string;
};

const DEMO_TENANT_ID = 'demo-tenant-0001';
const DEMO_TENANT_NOMBRE = 'Taxis Express Demo C.A.';
const DEMO_API_KEY = 'demo_a3f8c2e1b9d4756f0e1a8c2b5d4e9f1c7a3b8e6d2f1a0c9b8e7d6c5b4a3f2e1d';
const DEMO_ADMIN_KEY = 'demo_admin_b8e7d6c5b4a3f2e1d_8765abcd_4321efgh_demo_only';
const DEMO_SESSION_TOKEN = 'demo-session-' + Math.random().toString(36).slice(2, 14);

const DEMO_TENANT_DATOS = {
  nombre: DEMO_TENANT_NOMBRE,
  webhookUrl: 'https://api.taxis-express-demo.com/eventos/seguros',
  webhookSecret: 'whsec_demo_a8b3c1d5e9f2g4h6',
};

let viajes: DemoViaje[] = [];
let conductores: DemoConductor[] = [];
let tenants: DemoTenant[] = [];
let seguroConfig: Record<string, unknown> = {};
let fieldMappings: Record<string, string> = {};
let defaultValues: Record<string, string | number> = {};
let polizaCounter = 38;

function seedDemoData() {
  if (viajes.length > 0) return;

  seguroConfig = {
    baseUrl: 'https://api.demo-aseguradora.com',
    authToken: 'demo-token-prov-aseg',
    cramo: 18,
    plan: 'RCVBAS',
    frecuencia: 'A',
    productor: 80080,
    cusuario: '4',
  };

  fieldMappings = {
    nombre_tomador: 'driver_name',
    apellido_tomador: 'driver_lastname',
    rif_tomador: 'driver_id',
    placa: 'vehicle_plate',
  };

  defaultValues = {
    cmarca: '083',
    cmodelo: '001',
    cversion: '03',
    fano: 2020,
    color: 'Negro',
    serial_carroceria: 'SC1S6ZMV3024399',
    ccategoria_uso: 11,
    ntoneladas: 0,
    estado_tomador: 1,
    ciudad_tomador: 128,
    direccion_tomador: 'Av. Principal 123',
    sexo_tomador: 'M',
    estado_civil_tomador: 'S',
    tipo_cedula_tomador: 'V',
    fnac_tomador: '1990-10-13',
    telefono_tomador: '+584241829583',
    correo_tomador: 'demo@cliente.com',
  };

  // ── Conductores demo (flota del tenant) ─────────────────────────────────
  conductores = [
    mkConductor('Daniel',  'Castro',   'V25221952', '+584241829583', 'daniel.castro@taxisexpress.com', 12.5),
    mkConductor('Andrea',  'Vargas',   'V18556321', '+584142587412', 'andrea.vargas@taxisexpress.com', 12.5),
    mkConductor('Miguel',  'Torres',   'V21887455', '+584125698744', 'miguel.torres@taxisexpress.com', 10.0),
    mkConductor('Valeria', 'Sánchez',  'V19887412', '+584241236547', 'valeria.sanchez@taxisexpress.com', 11.0),
    mkConductor('Eduardo', 'Romero',   'V17554896', '+584145896325', 'eduardo.romero@taxisexpress.com', 10.0),
    mkConductor('Luis',    'Hernández','V22885566', '+584122587413', 'luis.hernandez@taxisexpress.com',  9.5),
  ];

  // ── Otros tenants (cartera de la empresa contratante, vista admin) ─────
  tenants = [
    { id: DEMO_TENANT_ID, nombre: DEMO_TENANT_NOMBRE,           activo: true,  createdAt: dayOffset(-180) },
    { id: 'demo-tenant-0002', nombre: 'Ridery Caracas C.A.',     activo: true,  createdAt: dayOffset(-150) },
    { id: 'demo-tenant-0003', nombre: 'Yummy Riders Venezuela',  activo: true,  createdAt: dayOffset(-110) },
    { id: 'demo-tenant-0004', nombre: 'Ubii Express',            activo: true,  createdAt: dayOffset(-75) },
    { id: 'demo-tenant-0005', nombre: 'Pidedirecto Logística',   activo: false, createdAt: dayOffset(-40) },
  ];

  // ── Histórico de viajes con conductor, prima y comisión ────────────────
  // Cada conductor ejecuta el viaje y se le asigna la comisión de la póliza emitida.
  // Distribuyo los viajes entre los conductores para mostrar ranking realista.
  // Nota: el "conductor" del payload (nombreConductor) es el mismo que el del registro.
  const c = conductores;
  viajes = [
    // Daniel Castro — top performer (4 viajes históricos + 1 activo)
    crearViajeDemo({ placa:'AB123CD', modelo:'Toyota Corolla',  anio:'2020', estado:'FINALIZADA', estadoPoliza:'ACTIVA', cnpoliza:'POL-DEMO-0030', cnrecibo:'REC-DEMO-0030', conductor:c[0], plan:'RCVBAS', prima:485,    offset:-1000*60*60*24*7 }),
    crearViajeDemo({ placa:'EF456GH', modelo:'Chevrolet Aveo',  anio:'2018', estado:'FINALIZADA', estadoPoliza:'ACTIVA', cnpoliza:'POL-DEMO-0031', cnrecibo:'REC-DEMO-0031', conductor:c[0], plan:'RUSPAT', prima:1240,   offset:-1000*60*60*24*5 }),
    crearViajeDemo({ placa:'IJ789KL', modelo:'Ford Fiesta',     anio:'2019', estado:'FINALIZADA', estadoPoliza:'ACTIVA', cnpoliza:'POL-DEMO-0032', cnrecibo:'REC-DEMO-0032', conductor:c[0], plan:'RCVBAS', prima:512,    offset:-1000*60*60*24*4 }),
    crearViajeDemo({ placa:'X1Y2Z3',  modelo:'Toyota Hilux',    anio:'2022', estado:'FINALIZADA', estadoPoliza:'ACTIVA', cnpoliza:'POL-DEMO-0040', cnrecibo:'REC-DEMO-0040', conductor:c[0], plan:'RUSPAT', prima:1890,   offset:-1000*60*60*24*3 }),
    // Andrea Vargas
    crearViajeDemo({ placa:'MN012OP', modelo:'Hyundai Accent',  anio:'2021', estado:'FINALIZADA', estadoPoliza:'ACTIVA', cnpoliza:'POL-DEMO-0033', cnrecibo:'REC-DEMO-0033', conductor:c[1], plan:'RCVBAS', prima:495,    offset:-1000*60*60*24*4 }),
    crearViajeDemo({ placa:'PT112FG', modelo:'Renault Sandero', anio:'2020', estado:'FINALIZADA', estadoPoliza:'ACTIVA', cnpoliza:'POL-DEMO-0041', cnrecibo:'REC-DEMO-0041', conductor:c[1], plan:'RCVBAS', prima:485,    offset:-1000*60*60*24*2 }),
    crearViajeDemo({ placa:'QR345ST', modelo:'Renault Logan',   anio:'2022', estado:'FINALIZADA', estadoPoliza:'ACTIVA', cnpoliza:'POL-DEMO-0034', cnrecibo:'REC-DEMO-0034', conductor:c[1], plan:'RUSPAT', prima:1380,   offset:-1000*60*60*24 }),
    // Miguel Torres
    crearViajeDemo({ placa:'UV678WX', modelo:'Nissan Sentra',   anio:'2020', estado:'FINALIZADA', estadoPoliza:'ACTIVA', cnpoliza:'POL-DEMO-0035', cnrecibo:'REC-DEMO-0035', conductor:c[2], plan:'RCVBAS', prima:498,    offset:-1000*60*60*18 }),
    crearViajeDemo({ placa:'YZ901AB', modelo:'Kia Picanto',     anio:'2019', estado:'FINALIZADA', estadoPoliza:'ACTIVA', cnpoliza:'POL-DEMO-0036', cnrecibo:'REC-DEMO-0036', conductor:c[2], plan:'RCVBAS', prima:475,    offset:-1000*60*60*12 }),
    // Valeria Sánchez
    crearViajeDemo({ placa:'JK556LM', modelo:'Chery QQ',        anio:'2018', estado:'FINALIZADA', estadoPoliza:'ACTIVA', cnpoliza:'POL-DEMO-0042', cnrecibo:'REC-DEMO-0042', conductor:c[3], plan:'RCVBAS', prima:445,    offset:-1000*60*60*8 }),
    // Eduardo Romero — viaje activo
    crearViajeDemo({ placa:'CD234EF', modelo:'Toyota Yaris',    anio:'2021', estado:'EN_CURSO',   estadoPoliza:'ACTIVA', cnpoliza:'POL-DEMO-0037', cnrecibo:'REC-DEMO-0037', conductor:c[4], plan:'RCVBAS', prima:495,    offset:-1000*60*8 }),
    // Luis Hernández — viaje activo
    crearViajeDemo({ placa:'BR997TY', modelo:'Toyota Camry',    anio:'2023', estado:'EN_CURSO',   estadoPoliza:'ACTIVA', cnpoliza:'POL-DEMO-0043', cnrecibo:'REC-DEMO-0043', conductor:c[5], plan:'RUSPAT', prima:1690,   offset:-1000*60*15 }),
    // Daniel Castro — viaje activo (otro)
    crearViajeDemo({ placa:'TR332BV', modelo:'Nissan Versa',    anio:'2022', estado:'EN_CURSO',   estadoPoliza:'ACTIVA', cnpoliza:'POL-DEMO-0044', cnrecibo:'REC-DEMO-0044', conductor:c[0], plan:'RCVBAS', prima:485,    offset:-1000*60*5 }),
    // Un viaje con error de póliza para que el monitor muestre actividad
    {
      ...crearViajeDemo({
        placa:'GH567IK', modelo:'Suzuki Swift', anio:'2017',
        estado:'EN_CURSO', estadoPoliza:'EMITIENDO',
        conductor:c[2], plan:'RCVBAS', prima:0,
        offset:-1000*60*18,
      }),
      cnpoliza: undefined,
      cnrecibo: undefined,
      urlPolizaPDF: undefined,
      polizaError: 'Timeout al consultar API de aseguradora — se reintentará automáticamente',
      polizaIntentos: 2,
      webhookEnviado: false,
      webhookIntentos: 2,
    } as DemoViaje,
  ];
}

function dayOffset(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString();
}

function mkConductor(nombre: string, apellido: string, cedula: string, telefono: string, email: string, comision: number): DemoConductor {
  return {
    id: 'cd-' + cedula.toLowerCase(),
    tenantId: DEMO_TENANT_ID,
    nombre, apellido, cedula, telefono, email,
    porcentajeComision: comision,
    estado: 'ACTIVO',
    creadoEn: dayOffset(-Math.floor(60 + Math.random() * 120)),
  };
}

function crearViajeDemo(p: {
  placa: string; modelo: string; anio: string;
  estado: string; estadoPoliza?: string; cnpoliza?: string; cnrecibo?: string;
  offset: number;
  conductor?: DemoConductor;
  /** Permite sobrescribir el nombre del conductor (cuando viene del payload del integrador) */
  nombreConductor?: string;
  plan?: string;
  prima?: number;
}): DemoViaje {
  const id = 'demo-' + Math.random().toString(36).slice(2, 10);
  const prima = p.prima ?? 0;
  const comisionPct = p.conductor?.porcentajeComision ?? 10;
  const comision = Math.round((prima * comisionPct) / 100 * 100) / 100;
  const nombre = p.nombreConductor
    ?? (p.conductor ? `${p.conductor.nombre} ${p.conductor.apellido}` : 'Sin asignar');
  return {
    id, tenantId: DEMO_TENANT_ID,
    numeroPlaca: p.placa, nombreConductor: nombre,
    modeloVehiculo: p.modelo, anioVehiculo: p.anio,
    latInicio: 10.4806, lngInicio: -66.9036,
    latDestino: 10.4906, lngDestino: -66.8936,
    estado: p.estado,
    cnpoliza: p.cnpoliza, cnrecibo: p.cnrecibo,
    urlPolizaPDF: p.cnpoliza ? `https://demo.aseguradora.com/poliza/${p.cnpoliza}.pdf` : undefined,
    estadoPoliza: p.estadoPoliza,
    webhookEnviado: !!p.cnpoliza, webhookIntentos: p.cnpoliza ? 1 : 0,
    creadoEn: new Date(Date.now() + p.offset).toISOString(),
    metadata: { demo: true },
    conductorId: p.conductor?.id ?? null,
    planPoliza: p.plan ?? 'RCVBAS',
    prima,
    primaExt: prima > 0 ? Math.round((prima / 36.5) * 100) / 100 : 0,
    comision,
  };
}

// ─── Helpers de agregación (usados en mocks de dashboard) ────────────────────
function calcularKpis(list: DemoViaje[]) {
  const total = list.length;
  const activos = list.filter(v => v.estado === 'INICIADO' || v.estado === 'EN_CURSO').length;
  const finalizados = list.filter(v => v.estado === 'FINALIZADA' || v.estado === 'FINALIZADO').length;
  const polizasActivas = list.filter(v => v.estadoPoliza === 'ACTIVA').length;
  const recibos = list.filter(v => !!v.cnrecibo).length;
  const primaTotal = list.reduce((a, v) => a + (v.prima ?? 0), 0);
  const primaTotalExt = list.reduce((a, v) => a + (v.primaExt ?? 0), 0);
  const comisionTotal = list.reduce((a, v) => a + (v.comision ?? 0), 0);
  const conPrima = list.filter(v => (v.prima ?? 0) > 0);
  const ticketPromedio = conPrima.length ? primaTotal / conPrima.length : 0;
  return {
    totalViajes: total,
    viajesActivos: activos,
    viajesFinalizados: finalizados,
    polizasActivas,
    recibos,
    primaTotal,
    primaTotalExt,
    comisionTotal,
    ticketPromedio,
  };
}

function calcularRanking(list: DemoViaje[], metrica: 'viajes' | 'prima' | 'comision') {
  const map = new Map<string, {
    conductorId: string | null; nombre: string; cedula: string;
    totalViajes: number; viajesActivos: number;
    primaGenerada: number; comisionGenerada: number;
  }>();
  for (const v of list) {
    const key = v.conductorId ?? '__sin__';
    const cd = conductores.find(x => x.id === v.conductorId);
    const nombre = cd ? `${cd.nombre} ${cd.apellido}` : (v.nombreConductor ?? 'Sin asignar');
    const cedula = cd?.cedula ?? '-';
    const cur = map.get(key) ?? {
      conductorId: v.conductorId ?? null, nombre, cedula,
      totalViajes: 0, viajesActivos: 0,
      primaGenerada: 0, comisionGenerada: 0,
    };
    cur.totalViajes += 1;
    if (v.estado === 'INICIADO' || v.estado === 'EN_CURSO') cur.viajesActivos += 1;
    cur.primaGenerada += v.prima ?? 0;
    cur.comisionGenerada += v.comision ?? 0;
    map.set(key, cur);
  }
  const arr = Array.from(map.values());
  const key = metrica === 'viajes' ? 'totalViajes'
    : metrica === 'comision' ? 'comisionGenerada'
    : 'primaGenerada';
  return arr.sort((a, b) => (b[key] as number) - (a[key] as number));
}

// ─── Generadores sintéticos por tenant (drill-down admin) ────────────────────
/**
 * Devuelve KPIs deterministas para un tenantId. Si es el tenant principal
 * usa los datos reales del demo; para los demás genera valores consistentes
 * a partir de una semilla.
 */
function kpisSimuladosTenant(tenantId: string) {
  if (tenantId === DEMO_TENANT_ID) return calcularKpis(viajes);
  const semilla = parseInt(tenantId.replace(/\D/g, '').slice(-2) || '5', 10);
  const totalViajes      = Math.floor(40 + semilla * 7.5);
  const viajesActivos    = Math.max(1, Math.floor(totalViajes * 0.06));
  const viajesFinalizados= totalViajes - viajesActivos;
  const polizasActivas   = Math.floor(totalViajes * 0.92);
  const recibos          = polizasActivas;
  const ticketBase       = 520 + semilla * 12;
  const primaTotal       = Math.round(totalViajes * ticketBase);
  const comisionTotal    = Math.round(primaTotal * 0.115);
  const primaTotalExt    = Math.round((primaTotal / 36.5) * 100) / 100;
  const ticketPromedio   = primaTotal / Math.max(totalViajes, 1);
  return {
    totalViajes, viajesActivos, viajesFinalizados,
    polizasActivas, recibos,
    primaTotal, primaTotalExt, comisionTotal, ticketPromedio,
  };
}

const NOMBRES_FAKE = [
  ['Carlos', 'Rivera'], ['María', 'González'], ['Andrés', 'López'],
  ['Sofía', 'Martínez'], ['Diego', 'Hernández'], ['Lucía', 'Pérez'],
  ['Javier', 'Núñez'], ['Daniela', 'Castro'], ['Roberto', 'Mendoza'],
  ['Valentina', 'Ruiz'],
];

function rankingSimuladoTenant(tenantId: string, metrica: 'viajes' | 'prima' | 'comision') {
  if (tenantId === DEMO_TENANT_ID) return calcularRanking(viajes, metrica);
  const semilla = parseInt(tenantId.replace(/\D/g, '').slice(-2) || '5', 10);
  const k = kpisSimuladosTenant(tenantId);
  const cantidad = Math.min(6, NOMBRES_FAKE.length);
  const rows = NOMBRES_FAKE.slice(0, cantidad).map((n, i) => {
    const peso = (cantidad - i) / ((cantidad * (cantidad + 1)) / 2);
    const totalViajes = Math.floor(k.totalViajes * peso);
    const primaGenerada = Math.round(k.primaTotal * peso);
    const comisionGenerada = Math.round(k.comisionTotal * peso);
    const viajesActivos = i === 0 && k.viajesActivos > 0 ? k.viajesActivos : 0;
    return {
      conductorId: `cd-${tenantId}-${i}`,
      nombre: `${n[0]} ${n[1]}`,
      cedula: `V${10000000 + semilla * 1000 + i * 137}`,
      totalViajes, viajesActivos, primaGenerada, comisionGenerada,
    };
  });
  const key = metrica === 'viajes' ? 'totalViajes'
    : metrica === 'comision' ? 'comisionGenerada'
    : 'primaGenerada';
  return rows.sort((a, b) => (b[key] as number) - (a[key] as number));
}

function enCursoSimuladoTenant(tenantId: string) {
  if (tenantId === DEMO_TENANT_ID) {
    const activos = viajes.filter(v => v.estado === 'EN_CURSO' || v.estado === 'INICIADO');
    return calcularRanking(activos, 'viajes');
  }
  const k = kpisSimuladosTenant(tenantId);
  if (k.viajesActivos === 0) return [];
  const semilla = parseInt(tenantId.replace(/\D/g, '').slice(-2) || '5', 10);
  return NOMBRES_FAKE.slice(0, Math.min(k.viajesActivos, 4)).map((n, i) => ({
    conductorId: `cd-${tenantId}-${i}`,
    nombre: `${n[0]} ${n[1]}`,
    cedula: `V${10000000 + semilla * 1000 + i * 137}`,
    totalViajes: 1,
    viajesActivos: 1,
    primaGenerada: 0,
    comisionGenerada: 0,
  }));
}

// ─── Router de mocks ──────────────────────────────────────────────────────────
type Method = 'get' | 'post' | 'put' | 'delete' | 'patch';

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function handleMock(method: Method, url: string, body: unknown): Promise<unknown> {
  // Simula latencia realista de red
  await delay(280 + Math.random() * 350);

  // Limpiar prefijos comunes
  const path = url.replace(/^\/?api/, '').replace(/^\//, '');

  // ── Auth / sesión ─────────────────────────────────────────────────────────
  if (method === 'post' && path === 'auth/session') {
    return {
      sessionToken: DEMO_SESSION_TOKEN,
      expiresAt: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
      tenant: { id: DEMO_TENANT_ID, nombre: DEMO_TENANT_NOMBRE },
    };
  }

  // ── Tenant: configuración ─────────────────────────────────────────────────
  if (method === 'get' && path === 'tenant/me/mapeos') {
    return { seguroConfig, fieldMappings, defaultValues };
  }
  if (method === 'put' && path === 'tenant/me/seguro') {
    const b = (body as Record<string, unknown>) ?? {};
    if (b.seguroConfig) seguroConfig = b.seguroConfig as typeof seguroConfig;
    if (b.fieldMappings) fieldMappings = b.fieldMappings as Record<string, string>;
    if (b.defaultValues) defaultValues = b.defaultValues as Record<string, string | number>;
    return { ok: true, message: 'Configuración guardada (modo demo)' };
  }

  // ── Viajes ────────────────────────────────────────────────────────────────
  if (method === 'post' && path === 'viaje/iniciar') {
    const b = (body as Record<string, string>) ?? {};
    const placa = String(b.placa ?? b.numeroPlaca ?? b.vehicle_plate ?? `DEMO${Math.floor(Math.random() * 999)}`).toUpperCase();
    const nombre = String(b.nombre_tomador ?? b.driver_name ?? 'Conductor');
    const apellido = String(b.apellido_tomador ?? b.driver_lastname ?? 'Demo');
    const fullName = `${nombre} ${apellido}`.trim();
    const modelo = String(b.modeloVehiculo ?? 'Toyota Corolla');
    const anio = String(b.fano ?? b.anioVehiculo ?? '2021');
    const planSel = String(b.plan ?? (seguroConfig as { plan?: string }).plan ?? 'RCVBAS');

    polizaCounter += 1;
    const cnpoliza = `POL-DEMO-${String(polizaCounter).padStart(4, '0')}`;
    const cnrecibo = `REC-DEMO-${String(polizaCounter).padStart(4, '0')}`;

    // Asigna conductor: si vino conductorId / cedula úsalo, si no rota
    let conductor: DemoConductor | undefined;
    const conductorIdent = String(b.conductorId ?? b.conductor_cedula ?? b.cedula ?? '').trim();
    if (conductorIdent) {
      conductor = conductores.find(c => c.id === conductorIdent || c.cedula === conductorIdent);
    }
    if (!conductor && conductores.length > 0) {
      conductor = conductores[viajes.length % conductores.length];
    }

    // Prima realista según plan (RCVBAS ~ 480-520 Bs · RUSPAT ~ 1200-1900 Bs)
    const prima = planSel === 'RUSPAT'
      ? Math.round(1200 + Math.random() * 700)
      : Math.round(470 + Math.random() * 60);

    const v = crearViajeDemo({
      placa,
      modelo, anio,
      estado: 'EN_CURSO', estadoPoliza: 'ACTIVA',
      cnpoliza, cnrecibo,
      offset: 0,
      conductor,
      nombreConductor: fullName, // respeta el nombre que vino en el payload
      plan: planSel,
      prima,
    });
    viajes.unshift(v);

    return v;
  }

  if (method === 'post' && path === 'viaje/finalizar') {
    const idViaje = (body as { idViaje?: string })?.idViaje;
    const v = viajes.find(x => x.id === idViaje);
    if (!v) {
      throw {
        response: {
          status: 404,
          data: { statusCode: 404, message: 'Viaje no encontrado (modo demo).' },
        },
      };
    }
    v.estado = 'FINALIZADA';
    if (!v.cnpoliza) {
      polizaCounter += 1;
      v.cnpoliza = `POL-DEMO-${String(polizaCounter).padStart(4, '0')}`;
      v.cnrecibo = `REC-DEMO-${String(polizaCounter).padStart(4, '0')}`;
      v.urlPolizaPDF = `https://demo.aseguradora.com/poliza/${v.cnpoliza}.pdf`;
      v.estadoPoliza = 'ACTIVA';
      v.webhookEnviado = true;
      v.webhookIntentos = 1;
    }
    return {
      ok: true,
      message: 'Viaje finalizado y póliza emitida (modo demo).',
      viaje: v,
    };
  }

  if (method === 'post' && path === 'viaje/enviar') {
    const b = (body as { idViaje?: string }) ?? {};
    const v = viajes.find(x => x.id === b.idViaje);
    if (!v) {
      throw { response: { status: 404, data: { message: 'Viaje no encontrado.' } } };
    }
    v.webhookEnviado = true;
    v.webhookIntentos += 1;
    return { ok: true, message: 'Webhook reenviado (modo demo).', viaje: v };
  }

  if (method === 'get' && path.startsWith('viaje?')) {
    return { data: viajes, total: viajes.length };
  }

  if (method === 'get' && path === 'viaje/mis-polizas-criticas') {
    const pendientes = viajes.filter(v =>
      v.estadoPoliza === 'EMITIENDO' || v.estadoPoliza === 'ERROR' || v.estadoPoliza === 'CRITICO'
    );
    const criticos = pendientes.filter(v => v.estadoPoliza === 'CRITICO').length;
    const errores  = pendientes.filter(v => v.estadoPoliza === 'ERROR' || v.polizaError).length;
    const atascados = pendientes.filter(v => (v.polizaIntentos ?? 0) >= 3).length;

    const alerta = pendientes.length > 0;
    return {
      tenantId: DEMO_TENANT_ID,
      tenantNombre: DEMO_TENANT_NOMBRE,
      alerta,
      mensaje: alerta
        ? `${pendientes.length} póliza(s) requieren atención del sistema`
        : 'Todas las pólizas están al día. Sistema funcionando correctamente.',
      resumen: {
        total: pendientes.length,
        criticos,
        errores,
        atascados,
      },
      viajes: pendientes.map(v => ({
        id: v.id,
        numeroPlaca: v.numeroPlaca,
        estadoPoliza: v.estadoPoliza,
        polizaIntentos: v.polizaIntentos ?? (v.polizaError ? 2 : 1),
        polizaUltimoIntento: v.polizaUltimoIntento ?? new Date(Date.now() - 1000 * 60 * 5).toISOString(),
        polizaError: v.polizaError ?? null,
      })),
    };
  }

  // ── Admin (creación de tenant) ───────────────────────────────────────────
  if (method === 'post' && path === 'admin/tenants') {
    const b = (body as { nombre?: string }) ?? {};
    const nombre = b.nombre ?? 'Cliente Demo';
    const id = 'demo-' + Math.random().toString(36).slice(2, 10);
    const apiKey = 'demo_' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    tenants.unshift({ id, nombre, apiKey, activo: true, createdAt: new Date().toISOString() });
    return {
      id, nombre, apiKey,
      estado: 'ACTIVO',
      createdAt: new Date().toISOString(),
      message: 'Cliente creado (modo demo). En producción esta clave es única e irrepetible.',
    };
  }

  if (method === 'get' && path === 'admin/tenants') {
    return tenants.map(t => ({
      id: t.id, nombre: t.nombre, estado: t.activo ? 'ACTIVO' : 'INACTIVO',
      createdAt: t.createdAt,
    }));
  }

  // ── Conductores (CRUD) ────────────────────────────────────────────────────
  if (method === 'get' && path.startsWith('conductores')) {
    const soloActivos = path.includes('soloActivos=true');
    return soloActivos ? conductores.filter(c => c.estado === 'ACTIVO') : conductores;
  }
  if (method === 'post' && path === 'conductores') {
    const b = (body as Partial<DemoConductor>) ?? {};
    const nuevo: DemoConductor = {
      id: 'cd-' + Math.random().toString(36).slice(2, 10),
      tenantId: DEMO_TENANT_ID,
      nombre: b.nombre ?? 'Nuevo',
      apellido: b.apellido ?? '',
      cedula: b.cedula ?? 'V0',
      telefono: b.telefono ?? '',
      email: b.email ?? '',
      porcentajeComision: b.porcentajeComision ?? 10,
      estado: 'ACTIVO',
      creadoEn: new Date().toISOString(),
    };
    conductores.unshift(nuevo);
    return nuevo;
  }
  if (method === 'put' && path.startsWith('conductores/')) {
    const id = path.split('/')[1];
    const c = conductores.find(x => x.id === id);
    if (!c) throw { response: { status: 404, data: { message: 'Conductor no encontrado.' } } };
    Object.assign(c, body);
    return c;
  }
  if (method === 'delete' && path.startsWith('conductores/')) {
    const id = path.split('/')[1];
    const c = conductores.find(x => x.id === id);
    if (c) c.estado = 'INACTIVO';
    return { ok: true };
  }

  // ── Dashboard del tenant ──────────────────────────────────────────────────
  if (method === 'get' && path === 'dashboard/kpis') {
    return calcularKpis(viajes);
  }

  if (method === 'get' && path.startsWith('dashboard/conductores/ranking')) {
    const params = new URLSearchParams(path.split('?')[1] ?? '');
    const metrica = (params.get('metrica') as 'viajes' | 'prima' | 'comision') ?? 'prima';
    const limit = parseInt(params.get('limit') ?? '10', 10);
    return calcularRanking(viajes, metrica).slice(0, limit);
  }

  if (method === 'get' && path === 'dashboard/conductores/en-curso') {
    const activos = viajes.filter(v => v.estado === 'EN_CURSO' || v.estado === 'INICIADO');
    return calcularRanking(activos, 'viajes');
  }

  if (method === 'get' && path === 'dashboard/admin/global') {
    const k = calcularKpis(viajes);
    return {
      ...k,
      totalTenants: tenants.filter(t => t.activo).length,
      totalConductores: conductores.filter(c => c.estado === 'ACTIVO').length,
    };
  }

  if (method === 'get' && path === 'dashboard/admin/cartera') {
    return tenants.map(t => {
      const k = kpisSimuladosTenant(t.id);
      return {
        id: t.id, nombre: t.nombre, activo: t.activo, creadoEn: t.createdAt,
        totalViajes: k.totalViajes, viajesActivos: k.viajesActivos,
        primaTotal: k.primaTotal, comisionTotal: k.comisionTotal,
      };
    });
  }

  // ── Drill-down: KPIs/ranking/en-curso por tenantId (admin) ────────────────
  const drillKpis = path.match(/^dashboard\/admin\/tenants\/([^/]+)\/kpis$/);
  if (method === 'get' && drillKpis) {
    return kpisSimuladosTenant(drillKpis[1]);
  }
  const drillRanking = path.match(/^dashboard\/admin\/tenants\/([^/]+)\/conductores\/ranking/);
  if (method === 'get' && drillRanking) {
    const params = new URLSearchParams(path.split('?')[1] ?? '');
    const metrica = (params.get('metrica') as 'viajes' | 'prima' | 'comision') ?? 'prima';
    const limit = parseInt(params.get('limit') ?? '10', 10);
    return rankingSimuladoTenant(drillRanking[1], metrica).slice(0, limit);
  }
  const drillEnCurso = path.match(/^dashboard\/admin\/tenants\/([^/]+)\/conductores\/en-curso$/);
  if (method === 'get' && drillEnCurso) {
    return enCursoSimuladoTenant(drillEnCurso[1]);
  }

  // ── Fallback ─────────────────────────────────────────────────────────────
  throw {
    response: {
      status: 404,
      data: { message: `[Modo demo] Endpoint no simulado: ${method.toUpperCase()} ${path}` },
    },
  };
}

// ─── Interceptor instalable ───────────────────────────────────────────────────
/**
 * Instala un interceptor en el cliente axios.
 * Cuando isDemoMode()===true, redirige las llamadas al router de mocks.
 * Cuando es false, no modifica nada.
 */
export function installDemoInterceptor(client: AxiosInstance) {
  client.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
    if (!DEMO_ACTIVE) return config;

    const method = (config.method ?? 'get').toLowerCase() as Method;
    const url = config.url ?? '';
    const body = config.data
      ? typeof config.data === 'string' ? safeParse(config.data) : config.data
      : undefined;

    const data = await handleMock(method, url, body);

    // Devuelve un adapter que produce una AxiosResponse sintética
    config.adapter = async () => ({
      data,
      status: 200,
      statusText: 'OK (demo)',
      headers: {},
      config,
    } as AxiosResponse);

    return config;
  });
}

function safeParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return s; }
}

export const DEMO_INFO = {
  tenantId: DEMO_TENANT_ID,
  tenantNombre: DEMO_TENANT_NOMBRE,
  apiKey: DEMO_API_KEY,
  adminKey: DEMO_ADMIN_KEY,
  sessionToken: DEMO_SESSION_TOKEN,
  setupNombre: DEMO_TENANT_DATOS.nombre,
  setupWebhook: DEMO_TENANT_DATOS.webhookUrl,
  setupSecret: DEMO_TENANT_DATOS.webhookSecret,
};

/**
 * JSON ejemplo realista para "Iniciar Viaje" en modo demo.
 * Se calcula on-the-fly con un nuevo conductor/placa cada vez que se llama.
 */
export function buildDemoViajeBody(): Record<string, unknown> {
  // Flota disponible para muestrear (vehículo + conductor del payload)
  const flota = [
    { n: 'Daniel', a: 'Castro', placa: 'GH456IJ', modelo: 'Toyota Corolla', anio: 2022, color: 'Blanco' },
    { n: 'Andrea', a: 'Vargas', placa: 'KL789MN', modelo: 'Hyundai i10', anio: 2021, color: 'Rojo' },
    { n: 'Miguel', a: 'Torres', placa: 'OP012QR', modelo: 'Chevrolet Spark', anio: 2020, color: 'Azul' },
    { n: 'Valeria', a: 'Sánchez', placa: 'ST345UV', modelo: 'Ford EcoSport', anio: 2023, color: 'Gris' },
    { n: 'Eduardo', a: 'Romero', placa: 'WX678YZ', modelo: 'Renault Kwid', anio: 2022, color: 'Negro' },
  ];
  const f = flota[Math.floor(Math.random() * flota.length)];
  const cedula = String(20000000 + Math.floor(Math.random() * 9999999));
  // Resuelve un conductor registrado del tenant (si existe) por nombre/apellido
  const conductorRegistrado = conductores.find(
    cd => cd.estado === 'ACTIVO' && cd.nombre === f.n && cd.apellido === f.a,
  ) ?? conductores.find(cd => cd.estado === 'ACTIVO');
  return {
    conductor_cedula: conductorRegistrado?.cedula ?? '',
    placa: f.placa,
    fano: f.anio,
    cmarca: '083',
    cmodelo: '001',
    cversion: '03',
    color: f.color,
    serial_carroceria: 'SC1S6ZMV3024' + Math.floor(100 + Math.random() * 899),
    ccategoria_uso: 11,
    ntoneladas: 0,
    nombre_tomador: f.n,
    apellido_tomador: f.a,
    rif_tomador: cedula,
    tipo_cedula_tomador: 'V',
    fnac_tomador: '1990-05-15',
    telefono_tomador: '+58424' + Math.floor(1000000 + Math.random() * 8999999),
    correo_tomador: `${f.n.toLowerCase()}.${f.a.toLowerCase()}@demo.com`,
    estado_tomador: 1,
    ciudad_tomador: 128,
    direccion_tomador: 'Av. Principal, Caracas',
    sexo_tomador: 'M',
    estado_civil_tomador: 'S',
    modeloVehiculo: f.modelo,
    anioVehiculo: String(f.anio),
    nombreConductor: `${f.n} ${f.a}`,
    latInicio: 10.4806,
    lngInicio: -66.9036,
    latDestino: 10.4906,
    lngDestino: -66.8936,
  };
}
