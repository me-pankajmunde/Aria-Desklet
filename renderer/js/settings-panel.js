/**
 * Settings Panel — full in-app settings UI with live preview
 */
'use strict';

let _spCfg    = {};
let _panel  = null;
let _saveTimer = null;

const SettingsPanel = {
  init(cfg) {
    _spCfg   = { ...cfg };
    _panel = document.getElementById('settings-panel');
    this._render();
  },

  updateCfg(cfg) {
    _spCfg = { ...cfg };
  },

  show() {
    if (!_panel) return;
    this._render();
    _panel.classList.remove('hidden');
    requestAnimationFrame(() => _panel.classList.add('visible'));
  },

  hide() {
    if (!_panel) return;
    _panel.classList.remove('visible');
    setTimeout(() => _panel.classList.add('hidden'), 360);
  },

  _render() {
    if (!_panel) return;
    const name = _spCfg.assistant_name || 'Aria';
    _panel.innerHTML = `
      <div class="settings-header">
        <span class="settings-title">⚙ Settings</span>
        <button class="settings-close" onclick="SettingsPanel.hide()">✕</button>
      </div>

      <!-- THEME -->
      <div class="settings-section">
        <div class="settings-section-title">Theme</div>
        <div class="theme-picker">
          ${this._themePicker()}
        </div>
      </div>

      <!-- PERSONA -->
      <div class="settings-section">
        <div class="settings-section-title">Persona</div>
        ${this._textRow('assistant_name', 'Name', name)}
        ${this._textRow('user_name', 'Your name', _spCfg.user_name || '')}
      </div>

      <!-- APPEARANCE -->
      <div class="settings-section">
        <div class="settings-section-title">Appearance</div>
        ${this._colorRow('poem_color',  'Poem color', _spCfg.poem_color)}
        ${this._colorRow('clock_color', 'Clock color', _spCfg.clock_color)}
        ${this._colorRow('bg_color',    'BG color', _spCfg.bg_color)}
        ${this._sliderRow('bg_alpha', 'Opacity', Math.round(_spCfg.bg_alpha * 100), 10, 100)}
        ${this._toggleRow('glow_enabled', 'Neon glow', _spCfg.glow_enabled)}
        ${this._toggleRow('show_face',    'Show face', _spCfg.show_face)}
        ${this._toggleRow('particles',    'Particles', _spCfg.particles)}
      </div>

      <!-- FEATURES -->
      <div class="settings-section">
        <div class="settings-section-title">Features</div>
        ${this._toggleRow('mood_auto',    'Auto mood',      _spCfg.mood_auto)}
        ${this._toggleRow('hourly_tips',  'Hourly tips',    _spCfg.hourly_tips)}
        ${this._toggleRow('voice_enabled','Voice enabled',  _spCfg.voice_enabled)}
        ${this._toggleRow('auto_read_poems','Read poems',   _spCfg.auto_read_poems)}
        ${this._toggleRow('easter_eggs',  'Easter eggs',    _spCfg.easter_eggs)}
      </div>

      <!-- POSITION -->
      <div class="settings-section">
        <div class="settings-section-title">Position</div>
        <div class="setting-row">
          <label class="setting-label">Corner</label>
          <select class="setting-input" id="s-position" style="flex:1; cursor:pointer;">
            ${['bottom-right','bottom-left','top-right','top-left'].map(p =>
              `<option value="${p}" ${_spCfg.position === p ? 'selected' : ''}>${p.replace('-',' ')}</option>`
            ).join('')}
          </select>
        </div>
      </div>

      <!-- ABOUT -->
      <div class="settings-section">
        <div class="settings-section-title">About</div>
        <div style="font-size:11px; color:var(--text-dim); font-family:var(--font-body); line-height:1.8;">
          <b style="color:var(--text)">Rhyming Clock v2</b> · Electron<br/>
          Ctrl+click face ×3 → dress-up<br/>
          Chat: <i>dance</i> · <i>fortune</i> · <i>spin</i> · <i>tictactoe</i>
        </div>
      </div>
    `;
    this._bindLiveEditing();
  },

  _themePicker() {
    return Object.entries(ThemeEngine.getMeta()).map(([id, meta]) => {
      const active = _spCfg.theme === id ? 'active' : '';
      return `<div class="theme-swatch ${meta.swatchClass} ${active}" 
                   title="${meta.label}"
                   onclick="SettingsPanel._setTheme('${id}')">
                <span>${meta.label}</span>
              </div>`;
    }).join('');
  },

  _textRow(key, label, val) {
    return `<div class="setting-row">
      <label class="setting-label">${label}</label>
      <input class="setting-input" type="text" id="s-${key}" value="${this._esc(val)}"
             oninput="SettingsPanel._patch('${key}', this.value)"/>
    </div>`;
  },

  _colorRow(key, label, val) {
    return `<div class="setting-row">
      <label class="setting-label">${label}</label>
      <input type="color" id="s-${key}" value="${val || '#00d68f'}"
             class="color-btn" style="background:${val}"
             oninput="SettingsPanel._patch('${key}', this.value); this.style.background=this.value"/>
    </div>`;
  },

  _sliderRow(key, label, val, min, max) {
    return `<div class="setting-row">
      <label class="setting-label">${label}</label>
      <input type="range" class="setting-slider" min="${min}" max="${max}" value="${val}"
             id="s-${key}" oninput="SettingsPanel._patch('${key}', this.value/100)"/>
    </div>`;
  },

  _toggleRow(key, label, val) {
    return `<div class="setting-row">
      <label class="setting-label">${label}</label>
      <label class="setting-toggle">
        <input type="checkbox" id="s-${key}" ${val ? 'checked' : ''}
               onchange="SettingsPanel._patch('${key}', this.checked)"/>
        <span class="toggle-slider"></span>
      </label>
    </div>`;
  },

  _esc(s) { return String(s).replace(/"/g, '&quot;'); },

  _bindLiveEditing() {
    const posEl = document.getElementById('s-position');
    if (posEl) posEl.addEventListener('change', (e) => this._patch('position', e.target.value));
  },

  _setTheme(id) {
    this._patch('theme', id);
    ThemeEngine.set(id);
    // Re-render theme picker to update active state
    const picker = _panel.querySelector('.theme-picker');
    if (picker) picker.innerHTML = this._themePicker();
  },

  _patch(key, value) {
    _spCfg[key] = value;
    // Immediate live preview
    this._applyPreview(key, value);
    // Debounced save
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => {
      window.rClock.saveSettings(_spCfg);
      // Notify app.js of cfg change
      window.dispatchEvent(new CustomEvent('cfg-updated', { detail: _spCfg }));
    }, 400);
  },

  _applyPreview(key, value) {
    if (key === 'theme')       { ThemeEngine.set(value); return; }
    if (key === 'particles')   { ParticleEngine.setEnabled(value); return; }
    if (key === 'show_face')   { document.getElementById('face-canvas').style.opacity = value ? 1 : 0; return; }
    if (key === 'voice_enabled' || key === 'auto_read_poems') { Voice.update(_spCfg); return; }
    if (key === 'poem_color')  {
      document.documentElement.style.setProperty('--accent', value);
      FaceCanvas.setColor(value);
    }
  },

  getCfg() { return { ..._spCfg }; },
};

window.SettingsPanel = SettingsPanel;
