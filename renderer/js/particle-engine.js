/**
 * Particle Engine — ambient canvas particles behind the widget
 * Types: sparkles, fireflies, rain, snow, digital, confetti, leaves
 */
'use strict';

const PARTICLE_DEFAULTS = {
  sparkles:  { count: 40, baseColor: '#00d68f',  speed: 0.6, size: 3  },
  fireflies: { count: 25, baseColor: '#ffd700',  speed: 0.3, size: 4  },
  rain:      { count: 60, baseColor: '#4fc3f7',  speed: 2.0, size: 1  },
  snow:      { count: 35, baseColor: '#e0f7ff',  speed: 0.5, size: 4  },
  digital:   { count: 30, baseColor: '#00ffff',  speed: 1.5, size: 2  },
  confetti:  { count: 50, baseColor: null,        speed: 1.2, size: 5  },
  leaves:    { count: 20, baseColor: '#5ebd7a',  speed: 0.9, size: 6  },
  none:      { count: 0,  baseColor: 'transparent', speed: 0, size: 0 },
};

const CONFETTI_COLORS = ['#ff6b9d','#6bcbff','#ffd700','#00d68f','#c44dff','#ff9a00'];
const DIGITAL_CHARS   = '01アイウエオ♠♣♦☯⚡∞'.split('');

let _canvas  = null;
let _ctx     = null;
let _W       = 0;
let _H       = 0;
let _type    = 'none';
let _config  = {};
let _particles = [];
let _raf      = null;
let _partEnabled  = true;

const ParticleEngine = {
  init(canvasEl) {
    _canvas = canvasEl;
    _ctx    = canvasEl.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this._loop();
  },

  resize() {
    if (!_canvas) return;
    _W = _canvas.width  = window.innerWidth;
    _H = _canvas.height = window.innerHeight;
    if (_particles.length > 0) this._spawnAll();
  },

  setType(type, overrides = {}) {
    _type   = PARTICLE_DEFAULTS[type] ? type : 'none';
    _config = { ...PARTICLE_DEFAULTS[_type], ...overrides };
    this._spawnAll();
  },

  setEnabled(v) {
    _partEnabled = v;
    if (!v) _particles = [];
  },

  _spawnAll() {
    _particles = [];
    for (let i = 0; i < _config.count; i++) {
      _particles.push(this._make(true));
    }
  },

  _make(scatter = false) {
    const cfg  = _config;
    const color = cfg.baseColor === null
      ? CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]
      : cfg.baseColor;

    const base = {
      x:     Math.random() * _W,
      y:     scatter ? Math.random() * _H : -10,
      vx:    (Math.random() - 0.5) * cfg.speed * 0.5,
      vy:    cfg.speed * (0.5 + Math.random() * 0.8),
      size:  cfg.size * (0.5 + Math.random() * 0.8),
      color,
      alpha: 0.6 + Math.random() * 0.4,
      life:  0,
      maxLife: 180 + Math.random() * 120,
      angle: Math.random() * Math.PI * 2,
      spin:  (Math.random() - 0.5) * 0.05,
      char:  DIGITAL_CHARS[Math.floor(Math.random() * DIGITAL_CHARS.length)],
    };

    if (_type === 'fireflies') {
      base.vy    = (Math.random() - 0.5) * 0.5;
      base.vx    = (Math.random() - 0.5) * 0.5;
      base.phase = Math.random() * Math.PI * 2;
    }
    if (_type === 'rain') {
      base.vx = 0.5 + Math.random() * 0.5;
      base.vy = cfg.speed * (0.8 + Math.random() * 0.4);
    }
    if (_type === 'leaves') {
      base.spin = (Math.random() - 0.5) * 0.08;
      base.vx   = (0.5 + Math.random()) * 0.8;
    }
    return base;
  },

  _loop() {
    _raf = requestAnimationFrame(() => this._loop());
    if (!_partEnabled || _type === 'none' || !_ctx) return;
    _ctx.clearRect(0, 0, _W, _H);
    this._update();
    this._render();
  },

  _update() {
    for (let i = _particles.length - 1; i >= 0; i--) {
      const p = _particles[i];
      p.life++;
      p.x += p.vx;
      p.y += p.vy;
      p.angle += p.spin;

      if (_type === 'fireflies') {
        p.phase += 0.02;
        p.x += Math.sin(p.phase)       * 0.8;
        p.y += Math.cos(p.phase * 0.7) * 0.5;
      }

      // Reset when out of bounds or expired
      const reset = p.y > _H + 20 || p.x < -20 || p.x > _W + 20 || p.life > p.maxLife;
      if (reset) {
        _particles[i] = this._make(false);
        _particles[i].y = _type === 'digital' ? Math.random() * _H : -10;
      }

      // Fade near end of life
      p.alpha = Math.min(0.8, p.alpha, (p.maxLife - p.life) / 60);
    }
  },

  _render() {
    const c = _ctx;
    _particles.forEach(p => {
      c.globalAlpha = Math.max(0, p.alpha);
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.angle);

      switch (_type) {
        case 'sparkles':
          this._renderSparkle(c, p);
          break;
        case 'fireflies':
          this._renderFirefly(c, p);
          break;
        case 'rain':
          this._renderRain(c, p);
          break;
        case 'snow':
          this._renderSnow(c, p);
          break;
        case 'digital':
          this._renderDigital(c, p);
          break;
        case 'confetti':
          this._renderConfetti(c, p);
          break;
        case 'leaves':
          this._renderLeaf(c, p);
          break;
      }
      c.restore();
    });
    c.globalAlpha = 1;
  },

  _renderSparkle(c, p) {
    c.fillStyle   = p.color;
    c.strokeStyle = p.color;
    const s = p.size;
    c.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      c.moveTo(0, 0);
      c.lineTo(Math.cos(a) * s * 1.5, Math.sin(a) * s * 1.5);
    }
    c.lineWidth = 1;
    c.stroke();
    c.beginPath(); c.arc(0, 0, s * 0.4, 0, Math.PI * 2); c.fill();
  },

  _renderFirefly(c, p) {
    const grad = c.createRadialGradient(0, 0, 0, 0, 0, p.size * 2.5);
    grad.addColorStop(0, p.color);
    grad.addColorStop(1, 'transparent');
    c.fillStyle = grad;
    c.beginPath(); c.arc(0, 0, p.size * 2.5, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff'; c.globalAlpha *= 0.6;
    c.beginPath(); c.arc(0, 0, 1.5, 0, Math.PI * 2); c.fill();
  },

  _renderRain(c, p) {
    c.strokeStyle = p.color;
    c.lineWidth   = p.size;
    c.globalAlpha *= 0.5;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(p.vx * 3, p.vy * 3); c.stroke();
  },

  _renderSnow(c, p) {
    c.fillStyle = p.color;
    c.beginPath(); c.arc(0, 0, p.size, 0, Math.PI * 2); c.fill();
    c.strokeStyle = p.color; c.lineWidth = 0.5; c.globalAlpha *= 0.4;
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      c.beginPath(); c.moveTo(0,0); c.lineTo(Math.cos(a)*p.size*2.5, Math.sin(a)*p.size*2.5); c.stroke();
    }
  },

  _renderDigital(c, p) {
    c.fillStyle = p.color;
    c.font = `bold ${p.size * 4}px 'Share Tech Mono', monospace`;
    c.textAlign = 'center';
    c.fillText(p.char, 0, 0);
  },

  _renderConfetti(c, p) {
    c.fillStyle = p.color;
    c.fillRect(-p.size / 2, -p.size * 0.4, p.size, p.size * 0.8);
  },

  _renderLeaf(c, p) {
    c.fillStyle   = p.color;
    c.strokeStyle = 'rgba(0,0,0,0.15)';
    c.lineWidth   = 0.5;
    c.beginPath();
    c.moveTo(0, -p.size);
    c.quadraticCurveTo(p.size * 1.2, 0, 0, p.size);
    c.quadraticCurveTo(-p.size * 1.2, 0, 0, -p.size);
    c.fill(); c.stroke();
  },
};

window.ParticleEngine = ParticleEngine;
