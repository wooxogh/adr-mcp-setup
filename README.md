# adr-skills

An MCP server that automatically captures Claude Code development sessions and uses AI to generate ADRs (Architecture Decision Records) from your conversations.

## Features

- **Auto session capture** — Stop Hook saves conversations automatically when Claude Code exits
- **AI-powered ADR generation** — Claude Opus analyzes conversations and writes structured ADRs
- **AI quality review** — Scores ADR completeness and flags missing context or unconsidered alternatives
- **Duplicate detection** — Warns when a new decision resembles a past one
- **Markdown export** — Every ADR is saved as a `.md` file, ready to commit to your repo
- **Status lifecycle** — Track decisions through `Proposed → Accepted → Deprecated → Superseded`
- **Dependency graph** — Link ADRs with `related_to`, `conflicts_with`, `depends_on` relationships
- **Stale ADR alerts** — Surface decisions that haven't been reviewed in months
- **Keyword search** — Search past decisions by technology or topic
- **Timeline view** — Full decision history per project

## Installation

```bash
git clone https://github.com/wooxogh/adr-skills.git
cd adr-skills
npm install
```

## Register with Claude Code

```bash
claude mcp add adr-skills node /absolute/path/to/adr-skills/index.js
```

> Example: `claude mcp add adr-skills node /Users/yourname/Desktop/adr-skills/index.js`

## Environment Setup

Copy the example env file and fill in your API key:

```bash
cp .env.example .env
```

`.env`:
```
ANTHROPIC_API_KEY=sk-ant-...
```

> Without the API key, `generate_adr` falls back to keyword-based extraction and `review_adr` is unavailable.
> `.env` is listed in `.gitignore` — your key will never be committed.

## Auto Session Capture (Stop Hook)

Add this to `~/.claude/settings.json` to automatically save every session when Claude Code exits:

```json
{
  "hooks": {
    "Stop": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "node /absolute/path/to/adr-skills/hook.js"
      }]
    }]
  }
}
```

> Without the hook, use `save_session` manually.

## Tools

Restart Claude Code after registration. Nine tools will be available.

---

### `save_session`
Save a development conversation to the database.

| Parameter | Required | Description |
|---|---|---|
| `project` | ✅ | Project name |
| `conversation` | ✅ | Full conversation text |
| `git_commit` | ➖ | Current git commit hash |
| `summary` | ➖ | Short session summary |

---

### `generate_adr`
Analyze a saved session and auto-generate an ADR. Exports a `.md` file and warns about similar past decisions.

| Parameter | Required | Description |
|---|---|---|
| `session_id` | ✅ | Session ID returned by `save_session` |

Example output:
```markdown
# ADR-1: Adopt Redis as the caching layer

## Status
Accepted

## Context
We needed pub/sub support for real-time notifications.
Memcached only handles simple key-value caching.

## Decision
We adopted Redis as both cache and message broker.
It supports pub/sub, TTL, and persistence.

## Consequences
Real-time features can now be implemented without a separate broker.
We must account for Redis operational costs and treat it as a potential SPOF.

---
Exported to: ~/.adr-mcp/adrs/ADR-0001-adopt-redis-as-the-caching-layer.md
```

---

### `review_adr`
AI quality review of an ADR. Scores completeness (0–100) and flags issues by severity.

| Parameter | Required | Description |
|---|---|---|
| `adr_id` | ✅ | ADR ID to review |

Example output:
```
## ADR-1 Review — Score: 62/100

**Good context, but decision rationale and risk coverage need work.**

### Issues
🔴 [decision] No alternatives were considered before choosing Redis
🟡 [consequences] Risks are mentioned but mitigation strategies are missing

### Suggestions
1. Explicitly document why Memcached was rejected
2. Add a rollback plan if Redis becomes a bottleneck
```

> Requires `ANTHROPIC_API_KEY`.

---

### `update_adr_status`
Update the status of an ADR and re-export the markdown file.

| Parameter | Required | Description |
|---|---|---|
| `adr_id` | ✅ | ADR ID to update |
| `status` | ✅ | `Proposed` \| `Accepted` \| `Deprecated` \| `Superseded` |
| `superseded_by` | ➖ | Replacing ADR ID (required when status is `Superseded`) |

---

### `link_adrs`
Create a relationship between two ADRs.

| Parameter | Required | Description |
|---|---|---|
| `from_id` | ✅ | Source ADR ID |
| `to_id` | ✅ | Target ADR ID |
| `relation` | ✅ | `related_to` \| `conflicts_with` \| `depends_on` |

---

### `get_adr_graph`
Visualize the ADR dependency graph.

| Parameter | Required | Description |
|---|---|---|
| `adr_id` | ➖ | Focus on one ADR (omit for full graph) |

Example output:
```
## ADR Dependency Graph

### depends on
  ADR-5 "Use JWT for auth"  →  ADR-2 "Adopt Redis as cache"

### conflicts with
  ADR-7 "Move to stateless sessions"  ✕  ADR-2 "Adopt Redis as cache"
```

---

### `check_stale_adrs`
Find `Accepted` ADRs that haven't been reviewed in a while.

| Parameter | Required | Description |
|---|---|---|
| `months` | ➖ | Age threshold in months (default: `6`) |

---

### `search_decisions`
Search past architectural decisions by keyword.

| Parameter | Required | Description |
|---|---|---|
| `query` | ✅ | Search term (e.g. `Redis`, `PostgreSQL`, `JWT`) |

---

### `get_timeline`
View the full decision history for a project.

| Parameter | Required | Description |
|---|---|---|
| `project` | ➖ | Project name (omit for all projects) |

---

## Project Structure

```
adr-skills/
├── index.js      ← MCP server — tool definitions and routing
├── db.js         ← SQLite CRUD (sessions, adrs, adr_relations tables)
├── adr.js        ← ADR extraction and AI review logic
├── hook.js       ← Claude Code Stop Hook for auto session capture
├── .env.example  ← Environment variable template
└── package.json
```

**Database location:** `~/.adr-mcp/sessions.db`
**ADR export location:** `~/.adr-mcp/adrs/`

## Requirements

- Node.js 18+
- Claude Code CLI
- Anthropic API Key *(optional — required for AI generation and review)*
