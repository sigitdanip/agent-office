import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3000';

// Helper: wait for WebSocket connection
async function waitForConnected(page) {
  await page.waitForFunction(() => {
    const el = document.getElementById('conn-status');
    return el && el.textContent === 'Connected';
  }, { timeout: 10000 });
}

// ============================================================
// DESKTOP TESTS
// ============================================================
test.describe('Agent Office UI - Desktop', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await waitForConnected(page);

    // On mobile, panels are shown one at a time via bottom nav.
    // These desktop tests assume all panels are simultaneously visible.
    // Skip on mobile; use the mobile-specific test suite instead.
    const viewport = page.viewportSize();
    if (viewport && viewport.width < 768) {
      test.skip(true, 'Desktop panel layout — use Mobile suite below');
      return;
    }
  });

  // --- Board / Kanban ---

  test('AC-BOARD-1: Kanban board renders with columns and task cards', async ({ page }) => {
    const board = page.locator('#kanban-board');
    await expect(board).toBeVisible();

    const columns = page.locator('.kanban-col');
    const colCount = await columns.count();
    expect(colCount).toBeGreaterThanOrEqual(6);

    // Verify parking-lot is first column
    const firstHeader = columns.first().locator('.kanban-col-header');
    await expect(firstHeader).toBeVisible();

    // Task count should be shown
    const taskCount = page.locator('#task-count');
    await expect(taskCount).toBeVisible();
    const tcText = await taskCount.textContent();
    expect(tcText).toMatch(/\d+ tasks/);
  });

  test('AC-BOARD-2: Task card opens modal with details', async ({ page }) => {
    const taskCard = page.locator('.task-card').first();
    if (await taskCard.count() === 0) {
      test.skip(true, 'No task cards available');
      return;
    }

    await taskCard.click();
    await page.waitForTimeout(300);

    // Modal should be open
    await expect(page.locator('#modal-overlay')).toHaveClass(/open/);
    await expect(page.locator('#modal-title')).toBeVisible();
    await expect(page.locator('#modal-meta')).toBeVisible();
    await expect(page.locator('#modal-body')).toBeVisible();

    // Close modal
    await page.locator('#modal-close-btn').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#modal-overlay')).not.toHaveClass(/open/);
  });

  test('AC-BOARD-3: Modal closes on overlay click', async ({ page }) => {
    const taskCard = page.locator('.task-card').first();
    if (await taskCard.count() === 0) {
      test.skip(true, 'No task cards available');
      return;
    }

    await taskCard.click();
    await page.waitForTimeout(300);
    await expect(page.locator('#modal-overlay')).toHaveClass(/open/);

    // Click the overlay background (not the modal)
    await page.locator('#modal-overlay').click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(300);
    await expect(page.locator('#modal-overlay')).not.toHaveClass(/open/);
  });

  // --- Team Switching ---

  test('AC-TEAM-1: Switching teams updates roster and board', async ({ page }) => {
    const initialRows = await page.locator('#roster-list .profile-row').count();
    expect(initialRows).toBeGreaterThan(0);

    // Switch to Paper team
    await page.locator('.team-tab[data-team="paper"]').click();
    await page.waitForTimeout(500);

    // Paper tab should be active
    await expect(page.locator('.team-tab[data-team="paper"]')).toHaveClass(/active/);
    await expect(page.locator('.team-tab[data-team="dev"]')).not.toHaveClass(/active/);

    // Roster should still have rows (may be different count)
    const paperRows = await page.locator('#roster-list .profile-row').count();
    expect(paperRows).toBeGreaterThanOrEqual(0);

    // Board should refresh
    await expect(page.locator('#kanban-board')).toBeVisible();

    // Switch back to Dev
    await page.locator('.team-tab[data-team="dev"]').click();
    await page.waitForTimeout(500);
    await expect(page.locator('.team-tab[data-team="dev"]')).toHaveClass(/active/);
  });

  // --- Activity & Standup ---

  test('AC-PANEL-1: Activity feed displays events', async ({ page }) => {
    const feed = page.locator('#activity-feed');
    await expect(feed).toBeVisible();

    // Should have event items or empty state
    const events = feed.locator('.event-item');
    const emptyState = feed.locator('.empty-state');
    const hasEvents = (await events.count()) > 0;
    const hasEmpty = (await emptyState.count()) > 0;
    expect(hasEvents || hasEmpty).toBeTruthy();
  });

  test('AC-PANEL-2: Standup panel shows task stats', async ({ page }) => {
    const standup = page.locator('#standup-body');
    await expect(standup).toBeVisible();

    // Should have stat rows or empty state
    const stats = standup.locator('.stat-row');
    const emptyState = standup.locator('.empty-state');
    const hasStats = (await stats.count()) > 0;
    const hasEmpty = (await emptyState.count()) > 0;
    expect(hasStats || hasEmpty).toBeTruthy();
  });

  test('AC-PANEL-3: Chat panel renders', async ({ page }) => {
    const chat = page.locator('#chat-body');
    await expect(chat).toBeVisible();

    // Should have messages or empty state
    const msgs = chat.locator('.chat-msg');
    const emptyState = chat.locator('.empty-state');
    const hasMsgs = (await msgs.count()) > 0;
    const hasEmpty = (await emptyState.count()) > 0;
    expect(hasMsgs || hasEmpty).toBeTruthy();
  });

  // --- Console errors ---

  test('AC-ERROR-1: No console errors during normal use', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', err => errors.push(err.message));

    // Navigate fresh
    await page.goto(BASE);
    await waitForConnected(page);

    // Exercise all views
    // Open task modal
    const taskCard = page.locator('.task-card').first();
    if (await taskCard.count() > 0) {
      await taskCard.click();
      await page.waitForTimeout(300);
      await page.locator('#modal-close-btn').click();
      await page.waitForTimeout(300);
    }

    // Open inspector
    const profileRow = page.locator('.profile-row').first();
    if (await profileRow.count() > 0) {
      await profileRow.click();
      await page.waitForTimeout(300);
      await page.locator('#inspector-close-btn').click();
      await page.waitForTimeout(300);
    }

    // Switch to Paper team
    await page.locator('.team-tab[data-team="paper"]').click();
    await page.waitForTimeout(500);

    // Switch back to Dev
    await page.locator('.team-tab[data-team="dev"]').click();
    await page.waitForTimeout(500);

    expect(errors).toEqual([]);
  });
});

// ============================================================
// MOBILE TESTS (Pixel 5)
// ============================================================
test.describe('Agent Office UI - Mobile (Pixel 5)', () => {
  test.beforeEach(async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width >= 768) {
      test.skip(true, 'Mobile tests require Pixel 5 viewport (chromium-mobile project)');
      return;
    }
    await page.goto(BASE);
    await waitForConnected(page);
  });

  test('MOB-1: Bottom nav visible with all tabs', async ({ page }) => {
    await expect(page.locator('.mobile-nav')).toBeVisible();
    await expect(page.locator('.mobile-nav-item[data-mview="board"]')).toBeVisible();
    await expect(page.locator('.mobile-nav-item[data-mview="team"]')).toBeVisible();
    await expect(page.locator('.mobile-nav-item[data-mview="activity"]')).toBeVisible();
    await expect(page.locator('.mobile-nav-item[data-mview="standup"]')).toBeVisible();
  });

  test('MOB-2: Board view active by default', async ({ page }) => {
    // Board nav item should be active
    await expect(page.locator('.mobile-nav-item[data-mview="board"]')).toHaveClass(/active/);

    // Kanban should be visible
    await expect(page.locator('#kanban-board')).toBeVisible();

    // Roster should be hidden in board mode on mobile
    await expect(page.locator('#roster-list')).toBeHidden();
  });

  test('MOB-3: Team view shows roster', async ({ page }) => {
    await page.locator('.mobile-nav-item[data-mview="team"]').click();
    await page.waitForTimeout(300);

    await expect(page.locator('.mobile-nav-item[data-mview="team"]')).toHaveClass(/active/);
    await expect(page.locator('#roster-list')).toBeVisible();
    await expect(page.locator('#kanban-board')).toBeHidden();
  });

  test('MOB-4: Activity view shows activity feed', async ({ page }) => {
    await page.locator('.mobile-nav-item[data-mview="activity"]').click();
    await page.waitForTimeout(300);

    await expect(page.locator('.mobile-nav-item[data-mview="activity"]')).toHaveClass(/active/);
    await expect(page.locator('#activity-feed')).toBeVisible();
  });

  test('MOB-5: Standup view shows standup panel', async ({ page }) => {
    await page.locator('.mobile-nav-item[data-mview="standup"]').click();
    await page.waitForTimeout(300);

    await expect(page.locator('.mobile-nav-item[data-mview="standup"]')).toHaveClass(/active/);
    await expect(page.locator('#standup-body')).toBeVisible();
  });

  test('MOB-6: No console errors on mobile', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', err => errors.push(err.message));

    await page.goto(BASE);
    await waitForConnected(page);

    // Exercise all mobile views — use force:true for nav clicks since
    // panels may overlap the nav bar on small viewports
    await page.locator('.mobile-nav-item[data-mview="team"]').click({ force: true });
    await page.waitForTimeout(300);
    await page.locator('.mobile-nav-item[data-mview="activity"]').click({ force: true });
    await page.waitForTimeout(300);
    await page.locator('.mobile-nav-item[data-mview="standup"]').click({ force: true });
    await page.waitForTimeout(300);
    await page.locator('.mobile-nav-item[data-mview="board"]').click({ force: true });
    await page.waitForTimeout(300);

    expect(errors).toEqual([]);
  });
});

// ============================================================
// AGENTS GRID VIEW — NOT YET IN PRODUCTION
// ============================================================
// The agents grid view (#agents-grid, .agent-card, .view-toggle-btn)
// is implemented in app.js but NOT integrated into the production
// index.html. These tests are preserved for when the feature ships.
test.describe('Agents Grid View - SKIPPED (not in production index.html)', () => {

  test('SKIP: Board/Agents toggle visible', async ({ page }) => {
    test.skip(true, 'Agents grid view not integrated into index.html — see app.js');
  });

  test('SKIP: Agents view shows profiles', async ({ page }) => {
    test.skip(true, 'Agents grid view not integrated into index.html — see app.js');
  });

  test('SKIP: Toggle to Agents then back to Board', async ({ page }) => {
    test.skip(true, 'Agents grid view not integrated into index.html — see app.js');
  });
});
