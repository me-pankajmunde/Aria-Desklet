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
    // Swap stylesheet
    const link = document.getElementById('theme-css');
    if (link) link.href = `styles/themes/${theme}.css`;

    // Update data-theme
    const app = document.getElementById('app');
    if (app) app.dataset.theme = theme;

    // Swap body class
    document.body.className = `theme-${theme}`;
  },
};

window.ThemeEngine = ThemeEngine;
