# bbtodo

`bbtodo` is a minimal multi-project kanban app with:

- fixed `Todo`, `In Progress`, and `Done` columns
- generic OIDC login for browser users
- personal API tokens for scripts and automation
- a React/Vite frontend, Fastify server, and SQLite persistence

## Local development

1. Copy `.env.example` to `.env` and fill in your OIDC settings.
2. Install server dependencies with `cd server && npm install`.
3. Install web dependencies with `cd web && npm install`.
4. Run the server with `cd server && npm run dev`.
5. Run the web app with `cd web && npm run dev`.
6. Open `http://localhost:5173` for Vite development or `http://localhost:8080` when using Docker Compose.

The frontend uses `API_ORIGIN` in development so `/api`, `/auth`, `/docs`, and `/health` requests can proxy to the API.

The server stores SQLite at the fixed path `/data/bbtodo.sqlite`. For containerized deployments, mount `/data` to persist the database file.
The server also binds to a fixed internal host (`0.0.0.0`) in containers, so `API_HOST` is not configurable.
The server also binds to a fixed internal port (`3000`), so `API_PORT` is not configurable.
Browser login sessions use a fixed 24-hour lifetime, so `SESSION_TTL_HOURS` is not configurable.
Set `CLIENT_URL` to the browser-facing base URL of the app so OIDC callbacks and cookie behavior use the right origin.
Set `SERVER_PORT` to choose which host port publishes the server container; it defaults to `3000`.
Set `CLIENT_PORT` to choose which host port publishes the web container; it defaults to `8080`. Keep `CLIENT_URL` aligned with it.

## API highlights

- Browser auth:
  - `GET /auth/login`
  - `GET /auth/callback`
  - `POST /auth/logout`
- Session and user:
  - `GET /api/v1/me`
- Projects:
  - `GET /api/v1/projects`
  - `POST /api/v1/projects`
  - `DELETE /api/v1/projects/{projectId}`
- Tasks:
  - `GET /api/v1/projects/{projectId}/tasks`
  - `POST /api/v1/projects/{projectId}/tasks`
  - `PATCH /api/v1/projects/{projectId}/tasks/{taskId}`
  - `DELETE /api/v1/projects/{projectId}/tasks/{taskId}`
- Personal API tokens:
  - `GET /api/v1/api-tokens`
  - `POST /api/v1/api-tokens`
  - `DELETE /api/v1/api-tokens/{tokenId}`

OpenAPI JSON is published at `/docs/openapi.json`, and the Swagger UI is available at `/docs`.

## Containers

Run the full stack with:

```bash
docker compose up --build
```

The compose stack exposes the web app on `http://localhost:8080` by default, exposes the server on `http://localhost:3000` by default, and stores SQLite data at `/data/bbtodo.sqlite` inside the `bbtodo_sqlite` named volume. If you deploy without Compose, mount `/data` yourself.

## Tests

Run builds and tests from each package:

```bash
cd server && npm run build && npm run test
cd web && npm run build && npm run test
```
