import { ROOMS, buildRoom, openDoor, closeDoor } from './arena.js';
import { createWaveZone, makeWaves, makeBossWaves } from './waves.js';
import { RANGE, floorText } from './range.js';
import { createGuide } from './guide.js';
import { config } from '../config.js';

// 스테이지 흐름 (T26): 사격장 → 구역 1 → 구역 2 → 구역 3 → 보스. 사용자 결정(2026-09-04):
//   모든 웨이브 처치 = 클리어 → 다음 방 문이 열린다(벽 사라짐). 되돌아갈 수 있다. 구역 2는 종류당 +1, 구역 3은 +2 마리.
// 방(arena.js) 4개를 짓고 방마다 웨이브 존(waves.js)을 하나씩 둔다. HUD(상단 중앙 한 줄 + 보스 HP 바)는 여기서 하나만 그린다.
// T26.1: 클리어·보스 처치 문구는 상단 줄이 아니라 중앙 프롬프트(ui/prompt.js)로. 보스 HP는 %가 아니라 바.
// blocks는 main이 만든 공용 배열 — 방 블록을 여기서 push 하고, 문은 openDoor/closeDoor가 넣고 뺀다.
// T34: 보스가 아닌 방마다 guide(바닥 유도선 + 문 빛기둥). 클리어 시 show, 플레이어가 문을 지나면(endZ − 1) 또는 리셋 시 hide.

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
  // 보스 HP 바 — 상단 줄 아래. 보스 존이 교전 중이고 보스가 살아 있을 때만
  const boss = document.createElement('div');
  boss.id = 'bossBar';
  boss.style.cssText = 'position:fixed;top:52px;left:50%;transform:translateX(-50%);z-index:10;width:360px;height:10px;background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.3);border-radius:5px;overflow:hidden';
  const bossFill = document.createElement('div');
  bossFill.style.cssText = 'height:100%;width:100%;background:#b04ad8';
  boss.appendChild(bossFill);
  boss.hidden = true;
  document.body.appendChild(boss);
  return { el, boss, bossFill };
}

export function createStage(scene, { player, monsters, blocks, prompt = null }) {
  const rooms = ROOMS.map((spec) => buildRoom(scene, blocks, spec));
  if (scene) floorText(scene, '전투 구역 ▼', 0, RANGE.zFar + 2, 4);   // 사격장 쪽 문 앞
  const guides = rooms.map((room) => (room.boss || !scene ? null : createGuide(scene, room)));
  const hud = createHud();
  const state = { current: -1, lastCleared: -1 };   // current = 진행 중(countdown/wave/hold)인 존, 없으면 −1

  const zones = rooms.map((room, i) => createWaveZone(scene, {
    player, monsters,
    waves: room.boss ? makeBossWaves(room) : makeWaves(room, i, config.monster.zoneHpMul[i] ?? 1),   // 구역 1: +0, 2: +1, 3: +2. HP 배율 1.0/1.1/1.2 (T38)
    triggerZ: room.triggerZ, endZ: room.endZ, label: room.label, boss: room.boss,
    onClear: () => {
      openDoor(room, scene, blocks); state.lastCleared = i;
      if (guides[i]) guides[i].show();
      if (prompt) { if (room.boss) prompt.hold(zones[i].clearText()); else prompt.show(zones[i].clearText(), 3); }
    },
  }));

  let lastText = null, lastBossW = -1;
  function draw() {
    if (!hud) return;
    const text = state.current >= 0 ? zones[state.current].hudText() : null;
    if (text !== lastText) {
      lastText = text;
      hud.el.hidden = text === null;
      if (text !== null) hud.el.textContent = text;
    }
    // 보스 HP 바
    const z = state.current >= 0 ? zones[state.current] : null;
    const b = z && z.boss && z.state.phase === 'wave' ? monsters.list.find((m) => m.kind === 'boss' && m.alive && !m.dead) : null;
    hud.boss.hidden = !b;
    if (b) {
      const w = Math.round(b.hp / b.hpMax * 1000) / 10;
      if (w !== lastBossW) { lastBossW = w; hud.bossFill.style.width = w + '%'; }
    }
  }

  function update(dt) {
    for (const z of zones) z.update(dt);
    guides.forEach((g, i) => {
      if (!g || !g.visible) return;
      if (player.state.z < rooms[i].endZ - 1) g.hide(); else g.update(dt);
    });
    state.current = zones.findIndex((z) => z.active());
    draw();
  }

  function holdForRespawn() { return state.current >= 0 && zones[state.current].holdForRespawn(); }
  function restartCurrent() { return state.current >= 0 && zones[state.current].restartCurrent(); }

  // 전부 처음으로: 몬스터 제거, 존 대기, 문 닫힘. 플레이어가 구역 안에 서 있으면 그 존이 다음 프레임에 다시 발동한다
  function reset() {
    monsters.reset([]);
    for (const z of zones) z.reset();
    for (const r of rooms) closeDoor(r, scene, blocks);
    for (const g of guides) if (g) g.hide();
    state.current = -1; state.lastCleared = -1;
    if (prompt) prompt.clear();
    draw();
  }

  return { state, rooms, zones, guides, update, reset, holdForRespawn, restartCurrent };
}
