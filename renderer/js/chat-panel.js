/**
 * Chat Panel — slide-up chat UI with history, quick actions, and typing indicator
 */
'use strict';

let _chatCfg         = {};
let _history     = [];
let _sending     = false;

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

    // Quick action buttons
    document.querySelectorAll('.quick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.input.value = btn.dataset.q;
        this._sendMessage();
      });
    });
  },

  updateCfg(cfg) {
    _chatCfg = cfg;
    const name = cfg.assistant_name || 'Aria';
    if (this.title) this.title.textContent = `💬 Ask ${name}`;
    if (this.input) this.input.placeholder = `Ask ${name} something…`;
  },

  show() {
    if (!this.panel) return;
    this.panel.classList.remove('hidden');
    requestAnimationFrame(() => {
      this.panel.classList.add('visible');
    });
    this.input.focus();
  },

  hide() {
    if (!this.panel) return;
    this.panel.classList.remove('visible');
    setTimeout(() => this.panel.classList.add('hidden'), 320);
  },

  toggle() {
    if (!this.panel) return;
    if (this.panel.classList.contains('hidden') ||
        !this.panel.classList.contains('visible')) {
      this.show();
    } else {
      this.hide();
    }
  },

  _sendMessage() {
    const text = this.input.value.trim();
    if (!text || _sending) return;
    this.input.value = '';
    _sending = true;
    this.send.disabled = true;

    this._addBubble('user', text);
    const thinkBubble = this._addBubble('assistant thinking', null, true);

    // Show AI thinking expression on face
    if (window.FaceCanvas) FaceCanvas.setExpression({ eyebrows: 'raised', mouth: 'o' });

    window.rClock.getChat({ message: text, cfg: _chatCfg }).then(({ reply, mood }) => {
      _sending = false;
      this.send.disabled = false;
      thinkBubble.remove();
      this._addBubble('assistant', reply);

      // Speak the reply if voice enabled
      if (window.Voice?.isEnabled()) {
        const theme = window.ThemeEngine?.current() || 'glassmorphism';
        Voice.speak(reply, theme);
      }
      // Let face react
      if (window.FaceCanvas) {
        const reactions = ['wink', 'smile', 'grin'];
        FaceCanvas.triggerReaction(reactions[Math.floor(Math.random() * reactions.length)]);
      }
    }).catch(() => {
      _sending = false;
      this.send.disabled = false;
      thinkBubble.remove();
      this._addBubble('assistant', "Hmm, I couldn't reach my brain. 😅");
    });
  },

  _addBubble(role, text, isThinking = false) {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${role}${isThinking ? ' thinking' : ''}`;

    if (isThinking) {
      bubble.innerHTML = `<div class="dot-flashing"><span></span><span></span><span></span></div>`;
    } else {
      bubble.textContent = text;
      bubble.style.animation = 'fadeIn 0.2s ease';
      _history.push({ role: role.replace('assistant', 'a').replace('user', 'u'), text });
      if (_history.length > 20) _history.shift();
    }

    this.history.appendChild(bubble);
    this.history.scrollTop = this.history.scrollHeight;
    return bubble;
  },
};

window.ChatPanel = ChatPanel;
