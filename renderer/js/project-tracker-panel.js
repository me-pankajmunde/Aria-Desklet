/**
 * ProjectTrackerPanel — slide-up UI panel for project/task time tracking.
 *
 * Two tabs:
 *  • Projects — create/manage projects + tasks, start/stop timers
 *  • Logs     — per-session history with optional screenshot thumbnails
 *
 * Depends on: ProjectTracker (project-tracker.js)
 */
'use strict';

const ProjectTrackerPanel = {
  _el:         null,   // panel root element
  _tab:        'projects',
  _expanded:   {},     // which project rows are expanded
  _editingProject: null, // id of project being edited inline
  _addingTask:     null, // projectId for which a task is being added
  _editingTask:    null, // { projectId, taskId }
  _tickRef:        null,
  _logsScreenshots: {}, // cached dataURLs keyed by screenshot path

  // ── Lifecycle ─────────────────────────────────────────────────────────────────
  init() {
    this._el = document.getElementById('project-tracker-panel');
    if (!this._el) return;

    this._injectStyles();
    this.render();

    // Listen for tracker events
    window.addEventListener('pt-tracking-started', () => this.render());
    window.addEventListener('pt-tracking-stopped', () => this.render());

    // Update elapsed timer every second
    this._tickRef = setInterval(() => this._tickTimer(), 1000);
  },

  show() {
    if (!this._el) return;
    this._el.classList.remove('translate-y-full');
    this.render();
  },

  hide() {
    if (!this._el) return;
    this._el.classList.add('translate-y-full');
  },

  toggle() {
    if (!this._el) return;
    if (this._el.classList.contains('translate-y-full')) this.show();
    else this.hide();
  },

  // ── Main render ───────────────────────────────────────────────────────────────
  render() {
    if (!this._el) return;
    this._el.innerHTML = this._buildHTML();
    this._bindEvents();
  },

  _buildHTML() {
    const pt     = window.ProjectTracker;
    const active = pt && pt.active;

    return `
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
      <div class="flex items-center space-x-2">
        <span class="material-icons-round text-primary text-base">timer</span>
        <span class="font-bold text-slate-800 dark:text-white text-sm">Project Tracker</span>
      </div>
      <div class="flex items-center space-x-2">
        <!-- Tab switcher -->
        <div class="flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
          <button data-action="tab-projects"
            class="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors no-drag
            ${this._tab === 'projects'
              ? 'bg-primary text-black'
              : 'bg-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}">
            Projects
          </button>
          <button data-action="tab-logs"
            class="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors no-drag
            ${this._tab === 'logs'
              ? 'bg-primary text-black'
              : 'bg-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}">
            Logs
          </button>
        </div>
        <button data-action="close"
          class="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors no-drag">
          <span class="material-icons-round text-slate-500 text-base">close</span>
        </button>
      </div>
    </div>

    <!-- Active timer banner (shown only when tracking) -->
    ${active ? this._buildActiveBanner(active) : ''}

    <!-- Tab body -->
    <div class="flex-1 overflow-y-auto">
      ${this._tab === 'projects' ? this._buildProjectsTab() : this._buildLogsTab()}
    </div>
    `;
  },

  _buildActiveBanner(active) {
    const sec   = window.ProjectTracker.getElapsedSec();
    const label = active.taskName
      ? `${active.projectName} › ${active.taskName}`
      : active.projectName;
    return `
    <div class="flex items-center justify-between px-4 py-2 bg-primary/10 border-b border-primary/20 flex-shrink-0">
      <div class="flex items-center space-x-2 min-w-0">
        <span class="w-2 h-2 rounded-full bg-primary animate-pulse flex-shrink-0"></span>
        <span class="text-[10px] font-semibold text-primary uppercase tracking-widest flex-shrink-0">LIVE</span>
        <span class="text-[11px] text-slate-800 dark:text-white font-medium truncate">${this._esc(label)}</span>
      </div>
      <div class="flex items-center space-x-2 flex-shrink-0">
        <span id="pt-active-timer" class="text-xs font-mono text-primary font-bold">${this._formatTime(sec)}</span>
        <button data-action="stop-tracking"
          class="px-2 py-0.5 rounded-full bg-red-500/20 hover:bg-red-500/40 text-red-400 text-[10px] font-semibold no-drag transition-colors">
          STOP
        </button>
      </div>
    </div>`;
  },

  // ── Projects tab ──────────────────────────────────────────────────────────────
  _buildProjectsTab() {
    const pt = window.ProjectTracker;
    const projects = pt ? pt.projects : [];

    const rows = projects.map(p => this._buildProjectRow(p)).join('');

    return `
    <div class="p-3 space-y-2">
      ${rows || '<p class="text-xs text-slate-500 text-center py-6 italic">No projects yet — add one below!</p>'}

      <!-- Add project form -->
      ${this._buildAddProjectSection()}
    </div>`;
  },

  _buildProjectRow(p) {
    const pt       = window.ProjectTracker;
    const totalSec = pt.getTotalSec(p.id);
    const isOpen   = !!this._expanded[p.id];
    const isEditing = this._editingProject === p.id;

    if (isEditing) {
      return `
      <div class="rounded-xl border border-primary/40 bg-primary/5 p-2">
        <div class="flex items-center space-x-2">
          <input id="edit-proj-name" type="text" value="${this._esc(p.name)}"
            class="flex-1 bg-slate-100 dark:bg-slate-800 rounded-lg px-2 py-1 text-xs border-none focus:ring-1 focus:ring-primary no-drag" />
          <input id="edit-proj-color" type="color" value="${p.color || '#3b82f6'}"
            class="w-7 h-7 rounded cursor-pointer border-none bg-transparent no-drag" />
          <button data-action="save-edit-project" data-id="${p.id}"
            class="text-primary hover:text-primary-dim text-xs font-semibold no-drag">Save</button>
          <button data-action="cancel-edit-project"
            class="text-slate-500 hover:text-slate-700 text-xs no-drag">✕</button>
        </div>
      </div>`;
    }

    const taskRows = isOpen ? p.tasks.map(t => this._buildTaskRow(p, t)).join('') : '';
    const addingTask = this._addingTask === p.id;

    return `
    <div class="rounded-xl border border-slate-200 dark:border-slate-700/50 overflow-hidden">
      <!-- Project header row -->
      <div class="flex items-center px-3 py-2 bg-slate-50 dark:bg-slate-800/50">
        <button data-action="toggle-project" data-id="${p.id}"
          class="flex-1 flex items-center space-x-2 text-left no-drag min-w-0">
          <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${p.color || '#3b82f6'}"></span>
          <span class="text-xs font-semibold text-slate-800 dark:text-white truncate">${this._esc(p.name)}</span>
          <span class="text-[9px] text-slate-500 ml-auto flex-shrink-0 font-mono">${pt.formatDuration(totalSec)}</span>
          <span class="material-icons-round text-slate-400 text-[12px] flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}">expand_more</span>
        </button>
        <button data-action="edit-project" data-id="${p.id}"
          class="ml-1 text-slate-400 hover:text-primary transition-colors no-drag flex-shrink-0">
          <span class="material-icons-round text-[12px]">edit</span>
        </button>
        <button data-action="delete-project" data-id="${p.id}"
          class="ml-1 text-slate-400 hover:text-red-400 transition-colors no-drag flex-shrink-0">
          <span class="material-icons-round text-[12px]">delete</span>
        </button>
      </div>

      <!-- Task list (expanded) -->
      ${isOpen ? `
      <div class="divide-y divide-slate-100 dark:divide-slate-700/30 bg-white dark:bg-slate-900/30">
        ${taskRows || '<p class="text-[10px] text-slate-500 text-center py-2 italic">No tasks</p>'}

        <!-- Add task row -->
        ${addingTask
          ? `<div class="flex items-center space-x-2 px-3 py-2">
               <input id="new-task-name" type="text" placeholder="Task name…"
                 class="flex-1 bg-slate-100 dark:bg-slate-800 rounded-lg px-2 py-1 text-xs border-none focus:ring-1 focus:ring-primary no-drag" />
               <button data-action="save-add-task" data-pid="${p.id}"
                 class="text-primary hover:text-primary-dim text-xs font-semibold no-drag">Add</button>
               <button data-action="cancel-add-task"
                 class="text-slate-500 hover:text-slate-700 text-xs no-drag">✕</button>
             </div>`
          : `<button data-action="start-add-task" data-pid="${p.id}"
               class="w-full flex items-center space-x-1 px-3 py-1.5 text-[10px] text-primary hover:bg-primary/5 transition-colors no-drag">
               <span class="material-icons-round text-[12px]">add</span>
               <span>Add task</span>
             </button>`
        }
      </div>` : ''}
    </div>`;
  },

  _buildTaskRow(project, task) {
    const pt          = window.ProjectTracker;
    const taskSec     = pt.getTotalSec(project.id, task.id);
    const isActive    = pt.active &&
                        pt.active.projectId === project.id &&
                        pt.active.taskId    === task.id;
    const isEditing   = this._editingTask &&
                        this._editingTask.projectId === project.id &&
                        this._editingTask.taskId    === task.id;

    if (isEditing) {
      return `
      <div class="flex items-center space-x-2 px-3 py-1.5">
        <input id="edit-task-name" type="text" value="${this._esc(task.name)}"
          class="flex-1 bg-slate-100 dark:bg-slate-800 rounded-lg px-2 py-1 text-xs border-none focus:ring-1 focus:ring-primary no-drag" />
        <button data-action="save-edit-task" data-pid="${project.id}" data-tid="${task.id}"
          class="text-primary hover:text-primary-dim text-xs font-semibold no-drag">Save</button>
        <button data-action="cancel-edit-task"
          class="text-slate-500 hover:text-slate-700 text-xs no-drag">✕</button>
      </div>`;
    }

    return `
    <div class="flex items-center px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
      <span class="material-icons-round text-slate-400 text-[10px] mr-2 flex-shrink-0">assignment</span>
      <span class="flex-1 text-xs text-slate-700 dark:text-slate-300 truncate">${this._esc(task.name)}</span>
      <span class="text-[9px] font-mono text-slate-500 mr-2">${pt.formatDuration(taskSec)}</span>
      <button data-action="${isActive ? 'stop-tracking' : 'start-tracking'}"
        data-pid="${project.id}" data-tid="${task.id}"
        title="${isActive ? 'Stop timer' : 'Start timer'}"
        class="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-colors no-drag
               ${isActive
                 ? 'bg-red-500/20 hover:bg-red-500/40 text-red-400'
                 : 'bg-primary/10 hover:bg-primary/30 text-primary'}">
        <span class="material-icons-round text-[11px]">${isActive ? 'stop' : 'play_arrow'}</span>
      </button>
      <button data-action="edit-task" data-pid="${project.id}" data-tid="${task.id}"
        class="ml-1 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all no-drag">
        <span class="material-icons-round text-slate-400 text-[10px]">edit</span>
      </button>
      <button data-action="delete-task" data-pid="${project.id}" data-tid="${task.id}"
        class="ml-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all no-drag">
        <span class="material-icons-round text-red-400 text-[10px]">close</span>
      </button>
    </div>`;
  },

  _buildAddProjectSection() {
    return `
    <div class="pt-2 border-t border-slate-200 dark:border-slate-700/50">
      <div id="add-project-form" class="hidden flex-col space-y-2">
        <div class="flex items-center space-x-2">
          <input id="new-proj-name" type="text" placeholder="Project name…"
            class="flex-1 bg-slate-100 dark:bg-slate-800 rounded-lg px-3 py-1.5 text-xs border-none focus:ring-1 focus:ring-primary no-drag" />
          <input id="new-proj-color" type="color" value="#3b82f6"
            class="w-8 h-8 rounded cursor-pointer border-none bg-transparent no-drag" title="Pick color" />
        </div>
        <div class="flex space-x-2">
          <button data-action="save-add-project"
            class="flex-1 py-1.5 rounded-lg bg-primary text-black text-xs font-semibold hover:bg-primary-dim transition-colors no-drag">
            Add Project
          </button>
          <button data-action="cancel-add-project"
            class="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 text-xs hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors no-drag">
            Cancel
          </button>
        </div>
      </div>
      <button id="btn-show-add-project"
        class="w-full flex items-center justify-center space-x-1 py-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 text-xs text-slate-500 hover:border-primary hover:text-primary transition-colors no-drag">
        <span class="material-icons-round text-[14px]">add_circle_outline</span>
        <span>New Project</span>
      </button>
    </div>`;
  },

  // ── Logs tab ──────────────────────────────────────────────────────────────────
  _buildLogsTab() {
    const pt   = window.ProjectTracker;
    const logs = pt ? pt.getRecentLogs(null, null, 50) : [];

    if (!logs.length) {
      return `<p class="text-xs text-slate-500 text-center py-8 italic px-4">
                No sessions logged yet.<br/>Start a timer to begin tracking!
              </p>`;
    }

    const rows = logs.map(l => {
      const date  = new Date(l.start).toLocaleDateString([], { month: 'short', day: 'numeric' });
      const time  = new Date(l.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const label = l.taskName ? `${l.projectName} › ${l.taskName}` : l.projectName;
      const dur   = pt.formatDuration(l.durationSec);
      const shots = l.screenshots || [];

      return `
      <div class="px-3 py-2 border-b border-slate-100 dark:border-slate-700/30 last:border-0">
        <div class="flex items-start justify-between">
          <div class="min-w-0 flex-1">
            <p class="text-[11px] font-semibold text-slate-800 dark:text-white truncate">${this._esc(label)}</p>
            <p class="text-[9px] text-slate-500">${date} · ${time}</p>
          </div>
          <span class="text-[10px] font-mono font-bold text-primary ml-2 flex-shrink-0">${dur}</span>
        </div>
        ${shots.length ? this._buildScreenshotThumbs(l.id, shots) : ''}
      </div>`;
    }).join('');

    return `<div class="divide-y divide-slate-100 dark:divide-slate-700/30">${rows}</div>`;
  },

  _buildScreenshotThumbs(logId, shots) {
    return `
    <div class="flex flex-wrap gap-1 mt-1.5">
      ${shots.slice(0, 6).map(s => `
        <button data-action="view-screenshot" data-path="${this._esc(s.path)}" data-logid="${logId}"
          class="w-12 h-8 rounded overflow-hidden bg-slate-200 dark:bg-slate-700 flex items-center justify-center no-drag hover:ring-1 hover:ring-primary transition-all">
          ${this._logsScreenshots[s.path]
            ? `<img src="${this._logsScreenshots[s.path]}" class="w-full h-full object-cover" />`
            : `<span class="material-icons-round text-slate-400 text-[12px]">image</span>`
          }
        </button>`).join('')}
    </div>`;
  },

  // ── Event binding ─────────────────────────────────────────────────────────────
  _bindEvents() {
    if (!this._el) return;
    this._el.addEventListener('click', e => this._onClick(e));
    this._el.addEventListener('keydown', e => this._onKey(e));

    // Show/hide the "add project" form
    const showBtn  = this._el.querySelector('#btn-show-add-project');
    const addForm  = this._el.querySelector('#add-project-form');
    if (showBtn && addForm) {
      showBtn.addEventListener('click', () => {
        addForm.classList.toggle('hidden');
        addForm.classList.toggle('flex');
        showBtn.classList.add('hidden');
        const nameInput = addForm.querySelector('#new-proj-name');
        if (nameInput) nameInput.focus();
      });
    }
  },

  _onClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    e.stopPropagation();
    const action = btn.dataset.action;
    const pt     = window.ProjectTracker;

    switch (action) {
      case 'close': this.hide(); break;
      case 'tab-projects': this._tab = 'projects'; this.render(); break;
      case 'tab-logs':     this._tab = 'logs';     this.render();
        this._lazyLoadScreenshots(); break;

      // Project CRUD
      case 'toggle-project':
        this._expanded[btn.dataset.id] = !this._expanded[btn.dataset.id];
        this.render(); break;

      case 'edit-project':
        this._editingProject = btn.dataset.id;
        this.render();
        this._el.querySelector('#edit-proj-name')?.focus();
        break;

      case 'save-edit-project': {
        const name  = this._el.querySelector('#edit-proj-name')?.value?.trim();
        const color = this._el.querySelector('#edit-proj-color')?.value;
        if (name) { pt.editProject(btn.dataset.id, name, color); }
        this._editingProject = null;
        this.render(); break;
      }

      case 'cancel-edit-project':
        this._editingProject = null;
        this.render(); break;

      case 'delete-project': {
        const proj = pt.projects.find(p => p.id === btn.dataset.id);
        if (proj && confirm(`Delete project "${proj.name}"?`)) {
          pt.deleteProject(btn.dataset.id);
          delete this._expanded[btn.dataset.id];
          this.render();
        }
        break;
      }

      // Task CRUD
      case 'start-add-task':
        this._addingTask = btn.dataset.pid;
        this.render();
        this._el.querySelector('#new-task-name')?.focus();
        break;

      case 'save-add-task': {
        const name = this._el.querySelector('#new-task-name')?.value?.trim();
        if (name) { pt.addTask(btn.dataset.pid, name); }
        this._addingTask = null;
        this.render(); break;
      }

      case 'cancel-add-task':
        this._addingTask = null;
        this.render(); break;

      case 'edit-task':
        this._editingTask = { projectId: btn.dataset.pid, taskId: btn.dataset.tid };
        this.render();
        this._el.querySelector('#edit-task-name')?.focus();
        break;

      case 'save-edit-task': {
        const name = this._el.querySelector('#edit-task-name')?.value?.trim();
        if (name) { pt.editTask(btn.dataset.pid, btn.dataset.tid, name); }
        this._editingTask = null;
        this.render(); break;
      }

      case 'cancel-edit-task':
        this._editingTask = null;
        this.render(); break;

      case 'delete-task':
        pt.deleteTask(btn.dataset.pid, btn.dataset.tid);
        this.render(); break;

      // Timer
      case 'start-tracking':
        pt.startTracking(btn.dataset.pid, btn.dataset.tid || null);
        this.render(); break;

      case 'stop-tracking':
        pt.stopTracking();
        this.render(); break;

      // Add project (form submit)
      case 'save-add-project': {
        const name  = this._el.querySelector('#new-proj-name')?.value?.trim();
        const color = this._el.querySelector('#new-proj-color')?.value || '#3b82f6';
        if (name) {
          const proj = pt.addProject(name, color);
          this._expanded[proj.id] = true; // auto-expand new project
        }
        this.render(); break;
      }

      case 'cancel-add-project':
        this.render(); break;

      // Screenshot preview
      case 'view-screenshot':
        this._openScreenshotPreview(btn.dataset.path);
        break;
    }
  },

  _onKey(e) {
    if (e.key === 'Enter') {
      const active = document.activeElement;
      if (!active) return;
      if (active.id === 'new-proj-name') {
        this._el.querySelector('[data-action="save-add-project"]')?.click();
      } else if (active.id === 'new-task-name') {
        this._el.querySelector('[data-action="save-add-task"]')?.click();
      } else if (active.id === 'edit-proj-name') {
        this._el.querySelector('[data-action="save-edit-project"]')?.click();
      } else if (active.id === 'edit-task-name') {
        this._el.querySelector('[data-action="save-edit-task"]')?.click();
      }
    }
  },

  // ── Active timer tick ─────────────────────────────────────────────────────────
  _tickTimer() {
    const timerEl = document.getElementById('pt-active-timer');
    if (!timerEl || !window.ProjectTracker) return;
    const sec = window.ProjectTracker.getElapsedSec();
    timerEl.textContent = this._formatTime(sec);

    // Also update the badge in the main desklet
    this._updateBadge();
  },

  _updateBadge() {
    const pt     = window.ProjectTracker;
    const badge  = document.getElementById('project-tracker-badge');
    const nameEl = document.getElementById('pt-badge-name');
    const timeEl = document.getElementById('pt-badge-time');
    if (!badge) return;

    if (pt && pt.active) {
      badge.classList.remove('hidden');
      if (nameEl) {
        nameEl.textContent = pt.active.taskName
          ? `${pt.active.projectName} › ${pt.active.taskName}`
          : pt.active.projectName;
      }
      if (timeEl) timeEl.textContent = this._formatTime(pt.getElapsedSec());
    } else {
      badge.classList.add('hidden');
    }
  },

  // ── Screenshot lazy-loading ────────────────────────────────────────────────────
  async _lazyLoadScreenshots() {
    if (!window.rClock || !window.ProjectTracker) return;
    const logs = window.ProjectTracker.getRecentLogs(null, null, 50);
    const needed = [];
    logs.forEach(l => (l.screenshots || []).forEach(s => {
      if (!this._logsScreenshots[s.path]) needed.push(s.path);
    }));
    if (!needed.length) return;
    await Promise.allSettled(needed.map(async p => {
      try {
        const dataUrl = await window.rClock.ptLoadScreenshot(p);
        if (dataUrl) this._logsScreenshots[p] = dataUrl;
      } catch { /* skip */ }
    }));
    // Re-render logs tab with images now loaded
    if (this._tab === 'logs') this.render();
  },

  async _openScreenshotPreview(filePath) {
    try {
      let dataUrl = this._logsScreenshots[filePath];
      if (!dataUrl) {
        dataUrl = await window.rClock.ptLoadScreenshot(filePath);
        if (dataUrl) this._logsScreenshots[filePath] = dataUrl;
      }
      if (!dataUrl) return;

      // Show a simple lightbox overlay
      const overlay = document.createElement('div');
      overlay.className = [
        'fixed inset-0 z-[80] bg-black/85 flex items-center justify-center',
        'cursor-pointer',
      ].join(' ');
      overlay.innerHTML = `
        <img src="${dataUrl}" class="max-w-[90vw] max-h-[80vh] rounded-xl shadow-2xl object-contain" />
        <button class="absolute top-4 right-4 text-white hover:text-red-400 no-drag">
          <span class="material-icons-round text-2xl">close</span>
        </button>`;
      overlay.addEventListener('click', () => overlay.remove());
      document.body.appendChild(overlay);
    } catch (e) {
      console.warn('[ProjectTrackerPanel] screenshot preview error:', e);
    }
  },

  // ── Helpers ───────────────────────────────────────────────────────────────────
  _formatTime(sec) {
    if (!sec || sec < 0) return '0:00:00';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  },

  _esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  _injectStyles() {
    const id = 'pt-panel-styles';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      #project-tracker-panel {
        transition: transform 0.3s ease-in-out;
      }
      #project-tracker-panel.translate-y-full {
        transform: translateY(100%);
      }
    `;
    document.head.appendChild(style);
  },
};

window.ProjectTrackerPanel = ProjectTrackerPanel;
