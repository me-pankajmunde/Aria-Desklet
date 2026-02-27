/**
 * app.js — Main renderer entry point
 * Orchestrates: settings, theme, face, particles, clock, poems, tray IPC
 */
'use strict';

let cfg          = {};
let currentMin   = -1;
let currentHour  = -1;
let currentMood  = 'happy';

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  console.log('[app] init() called — readyState:', document.readyState);
  // Start clock IMMEDIATELY — never let "--:--" stay on screen
  _startFallbackClock();

  try {
    cfg = await window.rClock.getSettings();
  } catch (e) {
    console.warn('getSettings failed, using defaults:', e);
    cfg = {};
  }

  // Theme
  ThemeEngine.init(cfg.theme || 'glassmorphism');
  applyThemeAccent();

  // Face
  const faceEl = document.getElementById('face-container');
  FaceCanvas.init(faceEl);
  FaceCanvas.setColor(cfg.poem_color || ThemeEngine.getAccent());
  faceEl.addEventListener('click', (e) => {
    if (!e.ctrlKey) ChatPanel.toggle();
  });

  // Stats
  if (window.Stats) Stats.init();

  // Particles
  const partCanvas = document.getElementById('particle-canvas');
  ParticleEngine.init(partCanvas);
  ParticleEngine.setEnabled(cfg.particles !== false);

  // Voice
  Voice.init(cfg);

  // Chat
  ChatPanel.init();
  ChatPanel.updateCfg(cfg);

  // Easter Eggs
  EasterEggs.init(cfg);

  // Settings
  SettingsPanel.init(cfg);

  // Activity Tracker + Work Buddy (must come after EasterEggs so all globals are ready)
  if (window.ActivityTracker) await ActivityTracker.init();
  if (window.WorkBuddy)       WorkBuddy.init(cfg);

  // ── Achievement toast handler ────────────────────────────────────────────
  window.addEventListener('achievement-unlocked', (e) => {
    const label   = e.detail && e.detail.label ? e.detail.label : '🎉 Achievement!';
    const toast   = document.getElementById('achievement-toast');
    const labelEl = document.getElementById('achievement-label');
    if (!toast || !labelEl) return;

    labelEl.textContent = label;
    toast.classList.remove('opacity-0', 'translate-y-4');
    toast.classList.add('opacity-100', 'translate-y-0');

    // Celebratory face + particles
    if (window.FaceCanvas) FaceCanvas.triggerReaction('star');
    if (window.ParticleEngine && cfg.particles !== false) {
      ParticleEngine.setType('confetti', { count: 50, baseColor: null });
      setTimeout(() => applyDefaultParticlesForMood(currentMood, ThemeEngine.current()), 4500);
    }

    // Auto-dismiss toast after 3.5 s
    clearTimeout(window._achieveToastTimer);
    window._achieveToastTimer = setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-4');
      toast.classList.remove('opacity-100', 'translate-y-0');
    }, 3500);
  });

  // ── Session milestone handler (25m / 50m / 90m) ──────────────────────────
  window.addEventListener('session-milestone', (e) => {
    const m     = e.detail && e.detail.minutes;
    const msgs  = {
      25: '25 min of focus! You\'re on a roll! 🎯',
      50: '50 minutes in — incredible focus! 💪',
      90: '90 minutes deep! Absolute legend! 🔥',
    };
    const text  = msgs[m] || `${m} minutes of focus!`;
    const bubble = document.getElementById('speech-bubble');
    const textEl = document.getElementById('speech-text');
    if (bubble && textEl) {
      textEl.textContent = text;
      bubble.classList.remove('opacity-0');
      bubble.classList.add('opacity-100');
      clearTimeout(window._milestoneTimer);
      window._milestoneTimer = setTimeout(() => {
        bubble.classList.remove('opacity-100');
        bubble.classList.add('opacity-0');
      }, 5000);
    }
    if (window.FaceCanvas) FaceCanvas.triggerReaction('heart');
  });

  // Theme cycle from tray
  window.rClock.on('cycle-theme', () => {
    const next = ThemeEngine.cycle();
    cfg.theme = next;
    window.rClock.saveSettings(cfg);
    SettingsPanel.updateCfg(cfg);
    applyThemeAccent();
  });

  // Tray / IPC events
  window.rClock.on('open-chat',     () => ChatPanel.show());
  window.rClock.on('refresh-poem',  () => { currentMin = -1; });
  window.rClock.on('open-settings', () => SettingsPanel.show());

  // Settings live-update
  window.addEventListener('cfg-updated', (e) => {
    cfg = { ...e.detail };
    ChatPanel.updateCfg(cfg);
    EasterEggs.updateCfg(cfg);
    Voice.update(cfg);
    if (window.ActivityTracker) ActivityTracker.updateCfg(cfg);
    if (window.WorkBuddy)       WorkBuddy.updateCfg(cfg);
    applyThemeAccent();
    applyGlow();
  });

  // Theme change callbacks
  ThemeEngine.onChange((theme) => {
    const accent = ThemeEngine.getAccent(theme);
    FaceCanvas.setColor(accent);
    applyDefaultParticlesForMood(currentMood, theme);
  });

  // Settings button
  document.getElementById('btn-settings').addEventListener('click', () => SettingsPanel.show());

  // Voice button (read poem)
  document.getElementById('btn-voice').addEventListener('click', () => {
    const poem = document.getElementById('poem-text').textContent;
    const theme = ThemeEngine.current();
    Voice.speak(poem, theme);
    const btn = document.getElementById('btn-voice');
    btn.classList.add('bg-primary', 'text-black');
    setTimeout(() => btn.classList.remove('bg-primary', 'text-black'), 2000);
  });

  // Mic button
  document.getElementById('btn-mic').addEventListener('click', () => {
    const micBtn = document.getElementById('btn-mic');
    const statusText = document.getElementById('system-status');
    const liveDot = document.getElementById('live-dot');
    
    if (Voice.isListening()) {
      Voice.stopListening();
      micBtn.classList.remove('bg-primary', 'text-black');
      if (statusText) statusText.textContent = 'System Active';
      if (liveDot) liveDot.classList.remove('bg-red-500');
      FaceCanvas.setExpression({ eyebrows: 'none' });
    } else {
      const started = Voice.startListening((transcript) => {
        micBtn.classList.remove('bg-primary', 'text-black');
        if (statusText) statusText.textContent = 'System Active';
        if (liveDot) liveDot.classList.remove('bg-red-500');
        FaceCanvas.setExpression({ eyebrows: 'none' });
        ChatPanel.show();
        // Pre-fill input
        const input = document.getElementById('chat-input');
        if (input) { input.value = transcript; input.focus(); }
      });
      if (started) {
        micBtn.classList.add('bg-primary', 'text-black');
        if (statusText) statusText.textContent = 'Listening...';
        if (liveDot) liveDot.classList.add('bg-red-500');
        FaceCanvas.setExpression({ eyebrows: 'raised', mouth: 'o' });
      }
    }
  });

  // Greeting area double-click → fortune
  const greetingEl = document.getElementById('greeting');
  if (greetingEl) {
    greetingEl.addEventListener('dblclick', () => {
      EasterEggs.triggerFortune();
    });
  }

  // Start clock
  tick().catch(e => console.error('tick error:', e));
  setInterval(() => tick().catch(e => console.error('tick error:', e)), 1000);

  // Initial greeting flash
  flashGreeting();

  applyGlow();
}

// ── Clock tick ─────────────────────────────────────────────────────────────────
async function tick() {
  const now    = new Date();
  const h      = now.getHours();
  const m      = now.getMinutes();
  const timeStr = formatTime(now);

  document.getElementById('clock-display').textContent = timeStr;
  // Diagnostic (one-time log per minute):
  if (m !== currentMin) console.log('[tick]', timeStr);

  // Hour change
  if (h !== currentHour) {
    currentHour = h;
    let mood = 'happy';
    try {
      const r = await window.rClock.getMoodNow();
      mood = (r && r.name) ? r.name : 'happy';
    } catch (e) {
      console.warn('getMoodNow failed:', e);
    }
    currentMood = mood;

    if (cfg.mood_auto !== false) {
      FaceCanvas.setMood(mood);
      applyDefaultParticlesForMood(mood, ThemeEngine.current());
    }

    flashGreeting(h);

    // Fetch mood-based expression from AI (async, non-blocking)
    window.rClock.getExpression({ mood, context: `It is ${timeStr}`, cfg }).then(expr => {
      FaceCanvas.setExpression(expr);
      if (cfg.particles !== false && expr.particles && expr.particles !== 'none') {
        ParticleEngine.setType(expr.particles, {
          count: Math.round(30 * (expr.intensity || 0.5)),
          baseColor: ThemeEngine.getAccent(),
        });
      }
    });
  }

  // Minute change
  if (m !== currentMin) {
    currentMin = m;
    fetchPoem(timeStr, m);
  }
}

// ── Poem / Tip fetch ───────────────────────────────────────────────────────────
async function fetchPoem(timeStr, minute) {
  const poemEl = document.getElementById('poem-text');
  poemEl.classList.add('loading');
  poemEl.textContent = '…';

  try {
    let text, mood;
    if (minute === 0 && cfg.hourly_tips !== false) {
      const r = await window.rClock.getTip({ cfg });
      text = r.tip; mood = r.mood;
    } else {
      const r = await window.rClock.getPoem({ timeStr, cfg });
      text = r.poem; mood = r.mood;
    }

    // Animate poem in
    poemEl.classList.remove('loading');
    poemEl.style.opacity = '0';
    poemEl.textContent   = text;
    console.log('[poem] rendered:', text.substring(0, 60));
    poemEl.style.transition = 'opacity 0.5s ease';
    requestAnimationFrame(() => { poemEl.style.opacity = '1'; });

    // Auto-read if enabled
    Voice.autoReadPoem(text, ThemeEngine.current());

    // Celebration sparkle on the hour
    if (minute === 0) {
      ParticleEngine.setType('confetti', { count: 60, baseColor: null });
      setTimeout(() => applyDefaultParticlesForMood(currentMood, ThemeEngine.current()), 5000);
      FaceCanvas.triggerReaction('star');
    }
  } catch (e) {
    poemEl.classList.remove('loading');
    poemEl.textContent = `The clock reads ${timeStr},\nand silence fills the air.`;
  }
}

// ── Easter egg chat commands ────────────────────────────────────────────────────
// Patch ChatPanel._sendMessage to check easter egg commands first
const _origSend = ChatPanel._sendMessage?.bind(ChatPanel);
if (ChatPanel._sendMessage) {
  ChatPanel._sendMessage = function() {
    const input = this.input;
    if (!input) return _origSend?.call(this);
    const text = input.value.trim();
    if (text && window.EasterEggs && EasterEggs.handleChatCommand(text)) {
      input.value = '';
      return;
    }
    _origSend?.call(this);
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────
/** Kick off a simple 1-second clock update that never relies on async IPC.
 *  This ensures the clock is always ticking even if init() hits an error. */
function _startFallbackClock() {
  const update = () => {
    const el = document.getElementById('clock-display');
    if (el) el.textContent = formatTime(new Date());
  };
  update(); // run immediately
  setInterval(update, 1000);
}

function formatTime(date) {
  let h = date.getHours();
  const m  = date.getMinutes();
  const am = h < 12 ? 'AM' : 'PM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${am}`;
}

function flashGreeting(h = new Date().getHours()) {
  const periods = {
    morning:   { range: [5,  11], icon: '☀️', emoji: '🌅' },
    afternoon: { range: [12, 16], icon: '⚡', emoji: '☀️' },
    evening:   { range: [17, 20], icon: '🌙', emoji: '🌆' },
    night:     { range: [21, 23], icon: '✨', emoji: '🌙' },
  };
  for (const [period, { range, icon }] of Object.entries(periods)) {
    if (h >= range[0] && h <= range[1]) {
      const uname   = (cfg.user_name || 'Pankaj').trim();
      const grEl    = document.getElementById('greeting');
      if (grEl) {
        grEl.innerHTML = `Good ${period}, <span class="text-primary" id="user-name">${uname}!</span> <span class="inline-block animate-spin-slow ml-1">${icon}</span>`;
      }
      break;
    }
  }
}

function applyThemeAccent() {
  const accent = cfg.poem_color || ThemeEngine.getAccent();
  document.documentElement.style.setProperty('--accent', accent);
  FaceCanvas?.setColor(accent);
}

function applyGlow() {
  const app = document.getElementById('app');
  if (!app) return;
  const accent = cfg.poem_color || ThemeEngine.getAccent();
  if (cfg.glow_enabled !== false) {
    // Apply glow to the main container or specific elements if needed
    // app.style.filter = `drop-shadow(0 0 14px ${accent}55)`;
  } else {
    // app.style.filter = '';
  }
}

function applyDefaultParticlesForMood(mood, theme) {
  if (cfg.particles === false) return;
  const map = {
    happy:   theme === 'cyberpunk' ? 'digital' : 'sparkles',
    sleepy:  'snow',
    focused: 'rain',
    relaxed: 'fireflies',
    chill:   theme === 'organic' ? 'leaves' : 'fireflies',
  };
  const accent = cfg.poem_color || ThemeEngine.getAccent();
  ParticleEngine.setType(map[mood] || 'sparkles', { baseColor: accent });
}

// ── Start ──────────────────────────────────────────────────────────────────────
// Scripts sit at bottom of <body> — DOM is already parsed, call init directly.
// DOMContentLoaded listener is a backup in case Electron fires scripts early.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
