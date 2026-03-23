# bbtodo

`bbtodo` is a minimal kanban with:

- Multi-project
- Flexible lanes
- OIDC-only
- Personal API tokens
- For both humans and AI agents
- Built with a React frontend, Fastify backend, and SQLite storage

## Run the project

1. You should have an OIDC client ready. 

Use `https://<hostname>/auth/callback` as the redirect URI.

For local run, you can use `http://localhost:8080`.

2. Run docker compose 

```bash
# Create .env file and modify as you wish
wget https://raw.githubusercontent.com/BBcanopy/bbtodo/refs/heads/main/.env.example -O .env 

# Download the all-in-one docker compose file
wget https://raw.githubusercontent.com/BBcanopy/bbtodo/refs/heads/main/docker-compose.all-in-one.yml -O docker-compose.yml

# Create data folder
mkdir data

docker compose up -d
```

The app is available at `http://localhost:8080` by default.


## Skills for AI Agents.

The skill is located at `./skills/bbtodo/SKILL.md`.

As a human, copy the `./skills/bbtodo/scripts/.env.example` to `./skills/bbtodo/scripts/.env` and edit it the base url and API token.

Then tell your AI agent to use it whenever they work. If you have an `AGENTS.md` file, you can include a default instruction such as:

```md
Always use `$bbtodo` at `./skills/bbtodo/SKILL.md` for work tracking: create a task before substantial work, move it to In Progress when active work starts, and move it to In review when the work is ready.
```

When a human asks the agent to start working on an existing ticket such as `BBTO-45`, tell the agent to run `start --ticket-id BBTO-45` so it fetches the task title and description from BBTodo before attaching tracking metadata.

You can also ask your AI agent to do the above steps for you.
