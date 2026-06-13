import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3000';

async function waitForConnected(page) {
  await page.waitForFunction(() => {
    const el = document.getElementById('conn-status');
    return el && el.textContent === 'Connected';
  }, { timeout: 10000 });
}

async function sendHeartbeat(profileId, fields = {}) {
  const res = await fetch(`${BASE}/api/agents/${profileId}/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  return res.json();
}

async function getInspectorKV(page, label) {
  const body = page.locator('#inspector-body');
  const kvDivs = body.locator('.insp-kv');
  const count = await kvDivs.count();
  for (let i = 0; i < count; i++) {
    const div = kvDivs.nth(i);
    const labelText = await div.locator('.insp-kv-label').textContent();
    if (labelText && labelText.trim() === label) {
      return div.locator('.insp-kv-value').textContent();
    }
  }
  return null;
}

async function openInspectorForProfile(page, profileId) {
  const rows = page.locator('.profile-row');
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    const pid = await row.getAttribute('data-profile-id');
    if (pid === profileId) {
      await row.click();
      await page.waitForTimeout(300);
      return true;
    }
  }
  return false;
}

test.describe('Inspector Field Reliability — AC Validation', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await waitForConnected(page);

    // Switch to Team view on mobile
    const viewport = page.viewportSize();
    if (viewport && viewport.width < 768) {
      await page.locator('.mobile-nav-item[data-mview="team"]').click();
      await page.waitForTimeout(300);
    }
  });

  test('AC1: Skill field shows skill name for running agent (not "--")', async ({ page }) => {
    // Send a unique rich heartbeat for this test
    await sendHeartbeat('qa-engineer', {
      taskId: 't_887d317b',
      command: 'terminal pytest --ac1',
      progress: 'Running AC1 validation',
      skill: 'accelint-ts-testing',
      toolCall: 'browser_navigate',
      fileEdited: '/tmp/ac1-test.js',
      terminalOutput: 'AC1 test output',
    });
    // Wait for WebSocket poll cycle (2s interval + buffer)
    await page.waitForTimeout(3000);

    await openInspectorForProfile(page, 'qa-engineer');

    const skillValue = await getInspectorKV(page, 'Skill');
    expect(skillValue).toBeTruthy();
    expect(skillValue).not.toBe('--');
    expect(skillValue).toBe('accelint-ts-testing');
  });

  test('AC2: Tool field shows tool name for running agent (not "--" and not misleading)', async ({ page }) => {
    // Send a unique rich heartbeat with a distinctive tool name
    const uniqueTool = 'browser_navigate_ac2_test';
    await sendHeartbeat('qa-engineer', {
      taskId: 't_887d317b',
      command: 'browser_navigate https://ac2.example.com',
      progress: 'AC2 validation',
      skill: 'web-testing',
      toolCall: uniqueTool,
      fileEdited: '/tmp/ac2-test.js',
      terminalOutput: 'AC2 test output',
    });
    await page.waitForTimeout(3000);

    await openInspectorForProfile(page, 'qa-engineer');

    const toolValue = await getInspectorKV(page, 'Tool');
    expect(toolValue).toBeTruthy();
    expect(toolValue).not.toBe('--');
    // Must be the actual tool name, not a misleading parsed word
    expect(toolValue).toBe(uniqueTool);
  });

  test('AC3: FileEdited field shows file path for running agent (not "--")', async ({ page }) => {
    const uniqueFile = '/root/agent-office/server/routes-ac3.js';
    await sendHeartbeat('qa-engineer', {
      taskId: 't_887d317b',
      command: 'patch routes-ac3.js',
      progress: 'AC3 validation',
      skill: 'typescript-refactor',
      toolCall: 'patch',
      fileEdited: uniqueFile,
      terminalOutput: 'AC3 test output',
    });
    await page.waitForTimeout(3000);

    await openInspectorForProfile(page, 'qa-engineer');

    const fileValue = await getInspectorKV(page, 'File');
    expect(fileValue).toBeTruthy();
    expect(fileValue).not.toBe('--');
    expect(fileValue).toBe(uniqueFile);
  });

  test('AC4: Terminal Output section shows recent command output', async ({ page }) => {
    const uniqueOutput = 'AC4_UNIQUE_OUTPUT_STRING_12345';
    await sendHeartbeat('qa-engineer', {
      taskId: 't_887d317b',
      command: 'echo AC4 test',
      progress: 'AC4 Done',
      terminalOutput: uniqueOutput + '\nAll good!',
    });
    await page.waitForTimeout(3000);

    await openInspectorForProfile(page, 'qa-engineer');

    const body = page.locator('#inspector-body');
    await expect(body).toContainText('Terminal Output');
    await expect(body).toContainText(uniqueOutput);
  });

  test('AC5: Values persist across heartbeat ticks (no flickering between rich and empty)', async ({ page }) => {
    // Send rich heartbeat first with unique identifiers
    const uniqueSkill = 'ac5-persistence-skill';
    const uniqueTool = 'ac5-persistence-tool';
    const uniqueFile = '/tmp/ac5-persistence-file.js';

    await sendHeartbeat('qa-engineer', {
      taskId: 't_887d317b',
      command: 'terminal ac5-build',
      progress: 'Building AC5 45%',
      progressPct: 45,
      skill: uniqueSkill,
      toolCall: uniqueTool,
      fileEdited: uniqueFile,
      terminalOutput: 'AC5 Building...',
    });
    await page.waitForTimeout(3000);

    await openInspectorForProfile(page, 'qa-engineer');

    // Verify rich data is showing
    let skillVal = await getInspectorKV(page, 'Skill');
    let toolVal = await getInspectorKV(page, 'Tool');
    let fileVal = await getInspectorKV(page, 'File');
    expect(skillVal).toBe(uniqueSkill);
    expect(toolVal).toBe(uniqueTool);
    expect(fileVal).toBe(uniqueFile);

    // Now send an empty heartbeat (simulates kanban system tick with no rich data)
    await sendHeartbeat('qa-engineer', {
      taskId: 't_887d317b',
      command: 'idle',
      // No skill, tool, fileEdited — intentionally empty
    });
    await page.waitForTimeout(3000);

    // Re-check inspector values — should NOT flicker to '--'
    // We need to re-open or refresh to see if the snapshot update caused flicker
    // Close and re-open inspector
    await page.locator('#inspector-close-btn').click();
    await page.waitForTimeout(300);
    await openInspectorForProfile(page, 'qa-engineer');

    skillVal = await getInspectorKV(page, 'Skill');
    toolVal = await getInspectorKV(page, 'Tool');
    fileVal = await getInspectorKV(page, 'File');

    // AC5: Values should persist, not flicker to '--'
    // NOTE: This may fail if the empty heartbeat overwrites snapshot profile data
    // AND the rich heartbeat falls outside event window. This is the known bug.
    if (skillVal === '--' || toolVal === '--' || fileVal === '--') {
      console.log('AC5 FLICKER DETECTED: Values flickered to "--" after empty heartbeat');
      console.log(`  skill: "${skillVal}", tool: "${toolVal}", file: "${fileVal}"`);
    }
    // Soft assertion — document the behavior
    expect(skillVal, 'Skill should persist after empty heartbeat').not.toBe('--');
    expect(toolVal, 'Tool should persist after empty heartbeat').not.toBe('--');
    expect(fileVal, 'File should persist after empty heartbeat').not.toBe('--');
  });

  test('AC6: Idle agents show "--" for all inspector fields (no regression)', async ({ page }) => {
    // Find an idle profile (not qa-engineer which is running)
    const rows = page.locator('.profile-row');
    const count = await rows.count();
    let idleProfileId = null;
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const statusEl = row.locator('.profile-status');
      const status = await statusEl.textContent();
      if (status === 'Idle') {
        idleProfileId = await row.getAttribute('data-profile-id');
        await row.click();
        await page.waitForTimeout(500);
        break;
      }
    }

    if (!idleProfileId) {
      test.skip(true, 'No idle profiles found');
      return;
    }

    // Check that skill, tool, file fields show '--' for idle agent
    const skillValue = await getInspectorKV(page, 'Skill');
    const toolValue = await getInspectorKV(page, 'Tool');
    const fileValue = await getInspectorKV(page, 'File');

    expect(skillValue).toBe('--');
    expect(toolValue).toBe('--');
    expect(fileValue).toBe('--');
  });

  test('AC7: Inspector works for both Dev and Paper teams', async ({ page }) => {
    // Dev team — open inspector for running agent
    await openInspectorForProfile(page, 'qa-engineer');
    await expect(page.locator('#inspector-panel')).toHaveClass(/open/);

    // Check skill field shows data on dev
    const devSkill = await getInspectorKV(page, 'Skill');
    expect(devSkill).toBeTruthy();
    expect(devSkill).not.toBe('--');

    // Close inspector
    await page.locator('#inspector-close-btn').click();
    await page.waitForTimeout(200);

    // Switch to Paper team
    await page.locator('.team-tab[data-team="paper"]').click();
    await page.waitForTimeout(500);

    // Click a paper profile
    const paperRows = page.locator('#roster-list .profile-row');
    const paperCount = await paperRows.count();
    if (paperCount > 0) {
      await paperRows.first().click();
      await page.waitForTimeout(300);
      await expect(page.locator('#inspector-panel')).toHaveClass(/open/);

      // Paper profile should show header
      const name = page.locator('#inspector-name');
      await expect(name).toBeVisible();
      expect((await name.textContent()).length).toBeGreaterThan(0);
    }
  });

  test('AC8: Inspector works on mobile', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width >= 768) {
      test.skip(true, 'Mobile tests require Pixel 5 viewport (chromium-mobile project)');
      return;
    }

    // Switch to Team view
    await page.locator('.mobile-nav-item[data-mview="team"]').click();
    await page.waitForTimeout(300);

    // Open inspector for qa-engineer
    await openInspectorForProfile(page, 'qa-engineer');

    // Inspector should be open
    await expect(page.locator('#inspector-panel')).toHaveClass(/open/);

    // Should see Live Data section with skill/tool/file fields
    const body = page.locator('#inspector-body');
    await expect(body).toContainText('Live Data');
    await expect(body).toContainText('Skill');
    await expect(body).toContainText('Tool');
    await expect(body).toContainText('File');
  });
});
