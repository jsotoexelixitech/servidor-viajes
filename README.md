# Exelixi API — Servidor de Viajes con Emisión de Pólizas RCV

> **ExelixiTech** · Soluciones tecnológicas para el sector transporte y seguros  
> Versión 1.0 · Última actualización: Abril 2026

---

## Descripción general

**Exelixi API** es un middleware multi-tenant diseñado para plataformas de transporte y ride-hailing que necesitan emitir automáticamente pólizas de **Responsabilidad Civil de Vehículos (RCV)** en el momento en que un viaje es iniciado. El sistema actúa como intermediario inteligente entre la plataforma del cliente (tenant) y el proveedor de seguros, con capacidades de reintentos, monitoreo, circuit breaker y webhooks.

### Características principales

- **Multi-tenant**: cada cliente opera de forma aislada con su propia clave API y configuración
- **Mapeo de campos configurable**: cada tenant puede definir cómo sus campos se traducen a los campos del proveedor de seguros
- **Alta disponibilidad**: circuit breaker distribuido, colas BullMQ con reintentos exponenciales, cron de rescate
- **Panel de administración**: frontend React para configurar tenants, monitorear pólizas y gestionar viajes
- **Preparado para producción**: PM2 cluster mode, Nginx, Docker Compose, logs estructurados

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Backend | NestJS 10 + TypeScript |
| Base de datos | PostgreSQL 16 (TypeORM, JSONB para configuraciones) |
| Cola de trabajos | BullMQ sobre Redis 7 |
| Caché / Circuit Breaker | Redis 7 (ioredis) |
| Cron jobs | `@nestjs/schedule` |
| Rate limiting | `@nestjs/throttler` con Redis |
| Logs | Winston (JSON estructurado) |
| Frontend | React 18 + Vite 5 + Tailwind CSS v3 |
| Proxy | Nginx 1.27 |
| Gestión de procesos | PM2 (modo cluster, producción) |
| Contenedores | Docker + Docker Compose |
| Documentación API | Swagger UI (`/api/docs`) |

---

## Requisitos previos

| Herramienta | Versión mínima | Enlace |
|---|---|---|
| Node.js | 18 LTS | https://nodejs.org |
| PostgreSQL | 14+ | https://postgresql.org |
| Redis | 6+ | https://redis.io |
| PowerShell | 5.1+ | Incluido en Windows 10/11 |
| Docker (opcional) | 24+ | https://docker.com |

---

## Instalación y configuración

### Opción A — Asistente interactivo (recomendado para servidores Windows)

#### 1. Clonar el repositorio

```powershell
git clone https://github.com/jsotoexelixitech/servidor-viajes.git exelixi-api
cd exelixi-api
```

#### 2. Ejecutar el asistente de configuración (solo la primera vez)

```powershell
.\setup.ps1
```

El asistente solicita interactivamente:
- Host, puerto, usuario, contraseña y nombre de la base de datos PostgreSQL
- Host, puerto y contraseña de Redis
- Puerto del backend, entorno y orígenes CORS
- URL y secret del webhook externo (opcional)

Al finalizar: genera `backend/.env`, instala dependencias de backend y frontend, crea la base de datos y todas las tablas, y ofrece iniciar los servicios.

#### 3. Inicios posteriores

```powershell
.\start-dev.ps1           # Desarrollo con hot-reload
.\start-dev.ps1 -Tunnel   # Desarrollo + túnel Cloudflare público
.\deploy.ps1              # Producción (compila y lanza con PM2 o node)
.\stop.ps1                # Detener todos los procesos
```

---

### Opción B — Docker Compose (recomendado para servidores Linux/cloud)

#### 1. Crear el archivo de variables de entorno

```bash
cp backend/.env.example backend/.env
# Editar backend/.env con las credenciales reales
```

#### 2. Levantar todos los servicios

```bash
docker-compose up -d
```

Esto levanta en orden: PostgreSQL → Redis → Backend → Frontend (Nginx).

#### 3. Detener

```bash
docker-compose down          # Detener (conservar datos)
docker-compose down -v       # Detener y eliminar volúmenes
```

---

## URLs de acceso

| Servicio | URL |
|----------|-----|
| Frontend (panel de administración) | http://localhost:5173 (dev) / http://localhost (prod) |
| Backend API | http://localhost:3000/api |
| Swagger UI (documentación interactiva) | http://localhost:3000/api/docs |
| Health check | http://localhost:3000/api/health |

---

## Variables de entorno

Copiar `backend/.env.example` a `backend/.env` y ajustar:

```env
# Aplicación
NODE_ENV=development          # development | production | staging
PORT=3000
APP_PREFIX=api
CORS_ORIGINS=http://localhost:5173

# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=exelixi
DB_PASSWORD=<contraseña_segura>
DB_NAME=exelixi_api_db
DB_POOL_SIZE=50

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=<contraseña_redis>
REDIS_DB=0

# Webhook externo (opcional)
EXTERNAL_WEBHOOK_URL=https://tu-plataforma.com/webhook
EXTERNAL_WEBHOOK_SECRET=<secret_hmac>
EXTERNAL_WEBHOOK_TIMEOUT=10000
EXTERNAL_WEBHOOK_RETRIES=3

# Rate limiting
THROTTLE_TTL=60000
THROTTLE_LIMIT=100000

# Logs y colas
LOG_LEVEL=info
QUEUE_CONCURRENCY=10
QUEUE_MAX_JOBS=10000
```

> **Importante**: nunca subas `backend/.env` ni `backend/.env.production` al repositorio. Están incluidos en `.gitignore`.

---

## Modelo de datos

### Tabla `tenants`
Clientes registrados en el sistema. Cada tenant tiene su propia API Key y configuración de seguro.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | Clave primaria |
| `nombre` | VARCHAR(100) | Nombre único del tenant |
| `api_key` | VARCHAR(128) | Clave de autenticación (solo se muestra al crear) |
| `activo` | BOOLEAN | Estado del tenant |
| `webhook_url` | VARCHAR(500) | URL para notificaciones externas |
| `config` | JSONB | `seguroConfig`, `fieldMappings`, `defaultValues` |

### Tabla `viajes`
Registro de cada viaje procesado y el estado de la póliza RCV asociada.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | Clave primaria |
| `tenant_id` | UUID | FK al tenant |
| `estado_poliza` | ENUM | `PENDIENTE` / `EMITIENDO` / `EMITIDA` / `ERROR` / `CRITICO` |
| `cnpoliza` | VARCHAR | Número de póliza emitida |
| `poliza_intentos` | INT | Contador de reintentos |
| `metadata` | JSONB | Datos originales del viaje |

### Tabla `vehiculos`
Pre-data del parque vehicular por tenant para enriquecer automáticamente las pólizas.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | Clave primaria |
| `tenantId` | UUID | FK al tenant |
| `placa` | VARCHAR(20) | Único por tenant |
| `marca` | VARCHAR(100) | Marca |
| `modelo` | VARCHAR(100) | Modelo |
| `anio` | SMALLINT | Año de fabricación |
| `tipoVehiculo` | ENUM | SEDAN / SUV / CAMIONETA / BUS / MINIBUS / MOTO / OTRO |
| `activo` | BOOLEAN | Soft delete lógico |

---

## API Endpoints

### Autenticación
Todos los endpoints (excepto `/admin` y `/health`) requieren el header:
```
X-Api-Key: <api_key_del_tenant>
```

### Admin (proteger con IP whitelist en producción)
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/admin/tenants` | Crear tenant — retorna `apiKey` (solo una vez) |
| GET | `/api/admin/tenants` | Listar todos los tenants |
| POST | `/api/admin/tenants/:id/desactivar` | Desactivar tenant |
| GET | `/api/admin/tenants/polizas-criticas` | Panel de pólizas sin emitir |

### Configuración del tenant
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/tenant/me` | Ver datos del tenant autenticado |
| GET | `/api/tenant/me/mapeos` | Ver configuración de seguro y mapeos |
| PUT | `/api/tenant/me/seguro` | Guardar `seguroConfig` + `fieldMappings` + `defaultValues` |

### Viajes
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/viaje/iniciar` | Iniciar viaje y emitir póliza |
| POST | `/api/viaje/finalizar` | Finalizar viaje (`body: { idViaje }`) |
| POST | `/api/viaje/enviar` | Reenviar webhook (`body: { idViaje, forzarReenvio? }`) |
| GET | `/api/viaje` | Listar viajes paginado (`?page=1&limit=50`) |
| GET | `/api/viaje/:id` | Obtener viaje por UUID |

### Vehículos
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/vehiculos` | Crear vehículo |
| POST | `/api/vehiculos/bulk` | Carga masiva hasta 1 000 (upsert por placa) |
| GET | `/api/vehiculos` | Listar con filtros y paginación |
| GET | `/api/vehiculos/estadisticas` | Estadísticas del parque vehicular |
| GET | `/api/vehiculos/placa/:placa` | Buscar por placa |
| GET | `/api/vehiculos/:id` | Obtener por ID |
| PUT | `/api/vehiculos/:id` | Actualizar vehículo |
| DELETE | `/api/vehiculos/:id/desactivar` | Soft delete |
| DELETE | `/api/vehiculos/:id` | Eliminar permanentemente |

### Health
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/health` | Estado: DB, Redis, memoria, disco, circuit breaker |

---

## Mecanismos de fiabilidad

| Mecanismo | Descripción |
|-----------|-------------|
| **Circuit Breaker** | Distribuido en Redis. CLOSED → OPEN (tras N fallos) → HALF_OPEN. Falla abierto si Redis no está disponible. |
| **Idempotencia** | Header `X-Idempotency-Key` o hash SHA-256 del body. Evita pólizas duplicadas. |
| **Cola BullMQ** | Reintentos con backoff exponencial, máximo 5 intentos por job. |
| **PolizaGuardian** | Cron cada 5 minutos con distributed lock Redis. Rescata pólizas en estado `ERROR`, `CRITICO` o `EMITIENDO` > 5 min. Máx. 50 intentos. |
| **Caché de tenants** | TTL 60s en Redis. Compartida entre todos los workers del cluster. |
| **Pool adaptivo** | Conexiones PG distribuidas entre workers PM2: `(PG_MAX_CONNECTIONS - 20) / workers`. |
| **Health checks** | Terminus verifica PostgreSQL, heap, RSS y disco. |

---

## Estructura del proyecto

```
exelixi-api/
├── backend/                    NestJS API (puerto 3000)
│   ├── src/
│   │   ├── main.ts             Bootstrap, cluster PM2, Swagger
│   │   ├── app.module.ts       Módulo raíz
│   │   ├── config/             TypeORM, Winston, configuración central
│   │   ├── common/             Guards, interceptors, filtros, Redis module
│   │   └── modules/
│   │       ├── tenant/         Clientes, API Keys, configuraciones
│   │       ├── viaje/          Core: emisión de pólizas, BullMQ
│   │       ├── vehiculo/       Pre-data del parque vehicular
│   │       ├── seguro/         Integración aseguradora, PolizaGuardian
│   │       └── health/         Health checks con Terminus
│   ├── ecosystem.config.js     Configuración PM2
│   ├── Dockerfile
│   └── .env.example
├── frontend/                   React + Vite (puerto 5173 / 80)
│   ├── src/
│   │   ├── App.tsx             UI con 7 pestañas
│   │   └── api.ts              Cliente Axios
│   ├── Dockerfile
│   └── nginx.conf
├── scripts/
│   └── init-db.sql             Extensiones PostgreSQL
├── docker-compose.yml
├── setup.ps1                   Configuración inicial (Windows)
├── start-dev.ps1               Arranque desarrollo
├── deploy.ps1                  Despliegue producción
├── stop.ps1                    Detener servicios
└── CONTEXT.md                  Contexto técnico completo del proyecto
```

---

## Guía de despliegue en producción

### Con PM2 (Windows Server / VPS sin Docker)

```powershell
# 1. Instalar PM2 globalmente (una vez)
npm install -g pm2

# 2. Desplegar
.\deploy.ps1

# 3. Con túnel Cloudflare para acceso público temporal
.\deploy.ps1 -Tunnel

# 4. Ver estado de procesos
pm2 status
pm2 logs exelixi-api

# 5. Reiniciar tras cambios
pm2 restart exelixi-api
```

### Con Docker Compose (Linux / cloud)

```bash
# Producción completa
docker-compose up -d --build

# Ver logs
docker-compose logs -f backend

# Actualizar tras cambios
docker-compose pull
docker-compose up -d --build
```

---

## Comandos de diagnóstico

```powershell
# Verificar que el backend responde
Invoke-RestMethod "http://localhost:3000/api/health"

# Ver logs en tiempo real (dev)
Get-Content backend\logs\dev.log -Wait

# Verificar tenants registrados
Invoke-RestMethod "http://localhost:3000/api/admin/tenants"

# Ver pólizas críticas
Invoke-RestMethod "http://localhost:3000/api/admin/tenants/polizas-criticas"

# Probar autenticación con una API Key
$h = @{ "X-Api-Key" = "tu_api_key"; "Content-Type" = "application/json" }
Invoke-RestMethod "http://localhost:3000/api/tenant/me" -Headers $h
```

---

## Soporte y contacto

**ExelixiTech**  
Soluciones tecnológicas para el sector transporte y seguros  
Correo: soporte@exelixitech.com  
GitHub: https://github.com/jsotoexelixitech

---

## Aviso legal y licencia

### Propiedad intelectual

Este software, incluyendo su código fuente, arquitectura, diseño, documentación y cualquier componente derivado, es propiedad exclusiva de **ExelixiTech** y sus autores. Todos los derechos reservados.

### Confidencialidad

Este repositorio contiene información comercialmente sensible y propietaria. El acceso al mismo está restringido a personas autorizadas explícitamente por ExelixiTech. Queda estrictamente prohibido:

- Reproducir, copiar o distribuir el código fuente, parcial o totalmente, sin autorización escrita
- Utilizar el software o cualquier parte de él para desarrollar productos o servicios competidores
- Compartir credenciales de acceso, claves API o cualquier dato de configuración con terceros no autorizados
- Realizar ingeniería inversa del sistema o de sus componentes

### Uso autorizado

El acceso a este repositorio se otorga exclusivamente para los fines acordados entre ExelixiTech y el cliente o colaborador autorizado. Cualquier uso fuera del alcance acordado constituye una violación de los derechos de propiedad intelectual y puede derivar en acciones legales.

### Exclusión de garantías

El software se provee "tal cual" para los entornos y casos de uso documentados. ExelixiTech no asume responsabilidad por pérdidas o daños derivados del uso del software fuera de los parámetros establecidos en el acuerdo comercial vigente.

### Marco legal aplicable

Este software y los acuerdos relacionados están sujetos a las leyes de la República Bolivariana de Venezuela y, donde aplique, a la legislación internacional en materia de propiedad intelectual, incluyendo:

- **Ley sobre el Derecho de Autor** (Venezuela, Gaceta Oficial N° 4.638 Extraordinario)
- **Ley de Mensajes de Datos y Firmas Electrónicas** (Venezuela, Decreto 1.204)
- **Convenio de Berna para la Protección de las Obras Literarias y Artísticas**

---

*© 2026 ExelixiTech. Todos los derechos reservados.*
