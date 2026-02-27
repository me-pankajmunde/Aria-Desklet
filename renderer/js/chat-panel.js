/**
 * Chat Panel — slide-up chat UI with streaming AI responses shown on Aria's face
 */
'use strict';

let _chatCfg           = {};
let _history           = [];
let _sending           = false;
let _pendingFocusStart = false; // next message becomes a Work Buddy goal

const ChatPanel = {
  panel:   null,
  title:   null,
  history: null,
  input:   null,
  send:    null,

  // ── Init ──────────────────────────────────────────────────────────────────
  init() {
    this.panel   = document.getElementById('chat-panel');
    this.title   = document.getElementById('chat-title');
    this.history = document.getElementById('chat-history');
    this.input   = document.getElementById('chat-input');
    this.send    = document.getElementById('chat-send');

    // Close button
    document.getElementById('chat-close').addEventListener('click', () => this.hide());

    // Send on Enter / button
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._sendMessage(); }
    });
    this.send.addEventListener('click', () => this._sendMessage());

    // Quick action buttons (data-q preset messages)
    document.querySelectorAll('.quick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.input.value = btn.dataset.q;
        this._sendMessage();
      });
    });

    // Work Buddy: Start / End Focus session
    const focusBtn = document.getElementById('btn-start-focus');
    if (focusBtn) {
      focusBtn.addEventListener('click', () => {
        if (window.WorkBuddy && WorkBuddy.active) {
          WorkBuddy.endSession();
          focusBtn.textContent = '🎯 Focus';
          return;
        }
        this.show();
        this.input.value = '';
        this.input.placeholder = "What's your goal? (e.g. Finish the report)";
        _pendingFocusStart = true;
        this.input.focus();
      });
    }

    // Work Buddy: Find My Work Partner
    const partnerBtn = document.getElementById('btn-find-partner');
    if (partnerBtn) {
      partnerBtn.addEventListener('click', () => {
        if (window.WorkBuddy) WorkBuddy.generatePartnerProfile();
        else this.show();
      });
    }
  },

  updateCfg(cfg) {
    _chatCfg = cfg;
    const name = cfg.assistant_name || 'Aria';
    if (this.title) this.title.textContent = `💬 Ask ${name}`;
    if (this.input) this.input.placeholder = `Ask ${name} something…`;
  },

  show() {
    if (!this.panel) return;
    this.panel.classList.remove('translate-y-full');
    this.panel.classList.add('translate-y-0');
    this.input.focus();
  },

  hide() {
    if (!this.panel) return;
    this.panel.classList.remove('translate-y-0');
    this.panel.classList.add('translate-y-full');
  },

  toggle() {
    if (!this.panel) return;
    if (this.panel.classList.contains('translate-y-full')) this.show();
    else this.hide();
  },

  // ── Send message (streaming) ──────────────────────────────────────────────
  _sendMessage() {
    const text = this.input.value.trim();
    if (!text || _sending) return;
    this.input.value = '';

    // ── Focus session goal intercept ────────────────────────────────────────
    if (_pendingFocusStart) {
      _pendingFocusStart = false;
      this.input.placeholder = `Ask ${(_chatCfg.assistant_name || 'Aria')} something…`;
      this._addBubble('user', text);
      if (window.WorkBuddy) WorkBuddy.startSession(text);
      const focusBtn = document.getElementById('btn-start-focus');
      if (focusBtn) focusBtn.textContent = '⏹ End Focus';
      this._addBubble('assistant', "Session started! I'll check in every 20 minutes. Go get 'em! 🎯");
      return;
    }

    // ── Normal chat — stream response ───────────────────────────────────────
    _sending = true;
    this.send.disabled = true;

    this._addBubble('user', text);
    const thinkBubble = this._addBubble('assistant thinking', null, true);
    if (window.FaceCanvas) FaceCanvas.setExpression({ eyebrows: 'raised', mouth: 'o' });

    let fullReply   = '';
    let streamEntry = null; // { wrapper, bubble }
    let streamStarted = false;

    // Clean up any leftover listeners from a previous interrupted stream
    window.rClock.removeChatStreamListeners();

    // ── Stream start acknowledged ──
    window.rClock.onChatStart((data) => {
      streamStarted = true;
      thinkBubble.remove();
      streamEntry = this._addStreamBubble();
      this._showSpeakZone();
      // Show streaming cursor
      const cursor = document.getElementById('aria-speech-cursor');
      if (cursor) cursor.style.opacity = '1';
    });

    // ── Token received ──
    window.rClock.onChatToken((token) => {
      fullReply += token;
      if (streamEntry) this._updateStreamBubble(streamEntry, fullReply);
      this._updateSpeakZone(fullReply);
    });

    // ── Stream complete ──
    window.rClock.onChatDone(() => {
      _sending = false;
      this.send.disabled = false;
      window.rClock.removeChatStreamListeners();

      // Hide streaming cursor
      const cursor = document.getElementById('aria-speech-cursor');
      if (cursor) cursor.style.opacity = '0';

      // Commit reply to history (skip re-push if nothing came through)
      if (fullReply) {
        _history.push({ role: 'a', text: fullReply });
        if (_history.length > 20) _history.shift();
      }

      // Voice read
      if (window.Voice?.isEnabled()) {
        Voice.speak(fullReply, window.ThemeEngine?.current() || 'glassmorphism');
      }

      // Activity tracking
      if (window.ActivityTracker) ActivityTracker.recordMessage();

      // Schedule hiding the speak zone after 4 s
      this._scheduleHideSpeakZone();

      // AI-driven sentiment expression (async, non-blocking)
      const recentMessages = _history.slice(-4);
      if (recentMessages.length >= 2 && window.rClock.analyzeSentiment) {
        window.rClock.analyzeSentiment({ recentMessages, cfg: _chatCfg })
          .then(result => {
            if (!result) return;
            if (window.FaceCanvas) {
              FaceCanvas.setEmotion(result.emotion, result.intensity);
              if (result.expressionOverride) FaceCanvas.setExpression(result.expressionOverride);
            }
          })
          .catch(() => {
            if (window.FaceCanvas) {
              FaceCanvas.triggerReaction(['wink', 'star', 'tongue'][Math.floor(Math.random() * 3)]);
            }
          });
      } else {
        if (window.FaceCanvas) {
          FaceCanvas.triggerReaction(['wink', 'star', 'grin'][Math.floor(Math.random() * 3)]);
        }
      }
    });

    // ── Stream error — fall back to non-streaming ──
    window.rClock.onChatError((error) => {
      window.rClock.removeChatStreamListeners();
      const cursor = document.getElementById('aria-speech-cursor');
      if (cursor) cursor.style.opacity = '0';
      this._hideSpeakZone();

      // Remove any partial stream bubble
      if (streamEntry) { streamEntry.wrapper.remove(); streamEntry = null; }
      if (!streamStarted) thinkBubble.remove();

      // Try non-streaming fallback
      window.rClock.getChat({ message: text, cfg: _chatCfg })
        .then(({ reply }) => {
          _sending = false;
          this.send.disabled = false;
          this._addBubble('assistant', reply);
          if (window.FaceCanvas) FaceCanvas.triggerReaction('wink');
        })
        .catch(() => {
          _sending = false;
          this.send.disabled = false;
          this._addBubble('assistant', "Hmm, I couldn't reach my brain. 😅");
          if (window.FaceCanvas) FaceCanvas.triggerReaction('surprised');
        });
    });

    // Fire the stream request
    window.rClock.startChatStream({ message: text, cfg: _chatCfg });
  },

  // ── Bubble helpers ────────────────────────────────────────────────────────
  _addBubble(role, text, isThinking = false) {
    const bubble = document.createElement('div');
    const base   = 'max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-sm';
    const user   = 'bg-primary text-black self-end rounded-br-sm';
    const ai     = 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 self-start rounded-bl-sm';

    bubble.className = `${base} ${role === 'user' ? user : ai}`;

    if (isThinking) {
      bubble.innerHTML = `<div class="flex space-x-1 items-center h-5">
        <div class="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></div>
        <div class="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style="animation-delay:0.1s"></div>
        <div class="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style="animation-delay:0.2s"></div>
      </div>`;
    } else {
      bubble.textContent = text;
      if (role !== 'user') {
        _history.push({ role: role.replace('assistant', 'a'), text });
        if (_history.length > 20) _history.shift();
      }

      // Short non-stream assistant replies also show in speech bubble
      if (role === 'assistant' && text.length < 60) {
        const sb = document.getElementById('speech-bubble');
        const st = document.getElementById('speech-text');
        if (sb && st) {
          st.textContent = text;
          sb.classList.remove('opacity-0');
          sb.classList.add('opacity-100');
          clearTimeout(this._speechTimeout);
          this._speechTimeout = setTimeout(() => {
            sb.classList.remove('opacity-100');
            sb.classList.add('opacity-0');
          }, 4000);
        }
      }
    }

    const wrapper = document.createElement('div');
    wrapper.className = `flex w-full ${role === 'user' ? 'justify-end' : 'justify-start'}`;
    wrapper.appendChild(bubble);
    this.history.appendChild(wrapper);
    this.history.scrollTop = this.history.scrollHeight;
    return wrapper;
  },

  // Returns { wrapper, bubble } for a streaming response bubble
  _addStreamBubble() {
    const bubble = document.createElement('div');
    bubble.className = 'max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-sm bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 self-start rounded-bl-sm min-h-[2rem]';

    const wrapper = document.createElement('div');
    wrapper.className = 'flex w-full justify-start';
    wrapper.appendChild(bubble);
    this.history.appendChild(wrapper);
    this.history.scrollTop = this.history.scrollHeight;
    return { wrapper, bubble };
  },

  _updateStreamBubble({ bubble }, text) {
    bubble.textContent = text;
    this.history.scrollTop = this.history.scrollHeight;
  },

  // ── Aria Speak Zone (slides down from top of window) ──────────────────────
  _showSpeakZone() {
    const zone   = document.getElementById('aria-speech-zone');
    const textEl = document.getElementById('aria-speech-text');
    if (!zone) return;
    if (textEl) textEl.textContent = '';
    zone.classList.remove('-translate-y-full');
    zone.classList.add('translate-y-0');
    clearTimeout(this._speakZoneTimer);
  },

  _updateSpeakZone(text) {
    const textEl = document.getElementById('aria-speech-text');
    if (textEl) textEl.textContent = text;
  },

  _hideSpeakZone() {
    const zone = document.getElementById('aria-speech-zone');
    if (!zone) return;
    zone.classList.remove('translate-y-0');
    zone.classList.add('-translate-y-full');
  },

  _scheduleHideSpeakZone(ms = 4000) {
    clearTimeout(this._speakZoneTimer);
    this._speakZoneTimer = setTimeout(() => this._hideSpeakZone(), ms);
  },
};

window.ChatPanel = ChatPanel;
