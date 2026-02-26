/**
 * Voice — Web Speech API wrapper for TTS and STT
 */
'use strict';

const THEME_VOICE_PARAMS = {
  glassmorphism: { pitch: 1.05, rate: 0.95 },
  cyberpunk:     { pitch: 0.80, rate: 1.10 },
  playful:       { pitch: 1.30, rate: 1.00 },
  organic:       { pitch: 1.00, rate: 0.85 },
};

let _voiceEnabled       = false;
let _autoRead      = false;
let _speechSynth   = window.speechSynthesis;
let _recognition   = null;
let _onTranscript  = null;
let _listening     = false;

const Voice = {
  init(cfg) {
    _voiceEnabled  = cfg.voice_enabled  || false;
    _autoRead = cfg.auto_read_poems || false;
    this._setupSpeechRecognition();
  },

  update(cfg) {
    _voiceEnabled  = cfg.voice_enabled  || false;
    _autoRead = cfg.auto_read_poems || false;
  },

  speak(text, theme = 'glassmorphism') {
    if (!_voiceEnabled || !_speechSynth) return;
    _speechSynth.cancel();
    const params = THEME_VOICE_PARAMS[theme] || THEME_VOICE_PARAMS.glassmorphism;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.pitch = params.pitch;
    utterance.rate  = params.rate;
    utterance.lang  = 'en-US';
    // Prefer a pleasant voice if available
    const voices = _speechSynth.getVoices();
    const preferred = voices.find(v => v.name.includes('Google') || v.name.includes('Samantha') || v.default);
    if (preferred) utterance.voice = preferred;
    _speechSynth.speak(utterance);
  },

  stop() {
    if (_speechSynth) _speechSynth.cancel();
  },

  autoReadPoem(text, theme) {
    if (_autoRead) this.speak(text, theme);
  },

  isEnabled() { return _voiceEnabled; },

  startListening(onTranscript) {
    if (!_recognition) {
      console.warn('SpeechRecognition not available');
      return false;
    }
    if (_listening) { this.stopListening(); return false; }
    _onTranscript = onTranscript;
    _listening = true;
    try { _recognition.start(); } catch (e) { _listening = false; return false; }
    return true;
  },

  stopListening() {
    if (_recognition && _listening) { _recognition.stop(); }
    _listening = false;
  },

  isListening() { return _listening; },

  _setupSpeechRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    _recognition = new SR();
    _recognition.continuous    = false;
    _recognition.interimResults = false;
    _recognition.lang          = 'en-US';

    _recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      _listening = false;
      if (_onTranscript) _onTranscript(transcript);
    };
    _recognition.onerror = () => { _listening = false; };
    _recognition.onend   = () => { _listening = false; };
  },
};

window.Voice = Voice;
