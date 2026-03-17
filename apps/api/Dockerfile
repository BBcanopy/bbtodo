FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN npm ci

COPY apps/api apps/api

RUN npm run build --workspace @bbtodo/api

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN npm ci --omit=dev --workspace @bbtodo/api --include-workspace-root=false

COPY --from=builder /app/apps/api/dist apps/api/dist

VOLUME ["/data"]
EXPOSE 3000

CMD ["node", "apps/api/dist/index.js"]

