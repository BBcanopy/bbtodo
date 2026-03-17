# bbtodo

`bbtodo` is a minimal multi-project kanban app with:

- fixed `Todo`, `In Progress`, and `Done` columns
- generic OIDC login for browser users
- personal API tokens for scripts and automation
- a React/Vite frontend, Fastify API, and SQLite persistence

## Local development

1. Copy `.env.example` to `.env` and fill in your OIDC settings.
2. Install dependencies with `npm install`.
3. Run the API and web app together with `npm run dev`.
4. Open `http://localhost:5173` for Vite development or `http://localhost:8080` when using Docker Compose.

The frontend uses `BBTODO_API_ORIGIN` in development so `/api`, `/auth`, `/docs`, and `/health` requests can proxy to the API.

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

The compose stack exposes the web app on `http://localhost:8080` and stores SQLite data in the `bbtodo_sqlite` named volume.

## Tests

Run the workspace build and tests with:

```bash
npm run build
npm run test
```
