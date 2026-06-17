# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: inspector-fields-ac.spec.js >> Inspector Field Reliability — AC Validation >> AC1: Skill field shows skill name for running agent (not "--")
- Location: tests/e2e/inspector-fields-ac.spec.js:64:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "accelint-ts-testing"
Received: "cypress-playwright-setup"
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - banner [ref=e2]:
    - heading "Agent Office" [level=1] [ref=e3]
    - generic [ref=e4]:
      - generic [ref=e5] [cursor=pointer]: Dev Office
      - generic [ref=e6] [cursor=pointer]: Paper Office
    - generic [ref=e7]: Connected
  - generic [ref=e9]:
    - generic [ref=e10]: Team
    - generic [ref=e11]:
      - generic [ref=e12] [cursor=pointer]:
        - generic [ref=e13]: AI
        - generic [ref=e14]:
          - generic [ref=e15]: AI Engineer
          - generic [ref=e16]: deepseek-v4-pro
        - generic [ref=e17]: Idle
      - generic [ref=e18] [cursor=pointer]:
        - generic [ref=e19]: API
        - generic [ref=e20]:
          - generic [ref=e21]: API Dev
          - generic [ref=e22]: deepseek-v4-pro
        - generic [ref=e23]: Run
      - generic [ref=e24] [cursor=pointer]:
        - generic [ref=e25]: SH
        - generic [ref=e26]:
          - generic [ref=e27]: Bash Dev
          - generic [ref=e28]: mimo-v2.5
        - generic [ref=e29]: Run
      - generic [ref=e30] [cursor=pointer]:
        - generic [ref=e31]: CPP
        - generic [ref=e32]:
          - generic [ref=e33]: C/C++ Dev
          - generic [ref=e34]: deepseek-v4-pro
        - generic [ref=e35]: Idle
      - generic [ref=e36] [cursor=pointer]:
        - generic [ref=e37]: DT
        - generic [ref=e38]:
          - generic [ref=e39]: Data Dev
          - generic [ref=e40]: mimo-v2.5
        - generic [ref=e41]: Idle
      - generic [ref=e42] [cursor=pointer]:
        - generic [ref=e43]: DL
        - generic [ref=e44]:
          - generic [ref=e45]: Dev Lead
          - generic [ref=e46]: minimax-m3
        - generic [ref=e47]: Run
      - generic [ref=e48] [cursor=pointer]:
        - generic [ref=e49]: EXP
        - generic [ref=e50]:
          - generic [ref=e51]: Explorer
          - generic [ref=e52]: mimo-v2.5
        - generic [ref=e53]: Idle
      - generic [ref=e54] [cursor=pointer]:
        - generic [ref=e55]: FE
        - generic [ref=e56]:
          - generic [ref=e57]: Frontend Dev
          - generic [ref=e58]: deepseek-v4-pro
        - generic [ref=e59]: Run
      - generic [ref=e60] [cursor=pointer]:
        - generic [ref=e61]: INF
        - generic [ref=e62]:
          - generic [ref=e63]: Infra Dev
          - generic [ref=e64]: deepseek-v4-pro
        - generic [ref=e65]: Run
      - generic [ref=e66] [cursor=pointer]:
        - generic [ref=e67]: PY
        - generic [ref=e68]:
          - generic [ref=e69]: Python Dev
          - generic [ref=e70]: deepseek-v4-pro
        - generic [ref=e71]: Run
      - generic [ref=e72] [cursor=pointer]:
        - generic [ref=e73]: QA
        - generic [ref=e74]:
          - generic [ref=e75]: QA Engineer
          - generic [ref=e76]: deepseek-v4-pro
        - generic [ref=e77]: Run
      - generic [ref=e78] [cursor=pointer]:
        - generic [ref=e79]: RCH
        - generic [ref=e80]:
          - generic [ref=e81]: Researcher
          - generic [ref=e82]: kimi-k2.5
        - generic [ref=e83]: Idle
      - generic [ref=e84] [cursor=pointer]:
        - generic [ref=e85]: WF
        - generic [ref=e86]:
          - generic [ref=e87]: Workflow Dev
          - generic [ref=e88]: deepseek-v4-pro
        - generic [ref=e89]: Idle
  - generic [ref=e90]:
    - generic [ref=e91] [cursor=pointer]: Board
    - generic [ref=e92] [cursor=pointer]: Team
    - generic [ref=e93] [cursor=pointer]: Activity
    - generic [ref=e94] [cursor=pointer]: Standup
  - generic [ref=e95]:
    - generic [ref=e96]:
      - generic [ref=e97]: QA
      - generic [ref=e98]:
        - generic [ref=e99]: QA Engineer
        - generic [ref=e100]: "Model: deepseek-v4-pro | Status: Run"
      - button "X" [ref=e101] [cursor=pointer]
    - generic [ref=e102]:
      - generic [ref=e103]:
        - generic [ref=e104]: Current Task
        - generic [ref=e105]:
          - generic [ref=e106]:
            - generic [ref=e107]: Task
            - 'link "qa-engineer: Validate Agent Office sprint — all bugs fixed, performance targets met, monitoring working" [ref=e108] [cursor=pointer]':
              - /url: javascript:showTask('t_dev_qa_agento_sprint_06_2026')
          - generic [ref=e109]:
            - generic [ref=e110]: ID
            - generic [ref=e111]: t_dev_qa_agento_sprint_06_2026
          - generic [ref=e112]:
            - generic [ref=e113]: Priority
            - generic [ref=e114]: P30
      - generic [ref=e115]:
        - generic [ref=e116]: Live Data
        - generic [ref=e117]:
          - generic [ref=e118]:
            - generic [ref=e119]: Command
            - generic [ref=e120]: WebSocket real-time test 1781366163.2977622
          - generic [ref=e122]:
            - generic [ref=e123]: Progress
            - generic [ref=e124]: "starting API call #1"
          - generic [ref=e125]:
            - generic [ref=e126]: Tool
            - generic [ref=e127]: terminal
          - generic [ref=e128]:
            - generic [ref=e129]: Skill
            - generic [ref=e130]: cypress-playwright-setup
          - generic [ref=e131]:
            - generic [ref=e132]: File
            - generic [ref=e133]: /tmp/qa_validation.py
          - generic [ref=e134]:
            - generic [ref=e135]: Duration
            - generic [ref=e136]: 0m 1s
          - generic [ref=e137]:
            - generic [ref=e138]: Model
            - generic [ref=e139]: opencode-go / deepseek-v4-pro
          - generic [ref=e140]:
            - generic [ref=e141]: Turn
            - generic [ref=e142]: 0 / 150
      - generic [ref=e143]:
        - generic [ref=e144]: Terminal Output
        - generic [ref=e146]:
          - generic [ref=e147]: 10:56 PM$ WebSocket real-time test 1781366163.2977622
          - generic [ref=e148]: 10:55 PM$ perf-test
          - generic [ref=e149]: 10:55 PM$ perf-test
          - generic [ref=e150]: 10:55 PM$ perf-test
          - generic [ref=e151]: 10:55 PM$ perf-test
          - generic [ref=e152]: 10:55 PM$ perf-test
          - generic [ref=e153]: 10:55 PM$ perf-test
          - generic [ref=e154]: 10:55 PM$ perf-test
          - generic [ref=e155]: 10:55 PM$ perf-test
          - generic [ref=e156]: 10:55 PM$ perf-test
          - generic [ref=e157]: 10:55 PM$ perf-test
          - generic [ref=e158]: 10:55 PM$ perf-test
          - generic [ref=e159]: 10:55 PM$ perf-test
          - generic [ref=e160]: 10:55 PM$ perf-test
          - generic [ref=e161]: 10:55 PM$ perf-test
          - generic [ref=e162]: 10:55 PM$ perf-test
          - generic [ref=e163]: 10:55 PM$ perf-test
          - generic [ref=e164]: 10:55 PM$ perf-test
          - generic [ref=e165]: 10:55 PM$ perf-test
          - generic [ref=e166]: 10:55 PM$ perf-test
          - generic [ref=e167]: 10:55 PM$ perf-test
          - generic [ref=e168]: 10:55 PM$ terminal [receiving stream response] Background process started
          - generic [ref=e169]: "10:55 PMheartbeat #1803"
          - generic [ref=e170]: 10:55 PM$ echo alias-test [Testing aliases] Terminal output via alias Test error via alias
          - generic [ref=e171]: 10:55 PM$ terminal pytest --coverage [Running QA validation tests] PASS tests pass FAIL one test One test failing
          - generic [ref=e172]: 10:55 PM$ QA validation heartbeat test
          - generic [ref=e173]: 10:54 PM$ receiving stream response [receiving stream response] 813148 RUNNING
          - generic [ref=e174]: "10:54 PMheartbeat #1778"
          - generic [ref=e175]: "10:53 PM$ starting API call #1 [starting API call #1]"
          - generic [ref=e176]: "10:53 PMheartbeat #1760"
      - generic [ref=e177]:
        - generic [ref=e178]: Event Log (Task _06_2026)
        - generic [ref=e179]:
          - generic [ref=e180]:
            - text: CLAIMED
            - generic [ref=e181]: 10:53 PM
          - generic [ref=e182]:
            - text: SPAWNED
            - generic [ref=e183]: 10:53 PM
      - generic [ref=e184]:
        - generic [ref=e185]: Run History
        - generic [ref=e186]:
          - generic [ref=e187]:
            - text: RUNNINGt_dev_qa_agento_sprint_06_2026
            - generic [ref=e188]: 10:53 PM
          - generic [ref=e189]:
            - text: "BLOCKEDreview-required: 6/7 ACs PASS — paper team kanban migration validated. AC4 block"
            - generic [ref=e190]: 12:05 PM
          - generic [ref=e191]:
            - text: "BLOCKEDreview-required: Inspector field validation complete. AC1-3 (skill/tool/file sho"
            - generic [ref=e192]: 08:56 PM
          - generic [ref=e193]:
            - text: CRASHEDt_887d317b
            - generic [ref=e194]: 08:00 PM
          - generic [ref=e195]:
            - text: "BLOCKEDreview-required: 24/28 E2E tests pass. Bridge data flow verified end-to-end. 4 i"
            - generic [ref=e196]: 07:39 PM
          - generic [ref=e197]:
            - text: "BLOCKEDreview-required: Agent inspector validated — 52/52 tests pass (0 failures, 24 pr"
            - generic [ref=e198]: 05:08 PM
          - generic [ref=e199]:
            - text: "BLOCKEDreview-required: Agent inspector validated — 14/17 tests pass (11 desktop + 3 mo"
            - generic [ref=e200]: 04:33 PM
          - generic [ref=e201]:
            - text: "BLOCKEDreview-required: Agents view UI missing from served HTML — all 10 acceptance cri"
            - generic [ref=e202]: 03:12 PM
          - generic [ref=e203]:
            - text: CRASHEDt_8cc91d9e
            - generic [ref=e204]: 02:40 PM
          - generic [ref=e205]:
            - text: COMPLETEDFull E2E test suite built. 7 spec files covering board, sprints, charts, CI, tea
            - generic [ref=e206]: 08:10 PM
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | const BASE = 'http://localhost:3000';
  4   | 
  5   | async function waitForConnected(page) {
  6   |   await page.waitForFunction(() => {
  7   |     const el = document.getElementById('conn-status');
  8   |     return el && el.textContent === 'Connected';
  9   |   }, { timeout: 10000 });
  10  | }
  11  | 
  12  | async function sendHeartbeat(profileId, fields = {}) {
  13  |   const res = await fetch(`${BASE}/api/agents/${profileId}/heartbeat`, {
  14  |     method: 'POST',
  15  |     headers: { 'Content-Type': 'application/json' },
  16  |     body: JSON.stringify(fields),
  17  |   });
  18  |   return res.json();
  19  | }
  20  | 
  21  | async function getInspectorKV(page, label) {
  22  |   const body = page.locator('#inspector-body');
  23  |   const kvDivs = body.locator('.insp-kv');
  24  |   const count = await kvDivs.count();
  25  |   for (let i = 0; i < count; i++) {
  26  |     const div = kvDivs.nth(i);
  27  |     const labelText = await div.locator('.insp-kv-label').textContent();
  28  |     if (labelText && labelText.trim() === label) {
  29  |       return div.locator('.insp-kv-value').textContent();
  30  |     }
  31  |   }
  32  |   return null;
  33  | }
  34  | 
  35  | async function openInspectorForProfile(page, profileId) {
  36  |   const rows = page.locator('.profile-row');
  37  |   const count = await rows.count();
  38  |   for (let i = 0; i < count; i++) {
  39  |     const row = rows.nth(i);
  40  |     const pid = await row.getAttribute('data-profile-id');
  41  |     if (pid === profileId) {
  42  |       await row.click();
  43  |       await page.waitForTimeout(300);
  44  |       return true;
  45  |     }
  46  |   }
  47  |   return false;
  48  | }
  49  | 
  50  | test.describe('Inspector Field Reliability — AC Validation', () => {
  51  | 
  52  |   test.beforeEach(async ({ page }) => {
  53  |     await page.goto(BASE);
  54  |     await waitForConnected(page);
  55  | 
  56  |     // Switch to Team view on mobile
  57  |     const viewport = page.viewportSize();
  58  |     if (viewport && viewport.width < 768) {
  59  |       await page.locator('.mobile-nav-item[data-mview="team"]').click();
  60  |       await page.waitForTimeout(300);
  61  |     }
  62  |   });
  63  | 
  64  |   test('AC1: Skill field shows skill name for running agent (not "--")', async ({ page }) => {
  65  |     // Send a unique rich heartbeat for this test
  66  |     await sendHeartbeat('qa-engineer', {
  67  |       taskId: 't_887d317b',
  68  |       command: 'terminal pytest --ac1',
  69  |       progress: 'Running AC1 validation',
  70  |       skill: 'accelint-ts-testing',
  71  |       toolCall: 'browser_navigate',
  72  |       fileEdited: '/tmp/ac1-test.js',
  73  |       terminalOutput: 'AC1 test output',
  74  |     });
  75  |     // Wait for WebSocket poll cycle (2s interval + buffer)
  76  |     await page.waitForTimeout(3000);
  77  | 
  78  |     await openInspectorForProfile(page, 'qa-engineer');
  79  | 
  80  |     const skillValue = await getInspectorKV(page, 'Skill');
  81  |     expect(skillValue).toBeTruthy();
  82  |     expect(skillValue).not.toBe('--');
> 83  |     expect(skillValue).toBe('accelint-ts-testing');
      |                        ^ Error: expect(received).toBe(expected) // Object.is equality
  84  |   });
  85  | 
  86  |   test('AC2: Tool field shows tool name for running agent (not "--" and not misleading)', async ({ page }) => {
  87  |     // Send a unique rich heartbeat with a distinctive tool name
  88  |     const uniqueTool = 'browser_navigate_ac2_test';
  89  |     await sendHeartbeat('qa-engineer', {
  90  |       taskId: 't_887d317b',
  91  |       command: 'browser_navigate https://ac2.example.com',
  92  |       progress: 'AC2 validation',
  93  |       skill: 'web-testing',
  94  |       toolCall: uniqueTool,
  95  |       fileEdited: '/tmp/ac2-test.js',
  96  |       terminalOutput: 'AC2 test output',
  97  |     });
  98  |     await page.waitForTimeout(3000);
  99  | 
  100 |     await openInspectorForProfile(page, 'qa-engineer');
  101 | 
  102 |     const toolValue = await getInspectorKV(page, 'Tool');
  103 |     expect(toolValue).toBeTruthy();
  104 |     expect(toolValue).not.toBe('--');
  105 |     // Must be the actual tool name, not a misleading parsed word
  106 |     expect(toolValue).toBe(uniqueTool);
  107 |   });
  108 | 
  109 |   test('AC3: FileEdited field shows file path for running agent (not "--")', async ({ page }) => {
  110 |     const uniqueFile = '/root/agent-office/server/routes-ac3.js';
  111 |     await sendHeartbeat('qa-engineer', {
  112 |       taskId: 't_887d317b',
  113 |       command: 'patch routes-ac3.js',
  114 |       progress: 'AC3 validation',
  115 |       skill: 'typescript-refactor',
  116 |       toolCall: 'patch',
  117 |       fileEdited: uniqueFile,
  118 |       terminalOutput: 'AC3 test output',
  119 |     });
  120 |     await page.waitForTimeout(3000);
  121 | 
  122 |     await openInspectorForProfile(page, 'qa-engineer');
  123 | 
  124 |     const fileValue = await getInspectorKV(page, 'File');
  125 |     expect(fileValue).toBeTruthy();
  126 |     expect(fileValue).not.toBe('--');
  127 |     expect(fileValue).toBe(uniqueFile);
  128 |   });
  129 | 
  130 |   test('AC4: Terminal Output section shows recent command output', async ({ page }) => {
  131 |     const uniqueOutput = 'AC4_UNIQUE_OUTPUT_STRING_12345';
  132 |     await sendHeartbeat('qa-engineer', {
  133 |       taskId: 't_887d317b',
  134 |       command: 'echo AC4 test',
  135 |       progress: 'AC4 Done',
  136 |       terminalOutput: uniqueOutput + '\nAll good!',
  137 |     });
  138 |     await page.waitForTimeout(3000);
  139 | 
  140 |     await openInspectorForProfile(page, 'qa-engineer');
  141 | 
  142 |     const body = page.locator('#inspector-body');
  143 |     await expect(body).toContainText('Terminal Output');
  144 |     await expect(body).toContainText(uniqueOutput);
  145 |   });
  146 | 
  147 |   test('AC5: Values persist across heartbeat ticks (no flickering between rich and empty)', async ({ page }) => {
  148 |     // Send rich heartbeat first with unique identifiers
  149 |     const uniqueSkill = 'ac5-persistence-skill';
  150 |     const uniqueTool = 'ac5-persistence-tool';
  151 |     const uniqueFile = '/tmp/ac5-persistence-file.js';
  152 | 
  153 |     await sendHeartbeat('qa-engineer', {
  154 |       taskId: 't_887d317b',
  155 |       command: 'terminal ac5-build',
  156 |       progress: 'Building AC5 45%',
  157 |       progressPct: 45,
  158 |       skill: uniqueSkill,
  159 |       toolCall: uniqueTool,
  160 |       fileEdited: uniqueFile,
  161 |       terminalOutput: 'AC5 Building...',
  162 |     });
  163 |     await page.waitForTimeout(3000);
  164 | 
  165 |     await openInspectorForProfile(page, 'qa-engineer');
  166 | 
  167 |     // Verify rich data is showing
  168 |     let skillVal = await getInspectorKV(page, 'Skill');
  169 |     let toolVal = await getInspectorKV(page, 'Tool');
  170 |     let fileVal = await getInspectorKV(page, 'File');
  171 |     expect(skillVal).toBe(uniqueSkill);
  172 |     expect(toolVal).toBe(uniqueTool);
  173 |     expect(fileVal).toBe(uniqueFile);
  174 | 
  175 |     // Now send an empty heartbeat (simulates kanban system tick with no rich data)
  176 |     await sendHeartbeat('qa-engineer', {
  177 |       taskId: 't_887d317b',
  178 |       command: 'idle',
  179 |       // No skill, tool, fileEdited — intentionally empty
  180 |     });
  181 |     await page.waitForTimeout(3000);
  182 | 
  183 |     // Re-check inspector values — should NOT flicker to '--'
```