/**
 * Preload — secure IPC bridge between renderer and main process
 */
'use strict';

const { contextBridge, ipcRenderer, desktopCapturer } = require('electron');

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

  // Project Tracker — project/task time tracking with optional screenshots
  ptLoadData:        ()         => ipcRenderer.invoke('pt-load-data'),
  ptSaveData:        (data)     => ipcRenderer.invoke('pt-save-data', data),
  ptSaveScreenshot:  (payload)  => ipcRenderer.invoke('pt-save-screenshot', payload),
  ptLoadScreenshot:  (filePath) => ipcRenderer.invoke('pt-load-screenshot', filePath),
  ptPruneScreenshots:(paths)    => ipcRenderer.invoke('pt-prune-screenshots', paths),

  // Capture the primary display thumbnail for activity tracking.
  // Returns a JPEG dataURL, or null if the API is unavailable / permission denied.
  ptCaptureScreen: async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 640, height: 360 },
      });
      if (sources && sources.length > 0) {
        return sources[0].thumbnail.toDataURL('image/jpeg');
      }
      return null;
    } catch (e) {
      console.warn('[rClock] ptCaptureScreen failed:', e.message);
      return null;
    }
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
