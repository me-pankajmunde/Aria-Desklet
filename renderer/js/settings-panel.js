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
    _panel.classList.remove('translate-x-full');
    _panel.classList.add('translate-x-0');
  },

  hide() {
    if (!_panel) return;
    _panel.classList.remove('translate-x-0');
    _panel.classList.add('translate-x-full');
  },

  _render() {
    if (!_panel) return;
    const name = _spCfg.assistant_name || 'Aria';
    _panel.innerHTML = `
      <div class="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700">
        <span class="font-bold text-slate-800 dark:text-white">⚙ Settings</span>
        <button class="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 no-drag" onclick="SettingsPanel.hide()">
          <span class="material-icons-round text-slate-500">close</span>
        </button>
      </div>
      
      <div class="flex-1 overflow-y-auto p-4 space-y-6 text-sm text-slate-700 dark:text-slate-300">
        <!-- THEME -->
        <div class="space-y-2">
          <div class="font-semibold text-xs uppercase tracking-wider text-slate-500">Theme</div>
          <div class="flex space-x-2">
            ${this._themePicker()}
          </div>
        </div>

        <!-- PERSONA -->
        <div class="space-y-2">
          <div class="font-semibold text-xs uppercase tracking-wider text-slate-500">Persona</div>
          ${this._textRow('assistant_name', 'Name', name)}
          ${this._textRow('user_name', 'Your name', _spCfg.user_name || '')}
        </div>

        <!-- APPEARANCE -->
        <div class="space-y-2">
          <div class="font-semibold text-xs uppercase tracking-wider text-slate-500">Appearance</div>
          ${this._colorRow('poem_color',  'Poem color', _spCfg.poem_color)}
          ${this._colorRow('clock_color', 'Clock color', _spCfg.clock_color)}
          ${this._colorRow('bg_color',    'BG color', _spCfg.bg_color)}
          ${this._sliderRow('bg_alpha', 'Opacity', Math.round(_spCfg.bg_alpha * 100), 10, 100)}
          ${this._toggleRow('glow_enabled', 'Neon glow', _spCfg.glow_enabled)}
          ${this._toggleRow('show_face',    'Show face', _spCfg.show_face)}
          ${this._toggleRow('particles',    'Particles', _spCfg.particles)}
        </div>

        <!-- FEATURES -->
        <div class="space-y-2">
          <div class="font-semibold text-xs uppercase tracking-wider text-slate-500">Features</div>
          ${this._toggleRow('mood_auto',    'Auto mood',      _spCfg.mood_auto)}
          ${this._toggleRow('hourly_tips',  'Hourly tips',    _spCfg.hourly_tips)}
          ${this._toggleRow('voice_enabled','Voice enabled',  _spCfg.voice_enabled)}
          ${this._toggleRow('auto_read_poems','Read poems',   _spCfg.auto_read_poems)}
          ${this._toggleRow('easter_eggs',  'Easter eggs',    _spCfg.easter_eggs)}
        </div>

        <!-- POSITION -->
        <div class="space-y-2">
          <div class="font-semibold text-xs uppercase tracking-wider text-slate-500">Position</div>
          <div class="flex justify-between items-center">
            <label>Corner</label>
            <select class="bg-slate-100 dark:bg-slate-800 border-none rounded px-2 py-1 text-sm no-drag" id="s-position">
              ${['bottom-right','bottom-left','top-right','top-left'].map(p =>
                `<option value="${p}" ${_spCfg.position === p ? 'selected' : ''}>${p.replace('-',' ')}</option>`
              ).join('')}
            </select>
          </div>
        </div>

        <!-- ABOUT -->
        <div class="space-y-2">
          <div class="font-semibold text-xs uppercase tracking-wider text-slate-500">About</div>
          <div class="text-xs text-slate-500 leading-relaxed">
            <b class="text-slate-700 dark:text-slate-300">Rhyming Clock v2</b> · Electron<br/>
            Ctrl+click face ×3 → dress-up<br/>
            Chat: <i>dance</i> · <i>fortune</i> · <i>spin</i> · <i>tictactoe</i>
          </div>
        </div>
      </div>
    `;
    this._bindLiveEditing();
  },

  _themePicker() {
    return Object.entries(ThemeEngine.getMeta()).map(([id, meta]) => {
      const active = _spCfg.theme === id ? 'ring-2 ring-primary' : '';
      return `<div class="w-8 h-8 rounded-full cursor-pointer no-drag ${active}" 
                   style="background-color: ${meta.accent}"
                   title="${meta.label}"
                   onclick="SettingsPanel._setTheme('${id}')">
              </div>`;
    }).join('');
  },

  _textRow(key, label, val) {
    return `<div class="flex justify-between items-center">
      <label>${label}</label>
      <input class="bg-slate-100 dark:bg-slate-800 border-none rounded px-2 py-1 text-sm w-32 no-drag" type="text" id="s-${key}" value="${this._esc(val)}"
             oninput="SettingsPanel._patch('${key}', this.value)"/>
    </div>`;
  },

  _colorRow(key, label, val) {
    return `<div class="flex justify-between items-center">
      <label>${label}</label>
      <input type="color" id="s-${key}" value="${val || '#00d68f'}"
             class="w-8 h-8 rounded cursor-pointer border-none p-0 no-drag"
             oninput="SettingsPanel._patch('${key}', this.value)"/>
    </div>`;
  },

  _sliderRow(key, label, val, min, max) {
    return `<div class="flex justify-between items-center">
      <label>${label}</label>
      <input type="range" class="w-32 accent-primary no-drag" min="${min}" max="${max}" value="${val}"
             id="s-${key}" oninput="SettingsPanel._patch('${key}', this.value/100)"/>
    </div>`;
  },

  _toggleRow(key, label, val) {
    return `<div class="flex justify-between items-center">
      <label>${label}</label>
      <label class="relative inline-flex items-center cursor-pointer no-drag">
        <input type="checkbox" id="s-${key}" class="sr-only peer" ${val ? 'checked' : ''}
               onchange="SettingsPanel._patch('${key}', this.checked)"/>
        <div class="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
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
    if (key === 'show_face')   { const fc = document.getElementById('face-container'); if (fc) fc.style.opacity = value ? 1 : 0; return; }
    if (key === 'voice_enabled' || key === 'auto_read_poems') { Voice.update(_spCfg); return; }
    if (key === 'poem_color')  {
      document.documentElement.style.setProperty('--accent', value);
      FaceCanvas.setColor(value);
    }
  },

  getCfg() { return { ..._spCfg }; },
};

window.SettingsPanel = SettingsPanel;
