FROM node:22-alpine AS backend-deps
WORKDIR /build/backend
COPY backend/package*.json ./
RUN npm ci

FROM node:22-alpine AS backend-builder
WORKDIR /build/backend
COPY --from=backend-deps /build/backend/node_modules ./node_modules
COPY backend/ ./
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-alpine AS frontend-deps
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci

FROM node:22-alpine AS frontend-builder
WORKDIR /build/frontend
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_API_PROXY_TARGET=http://127.0.0.1:3001
COPY --from=frontend-deps /build/frontend/node_modules ./node_modules
COPY frontend/ ./
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
ENV FRONTEND_PORT=3000
ENV NEXT_PUBLIC_API_PROXY_TARGET=http://127.0.0.1:3001

RUN apk add --no-cache tini

COPY --from=backend-builder /build/backend/package*.json ./backend/
COPY --from=backend-builder /build/backend/node_modules ./backend/node_modules
COPY --from=backend-builder /build/backend/dist ./backend/dist

COPY --from=frontend-builder /build/frontend/public ./frontend/public
COPY --from=frontend-builder /build/frontend/.next/standalone ./frontend
COPY --from=frontend-builder /build/frontend/.next/static ./frontend/.next/static

COPY docker-start.sh ./docker-start.sh
RUN chmod +x ./docker-start.sh

EXPOSE 3000 3001

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["./docker-start.sh"]
