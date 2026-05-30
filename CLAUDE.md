# Pub/Sub Visualiser

Interactive visualiser for a publish/subscribe system. A .NET backend runs publishers and
subscribers over a swappable message bus and streams live activity to a React frontend via
Server-Sent Events. Includes chaos/retry simulation, a dead-letter queue with replay, and a
full observability stack (Prometheus, Grafana, Jaeger).

## Layout

- `backend/` — ASP.NET Core (net8.0) minimal-API. Endpoints in `Program.cs`.
  - `Services/Messaging/` — `IMessageBus` transport seam + `InProcess` and `Kafka` adapters.
  - `Services/Observability/Telemetry.cs` — OpenTelemetry instruments (custom `pubsub_*` metrics).
  - `Services/` — `Publisher`, `Subscriber`, `FailingSubscriber` (chaos/retry), `DeadLetterStore`.
- `frontend/` — React + Vite + TypeScript. UI and SSE wiring in `src/App.tsx`.
- `ops/` — Prometheus config + Grafana provisioning/dashboards.
- `docker-compose*.yml` — base app, Kafka, and observability stacks.

## Run locally (no Docker)

```bash
# Backend → http://localhost:5080
cd backend && ASPNETCORE_URLS=http://localhost:5080 Bus__Provider=inprocess dotnet run

# Frontend → http://localhost:5173 (proxies API calls to :5080)
cd frontend && npm install && npm run dev
```

The frontend targets `VITE_API_URL` (default `http://localhost:5080`). CORS on the backend
allows `:5173` and `:8080` by default.

## Run with Docker

```bash
docker compose up                                          # app: frontend :8080, backend :5080
docker compose -f docker-compose.yml -f docker-compose.kafka.yml up          # + Kafka :9092, kafka-ui :8085
docker compose -f docker-compose.yml -f docker-compose.observability.yml up  # + Prometheus :9090, Grafana :3000, Jaeger
```

## Configuration (`backend/appsettings.json` or env)

- `Bus:Provider` — `inprocess` (default) or `kafka`. Env form: `Bus__Provider`.
- `Kafka:BootstrapServers` (default `localhost:9092`), `Kafka:TopicPrefix` (default `pubsub.`).
- `Otlp:Endpoint` — set to a collector/Jaeger endpoint to enable OTLP trace export (off when empty).
- `Cors:AllowedOrigins` — string array; overrides the default localhost origins.

## Key endpoints

- `GET /actors` — publisher/subscriber topology.
- `GET /events` — SSE stream of live publish/consume events (the UI's data source).
- `POST /publish-all`, `POST /publishers/{name}/publish` — trigger messages.
- `GET /dead-letters`, `POST /dead-letters/{id}/replay` — DLQ inspect/replay.
- `GET /metrics` — Prometheus scrape endpoint (custom `pubsub_*` + ASP.NET Core/runtime metrics).
- `POST /chaos/start`, `POST /chaos/stop` — toggle injected failures.

## Build & test

```bash
cd backend  && dotnet build      # restores + builds; restore must be warning-free (NuGet audit)
cd frontend && npm run lint && npm run build
```

CI (`.github/workflows/ci.yml`) builds both apps and runs an in-process backend smoke test
(boots the API, checks `/actors` exposes the DLQ, asserts `pubsub_*` metrics are exported).

## Conventions

- Validate input at system boundaries; keep files focused (~500 lines).
- Don't commit secrets or `.env` files.
- OpenTelemetry packages are pinned together on the 1.15.x line — bump them as a set.
