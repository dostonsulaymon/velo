// Velo — Minimalist Engineering Workspace Backend (Node.js 23 Native)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');

const db = require('./db');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS'
  });
  res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 2e6) {
        req.socket.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS'
    });
    return res.end();
  }

  // REST API
  if (pathname.startsWith('/api/')) {
    try {
      // 1. Health
      if (pathname === '/api/health' && method === 'GET') {
        return sendJson(res, 200, {
          status: 'UP',
          app: 'Velo Workspace',
          runtime: `Node.js ${process.version}`,
          timestamp: new Date().toISOString()
        });
      }

      // 2. Stats
      if (pathname === '/api/stats' && method === 'GET') {
        const stats = db.getStats();
        return sendJson(res, 200, { success: true, stats });
      }

      // 3. Projects
      if (pathname === '/api/projects' && method === 'GET') {
        const projects = db.getProjects();
        return sendJson(res, 200, { success: true, projects });
      }

      if (pathname === '/api/projects' && method === 'POST') {
        const body = await parseJsonBody(req);
        if (!body.name || !body.slug) {
          return sendJson(res, 400, { error: 'Project name and slug are required' });
        }
        const created = db.createProject(body.name, body.slug.toUpperCase(), body.color, body.description);
        return sendJson(res, 201, { success: true, project: created });
      }

      // 4. Issues List & Create
      if (pathname === '/api/issues' && method === 'GET') {
        const issues = db.getIssues(parsedUrl.query);
        return sendJson(res, 200, { success: true, issues });
      }

      if (pathname === '/api/issues' && method === 'POST') {
        const body = await parseJsonBody(req);
        if (!body.title || !body.title.trim()) {
          return sendJson(res, 400, { error: 'Title is required' });
        }
        const created = db.createIssue(
          body.title.trim(),
          body.description || '',
          body.status || 'todo',
          body.priority || 'medium',
          body.label || 'feature',
          body.project_id || 1
        );
        return sendJson(res, 201, { success: true, issue: created });
      }

      // 5. Individual Issue Operations: /api/issues/:id
      const issueIdMatch = pathname.match(/^\/api\/issues\/(\d+)$/);
      if (issueIdMatch) {
        const id = parseInt(issueIdMatch[1], 10);

        if (method === 'GET') {
          const issue = db.getIssueById(id);
          if (!issue) return sendJson(res, 404, { error: 'Issue not found' });
          const activity = db.getActivity(id);
          return sendJson(res, 200, { success: true, issue, activity });
        }

        if (method === 'PATCH') {
          const body = await parseJsonBody(req);
          const updated = db.updateIssue(id, body);
          if (!updated) return sendJson(res, 404, { error: 'Issue not found' });
          return sendJson(res, 200, { success: true, issue: updated });
        }

        if (method === 'DELETE') {
          db.deleteIssue(id);
          return sendJson(res, 200, { success: true, message: `Issue #${id} deleted` });
        }
      }

      // 6. Export Dataset
      if (pathname === '/api/export' && method === 'GET') {
        const format = parsedUrl.query.format || 'json';
        const issues = db.getIssues({});

        if (format === 'csv') {
          const headers = ['Key', 'Title', 'Status', 'Priority', 'Label', 'Project', 'Created At'];
          const rows = issues.map(i => [
            `"${i.issue_key}"`,
            `"${(i.title || '').replace(/"/g, '""')}"`,
            `"${i.status}"`,
            `"${i.priority}"`,
            `"${i.label}"`,
            `"${i.project_name || ''}"`,
            `"${i.created_at}"`
          ].join(','));
          const csv = [headers.join(','), ...rows].join('\n');
          res.writeHead(200, {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="velo_issues.csv"'
          });
          return res.end(csv);
        } else {
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Disposition': 'attachment; filename="velo_issues.json"'
          });
          return res.end(JSON.stringify(issues, null, 2));
        }
      }

      return sendJson(res, 404, { error: 'API route not found' });
    } catch (err) {
      console.error('Server error:', err);
      return sendJson(res, 500, { error: 'Internal Server Error', message: err.message });
    }
  }

  // Static File Serving
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '') safePath = '/index.html';

  const filePath = path.join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('Access Denied');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404 Not Found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' });
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`[Velo] Production server running at http://localhost:${PORT}`);
  });
}

module.exports = server;
