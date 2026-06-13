#!/usr/bin/env python3
"""
Kanban → Agent-Office Heartbeat Bridge

Reads running tasks from the Hermes kanban DB and POSTs heartbeat payloads
to the agent-office HTTP endpoint so task_events gets populated with expanded
fields (skill, tool, terminalOutput, progressPct, etc.) for the dashboard.

Runs as a cron job every 15–30 seconds. Fault-tolerant: if agent-office is
down or the DB is locked, the script skips and exits cleanly.

Usage:
    python3 heartbeat_bridge.py [--db /path/to/kanban.db] [--endpoint http://...]
"""

import argparse
import json
import os
import re
import sqlite3
import sys
import time
import urllib.request
import urllib.error


def log(msg: str) -> None:
    """Print a timestamped log line (goes to cron output / journal)."""
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    print(f"[bridge] {ts}  {msg}", flush=True)


def get_running_tasks(db_path: str, max_age_sec: int = 60) -> list[dict]:
    """
    Return all tasks that are currently 'running' and have had a heartbeat
    within the last max_age_sec seconds.
    """
    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, timeout=3)
        conn.row_factory = sqlite3.Row
        cur = conn.execute(
            """
            SELECT id, assignee, current_command, current_progress,
                   last_heartbeat_at, workspace_path
            FROM tasks
            WHERE status = 'running'
              AND assignee IS NOT NULL
              AND last_heartbeat_at IS NOT NULL
              AND (unixepoch() - last_heartbeat_at) < ?
            ORDER BY last_heartbeat_at DESC
            """,
            (max_age_sec,),
        )
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        return rows
    except sqlite3.OperationalError as e:
        log(f"DB read error (likely locked): {e}")
        return []
    except Exception as e:
        log(f"DB error: {e}")
        return []


def post_heartbeat(base_url: str, profile_id: str, payload: dict, timeout: int = 5) -> bool:
    """
    POST heartbeat payload to agent-office.
    Returns True on success, False on any failure.
    """
    url = f"{base_url.rstrip('/')}/api/agents/{profile_id}/heartbeat"
    data = json.dumps(payload).encode("utf-8")

    try:
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status == 200:
                return True
            log(f"Non-200 from {url}: {resp.status}")
            return False
    except urllib.error.URLError as e:
        log(f"POST failed for {profile_id} (agent-office unreachable?): {e.reason}")
        return False
    except Exception as e:
        log(f"POST error for {profile_id}: {e}")
        return False


def build_payload(task: dict) -> dict:
    """
    Build the heartbeat JSON payload from a kanban task row.
    Parses current_command/current_progress for any structured hints.
    """
    command = task.get("current_command") or "idle"
    progress = task.get("current_progress") or ""

    payload = {
        "taskId": task["id"],
        "command": command,
        "progress": progress,
    }

    # Try to extract structured info from the progress/command fields
    # if the worker included them (e.g., "skill:fastapi tool:terminal")
    combined = f"{command} {progress}"

    skill_match = re.search(r"skill[:\s]+(\S+)", combined, re.IGNORECASE)
    if skill_match:
        payload["skill"] = skill_match.group(1).rstrip(",;")

    tool_match = re.search(r"tool[:\s]+(\S+)", combined, re.IGNORECASE)
    if tool_match:
        payload["toolCall"] = tool_match.group(1).rstrip(",;")

    action_match = re.search(r"action[:\s]+(\S+)", combined, re.IGNORECASE)
    if action_match:
        payload["actionType"] = action_match.group(1).rstrip(",;")

    pct_match = re.search(r"(\d{1,3})%", combined)
    if pct_match:
        try:
            pct = int(pct_match.group(1))
            if 0 <= pct <= 100:
                payload["progressPct"] = pct
        except ValueError:
            pass

    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Kanban → Agent-Office heartbeat bridge")
    parser.add_argument(
        "--db",
        default=os.environ.get("KANBAN_DB", "/root/.hermes/kanban.db"),
        help="Path to kanban SQLite DB",
    )
    parser.add_argument(
        "--endpoint",
        default=os.environ.get("AGENT_OFFICE_URL", "http://localhost:3000"),
        help="Agent-office base URL",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be sent without POSTing",
    )
    parser.add_argument(
        "--max-age",
        type=int,
        default=int(os.environ.get("HEARTBEAT_AGE_SEC", "60")),
        help="Max age in seconds of last heartbeat to forward",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=int(os.environ.get("HTTP_TIMEOUT", "5")),
        help="HTTP request timeout in seconds",
    )
    args = parser.parse_args()

    if not os.path.exists(args.db):
        log(f"Kanban DB not found: {args.db}")
        sys.exit(0)

    tasks = get_running_tasks(args.db, max_age_sec=args.max_age)

    if not tasks:
        # No running tasks with recent heartbeats — silent exit
        sys.exit(0)

    for task in tasks:
        profile_id = task["assignee"]
        payload = build_payload(task)

        if args.dry_run:
            log(f"DRY-RUN  {profile_id}  {json.dumps(payload)}")
            continue

        success = post_heartbeat(args.endpoint, profile_id, payload, timeout=args.timeout)
        if success:
            log(f"OK  {profile_id}  task={task['id']}  cmd={payload['command'][:50]}")


if __name__ == "__main__":
    main()
