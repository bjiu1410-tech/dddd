// 음원 파일 없이 Web Audio 로 효과음을 합성한다.
let ctx = null;

export function unlockAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!ctx) ctx = new AC();
  if (ctx.state === 'suspended') ctx.resume();
}

function tone({ freq = 440, to = freq, dur = 0.2, type = 'sine', vol = 0.2, delay = 0 }) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise({ dur = 0.3, from = 2000, to = 300, vol = 0.3 }) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(t);
}

export const sfx = {
  ready: () => { tone({ freq: 660, to: 990, dur: 0.15, vol: 0.12 }); },
  cast: (power = 1) => {
    noise({ dur: 0.35 + power * 0.2, from: 400, to: 4000, vol: 0.25 });
    tone({ freq: 300, to: 1200 * power, dur: 0.3, type: 'triangle', vol: 0.15 });
  },
  fizzle: () => { tone({ freq: 400, to: 120, dur: 0.4, type: 'sawtooth', vol: 0.08 }); },
  hit: () => {
    noise({ dur: 0.25, from: 1200, to: 100, vol: 0.4 });
    tone({ freq: 120, to: 40, dur: 0.3, type: 'square', vol: 0.15 });
  },
  shield: () => {
    tone({ freq: 880, to: 1760, dur: 0.4, vol: 0.12 });
    tone({ freq: 1320, to: 2640, dur: 0.4, vol: 0.08, delay: 0.05 });
  },
  heal: () => {
    [523, 659, 784].forEach((f, i) => tone({ freq: f, dur: 0.3, vol: 0.1, delay: i * 0.08 }));
  },
  enemyCharge: () => { tone({ freq: 110, to: 220, dur: 0.6, type: 'sawtooth', vol: 0.06 }); },
  win: () => { [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.35, vol: 0.12, delay: i * 0.12 })); },
  lose: () => { [392, 330, 262, 196].forEach((f, i) => tone({ freq: f, dur: 0.45, type: 'triangle', vol: 0.12, delay: i * 0.18 })); },
};

export function vibrate(pattern) {
  try { navigator.vibrate?.(pattern); } catch { /* 지원 안 함 */ }
}
