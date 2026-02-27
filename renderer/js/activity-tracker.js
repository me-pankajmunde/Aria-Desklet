/**
 * ActivityTracker — focus session tracking, achievements, and productivity scoring.
 *
 * Persists data as `at_sessions` and `at_achievements` keys inside the existing
 * settings object (via window.rClock.saveSettings).
 *
 * Sessions older than 7 days are pruned on init to keep storage small.
 */
'use strict';

// ── Achievement definitions ────────────────────────────────────────────────────
const ACHIEVEMENTS = [
  {
    id:        'first_focus',
    label:     '🎯 First Focus',
    condition: (s) => s.some(x => (x.focusMinutes || 0) >= 25),
  },
  {
    id:        'deep_work',
    label:     '🔥 Deep Work Legend',
    condition: (s) => s.some(x => (x.focusMinutes || 0) >= 90),
  },
  {
    id:        'streak_3',
    label:     '⚡ 3-Day Streak',
    condition: (s, cfg) => (cfg.streakDays || 0) >= 3,
  },
  {
    id:        'streak_7',
    label:     '🏆 Week Warrior',
    condition: (s, cfg) => (cfg.streakDays || 0) >= 7,
  },
  {
    id:        'streak_30',
    label:     '👑 Monthly Master',
    condition: (s, cfg) => (cfg.streakDays || 0) >= 30,
  },
  {
    id:        'chatterbox',
    label:     '💬 Chatterbox',
    condition: (s) => {
      const today = new Date().toDateString();
      const msgs  = s
        .filter(x => new Date(x.start).toDateString() === today)
        .reduce((a, x) => a + (x.messages || 0), 0);
      return msgs >= 20;
    },
  },
  {
    id:        'early_bird',
    label:     '🌅 Early Bird',
    condition: (s) => s.some(x => new Date(x.start).getHours() < 8),
  },
  {
    id:        'night_owl',
    label:     '🦉 Night Owl',
    condition: (s) => s.some(x => {
      const end = x.end ? new Date(x.end) : new Date();
      return end.getHours() >= 22;
    }),
  },
  {
    id:        'multi_session',
    label:     '🔄 Marathon Day',
    condition: (s) => {
      const today = new Date().toDateString();
      return s.filter(x => new Date(x.start).toDateString() === today).length >= 4;
    },
  },
];

// ── Main module ────────────────────────────────────────────────────────────────
const ActivityTracker = {
  sessions:       [],   // completed sessions (last 7 days)
  currentSession: null, // active session object
  achievements:   [],   // earned achievement ids
  _cfg:           {},   // latest settings reference

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  async init() {
    try {
      this._cfg         = await window.rClock.getSettings();
      this.sessions     = this._cfg.at_sessions     || [];
      this.achievements = this._cfg.at_achievements || [];
    } catch (e) {
      this.sessions     = [];
      this.achievements = [];
      console.warn('[ActivityTracker] Failed to load from settings:', e);
    }
    // Prune sessions older than 7 days to keep storage lean
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    this.sessions = this.sessions.filter(s => new Date(s.start).getTime() > cutoff);
  },

  updateCfg(cfg) {
    this._cfg = { ...cfg };
  },

  // ── Session management ─────────────────────────────────────────────────────
  startSession(goal = '') {
    if (this.currentSession) this.endSession();
    this.currentSession = {
      start:        new Date().toISOString(),
      end:          null,
      goal:         goal,
      messages:     0,
      focusMinutes: 0,
    };
  },

  endSession() {
    if (!this.currentSession) return null;
    this.currentSession.end = new Date().toISOString();
    this.sessions.push({ ...this.currentSession });
    const finished      = { ...this.currentSession };
    this.currentSession = null;
    this._persist();
    this.checkAchievements();
    return finished;
  },

  recordMessage() {
    if (this.currentSession) {
      this.currentSession.messages = (this.currentSession.messages || 0) + 1;
    }
  },

  // ── Tick (called every minute from stats.js) ───────────────────────────────
  tick() {
    if (!this.currentSession) return;
    this.currentSession.focusMinutes = (this.currentSession.focusMinutes || 0) + 1;
    const m = this.currentSession.focusMinutes;
    // Fire milestone events at 25, 50, 90 minutes
    if (m === 25 || m === 50 || m === 90) {
      window.dispatchEvent(new CustomEvent('session-milestone', {
        detail: { minutes: m, goal: this.currentSession.goal },
      }));
    }
    // Check achievements every 5 minutes
    if (m % 5 === 0) this.checkAchievements();
  },

  // ── Achievements ───────────────────────────────────────────────────────────
  checkAchievements() {
    const allSessions = this.currentSession
      ? [...this.sessions, this.currentSession]
      : [...this.sessions];

    let changed = false;
    ACHIEVEMENTS.forEach(ach => {
      if (this.achievements.includes(ach.id)) return;
      try {
        if (ach.condition(allSessions, this._cfg)) {
          this.achievements.push(ach.id);
          changed = true;
          window.dispatchEvent(new CustomEvent('achievement-unlocked', {
            detail: { id: ach.id, label: ach.label },
          }));
        }
      } catch (e) { /* ignore individual check errors */ }
    });

    if (changed) this._persist();
  },

  // ── Metrics ────────────────────────────────────────────────────────────────
  /**
   * Productivity score 0-100:
   *  - 60% weighted by total focus minutes today (max credit at 240 min = 4h)
   *  - 40% weighted by session count today (max credit at 4 sessions)
   */
  getProductivityScore() {
    const today = new Date().toDateString();
    const all   = [
      ...this.sessions,
      ...(this.currentSession ? [this.currentSession] : []),
    ].filter(s => new Date(s.start).toDateString() === today);

    if (!all.length) return 0;
    const mins  = all.reduce((a, s) => a + (s.focusMinutes || 0), 0);
    const score = Math.round(
      Math.min(1, mins / 240) * 60 +
      Math.min(1, all.length / 4) * 40
    );
    return Math.min(100, score);
  },

  /**
   * Returns work-pattern summary for AI partner-profile generation.
   */
  getWorkPatterns() {
    const all = [
      ...this.sessions,
      ...(this.currentSession ? [this.currentSession] : []),
    ];
    const today    = new Date().toDateString();
    const todayAll = all.filter(s => new Date(s.start).toDateString() === today);

    if (!all.length) {
      return {
        avgSessionMinutes: 0, sessionsToday: 0,
        peakHours: [], productivityScore: 0, workStyle: 'just-starting',
      };
    }

    const avg = Math.round(all.reduce((a, s) => a + (s.focusMinutes || 0), 0) / all.length);

    // Count sessions by start hour
    const hourCounts = {};
    all.forEach(s => {
      const h = new Date(s.start).getHours();
      hourCounts[h] = (hourCounts[h] || 0) + 1;
    });
    const peak = Object.entries(hourCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([h]) => `${h}:00`);

    const style =
      avg >= 60         ? 'deep-diver'    :
      avg <= 20         ? 'sprint-worker' :
      todayAll.length >= 4 ? 'multi-session' : 'steady';

    return {
      avgSessionMinutes: avg,
      sessionsToday:     todayAll.length,
      peakHours:         peak,
      productivityScore: this.getProductivityScore(),
      workStyle:         style,
    };
  },

  getTodaySessionCount() {
    const today = new Date().toDateString();
    return [
      ...this.sessions,
      ...(this.currentSession ? [this.currentSession] : []),
    ].filter(s => new Date(s.start).toDateString() === today).length;
  },

  // ── Persistence ────────────────────────────────────────────────────────────
  _persist() {
    if (!this._cfg || !window.rClock) return;
    this._cfg.at_sessions     = this.sessions;
    this._cfg.at_achievements = this.achievements;
    window.rClock.saveSettings(this._cfg).catch(e => {
      console.warn('[ActivityTracker] persist error:', e);
    });
  },
};

window.ActivityTracker = ActivityTracker;
