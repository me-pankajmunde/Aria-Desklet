/**
 * Face SVG — animated companion face using SVG elements
 * Supports: moods, AI-driven expressions (eyebrows, mouth, blush),
 *           emotion dot, cursor tracking, bounce reactions, idle animations.
 */
'use strict';

// ── Mouth path shapes ─────────────────────────────────────────────────────────
const MOUTH_PATHS = {
  smile:   'M75 85 Q 100 97, 125 85',
  grin:    'M65 85 Q 100 105, 135 85',
  neutral: 'M80 85 L 120 85',
  smirk:   'M75 85 Q 95 93, 125 83',
  o:       'M87 78 Q 100 67, 113 78 Q 100 93, 87 78',
  tongue:  'M75 85 Q 100 97, 125 85',
};

// Mood-based default mouth — all friendly and warm
const MOOD_MOUTH = {
  sleepy:  MOUTH_PATHS.neutral,   // resting/sleepy, not a cold smirk
  happy:   MOUTH_PATHS.grin,      // big happy
  focused: MOUTH_PATHS.smile,     // gentle smile even when focused
  relaxed: MOUTH_PATHS.smile,
  chill:   MOUTH_PATHS.smile,
};

// Emotion dot color map (driven by AI sentiment analysis)
const EMOTION_COLORS = {
  happy:      '#ffd700',
  excited:    '#ff6b9d',
  focused:    '#00ffff',
  calm:       '#5ebd7a',
  empathetic: '#c084fc',
  amused:     '#f97316',
  concerned:  '#f87171',
  curious:    '#38bdf8',
  neutral:    '#94a3b8',
};

// Eyebrow paths for left and right sides
const EYEBROW_PATHS = {
  none:     ['', ''],
  raised:   ['M53 38 Q 62 32 71 38',     'M129 38 Q 138 32 147 38'],
  furrowed: ['M53 42 Q 62 36 71 40',     'M129 42 Q 138 36 147 40'],
  wavy:     ['M53 40 Q 59 34 65 40 Q 68 43 71 40', 'M129 40 Q 135 34 141 40 Q 144 43 147 40'],
};

let _mood            = 'happy';
let _themeColor      = '#00FF94';
let _currentEmotion  = 'neutral';
let _reactionTimer   = null;
let _savedExpression = null; // saved before a reaction
let _idleTimer       = null;
let _blinkTimer      = null;

const FaceCanvas = {
  svg:          null,
  mouth:        null,
  eyesGroup:    null,
  _eyebrows:    [],
  _blushEls:    [],
  _emotionDot:  null,

  init(containerEl) {
    this.svg         = document.getElementById('face-svg');
    this.mouth       = document.getElementById('face-mouth');
    this.eyesGroup   = document.getElementById('eyes-group');
    this._eyebrows   = [
      document.getElementById('eyebrow-left'),
      document.getElementById('eyebrow-right'),
    ];
    this._blushEls   = [
      document.getElementById('face-blush-left'),
      document.getElementById('face-blush-right'),
    ];
    this._emotionDot = document.getElementById('emotion-dot');

    // Start warm with a smile
    if (this.mouth) this.mouth.setAttribute('d', MOUTH_PATHS.smile);

    this._bindInteractions();
    this._startBlink();
    this._startIdleAnimations();
  },

  // ── Mood (time-based, sets default mouth) ──────────────────────────────────
  setMood(mood) {
    _mood = MOOD_MOUTH[mood] ? mood : 'happy';
    if (this.mouth) {
      this.mouth.setAttribute('d', MOOD_MOUTH[_mood]);
    }
    // Clear eyebrows/blush back to neutral when mood changes (unless mid-reaction)
    if (!_reactionTimer) {
      this._setEyebrows('none');
      this._setBlush(false);
    }
  },

  // ── Emotion (AI-driven, updates the coloured dot only) ────────────────────
  setEmotion(emotion, intensity) {
    _currentEmotion = emotion || 'neutral';
    if (this._emotionDot) {
      const color = EMOTION_COLORS[_currentEmotion] || EMOTION_COLORS.neutral;
      this._emotionDot.style.backgroundColor = color;
      this._emotionDot.title = _currentEmotion;
      // Scale dot slightly based on intensity
      const scale = 0.8 + (intensity || 0.5) * 0.4;
      this._emotionDot.style.transform = `scale(${scale.toFixed(2)})`;
    }
  },

  // ── Full expression override (from AI analyze-sentiment only) ─────────────
  // Called after chat exchanges. Eyebrows here are intentional emotional signals.
  setExpression(expr) {
    if (!this.mouth || !expr) return;
    if (expr.mouth && MOUTH_PATHS[expr.mouth]) {
      this.mouth.setAttribute('d', MOUTH_PATHS[expr.mouth]);
    }
    if (expr.eyebrows !== undefined) {
      this._setEyebrows(expr.eyebrows);
    }
    if (expr.blush !== undefined) {
      this._setBlush(!!expr.blush);
    }
  },

  // ── Soft expression (from hour-change get-expression — no eyebrows) ────────
  // Only updates mouth and blush, never touches eyebrows (avoids "stuck" look)
  setSoftExpression(expr) {
    if (!this.mouth || !expr) return;
    if (expr.mouth && MOUTH_PATHS[expr.mouth]) {
      this.mouth.setAttribute('d', MOUTH_PATHS[expr.mouth]);
    }
    if (expr.blush !== undefined) {
      this._setBlush(!!expr.blush);
    }
  },

  // ── Reactions (short-lived, auto-reverts) ─────────────────────────────────
  triggerReaction(type) {
    const reactions = {
      wink:      { mouth: 'grin',    eyebrows: 'raised',  blush: true  },
      heart:     { mouth: 'grin',    eyebrows: 'raised',  blush: true  },
      star:      { mouth: 'grin',    eyebrows: 'raised',  blush: true  },
      surprised: { mouth: 'o',       eyebrows: 'raised',  blush: false },
      tongue:    { mouth: 'tongue',  eyebrows: 'none',    blush: false },
      smile:     { mouth: 'smile',   eyebrows: 'none',    blush: false },
      grin:      { mouth: 'grin',    eyebrows: 'raised',  blush: true  },
      annoyed:   { mouth: 'neutral', eyebrows: 'furrowed',blush: false },
    };

    const r = reactions[type] || reactions.surprised;

    // Save current state before reaction
    _savedExpression = {
      mouth:    this.mouth ? this.mouth.getAttribute('d') : MOOD_MOUTH[_mood],
      eyebrows: this._getEyebrowsState(),
      blush:    this._getBlushState(),
    };

    // Apply reaction
    this.setExpression(r);
    this._bounce();

    // Clear any pending revert
    if (_reactionTimer) clearTimeout(_reactionTimer);
    _reactionTimer = setTimeout(() => {
      if (_savedExpression) {
        if (this.mouth && _savedExpression.mouth) {
          this.mouth.setAttribute('d', _savedExpression.mouth);
        }
        this._setEyebrows(_savedExpression.eyebrows);
        this._setBlush(_savedExpression.blush);
        _savedExpression = null;
      }
      _reactionTimer = null;
    }, type === 'annoyed' ? 2000 : 900);
  },

  setColor(hex) {
    _themeColor = hex;
  },

  setAccessory() { /* not implemented in SVG version */ },
  toggleAccessory() { /* not implemented in SVG version */ },

  // ── Private helpers ────────────────────────────────────────────────────────
  _setEyebrows(style) {
    const paths = EYEBROW_PATHS[style] || EYEBROW_PATHS.none;
    this._eyebrows.forEach((el, i) => {
      if (!el) return;
      el.setAttribute('d', paths[i] || '');
      el.style.opacity = (style && style !== 'none' && paths[i]) ? '1' : '0';
    });
  },

  _setBlush(show) {
    this._blushEls.forEach(el => {
      if (el) el.style.opacity = show ? '1' : '0';
    });
  },

  _getEyebrowsState() {
    const el = this._eyebrows[0];
    if (!el || parseFloat(el.style.opacity) === 0) return 'none';
    const d = el.getAttribute('d') || '';
    if (!d) return 'none';
    for (const [name, paths] of Object.entries(EYEBROW_PATHS)) {
      if (name !== 'none' && paths[0] && d.startsWith(paths[0].slice(0, 6))) return name;
    }
    return 'none';
  },

  _getBlushState() {
    const el = this._blushEls[0];
    return el ? parseFloat(el.style.opacity) > 0 : false;
  },

  _bounce() {
    if (!this.svg) return;
    this.svg.style.transition = 'transform 0.2s cubic-bezier(.36,.07,.19,.97)';
    this.svg.style.transform  = 'scale(1.08)';
    setTimeout(() => {
      this.svg.style.transform = 'scale(1)';
      setTimeout(() => { this.svg.style.transition = ''; }, 200);
    }, 200);
  },

  // ── Natural eye blink ──────────────────────────────────────────────────────
  _startBlink() {
    const blink = () => {
      // Squish eyes vertically to simulate blink
      if (this.eyesGroup) {
        this.eyesGroup.style.transition = 'transform 80ms ease';
        this.eyesGroup.style.transform  = 'scaleY(0.08) translateY(4px)';
        setTimeout(() => {
          this.eyesGroup.style.transform = '';
          setTimeout(() => { this.eyesGroup.style.transition = ''; }, 80);
        }, 120);
      }
      // Schedule next blink (random 3-7 seconds)
      const delay = 3000 + Math.random() * 4000;
      _blinkTimer = setTimeout(blink, delay);
    };
    // First blink after 2 seconds
    _blinkTimer = setTimeout(blink, 2000);
  },

  // ── Idle animations — Aria feels alive between interactions ───────────────
  _startIdleAnimations() {
    const idleReactions = ['wink', 'heart', 'star', 'tongue', 'grin'];
    const scheduleNext = () => {
      // Random idle reaction every 45-90 seconds
      const delay = 45000 + Math.random() * 45000;
      _idleTimer = setTimeout(() => {
        // Only trigger idle if not mid-reaction and not mid-expression
        if (!_reactionTimer) {
          const reaction = idleReactions[Math.floor(Math.random() * idleReactions.length)];
          this.triggerReaction(reaction);
        }
        scheduleNext();
      }, delay);
    };
    // First idle animation after 10 seconds
    setTimeout(() => scheduleNext(), 10000);
  },

  _bindInteractions() {
    document.addEventListener('mousemove', (e) => {
      if (!this.eyesGroup || !this.svg) return;
      const rect    = this.svg.getBoundingClientRect();
      const centerX = rect.left + rect.width  / 2;
      const centerY = rect.top  + rect.height / 2;
      const dx      = e.clientX - centerX;
      const dy      = e.clientY - centerY;
      const dist    = Math.sqrt(dx * dx + dy * dy);

      let moveX = 0;
      let moveY = 0;
      if (dist > 0) {
        moveX = (dx / dist) * Math.min(8, dist / 10);
        moveY = (dy / dist) * Math.min(8, dist / 10);
      }

      this.eyesGroup.style.transform = `translate(${moveX}px, ${moveY}px)`;
      this.eyesGroup.classList.remove('animate-eye-track');

      clearTimeout(this._mouseTimeout);
      this._mouseTimeout = setTimeout(() => {
        this.eyesGroup.style.transform = '';
        this.eyesGroup.classList.add('animate-eye-track');
      }, 1000);
    });

    // Click on face triggers a random friendly reaction
    if (this.svg) {
      this.svg.addEventListener('click', () => {
        const r = ['wink', 'heart', 'star', 'tongue'][Math.floor(Math.random() * 4)];
        this.triggerReaction(r);
        this._bounce();
      });
    }
  },
};

window.FaceCanvas = FaceCanvas;
