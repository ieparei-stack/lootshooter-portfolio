import { config } from '../config.js';
import { RANGE, floorLine } from './range.js';

// 방 단위 웨이브 존 (T23 → T26 방마다 하나). 웨이브 구성은 코드에 둔다 (무기만 파일 — SPEC 3-1).
//   armed     : 대기. 플레이어가 이 방 안(triggerZ ~ endZ)에 들어서면 발동 (문이 닫혀 있어 앞 방 클리어 전엔 못 들어온다.
//               방 범위로 판정해야 M 리셋을 방 3에서 눌러도 앞 방 존들이 한꺼번에 발동하지 않는다)
//   countdown : timer가 0이 되면 다음 웨이브 스폰. 첫 웨이브 firstDelay, 이후 betweenDelay
//   wave      : 살아있는 몬스터가 0이 되면 → 마지막이면 clear(+onClear → 문 열림), 아니면 countdown
//   clear     : 끝. 더 이상 스폰하지 않는다
//   hold      : 플레이어 사망 중 (T24). 몬스터 전부 제거, 진행 정지. 부활 시 restartCurrent() → 같은 웨이브를 countdown부터
// 사용자 결정(2026-09-04): 3웨이브 근접2 → 원거리2 → 근접2+원거리2, 웨이브 간 5초 카운트다운. 구역 2는 종류당 +1, 구역 3은 +2 (T26).
// 근접형은 단 앞 바닥, 원거리형·보스는 단 위(floorY/bounds). HUD는 stage.js가 hudText()를 모아 하나로 그린다.

const COLOR = { zone: 0xff4040 };

// 방 웨이브 3개 생성. extra = 종류당 추가 마릿수. 좌표는 방 안에서 균등 배치 (Claude 임시)
export function makeWaves(room, extra = 0) {
  const p = room.platform;
  const onPlatform = { floorY: p.height, bounds: p.bounds };
  const spread = (n, lo, hi) => Array.from({ length: n }, (_, i) => (n === 1 ? (lo + hi) / 2 : lo + (hi - lo) * i / (n - 1)));
  const melee = (n) => spread(n, -6, 6).map((x) => ({ kind: 'melee', x, z: room.floorZ }));
  const ranged = (n) => spread(n, p.minX + 1.5, p.maxX - 1.5).map((x) => ({ kind: 'ranged', x, z: p.minZ + 2, ...onPlatform }));
  const n = 2 + extra;
  return [melee(n), ranged(n), [...melee(n), ...ranged(n)]];
}

// 보스 방: 웨이브 1개 = 보스 (단 위 중앙). 소환수는 monsters.js가 스폰하며 aliveCount에 포함 → 전부 죽어야 clear
export function makeBossWaves(room) {
  const p = room.platform;
  return [[{ kind: 'boss', x: (p.minX + p.maxX) / 2, z: (p.minZ + p.maxZ) / 2 - 1, floorY: p.height, bounds: p.bounds }]];
}

export function createWaveZone(scene, { player, monsters, waves, triggerZ, endZ = -Infinity, label = '구역', boss = false, onClear = null } = {}) {
  const W = config.wave;
  const state = { phase: 'armed', index: -1, timer: 0, alive: 0 };   // index = 현재(또는 다음에 뜰) 웨이브 번호 0~
  if (scene) floorLine(scene, triggerZ - 0.4, RANGE.doorHalf * 2, 0.5, { color: COLOR.zone, transparent: true, opacity: 0.65 });   // 문 안쪽 빨간 띠

  function spawnWave(i) {
    for (const d of waves[i]) monsters.spawn(d.kind, d.x, d.z, d);
    state.alive = monsters.aliveCount();   // 스폰 프레임의 HUD가 0으로 찍히지 않게
  }

  function setPhase(phase, timer = 0) { state.phase = phase; state.timer = timer; }

  function update(dt) {
    if (state.phase === 'armed') {
      if (player.state.z < triggerZ && player.state.z > endZ) { state.index = 0; setPhase('countdown', W.firstDelay); }
    } else if (state.phase === 'countdown') {
      state.timer -= dt;
      if (state.timer <= 0) { spawnWave(state.index); setPhase('wave'); }
    } else if (state.phase === 'wave') {
      state.alive = monsters.aliveCount();
      if (state.alive === 0) {
        if (state.index >= waves.length - 1) { setPhase('clear'); if (onClear) onClear(); }
        else { state.index++; setPhase('countdown', W.betweenDelay); }
      }
    }
  }

  // 진행 중이면 HUD 문구, 아니면 null (armed·hold). clear 문구는 stage가 마지막으로 클리어한 존 것만 보여준다
  function hudText() {
    const n = waves.length;
    if (state.phase === 'countdown') return `${label} · 웨이브 ${state.index + 1}/${n} — ${Math.max(0, state.timer).toFixed(1)}초 후 등장`;
    if (state.phase === 'wave') {
      if (boss) {
        const b = monsters.list.find((m) => m.kind === 'boss' && m.alive && !m.dead);
        const pct = b ? Math.ceil(b.hp / b.hpMax * 100) : 0;
        return `보스 · HP ${pct}% · 남은 몬스터 ${state.alive}`;
      }
      return `${label} · 웨이브 ${state.index + 1}/${n} · 남은 몬스터 ${state.alive}`;
    }
    if (state.phase === 'clear') return boss ? '보스 처치 — 데모 완료' : `${label} 클리어 — 앞으로 가세요`;
    return null;
  }
  const active = () => state.phase === 'countdown' || state.phase === 'wave' || state.phase === 'hold';

  // T24: 사망 → 현재 웨이브 몬스터 전부 제거하고 멈춘다. 교전 중이 아니면 무시
  function holdForRespawn() {
    if (state.phase !== 'wave') return false;
    monsters.reset([]);
    state.alive = 0;
    setPhase('hold');
    return true;
  }
  // T24: 부활 → 같은 웨이브를 betweenDelay 카운트다운 뒤 다시 스폰
  function restartCurrent() {
    if (state.phase !== 'hold') return false;
    setPhase('countdown', W.betweenDelay);
    return true;
  }

  // 대기 상태로 (몬스터 제거는 stage가 한 번에)
  function reset() {
    state.index = -1; state.alive = 0;
    setPhase('armed');
  }

  return { state, update, reset, holdForRespawn, restartCurrent, hudText, active, waves, label, triggerZ, endZ };
}
