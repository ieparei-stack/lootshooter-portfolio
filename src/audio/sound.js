import { on } from '../core/events.js';

// 합성 사운드 (T29, 임시 — 음원 파일 없이 Web Audio로 만든다. 단일 HTML 제약). 나중에 파일로 교체 가능.
// AudioContext는 첫 사용자 제스처(클릭·키)에서 만들고 resume 한다 — 그 전에는 무음.
// 소리 정의는 SOUNDS 표 하나에 모았다. 값은 Claude 임시 — 듣고 조정.
//   재생 카운터(state.played)는 검증용: 이 창(Claude)에서는 소리를 못 들으므로 이벤트 → 재생 함수 호출만 확인한다.
export const AUDIO_KEY = 'audio.v1';

// 무기별 발사음: 노이즈 밴드 중심 주파수·길이 + 저음 사인
const FIRE = {
  cs:   { noiseHz: 2500, noiseQ: 1.2, dur: 0.06, tone: 180, toneDur: 0.05, gain: 0.5 },   // 단단
  pubg: { noiseHz: 1200, noiseQ: 0.9, dur: 0.11, tone: 90,  toneDur: 0.09, gain: 0.6 },   // 무거움
  d2:   { noiseHz: 3500, noiseQ: 1.5, dur: 0.045, tone: 300, toneDur: 0.04, gain: 0.4 },  // 가벼움
};

export function createSound({ onLoad = true } = {}) {
  const state = { ctx: null, master: null, volume: 0.6, muted: false, played: {}, ready: false };
  try { Object.assign(state, pick(JSON.parse(localStorage.getItem(AUDIO_KEY) || '{}'))); } catch { /* 없음 */ }
  function pick(o) { const r = {}; if (typeof o.volume === 'number') r.volume = Math.min(1, Math.max(0, o.volume)); if (typeof o.muted === 'boolean') r.muted = o.muted; return r; }
  function save() { try { localStorage.setItem(AUDIO_KEY, JSON.stringify({ volume: state.volume, muted: state.muted })); } catch { /* 저장 불가 */ } }

  let noiseBuf = null;
  function ensure() {
    if (state.ctx) { if (state.ctx.state === 'suspended') state.ctx.resume(); return true; }
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return false;
    state.ctx = new AC();
    state.master = state.ctx.createGain();
    state.master.connect(state.ctx.destination);
    applyGain();
    // 1초 백색 노이즈 (재사용)
    const n = state.ctx.sampleRate;
    noiseBuf = state.ctx.createBuffer(1, n, n);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    state.ready = true;
    return true;
  }
  function applyGain() { if (state.master) state.master.gain.value = state.muted ? 0 : state.volume; }

  // ---- 합성 도구 ----
  // 노이즈 버스트: 밴드패스 hz/q, 길이 dur(s), 지수 감쇠. sweepTo가 있으면 중심 주파수 스윕
  function noise({ hz = 1000, q = 1, dur = 0.1, gain = 0.5, sweepTo = null, delay = 0 }) {
    const c = state.ctx, t = c.currentTime + delay;
    const src = c.createBufferSource(); src.buffer = noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(hz, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(state.master);
    src.start(t); src.stop(t + dur + 0.02);
  }
  // 오실레이터: type, hz, 길이, 감쇠. sweepTo 스윕
  function tone({ type = 'sine', hz = 440, dur = 0.1, gain = 0.3, sweepTo = null, delay = 0 }) {
    const c = state.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(hz, t);
    if (sweepTo) o.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(state.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // ---- 소리 정의 ----
  let lastFireAt = -1;
  const SOUNDS = {
    fire: (d) => { const c = state.ctx.currentTime; if (c - lastFireAt < 0.012) return; lastFireAt = c;   // T32: 고RPM에서 12ms 안 겹치는 발사음은 건너뜀
      const p = FIRE[d && d.weapon && d.weapon.id] || FIRE.cs; noise({ hz: p.noiseHz, q: p.noiseQ, dur: p.dur, gain: p.gain }); tone({ hz: p.tone, dur: p.toneDur, gain: 0.35 }); },
    hit: (d) => { if (d && d.part === 'head') { tone({ hz: 1800, sweepTo: 2400, dur: 0.045, gain: 0.25 }); } else tone({ hz: 1200, dur: 0.03, gain: 0.2 }); },
    empty: () => noise({ hz: 5000, q: 2, dur: 0.025, gain: 0.3 }),
    reloadStart: () => noise({ hz: 1500, q: 3, dur: 0.04, gain: 0.35 }),
    reloadEnd: () => { noise({ hz: 2500, q: 3, dur: 0.04, gain: 0.35 }); noise({ hz: 3000, q: 3, dur: 0.04, gain: 0.3, delay: 0.07 }); },
    playerHit: () => { noise({ hz: 200, q: 0.8, dur: 0.15, gain: 0.5 }); tone({ hz: 80, dur: 0.15, gain: 0.3 }); },
    playerDeath: () => tone({ hz: 300, sweepTo: 60, dur: 0.6, gain: 0.4 }),
    playerRespawn: () => tone({ hz: 200, sweepTo: 800, dur: 0.25, gain: 0.3 }),
    waveSpawn: () => { tone({ type: 'triangle', hz: 660, dur: 0.12, gain: 0.3 }); tone({ type: 'triangle', hz: 660, dur: 0.12, gain: 0.3, delay: 0.18 }); },
    zoneClear: () => [523, 659, 784].forEach((hz, i) => tone({ type: 'triangle', hz, dur: 0.18, gain: 0.3, delay: i * 0.13 })),
    door: () => noise({ hz: 300, q: 0.7, dur: 0.4, gain: 0.35, sweepTo: 120 }),
    bossSpawn: () => { tone({ hz: 55, dur: 1.0, gain: 0.5 }); noise({ hz: 150, q: 0.5, dur: 1.0, gain: 0.3 }); },
    meleeWindup: (d) => noise({ hz: 800, sweepTo: 200, q: 1, dur: 0.12, gain: distGain(d, 0.35) }),
    rangedFire: (d) => tone({ hz: 2000, dur: 0.05, gain: distGain(d, 0.25) }),
    weaponSwitch: () => { noise({ hz: 2000, q: 3, dur: 0.03, gain: 0.3 }); noise({ hz: 2600, q: 3, dur: 0.03, gain: 0.3, delay: 0.06 }); },
  };
  // 거리 감쇠: 0m = g, 25m = g×0.3
  function distGain(d, g) { const dist = d && typeof d.dist === 'number' ? d.dist : 0; return g * Math.max(0.15, 1 - 0.7 * Math.min(1, dist / 25)); }

  function play(name, data) {
    state.played[name] = (state.played[name] || 0) + 1;
    if (state.muted || !state.ready) return;
    const fn = SOUNDS[name];
    if (fn) fn(data);
  }

  // 이벤트 구독 — 게임 모듈의 emit을 그대로 소리로
  for (const name of Object.keys(SOUNDS)) on(name, (data) => play(name, data));

  // 첫 제스처에서 켜기
  if (onLoad && typeof document !== 'undefined') {
    const wake = () => { ensure(); };
    document.addEventListener('click', wake);
    document.addEventListener('keydown', wake);
  }

  function setVolume(v) { state.volume = Math.min(1, Math.max(0, v)); applyGain(); save(); }
  function setMuted(m) { state.muted = !!m; applyGain(); save(); }

  return { state, play, ensure, setVolume, setMuted, SOUNDS };
}
