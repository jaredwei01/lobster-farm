let ctx = null;
let muted = localStorage.getItem('lobster_sfx_muted') === '1';
let initialized = false;

function ensureCtx() {
  if (ctx) return ctx;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    initialized = true;
  } catch (_) { /* Web Audio not supported */ }
  return ctx;
}

function setMuted(v) {
  muted = !!v;
  localStorage.setItem('lobster_sfx_muted', muted ? '1' : '0');
}

function isMuted() { return muted; }

function play(name) {
  if (muted) return;
  const ac = ensureCtx();
  if (!ac) return;
  if (ac.state === 'suspended') ac.resume();
  const fn = SOUNDS[name];
  if (fn) fn(ac);
}

function noise(ac, duration) {
  const len = ac.sampleRate * duration;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  return src;
}

function tone(ac, freq, type, startTime, duration, volume = 0.15) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  gain.gain.setValueAtTime(volume, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

const SOUNDS = {
  feed(ac) {
    const t = ac.currentTime;
    tone(ac, 180, 'square', t, 0.08, 0.12);
    tone(ac, 120, 'square', t + 0.06, 0.1, 0.1);
    tone(ac, 260, 'sine', t + 0.12, 0.15, 0.08);
  },

  pet(ac) {
    const t = ac.currentTime;
    const src = noise(ac, 0.25);
    const filter = ac.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(400, t);
    filter.frequency.linearRampToValueAtTime(800, t + 0.12);
    filter.frequency.linearRampToValueAtTime(400, t + 0.25);
    filter.Q.value = 2;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.linearRampToValueAtTime(0.15, t + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ac.destination);
    src.start(t);
    src.stop(t + 0.25);
  },

  harvest(ac) {
    const t = ac.currentTime;
    tone(ac, 880, 'sine', t, 0.12, 0.12);
    tone(ac, 1100, 'sine', t + 0.06, 0.15, 0.1);
    tone(ac, 1320, 'sine', t + 0.12, 0.2, 0.08);
  },

  levelUp(ac) {
    const t = ac.currentTime;
    tone(ac, 523, 'sine', t, 0.18, 0.14);
    tone(ac, 659, 'sine', t + 0.12, 0.18, 0.14);
    tone(ac, 784, 'sine', t + 0.24, 0.18, 0.14);
    tone(ac, 1047, 'sine', t + 0.36, 0.35, 0.16);
  },

  buy(ac) {
    const t = ac.currentTime;
    tone(ac, 1800, 'sine', t, 0.06, 0.08);
    tone(ac, 2400, 'sine', t + 0.05, 0.08, 0.06);
    tone(ac, 3200, 'sine', t + 0.1, 0.1, 0.04);
  },

  combat_win(ac) {
    const t = ac.currentTime;
    tone(ac, 392, 'square', t, 0.12, 0.1);
    tone(ac, 523, 'square', t + 0.1, 0.12, 0.1);
    tone(ac, 659, 'square', t + 0.2, 0.12, 0.1);
    tone(ac, 784, 'sine', t + 0.3, 0.3, 0.14);
  },

  combat_loss(ac) {
    const t = ac.currentTime;
    tone(ac, 440, 'sine', t, 0.2, 0.1);
    tone(ac, 370, 'sine', t + 0.15, 0.2, 0.1);
    tone(ac, 311, 'sine', t + 0.3, 0.35, 0.12);
  },

  click(ac) {
    const t = ac.currentTime;
    tone(ac, 1200, 'sine', t, 0.04, 0.06);
  },
};

export const SFX = { play, setMuted, isMuted, ensureCtx };
