# bbtodo

`bbtodo` is a minimal kanban with:

- multiple projects
- flexible lanes
- only OIDC login
- personal API tokens
- React frontend, Fastify server, and SQLite

## Run the project

```bash
# Create .env file and modify as you wish
wget https://raw.githubusercontent.com/JyQuery/bbtodo/refs/heads/main/.env.example -O .env 

# Download the all-in-one docker compose file
wget https://raw.githubusercontent.com/JyQuery/bbtodo/refs/heads/main/docker-compose.all-in-one.yml -O docker-compose.yml

# Create data folder
mkdir data

docker compose up -d
```

The app is available at `http://localhost:8080` by default.
