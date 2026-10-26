import axios from 'axios';
import { installDemoInterceptor } from './demo';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
});

installDemoInterceptor(api);

/**
 * Establece el session token en memoria (axios defaults).
 * NUNCA se guarda en localStorage ni sessionStorage.
 * Al cerrar la pestaña o recargar, se pierde — el usuario debe reconectarse.
 */
export function setSessionToken(token: string) {
  api.defaults.headers.common['X-Session-Token'] = token;
  delete api.defaults.headers.common['X-Api-Key'];
}

/** Limpia la sesión (logout). */
export function clearSession() {
  delete api.defaults.headers.common['X-Session-Token'];
  delete api.defaults.headers.common['X-Api-Key'];
}

/** Solo para el primer login — envía la API key UNA vez al endpoint de sesión. */
function buildLoginClient() {
  const c = axios.create({
    baseURL: BASE_URL,
    timeout: 10000,
    headers: { 'Content-Type': 'application/json' },
  });
  installDemoInterceptor(c);
  return c;
}

const adminClient = axios.create({ baseURL: BASE_URL, timeout: 15000 });
installDemoInterceptor(adminClient);

export const authApi = {
  /**
   * Intercambia la API Key por un session token.
   * La API key viaja en este único request y nunca se almacena.
   */
  login: (apiKey: string) =>
    buildLoginClient().post<{ sessionToken: string; expiresAt: string; tenant: { id: string; nombre: string } }>(
      '/auth/session',
      {},
      { headers: { 'X-Api-Key': apiKey } },
    ),
  /** SSO desde Nexus: el nexus_token de la URL se cambia por un session token (sin API key). */
  nexus: (nexusToken: string) =>
    buildLoginClient().post<{
      sessionToken: string; expiresAt: string; tenant: { id: string; nombre: string };
      nexus: { empresaId: number; empresaNombre: string | null; submoduloId: number; metadata: Record<string, unknown> };
    }>('/auth/nexus', { nexus_token: nexusToken }),
};

export interface Viaje {
  id: string; tenantId: string; numeroPlaca: string; nombreConductor: string;
  modeloVehiculo: string; anioVehiculo: string;
  latInicio: number; lngInicio: number; latDestino: number; lngDestino: number;
  estado: string;
  cnpoliza?: string; cnrecibo?: string; urlPolizaPDF?: string;
  estadoPoliza?: string; polizaError?: string;
  webhookEnviado: boolean; webhookIntentos: number; creadoEn: string;
  metadata?: Record<string, unknown>;
  conductorId?: string | null;
  planPoliza?: string;
  prima?: number;
  primaExt?: number;
  comision?: number;
}

export interface Conductor {
  id: string;
  tenantId: string;
  nombre: string;
  apellido?: string;
  cedula: string;
  telefono?: string;
  email?: string;
  porcentajeComision: number;
  estado: 'ACTIVO' | 'INACTIVO' | 'SUSPENDIDO';
  creadoEn: string;
}

export interface DashboardKpis {
  totalViajes: number;
  viajesActivos: number;
  viajesFinalizados: number;
  polizasActivas: number;
  recibos: number;
  primaTotal: number;
  primaTotalExt: number;
  comisionTotal: number;
  ticketPromedio: number;
}

export interface KpisGlobales extends DashboardKpis {
  totalTenants: number;
  totalConductores: number;
}

export interface RankingConductor {
  conductorId: string | null;
  nombre: string;
  cedula: string;
  totalViajes: number;
  viajesActivos: number;
  primaGenerada: number;
  comisionGenerada: number;
}

export interface CarteraCliente {
  id: string;
  nombre: string;
  activo: boolean;
  creadoEn: string;
  totalViajes: number;
  viajesActivos: number;
  primaTotal: number;
  comisionTotal: number;
}

/**
 * CampoSeguro — campos requeridos por el proveedor de seguros (genérico).
 * No se expone el nombre del proveedor en la UI.
 */
export interface CampoSeguro {
  key: string;
  label: string;
  descripcion: string;
  ejemplo: string;
  requerido: boolean;
  tipo: 'texto' | 'numero' | 'fecha' | 'interno';
  grupo: 'vehiculo' | 'tomador' | 'interno';
}

export const CAMPOS_SEGURO: CampoSeguro[] = [
  // Vehículo
  { key: 'placa',               label: 'Placa',               descripcion: 'Placa del vehículo',                  ejemplo: 'AE886C23',       requerido: true,  tipo: 'texto',  grupo: 'vehiculo' },
  { key: 'fano',                label: 'Año',                 descripcion: 'Año de fabricación',                  ejemplo: '2020',           requerido: true,  tipo: 'numero', grupo: 'vehiculo' },
  { key: 'cmarca',              label: 'Código Marca',        descripcion: 'Código de marca del vehículo (catálogo INMA)',  ejemplo: '074',  requerido: true,  tipo: 'texto',  grupo: 'vehiculo' },
  { key: 'cmodelo',             label: 'Código Modelo',       descripcion: 'Código de modelo del vehículo (catálogo INMA)', ejemplo: '005',  requerido: true,  tipo: 'texto',  grupo: 'vehiculo' },
  { key: 'cversion',            label: 'Código Versión',      descripcion: 'Código de versión del vehículo (catálogo INMA)',ejemplo: '05',   requerido: true,  tipo: 'texto',  grupo: 'vehiculo' },
  { key: 'color',               label: 'Color',               descripcion: 'Color del vehículo',                  ejemplo: 'Negro',          requerido: true,  tipo: 'texto',  grupo: 'vehiculo' },
  { key: 'serial_carroceria',   label: 'Serial Carrocería',   descripcion: 'Serial de carrocería (VIN)',          ejemplo: 'SC1S6ZMV...',    requerido: true,  tipo: 'texto',  grupo: 'vehiculo' },
  { key: 'serial_motor',        label: 'Serial Motor',        descripcion: 'Serial del motor (opcional)',         ejemplo: '',               requerido: false, tipo: 'texto',  grupo: 'vehiculo' },
  { key: 'ccategoria_uso',      label: 'Categoría de Uso',    descripcion: 'Código de categoría de uso',          ejemplo: '11',             requerido: true,  tipo: 'numero', grupo: 'vehiculo' },
  { key: 'ntoneladas',          label: 'Toneladas',           descripcion: 'Número de toneladas (si aplica)',     ejemplo: '0',              requerido: false, tipo: 'numero', grupo: 'vehiculo' },
  // Tomador
  { key: 'nombre_tomador',      label: 'Nombre',              descripcion: 'Nombre del tomador/conductor',        ejemplo: 'Juan',           requerido: true,  tipo: 'texto',  grupo: 'tomador' },
  { key: 'apellido_tomador',    label: 'Apellido',            descripcion: 'Apellido del tomador',                ejemplo: 'Pérez',          requerido: true,  tipo: 'texto',  grupo: 'tomador' },
  { key: 'rif_tomador',         label: 'Cédula / RIF',        descripcion: 'Cédula o RIF del tomador',            ejemplo: '25221952',       requerido: true,  tipo: 'texto',  grupo: 'tomador' },
  { key: 'tipo_cedula_tomador', label: 'Tipo Cédula',         descripcion: 'V=Venezolano, E=Extranjero',          ejemplo: 'V',              requerido: true,  tipo: 'texto',  grupo: 'tomador' },
  { key: 'fnac_tomador',        label: 'Fecha Nacimiento',    descripcion: 'Fecha de nacimiento (YYYY-MM-DD)',    ejemplo: '1990-10-13',     requerido: true,  tipo: 'fecha',  grupo: 'tomador' },
  { key: 'telefono_tomador',    label: 'Teléfono',            descripcion: 'Teléfono del tomador',                ejemplo: '+584241829583',  requerido: true,  tipo: 'texto',  grupo: 'tomador' },
  { key: 'correo_tomador',      label: 'Correo',              descripcion: 'Correo electrónico del tomador',      ejemplo: 'j@mail.com',     requerido: true,  tipo: 'texto',  grupo: 'tomador' },
  { key: 'estado_tomador',      label: 'Estado (código)',     descripcion: 'Código del estado venezolano',        ejemplo: '1',              requerido: true,  tipo: 'numero', grupo: 'tomador' },
  { key: 'ciudad_tomador',      label: 'Ciudad (código)',     descripcion: 'Código de ciudad',                    ejemplo: '128',            requerido: true,  tipo: 'numero', grupo: 'tomador' },
  { key: 'direccion_tomador',   label: 'Dirección',           descripcion: 'Dirección del tomador',               ejemplo: 'Av. Principal..',requerido: true,  tipo: 'texto',  grupo: 'tomador' },
  { key: 'sexo_tomador',        label: 'Sexo',                descripcion: 'M=Masculino, F=Femenino',             ejemplo: 'M',              requerido: false, tipo: 'texto',  grupo: 'tomador' },
  { key: 'estado_civil_tomador',label: 'Estado Civil',        descripcion: 'S=Soltero, C=Casado...',              ejemplo: 'S',              requerido: false, tipo: 'texto',  grupo: 'tomador' },
  // Internos del sistema
  { key: 'latInicio',           label: 'Lat. Inicio',         descripcion: 'Latitud coordenada de inicio',        ejemplo: '10.4806',        requerido: false, tipo: 'interno', grupo: 'interno' },
  { key: 'lngInicio',           label: 'Lng. Inicio',         descripcion: 'Longitud coordenada de inicio',       ejemplo: '-66.9036',       requerido: false, tipo: 'interno', grupo: 'interno' },
  { key: 'latDestino',          label: 'Lat. Destino',        descripcion: 'Latitud coordenada de destino',       ejemplo: '10.4906',        requerido: false, tipo: 'interno', grupo: 'interno' },
  { key: 'lngDestino',          label: 'Lng. Destino',        descripcion: 'Longitud coordenada de destino',      ejemplo: '-66.8936',       requerido: false, tipo: 'interno', grupo: 'interno' },
  { key: 'nombreConductor',     label: 'Nombre Conductor',    descripcion: 'Para registros internos',             ejemplo: 'Juan Pérez',     requerido: false, tipo: 'interno', grupo: 'interno' },
];

export interface SeguroConfig {
  baseUrl: string;
  authToken?: string;
  cramo: number;
  plan: string;
  frecuencia: string;
  productor?: number;
  cusuario?: string;
}

export interface TenantSeguroConfig {
  seguroConfig?: SeguroConfig;
  fieldMappings?: Record<string, string>;
  defaultValues?: Record<string, string | number>;
}

export const FRECUENCIAS = [
  { v: 'A', l: 'Anual' },
  { v: 'S', l: 'Semestral' },
  { v: 'C', l: 'Cuatrimestral' },
  { v: 'T', l: 'Trimestral' },
  { v: 'M', l: 'Mensual' },
];

export const viajeApi = {
  iniciar:  (data: Record<string, unknown>) => api.post<Viaje>('/viaje/iniciar', data),
  finalizar:(idViaje: string) => api.post('/viaje/finalizar', { idViaje }),
  enviar:   (idViaje: string, forzarReenvio = false) => api.post('/viaje/enviar', { idViaje, forzarReenvio }),
  listar:   (page = 1, limit = 20) => api.get<{ data: Viaje[]; total: number }>(`/viaje?page=${page}&limit=${limit}`),
};

export const adminApi = {
  crear: (data: { nombre: string; webhookUrl?: string; webhookSecret?: string }, adminKey: string) =>
    adminClient.post('/admin/tenants', data, {
      headers: { 'X-Admin-Key': adminKey },
    }),
  listar: (adminKey: string) =>
    adminClient.get('/admin/tenants', {
      headers: { 'X-Admin-Key': adminKey },
    }),
  polizasCriticasAdmin: (adminKey: string) =>
    adminClient.get('/admin/tenants/polizas-criticas', {
      headers: { 'X-Admin-Key': adminKey },
    }),
};

export const tenantApi = {
  obtenerSeguro:   () => api.get<TenantSeguroConfig>('/tenant/me/mapeos'),
  configurarSeguro:(data: {
    seguroConfig: SeguroConfig;
    fieldMappings?: Record<string, string>;
    defaultValues?: Record<string, string | number>;
  }) => api.put('/tenant/me/seguro', data),
  /**
   * Panel de monitor para el tenant autenticado.
   * Devuelve SOLO las pólizas de su propio tenant — nunca datos de otros.
   */
  misPolizasCriticas: () => api.get('/viaje/mis-polizas-criticas'),
};

// ── Catálogo INMA & Cotización ─────────────────────────────────────────────

export interface CatalogoMarca    { cmarca: string; xmarca: string; }
export interface CatalogoModelo   { cmodelo: string; xmodelo: string; }
export interface CatalogoVersion  { cversion: string; xversion: string; }
export interface CotizacionResult { mprima: string; mprimaext: string; ptasa: number; }

export const seguroCatalogoApi = {
  anios: () =>
    api.get<{ min: number; max: number }>('/seguro/catalogo/anios'),
  marcas: (fano: number) =>
    api.get<CatalogoMarca[]>(`/seguro/catalogo/marcas?fano=${fano}`),
  modelos: (fano: number, cmarca: string) =>
    api.get<CatalogoModelo[]>(`/seguro/catalogo/modelos?fano=${fano}&cmarca=${cmarca}`),
  versiones: (fano: number, cmarca: string, cmodelo: string) =>
    api.get<CatalogoVersion[]>(`/seguro/catalogo/versiones?fano=${fano}&cmarca=${cmarca}&cmodelo=${cmodelo}`),
  cotizar: (params: {
    cmarca: string; cmodelo: string; cversion: string;
    fano: number; cplan: string; ccategoria_uso: number;
  }) => api.post<CotizacionResult>('/seguro/cotizar', params),
};

export const conductorApi = {
  listar:   (soloActivos = false) =>
    api.get<Conductor[]>(`/conductores?soloActivos=${soloActivos}`),
  crear:    (data: Omit<Conductor, 'id' | 'tenantId' | 'creadoEn'>) =>
    api.post<Conductor>('/conductores', data),
  actualizar: (id: string, data: Partial<Conductor>) =>
    api.put<Conductor>(`/conductores/${id}`, data),
  eliminar: (id: string) => api.delete(`/conductores/${id}`),
};

export type RangoTemporal = 'hoy' | '7d' | '30d' | 'mes' | 'todo';
const rq = (rango?: RangoTemporal) => (rango && rango !== 'todo' ? `&rango=${rango}` : '');
const rqFirst = (rango?: RangoTemporal) => (rango && rango !== 'todo' ? `?rango=${rango}` : '');

export const dashboardApi = {
  kpis: (rango?: RangoTemporal) =>
    api.get<DashboardKpis>(`/dashboard/kpis${rqFirst(rango)}`),
  ranking: (metrica: 'viajes' | 'prima' | 'comision' = 'prima', limit = 10, rango?: RangoTemporal) =>
    api.get<RankingConductor[]>(`/dashboard/conductores/ranking?metrica=${metrica}&limit=${limit}${rq(rango)}`),
  enCurso: (rango?: RangoTemporal) =>
    api.get<RankingConductor[]>(`/dashboard/conductores/en-curso${rqFirst(rango)}`),
  global: (adminKey: string, rango?: RangoTemporal) =>
    adminClient.get<KpisGlobales>(`/dashboard/admin/global${rqFirst(rango)}`, {
      headers: { 'X-Admin-Key': adminKey },
    }),
  cartera: (adminKey: string, rango?: RangoTemporal) =>
    adminClient.get<CarteraCliente[]>(`/dashboard/admin/cartera${rqFirst(rango)}`, {
      headers: { 'X-Admin-Key': adminKey },
    }),

  // ── Drill-down: dashboard de un tenant específico (admin) ─────────────────
  kpisDeTenant: (adminKey: string, tenantId: string, rango?: RangoTemporal) =>
    adminClient.get<DashboardKpis>(`/dashboard/admin/tenants/${tenantId}/kpis${rqFirst(rango)}`, {
      headers: { 'X-Admin-Key': adminKey },
    }),
  rankingDeTenant: (
    adminKey: string,
    tenantId: string,
    metrica: 'viajes' | 'prima' | 'comision' = 'prima',
    limit = 10,
    rango?: RangoTemporal,
  ) =>
    adminClient.get<RankingConductor[]>(
      `/dashboard/admin/tenants/${tenantId}/conductores/ranking?metrica=${metrica}&limit=${limit}${rq(rango)}`,
      { headers: { 'X-Admin-Key': adminKey } },
    ),
  enCursoDeTenant: (adminKey: string, tenantId: string, rango?: RangoTemporal) =>
    adminClient.get<RankingConductor[]>(
      `/dashboard/admin/tenants/${tenantId}/conductores/en-curso${rqFirst(rango)}`,
      { headers: { 'X-Admin-Key': adminKey } },
    ),
};

// ─── Flota por uso (Ridery): viajes, cobro por tiempo/km y cierre mensual ────
export type ModalidadCobro = 'TIEMPO' | 'KM';
export type ModoCierre = 'MANUAL' | 'AUTO';

export interface FlotaConfig {
  id?: string;
  cnpoliza: string;
  cplan: string | null;
  modalidad: ModalidadCobro;
  tarifa: string | number;
  moneda: string;
  minimoPorViaje: string | number;
  redondearUnidad: boolean;
  modoCierre: ModoCierre;
  diaCierre: number;
  creadoPor?: string | null;
  creadoEn?: string;
}

export interface FlotaViaje {
  id: string;
  idExterno: string;
  placa: string;
  conductorDoc: string | null;
  conductorNombre: string | null;
  estado: 'INICIADO' | 'FINALIZADO' | 'CANCELADO';
  inicio: string;
  fin: string | null;
  km: string | null;
  minutos: string | null;
  costo: string | null;
  moneda: string | null;
  simulado: boolean;
  origen: { direccion?: string } | null;
  destino: { direccion?: string } | null;
}

export interface FlotaConductorResumen {
  conductorDoc: string | null;
  conductorNombre: string;
  placas: string[];
  viajes: number;
  km: number;
  minutos: number;
  costo: number;
  participacion: number;
}

export interface FlotaResumen {
  periodo: string;
  desde: string;
  hasta: string;
  cnpoliza: string;
  moneda: string;
  totalViajes: number;
  totalKm: number;
  totalMinutos: number;
  totalMonto: number;
  enCurso: number;
  cancelados?: number;
  conductoresActivos?: number;
  promedioViaje?: number;
  diasMes?: number;
  diasTranscurridos?: number;
  porDia?: { dia: string; viajes: number; monto: number; km: number; minutos: number }[];
  conductores: FlotaConductorResumen[];
}

export interface FlotaCierre {
  id: string;
  cnpoliza: string;
  periodo: string;
  desde: string;
  hasta: string;
  totalViajes: number;
  totalKm: string;
  totalMinutos: string;
  monto: string;
  moneda: string;
  estado: 'BORRADOR' | 'RECIBO_GENERADO' | 'RECIBO_SIMULADO' | 'ERROR';
  cnrecibo: string | null;
  respuesta: Record<string, unknown> | null;
  error: string | null;
  generadoEn: string | null;
}

export const flotaApi = {
  config: () => api.get<FlotaConfig>('/flota/config'),
  historialConfig: () => api.get<FlotaConfig[]>('/flota/config/historial'),
  guardarConfig: (data: Omit<FlotaConfig, 'id' | 'creadoPor' | 'creadoEn'>) =>
    api.put<FlotaConfig>('/flota/config', data),
  feed: (limit = 50, estado?: string) =>
    api.get<FlotaViaje[]>(`/flota/viajes?limit=${limit}${estado ? `&estado=${estado}` : ''}`),
  resumen: (periodo: string) => api.get<FlotaResumen>(`/flota/resumen?periodo=${periodo}`),
  simular: (data: { cantidad?: number; periodo?: string; conductores?: number; enCurso?: number }) =>
    api.post<{ periodo: string; finalizados: number; enCurso: number; conductores: number }>('/flota/simular', data),
  borrarSimulados: () => api.delete<{ borrados: number }>('/flota/simulados'),
  cierres: () => api.get<FlotaCierre[]>('/flota/cierres'),
  calcularCierre: (periodo: string) => api.post<FlotaCierre>('/flota/cierres', { periodo }),
  detalleCierre: (id: string) =>
    api.get<{ cierre: FlotaCierre; resumen: FlotaResumen }>(`/flota/cierres/${id}`),
  generarRecibo: (id: string, modo: 'SIMULADO' | 'REAL' = 'SIMULADO') =>
    api.post<FlotaCierre>(`/flota/cierres/${id}/recibo`, { modo }),
};
