# Exelixi API — Servidor de Pólizas RCV para Plataformas de Transporte

<p align="center">
  <!-- Backend -->
  <img src="https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white" alt="NestJS"/>
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js"/>
  <!-- Frontend -->
  <img src="https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React"/>
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite"/>
  <img src="https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind CSS"/>
  <!-- Infraestructura -->
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL"/>
  <img src="https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis"/>
  <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker"/>
  <img src="https://img.shields.io/badge/PM2-2B037A?style=for-the-badge&logo=pm2&logoColor=white" alt="PM2"/>
  <!-- Estado y licencia -->
  <img src="https://img.shields.io/badge/versión-2.0.0-blue?style=for-the-badge" alt="Versión"/>
  <img src="https://img.shields.io/badge/licencia-Propietaria-red?style=for-the-badge" alt="Licencia Propietaria"/>
  <img src="https://img.shields.io/badge/estado-Producción_lista-brightgreen?style=for-the-badge" alt="Estado"/>
</p>

> **ExelixiTech** · Soluciones tecnológicas para el sector transporte y seguros  
> Versión 2.0 · Abril 2026  
> Repositorio privado — acceso restringido · © 2026 ExelixiTech — Todos los derechos reservados

---

## Descripción

**Exelixi API** es un middleware **multi-tenant** de alta disponibilidad diseñado para plataformas de transporte y ride-hailing que necesitan emitir automáticamente pólizas de **Responsabilidad Civil de Vehículos (RCV)** en el momento de iniciar un viaje.

El sistema actúa como intermediario inteligente entre la plataforma del cliente y el proveedor de seguros, abstraendo completamente la integración, los reintentos, el monitoreo y la tolerancia a fallos.

### Características principales

| Categoría | Detalle |
|-----------|---------|
| **Multi-tenant** | Cada cliente opera con datos completamente aislados — una API Key compromete solo su tenant |
| **Seguridad** | Tokens de sesión HMAC stateless, Admin Key para panel de operador, headers CORS explícitos |
| **Mapeo configurable** | Cada tenant define cómo sus campos se traducen a los campos del proveedor |
| **Alta disponibilidad** | Circuit breaker Redis, BullMQ con backoff exponencial, cron guardian de rescate |
| **Idempotencia** | Header `X-Idempotency-Key` o hash SHA-256 automático — sin pólizas duplicadas |
| **Panel de administración** | Frontend React con notificaciones en tiempo real, monitor de pólizas por tenant |
| **Producción lista** | PM2 cluster, Nginx, Docker Compose, logs JSON estructurados, validación de entorno al arranque |

---

## Stack tecnológico

<p align="center">
  <img src="https://img.shields.io/badge/NestJS-E0234E?style=flat-square&logo=nestjs&logoColor=white"/>
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white"/>
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white"/>
  <img src="https://img.shields.io/badge/Redis-DC382D?style=flat-square&logo=redis&logoColor=white"/>
  <img src="https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=black"/>
  <img src="https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white"/>
  <img src="https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white"/>
  <img src="https://img.shields.io/badge/PM2-2B037A?style=flat-square&logo=pm2&logoColor=white"/>
  <img src="https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=node.js&logoColor=white"/>
  <img src="https://img.shields.io/badge/Swagger-85EA2D?style=flat-square&logo=swagger&logoColor=black"/>
  <img src="https://img.shields.io/badge/BullMQ-FF6B6B?style=flat-square&logo=redis&logoColor=white"/>
  <img src="https://img.shields.io/badge/Nginx-009639?style=flat-square&logo=nginx&logoColor=white"/>
</p>

### Backend

| Tecnología | Versión | Rol |
|------------|---------|-----|
| **NestJS** | 10 | Framework principal — módulos, guards, interceptors, pipes |
| **TypeScript** | 5 | Lenguaje — tipado estricto en toda la base de código |
| **PostgreSQL** | 16 | Persistencia principal — TypeORM con JSONB para configuraciones |
| **Redis** | 7 | Colas BullMQ, circuit breaker distribuido, caché de tenants |
| **BullMQ / Bull** | 4 | Cola de trabajos con reintentos exponenciales para pólizas fallidas |
| **ioredis** | 5 | Cliente Redis compartido — circuit breaker, distributed locks |
| **Winston** | 3 | Logs JSON estructurados con rotación diaria |
| **@nestjs/schedule** | — | Cron jobs — PolizaGuardian escanea cada 5 minutos |
| **@nestjs/throttler** | — | Rate limiting global por IP |
| **@nestjs/terminus** | — | Health checks de DB, heap, RSS y disco |
| **Swagger / OpenAPI** | 3 | Documentación interactiva en `/api/docs` |
| **Helmet** | — | HTTP security headers + CSP en producción |

### Frontend

| Tecnología | Versión | Rol |
|------------|---------|-----|
| **React** | 18 | Framework UI |
| **Vite** | 5 | Bundler y dev server |
| **TypeScript** | 5 | Tipado estricto |
| **Tailwind CSS** | 3 | Diseño responsivo |
| **Axios** | — | Cliente HTTP — manejo centralizado de errores y session token |
| **react-hot-toast** | — | Notificaciones de usuario amigables |

### Infraestructura

| Tecnología | Rol |
|------------|-----|
| **PM2** | Gestión de procesos, modo cluster, auto-restart |
| **Nginx** | Proxy inverso, sirve frontend compilado |
| **Docker / Compose** | Contenedores para PostgreSQL, Redis, Backend y Nginx |
| **PowerShell 5.1+** | Scripts de setup, despliegue y detención en Windows |
| **Cloudflare Tunnel** | Acceso HTTPS público temporal sin abrir puertos |

---

## Arquitectura de seguridad

```
Navegador / App cliente
        │
        │ 1. POST /api/auth/session  { X-Api-Key: <key> }
        │    ← sessionToken (HMAC firmado, expira en N horas)
        │
        │ 2. GET|POST /api/*  { X-Session-Token: <token> }
        │    La API Key nunca vuelve a viajar por la red
        │
Panel de operador
        │
        │ POST /api/admin/tenants  { X-Admin-Key: <admin_secret> }
        │    Solo el operador con ADMIN_SECRET puede crear/listar tenants
        ▼
  ┌─────────────┐   AdminGuard        ┌──────────────────┐
  │  NestJS API │ ←─────────────────  │  ADMIN_SECRET    │ (solo en .env)
  │             │   TenantGuard       └──────────────────┘
  │             │ ←─────────────────  X-Session-Token  (en memoria, no localStorage)
  │             │                     X-Api-Key        (solo en primer login)
  └──────┬──────┘
         │
    ┌────┴────┐
    │  Redis  │  Circuit breaker · Distributed lock · Caché de tenants
    └────┬────┘
         │
    ┌────┴──────────┐
    │  PostgreSQL   │  Datos aislados por tenant_id en TODAS las queries
    └───────────────┘
```

### Garantías de aislamiento

- Cada query a `viajes` y `vehiculos` incluye `WHERE tenant_id = :tenantId` — nunca se devuelven registros de otro tenant
- La API Key se hashea en BD (SHA-256) — nunca se almacena en texto plano
- El `authToken` del proveedor de seguros se enmascara en las respuestas de la API (`••••••••`)
- Nada sensible se guarda en `localStorage` ni `sessionStorage` del navegador

---

## Requisitos previos

| Herramienta | Versión mínima | Enlace |
|-------------|----------------|--------|
| Node.js | 18 LTS | https://nodejs.org |
| PostgreSQL | 14+ | https://postgresql.org |
| Redis | 6+ | https://redis.io · [Windows portable](https://github.com/tporadowski/redis/releases) |
| PowerShell | 5.1+ | Incluido en Windows 10/11 |
| Docker (opcional) | 24+ | https://docker.com |
| PM2 (opcional) | 5+ | `npm install -g pm2` |

---

## Instalación rápida (Windows)

### Primera vez

```powershell
git clone https://github.com/jsotoexelixitech/servidor-viajes.git exelixi-api
cd exelixi-api
.\setup.ps1
```

El asistente de configuración solicita interactivamente:

1. **PostgreSQL** — host, puerto, usuario, contraseña, nombre de BD
2. **Redis** — host, puerto, contraseña (lo inicia automáticamente si está en `C:\redis-portable\`)
3. **Seguridad** — genera `SESSION_SECRET` y `ADMIN_SECRET` de 80 chars hex o acepta los tuyos
4. **Aplicación** — puerto, entorno, orígenes CORS, webhook externo (opcional)

Al finalizar: crea `backend/.env`, instala dependencias, crea tablas vía TypeORM y muestra el `ADMIN_SECRET` generado.

> **Guarda el `ADMIN_SECRET` mostrado al final del setup.** Lo necesitarás en el campo "Admin Key" del panel web para crear los primeros clientes.

### Usos posteriores

```powershell
.\start-dev.ps1           # Desarrollo con hot-reload (inicia Redis automáticamente)
.\start-dev.ps1 -Tunnel   # Desarrollo + túnel HTTPS público vía Cloudflare
.\deploy.ps1              # Producción: compila, valida env y lanza con PM2 o node
.\deploy.ps1 -Tunnel      # Producción + túnel Cloudflare
.\stop.ps1                # Detener todos los servicios (backend, frontend, Redis)
```

---

## Instalación en Linux / Cloud (Docker Compose)

```bash
git clone https://github.com/jsotoexelixitech/servidor-viajes.git exelixi-api
cd exelixi-api

# 1. Crear el .env con secretos seguros
cp backend/.env.example backend/.env

# 2. Generar SESSION_SECRET y ADMIN_SECRET (ejecuta dos veces, usa valores distintos)
node -e "process.stdout.write(require('crypto').randomBytes(40).toString('hex'))"

# 3. Editar backend/.env con tus valores
nano backend/.env

# 4. Levantar todos los servicios
docker-compose up -d

# 5. Ver logs
docker-compose logs -f backend
```

---

## Variables de entorno

Todas las variables se configuran en `backend/.env`. El sistema valida las críticas al arrancar y termina el proceso en producción si faltan.

```env
# ── Aplicación ──────────────────────────────────────────────
NODE_ENV=production          # development | production
PORT=3000
APP_PREFIX=api
CORS_ORIGINS=https://tu-dominio.com,http://localhost:5173

# ── Seguridad (OBLIGATORIO) ─────────────────────────────────
# SESSION_SECRET: firma HMAC de los tokens de sesión de los clientes
SESSION_SECRET=<80_chars_hex_aleatorio>
SESSION_TTL_HOURS=8

# ADMIN_SECRET: protege las rutas /admin/tenants
# El operador usa este valor en el campo "Admin Key" del panel web
ADMIN_SECRET=<80_chars_hex_aleatorio_diferente>

# ── PostgreSQL ───────────────────────────────────────────────
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=exelixi
DB_PASSWORD=<contraseña_segura>
DB_NAME=exelixi_api_db
DB_POOL_SIZE=50

# ── Redis ────────────────────────────────────────────────────
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# ── Webhook externo (opcional) ───────────────────────────────
EXTERNAL_WEBHOOK_URL=https://tu-plataforma.com/webhook
EXTERNAL_WEBHOOK_SECRET=<secret_hmac>
EXTERNAL_WEBHOOK_TIMEOUT=10000
EXTERNAL_WEBHOOK_RETRIES=3

# ── Parámetros de cola y logs ────────────────────────────────
LOG_LEVEL=info
QUEUE_CONCURRENCY=10
QUEUE_MAX_JOBS=10000
THROTTLE_TTL=60000
THROTTLE_LIMIT=100000
```

> Generar secretos: `node -e "process.stdout.write(require('crypto').randomBytes(40).toString('hex'))"`  
> El archivo `.env` está en `.gitignore` — nunca se sube al repositorio.

---

## URLs de acceso

| Servicio | Desarrollo | Producción |
|----------|-----------|------------|
| Panel web (frontend) | http://localhost:5173 | http://localhost (Nginx) |
| Backend API | http://localhost:3000/api | http://localhost:3000/api |
| Swagger UI | http://localhost:3000/api/docs | Deshabilitado en producción |
| Health check | http://localhost:3000/api/health | http://localhost:3000/api/health |

---

## API Reference

### Autenticación — flujo recomendado

```
1. POST /api/auth/session
   Header: X-Api-Key: <api_key>
   Response: { sessionToken, expiresAt, tenant: { id, nombre } }

2. Usar sessionToken en todas las peticiones siguientes:
   Header: X-Session-Token: <sessionToken>
   (La API Key ya no viaja por la red)
```

### Endpoints

#### Autenticación
| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/api/auth/session` | `X-Api-Key` | Intercambia API Key por token de sesión seguro |

#### Administración de tenants
> Requiere header `X-Admin-Key: <ADMIN_SECRET>`

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/admin/tenants` | Crear tenant — retorna `apiKey` (una sola vez) |
| GET | `/api/admin/tenants` | Listar todos los tenants |
| POST | `/api/admin/tenants/:id/desactivar` | Desactivar tenant |
| GET | `/api/admin/tenants/polizas-criticas` | Panel global de pólizas sin emitir |

#### Configuración del tenant
> Requiere `X-Session-Token` o `X-Api-Key`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/tenant/me` | Ver datos del tenant autenticado |
| GET | `/api/tenant/me/mapeos` | Ver configuración de seguro y mapeos de campos |
| PUT | `/api/tenant/me/seguro` | Guardar `seguroConfig` + `fieldMappings` + `defaultValues` |

#### Viajes
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/viaje/iniciar` | Iniciar viaje y emitir póliza RCV |
| POST | `/api/viaje/finalizar` | Finalizar viaje (`body: { idViaje }`) |
| POST | `/api/viaje/enviar` | Reenviar webhook externo |
| GET | `/api/viaje` | Listar viajes paginado (`?page=1&limit=50`) |
| GET | `/api/viaje/:id` | Obtener viaje por UUID |
| GET | `/api/viaje/mis-polizas-criticas` | Monitor de pólizas del tenant autenticado |

#### Vehículos
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/vehiculos` | Registrar vehículo |
| POST | `/api/vehiculos/bulk` | Carga masiva hasta 1 000 (upsert por placa+tenant) |
| GET | `/api/vehiculos` | Listar con filtros y paginación |
| GET | `/api/vehiculos/estadisticas` | Estadísticas del parque vehicular |
| GET | `/api/vehiculos/placa/:placa` | Buscar por placa |
| GET | `/api/vehiculos/:id` | Obtener por UUID |
| PUT | `/api/vehiculos/:id` | Actualizar vehículo |
| DELETE | `/api/vehiculos/:id/desactivar` | Soft delete lógico |
| DELETE | `/api/vehiculos/:id` | Eliminar permanentemente |

#### Health
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/health` | Estado: DB, Redis, heap, RSS, disco, circuit breaker |

---

## Modelo de datos

### `tenants`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID PK | Clave primaria auto-generada |
| `nombre` | VARCHAR(100) UNIQUE | Nombre del cliente |
| `api_key` | VARCHAR(128) | Hash SHA-256 de la clave (nunca en texto plano) |
| `activo` | BOOLEAN | Estado del tenant |
| `webhook_url` | VARCHAR(500) | URL para notificaciones de viajes (opcional) |
| `webhook_secret` | VARCHAR(256) | Secret HMAC para firmar webhooks |
| `config` | JSONB | `seguroConfig` · `fieldMappings` · `defaultValues` |
| `creado_en` | TIMESTAMPTZ | Fecha de creación |

### `viajes`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID PK | Clave primaria |
| `tenant_id` | UUID FK | Tenant propietario — presente en TODAS las queries |
| `numero_placa` | VARCHAR(20) | Placa del vehículo |
| `estado_poliza` | VARCHAR | `EMITIENDO` · `ACTIVA` · `ERROR` · `CRITICO` |
| `cnpoliza` | VARCHAR | Número de póliza del proveedor |
| `cnrecibo` | VARCHAR | Número de recibo |
| `url_poliza_pdf` | VARCHAR | URL del PDF de la póliza |
| `poliza_intentos` | INT | Contador de reintentos de emisión |
| `poliza_error` | TEXT | Último mensaje de error |
| `metadata` | JSONB | `idempotencyKey` · datos originales del viaje |
| `webhook_enviado` | BOOLEAN | Si el webhook externo fue notificado |
| `creado_en` | TIMESTAMPTZ | Timestamp de inicio del viaje |

### `vehiculos`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID PK | Clave primaria |
| `tenant_id` | UUID FK | Tenant propietario |
| `placa` | VARCHAR(20) | Placa única por tenant (índice compuesto) |
| `marca` | VARCHAR(100) | Marca del vehículo |
| `modelo` | VARCHAR(100) | Modelo |
| `anio` | SMALLINT | Año de fabricación |
| `tipo_vehiculo` | ENUM | SEDAN · SUV · CAMIONETA · BUS · MINIBUS · MOTO · OTRO |
| `activo` | BOOLEAN | Soft delete lógico |

---

## Mecanismos de fiabilidad

| Mecanismo | Implementación |
|-----------|----------------|
| **Circuit Breaker** | Redis-backed distribuido. Estados: `CLOSED → OPEN → HALF_OPEN`. Umbral configurable de fallos consecutivos. Falla abierto si Redis no disponible. |
| **Idempotencia** | Header `X-Idempotency-Key` o SHA-256 de `tenantId + placa + ventana de 1 minuto`. Evita emisión duplicada ante reintentos del cliente. |
| **Cola BullMQ** | Reintentos con backoff exponencial (10s → 5120s). 10 intentos por job. Jobs identificados con `jobId` fijo para evitar duplicados en cola. |
| **PolizaGuardian** | Cron cada 5 min con distributed lock Redis (SET NX EX). Rescata viajes en `ERROR`, `CRITICO` o `EMITIENDO > 5 min`. Máx. 50 intentos totales. |
| **Caché de tenants** | TTL 60s en Redis. Compartida entre workers del cluster. Fallback transparente a PostgreSQL si Redis no disponible. |
| **Pool adaptivo** | Conexiones PG distribuidas entre workers: `floor((DB_POOL_SIZE - 20) / numWorkers)`. |
| **Health checks** | Terminus verifica PostgreSQL, heap, RSS y disco. Expuesto en `/api/health`. |
| **Transacciones** | La escritura de cada viaje usa `queryRunner` con rollback automático ante errores. |
| **Validación de entorno** | `EnvValidatorService` verifica variables críticas al arrancar. En producción, termina el proceso si faltan. |

---

## Estructura del proyecto

```
exelixi-api/
├── backend/                        NestJS API (puerto 3000)
│   ├── src/
│   │   ├── main.ts                 Bootstrap, cluster PM2, Swagger, CORS
│   │   ├── app.module.ts           Módulo raíz + EnvValidatorService
│   │   ├── config/
│   │   │   ├── configuration.ts    Variables de entorno tipadas
│   │   │   ├── typeorm.config.ts   Pool adaptivo PostgreSQL
│   │   │   └── logger.config.ts    Winston JSON con rotación diaria
│   │   ├── common/
│   │   │   ├── env-validator.service.ts   Valida env al arranque
│   │   │   ├── guards/
│   │   │   │   ├── admin.guard.ts         X-Admin-Key → ADMIN_SECRET
│   │   │   │   └── tenant.guard.ts        X-Session-Token / X-Api-Key
│   │   │   ├── session/
│   │   │   │   └── session.service.ts     HMAC stateless tokens
│   │   │   ├── redis/redis.module.ts      Cliente ioredis compartido
│   │   │   ├── filters/                   AllExceptionsFilter (JSON errors)
│   │   │   └── interceptors/              LoggingInterceptor, FieldMapping
│   │   └── modules/
│   │       ├── tenant/             Tenants, API Keys, configuraciones, AuthController
│   │       ├── viaje/              Core: emisión de pólizas, BullMQ processor, guardian
│   │       ├── vehiculo/           Parque vehicular con carga masiva
│   │       ├── seguro/             Integración aseguradora + PolizaGuardianService
│   │       └── health/             Terminus health checks
│   ├── ecosystem.config.js         Configuración PM2
│   ├── Dockerfile
│   └── .env.example
├── frontend/                       React + Vite (puerto 5173 / 80)
│   ├── src/
│   │   ├── App.tsx                 UI: Dashboard, Setup, Mapeo, Viajes, Monitor
│   │   └── api.ts                  Axios + setSessionToken + authApi + tenantApi
│   ├── Dockerfile
│   └── nginx.conf
├── scripts/
│   └── init-db.sql                 Extensiones PostgreSQL
├── docker-compose.yml
├── setup.ps1                       Configuración inicial interactiva (Windows)
├── start-dev.ps1                   Arranque desarrollo (inicia Redis automáticamente)
├── deploy.ps1                      Despliegue producción con validación de secretos
└── stop.ps1                        Detener todos los servicios
```

---

## Guía de producción

### Windows con PM2

```powershell
# 1. Instalar PM2 (una vez)
npm install -g pm2

# 2. Configurar (una vez)
.\setup.ps1

# 3. Desplegar
.\deploy.ps1

# 4. Despliegue con acceso HTTPS público temporal
.\deploy.ps1 -Tunnel

# 5. Monitorear
pm2 status
pm2 logs exelixi-api --lines 50

# 6. Reiniciar tras actualización
git pull
.\deploy.ps1 -SkipBuild:$false
```

### Linux / Cloud con Docker

```bash
# Despliegue inicial
git clone https://github.com/jsotoexelixitech/servidor-viajes.git
cd servidor-viajes
cp backend/.env.example backend/.env
# Editar .env con secretos reales
docker-compose up -d --build

# Actualización sin downtime
git pull
docker-compose up -d --build --no-deps backend
```

---

## Diagnóstico y monitoreo

```powershell
# Estado completo del sistema
Invoke-RestMethod "http://localhost:3000/api/health" | ConvertTo-Json -Depth 4

# Listar tenants (requiere ADMIN_SECRET)
$h = @{ "X-Admin-Key" = "<ADMIN_SECRET>" }
Invoke-RestMethod "http://localhost:3000/api/admin/tenants" -Headers $h

# Pólizas críticas de todos los tenants (requiere ADMIN_SECRET)
Invoke-RestMethod "http://localhost:3000/api/admin/tenants/polizas-criticas" -Headers $h

# Autenticar un tenant y ver sus pólizas críticas
$s = (Invoke-RestMethod "http://localhost:3000/api/auth/session" `
  -Method POST -Headers @{"X-Api-Key"="<api_key>";"Content-Type"="application/json"} `
  -Body "{}").sessionToken
Invoke-RestMethod "http://localhost:3000/api/viaje/mis-polizas-criticas" `
  -Headers @{"X-Session-Token"=$s}

# Ver logs en tiempo real
Get-Content backend\logs\application-$(Get-Date -Format 'yyyy-MM-dd').log -Wait -Tail 50
```

---

## Soporte

**ExelixiTech**  
Soluciones tecnológicas para el sector transporte y seguros  
GitHub: https://github.com/jsotoexelixitech  
Correo: soporte@exelixitech.com

---

## Aviso legal

### Propiedad intelectual

Este software, incluyendo su código fuente, arquitectura, diseño, documentación y todos los componentes derivados, es propiedad exclusiva de **ExelixiTech** y sus autores. Todos los derechos reservados.

### Confidencialidad y uso autorizado

Este repositorio contiene información comercialmente sensible y propietaria. El acceso está restringido exclusivamente a personas autorizadas por escrito por ExelixiTech.

Queda expresamente prohibido:

- Reproducir, copiar, distribuir o publicar el código fuente, total o parcialmente, sin autorización escrita previa
- Utilizar el software o cualquier parte de él para desarrollar productos o servicios competidores o derivados
- Compartir credenciales de acceso, claves API, secretos de configuración o datos de tenants con terceros no autorizados
- Realizar ingeniería inversa, descompilar o desensamblar cualquier componente del sistema
- Sublicenciar, vender, arrendar o transferir el software o derechos sobre él

### Exclusión de garantías

El software se provee "tal cual" para los entornos y casos de uso documentados. ExelixiTech no asume responsabilidad por pérdidas, daños directos o indirectos derivados del uso fuera de los parámetros del acuerdo comercial vigente.

### Datos personales y privacidad

El sistema procesa datos personales (nombre, cédula, teléfono, correo) de conductores y tomadores de pólizas. El cliente (tenant) es responsable del tratamiento de estos datos conforme a la normativa vigente. ExelixiTech actúa como encargado del tratamiento de acuerdo al contrato de servicio suscrito.

### Marco legal aplicable

Este software y los acuerdos relacionados se rigen por las leyes de la República Bolivariana de Venezuela y, donde aplique, la legislación internacional en materia de propiedad intelectual y datos personales:

- **Ley sobre el Derecho de Autor** — Venezuela, Gaceta Oficial N° 4.638 Extraordinario
- **Ley de Mensajes de Datos y Firmas Electrónicas** — Venezuela, Decreto-Ley N° 1.204
- **Ley Especial contra los Delitos Informáticos** — Venezuela, Gaceta Oficial N° 37.313
- **Convenio de Berna para la Protección de las Obras Literarias y Artísticas**
- **Acuerdo sobre los Aspectos de los Derechos de Propiedad Intelectual (ADPIC / TRIPS)** — OMC

Cualquier disputa relacionada con el uso de este software será sometida a la jurisdicción de los tribunales competentes de la República Bolivariana de Venezuela, sin perjuicio de los mecanismos de arbitraje o mediación acordados contractualmente.

---

*© 2026 ExelixiTech. Todos los derechos reservados.*  
*Versión 2.0 — Última actualización: Abril 2026*
