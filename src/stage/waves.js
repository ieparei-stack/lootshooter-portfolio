import { config } from '../config.js';
import { emit } from '../core/events.js';
import { RANGE, floorLine } from './range.js';

// 방 단위 웨이브 존 (T23 → T26 방마다 하나). 웨이브 구성은 코드에 둔다 (무기만 파일 — SPEC 3-1).
//   armed     : 대기. 플레이어가 이 방 안(triggerZ ~ endZ)에 들어서면 발동 (문이 닫혀 있어 앞 방 클리어 전엔 못 들어온다.
//               방 범위로 판정해야 M 리셋을 방 3에서 눌러도 앞 방 존들이 한꺼번에 발동하지 않는다)
//   countdown : timer가 0이 되면 다음 웨이브 스폰. 첫 웨이브 firstDelay, 이후 betweenDelay
//   wave      : 살아있는 몬스터가 0이 되면 → 마지막이면 clear(+onClear → 문 열림), 아니면 countdown
//   clear     : 끝. 더 이상 스폰하지 않는다
//   hold      : 플레이어 사망 중 (T24). 몬스터 전부 제거, 진행 정지. 부활 시 restartCurrent() → 같은 웨이브를 countdown부터
// 사용자 결정(2026-09-04): 3웨이브 근접2 → 원거리2 → 근접2+원거리2, 웨이브 간 5초 카운트다운. 구역 2는 종류당 +1, 구역 3은 +2 (T26).
// T47 (사용자 확정 2026-09-07): 정예는 구역 1 웨이브 3에 1기 첫 등장 → 구역 3 웨이브 3은 절반. 그 사이 선형 (WAVE_TABLE).
// 근접형은 단 앞 바닥, 원거리형·보스는 단 위(floorY/bounds). HUD는 stage.js가 hudText()를 모아 하나로 그린다.

const COLOR = { zone: 0xff4040 };

// T47 스폰 웨이브 표 — 구역(0~2) × 웨이브(3) × 그룹 { kind, n, elite(마릿수) }. 정예 비율 1-3 25 % → 3-3 50 % 선형, 마릿수 반올림 (TASKS T47 표).
// 웨이브 크기는 T26 그대로 (구역 1: 2/2/4, 2: 3/3/6, 3: 4/4/8). 정예는 그룹 안 가운데 자리 (플레이어가 먼저 보게)
export const WAVE_TABLE = [
  [[{ kind: 'melee', n: 2, elite: 0 }], [{ kind: 'ranged', n: 2, elite: 0 }], [{ kind: 'melee', n: 2, elite: 1 }, { kind: 'ranged', n: 2, elite: 0 }]],
  [[{ kind: 'melee', n: 3, elite: 1 }], [{ kind: 'ranged', n: 3, elite: 1 }], [{ kind: 'melee', n: 3, elite: 1 }, { kind: 'ranged', n: 3, elite: 1 }]],
  [[{ kind: 'melee', n: 4, elite: 2 }], [{ kind: 'ranged', n: 4, elite: 2 }], [{ kind: 'melee', n: 4, elite: 2 }, { kind: 'ranged', n: 4, elite: 2 }]],
];

// 방 웨이브 3개 생성 (WAVE_TABLE[zone]). 좌표는 방 안에서 균등 배치 (Claude 임시). 정의의 elite: true는 monsters.spawn이 정예 티어로 띄운다 (T46)
export function makeWaves(room, zone = 0) {
  const p = room.platform;
  const onPlatform = { floorY: p.height, bounds: p.bounds };
  const spread = (n, lo, hi) => Array.from({ length: n }, (_, i) => (n === 1 ? (lo + hi) / 2 : lo + (hi - lo) * i / (n - 1)));
  // 가운데에 가까운 자리부터 e개를 정예로
  const eliteFlags = (n, e) => { const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => Math.abs(a - (n - 1) / 2) - Math.abs(b - (n - 1) / 2)); const f = Array(n).fill(false); order.slice(0, e).forEach((i) => { f[i] = true; }); return f; };
  const group = ({ kind, n, elite }) => {
    const flags = eliteFlags(n, elite);
    return kind === 'melee'
      ? spread(n, -6, 6).map((x, i) => ({ kind, x, z: room.floorZ, elite: flags[i] }))
      : spread(n, p.minX + 1.5, p.maxX - 1.5).map((x, i) => ({ kind, x, z: p.minZ + 2, elite: flags[i], ...onPlatform }));
  };
  const table = WAVE_TABLE[Math.max(0, Math.min(WAVE_TABLE.length - 1, zone))];
  return table.map((groups) => groups.flatMap(group));
}

// 보스 방: 웨이브 1개 = 보스 (단 위 중앙). 소환수는 monsters.js가 스폰하며 aliveCount에 포함 → 전부 죽어야 clear
export function makeBossWaves(room) {
  const p = room.platform;
  return [[{ kind: 'boss', x: (p.minX + p.maxX) / 2, z: (p.minZ + p.maxZ) / 2 - 1, floorY: p.height, bounds: p.bounds }]];
}

export function createWaveZone(scene, { player, monsters, waves, triggerZ, endZ = -Infinity, label = '구역', boss = false, onClear = null } = {}) {
  const W = config.wave;
  const state = { phase: 'armed', index: -1, timer: 0, alive: 0, eliteAlive: 0 };   // index = 현재(또는 다음에 뜰) 웨이브 번호 0~. eliteAlive = 살아있는 정예 (T47 HUD)
  if (scene) floorLine(scene, triggerZ - 0.4, RANGE.doorHalf * 2, 0.5, { color: COLOR.zone, transparent: true, opacity: 0.65 });   // 문 안쪽 빨간 띠

  function spawnWave(i) {
    for (const d of waves[i]) monsters.spawn(d.kind, d.x, d.z, d);
    state.alive = monsters.aliveCount(); state.eliteAlive = monsters.aliveCount(true);   // 스폰 프레임의 HUD가 0으로 찍히지 않게
    emit(boss ? 'bossSpawn' : 'waveSpawn');
  }

  function setPhase(phase, timer = 0) { state.phase = phase; state.timer = timer; }

  function update(dt) {
    if (state.phase === 'armed') {
      if (player.state.z < triggerZ && player.state.z > endZ) { state.index = 0; setPhase('countdown', W.firstDelay); }
    } else if (state.phase === 'countdown') {
      state.timer -= dt;
      if (state.timer <= 0) { spawnWave(state.index); setPhase('wave'); }
    } else if (state.phase === 'wave') {
      state.alive = monsters.aliveCount(); state.eliteAlive = monsters.aliveCount(true);
      if (state.alive === 0) {
        if (state.index >= waves.length - 1) { setPhase('clear'); if (onClear) onClear(); }   // zoneClear 이벤트(클리어 음)는 stage가 문을 열 때 쏜다 (T39: 강화 확정 뒤)
        else { state.index++; setPhase('countdown', W.betweenDelay); }
      }
    }
  }

  // 진행 중(countdown·wave)일 때만 상단 한 줄 문구, 아니면 null. 클리어 문구는 clearText()로 — stage가 중앙 프롬프트에 띄운다 (T26.1)
  function hudText() {
    const n = waves.length;
    if (state.phase === 'countdown') return `${label} · 웨이브 ${state.index + 1}/${n} — ${Math.max(0, state.timer).toFixed(1)}초 후 등장`;
    if (state.phase === 'wave') return boss ? `보스 · 남은 몬스터 ${state.alive}` : `${label} · 웨이브 ${state.index + 1}/${n} · 남은 몬스터 ${state.alive} (정예 ${state.eliteAlive})`;   // T47 정예 수 병기
    return null;
  }
  function clearText() { return boss ? '보스 처치 — 데모 완료' : `${label} 클리어 — 초록 선을 따라 가세요`; }
  const active = () => state.phase === 'countdown' || state.phase === 'wave' || state.phase === 'hold';

  // T24: 사망 → 현재 웨이브 몬스터 전부 제거하고 멈춘다. 교전 중이 아니면 무시
  function holdForRespawn() {
    if (state.phase !== 'wave') return false;
    monsters.reset([]);
    state.alive = 0; state.eliteAlive = 0;
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
    state.index = -1; state.alive = 0; state.eliteAlive = 0;
    setPhase('armed');
  }

  return { state, update, reset, holdForRespawn, restartCurrent, hudText, clearText, active, waves, label, boss, triggerZ, endZ };
}
