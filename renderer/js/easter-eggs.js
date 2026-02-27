/**
 * Easter Eggs & Mini Games
 * - Tic-tac-toe with AI
 * - Mood roulette ("spin")
 * - Fortune cookie ("fortune")
 * - Face dress-up (Ctrl+click x3)
 * - Dance mode ("dance")
 */
'use strict';

let _eggCfg       = {};
let _overlay   = null;
let _ctrlClicks = 0;
let _ctrlTimer  = null;

const EasterEggs = {
  init(cfg) {
    _eggCfg     = cfg;
    _overlay = document.getElementById('game-overlay');
    this._bindDressUp();
  },

  updateCfg(cfg) { _eggCfg = cfg; },

  // ── Keyboard shortcut easter egg: "dance" / "fortune" / "spin" ───────────
  handleChatCommand(text) {
    const lower = text.toLowerCase().trim();
    if (lower === 'dance')   { this.triggerDance();   return true; }
    if (lower === 'fortune') { this.triggerFortune();  return true; }
    if (lower === 'spin')    { this.triggerMoodRoulette(); return true; }
    if (lower === 'tictactoe' || lower === 'tic tac toe') { this.startTicTacToe(); return true; }
    return false;
  },

  // ── Dance Mode ──────────────────────────────────────────────────────────
  triggerDance() {
    const card = document.getElementById('app');
    let   beat = 0;
    const bpm  = 120;
    const ms   = (60 / bpm) * 1000;

    FaceCanvas?.triggerReaction('star');
    ParticleEngine?.setType('confetti');

    const interval = setInterval(() => {
      const funcs = [
        () => card.style.transform = 'translateY(-4px) rotate(-2deg)',
        () => card.style.transform = 'translateY(-6px) rotate(0deg) scale(1.02)',
        () => card.style.transform = 'translateY(-4px) rotate(2deg)',
        () => card.style.transform = 'translateY(0px) rotate(0deg)',
      ];
      funcs[beat % 4]();
      beat++;
    }, ms);

    setTimeout(() => {
      clearInterval(interval);
      card.style.transform = '';
      ParticleEngine?.setType(this._defaultParticleForMood());
    }, 10000);
  },

  // ── Fortune Cookie ──────────────────────────────────────────────────────
  async triggerFortune() {
    const name = _eggCfg.assistant_name || 'Aria';
    FaceCanvas?.setExpression({ eyeShape: 'squint', mouth: 'neutral', eyebrows: 'furrowed' });

    // Show overlay
    this._showOverlay(`<div style="text-align:center; padding:20px;">
      <div style="font-size:28px; margin-bottom:12px;">🥠</div>
      <div style="font-size:13px; color:var(--text-dim); font-family:var(--font-body);">Consulting the universe…</div>
    </div>`);

    try {
      const { reply } = await window.rClock.getChat({
        message: 'Give me one cryptic, poetic fortune-cookie message. Max 15 words. Be mysterious.',
        cfg: _eggCfg,
      });
      this._showOverlay(`<div style="text-align:center; padding:20px;">
        <div style="font-size:28px; margin-bottom:12px;">🥠</div>
        <p style="font-size:14px; color:var(--text); font-family:var(--font-display); font-style:italic; line-height:1.6;">"${reply}"</p>
        <button onclick="EasterEggs.closeOverlay()" style="margin-top:14px; background:var(--accent); border:none; padding:6px 16px; border-radius:8px; cursor:pointer; font-size:12px;">✨ Nice</button>
      </div>`);
      FaceCanvas?.triggerReaction('wink');
    } catch {
      this.closeOverlay();
    }
  },

  // ── Mood Roulette ───────────────────────────────────────────────────────
  triggerMoodRoulette() {
    const moods = ['happy', 'sleepy', 'focused', 'relaxed', 'chill'];
    const emojis = { happy:'😄', sleepy:'😴', focused:'🎯', relaxed:'🌙', chill:'❄' };
    let   count  = 0;
    const total  = 20;

    const spin = setInterval(() => {
      const m = moods[count % moods.length];
      this._showOverlay(`<div style="text-align:center; padding:20px;">
        <div style="font-size:40px;">${emojis[m]}</div>
        <div style="font-size:16px; color:var(--accent); margin-top:8px; font-family:var(--font-display);">${m.toUpperCase()}</div>
      </div>`);
      FaceCanvas?.setMood(m);
      count++;
      if (count >= total) {
        clearInterval(spin);
        const winner = moods[Math.floor(Math.random() * moods.length)];
        FaceCanvas?.setMood(winner);
        setTimeout(() => this.closeOverlay(), 1500);
      }
    }, count < 15 ? 80 : 200);
  },

  // ── Tic-Tac-Toe ─────────────────────────────────────────────────────────
  startTicTacToe() {
    const board = Array(9).fill(null); // null | 'X' | 'O'
    const name  = _eggCfg.assistant_name || 'Aria';
    const render = (msg = '') => {
      const cells = board.map((v, i) => {
        const sym    = v || '';
        const color  = v === 'X' ? 'var(--accent)' : v === 'O' ? '#ff6b6b' : 'var(--text-dim)';
        const cursor = (!v && !msg) ? 'pointer' : 'default';
        return `<div onclick="EasterEggs._tttMove(${i})" style="
          width:52px; height:52px; display:flex; align-items:center; justify-content:center;
          font-size:22px; font-weight:bold; color:${color}; cursor:${cursor};
          border:1px solid var(--border); border-radius:6px; transition:background 0.2s;
        " onmouseover="if(!${!!v})this.style.background='rgba(255,255,255,0.05)'"
           onmouseout="this.style.background=''">${sym}</div>`;
      }).join('');
      this._showOverlay(`
        <div style="text-align:center; padding:14px;">
          <div style="font-size:12px; color:var(--text-dim); font-family:var(--font-body); margin-bottom:10px;">
            ✖ You  vs  ${name} ○
          </div>
          <div style="display:grid; grid-template-columns:repeat(3,52px); gap:5px; margin:0 auto; width:fit-content;">
            ${cells}
          </div>
          ${msg ? `<div style="margin-top:12px; font-size:13px; color:var(--accent); font-family:var(--font-body);">${msg}</div>` : ''}
          ${msg ? `<button onclick="EasterEggs.closeOverlay()" style="margin-top:10px; background:var(--accent); border:none; padding:6px 14px; border-radius:8px; cursor:pointer; font-size:12px;">Close</button>` : ''}
        </div>`);
    };
    this._tttBoard  = board;
    this._tttRender = render;
    render();
  },

  _tttBoard:  null,
  _tttRender: null,

  _tttMove(idx) {
    const b = this._tttBoard;
    if (!b || b[idx] || this._tttCheck(b)) return;
    b[idx] = 'X';
    const win = this._tttCheck(b);
    if (win) { this._tttRender(win === 'X' ? '🎉 You win!' : `${_eggCfg.assistant_name || 'Aria'} wins! 🤖`); FaceCanvas?.triggerReaction(win === 'X' ? 'wink' : 'star'); return; }
    if (!b.includes(null)) { this._tttRender("It's a draw! 🤝"); return; }

    // AI move (simple: pick first empty or random)
    const empty = b.map((v, i) => v === null ? i : -1).filter(i => i >= 0);
    const aiIdx = empty[Math.floor(Math.random() * empty.length)];
    b[aiIdx] = 'O';
    const win2 = this._tttCheck(b);
    if (win2) { this._tttRender(win2 === 'O' ? `${_eggCfg.assistant_name || 'Aria'} wins! 🤖` : 'You win!'); return; }
    if (!b.includes(null)) { this._tttRender("It's a draw! 🤝"); return; }
    this._tttRender();
  },

  _tttCheck(b) {
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for (const [a,c,d] of lines) {
      if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
    }
    return null;
  },

  // ── Dress-up (Ctrl+click face x3) ───────────────────────────────────────
  _bindDressUp() {
    const faceEl = document.getElementById('face-canvas');
    if (!faceEl) return;
    faceEl.addEventListener('click', (e) => {
      if (e.ctrlKey) {
        _ctrlClicks++;
        clearTimeout(_ctrlTimer);
        _ctrlTimer = setTimeout(() => { _ctrlClicks = 0; }, 1000);
        if (_ctrlClicks >= 3) {
          _ctrlClicks = 0;
          this._dressUpMenu();
        }
      }
    });
  },

  _dressUpMenu() {
    const hat    = FaceCanvas?._accessories?.hat    || false;
    const shades = FaceCanvas?._accessories?.sunglasses || false;
    const stache = FaceCanvas?._accessories?.mustache   || false;
    this._showOverlay(`
      <div style="text-align:center; padding:16px;">
        <div style="font-size:13px; color:var(--text); font-family:var(--font-body); margin-bottom:12px;">👗 Dress Me Up!</div>
        <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
          <button onclick="FaceCanvas.toggleAccessory('hat'); EasterEggs.closeOverlay();"
            style="padding:8px 12px; border-radius:8px; border:1px solid var(--border); background:${hat?'var(--accent)':'transparent'}; color:var(--text); cursor:pointer; font-size:18px;" title="Hat">🎩</button>
          <button onclick="FaceCanvas.toggleAccessory('sunglasses'); EasterEggs.closeOverlay();"
            style="padding:8px 12px; border-radius:8px; border:1px solid var(--border); background:${shades?'var(--accent)':'transparent'}; color:var(--text); cursor:pointer; font-size:18px;" title="Sunglasses">🕶</button>
          <button onclick="FaceCanvas.toggleAccessory('mustache'); EasterEggs.closeOverlay();"
            style="padding:8px 12px; border-radius:8px; border:1px solid var(--border); background:${stache?'var(--accent)':'transparent'}; color:var(--text); cursor:pointer; font-size:18px;" title="Mustache">👨</button>
        </div>
        <button onclick="EasterEggs.closeOverlay()" style="margin-top:12px; background:transparent; border:1px solid var(--border); color:var(--text-dim); padding:5px 12px; border-radius:6px; cursor:pointer; font-size:11px; font-family:var(--font-body);">Done</button>
      </div>`);
  },

  // ── Overlay helpers ──────────────────────────────────────────────────────
  _showOverlay(html) {
    if (!_overlay) return;
    _overlay.innerHTML = `<div class="bg-surface-light dark:bg-surface-dark p-6 rounded-2xl shadow-2xl max-w-[80%] relative border border-slate-200 dark:border-slate-700">
      <button onclick="EasterEggs.closeOverlay()" class="absolute top-2 right-2 p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">✕</button>
      ${html}
    </div>`;
    _overlay.classList.remove('hidden');
  },

  closeOverlay() {
    if (_overlay) _overlay.classList.add('hidden');
  },

  _defaultParticleForMood() {
    const map = { happy:'sparkles', sleepy:'snow', focused:'rain', relaxed:'fireflies', chill:'fireflies' };
    const mood = window.FaceCanvas ? _eggCfg.mood_auto ? 'happy' : 'chill' : 'chill';
    return map[mood] || 'sparkles';
  },
};

window.EasterEggs = EasterEggs;
