# Runs the Next.js app in production mode. NEXT_PUBLIC_* values are inlined at
# build time, so .env / .env.local must be present in the build context.
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
# `next start` needs next.config.* to exist if the app shipped without one.
RUN mkdir -p public && { ls next.config.* >/dev/null 2>&1 || touch next.config.mjs; } \
 && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.* ./

EXPOSE 3000
CMD ["./node_modules/.bin/next", "start", "-p", "3000", "-H", "0.0.0.0"]
