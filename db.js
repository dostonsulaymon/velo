const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const DB_PATH = path.join(__dirname, 'velo.db');
let db;

try {
  db = new DatabaseSync(DB_PATH);
} catch (err) {
  db = new DatabaseSync(':memory:');
}

// Initialize tables for modern issue tracking
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT '#3b82f6',
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_key TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'todo',       -- backlog, todo, in_progress, done, canceled
    priority TEXT NOT NULL DEFAULT 'medium',   -- urgent, high, medium, low, none
    label TEXT DEFAULT 'feature',              -- bug, feature, improvement, design, docs
    project_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id)
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_id INTEGER,
    action TEXT NOT NULL,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(issue_id) REFERENCES issues(id) ON DELETE CASCADE
  );
`);

// Seed Default Projects if empty
const projectCount = db.prepare('SELECT COUNT(*) as count FROM projects').get();
if (projectCount && projectCount.count === 0) {
  const insertProject = db.prepare('INSERT INTO projects (name, slug, color, description) VALUES (?, ?, ?, ?)');
  insertProject.run('Core Engine v3', 'CORE', '#3b82f6', 'Next-gen distributed runtime and state engine');
  insertProject.run('Mobile App Redesign', 'MOB', '#8b5cf6', 'SwiftUI & React Native cross-platform app');
  insertProject.run('Developer Experience', 'DX', '#10b981', 'CLI, documentation, and SDK tooling');
}

// Seed Real Initial Issues if empty
const issueCount = db.prepare('SELECT COUNT(*) as count FROM issues').get();
if (issueCount && issueCount.count === 0) {
  const insertIssue = db.prepare(`
    INSERT INTO issues (issue_key, title, description, status, priority, label, project_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  insertIssue.run(
    'CORE-101',
    'Implement zero-copy buffer serializer in Node.js runtime',
    'Benchmark showed 18% GC overhead during high-concurrency ingestion. Replace JSON serialization with typed ArrayBuffers to optimize throughput.',
    'in_progress',
    'urgent',
    'improvement',
    1
  );

  insertIssue.run(
    'CORE-102',
    'Migrate session persistence to SQLite WAL mode',
    'Enable PRAGMA journal_mode=WAL to allow concurrent readers during heavy write bursts without blocking.',
    'done',
    'high',
    'feature',
    1
  );

  insertIssue.run(
    'MOB-204',
    'Add haptic feedback on pull-to-refresh gestures',
    'Integrate UIImpactFeedbackGenerator on iOS and VibrationEffect on Android when feed reload triggers.',
    'todo',
    'low',
    'design',
    2
  );

  insertIssue.run(
    'DX-305',
    'Refactor OpenAPI spec generator for nested route params',
    'Fix path resolution when handling catch-all wildcard routes such as /api/v1/files/*path.',
    'backlog',
    'medium',
    'bug',
    3
  );

  insertIssue.run(
    'DX-306',
    'Create single-command quickstart onboarding script',
    'Provide npx @velo/init script that scaffolds boilerplate repo with TypeScript and Biome pre-configured.',
    'done',
    'medium',
    'feature',
    3
  );

  insertIssue.run(
    'MOB-205',
    'Optimize launch time cold start below 200ms',
    'Defer non-essential telemetry initialization and pre-warm key SQLite read caches.',
    'in_progress',
    'high',
    'improvement',
    2
  );
}

module.exports = {
  db,
  getProjects: () => {
    return db.prepare(`
      SELECT p.*, COUNT(i.id) as issue_count 
      FROM projects p 
      LEFT JOIN issues i ON p.id = i.project_id 
      GROUP BY p.id
      ORDER BY p.name ASC
    `).all();
  },
  createProject: (name, slug, color, description) => {
    const info = db.prepare('INSERT INTO projects (name, slug, color, description) VALUES (?, ?, ?, ?)').run(name, slug, color, description);
    return db.prepare('SELECT * FROM projects WHERE id = ?').get(info.lastInsertRowid);
  },
  getIssues: (filters = {}) => {
    let sql = `
      SELECT i.*, p.name as project_name, p.color as project_color, p.slug as project_slug
      FROM issues i
      LEFT JOIN projects p ON i.project_id = p.id
      WHERE 1=1
    `;
    const params = [];

    if (filters.status && filters.status !== 'all') {
      sql += ' AND i.status = ?';
      params.push(filters.status);
    }
    if (filters.priority && filters.priority !== 'all') {
      sql += ' AND i.priority = ?';
      params.push(filters.priority);
    }
    if (filters.project_id) {
      sql += ' AND i.project_id = ?';
      params.push(filters.project_id);
    }
    if (filters.search) {
      sql += ' AND (i.title LIKE ? OR i.issue_key LIKE ? OR i.description LIKE ?)';
      const s = `%${filters.search}%`;
      params.push(s, s, s);
    }

    sql += ' ORDER BY CASE i.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END, i.id DESC';
    return db.prepare(sql).all(...params);
  },
  getIssueById: (id) => {
    return db.prepare(`
      SELECT i.*, p.name as project_name, p.color as project_color, p.slug as project_slug
      FROM issues i
      LEFT JOIN projects p ON i.project_id = p.id
      WHERE i.id = ?
    `).get(id);
  },
  createIssue: (title, description, status, priority, label, projectId) => {
    // Generate next key for project or default VEL
    const project = projectId ? db.prepare('SELECT slug FROM projects WHERE id = ?').get(projectId) : null;
    const prefix = project ? project.slug : 'VEL';
    const lastIssue = db.prepare('SELECT issue_key FROM issues WHERE issue_key LIKE ? ORDER BY id DESC LIMIT 1').get(`${prefix}-%`);
    
    let nextNum = 101;
    if (lastIssue && lastIssue.issue_key) {
      const match = lastIssue.issue_key.match(/-(\d+)$/);
      if (match) nextNum = parseInt(match[1], 10) + 1;
    }
    const issueKey = `${prefix}-${nextNum}`;

    const info = db.prepare(`
      INSERT INTO issues (issue_key, title, description, status, priority, label, project_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(issueKey, title, description || '', status || 'todo', priority || 'medium', label || 'feature', projectId || 1);

    const newId = info.lastInsertRowid;
    // Log activity
    db.prepare('INSERT INTO activity_log (issue_id, action, details) VALUES (?, ?, ?)').run(newId, 'created', `Issue created as ${status}`);

    return db.prepare(`
      SELECT i.*, p.name as project_name, p.color as project_color, p.slug as project_slug
      FROM issues i
      LEFT JOIN projects p ON i.project_id = p.id
      WHERE i.id = ?
    `).get(newId);
  },
  updateIssue: (id, updates) => {
    const fields = [];
    const params = [];

    if (updates.status !== undefined) {
      fields.push('status = ?');
      params.push(updates.status);
    }
    if (updates.priority !== undefined) {
      fields.push('priority = ?');
      params.push(updates.priority);
    }
    if (updates.title !== undefined) {
      fields.push('title = ?');
      params.push(updates.title);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      params.push(updates.description);
    }
    if (updates.label !== undefined) {
      fields.push('label = ?');
      params.push(updates.label);
    }
    if (updates.project_id !== undefined) {
      fields.push('project_id = ?');
      params.push(updates.project_id);
    }

    if (fields.length === 0) return null;

    fields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    db.prepare(`UPDATE issues SET ${fields.join(', ')} WHERE id = ?`).run(...params);

    if (updates.status) {
      db.prepare('INSERT INTO activity_log (issue_id, action, details) VALUES (?, ?, ?)').run(id, 'status_changed', `Moved to ${updates.status}`);
    }

    return db.prepare(`
      SELECT i.*, p.name as project_name, p.color as project_color, p.slug as project_slug
      FROM issues i
      LEFT JOIN projects p ON i.project_id = p.id
      WHERE i.id = ?
    `).get(id);
  },
  deleteIssue: (id) => {
    return db.prepare('DELETE FROM issues WHERE id = ?').run(id);
  },
  getActivity: (issueId) => {
    return db.prepare('SELECT * FROM activity_log WHERE issue_id = ? ORDER BY id DESC LIMIT 20').all(issueId);
  },
  getStats: () => {
    const total = db.prepare('SELECT COUNT(*) as count FROM issues').get().count;
    const completed = db.prepare('SELECT COUNT(*) as count FROM issues WHERE status = 'done'').get().count;
    const inProgress = db.prepare('SELECT COUNT(*) as count FROM issues WHERE status = 'in_progress'').get().count;
    const urgent = db.prepare('SELECT COUNT(*) as count FROM issues WHERE priority = 'urgent' AND status != 'done'').get().count;
    const byStatus = db.prepare('SELECT status, COUNT(*) as count FROM issues GROUP BY status').all();
    const byPriority = db.prepare('SELECT priority, COUNT(*) as count FROM issues GROUP BY priority').all();

    return {
      total,
      completed,
      inProgress,
      urgent,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      byStatus,
      byPriority
    };
  }
};
