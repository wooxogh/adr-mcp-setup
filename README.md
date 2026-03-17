# adr-skills

**adr-skills** is an MCP server for Claude Code that automatically captures development conversations and uses Claude Opus to generate, review, and manage Architecture Decision Records (ADRs).

> **TL;DR:** Install once, and every Claude Code session ends with a structured ADR saved to `~/.adr-mcp/adrs/` — no manual writing required.

## What problem does this solve?

Engineering teams make dozens of architectural decisions every week — which database to use, how to handle auth, whether to go monolith or microservices — but rarely write them down. Months later, nobody remembers why Redis was chosen over Memcached, or why the team avoided GraphQL.

**adr-skills** solves this by turning your existing Claude Code conversations into permanent, searchable ADR documents automatically.

## How it works

1. You have a normal development conversation in Claude Code
2. When the session ends, the Stop Hook captures the transcript
3. Claude Opus analyzes the conversation and extracts the architectural decision
4. A structured markdown ADR is saved to `~/.adr-mcp/adrs/ADR-0001-*.md`
5. Use `review_adr` to score quality, `link_adrs` to map dependencies, `check_stale_adrs` to surface outdated decisions

## Features

- **Auto session capture** — Stop Hook saves conversations automatically on Claude Code exit; no manual steps
- **AI-powered ADR generation** — Claude Opus extracts context, decision, and consequences from raw conversation
- **AI quality review** — Scores ADR completeness 0–100 and flags missing context, unconsidered alternatives, or optimistic consequences
- **Duplicate detection** — Warns when a new decision overlaps with a past one before saving
- **Markdown export** — Every ADR exported as `ADR-NNNN-slug.md`, ready to commit alongside your code
- **Status lifecycle** — Track decisions through `Proposed → Accepted → Deprecated → Superseded`
- **Dependency graph** — Link ADRs with `related_to`, `conflicts_with`, `depends_on` and visualize relationships
- **Stale ADR alerts** — Surface `Accepted` decisions older than N months that may need revisiting
- **Keyword search** — Find past decisions by technology name (e.g. Redis, JWT, PostgreSQL)
- **Timeline view** — Full decision history per project, correlated with git commits

## How is this different from existing ADR tools?

| Tool | Auto-capture from chat | AI generation | Quality review | MCP server |
|---|:---:|:---:|:---:|:---:|
| **adr-skills** | ✅ | ✅ Claude Opus | ✅ | ✅ |
| adr-tools (CLI) | ❌ | ❌ | ❌ | ❌ |
| mcp-adr-analysis-server | ❌ | ✅ OpenRouter | ❌ | ✅ |
| claude-historian-mcp | ✅ | ❌ | ❌ | ✅ |
| log4brains | ❌ | ❌ | ❌ | ❌ |

No existing tool combines automatic conversation capture with AI-powered ADR generation in a single MCP server. There is an [open feature request](https://github.com/anthropics/claude-code/issues/13853) on the Anthropic repo for native ADR support — adr-skills fills that gap today.

## Installation

```bash
git clone https://github.com/wooxogh/adr-mcp-setup.git
cd adr-mcp-setup
npm install
```

### Register with Claude Code

```bash
claude mcp add adr-skills node /absolute/path/to/adr-mcp-setup/index.js
```

### Environment setup

```bash
cp .env.example .env
# Add your ANTHROPIC_API_KEY to .env
```

> Without the API key, `generate_adr` falls back to keyword-based extraction and `review_adr` is unavailable. `.env` is in `.gitignore` — your key will never be committed.

### Enable auto session capture (Stop Hook)

Add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "node /absolute/path/to/adr-mcp-setup/hook.js"
      }]
    }]
  }
}
```

## Tools (9 total)

| Tool | Description | Requires API key |
|---|---|:---:|
| `save_session` | Save a conversation to the database | ❌ |
| `generate_adr` | Auto-generate an ADR from a session | ❌ (AI mode: ✅) |
| `review_adr` | Score ADR quality and get improvement suggestions | ✅ |
| `update_adr_status` | Transition ADR through its lifecycle | ❌ |
| `link_adrs` | Create relationships between ADRs | ❌ |
| `get_adr_graph` | Visualize the ADR dependency graph | ❌ |
| `check_stale_adrs` | Find old Accepted ADRs that need revisiting | ❌ |
| `search_decisions` | Keyword search across all past decisions | ❌ |
| `get_timeline` | Decision history for a project | ❌ |

### `generate_adr` example output

```markdown
# ADR-1: Adopt Redis as the caching layer

## Status
Accepted

## Context
We needed pub/sub support for real-time notifications.
Memcached only handles simple key-value caching and could not meet this requirement.

## Decision
We adopted Redis as both cache and message broker.
It supports pub/sub, TTL, and persistence, and the team already has operational experience with it.

## Consequences
Real-time features can now be implemented without a separate message broker.
We must account for Redis operational costs and treat it as a potential single point of failure.
```

### `review_adr` example output

```
## ADR-1 Review — Score: 62/100

Good context, but decision rationale and risk coverage need work.

### Issues
🔴 [decision] No alternatives were considered before choosing Redis
🟡 [consequences] Risks are mentioned but mitigation strategies are missing

### Suggestions
1. Explicitly document why Memcached was rejected
2. Add a rollback plan if Redis becomes a bottleneck
```

### `get_adr_graph` example output

```
## ADR Dependency Graph

### depends on
  ADR-5 "Use JWT for auth"  →  ADR-2 "Adopt Redis as cache"

### conflicts with
  ADR-7 "Move to stateless sessions"  ✕  ADR-2 "Adopt Redis as cache"
```

## FAQ

**Q: Do I need an Anthropic API key?**
No. Without a key, `generate_adr` uses keyword extraction as a fallback. With a key, Claude Opus produces significantly more accurate ADRs and `review_adr` becomes available.

**Q: Where are ADRs stored?**
Two places: SQLite database at `~/.adr-mcp/sessions.db` and markdown files at `~/.adr-mcp/adrs/`. The markdown files are git-committable.

**Q: Can I use this without the Stop Hook?**
Yes. Call `save_session` manually with your conversation text, then `generate_adr` with the returned session ID.

**Q: Does this work with other AI assistants besides Claude?**
The MCP server protocol is open, but the Stop Hook is Claude Code-specific. The database and markdown exports are tool-agnostic.

**Q: How does duplicate detection work?**
When generating an ADR, adr-skills extracts significant keywords from the title and decision text and queries for overlapping past ADRs. Matches are shown as warnings — the new ADR is still saved.

**Q: What ADR format does this use?**
The [Michael Nygard ADR format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) (Title, Status, Context, Decision, Consequences), which is the most widely adopted format in the software industry.

## Project structure

```
adr-mcp-setup/
├── index.js      ← MCP server — 9 tool definitions and routing
├── db.js         ← SQLite CRUD (sessions, adrs, adr_relations tables)
├── adr.js        ← ADR extraction and AI review logic (Claude Opus)
├── hook.js       ← Claude Code Stop Hook for automatic session capture
├── .env.example  ← Environment variable template
└── package.json
```

**Database:** `~/.adr-mcp/sessions.db`
**ADR files:** `~/.adr-mcp/adrs/ADR-NNNN-slug.md`

## Requirements

- Node.js 18+
- Claude Code CLI
- Anthropic API Key *(optional — required for AI generation and review)*
