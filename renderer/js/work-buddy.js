/**
 * WorkBuddy — Aria as your dedicated work session partner.
 *
 * Features:
 *  • startSession(goal)  — locks in a work goal, starts check-in timer
 *  • endSession()        — celebrates and saves the session
 *  • checkIn()           — called every 20 min; AI generates a goal-specific nudge
 *                          shown in the speech bubble above Aria's face
 *  • generatePartnerProfile() — asks AI to describe the user's ideal work partner
 *                               based on ActivityTracker patterns; posts to chat panel
 */
'use strict';

const WorkBuddy = {
  active:            false,
  goal:              '',
  startTime:         null,
  _cfg:              {},
  _checkInTimer:     null,
  _badgeTimer:       null,
  _speechTimer:      null,

  // Check-in every 20 minutes
  CHECK_IN_INTERVAL: 20 * 60 * 1000,

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  init(cfg) {
    this._cfg = cfg || {};
  },

  updateCfg(cfg) {
    this._cfg = { ...cfg };
  },

  // ── Session management ─────────────────────────────────────────────────────
  startSession(goal) {
    // End any existing session first
    if (this.active) this.endSession();

    this.active    = true;
    this.goal      = (goal || '').trim() || 'focused work';
    this.startTime = Date.now();

    // Notify ActivityTracker
    if (window.ActivityTracker) ActivityTracker.startSession(this.goal);

    // Show badge and initial message
    this._updateBadge(true);
    this._showSpeechBubble(`Goal locked in: "${this.goal}" 🎯 Let's do this!`);

    // React on face
    if (window.FaceCanvas) {
      FaceCanvas.setMood('focused');
      setTimeout(() => FaceCanvas.triggerReaction('star'), 300);
    }

    // Start periodic check-in timer
    this._checkInTimer = setInterval(() => this.checkIn(), this.CHECK_IN_INTERVAL);
  },

  endSession() {
    if (!this.active) return;

    clearInterval(this._checkInTimer);
    clearInterval(this._badgeTimer);
    this._checkInTimer = null;
    this._badgeTimer   = null;

    const elapsedMin = this._getElapsed();
    this.active      = false;
    const finishedGoal = this.goal;
    this.goal        = '';
    this.startTime   = null;

    // Notify ActivityTracker
    if (window.ActivityTracker) ActivityTracker.endSession();

    this._updateBadge(false);

    // Celebration message based on duration
    let msg;
    if (elapsedMin >= 90) {
      msg = `${elapsedMin}m of deep work! You're a legend! 🔥`;
    } else if (elapsedMin >= 25) {
      msg = `${elapsedMin}m of focus! Amazing work! 🎉`;
    } else {
      msg = `Session complete! Every minute of focus counts ✨`;
    }
    this._showSpeechBubble(msg);

    // Celebratory face reaction
    if (window.FaceCanvas) FaceCanvas.triggerReaction('star');
  },

  // Toggle helper for the Focus button (start or end)
  toggleSession(goal) {
    if (this.active) {
      this.endSession();
    } else {
      this.startSession(goal);
    }
  },

  // ── Periodic check-in ─────────────────────────────────────────────────────
  async checkIn() {
    if (!this.active || !window.rClock) return;
    const elapsed = this._getElapsed();
    try {
      const { message } = await window.rClock.getWorkCheckin({
        goal:           this.goal,
        elapsedMinutes: elapsed,
        cfg:            this._cfg,
      });
      this._showSpeechBubble(message);
    } catch (e) {
      // Silent fail — don't bother the user with errors during focus
    }
  },

  // ── Partner profile ────────────────────────────────────────────────────────
  async generatePartnerProfile() {
    if (!window.rClock) return;

    // Open chat panel and show thinking indicator
    if (window.ChatPanel) ChatPanel.show();

    const thinkEl = window.ChatPanel
      ? ChatPanel._addBubble('assistant', null, true)
      : null;

    try {
      const patterns  = window.ActivityTracker
        ? ActivityTracker.getWorkPatterns()
        : { avgSessionMinutes: 0, sessionsToday: 0, peakHours: [], workStyle: 'unknown' };

      const { profile } = await window.rClock.getPartnerProfile({
        workPatterns: patterns,
        cfg:          this._cfg,
      });

      if (thinkEl) thinkEl.remove();
      if (window.ChatPanel) {
        ChatPanel._addBubble('assistant',
          `✨ Your ideal work partner profile:\n\n${profile}`);
      }
      if (window.FaceCanvas) FaceCanvas.triggerReaction('heart');
    } catch (e) {
      if (thinkEl) thinkEl.remove();
      if (window.ChatPanel) {
        ChatPanel._addBubble('assistant',
          patterns && patterns.sessionsToday === 0
            ? 'Start a few focus sessions first so I can learn your work patterns! 📊'
            : `Hmm, I couldn't reach my brain right now. Try again in a moment! 🧠`);
      }
    }
  },

  // ── Private helpers ────────────────────────────────────────────────────────
  _getElapsed() {
    if (!this.startTime) return 0;
    return Math.floor((Date.now() - this.startTime) / 60000);
  },

  _showSpeechBubble(text) {
    const bubble = document.getElementById('speech-bubble');
    const textEl = document.getElementById('speech-text');
    if (!bubble || !textEl) return;

    textEl.textContent = text;
    bubble.classList.remove('opacity-0');
    bubble.classList.add('opacity-100');

    clearTimeout(this._speechTimer);
    this._speechTimer = setTimeout(() => {
      bubble.classList.remove('opacity-100');
      bubble.classList.add('opacity-0');
    }, 6000);
  },

  _updateBadge(show) {
    const badge   = document.getElementById('work-buddy-badge');
    const elapsed = document.getElementById('buddy-elapsed');
    if (!badge) return;

    if (show) {
      badge.classList.remove('hidden');
      // Update elapsed time display every 30 seconds
      this._badgeTimer = setInterval(() => {
        if (!elapsed || !this.startTime) return;
        const mins = this._getElapsed();
        elapsed.textContent = mins >= 60
          ? `${Math.floor(mins / 60)}h ${mins % 60}m`
          : `${mins}m`;
      }, 30000);
      // Set initial value immediately
      if (elapsed) elapsed.textContent = '0m';
    } else {
      badge.classList.add('hidden');
      clearInterval(this._badgeTimer);
      this._badgeTimer = null;
    }
  },
};

window.WorkBuddy = WorkBuddy;
