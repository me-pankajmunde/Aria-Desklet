/**
 * Chat Panel — slide-up chat UI with history, quick actions, and typing indicator
 */
'use strict';

let _chatCfg          = {};
let _history          = [];
let _sending          = false;
let _pendingFocusStart = false; // when true, next message becomes a Work Buddy goal

const ChatPanel = {
  panel:   null,
  title:   null,
  history: null,
  input:   null,
  send:    null,

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
          // End the current session
          WorkBuddy.endSession();
          focusBtn.textContent = '🎯 Focus';
          return;
        }
        // Prompt user for a goal via the chat input
        this.show();
        this.input.value = '';
        this.input.placeholder = 'What\'s your goal? (e.g. Finish the report)';
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
    if (this.panel.classList.contains('translate-y-full')) {
      this.show();
    } else {
      this.hide();
    }
  },

  _sendMessage() {
    const text = this.input.value.trim();
    if (!text || _sending) return;
    this.input.value = '';

    // ── Focus session goal intercept ────────────────────────────────────────
    if (_pendingFocusStart) {
      _pendingFocusStart = false;
      // Reset placeholder
      this.input.placeholder = `Ask ${(_chatCfg.assistant_name || 'Aria')} something…`;
      this._addBubble('user', text);
      const goal = text;
      if (window.WorkBuddy) WorkBuddy.startSession(goal);
      // Update Focus button label
      const focusBtn = document.getElementById('btn-start-focus');
      if (focusBtn) focusBtn.textContent = '⏹ End Focus';
      this._addBubble('assistant',
        `Session started! I'll check in every 20 minutes. Go get 'em! 🎯`);
      return;
    }

    // ── Normal chat message ─────────────────────────────────────────────────
    _sending = true;
    this.send.disabled = true;

    this._addBubble('user', text);
    const thinkBubble = this._addBubble('assistant thinking', null, true);

    // Show AI "thinking" expression on face
    if (window.FaceCanvas) FaceCanvas.setExpression({ eyebrows: 'raised', mouth: 'o' });

    window.rClock.getChat({ message: text, cfg: _chatCfg }).then(({ reply, mood }) => {
      _sending = false;
      this.send.disabled = false;
      thinkBubble.remove();
      this._addBubble('assistant', reply);

      // Record message for activity tracking
      if (window.ActivityTracker) ActivityTracker.recordMessage();

      // Speak the reply if voice enabled
      if (window.Voice?.isEnabled()) {
        const theme = window.ThemeEngine?.current() || 'glassmorphism';
        Voice.speak(reply, theme);
      }

      // ── AI-driven sentiment expression ─────────────────────────────────
      const recentMessages = _history.slice(-4);
      if (recentMessages.length >= 2 && window.rClock.analyzeSentiment) {
        window.rClock.analyzeSentiment({ recentMessages, cfg: _chatCfg })
          .then(result => {
            if (!result) return;
            if (window.FaceCanvas) {
              FaceCanvas.setEmotion(result.emotion, result.intensity);
              if (result.expressionOverride) {
                FaceCanvas.setExpression(result.expressionOverride);
              }
            }
          })
          .catch(() => {
            // Fall back to a random cheerful reaction
            if (window.FaceCanvas) {
              FaceCanvas.triggerReaction(
                ['wink', 'star', 'tongue'][Math.floor(Math.random() * 3)]
              );
            }
          });
      } else {
        // Not enough history yet — use a random reaction
        if (window.FaceCanvas) {
          FaceCanvas.triggerReaction(
            ['wink', 'star', 'grin'][Math.floor(Math.random() * 3)]
          );
        }
      }
    }).catch(() => {
      _sending = false;
      this.send.disabled = false;
      thinkBubble.remove();
      this._addBubble('assistant', "Hmm, I couldn't reach my brain. 😅");
      if (window.FaceCanvas) FaceCanvas.triggerReaction('surprised');
    });
  },

  _addBubble(role, text, isThinking = false) {
    const bubble = document.createElement('div');
    
    // Tailwind styling for bubbles
    const baseClasses = "max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-sm";
    const userClasses = "bg-primary text-black self-end rounded-br-sm";
    const aiClasses = "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 self-start rounded-bl-sm";
    
    bubble.className = `${baseClasses} ${role === 'user' ? userClasses : aiClasses}`;

    if (isThinking) {
      bubble.innerHTML = `<div class="flex space-x-1 items-center h-5">
        <div class="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></div>
        <div class="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style="animation-delay: 0.1s"></div>
        <div class="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
      </div>`;
    } else {
      bubble.textContent = text;
      _history.push({ role: role.replace('assistant', 'a').replace('user', 'u'), text });
      if (_history.length > 20) _history.shift();
      
      // Also show short replies in the speech bubble
      if (role === 'assistant' && text.length < 50) {
        const speechBubble = document.getElementById('speech-bubble');
        const speechText = document.getElementById('speech-text');
        if (speechBubble && speechText) {
          speechText.textContent = text;
          speechBubble.classList.remove('opacity-0');
          speechBubble.classList.add('opacity-100');
          
          clearTimeout(this._speechTimeout);
          this._speechTimeout = setTimeout(() => {
            speechBubble.classList.remove('opacity-100');
            speechBubble.classList.add('opacity-0');
          }, 4000);
        }
      }
    }

    // Wrap in a flex container to align left/right
    const wrapper = document.createElement('div');
    wrapper.className = `flex w-full ${role === 'user' ? 'justify-end' : 'justify-start'}`;
    wrapper.appendChild(bubble);

    this.history.appendChild(wrapper);
    this.history.scrollTop = this.history.scrollHeight;
    return wrapper;
  },
};

window.ChatPanel = ChatPanel;
