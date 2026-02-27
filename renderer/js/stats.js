/**
 * Stats — handles Focus time and Streak tracking
 */
'use strict';

const Stats = {
  focusMinutes: 0,
  streakDays: 0,
  _focusInterval: null,

  async init() {
    // Load stats from settings
    try {
      const cfg = await window.rClock.getSettings();
      this.streakDays = cfg.streakDays || 0;
      
      // Check if we should increment streak
      const lastOpenDate = cfg.lastOpenDate;
      const today = new Date().toDateString();
      
      if (lastOpenDate !== today) {
        if (lastOpenDate) {
          const lastDate = new Date(lastOpenDate);
          const now = new Date();
          const diffTime = Math.abs(now - lastDate);
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
          
          if (diffDays === 1) {
            this.streakDays++;
          } else if (diffDays > 1) {
            this.streakDays = 1; // Reset streak
          }
        } else {
          this.streakDays = 1; // First time
        }
        
        // Save new streak and date
        cfg.streakDays = this.streakDays;
        cfg.lastOpenDate = today;
        window.rClock.saveSettings(cfg);
      }
    } catch (e) {
      console.warn('Failed to load stats:', e);
    }

    this.updateUI();
    this.startFocusTimer();
  },

  startFocusTimer() {
    if (this._focusInterval) clearInterval(this._focusInterval);
    
    this._focusInterval = setInterval(() => {
      this.focusMinutes++;
      this.updateUI();
    }, 60000); // Every minute
  },

  updateUI() {
    const focusEl = document.getElementById('focus-stat');
    const streakEl = document.getElementById('streak-stat');
    
    if (focusEl) focusEl.textContent = `${this.focusMinutes}m`;
    if (streakEl) streakEl.textContent = `${this.streakDays}d`;
  }
};

window.Stats = Stats;
