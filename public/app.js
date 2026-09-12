// Velo — Client Engine
(function () {
  'use strict';

  // Application State
  let issues = [];
  let projects = [];
  let currentView = 'list'; // 'list' | 'board'
  let currentViewFilter = 'all'; // 'all' | 'active' | 'backlog' | 'done'
  let activeIssue = null;

  // DOM Elements
  const viewList = document.getElementById('view-list');
  const viewBoard = document.getElementById('view-board');
  const btnToggleList = document.getElementById('btn-toggle-list');
  const btnToggleBoard = document.getElementById('btn-toggle-board');
  const currentViewTitle = document.getElementById('current-view-title');
  const globalSearch = document.getElementById('global-search');
  const filterStatus = document.getElementById('filter-status');
  const filterPriority = document.getElementById('filter-priority');
  const filterProject = document.getElementById('filter-project');
  const filteredCount = document.getElementById('filtered-count');

  // Modals
  const modalCreate = document.getElementById('modal-create-issue');
  const btnOpenCreate = document.getElementById('btn-open-create-modal');
  const btnCloseCreate = document.getElementById('btn-close-create-modal');
  const btnCancelCreate = document.getElementById('btn-cancel-create');
  const formCreate = document.getElementById('form-create-issue');

  // Command Palette
  const modalCommand = document.getElementById('modal-command-palette');
  const commandInput = document.getElementById('command-search-input');
  const commandList = document.getElementById('command-results-list');

  // Drawer
  const drawer = document.getElementById('issue-detail-drawer');
  const drawerBackdrop = document.getElementById('drawer-backdrop');
  const btnCloseDrawer = document.getElementById('btn-close-drawer');
  const drawerIssueKey = document.getElementById('drawer-issue-key');
  const drawerTitle = document.getElementById('drawer-title');
  const drawerStatus = document.getElementById('drawer-status');
  const drawerPriority = document.getElementById('drawer-priority');
  const drawerDescription = document.getElementById('drawer-description');
  const drawerActivityList = document.getElementById('drawer-activity-list');
  const btnSaveDrawer = document.getElementById('btn-save-drawer');
  const btnDeleteIssue = document.getElementById('btn-delete-issue');

  // Export
  const btnExportCsv = document.getElementById('btn-export-csv');

  // Icons Helper
  function getPriorityIcon(priority) {
    switch (priority) {
      case 'urgent':
        return `<span style="color: #ef4444; font-weight: 700;">▲ Urgent</span>`;
      case 'high':
        return `<span style="color: #f97316;">▰▰▰ High</span>`;
      case 'medium':
        return `<span style="color: #eab308;">▰▰▱ Med</span>`;
      case 'low':
        return `<span style="color: #3b82f6;">▰▱▱ Low</span>`;
      default:
        return `<span style="color: var(--text-muted);">---</span>`;
    }
  }

  function getStatusBadge(status) {
    switch (status) {
      case 'in_progress':
        return `<span class="badge badge-status" style="color: var(--status-inprogress); border-color: rgba(245, 158, 11, 0.3);"><span class="status-dot" style="background: var(--status-inprogress);"></span> In Progress</span>`;
      case 'done':
        return `<span class="badge badge-status" style="color: var(--status-done); border-color: rgba(16, 185, 129, 0.3);"><span class="status-dot" style="background: var(--status-done);"></span> Done</span>`;
      case 'backlog':
        return `<span class="badge badge-status" style="color: var(--status-backlog);"><span class="status-dot" style="background: var(--status-backlog);"></span> Backlog</span>`;
      default:
        return `<span class="badge badge-status" style="color: var(--status-todo);"><span class="status-dot" style="background: var(--status-todo);"></span> Todo</span>`;
    }
  }

  // Fetch Data
  async function loadProjects() {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      if (data.projects) {
        projects = data.projects;
        renderSidebarProjects();
        populateProjectSelects();
      }
    } catch (e) {
      console.error('Failed to load projects', e);
    }
  }

  async function loadIssues() {
    try {
      const res = await fetch('/api/issues');
      const data = await res.json();
      if (data.issues) {
        issues = data.issues;
        updateCounts();
        renderView();
      }
    } catch (e) {
      console.error('Failed to load issues', e);
    }
  }

  function renderSidebarProjects() {
    const container = document.getElementById('sidebar-projects-list');
    container.innerHTML = '';
    projects.forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'nav-item';
      btn.innerHTML = `
        <span class="project-dot" style="background: ${p.color};"></span>
        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${p.name}</span>
        <span class="nav-count">${p.issue_count || 0}</span>
      `;
      btn.addEventListener('click', () => {
        filterProject.value = p.id;
        applyFilters();
      });
      container.appendChild(btn);
    });
  }

  function populateProjectSelects() {
    const selectFilter = document.getElementById('filter-project');
    const selectCreate = document.getElementById('create-project');

    selectFilter.innerHTML = '<option value="all">Project: All</option>';
    selectCreate.innerHTML = '';

    projects.forEach(p => {
      selectFilter.innerHTML += `<option value="${p.id}">${p.name}</option>`;
      selectCreate.innerHTML += `<option value="${p.id}">${p.name}</option>`;
    });
  }

  function updateCounts() {
    const countAll = issues.length;
    const countActive = issues.filter(i => i.status === 'in_progress').length;
    const countBacklog = issues.filter(i => i.status === 'backlog').length;
    const countDone = issues.filter(i => i.status === 'done').length;

    document.getElementById('count-all').textContent = countAll;
    document.getElementById('count-active').textContent = countActive;
    document.getElementById('count-backlog').textContent = countBacklog;
    document.getElementById('count-done').textContent = countDone;
  }

  // Filter Logic
  function getFilteredIssues() {
    const searchVal = globalSearch.value.trim().toLowerCase();
    const statusVal = filterStatus.value;
    const priorityVal = filterPriority.value;
    const projectVal = filterProject.value;

    return issues.filter(issue => {
      // Sidebar View Filter
      if (currentViewFilter === 'active' && issue.status !== 'in_progress') return false;
      if (currentViewFilter === 'backlog' && issue.status !== 'backlog') return false;
      if (currentViewFilter === 'done' && issue.status !== 'done') return false;

      // Dropdown Filters
      if (statusVal !== 'all' && issue.status !== statusVal) return false;
      if (priorityVal !== 'all' && issue.priority !== priorityVal) return false;
      if (projectVal !== 'all' && String(issue.project_id) !== String(projectVal)) return false;

      // Search text
      if (searchVal) {
        const matchTitle = issue.title.toLowerCase().includes(searchVal);
        const matchKey = issue.issue_key.toLowerCase().includes(searchVal);
        const matchDesc = (issue.description || '').toLowerCase().includes(searchVal);
        if (!matchTitle && !matchKey && !matchDesc) return false;
      }

      return true;
    });
  }

  function applyFilters() {
    renderView();
  }

  // Render View (List or Board)
  function renderView() {
    const filtered = getFilteredIssues();
    filteredCount.textContent = `Showing ${filtered.length} of ${issues.length} issues`;

    if (currentView === 'list') {
      renderListView(filtered);
    } else {
      renderBoardView(filtered);
    }
  }

  // Render List
  function renderListView(filtered) {
    viewList.style.display = 'flex';
    viewBoard.style.display = 'none';
    viewList.innerHTML = '';

    if (filtered.length === 0) {
      viewList.innerHTML = `
        <div style="padding: 3rem; text-align: center; color: var(--text-muted); font-size: 0.88rem;">
          No issues match the selected criteria. Press <kbd class="shortcut-hint">C</kbd> to create one.
        </div>
      `;
      return;
    }

    filtered.forEach(issue => {
      const row = document.createElement('div');
      row.className = 'issue-row';
      row.innerHTML = `
        <div class="issue-key">${issue.issue_key}</div>
        <div class="badge badge-priority">${getPriorityIcon(issue.priority)}</div>
        <div class="issue-title">${escapeHtml(issue.title)}</div>
        <div class="issue-meta">
          ${issue.project_name ? `<span class="badge" style="background: rgba(255,255,255,0.04);"><span class="project-dot" style="background: ${issue.project_color || '#3b82f6'};"></span> ${issue.project_name}</span>` : ''}
          <span class="badge badge-label">${issue.label}</span>
          ${getStatusBadge(issue.status)}
          <span class="issue-date">${formatDate(issue.created_at)}</span>
        </div>
      `;

      row.addEventListener('click', () => openIssueDrawer(issue));
      viewList.appendChild(row);
    });
  }

  // Render Kanban Board
  function renderBoardView(filtered) {
    viewList.style.display = 'none';
    viewBoard.style.display = 'grid';

    const columns = {
      backlog: document.getElementById('col-backlog'),
      todo: document.getElementById('col-todo'),
      in_progress: document.getElementById('col-in_progress'),
      done: document.getElementById('col-done')
    };

    // Clear columns
    Object.values(columns).forEach(col => col.innerHTML = '');

    const counts = { backlog: 0, todo: 0, in_progress: 0, done: 0 };

    filtered.forEach(issue => {
      const colKey = issue.status in columns ? issue.status : 'todo';
      counts[colKey]++;

      const card = document.createElement('div');
      card.className = 'kanban-card';
      card.draggable = true;
      card.dataset.issueId = issue.id;

      card.innerHTML = `
        <div class="card-header">
          <span style="font-family: var(--font-mono); font-size: 0.72rem; color: var(--text-muted);">${issue.issue_key}</span>
          <span class="badge badge-priority">${getPriorityIcon(issue.priority)}</span>
        </div>
        <div class="card-title">${escapeHtml(issue.title)}</div>
        <div class="card-footer">
          <span class="badge badge-label">${issue.label}</span>
          ${issue.project_name ? `<span style="display: flex; align-items: center; gap: 4px; color: var(--text-muted);"><span class="project-dot" style="background: ${issue.project_color};"></span> ${issue.project_slug}</span>` : ''}
        </div>
      `;

      // Drag events
      card.addEventListener('dragstart', (e) => {
        card.classList.add('dragging');
        e.dataTransfer.setData('text/plain', issue.id);
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
      });

      card.addEventListener('click', () => openIssueDrawer(issue));
      columns[colKey].appendChild(card);
    });

    // Update column counters
    document.getElementById('count-col-backlog').textContent = counts.backlog;
    document.getElementById('count-col-todo').textContent = counts.todo;
    document.getElementById('count-col-in_progress').textContent = counts.in_progress;
    document.getElementById('count-col-done').textContent = counts.done;
  }

  // Setup Drag & Drop Handlers for Kanban Columns
  document.querySelectorAll('.kanban-column').forEach(col => {
    col.addEventListener('dragover', (e) => {
      e.preventDefault();
      col.style.borderColor = 'var(--border-focus)';
    });

    col.addEventListener('dragleave', () => {
      col.style.borderColor = '';
    });

    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      col.style.borderColor = '';
      const issueId = e.dataTransfer.getData('text/plain');
      const targetStatus = col.dataset.colStatus;

      if (!issueId || !targetStatus) return;

      // Optimistic update
      const issue = issues.find(i => String(i.id) === String(issueId));
      if (issue && issue.status !== targetStatus) {
        issue.status = targetStatus;
        updateCounts();
        renderView();

        try {
          await fetch(`/api/issues/${issueId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: targetStatus })
          });
        } catch (err) {
          console.error('Failed to update issue status', err);
          loadIssues(); // rollback
        }
      }
    });
  });

  // Open Issue Detail Drawer
  async function openIssueDrawer(issue) {
    activeIssue = issue;
    drawerIssueKey.textContent = issue.issue_key;
    drawerTitle.value = issue.title;
    drawerStatus.value = issue.status;
    drawerPriority.value = issue.priority;
    drawerDescription.value = issue.description || '';

    drawerActivityList.innerHTML = '<span style="color: var(--text-muted);">Loading activity...</span>';
    drawer.classList.add('open');
    drawerBackdrop.classList.add('open');

    try {
      const res = await fetch(`/api/issues/${issue.id}`);
      const data = await res.json();
      if (data.activity && data.activity.length > 0) {
        drawerActivityList.innerHTML = '';
        data.activity.forEach(act => {
          const item = document.createElement('div');
          item.innerHTML = `<strong>${act.action}:</strong> ${act.details || ''} <span style="opacity: 0.6; font-size: 0.7rem;">(${formatDate(act.created_at)})</span>`;
          drawerActivityList.appendChild(item);
        });
      } else {
        drawerActivityList.innerHTML = '<span>No recent activity logged.</span>';
      }
    } catch (e) {}
  }

  function closeIssueDrawer() {
    drawer.classList.remove('open');
    drawerBackdrop.classList.remove('open');
    activeIssue = null;
  }

  btnCloseDrawer.addEventListener('click', closeIssueDrawer);
  drawerBackdrop.addEventListener('click', closeIssueDrawer);

  btnSaveDrawer.addEventListener('click', async () => {
    if (!activeIssue) return;
    const title = drawerTitle.value.trim();
    const status = drawerStatus.value;
    const priority = drawerPriority.value;
    const description = drawerDescription.value;

    if (!title) return alert('Title cannot be empty');

    try {
      const res = await fetch(`/api/issues/${activeIssue.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, status, priority, description })
      });
      const data = await res.json();
      if (data.success) {
        closeIssueDrawer();
        loadIssues();
      }
    } catch (e) {
      alert('Failed to save issue');
    }
  });

  btnDeleteIssue.addEventListener('click', async () => {
    if (!activeIssue) return;
    if (confirm(`Permanently delete ${activeIssue.issue_key}?`)) {
      try {
        await fetch(`/api/issues/${activeIssue.id}`, { method: 'DELETE' });
        closeIssueDrawer();
        loadIssues();
      } catch (e) {
        alert('Failed to delete issue');
      }
    }
  });

  // Create Issue Modal Handlers
  function openCreateModal() {
    modalCreate.classList.add('open');
    document.getElementById('create-title').focus();
  }

  function closeCreateModal() {
    modalCreate.classList.remove('open');
    formCreate.reset();
  }

  btnOpenCreate.addEventListener('click', openCreateModal);
  btnCloseCreate.addEventListener('click', closeCreateModal);
  btnCancelCreate.addEventListener('click', closeCreateModal);

  formCreate.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('create-title').value.trim();
    const description = document.getElementById('create-description').value;
    const status = document.getElementById('create-status').value;
    const priority = document.getElementById('create-priority').value;
    const project_id = parseInt(document.getElementById('create-project').value, 10);

    if (!title) return;

    try {
      const res = await fetch('/api/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, status, priority, project_id, label: 'feature' })
      });
      const data = await res.json();
      if (data.success) {
        closeCreateModal();
        loadIssues();
        loadProjects();
      }
    } catch (err) {
      alert('Error creating issue');
    }
  });

  // View Switcher (List vs Board)
  btnToggleList.addEventListener('click', () => {
    currentView = 'list';
    btnToggleList.classList.add('active');
    btnToggleBoard.classList.remove('active');
    renderView();
  });

  btnToggleBoard.addEventListener('click', () => {
    currentView = 'board';
    btnToggleBoard.classList.add('active');
    btnToggleList.classList.remove('active');
    renderView();
  });

  // Sidebar Filter Items
  document.querySelectorAll('.sidebar-nav .nav-item[data-view-filter]').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.sidebar-nav .nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      currentViewFilter = item.dataset.viewFilter;
      currentViewTitle.textContent = item.querySelector('span').textContent;
      filterProject.value = 'all';
      applyFilters();
    });
  });

  // Filter Listeners
  globalSearch.addEventListener('input', applyFilters);
  filterStatus.addEventListener('change', applyFilters);
  filterPriority.addEventListener('change', applyFilters);
  filterProject.addEventListener('change', applyFilters);

  // Command Palette (Cmd+K)
  function openCommandPalette() {
    modalCommand.classList.add('open');
    commandInput.value = '';
    commandInput.focus();
    renderCommandResults('');
  }

  function closeCommandPalette() {
    modalCommand.classList.remove('open');
  }

  function renderCommandResults(query) {
    commandList.innerHTML = '';
    const q = query.toLowerCase();

    const staticActions = [
      { title: 'Create new issue', icon: '+', action: () => { closeCommandPalette(); openCreateModal(); } },
      { title: 'Switch to Board View', icon: '⊞', action: () => { closeCommandPalette(); btnToggleBoard.click(); } },
      { title: 'Switch to List View', icon: '☰', action: () => { closeCommandPalette(); btnToggleList.click(); } },
      { title: 'Export issues to CSV', icon: '⤓', action: () => { closeCommandPalette(); btnExportCsv.click(); } },
      { title: 'Show In-Progress issues', icon: '⚡', action: () => { closeCommandPalette(); filterStatus.value = 'in_progress'; applyFilters(); } }
    ];

    staticActions.filter(a => a.title.toLowerCase().includes(q)).forEach((a, idx) => {
      const item = document.createElement('div');
      item.className = `command-item ${idx === 0 ? 'focused' : ''}`;
      item.innerHTML = `<span><strong>${a.icon}</strong> &nbsp;${a.title}</span> <span class="shortcut-hint">Action</span>`;
      item.addEventListener('click', a.action);
      commandList.appendChild(item);
    });

    // Match issues
    if (q) {
      const matchedIssues = issues.filter(i => i.title.toLowerCase().includes(q) || i.issue_key.toLowerCase().includes(q)).slice(0, 6);
      matchedIssues.forEach(i => {
        const item = document.createElement('div');
        item.className = 'command-item';
        item.innerHTML = `<span><strong style="color:var(--text-muted); font-family:var(--font-mono);">${i.issue_key}</strong> &nbsp;${escapeHtml(i.title)}</span> <span class="badge badge-label">${i.status}</span>`;
        item.addEventListener('click', () => {
          closeCommandPalette();
          openIssueDrawer(i);
        });
        commandList.appendChild(item);
      });
    }
  }

  commandInput.addEventListener('input', (e) => {
    renderCommandResults(e.target.value);
  });

  // Global Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    // Cmd+K or Ctrl+K for Command Palette
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      if (modalCommand.classList.contains('open')) closeCommandPalette();
      else openCommandPalette();
      return;
    }

    // Esc closes modals and drawers
    if (e.key === 'Escape') {
      closeCommandPalette();
      closeCreateModal();
      closeIssueDrawer();
      return;
    }

    // '/' focuses search
    if (e.key === '/' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      globalSearch.focus();
      return;
    }

    // 'C' opens new issue
    if (e.key === 'c' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      openCreateModal();
      return;
    }
  });

  // Export CSV
  btnExportCsv.addEventListener('click', () => {
    window.location.href = '/api/export?format=csv';
  });

  // Helper Utilities
  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function formatDate(isoStr) {
    if (!isoStr) return '';
    const date = new Date(isoStr.replace(' ', 'T'));
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // Initial Load
  loadProjects();
  loadIssues();

})();
