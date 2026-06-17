/**
 * Unit tests for heartbeat merge logic.
 *
 * Tests the buildHeartbeatMap() function that merges multiple heartbeat
 * event payloads per task, with newest-first ordering so newer values
 * take precedence and older heartbeats fill in missing keys.
 *
 * Run: node tests/unit/heartbeat-merge.test.js
 */

// ---------------------------------------------------------------------------
// The merge function under test (extracted from db.js)
// ---------------------------------------------------------------------------

function buildHeartbeatMap(heartbeatRows) {
  const heartbeatByTask = {};

  // Rows are expected in ORDER BY id DESC (newest first)
  for (const row of heartbeatRows) {
    if (!row.payload) continue;
    try {
      const parsed = JSON.parse(row.payload);
      const acc = heartbeatByTask[row.task_id];

      if (!acc) {
        // First (newest) heartbeat for this task
        heartbeatByTask[row.task_id] = parsed;
      } else {
        // Merge older heartbeat into accumulator:
        // - Keys already in acc (from newer heartbeats) keep their values
        // - Keys only in parsed (from this older heartbeat) are added
        for (const key of Object.keys(parsed)) {
          if (!(key in acc)) {
            acc[key] = parsed[key];
          }
        }
      }
    } catch (_) {
      // Malformed payload — skip
    }
  }

  return heartbeatByTask;
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${label}`);
  }
}

function makeRow(taskId, id, fields) {
  return { task_id: taskId, id, payload: JSON.stringify(fields) };
}

function section(name) {
  console.log(`\n${name}`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

section('=== SCENARIO: Sparse newer, rich older (AC5 core case) ===');
{
  const rows = [
    makeRow('t1', 10, { command: 'idle', profileId: 'p1' }),
    makeRow('t1', 5,  { skill: 'ac5-skill', toolCall: 'ac5-tool',
                         fileEdited: '/tmp/ac5.js', terminalOutput: 'AC5 Building...',
                         command: 'terminal ac5-build', profileId: 'p1' }),
  ];
  const result = buildHeartbeatMap(rows)['t1'];
  assert(result.skill === 'ac5-skill',       'skill persists from older heartbeat');
  assert(result.toolCall === 'ac5-tool',      'toolCall persists');
  assert(result.fileEdited === '/tmp/ac5.js', 'fileEdited persists');
  assert(result.terminalOutput === 'AC5 Building...', 'terminalOutput persists');
  assert(result.command === 'idle',           'command uses newest value');
}

section('=== SCENARIO: Rich newer, sparse older ===');
{
  const rows = [
    makeRow('t2', 10, { skill: 'coding', toolCall: 'write_file',
                         fileEdited: '/tmp/foo.js', terminalOutput: 'hello',
                         command: 'work', profileId: 'p2' }),
    makeRow('t2', 5,  { command: 'idle', profileId: 'p2' }),
  ];
  const result = buildHeartbeatMap(rows)['t2'];
  assert(result.skill === 'coding',     'skill from newest survives');
  assert(result.toolCall === 'write_file', 'toolCall from newest survives');
  assert(result.terminalOutput === 'hello', 'terminalOutput from newest survives');
  assert(result.command === 'work',     'command from newest survives');
}

section('=== SCENARIO: Different non-overlapping keys in each ===');
{
  const rows = [
    makeRow('t3', 10, { toolCall: 'browser_navigate', command: 'a', profileId: 'p3' }),
    makeRow('t3', 5,  { skill: 'coding', command: 'b', profileId: 'p3' }),
  ];
  const result = buildHeartbeatMap(rows)['t3'];
  assert(result.skill === 'coding',            'skill from older added');
  assert(result.toolCall === 'browser_navigate', 'toolCall from newer kept');
  assert(result.command === 'a',               'command = newest value');
}

section('=== SCENARIO: Same key in both — newer wins ===');
{
  const rows = [
    makeRow('t4', 10, { progressPct: 75, command: 'c', profileId: 'p4' }),
    makeRow('t4', 5,  { progressPct: 30, skill: 'debugging', command: 'd', profileId: 'p4' }),
  ];
  const result = buildHeartbeatMap(rows)['t4'];
  assert(result.progressPct === 75, 'progressPct = newest (75)');
  assert(result.skill === 'debugging', 'skill from older survives (key not in newer)');
}

section('=== SCENARIO: Three heartbeats — newest sparse, middle rich, oldest sparse ===');
{
  const rows = [
    makeRow('t5', 15, { command: 'idle', profileId: 'p5' }),
    makeRow('t5', 10, { skill: 'mid-skill', toolCall: 'mid-tool',
                         fileEdited: '/tmp/mid.js', terminalOutput: 'mid output',
                         command: 'mid-work', profileId: 'p5' }),
    makeRow('t5', 5,  { errorState: 'old-error', command: 'old-work', profileId: 'p5' }),
  ];
  const result = buildHeartbeatMap(rows)['t5'];
  assert(result.skill === 'mid-skill',    'skill from middle survives');
  assert(result.toolCall === 'mid-tool',   'toolCall from middle survives');
  assert(result.fileEdited === '/tmp/mid.js', 'fileEdited from middle survives');
  assert(result.terminalOutput === 'mid output', 'terminalOutput from middle survives');
  assert(result.errorState === 'old-error', 'errorState from oldest survives (not in middle)');
  assert(result.command === 'idle',       'command = newest value');
}

section('=== SCENARIO: Multiple tasks, interleaved heartbeats ===');
{
  const rows = [
    makeRow('ta', 9, { skill: 'a-skill', command: 'a1', profileId: 'pa' }),
    makeRow('tb', 8, { skill: 'b-skill', command: 'b1', profileId: 'pb' }),
    makeRow('ta', 7, { toolCall: 'a-tool', command: 'a2', profileId: 'pa' }),
    makeRow('tb', 6, { toolCall: 'b-tool', command: 'b2', profileId: 'pb' }),
  ];
  const result = buildHeartbeatMap(rows);
  assert(result['ta'].skill === 'a-skill',    'task A: skill from newest');
  assert(result['ta'].toolCall === 'a-tool',   'task A: toolCall from older');
  assert(result['ta'].command === 'a1',        'task A: command from newest');
  assert(result['tb'].skill === 'b-skill',     'task B: skill from newest');
  assert(result['tb'].toolCall === 'b-tool',    'task B: toolCall from older');
  assert(result['tb'].command === 'b1',         'task B: command from newest');
}

section('=== SCENARIO: progressPct = 0 is preserved (not treated as missing) ===');
{
  const rows = [
    makeRow('t6', 10, { progressPct: 0, command: 'start', profileId: 'p6' }),
    makeRow('t6', 5,  { progressPct: 50, command: 'mid', profileId: 'p6' }),
  ];
  const result = buildHeartbeatMap(rows)['t6'];
  assert(result.progressPct === 0, 'progressPct = 0 from newest kept (0 is a real value)');
}

section('=== SCENARIO: Malformed payloads are silently skipped ===');
{
  const rows = [
    { task_id: 't7', id: 10, payload: 'not-json{{{]' },
    makeRow('t7', 5, { skill: 'coding', command: 'work', profileId: 'p7' }),
  ];
  const result = buildHeartbeatMap(rows)['t7'];
  assert(result.skill === 'coding', 'valid payload processed after malformed one');
  assert(result.command === 'work', 'command from valid payload');
}

section('=== SCENARIO: Empty rows array ===');
{
  const result = buildHeartbeatMap([]);
  assert(Object.keys(result).length === 0, 'empty input → empty map');
}

section('=== SCENARIO: Rows with null/undefined payload ===');
{
  const rows = [
    { task_id: 't8', id: 10, payload: null },
    { task_id: 't8', id: 9, payload: undefined },
    makeRow('t8', 5, { skill: 'coding', command: 'work', profileId: 'p8' }),
  ];
  const result = buildHeartbeatMap(rows)['t8'];
  assert(result.skill === 'coding', 'null/undefined payloads are skipped');
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  process.exit(1);
}
