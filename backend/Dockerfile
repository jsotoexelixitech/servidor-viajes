# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Instalar dependencias primero (aprovecha cache de Docker)
COPY package*.json ./
RUN npm ci --prefer-offline

COPY . .
RUN npm run build

# Eliminar devDependencies para producción
RUN npm prune --production

# ─── Stage 2: Production ──────────────────────────────────────────────────────
FROM node:20-alpine AS production

# Instalar wget para el healthcheck
RUN apk add --no-cache wget tini

WORKDIR /app

# Crear usuario no-root para seguridad
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copiar sólo lo necesario desde el builder
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/package.json ./

# Crear directorio de logs con permisos correctos
RUN mkdir -p logs && chown appuser:appgroup logs

USER appuser

EXPOSE 3000

# Usar tini como init process para manejo correcto de señales
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main"]
