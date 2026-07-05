# =====================================================================
# ETAPA 1: INSTALAR DEPENDENCIAS
# =====================================================================
# "FROM" define la imagen base. Usamos Node 24 (requisito del proyecto, ver engines en package.json) sobre "alpine".
FROM node:24-alpine AS deps
# Instalamos una librería necesaria para que Node funcione bien en entornos Alpine.
RUN apk add --no-cache libc6-compat
# Activamos Corepack para usar la versión de pnpm fijada en "packageManager" (package.json).
RUN corepack enable
# Definimos cuál será la carpeta de trabajo dentro del contenedor.
WORKDIR /app
# Copiamos los archivos que dicen qué librerías usa tu proyecto y el lockfile de pnpm.
COPY package.json pnpm-lock.yaml ./
# Instalamos las dependencias de forma limpia y exacta para producción (pnpm install --frozen-lockfile).
RUN pnpm install --frozen-lockfile

# =====================================================================
# ETAPA 2: CONSTRUIR LA APLICACIÓN (BUILD)
# =====================================================================
FROM node:24-alpine AS builder
RUN corepack enable
WORKDIR /app
# Copiamos las carpetas de las dependencias que instalamos en la ETAPA 1.
COPY --from=deps /app/node_modules ./node_modules
# Copiamos absolutamente todo el resto del código de tu proyecto al contenedor (ver .dockerignore).
COPY . .
# Desactivamos la telemetría de Next.js para que el build sea un poco más rápido.
ENV NEXT_TELEMETRY_DISABLED=1
# Ejecutamos el comando "pnpm run build". Esto genera la carpeta de producción (.next),
# incluyendo .next/standalone porque next.config.ts tiene output: "standalone".
RUN pnpm run build

# =====================================================================
# ETAPA 3: EJECUCIÓN (PRODUCCIÓN REAL)
# =====================================================================
FROM node:24-alpine AS runner
WORKDIR /app

# Seteamos variables de entorno para decirle a Next que actúe en modo producción.
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Por seguridad, creamos un usuario interno en Linux (nextjs) para no correr la app como "root".
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copiamos SOLO los archivos finales necesarios del "builder" (Etapa 2), dejando basura atrás.
COPY --from=builder /app/public ./public
# El modo 'standalone' es una característica de Next.js que empaqueta solo lo mínimo para correr.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Le decimos a Docker que a partir de aquí use el usuario seguro que creamos.
USER nextjs

# Avisamos que este contenedor va a escuchar tráfico por el puerto 3000.
EXPOSE 3000
ENV PORT=3000
# "0.0.0.0" permite que el contenedor reciba conexiones de fuera de su propio entorno.
ENV HOSTNAME="0.0.0.0"

# El comando final que arranca tu servidor de Next.js.
CMD ["node", "server.js"]
