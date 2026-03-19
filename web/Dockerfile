FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

COPY index.html tsconfig.json vite.config.ts ./
COPY public public
COPY src src

RUN npm run build

FROM nginx:1.29-alpine AS runner

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY wait-for-server.sh /wait-for-server.sh
COPY --from=builder /app/dist /usr/share/nginx/html

RUN sed -i 's/\r$//' /wait-for-server.sh && chmod +x /wait-for-server.sh

EXPOSE 80

CMD ["/wait-for-server.sh"]
