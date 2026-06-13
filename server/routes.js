const express = require('express');

function createRouter(db, config) {
  const router = express.Router();

  router.get('/snapshot', (req, res) => {
    res.json(db.buildAllSnapshots());
  });

  router.get('/teams', (req, res) => {
    const list = Object.values(config.TEAMS).map(t => ({ id: t.id, name: t.name }));
    res.json(list);
  });

  router.get('/health', (req, res) => {
    res.json({ ok: true, db: db.getDbStatus(), uptime: process.uptime() });
  });

  router.post('/agents/:profileId/heartbeat', (req, res) => {
    const { profileId } = req.params;
    const body = req.body || {};

    // Required fields
    const { taskId, command } = body;
    if (!taskId || !command) {
      return res.status(400).json({ error: 'taskId and command are required' });
    }

    // Optional expanded fields (from research recommendations + task spec)
    const {
      progress,
      progressPct,        // numeric 0-100
      progressPercent,    // alias for progressPct (from task body)
      skill,              // active skill name
      toolCall,           // current tool being invoked
      tool,               // alias for toolCall (from task body)
      actionType,         // action category (reading, writing, searching, etc.)
      terminalOutput,     // last N lines of terminal output
      outputSnippet,      // alias for terminalOutput (from task body)
      errorState,         // transient error during current turn
      error,              // alias for errorState (from task body)
      fileEdited,         // path being edited
      sessionDuration,    // elapsed seconds since run start
      model,              // currently active model (may differ from profile default)
      provider,           // currently active provider
      contextPct,         // context window usage percentage
      turnCount,          // current turn vs maxTurns
      maxTurns,           // max turns for this session
      subagentActive,     // whether subagents are running
      memoryUpdated,      // whether memory was updated this turn
    } = body;

    // Aliases: outputSnippet -> terminalOutput, error -> errorState,
    //          tool -> toolCall, progressPercent -> progressPct
    const effectiveToolCall = tool || toolCall || null;
    const effectiveProgressPct = progressPercent !== undefined ? progressPercent
                                : (progressPct !== undefined ? progressPct : null);
    const effectiveTerminalOutput = terminalOutput || outputSnippet || null;
    const effectiveErrorState = errorState || error || null;

    // Find which team DB contains this task
    let foundTeam = null;
    for (const [tid, team] of Object.entries(config.TEAMS)) {
      const rows = db.query(tid, 'SELECT id FROM tasks WHERE id = ?', [taskId]);
      if (rows.length > 0) {
        foundTeam = tid;
        break;
      }
    }

    if (!foundTeam) {
      return res.status(404).json({ error: 'Task not found', taskId });
    }

    const result = db.run(
      foundTeam,
      'UPDATE tasks SET current_command = ?, current_progress = ?, last_heartbeat_at = unixepoch() WHERE id = ?',
      [command, progress || '', taskId]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Task not found or not updated', taskId });
    }

    // Build heartbeat event payload with all provided fields
    const payload = {
      command,
      progress: progress || null,
      profileId,
    };

    // Only include optional fields if they have meaningful values
    if (effectiveProgressPct !== undefined && effectiveProgressPct !== null) payload.progressPct = effectiveProgressPct;
    if (skill) payload.skill = skill;
    if (effectiveToolCall) payload.toolCall = effectiveToolCall;
    if (actionType) payload.actionType = actionType;
    if (effectiveTerminalOutput) {
      // Truncate terminal output to 500 chars to avoid DB bloat
      payload.terminalOutput = String(effectiveTerminalOutput).slice(0, 500);
    }
    if (effectiveErrorState) payload.errorState = effectiveErrorState;
    if (fileEdited) payload.fileEdited = fileEdited;
    if (sessionDuration !== undefined && sessionDuration !== null) payload.sessionDuration = sessionDuration;
    if (model) payload.model = model;
    if (provider) payload.provider = provider;
    if (contextPct !== undefined && contextPct !== null) payload.contextPct = contextPct;
    if (turnCount !== undefined && turnCount !== null) payload.turnCount = turnCount;
    if (maxTurns !== undefined && maxTurns !== null) payload.maxTurns = maxTurns;
    if (subagentActive !== undefined && subagentActive !== null) payload.subagentActive = subagentActive;
    if (memoryUpdated !== undefined && memoryUpdated !== null) payload.memoryUpdated = memoryUpdated;

    // Insert heartbeat event so WebSocket delta polling picks it up
    db.run(
      foundTeam,
      "INSERT INTO task_events (task_id, kind, payload, created_at) VALUES (?, 'heartbeat', ?, unixepoch())",
      [taskId, JSON.stringify(payload)]
    );

    res.json({ ok: true, taskId, teamId: foundTeam });
  });

  return router;
}

module.exports = { createRouter };
