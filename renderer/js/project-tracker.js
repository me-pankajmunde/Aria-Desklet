/**
 * ProjectTracker — per-project / per-task time tracking with optional screenshots.
 *
 * Data model persisted under `pt_projects` and `pt_logs` in settings.json.
 *
 * Projects:  [{ id, name, color, tasks: [{ id, name }] }]
 * Logs:      [{ id, projectId, taskId, projectName, taskName,
 *               start, end, durationSec, screenshots: [{ path, ts }] }]
 *
 * Screenshots are taken every SCREENSHOT_INTERVAL_MS while a session is active.
 * The actual capture is delegated to window.rClock.ptCaptureScreen() (uses
 * desktopCapturer under the hood).  If capture fails the session continues
 * without a screenshot for that interval.
 *
 * Old logs (> 30 days) and orphaned screenshot files are pruned on init.
 */
'use strict';

const ProjectTracker = {
  // ── Public state ─────────────────────────────────────────────────────────────
  projects:       [],   // full project list
  logs:           [],   // completed + pruned time logs
  active:         null, // { projectId, taskId, projectName, taskName, start,
                        //   logId, screenshots: [], _timerRef, _screenshotRef }

  // How often to capture a screenshot while a session is active (5 minutes)
  SCREENSHOT_INTERVAL_MS: 5 * 60 * 1000,

  // ── Lifecycle ─────────────────────────────────────────────────────────────────
  async init() {
    try {
      const data      = await window.rClock.ptLoadData();
      this.projects   = data.projects || [];
      this.logs       = data.logs     || [];
    } catch (e) {
      this.projects = [];
      this.logs     = [];
      console.warn('[ProjectTracker] init error:', e);
    }
    // Prune logs older than 30 days on startup
    const cutoff    = Date.now() - 30 * 24 * 60 * 60 * 1000;
    this.logs       = this.logs.filter(l => new Date(l.start).getTime() > cutoff);
    await this._pruneOrphanScreenshots();
  },

  // ── Project CRUD ─────────────────────────────────────────────────────────────
  addProject(name, color) {
    const project = { id: this._uuid(), name: name.trim(), color: color || '#3b82f6', tasks: [] };
    this.projects.push(project);
    this._persist();
    return project;
  },

  editProject(id, name, color) {
    const p = this.projects.find(x => x.id === id);
    if (!p) return false;
    if (name  !== undefined) p.name  = name.trim();
    if (color !== undefined) p.color = color;
    this._persist();
    return true;
  },

  deleteProject(id) {
    this.projects = this.projects.filter(x => x.id !== id);
    // Logs for the deleted project are kept for historical reference
    this._persist();
    return true;
  },

  // ── Task CRUD ─────────────────────────────────────────────────────────────────
  addTask(projectId, name) {
    const p = this.projects.find(x => x.id === projectId);
    if (!p) return null;
    const task = { id: this._uuid(), name: name.trim() };
    p.tasks.push(task);
    this._persist();
    return task;
  },

  editTask(projectId, taskId, name) {
    const p = this.projects.find(x => x.id === projectId);
    if (!p) return false;
    const t = p.tasks.find(x => x.id === taskId);
    if (!t) return false;
    t.name = name.trim();
    this._persist();
    return true;
  },

  deleteTask(projectId, taskId) {
    const p = this.projects.find(x => x.id === projectId);
    if (!p) return false;
    p.tasks = p.tasks.filter(x => x.id !== taskId);
    this._persist();
    return true;
  },

  // ── Timer control ─────────────────────────────────────────────────────────────
  /**
   * Start tracking time for a project/task combination.
   * If a session is already active it is stopped first.
   */
  startTracking(projectId, taskId) {
    if (this.active) this.stopTracking();

    const project = this.projects.find(x => x.id === projectId);
    if (!project) return false;
    const task = taskId ? project.tasks.find(x => x.id === taskId) : null;

    this.active = {
      logId:       this._uuid(),
      projectId,
      taskId:      taskId || null,
      projectName: project.name,
      taskName:    task ? task.name : '',
      start:       new Date().toISOString(),
      screenshots: [],
    };

    // Kick off screenshot capture on interval
    this.active._screenshotRef = setInterval(
      () => this._captureScreenshot(),
      this.SCREENSHOT_INTERVAL_MS
    );

    // Dispatch event so UI can react
    window.dispatchEvent(new CustomEvent('pt-tracking-started', { detail: { ...this.active } }));
    return true;
  },

  /** Stop the active session, save the log entry, return the finished log. */
  stopTracking() {
    if (!this.active) return null;

    clearInterval(this.active._screenshotRef);

    const end         = new Date().toISOString();
    const durationSec = Math.floor(
      (new Date(end).getTime() - new Date(this.active.start).getTime()) / 1000
    );

    const entry = {
      id:          this.active.logId,
      projectId:   this.active.projectId,
      taskId:      this.active.taskId,
      projectName: this.active.projectName,
      taskName:    this.active.taskName,
      start:       this.active.start,
      end,
      durationSec,
      screenshots: this.active.screenshots,
    };

    this.logs.push(entry);
    const finished = { ...entry };
    this.active    = null;

    this._persist();
    window.dispatchEvent(new CustomEvent('pt-tracking-stopped', { detail: finished }));
    return finished;
  },

  /** Returns elapsed seconds for the currently active session, or 0. */
  getElapsedSec() {
    if (!this.active) return 0;
    return Math.floor((Date.now() - new Date(this.active.start).getTime()) / 1000);
  },

  // ── Stats helpers ─────────────────────────────────────────────────────────────
  /** Total seconds logged against a project (and optionally a specific task). */
  getTotalSec(projectId, taskId) {
    return this.logs
      .filter(l => l.projectId === projectId && (!taskId || l.taskId === taskId))
      .reduce((sum, l) => sum + (l.durationSec || 0), 0);
  },

  /** Recent completed logs, newest first, limited to `limit` entries. */
  getRecentLogs(projectId, taskId, limit = 20) {
    return [...this.logs]
      .filter(l =>
        (!projectId || l.projectId === projectId) &&
        (!taskId    || l.taskId    === taskId)
      )
      .sort((a, b) => new Date(b.start) - new Date(a.start))
      .slice(0, limit);
  },

  // ── Screenshot helper ─────────────────────────────────────────────────────────
  async _captureScreenshot() {
    if (!this.active || !window.rClock) return;
    try {
      const dataUrl = await window.rClock.ptCaptureScreen();
      if (!dataUrl) return;
      const savedPath = await window.rClock.ptSaveScreenshot({ dataUrl });
      if (savedPath) {
        this.active.screenshots.push({ path: savedPath, ts: new Date().toISOString() });
      }
    } catch (e) {
      console.warn('[ProjectTracker] screenshot error:', e.message);
    }
  },

  // ── Persistence ───────────────────────────────────────────────────────────────
  _persist() {
    if (!window.rClock) return;
    window.rClock.ptSaveData({ projects: this.projects, logs: this.logs })
      .catch(e => console.warn('[ProjectTracker] persist error:', e));
  },

  async _pruneOrphanScreenshots() {
    if (!window.rClock) return;
    const allPaths = this.logs.flatMap(l => (l.screenshots || []).map(s => s.path));
    try {
      await window.rClock.ptPruneScreenshots(allPaths);
    } catch (e) {
      console.warn('[ProjectTracker] prune error:', e);
    }
  },

  // ── Utilities ─────────────────────────────────────────────────────────────────
  /** Format seconds as Xh Ym or Xm. */
  formatDuration(sec) {
    if (!sec || sec < 0) return '0m';
    const m = Math.floor(sec / 60);
    const h = Math.floor(m / 60);
    return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
  },

  /** Lightweight random UUID for local identification (not cryptographically secure). */
  _uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  },
};

window.ProjectTracker = ProjectTracker;
