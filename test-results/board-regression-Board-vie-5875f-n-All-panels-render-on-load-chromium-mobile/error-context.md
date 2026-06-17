# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: board-regression.spec.js >> Board view regression >> All panels render on load
- Location: tests/e2e/board-regression.spec.js:15:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator:  locator('#roster-list')
Expected: visible
Received: hidden
Timeout:  10000ms

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('#roster-list')
    24 × locator resolved to <div id="roster-list" class="panel-body">…</div>
       - unexpected value "hidden"

```

```yaml
- banner:
  - heading "Agent Office" [level=1]
  - text: Dev Office Paper Office Connected
- text: "Board 47 tasks Parking Lot 2 Autonomous Shuttle SLAM — Vision + Sensor Fusion Simulation P1 Crypto Hedge Fund AI Workflows P0 Brainstorm 0 No active tasks Triage 0 No active tasks Todo 0 No active tasks Ready 0 No active tasks Running 7 python-dev: Fix db.js buildSnapshot() to merge heartbeat fields correctly PY P90 frontend-dev: Fix chat UI to display newest messages at top FE P80 infra-dev: Optimize Agent Office performance — query patterns, caching, compression INF P70 api-dev: Add monitoring, metrics, and structured logging to Agent Office API P60 bash-dev: Add reliability features — auth, rate limiting, graceful shutdown, zombie cleanup SH P50 dev-lead: Create Agent Office operational runbook and update documentation DL P40 qa-engineer: Validate Agent Office sprint — all bugs fixed, performance targets met, monitoring working QA P30 Blocked 0 No active tasks Done 33 explorer: Audit Agent Office codebase for bugs, performance issues, and best practices violations EXP P100 Validate paper team kanban worker migration QA P2 Update paper-lead skills to enforce kanban-first dispatch WF P2 Enable terminal toolset for paper-researcher SH P2 Add kanban config sections to paper-* sub-profiles SH P2 QA-engineer: Validate skill/tool/file fields populated reliably in inspector QA P2 python-dev: Persist _current_tool between auto-heartbeat ticks PY P2 frontend-dev: Fix inspector heartbeat selection, remove misleading fallback, use profile-enriched data FE P2 QA-engineer: Validate skill/tool/file/terminal fields populate in inspector QA P2 python-dev: Wire skill/file/tool tracking into auto-heartbeat bridge PY P2 explorer: Investigate agent runtime for skill/file tracking hooks EXP P2 API-dev: Bridge kanban worker heartbeats to agent-office heartbeat endpoint API P2 QA-engineer: Validate agent inspector with live self-reporting data QA P2 Frontend-dev: Build agent inspector panel with live terminal, skill, and tool view FE P2 API-dev: Expand heartbeat endpoint with richer payload (skill, tool, output, action) API P2 Researcher: Investigate Hermes agent runtime data available for self-reporting RCH P2 api-dev: Add heartbeat endpoint and DB columns for agent self-reporting API P2 frontend-dev: Build Board/Agents toggle per office with agent detail panel FE P2 qa-engineer: Validate upgraded Agent Office for both teams QA P2 frontend-dev: Reverse activity and chat to show newest at top FE P1 api-dev: Fix heartbeat field merging in db.js buildSnapshot() API P1 frontend-dev: Fix delete-sprint confirm dialog for testability FE P1 qa-engineer: Add E2E test suite for Agent Office (Playwright) QA P1 frontend-dev: CI/deployment panel and per-team dynamic columns FE P1 frontend-dev: Burndown and velocity charts FE P1 frontend-dev: Sprint planning and goal tracking view FE P1 api-dev: GitHub CI/deployment integration endpoint API P1 api-dev: Sprint data model, dynamic columns, and sprint API endpoints API P1 api-dev: Include dev-lead in agent-office profile discovery API P0 explorer: Process kanban audit and define sprint/column/CI models EXP P0 Wire GitHub Actions CI status into Agent Office dashboard INF P0 Implement sprint data model as sprints.db with CRUD API API P0 Redesign Agent Office UI — dark cyber/brutalist theme, no emojis - Replace all emoji icons with text/ASCII labels (🤖→AI, 🐍→PY, etc.) - Dark theme with cyber/HUD aesthetics: deep blacks, neon accents (cyan/green), sharp borders - Brutalist/minimal: no rounded corners, no gradients, no shadows - Monospace/techy font where appropriate - High contrast text, minimal visual noise - Keep the 5 panels but make them feel like a terminal dashboard FE P0 sprint-1 Board Team Activity Standup --"
- button "X"
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | const BASE = 'http://localhost:3000';
  4  | 
  5  | test.describe('Board view regression', () => {
  6  | 
  7  |   test.beforeEach(async ({ page }) => {
  8  |     await page.goto(BASE);
  9  |     await page.waitForFunction(() => {
  10 |       const el = document.getElementById('conn-status');
  11 |       return el && el.textContent === 'Connected';
  12 |     }, { timeout: 10000 });
  13 |   });
  14 | 
  15 |   test('All panels render on load', async ({ page }) => {
  16 |     await expect(page.locator('#kanban-board')).toBeVisible();
> 17 |     await expect(page.locator('#roster-list')).toBeVisible();
     |                                                ^ Error: expect(locator).toBeVisible() failed
  18 |     await expect(page.locator('#activity-feed')).toBeVisible();
  19 |     await expect(page.locator('#standup-body')).toBeVisible();
  20 |     await expect(page.locator('#chat-body')).toBeVisible();
  21 |   });
  22 | 
  23 |   test('Kanban columns count >= 6', async ({ page }) => {
  24 |     const cols = page.locator('.kanban-col');
  25 |     const colCount = await cols.count();
  26 |     expect(colCount).toBeGreaterThanOrEqual(6);
  27 |   });
  28 | 
  29 |   test('Task count displayed', async ({ page }) => {
  30 |     await expect(page.locator('#task-count')).toBeVisible();
  31 |     const tcText = await page.locator('#task-count').textContent();
  32 |     expect(tcText).toMatch(/\d+ tasks/);
  33 |   });
  34 | 
  35 |   test('Team tabs visible and switchable', async ({ page }) => {
  36 |     await expect(page.locator('.team-tab[data-team="dev"]')).toBeVisible();
  37 |     await expect(page.locator('.team-tab[data-team="paper"]')).toBeVisible();
  38 | 
  39 |     await page.locator('.team-tab[data-team="paper"]').click();
  40 |     await page.waitForTimeout(500);
  41 |     await expect(page.locator('#kanban-board')).toBeVisible();
  42 | 
  43 |     await page.locator('.team-tab[data-team="dev"]').click();
  44 |     await page.waitForTimeout(500);
  45 |     await expect(page.locator('#kanban-board')).toBeVisible();
  46 |   });
  47 | 
  48 |   test('Task modal opens and closes', async ({ page }) => {
  49 |     const taskCard = page.locator('.task-card').first();
  50 |     const count = await taskCard.count();
  51 |     if (count > 0) {
  52 |       await taskCard.click();
  53 |       await page.waitForTimeout(300);
  54 |       await expect(page.locator('#modal-overlay')).toHaveClass(/open/);
  55 |       await expect(page.locator('#modal-title')).toBeVisible();
  56 |       await page.locator('#modal-close-btn').click();
  57 |       await page.waitForTimeout(300);
  58 |       await expect(page.locator('#modal-overlay')).not.toHaveClass(/open/);
  59 |     }
  60 |   });
  61 | 
  62 |   test('No console errors on board view', async ({ page }) => {
  63 |     const errors = [];
  64 |     page.on('console', msg => {
  65 |       if (msg.type() === 'error') errors.push(msg.text());
  66 |     });
  67 |     page.on('pageerror', err => errors.push(err.message));
  68 | 
  69 |     await page.goto(BASE);
  70 |     await page.waitForFunction(() => {
  71 |       const el = document.getElementById('conn-status');
  72 |       return el && el.textContent === 'Connected';
  73 |     }, { timeout: 10000 });
  74 | 
  75 |     await page.locator('.team-tab[data-team="paper"]').click();
  76 |     await page.waitForTimeout(500);
  77 |     await page.locator('.team-tab[data-team="dev"]').click();
  78 |     await page.waitForTimeout(500);
  79 | 
  80 |     expect(errors).toEqual([]);
  81 |   });
  82 | 
  83 |   test('Mobile nav visible at mobile breakpoint', async ({ page }) => {
  84 |     await page.setViewportSize({ width: 375, height: 667 });
  85 |     await page.goto(BASE);
  86 |     await page.waitForTimeout(1000);
  87 | 
  88 |     await expect(page.locator('.mobile-nav')).toBeVisible();
  89 |     await expect(page.locator('.mobile-nav-item[data-mview="board"]')).toBeVisible();
  90 |     await expect(page.locator('.mobile-nav-item[data-mview="team"]')).toBeVisible();
  91 |   });
  92 | });
  93 | 
```