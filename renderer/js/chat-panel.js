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
