import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import os from 'os';

const DB_DIR = path.join(os.homedir(), '.adr-mcp');
const DB_PATH = path.join(DB_DIR, 'sessions.db');

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project TEXT NOT NULL,
    conversation TEXT NOT NULL,
    git_commit TEXT,
    summary TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS adrs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER,
    title TEXT NOT NULL,
    context TEXT,
    decision TEXT,
    consequences TEXT,
    status TEXT NOT NULL DEFAULT 'Accepted',
    superseded_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id),
    FOREIGN KEY (superseded_by) REFERENCES adrs(id)
  );

  CREATE TABLE IF NOT EXISTS adr_relations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_id INTEGER NOT NULL,
    to_id INTEGER NOT NULL,
    relation TEXT NOT NULL CHECK(relation IN ('related_to', 'conflicts_with', 'depends_on')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (from_id) REFERENCES adrs(id),
    FOREIGN KEY (to_id) REFERENCES adrs(id),
    UNIQUE(from_id, to_id, relation)
  );
`);

// Migrations for older schemas
const cols = db.prepare('PRAGMA table_info(adrs)').all().map(c => c.name);
if (!cols.includes('status'))        db.exec("ALTER TABLE adrs ADD COLUMN status TEXT NOT NULL DEFAULT 'Accepted'");
if (!cols.includes('superseded_by')) db.exec('ALTER TABLE adrs ADD COLUMN superseded_by INTEGER');

export function saveSession({ project, conversation, git_commit, summary }) {
  const result = db.prepare(
    'INSERT INTO sessions (project, conversation, git_commit, summary) VALUES (?, ?, ?, ?)'
  ).run(project, conversation, git_commit ?? null, summary ?? null);
  return result.lastInsertRowid;
}

export function saveADR({ session_id, title, context, decision, consequences }) {
  const result = db.prepare(
    'INSERT INTO adrs (session_id, title, context, decision, consequences) VALUES (?, ?, ?, ?, ?)'
  ).run(session_id, title, context, decision, consequences);
  return result.lastInsertRowid;
}

export function getADR(id) {
  return db.prepare('SELECT * FROM adrs WHERE id = ?').get(id);
}

export function updateADRStatus(id, status, superseded_by = null) {
  db.prepare('UPDATE adrs SET status = ?, superseded_by = ? WHERE id = ?')
    .run(status, superseded_by, id);
}

export function findSimilarADRs(title, decision) {
  const words = [...new Set([...title.split(/\s+/), ...decision.split(/\s+/)])]
    .filter(w => w.length > 4)
    .slice(0, 8);
  if (!words.length) return [];

  const conditions = words.map(() => '(a.title LIKE ? OR a.decision LIKE ?)').join(' OR ');
  const params = words.flatMap(w => [`%${w}%`, `%${w}%`]);

  return db.prepare(`
    SELECT a.id, a.title, a.status, a.created_at, s.project
    FROM adrs a JOIN sessions s ON s.id = a.session_id
    WHERE ${conditions}
    ORDER BY a.created_at DESC LIMIT 5
  `).all(...params);
}

// Relations
export function linkADRs(from_id, to_id, relation) {
  db.prepare(
    'INSERT OR IGNORE INTO adr_relations (from_id, to_id, relation) VALUES (?, ?, ?)'
  ).run(from_id, to_id, relation);
}

export function getADRRelations(adr_id) {
  return db.prepare(`
    SELECT r.relation, r.from_id, r.to_id,
           af.title AS from_title, at_.title AS to_title,
           af.status AS from_status, at_.status AS to_status
    FROM adr_relations r
    JOIN adrs af  ON af.id  = r.from_id
    JOIN adrs at_ ON at_.id = r.to_id
    WHERE r.from_id = ? OR r.to_id = ?
  `).all(adr_id, adr_id);
}

export function getAllRelations() {
  return db.prepare(`
    SELECT r.relation, r.from_id, r.to_id,
           af.title AS from_title, at_.title AS to_title
    FROM adr_relations r
    JOIN adrs af  ON af.id  = r.from_id
    JOIN adrs at_ ON at_.id = r.to_id
  `).all();
}

// Stale ADR detection
export function getStaleADRs(months = 6) {
  return db.prepare(`
    SELECT a.id, a.title, a.status, a.created_at, s.project
    FROM adrs a JOIN sessions s ON s.id = a.session_id
    WHERE a.status = 'Accepted'
      AND a.created_at <= datetime('now', '-' || ? || ' months')
    ORDER BY a.created_at ASC
  `).all(months);
}

export function getSession(id) {
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
}

export function searchDecisions(query) {
  return db.prepare(`
    SELECT s.id, s.project, s.summary, s.created_at, a.title, a.decision, a.status
    FROM sessions s LEFT JOIN adrs a ON a.session_id = s.id
    WHERE s.conversation LIKE ? OR s.summary LIKE ? OR a.decision LIKE ?
    ORDER BY s.created_at DESC LIMIT 10
  `).all(`%${query}%`, `%${query}%`, `%${query}%`);
}

export function getTimeline(project) {
  const where = project ? 'WHERE s.project = ?' : '';
  const params = project ? [project] : [];
  return db.prepare(`
    SELECT s.id, s.project, s.summary, s.git_commit, s.created_at,
           a.id as adr_id, a.title as adr_title, a.status
    FROM sessions s LEFT JOIN adrs a ON a.session_id = s.id
    ${where}
    ORDER BY s.created_at ASC
  `).all(...params);
}
