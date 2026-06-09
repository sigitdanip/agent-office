# Agent Office 🏢

A live virtual office for your Hermes AI dev team. Real-time WebSocket dashboard showing team roster, kanban board, activity feed, standup summary, and agent chat.

## Quick Start — Two Modes

### Option A: Open in browser (no install needed)
The VPS version is already running. Just open this:
```
http://187.77.130.62:3000
```
That's it. No clone, no npm, no setup.

### Option B: Clone and run locally (Windows / any OS)
No native compilation needed — zero C++ build tools required.

```bash
git clone https://github.com/sigitdanip/agent-office.git
cd agent-office
npm install
```

Create a `.env` file:

```env
PORT=3000
REMOTE_BACKEND=http://187.77.130.62:3000
```

Then run:
```bash
npm run dev
```

Open `http://localhost:3000` in your browser. The frontend connects to the VPS backend via WebSocket — your kanban data flows live.

## What You See

- **Team Roster** — all 12 specialist profiles with live status (idle/running/blocked)
- **Kanban Board** — tasks grouped by status, color-coded by assignee, click for details
- **Activity Feed** — real-time task events stream
- **Standup Summary** — sprint health at a glance
- **Agent Chat** — kanban task comments as chat bubbles

## Running on the VPS (standalone mode)

The VPS server reads the Hermes kanban SQLite database directly:

```env
PORT=3000
KANBAN_DB=/root/.hermes/kanban.db
POLL_INTERVAL=2000
```

```bash
npm run dev
```

## Tech

- Node.js + Express + WebSocket
- Vanilla JS frontend (no framework, zero build step)
- `better-sqlite3` on VPS (native), pure Express + ws on Windows (no native deps)
- DB polling every 2 seconds for delta updates
