const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const db = require('../db');
const server = require('../server');

// Mock request / response dispatcher to bypass sandbox socket restrictions
function dispatchRequest(method, pathname, body = null) {
  return new Promise((resolve) => {
    const req = new EventEmitter();
    req.method = method;
    req.url = pathname;
    req.headers = { host: 'localhost' };
    req.socket = { destroy: () => {} };

    const res = new EventEmitter();
    let statusCode = 200;
    let headers = {};
    let responseData = '';

    res.writeHead = (status, hdrs = {}) => {
      statusCode = status;
      headers = { ...headers, ...hdrs };
    };

    res.setHeader = (k, v) => {
      headers[k.toLowerCase()] = v;
    };

    res.write = (chunk) => {
      responseData += chunk;
    };

    res.end = (chunk) => {
      if (chunk) responseData += chunk;
      let json = null;
      try {
        json = JSON.parse(responseData);
      } catch (_) {}
      resolve({ status: statusCode, headers, text: responseData, json });
    };

    // Trigger request on server
    server.emit('request', req, res);

    if (body) {
      const payload = typeof body === 'string' ? body : JSON.stringify(body);
      req.emit('data', Buffer.from(payload));
    }
    req.emit('end');
  });
}

test('Database: Projects and Initial Seeding', () => {
  const projects = db.getProjects();
  assert.ok(Array.isArray(projects));
  assert.ok(projects.length >= 3);
  assert.ok(projects.some(p => p.slug === 'CORE'));
});

test('Database: Issues Retrieval & Filtering', () => {
  const allIssues = db.getIssues({});
  assert.ok(Array.isArray(allIssues));
  assert.ok(allIssues.length >= 4);

  const inProgress = db.getIssues({ status: 'in_progress' });
  assert.ok(inProgress.every(i => i.status === 'in_progress'));
});

test('Database: Create, Update, and Delete Issue', () => {
  const created = db.createIssue(
    'Refactor distributed cache evictions',
    'Detailed description of cache policy',
    'todo',
    'high',
    'improvement',
    1
  );
  assert.ok(created.id);
  assert.ok(created.issue_key.startsWith('CORE-'));
  assert.equal(created.status, 'todo');

  const updated = db.updateIssue(created.id, {
    status: 'in_progress',
    priority: 'urgent',
    title: 'Refactor distributed cache evictions (URGENT)'
  });
  assert.equal(updated.status, 'in_progress');
  assert.equal(updated.priority, 'urgent');

  // Verify activity log recorded change
  const activity = db.getActivity(created.id);
  assert.ok(activity.length >= 2);

  // Clean up
  db.deleteIssue(created.id);
  const deleted = db.getIssueById(created.id);
  assert.equal(deleted, undefined);
});

test('Database: Stats calculation', () => {
  const stats = db.getStats();
  assert.ok(stats.total >= 3);
  assert.ok(stats.completionRate >= 0 && stats.completionRate <= 100);
});

test('HTTP Server: GET /api/health returns UP', async () => {
  const res = await dispatchRequest('GET', '/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.json.status, 'UP');
  assert.equal(res.json.app, 'Velo Workspace');
});

test('HTTP Server: GET /api/projects returns list', async () => {
  const res = await dispatchRequest('GET', '/api/projects');
  assert.equal(res.status, 200);
  assert.equal(res.json.success, true);
  assert.ok(Array.isArray(res.json.projects));
});

test('HTTP Server: POST /api/issues creates an issue', async () => {
  const res = await dispatchRequest('POST', '/api/issues', {
    title: 'Test issue from HTTP API',
    description: 'Testing REST creation',
    status: 'backlog',
    priority: 'low',
    project_id: 1
  });
  assert.equal(res.status, 201);
  assert.equal(res.json.success, true);
  assert.ok(res.json.issue.id);

  // Cleanup
  db.deleteIssue(res.json.issue.id);
});

test('HTTP Server: PATCH /api/issues/:id updates status', async () => {
  const temp = db.createIssue('Temporary issue', '', 'todo', 'medium', 'bug', 1);
  const res = await dispatchRequest('PATCH', `/api/issues/${temp.id}`, {
    status: 'done'
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.issue.status, 'done');

  // Cleanup
  db.deleteIssue(temp.id);
});

test('HTTP Server: GET /api/export returns CSV format', async () => {
  const res = await dispatchRequest('GET', '/api/export?format=csv');
  assert.equal(res.status, 200);
  assert.ok(res.headers['content-type'].includes('text/csv'));
  assert.ok(res.text.includes('Key,Title,Status,Priority'));
});

test('HTTP Server: Serves index.html, style.css, app.js', async () => {
  const html = await dispatchRequest('GET', '/');
  assert.equal(html.status, 200);
  assert.ok(html.text.includes('Velo — Issue Tracking & Workspace'));
  assert.ok(html.text.includes('Doston Sulaymon'));

  const css = await dispatchRequest('GET', '/style.css');
  assert.equal(css.status, 200);
  assert.ok(css.text.includes('--bg-sidebar'));

  const js = await dispatchRequest('GET', '/app.js');
  assert.equal(js.status, 200);
  assert.ok(js.text.includes('Velo — Client Engine'));
});
