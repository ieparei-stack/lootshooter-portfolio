import { config } from '../config.js';
import { RANGE, floorLine, floorText } from './range.js';
import { PLATFORM } from './arena.js';

// 트리거 존 + 웨이브 (T23). 웨이브 구성은 코드에 둔다 (무기만 파일 — SPEC 3-1).
//   armed     : 대기. 플레이어가 config.wave.triggerZ보다 안쪽(−Z)으로 들어서면 발동
//   countdown : timer가 0이 되면 다음 웨이브 스폰. 첫 웨이브 firstDelay, 이후 betweenDelay
//   wave      : 살아있는 몬스터가 0이 되면 → 마지막 웨이브면 clear, 아니면 countdown
//   clear     : 끝. 더 이상 스폰하지 않는다. reset()으로 armed로 되돌린다 (몬스터 전부 제거)
//   hold      : 플레이어 사망 중 (T24). 몬스터 전부 제거, 진행 정지. 부활 시 restartCurrent() → 같은 웨이브를 countdown부터
// 사용자 결정(2026-09-04): 3웨이브 근접2 → 원거리2 → 근접2+원거리2, 웨이브 간 5초 카운트다운.
// T25: 발동은 백스톱 문을 지나 구역(arena.js)에 들어설 때. 근접형은 바닥 끝, 원거리형은 몬스터 단 위(platform) 등장. 좌표는 Claude 임시.
const onPlatform = { floorY: PLATFORM.height, bounds: PLATFORM.bounds };
export const WAVES = [
  [{ kind: 'melee', x: -5, z: -78 }, { kind: 'melee', x: 5, z: -78 }],
  [{ kind: 'ranged', x: -4, z: -82, ...onPlatform }, { kind: 'ranged', x: 4, z: -82, ...onPlatform }],
  [{ kind: 'melee', x: -6, z: -78 }, { kind: 'melee', x: 6, z: -78 },
   { kind: 'ranged', x: -3, z: -82, ...onPlatform }, { kind: 'ranged', x: 3, z: -82, ...onPlatform }],
];

const COLOR = { zone: 0xff4040 };

// 트리거 표시. 빨간 띠는 문 안쪽(문 폭), 글자는 사격장 쪽 문 앞에 두어 다가가며 읽힌다.
function buildZoneMarks(scene, triggerZ) {
  if (!scene) return;
  floorLine(scene, triggerZ - 0.4, RANGE.doorHalf * 2, 0.5, { color: COLOR.zone, transparent: true, opacity: 0.65 });
  floorText(scene, '전투 구역 ▼', 0, RANGE.zFar + 2, 4);
}

function createHud() {
  if (typeof document === 'undefined') return null;
  const el = document.createElement('div');
  el.id = 'waveHud';
  el.style.cssText = [
    'position:fixed', 'top:12px', 'left:50%', 'transform:translateX(-50%)', 'z-index:10',
    'padding:8px 16px', 'background:rgba(0,0,0,0.55)', 'color:#eee',
    'font:700 18px/1.3 system-ui, sans-serif', 'border-radius:6px', 'user-select:none',
    'white-space:nowrap', 'font-variant-numeric:tabular-nums',
  ].join(';');
  el.hidden = true;
  document.body.appendChild(el);
  return el;
}

export function createWaveZone(scene, { player, monsters, waves = WAVES } = {}) {
  const W = config.wave;
  const state = { phase: 'armed', index: -1, timer: 0, alive: 0 };   // index = 현재(또는 다음에 뜰) 웨이브 번호 0~
  const hud = createHud();
  buildZoneMarks(scene, W.triggerZ);

  function spawnWave(i) {
    for (const d of waves[i]) monsters.spawn(d.kind, d.x, d.z, d);
    state.alive = monsters.aliveCount();   // 스폰 프레임의 HUD가 0으로 찍히지 않게
  }

  function setPhase(phase, timer = 0) { state.phase = phase; state.timer = timer; }

  function update(dt) {
    if (state.phase === 'armed') {
      if (player.state.z < W.triggerZ) { state.index = 0; setPhase('countdown', W.firstDelay); }
    } else if (state.phase === 'countdown') {
      state.timer -= dt;
      if (state.timer <= 0) { spawnWave(state.index); setPhase('wave'); }
    } else if (state.phase === 'wave') {
      state.alive = monsters.aliveCount();
      if (state.alive === 0) {
        if (state.index >= waves.length - 1) setPhase('clear');
        else { state.index++; setPhase('countdown', W.betweenDelay); }
      }
    }
    draw();
  }

  let lastText = null;
  function draw() {
    if (!hud) return;
    const n = waves.length;
    let text = null;
    if (state.phase === 'countdown') text = `웨이브 ${state.index + 1}/${n} — ${Math.max(0, state.timer).toFixed(1)}초 후 등장`;
    else if (state.phase === 'wave') text = `웨이브 ${state.index + 1}/${n} · 남은 몬스터 ${state.alive}`;
    else if (state.phase === 'clear') text = `구역 클리어 — 웨이브 ${n}/${n} 완료`;
    if (text === lastText) return;
    lastText = text;
    hud.hidden = text === null;
    if (text !== null) hud.textContent = text;
  }

  // T24: 사망 → 현재 웨이브 몬스터 전부 제거하고 멈춘다. 교전 중이 아니면 무시 (몬스터가 없으니 죽을 일도 없다)
  function holdForRespawn() {
    if (state.phase !== 'wave') return false;
    monsters.reset([]);
    state.alive = 0;
    setPhase('hold');
    draw();
    return true;
  }
  // T24: 부활 → 같은 웨이브를 betweenDelay 카운트다운 뒤 다시 스폰
  function restartCurrent() {
    if (state.phase !== 'hold') return false;
    setPhase('countdown', W.betweenDelay);
    draw();
    return true;
  }

  // 몬스터 전부 제거 + 대기 상태로. 플레이어가 25m 선 안쪽에 서 있으면 다음 프레임에 바로 다시 발동한다.
  function reset() {
    monsters.reset([]);
    state.index = -1; state.alive = 0;
    setPhase('armed');
    draw();
  }

  return { state, update, reset, holdForRespawn, restartCurrent, waves };
}
