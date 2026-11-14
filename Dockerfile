# Runs the Next.js app in production mode.
#
# NEXT_PUBLIC_* values are inlined by `next build`, so they must be supplied as
# build args when the image is built in CI (no .env in the build context there).
# Server-only values (Supabase secret key, NEAR RPC) are read at runtime and
# come from the container environment.
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

ARG NEXT_PUBLIC_SUPABASE_URL=""
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=""
ARG NEXT_PUBLIC_NEAR_DEFAULT_NETWORK="testnet"
ARG NEXT_PUBLIC_APP_URL=""
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
    NEXT_PUBLIC_NEAR_DEFAULT_NETWORK=$NEXT_PUBLIC_NEAR_DEFAULT_NETWORK \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

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
