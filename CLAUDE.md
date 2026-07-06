# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

LocalDeck is a single-page dashboard to control local dev services (start/stop/restart, live logs, CPU/RAM, port scanning) on a **Windows** machine — like Render/Railway but everything runs on your own box. It is an npm workspaces monorepo: a `server` (Node + Express + ws) that manages processes and a `client` (React + Vite) dashboard.

## Commands

Run from the repo root:

```bash
npm install          # installs both workspaces
npm run dev          # concurrently runs server (watch) + client (vite) — dashboard at http://localhost:5199
npm start            # production: server only (npm run start -w server)
```

Per-workspace:

```bash
npm run dev -w server      # node --watch src/index.js (API + WS on port 4600)
npm run build -w client    # tsc -b && vite build
npm run lint -w client     # oxlint (not eslint)
```

There is **no test suite** and no server-side lint/build step (server is plain ESM `.js`, run directly). `client` uses **oxlint**, not eslint.

Ports: client dev server `5199` (Vite proxies `/api` and `/ws` to the backend), backend `4600` (override with env `LOCALDECK_PORT`).

## Architecture

Everything on the server hangs off one **`PortScanner`** that ticks every 3s and is the single source of truth for machine state. Three consumers subscribe to its `scan` event, and their outputs are broadcast to all WebSocket clients from [server/src/index.js](server/src/index.js):

- **`PortScanner`** ([portScanner.js](server/src/portScanner.js)) — each tick runs `netstat -ano` (listening TCP ports) **and** a PowerShell `Get-CimInstance Win32_Process` in parallel (uses CIM, not `wmic`, which newer Windows 11 dropped). Gives the full process table with PPID, so `treePids(rootPid)` can BFS a whole process tree. `rescan()` forces a fresh scan immediately (used right after start/stop so status doesn't lag a whole tick).
- **`ServiceManager`** ([serviceManager.js](server/src/serviceManager.js)) — the registry + process controller. Spawns commands with `shell: true` (needed for `.cmd` like `npm` on Windows) and kills whole trees with `tree-kill` (no orphaned ports). Emits `status`/`services`/`log` events.
- **`StatsCollector`** ([statsCollector.js](server/src/statsCollector.js)) — computes per-service CPU% (delta of CPU time between two scans, normalized by core count, Task-Manager style) and summed RAM over each service's process tree.

### The status model (central concept)

A service's effective status is **derived**, not stored — see `ServiceManager.statusOf(id)`:

- `stopped` — not running
- `starting` — spawned, waiting for its `port` to appear in the scan
- `running` — a process **we** spawned is alive
- `external` — the service's `port` is listening but owned by a process we did **not** spawn (e.g. a Redis already running). Detected purely from the port scan.
- `crashed` — our process exited non-zero without a stop request

When editing status logic, keep in mind: `starting → running` is promoted in `_onScan` when the port shows up; `external` is inferred every scan; and status is only re-broadcast when it actually changes (`_emitStatus(id, onlyIfChanged)` against `lastStatus`).

### Server ↔ client contract

REST for actions (`/api/services...`, `/api/ports/:pid/kill`, `/api/services/:id/open-folder`), **WebSocket (`/ws`) for all live state** — on connect the server sends one `init` message, then pushes `status` / `services` / `stats` / `ports` / `log` messages. The discriminated union of these messages lives in [client/src/types.ts](client/src/types.ts) (`ServerMessage`) and **must stay in sync** with what `index.js` broadcasts. The client keeps a single app-wide socket with auto-reconnect ([useWebSocket.ts](client/src/hooks/useWebSocket.ts)) and reduces messages into state in [App.tsx](client/src/App.tsx).

### Persistence & logs

- Service registry is a flat JSON file at [server/data/services.json](server/data/services.json) via [store.js](server/src/store.js). Hand-editable. There is no database.
- Logs are in-memory only: a per-service ring buffer of the last 1000 lines ([logBuffer.js](server/src/logBuffer.js)), which also stitches partial chunks into whole lines and strips ANSI codes. Not persisted across server restarts.

## Windows-specific constraints

This project assumes Windows and will not work as-is elsewhere:

- Port/process scanning uses `netstat` + PowerShell CIM.
- Process spawning uses `shell: true`; env sets `NO_COLOR: '1'` (do **not** use `FORCE_COLOR=0` — picocolors treats the mere presence of `FORCE_COLOR` as "force color on").
- `open-folder` shells out to `explorer` / `code .`.
- On server shutdown (SIGINT/SIGTERM) all managed services are stopped so no processes/ports are left orphaned.
