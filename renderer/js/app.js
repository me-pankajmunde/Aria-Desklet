/**
 * app.js — Main renderer entry point
 * Orchestrates: settings, theme, face, particles, clock, poems, tray IPC
 */
'use strict';

let cfg          = {};
let currentMin   = -1;
let currentHour  = -1;
let currentMood  = 'happy';

// ── Quote store ────────────────────────────────────────────────────────────
const _storedQuotes = [];

// ── Init ──────────────────────────────────────────────────────────────────
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
    const label   = e.detail && e.detail.label ? e.detail.label : 'Achievement!';
    const toast   = document.getElementById('achievement-toast');
    const labelEl = document.getElementById('achievement-label');
    if (!toast || !labelEl) return;

    labelEl.textContent = label;
    toast.classList.add('visible');

    // Celebratory face + particles
    if (window.FaceCanvas) FaceCanvas.triggerReaction('star');
    if (window.ParticleEngine && cfg.particles !== false) {
      ParticleEngine.setType('confetti', { count: 50, baseColor: null });
      setTimeout(() => applyDefaultParticlesForMood(currentMood, ThemeEngine.current()), 4500);
    }

    // Auto-dismiss toast after 3.5 s
    clearTimeout(window._achieveToastTimer);
    window._achieveToastTimer = setTimeout(() => {
      toast.classList.remove('visible');
    }, 3500);
  });

  // ── Session milestone handler (25m / 50m / 90m) ──────────────────────────
  window.addEventListener('session-milestone', (e) => {
    const m     = e.detail && e.detail.minutes;
    const msgs  = {
      25: '25 min of focus! You\'re on a roll!',
      50: '50 minutes in — incredible focus!',
      90: '90 minutes deep! Absolute legend!',
    };
    const text  = msgs[m] || `${m} minutes of focus!`;
    const bubble = document.getElementById('speech-bubble');
    const textEl = document.getElementById('speech-text');
    if (bubble && textEl) {
      textEl.textContent = text;
      bubble.style.opacity = '1';
      clearTimeout(window._milestoneTimer);
      window._milestoneTimer = setTimeout(() => {
        bubble.style.opacity = '0';
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
  });

  // Theme change callbacks
  ThemeEngine.onChange((theme) => {
    const accent = ThemeEngine.getAccent(theme);
    FaceCanvas.setColor(accent);
    applyDefaultParticlesForMood(currentMood, theme);
  });

  // Speech zone pill click → open chat
  document.getElementById('speech-zone-pill')?.addEventListener('click', () => ChatPanel.toggle());

  // Quote drawer toggle (kept for backward compat)
  document.getElementById('drawer-toggle')?.addEventListener('click', () => _toggleQuoteDrawer());
  document.getElementById('drawer-close')?.addEventListener('click',  () => _toggleQuoteDrawer(false));

  // Settings button
  document.getElementById('btn-settings').addEventListener('click', () => SettingsPanel.show());

  // Voice button (read poem)
  document.getElementById('btn-voice').addEventListener('click', () => {
    const poem = document.getElementById('poem-text').textContent;
    const theme = ThemeEngine.current();
    Voice.speak(poem, theme);
    const btn = document.getElementById('btn-voice');
    btn.classList.add('active');
    setTimeout(() => btn.classList.remove('active'), 2000);
  });

  // Mic button
  document.getElementById('btn-mic').addEventListener('click', () => {
    const micBtn = document.getElementById('btn-mic');

    if (Voice.isListening()) {
      Voice.stopListening();
      micBtn.classList.remove('active');
      FaceCanvas.setExpression({ eyebrows: 'none' });
    } else {
      const started = Voice.startListening((transcript) => {
        micBtn.classList.remove('active');
        FaceCanvas.setExpression({ eyebrows: 'none' });
        ChatPanel.show();
        const input = document.getElementById('chat-input');
        if (input) { input.value = transcript; input.focus(); }
      });
      if (started) {
        micBtn.classList.add('active');
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

  // ── Startup greeting speech bubble ────────────────────────────────────────
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
    morning:   ['Rise and shine! Ready to make today amazing?', 'Good morning! Let\'s crush it today!', 'Morning! I\'ve been waiting for you'],
    afternoon: ['Good afternoon! Still going strong?', 'Hey there! Time to stay focused', 'Afternoon check-in: you\'re doing great!'],
    evening:   ['Evening! Winding down or pushing through?', 'Good evening! Great work today', 'Hey! Hope your day was productive'],
    night:     ['Late night hustle! I\'m here with you', 'Burning the midnight oil? You\'ve got this', 'Still here, still cheering you on!'],
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

  textEl.innerHTML = `<span class="label">Aria:</span> ${msg}`;
  bubble.style.opacity = '1';

  // Warm expression for greeting
  if (window.FaceCanvas) {
    FaceCanvas.setSoftExpression({ mouth: 'grin', blush: true });
  }

  // Auto-hide after 5 seconds, then revert face
  setTimeout(() => {
    bubble.style.opacity = '0';
    if (window.FaceCanvas) FaceCanvas.setMood(currentMood);
  }, 5000);
}

// ── Clock tick ─────────────────────────────────────────────────────────────
async function tick() {
  const now    = new Date();
  const h      = now.getHours();
  const m      = now.getMinutes();

  // Update big clock (split time and period)
  _updateClockDisplay(now);

  // Diagnostic (one-time log per minute):
  if (m !== currentMin) console.log('[tick]', formatTime(now));

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

    // Update mood label
    const moodEl = document.getElementById('mood-label');
    if (moodEl) moodEl.textContent = mood.toUpperCase();

    flashGreeting(h);

    // Fetch mood-based expression from AI
    window.rClock.getExpression({ mood, context: `It is ${formatTime(now)}`, cfg }).then(expr => {
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
      fetchQuote(formatTime(now), m);
    }
  }
}

// ── Quote / Tip fetch (every 30 min or forced) ─────────────────────────────
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

    // Update the poem preview
    const poemEl = document.getElementById('poem-text');
    if (poemEl) {
      poemEl.style.opacity = '0';
      poemEl.textContent   = text;
      poemEl.style.transition = 'opacity 0.5s ease';
      requestAnimationFrame(() => { poemEl.style.opacity = '0.6'; });
    }

    // Store and show in quotes card + popup
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

// ── Quote popup (shows for ~2 seconds then fades) ─────────────────────────
function _showQuotePopup(text) {
  const popup  = document.getElementById('quote-popup');
  const textEl = document.getElementById('quote-popup-text');
  if (!popup || !textEl) return;

  textEl.textContent = text;
  popup.style.opacity   = '1';
  popup.style.transform = 'scale(1)';

  clearTimeout(window._quotePopupTimer);
  window._quotePopupTimer = setTimeout(() => {
    popup.style.opacity   = '0';
    popup.style.transform = 'scale(0.95)';
  }, 2000);
}

// ── Quote store & inline quotes card ──────────────────────────────────────
function _storeQuote(text) {
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  _storedQuotes.unshift({ text, time });
  if (_storedQuotes.length > 10) _storedQuotes.pop();
  _renderQuotesCard();
}

function _renderQuotesCard() {
  const list = document.getElementById('quote-drawer-list');
  if (!list) return;

  // Update time header
  const timeHeader = document.getElementById('quotes-time-header');
  if (timeHeader) {
    timeHeader.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  if (_storedQuotes.length === 0) {
    list.innerHTML = '<p class="quote-empty">No quotes yet&hellip;<br/>Check back in 30 min!</p>';
    return;
  }

  list.innerHTML = _storedQuotes.slice(0, 5).map(q => `
    <div class="quote-entry">
      <div class="quote-text">"${q.text}"</div>
      <div class="quote-time">${q.time}</div>
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
    // Render the alt drawer list too
    const altList = document.getElementById('quote-drawer-list-alt');
    if (altList && _storedQuotes.length > 0) {
      altList.innerHTML = _storedQuotes.map(q => `
        <div class="p-2 rounded-lg bg-slate-800/50 border border-slate-700/30 hover:border-primary/20 transition-colors">
          <p class="text-[9px] text-slate-300 italic leading-snug">"${q.text}"</p>
          <p class="text-[8px] text-primary/50 mt-1 text-right">${q.time}</p>
        </div>
      `).join('');
    }
  } else {
    drawer.classList.add('-translate-x-full');
  }
}

// ── Easter egg chat commands ────────────────────────────────────────────────
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

// ── Helpers ────────────────────────────────────────────────────────────────
function _startFallbackClock() {
  const update = () => _updateClockDisplay(new Date());
  update();
  setInterval(update, 1000);
}

function _updateClockDisplay(date) {
  let h = date.getHours();
  const m  = date.getMinutes();
  const am = h < 12 ? 'AM' : 'PM';
  h = h % 12 || 12;

  const timeEl   = document.getElementById('clock-time');
  const periodEl = document.getElementById('clock-period');

  if (timeEl) timeEl.textContent = `${h}:${String(m).padStart(2, '0')}`;
  if (periodEl) periodEl.textContent = am;

  // Also update legacy clock-display if it exists
  const legacyClock = document.getElementById('clock-display');
  if (legacyClock) legacyClock.textContent = formatTime(date);
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
    morning:   { range: [5,  11], icon: '' },
    afternoon: { range: [12, 16], icon: '' },
    evening:   { range: [17, 20], icon: '' },
    night:     { range: [21, 23], icon: '' },
  };
  for (const [period, { range }] of Object.entries(periods)) {
    if (h >= range[0] && h <= range[1]) {
      const uname = (cfg.user_name || cfg.assistant_name || 'Aria').trim();
      const grEl  = document.getElementById('greeting');
      if (grEl) grEl.textContent = uname;
      break;
    }
  }
}

function applyThemeAccent() {
  const accent = cfg.poem_color || ThemeEngine.getAccent();
  document.documentElement.style.setProperty('--accent', accent);
  FaceCanvas?.setColor(accent);
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

// ── Start ──────────────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
