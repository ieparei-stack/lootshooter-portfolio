import * as THREE from 'three';
import { config } from './config.js';
import { createRenderer } from './core/renderer.js';
import { startLoop } from './core/loop.js';
import { createMouseLook, createKeyboard, createMouseButtons, createMouseWheel } from './core/input.js';
import { buildRange, PLAYER_START } from './stage/range.js';
import { createStage } from './stage/stage.js';
import { createTargets } from './stage/targets.js';
import { createPlayerCamera } from './player/camera.js';
import { createMovement } from './player/movement.js';
import { createView } from './player/view.js';
import { createSettingsPanel } from './ui/settingsPanel.js';
import { showWarnings } from './ui/warnings.js';
import { createWeaponInfo } from './ui/weaponInfo.js';
import { createCrosshair } from './ui/crosshair.js';
import { createHitmarker } from './ui/hitmarker.js';
import { createDamageNumbers } from './ui/damageNumbers.js';
import { createTuningPanel, restoreTuning } from './ui/tuningPanel.js';
import { createPatternOverlay } from './ui/patternOverlay.js';
import { loadWeapons } from './weapon/weaponData.js';
import { createRecoil } from './weapon/recoil.js';
import { createSpread } from './weapon/spread.js';
import { createAds } from './weapon/ads.js';
import { createImpactMarks } from './weapon/impactMarks.js';
import { createTracers, muzzlePosition } from './weapon/tracers.js';
import { createShooter } from './weapon/shooter.js';
import { createLoadout } from './weapon/loadout.js';
import { createMonsters } from './monster/monsters.js';
import { createHealth } from './player/health.js';
import { createPlayerHud } from './ui/playerHud.js';
import { createPrompt } from './ui/prompt.js';
import { createPauseMenu } from './ui/pauseMenu.js';
import { createWeaponCard } from './ui/weaponCard.js';
import weaponsJson from '../data/weapons.json';

const canvas = document.getElementById('app');
const { renderer, scene, camera } = createRenderer(canvas);

// 조명 — 반구광(전체 밝기) + 방향광(박스 면 구분). 그림자 없음.
scene.add(new THREE.HemisphereLight(0xffffff, 0x8c8c8c, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 0.9);
sun.position.set(6, 12, 20);   // 플레이어 뒤쪽 위에서 앞벽을 비춘다
scene.add(sun);

// 회색 바닥
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(config.ground.size, config.ground.size),
  new THREE.MeshLambertMaterial({ color: config.ground.color }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// 사격장 + 표적 + 1인칭 카메라 + 입력 + 이동 + 조절 패널
const blocks = [...buildRange(scene)];   // 공용 충돌·레이캐스트 블록. 방 4개(T26)는 아래 createStage가 여기에 push 한다 (같은 배열 참조)
const targets = createTargets(scene);
const player = createPlayerCamera(camera, PLAYER_START);
const mouseLook = createMouseLook(canvas, (dx, dy) => player.rotate(dx, dy));
const keyboard = createKeyboard(mouseLook);
const mouseButtons = createMouseButtons(mouseLook);
const movement = createMovement(player, keyboard, blocks);
const settingsPanel = createSettingsPanel();

// 무기 데이터 — 값 오류는 화면 경고 + 기본값으로 진행
const { weapons, warnings } = loadWeapons(weaponsJson);
showWarnings(warnings);
// 튜닝 패널(T17.5): 파일 값을 보관하고, 저장된 튜닝이 있으면 kit을 만들기 전에 weapon에 덮어쓴다
const tuning = restoreTuning(weapons);
const weaponInfo = createWeaponInfo();

// 탄자국 + 명중 피드백 + 조준선(원) — 무기와 무관한 공용 요소
const marks = createImpactMarks(scene);
const tracers = createTracers(scene);
const hitmarker = createHitmarker();
const damageNumbers = createDamageNumbers();

// 몬스터 (T22·T26 보스) + 스테이지 흐름/웨이브 (T23·T26) + 플레이어 HP (T24).
// 몬스터 공격 → health.damage → HUD(비네트·방향 호·HP 바). HP 0 → 웨이브 정지(몬스터 제거) → 2초 뒤 같은 자리 부활 → 같은 웨이브 재스폰.
const hitsTaken = { count: 0, text: null };
const playerHud = createPlayerHud();
const prompt = createPrompt();   // 중앙 상황 프롬프트 (T26.1)
let stage = null;   // 아래에서 만든다 (health 콜백이 참조)
const health = createHealth({
  player,
  onHit: (angle) => playerHud.hit(angle),
  onDeath: () => stage.holdForRespawn(),
  onRespawn: () => stage.restartCurrent(),
});
const monsters = createMonsters(scene, {
  blocks, player, tracers,
  onPlayerHit: (damage, kind, m) => {
    if (!health.damage(damage, m ? m.pos : null)) return;
    hitsTaken.count++;
    if (hitsTaken.text) hitsTaken.text.textContent = `받은 공격: ${hitsTaken.count}회 (마지막 −${damage} ${kind === 'melee' ? '근접' : kind === 'boss' ? '보스' : '원거리'})`;
  },
});
stage = createStage(scene, { player, monsters, blocks, prompt });   // 구역 1~3 + 보스 방, 문 열림
// 사망 중에는 사격·정조준 입력을 막는다 (버튼 상태를 감싼다)
const gunButtons = { isDown: (b) => !health.state.dead && mouseButtons.isDown(b) };

function onFire({ origin, dir, yaw, pitch, hit }) {
  tracers.add(muzzlePosition(origin, yaw, pitch), hit ? hit.point : null, dir);
  if (hit && (hit.part === 'body' || hit.part === 'head') && hit.result && hit.result.damage > 0) {
    hitmarker.show(hit.part);
    damageNumbers.add(hit.point, hit.result.damage, hit.part);
  }
}

// 무기마다 정조준·반동·퍼짐·발사 한 벌(kit). 전환(T16)은 loadout이 맡는다 — 시작 무기 = 라인업 1번 (CS형)
function makeKit(weapon) {
  const ads = createAds(weapon, gunButtons);
  const recoil = createRecoil(weapon);
  const spread = createSpread(weapon);
  const shooter = createShooter(weapon, recoil, spread, ads, gunButtons,
    { player, movement, blocks, marks, hittables: [targets, monsters], onFire });
  return { weapon, ads, recoil, spread, shooter };
}
const tuningPanel = createTuningPanel({
  weapons, origs: tuning.origs, arrMuls: tuning.arrMuls,
  onChange: (w) => { weaponInfo.set(w); weaponInfo.setLineup(weapons, loadout.state.index); },
});
const weaponCard = createWeaponCard();   // T26.3 전환 카드 (첫 무기 장착 때는 안 띄운다)
let loadoutReady = false;
const loadout = createLoadout(weapons, makeKit, (kit, i) => {
  if (loadoutReady) weaponCard.show(kit.weapon);
  weaponInfo.set(kit.weapon);
  weaponInfo.setLineup(weapons, i);
  tuningPanel.show(kit, i);
});
loadoutReady = true;
const view = createView(camera, () => loadout.current().ads);
const crosshair = createCrosshair();
const patternOverlay = createPatternOverlay(camera, player);   // T19 이론 반동 궤적

// 키 1~3 직접 전환 (라인업 3정 — COD형 제외, 사용자 결정 2026-09-05), 휠 순환 전환, R 재장전(현재 무기)
['Digit1', 'Digit2', 'Digit3'].forEach((code, i) => keyboard.onPress(code, () => loadout.select(i)));
createMouseWheel(mouseLook, (step) => (step > 0 ? loadout.next() : loadout.prev()));
keyboard.onPress('KeyR', () => { const k = loadout.current(); k.shooter.startReload(k.shooter.state.now); });
// T18: 탄착군 지우기 — 잠금 중 X, 해제 중엔 왼쪽 위 패널 버튼
keyboard.onPress('KeyX', () => marks.clear());
settingsPanel.addButton('탄착군 지우기 (X)', () => marks.clear());
// T19: 이론 궤적 켜기/끄기 — 잠금 중 P, 해제 중엔 패널 버튼 (사용자 지시 2026-09-04, SPEC '항상 켜짐' 변경)
const overlayLabel = () => `이론 궤적: ${patternOverlay.state.enabled ? '켜짐' : '꺼짐'} (P)`;
const overlayBtn = settingsPanel.addButton(overlayLabel(), () => { patternOverlay.toggle(); overlayBtn.textContent = overlayLabel(); });
keyboard.onPress('KeyP', () => { patternOverlay.toggle(); overlayBtn.textContent = overlayLabel(); });

// T22: 몬스터 레버 (접이식 그룹) + 리셋. 설정 패널이 길어지면 튜닝 패널을 그 아래로 내린다
// T26.2: 튜닝(무기 세팅) 패널은 우측 무기 슬롯 바로 위까지. 설정 패널은 좌측 고정이라 서로 무관
const layoutPanels = () => { tuningPanel.root.style.bottom = (weaponInfo.root.getBoundingClientRect().height + 24) + 'px'; };
const M = config.monster;
const mg = settingsPanel.addGroup('몬스터 (T22)', { onToggle: layoutPanels });
mg.addSlider({ label: '근접형 HP (리셋 후 적용)', min: 500, max: 6000, step: 100, get: () => M.melee.hp, set: (v) => { M.melee.hp = v; } });
mg.addSlider({ label: '원거리형 HP (리셋 후 적용)', min: 500, max: 6000, step: 100, get: () => M.ranged.hp, set: (v) => { M.ranged.hp = v; } });
mg.addSlider({ label: '근접형 속도 (m/s)', min: 2, max: 10, step: 0.5, get: () => M.melee.speed, set: (v) => { M.melee.speed = v; }, format: (v) => v.toFixed(1) });
mg.addSlider({ label: '원거리형 속도 (m/s)', min: 2, max: 8, step: 0.5, get: () => M.ranged.speed, set: (v) => { M.ranged.speed = v; }, format: (v) => v.toFixed(1) });
mg.addSlider({ label: '조준선 딜레이 (s)', min: 0.2, max: 2.0, step: 0.1, get: () => M.ranged.aimDelay, set: (v) => { M.ranged.aimDelay = v; }, format: (v) => v.toFixed(1) });
mg.addSlider({ label: '근접형 피해', min: 5, max: 300, step: 5, get: () => M.melee.damage, set: (v) => { M.melee.damage = v; } });
mg.addSlider({ label: '원거리형 피해', min: 5, max: 300, step: 5, get: () => M.ranged.damage, set: (v) => { M.ranged.damage = v; } });
mg.addSlider({ label: '보스 HP (리셋 후 적용)', min: 5000, max: 40000, step: 1000, get: () => M.boss.hp, set: (v) => { M.boss.hp = v; } });
mg.addSlider({ label: '플레이어 최대 HP (리셋 후 적용)', min: 100, max: 3000, step: 100, get: () => config.player.hpMax, set: (v) => { config.player.hpMax = v; } });
hitsTaken.text = mg.addText('받은 공격: 0회');
// T23/T26: 스테이지 리셋 — 몬스터 전부 제거, 존 재무장, 문 전부 닫힘, HP 회복 (플레이어 위치는 그대로)
const resetZone = () => { stage.reset(); health.reset(); hitsTaken.count = 0; hitsTaken.text.textContent = '받은 공격: 0회'; };
settingsPanel.addButton('스테이지 리셋 (M)', resetZone);
keyboard.onPress('KeyM', resetZone);
layoutPanels();
window.addEventListener('resize', layoutPanels);
// T26.1: 상시 HUD 비우기 — 설정 패널·튜닝 패널은 만들어 두고 숨긴다 (T26.2 일시정지 메뉴가 다시 연다). 키(M·P·X)는 계속 동작
settingsPanel.setVisible(false);
tuningPanel.setVisible(false);
// T26.2: 일시정지 메뉴 — 잠금이 풀리면(ESC 등) 뜨고 Tab으로 열고 닫는다. 디버그 = 설정 패널, 무기 세팅 = 튜닝 패널(T26.4 전까지)
const pauseMenu = createPauseMenu({
  canvas, mouseLook, onReset: resetZone,
  panels: { settings: settingsPanel, tuning: tuningPanel },
  onStateChange: (mode) => { layoutPanels(); crosshair.ring.hidden = mode !== 'closed'; prompt.el.style.visibility = weaponCard.root.style.visibility = mode === 'closed' ? '' : 'hidden'; },   // 메뉴 중엔 조준점·프롬프트 숨김 (카드와 겹침)
});
// 시작 안내: 첫 잠금 전까지 중앙 프롬프트 (잠기면 지움)
prompt.hold('클릭하여 시작');
document.addEventListener('pointerlockchange', () => { if (mouseLook.isLocked() && prompt.state.text === '클릭하여 시작') prompt.clear(); }, { once: false });

// 개발 서버에서만: 콘솔 검증용 (빌드에는 포함되지 않음)
if (import.meta.env.DEV) {
  window.__debug = { player, movement, view, config, weapons, warnings, showWarnings, loadout, tuning, tuningPanel, patternOverlay, marks, targets, monsters, stage, blocks, health, playerHud, prompt, pauseMenu, weaponCard, settingsPanel, tuningPanel, tracers, damageNumbers, hitmarker };
}

startLoop((dt) => {
  const now = performance.now();
  const kit = loadout.current();
  const { weapon, ads, recoil, spread, shooter } = kit;
  patternOverlay.beforeShoot(recoil);   // 첫 발 직전 조준 방향을 궤적 원점으로 (shooter.update보다 먼저)
  health.update(dt);              // 사망 타이머·눈높이·부활 (movement보다 먼저 — 죽으면 이동을 건너뛴다)
  if (health.state.dead) { movement.state.vx = movement.state.vz = movement.state.speed = 0; }
  else movement.update(dt);
  ads.update(dt);                 // 이 프레임의 배율이 발사에 쓰이도록 shooter보다 먼저
  shooter.update(now, dt);
  targets.update(dt, camera);
  stage.update(dt);               // 트리거·스폰·웨이브 전이·문 열림 (monsters.update 앞 — 스폰된 프레임에 바로 움직인다)
  monsters.update(dt, camera);
  tracers.update(dt);
  player.state.offYaw = recoil.state.offYaw;
  player.state.offPitch = recoil.state.offPitch;
  player.apply();
  view.update();
  damageNumbers.update(dt);
  playerHud.update(dt);
  prompt.update(dt);
  weaponCard.update(dt);
  playerHud.setHp(health.state.hp, health.state.hpMax);
  playerHud.setDead(health.respawnRemain());
  crosshair.set(shooter.state.currentSpread, view.state.fov);
  weaponInfo.setAmmo(shooter.state.mag, weapon.mag, shooter.state.reloadProgress);
  patternOverlay.draw(kit);
  renderer.render(scene, camera);
});
