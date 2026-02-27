/**
 * Face SVG — animated companion face using SVG and CSS
 */
'use strict';

const MOOD_PATHS = {
  sleepy:  'M20 25 Q 50 20, 90 25 T 180 30',
  happy:   'M20 20 Q 50 15, 90 20 T 180 30',
  focused: 'M20 25 Q 50 25, 90 25 T 180 25',
  relaxed: 'M20 22 Q 50 20, 90 22 T 180 28',
  chill:   'M20 22 Q 50 20, 90 22 T 180 28',
};

let _mood = 'happy';
let _themeColor = '#00FF94';

const FaceCanvas = {
  svg: null,
  mouth: null,
  eyesGroup: null,

  init(containerEl) {
    // We pass the container or just find the SVG elements
    this.svg = document.getElementById('face-svg');
    this.mouth = document.getElementById('face-mouth');
    this.eyesGroup = document.getElementById('eyes-group');
    
    this._bindInteractions();
  },

  setMood(mood) {
    _mood = MOOD_PATHS[mood] ? mood : 'happy';
    if (this.mouth) {
      this.mouth.setAttribute('d', MOOD_PATHS[_mood]);
    }
  },

  setExpression(expr) {
    // Map expressions to SVG changes if needed
    if (expr.mouth === 'o') {
      this.mouth.setAttribute('d', 'M80 25 Q 100 10, 120 25 Q 100 40, 80 25');
    } else if (expr.mouth === 'neutral') {
      this.mouth.setAttribute('d', 'M40 25 L 160 25');
    } else {
      this.setMood(_mood); // reset to mood
    }
  },

  setColor(hex) {
    _themeColor = hex;
    // Could update SVG colors here if needed, but Tailwind handles most of it
  },

  setAccessory(type, val) {
    // Not implemented in SVG yet
  },

  toggleAccessory(type) {
    // Not implemented in SVG yet
  },

  triggerReaction(type) {
    const reactions = {
      'wink':      { mouth: 'grin' },
      'heart':     { mouth: 'grin' },
      'surprised': { mouth: 'o' },
      'tongue':    { mouth: 'tongue' },
      'star':      { mouth: 'grin' },
      'annoyed':   { mouth: 'neutral' },
    };
    
    const r = reactions[type] || reactions['surprised'];
    this.setExpression(r);
    
    setTimeout(() => {
      this.setMood(_mood);
    }, type === 'annoyed' ? 2000 : 900);

    // Bounce effect
    if (this.svg) {
      this.svg.style.transition = 'transform 0.2s ease';
      this.svg.style.transform = 'scale(1.1)';
      setTimeout(() => {
        this.svg.style.transform = 'scale(1)';
      }, 200);
    }
  },

  _bindInteractions() {
    document.addEventListener('mousemove', (e) => {
      if (!this.eyesGroup) return;
      
      const rect = this.svg.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      const dx = e.clientX - centerX;
      const dy = e.clientY - centerY;
      
      // Limit eye movement
      const maxMove = 8;
      const dist = Math.sqrt(dx*dx + dy*dy);
      
      let moveX = 0;
      let moveY = 0;
      
      if (dist > 0) {
        moveX = (dx / dist) * Math.min(maxMove, dist / 10);
        moveY = (dy / dist) * Math.min(maxMove, dist / 10);
      }
      
      // Override the CSS animation temporarily
      this.eyesGroup.style.transform = `translate(${moveX}px, ${moveY}px)`;
      this.eyesGroup.classList.remove('animate-eye-track');
      
      clearTimeout(this._mouseTimeout);
      this._mouseTimeout = setTimeout(() => {
        this.eyesGroup.style.transform = '';
        this.eyesGroup.classList.add('animate-eye-track');
      }, 1000);
    });
  }
};

window.FaceCanvas = FaceCanvas;
