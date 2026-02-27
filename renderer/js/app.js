/**
 * app.js — Main renderer entry point
 * Orchestrates: settings, theme, face, particles, clock, poems, tray IPC
 */
'use strict';

let cfg          = {};
let currentMin   = -1;
let currentHour  = -1;
let currentMood  = 'happy';

// ── Quote store ────────────────────────────────────────────────────────────────
const _storedQuotes = [];

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
  window.rClock.on('refresh-poem',  () => {
    const now = new Date();
    fetchQuote(formatTime(now), now.getMinutes(), true);
  });
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

  // Quote drawer toggle
  document.getElementById('drawer-toggle')?.addEventListener('click', () => _toggleQuoteDrawer());
  document.getElementById('drawer-close')?.addEventListener('click',  () => _toggleQuoteDrawer(false));
  // Close drawer on outside click
  document.addEventListener('click', (e) => {
    const drawer  = document.getElementById('quote-drawer');
    const toggle  = document.getElementById('drawer-toggle');
    if (!drawer || !toggle) return;
    if (!drawer.classList.contains('-translate-x-full')) {
      if (!drawer.contains(e.target) && !toggle.contains(e.target)) {
        _toggleQuoteDrawer(false);
      }
    }
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

  // ── Startup greeting speech bubble ────────────────────────────────────────
  // Aria says hello 1.8 seconds after launch — feels alive from the start
  setTimeout(() => _showStartupGreeting(), 1800);

  // Fetch an initial motivation quote shortly after launch (force = true)
  setTimeout(() => {
    const now = new Date();
    fetchQuote(formatTime(now), now.getMinutes(), true);
  }, 4000);
}

function _showStartupGreeting() {
  const h     = new Date().getHours();
  const uname = (cfg.user_name || '').trim();
  const greetings = {
    morning:   ['Rise and shine! Ready to make today amazing? ☀️', 'Good morning! Let\'s crush it today! 🚀', 'Morning! I\'ve been waiting for you ✨'],
    afternoon: ['Good afternoon! Still going strong? 💪', 'Hey there! Time to stay focused 🎯', 'Afternoon check-in: you\'re doing great! ⚡'],
    evening:   ['Evening! Winding down or pushing through? 🌙', 'Good evening! Great work today 🌟', 'Hey! Hope your day was productive 😊'],
    night:     ['Late night hustle! I\'m here with you 🦉', 'Burning the midnight oil? You\'ve got this ✨', 'Still here, still cheering you on! 🌙'],
  };
  const period =
    h >= 5  && h < 12 ? 'morning'   :
    h >= 12 && h < 17 ? 'afternoon' :
    h >= 17 && h < 21 ? 'evening'   : 'night';

  const pool   = greetings[period];
  let msg      = pool[Math.floor(Math.random() * pool.length)];
  if (uname) msg = msg.replace(/^(Hey|Good \w+|Rise|Morning|Afternoon|Evening|Still|Late|Burning)/, `$1, ${uname}`);

  const bubble = document.getElementById('speech-bubble');
  const textEl = document.getElementById('speech-text');
  if (!bubble || !textEl) return;

  textEl.textContent = msg;
  bubble.classList.remove('opacity-0');
  bubble.classList.add('opacity-100');

  // Warm expression for greeting
  if (window.FaceCanvas) {
    FaceCanvas.setSoftExpression({ mouth: 'grin', blush: true });
  }

  // Auto-hide after 5 seconds, then revert face
  setTimeout(() => {
    bubble.classList.remove('opacity-100');
    bubble.classList.add('opacity-0');
    if (window.FaceCanvas) FaceCanvas.setMood(currentMood);
  }, 5000);
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

    // Update mood label in middle panel
    const moodEl = document.getElementById('mood-label');
    if (moodEl) moodEl.textContent = mood;

    flashGreeting(h);

    // Fetch mood-based expression from AI (async, non-blocking)
    // Use setSoftExpression — only mouth/blush, NO eyebrows from hourly calls
    // (eyebrows are reserved for reactions and conversation sentiment)
    window.rClock.getExpression({ mood, context: `It is ${timeStr}`, cfg }).then(expr => {
      FaceCanvas.setSoftExpression(expr);
      if (cfg.particles !== false && expr.particles && expr.particles !== 'none') {
        ParticleEngine.setType(expr.particles, {
          count: Math.round(30 * (expr.intensity || 0.5)),
          baseColor: ThemeEngine.getAccent(),
        });
      }
    });
  }

  // Minute change — fetch quotes only at :00 and :30
  if (m !== currentMin) {
    currentMin = m;
    if (m === 0 || m === 30) {
      fetchQuote(timeStr, m);
    }
  }
}

// ── Quote / Tip fetch (every 30 min or forced) ─────────────────────────────────
async function fetchQuote(timeStr, minute, force = false) {
  try {
    let text, mood;
    if (minute === 0 && cfg.hourly_tips !== false) {
      const r = await window.rClock.getTip({ cfg });
      text = r.tip; mood = r.mood;
    } else {
      const r = await window.rClock.getPoem({ timeStr, cfg });
      text = r.poem; mood = r.mood;
    }

    // Update the dim preview in the middle panel
    const poemEl = document.getElementById('poem-text');
    if (poemEl) {
      poemEl.style.opacity = '0';
      poemEl.textContent   = text;
      poemEl.style.transition = 'opacity 0.5s ease';
      requestAnimationFrame(() => { poemEl.style.opacity = '0.6'; });
    }

    // Store and show popup
    _storeQuote(text);
    _showQuotePopup(text);

    console.log('[quote]', text.substring(0, 60));

    // Auto-read if enabled
    Voice.autoReadPoem(text, ThemeEngine.current());

    // Celebration sparkle on the hour
    if (minute === 0) {
      ParticleEngine.setType('confetti', { count: 60, baseColor: null });
      setTimeout(() => applyDefaultParticlesForMood(currentMood, ThemeEngine.current()), 5000);
      FaceCanvas.triggerReaction('star');
    }
  } catch (e) {
    console.warn('[quote] fetch failed:', e);
  }
}

// ── Quote popup (shows for ~2 seconds then fades) ─────────────────────────────
function _showQuotePopup(text) {
  const popup  = document.getElementById('quote-popup');
  const textEl = document.getElementById('quote-popup-text');
  if (!popup || !textEl) return;

  textEl.textContent = text;
  // Show: opacity-100 + scale-100
  popup.style.opacity   = '1';
  popup.style.transform = 'scale(1)';

  clearTimeout(window._quotePopupTimer);
  window._quotePopupTimer = setTimeout(() => {
    popup.style.opacity   = '0';
    popup.style.transform = 'scale(0.95)';
  }, 2000);
}

// ── Quote store & drawer ───────────────────────────────────────────────────────
function _storeQuote(text) {
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  _storedQuotes.unshift({ text, time });
  if (_storedQuotes.length > 10) _storedQuotes.pop();
  // Refresh drawer if it's open
  const drawer = document.getElementById('quote-drawer');
  if (drawer && !drawer.classList.contains('-translate-x-full')) {
    _renderQuoteDrawer();
  }
}

function _renderQuoteDrawer() {
  const list = document.getElementById('quote-drawer-list');
  if (!list) return;

  if (_storedQuotes.length === 0) {
    list.innerHTML = '<p class="text-[10px] text-slate-500 text-center mt-4 italic">No quotes yet…<br/>Check back in 30 min!</p>';
    return;
  }

  list.innerHTML = _storedQuotes.map(q => `
    <div class="p-2 rounded-lg bg-slate-800/50 border border-slate-700/30 hover:border-primary/20 transition-colors">
      <p class="text-[9px] text-slate-300 italic leading-snug">"${q.text}"</p>
      <p class="text-[8px] text-primary/50 mt-1 text-right">${q.time}</p>
    </div>
  `).join('');
}

function _toggleQuoteDrawer(open) {
  const drawer = document.getElementById('quote-drawer');
  if (!drawer) return;
  const isOpen = !drawer.classList.contains('-translate-x-full');
  const shouldOpen = open !== undefined ? open : !isOpen;

  if (shouldOpen) {
    drawer.classList.remove('-translate-x-full');
    _renderQuoteDrawer();
  } else {
    drawer.classList.add('-translate-x-full');
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
