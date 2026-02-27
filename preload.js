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
  getPoem:          (payload)   => ipcRenderer.invoke('get-poem', payload),
  getTip:           (payload)   => ipcRenderer.invoke('get-tip', payload),
  getChat:          (payload)   => ipcRenderer.invoke('get-chat', payload),
  getExpression:    (payload)   => ipcRenderer.invoke('get-expression', payload),
  getMoodNow:       ()          => ipcRenderer.invoke('get-mood-now'),

  // Emotion & activity AI calls
  analyzeSentiment: (payload)   => ipcRenderer.invoke('analyze-sentiment', payload),
  getWorkCheckin:   (payload)   => ipcRenderer.invoke('get-work-checkin', payload),
  getPartnerProfile:(payload)   => ipcRenderer.invoke('get-partner-profile', payload),

  // Streaming chat — main sends multiple token events back
  startChatStream: (payload) => ipcRenderer.send('chat-stream-start', payload),
  onChatStart:  (cb) => ipcRenderer.on('chat-stream-start-ack', (_e, d) => cb(d)),
  onChatToken:  (cb) => ipcRenderer.on('chat-stream-token',     (_e, d) => cb(d.token)),
  onChatDone:   (cb) => ipcRenderer.on('chat-stream-done',      (_e)    => cb()),
  onChatError:  (cb) => ipcRenderer.on('chat-stream-error',     (_e, d) => cb(d.error)),
  removeChatStreamListeners: () => {
    ['chat-stream-start-ack', 'chat-stream-token', 'chat-stream-done', 'chat-stream-error']
      .forEach(ch => ipcRenderer.removeAllListeners(ch));
  },

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
