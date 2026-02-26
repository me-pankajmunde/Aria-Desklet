/**
 * Face Canvas — animated companion face drawn with HTML5 Canvas
 * Supports: moods, expressions, blink, pupil drift, cursor tracking,
 *           accessories, reaction animations, theme-aware rendering.
 */
'use strict';

const MOOD_PARAMS = {
  sleepy:  { eyeOpen: 0.28, smile: -0.06, eyeShape: 'squint', blush: false },
  happy:   { eyeOpen: 1.00, smile:  0.28, eyeShape: 'wide',   blush: true  },
  focused: { eyeOpen: 0.65, smile:  0.10, eyeShape: 'normal', blush: false },
  relaxed: { eyeOpen: 0.85, smile:  0.20, eyeShape: 'normal', blush: false },
  chill:   { eyeOpen: 0.75, smile:  0.18, eyeShape: 'normal', blush: false },
};

// Active expression overrides (set by AI or interactions)
let _expression = {
  eyeShape:  'normal',   // normal | wide | squint | heart | star | wink-left | wink-right
  eyebrows:  'none',     // none | raised | furrowed | wavy
  mouth:     'smile',    // smile | grin | neutral | smirk | o | tongue
  blush:     false,
  zzz:       false,
  sweatDrop: false,
};

let _mood        = 'happy';
let _blinkFrac   = 0;
let _blinkDir    = 1;
let _blinking    = false;
let _pupilOff    = { x: 0, y: 0 };
let _mouseOff    = null;            // {x,y} offset from center when mouse near
let _themeColor  = '#00d68f';
let _accessories = { hat: false, sunglasses: false, mustache: false };
let _zzzPhase    = 0;
let _reactionTimer = null;
let _poke_count    = 0;
let _lastPokeTime  = 0;

const FaceCanvas = {
  canvas: null,
  ctx:    null,
  _raf:   null,

  init(canvasEl) {
    this.canvas = canvasEl;
    this.ctx    = canvasEl.getContext('2d');
    this._startBlink();
    this._startDrift();
    this._bindInteractions();
    this._loop();
  },

  setMood(mood) {
    _mood = MOOD_PARAMS[mood] ? mood : 'happy';
    const params = MOOD_PARAMS[_mood];
    // Apply mood defaults to expression (AI can override later)
    _expression.eyeShape = params.eyeShape;
    _expression.blush    = params.blush;
    _expression.zzz      = (mood === 'sleepy');
  },

  setExpression(expr) {
    Object.assign(_expression, expr);
  },

  setColor(hex) {
    _themeColor = hex;
  },

  setAccessory(type, val) {
    _accessories[type] = val;
  },

  toggleAccessory(type) {
    _accessories[type] = !_accessories[type];
  },

  triggerReaction(type) {
    const reactions = {
      'wink':      { eyeShape: 'wink-left', mouth: 'grin',    blush: true  },
      'heart':     { eyeShape: 'heart',     mouth: 'grin',    blush: true  },
      'surprised': { eyeShape: 'wide',      mouth: 'o',       blush: false },
      'tongue':    { eyeShape: 'normal',    mouth: 'tongue',  blush: false },
      'star':      { eyeShape: 'star',      mouth: 'grin',    blush: true  },
      'annoyed':   { eyeShape: 'squint',    mouth: 'neutral', blush: false },
    };
    const r = reactions[type] || reactions['surprised'];
    const prev = { ..._expression };
    Object.assign(_expression, r);
    if (_reactionTimer) clearTimeout(_reactionTimer);
    _reactionTimer = setTimeout(() => {
      Object.assign(_expression, prev);
      _reactionTimer = null;
    }, type === 'annoyed' ? 2000 : 900);

    // Bounce effect on canvas
    this.canvas.style.animation = 'none';
    this.canvas.offsetHeight; // reflow
    this.canvas.style.animation = 'bounce 0.4s ease';
    setTimeout(() => { this.canvas.style.animation = ''; }, 400);
  },

  _startBlink() {
    const schedule = () => {
      const delay = 3000 + Math.random() * 4000;
      setTimeout(() => {
        _blinking = true;
        _blinkFrac = 0;
        _blinkDir  = 1;
        schedule();
      }, delay);
    };
    schedule();
  },

  _startDrift() {
    setInterval(() => {
      if (!_mouseOff) {
        _pupilOff = { x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 4 };
      }
    }, 2200);
  },

  _bindInteractions() {
    const el = this.canvas;

    // Mouse tracking for eye follow
    document.addEventListener('mousemove', (e) => {
      const rect = el.getBoundingClientRect();
      const faceX = rect.left + rect.width  / 2;
      const faceY = rect.top  + rect.height / 2;
      const dx    = e.clientX - faceX;
      const dy    = e.clientY - faceY;
      const dist  = Math.hypot(dx, dy);
      if (dist < 200) {
        const scale = Math.min(dist / 200, 1) * 5;
        const angle = Math.atan2(dy, dx);
        _mouseOff = {
          x: Math.cos(angle) * scale,
          y: Math.sin(angle) * scale,
        };
      } else {
        _mouseOff = null;
      }
    });

    // Click reactions
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      // Poke tracking
      const now = Date.now();
      if (now - _lastPokeTime < 600) _poke_count++;
      else _poke_count = 1;
      _lastPokeTime = now;

      if (_poke_count >= 5) {
        this.triggerReaction('annoyed');
        _poke_count = 0;
        setTimeout(() => this.triggerReaction('tongue'), 2100);
        return;
      }

      // Random click reactions
      const rand = Math.random();
      if (rand < 0.25)      this.triggerReaction('wink');
      else if (rand < 0.50) this.triggerReaction('heart');
      else if (rand < 0.75) this.triggerReaction('star');
      else                  this.triggerReaction('tongue');
    });

    // Double click → spin
    el.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      el.style.transition = 'transform 0.5s ease';
      el.style.transform  = 'rotate(360deg)';
      setTimeout(() => {
        el.style.transition = '';
        el.style.transform  = '';
      }, 500);
    });

    // Hover glow
    el.addEventListener('mouseenter', () => {
      if (!_reactionTimer) {
        _expression.eyebrows = 'raised';
      }
    });
    el.addEventListener('mouseleave', () => {
      if (!_reactionTimer && _expression.eyebrows === 'raised') {
        _expression.eyebrows = 'none';
      }
    });
  },

  _loop() {
    this._raf = requestAnimationFrame(() => this._loop());
    this._update();
    this._draw();
  },

  _update() {
    if (_blinking) {
      _blinkFrac += _blinkDir * 0.2;
      if (_blinkFrac >= 1.0) { _blinkFrac = 1.0; _blinkDir = -1; }
      if (_blinkFrac <= 0.0) { _blinkFrac = 0.0; _blinking = false; }
    }
    if (_expression.zzz) {
      _zzzPhase += 0.03;
    }
  },

  _draw() {
    const c   = this.ctx;
    const W   = this.canvas.width;
    const H   = this.canvas.height;
    const cx  = W / 2;
    const cy  = H / 2;
    const col = _themeColor;

    c.clearRect(0, 0, W, H);

    const params    = MOOD_PARAMS[_mood] || MOOD_PARAMS.happy;
    const openRatio = params.eyeOpen * (1 - _blinkFrac);
    const smileVal  = params.smile;
    const pupils    = _mouseOff || _pupilOff;

    c.lineWidth   = 2.2;
    c.strokeStyle = col;
    c.lineCap     = 'round';

    /* ── Face circle / blob ──────────────────────────────────────────── */
    const theme = window.ThemeEngine ? window.ThemeEngine.current() : 'glassmorphism';
    if (theme === 'organic') {
      // Morphing blob face
      this._drawBlobFace(c, cx, cy, 36, col);
    } else {
      c.beginPath();
      c.arc(cx, cy, 36, 0, Math.PI * 2);
      if (theme === 'playful') {
        c.fillStyle = 'rgba(255,107,157,0.1)';
        c.fill();
      } else if (theme === 'cyberpunk') {
        c.fillStyle = 'rgba(0,255,255,0.04)';
        c.fill();
        // Extra neon inner ring
        c.strokeStyle = col;
        c.globalAlpha = 0.35;
        c.beginPath(); c.arc(cx, cy, 39, 0, Math.PI * 2); c.stroke();
        c.globalAlpha = 1;
      }
      c.strokeStyle = col;
      c.beginPath(); c.arc(cx, cy, 36, 0, Math.PI * 2); c.stroke();
    }

    /* ── Eyebrows ────────────────────────────────────────────────────── */
    this._drawEyebrows(c, cx, cy, col, _expression.eyebrows);

    /* ── Eyes ────────────────────────────────────────────────────────── */
    const eyePositions = [{ x: cx - 12, y: cy - 10 }, { x: cx + 12, y: cy - 10 }];
    eyePositions.forEach(({ x: ex, y: ey }, i) => {
      const isWinkLeft  = (_expression.eyeShape === 'wink-left'  && i === 0);
      const isWinkRight = (_expression.eyeShape === 'wink-right' && i === 1);
      if (isWinkLeft || isWinkRight) {
        // Closed wink line
        c.beginPath(); c.moveTo(ex - 6, ey); c.lineTo(ex + 6, ey); c.stroke();
        return;
      }
      if (_expression.eyeShape === 'heart') { this._drawHeartEye(c, ex, ey, col); return; }
      if (_expression.eyeShape === 'star')  { this._drawStarEye(c, ex, ey, col); return; }

      const shape = _expression.eyeShape === 'wide' ? 1.3 : _expression.eyeShape === 'squint' ? 0.4 : 1.0;
      const ry    = Math.max(0.5, 6.5 * openRatio * shape);
      const px    = ex + pupils.x;
      const py    = ey + pupils.y * 0.5;

      c.beginPath(); c.ellipse(ex, ey, 6, ry, 0, 0, Math.PI * 2); c.stroke();
      // Pupil
      c.beginPath(); c.fillStyle = col;
      if (theme === 'playful') { c.arc(px, py, 3, 0, Math.PI * 2); }
      else                     { c.arc(px, py, 2, 0, Math.PI * 2); }
      c.fill();

      // Shine dot
      c.beginPath(); c.fillStyle = 'rgba(255,255,255,0.6)';
      c.arc(px + 1.5, py - 1.5, 1, 0, Math.PI * 2); c.fill();
    });

    /* ── Blush ───────────────────────────────────────────────────────── */
    if (_expression.blush || params.blush) {
      c.fillStyle = theme === 'cyberpunk' ? 'rgba(255,0,128,0.18)' : 'rgba(255,100,150,0.20)';
      c.beginPath(); c.ellipse(cx - 20, cy + 8, 9, 5, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(cx + 20, cy + 8, 9, 5, 0, 0, Math.PI * 2); c.fill();
    }

    /* ── Mouth ───────────────────────────────────────────────────────── */
    this._drawMouth(c, cx, cy, col, _expression.mouth, smileVal);

    /* ── Accessories ─────────────────────────────────────────────────── */
    if (_accessories.hat)       this._drawHat(c, cx, cy, col);
    if (_accessories.sunglasses)this._drawSunglasses(c, cx, cy, col);
    if (_accessories.mustache)  this._drawMustache(c, cx, cy, col);

    /* ── Zzz for sleepy ─────────────────────────────────────────────── */
    if (_expression.zzz) {
      this._drawZzz(c, cx + 30, cy - 28, _zzzPhase);
    }

    /* ── Sweat drop ─────────────────────────────────────────────────── */
    if (_expression.sweatDrop) {
      c.fillStyle = '#4fc3f7';
      c.beginPath(); c.arc(cx + 32, cy - 10, 3, 0, Math.PI * 2); c.fill();
    }

    /* ── Cyberpunk scanline on face ─────────────────────────────────── */
    if (theme === 'cyberpunk') {
      c.fillStyle = 'rgba(0,255,255,0.04)';
      for (let y = cy - 36; y < cy + 36; y += 4) {
        c.fillRect(cx - 36, y, 72, 1.5);
      }
    }
  },

  _drawBlobFace(c, cx, cy, r, col) {
    const t = Date.now() / 2000;
    const pts = 8;
    c.beginPath();
    for (let i = 0; i <= pts; i++) {
      const angle   = (i / pts) * Math.PI * 2;
      const wobble  = 1 + 0.06 * Math.sin(t + i * 1.3);
      const x = cx + r * wobble * Math.cos(angle);
      const y = cy + r * wobble * Math.sin(angle);
      i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.closePath();
    c.fillStyle = 'rgba(94,189,122,0.08)';
    c.fill();
    c.strokeStyle = col;
    c.stroke();
  },

  _drawEyebrows(c, cx, cy, col, style) {
    if (style === 'none') return;
    c.strokeStyle = col;
    c.lineWidth = 1.8;
    const positions = [cx - 12, cx + 12];
    positions.forEach((ex, i) => {
      const flip  = i === 0 ? 1 : -1;
      const baseY = cy - 22;
      c.beginPath();
      if (style === 'raised') {
        c.moveTo(ex - 6, baseY - 2);
        c.quadraticCurveTo(ex, baseY - 5, ex + 6, baseY - 2);
      } else if (style === 'furrowed') {
        c.moveTo(ex - 6, baseY - 1);
        c.lineTo(ex + 6, baseY + (flip > 0 ? 3 : -3));
      } else if (style === 'wavy') {
        c.moveTo(ex - 6, baseY);
        c.bezierCurveTo(ex - 2, baseY - 4, ex + 2, baseY + 4, ex + 6, baseY);
      }
      c.stroke();
    });
    c.lineWidth = 2.2;
  },

  _drawMouth(c, cx, cy, col, mouthType, smileVal) {
    const my = cy + 14;
    c.strokeStyle = col;
    c.lineWidth   = 2;
    c.beginPath();
    if (mouthType === 'o') {
      c.arc(cx, my, 5, 0, Math.PI * 2);
      c.stroke();
    } else if (mouthType === 'tongue') {
      c.moveTo(cx - 10, my);
      c.quadraticCurveTo(cx, my - 8, cx + 10, my);
      c.stroke();
      c.fillStyle = '#ff6699';
      c.beginPath(); c.ellipse(cx, my + 4, 5, 4, 0, 0, Math.PI * 2); c.fill();
    } else if (mouthType === 'smirk') {
      c.moveTo(cx - 8, my);
      c.quadraticCurveTo(cx + 4, my - 8, cx + 12, my - 2);
      c.stroke();
    } else if (mouthType === 'grin') {
      c.moveTo(cx - 13, my);
      c.quadraticCurveTo(cx, my - smileVal * 30 - 6, cx + 13, my);
      c.stroke();
      // teeth
      c.fillStyle = 'rgba(255,255,255,0.55)';
      c.fillRect(cx - 9, my - 5, 18, 4);
    } else if (mouthType === 'neutral') {
      c.moveTo(cx - 10, my); c.lineTo(cx + 10, my); c.stroke();
    } else {
      // smile (default)
      const ctrl = my - 36 * smileVal;
      c.moveTo(cx - 11, my);
      c.quadraticCurveTo(cx, ctrl, cx + 11, my);
      c.stroke();
    }
    c.lineWidth = 2.2;
  },

  _drawHeartEye(c, ex, ey, col) {
    c.fillStyle = col;
    const s = 0.55;
    c.beginPath();
    c.moveTo(ex, ey + 3 * s);
    c.bezierCurveTo(ex, ey, ex - 6 * s, ey, ex - 6 * s, ey - 3 * s);
    c.bezierCurveTo(ex - 6 * s, ey - 8 * s, ex, ey - 8 * s, ex, ey - 5 * s);
    c.bezierCurveTo(ex, ey - 8 * s, ex + 6 * s, ey - 8 * s, ex + 6 * s, ey - 3 * s);
    c.bezierCurveTo(ex + 6 * s, ey, ex, ey, ex, ey + 3 * s);
    c.fill();
  },

  _drawStarEye(c, ex, ey, col) {
    c.fillStyle = col;
    c.save(); c.translate(ex, ey);
    c.beginPath();
    for (let i = 0; i < 5; i++) {
      const a  = (i * 4 * Math.PI) / 5 - Math.PI / 2;
      const a2 = ((i * 4 + 2) * Math.PI) / 5 - Math.PI / 2;
      i === 0 ? c.moveTo(6 * Math.cos(a), 6 * Math.sin(a))
              : c.lineTo(6 * Math.cos(a), 6 * Math.sin(a));
      c.lineTo(2.5 * Math.cos(a2), 2.5 * Math.sin(a2));
    }
    c.closePath(); c.fill(); c.restore();
  },

  _drawHat(c, cx, cy, col) {
    c.fillStyle = col;
    c.strokeStyle = col;
    c.lineWidth = 1.5;
    // Brim
    c.beginPath(); c.ellipse(cx, cy - 42, 22, 4, 0, 0, Math.PI * 2); c.fill();
    // Body
    c.beginPath(); c.rect(cx - 14, cy - 66, 28, 24);
    c.fillStyle = col; c.fill();
    c.lineWidth = 2.2;
  },

  _drawSunglasses(c, cx, cy, col) {
    c.strokeStyle = col;
    c.lineWidth = 2;
    // Bridge
    c.beginPath(); c.moveTo(cx - 5, cy - 10); c.lineTo(cx + 5, cy - 10); c.stroke();
    // Left lens
    c.strokeStyle = col;
    c.beginPath(); c.ellipse(cx - 12, cy - 10, 7, 5, 0, 0, Math.PI * 2);
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fill(); c.stroke();
    // Right lens
    c.beginPath(); c.ellipse(cx + 12, cy - 10, 7, 5, 0, 0, Math.PI * 2);
    c.fill(); c.stroke();
    c.lineWidth = 2.2;
  },

  _drawMustache(c, cx, cy, col) {
    c.strokeStyle = col; c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(cx - 14, cy + 6);
    c.quadraticCurveTo(cx - 7, cy + 11, cx, cy + 7);
    c.quadraticCurveTo(cx + 7, cy + 11, cx + 14, cy + 6);
    c.stroke(); c.lineWidth = 2.2;
  },

  _drawZzz(c, x, y, phase) {
    const letters = ['z', 'Z', 'Z'];
    letters.forEach((letter, i) => {
      const t   = (phase + i * 0.8) % (Math.PI * 2);
      const ox  = Math.sin(t) * 4;
      const oy  = -i * 8 - (t / (Math.PI * 2)) * 10;
      const opa = Math.max(0, 1 - (t / (Math.PI * 2)));
      c.globalAlpha  = opa * 0.7;
      c.fillStyle    = _themeColor;
      c.font         = `bold ${8 + i * 2}px monospace`;
      c.fillText(letter, x + ox, y + oy);
    });
    c.globalAlpha = 1;
  },
};

window.FaceCanvas = FaceCanvas;
