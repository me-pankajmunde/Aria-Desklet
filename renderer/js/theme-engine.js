/**
 * Theme Engine — handles theme switching and live preview
 */
'use strict';

const THEMES = ['glassmorphism', 'cyberpunk', 'playful', 'organic'];

const THEME_META = {
  glassmorphism: { label: 'Glass',   swatchClass: 'swatch-glass',  accent: '#00d68f' },
  cyberpunk:     { label: 'Cyber',   swatchClass: 'swatch-cyber',  accent: '#00ffff' },
  playful:       { label: 'Play',    swatchClass: 'swatch-play',   accent: '#ff6b9d' },
  organic:       { label: 'Organic', swatchClass: 'swatch-org',    accent: '#5ebd7a' },
};

let _currentTheme = 'glassmorphism';
let _onChangeCallbacks = [];

const ThemeEngine = {
  init(initialTheme = 'glassmorphism') {
    _currentTheme = THEMES.includes(initialTheme) ? initialTheme : 'glassmorphism';
    this._apply(_currentTheme);
  },

  current() { return _currentTheme; },

  set(theme) {
    if (!THEMES.includes(theme)) return;
    _currentTheme = theme;
    this._apply(theme);
    _onChangeCallbacks.forEach(cb => cb(theme));
  },

  cycle() {
    const idx  = THEMES.indexOf(_currentTheme);
    const next = THEMES[(idx + 1) % THEMES.length];
    this.set(next);
    return next;
  },

  onChange(cb) { _onChangeCallbacks.push(cb); },

  getAccent(theme = _currentTheme) {
    return THEME_META[theme]?.accent || '#00ff88';
  },

  getMeta() { return THEME_META; },
  getAll()  { return THEMES; },

  _apply(theme) {
    const root = document.documentElement;
    
    // Define theme variables
    const themeVars = {
      glassmorphism: {
        '--color-primary': '#00FF94',
        '--color-primary-dim': '#00CC76',
        '--color-bg-light': '#F0F4F8',
        '--color-bg-dark': '#0B1120',
        '--color-surface-light': '#FFFFFF',
        '--color-surface-dark': '#162032'
      },
      cyberpunk: {
        '--color-primary': '#00ffff',
        '--color-primary-dim': '#00cccc',
        '--color-bg-light': '#1a0b2e',
        '--color-bg-dark': '#0d0221',
        '--color-surface-light': '#2d1b4e',
        '--color-surface-dark': '#1f0f3d'
      },
      playful: {
        '--color-primary': '#ff6b9d',
        '--color-primary-dim': '#cc557d',
        '--color-bg-light': '#fff0f5',
        '--color-bg-dark': '#2d1b2e',
        '--color-surface-light': '#ffffff',
        '--color-surface-dark': '#3d2b3e'
      },
      organic: {
        '--color-primary': '#5ebd7a',
        '--color-primary-dim': '#4a9661',
        '--color-bg-light': '#f4f9f5',
        '--color-bg-dark': '#1a2e20',
        '--color-surface-light': '#ffffff',
        '--color-surface-dark': '#243d2b'
      }
    };

    const vars = themeVars[theme] || themeVars.glassmorphism;
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value);
    }

    // Update data-theme
    const app = document.getElementById('app');
    if (app) app.dataset.theme = theme;
  },
};

window.ThemeEngine = ThemeEngine;
