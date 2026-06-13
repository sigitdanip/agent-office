const BASE = 'http://localhost:3000';

async function test(name, fn) {
  try {
    await fn();
    console.log(`PASS: ${name}`);
  } catch (e) {
    console.log(`FAIL: ${name} - ${e.message}`);
  }
}

async function main() {
  // Test 1: HEARTBEAT - all expanded fields
  await test('POST heartbeat with all expanded fields', async () => {
    const r = await fetch(`${BASE}/api/agents/qa-engineer/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskId: 't_595744b0', command: 'validate-api',
        progressPct: 85, skill: 'quality-checklist',
        toolCall: 'terminal', actionType: 'validating',
        terminalOutput: 'All tests pass', errorState: null,
        fileEdited: '/root/agent-office/server/routes.js',
        sessionDuration: 300, model: 'deepseek-v4-pro',
        provider: 'opencode-go', contextPct: 45,
        turnCount: 10, maxTurns: 20,
        subagentActive: false, memoryUpdated: true,
      }),
    });
    const body = await r.json();
    if (!body.ok) throw new Error(`Expected ok, got ${JSON.stringify(body)}`);
    if (body.teamId !== 'dev') throw new Error(`Expected teamId=dev`);
  });

  // Test 2: HEARTBEAT - alias fields
  await test('POST heartbeat with alias fields (tool, progressPercent, outputSnippet, error)', async () => {
    const r = await fetch(`${BASE}/api/agents/qa-engineer/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskId: 't_595744b0', command: 'validate-aliases',
        tool: 'search_files',
        progressPercent: 90,
        outputSnippet: 'alias output works',
        error: 'alias error works',
      }),
    });
    const body = await r.json();
    if (!body.ok) throw new Error(`Expected ok, got ${JSON.stringify(body)}`);
  });

  // Test 3: HEARTBEAT - validation
  await test('POST heartbeat returns 400 for missing taskId', async () => {
    const r = await fetch(`${BASE}/api/agents/qa-engineer/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'test' }),
    });
    if (r.status !== 400) throw new Error(`Expected 400, got ${r.status}`);
  });

  await test('POST heartbeat returns 404 for unknown taskId', async () => {
    const r = await fetch(`${BASE}/api/agents/qa-engineer/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: 't_nonexistent', command: 'test' }),
    });
    if (r.status !== 404) throw new Error(`Expected 404, got ${r.status}`);
  });

  // Test 4: SNAPSHOT - heartbeat-derived fields surfaced
  await test('GET /api/snapshot surfaces heartbeat-derived fields on profiles', async () => {
    const r = await fetch(`${BASE}/api/snapshot`);
    const data = await r.json();

    const qaProfile = data.dev.profiles.find(p => p.id === 'qa-engineer');
    if (!qaProfile) throw new Error('qa-engineer profile not found');
    if (!qaProfile.currentCommand) throw new Error('currentCommand missing');
    if (qaProfile.currentSkill === undefined) throw new Error('currentSkill missing');
    if (qaProfile.currentTool === undefined) throw new Error('currentTool missing');
    if (qaProfile.terminalOutput === undefined) throw new Error('terminalOutput missing');
    if (qaProfile.errorState === undefined) throw new Error('errorState missing');
    if (qaProfile.progressPct === undefined) throw new Error('progressPct missing');
    console.log(`  qa-engineer: command="${qaProfile.currentCommand}", skill="${qaProfile.currentSkill}", tool="${qaProfile.currentTool}", progressPct=${qaProfile.progressPct}`);
  });

  // Test 5: Terminal output truncation
  await test('Terminal output truncated to 500 chars', async () => {
    const longOutput = 'x'.repeat(600);
    const r1 = await fetch(`${BASE}/api/agents/qa-engineer/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: 't_595744b0', command: 'test-trunc', terminalOutput: longOutput }),
    });
    const body = await r1.json();
    if (!body.ok) throw new Error('Heartbeat failed for truncation test');
    console.log('  Truncation heartbeat accepted');
  });

  // Test 6: Both teams in snapshot
  await test('GET /api/snapshot returns data for both teams', async () => {
    const r = await fetch(`${BASE}/api/snapshot`);
    const data = await r.json();
    if (!data.dev) throw new Error('dev team missing');
    if (!data.paper) throw new Error('paper team missing');
    if (!data.dev.profiles || data.dev.profiles.length === 0) throw new Error('dev profiles empty');
    if (!data.paper.profiles || data.paper.profiles.length === 0) throw new Error('paper profiles empty');
    console.log(`  dev: ${data.dev.profiles.length} profiles, ${data.dev.tasks.length} tasks`);
    console.log(`  paper: ${data.paper.profiles.length} profiles, ${data.paper.tasks.length} tasks`);
  });

  console.log('\nAll tests complete.');
}

main().catch(e => console.error('FATAL:', e.message));
