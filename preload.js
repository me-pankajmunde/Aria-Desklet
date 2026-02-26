/**
 * Preload — secure IPC bridge between renderer and main process
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rClock', {
  // Settings
  getSettings:    ()            => ipcRenderer.invoke('get-settings'),
  saveSettings:   (cfg)         => ipcRenderer.invoke('save-settings', cfg),

  // AI calls
  getPoem:        (payload)     => ipcRenderer.invoke('get-poem', payload),
  getTip:         (payload)     => ipcRenderer.invoke('get-tip', payload),
  getChat:        (payload)     => ipcRenderer.invoke('get-chat', payload),
  getExpression:  (payload)     => ipcRenderer.invoke('get-expression', payload),
  getMoodNow:     ()            => ipcRenderer.invoke('get-mood-now'),

  // App control
  quit:           ()            => ipcRenderer.invoke('quit-app'),
  openDevtools:   ()            => ipcRenderer.invoke('open-devtools'),

  // Events from main → renderer
  on: (channel, cb) => {
    const allowed = ['open-chat', 'refresh-poem', 'open-settings', 'cycle-theme'];
    if (allowed.includes(channel)) {
      ipcRenderer.on(channel, (_e, ...args) => cb(...args));
    }
  },
  off: (channel, cb) => ipcRenderer.removeListener(channel, cb),
});
