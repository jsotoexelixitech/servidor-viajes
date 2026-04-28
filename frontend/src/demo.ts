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

  viajes = [
    crearViajeDemo({
      placa: 'AB123CD', conductor: 'Carlos Rodríguez', modelo: 'Toyota Corolla', anio: '2020',
      estado: 'FINALIZADA', estadoPoliza: 'ACTIVA', cnpoliza: 'POL-DEMO-0030', cnrecibo: 'REC-DEMO-0030',
      offset: -1000 * 60 * 60 * 24 * 3,
    }),
    crearViajeDemo({
      placa: 'EF456GH', conductor: 'María González', modelo: 'Chevrolet Aveo', anio: '2018',
      estado: 'FINALIZADA', estadoPoliza: 'ACTIVA', cnpoliza: 'POL-DEMO-0031', cnrecibo: 'REC-DEMO-0031',
      offset: -1000 * 60 * 60 * 24 * 2,
    }),
    crearViajeDemo({
      placa: 'IJ789KL', conductor: 'José Pérez', modelo: 'Ford Fiesta', anio: '2019',
      estado: 'FINALIZADA', estadoPoliza: 'ACTIVA', cnpoliza: 'POL-DEMO-0032', cnrecibo: 'REC-DEMO-0032',
      offset: -1000 * 60 * 60 * 12,
    }),
    crearViajeDemo({
      placa: 'MN012OP', conductor: 'Ana Martínez', modelo: 'Hyundai Accent', anio: '2021',
      estado: 'FINALIZADA', estadoPoliza: 'ACTIVA', cnpoliza: 'POL-DEMO-0033', cnrecibo: 'REC-DEMO-0033',
      offset: -1000 * 60 * 60 * 4,
    }),
    crearViajeDemo({
      placa: 'QR345ST', conductor: 'Luis Hernández', modelo: 'Renault Logan', anio: '2022',
      estado: 'FINALIZADA', estadoPoliza: 'ACTIVA', cnpoliza: 'POL-DEMO-0034', cnrecibo: 'REC-DEMO-0034',
      offset: -1000 * 60 * 60 * 2,
    }),
    crearViajeDemo({
      placa: 'UV678WX', conductor: 'Patricia Silva', modelo: 'Nissan Sentra', anio: '2020',
      estado: 'FINALIZADA', estadoPoliza: 'ACTIVA', cnpoliza: 'POL-DEMO-0035', cnrecibo: 'REC-DEMO-0035',
      offset: -1000 * 60 * 45,
    }),
    crearViajeDemo({
      placa: 'YZ901AB', conductor: 'Roberto Mendoza', modelo: 'Kia Picanto', anio: '2019',
      estado: 'FINALIZADA', estadoPoliza: 'ACTIVA', cnpoliza: 'POL-DEMO-0036', cnrecibo: 'REC-DEMO-0036',
      offset: -1000 * 60 * 25,
    }),
    crearViajeDemo({
      placa: 'CD234EF', conductor: 'Sofía Ramírez', modelo: 'Toyota Yaris', anio: '2021',
      estado: 'EN_CURSO', estadoPoliza: 'ACTIVA', cnpoliza: 'POL-DEMO-0037', cnrecibo: 'REC-DEMO-0037',
      offset: -1000 * 60 * 8,
    }),
    // Un viaje con error para que el monitor muestre actividad
    {
      ...crearViajeDemo({
        placa: 'GH567IK', conductor: 'Pedro Ramos', modelo: 'Suzuki Swift', anio: '2017',
        estado: 'EN_CURSO', estadoPoliza: 'EMITIENDO',
        offset: -1000 * 60 * 18,
      }),
      polizaError: 'Timeout al consultar API de aseguradora — se reintentará automáticamente',
      webhookEnviado: false,
      webhookIntentos: 2,
    } as DemoViaje & { polizaError?: string },
  ];
}

function crearViajeDemo(p: {
  placa: string; conductor: string; modelo: string; anio: string;
  estado: string; estadoPoliza?: string; cnpoliza?: string; cnrecibo?: string;
  offset: number;
}): DemoViaje {
  const id = 'demo-' + Math.random().toString(36).slice(2, 10);
  return {
    id, tenantId: DEMO_TENANT_ID,
    numeroPlaca: p.placa, nombreConductor: p.conductor,
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
  };
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

    polizaCounter += 1;
    const cnpoliza = `POL-DEMO-${String(polizaCounter).padStart(4, '0')}`;
    const cnrecibo = `REC-DEMO-${String(polizaCounter).padStart(4, '0')}`;

    const v = crearViajeDemo({
      placa, conductor: fullName,
      modelo, anio,
      estado: 'EN_CURSO', estadoPoliza: 'ACTIVA',
      cnpoliza, cnrecibo,
      offset: 0,
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
    return {
      id, nombre, apiKey,
      estado: 'ACTIVO',
      createdAt: new Date().toISOString(),
      message: 'Cliente creado (modo demo). En producción esta clave es única e irrepetible.',
    };
  }

  if (method === 'get' && path === 'admin/tenants') {
    return [
      { id: DEMO_TENANT_ID, nombre: DEMO_TENANT_NOMBRE, estado: 'ACTIVO', createdAt: new Date().toISOString() },
    ];
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
  const conductores = [
    { n: 'Daniel', a: 'Castro', placa: 'GH456IJ', modelo: 'Toyota Corolla', anio: 2022, color: 'Blanco' },
    { n: 'Andrea', a: 'Vargas', placa: 'KL789MN', modelo: 'Hyundai i10', anio: 2021, color: 'Rojo' },
    { n: 'Miguel', a: 'Torres', placa: 'OP012QR', modelo: 'Chevrolet Spark', anio: 2020, color: 'Azul' },
    { n: 'Valeria', a: 'Sánchez', placa: 'ST345UV', modelo: 'Ford EcoSport', anio: 2023, color: 'Gris' },
    { n: 'Eduardo', a: 'Romero', placa: 'WX678YZ', modelo: 'Renault Kwid', anio: 2022, color: 'Negro' },
  ];
  const c = conductores[Math.floor(Math.random() * conductores.length)];
  const cedula = String(20000000 + Math.floor(Math.random() * 9999999));
  return {
    placa: c.placa,
    fano: c.anio,
    cmarca: '083',
    cmodelo: '001',
    cversion: '03',
    color: c.color,
    serial_carroceria: 'SC1S6ZMV3024' + Math.floor(100 + Math.random() * 899),
    ccategoria_uso: 11,
    ntoneladas: 0,
    nombre_tomador: c.n,
    apellido_tomador: c.a,
    rif_tomador: cedula,
    tipo_cedula_tomador: 'V',
    fnac_tomador: '1990-05-15',
    telefono_tomador: '+58424' + Math.floor(1000000 + Math.random() * 8999999),
    correo_tomador: `${c.n.toLowerCase()}.${c.a.toLowerCase()}@demo.com`,
    estado_tomador: 1,
    ciudad_tomador: 128,
    direccion_tomador: 'Av. Principal, Caracas',
    sexo_tomador: 'M',
    estado_civil_tomador: 'S',
    modeloVehiculo: c.modelo,
    anioVehiculo: String(c.anio),
    nombreConductor: `${c.n} ${c.a}`,
    latInicio: 10.4806,
    lngInicio: -66.9036,
    latDestino: 10.4906,
    lngDestino: -66.8936,
  };
}
