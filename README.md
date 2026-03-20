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

# download the docker compose file
wget https://raw.githubusercontent.com/JyQuery/bbtodo/refs/heads/main/docker-compose-prod.yml -O docker-compose.yml

docker compose -f docker-compose.prod.yml up -d
```