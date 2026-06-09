# Agent Office 🏢

A live virtual office for your Hermes AI dev team. Real-time WebSocket dashboard showing team roster, kanban board, activity feed, standup summary, and agent chat.

## Quick Start

```bash
git clone https://github.com/sigitdanip/agent-office.git
cd agent-office
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:3000` in your browser.

## What You See

- **Team Roster** — all 12 specialist profiles with live status (idle/running/blocked)
- **Kanban Board** — tasks grouped by status, color-coded by assignee, click for details
- **Activity Feed** — real-time task events stream
- **Standup Summary** — sprint health at a glance
- **Agent Chat** — kanban task comments as chat bubbles

## Data Source

Reads the Hermes kanban SQLite database directly (read-only). Point `KANBAN_DB` in `.env` to your kanban DB path.

## Tech

- Node.js + Express + WebSocket
- Vanilla JS frontend (no framework)
- Pre-built SQLite reading via better-sqlite3
- Updates every 2 seconds via delta polling
