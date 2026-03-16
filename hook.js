#!/usr/bin/env node
// Claude Code Stop Hook — automatically saves the session when Claude Code exits.
// Register in ~/.claude/settings.json:
//
//   "hooks": {
//     "Stop": [{
//       "matcher": "",
//       "hooks": [{ "type": "command", "command": "node /absolute/path/to/adr-skills/hook.js" }]
//     }]
//   }

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { saveSession } from './db.js';

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  try {
    const hook = JSON.parse(raw);
    const { transcript_path, cwd } = hook;

    if (!transcript_path || !fs.existsSync(transcript_path)) process.exit(0);

    // Parse JSONL transcript — each line is a message object
    const conversation = fs.readFileSync(transcript_path, 'utf8')
      .split('\n')
      .filter(Boolean)
      .flatMap(line => {
        try {
          const msg = JSON.parse(line);
          if (!msg.role || !msg.content) return [];
          const text = Array.isArray(msg.content)
            ? msg.content.filter(b => b.type === 'text').map(b => b.text).join(' ')
            : String(msg.content);
          return [`[${msg.role}] ${text}`];
        } catch { return []; }
      })
      .join('\n');

    if (!conversation.trim()) process.exit(0);

    const project = path.basename(cwd ?? process.cwd());

    let git_commit = null;
    try {
      git_commit = execSync('git rev-parse HEAD', { cwd, stdio: ['pipe', 'pipe', 'ignore'] })
        .toString().trim();
    } catch { /* not a git repo */ }

    const id = saveSession({ project, conversation, git_commit });
    console.error(`[adr-skills] Session auto-saved (ID: ${id}, project: ${project})`);
  } catch (err) {
    console.error(`[adr-skills] Hook error: ${err.message}`);
  }

  process.exit(0);
});
