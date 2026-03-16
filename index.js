#!/usr/bin/env node
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  saveSession, saveADR, getADR, getSession,
  updateADRStatus, findSimilarADRs,
  linkADRs, getADRRelations, getAllRelations,
  getStaleADRs, searchDecisions, getTimeline,
} from './db.js';
import { extractADR, extractADRWithAI, reviewADR } from './adr.js';

const ADR_DIR = path.join(os.homedir(), '.adr-mcp', 'adrs');
if (!fs.existsSync(ADR_DIR)) fs.mkdirSync(ADR_DIR, { recursive: true });

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50);
}

function adrMarkdown(adrId, adr, session_id) {
  const supersededNote = adr.superseded_by
    ? `\n> Superseded by ADR-${adr.superseded_by}\n`
    : '';
  return `# ADR-${adrId}: ${adr.title}

## Status
${adr.status ?? 'Accepted'}
${supersededNote}
## Context
${adr.context}

## Decision
${adr.decision}

## Consequences
${adr.consequences}

---
_Generated: ${new Date().toISOString()}_
_Session ID: ${session_id}_`;
}

function exportADRFile(adrId, adr, session_id) {
  const filename = `ADR-${String(adrId).padStart(4, '0')}-${slugify(adr.title)}.md`;
  const filepath = path.join(ADR_DIR, filename);
  fs.writeFileSync(filepath, adrMarkdown(adrId, adr, session_id));
  return filepath;
}

// ─── Server ───────────────────────────────────────────────────────────────────

const server = new McpServer({ name: 'adr-skills', version: '0.2.0' });

server.registerTool('save_session', {
  description: 'Save a Claude Code development session to the database',
  inputSchema: {
    project:      z.string().describe('Project name'),
    conversation: z.string().describe('Full conversation text'),
    git_commit:   z.string().optional().describe('Current git commit hash'),
    summary:      z.string().optional().describe('Short session summary'),
  },
}, async (args) => {
  const id = saveSession(args);
  return { content: [{ type: 'text', text: `Session saved (ID: ${id})` }] };
});

server.registerTool('generate_adr', {
  description: 'Analyze a saved session and auto-generate an ADR. Exports a markdown file and warns about similar past decisions.',
  inputSchema: {
    session_id: z.number().describe('Session ID'),
  },
}, async ({ session_id }) => {
  const session = getSession(session_id);
  if (!session) throw new Error(`Session ${session_id} not found`);

  const adr = process.env.ANTHROPIC_API_KEY
    ? await extractADRWithAI(session.conversation)
    : extractADR(session.conversation);

  const similar = findSimilarADRs(adr.title, adr.decision);
  const adrId = saveADR({ session_id, ...adr });
  const filepath = exportADRFile(adrId, adr, session_id);

  let output = adrMarkdown(adrId, adr, session_id) + `\n\n---\n_Exported to: ${filepath}_`;

  if (similar.length > 0) {
    const warn = similar
      .map(s => `  • ADR-${s.id} [${s.status}] "${s.title}" (${s.project}, ${s.created_at.slice(0, 10)})`)
      .join('\n');
    output += `\n\n⚠️  Similar past decisions found:\n${warn}`;
  }

  return { content: [{ type: 'text', text: output }] };
});

server.registerTool('update_adr_status', {
  description: 'Update the status of an ADR: Proposed → Accepted → Deprecated → Superseded',
  inputSchema: {
    adr_id:        z.number().describe('ADR ID to update'),
    status:        z.enum(['Proposed', 'Accepted', 'Deprecated', 'Superseded']).describe('New status'),
    superseded_by: z.number().optional().describe('ID of the replacing ADR (required when status is Superseded)'),
  },
}, async ({ adr_id, status, superseded_by }) => {
  const adr = getADR(adr_id);
  if (!adr) throw new Error(`ADR ${adr_id} not found`);
  if (status === 'Superseded' && !superseded_by) {
    throw new Error('superseded_by is required when setting status to Superseded');
  }

  updateADRStatus(adr_id, status, superseded_by ?? null);

  const updated = { ...adr, status, superseded_by: superseded_by ?? null };
  exportADRFile(adr_id, updated, adr.session_id);

  const note = superseded_by ? ` (superseded by ADR-${superseded_by})` : '';
  return { content: [{ type: 'text', text: `ADR-${adr_id} updated to "${status}"${note}` }] };
});

server.registerTool('search_decisions', {
  description: 'Search past architectural decisions by keyword',
  inputSchema: {
    query: z.string().describe('Search term (e.g. Redis, PostgreSQL, JWT)'),
  },
}, async ({ query }) => {
  const results = searchDecisions(query);
  if (!results.length) return { content: [{ type: 'text', text: 'No results found' }] };

  const output = results.map(r =>
    `[${r.created_at}] ${r.project} — [${r.status ?? 'Accepted'}] ${r.title ?? 'untitled'}\n  Summary: ${r.summary ?? 'none'}\n  Decision: ${r.decision ?? 'none'}`
  ).join('\n\n');

  return { content: [{ type: 'text', text: output }] };
});

server.registerTool('get_timeline', {
  description: 'Get the decision timeline for a project',
  inputSchema: {
    project: z.string().optional().describe('Project name (omit for all projects)'),
  },
}, async ({ project }) => {
  const timeline = getTimeline(project);
  if (!timeline.length) return { content: [{ type: 'text', text: 'No records found' }] };

  const output = timeline.map(t => {
    const commit = t.git_commit ? ` (${t.git_commit.slice(0, 7)})` : '';
    const adr = t.adr_id ? ` → ADR-${t.adr_id} [${t.status}] "${t.adr_title}"` : '';
    return `[${t.created_at}] ${t.project}${commit}${adr}\n  ${t.summary ?? 'no summary'}`;
  }).join('\n');

  return { content: [{ type: 'text', text: output }] };
});

server.registerTool('review_adr', {
  description: 'AI quality review of an ADR — scores completeness, flags missing context, unconsidered alternatives, and optimistic consequences',
  inputSchema: {
    adr_id: z.number().describe('ADR ID to review'),
  },
}, async ({ adr_id }) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is required for AI review');
  }

  const adr = getADR(adr_id);
  if (!adr) throw new Error(`ADR ${adr_id} not found`);

  const review = await reviewADR(adr);

  const severityIcon = { high: '🔴', medium: '🟡', low: '🟢' };
  const issueLines = (review.issues ?? [])
    .map(i => `${severityIcon[i.severity] ?? '•'} [${i.field}] ${i.message}`)
    .join('\n') || 'No issues found';

  const suggestionLines = (review.suggestions ?? [])
    .map((s, i) => `${i + 1}. ${s}`)
    .join('\n') || 'No suggestions';

  const output = `## ADR-${adr_id} Review — Score: ${review.score}/100

**${review.summary}**

### Issues
${issueLines}

### Suggestions
${suggestionLines}`;

  return { content: [{ type: 'text', text: output }] };
});

server.registerTool('link_adrs', {
  description: 'Create a relationship between two ADRs: related_to, conflicts_with, or depends_on',
  inputSchema: {
    from_id:  z.number().describe('Source ADR ID'),
    to_id:    z.number().describe('Target ADR ID'),
    relation: z.enum(['related_to', 'conflicts_with', 'depends_on']).describe('Relationship type'),
  },
}, async ({ from_id, to_id, relation }) => {
  if (!getADR(from_id)) throw new Error(`ADR ${from_id} not found`);
  if (!getADR(to_id))   throw new Error(`ADR ${to_id} not found`);

  linkADRs(from_id, to_id, relation);
  return { content: [{ type: 'text', text: `Linked: ADR-${from_id} ${relation.replace(/_/g, ' ')} ADR-${to_id}` }] };
});

server.registerTool('get_adr_graph', {
  description: 'Visualize ADR dependency graph. Optionally scope to a single ADR.',
  inputSchema: {
    adr_id: z.number().optional().describe('Focus on a specific ADR (omit for full graph)'),
  },
}, async ({ adr_id }) => {
  const relations = adr_id ? getADRRelations(adr_id) : getAllRelations();

  if (!relations.length) {
    return { content: [{ type: 'text', text: 'No relations found. Use link_adrs to connect ADRs.' }] };
  }

  const ICONS = { related_to: '↔', conflicts_with: '✕', depends_on: '→' };

  // Build adjacency list grouped by relation type
  const groups = {};
  for (const r of relations) {
    const label = r.relation.replace(/_/g, ' ');
    if (!groups[label]) groups[label] = [];
    groups[label].push(
      `  ADR-${r.from_id} "${r.from_title}"  ${ICONS[r.relation] ?? '-'}  ADR-${r.to_id} "${r.to_title}"`
    );
  }

  const output = Object.entries(groups)
    .map(([label, lines]) => `### ${label}\n${lines.join('\n')}`)
    .join('\n\n');

  return { content: [{ type: 'text', text: `## ADR Dependency Graph\n\n${output}` }] };
});

server.registerTool('check_stale_adrs', {
  description: 'Find Accepted ADRs that have not been reviewed in a while and may need revisiting',
  inputSchema: {
    months: z.number().optional().describe('Age threshold in months (default: 6)'),
  },
}, async ({ months = 6 }) => {
  const stale = getStaleADRs(months);

  if (!stale.length) {
    return { content: [{ type: 'text', text: `No ADRs older than ${months} months. Everything looks fresh.` }] };
  }

  const lines = stale.map(a => {
    const age = Math.floor(
      (Date.now() - new Date(a.created_at).getTime()) / (1000 * 60 * 60 * 24 * 30)
    );
    return `• ADR-${a.id} (${a.project}, ${age}mo ago) — "${a.title}"`;
  }).join('\n');

  return {
    content: [{
      type: 'text',
      text: `⚠️  ${stale.length} ADR(s) older than ${months} months — consider reviewing:\n\n${lines}\n\nUse update_adr_status to mark as Deprecated or Superseded if no longer valid.`,
    }],
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('adr-skills MCP server running');
