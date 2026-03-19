# bbtodo

`bbtodo` is a minimal kanban with:

- multiple projects
- flexible lanes
- only OIDC login
- personal API tokens
- React frontend, Fastify server, and SQLite

## Run the project

Run the project with:

```bash
cp .env.example .env # Create .env file and modify as you wish
docker compose up --build
```

The compose stack exposes the web app on `http://localhost:8080` by default, exposes the server on `http://localhost:3000` by default, and stores SQLite data at `/data/bbtodo.sqlite`.