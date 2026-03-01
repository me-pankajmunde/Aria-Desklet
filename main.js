/**
 * Rhyming Clock — Electron Main Process
 * Handles: window management, system tray, IPC bridging to AI service, settings store
 */

'use strict';

const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, shell } = require('electron');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');

// ── Load env from .env if present ──────────────────────────────────────────────
const envPath = path.join(os.homedir(), '.config', 'rhyming-clock', '.env');
if (fs.existsSync(envPath)) {
  require('fs').readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
  });
}
// Also try local .env
const localEnv = path.join(__dirname, '.env');
if (fs.existsSync(localEnv)) {
  fs.readFileSync(localEnv, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
  });
}

// ── Settings store ─────────────────────────────────────────────────────────────
const CONFIG_PATH = path.join(os.homedir(), '.config', 'rhyming-clock', 'settings.json');

const DEFAULTS = {
  poem_color:      '#00ff88',
  clock_color:     '#00ff88',
  bg_color:        '#0a0a1a',
  bg_alpha:        0.92,
  font_family:     'JetBrains Mono',
  font_size:       16,
  position:        'bottom-right',
  custom_x:        40,
  custom_y:        60,
  assistant_name:  'Aria',
  user_name:       '',
  show_face:       true,
  mood_auto:       true,
  hourly_tips:     true,
  glow_enabled:    true,
  theme:           'glassmorphism',
  particles:       true,
  voice_enabled:   false,
  auto_read_poems: false,
  easter_eggs:     true,
  at_sessions:     [],   // ActivityTracker persisted sessions (last 7 days)
  at_achievements: [],   // earned achievement ids
};

function loadSettings() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      return { ...DEFAULTS, ...data };
    }
  } catch (e) { /* fallback */ }
  return { ...DEFAULTS };
}

function saveSettings(cfg) {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
}

// ── AI Service ─────────────────────────────────────────────────────────────────
const AI_ENDPOINT = process.env.LLM_ENDPOINT || 'http://0.0.0.0:9000/v1';
const AI_MODEL    = process.env.LLM_MODEL    || 'gpt-4o';
const AI_TOKEN    = process.env.OPENAI_API_KEY || 'sk-dummy';

const MOOD_SCHEDULE = [
  [0,  6,  'sleepy',  'Dreamy and slow, like the quiet of night.'],
  [7,  11, 'happy',   'Bright, upbeat, energetic morning vibes.'],
  [12, 16, 'focused', 'Precise, elegant, sharp afternoon focus.'],
  [17, 20, 'relaxed', 'Warm and easy, winding-down evening.'],
  [21, 23, 'chill',   'Soft and cozy, late-night tranquility.'],
];

function getMood(hour) {
  for (const [start, end, name, hint] of MOOD_SCHEDULE) {
    if (hour >= start && hour <= end) return { name, hint };
  }
  return { name: 'chill', hint: 'Soft and cozy.' };
}

async function aiCall(messages, maxTokens = 160) {
  const resp = await fetch(`${AI_ENDPOINT}/chat/completions`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${AI_TOKEN}`,
    },
    body: JSON.stringify({ model: AI_MODEL, max_tokens: maxTokens, messages }),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  return data.choices[0].message.content.trim();
}

// ── IPC Handlers ───────────────────────────────────────────────────────────────
ipcMain.handle('get-settings', () => loadSettings());

ipcMain.handle('save-settings', (_e, cfg) => {
  saveSettings(cfg);
  updateTray(cfg);
  return true;
});

ipcMain.handle('get-poem', async (_e, { timeStr, cfg }) => {
  const hour   = new Date().getHours();
  const mood   = getMood(hour);
  const name   = cfg.assistant_name || 'Aria';
  const uname  = (cfg.user_name || '').trim();
  const period = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';
  const addr   = uname ? ` Address the user warmly as ${uname}.` : '';
  try {
    const poem = await aiCall([
      { role: 'system', content:
          `You are ${name}, a warm and inspiring AI desktop companion. `
        + `Current mood: ${mood.name}. Style: ${mood.hint} `
        + `It is ${period}.${addr}`
      },
      { role: 'user', content:
          `Write a very short (1-2 lines) original motivational quote or uplifting affirmation `
        + `that fits this ${period} vibe. Be genuine, energizing, and memorable. `
        + `Reply with ONLY the quote — no title, no attribution, no quotation marks, no extra text.`
      },
    ], 80);
    return { poem, mood: mood.name };
  } catch (e) {
    const fallbacks = [
      'Every moment is a fresh beginning. ✨',
      "You're doing better than you think. 💪",
      'Small steps, big dreams. Keep going! 🚀',
      'Your focus is your superpower. 🎯',
      'Progress, not perfection. You\'ve got this!',
    ];
    return { poem: fallbacks[Math.floor(Math.random() * fallbacks.length)], mood: mood.name };
  }
});

ipcMain.handle('get-tip', async (_e, { cfg }) => {
  const hour  = new Date().getHours();
  const mood  = getMood(hour);
  const name  = cfg.assistant_name || 'Aria';
  const uname = (cfg.user_name || '').trim();
  const addr  = uname ? ` for ${uname}` : '';
  try {
    const tip = await aiCall([
      { role: 'system', content: `You are ${name}, a witty desktop companion. Mood: ${mood.name}. Style: ${mood.hint}` },
      { role: 'user', content: `Give one short (1-2 lines) fun fact or motivational nudge${addr} that fits the current vibe. No title, just the tip.` },
    ], 80);
    return { tip, mood: mood.name };
  } catch (e) {
    return { tip: 'Every hour is a fresh start. ✨', mood: mood.name };
  }
});

ipcMain.handle('get-chat', async (_e, { message, cfg }) => {
  const hour  = new Date().getHours();
  const mood  = getMood(hour);
  const name  = cfg.assistant_name || 'Aria';
  const uname = (cfg.user_name || '').trim();
  const addr  = uname ? ` The user's name is ${uname}.` : '';
  try {
    const reply = await aiCall([
      { role: 'system', content:
          `You are ${name}, a helpful, charming desktop AI companion. `
        + `Mood: ${mood.name}. Style: ${mood.hint}${addr} `
        + `Keep your answers concise (1-3 sentences), warm and witty.`
      },
      { role: 'user', content: message },
    ], 160);
    return { reply, mood: mood.name };
  } catch (e) {
    return { reply: `Hmm, I couldn't reach my brain right now. (${e.message})`, mood: mood.name };
  }
});

ipcMain.handle('get-expression', async (_e, { mood, context, cfg }) => {
  const name = cfg.assistant_name || 'Aria';
  try {
    const raw = await aiCall([
      { role: 'system', content:
          `You are ${name}'s expression engine. Output ONLY valid JSON, no prose.`
      },
      { role: 'user', content:
          `Given mood="${mood}" and context="${context}", pick face expression parameters. `
        + `Return JSON: { "eyeShape": "normal|wide|squint|heart|star", `
        + `"eyebrows": "none|raised|furrowed|wavy", `
        + `"mouth": "smile|grin|neutral|smirk|o|tongue", `
        + `"blush": true|false, `
        + `"particles": "none|sparkles|fireflies|rain|snow|digital", `
        + `"intensity": 0.1-1.0 }`
      },
    ], 100);
    // Extract JSON from response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (e) { /* fallback */ }
  // Deterministic fallback per mood
  const fallbacks = {
    happy:   { eyeShape:'wide',  eyebrows:'raised',   mouth:'grin',    blush:true,  particles:'sparkles', intensity:0.8 },
    sleepy:  { eyeShape:'squint',eyebrows:'none',      mouth:'neutral', blush:false, particles:'snow',     intensity:0.3 },
    focused: { eyeShape:'normal',eyebrows:'furrowed',  mouth:'smirk',   blush:false, particles:'rain',     intensity:0.5 },
    relaxed: { eyeShape:'normal',eyebrows:'none',       mouth:'smile',   blush:false, particles:'fireflies',intensity:0.6 },
    chill:   { eyeShape:'normal',eyebrows:'none',       mouth:'smile',   blush:false, particles:'fireflies',intensity:0.4 },
  };
  return fallbacks[mood] || fallbacks.chill;
});

ipcMain.handle('get-mood-now', () => {
  const hour = new Date().getHours();
  return getMood(hour);
});

// ── analyze-sentiment ─────────────────────────────────────────────────────────
// Analyzes the emotional tone of a recent conversation exchange and returns
// a face expression override for Aria to display.
ipcMain.handle('analyze-sentiment', async (_e, { recentMessages, cfg }) => {
  const name = cfg.assistant_name || 'Aria';
  const convoSummary = (recentMessages || [])
    .map(m => `${m.role === 'u' ? 'User' : name}: ${m.text}`)
    .join('\n');
  try {
    const raw = await aiCall([
      { role: 'system', content:
          `You are ${name}'s emotion engine. Output ONLY valid JSON, no prose.`
      },
      { role: 'user', content:
          `Given this conversation:\n${convoSummary}\n\n`
        + `Return JSON: { "emotion": "happy|excited|focused|calm|empathetic|amused|concerned|curious|neutral", `
        + `"intensity": 0.1-1.0, "expressionOverride": { `
        + `"eyeShape": "normal|wide|squint|heart|star", `
        + `"eyebrows": "none|raised|furrowed|wavy", `
        + `"mouth": "smile|grin|neutral|smirk|o|tongue", `
        + `"blush": true|false } }`
      },
    ], 120);
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
  } catch (e) { /* fallback */ }
  return {
    emotion: 'neutral',
    intensity: 0.5,
    expressionOverride: { eyeShape: 'normal', eyebrows: 'none', mouth: 'smile', blush: false },
  };
});

// ── get-work-checkin ──────────────────────────────────────────────────────────
// Generates a brief motivational check-in based on the user's session goal.
ipcMain.handle('get-work-checkin', async (_e, { goal, elapsedMinutes, cfg }) => {
  const name  = cfg.assistant_name || 'Aria';
  const uname = (cfg.user_name || '').trim();
  try {
    const message = await aiCall([
      { role: 'system', content:
          `You are ${name}, a supportive work buddy. Max 12 words. Be warm and specific to the goal.`
      },
      { role: 'user', content:
          `${uname ? `User: ${uname}. ` : ''}Goal: "${goal}". `
        + `They've been working for ${elapsedMinutes} minutes. `
        + `Give a brief (max 12 words) encouraging check-in. Reply ONLY with the message.`
      },
    ], 60);
    return { message };
  } catch (e) {
    const fallbacks = [
      "Keep going! You're making great progress!",
      "Stay focused — the goal is in sight!",
      "You've got this! Keep pushing! 💪",
    ];
    return { message: fallbacks[Math.floor(Math.random() * fallbacks.length)] };
  }
});

// ── get-partner-profile ───────────────────────────────────────────────────────
// Analyzes the user's work patterns and generates an ideal work-partner description.
ipcMain.handle('get-partner-profile', async (_e, { workPatterns, cfg }) => {
  const name  = cfg.assistant_name || 'Aria';
  const uname = (cfg.user_name || '').trim();
  const { avgSessionMinutes, sessionsToday, peakHours, workStyle } = workPatterns || {};
  const patternSummary =
    `avg session: ${avgSessionMinutes || 0}m, sessions today: ${sessionsToday || 0}, `
    + `peak hours: ${(peakHours || []).join(', ') || 'unknown'}, style: ${workStyle || 'unknown'}`;
  try {
    const profile = await aiCall([
      { role: 'system', content:
          `You are ${name}, an insightful AI companion. Be warm, specific, and actionable. 3-4 sentences.`
      },
      { role: 'user', content:
          `${uname ? `User: ${uname}. ` : ''}Work patterns: ${patternSummary}. `
        + `Describe the ideal work partner for this person: personality, work style, and complementary skills. `
        + `Be encouraging and specific.`
      },
    ], 200);
    return { profile };
  } catch (e) {
    return {
      profile: 'Your ideal partner brings steady energy to match your focus style — '
             + 'reliable, communicative, and driven by the same goals. '
             + 'They respect deep work time but are available for quick syncs. '
             + 'Look for someone who brings complementary strengths and matches your dedication. 🤝',
    };
  }
});

// ── chat-stream-start ─────────────────────────────────────────────────────────
// Streams chat response tokens back to the renderer via multiple IPC events.
// Uses ipcMain.on (not handle) so we can send multiple replies.
ipcMain.on('chat-stream-start', async (event, { message, cfg }) => {
  const hour  = new Date().getHours();
  const mood  = getMood(hour);
  const name  = cfg.assistant_name || 'Aria';
  const uname = (cfg.user_name || '').trim();
  const addr  = uname ? ` The user's name is ${uname}.` : '';

  const send = (ch, data) => {
    if (!event.sender.isDestroyed()) event.sender.send(ch, data);
  };

  try {
    const resp = await fetch(`${AI_ENDPOINT}/chat/completions`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${AI_TOKEN}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 200,
        stream: true,
        messages: [
          { role: 'system', content:
              `You are ${name}, a helpful, charming desktop AI companion. `
            + `Mood: ${mood.name}. Style: ${mood.hint}${addr} `
            + `Keep your answers concise (1-3 sentences), warm and witty.`
          },
          { role: 'user', content: message },
        ],
      }),
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    // Acknowledge stream start
    send('chat-stream-start-ack', { mood: mood.name });

    // If no body (non-streaming response), treat entire JSON as single token
    if (!resp.body) {
      const data = await resp.json();
      const token = data.choices?.[0]?.message?.content?.trim() || '';
      send('chat-stream-token', { token });
      send('chat-stream-done', {});
      return;
    }

    // Read SSE stream
    const reader  = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep trailing incomplete line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') {
          send('chat-stream-done', {});
          return;
        }
        try {
          const parsed = JSON.parse(payload);
          const token  = parsed.choices?.[0]?.delta?.content;
          if (token) send('chat-stream-token', { token });
        } catch { /* ignore malformed SSE chunks */ }
      }
    }

    send('chat-stream-done', {});
  } catch (e) {
    send('chat-stream-error', { error: e.message });
  }
});

ipcMain.handle('quit-app', () => app.quit());

ipcMain.handle('open-devtools', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) win.webContents.openDevTools({ mode: 'detach' });
});

// ── Window ─────────────────────────────────────────────────────────────────────
let mainWindow = null;
let tray       = null;

function createWindow() {
  const cfg     = loadSettings();
  const display = screen.getPrimaryDisplay();
  const { width: sw, height: sh } = display.workAreaSize;

  const W = 780, H = 500;
  let x, y;
  switch (cfg.position) {
    case 'bottom-right': x = sw - W - 40; y = sh - H - 40; break;
    case 'bottom-left':  x = 40;          y = sh - H - 40; break;
    case 'top-right':    x = sw - W - 40; y = 40;          break;
    case 'top-left':     x = 40;          y = 40;          break;
    case 'custom':       x = cfg.custom_x; y = cfg.custom_y; break;
    default:             x = sw - W - 40; y = sh - H - 40;
  }

  mainWindow = new BrowserWindow({
    width:   W,
    height:  H,
    x, y,
    frame:              false,
    transparent:        true,
    resizable:          false,
    alwaysOnTop:        false,
    skipTaskbar:        true,
    hasShadow:          false,
    focusable:          true,
    webPreferences: {
      preload:             path.join(__dirname, 'preload.js'),
      contextIsolation:    true,
      nodeIntegration:     false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Capture renderer console output to a log file for debugging
  const logStream = require('fs').createWriteStream(
    path.join(os.homedir(), '.config', 'rhyming-clock', 'renderer.log'), { flags: 'a' }
  );
  mainWindow.webContents.on('console-message', (_e, level, msg, line, src) => {
    const tag = ['verbose', 'info', 'warn', 'error'][level] || 'log';
    const entry = `[${new Date().toISOString()}] [${tag}] ${msg} (${src}:${line})\n`;
    logStream.write(entry);
    if (level >= 2) process.stderr.write(entry); // warn/error → stderr
  });
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    process.stderr.write(`[RENDERER CRASH] ${JSON.stringify(details)}\n`);
  });
  mainWindow.webContents.on('preload-error', (_e, src, err) => {
    process.stderr.write(`[PRELOAD ERROR] ${src}: ${err}\n`);
  });

  // On Linux, lower the window below others
  if (process.platform === 'linux') {
    mainWindow.setAlwaysOnTop(false);
  }

  mainWindow.on('moved', () => {
    const [wx, wy] = mainWindow.getPosition();
    const current   = loadSettings();
    current.position = 'custom';
    current.custom_x = wx;
    current.custom_y = wy;
    saveSettings(current);
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// ── Tray ───────────────────────────────────────────────────────────────────────
function makeTrayIcon(color = '#00ff88') {
  // 22x22 colored dot
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22">
    <circle cx="11" cy="11" r="9" fill="${color}" opacity="0.9"/>
    <circle cx="11" cy="11" r="5" fill="${color}"/>
  </svg>`;
  return nativeImage.createFromDataURL(
    'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
  );
}

function updateTray(cfg) {
  if (!tray) return;
  tray.setImage(makeTrayIcon(cfg.poem_color || '#00ff88'));
  tray.setToolTip(`Rhyming Clock — ${cfg.assistant_name || 'Aria'}`);
}

function createTray() {
  const cfg = loadSettings();
  tray = new Tray(makeTrayIcon(cfg.poem_color));
  tray.setToolTip(`Rhyming Clock — ${cfg.assistant_name || 'Aria'}`);

  const buildMenu = () => {
    const c = loadSettings();
    const name = c.assistant_name || 'Aria';
    return Menu.buildFromTemplate([
      { label: `💬 Chat with ${name}`,  click: () => mainWindow?.webContents.send('open-chat') },
      { label: '🔄 Refresh poem',        click: () => mainWindow?.webContents.send('refresh-poem') },
      { label: '⚙  Settings',           click: () => mainWindow?.webContents.send('open-settings') },
      { label: '🎨 Next theme',          click: () => mainWindow?.webContents.send('cycle-theme') },
      { type: 'separator' },
      { label: '✕  Quit',               click: () => app.quit() },
    ]);
  };

  tray.setContextMenu(buildMenu());
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) mainWindow.hide();
      else { mainWindow.show(); mainWindow.focus(); }
    }
  });
  // Rebuild menu on open (for fresh name)
  tray.on('right-click', () => tray.setContextMenu(buildMenu()));
}

// ── App lifecycle ──────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // Don't quit — keep alive via tray (only macOS uses the default quit-on-close)
  if (process.platform !== 'linux') return;
  // keep running
});

app.on('before-quit', () => {
  if (tray) { tray.destroy(); tray = null; }
});
