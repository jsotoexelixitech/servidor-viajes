# CONTEXT.md — Ridery Insurance Middleware
> Archivo de contexto para recuperar el estado completo del proyecto entre sesiones.
> Última actualización: 2026-04-21

---

## 1. QUÉ ES ESTE PROYECTO

Middleware multi-tenant para emitir pólizas RCV (Responsabilidad Civil de Vehículos) de forma automática cuando un conductor inicia un viaje en una plataforma de ride-hailing (inicialmente Ridery, luego comercializado como servicio genérico).

**Flujo de negocio:**
1. La empresa (tenant) llama a `POST /api/viaje/iniciar` cuando arranca un viaje.
2. El middleware mapea los campos de la empresa → campos que espera el proveedor de seguros.
3. Llama al proveedor de seguros para emitir la póliza RCV.
4. Si falla, reintenta automáticamente (BullMQ + PolizaGuardian cron).
5. La empresa llama a `POST /api/viaje/finalizar` al terminar el viaje.

**El proveedor de seguros original era "La Mundial de Seguros" pero el servicio está siendo comercializado como genérico.**

---

## 2. STACK TECNOLÓGICO

| Capa | Tecnología |
|------|-----------|
| Backend | NestJS 10 + TypeScript |
| Base de datos | PostgreSQL 16 (TypeORM, JSONB para config) |
| Cola de trabajos | BullMQ sobre Redis 7 |
| Caché / Locks | Redis 7 (ioredis) |
| Cron jobs | `@nestjs/schedule` |
| Rate limiting | `@nestjs/throttler` con Redis |
| Logs | Winston (structured JSON) |
| Frontend | React 18 + Vite 5 + Tailwind CSS v3 |
| Proxy | Nginx 1.27 |
| Procesos | PM2 cluster mode (producción) |
| Contenedores | Docker + Docker Compose |
| Swagger | `@nestjs/swagger` en `/api/docs` |

---

## 3. ESTRUCTURA DEL PROYECTO

```
ridery/
├── backend/
│   ├── .env                              ← Variables de entorno desarrollo
│   ├── src/
│   │   ├── main.ts                       ← Bootstrap, ValidationPipe, cluster PM2
│   │   ├── app.module.ts                 ← Módulo raíz, imports globales
│   │   ├── config/
│   │   │   ├── configuration.ts          ← Config centralizada (pool, redis, etc.)
│   │   │   ├── logger.config.ts          ← Winston config
│   │   │   └── typeorm.config.ts         ← TypeORM + pool adaptivo
│   │   ├── common/
│   │   │   ├── decorators/tenant.decorator.ts      ← @CurrentTenant()
│   │   │   ├── filters/all-exceptions.filter.ts    ← Global exception handler
│   │   │   ├── guards/tenant.guard.ts              ← Autenticación X-Api-Key
│   │   │   ├── interceptors/
│   │   │   │   ├── field-mapping.interceptor.ts    ← Renombra campos empresa→seguro
│   │   │   │   └── logging.interceptor.ts          ← Log req/res
│   │   │   └── redis/redis.module.ts               ← Cliente Redis compartido
│   │   └── modules/
│   │       ├── health/
│   │       │   ├── health.controller.ts            ← GET /api/health
│   │       │   └── health.module.ts
│   │       ├── tenant/
│   │       │   ├── entities/tenant.entity.ts       ← Tabla "tenants" PostgreSQL
│   │       │   ├── dto/
│   │       │   │   ├── crear-tenant.dto.ts
│   │       │   │   └── actualizar-mapeos.dto.ts
│   │       │   ├── tenant.controller.ts            ← Admin + Self endpoints
│   │       │   ├── tenant.service.ts               ← CRUD + caché Redis + configurarSeguro
│   │       │   └── tenant.module.ts
│   │       ├── seguro/
│   │       │   ├── dto/seguro-config.dto.ts        ← SeguroConfigDto, FieldMappingsLaMundialDto, ConfigurarSeguroDto
│   │       │   ├── lamundial.service.ts            ← HTTP client + circuit breaker
│   │       │   ├── seguro.service.ts               ← Orquestación emisión pólizas
│   │       │   ├── poliza-guardian.service.ts      ← Cron cada 5min, rescata pólizas atascadas
│   │       │   └── seguro.module.ts
│   │       └── viaje/
│   │           ├── entities/viaje.entity.ts        ← Tabla "viajes" PostgreSQL
│   │           ├── dto/
│   │           │   ├── iniciar-viaje.dto.ts
│   │           │   ├── finalizar-viaje.dto.ts
│   │           │   └── enviar-viaje.dto.ts
│   │           ├── viaje.controller.ts             ← POST iniciar/finalizar/enviar, GET listar
│   │           ├── viaje.service.ts                ← Lógica + idempotencia + BullMQ
│   │           ├── viaje.webhook.processor.ts      ← BullMQ job processor
│   │           └── viaje.module.ts
├── frontend/
│   ├── src/
│   │   ├── api.ts                        ← Axios client, CAMPOS_SEGURO, viajeApi, tenantApi, adminApi
│   │   ├── App.tsx                       ← UI completa (7 tabs, sidebar, componentes)
│   │   ├── index.css                     ← Tailwind + design tokens + custom components
│   │   └── main.tsx
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── vite.config.ts
├── docker-compose.yml
└── CONTEXT.md                            ← ESTE ARCHIVO
```

---

## 4. VARIABLES DE ENTORNO (backend/.env — desarrollo)

```env
NODE_ENV=development
PORT=3000
APP_PREFIX=api
CORS_ORIGINS=http://localhost:5173,http://localhost:3001

DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=ridery
DB_PASSWORD=ridery_dev_2026
DB_NAME=ridery_db
DB_POOL_SIZE=100

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

THROTTLE_TTL=60000
THROTTLE_LIMIT=100000

LOG_LEVEL=info
QUEUE_CONCURRENCY=10
QUEUE_MAX_JOBS=10000
```

---

## 5. API ENDPOINTS

### Autenticación
Todos los endpoints (excepto `/admin/tenants` y `/health`) requieren header:
```
X-Api-Key: <api_key_del_tenant>
```

### Admin (sin autenticación de tenant — proteger con IP whitelist en producción)
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/admin/tenants` | Crear tenant. Body: `{ nombre, webhookUrl?, webhookSecret? }`. Retorna `apiKey` (solo una vez). |
| GET | `/api/admin/tenants` | Listar todos los tenants (sin apiKeys). |
| POST | `/api/admin/tenants/:id/desactivar` | Desactivar un tenant. |
| GET | `/api/admin/tenants/polizas-criticas` | Panel de pólizas sin emitir. |

### Tenant (requiere X-Api-Key)
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/tenant/me` | Ver config del tenant autenticado. |
| GET | `/api/tenant/me/mapeos` | Ver `seguroConfig`, `fieldMappings`, `defaultValues`, lista de campos. |
| PUT | `/api/tenant/me/seguro` | Guardar `seguroConfig` + `fieldMappings` + `defaultValues`. |

### Viajes (requiere X-Api-Key)
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/viaje/iniciar` | Iniciar viaje. Aplica mapeo, emite póliza, reintentos automáticos. |
| POST | `/api/viaje/finalizar` | Body: `{ idViaje }`. Finaliza y elimina datos temporales. |
| POST | `/api/viaje/enviar` | Body: `{ idViaje, forzarReenvio? }`. Reenvía al webhook externo. |
| GET | `/api/viaje` | Listar viajes activos paginado. Query: `?page=1&limit=50`. |
| GET | `/api/viaje/:id` | Obtener viaje por UUID. |

### Health
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/health` | Estado: DB, memoria, disco, circuit breaker. |

---

## 6. MODELO DE DATOS

### Tabla `tenants`
```typescript
{
  id: uuid (PK),
  nombre: varchar(100) UNIQUE,
  api_key: varchar(128) UNIQUE,
  activo: boolean DEFAULT true,
  webhook_url: varchar(500) nullable,
  webhook_secret: varchar(256) nullable,
  rate_limit: int nullable,
  config: jsonb nullable,   // ← clave: contiene seguroConfig, fieldMappings, defaultValues
  creado_en: timestamp,
  actualizado_en: timestamp
}
```

#### Estructura del campo `config` (JSONB):
```json
{
  "seguroConfig": {
    "baseUrl": "https://api.aseguradora.com",
    "authToken": "Bearer xxx",
    "cramo": 18,
    "plan": "RCVBAS",
    "frecuencia": "A",
    "productor": 80080,
    "cusuario": "25221952"
  },
  "fieldMappings": {
    "placa": "vehiculo_placa",
    "nombre_tomador": "conductor_nombre",
    "rif_tomador": "cedula"
  },
  "defaultValues": {
    "color": "Negro",
    "ccategoria_uso": 11,
    "tipo_cedula_tomador": "V",
    "sexo_tomador": "M",
    "estado_civil_tomador": "S",
    "ntoneladas": 0
  }
}
```

### Tabla `viajes`
```typescript
{
  id: uuid (PK),
  tenant_id: uuid (FK → tenants),
  numero_placa: varchar,
  nombre_conductor: varchar,
  modelo_vehiculo: varchar,
  anio_vehiculo: varchar,
  lat_inicio / lng_inicio / lat_destino / lng_destino: decimal,
  estado: enum('INICIADO', 'FINALIZADO'),
  cnpoliza: varchar nullable,        // número de póliza emitida
  cnrecibo: varchar nullable,
  url_poliza_pdf: varchar nullable,
  estado_poliza: enum('PENDIENTE', 'EMITIENDO', 'EMITIDA', 'ERROR', 'CRITICO'),
  poliza_error: text nullable,
  poliza_intentos: int DEFAULT 0,
  poliza_ultimo_intento: timestamp nullable,
  webhook_enviado: boolean DEFAULT false,
  webhook_intentos: int DEFAULT 0,
  webhook_ultimo_error: text nullable,
  metadata: jsonb,                   // bodyOriginal mapeado + idempotencyKey
  creado_en: timestamp,
  actualizado_en: timestamp,
  finalizado_en: timestamp nullable
}
```

---

## 7. MECANISMOS DE FIABILIDAD (implementados en Día 1)

### 7.1 Circuit Breaker (Redis distribuido)
- Archivo: `backend/src/modules/seguro/lamundial.service.ts`
- Estados: `CLOSED` → `OPEN` (después de N fallos) → `HALF_OPEN` (prueba recuperación)
- Compartido entre workers via Redis (`cb:lamundial:*` keys)
- Si Redis falla: el circuit breaker falla abierto (permite peticiones)

### 7.2 Idempotencia
- Archivo: `backend/src/modules/viaje/viaje.service.ts`
- Header opcional: `X-Idempotency-Key`
- Si no se provee: se genera hash SHA-256 del body
- Evita emitir pólizas duplicadas en reintentos

### 7.3 Cola de reintentos (BullMQ)
- Archivo: `backend/src/modules/viaje/viaje.webhook.processor.ts`
- Queue: `viaje-queue`
- Jobs: `reintentar-poliza`, `enviar-webhook`
- Backoff exponencial, máx 5 intentos por BullMQ

### 7.4 PolizaGuardianService (cron de rescate)
- Archivo: `backend/src/modules/seguro/poliza-guardian.service.ts`
- Cron: cada 5 minutos
- Distributed lock Redis (`guardian:poliza:lock`) — solo 1 worker del cluster ejecuta
- Rescata: `estadoPoliza = ERROR`, `CRITICO`, `EMITIENDO` > 5min
- Máximo 50 intentos por viaje antes de marcar como requiere intervención manual
- Endpoint de monitoreo: `GET /api/admin/tenants/polizas-criticas`

### 7.5 Caché de tenants en Redis
- Archivo: `backend/src/modules/tenant/tenant.service.ts`
- TTL: 60 segundos
- Key: `tenant:apikey:<apiKey>`
- Compartida entre todos los workers → cambios de config visibles en ≤60s

### 7.6 Pool de conexiones adaptivo
- Archivo: `backend/src/config/configuration.ts`
- Fórmula: `(PG_MAX_CONNECTIONS - 20) / workers`
- Evita saturar PostgreSQL con múltiples instancias PM2

### 7.7 Health checks
- Endpoint: `GET /api/health`
- Verifica: PostgreSQL, memoria heap, memoria RSS, disco
- También reporta estado del circuit breaker

---

## 8. MAPEO DE CAMPOS — CÓMO FUNCIONA

El `FieldMappingInterceptor` se aplica automáticamente en `POST /api/viaje/iniciar`.

**Configuración (PUT /api/tenant/me/seguro):**
```json
{
  "fieldMappings": {
    "placa": "vehiculo_placa",
    "nombre_tomador": "conductor_nombre",
    "rif_tomador": "cedula"
  }
}
```

**La empresa envía:**
```json
{ "vehiculo_placa": "ABC123", "conductor_nombre": "Juan", "cedula": "12345678" }
```

**Después del interceptor:**
```json
{ "placa": "ABC123", "nombre_tomador": "Juan", "rif_tomador": "12345678" }
```

**Luego se aplican `defaultValues`** para los campos que la empresa no envía.

---

## 9. CAMPOS REQUERIDOS POR EL PROVEEDOR DE SEGUROS

### Vehículo
| Campo interno | Descripción | Ejemplo |
|---------------|-------------|---------|
| `placa` | Placa del vehículo | `AE886C23` |
| `fano` | Año de fabricación | `2020` |
| `cmarca` | Código de marca | `083` |
| `cmodelo` | Código de modelo | `001` |
| `cversion` | Código de versión | `03` |
| `color` | Color | `Negro` |
| `serial_carroceria` | VIN/Serial | `SC1S6ZMV...` |
| `serial_motor` | Serial motor (opcional) | |
| `ccategoria_uso` | Categoría de uso | `11` |
| `ntoneladas` | Toneladas (si aplica) | `0` |

### Tomador/Conductor
| Campo interno | Descripción | Ejemplo |
|---------------|-------------|---------|
| `nombre_tomador` | Nombre | `Juan` |
| `apellido_tomador` | Apellido | `Pérez` |
| `rif_tomador` | Cédula/RIF | `25221952` |
| `tipo_cedula_tomador` | V=Venezolano, E=Extranjero | `V` |
| `fnac_tomador` | Fecha nacimiento YYYY-MM-DD | `1990-10-13` |
| `telefono_tomador` | Teléfono | `+584241829583` |
| `correo_tomador` | Email | `juan@mail.com` |
| `estado_tomador` | Código estado | `1` |
| `ciudad_tomador` | Código ciudad | `128` |
| `direccion_tomador` | Dirección | `Av. Principal...` |
| `sexo_tomador` | M/F | `M` |
| `estado_civil_tomador` | S=Soltero, C=Casado... | `S` |

### Internos del sistema (no van al seguro)
| Campo | Descripción |
|-------|-------------|
| `latInicio`, `lngInicio` | Coordenadas de inicio |
| `latDestino`, `lngDestino` | Coordenadas de destino |
| `nombreConductor` | Nombre para registros internos |

---

## 10. FRONTEND — TABS Y FUNCIONALIDADES

La app React en `frontend/src/App.tsx` tiene 7 tabs:

| Tab ID | Nombre | Requiere API Key | Descripción |
|--------|--------|-----------------|-------------|
| `dashboard` | Dashboard | No | KPIs, estado conexión, accesos rápidos |
| `setup` | Nuevo Cliente | No | Crear tenant, obtener API Key |
| `mapeo` | Configuración | Sí | seguroConfig + fieldMappings + defaultValues |
| `viaje` | Iniciar Viaje | Sí | POST /viaje/iniciar con JSON editor |
| `finalizar` | Finalizar | Sí | POST /viaje/finalizar por ID |
| `listar` | Viajes | Sí | Tabla paginada de viajes activos |
| `monitor` | Monitor | Sí | Panel de pólizas críticas con auto-refresh |

**Componentes clave en App.tsx:**
- `JsonBox` — display JSON con syntax highlighting
- `CopyButton` — copia al portapapeles con feedback
- `Spinner`, `EmptyState`, `SectionCard`, `FieldRow`
- `ResponsePanel` — muestra respuestas API con estado
- `PageHeader` — cabecera de sección con ícono y descripción
- `NAV_REQUIRES_KEY` — Set de tabs que requieren API Key para navegar

**API client (`frontend/src/api.ts`):**
```typescript
viajeApi.iniciar(data)          // POST /viaje/iniciar
viajeApi.finalizar(idViaje)     // POST /viaje/finalizar { idViaje }
viajeApi.enviar(idViaje)        // POST /viaje/enviar { idViaje }
viajeApi.listar(page, limit)    // GET /viaje?page=&limit=

adminApi.crear(data)            // POST /admin/tenants
adminApi.listar()               // GET /admin/tenants
adminApi.polizasCriticas()      // GET /admin/tenants/polizas-criticas

tenantApi.obtenerSeguro()       // GET /tenant/me/mapeos
tenantApi.configurarSeguro(data)// PUT /tenant/me/seguro
```

---

## 11. BUGS ENCONTRADOS Y CORREGIDOS (historial completo)

### Backend
| # | Archivo | Bug | Fix |
|---|---------|-----|-----|
| B1 | `seguro-config.dto.ts` | `seguroConfig` nunca se persistía en DB. ValidationPipe con `whitelist:true` descartaba el objeto anidado porque faltaban `@ValidateNested()` + `@Type(() => SeguroConfigDto)`. | Agregado `@ValidateNested()` y `@Type()` a los tres campos de `ConfigurarSeguroDto`. |
| B2 | `tenant.service.ts` | TypeORM no detectaba cambios en JSONB al usar `.save()`. | Cambiado a `.update()` con `JSON.parse(JSON.stringify(newConfig))` para forzar detección. |

### Frontend
| # | Archivo | Bug | Fix |
|---|---------|-----|-----|
| F1 | `App.tsx` | `React.ReactNode` usado sin `import React` → pantalla en blanco. | Agregado `React` al import principal. |
| F2 | Dev server | Servidor Vite obsoleto no reflejaba cambios. | Matar proceso e iniciar limpio. |
| F3 | `index.css` | `bg-[url(...)]` en `@apply` → error PostCSS. | Movido a CSS puro fuera del `@apply`. |
| F4 | `App.tsx` | Botón "Ir →" navegaba a tabs protegidos sin API Key. | Agregado `NAV_REQUIRES_KEY` Set y validación en `navTo()`. |
| F5 | `App.tsx` | `JSON.parse` no capturaba errores en `handleIniciar`. | Movido a `try/catch` propio antes de `doRequest`. |
| F6 | `App.tsx` | `loadMonitor` llamaba API sin API Key configurada. | Agregado `if (!apiKeySet) return` al inicio de `loadMonitor`. |

---

## 12. COMANDOS ÚTILES

```powershell
# Arrancar backend (desarrollo con hot-reload)
cd backend && npm run start:dev

# Arrancar frontend (desarrollo)
cd frontend && npm run dev

# Verificar compilación sin ejecutar
cd backend && npx tsc --noEmit
cd frontend && npx tsc --noEmit

# Build producción frontend
cd frontend && npm run build

# Docker completo
docker-compose up -d

# Ver logs backend en tiempo real
docker-compose logs -f backend

# Test rápido de API
$key = "<API_KEY_DEL_TENANT>"
$h = @{"X-Api-Key"=$key; "Content-Type"="application/json"}
Invoke-RestMethod "http://localhost:3000/api/health"
Invoke-RestMethod "http://localhost:3000/api/tenant/me" -Headers $h
```

---

## 13. DATOS DE PRUEBA — FLUJO COMPLETO

### Paso 1: Crear tenant
```powershell
Invoke-RestMethod "http://localhost:3000/api/admin/tenants" -Method POST `
  -ContentType "application/json" `
  -Body '{"nombre":"MiEmpresa","webhookUrl":"https://webhook.site/test"}'
# Guardar el apiKey retornado
```

### Paso 2: Configurar seguro + mapeos
```powershell
$h = @{"X-Api-Key"=$key; "Content-Type"="application/json"}
$body = '{
  "seguroConfig": {
    "baseUrl": "https://api.aseguradora.com",
    "authToken": "Bearer TOKEN_REAL",
    "cramo": 18,
    "plan": "RCVBAS",
    "frecuencia": "A",
    "productor": 80080
  },
  "fieldMappings": {
    "placa": "vehiculo_placa",
    "nombre_tomador": "conductor_nombre",
    "rif_tomador": "cedula"
  },
  "defaultValues": {
    "color": "Negro",
    "ccategoria_uso": 11,
    "tipo_cedula_tomador": "V",
    "sexo_tomador": "M",
    "estado_civil_tomador": "S",
    "ntoneladas": 0
  }
}'
Invoke-RestMethod "http://localhost:3000/api/tenant/me/seguro" -Method PUT -Headers $h -Body $body
```

### Paso 3: Iniciar viaje (con nombres mapeados)
```json
{
  "vehiculo_placa": "ABC123",
  "conductor_nombre": "Juan",
  "cedula": "12345678",
  "apellido_tomador": "Pérez",
  "fnac_tomador": "1990-03-15",
  "telefono_tomador": "+584141234567",
  "correo_tomador": "juan@test.com",
  "fano": 2022,
  "cmarca": "083",
  "cmodelo": "001",
  "cversion": "03",
  "serial_carroceria": "VIN123456789TEST01",
  "estado_tomador": 1,
  "ciudad_tomador": 128,
  "direccion_tomador": "Av. Principal, Caracas",
  "latInicio": 10.4806,
  "lngInicio": -66.9036,
  "latDestino": 10.4906,
  "lngDestino": -66.8936,
  "modeloVehiculo": "Corolla",
  "anioVehiculo": "2022",
  "nombreConductor": "Juan Pérez"
}
```

### Paso 4: Finalizar viaje
```json
POST /api/viaje/finalizar
{ "idViaje": "<UUID_DEL_VIAJE>" }
```

---

## 14. PUERTOS EN USO (desarrollo local)

| Servicio | Puerto |
|----------|--------|
| Backend NestJS | 3000 |
| Frontend Vite (dev) | 5173 o 5174 si 5173 ocupado |
| PostgreSQL | 5432 |
| Redis | 6379 |
| Swagger UI | http://localhost:3000/api/docs |

---

## 15. PENDIENTES / PRÓXIMOS PASOS

- [ ] Probar con URL real del proveedor de seguros (cuando se tenga acceso)
- [ ] Configurar autenticación en rutas `/admin/tenants` (IP whitelist o token admin separado)
- [ ] Añadir `GET /viaje/:id` en la UI del frontend (tab Listar)
- [ ] Exportar viajes a CSV desde el frontend
- [ ] Configurar alertas automáticas cuando `polizas-criticas` retorne `total > 0`
- [ ] Tests E2E con URL real del seguro
- [ ] Limpiar comentarios que todavía mencionan "La Mundial" en archivos de producción

---

## 16. NOTAS IMPORTANTES

1. **`tenant.config` es JSONB en PostgreSQL.** TypeORM no detecta mutaciones en objetos anidados con `.save()`. Siempre usar `.update()` con `JSON.parse(JSON.stringify(obj))` para forzar el write.

2. **`ConfigurarSeguroDto` requiere `@ValidateNested()` + `@Type()`** en todos los campos objetos. Sin esto, `ValidationPipe` con `whitelist:true` descarta los objetos anidados silenciosamente.

3. **El caché de tenant en Redis tiene TTL de 60s.** Después de un PUT de configuración, se invalida manualmente. Pero si Redis está caído y el caché expiró, la próxima lectura va directo a BD.

4. **El circuit breaker falla abierto** si Redis no está disponible (permite peticiones).

5. **`POST /api/viaje/finalizar`** recibe `{ idViaje }` en el body, NO en la URL. Es `POST /viaje/finalizar`, no `POST /viaje/:id/finalizar`.

6. **Las rutas de pólizas críticas son `GET /api/admin/tenants/polizas-criticas`**, no `/admin/polizas-criticas`.
