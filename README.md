# Pub/Sub Visualiser

A real-time, animated visualisation of an in-process **publish/subscribe** system. A
.NET backend runs publishers and subscribers over the [MessagePipe](https://github.com/Cysharp/MessagePipe)
bus and streams every event to a React frontend over **Server-Sent Events**, where
messages fly between actors as animated particles.

<p align="center">
  <img src="docs/architecture.svg" alt="Animated architecture diagram" width="100%">
</p>

> The diagram above is a self-animating SVG — flowing connections and travelling
> data packets show the live path of an event through the system. It's generated
> from the real actor wiring by [`scripts/generate-arch-svg.mjs`](scripts/generate-arch-svg.mjs),
> and the app renders an interactive version of it under the **⬡ Architecture** toggle.

## How it works

```
React UI ──▶ REST API ──▶ Publishers ──▶ ┌─────────────┐ ──▶ Subscribers
   ▲                                      │ MessagePipe │
   └────────── SSE /events ◀───────────── │     Bus     │ ◀── (consumed events)
                                          └─────────────┘
            ChaosService ─▶ Publishers          Config ─▶ Subscribers (delay)
```

1. A **Publisher** fires a typed event (`randomNumber`, `randomAlphabet`, `randomColor`, `randomEmoji`) onto the MessagePipe bus.
2. **Subscribers** listening to that event handle it (after a configurable delay) and re-publish a `consumed` event.
3. A single **SSE endpoint** (`/events`) subscribes to every topic and streams each occurrence to the browser.
4. The **frontend** turns each streamed event into a particle animation, pulses the wiring between cards, and updates live stats.

## Features

- ⚡ **Live particle flow** — every event animates from publisher to each listening subscriber.
- 🔌 **SSE streaming** — backend pushes events to the UI in real time; no polling.
- 🧩 **Fan-out & multi-subscribe** — e.g. `AnyEventLogger` listens to all 4 events, `AlphanumericSubscriber` to 2.
- 💥 **Chaos mode** — `ChaosService` auto-fires random publishers at a configurable interval.
- ⚠️ **Failure simulation** — `FailingSubscriber` fails ~30% of the time with up to 3 retries, rendered with retry/failed badges.
- 🎚️ **Live config** — adjust subscriber processing delay from the UI and watch the animation speed respond.
- ⬡ **Animated architecture diagram** — a fully animated SVG view of the running system, baked into the app.

## Tech stack

| Layer | Stack |
|-------|-------|
| Backend | .NET 8 Minimal API, [MessagePipe](https://github.com/Cysharp/MessagePipe) in-process pub/sub, SSE via `System.Threading.Channels` |
| Frontend | React 19 + TypeScript, Vite, animated SVG (CSS keyframes + SMIL) |

## Project structure

```
pubsub-visualiser/
├── backend/                       # ASP.NET Core Minimal API
│   ├── Program.cs                 # endpoints, actor wiring, SSE stream
│   └── Services/                  # Publisher, Subscriber, FailingSubscriber, ChaosService, Config
├── frontend/                      # React + Vite app
│   └── src/
│       ├── App.tsx                # state orchestration + SSE client
│       └── components/            # ParticleLayer, WiringLayer, StatsBar, ArchitectureDiagram
├── docs/architecture.svg          # generated animated diagram (used in this README)
└── scripts/generate-arch-svg.mjs  # regenerates docs/architecture.svg
```

## Getting started

**Prerequisites:** [.NET 8 SDK](https://dotnet.microsoft.com/download) and [Node.js 18+](https://nodejs.org).

### 1. Backend (port 5080)

```bash
cd backend
dotnet run
```

### 2. Frontend (port 5173)

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. Click **⚡ Publish all**, flip on **Chaos**, and toggle **⬡ Architecture**.

## API

| Method | Route | Description |
|--------|-------|-------------|
| `GET`  | `/actors` | All publishers and subscribers with their event names |
| `POST` | `/publishers/{name}/publish` | Fire a single publisher |
| `POST` | `/publish-all` | Fire every publisher once |
| `GET`  | `/events` | **SSE** stream of every event on the bus |
| `GET` / `PUT` | `/config` | Read / set the subscriber processing delay (ms) |
| `GET`  | `/chaos` | Chaos mode status |
| `POST` | `/chaos/start` · `/chaos/stop` | Start / stop auto-firing |

## Regenerating the diagram

The architecture SVG is generated from the actual actor wiring:

```bash
node scripts/generate-arch-svg.mjs
```

---

🤖 Architecture diagram and scaffolding generated with [Claude Code](https://claude.com/claude-code)
