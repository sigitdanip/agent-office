import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3000';

test.describe('Board view regression', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await page.waitForFunction(() => {
      const el = document.getElementById('conn-status');
      return el && el.textContent === 'Connected';
    }, { timeout: 10000 });
  });

  test('All panels render on load', async ({ page }) => {
    await expect(page.locator('#kanban-board')).toBeVisible();
    await expect(page.locator('#roster-list')).toBeVisible();
    await expect(page.locator('#activity-feed')).toBeVisible();
    await expect(page.locator('#standup-body')).toBeVisible();
    await expect(page.locator('#chat-body')).toBeVisible();
  });

  test('Kanban columns count >= 6', async ({ page }) => {
    const cols = page.locator('.kanban-col');
    const colCount = await cols.count();
    expect(colCount).toBeGreaterThanOrEqual(6);
  });

  test('Task count displayed', async ({ page }) => {
    await expect(page.locator('#task-count')).toBeVisible();
    const tcText = await page.locator('#task-count').textContent();
    expect(tcText).toMatch(/\d+ tasks/);
  });

  test('Team tabs visible and switchable', async ({ page }) => {
    await expect(page.locator('.team-tab[data-team="dev"]')).toBeVisible();
    await expect(page.locator('.team-tab[data-team="paper"]')).toBeVisible();

    await page.locator('.team-tab[data-team="paper"]').click();
    await page.waitForTimeout(500);
    await expect(page.locator('#kanban-board')).toBeVisible();

    await page.locator('.team-tab[data-team="dev"]').click();
    await page.waitForTimeout(500);
    await expect(page.locator('#kanban-board')).toBeVisible();
  });

  test('Task modal opens and closes', async ({ page }) => {
    const taskCard = page.locator('.task-card').first();
    const count = await taskCard.count();
    if (count > 0) {
      await taskCard.click();
      await page.waitForTimeout(300);
      await expect(page.locator('#modal-overlay')).toHaveClass(/open/);
      await expect(page.locator('#modal-title')).toBeVisible();
      await page.locator('#modal-close-btn').click();
      await page.waitForTimeout(300);
      await expect(page.locator('#modal-overlay')).not.toHaveClass(/open/);
    }
  });

  test('No console errors on board view', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', err => errors.push(err.message));

    await page.goto(BASE);
    await page.waitForFunction(() => {
      const el = document.getElementById('conn-status');
      return el && el.textContent === 'Connected';
    }, { timeout: 10000 });

    await page.locator('.team-tab[data-team="paper"]').click();
    await page.waitForTimeout(500);
    await page.locator('.team-tab[data-team="dev"]').click();
    await page.waitForTimeout(500);

    expect(errors).toEqual([]);
  });

  test('Mobile nav visible at mobile breakpoint', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(BASE);
    await page.waitForTimeout(1000);

    await expect(page.locator('.mobile-nav')).toBeVisible();
    await expect(page.locator('.mobile-nav-item[data-mview="board"]')).toBeVisible();
    await expect(page.locator('.mobile-nav-item[data-mview="team"]')).toBeVisible();
  });
});
